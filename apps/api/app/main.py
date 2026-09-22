from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Any

from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db, ollama_client, query_engine, rules, voice, monsters
from .config import DATA_DIR, DEFAULT_RULESET, UPLOADS_DIR
from .pdf_import import character_diff, parse_dndbeyond_pdf
from .monsters import CUSTOM_IMAGE_DIR, SRD_IMAGE_DIR


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    monsters.ensure_encounter_tables()
    CUSTOM_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    SRD_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="DM Console API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Monster portraits: /media/monsters/srd/... and /media/monsters/custom/...
app.mount(
    "/media/monsters/srd",
    StaticFiles(directory=str(SRD_IMAGE_DIR)),
    name="monster_srd",
)
app.mount(
    "/media/monsters/custom",
    StaticFiles(directory=str(CUSTOM_IMAGE_DIR)),
    name="monster_custom",
)


class QueryRequest(BaseModel):
    text: str
    character_id: str | None = None


class SettingsPatch(BaseModel):
    ollama_model: str | None = None
    whisper_model: str | None = None
    buffer_seconds: int | None = Field(default=None, ge=10, le=180)
    hotkey: str | None = None
    active_ruleset: str | None = None


class CharacterPatch(BaseModel):
    name: str | None = None
    level: int | None = None
    class_level: str | None = None
    max_hp: int | None = None
    current_hp: int | None = None
    ac: int | None = None
    proficiency_bonus: int | None = None
    initiative: int | None = None
    abilities: dict[str, Any] | None = None
    skills: dict[str, Any] | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/status")
def status() -> dict[str, Any]:
    models = ollama_client.list_models()
    audio = voice.status()
    return {
        "api": "ok",
        "ollama": {
            "available": bool(models),
            "model": ollama_client.preferred_model(),
            "models": models,
        },
        "whisper": {
            "available": voice.whisper_available(),
            "model": audio["whisper_model"],
        },
        "audio": {
            "capturing": audio["capturing"],
            "buffer_seconds": audio["buffer_seconds"],
            "device": audio["device"],
        },
        "active_ruleset": db.get_setting("active_ruleset", DEFAULT_RULESET),
        "active_session_id": db.active_session_id(),
    }


@app.get("/settings")
def get_settings() -> dict[str, Any]:
    return db.get_settings()


@app.patch("/settings")
def patch_settings(body: SettingsPatch) -> dict[str, Any]:
    data = body.model_dump(exclude_none=True)
    if "active_ruleset" in data:
        rules.set_active_ruleset(data.pop("active_ruleset"))
    for key, value in data.items():
        db.set_setting(key, str(value))
    return db.get_settings()


@app.get("/rulesets")
def get_rulesets() -> list[dict[str, Any]]:
    return rules.list_rulesets()


@app.post("/rulesets/{ruleset_id}/activate")
def activate_ruleset(ruleset_id: str) -> dict[str, Any]:
    try:
        active = rules.set_active_ruleset(ruleset_id)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ok": True, "active": active}


@app.get("/characters")
def characters() -> list[dict[str, Any]]:
    return [db.public_character(c) for c in db.list_characters()]


@app.get("/characters/{char_id}")
def character(char_id: str) -> dict[str, Any]:
    row = db.get_character(char_id)
    if not row:
        raise HTTPException(404, "Character not found")
    return db.public_character(row)


@app.delete("/characters/{char_id}")
def remove_character(char_id: str) -> dict[str, bool]:
    ok = db.delete_character(char_id)
    if not ok:
        raise HTTPException(404, "Character not found")
    return {"ok": True}


@app.patch("/characters/{char_id}")
def patch_character(char_id: str, body: CharacterPatch) -> dict[str, Any]:
    current = db.get_character(char_id)
    if not current:
        raise HTTPException(404, "Character not found")
    patch = body.model_dump(exclude_none=True)
    if "abilities" in patch and isinstance(patch["abilities"], dict):
        merged = dict(current.get("abilities") or {})
        merged.update(patch.pop("abilities"))
        current["abilities"] = merged
    if "skills" in patch and isinstance(patch["skills"], dict):
        merged_skills = dict(current.get("skills") or {})
        for sid, sval in patch.pop("skills").items():
            base = dict(merged_skills.get(sid) or {})
            base.update(sval)
            merged_skills[sid] = base
        current["skills"] = merged_skills
    current.update(patch)
    if "level" in patch and "class_level" not in patch:
        # keep class name prefix if present
        class_level = current.get("class_level") or ""
        name_part = class_level.rsplit(" ", 1)[0] if class_level else "Level"
        current["class_level"] = f"{name_part} {patch['level']}"
    return db.public_character(db.upsert_character(current))


@app.post("/characters/upload")
async def upload_character(
    file: UploadFile = File(...),
    replace_id: str | None = Form(default=None),
) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Upload a D&D Beyond PDF export")
    dest = UPLOADS_DIR / f"{uuid.uuid4()}_{Path(file.filename).name}"
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    try:
        parsed = parse_dndbeyond_pdf(dest, character_id=replace_id)
    except Exception as exc:
        raise HTTPException(400, f"Failed to parse PDF: {exc}") from exc

    diff = None
    if replace_id:
        old = db.get_character(replace_id)
        if not old:
            raise HTTPException(404, "Character to replace not found")
        parsed["id"] = replace_id
        diff = character_diff(old, parsed)
    saved = db.upsert_character(parsed)
    return {"character": db.public_character(saved), "diff": diff}


@app.post("/query")
def query(body: QueryRequest) -> dict[str, Any]:
    if not body.text.strip():
        raise HTTPException(400, "Query text required")
    return query_engine.resolve_query(body.text.strip(), body.character_id)


class SessionCreate(BaseModel):
    name: str | None = None


class SessionRename(BaseModel):
    name: str


@app.get("/sessions")
def get_sessions() -> list[dict[str, Any]]:
    return db.list_sessions()


@app.post("/sessions")
def create_session(body: SessionCreate | None = None) -> dict[str, Any]:
    name = body.name if body else None
    return db.new_session(name)


@app.post("/sessions/{session_id}/activate")
def activate_session(session_id: str) -> dict[str, Any]:
    row = db.activate_session(session_id)
    if not row:
        raise HTTPException(404, "Session not found")
    return row


@app.patch("/sessions/{session_id}")
def rename_session(session_id: str, body: SessionRename) -> dict[str, Any]:
    row = db.rename_session(session_id, body.name)
    if not row:
        raise HTTPException(404, "Session not found")
    return row


@app.delete("/sessions/{session_id}")
def remove_session(session_id: str) -> dict[str, bool]:
    if not db.delete_session(session_id):
        raise HTTPException(400, "Cannot delete the only session")
    return {"ok": True}


@app.get("/sessions/active/events")
def session_events() -> list[dict[str, Any]]:
    return db.list_events()


class SpawnRequest(BaseModel):
    monster_id: str
    label: str | None = None
    count: int = Field(default=1, ge=1, le=12)


class EnemyHpPatch(BaseModel):
    current_hp: int
    damage: int | None = None


class CustomMonsterBody(BaseModel):
    id: str | None = None
    name: str
    ac: int = 10
    hp: int = 10
    aliases: list[str] = []
    cr: str | None = None
    notes: str | None = None
    attacks: list[dict[str, Any]] = []


@app.get("/monsters")
def monster_catalog() -> list[dict[str, Any]]:
    return monsters.list_templates()


@app.post("/monsters/custom")
async def add_custom_monster(
    name: str = Form(...),
    ac: int = Form(10),
    hp: int = Form(10),
    image: UploadFile | None = File(None),
) -> dict[str, Any]:
    mid = name.lower().replace(" ", "-")
    data: dict[str, Any] = {
        "id": mid,
        "name": name,
        "ac": ac,
        "hp": hp,
        "aliases": [],
        "attacks": [],
    }
    if image and image.filename:
        CUSTOM_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
        ext = Path(image.filename).suffix.lower() or ".png"
        if ext not in {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}:
            ext = ".png"
        fname = f"{mid}{ext}"
        dest = CUSTOM_IMAGE_DIR / fname
        with dest.open("wb") as out:
            shutil.copyfileobj(image.file, out)
        data["image"] = fname
    else:
        data["image"] = "generic.svg"
    try:
        return monsters.save_custom_monster(data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/encounter")
def get_encounter() -> list[dict[str, Any]]:
    return monsters.list_encounter()


@app.post("/encounter/spawn")
def spawn_encounter(body: SpawnRequest) -> list[dict[str, Any]]:
    try:
        return monsters.spawn_enemy(body.monster_id, label=body.label, count=body.count)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.delete("/encounter")
def clear_encounter() -> dict[str, bool]:
    monsters.clear_encounter()
    return {"ok": True}


@app.delete("/encounter/{enemy_id}")
def delete_enemy(enemy_id: str) -> dict[str, bool]:
    if not monsters.remove_enemy(enemy_id):
        raise HTTPException(404, "Enemy not found")
    return {"ok": True}


@app.patch("/encounter/{enemy_id}")
def patch_enemy_hp(enemy_id: str, body: EnemyHpPatch) -> dict[str, Any]:
    enemy = monsters.get_enemy(enemy_id)
    if not enemy:
        raise HTTPException(404, "Enemy not found")
    if body.damage is not None:
        new_hp = enemy["current_hp"] - int(body.damage)
    else:
        new_hp = body.current_hp
    updated = monsters.update_enemy_hp(enemy_id, new_hp)
    assert updated is not None
    return updated


@app.post("/voice/start")
def voice_start() -> dict[str, Any]:
    try:
        return {"ok": True, **voice.start_capture()}
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@app.post("/voice/stop")
def voice_stop() -> dict[str, Any]:
    return {"ok": True, **voice.stop_capture()}


@app.post("/voice/capture")
def voice_capture() -> dict[str, Any]:
    try:
        if not voice.status()["capturing"]:
            voice.start_capture()
        transcript = voice.transcribe_buffer()
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc
    if not transcript:
        raise HTTPException(400, "No speech detected in the recent audio buffer")
    result = query_engine.resolve_query(transcript)
    return {"transcript": transcript, "result": result}
