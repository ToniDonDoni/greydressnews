"""Create compact previews of the checked-in reference and depth map for manual review."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "references/ElGrayPimenovLeiterWindow2.png"
DEPTH = ROOT / "dist/assets/ElGrayPimenovLeiterWindow2-depth.png"
OUT = ROOT / "specs/evidence"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with Image.open(SOURCE) as source:
        preview = source.convert("RGB")
        preview.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        preview.save(OUT / "reference-preview.jpg", quality=82, optimize=True)
    with Image.open(DEPTH) as depth:
        depth.convert("L").save(OUT / "current-depth.png", optimize=True)


if __name__ == "__main__":
    main()
