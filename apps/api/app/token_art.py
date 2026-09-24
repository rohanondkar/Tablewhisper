"""Built-in D&D 5e–style circular token portraits (offline pack)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .config import RULES_DIR

TOKEN_DIR = RULES_DIR / "token-portraits"
MEDIA_TOKENS = "/media/tokens"

# Creature type (lowercase) -> portrait file
TYPE_PORTRAITS: dict[str, str] = {
    "beast": "token-beast.png",
    "dragon": "token-dragon.png",
    "humanoid": "token-humanoid.png",
    "monstrosity": "token-monstrosity.png",
    "fiend": "token-fiend.png",
    "undead": "token-undead.png",
    "elemental": "token-elemental.png",
    "giant": "token-giant.png",
    "construct": "token-construct.png",
    "plant": "token-plant.png",
    "fey": "token-fey.png",
    "celestial": "token-celestial.png",
    "aberration": "token-aberration.png",
    "ooze": "token-ooze.png",
}

# id / name keywords (longer / more specific first)
KEYWORD_PORTRAITS: list[tuple[str, str]] = [
    ("hobgoblin", "token-goblin.png"),
    ("goblin", "token-goblin.png"),
    ("bugbear", "token-orc.png"),
    ("orc", "token-orc.png"),
    ("kobold", "token-humanoid.png"),
    ("gnoll", "token-humanoid.png"),
    ("merfolk", "token-humanoid.png"),
    ("bandit", "token-humanoid.png"),
    ("cultist", "token-humanoid.png"),
    ("guard", "token-npc-guard.png"),
    ("knight", "token-humanoid.png"),
    ("veteran", "token-humanoid.png"),
    ("assassin", "token-npc-shady.png"),
    ("thug", "token-npc-shady.png"),
    ("skeleton", "token-undead.png"),
    ("zombie", "token-undead.png"),
    ("vampire", "token-undead.png"),
    ("ghost", "token-undead.png"),
    ("wraith", "token-undead.png"),
    ("lich", "token-undead.png"),
    ("mummy", "token-undead.png"),
    ("ghoul", "token-undead.png"),
    ("wight", "token-undead.png"),
    ("ankheg", "token-ankheg.png"),
    ("kraken", "token-kraken.png"),
    ("dragon", "token-dragon-red.png"),
    ("wyrmling", "token-dragon-red.png"),
    ("devil", "token-fiend.png"),
    ("demon", "token-fiend.png"),
    ("yugoloth", "token-fiend.png"),
    ("imp", "token-fiend.png"),
    ("quasit", "token-fiend.png"),
    ("elemental", "token-elemental.png"),
    ("mephit", "token-elemental.png"),
    ("golem", "token-construct.png"),
    ("animated", "token-construct.png"),
    ("homunculus", "token-construct.png"),
    ("modron", "token-construct.png"),
    ("giant", "token-giant.png"),
    ("ogre", "token-giant.png"),
    ("troll", "token-giant.png"),
    ("ettin", "token-giant.png"),
    ("cyclops", "token-giant.png"),
    ("mimic", "token-chest.png"),
    ("owlbear", "token-owlbear.png"),
    ("hydra", "token-monstrosity.png"),
    ("chimera", "token-monstrosity.png"),
    ("manticore", "token-monstrosity.png"),
    ("basilisk", "token-monstrosity.png"),
    ("cockatrice", "token-monstrosity.png"),
    ("grick", "token-monstrosity.png"),
    ("mind flayer", "token-aberration.png"),
    ("illithid", "token-aberration.png"),
    ("beholder", "token-aberration.png"),
    ("aboleth", "token-aberration.png"),
    ("nothic", "token-aberration.png"),
    ("ooze", "token-ooze.png"),
    ("jelly", "token-ooze.png"),
    ("pudding", "token-ooze.png"),
    ("slime", "token-ooze.png"),
    ("dryad", "token-fey.png"),
    ("satyr", "token-fey.png"),
    ("sprite", "token-fey.png"),
    ("pixie", "token-fey.png"),
    ("hag", "token-fey.png"),
    ("angel", "token-celestial.png"),
    ("deva", "token-celestial.png"),
    ("pegasus", "token-celestial.png"),
    ("unicorn", "token-celestial.png"),
    ("treant", "token-plant.png"),
    ("blight", "token-plant.png"),
    ("shambling", "token-plant.png"),
    ("wolf", "token-beast.png"),
    ("bear", "token-beast.png"),
    ("spider", "token-beast.png"),
    ("snake", "token-beast.png"),
    ("rat", "token-beast.png"),
    ("bat", "token-beast.png"),
    ("boar", "token-beast.png"),
    ("horse", "token-beast.png"),
    ("eagle", "token-beast.png"),
    ("hawk", "token-beast.png"),
    ("shark", "token-beast.png"),
]

NPC_ROLE_PORTRAITS: list[tuple[str, str]] = [
    ("bartender", "token-npc-bartender.png"),
    ("barkeep", "token-npc-bartender.png"),
    ("barmaid", "token-npc-barmaid.png"),
    ("server", "token-npc-barmaid.png"),
    ("innkeeper", "token-npc-innkeeper.png"),
    ("landlord", "token-npc-innkeeper.png"),
    ("guard", "token-npc-guard.png"),
    ("door", "token-npc-guard.png"),
    ("merchant", "token-npc-merchant.png"),
    ("trader", "token-npc-merchant.png"),
    ("bard", "token-npc-bard.png"),
    ("priest", "token-npc-priest.png"),
    ("cleric", "token-npc-priest.png"),
    ("blacksmith", "token-npc-blacksmith.png"),
    ("smith", "token-npc-blacksmith.png"),
    ("shady", "token-npc-shady.png"),
    ("patron", "token-npc-shady.png"),
    ("stable", "token-npc-stable.png"),
]

NPC_ID_PORTRAITS: dict[str, str] = {
    "mira": "token-npc-bartender.png",
    "tamsin": "token-npc-barmaid.png",
    "harlan": "token-npc-innkeeper.png",
    "cole": "token-npc-guard.png",
    "brenna": "token-npc-merchant.png",
    "lilo": "token-npc-bard.png",
    "vex": "token-npc-shady.png",
    "elara": "token-npc-priest.png",
    "garr": "token-npc-blacksmith.png",
    "pip": "token-npc-stable.png",
}


def media_url(filename: str) -> str:
    return f"{MEDIA_TOKENS}/{filename}"


def portrait_path(filename: str) -> Path:
    return TOKEN_DIR / filename


def exists(filename: str) -> bool:
    return portrait_path(filename).is_file()


def _first_type(raw: Any) -> str:
    text = str(raw or "").lower().strip()
    if not text:
        return ""
    return text.split(",")[0].split("(")[0].strip()


DRAGON_COLORS = (
    "black",
    "blue",
    "green",
    "white",
    "brass",
    "bronze",
    "copper",
    "gold",
    "silver",
    "red",
)


def dragon_file(hay: str) -> str | None:
    """Pick a colored dragon portrait. Color words only count inside a dragon name."""
    if "dragon" not in hay and "wyrmling" not in hay:
        return None
    for color in DRAGON_COLORS:
        fname = f"token-dragon-{color}.png"
        if color in hay and exists(fname):
            return fname
    if exists("token-dragon-red.png"):
        return "token-dragon-red.png"
    if exists("token-dragon.png"):
        return "token-dragon.png"
    return None


def mimic_portrait(revealed: bool) -> str:
    fname = "token-mimic.png" if revealed else "token-chest.png"
    if exists(fname):
        return media_url(fname)
    return media_url("token-monstrosity.png")


def placed_enemy_image(encounter: dict[str, Any], token: dict[str, Any] | None = None) -> str:
    """Catalog portrait, except a mimic stays a chest until the map token is revealed."""
    img = encounter.get("image_url") or "/media/tokens/token-humanoid.png"
    template = encounter.get("template") if isinstance(encounter.get("template"), dict) else {}
    token = token or {}
    hay = " ".join(
        str(part or "")
        for part in (
            encounter.get("label"),
            encounter.get("name"),
            token.get("label"),
            template.get("id"),
            template.get("name"),
        )
    ).lower()
    if "mimic" in hay:
        data = token.get("data") if isinstance(token.get("data"), dict) else {}
        return mimic_portrait(bool(data.get("mimic_revealed")))
    return img


def monster_portrait(monster: dict[str, Any]) -> str:
    """Return /media/tokens/... URL for a monster.

    Painted type portraits (token-beast.png and the rest) are the creature art.
    The flat icons in monsters/{id}.png are skipped.
    """
    mid = str(monster.get("id") or "").lower()
    name = str(monster.get("name") or "").lower()
    hay = f"{mid} {name}"

    dragon = dragon_file(hay)
    if dragon:
        return media_url(dragon)

    for needle, fname in KEYWORD_PORTRAITS:
        if needle in hay and exists(fname):
            return media_url(fname)

    ctype = _first_type(monster.get("type"))
    fname = TYPE_PORTRAITS.get(ctype, "token-humanoid.png")
    if exists(fname):
        return media_url(fname)
    if exists("token-humanoid.png"):
        return media_url("token-humanoid.png")
    return media_url("token-beast.png")


def npc_portrait(npc: dict[str, Any]) -> str:
    nid = str(npc.get("id") or "").lower()
    if nid in NPC_ID_PORTRAITS and exists(NPC_ID_PORTRAITS[nid]):
        return media_url(NPC_ID_PORTRAITS[nid])

    role = str(npc.get("role") or "").lower()
    name = str(npc.get("name") or "").lower()
    hay = f"{nid} {role} {name}"
    for needle, fname in NPC_ROLE_PORTRAITS:
        if needle in hay and exists(fname):
            return media_url(fname)

    if exists("token-npc-generic.png"):
        return media_url("token-npc-generic.png")
    return media_url("token-humanoid.png")
