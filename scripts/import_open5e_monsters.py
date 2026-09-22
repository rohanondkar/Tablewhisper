"""Import WOTC SRD 5.1 monsters from Open5e into packages/monsters-srd.

Does not scrape D&D Beyond (copyrighted). Run from repo root:

  apps/api/.venv/Scripts/python.exe scripts/import_open5e_monsters.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "packages" / "monsters-srd" / "monsters.json"
IMG_DIR = ROOT / "packages" / "monsters-srd" / "images"

TYPE_COLORS = {
    "aberration": ("#4a2a5a", "#c084fc"),
    "beast": ("#3a4a2a", "#86efac"),
    "celestial": ("#3a3a5a", "#fde68a"),
    "construct": ("#3a3a3a", "#94a3b8"),
    "dragon": ("#5a2a2a", "#f87171"),
    "elemental": ("#2a3a5a", "#38bdf8"),
    "fey": ("#3a4a4a", "#6ee7b7"),
    "fiend": ("#4a1a1a", "#fb7185"),
    "giant": ("#4a3a5a", "#c4b5fd"),
    "humanoid": ("#3a3026", "#d4a24a"),
    "monstrosity": ("#2a3a2a", "#4ade80"),
    "ooze": ("#2a4a3a", "#34d399"),
    "plant": ("#1a3a1a", "#86efac"),
    "undead": ("#2a2a3a", "#cbd5e1"),
}


def parse_attack(action: dict) -> dict | None:
    name = action.get("name") or "Attack"
    bonus = action.get("attack_bonus")
    dice = (action.get("damage_dice") or "").replace(" ", "")
    dmg_bonus = action.get("damage_bonus")
    desc = action.get("desc") or ""

    if bonus is None:
        m = re.search(r"(?:Melee|Ranged).*?Attack:\s*([+-]?\d+)\s*to hit", desc, re.I)
        if m:
            bonus = int(m.group(1))

    if not dice:
        m = re.search(r"Hit:\s*\d+\s*\(([^)]+)\)", desc)
        if m:
            dice = m.group(1).replace(" ", "")

    if dice and dmg_bonus is not None and "+" not in dice and "-" not in dice[1:]:
        sign = "+" if int(dmg_bonus) >= 0 else ""
        dice = f"{dice}{sign}{int(dmg_bonus)}"

    dtype = ""
    m = re.search(r"\)\s*(\w+)\s*damage", desc)
    if m:
        dtype = m.group(1)

    if bonus is None and not dice:
        return None
    return {
        "name": name,
        "attack_bonus": int(bonus) if bonus is not None else 0,
        "damage": dice or "1d4",
        "damage_type": dtype,
    }


def make_svg(slug: str, name: str, mtype: str) -> None:
    bg, accent = TYPE_COLORS.get((mtype or "humanoid").lower(), ("#3a3026", "#d4a24a"))
    glyph = "".join(w[0] for w in re.split(r"[\s\-]+", name) if w)[:3].upper() or "?"
    safe = name[:28].replace("&", "&amp;").replace("<", "&lt;")
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{bg}"/>
      <stop offset="100%" stop-color="#0f1115"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#g)"/>
  <circle cx="128" cy="108" r="54" fill="{accent}" opacity="0.9"/>
  <ellipse cx="128" cy="210" rx="70" ry="40" fill="{accent}" opacity="0.55"/>
  <text x="128" y="118" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="26" font-weight="700" fill="#0f1115">{glyph}</text>
  <text x="128" y="248" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="12" fill="#f3e6d4" opacity="0.9">{safe}</text>
</svg>"""
    (IMG_DIR / f"{slug}.svg").write_text(svg, encoding="utf-8")


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    base = "https://api.open5e.com/v1/monsters/"
    params = {"document__slug": "wotc-srd", "limit": 100}
    monsters: list[dict] = []
    url: str | None = base

    with httpx.Client(timeout=60.0) as client:
        while url:
            res = client.get(url, params=params if url == base else None)
            res.raise_for_status()
            data = res.json()
            for r in data.get("results", []):
                slug = r["slug"]
                attacks = [a for a in (parse_attack(x) for x in (r.get("actions") or [])) if a]
                if not attacks:
                    attacks = [
                        {
                            "name": "Strike",
                            "attack_bonus": 3,
                            "damage": "1d6+1",
                            "damage_type": "bludgeoning",
                        }
                    ]
                name = r["name"]
                aliases = []
                if not name.lower().endswith("s"):
                    aliases.append(name.lower() + "s")
                notes = ""
                if r.get("special_abilities"):
                    notes = "; ".join(sa["name"] for sa in r["special_abilities"][:4])
                else:
                    notes = r.get("alignment") or ""
                speed = r.get("speed") or {}
                if isinstance(speed, dict):
                    speed_s = ", ".join(
                        f"{k} {v} ft." for k, v in speed.items() if isinstance(v, (int, float))
                    )
                else:
                    speed_s = str(speed)
                mtype = (r.get("type") or "").lower()
                monsters.append(
                    {
                        "id": slug,
                        "name": name,
                        "aliases": aliases,
                        "size": r.get("size") or "",
                        "type": mtype,
                        "ac": int(r.get("armor_class") or 10),
                        "hp": int(r.get("hit_points") or 10),
                        "hit_dice": r.get("hit_dice") or "",
                        "speed": speed_s,
                        "cr": str(r.get("challenge_rating") or r.get("cr") or ""),
                        "attacks": attacks[:4],
                        "notes": notes,
                        "image": f"{slug}.svg",
                        "source": "SRD 5.1 (Open5e)",
                    }
                )
                make_svg(slug, name, mtype)
            url = data.get("next")

    monsters.sort(key=lambda x: x["name"].lower())
    pack = {
        "id": "monsters-srd",
        "name": "D&D 5e SRD Monsters",
        "version": "2.0.0",
        "description": (
            "All WOTC SRD 5.1 monsters via Open5e. "
            "Not the full D&D Beyond catalog (copyrighted)."
        ),
        "monsters": monsters,
    }
    OUT_JSON.write_text(json.dumps(pack, indent=2), encoding="utf-8")
    print(f"Wrote {len(monsters)} monsters to {OUT_JSON}")


if __name__ == "__main__":
    main()
