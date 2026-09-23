from __future__ import annotations

import re
from typing import Any

from . import db, ollama_client, portraits, rules
from . import monsters as monsters_mod
from . import npcs as npcs_mod

# check_types where a clear rules hit should win over a conflicting LLM guess
PROTECTED_TYPES = {"attack", "save", "initiative"}

# Violence / weapon verbs — required before treating a creature mention as an attack.
# Force, assault, and rape are attacks, not charm checks. Bare "force" is not included
# so "force open" stays Athletics.
_ATTACK_VERB_RE = re.compile(
    r"\b("
    r"attacks?|attacking|swings?|swinging|shoots?|shooting|strikes?|striking|"
    r"fights?|fighting|slashes?|slashing|stabs?|stabbing|bashes?|bashing|smites?|smiting|"
    r"punches?|punching|kicks?|kicking|bites?|biting|headbutts?|headbutting|"
    r"chokes?|choking|strangles?|strangling|tackles?|tackling|"
    r"fire\s+at|fires\s+at|shoot\s+at|shoots\s+at|hit\s+them|hits\s+them|"
    r"melee|ranged|"
    r"cast(?:s|ing)?\s+(?:a\s+)?(?:damaging\s+)?spell|"
    r"rapes?|raping|assaults?|assaulting|"
    r"force\s+(?:themselves|himself|herself|themself)\s+on|"
    r"forces\s+(?:themselves|himself|herself|themself)\s+on"
    r")\b",
    re.I,
)

_NULLISH = {"", "null", "none", "undefined", "n/a", "nil", "nan"}

# (pattern, skill id, ability, notes). First match wins. Animal Handling is separate
# so it does not fire against a person.
_PERSUASION_RE = re.compile(
    r"\b("
    r"kisses?|kissing|make[\s-]?out|hugs?|hugging|embraces?|embracing|"
    r"caress(?:es|ing)?|cuddles?|cuddling|hold\s+hands|flirts?|flirting|"
    r"seduces?|seducing|woos?|wooing|courts?|courting|romances?|romancing|"
    r"sweet[\s-]?talk(?:s|ing)?|compliments?|complimenting|"
    r"charms?|charming|convinces?|convincing|persuades?|persuading|"
    r"negotiates?|negotiating|bargains?|bargaining|pleads?|pleading|"
    r"begs?|begging|ask\s+nicely|propositions?|propositioning|"
    r"come\s+on\s+to|hits?\s+on|undress(?:es|ing)?|strips?|stripping|disrobes?|"
    r"fondles?|fondling|gropes?|groping|"
    r"sleep\s+with|sleeps\s+with|go\s+to\s+bed\s+with|goes\s+to\s+bed\s+with|"
    r"have\s+sex|has\s+sex|having\s+sex|fucks?|fucking|screws?|screwing|"
    r"lay\s+with|lays\s+with|hook\s+up|hooks\s+up|hooking\s+up|"
    r"make\s+love|makes\s+love|making\s+love|"
    r"oral|blowjob|blow\s+job|handjob|hand\s+job|"
    r"finger(?:s|ing)?\s+(?:her|him|them)|fingering|"
    r"moan\s+with|moans\s+with|get\s+naked\s+with|gets\s+naked\s+with|"
    r"talk\s+into|charm\s+socially"
    r")\b",
    re.I,
)
_DECEPTION_RE = re.compile(
    r"\b("
    r"lies?|lying|bluffs?|bluffing|deceives?|deceiving|disguises?|disguising|"
    r"pretends?|pretending|feigns?|feigning|impersonates?|impersonating|"
    r"forges?|forging|misleads?|misleading|gaslights?|gaslighting|"
    r"cover\s+up|covers\s+up|fakes?|faking|cons?|conning|tricks?|tricking"
    r")\b",
    re.I,
)
_INTIMIDATION_RE = re.compile(
    r"\b("
    r"threatens?|threatening|scares?|scaring|intimidates?|intimidating|"
    r"cows?|cowing|menaces?|menacing|bullies?|bullying|"
    r"blackmails?|blackmailing|coerces?|coercing|extorts?|extorting|"
    r"growls?\s+at|demands?|demanding"
    r")\b",
    re.I,
)
_PERFORMANCE_RE = re.compile(
    r"\b("
    r"sings?|singing|dances?|dancing|play\s+music|plays\s+music|"
    r"entertains?|entertaining|acts?|acting|recites?|reciting|"
    r"tell\s+a\s+joke|tells\s+a\s+joke|performs?|performing|"
    r"strip\s*tease|dance\s+seductively|dances\s+seductively"
    r")\b",
    re.I,
)
_ANIMAL_RE = re.compile(
    r"\b("
    r"pets?|petting|soothes?|soothing|calms?|calming|befriends?|befriending|"
    r"gentles?|gentling|tames?|taming|mounts?|mounting|rides?|riding|"
    r"feeds?|feeding|grooms?|grooming|calm\s+animal"
    r")\b",
    re.I,
)
_ANIMAL_SOCIAL_RE = _ANIMAL_RE

_SKILL_VERBS: list[tuple[re.Pattern[str], str, str, str]] = [
    (_PERSUASION_RE, "persuasion", "charisma", "Honest or romantic influence. Use the NPC's social DC when one is named."),
    (_DECEPTION_RE, "deception", "charisma", "Often contested by Insight."),
    (_INTIMIDATION_RE, "intimidation", "charisma", "May sour the scene. Often contested by Insight."),
    (_PERFORMANCE_RE, "performance", "charisma", "Entertain or distract an audience."),
    (
        re.compile(
            r"\b(sneaks?|sneaking|hides?|hiding|creeps?|creeping|skulks?|skulking|"
            r"slip\s+past|slips\s+past|move\s+quietly|moves\s+quietly|shadows?|shadowing|"
            r"tails?|tailing|stealth)\b",
            re.I,
        ),
        "stealth",
        "dexterity",
        "Contested by Passive Perception, or an active Perception check if someone is watching.",
    ),
    (
        re.compile(
            r"\b(climbs?|climbing|swims?|swimming|jumps?|jumping|lifts?|lifting|"
            r"breaks?|breaking|force\s+open|forces\s+open|shoves?|shoving|"
            r"grapples?|grappling|wrestles?|wrestling|sprints?|sprinting|"
            r"drags?|dragging|pushes?|pushing|pulls?|pulling|athletics)\b",
            re.I,
        ),
        "athletics",
        "strength",
        "Athletics for force and movement. Grapple and shove are contests, not attack rolls.",
    ),
    (
        re.compile(
            r"\b(balances?|balancing|tumbles?|tumbling|flips?|flipping|"
            r"cartwheels?|cartwheeling|squeeze\s+through|squeezes\s+through|"
            r"land\s+on\s+feet|lands\s+on\s+feet|tightrope|acrobatics)\b",
            re.I,
        ),
        "acrobatics",
        "dexterity",
        "Acrobatics when agility matters more than power.",
    ),
    (
        re.compile(
            r"\b(pickpockets?|pickpocketing|palms?|palming|plants?|planting|"
            r"steal\s+quietly|steals\s+quietly|pick\s+a\s+lock|picks\s+a\s+lock|"
            r"lockpicks?|lockpicking|conceals?|concealing|juggles?|juggling|"
            r"sleight\s+of\s+hand)\b",
            re.I,
        ),
        "sleight_of_hand",
        "dexterity",
        "Often contested by Perception. Locks usually need thieves' tools.",
    ),
    (
        re.compile(
            r"\b(looks?\s+around|looking\s+around|spots?|spotting|notices?|noticing|"
            r"hears?|hearing|listens?|listening|watches?|watching|scans?|scanning|"
            r"keep\s+watch|keeps\s+watch|smells?|smelling|perceives?|perception)\b",
            re.I,
        ),
        "perception",
        "wisdom",
        "Active Perception. Use Passive Perception when the character is not searching.",
    ),
    (
        re.compile(
            r"\b(searches?|searching|examines?|examining|deduces?|deducing|"
            r"inspects?|inspecting|studies?|studying|look\s+for\s+clues|looks\s+for\s+clues|"
            r"find\s+a\s+secret|finds\s+a\s+secret|investigates?|investigation)\b",
            re.I,
        ),
        "investigation",
        "intelligence",
        "Investigation analyzes clues; Perception notices stimuli.",
    ),
    (
        re.compile(
            r"\b(read\s+them|reads\s+them|sense\s+motive|senses\s+motive|"
            r"detect\s+a\s+lie|detects\s+a\s+lie|gauges?|gauging|intuits?|intuiting|insight)\b",
            re.I,
        ),
        "insight",
        "wisdom",
        "Often contests Deception.",
    ),
    (
        re.compile(
            r"\b(tracks?|tracking|forages?|foraging|navigates?|navigating|"
            r"camps?|camping|hunts?|hunting|find\s+water|finds\s+water|"
            r"follow\s+tracks|follows\s+tracks|survival)\b",
            re.I,
        ),
        "survival",
        "wisdom",
        "Tracking, foraging, and wilderness travel.",
    ),
    (
        re.compile(
            r"\b(stabilizes?|stabilizing|diagnoses?|diagnosing|treats?|treating|"
            r"bandages?|bandaging|first\s+aid|tend\s+wounds|tends\s+wounds|"
            r"surger(?:y|ies)|medicine)\b",
            re.I,
        ),
        "medicine",
        "wisdom",
        "Stabilize is often DC 10. Diagnosis and surgery can be harder.",
    ),
    (
        re.compile(r"\b(identify\s+magic|identifies\s+magic|recall\s+a\s+spell|recalls\s+a\s+spell|arcane\s+lore|arcana)\b", re.I),
        "arcana",
        "intelligence",
        "Arcana for spells, items, and planar lore.",
    ),
    (
        re.compile(r"\b(recall\s+history|recalls\s+history|identify\s+a\s+ruin|identifies\s+a\s+ruin|historical\s+lore|history\s+check)\b", re.I),
        "history",
        "intelligence",
        "History (Intelligence).",
    ),
    (
        re.compile(r"\b(identify\s+a\s+plant|identifies\s+a\s+plant|beast\s+lore|terrain\s+lore|nature\s+check|nature\s+lore)\b", re.I),
        "nature",
        "intelligence",
        "Nature (Intelligence).",
    ),
    (
        re.compile(r"\b(identify\s+a\s+rite|identifies\s+a\s+rite|holy\s+symbol|deity\s+lore|religion\s+check|holy\s+lore)\b", re.I),
        "religion",
        "intelligence",
        "Religion (Intelligence).",
    ),
]

_SAVE_VERBS: list[tuple[re.Pattern[str], str, str]] = [
    (
        re.compile(r"\b(dodges?|dodging|leap\s+aside|leaps\s+aside|dive\s+away|dives\s+away|dex(?:terity)?\s+save)\b", re.I),
        "dexterity",
        "Dexterity saving throw.",
    ),
    (
        re.compile(
            r"\b(resist\s+poison|resists\s+poison|hold\s+breath|holds\s+breath|"
            r"keep\s+concentration|keeps\s+concentration|endure\s+disease|endures\s+disease|"
            r"con(?:stitution)?\s+save)\b",
            re.I,
        ),
        "constitution",
        "Constitution saving throw.",
    ),
    (
        re.compile(
            r"\b(resist\s+fear|resists\s+fear|resist\s+charm|resists\s+charm|"
            r"resist\s+domination|resists\s+domination|wis(?:dom)?\s+save)\b",
            re.I,
        ),
        "wisdom",
        "Wisdom saving throw.",
    ),
    (
        re.compile(r"\b(resist\s+a\s+shove|resists\s+a\s+shove|hold\s+a\s+door|holds\s+a\s+door|str(?:ength)?\s+save)\b", re.I),
        "strength",
        "Strength saving throw.",
    ),
    (
        re.compile(r"\b(initiative|who\s+goes\s+first|roll\s+init)\b", re.I),
        "initiative",
        "d20 + Dexterity modifier. No DC.",
    ),
]


def _is_nullish(value: Any) -> bool:
    if value is None:
        return True
    return str(value).strip().lower() in _NULLISH


def _clean_field(value: Any) -> str | None:
    if _is_nullish(value):
        return None
    return str(value).strip()

_BEAST_TYPES = {"beast"}

# Ranged combat intent — shoot / fire / named ranged weapons
_RANGED_INTENT_RE = re.compile(
    r"\b("
    r"shoot|shoots|shooting|snipe|snipes|sniping|"
    r"fire\s+at|fires\s+at|firing\s+at|fire\s+upon|"
    r"loose\s+(an?\s+)?arrow|let\s+fly|"
    r"with\s+(my\s+|the\s+|a\s+|an\s+)?"
    r"(longbow|shortbow|hand\s+crossbow|heavy\s+crossbow|light\s+crossbow|"
    r"crossbow|bow|sling|firearm|pistol|rifle|musket|gun|blowgun)"
    r")\b",
    re.I,
)

# Gear that counts as a ranged weapon on the sheet
_RANGED_WEAPON_RE = re.compile(
    r"\b("
    r"longbow|shortbow|hand\s+crossbow|heavy\s+crossbow|light\s+crossbow|"
    r"crossbow|bow|sling|blowgun|firearm|pistol|rifle|musket|gun|"
    r"dart|javelin|throwing\s+axe|thrown"
    r")\b",
    re.I,
)

# Specific weapons/tools a player might name; longest first for matching
_NAMED_GEAR = (
    "hand crossbow",
    "heavy crossbow",
    "light crossbow",
    "throwing axe",
    "greatsword",
    "longsword",
    "shortsword",
    "battleaxe",
    "greataxe",
    "handaxe",
    "warhammer",
    "morningstar",
    "quarterstaff",
    "longbow",
    "shortbow",
    "crossbow",
    "rapier",
    "scimitar",
    "dagger",
    "glaive",
    "halberd",
    "trident",
    "javelin",
    "firearm",
    "blowgun",
    "musket",
    "pistol",
    "rifle",
    "maul",
    "mace",
    "flail",
    "spear",
    "pike",
    "staff",
    "whip",
    "club",
    "sling",
    "dart",
    "bow",
    "gun",
    "net",
    "shield",
)


def _rules_are_decisive(hint: dict[str, Any] | None) -> bool:
    """Strong keyword hits can skip Ollama for speed."""
    if not hint:
        return False
    score = int(hint.get("_score") or 0)
    check_type = hint.get("check_type")
    if check_type in PROTECTED_TYPES and score >= 1:
        return True
    if check_type == "skill" and score >= 2:
        return True
    return False


def _detect_social_skill(text: str) -> str | None:
    """Person-facing social skills. Animal Handling is not included."""
    for pattern, skill_id, _ability, _notes in _SKILL_VERBS[:4]:
        if pattern.search(text):
            return skill_id
    return None


def _is_person(ctx: dict[str, Any] | None) -> bool:
    if not ctx:
        return False
    if ctx.get("kind") == "npc" or ctx.get("npc_id"):
        return True
    ctype = _creature_type_from_context(ctx)
    return "humanoid" in ctype


def _creature_type_from_context(ctx: dict[str, Any] | None) -> str:
    if not ctx:
        return ""
    template = ctx.get("template") or {}
    return str(template.get("type") or ctx.get("type") or "").lower()


def _apply_intent_overrides(
    text: str,
    hint: dict[str, Any] | None,
    creature_ctx: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Prevent creature mentions from forcing attacks; map social+beast → Animal Handling.
    Returns an updated hint (or new synthetic hint) when an override applies.
    """
    # An explicit attack verb wins over romance or other social wording.
    if _ATTACK_VERB_RE.search(text):
        if hint and hint.get("check_type") == "attack":
            return hint
        return {
            "check_type": "attack",
            "ability": None,
            "skill": None,
            "suggested_dc": None,
            "notes": "Attack roll vs Armor Class. Force and assault are not charm checks.",
            "_score": max(3, int((hint or {}).get("_score") or 0)),
            "_override": "attack",
        }

    for pattern, ability, notes in _SAVE_VERBS:
        if not pattern.search(text):
            continue
        if ability == "initiative":
            return {
                "check_type": "initiative",
                "ability": "dexterity",
                "skill": None,
                "suggested_dc": None,
                "notes": notes,
                "_score": 3,
                "_override": "initiative",
            }
        return {
            "check_type": "save",
            "ability": ability,
            "skill": None,
            "suggested_dc": (hint or {}).get("suggested_dc") or 15,
            "notes": notes,
            "_score": 3,
            "_override": "save",
        }

    social = _detect_social_skill(text)

    # Calm, ride, or tame a beast or mount. Never Animal Handling against a person.
    if _ANIMAL_RE.search(text) and not _is_person(creature_ctx):
        who = creature_ctx.get("label") if creature_ctx else "the animal"
        return {
            "check_type": "skill",
            "skill": "animal_handling",
            "ability": "wisdom",
            "suggested_dc": 15,
            "notes": (
                f"Animal Handling to interact with {who}. "
                "Not an attack — beasts and mounts respond to Wisdom (Animal Handling), not AC."
            ),
            "_score": max(3, int((hint or {}).get("_score") or 0)),
            "_override": "beast_social",
        }

    # Explicit social verb: never attack. Subject should already prefer a named NPC.
    if social:
        ability = {
            "performance": "charisma",
            "animal_handling": "wisdom",
        }.get(social, "charisma")
        subject = creature_ctx.get("label") if creature_ctx else "the subject"
        contest = {
            "persuasion": "Often contested by Insight, or use a DC for attitude.",
            "deception": "Often contested by Insight.",
            "intimidation": "Often contested by Insight or a contested social check.",
            "animal_handling": "Use a DC based on the animal's temperament.",
        }.get(social, "")
        return {
            "check_type": "skill",
            "skill": social,
            "ability": ability,
            "suggested_dc": (hint or {}).get("suggested_dc") or 15,
            "notes": f"{social.replace('_', ' ').title()} involving {subject}. {contest}",
            "_score": max(3, int((hint or {}).get("_score") or 0)),
            "_override": "social",
        }

    for pattern, skill_id, ability_id, skill_notes in _SKILL_VERBS[4:]:
        if pattern.search(text):
            return {
                "check_type": "skill",
                "skill": skill_id,
                "ability": ability_id,
                "suggested_dc": (hint or {}).get("suggested_dc") or 15,
                "notes": skill_notes,
                "_score": max(3, int((hint or {}).get("_score") or 0)),
                "_override": "skill",
            }

    # Creature named but no attack verb → do not keep a weak/wrong attack classification
    if hint and hint.get("check_type") == "attack" and creature_ctx and not _ATTACK_VERB_RE.search(text):
        if hint.get("skill"):
            return hint
        # Demote mistaken attack to ability/other so LLM or later logic can fix;
        # if no better hint, leave as ambiguous ability
        return None

    return hint


def _skill_howto(
    *,
    character: dict[str, Any] | None,
    skill: str | None,
    ability: str | None,
    modifier: int | None,
    suggested_dc: int | None,
    subject: dict[str, Any] | None,
    ruleset: dict[str, Any],
    notes: str,
) -> str:
    who = character["name"] if character else "the character"
    skill_name = "check"
    if skill:
        skill_name = next(
            (s["name"] for s in ruleset.get("skills", []) if s["id"] == skill),
            skill.replace("_", " ").title(),
        )
    ab = (ability or "").title() or "ability"
    bonus = modifier if modifier is not None else 0
    dc = suggested_dc if suggested_dc is not None else 15
    subj = ""
    if subject:
        subj = f" involving {subject.get('label')}"
    return (
        f"New DM steps — {who} attempts {skill_name} ({ab}){subj}:\n"
        f"1) Roll 1d20 (advantage = 2d20 take higher; disadvantage = take lower, if fiction warrants).\n"
        f"2) Add {bonus:+d} (skill / ability modifier from the sheet; add proficiency if proficient).\n"
        f"3) Compare the total to DC {dc}"
        f"{' — or resolve as a contest (both roll; higher total wins)' if subject or 'contest' in (notes or '').lower() else ''}.\n"
        f"4) {notes}\n"
        f"Tip: Passive checks use 10 + modifiers (no roll) when the character isn't actively trying."
    )


def _named_in_text(label: str, text: str) -> bool:
    name = (label or "").strip()
    if len(name) < 3:
        return False
    if re.search(rf"\b{re.escape(name)}\b", text, re.I):
        return True
    first = name.split()[0]
    if len(first) < 3:
        return False
    return re.search(rf"\b{re.escape(first)}\b", text, re.I) is not None


def _participant_image(entity: dict[str, Any], kind: str) -> str | None:
    url = entity.get("image_url")
    if url:
        return str(url)
    if kind == "character":
        return portraits.image_url_for(entity)
    return None


def _add_participant(
    out: list[dict[str, Any]],
    seen: set[str],
    entity: dict[str, Any],
    role: str,
    kind: str,
) -> None:
    label = str(entity.get("label") or entity.get("name") or "").strip()
    if not label:
        return
    keys = []
    if entity.get("id"):
        keys.append(f"id:{entity['id']}")
    keys.append(f"name:{label.lower()}")
    if any(key in seen for key in keys):
        return
    seen.update(keys)
    out.append(
        {
            "id": entity.get("id"),
            "label": label,
            "role": role,
            "kind": kind,
            "image_url": _participant_image(entity, kind),
        }
    )


def _collect_participants(
    text: str,
    characters: list[dict[str, Any]],
    primary: dict[str, Any] | None,
    target: dict[str, Any] | None,
    check_type: str,
) -> list[dict[str, Any]]:
    """Every party member and named creature the roll is about, with a portrait URL."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    named = [c for c in characters if _named_in_text(str(c.get("name") or ""), text)]
    if primary and all(c.get("id") != primary.get("id") for c in named):
        named.insert(0, primary)
    if primary:
        named.sort(key=lambda c: 0 if c.get("id") == primary.get("id") else 1)
    for c in named:
        _add_participant(out, seen, c, "rolling", "character")

    subject_role = "target" if check_type == "attack" else "subject"
    if target:
        kind = "npc" if target.get("kind") == "npc" or target.get("npc_id") else "monster"
        _add_participant(out, seen, target, subject_role, kind)

    try:
        for npc in npcs_mod.list_scene():
            if _named_in_text(str(npc.get("label") or ""), text) or _named_in_text(
                str(npc.get("name") or ""), text
            ):
                _add_participant(out, seen, npc, subject_role, "npc")
    except Exception:
        pass
    try:
        for foe in monsters_mod.list_encounter():
            if _named_in_text(str(foe.get("label") or ""), text) or _named_in_text(
                str(foe.get("name") or ""), text
            ):
                _add_participant(out, seen, foe, subject_role, "monster")
    except Exception:
        pass

    def _covered(label: str) -> bool:
        low = label.lower()
        for person in out:
            existing = str(person.get("label") or "").lower()
            if existing == low or existing.startswith(low + " ") or low.startswith(existing + " "):
                return True
        return False

    try:
        for npc in npcs_mod.list_templates():
            name = str(npc.get("name") or "")
            if not _named_in_text(name, text) or _covered(name):
                continue
            _add_participant(
                out,
                seen,
                {
                    **npc,
                    "label": name,
                    "kind": "npc",
                    "npc_id": npc.get("id"),
                    "image_url": npc.get("image_url") or npcs_mod.image_url_for(npc),
                },
                subject_role,
                "npc",
            )
    except Exception:
        pass
    try:
        for monster in monsters_mod.list_templates():
            name = str(monster.get("name") or "")
            if not _named_in_text(name, text) or _covered(name):
                continue
            _add_participant(
                out,
                seen,
                {
                    **monster,
                    "label": name,
                    "image_url": monster.get("image_url") or monsters_mod.image_url_for(monster),
                },
                subject_role,
                "monster",
            )
    except Exception:
        pass
    return out


def _find_character(
    text: str,
    characters: list[dict[str, Any]],
    preferred_id: str | None = None,
) -> dict[str, Any] | None:
    if preferred_id:
        for c in characters:
            if c["id"] == preferred_id:
                return c
    lowered = text.lower()
    scored: list[tuple[int, dict[str, Any]]] = []
    for c in characters:
        name = c.get("name", "")
        score = 0
        if name and name.lower() in lowered:
            score += 10 + len(name)
        else:
            for token in re.split(r"\s+", name.lower()):
                if len(token) > 2 and token in lowered:
                    score += len(token)
        if score:
            scored.append((score, c))
    if scored:
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]
    if len(characters) == 1:
        return characters[0]
    return None


def _parse_bonus(raw: str | None) -> int | None:
    if raw is None:
        return None
    m = re.search(r"[+-]?\d+", str(raw).replace("−", "-"))
    return int(m.group(0)) if m else None


def _character_gear_blob(character: dict[str, Any]) -> str:
    parts: list[str] = []
    for atk in character.get("attacks") or []:
        parts.append(str(atk.get("name") or ""))
        parts.append(str(atk.get("notes") or ""))
        parts.append(str(atk.get("damage") or ""))
    parts.append(str(character.get("features") or ""))
    parts.append(str(character.get("proficiencies") or ""))
    return " ".join(parts).lower()


def _has_ranged_weapon(character: dict[str, Any]) -> bool:
    """True if attacks (preferred) or sheet text clearly lists a ranged weapon."""
    for atk in character.get("attacks") or []:
        blob = f"{atk.get('name') or ''} {atk.get('notes') or ''} {atk.get('damage') or ''}".lower()
        if _RANGED_WEAPON_RE.search(blob) or "ranged" in blob:
            return True
    # Features / proficiencies are weaker — only count explicit ranged weapon names
    extra = f"{character.get('features') or ''} {character.get('proficiencies') or ''}".lower()
    if re.search(
        r"\b(longbow|shortbow|hand\s+crossbow|heavy\s+crossbow|light\s+crossbow|"
        r"crossbow|short\s+bow|long\s+bow)\b",
        extra,
    ):
        return True
    return False


def _attacks_summary_names(character: dict[str, Any]) -> str:
    names = [
        str(a.get("name")).strip()
        for a in (character.get("attacks") or [])
        if a.get("name")
    ]
    return ", ".join(names) if names else "none listed"


def _extract_named_gear(text: str) -> str | None:
    """Return a specific weapon/gear noun the player is trying to use, if any."""
    lowered = text.lower()
    # Prefer "with my X" / "using X" / "fire my X"
    m = re.search(
        r"\b(?:with|using|wielding|draw|drawing|grab|grabbing|fire|firing|shoot|shooting)\s+"
        r"(?:my|the|a|an)?\s*([a-z][a-z\s-]{1,28})",
        lowered,
    )
    candidate = (m.group(1) if m else lowered).strip()
    for gear in _NAMED_GEAR:
        if re.search(rf"\b{re.escape(gear)}\b", candidate if m else lowered):
            return gear
    return None


def _character_has_named_gear(character: dict[str, Any], gear: str) -> bool:
    blob = _character_gear_blob(character)
    gear_l = gear.lower()
    if re.search(rf"\b{re.escape(gear_l)}\b", blob):
        return True
    # Bow / crossbow family aliases
    aliases = {
        "bow": ("longbow", "shortbow", "bow"),
        "crossbow": (
            "crossbow",
            "hand crossbow",
            "heavy crossbow",
            "light crossbow",
        ),
        "gun": ("firearm", "pistol", "rifle", "musket", "gun"),
        "firearm": ("firearm", "pistol", "rifle", "musket", "gun"),
    }
    for alias in aliases.get(gear_l, ()):
        if re.search(rf"\b{re.escape(alias)}\b", blob):
            return True
    return False


def _detect_impossibility(
    text: str,
    character: dict[str, Any] | None,
    check_type: str,
) -> dict[str, str] | None:
    """
    Deterministic "not possible" when the sheet clearly lacks required gear.
    Returns {"reason", "short"} or None when possible / insufficient evidence.
    """
    if not character:
        return None

    who = character.get("name") or "This character"
    owned = _attacks_summary_names(character)
    ranged_intent = bool(_RANGED_INTENT_RE.search(text))
    is_attackish = check_type == "attack" or bool(_ATTACK_VERB_RE.search(text))

    # Shoot / fire / named ranged weapon without any ranged attack on the sheet
    if ranged_intent and not _has_ranged_weapon(character):
        return {
            "short": "no ranged weapon",
            "reason": (
                f"{who} cannot make a ranged attack — no bow, crossbow, firearm, "
                f"or similar is listed on their sheet (attacks: {owned}). "
                "Ask what they do instead, or equip a ranged weapon first."
            ),
        }

    # Explicit named gear the sheet does not have (strong evidence only)
    named = _extract_named_gear(text)
    if named and is_attackish and not _character_has_named_gear(character, named):
        # Avoid false positives: generic "attack with weapon" without a known noun
        return {
            "short": f"no {named}",
            "reason": (
                f"{who} does not have a {named} among their attacks or equipment "
                f"signals (attacks: {owned}). That action is not possible as stated."
            ),
        }

    # Attack with zero weapons and unarmed not implied — still allow unarmed/natural
    if check_type == "attack" and not (character.get("attacks") or []):
        # Empty attacks list: only block if they named a weapon; bare "attack" → unarmed OK
        if named:
            return {
                "short": f"no {named}",
                "reason": (
                    f"{who} has no attacks listed on their sheet and does not appear "
                    f"to have a {named}. Not possible as stated."
                ),
            }

    return None


def _impossible_check_result(
    *,
    text: str,
    character: dict[str, Any],
    info: dict[str, str],
    source: str = "rules",
    reasoning: str = "",
) -> dict[str, Any]:
    who = character.get("name") or "Character"
    short = info.get("short") or "not possible"
    reason = info.get("reason") or f"{who} cannot do that."
    howto = (
        f"Not possible — {short}.\n"
        f"1) Do not call for an attack roll or ability check for this action.\n"
        f"2) Tell the player why: {reason}\n"
        f"3) Ask what they do instead (different weapon, draw gear, change approach)."
    )
    result = {
        "character": who,
        "character_id": character.get("id"),
        "check_type": "impossible",
        "ability": None,
        "skill": None,
        "dice": "",
        "modifier": None,
        "suggested_dc": None,
        "dc_label": None,
        "notes": reason,
        "roll_line": f"{who} -- Not possible ({short})",
        "confidence": 0.95,
        "source": source,
        "reasoning": reasoning
        or "Deterministic gear check: required weapon/equipment missing from character sheet.",
        "weapon": None,
        "damage": None,
        "target": None,
        "target_ac": None,
        "to_hit_needed": None,
        "howto": howto,
        "possible": False,
    }
    db.add_event(text, result)
    return result


def _pick_weapon(
    text: str, character: dict[str, Any] | None
) -> dict[str, Any] | None:
    if not character:
        return None
    attacks = character.get("attacks") or []
    if not attacks:
        return None
    lowered = text.lower()
    ranged_intent = bool(_RANGED_INTENT_RE.search(text))
    best = None
    best_score = 0
    for atk in attacks:
        name = (atk.get("name") or "").strip()
        if not name:
            continue
        score = 0
        name_l = name.lower()
        notes = (atk.get("notes") or "").lower()
        blob = f"{name_l} {notes}"
        is_ranged = bool(_RANGED_WEAPON_RE.search(blob) or "ranged" in blob)
        # When the player is clearly shooting, never prefer a melee weapon
        if ranged_intent and not is_ranged:
            continue
        if name_l in lowered:
            score += 20 + len(name_l)
        else:
            for token in re.split(r"[\s/,-]+", name_l):
                if len(token) > 2 and token in lowered:
                    score += len(token)
        # Generic weapon words in query that loosely match type
        for word in ("sword", "club", "dagger", "bow", "axe", "mace", "spear"):
            if word in lowered and (word in name_l or word in notes):
                score += 8
        if ranged_intent and is_ranged:
            score += 12
        if score > best_score:
            best_score = score
            best = atk
    if best:
        return best
    # Ranged intent with no matching ranged attack → do not fall back to melee
    if ranged_intent:
        return None
    return attacks[0]


def _modifier_for(
    character: dict[str, Any] | None,
    check_type: str,
    ability: str | None,
    skill: str | None,
    weapon: dict[str, Any] | None = None,
) -> int | None:
    if not character:
        return None
    if check_type == "initiative":
        return int(character.get("initiative", 0))
    if check_type == "attack":
        if weapon:
            parsed = _parse_bonus(weapon.get("attack_bonus"))
            if parsed is not None:
                return parsed
        attacks = character.get("attacks") or []
        if attacks:
            return _parse_bonus(attacks[0].get("attack_bonus")) or 0
        return None
    if check_type == "skill" and skill:
        skill_data = character.get("skills", {}).get(skill)
        if skill_data:
            return int(skill_data.get("modifier", 0))
    if check_type == "save" and ability:
        save = character.get("saves", {}).get(ability)
        if save:
            return int(save.get("modifier", 0))
    if ability:
        ab = character.get("abilities", {}).get(ability)
        if ab:
            return int(ab.get("modifier", 0))
    return None


def _roll_line(
    character: dict[str, Any] | None,
    check_type: str,
    ability: str | None,
    skill: str | None,
    modifier: int | None,
    suggested_dc: int | None,
    ruleset: dict[str, Any],
    weapon: dict[str, Any] | None = None,
    target: dict[str, Any] | None = None,
    to_hit_needed: int | None = None,
) -> str:
    who = character["name"] if character else "Party"
    if check_type == "skill" and skill:
        skill_name = next(
            (s["name"] for s in ruleset.get("skills", []) if s["id"] == skill),
            skill.replace("_", " ").title(),
        )
        ability_abbr = (ability or "")[:3].upper()
        label = f"{skill_name}" + (f" ({ability_abbr.title()})" if ability_abbr else "")
    elif check_type == "save" and ability:
        label = f"{ability.title()} save"
    elif check_type == "initiative":
        label = "Initiative"
    elif check_type == "attack":
        weapon_name = (weapon or {}).get("name") if weapon else None
        label = f"{weapon_name} attack" if weapon_name else "Attack"
    elif ability:
        label = f"{ability.title()} check"
    else:
        label = check_type.title()

    mod_txt = ""
    if modifier is not None:
        mod_txt = f" {modifier:+d}"

    if check_type == "attack" and target:
        ac = target.get("ac")
        tname = target.get("label") or target.get("name") or "target"
        need = f", need {to_hit_needed}+ on d20" if to_hit_needed is not None else ""
        target_txt = f" vs {tname} AC {ac}{need}"
    elif check_type == "attack":
        target_txt = " vs AC"
    elif suggested_dc is not None and target:
        tname = target.get("label") or target.get("name") or "subject"
        target_txt = f" vs DC {suggested_dc} ({tname})"
    elif suggested_dc is not None:
        target_txt = f" vs DC {suggested_dc}"
    elif target:
        tname = target.get("label") or target.get("name") or "subject"
        target_txt = f" ({tname})"
    else:
        target_txt = ""
    return f"{who} -- {label}{mod_txt}{target_txt}".strip()


def _attack_howto(
    *,
    character: dict[str, Any] | None,
    weapon: dict[str, Any] | None,
    modifier: int | None,
    target: dict[str, Any] | None,
    to_hit_needed: int | None,
) -> str:
    who = character["name"] if character else "the character"
    wname = (weapon or {}).get("name") or "their weapon"
    bonus = modifier if modifier is not None else 0
    dmg = (weapon or {}).get("damage") or "weapon damage"
    if not target:
        return (
            f"1) Roll 1d20 and add {bonus:+d} (attack bonus). "
            f"2) Compare the total to the target's Armor Class (AC). "
            f"3) If you meet or beat AC, roll damage: {dmg}."
        )
    ac = target["ac"]
    label = target.get("label") or target.get("name")
    hp = f"{target.get('current_hp')}/{target.get('max_hp')} HP"
    need = to_hit_needed if to_hit_needed is not None else max(1, ac - bonus)
    return (
        f"New DM steps — {who} attacks {label} with {wname}:\n"
        f"1) Roll 1d20.\n"
        f"2) Add {bonus:+d} (from the character sheet attack bonus).\n"
        f"3) {label} has AC {ac}, so you need a total of {ac}+ "
        f"(that's {need}+ showing on the d20 before modifiers, or any natural 20).\n"
        f"4) On a hit, roll damage: {dmg}. Subtract that from {label}'s HP ({hp}).\n"
        f"5) Natural 1 always misses; natural 20 is a critical hit (roll damage dice twice, then add modifiers once)."
    )

def _llm_agrees(hint: dict[str, Any] | None, llm: dict[str, Any] | None) -> bool:
    if not hint or not llm:
        return False
    if (llm.get("check_type") or "") != (hint.get("check_type") or ""):
        return False
    if hint.get("skill") and llm.get("skill") and llm.get("skill") != hint.get("skill"):
        return False
    if hint.get("check_type") == "save" and hint.get("ability") and llm.get("ability"):
        return llm.get("ability") == hint.get("ability")
    return True


def _compute_confidence(
    *,
    hint: dict[str, Any] | None,
    llm: dict[str, Any] | None,
    character: dict[str, Any] | None,
    check_type: str,
    used_rules: bool,
    skip_llm: bool = False,
    has_target: bool = False,
) -> float:
    """Honest confidence — not a flat ~90% for every rules keyword hit."""
    score = int(hint.get("_score") or 0) if hint else 0
    agrees = _llm_agrees(hint, llm) if llm and hint else False

    if used_rules:
        # Weak keyword (1) → mid 50s; strong multi-keyword → low–mid 80s.
        base = 0.48 + min(0.34, 0.07 * score)
    elif llm:
        raw = llm.get("confidence")
        try:
            llm_c = float(raw)
        except (TypeError, ValueError):
            llm_c = 0.55
        if llm_c > 1.0:
            llm_c = llm_c / 100.0
        llm_c = max(0.0, min(1.0, llm_c))
        base = 0.38 + 0.40 * llm_c
    else:
        base = 0.40

    if character:
        base += 0.05
    else:
        base -= 0.04

    if llm and used_rules:
        base += 0.07 if agrees else -0.06
    if skip_llm and used_rules:
        base += 0.03  # decisive rules path, still not a 90% floor
    if check_type == "attack" and has_target:
        base += 0.04
    elif check_type == "attack" and not has_target:
        base -= 0.05
    if hint and hint.get("_override"):
        base += 0.03
    if used_rules and score <= 1:
        base -= 0.06  # single vague keyword
    if check_type in {"ability", "other"} and score < 2:
        base -= 0.04

    return round(max(0.22, min(0.94, base)), 2)


def resolve_query(text: str, character_id: str | None = None) -> dict[str, Any]:
    ruleset = rules.get_active_ruleset()
    characters = db.list_characters()
    events = db.list_events()
    hint = rules.match_guidance(text, ruleset)

    # Peek at NPC / creature mention early for social/beast overrides (no spawn yet)
    npc_peek = npcs_mod.find_npc_context(text)
    creature_peek = monsters_mod.find_creature_context(text)
    # A named scene NPC wins over a monster that was only loosely matched.
    subject_peek = npc_peek or creature_peek
    hint = _apply_intent_overrides(text, hint, subject_peek)

    # Skip local LLM when rules already decide — Ollama is the slow path (seconds–tens of seconds).
    skip_llm = _rules_are_decisive(hint)
    llm = None
    if not skip_llm:
        llm = ollama_client.interpret(
            query=text,
            ruleset=ruleset,
            characters=characters,
            events=events,
            rules_hint=hint,
        )

    check_type = "ability"
    ability = None
    skill = None
    suggested_dc: int | None = 15
    notes = "Ambiguous — best-effort ruling."
    reasoning = ""
    source = "rules"
    used_rules = False

    if hint:
        used_rules = True
        check_type = _clean_field(hint.get("check_type")) or "ability"
        ability = _clean_field(hint.get("ability"))
        skill = _clean_field(hint.get("skill"))
        suggested_dc = hint.get("suggested_dc")
        notes = hint.get("notes") or notes
        override = hint.get("_override")
        reasoning = f"Keyword match against rules pack ({ruleset.get('id')}, score={hint.get('_score')})."
        if override:
            reasoning = f"Intent override ({override}). " + reasoning
        if skip_llm:
            reasoning += " Skipped Ollama (decisive rules match)."
        source = "rules"

    if llm:
        llm_type = _clean_field(llm.get("check_type")) or check_type
        # Never let LLM turn an explicit social/beast override into an attack
        social_locked = bool(hint and hint.get("_override") in {"social", "beast_social"})
        # Rules-first: do not let LLM demote protected / strong skill matches
        demote_blocked = (
            used_rules
            and hint is not None
            and (
                hint.get("check_type") in PROTECTED_TYPES
                or social_locked
                or (
                    hint.get("check_type") == "skill"
                    and int(hint.get("_score") or 0) >= 2
                    and llm_type in {"ability", "other", "attack"}
                )
            )
            and llm_type != hint.get("check_type")
        )

        if demote_blocked:
            source = "hybrid"
            reasoning = (
                (reasoning + " ") if reasoning else ""
            ) + "Kept rules check_type; ignored conflicting LLM classification."
            if llm.get("notes") and hint and hint.get("check_type") == "attack":
                notes = hint.get("notes") or notes
            if llm.get("reasoning"):
                reasoning = f"{reasoning} LLM: {llm.get('reasoning')}"
        else:
            source = "hybrid" if used_rules else "ollama"
            check_type = llm_type
            ability = _clean_field(llm.get("ability")) or ability
            skill = _clean_field(llm.get("skill")) or skill
            if "suggested_dc" in llm and not _is_nullish(llm.get("suggested_dc")):
                suggested_dc = llm.get("suggested_dc")
            notes = llm.get("notes") or notes
            reasoning = llm.get("reasoning") or reasoning
            if llm.get("character_id"):
                character_id = llm.get("character_id")

    # Final guard: social verbs / beast social never resolve as attack
    if check_type == "attack" and (
        _detect_social_skill(text)
        or (creature_peek and _creature_type_from_context(creature_peek) in _BEAST_TYPES and _ANIMAL_SOCIAL_RE.search(text))
    ):
        override_hint = _apply_intent_overrides(text, hint, npc_peek or creature_peek)
        if override_hint and override_hint.get("check_type") != "attack":
            check_type = override_hint["check_type"]
            skill = override_hint.get("skill") or skill
            ability = override_hint.get("ability") or ability
            suggested_dc = override_hint.get("suggested_dc", suggested_dc)
            notes = override_hint.get("notes") or notes
            reasoning = (reasoning + " " if reasoning else "") + "Corrected attack→skill (social/beast)."
            used_rules = True
            source = "hybrid" if llm else "rules"

    # Naming a creature alone is not an attack. Keep a real skill if the verb catalog has one.
    if check_type == "attack" and (npc_peek or creature_peek) and not _ATTACK_VERB_RE.search(text):
        rescued = _apply_intent_overrides(text, None, npc_peek or creature_peek)
        if rescued and rescued.get("check_type") != "attack" and (
            rescued.get("skill") or rescued.get("check_type") in {"save", "initiative"}
        ):
            check_type = rescued["check_type"]
            skill = _clean_field(rescued.get("skill"))
            ability = _clean_field(rescued.get("ability"))
            suggested_dc = rescued.get("suggested_dc", suggested_dc)
            notes = rescued.get("notes") or notes
        else:
            check_type = "ability"
            skill = None
            ability = _clean_field(ability) or "wisdom"
            suggested_dc = suggested_dc if suggested_dc is not None else 15
            notes = "Creature named without a combat verb — Wisdom check. Clarify the action."
        reasoning = (reasoning + " " if reasoning else "") + "Demoted attack: no combat verb."

    check_type = _clean_field(check_type) or "ability"
    ability = _clean_field(ability)
    skill = _clean_field(skill)

    # Prefer NPC social DCs when a scene/catalog NPC is the subject
    if check_type in {"skill", "ability", "save"} and npc_peek and skill:
        npc_dc = npcs_mod.social_dc_for(npc_peek, skill)
        if npc_dc is not None:
            suggested_dc = npc_dc
            notes = (notes + " " if notes else "") + f"{npc_peek.get('label')} social DC {npc_dc}."

    # Attacks never use a DC
    if check_type == "attack":
        suggested_dc = None

    character = _find_character(text, characters, character_id)
    if llm and llm.get("character") and not character:
        wanted = str(llm.get("character")).lower()
        for c in characters:
            if c["name"].lower() == wanted or wanted in c["name"].lower():
                character = c
                break

    # Gear / weapon impossibility — deterministic, before building an attack roll
    impossible = _detect_impossibility(text, character, check_type)
    if impossible and character:
        src = "hybrid" if llm else "rules"
        why = (
            (reasoning + " " if reasoning else "")
            + "Blocked: character sheet lacks required gear for this action."
        )
        return _impossible_check_result(
            text=text,
            character=character,
            info=impossible,
            source=src,
            reasoning=why,
        )

    # Hybrid-only backup: honor an explicit LLM "impossible" when Ollama already ran
    if (
        llm
        and character
        and str(llm.get("check_type") or "").lower() == "impossible"
    ):
        return _impossible_check_result(
            text=text,
            character=character,
            info={
                "short": "not possible",
                "reason": llm.get("notes")
                or f"{character.get('name')} cannot do that with their current gear/abilities.",
            },
            source="hybrid",
            reasoning=llm.get("reasoning")
            or "Ollama classified this action as impossible given the sheet.",
        )

    if check_type == "skill" and skill and not ability:
        for s in ruleset.get("skills", []):
            if s["id"] == skill:
                ability = s["ability"]
                break

    weapon = _pick_weapon(text, character) if check_type == "attack" else None
    modifier = _modifier_for(character, check_type, ability, skill, weapon)

    target = None
    to_hit_needed = None
    howto = None
    if check_type == "attack":
        try:
            target = npcs_mod.resolve_or_spawn_npc(text) or monsters_mod.resolve_or_spawn_target(text)
        except Exception:
            target = None
        if target and modifier is not None:
            to_hit_needed = max(1, min(20, int(target["ac"]) - int(modifier)))
    elif check_type in {"skill", "save", "ability"}:
        # Narrative subject only — do not auto-spawn, do not use AC.
        # Social checks use the named scene NPC, not a leftover foe.
        if skill in {"persuasion", "deception", "intimidation", "performance"} and npc_peek:
            target = npc_peek
        else:
            target = npc_peek or creature_peek
        if target and target.get("virtual"):
            # Keep label/stats for UI but no encounter id for damage
            pass

    dice = ruleset.get("dice_defaults", {}).get(
        "ability_check" if check_type in {"skill", "ability"} else check_type,
        "1d20",
    )
    if check_type == "save":
        dice = ruleset.get("dice_defaults", {}).get("saving_throw", "1d20")
    if check_type == "attack":
        dice = ruleset.get("dice_defaults", {}).get("attack_roll", "1d20")
    if check_type == "initiative":
        dice = ruleset.get("dice_defaults", {}).get("initiative", "1d20")

    if suggested_dc is not None and check_type not in {"attack", "initiative", "impossible"}:
        adjusted = rules.adjust_dc_from_query(text, int(suggested_dc), ruleset)
        if adjusted is not None and adjusted != suggested_dc:
            reasoning = (reasoning + " " if reasoning else "") + (
                f"DC adjusted {suggested_dc}→{adjusted} from difficulty wording."
            )
            suggested_dc = adjusted

    roll_line = _roll_line(
        character,
        check_type,
        ability,
        skill,
        modifier,
        suggested_dc,
        ruleset,
        weapon,
        target,
        to_hit_needed,
    )

    if check_type == "attack":
        howto = _attack_howto(
            character=character,
            weapon=weapon,
            modifier=modifier,
            target=target,
            to_hit_needed=to_hit_needed,
        )
        if weapon and weapon.get("damage"):
            notes = (
                f"Attack roll vs Armor Class. "
                f"Damage on a hit: {weapon.get('damage')}."
            )
            if target:
                notes = (
                    f"{target.get('label')} — AC {target['ac']}, "
                    f"HP {target['current_hp']}/{target['max_hp']}. {notes}"
                )
    elif check_type in {"skill", "save", "ability"}:
        howto = _skill_howto(
            character=character,
            skill=skill,
            ability=ability,
            modifier=modifier,
            suggested_dc=suggested_dc,
            subject=target,
            ruleset=ruleset,
            notes=notes,
        )

    rules_kept = bool(hint) and check_type == (hint.get("check_type") if hint else None)
    confidence = _compute_confidence(
        hint=hint,
        llm=llm,
        character=character,
        check_type=check_type,
        used_rules=rules_kept,
        skip_llm=skip_llm,
        has_target=bool(target),
    )

    target_payload = None
    if target:
        target_payload = {
            "id": target.get("id"),
            "label": target.get("label"),
            "ac": target.get("ac"),
            "current_hp": target.get("current_hp"),
            "max_hp": target.get("max_hp"),
            "monster_id": target.get("monster_id") or target.get("npc_id"),
            "npc_id": target.get("npc_id"),
            "kind": target.get("kind") or ("npc" if target.get("npc_id") else "monster"),
            "image_url": target.get("image_url"),
            "virtual": bool(target.get("virtual")),
        }

    participants = _collect_participants(
        text,
        characters,
        character,
        target,
        check_type,
    )

    result = {
        "character": character["name"] if character else None,
        "character_id": character["id"] if character else None,
        "check_type": check_type,
        "ability": ability,
        "skill": skill,
        "dice": dice,
        "modifier": modifier,
        "suggested_dc": suggested_dc,
        "dc_label": rules.dc_label(ruleset, suggested_dc),
        "notes": notes,
        "roll_line": roll_line,
        "confidence": confidence,
        "source": source,
        "reasoning": reasoning,
        "weapon": weapon.get("name") if weapon else None,
        "damage": (weapon or {}).get("damage") if weapon and check_type == "attack" else None,
        "target": target_payload,
        "participants": participants,
        "target_ac": target["ac"] if target and check_type == "attack" else None,
        "to_hit_needed": to_hit_needed if check_type == "attack" else None,
        "howto": howto,
    }
    db.add_event(text, result)
    return result
