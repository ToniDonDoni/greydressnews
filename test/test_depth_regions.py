"""Check the editable depth map and its repeatable reference overlay."""

import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from render_depth_regions import load_map, render


ROOT = Path(__file__).resolve().parents[1]
MAP = Path(__file__).with_name("depth_regions.json")
REFERENCE = ROOT / "references/ElGrayPimenovLeiterWindow2.png"


class DepthRegionTest(unittest.TestCase):
    def test_review_depth_contract(self):
        """Check depth values and ordering in the region JSON."""
        data = load_map(MAP)
        regions = {region["id"]: region for region in data["regions"]}
        self.assertEqual(data["reference_size"], [1920, 1077])
        self.assertEqual(regions["front_glass"]["depth"], 1)
        self.assertEqual(regions["city"]["depth"], 100)
        self.assertTrue(regions["front_glass"]["depth"] < regions["ticker"]["depth"] < regions["presenter"]["depth"] < regions["studio_wall"]["depth"])
        lights = [regions[f"light_{letter}"]["depth"] for letter in "abcde"]
        self.assertEqual(len(set(lights)), 5)
        self.assertNotIn("red_trail", regions)
        self.assertTrue(all(regions["front_glass"]["depth"] < depth < regions["city"]["depth"] for depth in lights))

    def test_reference_preview_is_repeatable(self):
        """Compare two temporary overlays of the reference photo byte for byte."""
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.png"
            second = Path(directory) / "second.png"
            render(REFERENCE, MAP, first)
            render(REFERENCE, MAP, second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with Image.open(first) as preview:
                self.assertEqual(preview.size, (1920, 1464))
                self.assertEqual(preview.format, "PNG")
                ticker = next(region for region in load_map(MAP)["regions"] if region["id"] == "ticker")
                self.assertEqual(preview.getpixel((1500, 978)), tuple(bytes.fromhex(ticker["color"][1:])))

    def test_new_photo_at_matching_aspect_ratio(self):
        """Accept a resized reference copy and reject a square photo."""
        with tempfile.TemporaryDirectory() as directory:
            replacement = Path(directory) / "replacement.png"
            preview = Path(directory) / "overlay.png"
            with Image.open(REFERENCE) as source:
                source.resize((960, 538)).save(replacement)
            render(replacement, MAP, preview)
            with Image.open(preview) as result:
                self.assertEqual(result.size, (1920, 1464))

            wrong_aspect = Path(directory) / "wrong-aspect.png"
            Image.new("RGB", (960, 960)).save(wrong_aspect)
            with self.assertRaisesRegex(ValueError, "aspect ratio"):
                render(wrong_aspect, MAP, preview)


if __name__ == "__main__":
    print(f"Region map: {MAP.relative_to(ROOT)}", file=sys.stderr)
    print(f"Reference photo: {REFERENCE.relative_to(ROOT)}", file=sys.stderr)
    print("Comparison: generated temporary overlays and expected map values; no saved golden PNG.", file=sys.stderr)
    unittest.main(verbosity=2)
