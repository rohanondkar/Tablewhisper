import { useEffect, useState } from "react";
import { titleThemeId, type TitleThemeId } from "./titleThemes";

type Chrome = {
  maximized: boolean;
  canMaximize: boolean;
  fullscreen: boolean;
};

export function WindowFrame() {
  const [theme, setTheme] = useState<TitleThemeId>(titleThemeId());
  const [chrome, setChrome] = useState<Chrome>({ maximized: false, canMaximize: true, fullscreen: false });
  const desktop = window.dmDesktop;

  useEffect(() => {
    document.documentElement.classList.add("window-framed");
    const sync = () => setTheme(titleThemeId());
    window.addEventListener("tablewhisper-theme", sync);
    return () => {
      document.documentElement.classList.remove("window-framed");
      window.removeEventListener("tablewhisper-theme", sync);
    };
  }, []);

  useEffect(() => {
    if (!desktop?.windowState) return;
    desktop.windowState().then(setChrome).catch(() => undefined);
    return desktop.onWindowState?.(setChrome);
  }, [desktop]);

  return (
    <>
      <div className={`window-border frame-${theme}`} aria-hidden="true">
        <FrameMarks theme={theme} />
      </div>
      <header className={`window-bar frame-${theme}`}>
        <span className="window-bar-title">Tablewhisper</span>
        {desktop?.minimize ? (
          <div className="window-controls">
            <button type="button" className="window-min" aria-label="Minimize" onClick={() => void desktop.minimize?.()}>
              <i />
            </button>
            {chrome.canMaximize ? (
              <button
                type="button"
                className="window-max"
                aria-label={chrome.maximized ? "Restore" : "Maximize"}
                onClick={() => void desktop.maximize?.().then(setChrome)}
              >
                {chrome.maximized ? <b className="restore" /> : <b />}
              </button>
            ) : null}
            <button type="button" className="window-close" aria-label="Close" onClick={() => void desktop.close?.()}>
              <span />
            </button>
          </div>
        ) : null}
      </header>
    </>
  );
}

function FrameMarks({ theme }: { theme: TitleThemeId }) {
  if (theme === "hearth") {
    return (
      <>
        <Dragon className="mark tl" />
        <Dragon className="mark tr" />
        <Dragon className="mark bl" />
        <Dragon className="mark br" />
      </>
    );
  }
  if (theme === "atla") {
    return (
      <>
        <span className="mark element water" />
        <span className="mark element earth" />
        <span className="mark element fire" />
        <span className="mark element air" />
      </>
    );
  }
  if (theme === "starwars") {
    return (
      <>
        <span className="saber top" />
        <span className="saber right" />
        <span className="saber bottom" />
        <span className="saber left" />
      </>
    );
  }
  if (theme === "cyberpunk") {
    return (
      <>
        <span className="tick tl" />
        <span className="tick tr" />
        <span className="tick bl" />
        <span className="tick br" />
      </>
    );
  }
  if (theme === "shadowrun") {
    return (
      <>
        <Hex className="mark tl" />
        <Hex className="mark tr" />
        <Hex className="mark bl" />
        <Hex className="mark br" />
      </>
    );
  }
  if (theme === "cthulhu") {
    return (
      <>
        <Tentacle className="mark tl" />
        <Tentacle className="mark tr" />
        <Tentacle className="mark bl" />
        <Tentacle className="mark br" />
      </>
    );
  }
  return (
    <>
      <span className="leather-star" />
      <span className="stitch top" />
      <span className="stitch bottom" />
    </>
  );
}

function Dragon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M6 50 C14 22 34 12 48 20 C38 24 40 36 52 38 C36 34 24 46 16 56 C28 48 38 54 34 62 C20 56 10 58 6 50 Z" />
      <path d="M16 28 L10 8 L28 22" />
      <path d="M30 18 L38 2 L40 22" />
    </svg>
  );
}

function Hex({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" />
    </svg>
  );
}

function Tentacle({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M8 8 C28 10 22 34 40 30 C52 28 58 44 48 56" />
      <circle cx="18" cy="20" r="3" />
      <circle cx="28" cy="28" r="2.5" />
      <circle cx="40" cy="34" r="2" />
    </svg>
  );
}
