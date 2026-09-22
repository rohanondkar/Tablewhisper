from __future__ import annotations

import json
import re
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import DATA_DIR, RULES_DIR
from . import db

MEDIA_MONSTERS = "/media/monsters"
CUSTOM_IMAGE_DIR = DATA_DIR / "monster_images"
SRD_IMAGE_DIR = RULES_DIR / "monsters-srd" / "images"


def _catalog_paths() -> list[Path]:
    paths = [
        RULES_DIR / "monsters-srd" / "monsters.json",
        RULES_DIR / "monsters-custom" / "monsters.json",
    ]
    return [p for p in paths if p.exists()]


@lru_cache(maxsize=4)
def _load_all_monsters() -> dict[str, dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for path in _catalog_paths():
        data = json.loads(path.read_text(encoding="utf-8"))
        for m in data.get("monsters", []):
            by_id[m["id"]] = m
    return by_id


def reload_catalog() -> None:
    _load_all_monsters.cache_clear()


def image_url_for(monster: dict[str, Any]) -> str:
    mid = monster.get("id") or "generic"
    image = monster.get("image") or f"{mid}.svg"
    # Prefer custom uploaded file, then SRD pack, else generic
    custom = CUSTOM_IMAGE_DIR / image
    srd = SRD_IMAGE_DIR / image
    srd_by_id = SRD_IMAGE_DIR / f"{mid}.svg"
    if custom.exists():
        return f"{MEDIA_MONSTERS}/custom/{image}"
    if srd.exists():
        return f"{MEDIA_MONSTERS}/srd/{image}"
    if srd_by_id.exists():
        return f"{MEDIA_MONSTERS}/srd/{mid}.svg"
    return f"{MEDIA_MONSTERS}/srd/generic.svg"


def with_image(monster: dict[str, Any]) -> dict[str, Any]:
    from .xp import normalize_cr, xp_for_creature

    out = dict(monster)
    out["image_url"] = image_url_for(monster)
    out["cr"] = normalize_cr(out.get("cr"))
    out["xp"] = xp_for_creature(out)
    return out


def list_templates() -> list[dict[str, Any]]:
    monsters = [with_image(m) for m in _load_all_monsters().values()]
    monsters.sort(key=lambda m: m.get("name", "").lower())
    return monsters


def get_template(monster_id: str) -> dict[str, Any] | None:
    m = _load_all_monsters().get(monster_id)
    return with_image(m) if m else None


def find_template_by_name(text: str) -> dict[str, Any] | None:
    lowered = text.lower()
    best = None
    best_score = 0
    for m in _load_all_monsters().values():
        names = [m.get("name", "")] + list(m.get("aliases") or [])
        for name in names:
            n = name.lower().strip()
            if not n:
                continue
            score = 0
            if re.search(rf"\b{re.escape(n)}\b", lowered):
                score = 10 + len(n)
            elif n in lowered:
                score = 5 + len(n)
            if score > best_score:
                best_score = score
                best = m
    return best if best_score > 0 else None


_LABEL_RE = re.compile(
    r"\b([a-z][a-z\- ]{1,30}?)\s*[- ]?\s*([a-z]|\d+)\b",
    re.IGNORECASE,
)


def parse_target_mention(text: str) -> dict[str, Any] | None:
    """
    Find 'orc A', 'goblin-2', 'the orc', 'an orc' in free text.
    Returns {template, label, letter} or None.
    """
    lowered = text.lower()
    # Prefer explicit labeled targets first
    for m in _LABEL_RE.finditer(lowered):
        raw_name = m.group(1).strip()
        tag = m.group(2).upper()
        # Avoid matching character-ish phrases
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


def ensure_encounter_tables() -> None:
    with db.db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS custom_monsters (
              id TEXT PRIMARY KEY,
              data_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS encounter_enemies (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              label TEXT NOT NULL,
              monster_id TEXT NOT NULL,
              name TEXT NOT NULL,
              ac INTEGER NOT NULL,
              max_hp INTEGER NOT NULL,
              current_hp INTEGER NOT NULL,
              data_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            """
        )


def save_custom_monster(data: dict[str, Any]) -> dict[str, Any]:
    ensure_encounter_tables()
    mid = data.get("id") or str(uuid.uuid4())
    data = dict(data)
    data["id"] = mid
    if "name" not in data:
        raise ValueError("Custom monster needs a name")
    data.setdefault("ac", 10)
    data.setdefault("hp", 10)
    data.setdefault("aliases", [])
    data.setdefault("attacks", [])
    with db.db() as conn:
        conn.execute(
            "INSERT INTO custom_monsters(id, data_json) VALUES(?, ?) "
            "ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json",
            (mid, json.dumps(data)),
        )
    # Also write/merge into packages/monsters-custom for catalog reload
    custom_dir = RULES_DIR / "monsters-custom"
    custom_dir.mkdir(parents=True, exist_ok=True)
    custom_file = custom_dir / "monsters.json"
    pack: dict[str, Any] = {"id": "monsters-custom", "name": "Custom Monsters", "version": "1.0.0", "monsters": []}
    if custom_file.exists():
        pack = json.loads(custom_file.read_text(encoding="utf-8"))
    monsters = [m for m in pack.get("monsters", []) if m.get("id") != mid]
    monsters.append(data)
    pack["monsters"] = monsters
    custom_file.write_text(json.dumps(pack, indent=2), encoding="utf-8")
    reload_catalog()
    return with_image(data)


def list_encounter() -> list[dict[str, Any]]:
    ensure_encounter_tables()
    sid = db.active_session_id()
    with db.db() as conn:
        rows = conn.execute(
            """
            SELECT id, label, monster_id, name, ac, max_hp, current_hp, data_json
            FROM encounter_enemies
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (sid,),
        ).fetchall()
        out = []
        for r in rows:
            tmpl = with_image(json.loads(r["data_json"]))
            out.append(
                {
                    "id": r["id"],
                    "label": r["label"],
                    "monster_id": r["monster_id"],
                    "name": r["name"],
                    "ac": r["ac"],
                    "max_hp": r["max_hp"],
                    "current_hp": r["current_hp"],
                    "cr": tmpl.get("cr"),
                    "xp": tmpl.get("xp"),
                    "template": tmpl,
                    "image_url": tmpl.get("image_url") or image_url_for(tmpl),
                }
            )
        return out


def get_enemy(enemy_id: str) -> dict[str, Any] | None:
    ensure_encounter_tables()
    with db.db() as conn:
        r = conn.execute(
            "SELECT id, label, monster_id, name, ac, max_hp, current_hp, data_json "
            "FROM encounter_enemies WHERE id = ?",
            (enemy_id,),
        ).fetchone()
        if not r:
            return None
        tmpl = with_image(json.loads(r["data_json"]))
        return {
            "id": r["id"],
            "label": r["label"],
            "monster_id": r["monster_id"],
            "name": r["name"],
            "ac": r["ac"],
            "max_hp": r["max_hp"],
            "current_hp": r["current_hp"],
            "cr": tmpl.get("cr"),
            "xp": tmpl.get("xp"),
            "template": tmpl,
            "image_url": tmpl.get("image_url") or image_url_for(tmpl),
        }


def find_enemy_by_label(label: str) -> dict[str, Any] | None:
    label_l = label.lower().strip()
    for e in list_encounter():
        if e["label"].lower() == label_l:
            return e
    return None


def spawn_enemy(
    monster_id: str,
    label: str | None = None,
    count: int = 1,
    *,
    cr: str | None = None,
    xp: int | None = None,
    ac: int | None = None,
    hp: int | None = None,
) -> list[dict[str, Any]]:
    from .xp import normalize_cr, xp_for_cr

    ensure_encounter_tables()
    template = get_template(monster_id)
    if not template:
        raise ValueError(f"Unknown monster: {monster_id}")
    # Instance overrides (DM scaling) — does not rewrite the catalog entry
    inst = dict(template)
    if cr is not None and str(cr).strip() != "":
        inst["cr"] = normalize_cr(cr)
        if xp is None:
            inst["xp"] = xp_for_cr(inst["cr"])
    if xp is not None:
        inst["xp"] = max(0, int(xp))
    if ac is not None:
        inst["ac"] = int(ac)
    if hp is not None:
        inst["hp"] = max(1, int(hp))
    inst = with_image(inst)

    sid = db.active_session_id()
    existing = list_encounter()
    spawned: list[dict[str, Any]] = []
    for i in range(max(1, count)):
        if label and count == 1:
            use_label = label
        else:
            # Assign next letter A, B, C...
            used = {e["label"].lower() for e in existing + spawned}
            letter = None
            for code in range(ord("A"), ord("Z") + 1):
                candidate = f"{inst['name']} {chr(code)}"
                if candidate.lower() not in used:
                    letter = chr(code)
                    break
            use_label = f"{inst['name']} {letter or i + 1}"
        eid = str(uuid.uuid4())
        row = {
            "id": eid,
            "label": use_label,
            "monster_id": inst["id"],
            "name": inst["name"],
            "ac": int(inst["ac"]),
            "max_hp": int(inst["hp"]),
            "current_hp": int(inst["hp"]),
            "cr": inst.get("cr"),
            "xp": inst.get("xp"),
            "template": inst,
            "image_url": image_url_for(inst),
        }
        with db.db() as conn:
            conn.execute(
                """
                INSERT INTO encounter_enemies(
                  id, session_id, label, monster_id, name, ac, max_hp, current_hp, data_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    eid,
                    sid,
                    use_label,
                    inst["id"],
                    inst["name"],
                    row["ac"],
                    row["max_hp"],
                    row["current_hp"],
                    json.dumps(inst),
                    db.utcnow(),
                ),
            )
        spawned.append(row)
    return spawned


def clear_encounter() -> None:
    ensure_encounter_tables()
    sid = db.active_session_id()
    with db.db() as conn:
        conn.execute("DELETE FROM encounter_enemies WHERE session_id = ?", (sid,))


def remove_enemy(enemy_id: str) -> bool:
    ensure_encounter_tables()
    with db.db() as conn:
        cur = conn.execute("DELETE FROM encounter_enemies WHERE id = ?", (enemy_id,))
        return cur.rowcount > 0


def update_enemy_hp(enemy_id: str, current_hp: int) -> dict[str, Any] | None:
    ensure_encounter_tables()
    enemy = get_enemy(enemy_id)
    if not enemy:
        return None
    current_hp = max(0, int(current_hp))
    with db.db() as conn:
        conn.execute(
            "UPDATE encounter_enemies SET current_hp = ? WHERE id = ?",
            (current_hp, enemy_id),
        )
    enemy["current_hp"] = current_hp
    return enemy


def resolve_or_spawn_target(text: str) -> dict[str, Any] | None:
    """Match text to an encounter enemy, spawning from SRD if labeled (Orc A)."""
    mention = parse_target_mention(text)
    if not mention:
        return None
    template = mention["template"]
    label = mention["label"]

    existing = find_enemy_by_label(label)
    if existing:
        return existing

    # Labeled target like Orc A → auto-spawn for new DMs
    if mention.get("tag"):
        spawned = spawn_enemy(template["id"], label=label, count=1)
        return spawned[0]

    # Generic "an orc" → use first living orc in encounter, else spawn Orc A
    for e in list_encounter():
        if e["monster_id"] == template["id"] and e["current_hp"] > 0:
            return e
    spawned = spawn_enemy(template["id"], count=1)
    return spawned[0]


def find_creature_context(text: str) -> dict[str, Any] | None:
    """
    Find a creature mentioned in text for narrative context without auto-spawning.
    Returns an encounter enemy if present, else a virtual subject from the template.
    """
    mention = parse_target_mention(text)
    if not mention:
        return None
    template = mention["template"]
    label = mention["label"]

    existing = find_enemy_by_label(label)
    if existing:
        return existing

    if not mention.get("tag"):
        for e in list_encounter():
            if e["monster_id"] == template["id"] and e["current_hp"] > 0:
                return e

    return {
        "id": None,
        "label": label,
        "monster_id": template["id"],
        "name": template["name"],
        "ac": int(template.get("ac") or 10),
        "max_hp": int(template.get("hp") or 10),
        "current_hp": int(template.get("hp") or 10),
        "template": template,
        "image_url": image_url_for(template),
        "virtual": True,
    }
