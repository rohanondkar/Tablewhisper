from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import DEFAULT_RULESET, RULES_DIR
from . import db


@lru_cache(maxsize=8)
def _load_pack(ruleset_id: str) -> dict[str, Any]:
    # packages/<folder>/ruleset.json matched by folder name or JSON id
    if RULES_DIR.exists():
        for path in RULES_DIR.iterdir():
            rules_file = path / "ruleset.json"
            if not rules_file.exists():
                continue
            data = json.loads(rules_file.read_text(encoding="utf-8"))
            if data.get("id") == ruleset_id or path.name == ruleset_id or path.name == f"rules-{ruleset_id}":
                return data
    fallback = RULES_DIR / "rules-dnd5e" / "ruleset.json"
    if ruleset_id in {DEFAULT_RULESET, "rules-dnd5e"} and fallback.exists():
        return json.loads(fallback.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"Ruleset not found: {ruleset_id}")


def list_rulesets() -> list[dict[str, Any]]:
    active = db.get_setting("active_ruleset", DEFAULT_RULESET) or DEFAULT_RULESET
    found: list[dict[str, Any]] = []
    if not RULES_DIR.exists():
        return found
    for path in RULES_DIR.iterdir():
        rules_file = path / "ruleset.json"
        if not rules_file.exists():
            continue
        data = json.loads(rules_file.read_text(encoding="utf-8"))
        found.append(
            {
                "id": data.get("id", path.name),
                "name": data.get("name", path.name),
                "version": data.get("version", "0"),
                "system": data.get("system", "unknown"),
                "description": data.get("description", ""),
                "active": data.get("id", path.name) == active,
            }
        )
    if not found:
        pack = _load_pack(DEFAULT_RULESET)
        found.append(
            {
                "id": pack["id"],
                "name": pack["name"],
                "version": pack["version"],
                "system": pack["system"],
                "description": pack.get("description", ""),
                "active": True,
            }
        )
    return found


def get_active_ruleset() -> dict[str, Any]:
    rid = db.get_setting("active_ruleset", DEFAULT_RULESET) or DEFAULT_RULESET
    try:
        # Prefer fresh file contents during iteration (JSON edits)
        _load_pack.cache_clear()
        return _load_pack(rid)
    except FileNotFoundError:
        return _load_pack(DEFAULT_RULESET)


def set_active_ruleset(ruleset_id: str) -> str:
    _load_pack(ruleset_id)  # validate
    _load_pack.cache_clear()
    db.set_setting("active_ruleset", ruleset_id)
    return ruleset_id


def dc_label(ruleset: dict[str, Any], dc: int | None) -> str | None:
    if dc is None:
        return None
    bands = ruleset.get("dc_bands", [])
    best = None
    for band in bands:
        if dc >= band["dc"]:
            best = band["label"]
    return best


def guidance_score(text: str, item: dict[str, Any]) -> int:
    """Score keyword hits using word boundaries (allows simple inflections)."""
    lowered = text.lower()
    score = 0
    for kw in item.get("keywords", []):
        phrase = kw.lower().strip()
        if not phrase:
            continue
        parts = [re.escape(p) for p in phrase.split()]
        if len(parts) == 1:
            # climb → climbs/climbing; sneak → sneaks/sneaking
            pattern = r"\b" + parts[0] + r"\w*\b"
        else:
            # Multi-word: allow inflection on first and last tokens
            # ("look around" → "looks around"; "sneak past" → "sneaks past")
            mid = parts[1:-1]
            mid_pat = (r"\s+" + r"\s+".join(mid)) if mid else ""
            pattern = (
                r"\b" + parts[0] + r"\w*" + mid_pat + r"\s+" + parts[-1] + r"\w*\b"
            )
        if re.search(pattern, lowered):
            score += 1 + len(phrase.split())
    return score


def match_guidance(text: str, ruleset: dict[str, Any]) -> dict[str, Any] | None:
    best = None
    best_score = 0
    for item in ruleset.get("check_guidance", []):
        score = guidance_score(text, item)
        if score > best_score:
            best_score = score
            best = item
    if not best or best_score <= 0:
        return None
    out = dict(best)
    out["_score"] = best_score
    return out


def adjust_dc_from_query(text: str, base_dc: int | None, ruleset: dict[str, Any]) -> int | None:
    """Shift suggested DC from difficulty words in the query (Basic Rules DC ladder)."""
    if base_dc is None:
        return None
    lowered = text.lower()
    delta = 0
    matched_label: str | None = None
    for item in ruleset.get("dc_modifiers", []):
        hit = False
        for kw in item.get("keywords", []):
            phrase = kw.lower().strip()
            if not phrase:
                continue
            parts = [re.escape(p) for p in phrase.split()]
            pattern = r"\b" + r"\s+".join(parts) + r"\b"
            if re.search(pattern, lowered):
                hit = True
                break
        if not hit:
            continue
        delta = int(item.get("delta") or 0)
        matched_label = item.get("label")
        # Prefer the first matching modifier group (list is ordered specific→general).
        break
    dc = max(5, min(30, int(base_dc) + delta))
    if matched_label:
        bands = {b["label"].lower(): int(b["dc"]) for b in ruleset.get("dc_bands", [])}
        key = matched_label.lower()
        if key in bands:
            dc = bands[key]
    return dc
