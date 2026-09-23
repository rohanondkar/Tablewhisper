"""Paint one circular token per SRD monster.

Dragons keep the colored portraits, with age changing scale and facing.
Ankheg, kraken, owlbear, manticore, and the mimic chest keep their pictures.
Every other creature gets its own bust inside the same gold ring.
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "packages" / "token-portraits"
OUT = PACK / "monsters"
MONSTERS = ROOT / "packages" / "monsters-srd" / "monsters.json"
S = 512
CX = CY = 256

DRAGON_COLOR = (
    "black|blue|green|red|white|brass|bronze|copper|gold|silver"
)
ADULT_AGE = re.compile(rf"^(adult|ancient|young)-({DRAGON_COLOR})-dragon$")
WYRMLING = re.compile(rf"^({DRAGON_COLOR})-dragon-wyrmling$")

PHOTO = {
    "ankheg": "token-ankheg.png",
    "kraken": "token-kraken.png",
    "owlbear": "token-owlbear.png",
    "manticore": "token-monstrosity.png",
    "mimic": "token-chest.png",
}


def hsv(h: float, s: float, v: float) -> tuple[int, int, int, int]:
    import colorsys

    r, g, b = colorsys.hsv_to_rgb(h % 1, max(0, min(1, s)), max(0, min(1, v)))
    return (int(r * 255), int(g * 255), int(b * 255), 255)


def scale(color: tuple[int, int, int, int], k: float) -> tuple[int, int, int, int]:
    return tuple(max(0, min(255, int(c * k))) for c in color[:3]) + (color[3],)


def rng_for(mid: str) -> random.Random:
    return random.Random(mid)


def hit(mid: str, needle: str) -> bool:
    pad = f"-{mid}-"
    return f"-{needle}-" in pad


def paint_bg(im: Image.Image, color: tuple[int, int, int, int]) -> None:
    d = ImageDraw.Draw(im)
    for i in range(56):
        rad = 250 - i * 4
        if rad < 8:
            break
        k = 0.22 + (i / 56) * 0.85
        d.ellipse((CX - rad, CY - rad, CX + rad, CY + rad), fill=scale(color, k))


def gold_ring(im: Image.Image) -> None:
    d = ImageDraw.Draw(im)
    d.ellipse((8, 8, S - 8, S - 8), outline=(74, 54, 24, 255), width=10)
    d.ellipse((18, 18, S - 18, S - 18), outline=(214, 170, 78, 255), width=14)
    d.ellipse((34, 34, S - 34, S - 34), outline=(120, 88, 40, 255), width=6)


def ellipse(d: ImageDraw.ImageDraw, box, fill, outline=(18, 14, 12, 255), width=4):
    x0, y0, x1, y1 = box
    d.ellipse((x0 - width, y0 - width, x1 + width, y1 + width), fill=outline)
    d.ellipse(box, fill=fill)


def mask_paste(im: Image.Image, layer: Image.Image, box) -> None:
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
    im.alpha_composite(layer)


def eyes(d, x, y, gap, r, color):
    for cx in (x - gap, x + gap):
        d.ellipse((cx - r, y - r, cx + r, y + r), fill=(16, 12, 10, 255))
        d.ellipse((cx - r + 3, y - r + 3, cx + r - 3, y + r - 3), fill=color)
        d.ellipse((cx - 2, y - 3, cx + 3, y + 2), fill=(12, 10, 8, 255))


def wings(d, pal, rng: random.Random) -> None:
    feather = scale(pal["body"], 0.75)
    span = 70 + rng.randint(0, 30)
    ellipse(d, (40, 150, 40 + span, 340), feather, width=3)
    ellipse(d, (S - 40 - span, 150, S - 40, 340), feather, width=3)


def mammal(im: Image.Image, pal, spec, rng: random.Random) -> None:
    d = ImageDraw.Draw(im)
    if spec.get("wings"):
        wings(d, pal, rng)
    body = pal["body"]
    dark = pal["dark"]
    belly = pal["belly"]
    if spec.get("mane"):
        for i, ang in enumerate(range(-50, 60, 16)):
            ox = int(ang * 1.3)
            ellipse(d, (200 + ox, 70 + (i % 3) * 8, 300 + ox, 200), dark, width=2)
    ears = spec.get("ears", "point")
    if ears == "point":
        d.polygon([(150, 168), (196, 58), (236, 176)], fill=dark)
        d.polygon([(362, 168), (316, 58), (276, 176)], fill=dark)
        d.polygon([(168, 160), (198, 84), (224, 166)], fill=belly)
        d.polygon([(344, 160), (314, 84), (288, 166)], fill=belly)
    elif ears == "round":
        ellipse(d, (150, 78, 230, 176), body, width=3)
        ellipse(d, (282, 78, 362, 176), body, width=3)
        ellipse(d, (168, 100, 214, 156), belly, width=2)
        ellipse(d, (298, 100, 344, 156), belly, width=2)
    elif ears == "long":
        ellipse(d, (150, 40, 214, 190), body, width=3)
        ellipse(d, (298, 40, 362, 190), body, width=3)
    elif ears == "fin":
        d.polygon([(150, 180), (120, 80), (230, 170)], fill=body)
        d.polygon([(362, 180), (392, 80), (282, 170)], fill=body)
    horns = int(spec.get("horns") or 0)
    if horns == 1:
        d.polygon([(236, 150), (256, 36), (276, 150)], fill=pal["horn"])
    elif horns:
        d.polygon([(190, 150), (150, 40), (214, 130)], fill=pal["horn"])
        d.polygon([(322, 150), (362, 40), (298, 130)], fill=pal["horn"])
        if horns > 2:
            d.polygon([(210, 140), (230, 36), (246, 140)], fill=pal["horn"])
    if spec.get("antlers"):
        d.line([(190, 140), (120, 70), (100, 40)], fill=pal["horn"], width=8)
        d.line([(150, 80), (130, 50)], fill=pal["horn"], width=6)
        d.line([(322, 140), (392, 70), (412, 40)], fill=pal["horn"], width=8)
        d.line([(362, 80), (382, 50)], fill=pal["horn"], width=6)
    ellipse(d, (136, 140, 376, 400), body, width=5)
    if spec.get("stripes"):
        layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        for i in range(5):
            x = 160 + i * 36
            ld.polygon([(x, 150), (x + 16, 150), (x - 10, 390), (x - 26, 390)], fill=dark)
        mask_paste(im, layer, (136, 140, 376, 400))
        d = ImageDraw.Draw(im)
    if spec.get("spots"):
        layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        rnd = random.Random(rng.random())
        for _ in range(14):
            x = rnd.randint(160, 340)
            y = rnd.randint(180, 340)
            rad = rnd.randint(8, 16)
            ld.ellipse((x, y, x + rad, y + rad), fill=dark)
        mask_paste(im, layer, (136, 140, 376, 400))
        d = ImageDraw.Draw(im)
    ellipse(d, (188, 168, 280, 250), scale(belly, 1.05), width=0)
    snout = float(spec.get("snout") or 0.9)
    sw = int(70 * snout)
    ellipse(d, (CX - sw, 286, CX + sw, 392), belly, width=3)
    ellipse(d, (CX - 22, 318, CX + 22, 356), dark, width=2)
    eyes(d, CX, 230, 52, 16, pal["eye"])
    if spec.get("fangs") or spec.get("tusks"):
        d.polygon([(228, 360), (240, 400), (252, 358)], fill=(236, 230, 214, 255))
        d.polygon([(284, 360), (272, 400), (260, 358)], fill=(236, 230, 214, 255))
    if spec.get("trunk"):
        ellipse(d, (228, 340, 284, 460), body, width=3)
    if spec.get("fire"):
        d.polygon([(230, 360), (256, 450), (282, 360)], fill=(255, 140, 40, 255))
        d.polygon([(242, 360), (256, 420), (270, 360)], fill=(255, 220, 120, 255))
    if spec.get("extra_head"):
        ellipse(d, (300, 150, 430, 300), body, width=4)
        eyes(d, 360, 210, 22, 8, pal["eye"])
        ellipse(d, (330, 240, 400, 290), belly, width=2)


def bird(im, pal, spec, rng: random.Random) -> None:
    d = ImageDraw.Draw(im)
    if spec.get("wings") or True:
        wings(d, pal, rng)
    body = pal["body"]
    ellipse(d, (150, 150, 390, 400), body, width=4)
    ellipse(d, (250, 120, 400, 280), body, width=4)
    beak = pal.get("beak", (214, 168, 64, 255))
    if spec.get("axe"):
        d.polygon([(360, 180), (470, 210), (360, 250)], fill=beak)
    else:
        d.polygon([(360, 175), (450, 200), (360, 225)], fill=beak)
    d.polygon([(168, 300), (120, 360), (200, 340)], fill=scale(body, 0.8))
    eyes(d, 300, 180, 0, 14, pal["eye"])
    if spec.get("crest"):
        d.polygon([(250, 130), (230, 60), (290, 120)], fill=(180, 40, 40, 255))


def snake(im, pal, spec, rng: random.Random) -> None:
    d = ImageDraw.Draw(im)
    body = pal["body"]
    pts = []
    for i in range(8):
        x = 120 + i * 40
        y = 300 + (18 if i % 2 == 0 else -18)
        pts.append((x, y))
        ellipse(d, (x - 28, y - 22, x + 28, y + 22), body, width=2)
    if spec.get("wings"):
        wings(d, pal, rng)
    ellipse(d, (300, 150, 430, 280), body, width=4)
    eyes(d, 360, 200, 22, 10, pal["eye"])
    d.polygon([(400, 230), (450, 250), (400, 270)], fill=(180, 50, 50, 255))
    if spec.get("hood"):
        d.polygon([(300, 180), (250, 80), (340, 160)], fill=scale(body, 0.8))
        d.polygon([(400, 180), (460, 80), (370, 160)], fill=scale(body, 0.8))


def spider(im, pal, spec, rng: random.Random) -> None:
    d = ImageDraw.Draw(im)
    leg = pal["dark"]
    for side in (-1, 1):
        for i in range(4):
            y = 150 + i * 48
            x0 = CX + side * 40
            x1 = CX + side * (150 + i * 8)
            d.line([(x0, 230), (x1, y)], fill=leg, width=8)
    ellipse(d, (176, 230, 336, 400), pal["body"], width=4)
    ellipse(d, (196, 160, 316, 280), pal["dark"], width=4)
    eyes(d, CX, 210, 28, 8, pal["eye"])
    eyes(d, CX, 196, 12, 5, pal["eye"])
    if spec.get("phase"):
        glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse((150, 140, 362, 420), fill=(150, 80, 255, 70))
        im.alpha_composite(glow)


def scorpion(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    ellipse(d, (150, 200, 360, 360), pal["body"], width=4)
    ellipse(d, (70, 210, 170, 300), pal["dark"], width=3)
    ellipse(d, (342, 210, 442, 300), pal["dark"], width=3)
    d.line([(256, 200), (300, 120), (360, 90), (400, 130)], fill=pal["dark"], width=14)
    ellipse(d, (378, 110, 420, 150), (220, 50, 40, 255), width=2)
    eyes(d, 250, 250, 24, 7, pal["eye"])


def centipede(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    for i in range(7):
        x = 90 + i * 48
        ellipse(d, (x, 200, x + 70, 300), pal["body"], width=3)
        d.line([(x + 20, 210), (x - 10, 150)], fill=pal["dark"], width=5)
        d.line([(x + 20, 290), (x - 10, 360)], fill=pal["dark"], width=5)
    ellipse(d, (360, 180, 450, 280), pal["dark"], width=3)
    eyes(d, 400, 220, 16, 6, pal["eye"])


def beetle(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    if spec.get("fire"):
        d.ellipse((180, 300, 240, 360), fill=(255, 160, 40, 255))
        d.ellipse((270, 300, 330, 360), fill=(255, 160, 40, 255))
    ellipse(d, (140, 160, 372, 400), pal["body"], width=4)
    d.line([(256, 180), (256, 380)], fill=pal["dark"], width=4)
    ellipse(d, (190, 120, 322, 210), pal["dark"], width=3)
    eyes(d, 256, 160, 28, 8, pal["eye"])


def wasp(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    wings(d, pal, rng)
    ellipse(d, (150, 180, 300, 340), pal["body"], width=3)
    ellipse(d, (280, 200, 400, 320), (40, 40, 40, 255), width=3)
    d.polygon([(150, 240), (70, 230), (150, 270)], fill=pal["dark"])
    eyes(d, 200, 230, 18, 10, pal["eye"])


def crab(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    ellipse(d, (150, 180, 362, 380), pal["body"], width=4)
    ellipse(d, (60, 200, 170, 300), pal["dark"], width=3)
    ellipse(d, (342, 200, 452, 300), pal["dark"], width=3)
    eyes(d, 230, 200, 0, 10, pal["eye"])
    eyes(d, 290, 200, 0, 10, pal["eye"])
    for i in range(3):
        y = 240 + i * 28
        d.line([(160, y), (110, y + 20)], fill=pal["dark"], width=6)
        d.line([(352, y), (402, y + 20)], fill=pal["dark"], width=6)


def octopus(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    for i in range(6):
        x = 120 + i * 48
        d.line([(256, 240), (x, 430)], fill=pal["dark"], width=12)
    ellipse(d, (150, 120, 362, 320), pal["body"], width=4)
    eyes(d, 256, 210, 40, 18, pal["eye"])


def fish(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    ellipse(d, (120, 180, 400, 340), pal["body"], width=4)
    d.polygon([(120, 250), (50, 190), (50, 330)], fill=pal["dark"])
    d.polygon([(250, 180), (300, 110), (320, 190)], fill=pal["dark"])
    eyes(d, 330, 240, 0, 14, pal["eye"])
    if spec.get("fangs"):
        d.polygon([(360, 270), (400, 300), (350, 300)], fill=(230, 230, 230, 255))
    if spec.get("horse"):
        d.polygon([(300, 160), (330, 80), (350, 170)], fill=pal["body"])


def frog(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    ellipse(d, (120, 200, 392, 400), pal["body"], width=4)
    ellipse(d, (150, 120, 250, 230), pal["body"], width=3)
    ellipse(d, (262, 120, 362, 230), pal["body"], width=3)
    eyes(d, 200, 165, 0, 16, pal["eye"])
    eyes(d, 312, 165, 0, 16, pal["eye"])
    ellipse(d, (210, 280, 302, 340), pal["belly"], width=2)


def bat(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    d.polygon([(256, 230), (40, 120), (80, 300), (256, 280)], fill=pal["dark"])
    d.polygon([(256, 230), (472, 120), (432, 300), (256, 280)], fill=pal["dark"])
    ellipse(d, (190, 180, 322, 340), pal["body"], width=4)
    ears = [(210, 150), (230, 70), (260, 160)]
    d.polygon(ears, fill=pal["dark"])
    d.polygon([(302, 150), (282, 70), (252, 160)], fill=pal["dark"])
    eyes(d, 256, 230, 28, 10, (255, 40, 40, 255))
    d.polygon([(240, 280), (256, 320), (272, 280)], fill=pal["belly"])


def person(im, pal, spec, rng: random.Random) -> None:
    d = ImageDraw.Draw(im)
    if spec.get("wings"):
        wings(d, pal, rng)
    cloth = pal["cloth"]
    skin = pal["skin"]
    ellipse(d, (150, 300, 362, 470), cloth, width=4)
    if spec.get("spider_legs"):
        for side in (-1, 1):
            for i in range(3):
                d.line(
                    [(CX + side * 30, 360), (CX + side * (120 + i * 16), 300 + i * 40)],
                    fill=pal["dark"],
                    width=7,
                )
    if spec.get("snake_body"):
        ellipse(d, (170, 340, 342, 470), pal["body"], width=3)
    ellipse(d, (176, 130, 336, 310), skin, width=4)
    if spec.get("hood"):
        d.polygon([(176, 200), (256, 70), (336, 200)], fill=pal["dark"])
        ellipse(d, (196, 150, 316, 280), scale(skin, 0.85), width=2)
    if spec.get("helmet"):
        ellipse(d, (176, 110, 336, 230), pal["metal"], width=3)
        d.rectangle((190, 175, 322, 210), fill=(40, 36, 32, 255))
    if spec.get("hair"):
        ellipse(d, (176, 120, 336, 220), pal["hair"], width=2)
    if spec.get("horns"):
        d.polygon([(190, 160), (160, 70), (220, 150)], fill=pal["horn"])
        d.polygon([(322, 160), (352, 70), (292, 150)], fill=pal["horn"])
    if spec.get("ears") == "point":
        d.polygon([(176, 190), (140, 150), (190, 210)], fill=skin)
        d.polygon([(336, 190), (372, 150), (322, 210)], fill=skin)
    if spec.get("ears") == "fin":
        d.polygon([(170, 200), (120, 160), (186, 230)], fill=skin)
        d.polygon([(342, 200), (392, 160), (326, 230)], fill=skin)
    if spec.get("snout"):
        ellipse(d, (214, 220, 298, 300), scale(skin, 0.92), width=2)
    if spec.get("beard"):
        ellipse(d, (210, 240, 302, 320), pal["hair"], width=2)
    if spec.get("snake_hair"):
        for i in range(5):
            x = 180 + i * 28
            d.line([(x, 150), (x + 10, 70)], fill=(40, 140, 50, 255), width=6)
            ellipse(d, (x, 50, x + 22, 78), (40, 140, 50, 255), width=1)
    if not spec.get("helmet"):
        if spec.get("one_eye"):
            eyes(d, CX, 210, 0, 14, pal["eye"])
        elif spec.get("no_eyes"):
            d.arc((200, 190, 240, 230), 20, 160, fill=(40, 30, 30, 255), width=3)
            d.arc((272, 190, 312, 230), 20, 160, fill=(40, 30, 30, 255), width=3)
        else:
            eyes(d, CX, 210, 32, 10, pal["eye"])
    if spec.get("fangs"):
        d.polygon([(236, 260), (244, 286), (252, 258)], fill=(240, 236, 230, 255))
        d.polygon([(276, 260), (268, 286), (260, 258)], fill=(240, 236, 230, 255))
    if spec.get("tusks"):
        d.polygon([(214, 250), (200, 300), (230, 260)], fill=(230, 224, 200, 255))
        d.polygon([(298, 250), (312, 300), (282, 260)], fill=(230, 224, 200, 255))
    weapon = spec.get("weapon")
    if weapon == "sword":
        d.polygon([(360, 120), (378, 120), (370, 300)], fill=pal["metal"])
        d.rectangle((348, 292, 392, 306), fill=(120, 80, 40, 255))
    elif weapon == "axe":
        d.line([(80, 140), (150, 340)], fill=(90, 60, 30, 255), width=8)
        d.polygon([(70, 120), (130, 150), (80, 190)], fill=pal["metal"])
    elif weapon == "staff":
        d.line([(390, 80), (360, 420)], fill=(110, 70, 40, 255), width=8)
        ellipse(d, (368, 60, 412, 104), pal["eye"], width=2)
    elif weapon == "dagger":
        d.polygon([(380, 180), (396, 180), (388, 280)], fill=pal["metal"])
    elif weapon == "bow":
        d.arc((360, 120, 450, 360), 280, 80, fill=(160, 120, 70, 255), width=5)
    elif weapon == "spear":
        d.line([(400, 70), (360, 420)], fill=(120, 80, 40, 255), width=7)
        d.polygon([(392, 70), (408, 70), (400, 120)], fill=pal["metal"])
    elif weapon == "trident":
        d.line([(400, 90), (370, 420)], fill=pal["metal"], width=6)
        d.line([(380, 90), (380, 140)], fill=pal["metal"], width=4)
        d.line([(420, 90), (420, 140)], fill=pal["metal"], width=4)
    if spec.get("shield"):
        ellipse(d, (70, 240, 160, 380), pal["metal"], width=3)
    if spec.get("extra_head"):
        ellipse(d, (300, 120, 430, 270), skin, width=3)
        eyes(d, 360, 180, 18, 7, pal["eye"])
    if spec.get("crown"):
        d.polygon([(190, 150), (210, 100), (236, 140), (256, 90), (276, 140), (302, 100), (322, 150)], fill=(214, 170, 60, 255))
    if spec.get("bandage"):
        for y in (180, 210, 250):
            d.line([(190, y), (322, y + 8)], fill=(220, 210, 190, 255), width=6)


def skull(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    bone = (214, 206, 190, 255)
    ellipse(d, (150, 300, 220, 450), bone, width=3)
    ellipse(d, (292, 300, 362, 450), bone, width=3)
    ellipse(d, (160, 120, 352, 330), bone, width=4)
    d.ellipse((190, 190, 250, 250), fill=(20, 16, 14, 255))
    d.ellipse((262, 190, 322, 250), fill=(20, 16, 14, 255))
    d.polygon([(240, 250), (256, 290), (272, 250)], fill=(20, 16, 14, 255))
    if spec.get("helmet"):
        ellipse(d, (160, 110, 352, 200), pal["metal"], width=3)
    if spec.get("horse"):
        ellipse(d, (150, 300, 362, 430), bone, width=3)


def ghost(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    shade = pal["body"]
    d.polygon([(160, 220), (256, 100), (352, 220), (340, 420), (300, 370), (256, 430), (210, 370), (172, 420)], fill=shade)
    eyes(d, 256, 230, 36, 14, (20, 20, 30, 255))
    d.ellipse((230, 280, 282, 310), fill=(20, 20, 30, 180))


def ooze(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    if spec.get("cube"):
        d.rounded_rectangle((120, 120, 392, 392), radius=18, fill=pal["body"], outline=(20, 40, 20, 255), width=6)
        ellipse(d, (220, 200, 300, 280), (230, 220, 200, 255), width=2)
        d.ellipse((236, 220, 258, 242), fill=(20, 20, 20, 255))
        d.ellipse((264, 220, 286, 242), fill=(20, 20, 20, 255))
    else:
        ellipse(d, (110, 200, 400, 420), pal["body"], width=3)
        ellipse(d, (160, 160, 360, 300), scale(pal["body"], 1.2), width=2)
        eyes(d, 250, 230, 30, 10, (20, 20, 20, 255))


def flame(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    d.polygon([(256, 60), (340, 220), (390, 250), (330, 430), (180, 430), (120, 250), (180, 210)], fill=(180, 40, 10, 255))
    d.polygon([(256, 120), (310, 240), (300, 400), (210, 400), (190, 240)], fill=(255, 120, 20, 255))
    d.polygon([(256, 200), (286, 280), (256, 390), (226, 280)], fill=(255, 220, 80, 255))
    eyes(d, 256, 250, 28, 8, (255, 255, 200, 255))


def wave(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    ellipse(d, (90, 180, 420, 420), pal["body"], width=3)
    ellipse(d, (140, 140, 250, 250), scale(pal["body"], 1.3), width=2)
    ellipse(d, (270, 200, 380, 310), scale(pal["body"], 1.15), width=2)
    eyes(d, 240, 240, 0, 12, (220, 240, 255, 255))


def rock(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    d.polygon([(120, 300), (180, 140), (300, 100), (400, 200), (380, 400), (160, 420)], fill=pal["body"])
    d.polygon([(200, 180), (260, 140), (280, 220), (210, 240)], fill=pal["dark"])
    eyes(d, 270, 240, 30, 10, (255, 180, 40, 255))


def gust(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    for i, rad in enumerate((70, 110, 150)):
        d.arc((CX - rad, CY - rad, CX + rad, CY + rad), 20 + i * 30, 200 + i * 20, fill=pal["body"], width=16)
    eyes(d, 256, 250, 24, 8, (230, 240, 255, 255))


def golem(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((150, 280, 362, 460), radius=12, fill=pal["body"])
    d.rounded_rectangle((170, 110, 342, 300), radius=16, fill=pal["body"], outline=pal["dark"], width=6)
    d.rectangle((200, 190, 240, 220), fill=pal["eye"])
    d.rectangle((272, 190, 312, 220), fill=pal["eye"])
    d.rectangle((220, 250, 292, 268), fill=pal["dark"])


def sword(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    d.polygon([(236, 70), (276, 70), (270, 360), (242, 360)], fill=pal["metal"])
    d.polygon([(256, 40), (290, 80), (222, 80)], fill=pal["metal"])
    d.rectangle((190, 340, 322, 370), fill=(140, 90, 40, 255))
    ellipse(d, (230, 370, 282, 430), (90, 50, 40, 255), width=2)
    eyes(d, 256, 180, 0, 8, (255, 40, 40, 255))


def rug(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((110, 140, 402, 390), radius=12, fill=pal["body"], outline=pal["dark"], width=8)
    for x in range(130, 390, 28):
        d.line([(x, 390), (x, 430)], fill=pal["dark"], width=4)
    eyes(d, 256, 240, 40, 12, pal["eye"])
    d.arc((200, 260, 312, 330), 20, 160, fill=pal["dark"], width=4)


def tree(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    d.polygon([(230, 430), (256, 250), (282, 430)], fill=(90, 60, 30, 255))
    ellipse(d, (120, 80, 392, 300), pal["body"], width=3)
    eyes(d, 256, 190, 36, 10, pal["eye"])
    d.arc((210, 210, 302, 260), 20, 160, fill=(40, 30, 20, 255), width=4)


def fungus(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    d.polygon([(230, 420), (250, 220), (262, 420)], fill=pal["belly"])
    ellipse(d, (130, 120, 382, 280), pal["body"], width=4)
    for x in (180, 230, 280, 330):
        d.ellipse((x, 170, x + 22, 192), fill=pal["dark"])
    if spec.get("eyes"):
        eyes(d, 256, 200, 30, 8, pal["eye"])


def worm(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    ellipse(d, (80, 180, 360, 400), pal["body"], width=4)
    ellipse(d, (280, 150, 460, 340), pal["dark"], width=4)
    d.ellipse((320, 200, 380, 260), fill=(20, 10, 10, 255))
    d.polygon([(300, 250), (340, 300), (360, 250)], fill=(230, 220, 200, 255))
    d.polygon([(360, 250), (400, 300), (420, 250)], fill=(230, 220, 200, 255))
    if spec.get("ice"):
        d.polygon([(120, 200), (180, 120), (200, 210)], fill=(180, 220, 255, 255))


def hydra(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    necks = [(120, 80), (256, 50), (390, 80)]
    for x, y in necks:
        d.line([(256, 360), (x, y + 80)], fill=pal["body"], width=28)
        ellipse(d, (x - 50, y, x + 50, y + 110), pal["body"], width=3)
        eyes(d, x, y + 40, 16, 7, pal["eye"])
        d.polygon([(x + 30, y + 60), (x + 70, y + 70), (x + 30, y + 84)], fill=(160, 40, 40, 255))


def tarrasque(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    ellipse(d, (90, 160, 430, 420), pal["body"], width=5)
    d.polygon([(150, 180), (180, 80), (220, 170)], fill=pal["horn"])
    d.polygon([(300, 170), (340, 70), (360, 180)], fill=pal["horn"])
    d.polygon([(230, 140), (256, 50), (282, 150)], fill=pal["horn"])
    eyes(d, 250, 220, 40, 12, (255, 40, 20, 255))
    d.polygon([(160, 300), (256, 250), (360, 300), (256, 360)], fill=(40, 20, 20, 255))
    for x in (190, 230, 270, 310):
        d.polygon([(x, 300), (x + 12, 340), (x + 24, 300)], fill=(230, 220, 200, 255))


def wisp(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    d.ellipse((150, 150, 362, 362), fill=(255, 220, 120, 255))
    d.ellipse((190, 190, 322, 322), fill=(255, 250, 210, 255))
    eyes(d, 256, 250, 24, 8, (80, 40, 10, 255))


def armor(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    ellipse(d, (160, 280, 352, 460), pal["metal"], width=4)
    ellipse(d, (176, 110, 336, 300), pal["metal"], width=4)
    d.rectangle((200, 180, 312, 230), fill=(12, 12, 16, 255))
    eyes(d, 256, 200, 28, 6, (255, 40, 40, 255))


def mouther(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    ellipse(d, (110, 160, 402, 420), pal["body"], width=4)
    for i in range(6):
        x = 150 + (i % 3) * 80
        y = 200 + (i // 3) * 90
        d.ellipse((x, y, x + 50, y + 36), fill=(40, 10, 10, 255))
        d.polygon([(x + 10, y + 10), (x + 18, y + 28), (x + 26, y + 10)], fill=(230, 220, 200, 255))
    eyes(d, 256, 240, 20, 8, pal["eye"])


def roper(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    d.polygon([(200, 450), (230, 80), (290, 70), (320, 450)], fill=pal["body"])
    d.polygon([(180, 450), (210, 160), (250, 450)], fill=pal["dark"])
    eyes(d, 260, 180, 0, 16, pal["eye"])
    for x in (140, 180, 330, 370):
        d.line([(256, 260), (x, 420)], fill=pal["dark"], width=6)


def rust(im, pal, spec, rng) -> None:
    d = ImageDraw.Draw(im)
    ellipse(d, (140, 180, 372, 390), pal["body"], width=4)
    d.line([(180, 180), (120, 80)], fill=pal["dark"], width=8)
    d.line([(332, 180), (392, 80)], fill=pal["dark"], width=8)
    ellipse(d, (100, 60, 150, 110), pal["horn"], width=2)
    ellipse(d, (370, 60, 420, 110), pal["horn"], width=2)
    eyes(d, 256, 250, 36, 10, pal["eye"])
    d.polygon([(360, 300), (450, 250), (430, 340)], fill=pal["dark"])


DRAW = {
    "mammal": mammal,
    "bird": bird,
    "snake": snake,
    "spider": spider,
    "scorpion": scorpion,
    "centipede": centipede,
    "beetle": beetle,
    "wasp": wasp,
    "crab": crab,
    "octopus": octopus,
    "fish": fish,
    "frog": frog,
    "bat": bat,
    "person": person,
    "skull": skull,
    "ghost": ghost,
    "ooze": ooze,
    "flame": flame,
    "wave": wave,
    "rock": rock,
    "gust": gust,
    "golem": golem,
    "sword": sword,
    "rug": rug,
    "tree": tree,
    "fungus": fungus,
    "worm": worm,
    "hydra": hydra,
    "tarrasque": tarrasque,
    "wisp": wisp,
    "armor": armor,
    "mouther": mouther,
    "roper": roper,
    "rust": rust,
}


def palette(spec, mid: str) -> dict:
    rng = rng_for(mid + "-pal")
    hue = (spec.get("hue", rng.random()) + rng.uniform(-0.02, 0.02)) % 1
    sat = spec.get("sat", 0.45)
    val = spec.get("val", 0.48)
    skin_h = spec.get("skin", 0.07)
    return {
        "body": hsv(hue, sat, val),
        "dark": hsv(hue, min(1, sat + 0.1), val * 0.55),
        "belly": hsv(hue, sat * 0.35, min(1, val * 1.35)),
        "eye": hsv(spec.get("eye", rng.choice([0.0, 0.12, 0.33, 0.55])), 0.7, 0.95),
        "horn": hsv(0.1, 0.35, 0.75),
        "skin": hsv(skin_h, spec.get("skin_sat", 0.35), spec.get("skin_val", 0.72)),
        "cloth": hsv(spec.get("cloth", rng.random()), 0.45, 0.38),
        "metal": hsv(spec.get("metal_h", 0.08), 0.15, spec.get("metal_v", 0.7)),
        "hair": hsv(spec.get("hair_h", 0.08), 0.4, spec.get("hair_v", 0.25)),
        "bg": hsv(hue, min(0.45, sat), 0.16),
    }


# Longest needle wins because every match is applied shortest-first.
RULES: list[tuple[str, dict]] = [
    ("wolf", {"shape": "mammal", "ears": "point", "hue": 0.08, "sat": 0.08, "val": 0.45, "fangs": True}),
    ("dire-wolf", {"shape": "mammal", "ears": "point", "hue": 0.07, "sat": 0.12, "val": 0.28, "fangs": True}),
    ("winter-wolf", {"shape": "mammal", "ears": "point", "hue": 0.58, "sat": 0.08, "val": 0.9, "fangs": True, "eye": 0.55}),
    ("worg", {"shape": "mammal", "ears": "point", "hue": 0.07, "sat": 0.2, "val": 0.22, "fangs": True, "eye": 0.12}),
    ("hell-hound", {"shape": "mammal", "ears": "point", "hue": 0.02, "sat": 0.15, "val": 0.18, "fangs": True, "fire": True}),
    ("death-dog", {"shape": "mammal", "ears": "point", "hue": 0.08, "sat": 0.1, "val": 0.3, "fangs": True, "extra_head": True}),
    ("blink-dog", {"shape": "mammal", "ears": "point", "hue": 0.58, "sat": 0.45, "val": 0.7, "fangs": True}),
    ("mastiff", {"shape": "mammal", "ears": "long", "hue": 0.08, "sat": 0.35, "val": 0.4}),
    ("jackal", {"shape": "mammal", "ears": "point", "hue": 0.09, "sat": 0.4, "val": 0.55}),
    ("hyena", {"shape": "mammal", "ears": "round", "hue": 0.09, "sat": 0.35, "val": 0.5, "spots": True}),
    ("lion", {"shape": "mammal", "ears": "round", "hue": 0.09, "sat": 0.45, "val": 0.55, "mane": True}),
    ("panther", {"shape": "mammal", "ears": "point", "hue": 0.0, "sat": 0.0, "val": 0.12, "eye": 0.12}),
    ("tiger", {"shape": "mammal", "ears": "point", "hue": 0.07, "sat": 0.55, "val": 0.7, "stripes": True}),
    ("saber-toothed-tiger", {"shape": "mammal", "ears": "point", "hue": 0.08, "sat": 0.35, "val": 0.6, "fangs": True, "stripes": True}),
    ("cat", {"shape": "mammal", "ears": "point", "hue": 0.08, "sat": 0.3, "val": 0.55}),
    ("bear", {"shape": "mammal", "ears": "round", "hue": 0.07, "sat": 0.4, "val": 0.28, "snout": 0.7}),
    ("black-bear", {"shape": "mammal", "ears": "round", "hue": 0.02, "sat": 0.1, "val": 0.16}),
    ("brown-bear", {"shape": "mammal", "ears": "round", "hue": 0.07, "sat": 0.5, "val": 0.35}),
    ("polar-bear", {"shape": "mammal", "ears": "round", "hue": 0.58, "sat": 0.05, "val": 0.92}),
    ("rat", {"shape": "mammal", "ears": "round", "hue": 0.07, "sat": 0.15, "val": 0.45, "snout": 1.1, "fangs": True}),
    ("badger", {"shape": "mammal", "ears": "round", "hue": 0.08, "sat": 0.1, "val": 0.35, "stripes": True}),
    ("weasel", {"shape": "mammal", "ears": "round", "hue": 0.07, "sat": 0.25, "val": 0.5, "snout": 1.2}),
    ("boar", {"shape": "mammal", "ears": "point", "hue": 0.07, "sat": 0.35, "val": 0.32, "tusks": True}),
    ("deer", {"shape": "mammal", "ears": "point", "hue": 0.07, "sat": 0.4, "val": 0.45, "antlers": True}),
    ("elk", {"shape": "mammal", "ears": "point", "hue": 0.08, "sat": 0.35, "val": 0.4, "antlers": True}),
    ("goat", {"shape": "mammal", "ears": "point", "hue": 0.08, "sat": 0.15, "val": 0.7, "horns": 2}),
    ("camel", {"shape": "mammal", "ears": "point", "hue": 0.09, "sat": 0.4, "val": 0.6, "snout": 1.3}),
    ("horse", {"shape": "mammal", "ears": "point", "hue": 0.07, "sat": 0.4, "val": 0.4, "mane": True}),
    ("pony", {"shape": "mammal", "ears": "point", "hue": 0.08, "sat": 0.3, "val": 0.5, "mane": True}),
    ("mule", {"shape": "mammal", "ears": "long", "hue": 0.07, "sat": 0.25, "val": 0.4}),
    ("warhorse", {"shape": "mammal", "ears": "point", "hue": 0.02, "sat": 0.2, "val": 0.25, "mane": True}),
    ("nightmare", {"shape": "mammal", "ears": "point", "hue": 0.0, "sat": 0.1, "val": 0.12, "mane": True, "fire": True}),
    ("pegasus", {"shape": "mammal", "ears": "point", "hue": 0.0, "sat": 0.0, "val": 0.92, "wings": True, "mane": True}),
    ("unicorn", {"shape": "mammal", "ears": "point", "hue": 0.0, "sat": 0.0, "val": 0.95, "horns": 1, "mane": True}),
    ("rhinoceros", {"shape": "mammal", "ears": "round", "hue": 0.08, "sat": 0.15, "val": 0.45, "horns": 2}),
    ("elephant", {"shape": "mammal", "ears": "long", "hue": 0.07, "sat": 0.1, "val": 0.55, "trunk": True, "tusks": True}),
    ("mammoth", {"shape": "mammal", "ears": "round", "hue": 0.07, "sat": 0.35, "val": 0.35, "trunk": True, "tusks": True, "mane": True}),
    ("triceratops", {"shape": "mammal", "ears": "none", "hue": 0.25, "sat": 0.4, "val": 0.4, "horns": 3}),
    ("ape", {"shape": "mammal", "ears": "round", "hue": 0.07, "sat": 0.3, "val": 0.3}),
    ("baboon", {"shape": "mammal", "ears": "round", "hue": 0.07, "sat": 0.3, "val": 0.4, "snout": 1.3, "fangs": True}),
    ("eagle", {"shape": "bird", "hue": 0.07, "sat": 0.4, "val": 0.35, "wings": True}),
    ("hawk", {"shape": "bird", "hue": 0.06, "sat": 0.45, "val": 0.4, "wings": True}),
    ("blood-hawk", {"shape": "bird", "hue": 0.0, "sat": 0.55, "val": 0.4, "wings": True}),
    ("owl", {"shape": "bird", "hue": 0.08, "sat": 0.15, "val": 0.4, "wings": True}),
    ("raven", {"shape": "bird", "hue": 0.0, "sat": 0.0, "val": 0.12, "wings": True}),
    ("vulture", {"shape": "bird", "hue": 0.07, "sat": 0.15, "val": 0.35, "wings": True}),
    ("axe-beak", {"shape": "bird", "hue": 0.08, "sat": 0.3, "val": 0.45, "axe": True, "wings": True}),
    ("roc", {"shape": "bird", "hue": 0.07, "sat": 0.25, "val": 0.3, "wings": True}),
    ("cockatrice", {"shape": "bird", "hue": 0.1, "sat": 0.4, "val": 0.6, "crest": True, "wings": True}),
    ("bat", {"shape": "bat", "hue": 0.07, "sat": 0.15, "val": 0.25}),
    ("stirge", {"shape": "bat", "hue": 0.0, "sat": 0.5, "val": 0.35}),
    ("snake", {"shape": "snake", "hue": 0.3, "sat": 0.45, "val": 0.4}),
    ("flying-snake", {"shape": "snake", "hue": 0.3, "sat": 0.5, "val": 0.45, "wings": True}),
    ("lizard", {"shape": "mammal", "ears": "none", "hue": 0.28, "sat": 0.45, "val": 0.4, "snout": 1.2}),
    ("crocodile", {"shape": "mammal", "ears": "none", "hue": 0.28, "sat": 0.35, "val": 0.32, "snout": 1.4, "fangs": True}),
    ("frog", {"shape": "frog", "hue": 0.3, "sat": 0.5, "val": 0.45}),
    ("toad", {"shape": "frog", "hue": 0.2, "sat": 0.35, "val": 0.35, "spots": True}),
    ("spider", {"shape": "spider", "hue": 0.02, "sat": 0.15, "val": 0.18}),
    ("phase-spider", {"shape": "spider", "hue": 0.75, "sat": 0.4, "val": 0.35, "phase": True}),
    ("wolf-spider", {"shape": "spider", "hue": 0.07, "sat": 0.25, "val": 0.3}),
    ("scorpion", {"shape": "scorpion", "hue": 0.07, "sat": 0.4, "val": 0.3}),
    ("centipede", {"shape": "centipede", "hue": 0.0, "sat": 0.45, "val": 0.4}),
    ("beetle", {"shape": "beetle", "hue": 0.02, "sat": 0.2, "val": 0.2}),
    ("fire-beetle", {"shape": "beetle", "hue": 0.02, "sat": 0.2, "val": 0.2, "fire": True}),
    ("wasp", {"shape": "wasp", "hue": 0.12, "sat": 0.7, "val": 0.7}),
    ("crab", {"shape": "crab", "hue": 0.02, "sat": 0.55, "val": 0.45}),
    ("octopus", {"shape": "octopus", "hue": 0.78, "sat": 0.4, "val": 0.4}),
    ("shark", {"shape": "fish", "hue": 0.58, "sat": 0.15, "val": 0.45, "fangs": True}),
    ("quipper", {"shape": "fish", "hue": 0.55, "sat": 0.4, "val": 0.4, "fangs": True}),
    ("whale", {"shape": "fish", "hue": 0.58, "sat": 0.2, "val": 0.35}),
    ("sea-horse", {"shape": "fish", "hue": 0.1, "sat": 0.5, "val": 0.6, "horse": True}),
    ("plesiosaurus", {"shape": "snake", "hue": 0.55, "sat": 0.3, "val": 0.4}),
    ("tyrannosaurus", {"shape": "mammal", "ears": "none", "hue": 0.02, "sat": 0.4, "val": 0.32, "snout": 1.3, "fangs": True}),
    ("swarm-of-bats", {"shape": "bat"}),
    ("swarm-of-rats", {"shape": "mammal", "ears": "round", "fangs": True}),
    ("swarm-of-ravens", {"shape": "bird"}),
    ("swarm-of-spiders", {"shape": "spider"}),
    ("swarm-of-insects", {"shape": "beetle"}),
    ("swarm-of-beetles", {"shape": "beetle"}),
    ("swarm-of-centipedes", {"shape": "centipede"}),
    ("swarm-of-wasps", {"shape": "wasp"}),
    ("swarm-of-quippers", {"shape": "fish", "fangs": True}),
    ("swarm-of-poisonous-snakes", {"shape": "snake"}),
    ("acolyte", {"shape": "person", "weapon": "staff", "cloth": 0.0, "hood": False}),
    ("archmage", {"shape": "person", "weapon": "staff", "cloth": 0.75, "crown": True, "hair": True}),
    ("assassin", {"shape": "person", "weapon": "dagger", "hood": True, "cloth": 0.0, "val": 0.15}),
    ("bandit-captain", {"shape": "person", "weapon": "sword", "hood": False, "cloth": 0.02, "hair": True}),
    ("bandit", {"shape": "person", "weapon": "dagger", "hood": True, "cloth": 0.05}),
    ("berserker", {"shape": "person", "weapon": "axe", "cloth": 0.02, "hair": True}),
    ("bugbear", {"shape": "person", "ears": "point", "weapon": "axe", "skin": 0.08, "skin_val": 0.4, "hair": True, "fangs": True}),
    ("commoner", {"shape": "person", "cloth": 0.08, "hair": True}),
    ("cult-fanatic", {"shape": "person", "hood": True, "weapon": "dagger", "cloth": 0.0}),
    ("cultist", {"shape": "person", "hood": True, "weapon": "dagger", "cloth": 0.98}),
    ("deep-gnome-svirfneblin", {"shape": "person", "beard": True, "skin": 0.08, "skin_sat": 0.1, "skin_val": 0.6, "weapon": "spear"}),
    ("drow", {"shape": "person", "skin": 0.75, "skin_sat": 0.2, "skin_val": 0.35, "hair": True, "hair_h": 0.0, "hair_v": 0.95, "weapon": "sword", "ears": "point"}),
    ("druid", {"shape": "person", "weapon": "staff", "cloth": 0.3, "hair": True}),
    ("duergar", {"shape": "person", "beard": True, "helmet": True, "skin": 0.0, "skin_sat": 0.05, "skin_val": 0.55, "weapon": "axe"}),
    ("gladiator", {"shape": "person", "helmet": True, "weapon": "sword", "shield": True}),
    ("gnoll", {"shape": "person", "ears": "point", "snout": True, "fangs": True, "weapon": "spear", "skin": 0.08, "skin_val": 0.55}),
    ("goblin", {"shape": "person", "ears": "point", "skin": 0.3, "skin_sat": 0.45, "skin_val": 0.45, "weapon": "dagger", "fangs": True}),
    ("grimlock", {"shape": "person", "no_eyes": True, "skin": 0.08, "skin_sat": 0.1, "skin_val": 0.7, "weapon": "axe"}),
    ("guard", {"shape": "person", "helmet": True, "weapon": "spear", "shield": True, "cloth": 0.58}),
    ("half-red-dragon-veteran", {"shape": "person", "horns": 2, "helmet": True, "weapon": "sword", "skin": 0.0, "skin_sat": 0.55, "skin_val": 0.5, "fangs": True}),
    ("hobgoblin", {"shape": "person", "skin": 0.05, "skin_sat": 0.55, "skin_val": 0.55, "helmet": True, "weapon": "sword", "shield": True}),
    ("knight", {"shape": "person", "helmet": True, "weapon": "sword", "shield": True, "cloth": 0.6, "metal_v": 0.85}),
    ("kobold", {"shape": "person", "snout": True, "horns": 2, "skin": 0.02, "skin_sat": 0.5, "skin_val": 0.5, "weapon": "spear"}),
    ("lizardfolk", {"shape": "person", "snout": True, "skin": 0.3, "skin_sat": 0.4, "skin_val": 0.4, "weapon": "spear", "fangs": True}),
    ("mage", {"shape": "person", "weapon": "staff", "cloth": 0.72, "hair": True}),
    ("merfolk", {"shape": "person", "ears": "fin", "weapon": "trident", "skin": 0.55, "skin_sat": 0.3, "skin_val": 0.6, "hair": True}),
    ("noble", {"shape": "person", "crown": True, "cloth": 0.75, "hair": True}),
    ("orc", {"shape": "person", "tusks": True, "skin": 0.3, "skin_sat": 0.25, "skin_val": 0.4, "weapon": "axe", "hair": True}),
    ("priest", {"shape": "person", "weapon": "staff", "cloth": 0.0, "hair": True}),
    ("sahuagin", {"shape": "person", "ears": "fin", "fangs": True, "weapon": "trident", "skin": 0.45, "skin_sat": 0.4, "skin_val": 0.4}),
    ("scout", {"shape": "person", "weapon": "bow", "hood": True, "cloth": 0.08}),
    ("spy", {"shape": "person", "hood": True, "weapon": "dagger", "cloth": 0.6}),
    ("thug", {"shape": "person", "weapon": "axe", "cloth": 0.07, "hair": True}),
    ("tribal-warrior", {"shape": "person", "weapon": "spear", "cloth": 0.08, "hair": True}),
    ("veteran", {"shape": "person", "helmet": True, "weapon": "sword", "shield": True}),
    ("werebear", {"shape": "person", "ears": "round", "snout": True, "fangs": True, "skin": 0.07, "skin_val": 0.4, "hair": True}),
    ("wereboar", {"shape": "person", "tusks": True, "snout": True, "skin": 0.07, "skin_val": 0.45}),
    ("wererat", {"shape": "person", "ears": "round", "snout": True, "fangs": True, "skin": 0.07, "skin_sat": 0.1, "skin_val": 0.55}),
    ("weretiger", {"shape": "person", "ears": "point", "fangs": True, "skin": 0.07, "skin_val": 0.6}),
    ("werewolf", {"shape": "person", "ears": "point", "snout": True, "fangs": True, "skin": 0.07, "skin_val": 0.4}),
    ("skeleton", {"shape": "skull"}),
    ("minotaur-skeleton", {"shape": "skull", "horns": 2}),
    ("warhorse-skeleton", {"shape": "skull", "horse": True}),
    ("zombie", {"shape": "person", "skin": 0.3, "skin_sat": 0.3, "skin_val": 0.4, "no_eyes": False, "cloth": 0.08}),
    ("ogre-zombie", {"shape": "person", "skin": 0.25, "skin_sat": 0.3, "skin_val": 0.35, "weapon": "axe", "tusks": True}),
    ("ghoul", {"shape": "person", "skin": 0.25, "skin_sat": 0.2, "skin_val": 0.5, "fangs": True, "claws": True}),
    ("ghast", {"shape": "person", "skin": 0.2, "skin_sat": 0.25, "skin_val": 0.55, "fangs": True}),
    ("ghost", {"shape": "ghost", "hue": 0.55, "sat": 0.1, "val": 0.8}),
    ("specter", {"shape": "ghost", "hue": 0.55, "sat": 0.15, "val": 0.7}),
    ("wraith", {"shape": "ghost", "hue": 0.0, "sat": 0.0, "val": 0.25}),
    ("shadow", {"shape": "ghost", "hue": 0.0, "sat": 0.0, "val": 0.12}),
    ("mummy", {"shape": "person", "bandage": True, "cloth": 0.1}),
    ("mummy-lord", {"shape": "person", "bandage": True, "crown": True, "cloth": 0.08}),
    ("vampire-spawn", {"shape": "person", "skin": 0.0, "skin_sat": 0.1, "skin_val": 0.7, "fangs": True, "cloth": 0.0, "hair": True}),
    ("vampire", {"shape": "person", "skin": 0.95, "skin_sat": 0.15, "skin_val": 0.75, "fangs": True, "cloth": 0.0, "cape": True, "hair": True, "crown": False}),
    ("lich", {"shape": "skull", "crown": True}),
    ("wight", {"shape": "person", "skin": 0.55, "skin_sat": 0.1, "skin_val": 0.45, "weapon": "sword", "helmet": True}),
    ("will-o-wisp", {"shape": "wisp"}),
    ("air-elemental", {"shape": "gust", "hue": 0.55, "sat": 0.1, "val": 0.85}),
    ("earth-elemental", {"shape": "rock", "hue": 0.08, "sat": 0.3, "val": 0.35}),
    ("fire-elemental", {"shape": "flame"}),
    ("water-elemental", {"shape": "wave", "hue": 0.55, "sat": 0.55, "val": 0.45}),
    ("dust-mephit", {"shape": "person", "wings": True, "skin": 0.08, "skin_sat": 0.15, "skin_val": 0.6, "horns": 2}),
    ("ice-mephit", {"shape": "person", "wings": True, "skin": 0.55, "skin_sat": 0.15, "skin_val": 0.85, "horns": 2}),
    ("magma-mephit", {"shape": "person", "wings": True, "skin": 0.02, "skin_sat": 0.7, "skin_val": 0.5, "horns": 2, "fire": True}),
    ("steam-mephit", {"shape": "person", "wings": True, "skin": 0.55, "skin_sat": 0.05, "skin_val": 0.8, "horns": 2}),
    ("magmin", {"shape": "flame"}),
    ("azer", {"shape": "person", "skin": 0.05, "skin_sat": 0.7, "skin_val": 0.55, "beard": True, "weapon": "axe", "fire": True}),
    ("salamander", {"shape": "person", "snake_body": True, "skin": 0.02, "skin_sat": 0.7, "skin_val": 0.5, "weapon": "spear", "horns": 2}),
    ("gargoyle", {"shape": "person", "wings": True, "horns": 2, "skin": 0.58, "skin_sat": 0.1, "skin_val": 0.45, "fangs": True}),
    ("xorn", {"shape": "rock", "hue": 0.08, "sat": 0.35, "val": 0.4, "extra_head": True}),
    ("invisible-stalker", {"shape": "gust", "hue": 0.55, "sat": 0.05, "val": 0.7}),
    ("djinni", {"shape": "person", "wings": False, "cloth": 0.55, "skin": 0.55, "skin_sat": 0.3, "skin_val": 0.6, "weapon": "none", "crown": True}),
    ("efreeti", {"shape": "person", "skin": 0.02, "skin_sat": 0.7, "skin_val": 0.5, "horns": 2, "weapon": "sword", "fire": True}),
    ("balor", {"shape": "person", "wings": True, "horns": 2, "weapon": "sword", "skin": 0.0, "skin_sat": 0.6, "skin_val": 0.4, "fire": True, "fangs": True}),
    ("barbed-devil", {"shape": "person", "horns": 2, "spikes": True, "skin": 0.02, "skin_sat": 0.6, "skin_val": 0.45, "weapon": "none", "fangs": True}),
    ("bearded-devil", {"shape": "person", "beard": True, "horns": 2, "weapon": "spear", "skin": 0.02, "skin_sat": 0.5, "skin_val": 0.45}),
    ("bone-devil", {"shape": "skull", "horns": 2, "wings": False}),
    ("chain-devil", {"shape": "person", "horns": 2, "skin": 0.0, "skin_sat": 0.0, "skin_val": 0.4, "weapon": "none"}),
    ("horned-devil", {"shape": "person", "horns": 2, "wings": True, "weapon": "spear", "skin": 0.02, "skin_sat": 0.55, "skin_val": 0.4}),
    ("ice-devil", {"shape": "person", "horns": 2, "wings": True, "skin": 0.55, "skin_sat": 0.2, "skin_val": 0.75, "weapon": "spear"}),
    ("pit-fiend", {"shape": "person", "horns": 2, "wings": True, "weapon": "axe", "skin": 0.0, "skin_sat": 0.65, "skin_val": 0.4, "fangs": True}),
    ("erinyes", {"shape": "person", "wings": True, "weapon": "bow", "skin": 0.02, "skin_sat": 0.4, "skin_val": 0.6, "hair": True}),
    ("dretch", {"shape": "person", "horns": 2, "skin": 0.25, "skin_sat": 0.3, "skin_val": 0.4, "fangs": True, "snout": True}),
    ("glabrezu", {"shape": "person", "horns": 2, "skin": 0.75, "skin_sat": 0.3, "skin_val": 0.35, "fangs": True, "extra_arms": True}),
    ("hezrou", {"shape": "frog", "hue": 0.3, "sat": 0.3, "val": 0.3, "horns": 2}),
    ("marilith", {"shape": "person", "snake_body": True, "weapon": "sword", "skin": 0.3, "skin_sat": 0.4, "skin_val": 0.5, "hair": True, "horns": 2}),
    ("nalfeshnee", {"shape": "person", "wings": True, "tusks": True, "snout": True, "skin": 0.02, "skin_sat": 0.4, "skin_val": 0.5}),
    ("quasit", {"shape": "person", "wings": True, "horns": 2, "skin": 0.3, "skin_sat": 0.4, "skin_val": 0.4, "fangs": True}),
    ("imp", {"shape": "person", "wings": True, "horns": 2, "skin": 0.0, "skin_sat": 0.6, "skin_val": 0.45, "fangs": True, "weapon": "none"}),
    ("lemure", {"shape": "ooze", "hue": 0.0, "sat": 0.1, "val": 0.7}),
    ("vrock", {"shape": "bird", "hue": 0.25, "sat": 0.3, "val": 0.35, "wings": True, "fangs": True}),
    ("succubusincubus", {"shape": "person", "wings": True, "horns": 2, "skin": 0.95, "skin_sat": 0.25, "skin_val": 0.7, "hair": True, "weapon": "none"}),
    ("rakshasa", {"shape": "person", "snout": True, "fangs": True, "cloth": 0.08, "skin": 0.07, "skin_val": 0.6, "hair": True, "crown": True}),
    ("night-hag", {"shape": "person", "horns": 2, "skin": 0.62, "skin_sat": 0.25, "skin_val": 0.35, "hair": True, "fangs": True}),
    ("green-hag", {"shape": "person", "skin": 0.3, "skin_sat": 0.45, "skin_val": 0.4, "hair": True, "fangs": True}),
    ("sea-hag", {"shape": "person", "skin": 0.45, "skin_sat": 0.2, "skin_val": 0.55, "hair": True, "fangs": True}),
    ("dryad", {"shape": "person", "skin": 0.08, "skin_val": 0.6, "hair": True, "hair_h": 0.3, "hair_v": 0.3, "cloth": 0.3}),
    ("satyr", {"shape": "person", "horns": 2, "skin": 0.07, "skin_val": 0.6, "hair": True, "beard": True}),
    ("sprite", {"shape": "person", "wings": True, "skin": 0.08, "skin_val": 0.75, "hair": True, "weapon": "bow"}),
    ("couatl", {"shape": "snake", "hue": 0.12, "sat": 0.4, "val": 0.7, "wings": True}),
    ("deva", {"shape": "person", "wings": True, "skin": 0.08, "skin_val": 0.8, "weapon": "axe", "hair": True, "cloth": 0.12}),
    ("planetar", {"shape": "person", "wings": True, "skin": 0.55, "skin_sat": 0.2, "skin_val": 0.7, "weapon": "sword", "hair": True}),
    ("solar", {"shape": "person", "wings": True, "skin": 0.08, "skin_val": 0.85, "weapon": "sword", "hair": True, "hair_v": 0.9, "crown": True}),
    ("androsphinx", {"shape": "person", "hair": True, "beard": True, "wings": True, "skin": 0.08, "skin_val": 0.7}),
    ("gynosphinx", {"shape": "person", "hair": True, "hair_v": 0.15, "wings": True, "skin": 0.07, "skin_val": 0.7, "crown": True}),
    ("behir", {"shape": "snake", "hue": 0.55, "sat": 0.45, "val": 0.4, "horns": 2}),
    ("bulette", {"shape": "mammal", "ears": "none", "hue": 0.07, "sat": 0.3, "val": 0.35, "horns": 1, "fangs": True, "snout": 1.1}),
    ("centaur", {"shape": "person", "weapon": "bow", "skin": 0.07, "skin_val": 0.65, "hair": True}),
    ("chimera", {"shape": "mammal", "ears": "round", "mane": True, "horns": 2, "wings": True, "hue": 0.08, "sat": 0.4, "val": 0.5, "extra_head": True}),
    ("chuul", {"shape": "crab", "hue": 0.25, "sat": 0.3, "val": 0.35}),
    ("cloaker", {"shape": "bat", "hue": 0.0, "sat": 0.0, "val": 0.15}),
    ("darkmantle", {"shape": "octopus", "hue": 0.75, "sat": 0.2, "val": 0.25}),
    ("doppelganger", {"shape": "person", "skin": 0.08, "skin_sat": 0.1, "skin_val": 0.7, "hair": False}),
    ("drider", {"shape": "person", "spider_legs": True, "skin": 0.75, "skin_sat": 0.15, "skin_val": 0.4, "hair": True, "hair_v": 0.9, "weapon": "sword"}),
    ("ettercap", {"shape": "spider", "hue": 0.07, "sat": 0.2, "val": 0.35}),
    ("gorgon", {"shape": "mammal", "ears": "point", "hue": 0.0, "sat": 0.0, "val": 0.55, "horns": 2, "metal": True}),
    ("grick", {"shape": "worm", "hue": 0.0, "sat": 0.05, "val": 0.35}),
    ("griffon", {"shape": "bird", "hue": 0.07, "sat": 0.4, "val": 0.45, "wings": True}),
    ("hippogriff", {"shape": "bird", "hue": 0.07, "sat": 0.3, "val": 0.5, "wings": True}),
    ("harpy", {"shape": "person", "wings": True, "skin": 0.07, "skin_val": 0.6, "hair": True, "fangs": True}),
    ("guardian-naga", {"shape": "person", "snake_body": True, "skin": 0.08, "skin_val": 0.7, "hair": True, "crown": True}),
    ("spirit-naga", {"shape": "person", "snake_body": True, "skin": 0.75, "skin_sat": 0.2, "skin_val": 0.5, "hair": True}),
    ("lamia", {"shape": "person", "snake_body": True, "skin": 0.07, "skin_val": 0.65, "hair": True, "weapon": "dagger"}),
    ("medusa", {"shape": "person", "snake_hair": True, "skin": 0.3, "skin_sat": 0.25, "skin_val": 0.55, "weapon": "bow"}),
    ("merrow", {"shape": "person", "ears": "fin", "fangs": True, "skin": 0.3, "skin_sat": 0.3, "skin_val": 0.4, "weapon": "spear"}),
    ("minotaur", {"shape": "person", "horns": 2, "snout": True, "skin": 0.07, "skin_val": 0.5, "weapon": "axe"}),
    ("purple-worm", {"shape": "worm", "hue": 0.78, "sat": 0.4, "val": 0.4}),
    ("remorhaz", {"shape": "worm", "hue": 0.55, "sat": 0.25, "val": 0.7, "ice": True}),
    ("roper", {"shape": "roper", "hue": 0.08, "sat": 0.15, "val": 0.4}),
    ("rust-monster", {"shape": "rust", "hue": 0.05, "sat": 0.6, "val": 0.5}),
    ("tarrasque", {"shape": "tarrasque", "hue": 0.12, "sat": 0.4, "val": 0.4}),
    ("hydra", {"shape": "hydra", "hue": 0.3, "sat": 0.45, "val": 0.35}),
    ("basilisk", {"shape": "mammal", "ears": "none", "hue": 0.25, "sat": 0.3, "val": 0.4, "horns": 1, "snout": 1.2, "fangs": True}),
    ("aboleth", {"shape": "fish", "hue": 0.72, "sat": 0.35, "val": 0.35, "fangs": True}),
    ("gibbering-mouther", {"shape": "mouther", "hue": 0.95, "sat": 0.35, "val": 0.55}),
    ("otyugh", {"shape": "mouther", "hue": 0.2, "sat": 0.3, "val": 0.3}),
    ("animated-armor", {"shape": "armor"}),
    ("flying-sword", {"shape": "sword"}),
    ("rug-of-smothering", {"shape": "rug", "hue": 0.0, "sat": 0.55, "val": 0.35}),
    ("homunculus", {"shape": "person", "wings": True, "skin": 0.08, "skin_val": 0.6, "horns": 0}),
    ("shield-guardian", {"shape": "golem", "hue": 0.08, "sat": 0.15, "val": 0.45}),
    ("clay-golem", {"shape": "golem", "hue": 0.06, "sat": 0.4, "val": 0.45}),
    ("flesh-golem", {"shape": "golem", "hue": 0.95, "sat": 0.25, "val": 0.55}),
    ("iron-golem", {"shape": "golem", "hue": 0.08, "sat": 0.1, "val": 0.45}),
    ("stone-golem", {"shape": "golem", "hue": 0.08, "sat": 0.08, "val": 0.55}),
    ("awakened-shrub", {"shape": "fungus", "hue": 0.3, "sat": 0.45, "val": 0.35, "eyes": True}),
    ("awakened-tree", {"shape": "tree", "hue": 0.3, "sat": 0.4, "val": 0.3}),
    ("treant", {"shape": "tree", "hue": 0.28, "sat": 0.4, "val": 0.28}),
    ("shambling-mound", {"shape": "tree", "hue": 0.25, "sat": 0.35, "val": 0.25}),
    ("shrieker", {"shape": "fungus", "hue": 0.0, "sat": 0.4, "val": 0.45}),
    ("violet-fungus", {"shape": "fungus", "hue": 0.78, "sat": 0.45, "val": 0.45, "eyes": True}),
    ("black-pudding", {"shape": "ooze", "hue": 0.0, "sat": 0.0, "val": 0.08}),
    ("gelatinous-cube", {"shape": "ooze", "cube": True, "hue": 0.3, "sat": 0.4, "val": 0.55}),
    ("gray-ooze", {"shape": "ooze", "hue": 0.0, "sat": 0.0, "val": 0.45}),
    ("ochre-jelly", {"shape": "ooze", "hue": 0.08, "sat": 0.55, "val": 0.5}),
    ("cloud-giant", {"shape": "person", "skin": 0.55, "skin_sat": 0.15, "skin_val": 0.75, "hair": True, "weapon": "axe", "cloth": 0.55}),
    ("fire-giant", {"shape": "person", "skin": 0.02, "skin_sat": 0.5, "skin_val": 0.45, "beard": True, "weapon": "sword", "helmet": True}),
    ("frost-giant", {"shape": "person", "skin": 0.55, "skin_sat": 0.15, "skin_val": 0.75, "hair": True, "hair_v": 0.9, "weapon": "axe"}),
    ("hill-giant", {"shape": "person", "skin": 0.07, "skin_val": 0.55, "weapon": "axe", "hair": True}),
    ("stone-giant", {"shape": "person", "skin": 0.08, "skin_sat": 0.08, "skin_val": 0.55, "hair": True, "weapon": "axe"}),
    ("storm-giant", {"shape": "person", "skin": 0.6, "skin_sat": 0.25, "skin_val": 0.45, "hair": True, "hair_v": 0.9, "weapon": "sword", "crown": True}),
    ("ettin", {"shape": "person", "extra_head": True, "weapon": "axe", "skin": 0.07, "skin_val": 0.5, "hair": True}),
    ("ogre", {"shape": "person", "skin": 0.08, "skin_val": 0.5, "weapon": "axe", "tusks": True, "hair": True}),
    ("oni", {"shape": "person", "horns": 2, "skin": 0.62, "skin_sat": 0.3, "skin_val": 0.4, "weapon": "sword", "fangs": True}),
    ("troll", {"shape": "person", "skin": 0.3, "skin_sat": 0.3, "skin_val": 0.35, "weapon": "none", "fangs": True, "hair": True, "ears": "point"}),
    ("cyclops", {"shape": "person", "one_eye": True, "skin": 0.07, "skin_val": 0.55, "weapon": "axe"}),
    ("pseudodragon", {"shape": "mammal", "ears": "point", "wings": True, "horns": 2, "hue": 0.02, "sat": 0.55, "val": 0.45, "snout": 1.0, "fangs": True}),
    ("wyvern", {"shape": "bird", "hue": 0.25, "sat": 0.35, "val": 0.35, "wings": True, "fangs": True}),
    ("dragon-turtle", {"shape": "mammal", "ears": "none", "hue": 0.35, "sat": 0.4, "val": 0.35, "horns": 2, "snout": 1.0}),
]


def default_spec(typ: str, mid: str) -> dict:
    rng = rng_for(mid)
    if typ == "humanoid":
        return {"shape": "person", "hair": True, "cloth": rng.random()}
    if typ == "beast":
        return {"shape": "mammal", "ears": "point", "hue": rng.random(), "sat": 0.35, "val": 0.45}
    if typ == "undead":
        return {"shape": "ghost"}
    if typ == "fiend":
        return {"shape": "person", "horns": 2, "wings": True, "skin": 0.02, "skin_sat": 0.5, "skin_val": 0.45}
    if typ == "elemental":
        return {"shape": "flame"}
    if typ == "giant":
        return {"shape": "person", "weapon": "axe", "skin": 0.07}
    if typ == "construct":
        return {"shape": "golem", "hue": 0.08, "sat": 0.1, "val": 0.5}
    if typ == "plant":
        return {"shape": "tree", "hue": 0.3, "sat": 0.4, "val": 0.3}
    if typ == "fey":
        return {"shape": "person", "wings": True, "hair": True}
    if typ == "celestial":
        return {"shape": "person", "wings": True, "hair": True}
    if typ == "aberration":
        return {"shape": "mouther", "hue": 0.75, "sat": 0.3, "val": 0.4}
    if typ == "ooze":
        return {"shape": "ooze", "hue": 0.3, "sat": 0.3, "val": 0.4}
    if typ == "dragon":
        return {"shape": "mammal", "horns": 2, "wings": True, "fangs": True, "hue": 0.02, "sat": 0.5, "val": 0.4}
    return {"shape": "mammal", "hue": rng.random(), "sat": 0.4, "val": 0.4, "horns": 2}


def classify(mid: str, typ: str) -> dict:
    spec = default_spec(typ, mid)
    matched = False
    for needle, patch in sorted(RULES, key=lambda item: len(item[0])):
        if hit(mid, needle):
            spec.update(patch)
            matched = True
    if mid.startswith("giant-"):
        spec["spots"] = True
        spec["val"] = max(0.12, float(spec.get("val", 0.45)) - 0.12)
    if "diseased" in mid:
        spec["hue"] = 0.3
        spec["sat"] = 0.45
        spec["spots"] = True
        spec["val"] = 0.4
    spec["_matched"] = matched
    return spec


def blank(pal) -> Image.Image:
    im = Image.new("RGBA", (S, S), (8, 8, 10, 255))
    paint_bg(im, pal["bg"])
    return im


def render_drawn(mid: str, typ: str) -> Image.Image:
    spec = classify(mid, typ)
    pal = palette(spec, mid)
    shape = spec.get("shape", "mammal")
    drawer = DRAW[shape]
    if mid.startswith("swarm-"):
        im = blank(pal)
        offsets = ((-80, -30, 0.55), (70, 40, 0.5), (0, -70, 0.48))
        for n, (ox, oy, sc) in enumerate(offsets):
            tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            drawer(tile, pal, spec, rng_for(mid + str(n)))
            tile = tile.resize((int(S * sc), int(S * sc)), Image.Resampling.LANCZOS)
            im.alpha_composite(tile, (CX - tile.size[0] // 2 + ox, CY - tile.size[1] // 2 + oy))
        gold_ring(im)
        return im
    im = blank(pal)
    drawer(im, pal, spec, rng_for(mid))
    gold_ring(im)
    return im


def measure_ring(im: Image.Image) -> tuple[int, int]:
    import colorsys

    cx = cy = S // 2
    outer = None
    for y in range(0, cy):
        r, g, b, _a = im.getpixel((cx, y))
        hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        gold = 0.05 < hue < 0.16 and sat > 0.4 and val > 0.25
        if gold and outer is None:
            outer = cy - y
        elif outer is not None and val < 0.2:
            return cy - y, outer
    return 218, outer or 246


def annulus(size: int, r_in: int, r_out: int) -> Image.Image:
    outer = Image.new("L", (size, size), 0)
    inner = Image.new("L", (size, size), 0)
    ImageDraw.Draw(outer).ellipse((CX - r_out, CY - r_out, CX + r_out, CY + r_out), fill=255)
    ImageDraw.Draw(inner).ellipse((CX - r_in, CY - r_in, CX + r_in, CY + r_in), fill=255)
    return ImageChops.subtract(outer, inner)


def dragon_age(color: str, age: str) -> Image.Image:
    src = Image.open(PACK / f"token-dragon-{color}.png").convert("RGBA")
    src = src.resize((S, S), Image.Resampling.LANCZOS)
    if age == "adult":
        return src
    r_in, r_out = measure_ring(src)
    hole = max(8, r_in - 6)
    disc = Image.new("L", (S, S), 0)
    ImageDraw.Draw(disc).ellipse((CX - hole, CY - hole, CX + hole, CY + hole), fill=255)
    interior = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    interior.paste(src, mask=disc)
    if age in {"young", "ancient"}:
        interior = ImageOps.mirror(interior)
    if age == "wyrmling":
        interior = ImageEnhance.Brightness(interior).enhance(1.15)
    if age == "ancient":
        interior = ImageEnhance.Brightness(interior).enhance(0.76)
        interior = ImageEnhance.Contrast(interior).enhance(1.18)
    zoom = {"wyrmling": 0.7, "young": 0.84, "ancient": 1.16}[age]
    side = max(32, int(S * zoom))
    interior = interior.resize((side, side), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (S, S), (8, 8, 10, 255))
    ImageDraw.Draw(canvas).ellipse(
        (CX - r_out, CY - r_out, CX + r_out, CY + r_out),
        fill=(14, 12, 16, 255),
    )
    canvas.paste(interior, ((S - side) // 2, (S - side) // 2), interior)
    gold_ring(canvas)
    return canvas


def photo_copy(filename: str) -> Image.Image:
    im = Image.open(PACK / filename).convert("RGBA")
    return im.resize((S, S), Image.Resampling.LANCZOS)


def build_one(monster: dict) -> Image.Image:
    mid = monster["id"]
    if mid in PHOTO:
        return photo_copy(PHOTO[mid])
    adult = ADULT_AGE.fullmatch(mid)
    if adult:
        return dragon_age(adult.group(2), adult.group(1))
    wyrm = WYRMLING.fullmatch(mid)
    if wyrm:
        return dragon_age(wyrm.group(1), "wyrmling")
    typ = str(monster.get("type") or "").split(",")[0].split("(")[0].strip().lower()
    return render_drawn(mid, typ)


def main() -> None:
    data = json.loads(MONSTERS.read_text(encoding="utf-8"))
    monsters = data["monsters"]
    OUT.mkdir(parents=True, exist_ok=True)
    unmatched = []
    for monster in monsters:
        mid = monster["id"]
        if mid not in PHOTO and not ADULT_AGE.fullmatch(mid) and not WYRMLING.fullmatch(mid):
            typ = str(monster.get("type") or "").split("(")[0].strip().lower()
            spec = classify(mid, typ.split(",")[0])
            if not spec.get("_matched"):
                unmatched.append(mid)
        img = build_one(monster)
        img.save(OUT / f"{mid}.png", optimize=True)
    print(f"wrote {len(monsters)} tokens")
    if unmatched:
        print("unmatched", len(unmatched))
        for mid in unmatched:
            print(" ", mid)


if __name__ == "__main__":
    main()
