"""Apply deterministic, hand-authored three-plane depth masks to the reference Z-map."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "references/ElGrayPimenovLeiterWindow2.png"
DEPTH = ROOT / "dist/assets/ElGrayPimenovLeiterWindow2-depth.png"
META = DEPTH.with_suffix(".json")
EVIDENCE = ROOT / "specs/evidence"

WIDTH, HEIGHT = 1024, 574
GLASS_LEFT = 658
LIGHT_SEARCH_LEFT = 940
FAR_DEPTH = 96
MID_DEPTH = 156
NEAR_DEPTH = 236
MIN_LIGHT_COMPONENT_AREA = 10
MAX_LIGHT_COMPONENT_AREA = 1200
MAX_LIGHT_COMPONENT_SIDE = 64
MAX_LIGHT_ASPECT_RATIO = 3.5
MAX_LIGHT_COVERAGE_PERCENT = 4.0
SHADER_BASELINE = 0.38
CAMERA_SHIFT = 0.045
SHADER_ITERATIONS = 7
SHADER_RELAXATION = 0.6
CANVAS_WIDTH = 1920

# The left edge follows the curved boundary between the city building and studio.
STUDIO_POLYGON = [(350, 0), (657, 0), (657, 573), (405, 573)]

# The presenter overlaps the building edge on the left; include that visible silhouette.
WOMAN_LEFT_EXTENSION = [
    (350, 190), (378, 184), (399, 205), (410, 255), (402, 320),
    (394, 382), (408, 445), (431, 500), (403, 525), (376, 486),
    (357, 430), (345, 350), (342, 278),
]

REGION_COLORS = {
    "far": (45, 126, 220),
    "midground": (245, 190, 45),
    "near": (222, 64, 164),
}


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def resized_source(source):
    return source.convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def filter_light_components(mask):
    """Keep compact light cores; reject long rain streaks and broad glass reflections."""
    width, height = mask.size
    source = bytearray(mask.tobytes())
    visited = bytearray(width * height)
    kept = bytearray(width * height)
    for start, value in enumerate(source):
        if not value or visited[start]:
            continue
        queue = [start]
        visited[start] = 1
        component = []
        cursor = 0
        min_x = max_x = start % width
        min_y = max_y = start // width
        while cursor < len(queue):
            index = queue[cursor]
            cursor += 1
            component.append(index)
            x, y = index % width, index // width
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            for dy in (-1, 0, 1):
                ny = y + dy
                if ny < 0 or ny >= height:
                    continue
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx = x + dx
                    if nx < LIGHT_SEARCH_LEFT or nx >= width:
                        continue
                    neighbor = ny * width + nx
                    if source[neighbor] and not visited[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)

        area = len(component)
        box_width, box_height = max_x - min_x + 1, max_y - min_y + 1
        aspect = max(box_width / box_height, box_height / box_width)
        if (
            MIN_LIGHT_COMPONENT_AREA <= area <= MAX_LIGHT_COMPONENT_AREA
            and max(box_width, box_height) <= MAX_LIGHT_COMPONENT_SIDE
            and aspect <= MAX_LIGHT_ASPECT_RATIO
        ):
            for index in component:
                kept[index] = 255
    return Image.frombytes("L", (width, height), bytes(kept))

def detect_right_side_lights(source):
    """Select compact, isolated light cores on the far-right side of the glass."""
    rgb = source.load()
    raw = Image.new("L", (WIDTH, HEIGHT), 0)
    output = raw.load()
    for y in range(HEIGHT):
        for x in range(LIGHT_SEARCH_LEFT, WIDTH):
            red, green, blue = rgb[x, y]
            red_core = (
                red >= 180
                and red - green >= 35
                and red - blue >= 25
                and red >= green * 1.22
            )
            warm_core = (
                red >= 200
                and green >= 80
                and green <= red * 0.78
                and blue <= 145
            )
            neutral_light = (
                x >= 980
                and min(red, green, blue) >= 210
                and max(red, green, blue) - min(red, green, blue) <= 45
            )
            blue_core = (
                x >= 980
                and blue >= 205
                and blue - red >= 30
                and blue - green >= 15
            )
            if red_core or warm_core or neutral_light or blue_core:
                output[x, y] = 255

    # Smooth single-pixel noise, then retain only compact light-shaped components.
    raw = raw.filter(ImageFilter.MedianFilter(3))
    raw = filter_light_components(raw)
    raw = raw.filter(ImageFilter.MaxFilter(3))

    # Keep the search area strictly behind the right-side glass boundary.
    pixels = raw.load()
    for y in range(HEIGHT):
        for x in range(LIGHT_SEARCH_LEFT):
            pixels[x, y] = 0
    return raw

def build_masks(source):
    image = resized_source(source)

    mid = Image.new("L", (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(mid)
    draw.polygon(STUDIO_POLYGON, fill=255)
    draw.polygon(WOMAN_LEFT_EXTENSION, fill=255)

    lights = detect_right_side_lights(image)
    mid_pixels = mid.load()
    light_pixels = lights.load()
    far = Image.new("L", (WIDTH, HEIGHT), 0)
    near = Image.new("L", (WIDTH, HEIGHT), 0)
    far_pixels = far.load()
    near_pixels = near.load()

    for y in range(HEIGHT):
        for x in range(WIDTH):
            if mid_pixels[x, y]:
                continue
            if x >= GLASS_LEFT and not light_pixels[x, y]:
                near_pixels[x, y] = 255
            else:
                far_pixels[x, y] = 255

    return image, {"far": far, "midground": mid, "near": near}, lights


def apply_manual_depth_planes(source, original_depth):
    if original_depth.size != (WIDTH, HEIGHT):
        raise ValueError(f"Expected a {WIDTH}x{HEIGHT} depth map, got {original_depth.size}")
    image, masks, lights = build_masks(source)
    result = Image.new("L", (WIDTH, HEIGHT), FAR_DEPTH)
    result_pixels = result.load()
    mask_pixels = {name: mask.load() for name, mask in masks.items()}
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if mask_pixels["near"][x, y]:
                result_pixels[x, y] = NEAR_DEPTH
            elif mask_pixels["midground"][x, y]:
                result_pixels[x, y] = MID_DEPTH
            else:
                result_pixels[x, y] = FAR_DEPTH
    return result, image, masks, lights


def percentile(values, fraction):
    if not values:
        return None
    return values[min(len(values) - 1, round((len(values) - 1) * fraction))]


def region_statistics(mask, depth, expected):
    mask_bytes = mask.tobytes()
    depth_bytes = depth.tobytes()
    values = sorted(depth_bytes[i] for i, active in enumerate(mask_bytes) if active)
    count = len(values)
    return {
        "pixel_count": count,
        "coverage_percent": round(count * 100 / (WIDTH * HEIGHT), 3),
        "expected_depth": expected,
        "min": values[0] if values else None,
        "p05": percentile(values, 0.05),
        "median": percentile(values, 0.50),
        "p95": percentile(values, 0.95),
        "max": values[-1] if values else None,
    }


def mask_centroid(mask):
    pixels = mask.load()
    count = sum_x = sum_y = 0
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if pixels[x, y]:
                count += 1
                sum_x += x
                sum_y += y
    if not count:
        return None
    return [round(sum_x / count), round(sum_y / count)]

def mask_sample_point(mask):
    """Return an active pixel nearest the centroid, not an empty centroid gap."""
    centroid = mask_centroid(mask)
    if centroid is None:
        return None
    pixels = mask.load()
    best = None
    best_distance = float("inf")
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if pixels[x, y]:
                distance = (x - centroid[0]) ** 2 + (y - centroid[1]) ** 2
                if distance < best_distance:
                    best, best_distance = [x, y], distance
    return best


def save_diagnostics(source, depth, masks, lights, report):
    EVIDENCE.mkdir(parents=True, exist_ok=True)

    before = EVIDENCE / "depth-before.png"
    if not before.exists():
        depth.save(before, optimize=True)

    source_rgba = source.convert("RGBA")
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_pixels = overlay.load()
    for name, mask in masks.items():
        color = REGION_COLORS[name]
        active = mask.load()
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if active[x, y]:
                    overlay_pixels[x, y] = (*color, 112)
    annotated = Image.alpha_composite(source_rgba, overlay)
    labels = ImageDraw.Draw(annotated)
    labels.rectangle((10, 10, 255, 104), fill=(0, 0, 0, 180))
    labels.text((20, 18), "FAR: house + right-side lights", fill=(*REGION_COLORS["far"], 255))
    labels.text((20, 44), "MID: studio + presenter", fill=(*REGION_COLORS["midground"], 255))
    labels.text((20, 70), "NEAR: rain-covered glass", fill=(*REGION_COLORS["near"], 255))
    annotated.convert("RGB").save(EVIDENCE / "depth-regions.png", optimize=True)

    color_depth = Image.new("RGB", (WIDTH, HEIGHT))
    color_pixels = color_depth.load()
    for name, mask in masks.items():
        active = mask.load()
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if active[x, y]:
                    color_pixels[x, y] = REGION_COLORS[name]
    color_depth.save(EVIDENCE / "depth-visualization.png", optimize=True)
    depth.save(EVIDENCE / "depth-after.png", optimize=True)

    # Plot the actual center-row depth profile; flat segments should match the three levels.
    chart = Image.new("RGB", (WIDTH, 320), "white")
    plot = ImageDraw.Draw(chart)
    top, bottom = 38, 276
    plot.text((16, 8), "Depth profile at y=287 (0=far, 255=near)", fill="black")
    for value in (0, 64, 96, 128, 156, 192, 236, 255):
        y = bottom - round(value / 255 * (bottom - top))
        plot.line((0, y, WIDTH - 1, y), fill=(225, 225, 225), width=1)
        plot.text((4, max(0, y - 12)), str(value), fill=(80, 80, 80))
    row = depth.load()
    previous = None
    for x in range(WIDTH):
        value = row[x, 287]
        point = (x, bottom - round(value / 255 * (bottom - top)))
        if previous:
            plot.line((previous, point), fill=(25, 25, 25), width=2)
        previous = point
    chart.save(EVIDENCE / "depth-profiles.png", optimize=True)

    report["diagnostics"] = {
        "regions_image": "specs/evidence/depth-regions.png",
        "depth_visualization": "specs/evidence/depth-visualization.png",
        "depth_profile": "specs/evidence/depth-profiles.png",
        "depth_before": "specs/evidence/depth-before.png",
        "depth_after": "specs/evidence/depth-after.png",
    }
    (EVIDENCE / "depth-report.json").write_text(json.dumps(report, indent=2) + "\n")


def provenance():
    return {
        "method": "hand_authored_three_plane_masks",
        "depth_values": {
            "far": FAR_DEPTH,
            "midground": MID_DEPTH,
            "near": NEAR_DEPTH,
        },
        "inverse_depth_semantics": "larger grayscale values are nearer",
        "geometry": {
            "studio_polygon": [list(point) for point in STUDIO_POLYGON],
            "woman_left_extension": [list(point) for point in WOMAN_LEFT_EXTENSION],
            "glass_left_x": GLASS_LEFT,
        },
        "right_side_lights": {
            "search_left_x": LIGHT_SEARCH_LEFT,
            "red_core": "R>=180, R-G>=35, R-B>=25, R>=1.22*G",
            "warm_core": "R>=200, G>=80, G<=0.78*R, B<=145",
            "neutral_light": "x>=980, min(R,G,B)>=210, channel_range<=45",
            "blue_core": "x>=980, B>=205, B-R>=30, B-G>=15",
            "minimum_component_area": MIN_LIGHT_COMPONENT_AREA,
            "maximum_component_area": MAX_LIGHT_COMPONENT_AREA,
            "maximum_component_side": MAX_LIGHT_COMPONENT_SIDE,
            "maximum_aspect_ratio": MAX_LIGHT_ASPECT_RATIO,
            "maximum_mask_coverage_percent": MAX_LIGHT_COVERAGE_PERCENT,
            "postprocessing": "3px median filter, compact connected-component filtering, 3px maximum filter",
        },
        "semantics": "Far: plain background, left house and visible right-side lights behind glass; midground: studio and presenter; near: glass, water droplets and rain.",
        "script_sha256": sha256(Path(__file__)),
    }



def expected_displacement(value):
    convergence = 1 - (1 - SHADER_RELAXATION) ** SHADER_ITERATIONS
    depth_delta = abs(value / 255 - SHADER_BASELINE)
    return round(depth_delta * 2 * CAMERA_SHIFT * CANVAS_WIDTH * convergence, 1)


def make_report(depth, masks, lights):
    stats = {
        "far": region_statistics(masks["far"], depth, FAR_DEPTH),
        "midground": region_statistics(masks["midground"], depth, MID_DEPTH),
        "near": region_statistics(masks["near"], depth, NEAR_DEPTH),
    }
    centroid = mask_centroid(lights)
    light_sample = mask_sample_point(lights)
    report = {
        "passed": True,
        "size": [WIDTH, HEIGHT],
        "depth_order": [FAR_DEPTH, MID_DEPTH, NEAR_DEPTH],
        "expected_displacement_between_camera_extremes_px": {
            "far": expected_displacement(FAR_DEPTH),
            "midground": expected_displacement(MID_DEPTH),
            "near": expected_displacement(NEAR_DEPTH),
        },
        "shader_parameters": {
            "depth_baseline": SHADER_BASELINE,
            "camera_shift": CAMERA_SHIFT,
            "iterations": SHADER_ITERATIONS,
            "relaxation": SHADER_RELAXATION,
            "canvas_width_px": CANVAS_WIDTH,
        },
        "regions": stats,
        "right_side_lights": {
            "pixel_count": sum(1 for value in lights.tobytes() if value),
            "centroid": centroid,
            "bbox": list(lights.getbbox()) if lights.getbbox() else None,
            "assigned_depth": FAR_DEPTH,
        },
        "sample_points": {
            "left_house": {"xy": [160, 250], "expected_depth": FAR_DEPTH},
            "studio": {"xy": [620, 100], "expected_depth": MID_DEPTH},
            "presenter": {"xy": [510, 260], "expected_depth": MID_DEPTH},
            "glass": {"xy": [720, 250], "expected_depth": NEAR_DEPTH},
            "right_side_light": {"xy": light_sample, "expected_depth": FAR_DEPTH},
        },
        "checks": {
            "three_distinct_levels": len(set((FAR_DEPTH, MID_DEPTH, NEAR_DEPTH))) == 3,
            "far_less_than_mid_less_than_near": FAR_DEPTH < MID_DEPTH < NEAR_DEPTH,
            "masks_partition_image": sum(item["pixel_count"] for item in stats.values()) == WIDTH * HEIGHT,
            "right_side_lights_detected": bool(centroid),
            "right_side_lights_excluded_from_near": True,
            "parallax_ordering": (
                expected_displacement(NEAR_DEPTH)
                > expected_displacement(MID_DEPTH)
                > expected_displacement(FAR_DEPTH)
            ),
        },
    }
    return report


def validate(source, depth, metadata):
    image, masks, lights = build_masks(source)
    if depth.mode != "L" or depth.size != (WIDTH, HEIGHT):
        raise ValueError("Depth map must be an 8-bit grayscale 1024x574 PNG")
    report = make_report(depth, masks, lights)
    if not report["checks"]["far_less_than_mid_less_than_near"]:
        raise ValueError("Depth levels are not ordered far < midground < near")
    if not report["checks"]["masks_partition_image"]:
        raise ValueError("Depth masks do not partition the full image")
    if not report["checks"]["parallax_ordering"]:
        raise ValueError("Expected parallax displacement is not ordered near > midground > far")
    if not report["checks"]["right_side_lights_detected"]:
        raise ValueError("No right-side background lights were detected; review the light mask")
    light_count = report["right_side_lights"]["pixel_count"]
    light_bbox = report["right_side_lights"]["bbox"]
    if light_count < 50:
        raise ValueError("The right-side background-light mask is unexpectedly small")
    if light_count > WIDTH * HEIGHT * MAX_LIGHT_COVERAGE_PERCENT / 100:
        raise ValueError("The right-side light mask covers too much of the glass; inspect the light segmentation")
    if not light_bbox or light_bbox[0] < LIGHT_SEARCH_LEFT:
        raise ValueError("The right-side light mask escaped its restricted search region")
    near_bytes = masks["near"].tobytes()
    light_bytes = lights.tobytes()
    if any(near and light for near, light in zip(near_bytes, light_bytes)):
        raise ValueError("Right-side background lights overlap the foreground glass mask")

    for name, mask in masks.items():
        expected = {"far": FAR_DEPTH, "midground": MID_DEPTH, "near": NEAR_DEPTH}[name]
        values = depth.tobytes()
        active = mask.tobytes()
        if any(value != expected for value, selected in zip(values, active) if selected):
            raise ValueError(f"{name} mask contains pixels outside its fixed depth level")

    samples = report["sample_points"]
    depth_pixels = depth.load()
    for name, sample in samples.items():
        x, y = sample["xy"]
        if x is None or y is None or depth_pixels[x, y] != sample["expected_depth"]:
            raise ValueError(f"Sample point {name} does not have its expected depth")

    if metadata.get("source_sha256") != sha256(SOURCE):
        raise ValueError("Reference source checksum does not match depth metadata")
    if metadata.get("depth_sha256") != sha256(DEPTH):
        raise ValueError("Depth-map checksum does not match metadata")
    if metadata.get("generator_sha256") != sha256(ROOT / "scripts/make_reference_depth.py"):
        raise ValueError("Reference-depth generator checksum is stale")
    if metadata.get("manual_depth_planes") != provenance():
        raise ValueError("Manual depth-plane provenance is stale")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate the committed map and evidence without modifying files.")
    args = parser.parse_args()

    source = Image.open(SOURCE).convert("RGB")
    original = Image.open(DEPTH).convert("L")
    if args.check:
        metadata = json.loads(META.read_text())
        report = validate(source, original, metadata)
        report_path = EVIDENCE / "depth-report.json"
        if not report_path.is_file():
            raise SystemExit("Missing depth evidence report")
        stored_report = json.loads(report_path.read_text())
        if stored_report.get("depth_sha256") != metadata.get("depth_sha256"):
            raise SystemExit("Depth evidence report checksum is stale")
        if stored_report.get("regions") != report.get("regions"):
            raise SystemExit("Depth evidence report statistics are stale")
        print(json.dumps(report, indent=2))
        return

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    before = EVIDENCE / "depth-before.png"
    if not before.exists():
        existing_preview = EVIDENCE / "current-depth.png"
        if existing_preview.is_file():
            with Image.open(existing_preview) as prior:
                prior.convert("L").save(before, optimize=True)
        else:
            original.save(before, optimize=True)

    corrected, preview, masks, lights = apply_manual_depth_planes(source, original)
    corrected.save(DEPTH, optimize=True)
    metadata = json.loads(META.read_text())
    metadata["depth_sha256"] = sha256(DEPTH)
    metadata["generator_sha256"] = sha256(ROOT / "scripts/make_reference_depth.py")
    metadata.pop("glass_postprocess", None)
    metadata["manual_depth_planes"] = provenance()
    META.write_text(json.dumps(metadata, indent=2) + "\n")
    report = validate(source, corrected, metadata)
    report["depth_sha256"] = metadata["depth_sha256"]
    report["source_sha256"] = sha256(SOURCE)
    save_diagnostics(preview, corrected, masks, lights, report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
