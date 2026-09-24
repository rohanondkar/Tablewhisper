"""Copy one short Sonniss GDC mp3 for each map attack sound."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

META = Path.home() / "AppData" / "Local" / "Temp" / "sonniss-meta.json"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps" / "desktop" / "public" / "audio" / "sfx"
BASE = "https://archive.org/download/gameaudiogdc-part1through7/"

# Filename needles from the Sonniss GDC bundle on Archive.org.
PAIRS = [
    ("slash.mp3", "Knife_Sword_Shing_Fienup_001.mp3"),
    ("blunt.mp3", "Hammer_Multiple_Exterior_Fienup_013.mp3"),
    ("stab.mp3", "gore - metal knife swing - 4.mp3"),
    ("reach.mp3", "Whoosh_Swing_Fishing Pole_Full_Fienup_CLASSIC_001.mp3"),
    ("bow.mp3", "Hawk's Arrow Flies Bow and Arrow shoot 2.mp3"),
    ("crossbow.mp3", "firing,loose,crossbow1,carbonbolt"),
    ("sling.mp3", "Ice,Impact,Throw,Snowball"),
    ("blowgun.mp3", "Seq 2.1 whoosh #1 96 HK1.mp3"),
    ("thrown.mp3", "Action Swish_HW 02.mp3"),
    ("net.mp3", "Swoosh_Rope_Whip_075.mp3"),
    ("bite.mp3", "Celery,Bite,Crunch,Slow,Bone"),
    ("claw.mp3", "Slice_Crunchy_Fienup_002.mp3"),
    ("tail.mp3", "Fast Action Swish_HW 05.mp3"),
    ("slam.mp3", "EFX EXT Metal Impact Smash Move 07 B.M.mp3"),
    ("gore.mp3", "Punch_Spurt Blood_Fienup_001.mp3"),
    ("sting.mp3", "gore - metal knife swing - 17.mp3"),
    ("tentacle.mp3", "Jelly,Movement,Gore,Liquid,Splat"),
    ("constrict.mp3", "Borax,Impact,Slime,Gore,Various05.mp3"),
    ("web.mp3", "The Web Slinger Shoots 4.mp3"),
    ("swallow.mp3", "Borax,Impact,Slime,Gore,Various16.mp3"),
    ("unarmed.mp3", "EFX SD GORE Punch 02 B.M.mp3"),
    ("fire.mp3", "Fire_Spell_Dragon_Trap_03.mp3"),
    ("cold.mp3", "IceBlocks,impact,cracked"),
    ("lightning.mp3", "zappy_3b.mp3"),
    ("thunder.mp3", "Thunder_Rumble_Mid_Fienup_024.mp3"),
    ("acid.mp3", "CHEMICAL ACID Sizzle, Burn, Short 02.mp3"),
    ("poison.mp3", "Borax,Impact,Slime,Gore,Various22.mp3"),
    ("radiant.mp3", "Chime Accent,Tinkle,Fast"),
    ("necrotic.mp3", "Dark_Spell_Life_Tap_03.mp3"),
    ("force.mp3", "Heavy Magical Explosion_SI 03.mp3"),
    ("psychic.mp3", "Arcane_Spell_Doppler_Shift_03.mp3"),
    ("heal.mp3", "Chime Accent,Tinkle,Fast"),
    ("charm.mp3", "MAGIC AIR Large Whoosh"),
    ("illusion.mp3", "Action Swirl Whoosh_HW 04.mp3"),
    ("ward.mp3", "The Captain's Shield Metal Hit 5.mp3"),
    ("movement.mp3", "HKAP2 Spin Whoosh 2a.mp3"),
    ("conjure.mp3", "MAGIC AIR Large Whoosh"),
    ("light.mp3", "Bell_Waiter_Fienup_001.mp3"),
    ("other.mp3", "EFX SD Sliding Whoosh By 06.mp3"),
    ("dash.mp3", "HKAP2 Seq2.13 Whoosh 5.mp3"),
    ("dodge.mp3", "Seq 2.27 whoosh #1 96 HK1.mp3"),
    ("hide.mp3", "shake_clothing_001.mp3"),
    ("search.mp3", "HKAP2 Whoosh land 1a.mp3"),
    ("help.mp3", "Whoosh_Cloth_Leather_Fight_174.mp3"),
    ("grapple.mp3", "Whoosh_Cloth_Leather_Fight_174.mp3"),
    ("shove.mp3", "EFX EXT Metal Impact Drop 01 A.mp3"),
    ("social.mp3", "Bell_Waiter_Fienup_001.mp3"),
    ("divination.mp3", "Arcane_Spell_Doppler_Shift_03.mp3"),
    ("transform.mp3", "Swirl Whoosh_HW 42.mp3"),
]


def main() -> None:
    files = json.loads(META.read_text(encoding="utf-8", errors="replace"))["files"]
    names = [item["name"] for item in files if str(item.get("name", "")).lower().endswith(".mp3")]
    OUT.mkdir(parents=True, exist_ok=True)
    for dest, needle in PAIRS:
        hits = [name for name in names if needle.lower() in name.lower()]
        if not hits:
            raise SystemExit(f"missing {dest}: {needle}")
        source = sorted(hits, key=len)[0]
        target = OUT / dest
        url = BASE + urllib.parse.quote(source)
        print(f"get {dest}")
        urllib.request.urlretrieve(url, target)
        if target.stat().st_size < 1000:
            raise SystemExit(f"too small {dest}")
    print(f"saved {len(PAIRS)} clips")


if __name__ == "__main__":
    main()
