"""Assemble a local layered-glass preview from the committed site under output/."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUTPUT = ROOT / "output/site_preview_layered_glass"
ASSETS = OUTPUT / "assets"
GLASS_REVIEW = ROOT / "output/glass_review"


def require(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"Missing preview input: {path.relative_to(ROOT)}")


def main() -> None:
    for name in ("scene-depth.png", "glass-layer.png", "glass-runtime.png", "glass-alpha.png", "glass-composite.png"):
        require(GLASS_REVIEW / name)
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(DIST, OUTPUT)

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
        "source": "dist/",
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
