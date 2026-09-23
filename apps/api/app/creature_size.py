"""5e creature size categories → battle-map token footprint (squares)."""

from __future__ import annotations

from typing import Any

SIZES = ("Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan")

# Side length in grid squares (Tiny drawn smaller inside one cell)
SIZE_TO_SQUARES: dict[str, float] = {
    "Tiny": 0.5,
    "Small": 1.0,
    "Medium": 1.0,
    "Large": 2.0,
    "Huge": 3.0,
    "Gargantuan": 4.0,
}

# Species / race name fragments → default size (first match wins, case-insensitive)
_SPECIES_SIZE: list[tuple[str, str]] = [
    ("halfling", "Small"),
    ("autognome", "Small"),
    ("grung", "Small"),
    ("gnome", "Small"),
    ("goblin", "Small"),
    ("kobold", "Small"),
    ("fairy", "Small"),
    ("kenku", "Medium"),
    ("tabaxi", "Medium"),
    ("aasimar", "Medium"),
    ("tiefling", "Medium"),
    ("human", "Medium"),
    ("half-elf", "Medium"),
    ("halfelf", "Medium"),
    ("elf", "Medium"),
    ("dwarf", "Medium"),
    ("half-orc", "Medium"),
    ("halforc", "Medium"),
    ("half orc", "Medium"),
    ("orc", "Medium"),
    ("dragonborn", "Medium"),
    ("goliath", "Medium"),
    ("firbolg", "Medium"),
    ("genasi", "Medium"),
    ("tortle", "Medium"),
    ("lizardfolk", "Medium"),
    ("yuan-ti", "Medium"),
    ("bugbear", "Medium"),
    ("hobgoblin", "Medium"),
    ("centaur", "Medium"),
    ("minotaur", "Medium"),
    ("harengon", "Medium"),
    ("owlin", "Medium"),
    ("satyr", "Medium"),
    ("leonin", "Medium"),
    ("warforged", "Medium"),
    ("changeling", "Medium"),
    ("kalashtar", "Medium"),
    ("shifter", "Medium"),
    ("vedalken", "Medium"),
    ("loxodon", "Medium"),
    ("simic", "Medium"),
    ("thri-kreen", "Medium"),
    ("githyanki", "Medium"),
    ("githzerai", "Medium"),
    ("duergar", "Medium"),
    ("drow", "Medium"),
    ("aarakocra", "Medium"),
    ("triton", "Medium"),
    ("giff", "Medium"),
    ("locathah", "Medium"),
    ("eladrin", "Medium"),
    ("hadozee", "Medium"),
    ("dhampir", "Medium"),
    ("hexblood", "Medium"),
    ("reborn", "Medium"),
    ("plasmoid", "Medium"),
]


def size_from_species(species: str | None) -> str:
    text = (species or "").lower().strip()
    if not text:
        return "Medium"
    if any(name in text for name in ("owlin", "plasmoid", "custom lineage")) and "small" in text:
        return "Small"
    for needle, size in _SPECIES_SIZE:
        if needle in text:
            return size
    return "Medium"


def normalize_size(raw: Any, default: str = "Medium") -> str:
    if raw is None:
        return default
    s = str(raw).strip()
    if not s:
        return default
    for name in SIZES:
        if s.lower() == name.lower():
            return name
    # Allow "Large creature" etc.
    for name in SIZES:
        if name.lower() in s.lower():
            return name
    return default


def size_to_squares(size: Any) -> float:
    return SIZE_TO_SQUARES.get(normalize_size(size), 1.0)


def ensure_character_size(data: dict[str, Any]) -> dict[str, Any]:
    out = dict(data)
    if out.get("size"):
        out["size"] = normalize_size(out["size"])
    else:
        out["size"] = size_from_species(out.get("species"))
    out["size_sq"] = size_to_squares(out["size"])
    return out


def ensure_creature_size(data: dict[str, Any], default: str = "Medium") -> dict[str, Any]:
    out = dict(data)
    out["size"] = normalize_size(out.get("size"), default)
    out["size_sq"] = size_to_squares(out["size"])
    return out
