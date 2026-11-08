"""Apply the editable depth-region configuration to a neural depth PNG."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from test.render_depth_regions import load_map  # noqa: E402

DEFAULT_MAP = ROOT / "test/depth_regions.json"


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def portable_label(path):
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return path.name


def grayscale_for_depth(depth, data):
    scale = data["depth_scale"]
    bake = data["depth_bake"]
    near_depth, far_depth = scale["nearest"], scale["farthest"]
    near_gray, far_gray = bake["inverse_gray_at_nearest"], bake["inverse_gray_at_farthest"]
    fraction = (depth - near_depth) / (far_depth - near_depth)
    return round(near_gray + fraction * (far_gray - near_gray))


def region_alpha(region, reference_size, output_size):
    mask = Image.new("L", tuple(reference_size), 0)
    draw = ImageDraw.Draw(mask)
    geometry = region["geometry"]
    if geometry["type"] == "polygon":
        draw.polygon([tuple(point) for point in geometry["points"]], fill=255)
    elif geometry["type"] == "ellipse":
        x, y = geometry["center"]
        rx, ry = geometry["radius"]
        draw.ellipse((x - rx, y - ry, x + rx, y + ry), fill=255)
    else:
        raise ValueError(f"Unknown geometry type: {region['id']}")
    if mask.size != output_size:
        mask = mask.resize(output_size, Image.Resampling.LANCZOS)
    return np.asarray(mask, dtype=np.float32) / 255.0


def corrected_depth(neural_depth, data):
    if neural_depth.mode != "L":
        raise ValueError("Input depth must be an 8-bit grayscale PNG")
    reference_width, reference_height = data["reference_size"]
    if abs(neural_depth.width / neural_depth.height - reference_width / reference_height) > 0.01:
        raise ValueError("Input depth aspect ratio differs from the reference by more than 1%")
    raw = np.asarray(neural_depth, dtype=np.float32)
    result = raw.copy()
    uncovered = np.ones(raw.shape, dtype=np.float32)
    regions = {region["id"]: region for region in data["regions"]}
    report_regions = []
    for region_id in data["depth_bake"]["write_order"]:
        region = regions[region_id]
        alpha = region_alpha(region, data["reference_size"], neural_depth.size)
        selected = alpha >= 0.5
        if not selected.any():
            raise ValueError(f"Region has no pixels at this depth-map size: {region_id}")
        neural_median = float(np.median(raw[selected]))
        target_gray = grayscale_for_depth(region["depth"], data)
        detail_strength = region.get("neural_detail_strength", 0.0)
        corrected = np.clip(target_gray + detail_strength * (raw - neural_median), 0, 255)
        result = result * (1 - alpha) + corrected * alpha
        uncovered *= 1 - alpha
        report_regions.append({
            "id": region_id,
            "depth": region["depth"],
            "target_inverse_gray": target_gray,
            "neural_median_gray": round(neural_median, 2),
            "neural_detail_strength": detail_strength,
            "mask_coverage_percent": round(float(selected.mean()) * 100, 3),
        })
    output = Image.fromarray(np.rint(np.clip(result, 0, 255)).astype(np.uint8))
    return output, {
        "regions": report_regions,
        "covered_percent": round(float((uncovered < 0.01).mean()) * 100, 3),
        "inverse_gray_range": {
            "nearest": data["depth_bake"]["inverse_gray_at_nearest"],
            "farthest": data["depth_bake"]["inverse_gray_at_farthest"],
        },
    }


def run(photo_path, input_depth_path, map_path, output_path, report_path=None):
    inputs = {photo_path.resolve(), input_depth_path.resolve(), map_path.resolve()}
    if output_path.resolve() in inputs:
        raise ValueError("The corrected output must not overwrite an input")
    if report_path is None:
        report_path = output_path.with_suffix(".json")
    if report_path.resolve() in inputs or report_path.resolve() == output_path.resolve():
        raise ValueError("The report must have its own path")
    data = load_map(map_path)
    if "depth_bake" not in data:
        raise ValueError("The region map does not define depth_bake settings")
    with Image.open(photo_path) as photo:
        photo_size = photo.size
    reference_width, reference_height = data["reference_size"]
    if abs(photo_size[0] / photo_size[1] - reference_width / reference_height) > 0.01:
        raise ValueError("Photo aspect ratio differs from the region map by more than 1%")
    with Image.open(input_depth_path) as source:
        if source.format != "PNG":
            raise ValueError("Input depth must be a PNG")
        corrected, details = corrected_depth(source, data)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    corrected.save(output_path, optimize=True)
    report = {
        "method": "semantic_regions_over_neural_depth",
        "photo": portable_label(photo_path),
        "photo_size": list(photo_size),
        "input_depth": portable_label(input_depth_path),
        "output_depth": portable_label(output_path),
        "map": portable_label(map_path),
        "input_sha256": sha256(input_depth_path),
        "photo_sha256": sha256(photo_path),
        "map_sha256": sha256(map_path),
        "output_sha256": sha256(output_path),
        "output_size": list(corrected.size),
        "semantics": "8-bit inverse grayscale; larger values are nearer",
        **details,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=True, indent=2) + "\n", encoding="ascii")
    return output_path, report_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--photo", required=True, type=Path, help="Photograph used for neural depth generation")
    parser.add_argument("--input-depth", required=True, type=Path, help="Uncorrected 8-bit neural depth PNG")
    parser.add_argument("--map", type=Path, default=DEFAULT_MAP, help="Editable region configuration")
    parser.add_argument("--output", required=True, type=Path, help="Corrected depth PNG to write")
    parser.add_argument("--report", type=Path, help="JSON report path; defaults beside output PNG")
    args = parser.parse_args()
    output_path, report_path = run(args.photo, args.input_depth, args.map, args.output, args.report)
    print(f"Wrote {output_path}")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
