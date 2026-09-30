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

def _move(
    *,
    on: str,
    check: str,
    notes: str,
    steps: str,
    name: str,
    detail: str,
    skill: str | None = None,
    ability: str | None = None,
    when: str = "always",
    extra: str | None = None,
) -> dict[str, Any]:
    return {
        "on": on,
        "check": check,
        "notes": notes,
        "steps": steps,
        "effect_name": name,
        "detail": detail,
        "skill": skill,
        "ability": ability,
        "when": when,
        "extra": extra,
    }


_FEATURES = {
    "second wind": _move(
        on="self",
        check="heal",
        notes="Bonus action. Roll 1d10 and add your fighter level. That total is hit points regained.",
        steps=(
            "1) This is a bonus action.\n"
            "2) Roll 1d10 and add {level} (fighter level).\n"
            "3) {who} regains that many hit points.\n"
            "4) This can be used twice, then {who} needs a long rest."
        ),
        name="Second Wind",
        detail="Regained hit points. Two uses, then a long rest.",
    ),
}

_MOVES = {
    "dash": _move(
        on="self",
        check="spell",
        notes="No roll. Speed this turn is added again.",
        steps=(
            "1) No roll.\n"
            "2) {who}'s speed this turn is added again.\n"
            "3) Hit points stay.\n"
            "4) Confirm to leave Dash on {who}."
        ),
        name="Dash",
        detail="Speed this turn is added again.",
    ),
    "disengage": _move(
        on="self",
        check="spell",
        notes="No roll. Movement this turn does not provoke opportunity attacks.",
        steps=(
            "1) No roll.\n"
            "2) {who}'s movement this turn does not provoke opportunity attacks.\n"
            "3) Hit points stay.\n"
            "4) Confirm to leave Disengage on {who}."
        ),
        name="Disengage",
        detail="Movement this turn does not provoke opportunity attacks.",
    ),
    "dodge": _move(
        on="self",
        check="spell",
        notes="No roll. Until their next turn, attacks against them have disadvantage and they have advantage on Dexterity saves.",
        steps=(
            "1) No roll.\n"
            "2) Until the start of {who}'s next turn, attack rolls against them have disadvantage.\n"
            "3) {who} has advantage on Dexterity saving throws until then.\n"
            "4) Hit points stay. Confirm to leave Dodge on {who}."
        ),
        name="Dodge",
        detail="Until their next turn, attacks against them have disadvantage and they have advantage on Dexterity saves.",
    ),
    "hide": _move(
        on="self",
        check="skill",
        skill="stealth",
        ability="dexterity",
        when="success",
        notes="Roll a Dexterity (Stealth) check. Meeting or beating a watcher's passive Perception means they are hidden.",
        steps=(
            "1) Roll 1d20.\n"
            "2) Add {bonus:+d} (Dexterity (Stealth) from the sheet).\n"
            "3) If the total meets or beats a watcher's passive Perception, {who} is hidden from them.\n"
            "4) Confirm a success to leave Hidden on {who}."
        ),
        name="Hidden",
        detail="Hidden from watchers whose passive Perception the Stealth total met.",
    ),
    "search": _move(
        on="self",
        check="skill",
        skill="perception",
        ability="wisdom",
        notes="Roll a Wisdom (Perception) check. The total is what they notice.",
        steps=(
            "1) Roll 1d20.\n"
            "2) Add {bonus:+d} (Wisdom (Perception) from the sheet).\n"
            "3) The total is how well {who} notices something hidden.\n"
            "4) Hit points stay."
        ),
        name="Searched",
        detail="The Perception total is what they noticed.",
    ),
    "help": _move(
        on="target",
        check="spell",
        notes="No attack roll. The next ally check has advantage, or the next attack against this creature has advantage.",
        steps=(
            "1) No attack roll.\n"
            "2) {who} helps {target}.\n"
            "3) The next ability check an ally makes before {who}'s next turn has advantage.\n"
            "4) If this is against a creature within 5 feet, the next attack roll against {target} has advantage instead.\n"
            "5) Hit points stay. Confirm to leave Help on {target}."
        ),
        name="Help",
        detail="The next ally check has advantage, or the next attack against them has advantage.",
    ),
    "grapple": _move(
        on="target",
        check="contest",
        skill="athletics",
        ability="strength",
        when="contest_win",
        notes="Both roll Strength (Athletics). The target may roll Dexterity (Acrobatics) instead. If you win, their speed becomes 0.",
        steps=(
            "1) {who} rolls 1d20 and adds {bonus:+d} (Strength (Athletics)).\n"
            "2) {target} rolls Strength (Athletics) or Dexterity (Acrobatics). Enter their total.\n"
            "3) The higher total wins. A tie changes nothing.\n"
            "4) If {who} wins, {target} is grappled and their speed becomes 0.\n"
            "5) Hit points stay."
        ),
        name="Grappled",
        detail="Grappled. Speed is 0.",
    ),
    "shove": _move(
        on="target",
        check="contest",
        skill="athletics",
        ability="strength",
        when="contest_win",
        notes="Both roll Strength (Athletics). The target may roll Dexterity (Acrobatics) instead. If you win, they fall prone or move 5 feet.",
        steps=(
            "1) {who} rolls 1d20 and adds {bonus:+d} (Strength (Athletics)).\n"
            "2) {target} rolls Strength (Athletics) or Dexterity (Acrobatics). Enter their total.\n"
            "3) The higher total wins. A tie changes nothing.\n"
            "4) If {who} wins, knock {target} prone or push them 5 feet.\n"
            "5) Hit points stay."
        ),
        name="Shoved",
        detail="Knocked prone or pushed 5 feet.",
    ),
    "rage": _move(
        on="self",
        check="spell",
        notes="No roll. While raging, melee attacks add bonus damage, Strength checks and saves have advantage, and attacks against them have advantage.",
        steps=(
            "1) No roll.\n"
            "2) {who} rages.\n"
            "3) Their melee attacks add bonus damage, and they have advantage on Strength checks and Strength saves.\n"
            "4) Attack rolls against {who} have advantage while this lasts.\n"
            "5) Hit points stay. Confirm to leave Rage on {who}."
        ),
        name="Rage",
        detail="Raging. Melee damage bonus, advantage on Strength checks and saves.",
    ),
    "berserk": _move(
        on="self",
        check="spell",
        notes="No roll. They are berserk, with the same red rage on the token.",
        steps=(
            "1) No roll.\n"
            "2) {who} goes berserk.\n"
            "3) They fight in a frenzy until this is cleared.\n"
            "4) Hit points stay. Confirm to leave Berserk on {who}."
        ),
        name="Berserk",
        detail="Berserk.",
    ),
    "berserker strength": _move(
        on="self",
        check="spell",
        notes="No roll. Berserker strength is on them.",
        steps=(
            "1) No roll.\n"
            "2) {who} draws on berserker strength.\n"
            "3) Their attacks hit harder while this lasts.\n"
            "4) Hit points stay. Confirm to leave Berserker Strength on {who}."
        ),
        name="Berserker Strength",
        detail="Berserker strength.",
    ),
    "reckless": _move(
        on="self",
        check="spell",
        notes="No roll. Their attacks have advantage, and attacks against them have advantage.",
        steps=(
            "1) No roll.\n"
            "2) {who} attacks recklessly.\n"
            "3) Their attack rolls have advantage, and attack rolls against them have advantage until their next turn.\n"
            "4) Hit points stay. Confirm to leave Reckless on {who}."
        ),
        name="Reckless",
        detail="Attacking recklessly. Advantage both ways.",
    ),
    "prone": _move(
        on="self",
        check="spell",
        notes="No roll. They are prone. Attacks within 5 feet have advantage against them, and their attacks have disadvantage.",
        steps=(
            "1) No roll.\n"
            "2) {who} is prone.\n"
            "3) Attacks against them from within 5 feet have advantage. Their own attacks have disadvantage.\n"
            "4) Standing costs half their speed. Confirm to leave Prone on {who}."
        ),
        name="Prone",
        detail="Prone. Melee attacks against them have advantage.",
    ),
    "frightened": _move(
        on="self",
        check="spell",
        notes="No roll. They are frightened. They have disadvantage on checks and attacks while the source is in sight, and they cannot move closer.",
        steps=(
            "1) No roll.\n"
            "2) {who} is frightened.\n"
            "3) While the source is in sight, they have disadvantage on ability checks and attack rolls, and they cannot willingly move closer.\n"
            "4) Hit points stay. Confirm to leave Frightened on {who}."
        ),
        name="Frightened",
        detail="Frightened.",
    ),
    "poisoned": _move(
        on="self",
        check="spell",
        notes="No roll. They are poisoned. Attack rolls and ability checks have disadvantage.",
        steps=(
            "1) No roll.\n"
            "2) {who} is poisoned.\n"
            "3) Their attack rolls and ability checks have disadvantage.\n"
            "4) Hit points stay. Confirm to leave Poisoned on {who}."
        ),
        name="Poisoned",
        detail="Poisoned. Attacks and checks have disadvantage.",
    ),
    "charmed": _move(
        on="self",
        check="spell",
        notes="No roll. They are charmed. They cannot attack the charmer, and the charmer has advantage on social checks against them.",
        steps=(
            "1) No roll.\n"
            "2) {who} is charmed.\n"
            "3) They cannot attack the charmer, and the charmer has advantage on social checks against them.\n"
            "4) Hit points stay. Confirm to leave Charmed on {who}."
        ),
        name="Charmed",
        detail="Charmed.",
    ),
    "paralyzed": _move(
        on="self",
        check="spell",
        notes="No roll. They are paralyzed. They cannot move or act, attacks against them have advantage, and a hit from within 5 feet is a critical hit.",
        steps=(
            "1) No roll.\n"
            "2) {who} is paralyzed.\n"
            "3) They cannot move or take actions. Attacks against them have advantage, and a hit from within 5 feet is a critical hit.\n"
            "4) Strength and Dexterity saves fail automatically. Confirm to leave Paralyzed on {who}."
        ),
        name="Paralyzed",
        detail="Paralyzed.",
    ),
    "stunned": _move(
        on="self",
        check="spell",
        notes="No roll. They are stunned. They cannot move or act, and attacks against them have advantage.",
        steps=(
            "1) No roll.\n"
            "2) {who} is stunned.\n"
            "3) They cannot move or take actions. Attacks against them have advantage.\n"
            "4) Strength and Dexterity saves fail automatically. Confirm to leave Stunned on {who}."
        ),
        name="Stunned",
        detail="Stunned.",
    ),
    "restrained": _move(
        on="self",
        check="spell",
        notes="No roll. They are restrained. Speed is 0, attacks against them have advantage, and their attacks and Dexterity saves have disadvantage.",
        steps=(
            "1) No roll.\n"
            "2) {who} is restrained.\n"
            "3) Their speed is 0. Attacks against them have advantage.\n"
            "4) Their attacks and Dexterity saving throws have disadvantage. Confirm to leave Restrained on {who}."
        ),
        name="Restrained",
        detail="Restrained. Speed is 0.",
    ),
    "blinded": _move(
        on="self",
        check="spell",
        notes="No roll. They are blinded. They cannot see, attacks against them have advantage, and their attacks have disadvantage.",
        steps=(
            "1) No roll.\n"
            "2) {who} is blinded.\n"
            "3) They cannot see. Attacks against them have advantage, and their attacks have disadvantage.\n"
            "4) Hit points stay. Confirm to leave Blinded on {who}."
        ),
        name="Blinded",
        detail="Blinded.",
    ),
    "unconscious": _move(
        on="self",
        check="spell",
        notes="No roll. They are unconscious. They drop what they are holding, fall prone, and attacks against them have advantage.",
        steps=(
            "1) No roll.\n"
            "2) {who} is unconscious.\n"
            "3) They drop what they are holding and fall prone. Attacks against them have advantage, and a hit from within 5 feet is a critical hit.\n"
            "4) Strength and Dexterity saves fail automatically. Confirm to leave Unconscious on {who}."
        ),
        name="Unconscious",
        detail="Unconscious.",
    ),
    "burning": _move(
        on="self",
        check="spell",
        notes="No roll. They are on fire.",
        steps=(
            "1) No roll.\n"
            "2) {who} is burning.\n"
            "3) They take fire damage at the time the table calls for it.\n"
            "4) Confirm to leave Burning on {who}."
        ),
        name="Burning",
        detail="On fire.",
    ),
}

# Non-damage spells. extra is added to a later weapon hit from the same attacker.
_BUFFS: dict[str, dict[str, Any]] = {
    "hunter's mark": {
        "on": "target",
        "extra": "1d6",
        "detail": "This attacker's weapon hits deal an extra 1d6.",
        "notes": "No attack roll. The target is marked. This attacker's later weapon hits deal an extra 1d6.",
        "steps": (
            "1) No attack roll.\n"
            "2) {who} marks {target}.\n"
            "3) While this lasts, {who}'s weapon hits against {target} deal an extra 1d6.\n"
            "4) Confirm to leave Hunter's Mark on {target}."
        ),
    },
    "hex": {
        "on": "target",
        "extra": "1d6",
        "detail": "This attacker's hits deal an extra 1d6 necrotic, and the target has disadvantage on checks with one ability.",
        "notes": "No attack roll. The target is hexed. This attacker's later hits deal an extra 1d6 necrotic.",
        "steps": (
            "1) No attack roll.\n"
            "2) {who} hexes {target}.\n"
            "3) {who}'s hits against {target} deal an extra 1d6 necrotic.\n"
            "4) {target} has disadvantage on ability checks with the ability {who} chose.\n"
            "5) Confirm to leave Hex on {target}."
        ),
    },
    "bless": {
        "on": "target",
        "detail": "Add 1d4 to attack rolls and saving throws.",
        "notes": "No attack roll. The target adds 1d4 to attack rolls and saving throws.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target} adds 1d4 whenever they make an attack roll or a saving throw.\n"
            "3) Hit points stay. Confirm to leave Bless on {target}."
        ),
    },
    "bane": {
        "on": "target",
        "detail": "Subtract 1d4 from attack rolls and saving throws.",
        "notes": "No attack roll. The target subtracts 1d4 from attack rolls and saving throws.",
        "steps": (
            "1) No attack roll. They still make the spell's saving throw if one was called for.\n"
            "2) {target} subtracts 1d4 from attack rolls and saving throws.\n"
            "3) Hit points stay. Confirm to leave Bane on {target}."
        ),
    },
    "shield of faith": {
        "on": "target",
        "detail": "+2 bonus to AC.",
        "notes": "No attack roll. The target gains a +2 bonus to AC.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target} gains a +2 bonus to Armor Class while this lasts.\n"
            "3) Hit points stay. Confirm to leave Shield of Faith on {target}."
        ),
    },
    "aid": {
        "on": "target",
        "detail": "Hit point maximum and current hit points increase by 5.",
        "notes": "No attack roll. Hit point maximum and current hit points increase by 5.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target}'s hit point maximum and current hit points each increase by 5.\n"
            "3) Confirm to leave Aid on {target}."
        ),
    },
    "guidance": {
        "on": "target",
        "detail": "Once, add 1d4 to an ability check.",
        "notes": "No attack roll. Once before the spell ends, the target adds 1d4 to an ability check.",
        "steps": (
            "1) No attack roll.\n"
            "2) Once before this ends, {target} adds 1d4 to one ability check.\n"
            "3) Confirm to leave Guidance on {target}."
        ),
    },
    "resistance": {
        "on": "target",
        "detail": "Once, add 1d4 to a saving throw.",
        "notes": "No attack roll. Once before the spell ends, the target adds 1d4 to a saving throw.",
        "steps": (
            "1) No attack roll.\n"
            "2) Once before this ends, {target} adds 1d4 to one saving throw.\n"
            "3) Confirm to leave Resistance on {target}."
        ),
    },
    "faerie fire": {
        "on": "target",
        "detail": "Attack rolls against them have advantage if they failed the save.",
        "notes": "No attack roll on this card. If they failed the save, attacks against them have advantage.",
        "steps": (
            "1) No attack roll on this card.\n"
            "2) If {target} failed the Dexterity save, attack rolls against them have advantage.\n"
            "3) Confirm to leave Faerie Fire on {target}."
        ),
    },
    "shield": {
        "on": "self",
        "detail": "+5 AC until their next turn, including against the triggering attack.",
        "notes": "No attack roll. +5 AC until their next turn, including against the triggering attack.",
        "steps": (
            "1) No attack roll. This is a reaction.\n"
            "2) {who} gains a +5 bonus to AC until the start of their next turn, including against the triggering attack.\n"
            "3) Confirm to leave Shield on {who}."
        ),
    },
    "mage armor": {
        "on": "target",
        "detail": "While unarmored, AC is 13 + Dexterity modifier.",
        "notes": "No attack roll. While the target is unarmored, their AC is 13 + their Dexterity modifier.",
        "steps": (
            "1) No attack roll.\n"
            "2) While {target} wears no armor, their AC becomes 13 + their Dexterity modifier.\n"
            "3) Confirm to leave Mage Armor on {target}."
        ),
    },
    "blur": {
        "on": "self",
        "detail": "Attack rolls against them have disadvantage.",
        "notes": "No attack roll. Attack rolls against them have disadvantage.",
        "steps": (
            "1) No attack roll.\n"
            "2) Attack rolls against {who} have disadvantage while this lasts.\n"
            "3) Confirm to leave Blur on {who}."
        ),
    },
    "haste": {
        "on": "target",
        "detail": "Double speed, +2 AC, advantage on Dexterity saves, and one extra action.",
        "notes": "No attack roll. Double speed, +2 AC, advantage on Dexterity saves, and one extra action.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target}'s speed is doubled, they gain +2 AC, and they have advantage on Dexterity saves.\n"
            "3) They gain one extra action each turn, limited to Attack (one weapon attack), Dash, Disengage, Hide, or Use an Object.\n"
            "4) Confirm to leave Haste on {target}."
        ),
    },
    "barkskin": {
        "on": "target",
        "detail": "AC cannot be lower than 16.",
        "notes": "No attack roll. The target's AC cannot be lower than 16.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target}'s AC cannot be lower than 16 while this lasts.\n"
            "3) Confirm to leave Barkskin on {target}."
        ),
    },
    "longstrider": {
        "on": "target",
        "detail": "Speed increases by 10 feet.",
        "notes": "No attack roll. Speed increases by 10 feet.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target}'s speed increases by 10 feet.\n"
            "3) Confirm to leave Longstrider on {target}."
        ),
    },
    "enhance ability": {
        "on": "target",
        "detail": "Advantage on checks with the chosen ability.",
        "notes": "No attack roll. The target has advantage on ability checks with the chosen ability.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target} has advantage on ability checks made with the ability {who} chose.\n"
            "3) Confirm to leave Enhance Ability on {target}."
        ),
    },
    "heroism": {
        "on": "target",
        "detail": "Immune to being frightened, and gains temporary hit points at the start of each turn.",
        "notes": "No attack roll. The target cannot be frightened and gains temporary hit points each turn.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target} is immune to being frightened.\n"
            "3) At the start of each of their turns they gain temporary hit points equal to {who}'s spellcasting modifier.\n"
            "4) Confirm to leave Heroism on {target}."
        ),
    },
    "invisibility": {
        "on": "target",
        "detail": "Invisible until they attack or cast a spell.",
        "notes": "No attack roll. The target is invisible until they attack or cast a spell.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target} is invisible until they attack or cast a spell.\n"
            "3) Confirm to leave Invisible on {target}."
        ),
    },
    "greater invisibility": {
        "on": "target",
        "detail": "Invisible, including while they attack or cast.",
        "notes": "No attack roll. The target is invisible, including while they attack or cast a spell.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target} is invisible even while they attack or cast a spell.\n"
            "3) Confirm to leave Greater Invisibility on {target}."
        ),
    },
    "pass without trace": {
        "on": "target",
        "detail": "+10 bonus to Dexterity (Stealth) checks.",
        "notes": "No attack roll. The target has a +10 bonus to Dexterity (Stealth) checks.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target} has a +10 bonus to Dexterity (Stealth) checks.\n"
            "3) Confirm to leave Pass without Trace on {target}."
        ),
    },
    "darkvision": {
        "on": "target",
        "detail": "Can see in darkness out to 60 feet as if it were dim light.",
        "notes": "No attack roll. The target can see in darkness out to 60 feet as if it were dim light.",
        "steps": (
            "1) No attack roll.\n"
            "2) {target} can see in darkness out to 60 feet as if it were dim light.\n"
            "3) Confirm to leave Darkvision on {target}."
        ),
    },
    "mirror image": {
        "on": "self",
        "detail": "Three duplicates can take a hit in their place.",
        "notes": "No attack roll. Three duplicates can intercept an attack.",
        "steps": (
            "1) No attack roll.\n"
            "2) {who} has three duplicates. A hit might strike a duplicate instead of them.\n"
            "3) Confirm to leave Mirror Image on {who}."
        ),
    },
    "sanctuary": {
        "on": "target",
        "detail": "An attacker must succeed on a Wisdom save or choose a new target.",
        "notes": "No attack roll. An attacker must succeed on a Wisdom save or choose a new target.",
        "steps": (
            "1) No attack roll on this card.\n"
            "2) Before attacking {target}, a creature must succeed on a Wisdom save or choose a new target.\n"
            "3) Confirm to leave Sanctuary on {target}."
        ),
    },
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


def _skill_mod(character: dict[str, Any] | None, skill: str | None) -> int | None:
    if not character or not skill:
        return None
    data = (character.get("skills") or {}).get(skill) or {}
    if not isinstance(data, dict) or data.get("modifier") is None:
        return None
    try:
        return int(data["modifier"])
    except (TypeError, ValueError):
        return None


def _fighter_level(character: dict[str, Any] | None) -> int:
    text = str((character or {}).get("class_level") or "")
    found = re.search(r"fighter\s*(\d+)", text, re.I)
    if found:
        return max(1, int(found.group(1)))
    return _caster_level(character)


def _fill(template: str, *, who: str, target: str, bonus: int, level: int) -> str:
    return template.format(who=who, target=target or who, bonus=bonus, level=level)


def _effect_payload(card: dict[str, Any], *, who: str, target: str, bonus: int, level: int) -> dict[str, Any]:
    landing = card.get("on") or "self"
    subject = target if landing == "target" and target else who
    return {
        "name": card.get("effect_name") or card.get("name") or "Effect",
        "detail": _fill(str(card.get("detail") or ""), who=who, target=subject, bonus=bonus, level=level),
        "on": "target" if landing == "target" and target else "self",
        "extra": card.get("extra"),
        "when": card.get("when") or "always",
    }


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
    card = move or feature
    buff = _BUFFS.get(key)
    if card is not None:
        check = str(card["check"])
        note = str(card["notes"])
    elif buff is not None:
        check = "spell"
        note = str(buff["notes"])
    elif spell is not None:
        resolution = str(spell["resolution"])
        note = str(spell["note"])
        check = {"attack": "attack", "save": "save", "heal": "heal"}.get(resolution, "spell")
        if resolution == "none" and re.search(r"hit points stay", note, re.I):
            note = f"No attack roll. Confirm to leave {name} on them. Hit points do not change on this card."
    else:
        note = "This is not an attack. No range is on file, and no bonus is added."
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
    bonus, printed = _printed_attack(character, name)
    rule = _damage_table().get(name.lower()) if spell and card is None else None
    formula = _spell_formula(rule, character) if isinstance(rule, dict) else None
    skill_name = (card or {}).get("skill") if card else None
    ability_name = (card or {}).get("ability") if card else None
    if check in {"skill", "contest"} and skill_name:
        skill_bonus = _skill_mod(character, str(skill_name))
        bonus = 0 if skill_bonus is None else skill_bonus
    elif check == "attack" and bonus is None and character:
        mod = _shown_mod(character, _caster_ability(character))
        if mod is not None:
            try:
                bonus = int(character.get("proficiency_bonus") or 0) + mod
            except (TypeError, ValueError):
                bonus = None
    level = _fighter_level(character) if key == "second wind" else _caster_level(character)
    subject = label if label and label.lower() != "the open ground" else ""
    shown_bonus = 0 if bonus is None else bonus
    if card is not None:
        note = _fill(str(card["notes"]), who=who, target=subject or who, bonus=shown_bonus, level=level)
        howto = _fill(str(card["steps"]), who=who, target=subject or who, bonus=shown_bonus, level=level)
    elif buff is not None:
        buff_card = {**buff, "effect_name": name, "when": "always"}
        note = _fill(str(buff["notes"]), who=who, target=subject or who, bonus=shown_bonus, level=level)
        howto = _fill(str(buff["steps"]), who=who, target=subject or who, bonus=shown_bonus, level=level)
        card = buff_card
    elif check == "spell" and spell is not None and str(spell.get("resolution")) == "none":
        landed = subject or who
        howto = (
            f"1) No attack roll.\n"
            f"2) {name} takes effect on {landed}.\n"
            f"3) Hit points do not change on this card.\n"
            f"4) Confirm to leave {name} on {landed}."
        )
        card = {
            "on": "target" if subject else "self",
            "effect_name": name,
            "detail": f"{name} is in effect.",
            "when": "always",
            "extra": None,
        }
    else:
        howto = note
    line = f"{who} {verb} {name}{where}. {note}"
    dc = _spell_dc(character) if check == "save" and formula else None
    if formula and check == "attack":
        note = f"{formula}. A natural 20 doubles the dice and adds the modifier once."
        howto = note
        line = f"{who} {verb} {name}{where}. {note}"
    elif formula and check == "save":
        note = formula
        if rule.get("half"):
            note += ". A successful save deals half."
        if dc is not None:
            note += f" Save DC {dc}."
        howto = note
        line = f"{who} {verb} {name}{where}. {note}"
    elif formula and isinstance(rule, dict) and rule.get("auto"):
        note = formula
        howto = note
        line = f"{who} {verb} {name}{where}. {note}"
    needed = None
    if check == "attack" and bonus is not None and target and target.get("ac"):
        needed = max(1, min(20, int(target["ac"]) - bonus))
    damage = None
    if key == "second wind":
        damage = f"1d10+{level}"
    elif formula and (check in {"attack", "save"} or (isinstance(rule, dict) and rule.get("auto"))):
        damage = formula
    elif check == "attack":
        damage = printed
    effect = _effect_payload(card, who=who, target=subject, bonus=shown_bonus, level=level) if card else None
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
        "ability": ability_name if check in {"skill", "contest"} else None,
        "skill": skill_name if check in {"skill", "contest"} else None,
        "dice": "1d20" if check in {"attack", "save", "skill", "contest"} else "",
        "modifier": bonus if check in {"attack", "skill", "contest"} else None,
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
        "howto": howto,
        "effect": effect,
        "factors": [],
        "possible": True,
    }
    return db.add_event(text.strip(), result)["result"]
