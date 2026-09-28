import { useEffect, useId, useRef, useState } from "react";

type Props = {
  label?: string;
  hint?: string;
  accept?: string;
  disabled?: boolean;
  /** Local object URL or remote URL already set */
  previewUrl?: string | null;
  /** Circle crop for faction hubs / avatars */
  round?: boolean;
  /** Hide Remove when clearing isn't supported (e.g. inspector with server image). */
  showRemove?: boolean;
  onFile: (file: File | null) => void;
};

export function ImagePickField({
  label = "Picture",
  hint = "PNG, JPG, or WebP",
  accept = "image/*",
  disabled,
  previewUrl = null,
  round,
  showRemove = true,
  onFile,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const shown = localPreview || previewUrl;

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  function applyFile(file: File | null) {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(file ? URL.createObjectURL(file) : null);
    onFile(file);
  }

  function onPick(file: File | null) {
    if (!file) {
      applyFile(null);
      return;
    }
    if (!file.type.startsWith("image/")) return;
    applyFile(file);
  }

  return (
    <div className={`image-pick${round ? " round" : ""}${dragging ? " dragging" : ""}${disabled ? " disabled" : ""}`}>
      <div className="image-pick-label-row">
        <span className="image-pick-label">{label}</span>
        {hint && <span className="image-pick-hint">{hint}</span>}
      </div>
      <div
        className="image-pick-zone"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={shown ? "Change picture" : "Add picture"}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (disabled) return;
          const file = event.dataTransfer.files?.[0] || null;
          onPick(file);
        }}
      >
        {shown ? (
          <img className="image-pick-preview" src={shown} alt="" />
        ) : (
          <div className="image-pick-empty">
            <span className="image-pick-icon" aria-hidden>
              ▦
            </span>
            <strong>Drop an image here</strong>
            <span>or click to browse</span>
          </div>
        )}
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0] || null;
            event.target.value = "";
            onPick(file);
          }}
        />
      </div>
      <div className="image-pick-actions">
        <button
          type="button"
          className="btn ghost"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {shown ? "Change" : "Choose picture"}
        </button>
        {shown && showRemove && (
          <button
            type="button"
            className="btn ghost"
            disabled={disabled}
            onClick={() => {
              applyFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
