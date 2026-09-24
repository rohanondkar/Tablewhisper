from pathlib import Path
import os

def _env_path(name: str) -> Path | None:
    raw = os.environ.get(name)
    if not raw:
        return None
    return Path(raw)


ROOT = _env_path("TABLEWHISPER_ROOT") or Path(__file__).resolve().parents[3]
DATA_DIR = _env_path("TABLEWHISPER_DATA") or (Path(__file__).resolve().parents[2].parent / "data")
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "dm_console.sqlite3"
RULES_DIR = _env_path("TABLEWHISPER_PACKAGES") or (ROOT / "packages")
DEFAULT_RULESET = "dnd5e-srd"
OLLAMA_BASE = "http://127.0.0.1:11434"
DEFAULT_OLLAMA_MODEL = "llama3.2"
DEFAULT_WHISPER_MODEL = "small"
DEFAULT_BUFFER_SECONDS = 45
API_PORT = int(os.environ.get("DM_API_PORT", "8766"))
