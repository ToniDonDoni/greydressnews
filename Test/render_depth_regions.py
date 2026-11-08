"""Render the editable depth-region draft over a reference-like photograph."""

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


MAP_PATH = Path(__file__).with_name("depth_regions.json")


def load_map(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1:
        raise ValueError("Unsupported depth-region map version")
    width, height = data["reference_size"]
    if width <= 0 or height <= 0:
        raise ValueError("Reference dimensions must be positive")
    if data["depth_scale"]["nearest"] != 1 or data["depth_scale"]["farthest"] != 100:
        raise ValueError("The review depth scale must run from nearest=1 to farthest=100")
    ids = set()
    for region in data["regions"]:
        region_id = region["id"]
        if region_id in ids:
            raise ValueError(f"Duplicate region ID: {region_id}")
        ids.add(region_id)
        if not 1 <= region["depth"] <= 100:
            raise ValueError(f"Depth must be between 1 and 100: {region_id}")
        if not 0 <= region["opacity"] <= 255:
            raise ValueError(f"Opacity must be between 0 and 255: {region_id}")
        if not 0 <= region.get("neural_detail_strength", 0) <= 1:
            raise ValueError(f"Neural detail strength must be between 0 and 1: {region_id}")
        geometry = region["geometry"]
        if geometry["type"] == "polygon":
            if len(geometry["points"]) < 3:
                raise ValueError(f"Polygon needs at least three points: {region_id}")
            coordinates = geometry["points"]
        elif geometry["type"] == "ellipse":
            if min(geometry["radius"]) <= 0:
                raise ValueError(f"Ellipse radii must be positive: {region_id}")
            coordinates = [geometry["center"]]
        else:
            raise ValueError(f"Unknown geometry type: {region_id}")
        if any(x < 0 or x > width or y < 0 or y > height for x, y in coordinates):
            raise ValueError(f"Region geometry is outside the reference image: {region_id}")
    legend_ids = [region_id for entry in data["legend"] for region_id in entry["region_ids"]]
    if set(legend_ids) != ids or len(legend_ids) != len(ids):
        raise ValueError("The legend must include every region exactly once")
    bake = data.get("depth_bake")
    if bake is not None:
        near_gray = bake["inverse_gray_at_nearest"]
        far_gray = bake["inverse_gray_at_farthest"]
        if not (0 <= far_gray < near_gray <= 255):
            raise ValueError("Inverse grayscale anchors must satisfy 0 <= far < near <= 255")
        write_order = bake["write_order"]
        if set(write_order) != ids or len(write_order) != len(ids):
            raise ValueError("Depth write order must include every region exactly once")
    return data


def font(size):
    for candidate in ("Arial Unicode.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def rgb(hex_color):
    return tuple(bytes.fromhex(hex_color.lstrip("#")))


def ellipse_box(geometry):
    x, y = geometry["center"]
    rx, ry = geometry["radius"]
    return (x - rx, y - ry, x + rx, y + ry)


def geometry_points(geometry):
    if geometry["type"] == "polygon":
        return [tuple(point) for point in geometry["points"]]
    x, y = geometry["center"]
    rx, ry = geometry["radius"]
    return [(x + rx * math.cos(i * math.tau / 64), y + ry * math.sin(i * math.tau / 64)) for i in range(64)]


def tint(image, region):
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    geometry = region["geometry"]
    if geometry["type"] == "polygon":
        draw.polygon([tuple(point) for point in geometry["points"]], fill=region["opacity"])
    else:
        draw.ellipse(ellipse_box(geometry), fill=region["opacity"])
    image.paste(Image.new("RGB", image.size, rgb(region["color"])), (0, 0), mask)


def dashed_line(draw, points, color, width=5, dash=17, gap=11):
    for start, end in zip(points, points[1:] + points[:1]):
        dx, dy = end[0] - start[0], end[1] - start[1]
        length = math.hypot(dx, dy)
        if length == 0:
            continue
        for offset in range(0, int(length), dash + gap):
            stop = min(offset + dash, length)
            a = (start[0] + dx * offset / length, start[1] + dy * offset / length)
            b = (start[0] + dx * stop / length, start[1] + dy * stop / length)
            draw.line([a, b], fill=color, width=width)


def outline(draw, region):
    points = geometry_points(region["geometry"])
    color = (*rgb(region["color"]), 255)
    if region["outline"] == "dashed":
        dashed_line(draw, points, color, width=4 if region["geometry"]["type"] == "ellipse" else 5)
    elif region["outline"] == "solid":
        draw.line(points + [points[0]], fill=color, width=5, joint="curve")
    else:
        raise ValueError(f"Unknown outline style: {region['id']}")


def badge(draw, region):
    x, y = region["badge"]
    color = rgb(region["color"])
    light = region["id"].startswith("light_")
    number = region["label"] if light else str(region["depth"])
    label = str(region["depth"]) if light else region["label"]
    number_font, label_font = font(22), font(26)
    number_width = max(45, draw.textbbox((0, 0), number, font=number_font)[2] + 20)
    label_width = draw.textbbox((0, 0), label, font=label_font)[2]
    draw.rounded_rectangle((x, y, x + number_width + label_width + 37, y + 58), radius=18, fill=(12, 21, 31, 225))
    draw.rounded_rectangle((x + 6, y + 6, x + 6 + number_width, y + 52), radius=13, fill=(*color, 255))
    text_width = draw.textbbox((0, 0), number, font=number_font)[2]
    draw.text((x + 6 + (number_width - text_width) / 2, y + 15), number, font=number_font, fill=(8, 20, 30, 255))
    draw.text((x + 21 + number_width, y + 12), label, font=label_font, fill=(255, 255, 255, 255))


def legend_card(draw, index, entry, by_id):
    x, y = 60 + index % 3 * 620, 1217 + index // 3 * 121
    regions = [by_id[region_id] for region_id in entry["region_ids"]]
    depths = [region["depth"] for region in regions]
    value = str(depths[0]) if len(depths) == 1 else f"{min(depths)}\u2013{max(depths)}"
    detail = entry["note"]
    if len(regions) > 1:
        detail = "  \u00b7  ".join(f"{region['label']} {region['depth']}" for region in regions)
    color = rgb(regions[0]["color"])
    draw.rounded_rectangle((x, y, x + 600, y + 105), radius=19, fill=(27, 41, 56, 255))
    draw.rounded_rectangle((x + 15, y + 15, x + 104, y + 79), radius=15, fill=(*color, 255))
    value_font = font(24 if len(value) <= 3 else 20)
    value_width = draw.textbbox((0, 0), value, font=value_font)[2]
    draw.text((x + 60 - value_width / 2, y + 31), value, font=value_font, fill=(9, 22, 33, 255))
    draw.text((x + 120, y + 12), entry["title"], font=font(27), fill="white")
    draw.text((x + 120, y + 53), detail, font=font(18), fill=(190, 207, 219))


def render(photo_path, map_path, output_path):
    data = load_map(map_path)
    width, height = data["reference_size"]
    with Image.open(photo_path) as source:
        aspect_delta = abs(source.width / source.height - width / height)
        if aspect_delta > 0.01:
            raise ValueError("Photo aspect ratio differs from the reference by more than 1%; align or crop it first")
        photo = source.convert("RGB")
    if photo.size != (width, height):
        photo = photo.resize((width, height), Image.Resampling.LANCZOS)

    for region in data["regions"]:
        tint(photo, region)

    panel_height = 508
    canvas = Image.new("RGBA", (width, height + panel_height), (13, 22, 33, 255))
    canvas.paste(photo.convert("RGBA"), (0, 0))
    draw = ImageDraw.Draw(canvas)
    for region in data["regions"]:
        outline(draw, region)
    for region in data["regions"]:
        badge(draw, region)

    draw.rectangle((0, height, width, height + panel_height), fill=(13, 22, 33, 255))
    draw.text((60, height + 23), "\u0427\u0415\u0420\u041d\u041e\u0412\u0418\u041a \u041a\u0410\u0420\u0422\u042b \u0413\u041b\u0423\u0411\u0418\u041d\u042b", font=font(43), fill="white")
    draw.text((60, height + 78), "1 = \u0431\u043b\u0438\u0436\u0435 \u0432\u0441\u0435\u0433\u043e  \u00b7  100 = \u0434\u0430\u043b\u044c\u0448\u0435 \u0432\u0441\u0435\u0433\u043e. \u0412\u0441\u0435 \u0447\u0438\u0441\u043b\u0430 \u043f\u043e\u043a\u0430 \u0443\u0441\u043b\u043e\u0432\u043d\u044b\u0435.", font=font(25), fill=(190, 207, 219))
    by_id = {region["id"]: region for region in data["regions"]}
    for index, entry in enumerate(data["legend"]):
        legend_card(draw, index, entry, by_id)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output_path, optimize=True)
    return output_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("photo", type=Path, help="A photograph with the reference composition")
    parser.add_argument("--map", type=Path, default=MAP_PATH, help="Editable region geometry and depth data")
    parser.add_argument("--output", type=Path, required=True, help="Annotated PNG to write")
    args = parser.parse_args()
    result = render(args.photo, args.map, args.output)
    print(f"Wrote {result}")


if __name__ == "__main__":
    main()
