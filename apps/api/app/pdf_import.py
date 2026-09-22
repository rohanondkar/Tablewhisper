from __future__ import annotations

import hashlib
import re
import uuid
from pathlib import Path
from typing import Any

from pypdf import PdfReader
from pypdf.generic import IndirectObject


ABILITY_MAP = {
    "STR": "strength",
    "DEX": "dexterity",
    "CON": "constitution",
    "INT": "intelligence",
    "WIS": "wisdom",
    "CHA": "charisma",
}

SKILL_FIELDS = {
    "acrobatics": ("Acrobatics", "AcrobaticsProf"),
    "animal_handling": ("Animal", "AnimalHandlingProf"),
    "arcana": ("Arcana", "ArcanaProf"),
    "athletics": ("Athletics", "AthleticsProf"),
    "deception": ("Deception", "DeceptionProf"),
    "history": ("History", "HistoryProf"),
    "insight": ("Insight", "InsightProf"),
    "intimidation": ("Intimidation", "IntimidationProf"),
    "investigation": ("Investigation", "InvestigationProf"),
    "medicine": ("Medicine", "MedicineProf"),
    "nature": ("Nature", "NatureProf"),
    "perception": ("Perception", "PerceptionProf"),
    "performance": ("Performance", "PerformanceProf"),
    "persuasion": ("Persuasion", "PersuasionProf"),
    "religion": ("Religion", "ReligionProf"),
    "sleight_of_hand": ("SleightofHand", "SleightOfHandProf"),
    "stealth": ("Stealth ", "StealthProf"),
    "survival": ("Survival", "SurvivalProf"),
}

SKILL_ABILITY = {
    "acrobatics": "dexterity",
    "animal_handling": "wisdom",
    "arcana": "intelligence",
    "athletics": "strength",
    "deception": "charisma",
    "history": "intelligence",
    "insight": "wisdom",
    "intimidation": "charisma",
    "investigation": "intelligence",
    "medicine": "wisdom",
    "nature": "intelligence",
    "perception": "wisdom",
    "performance": "charisma",
    "persuasion": "charisma",
    "religion": "intelligence",
    "sleight_of_hand": "dexterity",
    "stealth": "dexterity",
    "survival": "wisdom",
}

SKILL_NAMES = {
    "acrobatics": "Acrobatics",
    "animal_handling": "Animal Handling",
    "arcana": "Arcana",
    "athletics": "Athletics",
    "deception": "Deception",
    "history": "History",
    "insight": "Insight",
    "intimidation": "Intimidation",
    "investigation": "Investigation",
    "medicine": "Medicine",
    "nature": "Nature",
    "perception": "Perception",
    "performance": "Performance",
    "persuasion": "Persuasion",
    "religion": "Religion",
    "sleight_of_hand": "Sleight of Hand",
    "stealth": "Stealth",
    "survival": "Survival",
}


def _as_str(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "get_object"):
        value = value.get_object()
    text = str(value)
    if text in ("None", "/Off"):
        return ""
    return text.strip()


def _parse_mod(text: str) -> int:
    text = (text or "").strip().replace("−", "-")
    if not text or text == "--":
        return 0
    m = re.search(r"[+-]?\d+", text)
    return int(m.group(0)) if m else 0


def _parse_int(text: str, default: int = 0) -> int:
    text = (text or "").strip()
    if not text or text == "--":
        return default
    m = re.search(r"-?\d+", text)
    return int(m.group(0)) if m else default


def _is_proficient(mark: str) -> bool:
    mark = (mark or "").strip()
    if not mark:
        return False
    # Beyond uses various checkbox glyphs / letters
    return True


def extract_widget_fields(pdf_path: Path) -> dict[str, str]:
    reader = PdfReader(str(pdf_path))
    fields: dict[str, str] = {}
    for page in reader.pages:
        annots = page.get("/Annots") or []
        for annot in annots:
            obj = annot.get_object() if isinstance(annot, IndirectObject) else annot
            if obj.get("/Subtype") != "/Widget":
                continue
            name = obj.get("/T")
            parent = obj.get("/Parent")
            value = obj.get("/V")
            if parent is not None:
                parent_obj = parent.get_object()
                name = name or parent_obj.get("/T")
                if value is None:
                    value = parent_obj.get("/V")
            key = _as_str(name)
            if not key:
                continue
            fields[key] = _as_str(value)
    return fields


def _level_from_class(class_level: str) -> int:
    nums = re.findall(r"\d+", class_level or "")
    if not nums:
        return 1
    return sum(int(n) for n in nums)


def parse_dndbeyond_pdf(pdf_path: Path, character_id: str | None = None) -> dict[str, Any]:
    pdf_path = Path(pdf_path)
    raw = extract_widget_fields(pdf_path)
    digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()

    abilities = {}
    for abbr, ability_id in ABILITY_MAP.items():
        score_key = abbr
        mod_key = {
            "STR": "STRmod",
            "DEX": "DEXmod ",
            "CON": "CONmod",
            "INT": "INTmod",
            "WIS": "WISmod",
            "CHA": "CHamod",
        }[abbr]
        abilities[ability_id] = {
            "score": _parse_int(raw.get(score_key, "10"), 10),
            "modifier": _parse_mod(raw.get(mod_key, "0")),
        }

    saves = {}
    save_prof = {
        "strength": "StrProf",
        "dexterity": "DexProf",
        "constitution": "ConProf",
        "intelligence": "IntProf",
        "wisdom": "WisProf",
        "charisma": "ChaProf",
    }
    save_mod = {
        "strength": "ST Strength",
        "dexterity": "ST Dexterity",
        "constitution": "ST Constitution",
        "intelligence": "ST Intelligence",
        "wisdom": "ST Wisdom",
        "charisma": "ST Charisma",
    }
    for ability_id in ABILITY_MAP.values():
        saves[ability_id] = {
            "modifier": _parse_mod(raw.get(save_mod[ability_id], "0")),
            "proficient": _is_proficient(raw.get(save_prof[ability_id], "")),
        }

    skills: dict[str, Any] = {}
    for skill_id, (mod_field, prof_field) in SKILL_FIELDS.items():
        # Stealth field has trailing space in Beyond PDFs; also try trimmed.
        mod_text = raw.get(mod_field) or raw.get(mod_field.strip()) or "0"
        prof_text = raw.get(prof_field, "")
        proficient = _is_proficient(prof_text)
        expertise = prof_text.strip().upper() in {"E", "2", "EE"}
        skills[skill_id] = {
            "name": SKILL_NAMES[skill_id],
            "ability": SKILL_ABILITY[skill_id],
            "modifier": _parse_mod(mod_text),
            "proficient": proficient,
            "expertise": expertise,
        }

    attacks = []
    for idx, (name_k, atk_k, dmg_k, notes_k) in enumerate(
        [
            ("Wpn Name", "Wpn1 AtkBonus", "Wpn1 Damage", "Wpn Notes 1"),
            ("Wpn Name 2", "Wpn2 AtkBonus ", "Wpn2 Damage ", "Wpn Notes 2"),
            ("Wpn Name 3", "Wpn3 AtkBonus  ", "Wpn3 Damage ", "Wpn Notes 3"),
        ],
        start=1,
    ):
        name = raw.get(name_k) or raw.get(name_k.strip())
        if not name:
            continue
        attacks.append(
            {
                "name": name,
                "attack_bonus": (raw.get(atk_k) or raw.get(atk_k.strip()) or "").strip(),
                "damage": (raw.get(dmg_k) or raw.get(dmg_k.strip()) or "").strip(),
                "notes": (raw.get(notes_k) or "").strip(),
                "slot": idx,
            }
        )

    features = "\n\n".join(
        part
        for part in [
            raw.get("FeaturesTraits1", ""),
            raw.get("FeaturesTraits2", ""),
            raw.get("FeaturesTraits3", ""),
            raw.get("Actions1", ""),
        ]
        if part
    )

    class_level = raw.get("CLASS  LEVEL") or raw.get("CLASS  LEVEL2") or ""
    name = raw.get("CharacterName") or raw.get("CharacterName 2") or raw.get("CharacterName2") or "Unknown"
    current_hp_raw = raw.get("CurrentHP") or raw.get("HPCurrent") or ""
    temp_hp_raw = raw.get("TempHP") or ""

    character = {
        "id": character_id or str(uuid.uuid4()),
        "name": name,
        "player_name": raw.get("PLAYER NAME") or raw.get("PLAYER NAME2") or "",
        "class_level": class_level,
        "level": _level_from_class(class_level),
        "species": raw.get("RACE") or raw.get("RACE2") or "",
        "background": raw.get("BACKGROUND") or raw.get("BACKGROUND2") or "",
        "proficiency_bonus": _parse_mod(raw.get("ProfBonus", "+2")),
        "abilities": abilities,
        "saves": saves,
        "skills": skills,
        "ac": _parse_int(raw.get("AC", "10"), 10),
        "initiative": _parse_mod(raw.get("Init", "0")),
        "max_hp": _parse_int(raw.get("MaxHP", "1"), 1),
        "current_hp": _parse_int(current_hp_raw, _parse_int(raw.get("MaxHP", "1"), 1))
        if current_hp_raw
        else _parse_int(raw.get("MaxHP", "1"), 1),
        "temp_hp": _parse_int(temp_hp_raw, 0) if temp_hp_raw and temp_hp_raw != "--" else 0,
        "speed": raw.get("Speed") or "",
        "passive_perception": _parse_int(raw.get("Passive1", "10"), 10),
        "passive_insight": _parse_int(raw.get("Passive2", "10"), 10),
        "passive_investigation": _parse_int(raw.get("Passive3", "10"), 10),
        "hit_dice": raw.get("Total") or "",
        "attacks": attacks,
        "features": features,
        "proficiencies": raw.get("ProficienciesLang") or "",
        "save_modifiers": raw.get("SaveModifiers") or "",
        "currency": {
            "cp": _parse_int(raw.get("CP", "0")),
            "sp": _parse_int(raw.get("SP", "0")),
            "ep": _parse_int(raw.get("EP", "0")),
            "gp": _parse_int(raw.get("GP", "0")),
            "pp": _parse_int(raw.get("PP", "0")),
        },
        "raw_fields": raw,
        "source_pdf": str(pdf_path),
        "pdf_hash": digest,
        "updated_at": "",
    }
    return character


def character_diff(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "name",
        "class_level",
        "level",
        "species",
        "background",
        "proficiency_bonus",
        "ac",
        "initiative",
        "max_hp",
        "current_hp",
        "speed",
        "passive_perception",
    ]
    changed: dict[str, Any] = {}
    for key in keys:
        if old.get(key) != new.get(key):
            changed[key] = {"from": old.get(key), "to": new.get(key)}
    for ability, vals in new.get("abilities", {}).items():
        old_vals = old.get("abilities", {}).get(ability, {})
        if old_vals != vals:
            changed[f"ability.{ability}"] = {"from": old_vals, "to": vals}
    for skill, vals in new.get("skills", {}).items():
        old_vals = old.get("skills", {}).get(skill, {})
        interesting = {k: vals.get(k) for k in ("modifier", "proficient", "expertise")}
        old_interesting = {k: old_vals.get(k) for k in ("modifier", "proficient", "expertise")}
        if interesting != old_interesting:
            changed[f"skill.{skill}"] = {"from": old_interesting, "to": interesting}
    return changed
