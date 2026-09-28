import { useState } from "react";
import { ImagePickField } from "./ImagePickField";

export type FactionAskResult = {
  name: string;
  summary: string;
  image: File | null;
};

export function FactionAsk({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (value: FactionAskResult) => void;
}) {
  const [name, setName] = useState("Faction");
  const [summary, setSummary] = useState("");
  const [image, setImage] = useState<File | null>(null);

  return (
    <div className="modal-backdrop name-ask" onClick={onCancel}>
      <form
        className="modal-panel ask-panel faction-ask-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="faction-ask-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ name: name.trim() || "Faction", summary: summary.trim(), image });
        }}
      >
        <div className="modal-header">
          <h2 id="faction-ask-title">New faction</h2>
          <button type="button" className="btn ghost" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body ask-body">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              value={name}
              autoFocus
              placeholder="Faction name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Short description</span>
            <textarea
              value={summary}
              rows={3}
              placeholder="Who they are, what they want…"
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <ImagePickField round onFile={setImage} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
