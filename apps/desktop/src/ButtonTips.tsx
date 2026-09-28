import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const DELAY_MS = 1000;

const PHRASES: Record<string, string> = {
  console: "Open the party console, where you ask for rolls.",
  map: "Open the battle map.",
  log: "Open the session log.",
  items: "Open the item library.",
  "+ session": "Start another session.",
  save: "Save this table into the savedata folder.",
  load: "Open a save from the savedata folder.",
  options: "Change display, audio, and theme.",
  title: "Return to the title screen.",
  quit: "Close Tablewhisper.",
  stay: "Keep Tablewhisper open.",
  continue: "Return to the table you already have open.",
  "new table": "Start a new session from the title screen.",
  credits: "Show the credits.",
  back: "Go back.",
  cancel: "Close this without changing anything.",
  close: "Close this.",
  ok: "Use this name.",
  keep: "Leave this character in the party.",
  edit: "Change this.",
  delete: "Click a chest, portal, light, door, wall, or token to remove it.",
  remove: "Remove this.",
  bag: "Open this character's pack.",
  "save changes": "Write these edits onto the character sheet.",
  "resolve check": "Turn what you typed into a roll, then apply the result.",
  "ctrl+n capture": "Listen once and fill the box with what was said.",
  "start listening": "Keep the microphone open for the next thing said.",
  "stop listening": "Stop the microphone.",
  "award milestone": "Give experience for a milestone.",
  "copy roll line": "Copy the roll line to the clipboard.",
  "add foe": "Add a monster to the encounter.",
  "add npc": "Add a person to the scene.",
  clear: "Remove everyone from this list.",
  "set hp": "Type this creature's current hit points.",
  attitude: "Set whether this person is friendly, indifferent, or hostile.",
  "confirm award": "Give this experience to the party.",
  skip: "Do not give experience for this.",
  "re-upload": "Replace a character sheet with a new PDF.",
  "choose pdf": "Pick the character PDF to read.",
  "confirm update": "Write the new PDF onto the character you picked.",
  "upload as new character": "Add this PDF as another party member.",
  "upload pdf": "Read a D&D Beyond PDF into the party.",
  "upload map": "Use a picture as this scene's map.",
  import: "Read a lootstash.app item link into the library.",
  "json file": "Add items from a JSON file the DM saved.",
  "+ scene": "Add another map scene.",
  "sync tokens": "Place the party and the encounter on this map.",
  "player preview": "Show the map as the players see it, with fog hiding the rest.",
  "player preview on": "Turn off the player view and show the whole map.",
  "vision off": "Show the light and vision rings.",
  "vision on": "Hide the light and vision rings.",
  "calibrate grid": "Set how many squares the map is.",
  "set size": "Apply this square count to the map.",
  "save grid": "Keep this grid size.",
  "on field": "Show the creatures already on the map.",
  "+ foe": "Pick a monster to place on the map.",
  "+ npc": "Pick a person to place on the map.",
  "clear marks": "Remove the attack marks from the map.",
  select: "Select, move, and inspect tokens.",
  ruler: "Measure distance on the grid.",
  fog: "Paint fog that hides the map from the players.",
  reveal: "Paint away fog so the players can see.",
  wall: "Drag to draw a wall.",
  door: "Drag to draw a door.",
  liquid: "Paint a pool. Pick the kind, depth, and current first.",
  light: "Click to place a torch or lamp.",
  portal: "Click to place a portal, then choose where it opens.",
  chest: "Click the map to place a chest.",
  erase: "Drag across a wall, door, light, portal, pool, or fog to remove it.",
  "new pool": "Start another pool of the chosen liquid.",
  "reset fog": "Cover the whole map in fog again.",
  "reveal all": "Remove all fog from this map.",
  erasing: "Stop painting the pool away and paint liquid again.",
  submit: "Apply this roll.",
  heal: "Restore this many hit points.",
  apply: "Apply this number.",
  miss: "This attack missed. Hit points stay.",
  spawn: "Put the chosen creature on the map.",
  "roll initiative": "Roll initiative for everyone in the turn order.",
  next: "Advance the turn order.",
  trade: "Swap these two places in the turn order.",
  older: "Turn to an earlier log entry.",
  newer: "Turn to a later log entry.",
  "fewer squares": "Use a coarser grid.",
  "more squares": "Use a finer grid.",
  "turn left": "Rotate the portrait left.",
  "turn right": "Rotate the portrait right.",
  "reset color": "Put the portrait colors back.",
  use: "Use this portrait.",
  "try again": "Load the map again.",
  minimize: "Shrink the window to the taskbar.",
  maximize: "Fill the screen with the window.",
  restore: "Return the window to its previous size.",
  "previous display": "Use the previous screen.",
  "next display": "Use the next screen.",
};

type Tip = { text: string; x: number; y: number; below: boolean };

function buttonOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const found = target.closest("button, label.btn, [role='button']");
  return found instanceof HTMLElement ? found : null;
}

function visibleText(el: HTMLElement): string {
  return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
}

function contextTip(el: HTMLElement, text: string): string | null {
  const key = text.toLowerCase();
  if (el.classList.contains("window-min")) return PHRASES.minimize;
  if (el.classList.contains("window-max")) {
    return el.getAttribute("aria-label") === "Restore" ? PHRASES.restore : PHRASES.maximize;
  }
  if (el.classList.contains("window-close")) return "Close Tablewhisper.";
  if (el.classList.contains("book-cover")) return "Open the session log.";
  if (el.classList.contains("map-tray-item")) return text ? `Put ${text} on the map.` : "Put this on the map.";
  if (el.closest(".map-scenes") && text && !text.startsWith("+")) {
    return `Show ${text}. Right-click to rename or delete this scene.`;
  }
  if (el.closest(".title-theme-menu") && text) return `Use the ${text} theme.`;
  if (el.classList.contains("title-theme-btn")) return "Choose a theme.";
  if (el.closest(".book-lamp") && text) return `Show the log with the ${text} look.`;
  if (el.closest(".chest-panel") && key === "add") return "Add the chosen item to this chest.";
  if (el.closest(".chest-panel") && key === "remove") return "Take this item out of the chest.";
  if (el.closest(".chest-add") && key === "add") return "Add the chosen item to this chest.";
  if (el.closest(".map-setup") && key === "next") return "Go to the next setup step. The last step confirms the map.";
  if (el.closest(".map-setup") && key === "back") return "Return to the previous setup step.";
  if (el.closest(".map-setup") && key === "wall") return "Paint squares as walls. Drag from a painted square to erase it.";
  if (el.closest(".map-setup") && key === "door") return "Paint a square as a door.";
  if ((key === "‹" || key === "›") && el.closest(".opt-row")) {
    const setting = el.closest(".opt-row")?.querySelector(":scope > span")?.textContent?.replace(/\s+/g, " ").trim();
    if (setting) return `${key === "‹" ? "Previous" : "Next"} ${setting.toLowerCase()}.`;
  }
  return null;
}

function describe(el: HTMLElement, title: string | null): string {
  const explicit = el.getAttribute("data-tip");
  if (explicit) return explicit;
  const text = visibleText(el);
  const fromContext = contextTip(el, text);
  if (fromContext) return fromContext;
  if (title) return title;
  const aria = (el.getAttribute("aria-label") || "").trim();
  const key = (text || aria).toLowerCase();
  if (PHRASES[key]) return PHRASES[key];
  if (aria && PHRASES[aria.toLowerCase()]) return PHRASES[aria.toLowerCase()];
  if (aria && aria !== text) return aria.endsWith(".") ? aria : `${aria}.`;
  if (!text) return "";
  return text.endsWith(".") ? text : `${text}.`;
}

export function ButtonTips() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer = 0;
    const titles = new WeakMap<HTMLElement, string>();

    function hide() {
      window.clearTimeout(timer);
      timer = 0;
      if (current && titles.has(current)) {
        current.setAttribute("title", titles.get(current) || "");
        titles.delete(current);
      }
      current = null;
      setTip(null);
    }

    function show(button: HTMLElement) {
      const text = describe(button, titles.get(button) ?? button.getAttribute("title"));
      if (!text || current !== button) return;
      const box = button.getBoundingClientRect();
      const below = box.top < 72;
      const x = Math.min(window.innerWidth - 20, Math.max(20, box.left + box.width / 2));
      const y = below ? box.bottom : box.top;
      setTip({ text, x, y, below });
    }

    function onOver(event: MouseEvent) {
      const button = buttonOf(event.target);
      if (!button || button === current) return;
      hide();
      current = button;
      const title = button.getAttribute("title");
      if (title) {
        titles.set(button, title);
        button.removeAttribute("title");
      }
      timer = window.setTimeout(() => show(button), DELAY_MS);
    }

    function onOut(event: MouseEvent) {
      if (!current) return;
      const next = event.relatedTarget;
      if (next instanceof Node && current.contains(next)) return;
      if (buttonOf(event.target) !== current && !current.contains(event.target as Node)) return;
      hide();
    }

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("pointerdown", hide);
    return () => {
      hide();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("pointerdown", hide);
    };
  }, []);

  if (!tip) return null;
  return createPortal(
    <span className={`name-plate button-tip${tip.below ? " below" : ""}`} style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </span>,
    document.body,
  );
}
