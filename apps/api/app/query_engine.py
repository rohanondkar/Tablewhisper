from __future__ import annotations

import re
from typing import Any

from . import db, ollama_client, rules
from . import monsters as monsters_mod
from . import npcs as npcs_mod

# check_types where a clear rules hit should win over a conflicting LLM guess
PROTECTED_TYPES = {"attack", "save", "initiative"}

# Violence / weapon verbs — required before treating a creature mention as an attack
_ATTACK_VERB_RE = re.compile(
    r"\b("
    r"attack|attacks|swing|swings|shoot|shoots|strike|strikes|"
    r"fight|fighting|slash|slashes|stab|stabs|bash|bashes|smite|smites|"
    r"fire\s+at|shoot\s+at|engage|engages|hit\s+them|hits\s+them|"
    r"melee|ranged|weapon"
    r")\b",
    re.I,
)

_SOCIAL_VERBS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(seduce|seduces|flirt|flirts|woo|woos|sweet[\s-]?talk|charm\s+socially|persuade|persuades|convince|convinces|negotiate|negotiates|bargain|bargains|talk\s+into)\b", re.I), "persuasion"),
    (re.compile(r"\b(lie|lies|bluff|bluffs|deceive|deceives|disguise|pretend)\b", re.I), "deception"),
    (re.compile(r"\b(threaten|threatens|scare|scares|intimidate|intimidates|cow|cows)\b", re.I), "intimidation"),
    (re.compile(r"\b(pet|pets|petting|soothe|soothes|calm\s+animal|befriend|gentles?)\b", re.I), "animal_handling"),
]

_ANIMAL_SOCIAL_RE = re.compile(
    r"\b(seduce|seduces|flirt|flirts|woo|woos|persuade|persuades|convince|convinces|"
    r"pet|pets|petting|soothe|soothes|calm|befriend|gentle|gentles)\b",
    re.I,
)

_BEAST_TYPES = {"beast"}


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
    for pattern, skill_id in _SOCIAL_VERBS:
        if pattern.search(text):
            return skill_id
    return None


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
    social = _detect_social_skill(text)
    ctype = _creature_type_from_context(creature_ctx)
    is_beast = ctype in _BEAST_TYPES or "beast" in ctype

    # Beast + social / calm verbs → Animal Handling
    if creature_ctx and is_beast and _ANIMAL_SOCIAL_RE.search(text):
        return {
            "check_type": "skill",
            "skill": "animal_handling",
            "ability": "wisdom",
            "suggested_dc": 15,
            "notes": (
                f"Animal Handling to interact with {creature_ctx.get('label')}. "
                "Not an attack — beasts respond to Wisdom (Animal Handling), not AC."
            ),
            "_score": max(3, int((hint or {}).get("_score") or 0)),
            "_override": "beast_social",
        }

    # Explicit social verb: never attack
    if social:
        ability = {
            "persuasion": "charisma",
            "deception": "charisma",
            "intimidation": "charisma",
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
        f"1) Roll 1d20.\n"
        f"2) Add {bonus:+d} (skill / ability modifier from the sheet).\n"
        f"3) Compare the total to DC {dc}"
        f"{' (or a contested roll from the creature — see notes)' if subject else ''}.\n"
        f"4) {notes}"
    )


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


def _pick_weapon(
    text: str, character: dict[str, Any] | None
) -> dict[str, Any] | None:
    if not character:
        return None
    attacks = character.get("attacks") or []
    if not attacks:
        return None
    lowered = text.lower()
    best = None
    best_score = 0
    for atk in attacks:
        name = (atk.get("name") or "").strip()
        if not name:
            continue
        score = 0
        name_l = name.lower()
        if name_l in lowered:
            score += 20 + len(name_l)
        else:
            for token in re.split(r"[\s/,-]+", name_l):
                if len(token) > 2 and token in lowered:
                    score += len(token)
        # Generic weapon words in query that loosely match type
        notes = (atk.get("notes") or "").lower()
        for word in ("sword", "club", "dagger", "bow", "axe", "mace", "spear"):
            if word in lowered and (word in name_l or word in notes):
                score += 8
        if score > best_score:
            best_score = score
            best = atk
    if best:
        return best
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
) -> float:
    agrees = _llm_agrees(hint, llm)
    strong_rules = bool(hint) and int(hint.get("_score") or 0) >= 2
    protected = check_type in PROTECTED_TYPES

    if used_rules and agrees:
        return 0.92
    if used_rules and strong_rules and protected:
        return 0.88
    if used_rules and strong_rules:
        return 0.85
    if used_rules:
        return 0.78
    if llm and character:
        return 0.65
    if llm:
        return 0.55
    return 0.5


def resolve_query(text: str, character_id: str | None = None) -> dict[str, Any]:
    ruleset = rules.get_active_ruleset()
    characters = db.list_characters()
    events = db.list_events()
    hint = rules.match_guidance(text, ruleset)

    # Peek at NPC / creature mention early for social/beast overrides (no spawn yet)
    npc_peek = npcs_mod.find_npc_context(text)
    creature_peek = monsters_mod.find_creature_context(text)
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
        check_type = hint.get("check_type") or "ability"
        ability = hint.get("ability")
        skill = hint.get("skill")
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
        llm_type = llm.get("check_type") or check_type
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
            ability = llm.get("ability") or ability
            skill = llm.get("skill") or skill
            if "suggested_dc" in llm:
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
        override_hint = _apply_intent_overrides(text, hint, creature_peek)
        if override_hint and override_hint.get("check_type") != "attack":
            check_type = override_hint["check_type"]
            skill = override_hint.get("skill") or skill
            ability = override_hint.get("ability") or ability
            suggested_dc = override_hint.get("suggested_dc", suggested_dc)
            notes = override_hint.get("notes") or notes
            reasoning = (reasoning + " " if reasoning else "") + "Corrected attack→skill (social/beast)."
            used_rules = True
            source = "hybrid" if llm else "rules"

    # Naming a creature alone is not an attack
    if check_type == "attack" and (npc_peek or creature_peek) and not _ATTACK_VERB_RE.search(text):
        check_type = "ability"
        suggested_dc = suggested_dc if suggested_dc is not None else 15
        notes = "Creature named without a combat verb — treating as a non-attack check. Clarify the action."
        reasoning = (reasoning + " " if reasoning else "") + "Demoted attack: no combat verb."

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
        # Narrative subject only — do not auto-spawn, do not use AC
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
    )
    if skip_llm and rules_kept:
        confidence = max(confidence, 0.88)
    if check_type == "attack" and target:
        confidence = max(confidence, 0.9)
    if hint and hint.get("_override"):
        confidence = max(confidence, 0.9)

    target_payload = None
    if target:
        target_payload = {
            "id": target.get("id"),
            "label": target["label"],
            "ac": target["ac"],
            "current_hp": target["current_hp"],
            "max_hp": target["max_hp"],
            "monster_id": target["monster_id"],
            "virtual": bool(target.get("virtual")),
        }

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
        "target_ac": target["ac"] if target and check_type == "attack" else None,
        "to_hit_needed": to_hit_needed if check_type == "attack" else None,
        "howto": howto,
    }
    db.add_event(text, result)
    return result
