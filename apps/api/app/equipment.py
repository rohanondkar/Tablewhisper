"""Equipped versus unequipped gear.

Only equipped or attuned items change armor class or visibility. A cloak that
is merely listed in the pack does nothing until it is attuned.
"""

from __future__ import annotations

import re
from typing import Any

from . import gear_rules

_WORN_RE = re.compile(r"\b(worn|wearing|equipped|wielded|wielding)\b", re.I)
_ATTUNED_RE = re.compile(r"\battuned\b", re.I)
_INVIS_RE = re.compile(r"cloak of invisibility|invisibility cloak", re.I)
_ELVEN_RE = re.compile(r"cloak of elvenkind", re.I)
_SHIELD_RE = re.compile(r"\bshields?\b", re.I)
_ARMOR_RE = re.compile(
    r"\b(padded armor|padded|leather armor|studded leather|studded|hide armor|hide|"
    r"chain shirt|scale mail|breastplate|half plate|half-plate|ring mail|chain mail|"
    r"splint armor|splint|plate armor|plate)\b",
    re.I,
)
_PUTS_ON_RE = re.compile(r"\b(puts on|put on|wears|wearing|dons|donned)\b", re.I)
_TAKES_OFF_RE = re.compile(
    r"\b(takes off|take off|removes|removed|not wearing|in the bag|in (?:his|her|their) (?:bag|pack|backpack)|backpack)\b",
    re.I,
)
_HIDDEN_RE = re.compile(r"\b(hidden|hiding|invisible|unseen|can't see|cannot see)\b", re.I)


def ability_mod(character: dict[str, Any], ability: str) -> int:
    return gear_rules.ability_mod(character, ability)


def unarmored_ac(character: dict[str, Any], items: list[dict[str, Any]] | None = None) -> int:
    """10 + Dex, Unarmored Defense, or a species natural armor. The higher one wins."""
    rows = items if items is not None else character.get("equipment") or []
    shield_on = any(i.get("effect") == "shield" and _active(i) for i in rows)
    return gear_rules.natural_options(character, shield_on)[0]


def effect_for(name: str) -> str | None:
    if _INVIS_RE.search(name):
        return "invisibility"
    if _ELVEN_RE.search(name):
        return "elvenkind"
    if _SHIELD_RE.search(name):
        return "shield"
    if _ARMOR_RE.search(name):
        return "armor"
    return None


def _state_for_line(line: str, effect: str | None) -> str:
    if _ATTUNED_RE.search(line):
        return "attuned"
    if _WORN_RE.search(line):
        return "equipped"
    # Printed AC already includes body armor and a shield that were on at export.
    # Magic cloaks stay in the pack until the line says they are worn.
    if effect == "armor":
        return "worn"
    if effect == "shield":
        return "equipped"
    return "unequipped"


_SENTENCE_RE = re.compile(
    r"\b(if|you|when|your|have|with|damage|action|bonus|advantage|prepared)\b",
    re.I,
)


def _item_line(line: str, from_equipment: bool) -> bool:
    """A gear name. A feature sentence that merely mentions a weapon is not gear."""
    clean = line.strip()
    if re.search(r"===|PHB-\d|species traits|^\*", clean, re.I):
        return False
    found = gear_rules._match_key(clean)
    if not found:
        return from_equipment and len(clean) <= 40 and not _SENTENCE_RE.search(clean)
    key, _spec = found
    if key == "unarmed":
        return False
    if key == "hide" and not from_equipment and re.fullmatch(r"[\W_]*hide[\W_]*", clean, re.I):
        return False
    probe = re.sub(r"\([^)]*\)", " ", clean)
    if not from_equipment and (_SENTENCE_RE.search(probe) or len(clean) > 48):
        return False
    rest = re.sub(rf"\b{re.escape(key)}\b", " ", clean, count=1, flags=re.I)
    rest = re.sub(r"\([^)]*\)", " ", rest)
    rest = re.sub(r"[^A-Za-z]+", " ", rest).strip()
    stop = {"a", "an", "the", "of", "and", "x", "armor"}
    words = [word for word in rest.split() if word.lower() not in stop]
    return len(words) <= (4 if from_equipment else 2)


def _feature_dump(items: list[dict[str, Any]]) -> bool:
    hits = 0
    for item in items:
        name = str(item.get("name") or "")
        if (
            name.startswith("===")
            or name.startswith("* ")
            or "PHB-" in name
            or name in {"Standard Actions", "Opportunity Attack", "Two-Weapon Fighting"}
        ):
            hits += 1
    return hits >= 3


def _split_inventory(text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in re.split(r"[\n;•,]+", text):
        line = re.sub(r"\s+", " ", raw_line).strip(" -\t,.")
        if len(line) < 2 or len(line) > 80:
            continue
        if re.fullmatch(r"[\d\s,./+-]+", line):
            continue
        lines.append(line)
    return lines


def _push(items: list[dict[str, Any]], seen: set[str], name: str, state: str, effect: str | None) -> None:
    clean = re.sub(r"\s+", " ", name).strip(" -|*")
    if len(clean) < 2:
        return
    key = clean.lower()
    if key in seen:
        return
    seen.add(key)
    items.append({"name": clean, "state": state, "effect": effect})


def seed(character: dict[str, Any], raw_fields: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build equipment and the two AC numbers. Does not add a bonus on top of printed AC."""
    printed = character.get("ac")
    try:
        ac_equipped = int(printed) if printed is not None else 10
    except (TypeError, ValueError):
        ac_equipped = 10
    bare = unarmored_ac(character)
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    for atk in character.get("attacks") or []:
        name = str(atk.get("name") or "").strip()
        if name:
            _push(items, seen, name, "equipped", effect_for(name))

    blobs: list[str] = []
    from_equipment = False
    raw = raw_fields if raw_fields is not None else character.get("raw_fields") or {}
    if isinstance(raw, dict):
        for key, value in raw.items():
            if "equipment" in str(key).lower() and isinstance(value, str) and value.strip():
                blobs.append(value)
                from_equipment = True
    if not blobs:
        features = str(character.get("features") or "")
        if features.strip():
            blobs.append(features)

    for blob in blobs:
        for line in _split_inventory(blob):
            if not _item_line(line, from_equipment):
                continue
            effect = effect_for(line)
            state = _state_for_line(line, effect)
            _push(items, seen, line, state, effect)

    cloak_blobs = list(blobs)
    features = str(character.get("features") or "")
    if features and features not in cloak_blobs:
        cloak_blobs.append(features)
    for blob in cloak_blobs:
        lowered = blob.lower()
        if _INVIS_RE.search(lowered) and not any(i.get("effect") == "invisibility" for i in items):
            window = _INVIS_RE.search(blob)
            state = _state_for_line(blob[max(0, window.start() - 24) : window.end() + 24] if window else blob, "invisibility")
            _push(items, seen, "Cloak of Invisibility", state, "invisibility")
        if _ELVEN_RE.search(lowered) and not any(i.get("effect") == "elvenkind" for i in items):
            window = _ELVEN_RE.search(blob)
            state = _state_for_line(blob[max(0, window.start() - 24) : window.end() + 24] if window else blob, "elvenkind")
            _push(items, seen, "Cloak of Elvenkind", state, "elvenkind")

    character["armor_in_printed"] = any(
        i.get("effect") == "armor" and i.get("state") in {"worn", "equipped", "attuned"} for i in items
    )
    gear_rules.legalize(items, character, [])
    shield_on = any(i.get("effect") == "shield" and _active(i) for i in items)
    character["equipment"] = items
    character["ac_equipped"] = ac_equipped
    character["ac_unarmored"] = unarmored_ac(character, items)
    character["ac_includes_shield"] = bool(shield_on and ac_equipped > bare)
    _finish(character)
    return character


def ensure(character: dict[str, Any]) -> dict[str, Any]:
    """Fill gear on older sheets, then set the live AC from what is equipped."""
    stored = character.get("equipment")
    if not isinstance(stored, list) or _feature_dump(stored):
        raw = character.get("raw_fields")
        seed(character, raw if isinstance(raw, dict) else None)
        return character
    items = [gear_rules.annotate(i) for i in character["equipment"] if isinstance(i, dict)]
    character["equipment"] = items
    if character.get("ac_equipped") is None:
        try:
            character["ac_equipped"] = int(character.get("ac") or 10)
        except (TypeError, ValueError):
            character["ac_equipped"] = 10
    gear_rules.legalize(items, character, [])
    character["ac_unarmored"] = unarmored_ac(character, items)
    _finish(character)
    return character


def apply_equipment(
    character: dict[str, Any],
    proposed: list[dict[str, Any]],
    previous: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Store a DM toggle and make the equipped set legal."""
    items = [dict(i) for i in proposed if isinstance(i, dict)]
    notes = gear_rules.apply_patch(character, items, previous)
    character["equipment"] = items
    character["gear_notes"] = notes
    if character.get("ac_equipped") is None:
        try:
            character["ac_equipped"] = int(character.get("ac") or 10)
        except (TypeError, ValueError):
            character["ac_equipped"] = 10
    character["ac_unarmored"] = unarmored_ac(character, items)
    _finish(character)
    return character


def _finish(character: dict[str, Any]) -> None:
    items = character.get("equipment") or []
    gear_rules.settle_bags(items)
    for item in items:
        stamped = gear_rules.annotate(item)
        item["hands"] = stamped.get("hands") or 0
        item["light"] = bool(stamped.get("light"))
        item["person_slot"] = stamped.get("person_slot")
    gear_rules.assign_hands(items, character)
    character["pockets"] = gear_rules.pocket_count(items)
    character["ac"] = live_ac(character, items)
    character["hands_label"] = gear_rules.hands_label(items, character)
    profile = gear_rules.carry_profile(character, items)
    character["carry_label"] = profile["label"]
    character["carry"] = profile
    character["bags"] = gear_rules.bag_summaries(items)
    character["bag"] = character["bags"][0]


def _active(item: dict[str, Any]) -> bool:
    return gear_rules.active(item)


def _worn(item: dict[str, Any]) -> bool:
    if item.get("effect") == "armor":
        return gear_rules.on_body(item)
    return _active(item)


def _mentioned(item: dict[str, Any], text: str) -> bool:
    name = str(item.get("name") or "").lower()
    if not name:
        return False
    if name in text:
        return True
    if "cloak" in name and re.search(r"\bcloak\b", text):
        if "invisib" in text or "elven" in text:
            return ("invisib" in name and "invisib" in text) or ("elven" in name and "elven" in text)
        return "invisib" in name or "elven" not in name
    for word in re.split(r"\s+", name):
        if len(word) > 4 and re.search(rf"\b{re.escape(word)}\b", text):
            return True
    return False


def for_ruling(character: dict[str, Any], text: str = "") -> list[dict[str, Any]]:
    """Copy of equipment with a one-check sentence override. Stored state is unchanged."""
    items = [gear_rules.annotate(dict(i)) for i in (character.get("equipment") or []) if isinstance(i, dict)]
    low = (text or "").lower()
    puts_on = bool(_PUTS_ON_RE.search(low))
    takes_off = bool(_TAKES_OFF_RE.search(low))
    if not puts_on and not takes_off:
        return items
    over = gear_rules.over_capacity_block(character, items, low) if puts_on else None
    for item in items:
        if not _mentioned(item, low):
            continue
        if takes_off:
            item["state"] = "unequipped"
        elif puts_on and not over:
            item["state"] = "equipped"
    preferred = [
        str(item.get("name") or "")
        for item in items
        if puts_on and gear_rules._mentioned_loose(item, low) and item.get("state") in {"equipped", "attuned"}
    ]
    gear_rules.legalize(items, character, preferred)
    return items


def live_ac(character: dict[str, Any], items: list[dict[str, Any]] | None = None) -> int:
    rows = items if items is not None else character.get("equipment") or []
    try:
        equipped = int(character.get("ac_equipped") if character.get("ac_equipped") is not None else character.get("ac") or 10)
    except (TypeError, ValueError):
        equipped = 10
    bare = unarmored_ac(character, rows)
    armor_rows = [i for i in rows if i.get("effect") == "armor"]
    shield_rows = [i for i in rows if i.get("effect") == "shield"]
    armor_on = any(_worn(i) for i in armor_rows)
    shield_on = any(_worn(i) for i in shield_rows)
    includes_shield = bool(character.get("ac_includes_shield"))
    # No parsed armor means the printed AC still stands. Unarmored applies once
    # a body-armor line exists and the DM has taken it off.
    if armor_rows and not armor_on and not shield_on:
        return bare
    if armor_rows and not armor_on and shield_on:
        return bare + 2
    ac = equipped
    if includes_shield and shield_rows and not shield_on:
        ac -= 2
    if shield_on and not includes_shield:
        ac += 2
    if armor_on and not character.get("armor_in_printed"):
        ac += _style_armor_bonus(character)
    return ac


def _style_armor_bonus(character: dict[str, Any]) -> int:
    """Defense style and integrated armor, only when the printed AC did not already include them."""
    features = str(character.get("features") or "")
    bonus = 0
    if re.search(r"fighting style[:\s]+defense|while you are wearing armor, you gain a \+1", features, re.I):
        bonus += 1
    species = str(character.get("species") or "").lower()
    if "warforged" in species or "autognome" in species:
        bonus += 1
    return bonus


def worn_flags(character: dict[str, Any], text: str = "") -> dict[str, Any]:
    """Visibility and AC for this ruling. Unequipped cloaks do not apply."""
    items = for_ruling(character, text)
    unseen = any(i.get("effect") == "invisibility" and i.get("state") == "attuned" for i in items)
    elven = any(i.get("effect") == "elvenkind" and i.get("state") == "attuned" for i in items)
    sentence_hidden = bool(_HIDDEN_RE.search(text or ""))
    ac = live_ac(character, items)
    notes: list[str] = []
    blocked = gear_rules.over_capacity_block(character, character.get("equipment") or [], text or "")
    flight = gear_rules.flight_block(character, items, text or "")
    if blocked:
        notes.append(blocked)
    if flight:
        notes.append(flight)
    if unseen:
        notes.append("An invisibility cloak is attuned, so the character is unseen.")
    elif any(i.get("effect") == "invisibility" for i in items):
        notes.append("An invisibility cloak is not attuned, so it does not hide the character.")
    if elven:
        notes.append("Cloak of elvenkind is attuned: advantage on Stealth to hide, and Perception checks to see them have disadvantage.")
    if sentence_hidden and not unseen:
        notes.append("The sentence says they are hidden.")
    armor_on = any(i.get("effect") == "armor" and _worn(i) for i in items)
    if armor_on:
        notes.append(f"AC {ac} from worn armor.")
    else:
        notes.append(f"AC {ac} unarmored.")
    return {
        "ac": ac,
        "unseen": unseen or sentence_hidden,
        "invisibility_worn": unseen,
        "elvenkind_worn": elven,
        "stealth_advantage": elven,
        "perception_disadvantage": elven or unseen or sentence_hidden,
        "attack_advantage": unseen,
        "notes": notes,
        "items": items,
        "blocked": " ".join(part for part in (blocked, flight) if part) or None,
    }
