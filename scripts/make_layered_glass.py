"""Bake a deterministic artist-controlled RGBA glass layer from reviewed settings."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "test/glass_layers.json"
OUTPUT = ROOT / "output/glass_review"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    config = json.loads(CONFIG.read_text())
    base_path = ROOT / config["sources"]["base"]
    donor_path = ROOT / config["sources"]["glass"]
    base = Image.open(base_path).convert("RGB")
    donor = Image.open(donor_path).convert("RGB")
    size = tuple(config["canvas"])
    if base.size != size or donor.size != size:
        raise ValueError("Base and donor must match the configured canvas")

    pane = Image.new("L", size, 0)
    draw = ImageDraw.Draw(pane)
    geometry = config["pane"]
    draw.rectangle((geometry["left"], 0, geometry["right"] - 1, size[1] - 1), fill=255)
    feather = int(geometry["feather"])
    if feather:
        pane = pane.filter(ImageFilter.GaussianBlur(feather / 2))
        # Keep pane content at the screen edge while feathering only the seam.
        p = np.asarray(pane).copy()
        p[:, geometry["left"] + feather :] = 255
        pane = Image.fromarray(p)

    gray = donor.convert("L")
    radius = int(config["glass_alpha"]["detail_radius"])
    low = np.asarray(gray.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255
    image = np.asarray(donor, dtype=np.float32) / 255
    luminance = np.asarray(gray, dtype=np.float32) / 255
    red = image[..., 0]
    green = image[..., 1]
    blue = image[..., 2]
    detail = np.abs(luminance - low)
    settings = config["glass_alpha"]
    pane_a = np.asarray(pane, dtype=np.float32) / 255

    reflection_mask = Image.new("L", size, 0)
    ImageDraw.Draw(reflection_mask).polygon(settings["reflection_polygon"], fill=255)
    reflection_mask = reflection_mask.filter(ImageFilter.GaussianBlur(settings["region_feather"]))
    reflection = np.asarray(reflection_mask, dtype=np.float32) / 255
    warm_windows = np.clip((red - blue - 0.07) / 0.28, 0, 1)
    warm_windows *= np.clip((green - blue - 0.025) / 0.24, 0, 1)
    warm_windows *= np.clip((luminance - 0.18) / 0.34, 0, 1)
    warm_windows *= reflection
    streak_mask = Image.new("L", size, 0)
    ImageDraw.Draw(streak_mask).polygon(settings["red_streak_polygon"], fill=255)
    streak_mask = streak_mask.filter(ImageFilter.GaussianBlur(settings["region_feather"]))
    streak = np.asarray(streak_mask, dtype=np.float32) / 255

    cleanup = Image.new("L", size, 0)
    cleanup_draw = ImageDraw.Draw(cleanup)
    for polygon in settings["clean_exclusions"]:
        cleanup_draw.polygon(polygon, fill=255)
    cleanup = cleanup.filter(ImageFilter.GaussianBlur(1))
    keep = 1 - np.asarray(cleanup, dtype=np.float32) / 255

    # Local contrast selects donor detail while the editable region masks keep
    # low-frequency reflection and tint independently controllable.
    detail_alpha = np.clip(
        (detail - settings["detail_threshold"]) / settings["detail_range"], 0, 1
    ) * settings["detail_high"]
    alpha = np.maximum(settings["tint"], detail_alpha)
    alpha = np.maximum(alpha, reflection * settings["reflection_opacity"])
    alpha = np.maximum(alpha, warm_windows * settings["warm_window_opacity"])
    alpha = np.maximum(alpha, streak * settings["streak_opacity"])
    alpha *= pane_a * keep

    rgba = np.dstack((image, alpha))
    rgba8 = np.clip(rgba * 255 + 0.5, 0, 255).astype(np.uint8)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    layer_path = OUTPUT / "glass-layer.png"
    alpha_path = OUTPUT / "glass-alpha.png"
    Image.fromarray(rgba8, "RGBA").save(layer_path, optimize=True)
    Image.fromarray(np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8), "L").save(alpha_path)

    # Diagnostic neutral composite at rest, intentionally not a pixel match to
    # the flattened reference because the underlying scene now remains visible.
    def linear(rgb: np.ndarray) -> np.ndarray:
        return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)

    def srgb(rgb: np.ndarray) -> np.ndarray:
        return np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.maximum(rgb, 0) ** (1 / 2.4) - 0.055)

    base_linear = linear(np.asarray(base, dtype=np.float32) / 255)
    donor_linear = linear(image)
    preview_alpha = alpha * settings["default_opacity"]
    composite_linear = base_linear * (1 - preview_alpha[..., None]) + donor_linear * preview_alpha[..., None]
    composite_rgb = srgb(composite_linear)
    Image.fromarray(np.clip(composite_rgb * 255 + 0.5, 0, 255).astype(np.uint8), "RGB").save(
        OUTPUT / "glass-composite.png"
    )
    report = {
        "canvas": list(size),
        "default_opacity": settings["default_opacity"],
        "source_sha256": {"base": digest(base_path), "donor": digest(donor_path), "settings": digest(CONFIG)},
        "output_sha256": {"rgba": digest(layer_path), "alpha": digest(alpha_path)},
        "alpha_coverage": {
            "zero": int(np.count_nonzero(alpha == 0)),
            "partial": int(np.count_nonzero((alpha > 0) & (alpha < 1))),
            "opaque": int(np.count_nonzero(alpha == 1)),
            "percentiles": [float(value) for value in np.percentile(alpha, [0, 25, 50, 75, 95, 100])],
        },
        "limitations": "Artist-controlled approximate alpha; donor RGB is not physically unmatted.",
    }
    (OUTPUT / "glass-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
