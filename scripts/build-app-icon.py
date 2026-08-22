#!/usr/bin/env python3
"""Renders the Kas Will app icon: a Kaspa-style faceted K on a dark rounded square.

Draws at 4096px and downsamples to 1024 for crisp anti-aliasing. Run from the
repo root:  python3 scripts/build-app-icon.py  (writes build/app-icon-1024.png)
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
SS = 4  # supersample factor
W = SIZE * SS
OUT = Path(__file__).resolve().parent.parent / "build" / "app-icon-1024.png"

# Kaspa-inspired palette: near-black navy ground, shard-blue gradient mark.
BG_TOP = (10, 15, 30)
BG_BOTTOM = (16, 24, 46)
K_LIGHT = (98, 217, 255)
K_DEEP = (36, 80, 240)
GLOW = (46, 107, 255)
BLOCK = (79, 168, 255)

SHIFT_X = -18  # bbox of the mark sits slightly right of the canvas center; nudge for optical centering
STEM = [(272, 236), (420, 236), (420, 792), (272, 792)]
ARM_UP = [(452, 512), (452, 388), (788, 236), (788, 352)]
ARM_DOWN = [(452, 512), (452, 636), (788, 788), (788, 672)]
STEM = [(x + SHIFT_X, y) for x, y in STEM]
ARM_UP = [(x + SHIFT_X, y) for x, y in ARM_UP]
ARM_DOWN = [(x + SHIFT_X, y) for x, y in ARM_DOWN]
BLOCKS = [(168, 836), (232, 784), (806, 196), (846, 252), (150, 772), (836, 148)]


def scale(points):
    return [(x * SS, y * SS) for x, y in points]


def diagonal_gradient(w, h, top_left, bottom_right):
    """Per-pixel gradient along the TL->BR diagonal."""
    yy, xx = np.mgrid[0:h, 0:w]
    t = (xx / w + yy / h) / 2.0
    top_left = np.array(top_left, dtype=float)
    bottom_right = np.array(bottom_right, dtype=float)
    field = (1.0 - t)[..., None] * top_left + t[..., None] * bottom_right
    return Image.fromarray(field.astype(np.uint8), "RGB")


def radial_glow(w, h, center, radius, color, strength):
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt((xx - center[0]) ** 2 + (yy - center[1]) ** 2) / radius
    a = np.clip(1.0 - d, 0.0, 1.0) ** 2 * strength
    layer = np.zeros((h, w, 4), dtype=np.uint8)
    layer[..., 0], layer[..., 1], layer[..., 2] = color
    layer[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(layer, "RGBA")


def main() -> None:
    # Ground: diagonal navy gradient plus a faint blue bloom behind the mark.
    icon = diagonal_gradient(W, W, BG_TOP, BG_BOTTOM).convert("RGBA")
    icon.alpha_composite(radial_glow(W, W, (W * 0.62, W * 0.78), W * 0.75, GLOW, 0.20))
    icon.alpha_composite(radial_glow(W, W, (W * 0.20, W * 0.10), W * 0.65, (90, 140, 255), 0.10))

    draw = ImageDraw.Draw(icon)
    # BlockDAG hint: a few faint blocks trailing off the mark.
    for index, (bx, by) in enumerate(BLOCKS):
        s = 30 * SS - index * SS
        alpha = 46 - index * 5
        draw.polygon(
            [(bx * SS, by * SS), ((bx + s / SS) * SS, by * SS), ((bx + s / SS) * SS, (by + s / SS) * SS), (bx * SS, (by + s / SS) * SS)],
            fill=(*BLOCK, alpha),
        )

    shards = [scale(STEM), scale(ARM_UP), scale(ARM_DOWN)]
    # Soft halo behind the K.
    halo = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(halo).polygon([p for shard in shards for p in shard], fill=(*GLOW, 235))
    halo = halo.filter(ImageFilter.GaussianBlur(58 * SS))
    halo.putalpha(halo.getchannel("A").point(lambda a: int(a * 0.5)))
    icon.alpha_composite(halo)

    # The mark: one continuous shard gradient, then per-shard facet tints.
    mark = Image.new("L", (W, W), 0)
    mark_draw = ImageDraw.Draw(mark)
    for shard in shards:
        mark_draw.polygon(shard, fill=255)
    gradient = diagonal_gradient(W, W, K_LIGHT, K_DEEP).convert("RGBA")
    icon.paste(gradient, (0, 0), mark)

    facet_masks = []
    for shard in shards:
        facet = Image.new("L", (W, W), 0)
        ImageDraw.Draw(facet).polygon(shard, fill=255)
        facet_masks.append(facet)
    stem_tint = Image.new("RGBA", (W, W), (0, 0, 0, 26))   # slightly deeper
    up_tint = Image.new("RGBA", (W, W), (255, 255, 255, 30))  # lit facet
    down_tint = Image.new("RGBA", (W, W), (0, 0, 0, 34))   # shaded facet
    for facet, tint in zip(facet_masks, [stem_tint, up_tint, down_tint]):
        masked = Image.composite(tint, Image.new("RGBA", (W, W), (0, 0, 0, 0)), facet)
        icon.alpha_composite(masked)

    # Thin luminous rim inside the rounded square.
    radius = int(W * 226 / 1024)
    rim = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(rim).rounded_rectangle(
        [int(W * 0.012), int(W * 0.012), W - int(W * 0.012), W - int(W * 0.012)],
        radius=radius, outline=(150, 190, 255, 60), width=5 * SS,
    )
    icon.alpha_composite(rim)

    # Crop to the rounded square, downsample, save.
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, W - 1], radius=radius, fill=255)
    final = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    final.paste(icon, (0, 0), mask)
    final = final.resize((SIZE, SIZE), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
