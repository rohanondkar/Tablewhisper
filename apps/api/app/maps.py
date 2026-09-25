"""Session battle maps: backgrounds, tokens, walls, fog, lights, portals."""

from __future__ import annotations

import base64
import json
import math
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
MAP_POOL_DIR = DATA_DIR / "map_pools"
MAP_GROUND_DIR = DATA_DIR / "map_ground"
MEDIA_MAPS = "/media/maps"
POOL_KINDS = ("water", "lava", "acid", "slime", "blood", "mana")
ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
# Pixel size of the play area. Square count × grid spacing, not the image file size.
MIN_MAP_PX = 16.0
MAX_MAP_PX = 40000.0


def ensure_dirs() -> None:
    MAP_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    MAP_FOG_DIR.mkdir(parents=True, exist_ok=True)
    MAP_POOL_DIR.mkdir(parents=True, exist_ok=True)
    MAP_GROUND_DIR.mkdir(parents=True, exist_ok=True)


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
              block_sight INTEGER NOT NULL DEFAULT 1,
              target_map_id TEXT,
              target_x REAL,
              target_y REAL,
              link_wall_id TEXT
            );
            CREATE TABLE IF NOT EXISTS map_lights (
              id TEXT PRIMARY KEY,
              map_id TEXT NOT NULL,
              x REAL NOT NULL,
              y REAL NOT NULL,
              bright_ft REAL NOT NULL DEFAULT 20,
              dim_ft REAL NOT NULL DEFAULT 20,
              kind TEXT NOT NULL DEFAULT 'torch'
            );
            CREATE TABLE IF NOT EXISTS map_fog (
              map_id TEXT PRIMARY KEY,
              mask_path TEXT
            );
            CREATE TABLE IF NOT EXISTS map_pools (
              id TEXT PRIMARY KEY,
              map_id TEXT NOT NULL,
              kind TEXT NOT NULL,
              depth_ft REAL NOT NULL DEFAULT 5,
              current_ft REAL NOT NULL DEFAULT 0,
              current_deg REAL NOT NULL DEFAULT 0,
              mask_path TEXT
            );
            CREATE TABLE IF NOT EXISTS map_ground (
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
        _ensure_map_columns(conn)


def _ensure_map_columns(conn: Any) -> None:
    """Add door links and light kind on maps created before those columns existed."""
    alters = (
        ("map_walls", "target_map_id", "TEXT"),
        ("map_walls", "target_x", "REAL"),
        ("map_walls", "target_y", "REAL"),
        ("map_walls", "link_wall_id", "TEXT"),
        ("map_lights", "kind", "TEXT NOT NULL DEFAULT 'torch'"),
    )
    for table, column, decl in alters:
        have = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        if column not in have:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


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
    return [_attach_ground(_attach_fog(_row_map(r))) for r in rows]


def get_map(map_id: str) -> dict[str, Any] | None:
    with db.db() as conn:
        row = conn.execute("SELECT * FROM maps WHERE id = ?", (map_id,)).fetchone()
    if not row:
        return None
    return _attach_ground(_attach_fog(_row_map(row)))


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
    return _attach_ground(_attach_fog(_row_map(row)))


def _attach_ground(m: dict[str, Any]) -> dict[str, Any]:
    with db.db() as conn:
        row = conn.execute(
            "SELECT mask_path FROM map_ground WHERE map_id = ?", (m["id"],)
        ).fetchone()
    path = Path(row["mask_path"]) if row and row["mask_path"] else None
    if path and path.exists():
        m["ground_url"] = f"{MEDIA_MAPS}/ground/{path.name}"
        m["ground_path"] = str(path)
    else:
        m["ground_url"] = None
    return m


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
        conn.execute("DELETE FROM map_pools WHERE map_id = ?", (map_id,))
        conn.execute("DELETE FROM map_ground WHERE map_id = ?", (map_id,))
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
    if MAP_POOL_DIR.exists():
        for mask in MAP_POOL_DIR.glob(f"{map_id}-*.png"):
            try:
                mask.unlink()
            except OSError:
                pass
    ground = MAP_GROUND_DIR / f"{map_id}.png"
    if ground.exists():
        try:
            ground.unlink()
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


def _creature_token_id(session_id: str, kind: str, ref_id: str | None) -> str | None:
    if not ref_id or kind not in ("pc", "enemy", "npc"):
        return None
    with db.db() as conn:
        row = conn.execute(
            """
            SELECT t.id FROM map_tokens t
            JOIN maps m ON m.id = t.map_id
            WHERE m.session_id = ? AND t.kind = ? AND t.ref_id = ?
            LIMIT 1
            """,
            (session_id, kind, ref_id),
        ).fetchone()
    return str(row["id"]) if row else None


def _alpha_covers(image: Any, x: float, y: float, map_w: float, map_h: float) -> bool:
    width, height = image.size
    if width < 1 or height < 1 or map_w <= 0 or map_h <= 0:
        return False
    px = int(max(0, min(width - 1, math.floor((x / map_w) * width))))
    py = int(max(0, min(height - 1, math.floor((y / map_h) * height))))
    return image.getpixel((px, py))[3] > 40


def _stand_images(map_id: str) -> tuple[Any, list[Any], list[tuple[float, float, float]]] | None:
    """Ground picture, pool pictures, and portals. None when this map has no ground mask."""
    from PIL import Image

    with db.db() as conn:
        row = conn.execute(
            "SELECT mask_path FROM map_ground WHERE map_id = ?", (map_id,)
        ).fetchone()
        pools = conn.execute(
            "SELECT mask_path FROM map_pools WHERE map_id = ?", (map_id,)
        ).fetchall()
        portals = conn.execute(
            "SELECT x, y, radius FROM map_portals WHERE map_id = ?", (map_id,)
        ).fetchall()
    if not row or not row["mask_path"] or not Path(row["mask_path"]).exists():
        return None
    ground = Image.open(row["mask_path"]).convert("RGBA")
    ground.load()
    pools_open: list[Any] = []
    for pool in pools:
        path = Path(pool["mask_path"] or "")
        if not path.exists():
            continue
        image = Image.open(path).convert("RGBA")
        image.load()
        pools_open.append(image)
    rings = [(float(item["x"]), float(item["y"]), float(item["radius"])) for item in portals]
    return ground, pools_open, rings


def _close_stand(images: tuple[Any, list[Any], list[tuple[float, float, float]]] | None) -> None:
    if not images:
        return
    ground, pools, _portals = images
    ground.close()
    for image in pools:
        image.close()


def _point_standable(
    m: dict[str, Any], x: float, y: float, images: tuple[Any, list[Any], list[tuple[float, float, float]]]
) -> bool:
    ground, pools, portals = images
    if _alpha_covers(ground, x, y, float(m["width"]), float(m["height"])):
        return True
    if any(_alpha_covers(image, x, y, float(m["width"]), float(m["height"])) for image in pools):
        return True
    return any(math.hypot(x - px, y - py) <= radius for px, py, radius in portals)


def _footprint_standable(
    m: dict[str, Any],
    x: float,
    y: float,
    size_sq: float,
    images: tuple[Any, list[Any], list[tuple[float, float, float]]],
) -> bool:
    gs = max(1.0, float(m["grid_size_px"]))
    count = max(1, math.ceil(size_sq))
    for col in range(count):
        for row in range(count):
            if not _point_standable(m, x + (col + 0.5) * gs, y + (row + 0.5) * gs, images):
                return False
    return True


def _first_stand(
    m: dict[str, Any], size_sq: float, images: tuple[Any, list[Any], list[tuple[float, float, float]]]
) -> tuple[float, float] | None:
    gs = max(1.0, float(m["grid_size_px"]))
    ox = float(m["grid_offset_x"])
    oy = float(m["grid_offset_y"])
    cols = max(1, math.ceil(float(m["width"]) / gs) + 2)
    rows = max(1, math.ceil(float(m["height"]) / gs) + 2)
    for row in range(rows):
        for col in range(cols):
            x = ox + col * gs
            y = oy + row * gs
            if _footprint_standable(m, x, y, size_sq, images):
                return x, y
    return None


def _settle_stand(m: dict[str, Any], x: float, y: float, size_sq: float) -> tuple[float, float]:
    images = _stand_images(m["id"])
    if images is None:
        return x, y
    try:
        if _footprint_standable(m, x, y, size_sq, images):
            return x, y
        found = _first_stand(m, size_sq, images)
    finally:
        _close_stand(images)
    if found is None:
        raise ValueError("No solid ground to set that on.")
    return found


def _reject_empty(m: dict[str, Any], x: float, y: float, size_sq: float) -> None:
    images = _stand_images(m["id"])
    if images is None:
        return
    try:
        ok = _footprint_standable(m, x, y, size_sq, images)
    finally:
        _close_stand(images)
    if not ok:
        raise ValueError("That square is empty.")


def add_token(map_id: str, body: dict[str, Any], *, move_existing: bool = True) -> dict[str, Any]:
    m = get_map(map_id)
    if not m:
        raise ValueError("Map not found")
    kind = body.get("kind") or "custom"
    ref_id = body.get("ref_id")
    existing_id = _creature_token_id(m["session_id"], kind, ref_id)
    if existing_id:
        if not move_existing:
            found = get_token(existing_id)
            if found:
                return found
        else:
            return _relocate_token(existing_id, map_id, body)
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
    place_x, place_y = _settle_stand(m, float(body.get("x") or 0), float(body.get("y") or 0), size_sq)
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
                place_x,
                place_y,
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


def _relocate_token(token_id: str, map_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Move the one row for this creature onto the map they are being placed on."""
    current = get_token(token_id)
    if not current:
        raise ValueError("Token not found")
    size = normalize_size(body.get("size") or current["size"], "Medium")
    size_sq = (
        float(body["size_sq"])
        if body.get("size_sq") is not None
        else float(current["size_sq"])
    )
    image_url = body.get("image_url") if "image_url" in body else current.get("image_url")
    m = get_map(map_id)
    if not m:
        raise ValueError("Map not found")
    place_x, place_y = _settle_stand(
        m,
        float(body.get("x") if body.get("x") is not None else current["x"]),
        float(body.get("y") if body.get("y") is not None else current["y"]),
        size_sq,
    )
    with db.db() as conn:
        conn.execute(
            """
            UPDATE map_tokens SET
              map_id = ?, label = ?, x = ?, y = ?, size = ?, size_sq = ?, image_url = ?
            WHERE id = ?
            """,
            (
                map_id,
                (body.get("label") or current["label"] or "Token").strip() or "Token",
                place_x,
                place_y,
                size,
                size_sq,
                image_url,
                token_id,
            ),
        )
    moved = get_token(token_id)
    if not moved:
        raise ValueError("Token not found")
    return moved


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
    moved = ("x" in patch and patch.get("x") is not None) or ("y" in patch and patch.get("y") is not None)
    if moved:
        m = get_map(t["map_id"])
        if m:
            _reject_empty(m, float(merged["x"]), float(merged["y"]), float(merged["size_sq"] or 1))
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
        if _creature_token_id(m["session_id"], "pc", c["id"]):
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
        if _creature_token_id(m["session_id"], "enemy", e["id"]):
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
        if _creature_token_id(m["session_id"], "npc", n["id"]):
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
    return [_wall_out(r) for r in rows]


def _wall_out(r: Any) -> dict[str, Any]:
    keys = set(r.keys())
    target_x = r["target_x"] if "target_x" in keys else None
    target_y = r["target_y"] if "target_y" in keys else None
    return {
        "id": r["id"],
        "map_id": r["map_id"],
        "points": json.loads(r["points_json"]),
        "door": bool(r["door"]),
        "door_open": bool(r["door_open"]),
        "block_movement": bool(r["block_movement"]),
        "block_sight": bool(r["block_sight"]),
        "target_map_id": r["target_map_id"] if "target_map_id" in keys else None,
        "target_x": float(target_x) if target_x is not None else None,
        "target_y": float(target_y) if target_y is not None else None,
        "link_wall_id": r["link_wall_id"] if "link_wall_id" in keys else None,
    }


def _midpoint(points: list[float]) -> tuple[float, float]:
    xs = points[0::2]
    ys = points[1::2]
    if not xs or not ys:
        return 0.0, 0.0
    return sum(xs) / len(xs), sum(ys) / len(ys)


def add_wall(map_id: str, body: dict[str, Any]) -> dict[str, Any]:
    if not get_map(map_id):
        raise ValueError("Map not found")
    wid = str(uuid.uuid4())
    points = body.get("points") or []
    with db.db() as conn:
        conn.execute(
            """
            INSERT INTO map_walls(
              id, map_id, points_json, door, door_open, block_movement, block_sight,
              target_map_id, target_x, target_y, link_wall_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                wid,
                map_id,
                json.dumps(points),
                1 if body.get("door") else 0,
                1 if body.get("door_open") else 0,
                1 if body.get("block_movement", True) else 0,
                1 if body.get("block_sight", True) else 0,
                body.get("target_map_id"),
                body.get("target_x"),
                body.get("target_y"),
                body.get("link_wall_id"),
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
        target_map_id = row["target_map_id"] if "target_map_id" in row.keys() else None
        target_x = row["target_x"] if "target_x" in row.keys() else None
        target_y = row["target_y"] if "target_y" in row.keys() else None
        link_wall_id = row["link_wall_id"] if "link_wall_id" in row.keys() else None
        if "target_map_id" in patch:
            target_map_id = patch["target_map_id"] or None
        if "target_x" in patch:
            target_x = patch["target_x"]
        if "target_y" in patch:
            target_y = patch["target_y"]
        if "link_wall_id" in patch:
            link_wall_id = patch["link_wall_id"] or None
        conn.execute(
            """
            UPDATE map_walls SET points_json = ?, door = ?, door_open = ?,
              block_movement = ?, block_sight = ?,
              target_map_id = ?, target_x = ?, target_y = ?, link_wall_id = ?
            WHERE id = ?
            """,
            (
                json.dumps(points),
                1 if door else 0,
                1 if door_open else 0,
                1 if block_movement else 0,
                1 if block_sight else 0,
                target_map_id,
                target_x,
                target_y,
                link_wall_id,
                wall_id,
            ),
        )
        map_id = row["map_id"]
    return next((w for w in list_walls(map_id) if w["id"] == wall_id), None)


def delete_wall(wall_id: str) -> bool:
    with db.db() as conn:
        conn.execute(
            "UPDATE map_walls SET link_wall_id = NULL WHERE link_wall_id = ?",
            (wall_id,),
        )
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
            "kind": (r["kind"] if "kind" in r.keys() and r["kind"] in ("torch", "lamp") else "torch"),
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
            INSERT INTO map_lights(id, map_id, x, y, bright_ft, dim_ft, kind)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                lid,
                map_id,
                float(body.get("x") or 0),
                float(body.get("y") or 0),
                float(body.get("bright_ft") if body.get("bright_ft") is not None else 20),
                float(body.get("dim_ft") if body.get("dim_ft") is not None else 20),
                body.get("kind") if body.get("kind") in ("torch", "lamp") else "torch",
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
        kind = row["kind"] if "kind" in row.keys() else "torch"
        if patch.get("kind") in ("torch", "lamp"):
            kind = patch["kind"]
        conn.execute(
            "UPDATE map_lights SET x = ?, y = ?, bright_ft = ?, dim_ft = ?, kind = ? WHERE id = ?",
            (float(x), float(y), float(bright), float(dim), kind, light_id),
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


def _pool_kind(value: Any) -> str:
    kind = str(value or "water").lower()
    return kind if kind in POOL_KINDS else "water"


def _pool_out(row: Any) -> dict[str, Any]:
    mask = row["mask_path"]
    return {
        "id": row["id"],
        "map_id": row["map_id"],
        "kind": row["kind"],
        "depth_ft": float(row["depth_ft"] or 0),
        "current_ft": float(row["current_ft"] or 0),
        "current_deg": float(row["current_deg"] or 0),
        "mask_url": f"{MEDIA_MAPS}/pools/{Path(mask).name}" if mask else None,
    }


def list_pools(map_id: str) -> list[dict[str, Any]]:
    with db.db() as conn:
        rows = conn.execute(
            "SELECT * FROM map_pools WHERE map_id = ? ORDER BY rowid ASC", (map_id,)
        ).fetchall()
    return [_pool_out(row) for row in rows]


def add_pool(map_id: str, body: dict[str, Any]) -> dict[str, Any]:
    if not get_map(map_id):
        raise ValueError("Map not found")
    pid = str(uuid.uuid4())
    with db.db() as conn:
        conn.execute(
            """
            INSERT INTO map_pools(id, map_id, kind, depth_ft, current_ft, current_deg, mask_path)
            VALUES (?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                pid,
                map_id,
                _pool_kind(body.get("kind")),
                float(body.get("depth_ft") if body.get("depth_ft") is not None else 5),
                max(0.0, float(body.get("current_ft") or 0)),
                float(body.get("current_deg") or 0) % 360,
            ),
        )
    return next(pool for pool in list_pools(map_id) if pool["id"] == pid)


def patch_pool(pool_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    with db.db() as conn:
        row = conn.execute("SELECT * FROM map_pools WHERE id = ?", (pool_id,)).fetchone()
        if not row:
            return None
        kind = _pool_kind(patch["kind"]) if "kind" in patch and patch["kind"] is not None else row["kind"]
        depth = float(patch["depth_ft"]) if patch.get("depth_ft") is not None else float(row["depth_ft"] or 0)
        current = max(0.0, float(patch["current_ft"])) if patch.get("current_ft") is not None else float(row["current_ft"] or 0)
        deg = float(patch["current_deg"]) % 360 if patch.get("current_deg") is not None else float(row["current_deg"] or 0)
        conn.execute(
            "UPDATE map_pools SET kind = ?, depth_ft = ?, current_ft = ?, current_deg = ? WHERE id = ?",
            (kind, depth, current, deg, pool_id),
        )
    return next((pool for pool in list_pools(row["map_id"]) if pool["id"] == pool_id), None)


def delete_pool(pool_id: str) -> bool:
    with db.db() as conn:
        row = conn.execute("SELECT map_id, mask_path FROM map_pools WHERE id = ?", (pool_id,)).fetchone()
        if not row:
            return False
        cur = conn.execute("DELETE FROM map_pools WHERE id = ?", (pool_id,))
    if row["mask_path"]:
        path = Path(row["mask_path"])
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass
    return cur.rowcount > 0


def save_pool_mask(pool_id: str, data: bytes) -> dict[str, Any]:
    with db.db() as conn:
        row = conn.execute("SELECT * FROM map_pools WHERE id = ?", (pool_id,)).fetchone()
    if not row:
        raise ValueError("Pool not found")
    ensure_dirs()
    dest = MAP_POOL_DIR / f"{row['map_id']}-{pool_id}.png"
    dest.write_bytes(data)
    with db.db() as conn:
        conn.execute("UPDATE map_pools SET mask_path = ? WHERE id = ?", (str(dest), pool_id))
    found = next((pool for pool in list_pools(row["map_id"]) if pool["id"] == pool_id), None)
    if not found:
        raise ValueError("Pool not found")
    return found


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


def _shift_off_segment(points: list[float], x: float, y: float, grid: float) -> tuple[float, float]:
    """Land beside a door so the token is not still sitting on the line."""
    if len(points) < 4:
        return x, y
    dx = float(points[2]) - float(points[0])
    dy = float(points[3]) - float(points[1])
    length = (dx * dx + dy * dy) ** 0.5 or 1.0
    push = max(12.0, grid * 0.65)
    return x + (-dy / length) * push, y + (dx / length) * push


def traverse_wall(wall_id: str, token_ids: list[str]) -> dict[str, Any]:
    with db.db() as conn:
        row = conn.execute("SELECT * FROM map_walls WHERE id = ?", (wall_id,)).fetchone()
    if not row:
        raise ValueError("Door not found")
    wall = _wall_out(row)
    if not wall["door"] or not wall["target_map_id"]:
        raise ValueError("That door does not lead anywhere")
    target_map = get_map(wall["target_map_id"])
    if not target_map:
        raise ValueError("The other map is gone")
    tx = float(wall["target_x"] or 0)
    ty = float(wall["target_y"] or 0)
    if wall["link_wall_id"]:
        with db.db() as conn:
            other = conn.execute(
                "SELECT * FROM map_walls WHERE id = ?", (wall["link_wall_id"],)
            ).fetchone()
        if other:
            points = json.loads(other["points_json"])
            tx, ty = _midpoint(points)
            tx, ty = _shift_off_segment(points, tx, ty, float(target_map["grid_size_px"]))
    moved = []
    for tid in token_ids:
        if not get_token(tid):
            continue
        with db.db() as conn:
            conn.execute(
                "UPDATE map_tokens SET map_id = ?, x = ?, y = ? WHERE id = ?",
                (wall["target_map_id"], tx, ty, tid),
            )
        moved.append(get_token(tid))
    activate_map(wall["target_map_id"])
    return {
        "map": get_map(wall["target_map_id"]),
        "tokens": moved,
        "wall_id": wall_id,
    }


def _save_ground_mask(conn: Any, map_id: str, raw: str) -> None:
    old = conn.execute("SELECT mask_path FROM map_ground WHERE map_id = ?", (map_id,)).fetchone()
    if old and old["mask_path"]:
        path = Path(old["mask_path"])
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(raw) if raw else b""
    except (ValueError, TypeError):
        data = b""
    if not data:
        conn.execute("DELETE FROM map_ground WHERE map_id = ?", (map_id,))
        return
    ensure_dirs()
    dest = MAP_GROUND_DIR / f"{map_id}.png"
    dest.write_bytes(data)
    conn.execute(
        """
        INSERT INTO map_ground(map_id, mask_path) VALUES (?, ?)
        ON CONFLICT(map_id) DO UPDATE SET mask_path = excluded.mask_path
        """,
        (map_id, str(dest)),
    )


def apply_map_setup(map_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Replace this map's marks with the ones confirmed on the setup screen."""
    if not get_map(map_id):
        raise ValueError("Map not found")
    fields = {}
    for key in (
        "name",
        "width",
        "height",
        "grid_size_px",
        "grid_offset_x",
        "grid_offset_y",
        "feet_per_square",
    ):
        if body.get(key) is not None:
            fields[key] = body[key]
    if fields:
        patch_map(map_id, fields)
    created: list[tuple[str, dict[str, Any]]] = []
    with db.db() as conn:
        conn.execute("DELETE FROM map_walls WHERE map_id = ?", (map_id,))
        conn.execute("DELETE FROM map_lights WHERE map_id = ?", (map_id,))
        conn.execute("DELETE FROM map_portals WHERE map_id = ?", (map_id,))
        old_pools = conn.execute("SELECT mask_path FROM map_pools WHERE map_id = ?", (map_id,)).fetchall()
        for old in old_pools:
            if old["mask_path"]:
                path = Path(old["mask_path"])
                if path.exists():
                    try:
                        path.unlink()
                    except OSError:
                        pass
        conn.execute("DELETE FROM map_pools WHERE map_id = ?", (map_id,))
        ensure_dirs()
        for wall in body.get("walls") or []:
            wid = str(uuid.uuid4())
            points = wall.get("points") or []
            conn.execute(
                """
                INSERT INTO map_walls(
                  id, map_id, points_json, door, door_open, block_movement, block_sight,
                  target_map_id, target_x, target_y, link_wall_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)
                """,
                (
                    wid,
                    map_id,
                    json.dumps(points),
                    1 if wall.get("door") else 0,
                    1 if wall.get("door_open") else 0,
                    1 if wall.get("block_movement", True) else 0,
                    1 if wall.get("block_sight", True) else 0,
                ),
            )
            created.append((wid, wall))
        for light in body.get("lights") or []:
            kind = light.get("kind") if light.get("kind") in ("torch", "lamp") else "torch"
            conn.execute(
                """
                INSERT INTO map_lights(id, map_id, x, y, bright_ft, dim_ft, kind)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    map_id,
                    float(light.get("x") or 0),
                    float(light.get("y") or 0),
                    float(light.get("bright_ft") if light.get("bright_ft") is not None else 20),
                    float(light.get("dim_ft") if light.get("dim_ft") is not None else 20),
                    kind,
                ),
            )
        for portal in body.get("portals") or []:
            if not portal.get("target_map_id"):
                continue
            conn.execute(
                """
                INSERT INTO map_portals(
                  id, map_id, x, y, radius, target_map_id, target_x, target_y, label
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    map_id,
                    float(portal.get("x") or 0),
                    float(portal.get("y") or 0),
                    float(portal.get("radius") or 36),
                    portal["target_map_id"],
                    float(portal.get("target_x") or 0),
                    float(portal.get("target_y") or 0),
                    (portal.get("label") or "Portal").strip() or "Portal",
                ),
            )
        for pool in body.get("pools") or []:
            raw = str(pool.get("mask_png") or "")
            if "," in raw:
                raw = raw.split(",", 1)[1]
            try:
                data = base64.b64decode(raw) if raw else b""
            except (ValueError, TypeError):
                data = b""
            if not data:
                continue
            pid = str(uuid.uuid4())
            dest = MAP_POOL_DIR / f"{map_id}-{pid}.png"
            dest.write_bytes(data)
            conn.execute(
                """
                INSERT INTO map_pools(id, map_id, kind, depth_ft, current_ft, current_deg, mask_path)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pid,
                    map_id,
                    _pool_kind(pool.get("kind")),
                    float(pool.get("depth_ft") if pool.get("depth_ft") is not None else 5),
                    max(0.0, float(pool.get("current_ft") or 0)),
                    float(pool.get("current_deg") or 0) % 360,
                    str(dest),
                ),
            )
        if "ground_png" in body and body.get("ground_png") is not None:
            _save_ground_mask(conn, map_id, str(body.get("ground_png") or ""))
        for wid, wall in created:
            if not wall.get("door") or not wall.get("target_map_id"):
                continue
            link_id = wall.get("link_wall_id") or None
            tx = wall.get("target_x")
            ty = wall.get("target_y")
            target_map_id = wall.get("target_map_id")
            if link_id:
                other = conn.execute(
                    "SELECT * FROM map_walls WHERE id = ?", (link_id,)
                ).fetchone()
                if other:
                    ox, oy = _midpoint(json.loads(other["points_json"]))
                    tx, ty = ox, oy
                    target_map_id = other["map_id"]
                    if wall.get("both_ways"):
                        mx, my = _midpoint(wall.get("points") or [])
                        conn.execute(
                            """
                            UPDATE map_walls
                            SET target_map_id = ?, target_x = ?, target_y = ?, link_wall_id = ?
                            WHERE id = ?
                            """,
                            (map_id, mx, my, wid, link_id),
                        )
            conn.execute(
                """
                UPDATE map_walls
                SET target_map_id = ?, target_x = ?, target_y = ?, link_wall_id = ?
                WHERE id = ?
                """,
                (target_map_id, tx, ty, link_id, wid),
            )
    state = full_map_state(map_id)
    if not state:
        raise ValueError("Map not found")
    return state


def refresh_token_portraits(map_id: str) -> None:
    """Update existing map token image_url + size from live catalogs (no placement)."""
    from . import monsters, npcs
    from .creature_size import ensure_character_size, ensure_creature_size
    from .portraits import with_portrait

    by_key = {(t["kind"], t.get("ref_id")): t for t in list_tokens(map_id) if t.get("ref_id")}

    import re

    enemy_ids = {e["id"] for e in monsters.list_encounter()}
    by_name = {str(m.get("name") or "").lower(): m for m in monsters.list_templates()}
    for tok in list_tokens(map_id):
        if tok.get("kind") != "enemy" or not tok.get("ref_id") or tok["ref_id"] in enemy_ids:
            continue
        bare = re.sub(r"\s+[A-Z]$", "", str(tok.get("label") or "")).strip()
        tmpl = by_name.get(bare.lower())
        if not tmpl:
            continue
        sized = ensure_creature_size(dict(tmpl))
        img = monsters.image_url_for(tmpl)
        sid = db.active_session_id()
        with db.db() as conn:
            conn.execute(
                """
                INSERT INTO encounter_enemies(
                  id, session_id, label, monster_id, name, ac, max_hp, current_hp, data_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tok["ref_id"],
                    sid,
                    tok.get("label") or tmpl.get("name"),
                    tmpl.get("id"),
                    tmpl.get("name"),
                    int(tmpl.get("ac") or 10),
                    int(tmpl.get("hp") or 1),
                    int(tmpl.get("hp") or 1),
                    json.dumps(tmpl),
                    db.utcnow(),
                ),
            )
        patch_token(
            tok["id"],
            {
                "image_url": img,
                "size": sized["size"],
                "size_sq": float(sized["size_sq"]),
            },
        )

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
        "pools": list_pools(map_id),
    }
