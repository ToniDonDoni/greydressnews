"""Export the canonical normalized glass geometry for browser runtime use."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "test/glass_layers.json"


def load_geometry(config_path: Path = CONFIG) -> dict[str, Any]:
    data = json.loads(config_path.read_text(encoding="utf-8"))
    geometry = data["geometry"]
    for name in ("pane", "house"):
        rect = geometry[name]
        if any(not 0 <= float(rect[key]) <= 1 for key in ("left", "right", "top", "bottom")):
            raise ValueError(f"{name} bounds must be normalized to 0..1")
        if rect["left"] >= rect["right"] or rect["top"] >= rect["bottom"]:
            raise ValueError(f"{name} bounds must have positive area")
    hint = geometry["hint"]
    for key in ("center_x", "center_y", "width", "height", "right_margin", "shadow_reserve"):
        if not 0 <= float(hint[key]) <= 1:
            raise ValueError(f"hint.{key} must be normalized to 0..1")
    if hint["width"] <= 0 or hint["height"] <= 0:
        raise ValueError("hint size must be positive")
    return geometry


def pixel_rect(rect: dict[str, float], width: int, height: int) -> dict[str, int]:
    """Convert a normalized, half-open rectangle to actual image pixel bounds."""
    if width <= 0 or height <= 0:
        raise ValueError("Image dimensions must be positive")
    return {
        # Match JavaScript Math.round for positive image-space coordinates.
        "left": math.floor(rect["left"] * width + 0.5),
        "right": math.floor(rect["right"] * width + 0.5),
        "top": math.floor(rect["top"] * height + 0.5),
        "bottom": math.floor(rect["bottom"] * height + 0.5),
    }


def runtime_module_text(config_path: Path = CONFIG) -> str:
    geometry = load_geometry(config_path)
    serialized = json.dumps(geometry, ensure_ascii=True, separators=(",", ":"))
    return f"'use strict';\nwindow.glassGeometry = Object.freeze({serialized});\n"


def write_runtime_module(output: Path, config_path: Path = CONFIG) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(runtime_module_text(config_path), encoding="utf-8")


if __name__ == "__main__":
    destination = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist/glass-geometry.js"
    write_runtime_module(destination)
    print(f"Wrote normalized glass geometry to {destination}")
