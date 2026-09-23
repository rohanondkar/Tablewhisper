from __future__ import annotations

import os
import shutil
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Any

from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db, ollama_client, query_engine, rules, voice, monsters, npcs, maps, xp as xp_mod
from .config import DATA_DIR, DEFAULT_RULESET, ROOT, UPLOADS_DIR
from .pdf_import import character_diff, format_character_changes, parse_dndbeyond_pdf
from .monsters import CUSTOM_IMAGE_DIR, SRD_IMAGE_DIR
from .npcs import CUSTOM_IMAGE_DIR as NPC_CUSTOM_IMAGE_DIR, SRD_IMAGE_DIR as NPC_SRD_IMAGE_DIR
from .maps import MAP_IMAGE_DIR, MAP_FOG_DIR
from .portraits import CHAR_IMAGE_DIR
from . import gear_images
from .token_art import TOKEN_DIR
from .creature_size import SIZES, normalize_size


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    monsters.ensure_encounter_tables()
    npcs.ensure_scene_tables()
    maps.ensure_map_tables()
    CUSTOM_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    SRD_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    NPC_CUSTOM_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    NPC_SRD_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    MAP_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    MAP_FOG_DIR.mkdir(parents=True, exist_ok=True)
    CHAR_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    monsters.reload_catalog()
    npcs.reload_catalog()
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
# Built-in circular creature / NPC token portraits
TOKEN_DIR.mkdir(parents=True, exist_ok=True)
app.mount(
    "/media/tokens",
    StaticFiles(directory=str(TOKEN_DIR)),
    name="token_portraits",
)
# NPC portraits
NPC_SRD_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
NPC_CUSTOM_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
app.mount(
    "/media/npcs/srd",
    StaticFiles(directory=str(NPC_SRD_IMAGE_DIR)),
    name="npc_srd",
)
app.mount(
    "/media/npcs/custom",
    StaticFiles(directory=str(NPC_CUSTOM_IMAGE_DIR)),
    name="npc_custom",
)
MAP_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
MAP_FOG_DIR.mkdir(parents=True, exist_ok=True)
app.mount(
    "/media/maps/images",
    StaticFiles(directory=str(MAP_IMAGE_DIR)),
    name="map_images",
)
app.mount(
    "/media/maps/fog",
    StaticFiles(directory=str(MAP_FOG_DIR)),
    name="map_fog",
)
CHAR_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
app.mount(
    "/media/characters",
    StaticFiles(directory=str(CHAR_IMAGE_DIR)),
    name="character_images",
)
gear_images.ensure_dirs()
app.mount(
    "/media/gear-stock",
    StaticFiles(directory=str(gear_images.BUNDLED_DIR)),
    name="gear_stock",
)
app.mount(
    "/media/gear",
    StaticFiles(directory=str(gear_images.UPLOAD_DIR)),
    name="gear_uploads",
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
    species: str | None = None
    size: str | None = None
    max_hp: int | None = None
    current_hp: int | None = None
    ac: int | None = None
    equipment: list[dict[str, Any]] | None = None
    proficiency_bonus: int | None = None
    initiative: int | None = None
    abilities: dict[str, Any] | None = None
    skills: dict[str, Any] | None = None
    xp: int | None = None
    milestones: list[str] | None = None
    hand_color: list[int] | None = None


class XpAwardRequest(BaseModel):
    kind: str  # defeat | milestone
    character_ids: list[str]
    xp: int | None = None
    creature_id: str | None = None
    label: str | None = None
    cr: str | None = None
    milestone_id: str | None = None
    milestone_label: str | None = None
    note: str | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    """Lightweight liveness plus a few fields for start-dev option 4."""
    models = []
    try:
        models = ollama_client.list_models()
    except Exception:
        models = []
    audio = voice.status()
    return {
        "status": "ok",
        "api": "ok",
        "port": int(__import__("os").environ.get("DM_API_PORT", "8766")),
        "ollama": "ready" if models else "offline",
        "whisper": "ready" if voice.whisper_available() else "optional",
        "audio": audio.get("source") or ("listening" if audio.get("capturing") else "idle"),
        "audio_source": audio.get("source") or "idle",
        "active_ruleset": db.get_setting("active_ruleset", DEFAULT_RULESET),
    }


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
            "wasapi_capturing": audio.get("wasapi_capturing", False),
            "buffer_seconds": audio["buffer_seconds"],
            "device": audio["device"],
            "source": audio.get("source") or "idle",
            "discord_fresh": bool(audio.get("discord_fresh")),
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
    maps.delete_tokens_by_ref("pc", char_id)
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
    if "hand_color" in patch:
        color = patch.pop("hand_color")
        if isinstance(color, list) and len(color) == 3:
            current["hand_color"] = [max(0, min(255, int(n))) for n in color]
        else:
            current["hand_color"] = None
    if "equipment" in patch:
        proposed = patch.pop("equipment")
        previous = list(current.get("equipment") or [])
        from .equipment import apply_equipment

        apply_equipment(current, proposed, previous)
        patch.pop("ac", None)
    current.update(patch)
    if "size" in patch:
        current["size"] = normalize_size(patch["size"])
    if "level" in patch and "class_level" not in patch:
        # keep class name prefix if present
        class_level = current.get("class_level") or ""
        name_part = class_level.rsplit(" ", 1)[0] if class_level else "Level"
        current["class_level"] = f"{name_part} {patch['level']}"
    return db.public_character(db.upsert_character(current))


@app.post("/characters/{char_id}/image")
async def upload_character_image(char_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    current = db.get_character(char_id)
    if not current:
        raise HTTPException(404, "Character not found")
    CHAR_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "portrait.png").suffix.lower() or ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        ext = ".png"
    fname = f"{char_id}{ext}"
    dest = CHAR_IMAGE_DIR / fname
    for old in CHAR_IMAGE_DIR.glob(f"{char_id}.*"):
        if old.name != fname and old.is_file():
            old.unlink()
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    current["image"] = fname
    updated = db.public_character(db.upsert_character(current))
    try:
        for m in maps.list_maps():
            maps.refresh_token_portraits(m["id"])
    except Exception:
        pass
    return updated


@app.get("/gear-images")
def list_gear_images() -> dict[str, Any]:
    return {"images": gear_images.catalog()}


@app.post("/gear-images")
async def upload_gear_image(name: str = Form(...), file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    ext = Path(file.filename or "gear.png").suffix
    try:
        images = gear_images.save_upload(name, data, ext)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"images": images}


def _place_on_active_map(kind: str, entities: list[dict[str, Any]]) -> None:
    """Best-effort: add map tokens for newly spawned encounter/scene rows."""
    try:
        m = maps.active_map()
        if not m:
            return
        existing = {(t["kind"], t["ref_id"]) for t in maps.list_tokens(m["id"])}
        gs = float(m["grid_size_px"])
        ox = float(m["grid_offset_x"])
        oy = float(m["grid_offset_y"])
        i = 0
        for e in entities:
            key = (kind, e["id"])
            if key in existing:
                continue
            col = i % 8
            row = i // 8
            i += 1
            size = e.get("size") or "Medium"
            maps.add_token(
                m["id"],
                {
                    "kind": kind,
                    "ref_id": e["id"],
                    "label": e.get("label") or e.get("name") or kind,
                    "x": ox + gs * (2 + col),
                    "y": oy + gs * (2 + row),
                    "size": size,
                    "size_sq": e.get("size_sq"),
                    "vision_ft": 60,
                    "show_vision": False,
                    "image_url": e.get("image_url")
                    if kind == "pc"
                    else (
                        e.get("image_url")
                        or (
                            "/media/tokens/token-npc-generic.png"
                            if kind == "npc"
                            else "/media/tokens/token-humanoid.png"
                        )
                    ),
                },
            )
    except Exception:
        pass


@app.post("/xp/award")
def award_xp(body: XpAwardRequest) -> dict[str, Any]:
    kind = (body.kind or "").strip().lower()
    if kind not in {"defeat", "milestone"}:
        raise HTTPException(400, "kind must be defeat or milestone")
    if not body.character_ids:
        raise HTTPException(400, "Select at least one character")

    chars: list[dict[str, Any]] = []
    for cid in body.character_ids:
        c = db.get_character(cid)
        if not c:
            raise HTTPException(404, f"Character not found: {cid}")
        chars.append(xp_mod.ensure_character_progress(c))

    total_xp = body.xp
    milestone_id = body.milestone_id
    milestone_label = body.milestone_label
    label = body.label or "creature"
    cr = body.cr

    if kind == "defeat":
        if total_xp is None:
            tmpl = None
            if body.creature_id:
                enemy = monsters.get_enemy(body.creature_id)
                if enemy:
                    tmpl = enemy.get("template") or {}
                    label = enemy.get("label") or label
                    cr = enemy.get("cr") or cr
                else:
                    scene_n = npcs.get_scene_npc(body.creature_id)
                    if scene_n:
                        tmpl = scene_n.get("template") or {}
                        label = scene_n.get("label") or label
                        cr = scene_n.get("cr") or cr
            total_xp = xp_mod.xp_for_creature(tmpl) if tmpl else xp_mod.xp_for_cr(cr)
        milestone_id = milestone_id or f"defeat:{body.creature_id or label}"
        milestone_label = milestone_label or f"Defeated {label}"
    else:
        mid_kind = milestone_id or "story_beat"
        # Allow full ids like social_charm:mira — base kind is before colon
        base_kind = mid_kind.split(":", 1)[0]
        if total_xp is None:
            total_xp = xp_mod.story_xp_for_kind(base_kind)
        milestone_id = mid_kind
        milestone_label = milestone_label or xp_mod.milestone_label_for_kind(base_kind)

    total_xp = max(0, int(total_xp))
    shares = xp_mod.split_xp(total_xp, len(chars))
    results: list[dict[str, Any]] = []
    skipped_dup = False

    for char, share in zip(chars, shares):
        before = int(char.get("xp") or 0)
        level_before = xp_mod.level_from_xp(before)
        milestones = list(char.get("milestones") or [])
        if milestone_id in milestones:
            skipped_dup = True
            results.append(
                {
                    "id": char["id"],
                    "name": char.get("name"),
                    "xp_before": before,
                    "xp_after": before,
                    "xp_gained": 0,
                    "leveled": False,
                    "duplicate": True,
                    "xp_progress": xp_mod.progress_for_xp(before),
                }
            )
            continue
        after = before + share
        milestones.append(milestone_id)
        char["xp"] = after
        char["milestones"] = milestones
        level_after = xp_mod.level_from_xp(after)
        saved = db.public_character(db.upsert_character(char))
        results.append(
            {
                "id": saved["id"],
                "name": saved.get("name"),
                "xp_before": before,
                "xp_after": after,
                "xp_gained": share,
                "leveled": level_after > level_before,
                "duplicate": False,
                "xp_progress": saved.get("xp_progress"),
            }
        )

    summary = {
        "kind": kind,
        "label": label,
        "cr": cr,
        "total_xp": total_xp,
        "milestone_id": milestone_id,
        "milestone_label": milestone_label,
        "note": body.note,
        "awards": results,
        "check_type": "xp_award",
        "roll_line": (
            f"{'Defeat' if kind == 'defeat' else 'Milestone'}: {milestone_label} "
            f"— {total_xp} XP split among {len(chars)}"
            + (" (already awarded)" if skipped_dup and all(r.get("duplicate") for r in results) else "")
        ),
    }
    db.add_event(
        body.note or milestone_label or f"XP award ({kind})",
        summary,
    )
    return {
        "ok": True,
        "kind": kind,
        "total_xp": total_xp,
        "milestone_id": milestone_id,
        "milestone_label": milestone_label,
        "label": label,
        "cr": cr,
        "characters": [db.public_character(db.get_character(r["id"])) for r in results if r.get("id")],
        "awards": results,
    }


@app.post("/characters/preview")
async def preview_character(
    file: UploadFile = File(...),
    replace_id: str = Form(...),
) -> dict[str, Any]:
    """Parse a PDF against an existing sheet without saving."""
    if not replace_id.strip():
        raise HTTPException(400, "replace_id is required")
    old = db.get_character(replace_id)
    if not old:
        raise HTTPException(404, "Character to update not found")
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Upload a D&D Beyond PDF export")
    dest = UPLOADS_DIR / f"{uuid.uuid4()}_{Path(file.filename).name}"
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    try:
        parsed = parse_dndbeyond_pdf(dest, character_id=replace_id)
    except Exception as exc:
        raise HTTPException(400, f"Failed to parse PDF: {exc}") from exc

    parsed["id"] = replace_id
    raw_diff = character_diff(old, parsed)
    current_name = str(old.get("name") or "")
    parsed_name = str(parsed.get("name") or "")
    return {
        "replace_id": replace_id,
        "current_name": current_name,
        "parsed_name": parsed_name,
        "name_mismatch": bool(
            current_name.strip()
            and parsed_name.strip()
            and current_name.strip().lower() != parsed_name.strip().lower()
        ),
        "changes": format_character_changes(raw_diff),
    }


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
    changes: list[dict[str, str]] | None = None
    if replace_id:
        old = db.get_character(replace_id)
        if not old:
            raise HTTPException(404, "Character to replace not found")
        parsed["id"] = replace_id
        diff = character_diff(old, parsed)
        changes = format_character_changes(diff)
    saved = db.upsert_character(parsed)
    return {
        "character": db.public_character(saved),
        "diff": diff,
        "changes": changes,
    }


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
    cr: str | None = None
    xp: int | None = None
    ac: int | None = None
    hp: int | None = None


class NpcSpawnRequest(BaseModel):
    npc_id: str
    label: str | None = None
    count: int = Field(default=1, ge=1, le=12)
    cr: str | None = None
    xp: int | None = None
    ac: int | None = None
    hp: int | None = None


class EnemyHpPatch(BaseModel):
    current_hp: int
    damage: int | None = None


class SceneNpcPatch(BaseModel):
    current_hp: int | None = None
    damage: int | None = None
    attitude: str | None = None


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


@app.post("/monsters/{monster_id}/image")
async def upload_monster_image(monster_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    CUSTOM_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "token.png").suffix.lower() or ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}:
        ext = ".png"
    fname = f"{monster_id}{ext}"
    dest = CUSTOM_IMAGE_DIR / fname
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    try:
        return monsters.set_monster_image(monster_id, fname)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/encounter")
def get_encounter() -> list[dict[str, Any]]:
    return monsters.list_encounter()


@app.post("/encounter/spawn")
def spawn_encounter(body: SpawnRequest) -> list[dict[str, Any]]:
    try:
        spawned = monsters.spawn_enemy(
            body.monster_id,
            label=body.label,
            count=body.count,
            cr=body.cr,
            xp=body.xp,
            ac=body.ac,
            hp=body.hp,
        )
        _place_on_active_map("enemy", spawned)
        return spawned
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
    maps.delete_tokens_by_ref("enemy", enemy_id)
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


@app.get("/npcs")
def npc_catalog() -> list[dict[str, Any]]:
    return npcs.list_templates()


@app.post("/npcs/custom")
async def add_custom_npc(
    name: str = Form(...),
    ac: int = Form(12),
    hp: int = Form(10),
    attitude: str = Form("indifferent"),
    role: str = Form(""),
    size: str = Form("Medium"),
    image: UploadFile | None = File(None),
) -> dict[str, Any]:
    mid = name.lower().replace(" ", "-")
    data: dict[str, Any] = {
        "id": mid,
        "name": name,
        "ac": ac,
        "hp": hp,
        "size": normalize_size(size),
        "aliases": [],
        "attitude": attitude or "indifferent",
        "role": role or "Custom NPC",
        "social": {
            "persuasion_dc": 13,
            "deception_dc": 13,
            "intimidation_dc": 13,
            "insight_dc": 13,
        },
        "attacks": [],
    }
    if image and image.filename:
        NPC_CUSTOM_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
        ext = Path(image.filename).suffix.lower() or ".png"
        if ext not in {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}:
            ext = ".png"
        fname = f"{mid}{ext}"
        dest = NPC_CUSTOM_IMAGE_DIR / fname
        with dest.open("wb") as out:
            shutil.copyfileobj(image.file, out)
        data["image"] = fname
    else:
        data["image"] = "tokens/token_00.jpg"
    try:
        return npcs.save_custom_npc(data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/npcs/{npc_id}/image")
async def upload_npc_image(npc_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    NPC_CUSTOM_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "token.png").suffix.lower() or ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}:
        ext = ".png"
    fname = f"{npc_id}{ext}"
    dest = NPC_CUSTOM_IMAGE_DIR / fname
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    try:
        return npcs.set_npc_image(npc_id, fname)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/scene")
def get_scene() -> list[dict[str, Any]]:
    return npcs.list_scene()


@app.post("/scene/spawn")
def spawn_scene(body: NpcSpawnRequest) -> list[dict[str, Any]]:
    try:
        spawned = npcs.spawn_npc(
            body.npc_id,
            label=body.label,
            count=body.count,
            cr=body.cr,
            xp=body.xp,
            ac=body.ac,
            hp=body.hp,
        )
        _place_on_active_map("npc", spawned)
        return spawned
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.delete("/scene")
def clear_scene_route() -> dict[str, bool]:
    npcs.clear_scene()
    return {"ok": True}


@app.delete("/scene/{npc_instance_id}")
def delete_scene_npc(npc_instance_id: str) -> dict[str, bool]:
    if not npcs.remove_scene_npc(npc_instance_id):
        raise HTTPException(404, "Scene NPC not found")
    maps.delete_tokens_by_ref("npc", npc_instance_id)
    return {"ok": True}


@app.patch("/scene/{npc_instance_id}")
def patch_scene_npc(npc_instance_id: str, body: SceneNpcPatch) -> dict[str, Any]:
    npc = npcs.get_scene_npc(npc_instance_id)
    if not npc:
        raise HTTPException(404, "Scene NPC not found")
    new_hp = npc["current_hp"]
    if body.damage is not None:
        new_hp = npc["current_hp"] - int(body.damage)
    elif body.current_hp is not None:
        new_hp = body.current_hp
    updated = npcs.update_scene_npc(
        npc_instance_id,
        current_hp=new_hp,
        attitude=body.attitude,
    )
    assert updated is not None
    return updated


# ----- Battle maps -----


class MapCreate(BaseModel):
    name: str = "Map"


class MapPatch(BaseModel):
    name: str | None = None
    width: float | None = None
    height: float | None = None
    grid_size_px: float | None = None
    grid_offset_x: float | None = None
    grid_offset_y: float | None = None
    feet_per_square: float | None = None
    show_grid_overlay: bool | None = None


class TokenBody(BaseModel):
    kind: str = "custom"
    ref_id: str | None = None
    label: str = "Token"
    x: float = 0
    y: float = 0
    rotation: float = 0
    size: str | None = "Medium"
    size_sq: float | None = None
    vision_ft: float | None = 60
    light_bright_ft: float | None = 0
    light_dim_ft: float | None = 0
    show_vision: bool | None = True
    image_url: str | None = None
    data: dict[str, Any] | None = None


class TokenPatch(BaseModel):
    label: str | None = None
    x: float | None = None
    y: float | None = None
    rotation: float | None = None
    size: str | None = None
    size_sq: float | None = None
    vision_ft: float | None = None
    light_bright_ft: float | None = None
    light_dim_ft: float | None = None
    show_vision: bool | None = None
    image_url: str | None = None


class WallBody(BaseModel):
    points: list[float]
    door: bool = False
    door_open: bool = False
    block_movement: bool = True
    block_sight: bool = True


class WallPatch(BaseModel):
    points: list[float] | None = None
    door: bool | None = None
    door_open: bool | None = None
    block_movement: bool | None = None
    block_sight: bool | None = None


class LightBody(BaseModel):
    x: float = 0
    y: float = 0
    bright_ft: float = 20
    dim_ft: float = 20


class LightPatch(BaseModel):
    x: float | None = None
    y: float | None = None
    bright_ft: float | None = None
    dim_ft: float | None = None


class PortalBody(BaseModel):
    x: float = 0
    y: float = 0
    radius: float = 40
    target_map_id: str
    target_x: float = 0
    target_y: float = 0
    label: str = "Portal"


class PortalPatch(BaseModel):
    x: float | None = None
    y: float | None = None
    radius: float | None = None
    target_map_id: str | None = None
    target_x: float | None = None
    target_y: float | None = None
    label: str | None = None


class TraverseBody(BaseModel):
    token_ids: list[str] = Field(default_factory=list)


@app.get("/maps")
def get_maps() -> list[dict[str, Any]]:
    return maps.list_maps()


@app.post("/maps")
def post_map(body: MapCreate) -> dict[str, Any]:
    return maps.create_map(body.name)


@app.get("/maps/active")
def get_active_map() -> dict[str, Any]:
    m = maps.active_map()
    if not m:
        raise HTTPException(404, "No map yet")
    state = maps.full_map_state(m["id"])
    assert state is not None
    return state


@app.get("/maps/{map_id}")
def get_map_state(map_id: str) -> dict[str, Any]:
    state = maps.full_map_state(map_id)
    if not state:
        raise HTTPException(404, "Map not found")
    return state


@app.post("/maps/{map_id}/activate")
def activate_map_route(map_id: str) -> dict[str, Any]:
    m = maps.activate_map(map_id)
    if not m:
        raise HTTPException(404, "Map not found")
    return maps.full_map_state(map_id)  # type: ignore[return-value]


@app.patch("/maps/{map_id}")
def patch_map_route(map_id: str, body: MapPatch) -> dict[str, Any]:
    m = maps.patch_map(map_id, body.model_dump(exclude_none=True))
    if not m:
        raise HTTPException(404, "Map not found")
    return m


@app.delete("/maps/{map_id}")
def delete_map_route(map_id: str) -> dict[str, bool]:
    if not maps.delete_map(map_id):
        raise HTTPException(404, "Map not found")
    return {"ok": True}


@app.post("/maps/{map_id}/background")
async def upload_map_background(
    map_id: str,
    file: UploadFile = File(...),
    width: float | None = Form(None),
    height: float | None = Form(None),
) -> dict[str, Any]:
    if not maps.get_map(map_id):
        raise HTTPException(404, "Map not found")
    MAP_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = MAP_IMAGE_DIR / f"_tmp_{uuid.uuid4().hex}"
    with tmp.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    try:
        m = maps.set_background(
            map_id,
            tmp,
            file.filename or "map.png",
            width=width,
            height=height,
        )
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
    if not m:
        raise HTTPException(404, "Map not found")
    return m


@app.post("/maps/{map_id}/tokens/sync")
def sync_map_tokens(map_id: str) -> list[dict[str, Any]]:
    try:
        return maps.sync_tokens(map_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/maps/{map_id}/tokens")
def get_map_tokens(map_id: str) -> list[dict[str, Any]]:
    if not maps.get_map(map_id):
        raise HTTPException(404, "Map not found")
    return maps.list_tokens(map_id)


@app.post("/maps/{map_id}/tokens")
def post_map_token(map_id: str, body: TokenBody) -> dict[str, Any]:
    try:
        # exclude_unset so omitted image_url gets kind-based defaults (PC = none).
        return maps.add_token(map_id, body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.patch("/maps/tokens/{token_id}")
def patch_map_token(token_id: str, body: TokenPatch) -> dict[str, Any]:
    t = maps.patch_token(token_id, body.model_dump(exclude_none=True))
    if not t:
        raise HTTPException(404, "Token not found")
    return t


@app.delete("/maps/tokens/{token_id}")
def delete_map_token(token_id: str) -> dict[str, bool]:
    if not maps.delete_token(token_id):
        raise HTTPException(404, "Token not found")
    return {"ok": True}


@app.get("/maps/{map_id}/walls")
def get_walls(map_id: str) -> list[dict[str, Any]]:
    return maps.list_walls(map_id)


@app.post("/maps/{map_id}/walls")
def post_wall(map_id: str, body: WallBody) -> dict[str, Any]:
    try:
        return maps.add_wall(map_id, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.patch("/maps/walls/{wall_id}")
def patch_wall_route(wall_id: str, body: WallPatch) -> dict[str, Any]:
    w = maps.patch_wall(wall_id, body.model_dump(exclude_none=True))
    if not w:
        raise HTTPException(404, "Wall not found")
    return w


@app.delete("/maps/walls/{wall_id}")
def delete_wall_route(wall_id: str) -> dict[str, bool]:
    if not maps.delete_wall(wall_id):
        raise HTTPException(404, "Wall not found")
    return {"ok": True}


@app.get("/maps/{map_id}/lights")
def get_lights(map_id: str) -> list[dict[str, Any]]:
    return maps.list_lights(map_id)


@app.post("/maps/{map_id}/lights")
def post_light(map_id: str, body: LightBody) -> dict[str, Any]:
    try:
        return maps.add_light(map_id, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.patch("/maps/lights/{light_id}")
def patch_light_route(light_id: str, body: LightPatch) -> dict[str, Any]:
    L = maps.patch_light(light_id, body.model_dump(exclude_none=True))
    if not L:
        raise HTTPException(404, "Light not found")
    return L


@app.delete("/maps/lights/{light_id}")
def delete_light_route(light_id: str) -> dict[str, bool]:
    if not maps.delete_light(light_id):
        raise HTTPException(404, "Light not found")
    return {"ok": True}


@app.post("/maps/{map_id}/fog")
async def upload_fog(map_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    try:
        return maps.save_fog_mask(map_id, data)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/maps/{map_id}/fog/reset")
def fog_reset(map_id: str) -> dict[str, Any]:
    m = maps.reset_fog(map_id)
    if not m:
        raise HTTPException(404, "Map not found")
    return m


@app.get("/maps/{map_id}/portals")
def get_portals(map_id: str) -> list[dict[str, Any]]:
    return maps.list_portals(map_id)


@app.post("/maps/{map_id}/portals")
def post_portal(map_id: str, body: PortalBody) -> dict[str, Any]:
    try:
        return maps.add_portal(map_id, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.patch("/maps/portals/{portal_id}")
def patch_portal_route(portal_id: str, body: PortalPatch) -> dict[str, Any]:
    p = maps.patch_portal(portal_id, body.model_dump(exclude_none=True))
    if not p:
        raise HTTPException(404, "Portal not found")
    return p


@app.delete("/maps/portals/{portal_id}")
def delete_portal_route(portal_id: str) -> dict[str, bool]:
    if not maps.delete_portal(portal_id):
        raise HTTPException(404, "Portal not found")
    return {"ok": True}


@app.post("/maps/portals/{portal_id}/traverse")
def traverse_portal_route(portal_id: str, body: TraverseBody) -> dict[str, Any]:
    try:
        return maps.traverse_portal(portal_id, body.token_ids)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/creature-sizes")
def creature_sizes() -> dict[str, Any]:
    from .creature_size import SIZE_TO_SQUARES

    return {"sizes": list(SIZES), "squares": SIZE_TO_SQUARES}


@app.post("/voice/start")
def voice_start() -> dict[str, Any]:
    try:
        return {"ok": True, **voice.start_capture()}
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@app.post("/voice/stop")
def voice_stop() -> dict[str, Any]:
    return {"ok": True, **voice.stop_capture()}


class DiscordIngestJson(BaseModel):
    pcm_b64: str
    sample_rate: int = 16000


def _client_is_local(request: Request) -> bool:
    host = (request.client.host if request.client else "") or ""
    return host in {"127.0.0.1", "::1", "localhost", "testclient"}


@app.post("/voice/discord/ingest")
async def discord_ingest(request: Request) -> dict[str, Any]:
    """
    Accept PCM from the local Discord bot into the Whisper ring buffer.
    Localhost only unless DM_ALLOW_REMOTE_INGEST=1.
    """
    if not _client_is_local(request) and not voice.allow_remote_ingest():
        raise HTTPException(403, "Discord ingest is localhost-only")

    ctype = (request.headers.get("content-type") or "").lower()
    sample_rate = 16000
    try:
        if "application/json" in ctype:
            body = DiscordIngestJson.model_validate(await request.json())
            import base64

            pcm = base64.b64decode(body.pcm_b64)
            sample_rate = int(body.sample_rate or 16000)
        else:
            pcm = await request.body()
            sr_header = request.headers.get("x-sample-rate")
            if sr_header:
                sample_rate = int(sr_header)
    except Exception as exc:
        raise HTTPException(400, f"Invalid ingest payload: {exc}") from exc

    try:
        return {"ok": True, **voice.ingest_discord_pcm(pcm, sample_rate=sample_rate)}
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@app.post("/voice/capture")
def voice_capture() -> dict[str, Any]:
    try:
        st = voice.status()
        if not st["capturing"] and not st.get("discord_fresh"):
            voice.start_capture()
        transcript = voice.transcribe_buffer()
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc
    if not transcript:
        raise HTTPException(400, "No speech detected in the recent audio buffer")
    result = query_engine.resolve_query(transcript)
    return {"transcript": transcript, "result": result}


def _run_quit_script() -> Path | None:
    script = ROOT / "scripts" / "quit-dm.bat"
    ps1 = ROOT / "scripts" / "quit-dm.ps1"
    if not script.exists() and not ps1.exists():
        return None
    creationflags = 0
    if os.name == "nt":
        # New console group, hidden — must not die with the API process.
        creationflags = (
            getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            | getattr(subprocess, "DETACHED_PROCESS", 0)
            | getattr(subprocess, "CREATE_NO_WINDOW", 0)
        )
    # Prefer PowerShell directly (more reliable force-kill than nested cmd).
    if ps1.exists():
        subprocess.Popen(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ps1),
            ],
            cwd=str(ROOT),
            creationflags=creationflags,
            close_fds=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return ps1
    subprocess.Popen(
        ["cmd", "/c", str(script)],
        cwd=str(ROOT),
        creationflags=creationflags,
        close_fds=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return script


@app.post("/shutdown")
def shutdown_stack() -> dict[str, Any]:
    """
    Force-close API + Vite + Discord terminals and free ports.
    Safe to call from the browser Quit button when Electron is not running.
    """
    script = _run_quit_script()

    def _exit_soon() -> None:
        import time

        # Let the force-quit script start before this process vanishes.
        time.sleep(1.2)
        os._exit(0)

    threading.Thread(target=_exit_soon, daemon=True).start()
    return {"ok": True, "script": str(script) if script else None}
