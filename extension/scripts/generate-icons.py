"""Generates the extension's PNG icons from the project logo.

Source: branding/logo-512.png (rendered from branding/logo.svg)
Run from the extension folder:  python scripts/generate-icons.py
"""
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE = PROJECT_ROOT / "branding" / "logo-512.png"
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"
SIZES = (16, 32, 48, 128)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Logo not found at {SOURCE}. Render branding/logo-512.png first.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master = Image.open(SOURCE).convert("RGBA")
    for size in SIZES:
        icon = master.resize((size, size), Image.LANCZOS)
        target = OUT_DIR / f"icon{size}.png"
        icon.save(target, optimize=True)
        print(f"wrote {target.relative_to(PROJECT_ROOT)} ({size}x{size})")


if __name__ == "__main__":
    main()
