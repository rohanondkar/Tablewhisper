"""Player's Handbook gear limits: hands, armor, ammunition, and carrying capacity.

Item weights come from that table. A line the table does not name stays uncounted.
"""

from __future__ import annotations

import re
from typing import Any

# name, hands, weight, flags
# flags: light, heavy, finesse, versatile, loading, ammo, two_handed (hands==2)
_WEAPONS: list[tuple[str, dict[str, Any]]] = [
    ("club", {"hands": 1, "weight": 2, "light": True}),
    ("dagger", {"hands": 1, "weight": 1, "light": True, "finesse": True}),
    ("greatclub", {"hands": 2, "weight": 10}),
    ("handaxe", {"hands": 1, "weight": 2, "light": True}),
    ("javelin", {"hands": 1, "weight": 2}),
    ("light hammer", {"hands": 1, "weight": 2, "light": True}),
    ("mace", {"hands": 1, "weight": 4}),
    ("quarterstaff", {"hands": 1, "weight": 4, "versatile": True}),
    ("sickle", {"hands": 1, "weight": 2, "light": True}),
    ("spear", {"hands": 1, "weight": 3, "versatile": True}),
    ("light crossbow", {"hands": 2, "weight": 5, "ammo": "bolts", "loading": True}),
    ("dart", {"hands": 1, "weight": 0.25, "finesse": True}),
    ("shortbow", {"hands": 2, "weight": 2, "ammo": "arrows"}),
    ("sling", {"hands": 1, "weight": 0, "ammo": "bullets"}),
    ("battleaxe", {"hands": 1, "weight": 4, "versatile": True}),
    ("flail", {"hands": 1, "weight": 2}),
    ("glaive", {"hands": 2, "weight": 6, "heavy": True}),
    ("greataxe", {"hands": 2, "weight": 7, "heavy": True}),
    ("greatsword", {"hands": 2, "weight": 6, "heavy": True}),
    ("halberd", {"hands": 2, "weight": 6, "heavy": True}),
    ("lance", {"hands": 2, "weight": 6}),
    ("longsword", {"hands": 1, "weight": 3, "versatile": True}),
    ("maul", {"hands": 2, "weight": 10, "heavy": True}),
    ("morningstar", {"hands": 1, "weight": 4}),
    ("pike", {"hands": 2, "weight": 18, "heavy": True}),
    ("rapier", {"hands": 1, "weight": 2, "finesse": True}),
    ("scimitar", {"hands": 1, "weight": 3, "light": True, "finesse": True}),
    ("shortsword", {"hands": 1, "weight": 2, "light": True, "finesse": True}),
    ("trident", {"hands": 1, "weight": 4, "versatile": True}),
    ("war pick", {"hands": 1, "weight": 2}),
    ("warhammer", {"hands": 1, "weight": 2, "versatile": True}),
    ("whip", {"hands": 1, "weight": 3, "finesse": True}),
    ("blowgun", {"hands": 1, "weight": 1, "ammo": "needles", "loading": True}),
    ("hand crossbow", {"hands": 1, "weight": 3, "light": True, "ammo": "bolts", "loading": True}),
    ("heavy crossbow", {"hands": 2, "weight": 18, "heavy": True, "ammo": "bolts", "loading": True}),
    ("longbow", {"hands": 2, "weight": 2, "heavy": True, "ammo": "arrows"}),
    ("net", {"hands": 1, "weight": 3}),
]

_ARMOR: list[tuple[str, dict[str, Any]]] = [
    ("padded", {"weight": 8, "category": "light", "metal": False, "stealth": True, "don": "1 minute"}),
    ("leather", {"weight": 10, "category": "light", "metal": False, "stealth": False, "don": "1 minute"}),
    ("studded leather", {"weight": 13, "category": "light", "metal": False, "stealth": False, "don": "1 minute"}),
    ("hide", {"weight": 12, "category": "medium", "metal": False, "stealth": False, "don": "5 minutes"}),
    ("chain shirt", {"weight": 20, "category": "medium", "metal": True, "stealth": False, "don": "5 minutes"}),
    ("scale mail", {"weight": 45, "category": "medium", "metal": True, "stealth": True, "don": "5 minutes"}),
    ("breastplate", {"weight": 20, "category": "medium", "metal": True, "stealth": False, "don": "5 minutes"}),
    ("half plate", {"weight": 40, "category": "medium", "metal": True, "stealth": True, "don": "5 minutes"}),
    ("half-plate", {"weight": 40, "category": "medium", "metal": True, "stealth": True, "don": "5 minutes"}),
    ("ring mail", {"weight": 40, "category": "heavy", "metal": True, "stealth": True, "don": "10 minutes"}),
    ("chain mail", {"weight": 55, "category": "heavy", "metal": True, "stealth": True, "don": "10 minutes", "str": 13}),
    ("splint", {"weight": 60, "category": "heavy", "metal": True, "stealth": True, "don": "10 minutes", "str": 15}),
    ("plate", {"weight": 65, "category": "heavy", "metal": True, "stealth": True, "don": "10 minutes", "str": 15}),
]

_AMMO = {
    "arrows": ("arrow", "arrows", 1.0, 20),
    "bolts": ("bolt", "bolts", 1.5, 20),
    "bullets": ("sling bullet", "sling bullets", 1.5, 20),
    "needles": ("needle", "needles", 1.0, 50),
}

_CARRY_DOUBLE = ("bugbear", "centaur", "firbolg", "giff", "goliath", "loxodon", "minotaur")
_FLYERS = ("aarakocra", "fairy", "owlin")
# Small is half of Medium, Tiny is a quarter. A halfling does not walk around with a human load.
_SIZE_MULT = {"tiny": 0.25, "small": 0.5, "medium": 1, "large": 2, "huge": 4, "gargantuan": 8}
_BELTS = (
    ("storm giant", 29),
    ("cloud giant", 27),
    ("fire giant", 25),
    ("stone giant", 23),
    ("frost giant", 23),
    ("hill giant", 21),
    ("giant strength", 21),
)

_QTY_RE = re.compile(r"\((\d+)\)|\b(\d+)\s*(arrows?|bolts?|bullets?|needles?)\b", re.I)
_CONTAINED_RE = re.compile(r"in the (?:bag of holding|handy haversack|haversack)", re.I)
_FLY_RE = re.compile(r"\b(flies|fly|flying|takes flight)\b", re.I)
_PICKUP_RE = re.compile(r"\b(picks up|pick up|grabs|lifts)\b", re.I)


def _spec_weapon(raw: dict[str, Any]) -> dict[str, Any]:
    out = {
        "effect": "weapon",
        "hands": int(raw["hands"]),
        "weight": raw["weight"],
        "light": bool(raw.get("light")),
        "heavy": bool(raw.get("heavy")),
        "finesse": bool(raw.get("finesse")),
        "versatile": bool(raw.get("versatile")),
        "loading": bool(raw.get("loading")),
        "ammo": raw.get("ammo"),
        "assumed": False,
    }
    return out


def _catalog() -> list[tuple[str, dict[str, Any]]]:
    rows: list[tuple[str, dict[str, Any]]] = []
    for name, raw in _WEAPONS:
        rows.append((name, _spec_weapon(raw)))
    for name, raw in _ARMOR:
        rows.append(
            (
                name,
                {
                    "effect": "armor",
                    "hands": 0,
                    "weight": raw["weight"],
                    "category": raw["category"],
                    "metal": raw["metal"],
                    "stealth": raw["stealth"],
                    "don": raw["don"],
                    "str": raw.get("str"),
                    "assumed": False,
                },
            )
        )
    rows.append(
        (
            "shield",
            {
                "effect": "shield",
                "hands": 1,
                "weight": 6,
                "category": "shield",
                "metal": False,
                "don": "1 action",
                "assumed": False,
            },
        )
    )
    rows.sort(key=lambda pair: len(pair[0]), reverse=True)
    return rows


_CATALOG = _catalog()


def _match_key(name: str) -> tuple[str, dict[str, Any]] | None:
    low = (name or "").lower()
    if re.search(r"\bunarmed\b", low):
        return "unarmed", {"effect": "unarmed", "hands": 0, "weight": 0, "assumed": False}
    if re.search(r"\bbag of holding\b", low):
        return "bag of holding", {"effect": "container", "hands": 0, "weight": 15, "assumed": False}
    if re.search(r"\bhandy haversack\b|\bhaversack\b", low):
        return "haversack", {"effect": "container", "hands": 0, "weight": 5, "assumed": False}
    kind = bag_kind(name)
    if kind:
        return kind["name"].lower(), {"effect": "container", "hands": 0, "weight": kind["weight"], "assumed": False}
    if re.search(r"\barrows?\b", low):
        return "arrows", {"effect": "ammunition", "hands": 0, "ammo": "arrows", "weight": None, "assumed": False}
    if re.search(r"\bbolts?\b", low):
        return "bolts", {"effect": "ammunition", "hands": 0, "ammo": "bolts", "weight": None, "assumed": False}
    if re.search(r"\bsling bullets?\b|\bbullets?\b", low):
        return "bullets", {"effect": "ammunition", "hands": 0, "ammo": "bullets", "weight": None, "assumed": False}
    if re.search(r"\bneedles?\b", low):
        return "needles", {"effect": "ammunition", "hands": 0, "ammo": "needles", "weight": None, "assumed": False}
    for key, spec in _CATALOG:
        if re.search(rf"\b{re.escape(key)}\b", low):
            return key, dict(spec)
    return None


def lookup(name: str) -> dict[str, Any]:
    found = _match_key(name)
    if found:
        return found[1]
    return {
        "effect": "weapon" if _looks_like_weapon(name) else None,
        "hands": 1 if _looks_like_weapon(name) else 0,
        "weight": None,
        "assumed": _looks_like_weapon(name),
        "light": False,
        "heavy": False,
        "finesse": False,
        "versatile": False,
        "loading": False,
        "ammo": None,
    }


def _looks_like_weapon(name: str) -> bool:
    return bool(re.search(r"\b(sword|axe|bow|hammer|staff|spear|blade|mace|flail|crossbow)\b", name or "", re.I))


def parse_qty(name: str) -> int | None:
    match = _QTY_RE.search(name or "")
    if not match:
        return None
    raw = match.group(1) or match.group(2)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def normalize_state(state: str | None) -> str:
    if state == "carried":
        return "unequipped"
    if state in {"equipped", "attuned", "unequipped", "worn"}:
        return state
    return "unequipped"


def active(item: dict[str, Any]) -> bool:
    """In the hands, or attuned."""
    return normalize_state(item.get("state")) in {"equipped", "attuned"}


def on_body(item: dict[str, Any]) -> bool:
    """Worn on the person or in the hands. Armor uses this. A sheathed weapon does too."""
    return normalize_state(item.get("state")) in {"worn", "equipped", "attuned"}


def annotate(item: dict[str, Any]) -> dict[str, Any]:
    row = dict(item)
    row["state"] = normalize_state(row.get("state"))
    spec = lookup(str(row.get("name") or ""))
    if row.get("effect") in {None, "", "weapon"} and spec.get("effect"):
        row["effect"] = spec.get("effect")
    if spec.get("effect") == "ammunition":
        row["effect"] = "ammunition"
        if row.get("qty") is None:
            row["qty"] = parse_qty(str(row.get("name") or ""))
    if spec.get("assumed") and not row.get("note"):
        row["note"] = "Treated as one-handed. The sheet does not name a Player's Handbook weapon."
    row["hands"] = int(spec.get("hands") or 0)
    row["light"] = bool(spec.get("light"))
    row["person_slot"] = _person_slot(row)
    return row


def _features(character: dict[str, Any]) -> str:
    return str(character.get("features") or "")


def _class_text(character: dict[str, Any]) -> str:
    return str(character.get("class_level") or "").lower()


def _species(character: dict[str, Any]) -> str:
    return str(character.get("species") or "").lower()


def _level(character: dict[str, Any]) -> int:
    try:
        return int(character.get("level") or 0)
    except (TypeError, ValueError):
        return 0


def is_druid(character: dict[str, Any]) -> bool:
    return "druid" in _class_text(character)


def is_tortle(character: dict[str, Any]) -> bool:
    return "tortle" in _species(character)


def is_thri_kreen(character: dict[str, Any]) -> bool:
    return "thri-kreen" in _species(character) or "thri kreen" in _species(character)


def is_dwarf(character: dict[str, Any]) -> bool:
    species = _species(character)
    return "dwarf" in species or "duergar" in species


def _integrated_armor(character: dict[str, Any]) -> bool:
    species = _species(character)
    return "warforged" in species or "autognome" in species


def _armorer(character: dict[str, Any]) -> bool:
    blob = f"{_class_text(character)} {_features(character)}".lower()
    return "armorer" in blob or "arcane armor" in blob


def powerful_build(character: dict[str, Any]) -> bool:
    species = _species(character)
    if "half-orc" in species or "half orc" in species or "halforc" in species:
        species_ok = False
    elif re.search(r"\borc\b", species):
        species_ok = True
    else:
        species_ok = any(name in species for name in _CARRY_DOUBLE)
    if re.search(r"powerful build|equine build|hippo build", _features(character), re.I):
        return True
    return species_ok


def bear_totem(character: dict[str, Any]) -> bool:
    if "barbarian" not in _class_text(character) or _level(character) < 6:
        return False
    features = _features(character).lower()
    return "bear" in features and "aspect of the beast" in features


def strength_score(character: dict[str, Any], items: list[dict[str, Any]] | None = None) -> int:
    for item in items or []:
        if normalize_state(item.get("state")) != "attuned":
            continue
        low = str(item.get("name") or "").lower()
        if "belt" not in low or "giant" not in low:
            continue
        for needle, score in _BELTS:
            if needle in low:
                return score
    block = (character.get("abilities") or {}).get("strength") or {}
    if block.get("score") is not None:
        try:
            return int(block["score"])
        except (TypeError, ValueError):
            pass
    try:
        mod = int(block.get("modifier") or 0)
    except (TypeError, ValueError):
        mod = 0
    return 10 + 2 * mod


def ability_mod(character: dict[str, Any], ability: str) -> int:
    block = (character.get("abilities") or {}).get(ability) or {}
    try:
        return int(block.get("modifier") or 0)
    except (TypeError, ValueError):
        return 0


def carry_profile(character: dict[str, Any], items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    rows = [annotate(i) for i in (items if items is not None else character.get("equipment") or []) if isinstance(i, dict)]
    score = strength_score(character, rows)
    size = str(character.get("size") or "Medium").lower()
    mult = _SIZE_MULT.get(size, 1)
    reasons: list[str] = []
    if mult != 1:
        reasons.append(str(character.get("size") or size).title())
    factor = 1
    if powerful_build(character):
        factor *= 2
        reasons.append("Powerful Build")
    if bear_totem(character):
        factor *= 2
        reasons.append("Bear totem")
    capacity = score * 15 * mult * factor
    known = 0.0
    uncounted = 0
    extra_bags = {str(bag.get("name") or "").lower() for bag in list_bags(rows) if bag.get("extra")}
    missing: list[str] = []
    for item in rows:
        if _CONTAINED_RE.search(str(item.get("name") or "")):
            continue
        if normalize_state(item.get("state")) == "unequipped" and str(item.get("container") or "").lower() in extra_bags:
            continue
        spec = lookup(str(item.get("name") or ""))
        weight = _item_weight(item, spec)
        if weight is None:
            uncounted += 1
            missing.append(str(item.get("name") or "item"))
        else:
            known += weight
    reason = " · ".join(reasons)
    known_txt = _lb(known)
    cap_txt = _lb(capacity)
    label = f"{known_txt} / {cap_txt} lb" + (f" · {reason}" if reason else "")
    return {
        "known_lb": known,
        "capacity": capacity,
        "uncounted": uncounted,
        "uncounted_names": missing,
        "reasons": reasons,
        "over": known > capacity,
        "label": label,
    }


def _item_weight(item: dict[str, Any], spec: dict[str, Any]) -> float | None:
    if spec.get("effect") == "ammunition":
        kind = spec.get("ammo")
        qty = item.get("qty")
        if qty is None or kind not in _AMMO:
            return None
        _one, _many, lb, bundle = _AMMO[kind]
        return float(lb) * (int(qty) / bundle)
    weight = spec.get("weight")
    if weight is None:
        return None
    return float(weight)


def _lb(value: float) -> str:
    if abs(value - round(value)) < 0.05:
        return str(int(round(value)))
    return f"{value:.1f}"


def hands_label(items: list[dict[str, Any]], character: dict[str, Any]) -> str:
    primary: list[str] = []
    secondary: list[str] = []
    primary_used = 0
    for item in items:
        if not active(item):
            continue
        spec = lookup(str(item.get("name") or ""))
        hands = int(spec.get("hands") or 0)
        if hands <= 0 or spec.get("effect") not in {"weapon", "shield"}:
            continue
        name = str(item.get("name") or "")
        if spec.get("light") and primary_used >= 2 and is_thri_kreen(character):
            secondary.append(name)
            continue
        primary.append(name)
        primary_used += hands
    held = ", ".join(primary) if primary else "empty"
    label = f"Hands {min(primary_used, 2)}/2 · {held}"
    if is_thri_kreen(character):
        extra = ", ".join(secondary) if secondary else "empty"
        label += f" · light {len(secondary)}/2 · {extra}"
    return label


def _don_note(character: dict[str, Any], spec: dict[str, Any], name: str) -> str:
    if spec.get("effect") == "armor" and _armorer(character):
        return "Arcane armor is donned or doffed as an action."
    if spec.get("effect") == "armor" and _integrated_armor(character):
        return "Donning or doffing this armor takes 1 hour."
    don = spec.get("don")
    note = f"Donning takes {don}." if don and don != "1 action" else ("Donning a shield takes an action." if don else "")
    need = spec.get("str")
    if need and not is_dwarf(character):
        score = strength_score(character)
        if score < int(need):
            note = (note + " " if note else "") + f"Strength below {need}: speed −10 feet."
    if spec.get("category") in {"medium", "heavy"} and _flight_limited(character):
        note = (note + " " if note else "") + "Cannot fly in this armor."
    if spec.get("assumed"):
        note = "Treated as one-handed. The sheet does not name a Player's Handbook weapon."
    return note.strip()


def _flight_limited(character: dict[str, Any]) -> bool:
    species = _species(character)
    if any(name in species for name in _FLYERS):
        return True
    return "tiefling" in species and bool(re.search(r"\bwing", _features(character), re.I))


def _metal_shield(item: dict[str, Any]) -> bool:
    return bool(re.search(r"\b(metal|steel|iron)\b", str(item.get("name") or ""), re.I))


def legalize(
    items: list[dict[str, Any]],
    character: dict[str, Any],
    preferred: list[str] | None = None,
    keep_others: bool = False,
) -> list[str]:
    """Make the equipped set legal. Preferred names are the ones just turned on."""
    notes: list[str] = []
    prefer = [name.lower() for name in (preferred or [])]
    for item in items:
        item.update(annotate(item))

    def wants(item: dict[str, Any]) -> bool:
        return active(item)

    def prefer_rank(item: dict[str, Any]) -> tuple[int, int]:
        name = str(item.get("name") or "").lower()
        spec = lookup(name)
        if name in prefer:
            tier = 0
        elif not prefer and spec.get("effect") == "shield":
            tier = 1
        elif not prefer and int(spec.get("hands") or 0) <= 1:
            tier = 2
        else:
            tier = 3
        return (tier, items.index(item))

    attuned = [i for i in items if i.get("state") == "attuned" or (i.get("effect") in {"invisibility", "elvenkind"} and wants(i))]
    # Magic cloaks and giant belts grant their effect only while attuned.
    for item in items:
        spec_name = str(item.get("name") or "").lower()
        needs = item.get("effect") in {"invisibility", "elvenkind"} or (
            "belt" in spec_name and "giant" in spec_name
        )
        if needs and item.get("state") in {"equipped", "worn"}:
            item["state"] = "attuned"
    attuned_rows = [i for i in items if i.get("state") == "attuned"]
    if len(attuned_rows) > 3:
        overflow = sorted(attuned_rows, key=prefer_rank, reverse=True)
        while len([i for i in items if i.get("state") == "attuned"]) > 3 and overflow:
            drop = overflow.pop(0)
            if drop.get("state") == "attuned" and str(drop.get("name") or "").lower() not in prefer:
                drop["state"] = "unequipped"
                notes.append(f"{drop.get('name')} stays unequipped. The attunement limit is 3.")
        while len([i for i in items if i.get("state") == "attuned"]) > 3:
            drop = next(i for i in items if i.get("state") == "attuned")
            drop["state"] = "unequipped"
            notes.append(f"{drop.get('name')} stays unequipped. The attunement limit is 3.")

    for item in items:
        if item.get("effect") == "armor" and item.get("state") == "equipped":
            item["state"] = "worn"
    armors = [i for i in items if i.get("effect") == "armor" and on_body(item)]
    if is_tortle(character):
        for item in armors:
            item["state"] = "unequipped"
            notes.append("A tortle cannot wear armor.")
        armors = []
    if is_druid(character):
        for item in list(armors):
            if lookup(str(item.get("name") or "")).get("metal"):
                item["state"] = "unequipped"
                notes.append(f"A druid will not wear {item.get('name')}.")
                armors.remove(item)
    if len(armors) > 1:
        keep = sorted(armors, key=prefer_rank)[0]
        for item in armors:
            if item is not keep:
                item["state"] = "unequipped"
                notes.append(f"{item.get('name')} comes off. Only one suit of armor can be equipped.")

    shields = [i for i in items if i.get("effect") == "shield" and wants(i)]
    if is_druid(character):
        for item in list(shields):
            if _metal_shield(item):
                item["state"] = "unequipped"
                notes.append("A druid will not use a metal shield.")
                shields.remove(item)
    if len(shields) > 1:
        keep = sorted(shields, key=prefer_rank)[0]
        for item in shields:
            if item is not keep:
                item["state"] = "unequipped"

    weapons = [i for i in items if i.get("effect") == "weapon" and wants(i) and int(lookup(str(i.get("name") or "")).get("hands") or 0) > 0]
    shields = [i for i in items if i.get("effect") == "shield" and wants(i)]
    queue = sorted(weapons + shields, key=prefer_rank)
    # Reset held weapons and shields, then place them back in priority order.
    held_ids = {id(i) for i in queue}
    for item in items:
        if id(item) in held_ids:
            item["state"] = "unequipped"

    primary_free = 2
    secondary_free = 2 if is_thri_kreen(character) else 0

    def place(item: dict[str, Any]) -> None:
        nonlocal primary_free, secondary_free
        spec = lookup(str(item.get("name") or ""))
        hands = int(spec.get("hands") or 0)
        if spec.get("effect") == "shield":
            hands = 1
        if hands >= 2:
            already = any(
                active(other) and lookup(str(other.get("name") or "")).get("effect") in {"weapon", "shield"}
                for other in items
            )
            if already and (keep_others or str(item.get("name") or "").lower() not in prefer):
                item["state"] = "unequipped"
                notes.append(f"{item.get('name')} needs both hands, so it stays where it was.")
                return
            if not keep_others:
                _clear_primary(items, except_item=None)
            primary_free = 0
            item["state"] = "equipped"
            return
        if primary_free >= 1:
            primary_free -= 1
            item["state"] = "equipped"
            return
        if spec.get("light") and spec.get("effect") == "weapon" and secondary_free >= 1:
            secondary_free -= 1
            item["state"] = "equipped"
            return
        victim = None if keep_others else _droppable_weapon(items, prefer)
        if victim is not None:
            victim["state"] = "unequipped"
            primary_free += int(lookup(str(victim.get("name") or "")).get("hands") or 1)
            if primary_free > 2:
                primary_free = 2
            place(item)
            return
        shield = next((i for i in items if i.get("effect") == "shield" and active(i)), None)
        if not keep_others and shield is not None and (hands >= 2 or not _droppable_weapon(items, prefer)):
            shield["state"] = "unequipped"
            primary_free += 1
            notes.append(f"{shield.get('name')} comes off to free a hand.")
            place(item)
            return
        item["state"] = "unequipped"
        both = next(
            (
                other.get("name")
                for other in items
                if active(other) and int(lookup(str(other.get("name") or "")).get("hands") or 0) >= 2
            ),
            None,
        )
        if both:
            notes.append(f"{item.get('name')} comes off. {both} needs both hands.")
        else:
            notes.append(f"{item.get('name')} does not fit in their hands.")

    for item in queue:
        place(item)

    for item in items:
        held = active(item) or (item.get("effect") == "armor" and on_body(item))
        if not held:
            if item.get("effect") == "weapon" and lookup(str(item.get("name") or "")).get("assumed"):
                item["note"] = "Treated as one-handed. The sheet does not name a Player's Handbook weapon."
            continue
        spec = lookup(str(item.get("name") or ""))
        note = _don_note(character, spec, str(item.get("name") or ""))
        if note and item.get("effect") in {"armor", "shield", "weapon"}:
            item["note"] = note
    return notes


def _clear_primary(items: list[dict[str, Any]], except_item: dict[str, Any] | None) -> None:
    for item in items:
        if item is except_item or not active(item):
            continue
        spec = lookup(str(item.get("name") or ""))
        if spec.get("effect") in {"weapon", "shield"} and int(spec.get("hands") or 0) > 0:
            item["state"] = "unequipped"


def _droppable_weapon(items: list[dict[str, Any]], prefer: list[str]) -> dict[str, Any] | None:
    for item in items:
        if not active(item) or item.get("effect") != "weapon":
            continue
        if str(item.get("name") or "").lower() in prefer:
            continue
        if int(lookup(str(item.get("name") or "")).get("hands") or 0) <= 0:
            continue
        return item
    return None


_BAG_SPECS: list[tuple[str, dict[str, Any]]] = [
    ("bag of holding", {"name": "Bag of Holding", "cols": 10, "rows": 8, "cap_lb": 500, "extra": True, "weight": 15}),
    ("handy haversack", {"name": "Handy Haversack", "cols": 8, "rows": 5, "cap_lb": 120, "extra": True, "weight": 5}),
    ("haversack", {"name": "Handy Haversack", "cols": 8, "rows": 5, "cap_lb": 120, "extra": True, "weight": 5}),
    ("backpack", {"name": "Backpack", "cols": 8, "rows": 4, "cap_lb": 30, "extra": False, "weight": 5}),
    ("sack", {"name": "Sack", "cols": 8, "rows": 4, "cap_lb": 30, "extra": False, "weight": 0.5}),
    ("pouch", {"name": "Pouch", "cols": 4, "rows": 2, "cap_lb": 6, "extra": False, "weight": 1}),
]
_ASSUMED_BAG = {"name": "Backpack", "cols": 8, "rows": 4, "cap_lb": 30, "extra": False, "assumed": True, "item_name": "Backpack"}


def bag_kind(name: str) -> dict[str, Any] | None:
    low = (name or "").lower()
    for key, spec in _BAG_SPECS:
        if re.search(rf"\b{re.escape(key)}\b", low):
            return dict(spec)
    return None


def footprint(name: str) -> tuple[int, int]:
    spec = lookup(name)
    low = (name or "").lower()
    if spec.get("effect") == "armor" or "cloak" in low:
        return (2, 3)
    if spec.get("effect") == "shield":
        return (2, 2)
    if spec.get("effect") == "weapon":
        if int(spec.get("hands") or 0) >= 2 or spec.get("heavy"):
            return (1, 5)
        if re.search(r"\b(dagger|knife|dart)\b", low):
            return (1, 2)
        return (1, 4)
    return (1, 1)


def list_bags(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for item in items:
        if not on_body(item):
            continue
        spec = bag_kind(str(item.get("name") or ""))
        if not spec:
            continue
        spec["assumed"] = False
        spec["item_name"] = item.get("name")
        found.append(spec)
    if not found:
        found.append(dict(_ASSUMED_BAG))
    return found


def _person_slot(item: dict[str, Any]) -> str | None:
    spec = lookup(str(item.get("name") or ""))
    low = str(item.get("name") or "").lower()
    if item.get("effect") == "armor" or spec.get("effect") == "armor":
        return "body"
    if item.get("effect") in {"invisibility", "elvenkind"} or "cloak" in low:
        return "shoulders"
    if spec.get("effect") == "shield" or int(spec.get("hands") or 0) >= 2:
        return "back"
    if spec.get("effect") == "weapon":
        return "belt"
    return None


def _person_blocked(items: list[dict[str, Any]], item: dict[str, Any]) -> str | None:
    slot = _person_slot(item)
    if slot is None or slot == "body":
        return None
    for other in items:
        if other is item or normalize_state(other.get("state")) not in {"worn", "attuned"}:
            continue
        if _person_slot(other) == slot:
            return f"The {slot} is already holding {other.get('name')}."
    return None


def _restore(proposed: list[dict[str, Any]], previous: list[dict[str, Any]] | None) -> None:
    prior = {str(i.get("name") or "").lower(): i for i in (previous or []) if isinstance(i, dict)}
    for item in proposed:
        old = prior.get(str(item.get("name") or "").lower())
        if not old:
            continue
        item.clear()
        item.update(dict(old))


def _occupies(grid: list[list[bool]], col: int, row: int, w: int, h: int) -> bool:
    rows = len(grid)
    cols = len(grid[0]) if grid else 0
    if col < 0 or row < 0 or col + w > cols or row + h > rows:
        return False
    return all(not grid[y][x] for y in range(row, row + h) for x in range(col, col + w))


def _mark(grid: list[list[bool]], col: int, row: int, w: int, h: int) -> None:
    for y in range(row, row + h):
        for x in range(col, col + w):
            grid[y][x] = True


def _bag_key(name: str) -> str:
    return (name or "").strip().lower()


def _fit_note(name: str) -> str | None:
    if _match_key(name):
        return None
    return "1 by 1. The table does not name this."


def settle_bags(items: list[dict[str, Any]]) -> list[str]:
    """Lay bag items on each worn container. Marks items that do not fit."""
    if not any(on_body(item) and bag_kind(str(item.get("name") or "")) for item in items):
        for item in items:
            if bag_kind(str(item.get("name") or "")):
                item["state"] = "worn"
                break
    for item in items:
        if normalize_state(item.get("state")) == "unequipped":
            continue
        item.pop("container", None)
        item.pop("col", None)
        item.pop("row", None)
        item["placed"] = False
    bags = list_bags(items)
    by_name = {}
    for bag in bags:
        by_name[_bag_key(str(bag.get("name") or ""))] = bag
        by_name[_bag_key(str(bag.get("item_name") or ""))] = bag
    groups: dict[int, list[dict[str, Any]]] = {id(bag): [] for bag in bags}
    contents = [i for i in items if normalize_state(i.get("state")) == "unequipped" and i.get("effect") != "unarmed"]
    for item in contents:
        target = by_name.get(_bag_key(str(item.get("container") or ""))) or bags[0]
        item["container"] = target["name"]
        note = _fit_note(str(item.get("name") or ""))
        if note:
            item["fit_note"] = note
        else:
            item.pop("fit_note", None)
        groups[id(target)].append(item)
    for bag in bags:
        _place_bag(groups[id(bag)], bag)
    return []


def _place_bag(contents: list[dict[str, Any]], bag: dict[str, Any]) -> None:
    name = str(bag["name"])
    cols = int(bag["cols"])
    rows = int(bag["rows"])
    grid = [[False for _ in range(cols)] for _ in range(rows)]
    for item in contents:
        w, h = footprint(str(item.get("name") or ""))
        item["w"] = w
        item["h"] = h
        col = item.get("col")
        row = item.get("row")
        if isinstance(col, int) and isinstance(row, int) and _occupies(grid, col, row, w, h):
            _mark(grid, col, row, w, h)
            item["placed"] = True
        else:
            item["col"] = None
            item["row"] = None
            item["placed"] = False
    for item in contents:
        if item.get("placed"):
            continue
        w = int(item["w"])
        h = int(item["h"])
        found = False
        for row in range(rows):
            for col in range(cols):
                if _occupies(grid, col, row, w, h):
                    _mark(grid, col, row, w, h)
                    item["col"] = col
                    item["row"] = row
                    item["placed"] = True
                    found = True
                    break
            if found:
                break
        if not found:
            item["placed"] = False
    known = 0.0
    for item in contents:
        if not item.get("placed"):
            continue
        weight = _item_weight(item, lookup(str(item.get("name") or "")))
        if weight is not None:
            known += weight
    if known > float(bag["cap_lb"]):
        for item in contents:
            if item.get("placed"):
                item["over_bag"] = f"The {name.lower()} holds {bag['cap_lb']} pounds."
    else:
        for item in contents:
            item.pop("over_bag", None)


def _bag_contents(items: list[dict[str, Any]], bag: dict[str, Any]) -> list[dict[str, Any]]:
    key = _bag_key(str(bag.get("name") or ""))
    return [
        item
        for item in items
        if normalize_state(item.get("state")) == "unequipped"
        and item.get("placed")
        and _bag_key(str(item.get("container") or "")) == key
    ]


def bag_summaries(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for spec in list_bags(items):
        bag = dict(spec)
        contents = _bag_contents(items, bag)
        known = 0.0
        missing: list[str] = []
        used = 0
        for item in contents:
            used += int(item.get("w") or 1) * int(item.get("h") or 1)
            weight = _item_weight(item, lookup(str(item.get("name") or "")))
            if weight is None:
                missing.append(str(item.get("name") or "item"))
            else:
                known += weight
        cells = int(bag["cols"]) * int(bag["rows"])
        label = f"{used} / {cells} cells · {_lb(known)} / {_lb(float(bag['cap_lb']))} lb"
        if bag.get("assumed"):
            label += " · backpack assumed"
        if missing:
            label += " · uncounted " + ", ".join(missing)
        bag.update(
            {
                "cells_used": used,
                "cells": cells,
                "known_lb": known,
                "uncounted": len(missing),
                "uncounted_names": missing,
                "label": label,
            }
        )
        out.append(bag)
    return out


def bag_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    return bag_summaries(items)[0]


def apply_patch(
    character: dict[str, Any],
    proposed: list[dict[str, Any]],
    previous: list[dict[str, Any]] | None,
) -> list[str]:
    prior_rows = {str(i.get("name") or "").lower(): i for i in (previous or []) if isinstance(i, dict)}
    prior = {name: normalize_state(row.get("state")) for name, row in prior_rows.items()}
    preferred: list[str] = []
    for item in proposed:
        name = str(item.get("name") or "")
        state = normalize_state(item.get("state"))
        item["state"] = state
        old = prior.get(name.lower(), "unequipped")
        if state in {"equipped", "attuned"} and old in {"unequipped", "worn"}:
            preferred.append(name)
        if state == "worn" and old != "worn":
            blocked = _person_blocked(proposed, item)
            if blocked:
                item["state"] = old
                return [blocked]
    notes = legalize(proposed, character, preferred, keep_others=True)
    for name in preferred:
        row = _find_item(proposed, name)
        if row is None or not active(row):
            _restore(proposed, previous)
            return [f"{name} stays where it was. Their hands are full."]
    notes.extend(settle_bags(proposed))
    moved_in = []
    for item in proposed:
        if normalize_state(item.get("state")) != "unequipped":
            continue
        old_row = prior_rows.get(str(item.get("name") or "").lower()) or {}
        old_state = prior.get(str(item.get("name") or "").lower(), "unequipped")
        old_bag = _bag_key(str(old_row.get("container") or ""))
        new_bag = _bag_key(str(item.get("container") or ""))
        if old_state != "unequipped" or (new_bag and old_bag != new_bag):
            moved_in.append(item)
    for item in moved_in:
        if item.get("placed") is False:
            _restore(proposed, previous)
            return [f"{item.get('name')} does not fit. The bag is full."]
        if item.get("over_bag"):
            _restore(proposed, previous)
            return [str(item.get("over_bag"))]
    return notes


def over_capacity_block(character: dict[str, Any], items: list[dict[str, Any]], text: str) -> str | None:
    profile = carry_profile(character, items)
    if not profile["over"]:
        return None
    low = text or ""
    if not (_PICKUP_RE.search(low) or re.search(r"\b(puts on|put on|wears|dons|donned)\b", low, re.I)):
        return None
    for item in items:
        if str(item.get("name") or "").lower() not in low.lower() and not _mentioned_loose(item, low):
            continue
        spec = lookup(str(item.get("name") or ""))
        if _item_weight(annotate(item), spec) is None:
            continue
        return (
            f"Known gear is already {profile['label']}. "
            f"They cannot pick up or put on {item.get('name')}."
        )
    return None


def _mentioned_loose(item: dict[str, Any], text: str) -> bool:
    name = str(item.get("name") or "").lower()
    return bool(name) and name in text.lower()


def flight_block(character: dict[str, Any], items: list[dict[str, Any]], text: str) -> str | None:
    if not _FLY_RE.search(text or "") or not _flight_limited(character):
        return None
    for item in items:
        if not active(item) or item.get("effect") != "armor":
            continue
        category = lookup(str(item.get("name") or "")).get("category")
        if category in {"medium", "heavy"}:
            return f"They cannot fly while {item.get('name')} is equipped."
    return None


def attack_limits(
    character: dict[str, Any],
    items: list[dict[str, Any]],
    weapon: dict[str, Any] | None,
    text: str = "",
) -> dict[str, Any]:
    """Limits for the character's own attack. Does not change stored gear."""
    result: dict[str, Any] = {
        "blocked": None,
        "lines": [],
        "disadvantage": False,
        "attack_bonus": 0,
        "damage_extra": None,
        "ammo_name": None,
    }
    if not weapon:
        return result
    name = str(weapon.get("name") or "").strip()
    if not name:
        return result
    spec = lookup(name)
    features = _features(character).lower()
    weapon_blob = f"{name} {weapon.get('notes') or ''}".lower()
    repeating = "repeating shot" in features or "repeating shot" in weapon_blob
    lines: list[str] = result["lines"]

    if spec.get("effect") == "unarmed" or re.search(r"\bunarmed\b", name, re.I):
        _style_notes(character, items, spec, name, result)
        return result

    row = _find_item(items, name)
    if row is None or not active(row):
        state = normalize_state(row.get("state") if row else "unequipped")
        if state == "worn":
            result["blocked"] = f"{name} is on their person, not in their hands."
        else:
            result["blocked"] = f"{name} is in the bag."
        return result

    if int(spec.get("hands") or 0) >= 2:
        others = [
            i
            for i in items
            if active(i)
            and i is not row
            and lookup(str(i.get("name") or "")).get("effect") in {"weapon", "shield"}
            and int(lookup(str(i.get("name") or "")).get("hands") or 0) > 0
            and not (is_thri_kreen(character) and lookup(str(i.get("name") or "")).get("light"))
        ]
        if others:
            result["blocked"] = f"{name} needs both hands, and {others[0].get('name')} is equipped."
            return result

    if spec.get("heavy") and str(character.get("size") or "").lower() == "small":
        result["disadvantage"] = True
        lines.append(f"{name} is heavy, so this attack has disadvantage. They are Small.")

    ammo = spec.get("ammo")
    if ammo and not repeating:
        stack = _find_ammo(items, str(ammo))
        label = _AMMO[str(ammo)][1]
        if stack is None or stack.get("qty") is None:
            result["blocked"] = f"The {label} count is missing."
            return result
        qty = int(stack["qty"])
        if qty <= 0:
            result["blocked"] = f"No {label} left."
            return result
        lines.append(f"Uses 1 {_AMMO[str(ammo)][0]} ({qty - 1} left).")
        result["ammo_name"] = stack.get("name")

    if ammo and int(spec.get("hands") or 0) == 1 and not repeating:
        if _primary_hands_used(items, character) >= 2:
            result["blocked"] = f"Loading {name} needs a free hand."
            return result

    if spec.get("versatile") and _primary_hands_used(items, character) <= 1:
        lines.append(f"{name} is used in two hands.")

    if spec.get("loading") and "crossbow expert" not in features and not repeating:
        lines.append("Loading: only one shot with this weapon on this action.")

    _style_notes(character, items, spec, name, result)
    return result


def _style_notes(
    character: dict[str, Any],
    items: list[dict[str, Any]],
    spec: dict[str, Any],
    name: str,
    result: dict[str, Any],
) -> None:
    features = _features(character).lower()
    lines: list[str] = result["lines"]
    ranged = bool(spec.get("ammo")) or bool(re.search(r"\b(bow|crossbow|sling|dart|blowgun)\b", name, re.I))
    if ranged and re.search(r"\barchery\b", features):
        result["attack_bonus"] = int(result.get("attack_bonus") or 0) + 2
        lines.append("Archery fighting style: +2 to hit.")
    melee_weapons = [
        i
        for i in items
        if active(i)
        and lookup(str(i.get("name") or "")).get("effect") == "weapon"
        and not lookup(str(i.get("name") or "")).get("ammo")
        and int(lookup(str(i.get("name") or "")).get("hands") or 0) > 0
    ]
    if (
        not ranged
        and len(melee_weapons) == 1
        and re.search(r"\bdueling\b", features)
    ):
        result["damage_extra"] = "+2"
        lines.append("Dueling fighting style: +2 damage.")
    light_melee = [i for i in melee_weapons if lookup(str(i.get("name") or "")).get("light")]
    if spec.get("light") and len(light_melee) >= 2:
        if "two-weapon fighting" in features:
            lines.append("Two-Weapon Fighting: the bonus-action attack adds the ability modifier.")
        else:
            lines.append(
                "Two-weapon fighting: a bonus-action attack with the other light weapon does not add the ability modifier."
            )
    if "dual wielder" in features and len(melee_weapons) >= 2:
        lines.append("Dual Wielder: +1 AC while two melee weapons are equipped.")
    klass = _class_text(character)
    if "rogue" in klass and not ranged and not spec.get("finesse") and spec.get("effect") == "weapon":
        lines.append("Sneak Attack does not apply to this weapon.")


def _primary_hands_used(items: list[dict[str, Any]], character: dict[str, Any]) -> int:
    used = 0
    for item in items:
        if not active(item):
            continue
        spec = lookup(str(item.get("name") or ""))
        hands = int(spec.get("hands") or 0)
        if spec.get("effect") not in {"weapon", "shield"} or hands <= 0:
            continue
        if is_thri_kreen(character) and spec.get("light") and used >= 2:
            continue
        used += hands
    return used


def _find_item(items: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    low = name.lower()
    for item in items:
        if str(item.get("name") or "").lower() == low:
            return item
    for item in items:
        if low in str(item.get("name") or "").lower() or str(item.get("name") or "").lower() in low:
            return item
    return None


def _find_ammo(items: list[dict[str, Any]], kind: str) -> dict[str, Any] | None:
    for item in items:
        spec = lookup(str(item.get("name") or ""))
        if spec.get("effect") == "ammunition" and spec.get("ammo") == kind:
            if item.get("qty") is None:
                item["qty"] = parse_qty(str(item.get("name") or ""))
            return item
    return None


def spend_ammo(character: dict[str, Any], ammo_name: str) -> None:
    for item in character.get("equipment") or []:
        if str(item.get("name") or "") != str(ammo_name):
            continue
        qty = item.get("qty")
        if qty is None:
            qty = parse_qty(str(item.get("name") or ""))
        if qty is None:
            return
        nxt = max(0, int(qty) - 1)
        item["qty"] = nxt
        if re.search(r"\(\d+\)", str(item.get("name") or "")):
            item["name"] = re.sub(r"\(\d+\)", f"({nxt})", str(item["name"]), count=1)
        return


def natural_options(character: dict[str, Any], shield_on: bool) -> list[int]:
    dex = ability_mod(character, "dexterity")
    con = ability_mod(character, "constitution")
    wis = ability_mod(character, "wisdom")
    species = _species(character)
    klass = _class_text(character)
    features = _features(character).lower()
    options = [10 + dex]
    unarmored = "unarmored defense" in features or "unarmored defense" in klass
    if "barbarian" in klass and unarmored:
        options.append(10 + dex + con)
    if "monk" in klass and unarmored and not shield_on:
        options.append(10 + dex + wis)
    if "tortle" in species:
        options.append(17)
    if "lizardfolk" in species:
        options.append(13 + dex)
    if "loxodon" in species:
        options.append(12 + con)
    base = max(options)
    if "simic" in species and "carapace" in features:
        base += 1
    return [base]
