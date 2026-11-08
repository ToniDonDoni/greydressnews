"""Manually flatten the visible foreground glass in the reference depth map.

The model sees the translucent pane at the right as a depth gradient.
Treat this pane as one camera-parallel near plane. Preserve the woman's
depth and the entire left portion byte-for-byte at the pixel level.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEPTH = ROOT / "dist/assets/ElGrayPimenovLeiterWindow-depth.png"
META = DEPTH.with_suffix(".json")
SOURCE = ROOT / "references/ElGrayPimenovLeiterWindow.png"

# The glass frame begins at x=658 on the 1024px depth raster.
GLASS_LEFT = 658
FEATHER_PX = 4
GLASS_DEPTH = 248  # inverse relative depth: white means close to the viewer


def flatten_glass_plane(image):
    if image.mode != "L" or image.size != (1024, 576):
        raise ValueError("Expected the original 1024x576 8-bit grayscale depth")
    result = image.copy()
    pixels = result.load()
    original = image.load()
    for y in range(result.height):
        for x in range(GLASS_LEFT, result.width):
            if x < GLASS_LEFT + FEATHER_PX:
                alpha = (x - GLASS_LEFT + 1) / (FEATHER_PX + 1)
                pixels[x, y] = round(original[x, y] * (1 - alpha) + GLASS_DEPTH * alpha)
            else:
                pixels[x, y] = GLASS_DEPTH
    return result


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    with Image.open(DEPTH) as loaded:
        image = loaded.convert("L")
        corrected = flatten_glass_plane(image)
    assert corrected.getpixel((GLASS_LEFT - 1, 280)) == image.getpixel((GLASS_LEFT - 1, 280))
    assert corrected.getpixel((GLASS_LEFT + FEATHER_PX, 280)) == GLASS_DEPTH
    DEPTH.parent.mkdir(parents=True, exist_ok=True)
    corrected.save(DEPTH, optimize=True)

    metadata = json.loads(META.read_text())
    metadata["depth_sha256"] = sha256(DEPTH)
    metadata["generator_sha256"] = sha256(ROOT / "scripts/make_reference_depth.py")
    metadata["glass_postprocess"] = {
        "method": "flat_foreground_glass_plane",
        "raster_left_x": GLASS_LEFT,
        "feather_pixels": FEATHER_PX,
        "inverse_depth": GLASS_DEPTH,
        "semantics": "same near depth across the visible right-side glass; woman and studio behind",
        "script_sha256": sha256(Path(__file__)),
    }
    META.write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps({"depth": str(DEPTH.relative_to(ROOT)),
                      "depth_sha256": metadata["depth_sha256"],
                      "postprocess": metadata["glass_postprocess"]}, indent=2))


if __name__ == "__main__":
    main()
