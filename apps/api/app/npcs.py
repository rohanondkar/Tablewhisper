"""NPC catalog + session scene instances (tavern cast, etc.)."""

from __future__ import annotations

import json
import random
import re
import uuid
import zlib
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import DATA_DIR, RULES_DIR
from . import db

MEDIA_NPCS = "/media/npcs"
CUSTOM_IMAGE_DIR = DATA_DIR / "npc_images"
SRD_IMAGE_DIR = RULES_DIR / "npcs-srd" / "images"


def _portrait_catalog() -> dict[str, dict[str, Any]]:
    """Painted people. Stats come from the block. Race and gender only pick the face."""
    path = RULES_DIR / "npcs-srd" / "portraits.json"
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("portraits") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return {}
    blocks = _blocks()
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict) or not row.get("id"):
            continue
        block = blocks.get(str(row.get("block") or ""), {})
        race = str(row.get("race") or "Human")
        role = str(block.get("name") or row.get("block") or "NPC")
        name = str(row.get("default_name") or role)
        aliases = [name, role] + [str(a) for a in (row.get("aliases") or [])]
        npc = {
            "id": str(row["id"]),
            "name": name,
            "role": role,
            "block": str(row.get("block") or ""),
            "race": race,
            "gender": str(row.get("gender") or ""),
            "ethnicity": str(row.get("ethnicity") or ""),
            "image": str(row.get("image") or ""),
            "size": "Small" if race in {"Halfling", "Gnome"} else "Medium",
            "kind": "npc",
            "attitude": "indifferent",
            "aliases": list(dict.fromkeys(a for a in aliases if a)),
        }
        by_id[npc["id"]] = _apply_block(npc)
    return by_id


def _catalog_paths() -> list[Path]:
    custom = RULES_DIR / "npcs-custom" / "npcs.json"
    return [custom] if custom.exists() else []


@lru_cache(maxsize=1)
def _blocks() -> dict[str, dict[str, Any]]:
    path = RULES_DIR / "rules-dnd5e" / "npc_blocks.json"
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("blocks") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return {}
    return {str(row.get("id")): row for row in rows if isinstance(row, dict) and row.get("id")}


def _apply_block(npc: dict[str, Any]) -> dict[str, Any]:
    block = _blocks().get(str(npc.get("block") or ""))
    if not block:
        return npc
    out = dict(npc)
    for key in (
        "ac",
        "hp",
        "hit_dice",
        "speed",
        "abilities",
        "saves",
        "skills",
        "attacks",
        "spell_attack",
        "spell_save_dc",
        "cr",
        "xp",
    ):
        if block.get(key) is not None:
            out[key] = block[key]
    return out


def _merge_live(snap: dict[str, Any], live: dict[str, Any] | None) -> dict[str, Any]:
    tmpl = with_image(snap)
    if not live:
        return tmpl
    for key in (
        "abilities",
        "saves",
        "skills",
        "attacks",
        "spell_attack",
        "spell_save_dc",
        "hit_dice",
        "speed",
        "block",
    ):
        if live.get(key) is not None:
            tmpl[key] = live[key]
    if live.get("ac") is not None:
        tmpl["ac"] = live["ac"]
    if live.get("hp") is not None:
        tmpl["hp"] = live["hp"]
    return tmpl


@lru_cache(maxsize=4)
def _load_all_npcs() -> dict[str, dict[str, Any]]:
    by_id = _portrait_catalog()
    for path in _catalog_paths():
        data = json.loads(path.read_text(encoding="utf-8"))
        for n in data.get("npcs", []):
            by_id[n["id"]] = _apply_block(n)
    return by_id


def reload_catalog() -> None:
    _blocks.cache_clear()
    _load_all_npcs.cache_clear()


def _unique_label(base: str, used: set[str]) -> str:
    """Last resort when every listed name is already on the scene."""
    name = " ".join((base or "").split()) or "Someone"
    if name.lower() not in used:
        return name
    n = 2
    while f"{name} {n}".lower() in used:
        n += 1
    return f"{name} {n}"


_GENDER_POOL = {
    "woman": "female",
    "man": "male",
    "nonbinary": "nonbinary",
}


def _unused_names(names: list[str], used: set[str], seen: set[str]) -> list[str]:
    free: list[str] = []
    for name in names:
        low = name.lower()
        if low in used or low in seen:
            continue
        free.append(name)
        seen.add(low)
    return free


def _npc_name_pool(npc: dict[str, Any]) -> list[str]:
    """A person draws from the male, female, or nonbinary list. Race lists are for monsters."""
    from .monsters import _name_pools

    pools = _name_pools()
    gender = str(npc.get("gender") or "").strip().lower()
    key = _GENDER_POOL.get(gender, "")
    if key and pools.get(key):
        return list(pools[key])
    race = str(npc.get("race") or "")
    race_key = {"Elf": "elf", "Dwarf": "dwarf", "Half-orc": "orc"}.get(race, "generic")
    return list(pools.get(race_key) or pools.get("generic") or [])


def _scene_name(npc: dict[str, Any], typed: str, used: set[str]) -> str:
    """A person gets a real name. A taken name picks another unused one, not Name 2."""
    preferred = " ".join((typed or npc.get("name") or "").split())
    if preferred and preferred.lower() not in used:
        return preferred
    from .monsters import _name_pools

    pools = _name_pools()
    seen: set[str] = set()
    free = _unused_names(_npc_name_pool(npc), used, seen)
    if not free:
        for key in ("female", "male", "nonbinary"):
            free.extend(_unused_names(pools.get(key) or [], used, seen))
    if not free:
        for key, names in pools.items():
            if key in _GENDER_POOL.values():
                continue
            free.extend(_unused_names(names, used, seen))
    if free:
        return random.choice(free)
    return _unique_label(preferred or "Someone", used)


def _distinct_portrait(npc_id: str) -> str | None:
    """Pick one of the painted manuscript tokens so two people do not share a face."""
    files = sorted(SRD_IMAGE_DIR.glob("tokens/token_*.jpg"))
    if not files:
        return None
    chosen = files[zlib.adler32(npc_id.encode("utf-8")) % len(files)]
    rel = chosen.relative_to(SRD_IMAGE_DIR).as_posix()
    return f"{MEDIA_NPCS}/srd/{rel}"


def image_url_for(npc: dict[str, Any]) -> str:
    mid = npc.get("id") or "generic"
    image = npc.get("image") or f"{mid}.svg"

    # 1) Custom uploads
    for path in (
        CUSTOM_IMAGE_DIR / image,
        CUSTOM_IMAGE_DIR / f"{mid}.png",
        CUSTOM_IMAGE_DIR / f"{mid}.jpg",
    ):
        if path.exists() and path.is_file():
            # Preserve nested relative names for StaticFiles (e.g. tokens/foo.jpg under custom)
            rel = path.relative_to(CUSTOM_IMAGE_DIR).as_posix()
            return f"{MEDIA_NPCS}/custom/{rel}"

    # 2) Painted token in packages/token-portraits (people/name.png).
    from .token_art import MEDIA_TOKENS, TOKEN_DIR

    token = TOKEN_DIR / str(image)
    if image and token.is_file():
        return f"{MEDIA_TOKENS}/{Path(image).as_posix()}"

    # 3) Older catalog image (PD tokens under images/tokens/..., etc.)
    srd = SRD_IMAGE_DIR / image
    if srd.exists() and srd.is_file() and "generic" not in srd.name.lower():
        return f"{MEDIA_NPCS}/srd/{Path(image).as_posix()}"

    for path in (
        SRD_IMAGE_DIR / f"{mid}.jpg",
        SRD_IMAGE_DIR / f"{mid}.png",
        SRD_IMAGE_DIR / f"{mid}.svg",
    ):
        if path.exists() and path.is_file() and "generic" not in path.name.lower():
            return f"{MEDIA_NPCS}/srd/{path.name}"

    # 3) A manuscript portrait of this person. Shared role icons made every
    # guard (and every king) look identical in the picker.
    pooled = _distinct_portrait(str(mid))
    if pooled:
        return pooled

    generic_jpg = SRD_IMAGE_DIR / "generic.jpg"
    if generic_jpg.exists():
        return f"{MEDIA_NPCS}/srd/generic.jpg"
    return f"{MEDIA_NPCS}/srd/generic.svg"


def with_image(npc: dict[str, Any]) -> dict[str, Any]:
    from .creature_size import ensure_creature_size
    from .xp import normalize_cr, xp_for_creature

    out = ensure_creature_size(dict(npc), "Medium")
    out["image_url"] = image_url_for(npc)
    out.setdefault("cr", "0")
    out["cr"] = normalize_cr(out.get("cr"))
    if out.get("xp") is None:
        out["xp"] = xp_for_creature(out)
    else:
        try:
            out["xp"] = int(out["xp"])
        except (TypeError, ValueError):
            out["xp"] = xp_for_creature(out)
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
    r"\b([a-z][a-z'\-]{2,24}(?:\s+[a-z][a-z'\-]{2,24}){0,3})(?:\s+|-)([a-z]|\d+)\b",
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
    data.setdefault("cr", "0")
    data.setdefault("xp", 10)
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


def set_npc_image(npc_id: str, dest_name: str) -> dict[str, Any]:
    ensure_scene_tables()
    tmpl = get_template(npc_id) or _load_all_npcs().get(npc_id)
    if not tmpl:
        raise ValueError(f"Unknown NPC: {npc_id}")
    data = {k: v for k, v in dict(tmpl).items() if k not in {"image_url", "size_sq"}}
    data["id"] = npc_id
    data["image"] = dest_name
    return save_custom_npc(data)


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
            snap = json.loads(r["data_json"])
            live = get_template(r["npc_id"])
            tmpl = _merge_live(snap, live)
            if live and live.get("image_url"):
                tmpl["image"] = live.get("image") or tmpl.get("image")
                tmpl["image_url"] = live["image_url"]
            ac = int(live["ac"]) if live and live.get("ac") is not None else int(r["ac"])
            max_hp = int(r["max_hp"])
            current_hp = int(r["current_hp"])
            block_hp = int(live["hp"]) if live and live.get("hp") is not None else None
            if block_hp is not None and current_hp == max_hp and block_hp != max_hp:
                max_hp = block_hp
                current_hp = block_hp
                conn.execute(
                    "UPDATE scene_npcs SET ac = ?, max_hp = ?, current_hp = ? WHERE id = ?",
                    (ac, max_hp, current_hp, r["id"]),
                )
            out.append(
                {
                    "id": r["id"],
                    "label": r["label"],
                    "npc_id": r["npc_id"],
                    "name": r["name"],
                    "ac": ac,
                    "max_hp": max_hp,
                    "current_hp": current_hp,
                    "attitude": r["attitude"] or tmpl.get("attitude") or "indifferent",
                    "kind": "npc",
                    "cr": tmpl.get("cr"),
                    "xp": tmpl.get("xp"),
                    "size": tmpl.get("size"),
                    "size_sq": tmpl.get("size_sq"),
                    "template": tmpl,
                    "image_url": tmpl.get("image_url") or image_url_for(tmpl),
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
        live = get_template(r["npc_id"])
        tmpl = _merge_live(json.loads(r["data_json"]), live)
        ac = int(live["ac"]) if live and live.get("ac") is not None else int(r["ac"])
        return {
            "id": r["id"],
            "label": r["label"],
            "npc_id": r["npc_id"],
            "name": r["name"],
            "ac": ac,
            "max_hp": r["max_hp"],
            "current_hp": r["current_hp"],
            "attitude": r["attitude"] or tmpl.get("attitude") or "indifferent",
            "kind": "npc",
            "cr": tmpl.get("cr"),
            "xp": tmpl.get("xp"),
            "template": tmpl,
            "image_url": tmpl.get("image_url") or image_url_for(tmpl),
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
    *,
    cr: str | None = None,
    xp: int | None = None,
    ac: int | None = None,
    hp: int | None = None,
) -> list[dict[str, Any]]:
    from .xp import normalize_cr, xp_for_cr

    ensure_scene_tables()
    template = get_template(npc_id)
    if not template:
        raise ValueError(f"Unknown NPC: {npc_id}")
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
    existing = list_scene()
    spawned: list[dict[str, Any]] = []
    for _i in range(max(1, count)):
        used = {e["label"].lower() for e in existing + spawned}
        use_label = _scene_name(inst, label or "", used)
        eid = str(uuid.uuid4())
        attitude = inst.get("attitude") or "indifferent"
        row = {
            "id": eid,
            "label": use_label,
            "npc_id": inst["id"],
            "name": use_label,
            "ac": int(inst["ac"]),
            "max_hp": int(inst["hp"]),
            "current_hp": int(inst["hp"]),
            "attitude": attitude,
            "kind": "npc",
            "cr": inst.get("cr"),
            "xp": inst.get("xp"),
            "template": inst,
            "image_url": image_url_for(inst),
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
                    inst["id"],
                    use_label,
                    row["ac"],
                    row["max_hp"],
                    row["current_hp"],
                    attitude,
                    json.dumps(inst),
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
