import hearthPointer from "../public/cursors/hearth.png?inline";
import hearthGrab from "../public/cursors/hearth-grab.png?inline";
import atlaPointer from "../public/cursors/atla.png?inline";
import atlaGrab from "../public/cursors/atla-grab.png?inline";
import starwarsPointer from "../public/cursors/starwars.png?inline";
import starwarsGrab from "../public/cursors/starwars-grab.png?inline";
import cyberpunkPointer from "../public/cursors/cyberpunk.png?inline";
import cyberpunkGrab from "../public/cursors/cyberpunk-grab.png?inline";
import shadowrunPointer from "../public/cursors/shadowrun.png?inline";
import shadowrunGrab from "../public/cursors/shadowrun-grab.png?inline";
import cthulhuPointer from "../public/cursors/cthulhu.png?inline";
import cthulhuGrab from "../public/cursors/cthulhu-grab.png?inline";
import savagePointer from "../public/cursors/savage.png?inline";
import savageGrab from "../public/cursors/savage-grab.png?inline";

export type TitleThemeId = "hearth" | "atla" | "starwars" | "cyberpunk" | "shadowrun" | "cthulhu" | "savage";

export type LogDevice = "book" | "scroll" | "hologram" | "terminal" | "commlink" | "dossier" | "dispatch";

export type ThemeChrome = {
  bg: string;
  bgElev: string;
  panel: string;
  card: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  line: string;
  grid: string;
  token: string;
  tokenOn: string;
  vision: string;
  nameFill: string;
  nameInk: string;
  radius: number;
};

export type TitleTheme = {
  id: TitleThemeId;
  label: string;
  file: string;
  credit: string;
  logDevice: LogDevice;
  contrast: [string, string];
  chrome: ThemeChrome;
};

const CC = "https://creativecommons.org/licenses/by/4.0/";
const macLeod = (title: string) =>
  `Music: ${title} by Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 (${CC}).`;

function audio(name: string): string {
  return `${import.meta.env.BASE_URL}audio/${name}`;
}

const CHROME: Record<TitleThemeId, Pick<TitleTheme, "logDevice" | "contrast" | "chrome">> = {
  hearth: {
    logDevice: "book",
    contrast: ["Parchment", "Night ink"],
    chrome: {
      bg: "#100e0c",
      bgElev: "#1a1714",
      panel: "#221e1a",
      card: "#2a2430",
      ink: "#f6efe2",
      muted: "#b7a98f",
      accent: "#e40712",
      accent2: "#cbb486",
      line: "#4a4034",
      grid: "rgba(255,255,255,0.18)",
      token: "#cbb486",
      tokenOn: "#ffffff",
      vision: "#e6c15a",
      nameFill: "rgba(16,14,12,0.92)",
      nameInk: "#f6efe2",
      radius: 0.15,
    },
  },
  atla: {
    logDevice: "scroll",
    contrast: ["Day ink", "Lamp"],
    chrome: {
      bg: "#102028",
      bgElev: "#16303a",
      panel: "#1c3a46",
      card: "#143844",
      ink: "#d7eef8",
      muted: "#8fb4c4",
      accent: "#e4572e",
      accent2: "#7ec8e8",
      line: "#2d5a68",
      grid: "rgba(180,220,235,0.35)",
      token: "#7ec8e8",
      tokenOn: "#ffe0b0",
      vision: "#7ec8e8",
      nameFill: "rgba(16,32,40,0.92)",
      nameInk: "#d7eef8",
      radius: 0.5,
    },
  },
  starwars: {
    logDevice: "hologram",
    contrast: ["Bright", "Dim"],
    chrome: {
      bg: "#070910",
      bgElev: "#0e1424",
      panel: "#121a30",
      card: "#101828",
      ink: "#f3e6b0",
      muted: "#9aa4c0",
      accent: "#7eb6ff",
      accent2: "#f3e6b0",
      line: "#2a3a66",
      grid: "rgba(120,180,255,0.45)",
      token: "#7eb6ff",
      tokenOn: "#f3e6b0",
      vision: "#7eb6ff",
      nameFill: "rgba(7,9,16,0.9)",
      nameInk: "#f3e6b0",
      radius: 0.5,
    },
  },
  cyberpunk: {
    logDevice: "terminal",
    contrast: ["Bright", "Dim"],
    chrome: {
      bg: "#050505",
      bgElev: "#0c0c0c",
      panel: "#101010",
      card: "#141414",
      ink: "#fcee0a",
      muted: "#b8b08a",
      accent: "#ff003c",
      accent2: "#fcee0a",
      line: "#3a3a18",
      grid: "rgba(252,238,10,0.35)",
      token: "#00f0ff",
      tokenOn: "#fcee0a",
      vision: "#ff003c",
      nameFill: "rgba(5,5,5,0.92)",
      nameInk: "#fcee0a",
      radius: 0.04,
    },
  },
  shadowrun: {
    logDevice: "commlink",
    contrast: ["Bright", "Dim"],
    chrome: {
      bg: "#07140f",
      bgElev: "#0c1c16",
      panel: "#10241c",
      card: "#0e2018",
      ink: "#8dffc0",
      muted: "#6a9a80",
      accent: "#ff2ba0",
      accent2: "#39ff88",
      line: "#1e4a38",
      grid: "rgba(57,255,136,0.35)",
      token: "#39ff88",
      tokenOn: "#ff2ba0",
      vision: "#39ff88",
      nameFill: "rgba(7,20,15,0.92)",
      nameInk: "#8dffc0",
      radius: 0.12,
    },
  },
  cthulhu: {
    logDevice: "dossier",
    contrast: ["Day", "Lamp"],
    chrome: {
      bg: "#0c1210",
      bgElev: "#141c18",
      panel: "#1a2420",
      card: "#1c221c",
      ink: "#c5d2bf",
      muted: "#8a9788",
      accent: "#6a8f62",
      accent2: "#d7c7a2",
      line: "#3a4a40",
      grid: "rgba(197,210,191,0.22)",
      token: "#d7c7a2",
      tokenOn: "#f4efe2",
      vision: "#6a8f62",
      nameFill: "rgba(12,18,16,0.92)",
      nameInk: "#c5d2bf",
      radius: 0.06,
    },
  },
  savage: {
    logDevice: "dispatch",
    contrast: ["Sun", "Campfire"],
    chrome: {
      bg: "#1a100c",
      bgElev: "#26160f",
      panel: "#2e1c14",
      card: "#3a2418",
      ink: "#f0d7a4",
      muted: "#c4a574",
      accent: "#c45c1c",
      accent2: "#f0d7a4",
      line: "#6a4030",
      grid: "rgba(240,215,164,0.28)",
      token: "#f0d7a4",
      tokenOn: "#ffffff",
      vision: "#c45c1c",
      nameFill: "rgba(26,16,12,0.92)",
      nameInk: "#f0d7a4",
      radius: 0.45,
    },
  },
};

export const TITLE_THEMES: TitleTheme[] = [
  {
    id: "hearth",
    label: "Hearth",
    file: audio("planning.m4a"),
    credit:
      "Music: Planning by Alexander Nakarada (https://creatorchords.com). Licensed under Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/).",
    ...CHROME.hearth,
  },
  {
    id: "atla",
    label: "ATLA",
    file: audio("eastminster.mp3"),
    credit: macLeod("Eastminster"),
    ...CHROME.atla,
  },
  {
    id: "starwars",
    label: "Star Wars",
    file: audio("noble-race.mp3"),
    credit: macLeod("Noble Race"),
    ...CHROME.starwars,
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    file: audio("club-diver.mp3"),
    credit: macLeod("Club Diver"),
    ...CHROME.cyberpunk,
  },
  {
    id: "shadowrun",
    label: "Shadowrun",
    file: audio("brain-dance.mp3"),
    credit: macLeod("Brain Dance"),
    ...CHROME.shadowrun,
  },
  {
    id: "cthulhu",
    label: "Call of Cthulhu",
    file: audio("the-dread.mp3"),
    credit: macLeod("The Dread"),
    ...CHROME.cthulhu,
  },
  {
    id: "savage",
    label: "Savage Worlds",
    file: audio("adventures.mp3"),
    credit: macLeod("Adventures in Adventureland"),
    ...CHROME.savage,
  },
];

const THEME_KEY = "tablewhisper-title-theme";

export function titleThemeId(): TitleThemeId {
  const saved = localStorage.getItem(THEME_KEY);
  if (TITLE_THEMES.some((theme) => theme.id === saved)) return saved as TitleThemeId;
  return "hearth";
}

export function titleTheme(): TitleTheme {
  return TITLE_THEMES.find((theme) => theme.id === titleThemeId()) || TITLE_THEMES[0];
}

export function setTitleTheme(id: TitleThemeId) {
  localStorage.setItem(THEME_KEY, id);
  applyThemeChrome(id);
  window.dispatchEvent(new Event("tablewhisper-theme"));
}

const CURSOR_HOTSPOT: Record<TitleThemeId, [number, number]> = {
  hearth: [12, 1],
  atla: [16, 16],
  starwars: [16, 3],
  cyberpunk: [11, 5],
  shadowrun: [3, 3],
  cthulhu: [7, 5],
  savage: [16, 1],
};

const CURSOR_ART: Record<TitleThemeId, { pointer: string; grab: string }> = {
  hearth: { pointer: hearthPointer, grab: hearthGrab },
  atla: { pointer: atlaPointer, grab: atlaGrab },
  starwars: { pointer: starwarsPointer, grab: starwarsGrab },
  cyberpunk: { pointer: cyberpunkPointer, grab: cyberpunkGrab },
  shadowrun: { pointer: shadowrunPointer, grab: shadowrunGrab },
  cthulhu: { pointer: cthulhuPointer, grab: cthulhuGrab },
  savage: { pointer: savagePointer, grab: savageGrab },
};

function installCursors(id: TitleThemeId) {
  const art = CURSOR_ART[id];
  const [hotX, hotY] = CURSOR_HOTSPOT[id];
  const pointer = `url("${art.pointer}") ${hotX} ${hotY}, auto`;
  const closed = `url("${art.grab}") 16 16, auto`;
  let node = document.getElementById("theme-cursors");
  if (!node) {
    node = document.createElement("style");
    node.id = "theme-cursors";
    document.head.appendChild(node);
  }
  node.textContent = `
    html, html * {
      cursor: ${pointer} !important;
    }
    html input, html textarea, html [contenteditable="true"] {
      cursor: text !important;
    }
    html button:disabled, html .btn:disabled {
      cursor: not-allowed !important;
    }
    html .map-split {
      cursor: col-resize !important;
    }
    html .map-stage-wrap.aim, html .map-stage-wrap.aim * {
      cursor: crosshair !important;
    }
    html .portrait-stage, html .portrait-stage *,
    html .hand-pad.gripping, html .hand-pad.gripping *,
    html .map-builder-chip,
    html[data-dragging="1"], html[data-dragging="1"] * {
      cursor: ${closed} !important;
    }
  `;
}

export function applyThemeChrome(id: TitleThemeId = titleThemeId()) {
  const theme = TITLE_THEMES.find((item) => item.id === id) || TITLE_THEMES[0];
  const root = document.documentElement;
  const chrome = theme.chrome;
  root.dataset.theme = theme.id;
  root.classList.add("theme-live");
  const vars: Record<string, string> = {
    "--bg": chrome.bg,
    "--bg-elev": chrome.bgElev,
    "--bg-panel": chrome.panel,
    "--bg-card": chrome.card,
    "--ink": chrome.ink,
    "--muted": chrome.muted,
    "--accent": chrome.accent,
    "--accent-2": chrome.accent2,
    "--ddb-red": chrome.accent,
    "--ddb-red-deep": chrome.accent,
    "--ddb-gold": chrome.accent2,
    "--ddb-gold-bright": chrome.ink,
    "--line": chrome.line,
    "--line-strong": chrome.accent2,
  };
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  installCursors(theme.id);
  root.style.background = chrome.bg;
  root.style.color = chrome.ink;
}

const SPECKS = Array.from({ length: 36 }, (_, index) => ({
  id: index,
  left: `${(index * 17 + 5) % 100}%`,
  size: 2 + (index % 5),
  duration: 6 + (index % 8),
  delay: -((index * 1.3) % 10),
  drift: `${(index % 2 === 0 ? 1 : -1) * (8 + (index % 24))}px`,
  kind: (["air", "water", "earth", "fire"] as const)[index % 4],
}));

const STARS = Array.from({ length: 48 }, (_, index) => ({
  id: index,
  left: `${(index * 13 + 2) % 100}%`,
  duration: 4 + (index % 9),
  delay: -((index * 0.7) % 8),
  size: index % 5 === 0 ? 3 : 1,
}));

const DROPS = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  left: `${(index * 11 + 3) % 100}%`,
  duration: 1.4 + (index % 5) * 0.35,
  delay: -((index * 0.4) % 3),
}));

export function TitleAtmosphere({ theme }: { theme: TitleThemeId }) {
  if (theme === "atla") {
    return (
      <div className="title-fx" aria-hidden="true">
        {SPECKS.map((speck) => (
          <span
            key={speck.id}
            className={`ember mote mote-${speck.kind}`}
            style={{
              left: speck.left,
              width: speck.size,
              height: speck.size,
              animationDuration: `${speck.duration}s`,
              animationDelay: `${speck.delay}s`,
              ["--drift" as string]: speck.drift,
            }}
          />
        ))}
        <span className="bend-ring" />
      </div>
    );
  }
  if (theme === "starwars") {
    return (
      <div className="title-fx" aria-hidden="true">
        {STARS.map((star) => (
          <span
            key={star.id}
            className="star"
            style={{
              left: star.left,
              width: star.size,
              height: star.size,
              animationDuration: `${star.duration}s`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
        <span className="light-streak streak-a" />
        <span className="light-streak streak-b" />
      </div>
    );
  }
  if (theme === "cyberpunk") {
    return (
      <div className="title-fx rain-cyberpunk" aria-hidden="true">
        <span className="cp-corner cp-tl" />
        <span className="cp-corner cp-tr" />
        <span className="cp-corner cp-bl" />
        <span className="cp-corner cp-br" />
        {DROPS.map((drop) => (
          <span
            key={drop.id}
            className="raindrop"
            style={{
              left: drop.left,
              animationDuration: `${drop.duration}s`,
              animationDelay: `${drop.delay}s`,
            }}
          />
        ))}
        <span className="scanlines" />
      </div>
    );
  }
  if (theme === "shadowrun") {
    return (
      <div className={`title-fx rain-${theme}`} aria-hidden="true">
        {DROPS.map((drop) => (
          <span
            key={drop.id}
            className="raindrop"
            style={{
              left: drop.left,
              animationDuration: `${drop.duration}s`,
              animationDelay: `${drop.delay}s`,
            }}
          />
        ))}
        <span className="scanlines" />
      </div>
    );
  }
  if (theme === "cthulhu") {
    return (
      <div className="title-fx" aria-hidden="true">
        <span className="fog fog-a" />
        <span className="fog fog-b" />
        <span className="fog fog-c" />
      </div>
    );
  }
  if (theme === "savage") {
    return (
      <div className="title-fx" aria-hidden="true">
        <span className="horizon" />
        {SPECKS.slice(0, 18).map((speck) => (
          <span
            key={speck.id}
            className="dust"
            style={{
              top: `${20 + (speck.id * 7) % 60}%`,
              animationDuration: `${speck.duration}s`,
              animationDelay: `${speck.delay}s`,
            }}
          />
        ))}
      </div>
    );
  }
  return null;
}
