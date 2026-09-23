from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .config import DEFAULT_OLLAMA_MODEL, OLLAMA_BASE
from . import db


def list_models() -> list[str]:
    try:
        with httpx.Client(timeout=2.0) as client:
            res = client.get(f"{OLLAMA_BASE}/api/tags")
            res.raise_for_status()
            data = res.json()
            return [m.get("name", "") for m in data.get("models", []) if m.get("name")]
    except Exception:
        return []


def available() -> bool:
    return len(list_models()) > 0


def preferred_model() -> str | None:
    configured = db.get_setting("ollama_model", DEFAULT_OLLAMA_MODEL) or DEFAULT_OLLAMA_MODEL
    models = list_models()
    if not models:
        return None
    if configured in models:
        return configured
    # fuzzy match prefix
    for m in models:
        if m.startswith(configured) or configured in m:
            return m
    return models[0]


def _extract_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None


def interpret(
    *,
    query: str,
    ruleset: dict[str, Any],
    characters: list[dict[str, Any]],
    events: list[dict[str, Any]],
    rules_hint: dict[str, Any] | None,
) -> dict[str, Any] | None:
    model = preferred_model()
    if not model:
        return None

    party = [
        {
            "id": c["id"],
            "name": c["name"],
            "class_level": c.get("class_level"),
            "skills": {
                sid: {"modifier": s["modifier"], "proficient": s["proficient"]}
                for sid, s in c.get("skills", {}).items()
            },
            "abilities": c.get("abilities", {}),
            "saves": {
                aid: {"modifier": s["modifier"], "proficient": s["proficient"]}
                for aid, s in c.get("saves", {}).items()
            },
            "initiative": c.get("initiative"),
            "ac": c.get("ac"),
            "attacks": c.get("attacks", []),
        }
        for c in characters
    ]
    memory = [
        {"query": e["query"], "roll_line": e["result"].get("roll_line")}
        for e in events[-12:]
    ]
    skill_list = [
        {"id": s["id"], "name": s["name"], "ability": s["ability"]}
        for s in ruleset.get("skills", [])
    ]
    system = (
        "You are a local D&D 5e DM assistant. Return ONLY compact JSON matching the schema. "
        "Use the rules pack and party sheets. "
        "CRITICAL combat rule: if the query is about fighting, hitting, swinging, shooting, "
        "stabbing, or using a weapon against a creature, check_type MUST be 'attack' — "
        "never a raw Strength/Dexterity ability check. "
        "CRITICAL non-combat rule: naming a creature (e.g. Wolf A, an orc) does NOT make it an attack. "
        "Social actions (seduce, persuade, deceive, intimidate, flirt, bargain) are skill checks "
        "(Persuasion / Deception / Intimidation), never attacks — even if a monster is named. "
        "Calming, petting, befriending, or charming a beast uses Animal Handling (Wisdom), not Persuasion and not attack. "
        "Grapple and shove are Athletics contests, not attack rolls (unless they explicitly swing a weapon). "
        "Saving throws and initiative are never attacks. "
        "For attacks: suggested_dc must be null (attacks target Armor Class, not a DC); "
        "prefer the matching weapon from the character's attacks list. "
        "If the character clearly lacks required gear (e.g. wants to shoot but has no bow/"
        "crossbow/firearm in attacks), set check_type to 'impossible', suggested_dc null, "
        "and explain in notes — do not invent an attack roll. "
        "Prefer skill checks over raw ability checks when a skill fits (Stealth, Perception, etc.). "
        "Pick suggested_dc from the dc_bands ladder (5/10/15/20/25/30) based on how hard the fiction sounds — "
        "do not default everything to 15. "
        "Set confidence honestly between 0 and 1: high only when the check type/skill is clear; "
        "use mid values for plausible guesses and low when ambiguous. Never always return 0.9. "
        "If multiple characters are affected, pick the named one or the most likely. "
        "Do not invent PHB-only rules; stay within the provided rules pack (aligned with free Basic Rules)."
    )
    user = {
        "query": query,
        "rules_hint": rules_hint,
        "skills": skill_list,
        "dc_bands": ruleset.get("dc_bands", []),
        "party": party,
        "recent_session": memory,
        "schema": {
            "character": "string|null name",
            "character_id": "string|null",
            "check_type": "skill|save|ability|attack|initiative|impossible|other",
            "ability": "strength|dexterity|constitution|intelligence|wisdom|charisma|null",
            "skill": "skill id or null",
            "suggested_dc": "int|null",
            "notes": "short string",
            "confidence": "0-1",
            "reasoning": "short string",
        },
    }
    payload = {
        "model": model,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user)},
        ],
    }
    try:
        with httpx.Client(timeout=90.0) as client:
            res = client.post(f"{OLLAMA_BASE}/api/chat", json=payload)
            res.raise_for_status()
            content = res.json().get("message", {}).get("content", "")
            return _extract_json(content)
    except Exception:
        return None
