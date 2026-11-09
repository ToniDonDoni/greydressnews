"""Validate the committed semantic-region reference depth map without ML."""

import hashlib
import json
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "test/depth_regions.json"
DEPTH = ROOT / "dist/assets/ElGrayPimenovLeiterWindow2-depth.png"
META = ROOT / "dist/assets/ElGrayPimenovLeiterWindow2-depth.json"
REPORT = ROOT / "specs/evidence/depth-report-semantic.json"
SOURCE = ROOT / "references/ElGrayPimenovLeiterWindow2.png"
INPUT_DEPTH = ROOT / "specs/evidence/depth-before.png"


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def target_gray(depth, data):
    scale = data["depth_scale"]
    bake = data["depth_bake"]
    fraction = (depth - scale["nearest"]) / (scale["farthest"] - scale["nearest"])
    return round(bake["inverse_gray_at_nearest"]
                 + fraction * (bake["inverse_gray_at_farthest"] - bake["inverse_gray_at_nearest"]))


def depth_xy(reference_point, reference_size, depth_size):
    x, y = reference_point
    return (
        min(depth_size[0] - 1, max(0, round(x / reference_size[0] * depth_size[0] - 0.5))),
        min(depth_size[1] - 1, max(0, round(y / reference_size[1] * depth_size[1] - 0.5))),
    )


def main():
    data = json.loads(MAP.read_text(encoding="utf-8"))
    metadata = json.loads(META.read_text(encoding="utf-8"))
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    semantic = metadata.get("semantic_regions")
    if semantic is None:
        raise SystemExit("Depth metadata is missing semantic_regions")
    if semantic.get("method") != "semantic_regions_over_neural_depth":
        raise SystemExit("Depth metadata uses an unexpected semantic-region method")
    if metadata.get("depth_sha256") != sha256(DEPTH):
        raise SystemExit("Depth metadata checksum is stale")
    if metadata.get("source_sha256") != sha256(SOURCE):
        raise SystemExit("Source checksum is stale")
    if metadata.get("generator_sha256") != sha256(ROOT / "scripts/apply_depth_regions.py"):
        raise SystemExit("Depth generator checksum is stale")
    if semantic.get("map_sha256") != sha256(MAP):
        raise SystemExit("Region-map checksum is stale")
    if semantic.get("input_sha256") != sha256(INPUT_DEPTH):
        raise SystemExit("Input-depth checksum is stale")
    if report.get("depth_sha256") != sha256(DEPTH):
        raise SystemExit("Semantic evidence report checksum is stale")
    if report.get("map_sha256") != sha256(MAP):
        raise SystemExit("Semantic evidence report map checksum is stale")
    if report.get("source_sha256") != sha256(SOURCE):
        raise SystemExit("Semantic evidence report source checksum is stale")

    with Image.open(DEPTH) as image:
        if image.mode != "L":
            raise SystemExit("Depth map must be 8-bit grayscale")
        if image.size != tuple(data["reference_size"]):
            if image.size != (1024, 574):
                raise SystemExit(f"Unexpected depth-map size: {image.size}")
        pixels = image.load()
        depth_size = image.size
        for region in data["regions"]:
            if not region["id"].startswith("light_"):
                continue
            geometry = region["geometry"]
            if geometry["type"] != "ellipse":
                raise SystemExit(f"Light region is not an ellipse: {region['id']}")
            x, y = depth_xy(geometry["center"], data["reference_size"], depth_size)
            expected = target_gray(region["depth"], data)
            if pixels[x, y] != expected:
                raise SystemExit(
                    f"{region['id']} center is {pixels[x, y]}, expected {expected}"
                )
            radius = min(geometry["radius"])
            pixel_radius = radius / data["reference_size"][0] * depth_size[0]
            if pixel_radius < 1:
                raise SystemExit(f"{region['id']} is smaller than one depth pixel")

        for name, sample in report["sample_points"].items():
            x, y = sample["xy"]
            if not (0 <= x < depth_size[0] and 0 <= y < depth_size[1]):
                raise SystemExit(f"Sample point is outside the depth map: {name}")
            if pixels[x, y] != sample["expected_depth"]:
                raise SystemExit(
                    f"Sample point {name} is {pixels[x, y]}, expected {sample['expected_depth']}"
                )

    print("Semantic reference depth map is valid: hashes, light centers, and sample points match.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
