import { useState } from "react";

export function TextAsk({
  title,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="modal-backdrop name-ask" onClick={onCancel}>
      <form
        className="modal-panel ask-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-ask-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value.trim() || initial);
        }}
      >
        <div className="modal-header">
          <h2 id="text-ask-title">{title}</h2>
          <button type="button" className="btn ghost" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body ask-body">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              value={value}
              autoFocus
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            OK
          </button>
        </div>
      </form>
    </div>
  );
}
