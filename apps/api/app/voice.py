from __future__ import annotations

import io
import os
import threading
import time
import wave
from collections import deque
from typing import Any

import numpy as np

from . import db
from .config import DEFAULT_BUFFER_SECONDS, DEFAULT_WHISPER_MODEL

_lock = threading.Lock()
_stream = None
_buffer: deque[np.ndarray] = deque()
_sample_rate = 16000
_channels = 1
_capturing = False
_device_name: str | None = None
_whisper_model = None
_whisper_name: str | None = None
_last_discord_ingest_at: float = 0.0
_DISCORD_FRESH_SEC = 2.0


def whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except Exception:
        return False


def _discord_fresh() -> bool:
    return (time.time() - _last_discord_ingest_at) < _DISCORD_FRESH_SEC


def audio_source() -> str:
    if _discord_fresh():
        return "discord"
    if _capturing:
        return "wasapi"
    return "idle"


def status() -> dict[str, Any]:
    return {
        "capturing": _capturing or _discord_fresh(),
        "wasapi_capturing": _capturing,
        "buffer_seconds": int(
            db.get_setting("buffer_seconds", str(DEFAULT_BUFFER_SECONDS)) or DEFAULT_BUFFER_SECONDS
        ),
        "device": _device_name,
        "source": audio_source(),
        "discord_fresh": _discord_fresh(),
        "whisper_available": whisper_available(),
        "whisper_model": db.get_setting("whisper_model", DEFAULT_WHISPER_MODEL) or DEFAULT_WHISPER_MODEL,
    }


def _trim_buffer_locked() -> None:
    max_sec = int(db.get_setting("buffer_seconds", str(DEFAULT_BUFFER_SECONDS)) or DEFAULT_BUFFER_SECONDS)
    max_samples = max_sec * _sample_rate
    total = sum(chunk.shape[0] for chunk in _buffer)
    while total > max_samples and _buffer:
        dropped = _buffer.popleft()
        total -= dropped.shape[0]


def _append_float_mono(mono: np.ndarray) -> None:
    with _lock:
        _buffer.append(mono.astype(np.float32, copy=False))
        _trim_buffer_locked()


def _callback(indata, frames, time_info, status_flag):  # noqa: ARG001
    # Skip system capture while Discord VC is actively ingesting.
    if _discord_fresh():
        return
    if status_flag:
        pass
    mono = indata.copy()
    if mono.ndim > 1:
        mono = np.mean(mono, axis=1)
    _append_float_mono(mono)


def ingest_discord_pcm(pcm: bytes, sample_rate: int = 16000) -> dict[str, Any]:
    """
    Accept PCM s16le mono (or stereo interleaved) from the Discord bot.
    Resamples naively to 16 kHz if needed and appends to the Whisper ring buffer.
    """
    global _last_discord_ingest_at, _sample_rate, _device_name

    if not pcm:
        return status()

    # Prefer Discord alone — pause WASAPI stream if running.
    if _capturing and _stream is not None:
        try:
            _stream.stop()
        except Exception:
            pass

    arr = np.frombuffer(pcm, dtype=np.int16)
    if arr.size == 0:
        return status()

    # If odd length for stereo guess, treat as mono.
    # Discord mixed sinks are usually mono float already converted to s16 by the bot.
    mono_i16 = arr.astype(np.float32) / 32768.0

    sr = int(sample_rate) or 16000
    if sr != _sample_rate and sr > 0:
        # Linear resample to 16 kHz
        duration = mono_i16.shape[0] / float(sr)
        target_n = max(1, int(duration * _sample_rate))
        x_old = np.linspace(0.0, 1.0, num=mono_i16.shape[0], endpoint=False)
        x_new = np.linspace(0.0, 1.0, num=target_n, endpoint=False)
        mono_i16 = np.interp(x_new, x_old, mono_i16).astype(np.float32)

    _append_float_mono(mono_i16)
    _last_discord_ingest_at = time.time()
    _device_name = "Discord VC"
    return status()


def start_capture() -> dict[str, Any]:
    global _stream, _capturing, _device_name, _sample_rate
    if _capturing:
        return status()
    if _discord_fresh():
        # Discord is feeding the buffer; no need for WASAPI.
        return status()
    try:
        import sounddevice as sd
    except Exception as exc:
        raise RuntimeError(
            "sounddevice is not available. Install PortAudio support to capture Discord audio."
        ) from exc

    # Prefer loopback devices on Windows (WASAPI)
    device = None
    device_name = None
    try:
        devices = sd.query_devices()
        hostapis = sd.query_hostapis()
        wasapi_index = None
        for i, api in enumerate(hostapis):
            if "wasapi" in str(api.get("name", "")).lower():
                wasapi_index = i
                break
        for idx, dev in enumerate(devices):
            name = str(dev.get("name", ""))
            max_in = int(dev.get("max_input_channels") or 0)
            is_loopback = "loopback" in name.lower()
            same_api = wasapi_index is None or dev.get("hostapi") == wasapi_index
            if max_in > 0 and is_loopback and same_api:
                device = idx
                device_name = name
                break
        if device is None:
            device = None
            info = sd.query_devices(kind="input")
            device_name = str(info.get("name"))
    except Exception:
        device = None
        device_name = "default"

    _sample_rate = 16000
    _buffer.clear()
    _stream = sd.InputStream(
        samplerate=_sample_rate,
        channels=1,
        dtype="float32",
        callback=_callback,
        device=device,
        blocksize=1024,
    )
    _stream.start()
    _capturing = True
    _device_name = device_name
    return status()


def stop_capture() -> dict[str, Any]:
    global _stream, _capturing
    if _stream is not None:
        try:
            _stream.stop()
            _stream.close()
        except Exception:
            pass
    _stream = None
    _capturing = False
    return status()


def _load_whisper():
    global _whisper_model, _whisper_name
    name = db.get_setting("whisper_model", DEFAULT_WHISPER_MODEL) or DEFAULT_WHISPER_MODEL
    if _whisper_model is not None and _whisper_name == name:
        return _whisper_model
    from faster_whisper import WhisperModel

    _whisper_model = WhisperModel(name, device="cpu", compute_type="int8")
    _whisper_name = name
    return _whisper_model


def get_buffer_audio() -> np.ndarray:
    with _lock:
        if not _buffer:
            return np.zeros(0, dtype=np.float32)
        return np.concatenate(list(_buffer))


def transcribe_buffer() -> str:
    if not whisper_available():
        raise RuntimeError(
            "faster-whisper is not installed. Run: pip install faster-whisper"
        )
    audio = get_buffer_audio()
    if audio.size < _sample_rate * 0.4:
        raise RuntimeError(
            "Audio buffer is nearly empty. Use Discord bot !join (or Start listening), speak, then press Ctrl+N."
        )
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0:
        audio = audio / peak * 0.9

    model = _load_whisper()
    segments, _info = model.transcribe(audio, language="en", vad_filter=True)
    text = " ".join(seg.text.strip() for seg in segments).strip()
    return text


def buffer_to_wav_bytes() -> bytes:
    audio = get_buffer_audio()
    pcm = np.clip(audio * 32767.0, -32768, 32767).astype(np.int16)
    bio = io.BytesIO()
    with wave.open(bio, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(_sample_rate)
        wf.writeframes(pcm.tobytes())
    return bio.getvalue()


def allow_remote_ingest() -> bool:
    return os.environ.get("DM_ALLOW_REMOTE_INGEST", "").strip() in {"1", "true", "yes"}
