from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = Path(__file__).resolve().parents[2].parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "dm_console.sqlite3"
RULES_DIR = ROOT / "packages"
DEFAULT_RULESET = "dnd5e-srd"
OLLAMA_BASE = "http://127.0.0.1:11434"
DEFAULT_OLLAMA_MODEL = "llama3.2"
DEFAULT_WHISPER_MODEL = "small"
DEFAULT_BUFFER_SECONDS = 45
API_PORT = int(os.environ.get("DM_API_PORT", "8766"))
