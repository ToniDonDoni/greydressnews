"""Apply the reviewed base-scene polygons to a raw neural depth candidate."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "test/glass_layers.json"


def main() -> None:
    config = json.loads(CONFIG.read_text())
    width, height = config["canvas"]
    raw_path = ROOT / "output/glass_review/base-raw-depth.png"
    raw = Image.open(raw_path).convert("L").resize((width, height), Image.Resampling.BILINEAR)
    result = raw.copy()
    overlay = Image.open(ROOT / config["sources"]["base"]).convert("RGBA")
    target_gray = config["depths"]
    colors = {
        "left_city": (52, 139, 239),
        "studio": (157, 113, 229),
        "presenter": (239, 89, 145),
        "laptop": (64, 208, 199),
        "ticker": (255, 219, 86),
    }
    for region in target_gray["regions"]:
        mask = Image.new("L", (width, height), 0)
        ImageDraw.Draw(mask).polygon([tuple(point) for point in region["points"]], fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(1.0))
        value = round(236 - (region["depth"] - 1) * 140 / 99)
        flat = Image.new("L", (width, height), value)
        result = Image.composite(flat, result, mask)
        tint = Image.new("RGBA", (width, height), (*colors[region["id"]], 92))
        overlay = Image.composite(tint, overlay, mask)
    out = ROOT / "output/glass_review/scene-depth.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    result.save(out, optimize=True)
    overlay.save(ROOT / "output/glass_review/scene-depth-overlay.png", optimize=True)
    print(f"Wrote {out.relative_to(ROOT)} ({width}x{height}); source remains unchanged")


if __name__ == "__main__":
    main()
