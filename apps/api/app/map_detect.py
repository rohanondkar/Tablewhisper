"""Guess ground and liquid squares from a battle-map picture.

Walls and lights are left blank for the DM to paint. Nothing here is written
to the database.
"""

from __future__ import annotations

import io
import math
from typing import Any

import numpy as np
from PIL import Image


def suggest_marks(
    data: bytes,
    map_w: float,
    map_h: float,
    grid: float,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> dict[str, Any]:
    """Return guessed squares in grid coordinates."""
    map_w = max(16.0, float(map_w))
    map_h = max(16.0, float(map_h))
    grid = max(8.0, float(grid))
    offset_x = float(offset_x)
    offset_y = float(offset_y)
    image = Image.open(io.BytesIO(data)).convert("RGB")
    image.thumbnail((420, 420), Image.Resampling.BILINEAR)
    arr = np.asarray(image).astype(np.float32)
    height, width = arr.shape[:2]
    empty: dict[str, Any] = {"walls": [], "doors": [], "ground": [], "lights": [], "liquids": []}
    if height < 8 or width < 8:
        return empty
    scale_x = map_w / width
    scale_y = map_h / height
    # Walls and lights are painted by hand. An open field has none, and a bright
    # spot on the art is not a torch. Liquids and the ground around them are the guess.
    liquids = _liquid_cells(arr, scale_x, scale_y, offset_x, offset_y, grid, map_w, map_h, set())
    taken = {(cell["c"], cell["r"]) for item in liquids for cell in item["cells"]}
    ground = [
        {"c": c, "r": r}
        for c, r in _every_cell(offset_x, offset_y, grid, map_w, map_h)
        if (c, r) not in taken
    ]
    return {
        "walls": [],
        "doors": [],
        "ground": ground,
        "lights": [],
        "liquids": liquids,
    }


def _cell_inside(c: int, r: int, ox: float, oy: float, grid: float, map_w: float, map_h: float) -> bool:
    x = ox + c * grid
    y = oy + r * grid
    return x < map_w and y < map_h and x + grid > 0 and y + grid > 0


def _every_cell(ox: float, oy: float, grid: float, map_w: float, map_h: float) -> list[tuple[int, int]]:
    c0 = math.floor((0 - ox) / grid) - 1
    c1 = math.ceil((map_w - ox) / grid) + 1
    r0 = math.floor((0 - oy) / grid) - 1
    r1 = math.ceil((map_h - oy) / grid) + 1
    found: list[tuple[int, int]] = []
    for r in range(int(r0), int(r1) + 1):
        for c in range(int(c0), int(c1) + 1):
            if _cell_inside(c, r, ox, oy, grid, map_w, map_h):
                found.append((c, r))
    return found


def _mask_cells(
    mask: np.ndarray,
    scale_x: float,
    scale_y: float,
    ox: float,
    oy: float,
    grid: float,
    map_w: float,
    map_h: float,
    minimum_mean: float = 0.62,
) -> set[tuple[int, int]]:
    th, tw = mask.shape
    found: set[tuple[int, int]] = set()
    for c, r in _every_cell(ox, oy, grid, map_w, map_h):
        x0 = ox + c * grid
        y0 = oy + r * grid
        tx0 = int(max(0, min(tw - 1, math.floor(max(0.0, x0) / scale_x))))
        tx1 = int(max(tx0 + 1, min(tw, math.ceil(min(map_w, x0 + grid) / scale_x))))
        ty0 = int(max(0, min(th - 1, math.floor(max(0.0, y0) / scale_y))))
        ty1 = int(max(ty0 + 1, min(th, math.ceil(min(map_h, y0 + grid) / scale_y))))
        patch = mask[ty0:ty1, tx0:tx1]
        if patch.size and float(patch.mean()) >= minimum_mean:
            found.add((c, r))
    return found


def _liquid_masks(arr: np.ndarray) -> list[tuple[str, np.ndarray]]:
    red = arr[..., 0]
    green = arr[..., 1]
    blue = arr[..., 2]
    peak = np.maximum(np.maximum(red, green), blue)
    floor = np.minimum(np.minimum(red, green), blue)
    vivid = (peak - floor) > 48
    lava = vivid & (red > 170) & (red > green + 25) & (red > blue + 60) & (green > 40) & (blue < 110)
    blood = vivid & ~lava & (red > 120) & (red > green + 50) & (red > blue + 50) & (green < 85) & (blue < 85)
    # Yellow-green. Meadow grass is greener than it is red, so it stays ground.
    acid = (
        vivid
        & ~lava
        & ~blood
        & (green > 155)
        & (red > 135)
        & (green < red + 40)
        & (red < green + 25)
        & (blue < 100)
        & (green > blue + 55)
    )
    slime = (
        vivid
        & ~lava
        & ~blood
        & ~acid
        & (green > 135)
        & (green > red + 65)
        & (green > blue + 45)
        & (red < 90)
        & (blue < 95)
    )
    mana = (
        vivid
        & ~lava
        & ~blood
        & ~acid
        & ~slime
        & (blue > 100)
        & (red > 80)
        & (blue > green + 20)
        & ((red + blue) > green + 110)
        & (green < 130)
    )
    # Teal, including the pale foam and the darker shallows. Grass stays out
    # because its blue sits below its red. A square that is partly this color
    # is still water; the bank is where the corrections were.
    water = (
        ~lava
        & ~blood
        & ~acid
        & ~slime
        & ~mana
        & (blue > 72)
        & (green > 60)
        & (red + 18 < blue)
        & (red + 14 < green)
        & (blue + 40 > green)
        & (green + 30 > blue)
        & ((peak - floor) > 26)
    )
    return [
        ("lava", lava),
        ("blood", blood),
        ("acid", acid),
        ("slime", slime),
        ("mana", mana),
        ("water", water),
    ]


def _liquid_cells(
    arr: np.ndarray,
    scale_x: float,
    scale_y: float,
    ox: float,
    oy: float,
    grid: float,
    map_w: float,
    map_h: float,
    blocked: set[tuple[int, int]],
) -> list[dict[str, Any]]:
    minimum = max(80, int(arr.shape[0] * arr.shape[1] * 0.004))
    taken: set[tuple[int, int]] = set(blocked)
    found: list[dict[str, Any]] = []
    for kind, mask in _liquid_masks(arr):
        if int(mask.sum()) < minimum:
            continue
        # Shore water shares the square with the bank, so a lower share still counts.
        cutoff = 0.40 if kind == "water" else 0.62
        cells = _mask_cells(mask, scale_x, scale_y, ox, oy, grid, map_w, map_h, cutoff) - taken
        if not cells:
            continue
        taken.update(cells)
        found.append(
            {
                "kind": kind,
                "depth_ft": 5,
                "current_ft": 0,
                "current_deg": 0,
                "cells": [{"c": c, "r": r} for c, r in sorted(cells)],
            }
        )
    return found
