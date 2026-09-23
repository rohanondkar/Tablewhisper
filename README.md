# Tablewhisper

Local DM console for D&D 5e: Beyond PDF sheets, whispered rulings, SRD combat foes, tavern Scene NPCs, optional voice (Ctrl+N) + Ollama. Runs fully local.

**Use Command Prompt (`cmd`), not PowerShell** — avoids script-policy errors with `Activate.ps1` / `npm.ps1`.

Open cmd: Start → type `cmd` → Enter.

Project folder used below:

```bat
G:\Discord Bot\DND DM Dice roll bot
```

---

## Prerequisites (once)

- Python 3.11+ — [python.org](https://www.python.org/downloads/) (check **Add to PATH**)
- Node.js 20+ LTS — [nodejs.org](https://nodejs.org/)
- Ollama (optional) — [ollama.com](https://ollama.com) then `ollama pull llama3.2`

---

## First-time setup (once)

```bat
cd /d "G:\Discord Bot\DND DM Dice roll bot\apps\api"
rmdir /s /q .venv
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt

cd /d "G:\Discord Bot\DND DM Dice roll bot\apps\desktop"
npm install
```

No `Activate.ps1`. Always call `.venv\Scripts\python.exe` directly.

---

## Launch

### Easiest — double-click

```
start-dev.bat
```

Menu:

| Option | What |
|--------|------|
| **1** | Start API + UI and open the browser once |
| **2** | First-time setup (venv + npm) |
| **3** | Show commands |
| **4** | Health check |
| **5** | Discord VC bot (local only; not in this repo) |
| **6** | Quit — force-closes API/UI terminals and frees ports |

### Manual — two cmd windows

**Window 1 — API**

```bat
cd /d "G:\Discord Bot\DND DM Dice roll bot\apps\api"
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8766 --reload
```

**Window 2 — UI**

```bat
cd /d "G:\Discord Bot\DND DM Dice roll bot\apps\desktop"
npm run dev:ui
```

Open: **http://127.0.0.1:5173**

### Electron (Ctrl+N hotkey)

With API already running in Window 1:

```bat
cd /d "G:\Discord Bot\DND DM Dice roll bot\apps\desktop"
npm run dev
```

Or build then run:

```bat
cd /d "G:\Discord Bot\DND DM Dice roll bot\apps\desktop"
npm run build
npm start
```

---

## If you insist on PowerShell

Don’t activate the venv. Don’t rely on `npm` (it hits `npm.ps1`).

```powershell
cd "G:\Discord Bot\DND DM Dice roll bot\apps\api"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8766 --reload
```

```powershell
cd "G:\Discord Bot\DND DM Dice roll bot\apps\desktop"
npm.cmd run dev:ui
```

Optional (allows scripts for your user only):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## Health check

```bat
curl http://127.0.0.1:8766/health
```

Or in a browser: http://127.0.0.1:8766/health → `{"status":"ok"}`

---

## Using the app

### Party

1. **Upload PDF** — adds a new D&D Beyond character sheet.
2. **Re-upload** — pick which party member to update **before** the file dialog → review a human-readable change list → **Confirm update**.
   - If the PDF looks like a different character, choose **Upload as new character** instead.
3. **Edit sheet** / **Remove** for manual tweaks.

### Rulings

1. Type a situation in **What needs a roll?** → **Resolve check**.
2. A clear rules match skips Ollama. Confidence follows how specific the match is, using the Basic Rules DC ladder (very easy 5 through nearly impossible 30). Words like “easy” or “sheer cliff” move the DC.
3. The result card shows a portrait for everyone the sentence names: the character who is rolling, and each NPC or creature involved. A party member with no uploaded portrait keeps their initials.
4. If the API is not running, the red line says so and clears the previous card, so an old ruling is not left up as if it were the new one.
5. Examples:
   - `Shardon stabs orc A` — attack vs AC (combat foe). Tags need a separator: `Orc A` or `orc-2`.
   - `Shardon tries to kiss Mira` — Persuasion against Mira’s social DC
   - `Shardon persuades the bartender` — Persuasion vs that NPC’s social DC
   - `pet the wolf` — Animal Handling for a beast or mount
   - `Shardon climbs the rope` — Athletics; “easy” / “hard” wording adjusts the DC
6. Voice (optional): **Start listening** while Discord/desktop audio plays → **Ctrl+N** (Electron) or **Ctrl+N capture**.

Social and exploration verbs (kiss, sneak, look around, climb, and the rest of the catalog) map to a skill. An attack verb such as stab, punch, or assault stays an attack when it is the action.

### Map

Open **Map** in the top bar. This is a DM-only battle map for screen share. Players do not get their own client.

| Control | What it does |
|---------|----------------|
| **Upload map** | Sets the background image. The picture fills the current map area. |
| **Map area** | **Squares wide** / **squares tall**, then **Set size**. Each square stays the same pixel size; a larger area adds squares. |
| **Calibrate grid** | Changes pixels per square, offset, and feet per square when a printed grid on the image needs to line up. |
| **+ Scene** | Another map in the same session. |
| **Sync tokens** | Places party, foe, and scene tokens already in the console. |
| **Player preview** | Shows fog the way a shared screen should look. |
| **Vision** | Optional yellow vision and light rings. Off by default. |

Tools along the map: **Select**, **Move map** (or hold Space / middle-mouse), **Ruler**, **Fog**, **Reveal**, **Wall**, **Door**, **Light**, **Portal**. Drag tokens; they snap to the grid. Footprint follows 5e size (Medium is 1 square, Gargantuan is 4).

Token art comes from `packages\token-portraits`. A custom upload in **Pictures** wins. A player character with no portrait stays an initials tile on the map and on the ruling card.

### Pictures

The right rail **Pictures** tab uploads a portrait for a character, scene NPC, or monster. That file is what the map token and the resolve card use.

### XP

Defeat and milestone awards are on the ruling card and the foe list. Party level tracks XP from those awards.

### Right rail — Foes / Scene / Log

The right column uses tabs so you are not scrolling through everything at once:

| Tab | Purpose |
|-----|---------|
| **Foes** | Active combat enemies. **Add foe** opens a modal (filter 322 SRD monsters → Spawn, or Custom monster). |
| **Scene** | Friendly / social cast (bartender, innkeeper, …). **Add NPC** opens a modal (filter → Spawn, or Custom NPC). |
| **Log** | Session memory of past rulings. |

Naming a creature or NPC in the query can also spawn/match them.

### Quit

- In-app **Quit** calls the API shutdown path and force-closes DM API / DM UI terminals (ports 8766 & 5173).
- Or run `scripts\quit-dm.bat` / launcher menu **6**.

---

## Stop

Prefer in-app **Quit** or `start-dev.bat` → **6**.  
Otherwise in each terminal: `Ctrl+C`, or close the window.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Unable to copy ... python.exe` into `.venv` | Close terminals using the API, then `rmdir /s /q .venv` and recreate (setup steps above) |
| Port 8766 / 5173 in use | Run Quit / `scripts\quit-dm.bat`, or close the other API/UI windows |
| UI can’t reach API | The resolve line says the API did not answer. Start the API (`start-dev.bat` option **1**, or the uvicorn command above), then **Resolve check** again |
| CSS / Vite overlay error | Hard-refresh (`Ctrl+F5`); ensure UI terminal is still running |
| `python` not found | Reinstall Python with PATH, or use `py -3` instead of `python` |
| Ollama offline | Install Ollama, run `ollama pull llama3.2`, keep Ollama running |
| Voice buffer empty | Start listening, play Discord audio, then capture |
| Re-upload empty party | Upload a character PDF first |

Using `py -3`:

```bat
cd /d "G:\Discord Bot\DND DM Dice roll bot\apps\api"
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8766 --reload
```

---

## Project layout

| Path | What |
|------|------|
| `apps\api` | FastAPI backend (characters, query, voice, monsters, scene NPCs, battle maps) |
| `apps\desktop` | React + Electron UI (console and map) |
| `packages\rules-dnd5e` | 5e SRD rules, DC ladder, and check-verb guidance |
| `packages\monsters-srd` | All 322 WOTC SRD 5.1 monsters (Open5e; not full DDB) |
| `packages\npcs-srd` | Tavern / scene NPC cast (social DCs, attitudes, portraits) |
| `packages\token-portraits` | Circular token art used on the map and ruling card |
| `scripts\import_open5e_monsters.py` | Re-fetch SRD monster pack |
| `scripts\quit-dm.bat` / `quit-dm.ps1` | Force-close API/UI terminals + free ports |
| `packages\rules-custom-blank` | Template for next game |
| `data\` | SQLite + uploads (runtime; not committed) |
| `fixtures\` | Sample Beyond PDF |
| `start-dev.bat` | One-click launcher |

Discord VC bot code (if present locally) lives under `apps\discord-bot\` and is gitignored — tokens stay on your machine.
