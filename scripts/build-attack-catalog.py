"""Build the map attack workbook and the lookup the map reads.

One row for every spell, every distinct monster attack, every weapon the map
can swing, and every map button. Sheets are the picture-and-sound families.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

ROOT = Path(__file__).resolve().parents[1]
SPELLS = ROOT / "packages" / "rules-dnd5e" / "spells.json"
MONSTERS = ROOT / "packages" / "monsters-srd" / "monsters.json"
XLSX = ROOT / "docs" / "map-attack-catalog.xlsx"
JSON_OUT = ROOT / "apps" / "desktop" / "src" / "map" / "attackPresentation.json"

COLUMNS = ["Action", "Kind", "Shape", "Animation", "Sound effect", "On screen", "To hit", "Damage roll"]
SPELL_DAMAGE = ROOT / "packages" / "rules-dnd5e" / "spell_damage.json"

WEAPON_DICE = {
    "club": ("1d4", None, "bludgeoning"),
    "dagger": ("1d4", None, "piercing"),
    "greatclub": ("1d8", None, "bludgeoning"),
    "handaxe": ("1d6", None, "slashing"),
    "javelin": ("1d6", None, "piercing"),
    "light hammer": ("1d4", None, "bludgeoning"),
    "mace": ("1d6", None, "bludgeoning"),
    "quarterstaff": ("1d6", "1d8", "bludgeoning"),
    "sickle": ("1d4", None, "slashing"),
    "spear": ("1d6", "1d8", "piercing"),
    "light crossbow": ("1d8", None, "piercing"),
    "dart": ("1d4", None, "piercing"),
    "shortbow": ("1d6", None, "piercing"),
    "sling": ("1d4", None, "bludgeoning"),
    "battleaxe": ("1d8", "1d10", "slashing"),
    "flail": ("1d8", None, "bludgeoning"),
    "glaive": ("1d10", None, "slashing"),
    "greataxe": ("1d12", None, "slashing"),
    "greatsword": ("2d6", None, "slashing"),
    "halberd": ("1d10", None, "slashing"),
    "lance": ("1d12", None, "piercing"),
    "longsword": ("1d8", "1d10", "slashing"),
    "maul": ("2d6", None, "bludgeoning"),
    "morningstar": ("1d8", None, "piercing"),
    "pike": ("1d10", None, "piercing"),
    "rapier": ("1d8", None, "piercing"),
    "scimitar": ("1d6", None, "slashing"),
    "shortsword": ("1d6", None, "piercing"),
    "trident": ("1d6", "1d8", "piercing"),
    "war pick": ("1d8", None, "piercing"),
    "warhammer": ("1d8", "1d10", "bludgeoning"),
    "whip": ("1d4", None, "slashing"),
    "blowgun": ("1", None, "piercing"),
    "hand crossbow": ("1d6", None, "piercing"),
    "heavy crossbow": ("1d10", None, "piercing"),
    "longbow": ("1d8", None, "piercing"),
    "net": (None, None, None),
}

WEAPONS = [
    ("club", "bludgeoning", False),
    ("dagger", "piercing", True),
    ("greatclub", "bludgeoning", False),
    ("handaxe", "slashing", True),
    ("javelin", "piercing", True),
    ("light hammer", "bludgeoning", True),
    ("mace", "bludgeoning", False),
    ("quarterstaff", "bludgeoning", False),
    ("sickle", "slashing", False),
    ("spear", "piercing", True),
    ("light crossbow", "piercing", False),
    ("dart", "piercing", True),
    ("shortbow", "piercing", False),
    ("sling", "bludgeoning", False),
    ("battleaxe", "slashing", False),
    ("flail", "bludgeoning", False),
    ("glaive", "slashing", False),
    ("greataxe", "slashing", False),
    ("greatsword", "slashing", False),
    ("halberd", "slashing", False),
    ("lance", "piercing", False),
    ("longsword", "slashing", False),
    ("maul", "bludgeoning", False),
    ("morningstar", "piercing", False),
    ("pike", "piercing", False),
    ("rapier", "piercing", False),
    ("scimitar", "slashing", False),
    ("shortsword", "piercing", False),
    ("trident", "piercing", True),
    ("war pick", "piercing", False),
    ("warhammer", "bludgeoning", False),
    ("whip", "slashing", False),
    ("blowgun", "piercing", False),
    ("hand crossbow", "piercing", False),
    ("heavy crossbow", "piercing", False),
    ("longbow", "piercing", False),
    ("net", "bludgeoning", True),
]

REACH = {"glaive", "halberd", "lance", "pike", "whip"}
BOWS = {"shortbow", "longbow"}
CROSSBOWS = {"light crossbow", "hand crossbow", "heavy crossbow"}
SLING = {"sling"}
BLOWGUN = {"blowgun"}

# Picture, sound file, and how long the picture stays up. Longer than half a second.
MOTIONS: dict[str, dict] = {
    "slash": {"sheet": "Melee", "sound": "slash.mp3", "seconds": 1.2, "line": "A bright slash arc crosses the target."},
    "blunt": {"sheet": "Melee", "sound": "blunt.mp3", "seconds": 1.3, "line": "A heavy stroke lands and a shock ring kicks up dust."},
    "stab": {"sheet": "Melee", "sound": "stab.mp3", "seconds": 1.2, "line": "A thin stab shoots in and pulls back."},
    "reach": {"sheet": "Reach", "sound": "reach.mp3", "seconds": 1.3, "line": "A long slash starts away from the body and cuts through the target."},
    "bow": {"sheet": "Bows", "sound": "bow.mp3", "seconds": 1.3, "line": "An arrow travels the path and sticks."},
    "crossbow": {"sheet": "Bows", "sound": "crossbow.mp3", "seconds": 1.2, "line": "A straight bolt snaps along the path."},
    "sling": {"sheet": "Bows", "sound": "sling.mp3", "seconds": 1.2, "line": "A stone hums along the path and cracks on arrival."},
    "blowgun": {"sheet": "Bows", "sound": "blowgun.mp3", "seconds": 1.2, "line": "A thin dart whispers along the path."},
    "thrown": {"sheet": "Thrown", "sound": "thrown.mp3", "seconds": 1.3, "line": "The weapon tumbles along the path and hits."},
    "net": {"sheet": "Thrown", "sound": "net.mp3", "seconds": 1.4, "line": "A net spreads in the air and drops over the creature."},
    "bite": {"sheet": "Bite and claw", "sound": "bite.mp3", "seconds": 1.2, "line": "Jaws snap shut on the target."},
    "claw": {"sheet": "Bite and claw", "sound": "claw.mp3", "seconds": 1.2, "line": "Claws rake across the target."},
    "tail": {"sheet": "Tail and slam", "sound": "tail.mp3", "seconds": 1.3, "line": "A tail sweeps through the target."},
    "slam": {"sheet": "Tail and slam", "sound": "slam.mp3", "seconds": 1.3, "line": "A heavy body blow slams the target and a ring of dust jumps."},
    "gore": {"sheet": "Gore and horns", "sound": "gore.mp3", "seconds": 1.3, "line": "Horns drive into the target."},
    "sting": {"sheet": "Sting", "sound": "sting.mp3", "seconds": 1.2, "line": "A stinger punches in and flicks back."},
    "tentacle": {"sheet": "Tentacle", "sound": "tentacle.mp3", "seconds": 1.4, "line": "A tentacle lashes out and curls on the target."},
    "constrict": {"sheet": "Tentacle", "sound": "constrict.mp3", "seconds": 1.5, "line": "Coils wrap the creature and squeeze."},
    "web": {"sheet": "Web", "sound": "web.mp3", "seconds": 1.4, "line": "Strands spray out and stick across the target."},
    "swallow": {"sheet": "Swallow", "sound": "swallow.mp3", "seconds": 1.5, "line": "The maw opens and the creature is pulled in."},
    "unarmed": {"sheet": "Unarmed", "sound": "unarmed.mp3", "seconds": 1.2, "line": "A short jab lands."},
    "fire": {"sheet": "Fire", "sound": "fire.mp3", "seconds": 1.8, "line": "A fireball is shot along the path and bursts where it lands."},
    "cold": {"sheet": "Cold", "sound": "cold.mp3", "seconds": 1.7, "line": "A shard of water is shot and shatters into frost."},
    "lightning": {"sheet": "Lightning", "sound": "lightning.mp3", "seconds": 1.4, "line": "A bolt is shot from the attacker and cracks on the target."},
    "thunder": {"sheet": "Thunder", "sound": "thunder.mp3", "seconds": 1.6, "line": "A shock ring is shot along the path and breaks open."},
    "acid": {"sheet": "Acid", "sound": "acid.mp3", "seconds": 1.8, "line": "A yellow-green glob is shot, splashes, and drips."},
    "poison": {"sheet": "Poison", "sound": "poison.mp3", "seconds": 1.7, "line": "A sickly glob is shot and bursts into vapor."},
    "radiant": {"sheet": "Radiant", "sound": "radiant.mp3", "seconds": 1.6, "line": "A gold dart is shot and flares on the target."},
    "necrotic": {"sheet": "Necrotic", "sound": "necrotic.mp3", "seconds": 1.7, "line": "A dark mote is shot, then wisps pull inward."},
    "force": {"sheet": "Force", "sound": "force.mp3", "seconds": 1.3, "line": "A force dart is shot along the path and pops."},
    "psychic": {"sheet": "Psychic", "sound": "psychic.mp3", "seconds": 1.4, "line": "A violet dart is shot and ripples on the creature."},
    "heal": {"sheet": "Healing", "sound": "heal.mp3", "seconds": 1.6, "line": "A gold-green mote is shot and blooms upward."},
    "charm": {"sheet": "Charm and fear", "sound": "charm.mp3", "seconds": 1.4, "line": "A violet thread reaches the creature and tugs."},
    "illusion": {"sheet": "Illusion", "sound": "illusion.mp3", "seconds": 1.5, "line": "A shimmer folds around the target and then thins."},
    "ward": {"sheet": "Warding", "sound": "ward.mp3", "seconds": 1.4, "line": "A pale shell flashes into place and settles."},
    "movement": {"sheet": "Movement", "sound": "movement.mp3", "seconds": 1.3, "line": "The figure streaks and the air closes behind it."},
    "conjure": {"sheet": "Conjuration", "sound": "conjure.mp3", "seconds": 1.6, "line": "A ring opens and the called shape gathers inside it."},
    "light": {"sheet": "Light and darkness", "sound": "light.mp3", "seconds": 1.5, "line": "A pale mote is shot and swells into light, or a pocket of dark."},
    "divination": {"sheet": "Divination", "sound": "divination.mp3", "seconds": 1.4, "line": "A thin eye of light opens and looks where the spell points."},
    "transform": {"sheet": "Transformation", "sound": "transform.mp3", "seconds": 1.6, "line": "The creature's outline bends into the new shape and settles."},
    "other": {"sheet": "Other spells", "sound": "other.mp3", "seconds": 1.4, "line": "A soft arcane mote is shot to the target and fades."},
    "dash": {"sheet": "Field", "sound": "dash.mp3", "seconds": 1.2, "line": "Speed lines burst ahead of the creature."},
    "dodge": {"sheet": "Field", "sound": "dodge.mp3", "seconds": 1.2, "line": "The creature braces and a short guard ring spins."},
    "hide": {"sheet": "Field", "sound": "hide.mp3", "seconds": 1.3, "line": "The figure fades toward the background."},
    "search": {"sheet": "Field", "sound": "search.mp3", "seconds": 1.3, "line": "A thin scan sweeps the nearby squares."},
    "help": {"sheet": "Field", "sound": "help.mp3", "seconds": 1.2, "line": "A gold-green mote passes from one creature to the other."},
    "grapple": {"sheet": "Field", "sound": "grapple.mp3", "seconds": 1.3, "line": "Hands close and hold the other creature."},
    "shove": {"sheet": "Field", "sound": "shove.mp3", "seconds": 1.2, "line": "A hard push shoves the other creature back."},
    "social": {"sheet": "Social", "sound": "social.mp3", "seconds": 1.3, "line": "A spoken ripple reaches the other creature."},
}

ELEMENT = {
    "fire": "fire",
    "cold": "cold",
    "lightning": "lightning",
    "thunder": "thunder",
    "acid": "acid",
    "poison": "poison",
    "radiant": "radiant",
    "necrotic": "necrotic",
    "force": "force",
    "psychic": "psychic",
    "healing": "heal",
}


def fold(name: str) -> str:
    text = re.sub(r"\s*\([^)]*\)", " ", name)
    text = text.replace("’", "'").replace("‘", "'")
    text = re.sub(r"\s+", " ", text).strip().lower()
    aliases = {
        "claws": "claw",
        "bites": "bite",
        "tentacles": "tentacle",
        "talons": "talon",
        "hooves": "hoof",
        "horns": "horn",
        "tusks": "tusk",
    }
    return aliases.get(text, text)


def has(name: str, pattern: str) -> bool:
    return re.search(pattern, name, re.I) is not None


SPELL_OVERRIDE = {
    "flaming sphere": "fire",
    "incendiary cloud": "fire",
    "meteor swarm": "fire",
    "hellish rebuke": "fire",
    "freezing sphere": "cold",
    "fog cloud": "cold",
    "storm of vengeance": "thunder",
    "sunbeam": "radiant",
    "guardian of faith": "radiant",
    "divine favor": "radiant",
    "divine word": "radiant",
    "beacon of hope": "radiant",
    "hallow": "radiant",
    "heroes' feast": "heal",
    "arcane sword": "force",
    "forcecage": "force",
    "blade barrier": "force",
    "confusion": "psychic",
    "eyebite": "psychic",
    "weird": "psychic",
    "modify memory": "psychic",
    "sleep": "charm",
    "irresistible dance": "charm",
    "antipathy/sympathy": "charm",
    "glibness": "charm",
    "power word stun": "psychic",
    "power word kill": "necrotic",
    "antilife shell": "necrotic",
    "ray of enfeeblement": "necrotic",
    "gentle repose": "necrotic",
    "mirage arcane": "illusion",
    "project image": "illusion",
    "magic mouth": "illusion",
    "illusory script": "illusion",
    "phantom steed": "illusion",
    "simulacrum": "illusion",
    "arcane lock": "ward",
    "death ward": "ward",
    "guards and wards": "ward",
    "magic circle": "ward",
    "mind blank": "ward",
    "private sanctum": "ward",
    "sequester": "ward",
    "symbol": "ward",
    "tiny hut": "ward",
    "imprisonment": "ward",
    "silence": "ward",
    "blink": "movement",
    "gate": "movement",
    "passwall": "movement",
    "rope trick": "movement",
    "water walk": "movement",
    "wind wall": "movement",
    "gust of wind": "movement",
    "reverse gravity": "movement",
    "spider climb": "movement",
    "word of recall": "movement",
    "astral projection": "movement",
    "demiplane": "movement",
    "maze": "movement",
    "black tentacles": "tentacle",
    "giant insect": "conjure",
    "insect plague": "conjure",
    "planar ally": "conjure",
    "planar binding": "conjure",
    "magnificent mansion": "conjure",
    "secret chest": "conjure",
    "creation": "conjure",
    "clone": "conjure",
    "foresight": "divination",
    "true strike": "divination",
    "guidance": "divination",
    "telepathic bond": "divination",
    "sending": "divination",
    "message": "divination",
    "hunter's mark": "divination",
    "awaken": "transform",
    "enhance ability": "transform",
    "haste": "transform",
    "slow": "transform",
    "shillelagh": "transform",
    "stone shape": "transform",
    "move earth": "transform",
    "plant growth": "transform",
    "control water": "transform",
    "control weather": "transform",
    "earthquake": "transform",
    "meld into stone": "transform",
    "water breathing": "transform",
    "purify food and drink": "transform",
    "blindness/deafness": "psychic",
    "spike growth": "conjure",
    "contingency": "ward",
    "magic jar": "necrotic",
    "magic weapon": "transform",
    "arcanist's magic aura": "illusion",
    "dream": "psychic",
}


def spell_motion(name: str, resolution: str) -> str:
    n = name.lower()
    if n in SPELL_OVERRIDE:
        return SPELL_OVERRIDE[n]
    if resolution == "heal" or has(n, r"\b(cure|heal|healing|goodberry|regenerate|heroism|spare the dying)\b"):
        return "heal"
    if has(n, r"fire|flame|burn|scorch|steam|immolat|heat metal|produce flame"):
        return "fire"
    if has(n, r"\b(ice|cold|frost|sleet|snow)\b"):
        return "cold"
    if has(n, r"lightning|shock"):
        return "lightning"
    if has(n, r"thunder|shatter"):
        return "thunder"
    if "acid" in n:
        return "acid"
    if has(n, r"poison|cloudkill|stinking cloud|contagion"):
        return "poison"
    if has(n, r"radiant|sacred|holy|guiding bolt|sunburst|moonbeam|spirit guardians|branding smite|searing smite|crusader|dawn\b|bless\b"):
        return "radiant"
    if has(n, r"necrotic|inflict|vampiric|blight|circle of death|chill touch|finger of death|false life|bestow curse|\bharm\b"):
        return "necrotic"
    if has(n, r"psychic|dissonant|vicious mockery|phantasmal|feeblemind|synaptic|mind spike|mind whip|hideous laughter|hex\b"):
        return "psychic"
    if has(n, r"magic missile|eldritch|disintegrate|\bforce\b|bigby|arcane hand|telekinesis|resilient sphere"):
        return "force"
    if has(n, r"charm|command\b|suggestion|dominate|hold person|hold monster|enthrall|\bgeas\b|compulsion|animal friendship|\bfriends\b|calm emotions|zone of truth|\bfear\b|cause fear|bane\b"):
        return "charm"
    if has(n, r"illusion|invisibility|mirror image|disguise|silent image|major image|minor illusion|\bblur\b|hypnotic|mislead|seeming|hallucinatory|color spray"):
        return "illusion"
    if has(n, r"\bshield\b|mage armor|protection|sanctuary|counterspell|dispel|antimagic|globe of invulnerability|warding|\balarm\b|glyph of warding|forbiddance|nondetection|barkskin|stoneskin|absorb elements|shield of faith|\bresistance\b|\baid\b|banishment|circle of power"):
        return "ward"
    if has(n, r"teleport|misty step|dimension door|\bfly\b|levitate|\bjump\b|expeditious|longstrider|freedom of movement|plane shift|ethereal|wind walk|transport|tree stride|arcane gate|pass without trace|feather fall|\bknock\b"):
        return "movement"
    if n == "web" or n.startswith("web "):
        return "web"
    if has(n, r"restoration|revivify|raise dead|resurrection|remove curse|reincarnate"):
        return "heal"
    if has(n, r"detect |identify|scrying|locate |augury|commune|true seeing|see invisibility|clairvoyance|arcane eye|find traps|find the path|legend lore|contact other|divination|comprehend languages|speak with|tongues\b|identify"):
        return "divination"
    if has(n, r"polymorph|alter self|enlarge|reduce|shapechange|gaseous|animal shapes|alter |reincarnate|flesh to stone|stone to flesh|wind walk"):
        return "transform"
    if has(n, r"conjure|summon|familiar|animate|spiritual weapon|\bcreate\b|fabricate|find steed|unseen servant|floating disk|tiny servant|faithful hound|mage hand|wall of stone|wall of ice|wall of thorns|entangle|grease"):
        return "conjure"
    if has(n, r"darkness|daylight|dancing lights|continual flame|faerie fire|darkvision|(^|\s)light(\s|$)"):
        return "light"
    return "other"


def shape_word(shape: str, aim: str, motion: str) -> str:
    if motion in {"bow"}:
        return "arrow"
    if motion == "crossbow":
        return "bolt"
    if motion in {"sling"}:
        return "stone"
    if motion == "blowgun":
        return "dart"
    if motion == "net":
        return "spread"
    if motion in {"slash", "reach", "claw", "tail"}:
        return "slash"
    if motion in {"stab", "sting", "bite", "gore"}:
        return "stab"
    if motion in {"blunt", "slam", "unarmed"}:
        return "jab"
    if motion == "thrown":
        return "thrown"
    if aim == "self" or shape == "heal":
        return "self"
    if shape == "cone":
        return "cone"
    if shape == "line":
        return "line"
    if shape == "cube":
        return "cube"
    if shape == "burst":
        return "ball"
    return "ray"


def attack_motion(name: str, damage: str, thrown: bool = False) -> str:
    n = fold(name)
    dt = (damage or "").lower()
    if has(n, r"breath|spray|hurl flame|steam"):
        if "steam" in n:
            return "fire"
        return ELEMENT.get(dt, "fire")
    if dt in ELEMENT and has(n, r"breath|spray|hurl"):
        return ELEMENT[dt]
    if "web" in n:
        return "web"
    if "swallow" in n:
        return "swallow"
    if has(n, r"life drain|rotting"):
        return "necrotic"
    if dt == "psychic":
        return "psychic"
    if dt in {"fire", "cold", "lightning", "thunder", "acid", "poison", "radiant", "necrotic", "force"} and has(
        n, r"breath|spray|hurl|spit|beam|ray|touch"
    ):
        return ELEMENT[dt]
    if n in BOWS or (has(n, r"\bbow\b") and "crossbow" not in n):
        return "bow"
    if n in CROSSBOWS or "crossbow" in n:
        return "crossbow"
    if n in SLING or n == "rock":
        return "sling"
    if n in BLOWGUN:
        return "blowgun"
    if n == "net" or (thrown and n == "net"):
        return "net"
    if thrown or n in {"dagger", "handaxe", "javelin", "light hammer", "spear", "dart", "trident"} and thrown:
        return "thrown"
    if n in REACH:
        return "reach"
    if has(n, r"\b(bite|beak)\b"):
        return "bite"
    if has(n, r"claw|talon|rake|pincer"):
        return "claw"
    if has(n, r"tail"):
        return "tail"
    if has(n, r"slam|hoof|stomp|ram|constrict"):
        return "slam" if not has(n, r"constrict") else "constrict"
    if has(n, r"gore|horn|tusk"):
        return "gore"
    if "sting" in n:
        return "sting"
    if has(n, r"tentacle|pseudopod"):
        return "tentacle"
    if has(n, r"fist|unarmed|punch"):
        return "unarmed"
    if dt == "fire":
        return "fire"
    if dt == "cold":
        return "cold"
    if dt == "lightning":
        return "lightning"
    if dt == "acid":
        return "acid"
    if dt == "poison":
        return "poison"
    if dt == "necrotic":
        return "necrotic"
    if dt == "piercing":
        return "stab"
    if dt == "bludgeoning":
        return "blunt"
    return "slash"


def animation_line(motion: str, shape: str) -> str:
    base = MOTIONS[motion]["line"]
    extra = {
        "cone": " It fills the cone.",
        "line": " It runs the line.",
        "ball": " It fills the burst.",
        "cube": " It fills the cube.",
        "ray": " It travels to one creature.",
        "self": " It stays on the creature who used it.",
        "arrow": "",
        "bolt": "",
        "stone": "",
        "dart": "",
        "slash": "",
        "stab": "",
        "jab": "",
        "thrown": "",
        "spread": "",
    }.get(shape, "")
    text = base + extra
    return text


def _crit_note(formula: str) -> str:
    if re.search(r"\d+\s*d\s*\d+", formula, re.I):
        return f"{formula}. A natural 20 doubles the dice and adds the modifier once."
    return formula


def weapon_damage_roll(name: str) -> str:
    die, two_hand, kind = WEAPON_DICE.get(name, (None, None, None))
    if not die:
        return "none"
    if die == "1":
        return f"1 + ability modifier {kind}. A natural 20 has no die to double."
    if two_hand:
        return _crit_note(f"{die} {kind}, or {two_hand} {kind} in two hands, plus the ability modifier once")
    return _crit_note(f"{die} + ability modifier {kind}")


def spell_rolls(spell: dict, rules: dict) -> tuple[str, str]:
    resolution = str(spell.get("resolution") or "none")
    if resolution == "attack":
        to_hit = "1d20 + attack bonus"
    elif resolution == "save":
        to_hit = "1d20 + save modifier"
    else:
        to_hit = "none"
    rule = rules.get(str(spell.get("name") or "").lower())
    if not isinstance(rule, dict) or not rule.get("damage"):
        return to_hit, "none"
    dice = str(rule["damage"])
    kind = str(rule.get("type") or "").strip()
    if rule.get("ability"):
        dice = f"{dice} + spellcasting ability modifier"
    if rule.get("scale"):
        dice = f"{dice}, more dice at levels 5, 11, and 17"
    formula = f"{dice} {kind}".strip()
    if rule.get("half"):
        formula += ". A successful save deals half"
    if resolution == "attack" and re.search(r"\d+\s*d\s*\d+", str(rule["damage"])):
        formula += ". A natural 20 doubles the dice and adds the modifier once"
    return to_hit, formula


def attack_rolls(attack: dict, breath: bool) -> tuple[str, str]:
    try:
        bonus = int(attack.get("attack_bonus") or 0)
    except (TypeError, ValueError):
        bonus = 0
    if breath and bonus == 0:
        to_hit = "1d20 + save modifier"
    elif bonus or attack.get("attack_bonus") == 0:
        to_hit = f"1d20 + {bonus}" if bonus else "1d20 + attack bonus"
    else:
        to_hit = "none"
    dice = str(attack.get("damage") or "").strip()
    kind = str(attack.get("damage_type") or "").strip()
    if not dice:
        return to_hit, "none"
    formula = f"{dice} {kind}".strip()
    if breath and bonus == 0:
        return to_hit, formula
    return to_hit, _crit_note(formula)


def add_row(
    rows: list[dict],
    seen: set[str],
    *,
    action: str,
    kind: str,
    key: str,
    motion: str,
    shape: str,
    to_hit: str = "none",
    damage_roll: str = "none",
) -> None:
    if key in seen:
        return
    seen.add(key)
    info = MOTIONS[motion]
    rows.append(
        {
            "key": key,
            "action": action,
            "kind": kind,
            "shape": shape,
            "sheet": info["sheet"],
            "motion": motion,
            "animation": animation_line(motion, shape),
            "sound": info["sound"],
            "seconds": info["seconds"],
            "to_hit": to_hit,
            "damage_roll": damage_roll,
        }
    )


def collect() -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    spells = json.loads(SPELLS.read_text(encoding="utf-8"))
    spell_rules = json.loads(SPELL_DAMAGE.read_text(encoding="utf-8")) if SPELL_DAMAGE.is_file() else {}
    for spell in spells:
        motion = spell_motion(spell["name"], spell["resolution"])
        # "light" as a whole word was easy to miss. Catch the cantrip after the fallthrough.
        if motion == "other" and re.search(r"(^|\b)light(\b|$)", spell["name"], re.I):
            motion = "light"
        shape = shape_word(spell["shape"], spell["aim"], motion)
        to_hit, damage_roll = spell_rolls(spell, spell_rules)
        add_row(
            rows,
            seen,
            action=spell["name"],
            kind="spell",
            key=fold(spell["name"]),
            motion=motion,
            shape=shape,
            to_hit=to_hit,
            damage_roll=damage_roll,
        )
    data = json.loads(MONSTERS.read_text(encoding="utf-8"))
    for monster in data["monsters"]:
        for attack in monster.get("attacks") or []:
            if not isinstance(attack, dict):
                continue
            name = str(attack.get("name") or "").strip()
            if not name:
                continue
            damage = str(attack.get("damage_type") or "")
            folded = fold(name)
            breath = has(folded, r"breath|spray|hurl flame|steam")
            label = name
            key = folded
            weapon_names = {w[0] for w in WEAPONS}
            if not breath and (folded in weapon_names or folded == "unarmed strike"):
                printed = re.sub(r"\s+", "", str(attack.get("damage") or "printed")).lower()
                key = f"{folded}|{printed}"
            if breath:
                label = f"{re.sub(r'\\s*\\([^)]*\\)', '', name).strip()} ({damage or 'fire'})"
                key = f"{folded}|{(damage or 'fire').lower()}"
            motion = attack_motion(name, damage, False)
            kind = "breath" if breath else "weapon" if folded in {w[0] for w in WEAPONS} else "attack"
            shape = shape_word("burst" if breath else "ray", "point", motion)
            if breath:
                shape = "ball"
            to_hit, damage_roll = attack_rolls(attack, breath)
            add_row(
                rows,
                seen,
                action=label,
                kind=kind,
                key=key,
                motion=motion,
                shape=shape,
                to_hit=to_hit,
                damage_roll=damage_roll,
            )
    for name, damage, thrown in WEAPONS:
        if thrown and name not in {"net"}:
            add_row(
                rows,
                seen,
                action=f"{name.title()} (thrown)" if name != "light hammer" else "Light hammer (thrown)",
                kind="weapon",
                key=f"{name}|thrown",
                motion="net" if name == "net" else "thrown",
                shape="spread" if name == "net" else "thrown",
                to_hit="1d20 + attack bonus",
                damage_roll=weapon_damage_roll(name),
            )
        if name == "net":
            add_row(
                rows,
                seen,
                action="Net",
                kind="weapon",
                key="net",
                motion="net",
                shape="spread",
                to_hit="1d20 + attack bonus",
                damage_roll="none",
            )
            continue
        if thrown and name == "dart":
            add_row(
                rows,
                seen,
                action="Dart",
                kind="weapon",
                key="dart",
                motion="thrown",
                shape="thrown",
                to_hit="1d20 + attack bonus",
                damage_roll=weapon_damage_roll(name),
            )
            continue
        motion = attack_motion(name, damage, False)
        add_row(
            rows,
            seen,
            action=name.title() if name != "light hammer" else "Light hammer",
            kind="weapon",
            key=name,
            motion=motion,
            shape=shape_word("ray", "point", motion),
            to_hit="1d20 + attack bonus",
            damage_roll=weapon_damage_roll(name),
        )
    features = [
        ("Second Wind", "feature", "heal", "self"),
        ("Dash", "feature", "dash", "self"),
        ("Disengage", "feature", "movement", "self"),
        ("Dodge", "feature", "dodge", "self"),
        ("Hide", "feature", "hide", "self"),
        ("Search", "feature", "search", "self"),
        ("Help", "feature", "help", "ray"),
        ("Grapple", "feature", "grapple", "jab"),
        ("Shove", "feature", "shove", "jab"),
        ("Persuade", "feature", "social", "ray"),
        ("Intimidate", "feature", "social", "ray"),
        ("Deceive", "feature", "social", "ray"),
    ]
    for name, kind, motion, shape in features:
        if name in {"Grapple", "Shove"}:
            to_hit, damage_roll = "1d20 + attack bonus", "none"
        elif name in {"Persuade", "Intimidate", "Deceive"}:
            to_hit, damage_roll = "1d20 + ability modifier", "none"
        else:
            to_hit, damage_roll = "none", "none"
        add_row(
            rows,
            seen,
            action=name,
            kind=kind,
            key=fold(name),
            motion=motion,
            shape=shape,
            to_hit=to_hit,
            damage_roll=damage_roll,
        )
    add_row(
        rows,
        seen,
        action="Unarmed strike",
        kind="weapon",
        key="unarmed strike",
        motion="blunt",
        shape="jab",
        to_hit="1d20 + attack bonus",
        damage_roll="1 + Strength modifier bludgeoning. A natural 20 has no die to double.",
    )
    return rows


def write_json(rows: list[dict]) -> None:
    by_key = {
        row["key"]: {
            "motion": row["motion"],
            "sound": row["sound"],
            "seconds": row["seconds"],
            "sheet": row["sheet"],
            "animation": row["animation"],
        }
        for row in rows
    }
    motions = {
        key: {"sound": value["sound"], "seconds": value["seconds"], "sheet": value["sheet"], "animation": value["line"]}
        for key, value in MOTIONS.items()
    }
    JSON_OUT.write_text(json.dumps({"byKey": by_key, "motions": motions}, indent=2), encoding="utf-8")


def write_xlsx(rows: list[dict]) -> None:
    book = Workbook()
    index = book.active
    index.title = "Index"
    header_fill = PatternFill("solid", fgColor="1C1408")
    header_font = Font(name="Calibri", bold=True, color="F6EFE2")
    body = Font(name="Calibri", size=11)
    title = Font(name="Calibri", bold=True, size=16, color="1C1408")
    index["A1"] = "Tablewhisper map attacks"
    index["A1"].font = title
    index["A2"] = "Every spell, monster attack, weapon, breath, and map button. One sheet per picture and sound. Shared pictures are still listed on every row."
    index["A3"] = "The picture stays up longer than half a second, for the whole sound. Sounds are Sonniss GDC game-audio one-shots. Epidemic Sound and the Community recording are not used."
    index["A4"] = "Code reads apps/desktop/src/map/attackPresentation.json, which this workbook is built from."
    index.merge_cells("A2:F2")
    index.merge_cells("A3:F3")
    index.merge_cells("A4:F4")
    index.append([])
    index.append(["Sheet", "Rows", "Sound", "On screen", "Picture"])
    for cell in index[6]:
        cell.fill = header_fill
        cell.font = header_font
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        grouped[row["sheet"]].append(row)
    order = []
    for motion in MOTIONS.values():
        if motion["sheet"] not in order:
            order.append(motion["sheet"])
    for sheet in order:
        items = grouped.get(sheet, [])
        sample = items[0] if items else None
        motion = next(item for item in MOTIONS.values() if item["sheet"] == sheet)
        index.append([sheet, len(items), motion["sound"], motion["seconds"], motion["line"]])
    for row in index.iter_rows(min_row=7, max_col=5):
        for cell in row:
            cell.font = body
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    index.auto_filter.ref = f"A6:E{6 + len(order)}"
    index.freeze_panes = "A7"
    index.column_dimensions["A"].width = 28
    index.column_dimensions["B"].width = 10
    index.column_dimensions["C"].width = 18
    index.column_dimensions["D"].width = 14
    index.column_dimensions["E"].width = 78
    index.row_dimensions[2].height = 32
    index.row_dimensions[3].height = 32

    used_titles = {"Index"}
    for sheet_name in order:
        title_name = sheet_name[:31]
        if title_name in used_titles:
            title_name = title_name[:28] + " 2"
        used_titles.add(title_name)
        sheet = book.create_sheet(title_name)
        sheet.append(COLUMNS)
        for cell in sheet[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(vertical="center")
        items = sorted(grouped.get(sheet_name, []), key=lambda item: (item["kind"], item["action"].lower()))
        for item in items:
            sheet.append(
                [
                    item["action"],
                    item["kind"],
                    item["shape"],
                    item["animation"],
                    item["sound"],
                    item["seconds"],
                    item.get("to_hit") or "none",
                    item.get("damage_roll") or "none",
                ]
            )
        for row in sheet.iter_rows(min_row=2, max_col=8):
            for cell in row:
                cell.font = body
                cell.alignment = Alignment(wrap_text=True, vertical="top")
        last = max(2, sheet.max_row)
        sheet.freeze_panes = "A2"
        widths = [36, 12, 12, 78, 18, 12, 28, 64]
        for index_col, width in enumerate(widths, start=1):
            sheet.column_dimensions[get_column_letter(index_col)].width = width
        sheet.row_dimensions[1].height = 22
        if last >= 2:
            table = Table(displayName="T" + re.sub(r"[^A-Za-z0-9]", "", title_name), ref=f"A1:H{last}")
            table.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
            sheet.add_table(table)
    XLSX.parent.mkdir(parents=True, exist_ok=True)
    book.save(XLSX)


def main() -> None:
    rows = collect()
    write_json(rows)
    write_xlsx(rows)
    counts: dict[str, int] = defaultdict(int)
    for row in rows:
        counts[row["sheet"]] += 1
    print(f"{len(rows)} rows, {len(counts)} sheets")
    for sheet, count in counts.items():
        print(f"  {count:4} {sheet}")


if __name__ == "__main__":
    main()
