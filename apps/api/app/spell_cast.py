"""Named spells and the standard non-attack moves. No invented DC or damage."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

from . import db, monsters, npcs
from .config import RULES_DIR

_CAST_ON = re.compile(r"^(.+?) casts (.+?) on (.+?)(?: at long range)?$", re.I)
_CAST_AT = re.compile(r"^(.+?) casts (.+?) at (.+?)(?: at long range)?$", re.I)
_CAST = re.compile(r"^(.+?) casts (.+)$", re.I)
_USE_ON = re.compile(r"^(.+?) uses (.+?) on (.+)$", re.I)
_USE = re.compile(r"^(.+?) uses (.+)$", re.I)

_CASTERS = (
    ("bard", "charisma"),
    ("paladin", "charisma"),
    ("sorcerer", "charisma"),
    ("warlock", "charisma"),
    ("cleric", "wisdom"),
    ("druid", "wisdom"),
    ("ranger", "wisdom"),
    ("wizard", "intelligence"),
)

_FEATURES = {
    "second wind": ("self", "heal", "Bonus action. Regain hit points. 2 uses per long rest."),
}

_MOVES = {
    "dash": ("self", "none", "Dash. No attack roll. Hit points stay."),
    "disengage": ("self", "none", "Disengage. No attack roll. Hit points stay."),
    "dodge": ("self", "none", "Dodge. No attack roll. Hit points stay."),
    "hide": ("self", "none", "Hide. No attack roll. Hit points stay."),
    "search": ("self", "none", "Search. No attack roll. Hit points stay."),
    "help": ("creature", "none", "Help a creature within 5 feet. No attack roll. Hit points stay."),
    "grapple": ("creature", "contest", "Strength (Athletics) contest. Hit points stay."),
    "shove": ("creature", "contest", "Strength (Athletics) contest. Hit points stay."),
}


@lru_cache(maxsize=1)
def _spells() -> dict[str, dict[str, Any]]:
    path = RULES_DIR / "rules-dnd5e" / "spells.json"
    rows = json.loads(path.read_text(encoding="utf-8"))
    return {str(row["name"]).lower(): row for row in rows}


def _clean(name: str) -> str:
    folded = (name or "").replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+at long range$", "", folded.strip().rstrip(".")).strip()


def _parse(text: str) -> tuple[str, str, str] | None:
    stripped = text.strip().rstrip(".")
    for pattern in (_CAST_ON, _CAST_AT, _USE_ON):
        match = pattern.match(stripped)
        if match:
            return match.group(1).strip(), _clean(match.group(2)), match.group(3).strip()
    for pattern in (_CAST, _USE):
        match = pattern.match(stripped)
        if match:
            return match.group(1).strip(), _clean(match.group(2)), ""
    return None


@lru_cache(maxsize=1)
def _damage_table() -> dict[str, Any]:
    path = RULES_DIR / "rules-dnd5e" / "spell_damage.json"
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _shown_mod(character: dict[str, Any] | None, ability: str | None) -> int | None:
    if not character or not ability:
        return None
    block = (character.get("abilities") or {}).get(ability)
    if not isinstance(block, dict):
        return None
    if block.get("modifier") is not None:
        try:
            return int(block["modifier"])
        except (TypeError, ValueError):
            return None
    if block.get("score") is not None:
        try:
            return (int(block["score"]) - 10) // 2
        except (TypeError, ValueError):
            return None
    return None


def _caster_ability(character: dict[str, Any] | None) -> str | None:
    if not character:
        return None
    text = f"{character.get('class_level') or ''} {character.get('class') or ''}".lower()
    for name, ability in _CASTERS:
        if name in text:
            return ability
    return None


def _caster_level(character: dict[str, Any] | None) -> int:
    if not character:
        return 1
    try:
        if character.get("level"):
            return max(1, int(character["level"]))
    except (TypeError, ValueError):
        pass
    nums = [int(part) for part in re.findall(r"\d+", str(character.get("class_level") or ""))]
    return max(nums) if nums else 1


def _scale_cantrip(dice: str, level: int) -> str:
    match = re.fullmatch(r"(\d+)d(\d+)", dice.strip())
    if not match:
        return dice
    count = int(match.group(1))
    mult = 4 if level >= 17 else 3 if level >= 11 else 2 if level >= 5 else 1
    return f"{count * mult}d{match.group(2)}"


def _signed(value: int) -> str:
    return f"+{value}" if value >= 0 else str(value)


def _spell_formula(rule: dict[str, Any], character: dict[str, Any] | None) -> str | None:
    dice = str(rule.get("damage") or "").strip()
    if not dice:
        return None
    if rule.get("scale"):
        dice = _scale_cantrip(dice, _caster_level(character))
    if rule.get("ability"):
        mod = _shown_mod(character, _caster_ability(character))
        if mod is not None:
            dice = f"{dice}{_signed(mod)}"
    kind = str(rule.get("type") or "").strip()
    return f"{dice} {kind}".strip()


def _spell_dc(character: dict[str, Any] | None) -> int | None:
    ability = _caster_ability(character)
    mod = _shown_mod(character, ability)
    if character is None or mod is None:
        return None
    try:
        prof = int(character.get("proficiency_bonus") or 0)
    except (TypeError, ValueError):
        return None
    return 8 + prof + mod


def _character(character_id: str | None, actor: str) -> dict[str, Any] | None:
    rows = db.list_characters()
    if character_id:
        found = next((row for row in rows if row["id"] == character_id), None)
        if found:
            return found
    key = actor.lower()
    return next((row for row in rows if str(row.get("name") or "").lower() == key), None)


def _target(name: str) -> dict[str, Any] | None:
    key = name.lower().strip()
    if not key or key == "the open ground":
        return None
    for row in db.list_characters():
        if str(row.get("name") or "").lower() == key:
            current = row.get("current_hp")
            maximum = row.get("max_hp")
            return {
                "id": row["id"],
                "label": row["name"],
                "ac": row.get("ac") or 0,
                "current_hp": current if current is not None else maximum or 0,
                "max_hp": maximum or 0,
                "monster_id": "",
                "kind": "character",
                "image_url": row.get("image_url"),
            }
    for row in monsters.list_encounter():
        label = row.get("label") or row.get("name") or ""
        if str(label).lower() == key:
            return {
                "id": row["id"],
                "label": label,
                "ac": row.get("ac") or 0,
                "current_hp": row.get("current_hp") or 0,
                "max_hp": row.get("max_hp") or 0,
                "monster_id": row.get("monster_id") or "",
                "kind": "enemy",
                "image_url": row.get("image_url"),
            }
    for row in npcs.list_scene():
        label = row.get("label") or row.get("name") or ""
        if str(label).lower() == key:
            return {
                "id": row["id"],
                "label": label,
                "ac": row.get("ac") or 0,
                "current_hp": row.get("current_hp") or 0,
                "max_hp": row.get("max_hp") or 0,
                "monster_id": "",
                "npc_id": row.get("npc_id"),
                "kind": "npc",
                "image_url": row.get("image_url"),
            }
    return None


def _printed_attack(character: dict[str, Any] | None, spell_name: str) -> tuple[int | None, str | None]:
    if not character:
        return None, None
    for attack in character.get("attacks") or []:
        if str(attack.get("name") or "").strip().lower() != spell_name.lower():
            continue
        raw = attack.get("attack_bonus")
        bonus = None
        if raw not in (None, ""):
            try:
                bonus = int(str(raw).replace("+", "").strip())
            except ValueError:
                bonus = None
        damage = str(attack.get("damage") or "").strip() or None
        return bonus, damage
    return None, None


def cast_or_move(text: str, character_id: str | None) -> dict[str, Any] | None:
    parsed = _parse(text)
    if not parsed:
        return None
    actor, name, target_name = parsed
    key = name.lower()
    move = _MOVES.get(key)
    feature = _FEATURES.get(key)
    spell = _spells().get(key)
    if move is None and feature is None and spell is None and not re.match(r"^.+ (casts|uses) ", text.strip(), re.I):
        return None
    if move is not None:
        _aim, resolution, note = move
        check = "contest" if resolution == "contest" else "spell"
    elif feature is not None:
        _aim, resolution, note = feature
        check = "heal"
    elif spell is not None:
        resolution = str(spell["resolution"])
        note = str(spell["note"])
        check = {"attack": "attack", "save": "save", "heal": "heal"}.get(resolution, "spell")
    else:
        note = "This is not an attack. No range is on file, and no bonus is added."
        resolution = "none"
        check = "spell"
    character = _character(character_id, actor)
    who = (character or {}).get("name") or actor
    target = _target(target_name) if target_name else None
    prep = "at" if spell and spell.get("aim") in {"point", "shape"} else "on"
    label = target["label"] if target else target_name
    where = ""
    if label and label.lower() != "the open ground":
        where = f" {prep} {label}"
    verb = "casts" if spell is not None and move is None and feature is None else "uses"
    line = f"{who} {verb} {name}{where}. {note}"
    bonus, printed = _printed_attack(character, name)
    rule = _damage_table().get(name.lower()) if spell else None
    formula = _spell_formula(rule, character) if isinstance(rule, dict) else None
    if check == "attack" and bonus is None and character:
        mod = _shown_mod(character, _caster_ability(character))
        if mod is not None:
            try:
                bonus = int(character.get("proficiency_bonus") or 0) + mod
            except (TypeError, ValueError):
                bonus = None
    dc = _spell_dc(character) if check == "save" and formula else None
    if formula and check == "attack":
        note = f"{formula}. A natural 20 doubles the dice and adds the modifier once."
    elif formula and check == "save":
        note = formula
        if rule.get("half"):
            note += ". A successful save deals half."
        if dc is not None:
            note += f" Save DC {dc}."
    elif formula and isinstance(rule, dict) and rule.get("auto"):
        note = formula
    line = f"{who} {verb} {name}{where}. {note}"
    needed = None
    if check == "attack" and bonus is not None and target and target.get("ac"):
        needed = max(1, min(20, int(target["ac"]) - bonus))
    damage = None
    if formula and (check in {"attack", "save"} or (isinstance(rule, dict) and rule.get("auto"))):
        damage = formula
    elif check == "attack":
        damage = printed
    participants: list[dict[str, Any]] = []
    if character:
        participants.append(
            {
                "id": character["id"],
                "label": character["name"],
                "role": "rolling",
                "kind": "character",
                "image_url": character.get("image_url"),
            }
        )
    if target:
        participants.append(
            {
                "id": target["id"],
                "label": target["label"],
                "role": "target" if check == "attack" else "subject",
                "kind": target.get("kind"),
                "image_url": target.get("image_url"),
            }
        )
    result = {
        "character": who,
        "character_id": character["id"] if character else character_id,
        "check_type": check,
        "ability": "strength" if check == "contest" else None,
        "skill": "athletics" if check == "contest" else None,
        "dice": "1d20" if check in {"attack", "save"} else "",
        "modifier": bonus if check == "attack" else None,
        "suggested_dc": dc if check == "save" else None,
        "save_ability": rule.get("save") if isinstance(rule, dict) and check == "save" else None,
        "dc_label": "Spell save" if check == "save" and dc is not None else None,
        "notes": note,
        "roll_line": line,
        "confidence": 1,
        "source": "rules",
        "reasoning": "Named spell or move. Damage and a save DC are filled only when this spell has them.",
        "weapon": name if check == "attack" else None,
        "damage": damage,
        "target": target,
        "participants": participants,
        "target_ac": target.get("ac") if target and check == "attack" else None,
        "to_hit_needed": needed,
        "howto": note,
        "factors": [],
        "possible": True,
    }
    return db.add_event(text.strip(), result)["result"]
