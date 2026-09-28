"""DM item library and map chests.

Standard cards come from gear_rules. Imported cards are saved here.
A chest stores a kind so a later mimic or cursed chest can reuse the row.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any
from urllib.parse import urlparse

import httpx

from . import db, gear_rules

_NAME_KEYS = ("name", "title", "item_name", "itemName")
_TYPE_KEYS = ("item_type", "type", "category", "kind")
_RARE_KEYS = ("rarity",)
_TEXT_KEYS = ("summary", "description", "desc", "text", "flavor")
_WEIGHT_KEYS = ("weight", "weight_lb", "weightLb", "lb")
_VALUE_KEYS = ("value", "cost", "price", "gp")
_SOURCE_KEYS = ("source", "url", "link", "href")


def ensure_tables() -> None:
    with db.db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS catalog_items (
              id TEXT PRIMARY KEY,
              source TEXT,
              name TEXT NOT NULL,
              item_type TEXT,
              rarity TEXT,
              summary TEXT,
              weight REAL,
              value TEXT,
              detail_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS map_chests (
              id TEXT PRIMARY KEY,
              map_id TEXT NOT NULL,
              name TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT 'chest',
              x REAL NOT NULL,
              y REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS chest_items (
              id TEXT PRIMARY KEY,
              chest_id TEXT NOT NULL,
              item_id TEXT NOT NULL,
              qty INTEGER NOT NULL DEFAULT 1
            );
            """
        )


def _card_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "source": row["source"],
        "origin": "imported",
        "name": row["name"],
        "item_type": row["item_type"],
        "rarity": row["rarity"],
        "summary": row["summary"] or "",
        "weight": row["weight"],
        "value": row["value"],
    }


def list_items() -> list[dict[str, Any]]:
    ensure_tables()
    cards = gear_rules.library_cards()
    with db.db() as conn:
        rows = conn.execute(
            "SELECT id, source, name, item_type, rarity, summary, weight, value FROM catalog_items ORDER BY name"
        ).fetchall()
    cards.extend(_card_from_row(row) for row in rows)
    return cards


def get_item(item_id: str) -> dict[str, Any] | None:
    for card in gear_rules.library_cards():
        if card["id"] == item_id:
            return card
    ensure_tables()
    with db.db() as conn:
        row = conn.execute(
            "SELECT id, source, name, item_type, rarity, summary, weight, value FROM catalog_items WHERE id = ?",
            (item_id,),
        ).fetchone()
    return _card_from_row(row) if row else None


def _first(raw: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in raw and raw[key] not in (None, ""):
            return raw[key]
    return None


def _as_weight(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().lower().replace("lb", "").replace("lbs", "").strip()
    try:
        return float(text)
    except ValueError:
        return None


def _as_value(value: Any) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).strip()
    return text or None


def normalize_item(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    name = _first(raw, _NAME_KEYS)
    if not isinstance(name, str) or not name.strip():
        return None
    summary = _first(raw, _TEXT_KEYS)
    summary_text = str(summary).strip() if isinstance(summary, str) else ""
    item_type = _first(raw, _TYPE_KEYS)
    rarity = _first(raw, _RARE_KEYS)
    source = _first(raw, _SOURCE_KEYS)
    return {
        "name": name.strip(),
        "item_type": str(item_type).strip().lower() if item_type else None,
        "rarity": str(rarity).strip().lower() if rarity else None,
        "summary": summary_text,
        "weight": _as_weight(_first(raw, _WEIGHT_KEYS)),
        "value": _as_value(_first(raw, _VALUE_KEYS)),
        "source": str(source).strip() if isinstance(source, str) and source.strip() else None,
    }


def _flatten_import(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        if isinstance(payload.get("items"), list):
            rows = payload["items"]
        elif isinstance(payload.get("item"), dict):
            rows = [payload["item"]]
        else:
            rows = [payload]
    else:
        rows = []
    cards = []
    for row in rows:
        card = normalize_item(row)
        if card:
            cards.append(card)
    return cards


def save_imported(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ensure_tables()
    saved: list[dict[str, Any]] = []
    with db.db() as conn:
        for card in cards:
            existing = None
            if card.get("source"):
                existing = conn.execute(
                    "SELECT id FROM catalog_items WHERE source = ?",
                    (card["source"],),
                ).fetchone()
            item_id = existing["id"] if existing else str(uuid.uuid4())
            if existing:
                conn.execute(
                    """
                    UPDATE catalog_items
                    SET name = ?, item_type = ?, rarity = ?, summary = ?, weight = ?, value = ?
                    WHERE id = ?
                    """,
                    (
                        card["name"],
                        card["item_type"],
                        card["rarity"],
                        card["summary"],
                        card["weight"],
                        card["value"],
                        item_id,
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO catalog_items(
                      id, source, name, item_type, rarity, summary, weight, value, detail_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')
                    """,
                    (
                        item_id,
                        card["source"],
                        card["name"],
                        card["item_type"],
                        card["rarity"],
                        card["summary"],
                        card["weight"],
                        card["value"],
                    ),
                )
            saved.append({**card, "id": item_id, "origin": "imported"})
    return saved


def import_payload(payload: Any) -> list[dict[str, Any]]:
    cards = _flatten_import(payload)
    if not cards:
        raise ValueError("That file did not include an item name.")
    return save_imported(cards)


def _json_blobs(text: str) -> list[Any]:
    found: list[Any] = []
    for match in re.finditer(
        r"<script[^>]*type=[\"']application/json[\"'][^>]*>(.*?)</script>",
        text,
        re.I | re.S,
    ):
        try:
            found.append(json.loads(match.group(1)))
        except json.JSONDecodeError:
            continue
    return found


def _walk_items(node: Any, out: list[dict[str, Any]]) -> None:
    if isinstance(node, dict):
        card = normalize_item(node)
        if card and (card["summary"] or card["item_type"] or card["weight"] is not None or card["value"]):
            out.append(card)
        for value in node.values():
            _walk_items(value, out)
    elif isinstance(node, list):
        for value in node:
            _walk_items(value, out)


def import_url(url: str) -> list[dict[str, Any]]:
    parsed = urlparse((url or "").strip())
    host = parsed.netloc.lower().split(":")[0]
    if parsed.scheme not in {"http", "https"} or not (host == "lootstash.app" or host.endswith(".lootstash.app")):
        raise ValueError("Use a lootstash.app item link.")
    try:
        response = httpx.get(url, timeout=15.0, follow_redirects=True)
    except httpx.HTTPError as exc:
        raise ValueError("That link could not be read.") from exc
    if response.status_code >= 400:
        raise ValueError("That link could not be read.")
    content_type = response.headers.get("content-type", "")
    blobs: list[Any] = []
    if "json" in content_type:
        try:
            blobs.append(response.json())
        except json.JSONDecodeError:
            blobs = []
    else:
        blobs = _json_blobs(response.text)
        stripped = response.text.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            try:
                blobs.append(json.loads(stripped))
            except json.JSONDecodeError:
                pass
    found: list[dict[str, Any]] = []
    for blob in blobs:
        _walk_items(blob, found)
    if not found:
        raise ValueError("That page did not include an item. Save the item as JSON and import the file.")
    # One link imports one item: the first card that has a name, stamped with the link.
    card = dict(found[0])
    card["source"] = url.strip()
    return save_imported([card])


def _content_rows(conn: Any, chest_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, item_id, qty FROM chest_items WHERE chest_id = ? ORDER BY rowid",
        (chest_id,),
    ).fetchall()
    return [{"id": row["id"], "item_id": row["item_id"], "qty": int(row["qty"])} for row in rows]


def _resolve_contents(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for row in rows:
        item = get_item(row["item_id"])
        if not item:
            continue
        out.append({"id": row["id"], "qty": row["qty"], "item": item})
    return out


def _chest_from(row: dict[str, Any], contents: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "map_id": row["map_id"],
        "name": row["name"],
        "kind": row["kind"] or "chest",
        "x": row["x"],
        "y": row["y"],
        "contents": _resolve_contents(contents),
    }


def _snap_chest(row: Any, contents: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    return (
        {
            "id": row["id"],
            "map_id": row["map_id"],
            "name": row["name"],
            "kind": row["kind"],
            "x": row["x"],
            "y": row["y"],
        },
        contents,
    )


def list_chests(map_id: str) -> list[dict[str, Any]]:
    ensure_tables()
    with db.db() as conn:
        rows = conn.execute(
            "SELECT id, map_id, name, kind, x, y FROM map_chests WHERE map_id = ? ORDER BY rowid",
            (map_id,),
        ).fetchall()
        packed = [_snap_chest(row, _content_rows(conn, row["id"])) for row in rows]
    return [_chest_from(row, contents) for row, contents in packed]


def get_chest(chest_id: str) -> dict[str, Any] | None:
    ensure_tables()
    with db.db() as conn:
        row = conn.execute(
            "SELECT id, map_id, name, kind, x, y FROM map_chests WHERE id = ?",
            (chest_id,),
        ).fetchone()
        if not row:
            return None
        snapped, contents = _snap_chest(row, _content_rows(conn, row["id"]))
    return _chest_from(snapped, contents)


def create_chest(map_id: str, name: str, x: float, y: float, kind: str = "chest") -> dict[str, Any]:
    ensure_tables()
    chest_id = str(uuid.uuid4())
    label = (name or "Chest").strip() or "Chest"
    stored_kind = (kind or "chest").strip() or "chest"
    with db.db() as conn:
        conn.execute(
            "INSERT INTO map_chests(id, map_id, name, kind, x, y) VALUES (?, ?, ?, ?, ?, ?)",
            (chest_id, map_id, label, stored_kind, float(x), float(y)),
        )
    found = get_chest(chest_id)
    assert found is not None
    return found


def patch_chest(chest_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    current = get_chest(chest_id)
    if not current:
        return None
    name = patch.get("name", current["name"])
    kind = patch.get("kind", current["kind"])
    x = patch.get("x", current["x"])
    y = patch.get("y", current["y"])
    with db.db() as conn:
        conn.execute(
            "UPDATE map_chests SET name = ?, kind = ?, x = ?, y = ? WHERE id = ?",
            ((str(name).strip() or "Chest"), (str(kind).strip() or "chest"), float(x), float(y), chest_id),
        )
    return get_chest(chest_id)


def delete_chest(chest_id: str) -> bool:
    ensure_tables()
    with db.db() as conn:
        row = conn.execute("SELECT id FROM map_chests WHERE id = ?", (chest_id,)).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM chest_items WHERE chest_id = ?", (chest_id,))
        conn.execute("DELETE FROM map_chests WHERE id = ?", (chest_id,))
    return True


def delete_chests_for_map(map_id: str) -> None:
    ensure_tables()
    with db.db() as conn:
        ids = conn.execute("SELECT id FROM map_chests WHERE map_id = ?", (map_id,)).fetchall()
        for row in ids:
            conn.execute("DELETE FROM chest_items WHERE chest_id = ?", (row["id"],))
        conn.execute("DELETE FROM map_chests WHERE map_id = ?", (map_id,))


def add_content(chest_id: str, item_id: str, qty: int = 1) -> dict[str, Any] | None:
    if not get_chest(chest_id) or not get_item(item_id):
        return None
    count = max(1, int(qty))
    with db.db() as conn:
        existing = conn.execute(
            "SELECT id, qty FROM chest_items WHERE chest_id = ? AND item_id = ?",
            (chest_id, item_id),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE chest_items SET qty = ? WHERE id = ?",
                (int(existing["qty"]) + count, existing["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO chest_items(id, chest_id, item_id, qty) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), chest_id, item_id, count),
            )
    return get_chest(chest_id)


def set_content_qty(row_id: str, qty: int) -> dict[str, Any] | None:
    ensure_tables()
    with db.db() as conn:
        row = conn.execute("SELECT chest_id FROM chest_items WHERE id = ?", (row_id,)).fetchone()
        if not row:
            return None
        count = int(qty)
        if count <= 0:
            conn.execute("DELETE FROM chest_items WHERE id = ?", (row_id,))
        else:
            conn.execute("UPDATE chest_items SET qty = ? WHERE id = ?", (count, row_id))
        chest_id = row["chest_id"]
    return get_chest(chest_id)


def remove_content(row_id: str) -> dict[str, Any] | None:
    return set_content_qty(row_id, 0)
