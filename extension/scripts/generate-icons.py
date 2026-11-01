"""Generates the extension's PNG icons.

Run from the extension folder:  python scripts/generate-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"
SIZES = (16, 32, 48, 128)

TEAL = (15, 118, 110, 255)
TEAL_LIGHT = (204, 251, 241, 255)
WHITE = (255, 255, 255, 255)
LINE = (13, 100, 93, 255)


def make_icon(size: int) -> Image.Image:
    scale = 8
    s = size * scale
    image = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.24), fill=TEAL)

    body = [int(s * 0.20), int(s * 0.20), int(s * 0.80), int(s * 0.86)]
    draw.rounded_rectangle(body, radius=int(s * 0.09), fill=WHITE)

    clip_w, clip_h = int(s * 0.30), int(s * 0.13)
    cx = s // 2
    draw.rounded_rectangle(
        [cx - clip_w // 2, int(s * 0.125), cx + clip_w // 2, int(s * 0.125) + clip_h],
        radius=int(clip_h * 0.4),
        fill=TEAL_LIGHT,
    )

    line_h = max(scale, int(s * 0.045))
    for index, width in enumerate((0.36, 0.28, 0.20)):
        y = int(s * (0.42 + index * 0.13))
        draw.rounded_rectangle(
            [int(s * 0.30), y, int(s * (0.30 + width)), y + line_h],
            radius=line_h // 2,
            fill=LINE,
        )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        path = OUT_DIR / f"icon{size}.png"
        make_icon(size).save(path, "PNG")
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
