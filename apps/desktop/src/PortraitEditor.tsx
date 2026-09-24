import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const STAGE = 320;
const EXPORT = 1024;

type Props = {
  file: File;
  onCancel: () => void;
  onUse: (file: File) => void;
};

function coverScale(img: HTMLImageElement, rotation: number, size: number): number {
  const swapped = rotation % 180 !== 0;
  const width = swapped ? img.height : img.width;
  const height = swapped ? img.width : img.height;
  return Math.max(size / width, size / height);
}

function panLimit(img: HTMLImageElement, rotation: number, zoom: number, size: number): { x: number; y: number } {
  const swapped = rotation % 180 !== 0;
  const cover = coverScale(img, rotation, size);
  const drawnW = img.width * cover * zoom;
  const drawnH = img.height * cover * zoom;
  const extentW = swapped ? drawnH : drawnW;
  const extentH = swapped ? drawnW : drawnH;
  return {
    x: Math.max(0, (extentW - size) / 2),
    y: Math.max(0, (extentH - size) / 2),
  };
}

function clampPan(img: HTMLImageElement, rotation: number, zoom: number, size: number, x: number, y: number) {
  const limit = panLimit(img, rotation, zoom, size);
  return {
    x: Math.max(-limit.x, Math.min(limit.x, x)),
    y: Math.max(-limit.y, Math.min(limit.y, y)),
  };
}

function colorFilter(brightness: number, contrast: number, saturation: number, hue: number): string {
  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`;
}

function paint(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  size: number,
  panX: number,
  panY: number,
  zoom: number,
  rotation: number,
  filter: string
) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#100e0c";
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.filter = filter;
  ctx.translate(size / 2 + panX, size / 2 + panY);
  ctx.rotate((rotation * Math.PI) / 180);
  const scale = coverScale(img, rotation, size) * zoom;
  ctx.scale(scale, scale);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

export function PortraitEditor({ file, onCancel, onUse }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [hue, setHue] = useState(0);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
    };
    img.onerror = () => setFailed(true);
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
      imgRef.current = null;
    };
  }, [file]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !ready) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = STAGE * dpr;
    canvas.height = STAGE * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(ctx, img, STAGE, pan.x, pan.y, zoom, rotation, colorFilter(brightness, contrast, saturation, hue));
  }, [ready, pan, zoom, rotation, brightness, contrast, saturation, hue]);

  function turn(delta: number) {
    const img = imgRef.current;
    const next = (rotation + delta + 360) % 360;
    setRotation(next);
    if (!img) return;
    setPan((current) => clampPan(img, next, zoom, STAGE, current.x, current.y));
  }

  function changeZoom(next: number) {
    const img = imgRef.current;
    setZoom(next);
    if (!img) return;
    setPan((current) => clampPan(img, rotation, next, STAGE, current.x, current.y));
  }

  async function usePortrait() {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT;
      canvas.height = EXPORT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not save the portrait");
      const scale = EXPORT / STAGE;
      paint(
        ctx,
        img,
        EXPORT,
        pan.x * scale,
        pan.y * scale,
        zoom,
        rotation,
        colorFilter(brightness, contrast, saturation, hue)
      );
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not save the portrait");
      const base = file.name.replace(/\.[^.]+$/, "") || "portrait";
      onUse(new File([blob], `${base}.png`, { type: "image/png" }));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-panel portrait-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portrait-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="portrait-editor-title">Portrait</h2>
        </div>
        <div className="portrait-editor-body">
          <div
            className="portrait-stage"
            onPointerDown={(event) => {
              if (!ready) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              const img = imgRef.current;
              if (!start || !img) return;
              const next = clampPan(
                img,
                rotation,
                zoom,
                STAGE,
                start.panX + (event.clientX - start.x),
                start.panY + (event.clientY - start.y)
              );
              setPan(next);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          >
            <canvas ref={canvasRef} width={STAGE} height={STAGE} />
            <div className="portrait-ring" />
          </div>
          <div className="portrait-controls">
            {failed && <p>That picture could not be opened.</p>}
            <label>
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                disabled={!ready}
                onChange={(event) => changeZoom(Number(event.target.value))}
              />
            </label>
            <div className="portrait-turns">
              <button type="button" className="btn ghost" disabled={!ready} onClick={() => turn(-90)}>
                Turn left
              </button>
              <button type="button" className="btn ghost" disabled={!ready} onClick={() => turn(90)}>
                Turn right
              </button>
            </div>
            <label>
              Brightness
              <input type="range" min={40} max={180} value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} />
            </label>
            <label>
              Contrast
              <input type="range" min={40} max={180} value={contrast} onChange={(event) => setContrast(Number(event.target.value))} />
            </label>
            <label>
              Saturation
              <input type="range" min={0} max={200} value={saturation} onChange={(event) => setSaturation(Number(event.target.value))} />
            </label>
            <label>
              Hue
              <input type="range" min={-180} max={180} value={hue} onChange={(event) => setHue(Number(event.target.value))} />
            </label>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setBrightness(100);
                setContrast(100);
                setSaturation(100);
                setHue(0);
              }}
            >
              Reset color
            </button>
          </div>
        </div>
        <div className="portrait-editor-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!ready || busy || failed} onClick={() => void usePortrait()}>
            Use
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function PortraitFileButton({
  onFile,
  disabled,
  hidden,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  hidden?: boolean;
}) {
  const [pending, setPending] = useState<File | null>(null);
  return (
    <>
      <input
        type="file"
        accept="image/*"
        hidden={hidden}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) setPending(next);
          event.target.value = "";
        }}
      />
      {pending && (
        <PortraitEditor
          file={pending}
          onCancel={() => setPending(null)}
          onUse={(file) => {
            setPending(null);
            onFile(file);
          }}
        />
      )}
    </>
  );
}
