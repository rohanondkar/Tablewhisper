"""Bundled gear pictures, plus uploads that replace a name."""

from __future__ import annotations

import re
from pathlib import Path

from .config import DATA_DIR

BUNDLED_DIR = Path(__file__).resolve().parent / "gear_art"
UPLOAD_DIR = DATA_DIR / "gear_images"
ALLOWED = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MEDIA_STOCK = "/media/gear-stock"
MEDIA_UPLOAD = "/media/gear"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


def ensure_dirs() -> None:
    BUNDLED_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    if not any(BUNDLED_DIR.glob("*.png")):
        from .gear_art_build import build_all

        build_all(BUNDLED_DIR)


def _url(folder: str, path: Path) -> str:
    stamp = int(path.stat().st_mtime)
    return f"{folder}/{path.name}?v={stamp}"


def catalog() -> dict[str, str]:
    ensure_dirs()
    found: dict[str, str] = {}
    for path in BUNDLED_DIR.iterdir():
        if path.suffix.lower() in ALLOWED and path.is_file():
            found[path.stem] = _url(MEDIA_STOCK, path)
    for path in UPLOAD_DIR.iterdir():
        if path.suffix.lower() in ALLOWED and path.is_file():
            found[path.stem] = _url(MEDIA_UPLOAD, path)
    return found


def save_upload(name: str, data: bytes, ext: str) -> dict[str, str]:
    ensure_dirs()
    key = slug(name)
    if not key:
        raise ValueError("Name the gear before uploading a picture.")
    suffix = ext.lower() if ext.lower() in ALLOWED else ".png"
    for old in UPLOAD_DIR.glob(f"{key}.*"):
        if old.is_file():
            old.unlink()
    (UPLOAD_DIR / f"{key}{suffix}").write_bytes(data)
    return catalog()
