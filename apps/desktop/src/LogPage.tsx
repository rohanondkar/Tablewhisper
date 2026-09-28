import { memo, useEffect, useMemo, useState } from "react";
import type { SessionEvent } from "./api";
import { titleTheme, type LogDevice } from "./titleThemes";

function logWhen(iso: string): { day: string; time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: "", time: "" };
  return {
    day: date.toLocaleDateString(undefined, { month: "long", day: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function LogEntry({ event }: { event: SessionEvent }) {
  const when = logWhen(event.created_at);
  return (
    <>
      {when.day ? <h3 className="story-day">{when.day}</h3> : null}
      <article className="story-row">
        <div className="story-when">
          <span>{when.time}</span>
          <span className="story-from">{event.source === "map" ? "Map" : "Console"}</span>
        </div>
        <div>
          <p className="story-in">{event.query}</p>
          {event.result?.roll_line ? <p className="story-out">{event.result.roll_line}</p> : null}
          {event.result?.outcome ? <p className="story-fate">{event.result.outcome}</p> : null}
        </div>
      </article>
    </>
  );
}

const LOG_FACE: Record<LogDevice, { kicker: string; open: string; close: string; empty: string }> = {
  book: { kicker: "A record of the table", open: "Open", close: "Cover", empty: "The pages are still blank." },
  scroll: { kicker: "A scroll of the table", open: "Unroll", close: "Roll up", empty: "The scroll is still blank." },
  hologram: { kicker: "Holorecord", open: "Project", close: "Close", empty: "The hologram has no entries." },
  terminal: { kicker: "Session shard", open: "Connect", close: "Disconnect", empty: "The shard is empty." },
  commlink: { kicker: "Commlink log", open: "Open channel", close: "Close", empty: "No messages yet." },
  dossier: { kicker: "Case file", open: "Open file", close: "Close file", empty: "The file is empty." },
  dispatch: { kicker: "Field report", open: "Read report", close: "File it", empty: "No reports filed." },
};

export const LogPage = memo(function LogPage({
  events,
  sessionName,
  entryId,
  pinned,
  turn,
  leaving,
  onTurn,
  onLeaveDone,
}: {
  events: SessionEvent[];
  sessionName: string;
  entryId: string | null;
  pinned: boolean;
  turn: "" | "older" | "newer";
  leaving: SessionEvent | null;
  onTurn: (direction: "older" | "newer", nextId: string, stayOnNewest: boolean, shown: SessionEvent) => void;
  onLeaveDone: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [coverAnim, setCoverAnim] = useState<"" | "opening" | "closing">("");
  const theme = titleTheme();
  const face = LOG_FACE[theme.logDevice];
  const [night, setNight] = useState(() => window.localStorage.getItem("tablewhisper-log-night") === "1");
  useEffect(() => {
    window.localStorage.setItem("tablewhisper-log-night", night ? "1" : "0");
  }, [night]);
  const ordered = useMemo(() => [...events].reverse(), [events]);
  const found = entryId ? ordered.findIndex((row) => row.id === entryId) : -1;
  const index = pinned || found < 0 ? 0 : found;
  const entry = ordered[index];
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function openCover() {
    if (coverAnim === "opening") return;
    if (reduceMotion()) {
      setOpened(true);
      return;
    }
    setCoverAnim("opening");
  }

  function closeCover() {
    if (reduceMotion()) {
      setOpened(false);
      setCoverAnim("");
      return;
    }
    setOpened(false);
    setCoverAnim("closing");
  }

  function go(direction: "older" | "newer") {
    if (!entry) return;
    const nextIndex = direction === "older" ? index + 1 : index - 1;
    const next = ordered[nextIndex];
    if (!next) return;
    onTurn(direction, next.id, nextIndex === 0, entry);
  }

  return (
    <main className={`log-page log-device-${theme.logDevice}${night ? " log-night log-dim" : ""}`}>
      <div className="book-column">
      <div className="book-lamp" role="group" aria-label="Log page look">
        <button type="button" className={night ? "" : "on"} onClick={() => setNight(false)}>
          {theme.contrast[0]}
        </button>
        <button type="button" className={night ? "on" : ""} onClick={() => setNight(true)}>
          {theme.contrast[1]}
        </button>
      </div>
      <div className={`book${opened ? " is-open" : ""}`}>
        {!opened && (
          <button
            type="button"
            className={`book-cover${coverAnim ? ` ${coverAnim}` : ""}`}
            onClick={openCover}
            onAnimationEnd={() => {
              if (coverAnim === "opening") setOpened(true);
              if (coverAnim === "closing") setCoverAnim("");
            }}
          >
            <span className="book-spine" />
            <span className="book-cover-face">
              <span className="book-rule" />
              <span className="book-kicker">{face.kicker}</span>
              <h2>Log</h2>
              <p>{sessionName}</p>
              <span className="book-rule" />
              <span className="book-open-label">{face.open}</span>
            </span>
          </button>
        )}
        {opened && (
          <div className="book-spread">
            <div className="log-turn book-pages">
              {!entry ? (
                <div className="story-page parchment">
                  <p className="log-empty">{face.empty}</p>
                </div>
              ) : (
                <>
                  {leaving ? (
                    <div className={`story-page parchment leaving turn-${turn}`} onAnimationEnd={onLeaveDone}>
                      <LogEntry event={leaving} />
                    </div>
                  ) : null}
                  <div key={entry.id} className={`story-page parchment${turn ? ` turn-${turn}` : ""}`}>
                    <LogEntry event={entry} />
                  </div>
                </>
              )}
            </div>
            <div className="log-nav">
              <button type="button" className="btn ghost" onClick={closeCover}>
                {face.close}
              </button>
              <button type="button" className="btn ghost" disabled={!entry || index >= ordered.length - 1} onClick={() => go("older")}>
                Older
              </button>
              <span>{entry ? `${ordered.length - index}/${ordered.length}` : "Empty"}</span>
              <button type="button" className="btn ghost" disabled={!entry || index <= 0} onClick={() => go("newer")}>
                Newer
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </main>
  );
});

