"""5e XP by CR, story milestones, and character advancement helpers."""

from __future__ import annotations

from typing import Any

# DMG / Basic Rules — XP awarded for defeating a creature of that CR
CR_TO_XP: dict[str, int] = {
    "0": 10,
    "1/8": 25,
    "1/4": 50,
    "1/2": 100,
    "1": 200,
    "2": 450,
    "3": 700,
    "4": 1100,
    "5": 1800,
    "6": 2300,
    "7": 2900,
    "8": 3900,
    "9": 5000,
    "10": 5900,
    "11": 7200,
    "12": 8400,
    "13": 10000,
    "14": 11500,
    "15": 13000,
    "16": 15000,
    "17": 18000,
    "18": 20000,
    "19": 22000,
    "20": 25000,
    "21": 33000,
    "22": 41000,
    "23": 50000,
    "24": 62000,
    "25": 75000,
    "26": 90000,
    "27": 105000,
    "28": 120000,
    "29": 135000,
    "30": 155000,
}

# Total XP required to *reach* that character level (PHB / Basic Rules)
XP_THRESHOLDS: list[int] = [
    0,  # unused index 0
    0,  # level 1
    300,
    900,
    2700,
    6500,
    14000,
    23000,
    34000,
    48000,
    64000,
    85000,
    100000,
    120000,
    140000,
    165000,
    195000,
    225000,
    265000,
    305000,
    355000,
]

STORY_XP = {
    "social_charm": 50,
    "social_deception": 50,
    "social_intimidation": 50,
    "social_animal": 50,
    "story_beat": 25,
}

MILESTONE_LABELS = {
    "social_charm": "Social success (charm / persuade / seduce)",
    "social_deception": "Social success (deception)",
    "social_intimidation": "Social success (intimidation)",
    "social_animal": "Social success (animal handling)",
    "story_beat": "Story beat",
}


def normalize_cr(cr: Any) -> str:
    if cr is None or cr == "":
        return "0"
    s = str(cr).strip()
    # Open5e sometimes uses 0.125 / 0.25 / 0.5
    try:
        f = float(s)
        if abs(f - 0.125) < 1e-6:
            return "1/8"
        if abs(f - 0.25) < 1e-6:
            return "1/4"
        if abs(f - 0.5) < 1e-6:
            return "1/2"
        if f == int(f) and 0 <= f <= 30:
            return str(int(f))
    except ValueError:
        pass
    return s


def xp_for_cr(cr: Any) -> int:
    key = normalize_cr(cr)
    return int(CR_TO_XP.get(key, CR_TO_XP.get("0", 10)))


def xp_for_creature(template: dict[str, Any] | None) -> int:
    if not template:
        return 10
    if template.get("xp") is not None:
        try:
            return max(0, int(template["xp"]))
        except (TypeError, ValueError):
            pass
    return xp_for_cr(template.get("cr"))


def level_from_xp(xp: int) -> int:
    total = max(0, int(xp))
    level = 1
    for lvl in range(1, 21):
        if total >= XP_THRESHOLDS[lvl]:
            level = lvl
        else:
            break
    return level


def progress_for_xp(xp: int) -> dict[str, Any]:
    total = max(0, int(xp))
    level = level_from_xp(total)
    cur_threshold = XP_THRESHOLDS[level]
    if level >= 20:
        return {
            "xp": total,
            "level_from_xp": 20,
            "xp_into_level": total - XP_THRESHOLDS[20],
            "xp_to_next": 0,
            "xp_next_threshold": XP_THRESHOLDS[20],
            "ready_to_level": False,
        }
    next_threshold = XP_THRESHOLDS[level + 1]
    return {
        "xp": total,
        "level_from_xp": level,
        "xp_into_level": total - cur_threshold,
        "xp_to_next": max(0, next_threshold - total),
        "xp_next_threshold": next_threshold,
        "ready_to_level": total >= next_threshold,
    }


def ensure_character_progress(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize xp / milestones on a character dict (mutates copy)."""
    out = dict(data)
    try:
        out["xp"] = max(0, int(out.get("xp") or 0))
    except (TypeError, ValueError):
        out["xp"] = 0
    milestones = out.get("milestones")
    if not isinstance(milestones, list):
        out["milestones"] = []
    else:
        out["milestones"] = [str(m) for m in milestones]
    out["xp_progress"] = progress_for_xp(out["xp"])
    return out


def split_xp(total: int, n: int) -> list[int]:
    if n <= 0:
        return []
    total = max(0, int(total))
    base = total // n
    rem = total % n
    shares = [base] * n
    for i in range(rem):
        shares[i] += 1
    return shares


def milestone_kind_for_skill(skill: str | None) -> str:
    s = (skill or "").lower().replace(" ", "_")
    if s in {"persuasion", "performance"}:
        return "social_charm"
    if s == "deception":
        return "social_deception"
    if s == "intimidation":
        return "social_intimidation"
    if s == "animal_handling":
        return "social_animal"
    return "story_beat"


def story_xp_for_kind(kind: str) -> int:
    return int(STORY_XP.get(kind, STORY_XP["story_beat"]))


def milestone_label_for_kind(kind: str) -> str:
    return MILESTONE_LABELS.get(kind, MILESTONE_LABELS["story_beat"])
