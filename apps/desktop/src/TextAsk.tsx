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
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value);
        }}
      >
        <h2>{title}</h2>
        <label>
          Name
          <input value={value} autoFocus onChange={(event) => setValue(event.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn">
            OK
          </button>
        </div>
      </form>
    </div>
  );
}
