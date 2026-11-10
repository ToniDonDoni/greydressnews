"""Bake the layered preview's base-only depth from the reviewed region map."""

from pathlib import Path

from apply_depth_regions import run

ROOT = Path(__file__).resolve().parents[1]
PHOTO = ROOT / "references/no_logo.png"
RAW = ROOT / "output/glass_review/base-raw-depth.png"
REGIONS = ROOT / "test/depth_regions.json"
OUTPUT = ROOT / "output/glass_review/scene-depth.png"


def main() -> None:
    if not RAW.is_file():
        raise FileNotFoundError(
            f"Missing {RAW.relative_to(ROOT)}; generate raw depth from references/no_logo.png first"
        )
    output, report = run(PHOTO, RAW, REGIONS, OUTPUT)
    print(f"Wrote {output.relative_to(ROOT)}")
    print(f"Wrote {report.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
