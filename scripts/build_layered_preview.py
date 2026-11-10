"""Assemble the full layered-glass site under ignored output/ for local review."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from glass_geometry import write_runtime_module

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

    # Geometry is exported from the same normalized configuration used by
    # alpha generation. The drawing module consumes this data at runtime.
    write_runtime_module(OUTPUT / "glass-geometry.js")

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
