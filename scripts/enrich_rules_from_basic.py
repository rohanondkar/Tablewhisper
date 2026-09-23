"""Enrich rules-dnd5e check resolve from free Basic Rules (structured only)."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULESET = ROOT / "packages" / "rules-dnd5e" / "ruleset.json"


def main() -> None:
    data = json.loads(RULESET.read_text(encoding="utf-8"))
    data["version"] = "1.1.0"
    data["description"] = (
        "SRD-safe ability checks, skills, saves, and DC guidance for 5th Edition, "
        "aligned with the free Player’s / DM’s Basic Rules check ladder (DC 5–30), "
        "contests, passive checks, and advantage."
    )
    data["sources_note"] = (
        "Check-resolve tables distilled for local DM tooling from Wizards’ free "
        "Basic Rules PDFs (personal use). Not a reproduction of those documents."
    )

    data["dc_bands"] = [
        {"label": "Very Easy", "dc": 5, "when": "Trivial for competent adventurers"},
        {"label": "Easy", "dc": 10, "when": "Simple task with mild risk of failure"},
        {"label": "Medium", "dc": 15, "when": "Standard adventuring challenge"},
        {"label": "Hard", "dc": 20, "when": "Requires notable skill or luck"},
        {"label": "Very Hard", "dc": 25, "when": "Heroic difficulty"},
        {"label": "Nearly Impossible", "dc": 30, "when": "Legendary feat"},
    ]

    data["dc_modifiers"] = [
        {
            "label": "Very Easy",
            "keywords": ["very easy", "trivial", "no sweat", "piece of cake"],
            "delta": -10,
        },
        {
            "label": "Easy",
            "keywords": ["easy", "simple", "routine", "straightforward"],
            "delta": -5,
        },
        {
            "label": "Hard",
            "keywords": ["hard", "difficult", "tough", "challenging"],
            "delta": 5,
        },
        {
            "label": "Very Hard",
            "keywords": ["very hard", "extreme", "brutal", "heroic difficulty"],
            "delta": 10,
        },
        {
            "label": "Nearly Impossible",
            "keywords": ["nearly impossible", "impossible odds", "legendary feat"],
            "delta": 15,
        },
        {
            "label": None,
            "keywords": ["locked", "padlocked", "barred", "sealed", "warded"],
            "delta": 5,
        },
        {
            "label": None,
            "keywords": ["sheer", "smooth cliff", "ice-slick", "icy", "slippery"],
            "delta": 5,
        },
        {
            "label": None,
            "keywords": ["magical lock", "arcane lock", "enchanted door"],
            "delta": 10,
        },
    ]

    data["resolve_mechanics"] = {
        "ability_check": (
            "Call for a check only when the outcome is uncertain. Pick an ability "
            "(and a skill if it fits), set a DC from the ladder, roll d20 + modifiers."
        ),
        "contests": (
            "When two creatures oppose each other, both roll; higher total wins "
            "(tie = situation unchanged)."
        ),
        "passive": (
            "Passive score = 10 + all modifiers that apply to the check "
            "(e.g. Passive Perception). Use when the character isn't actively trying."
        ),
        "working_together": (
            "Help action can grant advantage when two characters can productively cooperate."
        ),
        "group_checks": (
            "Everyone rolls; if at least half succeed, the group succeeds."
        ),
        "advantage": (
            "Advantage: 2d20 keep higher. Disadvantage: keep lower. "
            "Advantage and disadvantage cancel."
        ),
    }

    # Rebuild check_guidance with varied DCs (Basic Rules–style difficulty).
    data["check_guidance"] = [
        {
            "keywords": [
                "sneak past",
                "sneaks past",
                "sneak by",
                "slip past",
                "hide from",
                "hide behind",
                "stealth check",
                "move unseen",
                "quietly approach",
            ],
            "check_type": "skill",
            "skill": "stealth",
            "ability": "dexterity",
            "suggested_dc": 15,
            "notes": "Usually contested by Passive Perception (or an active Perception check if someone is watching closely).",
        },
        {
            "keywords": ["sneak", "sneaks", "sneaking", "hide", "hides", "stealth", "unseen"],
            "check_type": "skill",
            "skill": "stealth",
            "ability": "dexterity",
            "suggested_dc": 12,
            "notes": "Stealth. Raise DC or contest Passive Perception when light/cover is poor.",
        },
        {
            "keywords": ["climb sheer", "scale the wall", "climb the cliff", "climb cliff"],
            "check_type": "skill",
            "skill": "athletics",
            "ability": "strength",
            "suggested_dc": 20,
            "notes": "Hard Athletics climb (sheer / difficult surface).",
        },
        {
            "keywords": ["climb rope", "climb the rope", "shimmy up"],
            "check_type": "skill",
            "skill": "athletics",
            "ability": "strength",
            "suggested_dc": 10,
            "notes": "Easy Athletics (rope or good handholds).",
        },
        {
            "keywords": ["force open", "break down the door", "break down door", "bash the door", "kick in the door"],
            "check_type": "skill",
            "skill": "athletics",
            "ability": "strength",
            "suggested_dc": 15,
            "notes": "Athletics to force a stuck door; locked/barred doors are often Hard (DC 20).",
        },
        {
            "keywords": ["grapple", "grapples", "grab them", "shove", "shoves", "push prone", "knock prone"],
            "check_type": "skill",
            "skill": "athletics",
            "ability": "strength",
            "suggested_dc": 15,
            "notes": "Contest: Athletics vs target's Athletics or Acrobatics (not an attack roll).",
        },
        {
            "keywords": ["swim against", "swim the current", "long jump", "high jump", "lift the", "break the"],
            "check_type": "skill",
            "skill": "athletics",
            "ability": "strength",
            "suggested_dc": 15,
            "notes": "Athletics for raw physical tasks (swim, jump, lift, break).",
        },
        {
            "keywords": ["climb", "swim", "jump"],
            "check_type": "skill",
            "skill": "athletics",
            "ability": "strength",
            "suggested_dc": 15,
            "notes": "Athletics for force-based movement.",
        },
        {
            "keywords": ["tightrope", "balance on", "keep footing", "land on feet", "tumble through"],
            "check_type": "skill",
            "skill": "acrobatics",
            "ability": "dexterity",
            "suggested_dc": 15,
            "notes": "Acrobatics when agility matters more than power.",
        },
        {
            "keywords": ["balance", "tumble", "flip", "cartwheel"],
            "check_type": "skill",
            "skill": "acrobatics",
            "ability": "dexterity",
            "suggested_dc": 12,
            "notes": "Acrobatics (Dexterity).",
        },
        {
            "keywords": ["pick the lock", "pick lock", "open lock", "lockpick"],
            "check_type": "skill",
            "skill": "sleight_of_hand",
            "ability": "dexterity",
            "suggested_dc": 15,
            "notes": "Thieves' tools proficiency usually required; DC rises for quality locks.",
        },
        {
            "keywords": ["pickpocket", "pick pocket", "palm", "plant item", "steal quietly", "lift purse"],
            "check_type": "skill",
            "skill": "sleight_of_hand",
            "ability": "dexterity",
            "suggested_dc": 15,
            "notes": "Often contested by Perception.",
        },
        {
            "keywords": ["spot trap", "notice trap", "hear whisper", "hear footsteps", "spot the ambush"],
            "check_type": "skill",
            "skill": "perception",
            "ability": "wisdom",
            "suggested_dc": 15,
            "notes": "Active Perception. Compare to Passive Perception when not searching.",
        },
        {
            "keywords": ["look around", "spot", "spots", "notice", "notices", "perceive", "perception check", "keep watch"],
            "check_type": "skill",
            "skill": "perception",
            "ability": "wisdom",
            "suggested_dc": 12,
            "notes": "Perception (Wisdom). Hidden things are often Medium/Hard.",
        },
        {
            "keywords": ["search for clues", "examine carefully", "find secret door", "find the compartment"],
            "check_type": "skill",
            "skill": "investigation",
            "ability": "intelligence",
            "suggested_dc": 15,
            "notes": "Investigation analyzes clues; Perception notices stimuli.",
        },
        {
            "keywords": ["search", "searches", "clue", "deduce", "investigate", "investigates"],
            "check_type": "skill",
            "skill": "investigation",
            "ability": "intelligence",
            "suggested_dc": 15,
            "notes": "Investigation (Intelligence).",
        },
        {
            "keywords": ["track", "tracks", "follow trail", "follow tracks", "forage", "forages"],
            "check_type": "skill",
            "skill": "survival",
            "ability": "wisdom",
            "suggested_dc": 15,
            "notes": "Survival for tracking/foraging; terrain and age of tracks can raise DC.",
        },
        {
            "keywords": ["survive", "wilderness", "navigate swamp", "avoid quicksand"],
            "check_type": "skill",
            "skill": "survival",
            "ability": "wisdom",
            "suggested_dc": 15,
            "notes": "Often a group Survival check in hazardous terrain.",
        },
        {
            "keywords": ["are they lying", "sense motive", "read them", "detect a lie", "insight check"],
            "check_type": "skill",
            "skill": "insight",
            "ability": "wisdom",
            "suggested_dc": 15,
            "notes": "Often contests Deception.",
        },
        {
            "keywords": ["insight", "motives"],
            "check_type": "skill",
            "skill": "insight",
            "ability": "wisdom",
            "suggested_dc": 15,
            "notes": "Insight (Wisdom).",
        },
        {
            "keywords": [
                "convince",
                "convinces",
                "negotiate",
                "negotiates",
                "persuade",
                "persuades",
                "diplomacy",
                "bargain",
                "bargains",
                "ask nicely",
                "sweet-talk",
                "sweet talk",
            ],
            "check_type": "skill",
            "skill": "persuasion",
            "ability": "charisma",
            "suggested_dc": 15,
            "notes": "Honest influence. Hostile NPCs are often Hard; indifferent Medium; friendly Easy.",
        },
        {
            "keywords": ["seduce", "seduces", "flirt", "flirts", "woo", "woos", "charm socially"],
            "check_type": "skill",
            "skill": "persuasion",
            "ability": "charisma",
            "suggested_dc": 15,
            "notes": "Social Persuasion — not an attack. Against a beast, use Animal Handling.",
        },
        {
            "keywords": ["lie", "lies", "bluff", "bluffs", "disguise", "deceive", "deceives", "pretend"],
            "check_type": "skill",
            "skill": "deception",
            "ability": "charisma",
            "suggested_dc": 15,
            "notes": "Often contested by Insight.",
        },
        {
            "keywords": ["threaten", "threatens", "scare", "scares", "intimidate", "intimidates", "cow", "cows"],
            "check_type": "skill",
            "skill": "intimidation",
            "ability": "charisma",
            "suggested_dc": 15,
            "notes": "May sour future social scenes. Contested by Insight or a contested social check.",
        },
        {
            "keywords": [
                "calm animal",
                "calm the",
                "pet",
                "pets",
                "petting",
                "befriend beast",
                "soothe",
                "soothes",
                "animal handling",
                "gentle the",
            ],
            "check_type": "skill",
            "skill": "animal_handling",
            "ability": "wisdom",
            "suggested_dc": 15,
            "notes": "Calm/handle a beast or mount (not Persuasion).",
        },
        {
            "keywords": ["identify magic", "arcane lore", "arcana check", "magic lore"],
            "check_type": "skill",
            "skill": "arcana",
            "ability": "intelligence",
            "suggested_dc": 15,
            "notes": "Arcana for spells, magic items, planar lore.",
        },
        {
            "keywords": ["arcane", "arcana"],
            "check_type": "skill",
            "skill": "arcana",
            "ability": "intelligence",
            "suggested_dc": 15,
            "notes": "Arcana (Intelligence).",
        },
        {
            "keywords": ["history check", "recall history", "historical lore", "who was"],
            "check_type": "skill",
            "skill": "history",
            "ability": "intelligence",
            "suggested_dc": 15,
            "notes": "History (Intelligence).",
        },
        {
            "keywords": ["nature check", "nature lore", "plant lore", "beast lore"],
            "check_type": "skill",
            "skill": "nature",
            "ability": "intelligence",
            "suggested_dc": 15,
            "notes": "Nature (Intelligence).",
        },
        {
            "keywords": ["religion check", "holy lore", "deity", "rite", "religious"],
            "check_type": "skill",
            "skill": "religion",
            "ability": "intelligence",
            "suggested_dc": 15,
            "notes": "Religion (Intelligence).",
        },
        {
            "keywords": ["stabilize", "first aid", "tend wounds", "medicine check", "diagnose"],
            "check_type": "skill",
            "skill": "medicine",
            "ability": "wisdom",
            "suggested_dc": 10,
            "notes": "Stabilize is often Easy (DC 10) with a healer's kit; diagnosis can be harder.",
        },
        {
            "keywords": ["perform", "performs", "entertain", "sing", "sings", "dance", "dances"],
            "check_type": "skill",
            "skill": "performance",
            "ability": "charisma",
            "suggested_dc": 15,
            "notes": "Performance to entertain or distract.",
        },
        {
            "keywords": ["concentration", "con save", "poison save", "hold breath", "disease save"],
            "check_type": "save",
            "ability": "constitution",
            "suggested_dc": 15,
            "notes": "Constitution saving throw (concentration DC is often 10 or half damage).",
        },
        {
            "keywords": ["dex save", "dodge blast", "leap aside", "fireball", "trap springs"],
            "check_type": "save",
            "ability": "dexterity",
            "suggested_dc": 15,
            "notes": "Dexterity saving throw.",
        },
        {
            "keywords": ["wis save", "fear save", "charm save", "frightened", "mental domination"],
            "check_type": "save",
            "ability": "wisdom",
            "suggested_dc": 15,
            "notes": "Wisdom saving throw.",
        },
        {
            "keywords": ["str save", "strength save"],
            "check_type": "save",
            "ability": "strength",
            "suggested_dc": 15,
            "notes": "Strength saving throw.",
        },
        {
            "keywords": ["int save", "intelligence save"],
            "check_type": "save",
            "ability": "intelligence",
            "suggested_dc": 15,
            "notes": "Intelligence saving throw.",
        },
        {
            "keywords": ["cha save", "charisma save"],
            "check_type": "save",
            "ability": "charisma",
            "suggested_dc": 15,
            "notes": "Charisma saving throw.",
        },
        {
            "keywords": ["initiative", "who goes first", "roll init"],
            "check_type": "initiative",
            "ability": "dexterity",
            "suggested_dc": None,
            "notes": "d20 + Dexterity modifier (+ initiative bonuses). No DC.",
        },
        {
            "keywords": [
                "attack",
                "attacks",
                "swing",
                "swings",
                "shoot",
                "shoots",
                "strike",
                "strikes",
                "stab",
                "stabs",
                "slash",
                "slashes",
                "bash",
                "bashes",
                "smite",
                "smites",
                "fire at",
                "shoot at",
                "hit them",
                "hits them",
                "melee",
                "ranged",
            ],
            "check_type": "attack",
            "ability": None,
            "suggested_dc": None,
            "notes": "Attack roll vs Armor Class (not a DC). Roll damage on a hit. Naming a creature alone is not an attack.",
        },
    ]

    RULESET.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("updated", RULESET, "guidance", len(data["check_guidance"]))


if __name__ == "__main__":
    main()
