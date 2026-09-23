"""Session battle maps: backgrounds, tokens, walls, fog, lights, portals."""

from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Any

from . import db, monsters, npcs
from .config import DATA_DIR
from .token_art import placed_enemy_image
from .creature_size import ensure_creature_size, normalize_size, size_to_squares

MAP_IMAGE_DIR = DATA_DIR / "map_images"
MAP_FOG_DIR = DATA_DIR / "map_fog"
MEDIA_MAPS = "/media/maps"
ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
# Pixel size of the play area. Square count × grid spacing, not the image file size.
MIN_MAP_PX = 16.0
MAX_MAP_PX = 40000.0


def ensure_dirs() -> None:
    MAP_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    MAP_FOG_DIR.mkdir(parents=True, exist_ok=True)


def ensure_map_tables() -> None:
    ensure_dirs()
    with db.db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS maps (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              name TEXT NOT NULL,
              background_path TEXT,
              width REAL NOT NULL DEFAULT 1200,
              height REAL NOT NULL DEFAULT 800,
              grid_size_px REAL NOT NULL DEFAULT 50,
              grid_offset_x REAL NOT NULL DEFAULT 0,
              grid_offset_y REAL NOT NULL DEFAULT 0,
              feet_per_square REAL NOT NULL DEFAULT 5,
              show_grid_overlay INTEGER NOT NULL DEFAULT 1,
              active INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS map_tokens (
              id TEXT PRIMARY KEY,
              map_id TEXT NOT NULL,
              kind TEXT NOT NULL,
              ref_id TEXT,
              label TEXT NOT NULL,
              x REAL NOT NULL DEFAULT 0,
              y REAL NOT NULL DEFAULT 0,
              rotation REAL NOT NULL DEFAULT 0,
              size TEXT NOT NULL DEFAULT 'Medium',
              size_sq REAL NOT NULL DEFAULT 1,
              vision_ft REAL NOT NULL DEFAULT 60,
              light_bright_ft REAL NOT NULL DEFAULT 0,
              light_dim_ft REAL NOT NULL DEFAULT 0,
              show_vision INTEGER NOT NULL DEFAULT 1,
              image_url TEXT,
              data_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS map_walls (
              id TEXT PRIMARY KEY,
              map_id TEXT NOT NULL,
              points_json TEXT NOT NULL,
              door INTEGER NOT NULL DEFAULT 0,
              door_open INTEGER NOT NULL DEFAULT 0,
              block_movement INTEGER NOT NULL DEFAULT 1,
              block_sight INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS map_lights (
              id TEXT PRIMARY KEY,
              map_id TEXT NOT NULL,
              x REAL NOT NULL,
              y REAL NOT NULL,
              bright_ft REAL NOT NULL DEFAULT 20,
              dim_ft REAL NOT NULL DEFAULT 20
            );
            CREATE TABLE IF NOT EXISTS map_fog (
              map_id TEXT PRIMARY KEY,
              mask_path TEXT
            );
            CREATE TABLE IF NOT EXISTS map_portals (
              id TEXT PRIMARY KEY,
              map_id TEXT NOT NULL,
              x REAL NOT NULL,
              y REAL NOT NULL,
              radius REAL NOT NULL DEFAULT 40,
              target_map_id TEXT NOT NULL,
              target_x REAL NOT NULL DEFAULT 0,
              target_y REAL NOT NULL DEFAULT 0,
              label TEXT NOT NULL DEFAULT 'Portal'
            );
            """
        )


def _row_map(r: Any) -> dict[str, Any]:
    bg = r["background_path"]
    return {
        "id": r["id"],
        "session_id": r["session_id"],
        "name": r["name"],
        "background_path": bg,
        "background_url": f"{MEDIA_MAPS}/images/{Path(bg).name}" if bg else None,
        "width": float(r["width"]),
        "height": float(r["height"]),
        "grid_size_px": float(r["grid_size_px"]),
        "grid_offset_x": float(r["grid_offset_x"]),
        "grid_offset_y": float(r["grid_offset_y"]),
        "feet_per_square": float(r["feet_per_square"]),
        "show_grid_overlay": bool(r["show_grid_overlay"]),
        "active": bool(r["active"]),
        "created_at": r["created_at"],
        "fog_url": None,
    }


def _attach_fog(m: dict[str, Any]) -> dict[str, Any]:
    with db.db() as conn:
        row = conn.execute(
            "SELECT mask_path FROM map_fog WHERE map_id = ?", (m["id"],)
        ).fetchone()
    if row and row["mask_path"]:
        name = Path(row["mask_path"]).name
        m["fog_url"] = f"{MEDIA_MAPS}/fog/{name}"
        m["fog_path"] = row["mask_path"]
    return m


def list_maps(session_id: str | None = None) -> list[dict[str, Any]]:
    sid = session_id or db.active_session_id()
    with db.db() as conn:
        rows = conn.execute(
            "SELECT * FROM maps WHERE session_id = ? ORDER BY created_at ASC",
            (sid,),
        ).fetchall()
    return [_attach_fog(_row_map(r)) for r in rows]


def get_map(map_id: str) -> dict[str, Any] | None:
    with db.db() as conn:
        row = conn.execute("SELECT * FROM maps WHERE id = ?", (map_id,)).fetchone()
    if not row:
        return None
    return _attach_fog(_row_map(row))


def active_map(session_id: str | None = None) -> dict[str, Any] | None:
    sid = session_id or db.active_session_id()
    with db.db() as conn:
        row = conn.execute(
            "SELECT * FROM maps WHERE session_id = ? AND active = 1 LIMIT 1",
            (sid,),
        ).fetchone()
        if not row:
            row = conn.execute(
                "SELECT * FROM maps WHERE session_id = ? ORDER BY created_at ASC LIMIT 1",
                (sid,),
            ).fetchone()
    if not row:
        return None
    return _attach_fog(_row_map(row))


def create_map(name: str = "Map", session_id: str | None = None) -> dict[str, Any]:
    sid = session_id or db.active_session_id()
    mid = str(uuid.uuid4())
    with db.db() as conn:
        existing = conn.execute(
            "SELECT COUNT(*) AS c FROM maps WHERE session_id = ?", (sid,)
        ).fetchone()["c"]
        if existing == 0:
            conn.execute("UPDATE maps SET active = 0 WHERE session_id = ?", (sid,))
            active = 1
        else:
            active = 0
        conn.execute(
            """
            INSERT INTO maps(
              id, session_id, name, background_path, width, height,
              grid_size_px, grid_offset_x, grid_offset_y, feet_per_square,
              show_grid_overlay, active, created_at
            ) VALUES (?, ?, ?, NULL, 1200, 800, 50, 0, 0, 5, 1, ?, ?)
            """,
            (mid, sid, (name or "Map").strip() or "Map", active, db.utcnow()),
        )
    return get_map(mid)  # type: ignore[return-value]


def activate_map(map_id: str) -> dict[str, Any] | None:
    m = get_map(map_id)
    if not m:
        return None
    with db.db() as conn:
        conn.execute(
            "UPDATE maps SET active = 0 WHERE session_id = ?", (m["session_id"],)
        )
        conn.execute("UPDATE maps SET active = 1 WHERE id = ?", (map_id,))
    return get_map(map_id)


def _clamp_map_px(value: Any, fallback: float) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        n = float(fallback)
    return min(MAX_MAP_PX, max(MIN_MAP_PX, n))


def patch_map(map_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    m = get_map(map_id)
    if not m:
        return None
    fields = {
        "name": patch.get("name"),
        "width": patch.get("width"),
        "height": patch.get("height"),
        "grid_size_px": patch.get("grid_size_px"),
        "grid_offset_x": patch.get("grid_offset_x"),
        "grid_offset_y": patch.get("grid_offset_y"),
        "feet_per_square": patch.get("feet_per_square"),
        "show_grid_overlay": patch.get("show_grid_overlay"),
    }
    sets: list[str] = []
    vals: list[Any] = []
    for key, val in fields.items():
        if val is None:
            continue
        if key == "name":
            val = str(val).strip() or "Map"
        if key == "show_grid_overlay":
            val = 1 if val else 0
        if key in {"width", "height"}:
            val = _clamp_map_px(val, m[key])
        sets.append(f"{key} = ?")
        vals.append(val)
    if not sets:
        return m
    vals.append(map_id)
    with db.db() as conn:
        conn.execute(f"UPDATE maps SET {', '.join(sets)} WHERE id = ?", vals)
    return get_map(map_id)


def set_background(
    map_id: str,
    upload_path: Path,
    filename: str,
    width: float | None = None,
    height: float | None = None,
) -> dict[str, Any] | None:
    m = get_map(map_id)
    if not m:
        return None
    ensure_dirs()
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXT:
        ext = ".png"
    dest_name = f"{map_id}{ext}"
    dest = MAP_IMAGE_DIR / dest_name
    shutil.copyfile(upload_path, dest)
    # Keep the DM's square count. An upload fills that area; it does not resize the grid.
    w = _clamp_map_px(m["width"] if width is None else width, m["width"])
    h = _clamp_map_px(m["height"] if height is None else height, m["height"])
    with db.db() as conn:
        conn.execute(
            "UPDATE maps SET background_path = ?, width = ?, height = ? WHERE id = ?",
            (str(dest), w, h, map_id),
        )
    return get_map(map_id)


def delete_map(map_id: str) -> bool:
    m = get_map(map_id)
    if not m:
        return False
    _delete_map_assets(map_id, m.get("background_path"))
    with db.db() as conn:
        conn.execute("DELETE FROM map_tokens WHERE map_id = ?", (map_id,))
        conn.execute("DELETE FROM map_walls WHERE map_id = ?", (map_id,))
        conn.execute("DELETE FROM map_lights WHERE map_id = ?", (map_id,))
        conn.execute("DELETE FROM map_fog WHERE map_id = ?", (map_id,))
        conn.execute("DELETE FROM map_portals WHERE map_id = ?", (map_id,))
        conn.execute("DELETE FROM maps WHERE id = ?", (map_id,))
        if m.get("active"):
            nxt = conn.execute(
                "SELECT id FROM maps WHERE session_id = ? ORDER BY created_at ASC LIMIT 1",
                (m["session_id"],),
            ).fetchone()
            if nxt:
                conn.execute("UPDATE maps SET active = 1 WHERE id = ?", (nxt["id"],))
    return True


def _delete_map_assets(map_id: str, background_path: str | None) -> None:
    if background_path:
        p = Path(background_path)
        if p.exists():
            try:
                p.unlink()
            except OSError:
                pass
    fog = MAP_FOG_DIR / f"{map_id}.png"
    if fog.exists():
        try:
            fog.unlink()
        except OSError:
            pass


def delete_session_maps(session_id: str) -> None:
    with db.db() as conn:
        rows = conn.execute(
            "SELECT id, background_path FROM maps WHERE session_id = ?", (session_id,)
        ).fetchall()
    for r in rows:
        delete_map(r["id"])


# --- tokens ---


def _row_token(r: Any) -> dict[str, Any]:
    return {
        "id": r["id"],
        "map_id": r["map_id"],
        "kind": r["kind"],
        "ref_id": r["ref_id"],
        "label": r["label"],
        "x": float(r["x"]),
        "y": float(r["y"]),
        "rotation": float(r["rotation"]),
        "size": r["size"],
        "size_sq": float(r["size_sq"]),
        "vision_ft": float(r["vision_ft"]),
        "light_bright_ft": float(r["light_bright_ft"]),
        "light_dim_ft": float(r["light_dim_ft"]),
        "show_vision": bool(r["show_vision"]),
        "image_url": r["image_url"],
        "data": json.loads(r["data_json"] or "{}"),
    }


def list_tokens(map_id: str) -> list[dict[str, Any]]:
    with db.db() as conn:
        rows = conn.execute(
            "SELECT * FROM map_tokens WHERE map_id = ? ORDER BY label ASC",
            (map_id,),
        ).fetchall()
    return [_row_token(r) for r in rows]


def get_token(token_id: str) -> dict[str, Any] | None:
    with db.db() as conn:
        row = conn.execute(
            "SELECT * FROM map_tokens WHERE id = ?", (token_id,)
        ).fetchone()
    return _row_token(row) if row else None


def add_token(map_id: str, body: dict[str, Any]) -> dict[str, Any]:
    if not get_map(map_id):
        raise ValueError("Map not found")
    kind = body.get("kind") or "custom"
    size = normalize_size(body.get("size"), "Medium")
    size_sq = float(body["size_sq"]) if body.get("size_sq") is not None else size_to_squares(size)
    if "image_url" in body:
        image_url = body.get("image_url") or None
    elif kind == "pc":
        # Match console: no invented portrait for party members.
        image_url = None
    elif kind == "npc":
        image_url = "/media/tokens/token-npc-generic.png"
    else:
        image_url = "/media/tokens/token-humanoid.png"
    tid = str(uuid.uuid4())
    with db.db() as conn:
        conn.execute(
            """
            INSERT INTO map_tokens(
              id, map_id, kind, ref_id, label, x, y, rotation, size, size_sq,
              vision_ft, light_bright_ft, light_dim_ft, show_vision, image_url, data_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                tid,
                map_id,
                kind,
                body.get("ref_id"),
                (body.get("label") or "Token").strip() or "Token",
                float(body.get("x") or 0),
                float(body.get("y") or 0),
                float(body.get("rotation") or 0),
                size,
                size_sq,
                float(body.get("vision_ft") if body.get("vision_ft") is not None else 60),
                float(body.get("light_bright_ft") or 0),
                float(body.get("light_dim_ft") or 0),
                1 if body.get("show_vision") else 0,
                image_url,
                json.dumps(body.get("data") or {}),
            ),
        )
    return get_token(tid)  # type: ignore[return-value]


def patch_token(token_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    t = get_token(token_id)
    if not t:
        return None
    # Allow clearing image_url with explicit None; other None values are ignored.
    merged = dict(t)
    for k, v in patch.items():
        if k == "image_url" or v is not None:
            merged[k] = v
    if "size" in patch and patch["size"] is not None:
        merged["size"] = normalize_size(patch["size"])
        if patch.get("size_sq") is None:
            merged["size_sq"] = size_to_squares(merged["size"])
    if "show_vision" in patch:
        merged["show_vision"] = bool(patch["show_vision"])
    with db.db() as conn:
        conn.execute(
            """
            UPDATE map_tokens SET
              kind = ?, ref_id = ?, label = ?, x = ?, y = ?, rotation = ?,
              size = ?, size_sq = ?, vision_ft = ?, light_bright_ft = ?,
              light_dim_ft = ?, show_vision = ?, image_url = ?, data_json = ?
            WHERE id = ?
            """,
            (
                merged["kind"],
                merged.get("ref_id"),
                merged["label"],
                float(merged["x"]),
                float(merged["y"]),
                float(merged["rotation"]),
                merged["size"],
                float(merged["size_sq"]),
                float(merged["vision_ft"]),
                float(merged["light_bright_ft"]),
                float(merged["light_dim_ft"]),
                1 if merged["show_vision"] else 0,
                merged.get("image_url"),
                json.dumps(merged.get("data") or {}),
                token_id,
            ),
        )
    return get_token(token_id)


def delete_token(token_id: str) -> bool:
    with db.db() as conn:
        cur = conn.execute("DELETE FROM map_tokens WHERE id = ?", (token_id,))
        return cur.rowcount > 0


def delete_tokens_by_ref(kind: str, ref_id: str) -> int:
    with db.db() as conn:
        cur = conn.execute(
            "DELETE FROM map_tokens WHERE kind = ? AND ref_id = ?",
            (kind, ref_id),
        )
        return cur.rowcount


def sync_tokens(map_id: str) -> list[dict[str, Any]]:
    """Upsert tokens from party, encounter, and scene onto the map."""
    m = get_map(map_id)
    if not m:
        raise ValueError("Map not found")
    existing = list_tokens(map_id)
    by_key = {(t["kind"], t["ref_id"]): t for t in existing if t.get("ref_id")}

    gx = float(m["grid_offset_x"])
    gy = float(m["grid_offset_y"])
    gs = float(m["grid_size_px"])
    place_i = 0

    def next_xy() -> tuple[float, float]:
        nonlocal place_i
        col = place_i % 8
        row = place_i // 8
        place_i += 1
        return gx + gs * (1 + col), gy + gs * (1 + row)

    # Party
    for c in db.list_characters():
        from .creature_size import ensure_character_size
        from .portraits import with_portrait

        c = with_portrait(ensure_character_size(c))
        key = ("pc", c["id"])
        size = c.get("size") or "Medium"
        size_sq = float(c.get("size_sq") or size_to_squares(size))
        # Real uploaded portrait only — map matches console (initials / empty).
        want_img = c.get("image_url") or None
        if key in by_key:
            existing_tok = by_key[key]
            patch: dict[str, Any] = {}
            if (existing_tok.get("image_url") or None) != want_img:
                patch["image_url"] = want_img
            if existing_tok.get("size") != size or float(existing_tok.get("size_sq") or 0) != size_sq:
                patch["size"] = size
                patch["size_sq"] = size_sq
            if patch:
                patch_token(existing_tok["id"], patch)
            continue
        x, y = next_xy()
        add_token(
            map_id,
            {
                "kind": "pc",
                "ref_id": c["id"],
                "label": c.get("name") or "PC",
                "x": x,
                "y": y,
                "size": size,
                "size_sq": size_sq,
                "vision_ft": 60,
                "show_vision": False,
                "image_url": want_img,
            },
        )

    for e in monsters.list_encounter():
        key = ("enemy", e["id"])
        existing_tok = by_key.get(key)
        img = placed_enemy_image(e, existing_tok)
        if img.endswith(".svg") and "/media/monsters/" in img:
            img = img[:-4] + ".png"
        data = e.get("template") or e.get("data") or {}
        sized = ensure_creature_size(data if isinstance(data, dict) else {})
        size = e.get("size") or sized["size"]
        size_sq = float(e.get("size_sq") or sized["size_sq"])
        if key in by_key:
            existing_tok = by_key[key]
            patch = {}
            if existing_tok.get("image_url") != img:
                patch["image_url"] = img
            if existing_tok.get("size") != size or float(existing_tok.get("size_sq") or 0) != size_sq:
                patch["size"] = size
                patch["size_sq"] = size_sq
            if patch:
                patch_token(existing_tok["id"], patch)
            continue
        x, y = next_xy()
        add_token(
            map_id,
            {
                "kind": "enemy",
                "ref_id": e["id"],
                "label": e.get("label") or e.get("name") or "Enemy",
                "x": x,
                "y": y,
                "size": size,
                "size_sq": size_sq,
                "vision_ft": 60,
                "show_vision": False,
                "image_url": img,
            },
        )

    for n in npcs.list_scene():
        key = ("npc", n["id"])
        img = n.get("image_url") or "/media/tokens/token-npc-generic.png"
        data = n.get("template") or n.get("data") or {}
        sized = ensure_creature_size(data if isinstance(data, dict) else {}, "Medium")
        size = n.get("size") or sized["size"]
        size_sq = float(n.get("size_sq") or sized["size_sq"])
        if key in by_key:
            existing_tok = by_key[key]
            patch = {}
            if existing_tok.get("image_url") != img:
                patch["image_url"] = img
            if existing_tok.get("size") != size or float(existing_tok.get("size_sq") or 0) != size_sq:
                patch["size"] = size
                patch["size_sq"] = size_sq
            if patch:
                patch_token(existing_tok["id"], patch)
            continue
        x, y = next_xy()
        add_token(
            map_id,
            {
                "kind": "npc",
                "ref_id": n["id"],
                "label": n.get("label") or n.get("name") or "NPC",
                "x": x,
                "y": y,
                "size": size,
                "size_sq": size_sq,
                "vision_ft": 60,
                "show_vision": False,
                "image_url": img,
            },
        )

    return list_tokens(map_id)


# --- walls ---


def list_walls(map_id: str) -> list[dict[str, Any]]:
    with db.db() as conn:
        rows = conn.execute(
            "SELECT * FROM map_walls WHERE map_id = ?", (map_id,)
        ).fetchall()
    return [
        {
            "id": r["id"],
            "map_id": r["map_id"],
            "points": json.loads(r["points_json"]),
            "door": bool(r["door"]),
            "door_open": bool(r["door_open"]),
            "block_movement": bool(r["block_movement"]),
            "block_sight": bool(r["block_sight"]),
        }
        for r in rows
    ]


def add_wall(map_id: str, body: dict[str, Any]) -> dict[str, Any]:
    if not get_map(map_id):
        raise ValueError("Map not found")
    wid = str(uuid.uuid4())
    points = body.get("points") or []
    with db.db() as conn:
        conn.execute(
            """
            INSERT INTO map_walls(
              id, map_id, points_json, door, door_open, block_movement, block_sight
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                wid,
                map_id,
                json.dumps(points),
                1 if body.get("door") else 0,
                1 if body.get("door_open") else 0,
                1 if body.get("block_movement", True) else 0,
                1 if body.get("block_sight", True) else 0,
            ),
        )
    return next(w for w in list_walls(map_id) if w["id"] == wid)


def patch_wall(wall_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    with db.db() as conn:
        row = conn.execute(
            "SELECT * FROM map_walls WHERE id = ?", (wall_id,)
        ).fetchone()
        if not row:
            return None
        points = patch["points"] if "points" in patch and patch["points"] is not None else json.loads(row["points_json"])
        door = patch["door"] if "door" in patch and patch["door"] is not None else bool(row["door"])
        door_open = (
            patch["door_open"]
            if "door_open" in patch and patch["door_open"] is not None
            else bool(row["door_open"])
        )
        block_movement = (
            patch["block_movement"]
            if "block_movement" in patch and patch["block_movement"] is not None
            else bool(row["block_movement"])
        )
        block_sight = (
            patch["block_sight"]
            if "block_sight" in patch and patch["block_sight"] is not None
            else bool(row["block_sight"])
        )
        conn.execute(
            """
            UPDATE map_walls SET points_json = ?, door = ?, door_open = ?,
              block_movement = ?, block_sight = ? WHERE id = ?
            """,
            (
                json.dumps(points),
                1 if door else 0,
                1 if door_open else 0,
                1 if block_movement else 0,
                1 if block_sight else 0,
                wall_id,
            ),
        )
        map_id = row["map_id"]
    return next((w for w in list_walls(map_id) if w["id"] == wall_id), None)


def delete_wall(wall_id: str) -> bool:
    with db.db() as conn:
        cur = conn.execute("DELETE FROM map_walls WHERE id = ?", (wall_id,))
        return cur.rowcount > 0


# --- lights ---


def list_lights(map_id: str) -> list[dict[str, Any]]:
    with db.db() as conn:
        rows = conn.execute(
            "SELECT * FROM map_lights WHERE map_id = ?", (map_id,)
        ).fetchall()
    return [
        {
            "id": r["id"],
            "map_id": r["map_id"],
            "x": float(r["x"]),
            "y": float(r["y"]),
            "bright_ft": float(r["bright_ft"]),
            "dim_ft": float(r["dim_ft"]),
        }
        for r in rows
    ]


def add_light(map_id: str, body: dict[str, Any]) -> dict[str, Any]:
    if not get_map(map_id):
        raise ValueError("Map not found")
    lid = str(uuid.uuid4())
    with db.db() as conn:
        conn.execute(
            """
            INSERT INTO map_lights(id, map_id, x, y, bright_ft, dim_ft)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                lid,
                map_id,
                float(body.get("x") or 0),
                float(body.get("y") or 0),
                float(body.get("bright_ft") if body.get("bright_ft") is not None else 20),
                float(body.get("dim_ft") if body.get("dim_ft") is not None else 20),
            ),
        )
    return next(L for L in list_lights(map_id) if L["id"] == lid)


def patch_light(light_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    with db.db() as conn:
        row = conn.execute(
            "SELECT * FROM map_lights WHERE id = ?", (light_id,)
        ).fetchone()
        if not row:
            return None
        x = patch["x"] if patch.get("x") is not None else row["x"]
        y = patch["y"] if patch.get("y") is not None else row["y"]
        bright = patch["bright_ft"] if patch.get("bright_ft") is not None else row["bright_ft"]
        dim = patch["dim_ft"] if patch.get("dim_ft") is not None else row["dim_ft"]
        conn.execute(
            "UPDATE map_lights SET x = ?, y = ?, bright_ft = ?, dim_ft = ? WHERE id = ?",
            (float(x), float(y), float(bright), float(dim), light_id),
        )
        map_id = row["map_id"]
    return next((L for L in list_lights(map_id) if L["id"] == light_id), None)


def delete_light(light_id: str) -> bool:
    with db.db() as conn:
        cur = conn.execute("DELETE FROM map_lights WHERE id = ?", (light_id,))
        return cur.rowcount > 0


# --- fog ---


def save_fog_mask(map_id: str, data: bytes) -> dict[str, Any]:
    if not get_map(map_id):
        raise ValueError("Map not found")
    ensure_dirs()
    dest = MAP_FOG_DIR / f"{map_id}.png"
    dest.write_bytes(data)
    with db.db() as conn:
        conn.execute(
            """
            INSERT INTO map_fog(map_id, mask_path) VALUES (?, ?)
            ON CONFLICT(map_id) DO UPDATE SET mask_path = excluded.mask_path
            """,
            (map_id, str(dest)),
        )
    return get_map(map_id)  # type: ignore[return-value]


def reset_fog(map_id: str) -> dict[str, Any] | None:
    fog = MAP_FOG_DIR / f"{map_id}.png"
    if fog.exists():
        try:
            fog.unlink()
        except OSError:
            pass
    with db.db() as conn:
        conn.execute("DELETE FROM map_fog WHERE map_id = ?", (map_id,))
    return get_map(map_id)


# --- portals ---


def list_portals(map_id: str) -> list[dict[str, Any]]:
    with db.db() as conn:
        rows = conn.execute(
            "SELECT * FROM map_portals WHERE map_id = ?", (map_id,)
        ).fetchall()
    return [
        {
            "id": r["id"],
            "map_id": r["map_id"],
            "x": float(r["x"]),
            "y": float(r["y"]),
            "radius": float(r["radius"]),
            "target_map_id": r["target_map_id"],
            "target_x": float(r["target_x"]),
            "target_y": float(r["target_y"]),
            "label": r["label"],
        }
        for r in rows
    ]


def add_portal(map_id: str, body: dict[str, Any]) -> dict[str, Any]:
    if not get_map(map_id):
        raise ValueError("Map not found")
    target = body.get("target_map_id")
    if not target or not get_map(str(target)):
        raise ValueError("target_map_id required")
    pid = str(uuid.uuid4())
    with db.db() as conn:
        conn.execute(
            """
            INSERT INTO map_portals(
              id, map_id, x, y, radius, target_map_id, target_x, target_y, label
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pid,
                map_id,
                float(body.get("x") or 0),
                float(body.get("y") or 0),
                float(body.get("radius") if body.get("radius") is not None else 40),
                str(target),
                float(body.get("target_x") or 0),
                float(body.get("target_y") or 0),
                (body.get("label") or "Portal").strip() or "Portal",
            ),
        )
    return next(p for p in list_portals(map_id) if p["id"] == pid)


def patch_portal(portal_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    with db.db() as conn:
        row = conn.execute(
            "SELECT * FROM map_portals WHERE id = ?", (portal_id,)
        ).fetchone()
        if not row:
            return None
        fields = {
            "x": patch.get("x", row["x"]),
            "y": patch.get("y", row["y"]),
            "radius": patch.get("radius", row["radius"]),
            "target_map_id": patch.get("target_map_id", row["target_map_id"]),
            "target_x": patch.get("target_x", row["target_x"]),
            "target_y": patch.get("target_y", row["target_y"]),
            "label": patch.get("label", row["label"]),
        }
        conn.execute(
            """
            UPDATE map_portals SET x=?, y=?, radius=?, target_map_id=?,
              target_x=?, target_y=?, label=? WHERE id=?
            """,
            (
                float(fields["x"]),
                float(fields["y"]),
                float(fields["radius"]),
                fields["target_map_id"],
                float(fields["target_x"]),
                float(fields["target_y"]),
                fields["label"],
                portal_id,
            ),
        )
        map_id = row["map_id"]
    return next((p for p in list_portals(map_id) if p["id"] == portal_id), None)


def delete_portal(portal_id: str) -> bool:
    with db.db() as conn:
        cur = conn.execute("DELETE FROM map_portals WHERE id = ?", (portal_id,))
        return cur.rowcount > 0


def traverse_portal(portal_id: str, token_ids: list[str]) -> dict[str, Any]:
    with db.db() as conn:
        row = conn.execute(
            "SELECT * FROM map_portals WHERE id = ?", (portal_id,)
        ).fetchone()
    if not row:
        raise ValueError("Portal not found")
    target_map_id = row["target_map_id"]
    tx, ty = float(row["target_x"]), float(row["target_y"])
    moved = []
    for tid in token_ids:
        t = get_token(tid)
        if not t:
            continue
        patched = patch_token(
            tid,
            {"map_id": target_map_id, "x": tx, "y": ty},
        )
        # patch_token doesn't change map_id — do it explicitly
        with db.db() as conn:
            conn.execute(
                "UPDATE map_tokens SET map_id = ?, x = ?, y = ? WHERE id = ?",
                (target_map_id, tx, ty, tid),
            )
        moved.append(get_token(tid))
    activate_map(target_map_id)
    return {
        "map": get_map(target_map_id),
        "tokens": moved,
        "portal_id": portal_id,
    }


def refresh_token_portraits(map_id: str) -> None:
    """Update existing map token image_url + size from live catalogs (no placement)."""
    from . import monsters, npcs
    from .creature_size import ensure_character_size, ensure_creature_size
    from .portraits import with_portrait

    by_key = {(t["kind"], t.get("ref_id")): t for t in list_tokens(map_id) if t.get("ref_id")}

    for c in db.list_characters():
        c = with_portrait(ensure_character_size(c))
        tok = by_key.get(("pc", c["id"]))
        if not tok:
            continue
        # Only real uploaded portraits — never invent a humanoid face for PCs.
        want_img = c.get("image_url") or None
        patch: dict[str, Any] = {}
        if (tok.get("image_url") or None) != want_img:
            patch["image_url"] = want_img
        size = c.get("size") or "Medium"
        size_sq = float(c.get("size_sq") or size_to_squares(size))
        if tok.get("size") != size or float(tok.get("size_sq") or 0) != size_sq:
            patch["size"] = size
            patch["size_sq"] = size_sq
        if patch:
            patch_token(tok["id"], patch)

    for e in monsters.list_encounter():
        tok = by_key.get(("enemy", e["id"]))
        if not tok:
            continue
        img = placed_enemy_image(e, tok)
        data = e.get("template") or {}
        sized = ensure_creature_size(data if isinstance(data, dict) else {})
        size = e.get("size") or sized["size"]
        size_sq = float(e.get("size_sq") or sized["size_sq"])
        patch = {}
        if tok.get("image_url") != img:
            patch["image_url"] = img
        if tok.get("size") != size or float(tok.get("size_sq") or 0) != size_sq:
            patch["size"] = size
            patch["size_sq"] = size_sq
        if patch:
            patch_token(tok["id"], patch)

    for n in npcs.list_scene():
        tok = by_key.get(("npc", n["id"]))
        if not tok:
            continue
        img = n.get("image_url") or "/media/tokens/token-npc-generic.png"
        data = n.get("template") or {}
        sized = ensure_creature_size(data if isinstance(data, dict) else {}, "Medium")
        size = n.get("size") or sized["size"]
        size_sq = float(n.get("size_sq") or sized["size_sq"])
        patch = {}
        if tok.get("image_url") != img:
            patch["image_url"] = img
        if tok.get("size") != size or float(tok.get("size_sq") or 0) != size_sq:
            patch["size"] = size
            patch["size_sq"] = size_sq
        if patch:
            patch_token(tok["id"], patch)


def full_map_state(map_id: str) -> dict[str, Any] | None:
    m = get_map(map_id)
    if not m:
        return None
    try:
        refresh_token_portraits(map_id)
    except Exception:
        pass
    return {
        "map": m,
        "tokens": list_tokens(map_id),
        "walls": list_walls(map_id),
        "lights": list_lights(map_id),
        "portals": list_portals(map_id),
    }
