"""Paint the bundled gear icons. Each name in the equipment table gets its own picture."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 128


def _canvas() -> Image.Image:
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))


def _save(directory: Path, name: str, image: Image.Image) -> None:
    image.save(directory / f"{name}.png")


def _hand(flip: bool) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    skin = (214, 164, 122, 255)
    shade = (168, 112, 74, 255)
    palm = [(46, 118), (34, 78), (40, 48), (58, 28), (70, 46), (74, 22), (88, 40), (92, 18), (104, 36), (100, 58), (112, 70), (96, 108), (64, 122)]
    draw.polygon(palm, fill=skin, outline=shade)
    draw.ellipse((48, 78, 96, 118), fill=skin, outline=shade)
    if flip:
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return image


def _sword(length: int, width: int, curve: int = 0, color: tuple[int, int, int, int] = (210, 216, 224, 255)) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    top = 16
    bottom = top + length
    mid = 64 + curve
    draw.polygon([(mid - width, bottom), (mid, top), (mid + width, bottom)], fill=color)
    draw.line([(mid, top + 8), (mid, bottom - 4)], fill=(255, 255, 255, 90), width=2)
    draw.rectangle((mid - 16, bottom, mid + 16, bottom + 6), fill=(196, 154, 64, 255))
    draw.rectangle((mid - 4, bottom + 6, mid + 4, bottom + 22), fill=(92, 58, 32, 255))
    return image


def _axe(wide: bool) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rectangle((60, 18, 70, 112), fill=(120, 76, 40, 255))
    head = [(28, 36), (62, 24), (62, 78), (28, 64)] if wide else [(40, 30), (62, 22), (62, 64), (40, 52)]
    draw.polygon(head, fill=(176, 182, 190, 255))
    if wide:
        draw.polygon([(70, 28), (100, 40), (70, 70)], fill=(176, 182, 190, 255))
    return image


def _hammer(heavy: bool) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rectangle((60, 36, 70, 114), fill=(110, 70, 36, 255))
    box = (28, 22, 100, 48) if heavy else (40, 24, 90, 46)
    draw.rounded_rectangle(box, radius=4, fill=(168, 174, 182, 255))
    return image


def _bow(long: bool) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    span = 100 if long else 78
    draw.arc((30, 14, 30 + span, 114), 300, 60, fill=(92, 58, 28, 255), width=6)
    draw.line((64, 20, 64, 108), fill=(40, 40, 40, 255), width=1)
    return image


def _crossbow(heavy: bool) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rectangle((58, 36, 108, 48), fill=(96, 62, 34, 255))
    draw.arc((24, 28, 96, 100), 200, 340, fill=(70, 46, 24, 255), width=5 if not heavy else 8)
    draw.polygon([(100, 34), (118, 42), (100, 50)], fill=(200, 204, 210, 255))
    return image


def _pole(tip: str) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rectangle((60, 28, 68, 116), fill=(122, 78, 40, 255))
    if tip == "spear":
        draw.polygon([(52, 36), (64, 10), (76, 36)], fill=(206, 210, 216, 255))
    elif tip == "glaive":
        draw.polygon([(68, 12), (100, 40), (68, 48)], fill=(206, 210, 216, 255))
    elif tip == "trident":
        draw.polygon([(50, 34), (56, 12), (62, 34)], fill=(206, 210, 216, 255))
        draw.polygon([(62, 36), (64, 8), (70, 36)], fill=(206, 210, 216, 255))
        draw.polygon([(70, 34), (76, 12), (82, 34)], fill=(206, 210, 216, 255))
    else:
        draw.polygon([(48, 40), (64, 8), (80, 28), (64, 36)], fill=(206, 210, 216, 255))
    return image


def _club() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(70, 110), (78, 70), (58, 18), (40, 28), (58, 78)], fill=(132, 86, 46, 255))
    return image


def _staff() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.line((48, 112, 80, 16), fill=(112, 74, 38, 255), width=7)
    draw.ellipse((70, 8, 90, 28), fill=(196, 154, 64, 255))
    return image


def _flail() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rectangle((36, 96, 78, 108), fill=(110, 70, 36, 255))
    draw.line((70, 100, 90, 40), fill=(90, 90, 96, 255), width=2)
    draw.ellipse((78, 22, 108, 52), fill=(180, 184, 190, 255))
    return image


def _whip() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rectangle((34, 20, 46, 70), fill=(96, 58, 28, 255))
    draw.arc((40, 40, 110, 110), 200, 20, fill=(70, 42, 22, 255), width=3)
    return image


def _sling() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.line((30, 30, 64, 70), fill=(150, 110, 60, 255), width=3)
    draw.line((98, 30, 64, 70), fill=(150, 110, 60, 255), width=3)
    draw.ellipse((52, 62, 78, 82), fill=(120, 78, 40, 255))
    return image


def _net() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.ellipse((24, 20, 104, 108), outline=(186, 170, 120, 255), width=2)
    for i in range(4):
        draw.line((32 + i * 16, 28, 32 + i * 16, 100), fill=(186, 170, 120, 180), width=1)
        draw.line((32, 36 + i * 16, 96, 36 + i * 16), fill=(186, 170, 120, 180), width=1)
    return image


def _dart() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(64, 16), (72, 70), (56, 70)], fill=(200, 204, 210, 255))
    draw.polygon([(56, 70), (64, 100), (72, 70)], fill=(180, 60, 50, 255))
    return image


def _blowgun() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(20, 58), (110, 48), (110, 62), (20, 70)], fill=(120, 78, 42, 255))
    return image


def _armor(kind: str) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    colors = {
        "padded": (186, 170, 130, 255),
        "leather": (122, 74, 38, 255),
        "studded leather": (110, 66, 34, 255),
        "hide": (150, 102, 54, 255),
        "chain shirt": (168, 172, 178, 255),
        "scale mail": (150, 156, 150, 255),
        "breastplate": (190, 196, 204, 255),
        "half plate": (176, 182, 190, 255),
        "ring mail": (140, 146, 154, 255),
        "chain mail": (154, 160, 168, 255),
        "splint": (180, 186, 194, 255),
        "plate": (210, 214, 220, 255),
    }
    fill = colors.get(kind, (160, 160, 160, 255))
    draw.polygon([(64, 18), (100, 36), (96, 108), (32, 108), (28, 36)], fill=fill)
    draw.polygon([(28, 36), (8, 58), (24, 70), (36, 48)], fill=fill)
    draw.polygon([(100, 36), (120, 58), (104, 70), (92, 48)], fill=fill)
    if kind == "studded leather":
        for x in (48, 64, 80):
            for y in (50, 68, 86):
                draw.ellipse((x, y, x + 6, y + 6), fill=(210, 180, 90, 255))
    if kind in {"chain shirt", "chain mail", "ring mail"}:
        for y in range(40, 100, 8):
            draw.arc((36, y, 92, y + 10), 0, 180, fill=(90, 94, 100, 255), width=1)
    if kind in {"plate", "splint", "breastplate", "half plate"}:
        draw.line((64, 28, 64, 100), fill=(120, 124, 132, 255), width=2)
    if kind == "scale mail":
        for y in range(44, 100, 10):
            for x in range(40, 90, 12):
                draw.arc((x, y, x + 12, y + 12), 0, 180, fill=(80, 84, 80, 255), width=1)
    if kind == "hide":
        draw.arc((40, 48, 88, 96), 200, 340, fill=(90, 58, 28, 255), width=2)
    return image


def _shield() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(64, 16), (108, 36), (100, 86), (64, 114), (28, 86), (20, 36)], fill=(150, 46, 42, 255), outline=(212, 170, 70, 255))
    draw.ellipse((52, 48, 76, 72), outline=(212, 170, 70, 255), width=3)
    return image


def _quiver(color: tuple[int, int, int, int], tips: tuple[int, int, int, int]) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(48, 28), (84, 28), (78, 112), (42, 112)], fill=color)
    for x in (52, 62, 72):
        draw.line((x, 28, x - 4, 8), fill=tips, width=3)
    return image


def _bullets() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.ellipse((36, 48, 96, 108), fill=(120, 78, 40, 255))
    for x, y in ((48, 40), (64, 28), (80, 42), (58, 58)):
        draw.ellipse((x, y, x + 14, y + 14), fill=(90, 90, 96, 255))
    return image


def _needles() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((40, 36, 90, 100), radius=8, fill=(90, 70, 48, 255))
    for i in range(5):
        draw.line((50 + i * 7, 36, 46 + i * 7, 16), fill=(210, 210, 216, 255), width=2)
    return image


def _pack(kind: str) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    if kind == "backpack":
        draw.rounded_rectangle((36, 28, 96, 110), radius=10, fill=(110, 68, 34, 255))
        draw.arc((18, 30, 50, 90), 90, 270, fill=(80, 48, 24, 255), width=4)
        draw.arc((82, 30, 114, 90), 270, 90, fill=(80, 48, 24, 255), width=4)
        draw.rectangle((48, 48, 84, 58), fill=(196, 154, 64, 255))
    elif kind == "sack":
        draw.polygon([(40, 40), (92, 36), (104, 100), (28, 104)], fill=(168, 140, 90, 255))
        draw.arc((48, 16, 84, 48), 200, 340, fill=(140, 110, 70, 255), width=4)
    elif kind == "pouch":
        draw.ellipse((36, 40, 96, 108), fill=(122, 74, 40, 255))
        draw.arc((48, 28, 84, 58), 200, 340, fill=(196, 154, 64, 255), width=3)
    elif kind == "bag of holding":
        draw.polygon([(34, 36), (96, 30), (108, 104), (28, 108)], fill=(86, 48, 140, 255))
        draw.ellipse((48, 18, 86, 44), outline=(212, 180, 90, 255), width=3)
    else:
        draw.rounded_rectangle((28, 36, 100, 108), radius=8, fill=(70, 96, 70, 255))
        draw.rectangle((40, 48, 88, 60), fill=(196, 154, 64, 255))
        draw.rectangle((44, 70, 60, 96), fill=(50, 70, 50, 255))
    return image


def _frame(kind: str) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    ink = (230, 184, 77, 220)
    if kind == "body":
        draw.polygon([(64, 16), (96, 36), (90, 112), (38, 112), (32, 36)], outline=ink, width=3)
    elif kind == "shoulders":
        draw.arc((16, 36, 112, 100), 200, 340, fill=ink, width=6)
    elif kind == "belt":
        draw.arc((16, 40, 112, 100), 20, 160, fill=ink, width=8)
        draw.rectangle((56, 78, 74, 98), outline=ink, width=3)
    elif kind == "back":
        draw.rounded_rectangle((40, 24, 92, 108), radius=8, outline=ink, width=3)
        draw.line((40, 40, 20, 70), fill=ink, width=3)
        draw.line((92, 40, 112, 70), fill=ink, width=3)
    elif kind == "pocket":
        draw.rounded_rectangle((28, 36, 100, 104), radius=16, outline=ink, width=3)
    else:
        draw.rounded_rectangle((8, 8, 120, 120), radius=6, fill=(28, 24, 16, 255), outline=(90, 70, 32, 255))
        draw.line((18, 18, 40, 40), fill=(230, 184, 77, 40), width=2)
    return image


def _vial(liquid: tuple[int, int, int, int], cork: tuple[int, int, int, int] = (196, 154, 64, 255)) -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((50, 18, 78, 36), radius=3, fill=cork)
    draw.polygon([(46, 40), (82, 40), (96, 108), (32, 108)], fill=(210, 220, 230, 180))
    draw.polygon([(40, 70), (88, 70), (96, 108), (32, 108)], fill=liquid)
    draw.line([(46, 40), (32, 108), (96, 108), (82, 40)], fill=(230, 236, 242, 255), width=2)
    return image


def _scroll() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((28, 24, 100, 108), radius=8, fill=(232, 214, 170, 255))
    draw.ellipse((22, 20, 46, 44), fill=(214, 190, 140, 255))
    draw.ellipse((82, 88, 108, 112), fill=(214, 190, 140, 255))
    for y in (48, 60, 72, 84):
        draw.line((40, y, 88, y), fill=(120, 90, 50, 180), width=2)
    return image


def _ring() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.ellipse((34, 36, 94, 96), outline=(212, 180, 90, 255), width=8)
    draw.ellipse((54, 22, 74, 46), fill=(80, 160, 190, 255))
    return image


def _wand() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.line((36, 108, 92, 20), fill=(120, 72, 36, 255), width=6)
    draw.ellipse((84, 10, 104, 30), fill=(120, 180, 255, 255))
    return image


def _torch() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rectangle((58, 48, 72, 112), fill=(110, 70, 36, 255))
    draw.polygon([(50, 52), (65, 16), (80, 52)], fill=(230, 120, 40, 255))
    draw.polygon([(58, 48), (65, 24), (72, 48)], fill=(255, 210, 80, 255))
    return image


def _rope() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.ellipse((28, 28, 100, 100), outline=(150, 110, 60, 255), width=8)
    draw.arc((40, 40, 88, 88), 20, 200, fill=(120, 82, 40, 255), width=4)
    return image


def _rations() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((30, 40, 98, 100), radius=6, fill=(168, 122, 64, 255))
    draw.rectangle((30, 40, 98, 58), fill=(120, 78, 40, 255))
    draw.line((40, 70, 88, 70), fill=(90, 56, 28, 255), width=2)
    return image


def _gem() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(64, 18), (100, 48), (64, 110), (28, 48)], fill=(80, 170, 160, 255))
    draw.polygon([(64, 18), (100, 48), (64, 48)], fill=(180, 240, 230, 255))
    return image


def _oil() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.polygon([(48, 28), (80, 28), (92, 108), (36, 108)], fill=(90, 70, 40, 255))
    draw.ellipse((44, 16, 84, 40), fill=(196, 154, 64, 255))
    return image


def _item() -> Image.Image:
    image = _canvas()
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((28, 36, 100, 104), radius=10, fill=(92, 78, 58, 255), outline=(196, 154, 64, 255), width=3)
    draw.ellipse((54, 58, 74, 78), outline=(230, 200, 120, 255), width=3)
    return image


def build_all(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    _save(directory, "left-hand", _hand(False))
    _save(directory, "right-hand", _hand(True))
    _save(directory, "light-hand", _hand(False).resize((96, 96)))
    for name in ("body", "shoulders", "belt", "back", "pocket", "bag-cell"):
        _save(directory, name, _frame(name))
    blades = {
        "dagger": (70, 5, 0),
        "shortsword": (84, 6, 0),
        "longsword": (96, 7, 0),
        "scimitar": (90, 6, 10),
        "rapier": (100, 3, 0),
        "greatsword": (108, 10, 0),
    }
    for name, spec in blades.items():
        _save(directory, name, _sword(*spec))
    _save(directory, "handaxe", _axe(False))
    _save(directory, "battleaxe", _axe(True))
    _save(directory, "greataxe", _axe(True))
    _save(directory, "light-hammer", _hammer(False))
    _save(directory, "warhammer", _hammer(False))
    _save(directory, "maul", _hammer(True))
    _save(directory, "mace", _hammer(False))
    _save(directory, "morningstar", _hammer(False))
    _save(directory, "war-pick", _hammer(False))
    _save(directory, "club", _club())
    _save(directory, "greatclub", _club())
    _save(directory, "quarterstaff", _staff())
    _save(directory, "sickle", _sword(60, 4, 14))
    _save(directory, "shortbow", _bow(False))
    _save(directory, "longbow", _bow(True))
    _save(directory, "light-crossbow", _crossbow(False))
    _save(directory, "hand-crossbow", _crossbow(False))
    _save(directory, "heavy-crossbow", _crossbow(True))
    _save(directory, "spear", _pole("spear"))
    _save(directory, "javelin", _pole("spear"))
    _save(directory, "pike", _pole("spear"))
    _save(directory, "lance", _pole("spear"))
    _save(directory, "glaive", _pole("glaive"))
    _save(directory, "halberd", _pole("glaive"))
    _save(directory, "trident", _pole("trident"))
    _save(directory, "flail", _flail())
    _save(directory, "whip", _whip())
    _save(directory, "sling", _sling())
    _save(directory, "net", _net())
    _save(directory, "dart", _dart())
    _save(directory, "blowgun", _blowgun())
    _save(directory, "shield", _shield())
    for armor in (
        "padded",
        "leather",
        "studded-leather",
        "hide",
        "chain-shirt",
        "scale-mail",
        "breastplate",
        "half-plate",
        "ring-mail",
        "chain-mail",
        "splint",
        "plate",
    ):
        _save(directory, armor, _armor(armor.replace("-", " ")))
    _save(directory, "arrows", _quiver((120, 78, 40, 255), (90, 58, 28, 255)))
    _save(directory, "bolts", _quiver((80, 80, 86, 255), (200, 204, 210, 255)))
    _save(directory, "bullets", _bullets())
    _save(directory, "needles", _needles())
    _save(directory, "backpack", _pack("backpack"))
    _save(directory, "sack", _pack("sack"))
    _save(directory, "pouch", _pack("pouch"))
    _save(directory, "bag-of-holding", _pack("bag of holding"))
    _save(directory, "handy-haversack", _pack("haversack"))
    _save(directory, "haversack", _pack("haversack"))
    _save(directory, "potion", _vial((196, 48, 48, 230)))
    _save(directory, "elixir", _vial((80, 140, 220, 230), (230, 210, 140, 255)))
    _save(directory, "antitoxin", _vial((80, 160, 70, 230)))
    _save(directory, "holy-water", _vial((220, 220, 240, 200)))
    _save(directory, "vial", _vial((180, 80, 160, 220)))
    _save(directory, "flask", _vial((180, 80, 160, 220)))
    _save(directory, "scroll", _scroll())
    _save(directory, "spell-scroll", _scroll())
    _save(directory, "ring", _ring())
    _save(directory, "wand", _wand())
    _save(directory, "rod", _wand())
    _save(directory, "torch", _torch())
    _save(directory, "rope", _rope())
    _save(directory, "rations", _rations())
    _save(directory, "gem", _gem())
    _save(directory, "oil", _oil())
    _save(directory, "item", _item())
