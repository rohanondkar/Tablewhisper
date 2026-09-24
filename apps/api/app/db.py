from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from .config import DB_PATH, DEFAULT_BUFFER_SECONDS, DEFAULT_OLLAMA_MODEL, DEFAULT_RULESET, DEFAULT_WHISPER_MODEL


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS characters (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              data_json TEXT NOT NULL,
              source_pdf TEXT,
              pdf_hash TEXT,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL DEFAULT 'Session',
              created_at TEXT NOT NULL,
              active INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS events (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              query TEXT NOT NULL,
              result_json TEXT NOT NULL,
              FOREIGN KEY(session_id) REFERENCES sessions(id)
            );
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
        # Migrate older DBs missing sessions.name
        cols = {r[1] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()}
        if "name" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT 'Session'")
        event_cols = {r[1] for r in conn.execute("PRAGMA table_info(events)").fetchall()}
        if "source" not in event_cols:
            conn.execute("ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT 'console'")
        defaults = {
            "active_ruleset": DEFAULT_RULESET,
            "ollama_model": DEFAULT_OLLAMA_MODEL,
            "whisper_model": DEFAULT_WHISPER_MODEL,
            "buffer_seconds": str(DEFAULT_BUFFER_SECONDS),
            "hotkey": "CommandOrControl+N",
        }
        for key, value in defaults.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
                (key, value),
            )
        row = conn.execute("SELECT id FROM sessions WHERE active = 1 LIMIT 1").fetchone()
        if not row:
            sid = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO sessions(id, name, created_at, active) VALUES (?, ?, ?, 1)",
                (sid, "Session 1", utcnow()),
            )
        else:
            # Ensure existing rows have usable names
            conn.execute(
                "UPDATE sessions SET name = 'Session 1' WHERE (name IS NULL OR name = '') AND id = ?",
                (row["id"],),
            )


def get_setting(key: str, default: str | None = None) -> str | None:
    with db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    with db() as conn:
        conn.execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def get_settings() -> dict[str, str]:
    with db() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        return {r["key"]: r["value"] for r in rows}


def list_characters() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT data_json FROM characters ORDER BY name COLLATE NOCASE"
        ).fetchall()
        return [json.loads(r["data_json"]) for r in rows]


def get_character(char_id: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute(
            "SELECT data_json FROM characters WHERE id = ?", (char_id,)
        ).fetchone()
        return json.loads(row["data_json"]) if row else None


def public_character(data: dict[str, Any]) -> dict[str, Any]:
    from .creature_size import ensure_character_size
    from .equipment import ensure as ensure_equipment
    from .portraits import with_portrait
    from .xp import ensure_character_progress

    out = ensure_character_progress(dict(data))
    out = ensure_character_size(out)
    out = ensure_equipment(out)
    out = with_portrait(out)
    out.pop("raw_fields", None)
    return out


def upsert_character(data: dict[str, Any]) -> dict[str, Any]:
    from .creature_size import ensure_character_size
    from .xp import ensure_character_progress

    data = ensure_character_progress(dict(data))
    data = ensure_character_size(data)
    data["updated_at"] = utcnow()
    with db() as conn:
        conn.execute(
            """
            INSERT INTO characters(id, name, data_json, source_pdf, pdf_hash, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              data_json = excluded.data_json,
              source_pdf = excluded.source_pdf,
              pdf_hash = excluded.pdf_hash,
              updated_at = excluded.updated_at
            """,
            (
                data["id"],
                data["name"],
                json.dumps(data),
                data.get("source_pdf"),
                data.get("pdf_hash"),
                data["updated_at"],
            ),
        )
    return data


def delete_character(char_id: str) -> bool:
    with db() as conn:
        cur = conn.execute("DELETE FROM characters WHERE id = ?", (char_id,))
        return cur.rowcount > 0


def active_session_id() -> str:
    with db() as conn:
        row = conn.execute("SELECT id FROM sessions WHERE active = 1 LIMIT 1").fetchone()
        if row:
            return row["id"]
        sid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO sessions(id, name, created_at, active) VALUES (?, ?, ?, 1)",
            (sid, "Session 1", utcnow()),
        )
        return sid


def list_sessions() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT s.id, s.name, s.created_at, s.active,
                   (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count,
                   (SELECT COUNT(*) FROM encounter_enemies en WHERE en.session_id = s.id) AS enemy_count
            FROM sessions s
            ORDER BY s.created_at ASC
            """
        ).fetchall()
        return [
            {
                "id": r["id"],
                "name": r["name"] or "Session",
                "created_at": r["created_at"],
                "active": bool(r["active"]),
                "event_count": int(r["event_count"] or 0),
                "enemy_count": int(r["enemy_count"] or 0),
            }
            for r in rows
        ]


def new_session(name: str | None = None) -> dict[str, Any]:
    with db() as conn:
        count = conn.execute("SELECT COUNT(*) AS c FROM sessions").fetchone()["c"]
        label = (name or "").strip() or f"Session {int(count) + 1}"
        sid = str(uuid.uuid4())
        conn.execute("UPDATE sessions SET active = 0 WHERE active = 1")
        conn.execute(
            "INSERT INTO sessions(id, name, created_at, active) VALUES (?, ?, ?, 1)",
            (sid, label, utcnow()),
        )
    return {"id": sid, "name": label, "active": True}


def activate_session(session_id: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute("SELECT id, name FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            return None
        conn.execute("UPDATE sessions SET active = 0 WHERE active = 1")
        conn.execute("UPDATE sessions SET active = 1 WHERE id = ?", (session_id,))
        return {"id": row["id"], "name": row["name"], "active": True}


def rename_session(session_id: str, name: str) -> dict[str, Any] | None:
    name = (name or "").strip() or "Session"
    with db() as conn:
        cur = conn.execute("UPDATE sessions SET name = ? WHERE id = ?", (name, session_id))
        if cur.rowcount == 0:
            return None
    return activate_session(session_id) or {"id": session_id, "name": name, "active": False}


def delete_session(session_id: str) -> bool:
    with db() as conn:
        rows = conn.execute("SELECT id, active FROM sessions ORDER BY created_at ASC").fetchall()
        if len(rows) <= 1:
            return False
        was_active = any(r["id"] == session_id and r["active"] for r in rows)
        conn.execute("DELETE FROM events WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM encounter_enemies WHERE session_id = ?", (session_id,))
        try:
            conn.execute("DELETE FROM scene_npcs WHERE session_id = ?", (session_id,))
        except sqlite3.OperationalError:
            pass
    from . import maps as maps_mod

    maps_mod.delete_session_maps(session_id)
    with db() as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        if was_active:
            nxt = conn.execute(
                "SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
            if nxt:
                conn.execute("UPDATE sessions SET active = 1 WHERE id = ?", (nxt["id"],))
        return True


_event_origin: str = "console"


def push_event_origin(origin: str) -> str:
    global _event_origin
    previous = _event_origin
    _event_origin = origin if origin in ("console", "map") else "console"
    return previous


def pop_event_origin(previous: str) -> None:
    global _event_origin
    _event_origin = previous if previous in ("console", "map") else "console"


def add_event(query: str, result: dict[str, Any], origin: str | None = None) -> dict[str, Any]:
    sid = active_session_id()
    source = origin if origin in ("console", "map") else _event_origin
    stored = dict(result)
    event_id = str(uuid.uuid4())
    stored["event_id"] = event_id
    event = {
        "id": event_id,
        "session_id": sid,
        "created_at": utcnow(),
        "query": query,
        "result": stored,
        "source": source,
    }
    with db() as conn:
        conn.execute(
            "INSERT INTO events(id, session_id, created_at, query, result_json, source) VALUES (?, ?, ?, ?, ?, ?)",
            (event["id"], sid, event["created_at"], query, json.dumps(stored), source),
        )
    return event


def list_events(limit: int = 40, session_id: str | None = None) -> list[dict[str, Any]]:
    sid = session_id or active_session_id()
    with db() as conn:
        rows = conn.execute(
            """
            SELECT id, session_id, created_at, query, result_json, source
            FROM events WHERE session_id = ?
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (sid, limit),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "session_id": r["session_id"],
                "created_at": r["created_at"],
                "query": r["query"],
                "source": r["source"] or "console",
                "result": json.loads(r["result_json"]),
            }
            for r in rows
        ]


def set_event_outcome(event_id: str, outcome: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute(
            "SELECT id, session_id, created_at, query, result_json, source FROM events WHERE id = ?",
            (event_id,),
        ).fetchone()
        if not row:
            return None
        result = json.loads(row["result_json"])
        result["outcome"] = outcome
        conn.execute("UPDATE events SET result_json = ? WHERE id = ?", (json.dumps(result), event_id))
        return {
            "id": row["id"],
            "session_id": row["session_id"],
            "created_at": row["created_at"],
            "query": row["query"],
            "source": row["source"] or "console",
            "result": result,
        }
