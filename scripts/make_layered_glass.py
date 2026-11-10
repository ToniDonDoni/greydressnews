"""Prepare the pane-only alpha layer and deterministic review composites."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "test/glass_layers.json"
OUTPUT = ROOT / "output/glass_review"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def linearize(rgb: np.ndarray) -> np.ndarray:
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def encode_srgb(rgb: np.ndarray) -> np.ndarray:
    return np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.maximum(rgb, 0) ** (1 / 2.4) - 0.055)


def pane_alpha(canvas: tuple[int, int], pane: dict) -> np.ndarray:
    width, height = canvas
    left, right = int(pane["left"]), int(pane["right"])
    top, bottom = int(pane["top"]), int(pane["bottom"])
    if not (0 <= left < right <= width and 0 <= top < bottom <= height):
        raise ValueError("Pane coordinates must fit the full-frame canvas")
    alpha = np.zeros((height, width), dtype=np.uint8)
    alpha[top:bottom, left:right] = 255
    return alpha


def linear_premultiplied(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    return linearize(rgb) * (alpha.astype(np.float32)[..., None] / 255)


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    width, height = config["canvas"]
    base_path = ROOT / config["sources"]["base"]
    donor_path = ROOT / config["sources"]["glass"]
    with Image.open(base_path) as source:
        base = np.asarray(source.convert("RGB"), dtype=np.float32) / 255
    with Image.open(donor_path) as source:
        donor = np.asarray(source.convert("RGB"), dtype=np.float32) / 255
    if base.shape[:2] != (height, width) or donor.shape[:2] != (height, width):
        raise ValueError("Base and glass donor must match the configured full-frame canvas")

    pane = config["pane"]
    left, right = int(pane["left"]), int(pane["right"])
    top, bottom = int(pane["top"]), int(pane["bottom"])
    alpha = pane_alpha((width, height), pane)
    inside = alpha > 0
    straight_rgb = np.zeros_like(donor, dtype=np.uint8)
    straight_rgb[inside] = np.clip(np.rint(donor[inside] * 255), 0, 255).astype(np.uint8)
    editable = np.dstack((straight_rgb, alpha))
    editable_path = OUTPUT / "glass-layer.png"
    alpha_path = OUTPUT / "glass-alpha.png"
    runtime_path = OUTPUT / "glass-runtime.png"
    composite_path = OUTPUT / "glass-composite.png"
    OUTPUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(editable, "RGBA").save(editable_path, optimize=True)
    Image.fromarray(alpha, "L").save(alpha_path, optimize=True)

    # Runtime RGB is linear-light and premultiplied. Upload it without another
    # colorspace conversion or implicit alpha premultiplication.
    premultiplied = linear_premultiplied(donor, alpha)
    runtime = np.dstack((premultiplied, alpha.astype(np.float32) / 255))
    runtime8 = np.clip(np.rint(runtime * 255), 0, 255).astype(np.uint8)
    Image.fromarray(runtime8, "RGBA").save(runtime_path, optimize=True)

    base_linear = linearize(base)
    opacity = float(config["glass"]["default_opacity"])
    effective_alpha = (alpha.astype(np.float32) / 255) * opacity
    composite_linear = premultiplied * opacity + base_linear * (1 - effective_alpha[..., None])
    composite = np.clip(np.rint(encode_srgb(composite_linear) * 255), 0, 255).astype(np.uint8)
    Image.fromarray(composite, "RGB").save(composite_path, optimize=True)

    report = {
        "method": "single_full_pane_alpha",
        "canvas": [width, height],
        "pane": {"left": left, "right": right, "top": top, "bottom": bottom},
        "glass_depth": config["glass"]["authoring_depth"],
        "default_opacity": opacity,
        "source_sha256": {
            "base": digest(base_path),
            "donor": digest(donor_path),
            "settings": digest(CONFIG),
        },
        "output_sha256": {
            "straight_rgba": digest(editable_path),
            "alpha": digest(alpha_path),
            "linear_premultiplied_rgba8": digest(runtime_path),
            "neutral_composite": digest(composite_path),
        },
        "alpha_coverage": {
            "zero": int(np.count_nonzero(alpha == 0)),
            "opaque": int(np.count_nonzero(alpha == 255)),
            "partial": int(np.count_nonzero((alpha > 0) & (alpha < 255))),
        },
        "runtime_encoding": "linear-light premultiplied RGB and linear alpha in RGBA8; disable browser color conversion and upload premultiplication",
    }
    (OUTPUT / "glass-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
