# Tablewhisper

Local DM console for D&D 5e: Beyond PDF sheets, whispered rulings, SRD encounters, optional voice (Ctrl+N) + Ollama. Runs fully local.

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

That window prints **all useful commands**, auto-installs missing `.venv` / `node_modules` if needed, starts API + UI, and opens http://127.0.0.1:5173.

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

1. Start API + UI.
2. Upload D&D Beyond character PDFs (Party panel).
3. Type a situation → **Resolve check**.
4. Voice (optional): **Start listening** while Discord plays → **Ctrl+N** (Electron) or Capture button.
5. Level-up: **Re-upload** or **Edit sheet**.
6. Ruleset dropdown: `dnd5e-srd` now; add packs under `packages\`.

---

## Stop

In each terminal window: `Ctrl+C`, or close the window.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Unable to copy ... python.exe` into `.venv` | Close terminals using the API, then `rmdir /s /q .venv` and recreate (setup steps above) |
| Port 8766 in use | Close the other API window |
| UI can’t reach API | Confirm Window 1 is running uvicorn |
| `python` not found | Reinstall Python with PATH, or use `py -3` instead of `python` |
| Ollama offline | Install Ollama, run `ollama pull llama3.2`, keep Ollama running |
| Voice buffer empty | Start listening, play Discord audio, then capture |

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
| `apps\api` | FastAPI backend |
| `apps\desktop` | React + Electron UI |
| `packages\rules-dnd5e` | 5e SRD rules |
| `packages\monsters-srd` | All 322 WOTC SRD 5.1 monsters (Open5e; not full DDB) |
| `scripts\import_open5e_monsters.py` | Re-fetch SRD monster pack |
| `packages\rules-custom-blank` | Template for next game |
| `data\` | SQLite + uploads (runtime) |
| `fixtures\` | Sample Beyond PDF |
| `start-dev.bat` | One-click API + UI |
