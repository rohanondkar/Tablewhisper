"""A named copy of the party, foes, scene, and log."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from . import db, monsters, npcs
from .config import DATA_DIR

SAVES_DIR = DATA_DIR / "savedata"


def _safe_name(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*]', "", (name or "")).strip().strip(".")
    if not cleaned or cleaned in {".", ".."}:
        raise ValueError("Name the save.")
    return cleaned[:80]


def list_saves() -> list[dict[str, str]]:
    SAVES_DIR.mkdir(parents=True, exist_ok=True)
    found: list[dict[str, str]] = []
    for path in SAVES_DIR.glob("*.json"):
        saved_at = ""
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            saved_at = str(payload.get("saved_at") or "")
        except (OSError, json.JSONDecodeError):
            saved_at = ""
        found.append({"name": path.stem, "saved_at": saved_at})
    found.sort(key=lambda row: row["saved_at"], reverse=True)
    return found


def write_save(name: str) -> dict[str, Any]:
    title = _safe_name(name)
    SAVES_DIR.mkdir(parents=True, exist_ok=True)
    payload = export_active()
    payload["name"] = title
    (SAVES_DIR / f"{title}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"ok": True, "name": title, "saved_at": payload["saved_at"]}


def load_save(name: str) -> dict[str, Any]:
    title = _safe_name(name)
    path = SAVES_DIR / f"{title}.json"
    if not path.is_file():
        raise ValueError(f"No save named {title}.")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("That save could not be read.")
    return restore_active(payload)


def export_active() -> dict[str, Any]:
    sid = db.active_session_id()
    sessions = db.list_sessions()
    name = next((row["name"] for row in sessions if row["id"] == sid), "Session")
    return {
        "kind": "tablewhisper-session",
        "name": name,
        "saved_at": db.utcnow(),
        "characters": [db.public_character(row) for row in db.list_characters()],
        "encounter": monsters.list_encounter(),
        "scene": npcs.list_scene(),
        "events": db.list_events(limit=500),
    }


def restore_active(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("kind") != "tablewhisper-session":
        raise ValueError("That file is not a Tablewhisper session save.")
    restored_characters = 0
    for row in payload.get("characters") or []:
        char_id = row.get("id")
        if not char_id:
            continue
        current = db.get_character(char_id)
        if not current:
            continue
        for key in ("current_hp", "max_hp", "ac", "xp", "temp_hp"):
            if row.get(key) is not None:
                current[key] = row[key]
        db.upsert_character(current)
        restored_characters += 1
    _replace_encounter(payload.get("encounter") or [])
    _replace_scene(payload.get("scene") or [])
    return {
        "ok": True,
        "characters": restored_characters,
        "encounter": len(payload.get("encounter") or []),
        "scene": len(payload.get("scene") or []),
    }


def _replace_encounter(rows: list[dict[str, Any]]) -> None:
    monsters.clear_encounter()
    sid = db.active_session_id()
    with db.db() as conn:
        for row in rows:
            snap = row.get("template") if isinstance(row.get("template"), dict) else {}
            conn.execute(
                """
                INSERT INTO encounter_enemies(
                  id, session_id, label, monster_id, name, ac, max_hp, current_hp, data_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row.get("id") or str(uuid.uuid4()),
                    sid,
                    row.get("label") or row.get("name") or "Foe",
                    row.get("monster_id") or "custom",
                    row.get("name") or row.get("label") or "Foe",
                    int(row.get("ac") or 10),
                    int(row.get("max_hp") or 1),
                    int(row.get("current_hp") or 0),
                    json.dumps(snap),
                    db.utcnow(),
                ),
            )


def _replace_scene(rows: list[dict[str, Any]]) -> None:
    npcs.clear_scene()
    sid = db.active_session_id()
    with db.db() as conn:
        for row in rows:
            snap = row.get("template") if isinstance(row.get("template"), dict) else {}
            conn.execute(
                """
                INSERT INTO scene_npcs(
                  id, session_id, label, npc_id, name, ac, max_hp, current_hp, attitude, data_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row.get("id") or str(uuid.uuid4()),
                    sid,
                    row.get("label") or row.get("name") or "NPC",
                    row.get("npc_id") or "custom",
                    row.get("name") or row.get("label") or "NPC",
                    int(row.get("ac") or 10),
                    int(row.get("max_hp") or 1),
                    int(row.get("current_hp") or 0),
                    row.get("attitude") or "indifferent",
                    json.dumps(snap),
                    db.utcnow(),
                ),
            )
