import { useEffect, useState } from "react";
import { mediaUrlSync } from "./api";
import { PortraitFileButton } from "./PortraitEditor";

export function initialsFor(label: string): string {
  return (
    label
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function hpTone(current: number, max: number): "high" | "mid" | "low" {
  if (max <= 0) return "low";
  const ratio = current / max;
  if (ratio > 0.5) return "high";
  if (ratio > 0.2) return "mid";
  return "low";
}

export function PartyAvatar({
  name,
  imageUrl,
  apiBase,
  onFile,
}: {
  name: string;
  imageUrl?: string | null;
  apiBase: string;
  onFile: (file: File) => void;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [imageUrl]);
  const initials = initialsFor(name);
  return (
    <label
      className="avatar-upload"
      title="Upload portrait. The map token uses this picture."
      onClick={(e) => e.stopPropagation()}
    >
      {imageUrl && !broken ? (
        <img
          className="avatar"
          src={mediaUrlSync(imageUrl, apiBase)}
          alt=""
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="avatar initials">{initials}</div>
      )}
      <PortraitFileButton hidden onFile={onFile} />
    </label>
  );
}
