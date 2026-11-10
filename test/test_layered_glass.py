"""Check input ownership and pane-only alpha construction for SPEC-006."""

import hashlib
import json
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "test/glass_layers.json").read_text(encoding="utf-8"))
sys.path.insert(0, str(ROOT / "scripts"))
from glass_geometry import load_geometry, pixel_rect  # noqa: E402
from make_layered_glass import linear_premultiplied, pane_alpha  # noqa: E402


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class LayeredGlassTests(unittest.TestCase):
    def test_reference_hashes_and_matching_dimensions(self):
        expected = {
            "base": "0e3fe9c852a2638a0126303652688fbbea5aaf6dbc220cf9c5292b4bc8c07ace",
            "glass": "5eb180b7225b800a6e68bc23c3f2ffca688336360af8075fb18404e04973b120",
        }
        for key, digest in expected.items():
            path = ROOT / CONFIG["sources"][key]
            self.assertEqual(sha256(path), digest)
        with Image.open(ROOT / CONFIG["sources"]["base"]) as base:
            base_size = base.size
        with Image.open(ROOT / CONFIG["sources"]["glass"]) as donor:
            self.assertEqual(donor.size, base_size)

    def test_normalized_geometry_scales_to_actual_image_size(self):
        geometry = load_geometry()
        pane = geometry["pane"]
        for width, height in ((1672, 941), (836, 470), (1024, 576)):
            bounds = pixel_rect(pane, width, height)
            alpha = pane_alpha((width, height), bounds)
            self.assertEqual(bounds["right"], width)
            self.assertEqual(bounds["bottom"], height)
            self.assertEqual(np.count_nonzero(alpha[:, : bounds["left"]]), 0)
            self.assertEqual(
                np.count_nonzero(alpha[:, bounds["left"] :]),
                (width - bounds["left"]) * height,
            )
        self.assertAlmostEqual(
            pixel_rect(pane, 836, 470)["left"] / 836,
            pane["left"],
            delta=1 / 836,
        )

    def test_reference_resolution_preserves_existing_geometry(self):
        geometry = load_geometry()
        pane = pixel_rect(geometry["pane"], 1672, 941)
        house = pixel_rect(geometry["house"], 1672, 941)
        hint = geometry["hint"]

        self.assertEqual(pane, {"left": 1095, "right": 1672, "top": 0, "bottom": 941})
        self.assertEqual(house["right"], 605)
        self.assertAlmostEqual(hint["center_x"] * 1672, 1435.75, delta=1e-5)
        self.assertAlmostEqual(hint["center_y"] * 941, 470, delta=1e-5)
        self.assertAlmostEqual(hint["width"] * 1672, 280, delta=1e-5)
        self.assertAlmostEqual(hint["height"] * 941, 230, delta=1e-5)

    def test_alpha_is_one_full_pane_mask_only(self):
        alpha = pane_alpha((12, 8), {"left": 4, "right": 12, "top": 0, "bottom": 8})
        self.assertTrue(np.all(alpha[:, :4] == 0))
        self.assertTrue(np.all(alpha[:, 4:] == 255))
        self.assertEqual(np.count_nonzero((alpha > 0) & (alpha < 255)), 0)

    def test_runtime_rgb_is_linear_premultiplied_and_clear_outside(self):
        rgb = np.full((2, 4, 3), 0.5, dtype=np.float32)
        alpha = np.zeros((2, 4), dtype=np.uint8)
        alpha[:, 2:] = 255
        result = linear_premultiplied(rgb, alpha)
        self.assertTrue(np.all(result[:, :2] == 0))
        expected = ((0.5 + 0.055) / 1.055) ** 2.4
        self.assertTrue(np.allclose(result[:, 2:], expected))

    def test_depth_map_has_no_glass_and_uses_latest_object_levels(self):
        depth = json.loads((ROOT / "test/depth_regions.json").read_text(encoding="utf-8"))
        regions = {region["id"]: region for region in depth["regions"]}
        self.assertNotIn("front_glass", regions)
        self.assertFalse(any(region["depth"] == 1 for region in regions.values()))
        self.assertEqual(regions["right_background"]["depth"], 48)
        self.assertEqual(regions["laptop"]["depth"], 21)
        self.assertEqual(regions["ticker"]["depth"], 21)
        self.assertEqual(CONFIG["glass"]["authoring_depth"], 1)
        self.assertEqual(CONFIG["glass"]["default_opacity"], 0.68)


if __name__ == "__main__":
    unittest.main(verbosity=2)
