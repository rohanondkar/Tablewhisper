"""Session faction board: factions, people, and relationship edges."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from . import db
from .config import DATA_DIR

KINDS = ("person", "character", "npc", "faction")
PATTERNS = ("solid", "stripes", "checks", "dots", "scales", "leaves", "wraps")
EDGE_LABELS = ("ally", "rival", "enemy", "family", "serves", "owes", "custom")

FACTION_IMAGE_DIR = DATA_DIR / "faction_images"
MEDIA_FACTIONS = "/media/factions"


def ensure_tables() -> None:
    FACTION_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    with db.db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS factions (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              name TEXT NOT NULL,
              color TEXT NOT NULL DEFAULT '#8b5a2b',
              pattern TEXT NOT NULL DEFAULT 'solid',
              leader_node_id TEXT,
              notes TEXT NOT NULL DEFAULT '',
              summary TEXT NOT NULL DEFAULT '',
              image_path TEXT,
              x REAL NOT NULL DEFAULT 0,
              y REAL NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS relation_nodes (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              kind TEXT NOT NULL,
              ref_id TEXT,
              name TEXT NOT NULL,
              faction_id TEXT,
              role TEXT NOT NULL DEFAULT '',
              color TEXT NOT NULL DEFAULT '#6b7280',
              pattern TEXT NOT NULL DEFAULT 'solid',
              x REAL NOT NULL DEFAULT 0,
              y REAL NOT NULL DEFAULT 0,
              notes TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS relation_edges (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              from_id TEXT NOT NULL,
              to_id TEXT NOT NULL,
              label TEXT NOT NULL DEFAULT 'ally',
              notes TEXT NOT NULL DEFAULT ''
            );
            """
        )
        have = {row[1] for row in conn.execute("PRAGMA table_info(factions)")}
        if "summary" not in have:
            conn.execute("ALTER TABLE factions ADD COLUMN summary TEXT NOT NULL DEFAULT ''")
        if "image_path" not in have:
            conn.execute("ALTER TABLE factions ADD COLUMN image_path TEXT")


def _faction_image_url(path: Any) -> str | None:
    if not path:
        return None
    name = Path(str(path)).name
    return f"{MEDIA_FACTIONS}/{name}"


def _faction_out(row: Any) -> dict[str, Any]:
    keys = set(row.keys())
    image_path = row["image_path"] if "image_path" in keys else None
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "name": row["name"],
        "color": row["color"],
        "pattern": row["pattern"],
        "leader_node_id": row["leader_node_id"],
        "notes": row["notes"] or "",
        "summary": (row["summary"] if "summary" in keys else "") or "",
        "image_path": image_path,
        "image_url": _faction_image_url(image_path),
        "x": float(row["x"]),
        "y": float(row["y"]),
    }


def _pattern(value: Any) -> str:
    text = str(value or "solid").strip().lower()
    return text if text in PATTERNS else "solid"


def _color(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    if text.startswith("#") and len(text) in (4, 7):
        return text
    return fallback


def _kind(value: Any) -> str:
    text = str(value or "person").strip().lower()
    return text if text in KINDS else "person"


def _label(value: Any) -> str:
    text = str(value or "ally").strip().lower() or "ally"
    if text in EDGE_LABELS and text != "custom":
        return text
    return text[:40] or "ally"


def _node_out(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "kind": row["kind"],
        "ref_id": row["ref_id"],
        "name": row["name"],
        "faction_id": row["faction_id"],
        "role": row["role"] or "",
        "color": row["color"],
        "pattern": row["pattern"],
        "x": float(row["x"]),
        "y": float(row["y"]),
        "notes": row["notes"] or "",
    }


def _edge_out(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "session_id": row["session_id"],
        "from_id": row["from_id"],
        "to_id": row["to_id"],
        "label": row["label"],
        "notes": row["notes"] or "",
    }


def board_state(session_id: str | None = None) -> dict[str, Any]:
    ensure_tables()
    sid = session_id or db.active_session_id()
    with db.db() as conn:
        factions = conn.execute(
            "SELECT * FROM factions WHERE session_id = ? ORDER BY name COLLATE NOCASE",
            (sid,),
        ).fetchall()
        nodes = conn.execute(
            "SELECT * FROM relation_nodes WHERE session_id = ? ORDER BY name COLLATE NOCASE",
            (sid,),
        ).fetchall()
        edges = conn.execute(
            "SELECT * FROM relation_edges WHERE session_id = ? ORDER BY rowid ASC",
            (sid,),
        ).fetchall()
    return {
        "session_id": sid,
        "factions": [_faction_out(row) for row in factions],
        "nodes": [_node_out(row) for row in nodes],
        "edges": [_edge_out(row) for row in edges],
    }


def create_faction(body: dict[str, Any]) -> dict[str, Any]:
    ensure_tables()
    sid = db.active_session_id()
    fid = str(uuid.uuid4())
    nid = str(uuid.uuid4())
    name = str(body.get("name") or "").strip() or "Faction"
    color = _color(body.get("color"), "#8b5a2b")
    pattern = _pattern(body.get("pattern"))
    notes = str(body.get("notes") or "")
    summary = str(body.get("summary") or "")
    x = float(body.get("x") if body.get("x") is not None else 200)
    y = float(body.get("y") if body.get("y") is not None else 200)
    with db.db() as conn:
        conn.execute(
            """
            INSERT INTO factions(id, session_id, name, color, pattern, leader_node_id, notes, summary, image_path, x, y)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?)
            """,
            (fid, sid, name, color, pattern, notes, summary, x, y),
        )
        conn.execute(
            """
            INSERT INTO relation_nodes(
              id, session_id, kind, ref_id, name, faction_id, role, color, pattern, x, y, notes
            ) VALUES (?, ?, 'faction', ?, ?, ?, 'hub', ?, ?, ?, ?, ?)
            """,
            (nid, sid, fid, name, fid, color, pattern, x, y, notes),
        )
    return board_state(sid)


def patch_faction(faction_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    ensure_tables()
    with db.db() as conn:
        row = conn.execute("SELECT * FROM factions WHERE id = ?", (faction_id,)).fetchone()
        if not row:
            return None
        name = str(patch["name"]).strip() if "name" in patch and patch["name"] is not None else row["name"]
        color = _color(patch.get("color"), row["color"]) if "color" in patch else row["color"]
        pattern = _pattern(patch.get("pattern")) if "pattern" in patch else row["pattern"]
        notes = str(patch["notes"]) if "notes" in patch and patch["notes"] is not None else (row["notes"] or "")
        summary = (
            str(patch["summary"])
            if "summary" in patch and patch["summary"] is not None
            else ((row["summary"] if "summary" in row.keys() else "") or "")
        )
        x = float(patch["x"]) if "x" in patch and patch["x"] is not None else float(row["x"])
        y = float(patch["y"]) if "y" in patch and patch["y"] is not None else float(row["y"])
        leader = row["leader_node_id"]
        if "leader_node_id" in patch:
            leader = patch["leader_node_id"] or None
            if leader:
                node = conn.execute(
                    "SELECT id FROM relation_nodes WHERE id = ? AND session_id = ?",
                    (leader, row["session_id"]),
                ).fetchone()
                if not node:
                    raise ValueError("Leader must be a node on this board.")
        conn.execute(
            """
            UPDATE factions SET name = ?, color = ?, pattern = ?, leader_node_id = ?, notes = ?, summary = ?, x = ?, y = ?
            WHERE id = ?
            """,
            (name or row["name"], color, pattern, leader, notes, summary, x, y, faction_id),
        )
        hub = conn.execute(
            "SELECT id FROM relation_nodes WHERE session_id = ? AND kind = 'faction' AND ref_id = ?",
            (row["session_id"], faction_id),
        ).fetchone()
        if hub:
            conn.execute(
                """
                UPDATE relation_nodes SET name = ?, color = ?, pattern = ?, x = ?, y = ?, notes = ?
                WHERE id = ?
                """,
                (name or row["name"], color, pattern, x, y, notes, hub["id"]),
            )
        if leader:
            conn.execute(
                "UPDATE relation_nodes SET faction_id = ?, role = CASE WHEN role = '' THEN 'leader' ELSE role END WHERE id = ?",
                (faction_id, leader),
            )
    return board_state()


def delete_faction(faction_id: str) -> bool:
    ensure_tables()
    with db.db() as conn:
        row = conn.execute("SELECT id FROM factions WHERE id = ?", (faction_id,)).fetchone()
        if not row:
            return False
        hubs = conn.execute(
            "SELECT id FROM relation_nodes WHERE kind = 'faction' AND ref_id = ?",
            (faction_id,),
        ).fetchall()
        hub_ids = {h["id"] for h in hubs}
        conn.execute("UPDATE relation_nodes SET faction_id = NULL WHERE faction_id = ?", (faction_id,))
        for hid in hub_ids:
            conn.execute("DELETE FROM relation_edges WHERE from_id = ? OR to_id = ?", (hid, hid))
            conn.execute("DELETE FROM relation_nodes WHERE id = ?", (hid,))
        conn.execute("DELETE FROM factions WHERE id = ?", (faction_id,))
    return True


def create_node(body: dict[str, Any]) -> dict[str, Any]:
    ensure_tables()
    sid = db.active_session_id()
    nid = str(uuid.uuid4())
    kind = _kind(body.get("kind"))
    if kind == "faction":
        raise ValueError("Use Add faction to place a faction hub.")
    name = str(body.get("name") or "").strip() or "Person"
    color = _color(body.get("color"), "#6b7280")
    pattern = _pattern(body.get("pattern"))
    faction_id = body.get("faction_id") or None
    if faction_id:
        with db.db() as conn:
            if not conn.execute(
                "SELECT id FROM factions WHERE id = ? AND session_id = ?", (faction_id, sid)
            ).fetchone():
                raise ValueError("Faction not found.")
    with db.db() as conn:
        conn.execute(
            """
            INSERT INTO relation_nodes(
              id, session_id, kind, ref_id, name, faction_id, role, color, pattern, x, y, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                nid,
                sid,
                kind,
                body.get("ref_id") or None,
                name,
                faction_id,
                str(body.get("role") or ""),
                color,
                pattern,
                float(body.get("x") if body.get("x") is not None else 240),
                float(body.get("y") if body.get("y") is not None else 240),
                str(body.get("notes") or ""),
            ),
        )
    return board_state(sid)


def patch_node(node_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    ensure_tables()
    with db.db() as conn:
        row = conn.execute("SELECT * FROM relation_nodes WHERE id = ?", (node_id,)).fetchone()
        if not row:
            return None
        kind = _kind(patch.get("kind")) if "kind" in patch else row["kind"]
        if row["kind"] == "faction":
            kind = "faction"
        name = str(patch["name"]).strip() if "name" in patch and patch["name"] is not None else row["name"]
        color = _color(patch.get("color"), row["color"]) if "color" in patch else row["color"]
        pattern = _pattern(patch.get("pattern")) if "pattern" in patch else row["pattern"]
        notes = str(patch["notes"]) if "notes" in patch and patch["notes"] is not None else (row["notes"] or "")
        role = str(patch["role"]) if "role" in patch and patch["role"] is not None else (row["role"] or "")
        ref_id = patch["ref_id"] if "ref_id" in patch else row["ref_id"]
        faction_id = patch["faction_id"] if "faction_id" in patch else row["faction_id"]
        if faction_id:
            if not conn.execute(
                "SELECT id FROM factions WHERE id = ? AND session_id = ?",
                (faction_id, row["session_id"]),
            ).fetchone():
                raise ValueError("Faction not found.")
        x = float(patch["x"]) if "x" in patch and patch["x"] is not None else float(row["x"])
        y = float(patch["y"]) if "y" in patch and patch["y"] is not None else float(row["y"])
        conn.execute(
            """
            UPDATE relation_nodes SET kind = ?, ref_id = ?, name = ?, faction_id = ?, role = ?,
              color = ?, pattern = ?, x = ?, y = ?, notes = ?
            WHERE id = ?
            """,
            (kind, ref_id, name or row["name"], faction_id, role, color, pattern, x, y, notes, node_id),
        )
        if kind == "faction" and row["ref_id"]:
            conn.execute(
                "UPDATE factions SET name = ?, color = ?, pattern = ?, notes = ?, x = ?, y = ? WHERE id = ?",
                (name or row["name"], color, pattern, notes, x, y, row["ref_id"]),
            )
    return board_state()


def delete_node(node_id: str) -> bool:
    ensure_tables()
    with db.db() as conn:
        row = conn.execute("SELECT * FROM relation_nodes WHERE id = ?", (node_id,)).fetchone()
        if not row:
            return False
        if row["kind"] == "faction" and row["ref_id"]:
            return delete_faction(row["ref_id"])
        conn.execute("UPDATE factions SET leader_node_id = NULL WHERE leader_node_id = ?", (node_id,))
        conn.execute("DELETE FROM relation_edges WHERE from_id = ? OR to_id = ?", (node_id, node_id))
        conn.execute("DELETE FROM relation_nodes WHERE id = ?", (node_id,))
    return True


def create_edge(body: dict[str, Any]) -> dict[str, Any]:
    ensure_tables()
    sid = db.active_session_id()
    from_id = str(body.get("from_id") or "")
    to_id = str(body.get("to_id") or "")
    if not from_id or not to_id or from_id == to_id:
        raise ValueError("Pick two different people or factions to link.")
    with db.db() as conn:
        a = conn.execute(
            "SELECT id FROM relation_nodes WHERE id = ? AND session_id = ?", (from_id, sid)
        ).fetchone()
        b = conn.execute(
            "SELECT id FROM relation_nodes WHERE id = ? AND session_id = ?", (to_id, sid)
        ).fetchone()
        if not a or not b:
            raise ValueError("Both ends of the link must be on this board.")
        eid = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO relation_edges(id, session_id, from_id, to_id, label, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (eid, sid, from_id, to_id, _label(body.get("label")), str(body.get("notes") or "")),
        )
    return board_state(sid)


def patch_edge(edge_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    ensure_tables()
    with db.db() as conn:
        row = conn.execute("SELECT * FROM relation_edges WHERE id = ?", (edge_id,)).fetchone()
        if not row:
            return None
        label = _label(patch.get("label")) if "label" in patch else row["label"]
        notes = str(patch["notes"]) if "notes" in patch and patch["notes"] is not None else (row["notes"] or "")
        conn.execute(
            "UPDATE relation_edges SET label = ?, notes = ? WHERE id = ?",
            (label, notes, edge_id),
        )
    return board_state()


def delete_edge(edge_id: str) -> bool:
    ensure_tables()
    with db.db() as conn:
        cur = conn.execute("DELETE FROM relation_edges WHERE id = ?", (edge_id,))
        return cur.rowcount > 0


def set_faction_image(faction_id: str, upload_path: Path, filename: str) -> dict[str, Any] | None:
    ensure_tables()
    with db.db() as conn:
        row = conn.execute("SELECT * FROM factions WHERE id = ?", (faction_id,)).fetchone()
        if not row:
            return None
    FACTION_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        ext = ".png"
    dest = FACTION_IMAGE_DIR / f"{faction_id}{ext}"
    for old in FACTION_IMAGE_DIR.glob(f"{faction_id}.*"):
        if old.name != dest.name and old.is_file():
            try:
                old.unlink()
            except OSError:
                pass
    dest.write_bytes(Path(upload_path).read_bytes())
    with db.db() as conn:
        conn.execute("UPDATE factions SET image_path = ? WHERE id = ?", (str(dest), faction_id))
    return board_state()


def export_board() -> dict[str, Any]:
    return board_state()


def restore_board(payload: dict[str, Any]) -> None:
    ensure_tables()
    sid = db.active_session_id()
    with db.db() as conn:
        old_nodes = conn.execute("SELECT id FROM relation_nodes WHERE session_id = ?", (sid,)).fetchall()
        for node in old_nodes:
            conn.execute("DELETE FROM relation_edges WHERE from_id = ? OR to_id = ?", (node["id"], node["id"]))
        conn.execute("DELETE FROM relation_edges WHERE session_id = ?", (sid,))
        conn.execute("DELETE FROM relation_nodes WHERE session_id = ?", (sid,))
        conn.execute("DELETE FROM factions WHERE session_id = ?", (sid,))
        for row in payload.get("factions") or []:
            conn.execute(
                """
                INSERT INTO factions(id, session_id, name, color, pattern, leader_node_id, notes, summary, image_path, x, y)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row.get("id") or str(uuid.uuid4()),
                    sid,
                    str(row.get("name") or "Faction"),
                    _color(row.get("color"), "#8b5a2b"),
                    _pattern(row.get("pattern")),
                    row.get("leader_node_id"),
                    str(row.get("notes") or ""),
                    str(row.get("summary") or ""),
                    row.get("image_path"),
                    float(row.get("x") or 0),
                    float(row.get("y") or 0),
                ),
            )
        for row in payload.get("nodes") or []:
            conn.execute(
                """
                INSERT INTO relation_nodes(
                  id, session_id, kind, ref_id, name, faction_id, role, color, pattern, x, y, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row.get("id") or str(uuid.uuid4()),
                    sid,
                    _kind(row.get("kind")),
                    row.get("ref_id"),
                    str(row.get("name") or "Person"),
                    row.get("faction_id"),
                    str(row.get("role") or ""),
                    _color(row.get("color"), "#6b7280"),
                    _pattern(row.get("pattern")),
                    float(row.get("x") or 0),
                    float(row.get("y") or 0),
                    str(row.get("notes") or ""),
                ),
            )
        for row in payload.get("edges") or []:
            conn.execute(
                """
                INSERT INTO relation_edges(id, session_id, from_id, to_id, label, notes)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    row.get("id") or str(uuid.uuid4()),
                    sid,
                    row.get("from_id"),
                    row.get("to_id"),
                    _label(row.get("label")),
                    str(row.get("notes") or ""),
                ),
            )
