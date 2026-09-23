"""Roll factors that the sentence, sheet, or stat block already state.

Advantage and disadvantage cancel. A missing save DC or Perception score is
reported missing. Nothing here invents a number the context did not give.
"""

from __future__ import annotations

import re
from typing import Any

_STEALTH_ARMOR_RE = re.compile(
    r"\b(padded|scale mail|half[- ]plate|ring mail|chain mail|splint|plate)\b",
    re.I,
)
_MEDIUM_RE = re.compile(
    r"\b(hide|chain shirt|scale mail|breastplate|half[- ]plate)\b",
    re.I,
)
_LIGHT_RE = re.compile(r"\b(padded|studded leather|leather)\b", re.I)
_HEAVY_RE = re.compile(r"\b(ring mail|chain mail|splint|plate)\b", re.I)
_RANGED_RE = re.compile(
    r"\b(longbow|shortbow|crossbow|bow|sling|blowgun|firearm|pistol|rifle|"
    r"musket|gun|dart|javelin|thrown|shoots?|shooting|ranged)\b",
    re.I,
)
_SPELL_RE = re.compile(r"\b(casts?|casting|spell)\b", re.I)
_OUTLINED_RE = re.compile(r"\b(faerie fire|fairy fire|outlined)\b", re.I)
_DARK_RE = re.compile(r"\b(darkness|pitch black|no light)\b", re.I)
_DIM_RE = re.compile(r"\b(dim light|dimly lit)\b", re.I)
_STORM_RE = re.compile(
    r"\b(high winds?|strong winds?|winds?|storm|downpour|torrential|heavy rain)\b",
    re.I,
)
_LISTEN_RE = re.compile(r"\b(listen(?:ing)?|hears?|hearing)\b", re.I)
_TOTAL_COVER_RE = re.compile(r"\b(total cover|full cover)\b", re.I)
_THREE_COVER_RE = re.compile(r"\b(three[- ]quarters cover|3/4 cover)\b", re.I)
_HALF_COVER_RE = re.compile(r"\bhalf cover\b", re.I)
_EXHAUST_RE = re.compile(
    r"\bexhaustion(?: level)? (\d)\b|\b(\d)(?:st|nd|rd|th)? level of exhaustion\b|\blevel (\d) exhaustion\b",
    re.I,
)
_DC_RE = re.compile(r"\bDC\s+(\d+)\b", re.I)
_PASSIVE_RE = re.compile(r"\bpassive perception\s+(\d+)\b", re.I)


def _worn_armor(gear: dict[str, Any] | None) -> list[str]:
    if not gear:
        return []
    names = []
    for item in gear.get("items") or []:
        if item.get("effect") == "armor" and item.get("state") in {"equipped", "attuned"}:
            names.append(str(item.get("name") or ""))
    return [name for name in names if name]


def _armor_category(name: str) -> str | None:
    if _MEDIUM_RE.search(name):
        return "medium"
    if _LIGHT_RE.search(name):
        return "light"
    if _HEAVY_RE.search(name):
        return "heavy"
    return None


def _proficient(proficiencies: str, armor_name: str) -> bool:
    low = proficiencies.lower()
    category = _armor_category(armor_name)
    if "heavily armored" in low and category in {"light", "medium", "heavy"}:
        return True
    if "moderately armored" in low and category in {"light", "medium"}:
        return True
    if "lightly armored" in low and category == "light":
        return True
    if "all armor" in low:
        return True
    if armor_name.lower() in low:
        return True
    category = _armor_category(armor_name)
    if category and f"{category} armor" in low:
        return True
    tokens = [token for token in re.split(r"[^a-z]+", armor_name.lower()) if len(token) > 3]
    return bool(tokens) and all(token in low for token in tokens)


def _is_ranged(text: str, weapon: dict[str, Any] | None) -> bool:
    blob = " ".join(
        [
            text or "",
            str((weapon or {}).get("name") or ""),
            str((weapon or {}).get("notes") or ""),
            str((weapon or {}).get("damage") or ""),
        ]
    )
    return bool(_RANGED_RE.search(blob))


def _about_pc(text: str, match: re.Match[str], pc_name: str, other_name: str) -> bool:
    """The condition applies to the character when their name is the closer one."""

    def distance(name: str) -> int | None:
        parts = (name or "").split()
        if not parts:
            return None
        token = parts[0]
        if len(token) < 3:
            return None
        hits = [found.start() for found in re.finditer(rf"\b{re.escape(token)}\b", text, re.I)]
        if not hits:
            return None
        return min(abs(hit - match.start()) for hit in hits)

    pc_distance = distance(pc_name)
    other_distance = distance(other_name)
    if other_distance is not None and (pc_distance is None or other_distance < pc_distance):
        return False
    return True


def _find(pattern: str, text: str) -> re.Match[str] | None:
    return re.search(pattern, text, re.I)


def assess(
    *,
    text: str,
    character: dict[str, Any] | None,
    gear: dict[str, Any] | None,
    check_type: str,
    ability: str | None,
    skill: str | None,
    weapon: dict[str, Any] | None,
    incoming: bool,
    target: dict[str, Any] | None,
) -> dict[str, Any]:
    """Factors for this one check. Stored gear is not changed."""
    raw = text or ""
    features = str((character or {}).get("features") or "")
    proficiencies = str((character or {}).get("proficiencies") or "").strip()
    pc_name = str((character or {}).get("name") or "")
    other_name = str((target or {}).get("label") or (target or {}).get("name") or "")
    ranged = _is_ranged(raw, weapon)
    has_darkvision = bool(re.search(r"\bdarkvision\b", features, re.I))
    outlined = bool(_OUTLINED_RE.search(raw))
    pc_attacking = check_type == "attack" and not incoming
    pc_defending = check_type == "attack" and incoming
    uses_str_dex = ability in {"strength", "dexterity"} or check_type == "attack"

    advantages: list[str] = []
    disadvantages: list[str] = []
    lines: list[str] = []
    blocked: list[str] = []
    ac_bonus = 0
    dex_save_bonus = 0
    extra_dice: str | None = None
    crit_note: str | None = None
    stated_dc: int | None = None
    dc_missing: str | None = None

    def adv(reason: str) -> None:
        advantages.append(reason)
        lines.append(reason)

    def disadv(reason: str) -> None:
        disadvantages.append(reason)
        lines.append(reason)

    def note(reason: str) -> None:
        lines.append(reason)

    unseen = bool(gear and gear.get("unseen")) and not outlined
    if outlined and gear and (gear.get("invisibility_worn") or gear.get("unseen")):
        note("Faerie Fire cancels invisibility.")
    if gear and gear.get("elvenkind_worn") and skill == "stealth":
        adv("Cloak of elvenkind is worn, so this Stealth check has advantage.")
    if (
        gear
        and (gear.get("elvenkind_worn") or gear.get("invisibility_worn"))
        and skill == "perception"
        and not outlined
    ):
        see = _find(r"\b(sees?|seeing|spots?|spotting|notices?|looks? for|searches? for)\b", raw)
        pc_first = (pc_name.split()[0] if pc_name else "").lower()
        looker = bool(see and pc_first and pc_first in raw[: see.start()].lower())
        if see and not looker:
            disadv("Perception to see them has disadvantage while that cloak is worn.")

    for name in _worn_armor(gear):
        if skill == "stealth" and _STEALTH_ARMOR_RE.search(name):
            if _armor_category(name) == "medium" and re.search(r"medium armor master", features, re.I):
                note(f"Medium Armor Master: {name} does not impose Stealth disadvantage.")
            else:
                disadv(f"{name} is equipped, so this Stealth check has disadvantage.")
        if proficiencies and not _proficient(f"{proficiencies}\n{features}", name):
            if uses_str_dex and check_type in {"attack", "save", "skill", "ability"}:
                disadv(f"Not proficient in {name}: disadvantage on this Strength or Dexterity roll.")
            if _SPELL_RE.search(raw):
                blocked.append(f"Not proficient in {name}, so they cannot cast a spell.")

    if re.search(r"improved critical|critical hits? on a (?:roll of )?19|\b19[-–]20\b", features, re.I):
        if check_type == "attack":
            crit_note = "Improved Critical: 19 or 20 is a critical hit."
            note(crit_note)

    def on_pc(match: re.Match[str] | None) -> bool:
        if match is None:
            return False
        return _about_pc(raw, match, pc_name, other_name)

    def attacker_side(match: re.Match[str] | None) -> bool:
        """True when the condition is on the creature making the attack."""
        if match is None or check_type != "attack":
            return False
        about = on_pc(match)
        if pc_attacking:
            return about
        if pc_defending:
            return not about
        return False

    def defender_side(match: re.Match[str] | None) -> bool:
        if match is None or check_type != "attack":
            return False
        about = on_pc(match)
        if pc_attacking:
            return not about
        if pc_defending:
            return about
        return False

    blind = _find(r"\b(blinded|blind)\b", raw)
    deaf = _find(r"\b(deafened|deaf)\b", raw)
    prone = _find(r"\bprone\b", raw)
    restrained = _find(r"\brestrained\b", raw)
    paralyzed = _find(r"\bparaly[sz]ed\b", raw)
    stunned = _find(r"\bstunned\b", raw)
    unconscious = _find(r"\bunconscious\b", raw)
    dodge = _find(r"\b(dodges?|dodging)\b", raw)

    darkness = _DARK_RE.search(raw)
    dim = _DIM_RE.search(raw)
    if darkness and not has_darkvision:
        note("Darkness, and darkvision is not on the sheet, so they are blinded.")
        blind = darkness
    elif darkness and has_darkvision:
        note("Darkvision treats this darkness as dim light.")
        dim = darkness
    if dim and skill == "perception" and not _LISTEN_RE.search(raw):
        if not has_darkvision:
            disadv("Dim light: disadvantage on this Perception check.")
        elif darkness and has_darkvision:
            disadv("Darkvision in darkness: disadvantage on this Perception check.")

    if blind and attacker_side(blind):
        disadv("Blinded: disadvantage on the attack.")
    if blind and defender_side(blind):
        adv("The target is blinded: advantage on the attack.")
    if blind and skill == "perception" and not _LISTEN_RE.search(raw) and on_pc(blind):
        disadv("Blinded: disadvantage on this Perception check.")

    storm = _STORM_RE.search(raw)
    if deaf and skill == "perception" and _LISTEN_RE.search(raw) and on_pc(deaf):
        disadv("Deafened: disadvantage on this listening check.")
    if storm and skill == "perception" and _LISTEN_RE.search(raw):
        disadv("The weather imposes disadvantage on this listening check.")
    if storm and check_type == "attack" and ranged:
        disadv("The weather imposes disadvantage on this ranged attack.")
    if check_type == "attack" and _find(r"\blong range\b", raw):
        disadv("Long range: disadvantage on the attack.")

    if prone and attacker_side(prone) and check_type == "attack" and not ranged:
        disadv("Prone: disadvantage on this melee attack.")
    if prone and defender_side(prone) and check_type == "attack" and not ranged:
        adv("The target is prone: advantage on this melee attack.")
    if prone and defender_side(prone) and check_type == "attack" and ranged:
        disadv("The target is prone: disadvantage on this ranged attack.")

    if restrained and on_pc(restrained) and check_type == "save" and ability == "dexterity":
        disadv("Restrained: disadvantage on this Dexterity save.")
    if restrained and defender_side(restrained):
        adv("The target is restrained: advantage on the attack.")

    for match, label in (
        (paralyzed, "paralyzed"),
        (stunned, "stunned"),
        (unconscious, "unconscious"),
    ):
        if match and attacker_side(match):
            blocked.append(f"They are {label} and cannot attack.")
        if match and defender_side(match):
            adv(f"The target is {label}: advantage on the attack.")
    if (paralyzed or unconscious) and check_type == "attack" and not ranged:
        hit = paralyzed or unconscious
        if hit and defender_side(hit):
            melee_crit = "A melee hit on a paralyzed or unconscious creature is a critical hit."
            crit_note = f"{crit_note} {melee_crit}" if crit_note else melee_crit
            note(melee_crit)

    if dodge and defender_side(dodge):
        disadv("Dodging: disadvantage on attacks against them.")

    if unseen and pc_attacking:
        adv("Unseen: advantage on the attack.")
    if unseen and pc_defending:
        disadv("Unseen: disadvantage on the attack.")

    if _TOTAL_COVER_RE.search(raw) and (check_type == "attack" or _SPELL_RE.search(raw)):
        blocked.append("Total cover: they cannot be targeted by this attack or spell.")
    elif _THREE_COVER_RE.search(raw):
        ac_bonus = 5
        dex_save_bonus = 5
        note("Three-quarters cover: +5 to AC and Dexterity saves.")
    elif _HALF_COVER_RE.search(raw):
        ac_bonus = 2
        dex_save_bonus = 2
        note("Half cover: +2 to AC and Dexterity saves.")

    exhaust = _EXHAUST_RE.search(raw)
    if exhaust:
        level = next(int(group) for group in exhaust.groups() if group)
        if level >= 1 and check_type in {"skill", "ability"}:
            disadv(f"Exhaustion {level}: disadvantage on this ability check.")
        if level >= 3 and check_type in {"attack", "save"}:
            disadv(f"Exhaustion {level}: disadvantage on this attack or save.")

    if _find(r"\bbless(?:ed)?\b", raw) and check_type in {"attack", "save"}:
        extra_dice = "+1d4"
        note("Bless: add 1d4 to the roll.")
    if _find(r"\bbane[d]?\b", raw) and check_type in {"attack", "save"}:
        extra_dice = "-1d4" if extra_dice is None else "+1d4 -1d4"
        note("Bane: subtract 1d4 from the roll.")
    if _find(r"\benlarge[d]?\b", raw) and (ability == "strength" or skill == "athletics"):
        adv("Enlarged: advantage on this Strength check.")
        note("Enlarge steps the weapon damage die up.")
    if _find(r"\breduc(?:e|ed)\b", raw) and (ability == "strength" or skill == "athletics"):
        disadv("Reduced: disadvantage on this Strength check.")
        note("Reduce steps the weapon damage die down.")
    if _find(r"\bhaste[d]?\b", raw):
        note("Haste is named. It does not change the attack bonus.")
    if _find(r"\bslow(?:ed)?\b", raw):
        note("Slow is named. It does not change the attack bonus.")
    if _find(r"\bsilvery barbs\b", raw):
        note("Silvery Barbs: reroll the d20 and keep the lower result.")

    if skill == "stealth" and target:
        passive = target.get("passive_perception")
        template = target.get("template") or {}
        if passive is None:
            passive = template.get("passive_perception")
        sentence_passive = _PASSIVE_RE.search(raw)
        sentence_dc = _DC_RE.search(raw)
        if sentence_passive:
            stated_dc = int(sentence_passive.group(1))
            note(f"The sentence gives Perception {stated_dc}.")
        elif sentence_dc:
            stated_dc = int(sentence_dc.group(1))
            note(f"The sentence gives DC {stated_dc}.")
        elif passive is not None:
            stated_dc = int(passive)
            note(f"Contested by Perception {stated_dc}.")
        else:
            dc_missing = "The creature's Perception is missing."
            note(dc_missing)

    if check_type == "save":
        sentence_dc = _DC_RE.search(raw)
        save_dc = None
        attacks = list((target or {}).get("attacks") or [])
        template = (target or {}).get("template") or {}
        attacks.extend(template.get("attacks") or [])
        for attack in attacks:
            if attack.get("save_dc") is not None:
                save_dc = attack.get("save_dc")
                break
        if sentence_dc:
            stated_dc = int(sentence_dc.group(1))
            note(f"The sentence gives DC {stated_dc}.")
        elif save_dc is not None:
            stated_dc = int(save_dc)
            note(f"The stat block gives save DC {stated_dc}.")
        else:
            dc_missing = "The stat block save DC is missing."
            note(dc_missing)

    if advantages and disadvantages:
        dice = "1d20"
        note("Advantage and disadvantage cancel.")
    elif advantages:
        dice = "2d20kh1"
    elif disadvantages:
        dice = "2d20kl1"
    else:
        dice = None

    return {
        "dice": dice,
        "ac_bonus": ac_bonus,
        "dex_save_bonus": dex_save_bonus,
        "extra_dice": extra_dice,
        "blocked": " ".join(blocked) if blocked else None,
        "crit_note": crit_note,
        "stated_dc": stated_dc,
        "dc_missing": dc_missing,
        "lines": lines,
    }
