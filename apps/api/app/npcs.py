"""NPC catalog + session scene instances (tavern cast, etc.)."""

from __future__ import annotations

import json
import re
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import DATA_DIR, RULES_DIR
from . import db

MEDIA_NPCS = "/media/npcs"
CUSTOM_IMAGE_DIR = DATA_DIR / "npc_images"
SRD_IMAGE_DIR = RULES_DIR / "npcs-srd" / "images"


def _catalog_paths() -> list[Path]:
    paths = [
        RULES_DIR / "npcs-srd" / "npcs.json",
        RULES_DIR / "npcs-custom" / "npcs.json",
    ]
    return [p for p in paths if p.exists()]


@lru_cache(maxsize=4)
def _load_all_npcs() -> dict[str, dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for path in _catalog_paths():
        data = json.loads(path.read_text(encoding="utf-8"))
        for n in data.get("npcs", []):
            by_id[n["id"]] = n
    return by_id


def reload_catalog() -> None:
    _load_all_npcs.cache_clear()


def image_url_for(npc: dict[str, Any]) -> str:
    mid = npc.get("id") or "generic"
    image = npc.get("image") or f"{mid}.svg"
    custom = CUSTOM_IMAGE_DIR / image
    srd = SRD_IMAGE_DIR / image
    srd_by_id = SRD_IMAGE_DIR / f"{mid}.svg"
    if custom.exists():
        return f"{MEDIA_NPCS}/custom/{image}"
    if srd.exists():
        return f"{MEDIA_NPCS}/srd/{image}"
    if srd_by_id.exists():
        return f"{MEDIA_NPCS}/srd/{mid}.svg"
    return f"{MEDIA_NPCS}/srd/generic.svg"


def with_image(npc: dict[str, Any]) -> dict[str, Any]:
    out = dict(npc)
    out["image_url"] = image_url_for(npc)
    return out


def list_templates() -> list[dict[str, Any]]:
    items = [with_image(n) for n in _load_all_npcs().values()]
    items.sort(key=lambda n: n.get("name", "").lower())
    return items


def get_template(npc_id: str) -> dict[str, Any] | None:
    n = _load_all_npcs().get(npc_id)
    return with_image(n) if n else None


def find_template_by_name(text: str) -> dict[str, Any] | None:
    lowered = text.lower()
    best = None
    best_score = 0
    for n in _load_all_npcs().values():
        names = [n.get("name", "")] + list(n.get("aliases") or [])
        for name in names:
            nm = name.lower().strip()
            if not nm:
                continue
            score = 0
            if re.search(rf"\b{re.escape(nm)}\b", lowered):
                score = 10 + len(nm)
            elif nm in lowered:
                score = 5 + len(nm)
            if score > best_score:
                best_score = score
                best = n
    return best if best_score > 0 else None


_LABEL_RE = re.compile(
    r"\b([a-z][a-z\- ]{1,30}?)\s*[- ]?\s*([a-z]|\d+)\b",
    re.IGNORECASE,
)


def parse_npc_mention(text: str) -> dict[str, Any] | None:
    lowered = text.lower()
    for m in _LABEL_RE.finditer(lowered):
        raw_name = m.group(1).strip()
        tag = m.group(2).upper()
        if raw_name in {"with", "his", "her", "the", "and", "vs", "ac"}:
            continue
        template = find_template_by_name(raw_name)
        if not template:
            continue
        label = f"{template['name']} {tag}"
        return {"template": template, "label": label, "tag": tag, "span": m.group(0)}

    template = find_template_by_name(lowered)
    if not template:
        return None
    return {
        "template": template,
        "label": template["name"],
        "tag": None,
        "span": template["name"].lower(),
    }


def ensure_scene_tables() -> None:
    with db.db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS custom_npcs (
              id TEXT PRIMARY KEY,
              data_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scene_npcs (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              label TEXT NOT NULL,
              npc_id TEXT NOT NULL,
              name TEXT NOT NULL,
              ac INTEGER NOT NULL,
              max_hp INTEGER NOT NULL,
              current_hp INTEGER NOT NULL,
              attitude TEXT,
              data_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            """
        )


def save_custom_npc(data: dict[str, Any]) -> dict[str, Any]:
    ensure_scene_tables()
    mid = data.get("id") or data["name"].lower().replace(" ", "-")
    data = dict(data)
    data["id"] = mid
    data["kind"] = "npc"
    if not data.get("name"):
        raise ValueError("Custom NPC needs a name")
    data.setdefault("ac", 10)
    data.setdefault("hp", 10)
    data.setdefault("aliases", [])
    data.setdefault("attacks", [])
    data.setdefault("attitude", "indifferent")
    data.setdefault("role", "")
    data.setdefault("location_tags", ["custom"])
    data.setdefault(
        "social",
        {
            "insight_dc": 12,
            "persuasion_dc": 12,
            "deception_dc": 12,
            "intimidation_dc": 12,
            "notes": data.get("notes") or "",
        },
    )
    with db.db() as conn:
        conn.execute(
            "INSERT INTO custom_npcs(id, data_json) VALUES(?, ?) "
            "ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json",
            (mid, json.dumps(data)),
        )
    custom_dir = RULES_DIR / "npcs-custom"
    custom_dir.mkdir(parents=True, exist_ok=True)
    custom_file = custom_dir / "npcs.json"
    pack: dict[str, Any] = {
        "id": "npcs-custom",
        "name": "Custom NPCs",
        "version": "1.0.0",
        "npcs": [],
    }
    if custom_file.exists():
        pack = json.loads(custom_file.read_text(encoding="utf-8"))
    items = [n for n in pack.get("npcs", []) if n.get("id") != mid]
    items.append(data)
    pack["npcs"] = items
    custom_file.write_text(json.dumps(pack, indent=2), encoding="utf-8")
    reload_catalog()
    return with_image(data)


def list_scene() -> list[dict[str, Any]]:
    ensure_scene_tables()
    sid = db.active_session_id()
    with db.db() as conn:
        rows = conn.execute(
            """
            SELECT id, label, npc_id, name, ac, max_hp, current_hp, attitude, data_json
            FROM scene_npcs
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (sid,),
        ).fetchall()
        out = []
        for r in rows:
            tmpl = json.loads(r["data_json"])
            out.append(
                {
                    "id": r["id"],
                    "label": r["label"],
                    "npc_id": r["npc_id"],
                    "name": r["name"],
                    "ac": r["ac"],
                    "max_hp": r["max_hp"],
                    "current_hp": r["current_hp"],
                    "attitude": r["attitude"] or tmpl.get("attitude") or "indifferent",
                    "kind": "npc",
                    "template": with_image(tmpl),
                    "image_url": image_url_for(tmpl),
                }
            )
        return out


def get_scene_npc(npc_instance_id: str) -> dict[str, Any] | None:
    ensure_scene_tables()
    with db.db() as conn:
        r = conn.execute(
            "SELECT id, label, npc_id, name, ac, max_hp, current_hp, attitude, data_json "
            "FROM scene_npcs WHERE id = ?",
            (npc_instance_id,),
        ).fetchone()
        if not r:
            return None
        tmpl = json.loads(r["data_json"])
        return {
            "id": r["id"],
            "label": r["label"],
            "npc_id": r["npc_id"],
            "name": r["name"],
            "ac": r["ac"],
            "max_hp": r["max_hp"],
            "current_hp": r["current_hp"],
            "attitude": r["attitude"] or tmpl.get("attitude") or "indifferent",
            "kind": "npc",
            "template": with_image(tmpl),
            "image_url": image_url_for(tmpl),
        }


def find_scene_by_label(label: str) -> dict[str, Any] | None:
    label_l = label.lower().strip()
    for e in list_scene():
        if e["label"].lower() == label_l:
            return e
    return None


def spawn_npc(
    npc_id: str,
    label: str | None = None,
    count: int = 1,
) -> list[dict[str, Any]]:
    ensure_scene_tables()
    template = get_template(npc_id)
    if not template:
        raise ValueError(f"Unknown NPC: {npc_id}")
    sid = db.active_session_id()
    existing = list_scene()
    spawned: list[dict[str, Any]] = []
    for i in range(max(1, count)):
        if label and count == 1:
            use_label = label
        else:
            used = {e["label"].lower() for e in existing + spawned}
            # Prefer bare name once, then Name A, B...
            if template["name"].lower() not in used and not label:
                use_label = template["name"]
            else:
                letter = None
                for code in range(ord("A"), ord("Z") + 1):
                    candidate = f"{template['name']} {chr(code)}"
                    if candidate.lower() not in used:
                        letter = chr(code)
                        break
                use_label = f"{template['name']} {letter or i + 1}"
        eid = str(uuid.uuid4())
        attitude = template.get("attitude") or "indifferent"
        row = {
            "id": eid,
            "label": use_label,
            "npc_id": template["id"],
            "name": template["name"],
            "ac": int(template["ac"]),
            "max_hp": int(template["hp"]),
            "current_hp": int(template["hp"]),
            "attitude": attitude,
            "kind": "npc",
            "template": template,
            "image_url": image_url_for(template),
        }
        with db.db() as conn:
            conn.execute(
                """
                INSERT INTO scene_npcs(
                  id, session_id, label, npc_id, name, ac, max_hp, current_hp, attitude, data_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    eid,
                    sid,
                    use_label,
                    template["id"],
                    template["name"],
                    row["ac"],
                    row["max_hp"],
                    row["current_hp"],
                    attitude,
                    json.dumps(template),
                    db.utcnow(),
                ),
            )
        spawned.append(row)
    return spawned


def clear_scene() -> None:
    ensure_scene_tables()
    sid = db.active_session_id()
    with db.db() as conn:
        conn.execute("DELETE FROM scene_npcs WHERE session_id = ?", (sid,))


def remove_scene_npc(npc_instance_id: str) -> bool:
    ensure_scene_tables()
    with db.db() as conn:
        cur = conn.execute("DELETE FROM scene_npcs WHERE id = ?", (npc_instance_id,))
        return cur.rowcount > 0


def update_scene_npc(
    npc_instance_id: str,
    *,
    current_hp: int | None = None,
    attitude: str | None = None,
) -> dict[str, Any] | None:
    ensure_scene_tables()
    npc = get_scene_npc(npc_instance_id)
    if not npc:
        return None
    new_hp = npc["current_hp"] if current_hp is None else max(0, int(current_hp))
    new_att = npc["attitude"] if attitude is None else attitude
    with db.db() as conn:
        conn.execute(
            "UPDATE scene_npcs SET current_hp = ?, attitude = ? WHERE id = ?",
            (new_hp, new_att, npc_instance_id),
        )
    npc["current_hp"] = new_hp
    npc["attitude"] = new_att
    return npc


def resolve_or_spawn_npc(text: str) -> dict[str, Any] | None:
    """Match text to a scene NPC, spawning from catalog if labeled."""
    mention = parse_npc_mention(text)
    if not mention:
        return None
    template = mention["template"]
    label = mention["label"]

    existing = find_scene_by_label(label)
    if existing:
        return existing

    if mention.get("tag"):
        spawned = spawn_npc(template["id"], label=label, count=1)
        return spawned[0]

    for e in list_scene():
        if e["npc_id"] == template["id"] and e["current_hp"] > 0:
            return e
    # Also match bare name already in scene
    for e in list_scene():
        if e["name"].lower() == template["name"].lower() and e["current_hp"] > 0:
            return e
    spawned = spawn_npc(template["id"], count=1)
    return spawned[0]


def find_npc_context(text: str) -> dict[str, Any] | None:
    """Narrative subject without auto-spawning."""
    mention = parse_npc_mention(text)
    if not mention:
        return None
    template = mention["template"]
    label = mention["label"]

    existing = find_scene_by_label(label)
    if existing:
        return existing

    if not mention.get("tag"):
        for e in list_scene():
            if e["npc_id"] == template["id"] and e["current_hp"] > 0:
                return e
            if e["name"].lower() == template["name"].lower():
                return e

    return {
        "id": None,
        "label": label,
        "npc_id": template["id"],
        "monster_id": template["id"],
        "name": template["name"],
        "ac": int(template.get("ac") or 10),
        "max_hp": int(template.get("hp") or 10),
        "current_hp": int(template.get("hp") or 10),
        "attitude": template.get("attitude") or "indifferent",
        "kind": "npc",
        "template": template,
        "image_url": image_url_for(template),
        "virtual": True,
    }


def social_dc_for(npc: dict[str, Any], skill: str | None) -> int | None:
    tmpl = npc.get("template") or {}
    social = tmpl.get("social") or npc.get("social") or {}
    if not skill:
        return None
    key = f"{skill}_dc"
    if key in social and social[key] is not None:
        return int(social[key])
    return None
