"""Check that JSON depth regions modify a neural map without losing its source."""

import json
import tempfile
import unittest
from pathlib import Path
import sys

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.apply_depth_regions import corrected_depth, grayscale_for_depth, run  # noqa: E402
from test.render_depth_regions import load_map  # noqa: E402


MAP = ROOT / "test/depth_regions.json"


def at_reference_pixel(image, x, y):
    px = round(x * image.width / 1920)
    py = round(y * image.height / 1077)
    return image.getpixel((px, py))


class ApplyDepthRegionsTest(unittest.TestCase):
    def test_depth_scale_and_overlap_order(self):
        """Compare corrected synthetic depth with JSON targets and overlap rules."""
        data = load_map(MAP)
        self.assertEqual(grayscale_for_depth(1, data), 236)
        self.assertEqual(grayscale_for_depth(100, data), 96)
        self.assertGreater(grayscale_for_depth(21, data), grayscale_for_depth(26, data))
        x = np.linspace(50, 205, 1024, dtype=np.float32)
        neural = Image.fromarray(np.tile(x, (574, 1)).astype(np.uint8))
        result, report = corrected_depth(neural, data)
        self.assertEqual(result.size, neural.size)
        self.assertGreater(np.unique(np.asarray(result)).size, 20)
        self.assertAlmostEqual(at_reference_pixel(result, 1400, 500), 236, delta=1)
        self.assertAlmostEqual(at_reference_pixel(result, 1700, 500), 236, delta=1)
        self.assertAlmostEqual(at_reference_pixel(result, 1798, 328), grayscale_for_depth(90, data), delta=1)
        self.assertAlmostEqual(at_reference_pixel(result, 500, 1010), grayscale_for_depth(21, data), delta=1)
        self.assertGreater(report["covered_percent"], 99)

        changed = json.loads(json.dumps(data))
        next(region for region in changed["regions"] if region["id"] == "presenter")["depth"] = 35
        revised, _ = corrected_depth(neural, changed)
        self.assertNotEqual(at_reference_pixel(result, 950, 600), at_reference_pixel(revised, 950, 600))
        self.assertNotEqual(at_reference_pixel(result, 950, 966), at_reference_pixel(revised, 950, 966))
        self.assertNotEqual(at_reference_pixel(result, 675, 820), at_reference_pixel(revised, 675, 820))
        self.assertEqual(at_reference_pixel(result, 650, 820), at_reference_pixel(revised, 650, 820))
        self.assertNotEqual(at_reference_pixel(result, 720, 966), at_reference_pixel(revised, 720, 966))
        self.assertEqual(at_reference_pixel(result, 690, 966), at_reference_pixel(revised, 690, 966))
        self.assertEqual(at_reference_pixel(result, 950, 995), at_reference_pixel(revised, 950, 995))

    def test_cli_operation_keeps_neural_input(self):
        """Check temporary photo and raw PNG inputs remain unchanged after baking."""
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            photo = folder / "photo.png"
            neural = folder / "raw-depth.png"
            corrected = folder / "corrected-depth.png"
            Image.new("RGB", (1920, 1077), (80, 90, 100)).save(photo)
            Image.new("L", (1024, 574), 128).save(neural)
            original_bytes = neural.read_bytes()
            output, report = run(photo, neural, MAP, corrected)
            self.assertEqual(output, corrected)
            self.assertTrue(report.exists())
            self.assertEqual(neural.read_bytes(), original_bytes)
            self.assertEqual(json.loads(report.read_text())["output_size"], [1024, 574])
            with self.assertRaisesRegex(ValueError, "must not overwrite"):
                run(photo, neural, MAP, neural)
            with self.assertRaisesRegex(ValueError, "must not overwrite"):
                run(photo, neural, MAP, photo)


if __name__ == "__main__":
    print(f"Region map: {MAP.relative_to(ROOT)}", file=sys.stderr)
    print("Inputs: synthetic 1024x574 raw depth and a temporary 1920x1077 photo.", file=sys.stderr)
    print("Comparison: corrected pixels versus JSON depths, changed presenter depth, and unchanged inputs; no saved golden PNG.", file=sys.stderr)
    unittest.main(verbosity=2)
