"""Assemble the full layered-glass site under ignored output/ for local review."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
SOURCE = ROOT / "scripts/layered_preview"
OUTPUT = ROOT / "output/site_preview_layered_glass"
ASSETS = OUTPUT / "assets"
GLASS_REVIEW = ROOT / "output/glass_review"


def require(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"Missing generated preview input: {path.relative_to(ROOT)}")


def main() -> None:
    for name in ("scene-depth.png", "glass-layer.png", "glass-runtime.png", "glass-alpha.png", "glass-composite.png"):
        require(GLASS_REVIEW / name)
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(DIST, OUTPUT)
    for name in ("index.html", "style.css", "parallax.js"):
        shutil.copy2(SOURCE / name, OUTPUT / name)

    # The existing drawing and music implementation is retained, with its
    # canvas and pane bounds registered to the new 1672 x 941 composition.
    ink = (DIST / "glass-ink.js").read_text(encoding="utf-8")
    replacements = {
        "const IMAGE = { width: 1920, height: 1077 };": "const IMAGE = { width: 1672, height: 941 };",
        "const GLASS = { left: 1240, top: 0, right: 1920, bottom: 970 };": "const GLASS = { left: 1095, top: 0, right: 1672, bottom: 941 };",
        "const HOUSE = { left: 0, top: 0, right: 720, bottom: 970 };": "const HOUSE = { left: 0, top: 0, right: 605, bottom: 941 };",
    }
    for old, new in replacements.items():
        if old not in ink:
            raise ValueError(f"Cannot register drawing geometry; expected source text missing: {old}")
        ink = ink.replace(old, new)
    (OUTPUT / "glass-ink.js").write_text(ink, encoding="utf-8")

    assets = {
        "no_logo.png": ROOT / "references/no_logo.png",
        "scene-depth.png": GLASS_REVIEW / "scene-depth.png",
        "glass-layer.png": GLASS_REVIEW / "glass-layer.png",
        "glass-runtime.png": GLASS_REVIEW / "glass-runtime.png",
        "glass-alpha.png": GLASS_REVIEW / "glass-alpha.png",
        "glass-composite.png": GLASS_REVIEW / "glass-composite.png",
    }
    for name, source in assets.items():
        shutil.copy2(source, ASSETS / name)
    report = {
        "source": "scripts/build_layered_preview.py",
        "preview": "output/site_preview_layered_glass",
        "depth": "output/glass_review/scene-depth.png",
        "glass": "output/glass_review/glass-runtime.png",
        "fallback": "output/glass_review/glass-composite.png",
    }
    (OUTPUT / "preview-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Built full local preview at {OUTPUT.relative_to(ROOT)}")
    print("The tracked dist/ directory was only read; it was not modified.")


if __name__ == "__main__":
    main()
