"""Character portrait helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import quote

from .config import DATA_DIR

CHAR_IMAGE_DIR = DATA_DIR / "character_images"
MEDIA_CHARS = "/media/characters"
ALLOWED = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def ensure_dirs() -> None:
    CHAR_IMAGE_DIR.mkdir(parents=True, exist_ok=True)


def image_url_for(data: dict[str, Any]) -> str | None:
    image = data.get("image")
    if not image:
        return None
    path = CHAR_IMAGE_DIR / str(image)
    if not path.exists():
        return None
    url = f"{MEDIA_CHARS}/{image}"
    stamp = data.get("updated_at")
    if stamp:
        url += f"?v={quote(str(stamp), safe='')}"
    return url


def with_portrait(data: dict[str, Any]) -> dict[str, Any]:
    out = dict(data)
    url = image_url_for(out)
    if url:
        out["image_url"] = url
    return out
