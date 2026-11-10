"""Focused checks for the layered-scene source contract and generated assets."""

import hashlib
import json
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "test/glass_layers.json").read_text())


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class LayeredGlassTests(unittest.TestCase):
    def test_reference_hashes_and_canvas(self):
        expected = {
            "base": "0e3fe9c852a2638a0126303652688fbbea5aaf6dbc220cf9c5292b4bc8c07ace",
            "glass": "5eb180b7225b800a6e68bc23c3f2ffca688336360af8075fb18404e04973b120",
        }
        for key, digest in expected.items():
            path = ROOT / CONFIG["sources"][key]
            self.assertEqual(sha256(path), digest)
            with Image.open(path) as image:
                self.assertEqual(image.size, tuple(CONFIG["canvas"]))

    def test_generated_alpha_is_transparent_off_pane_and_spatial(self):
        layer = Image.open(ROOT / "dist/assets/no_logo-glass.png").convert("RGBA")
        self.assertEqual(layer.size, tuple(CONFIG["canvas"]))
        alpha = np.asarray(layer.getchannel("A"))
        left = CONFIG["pane"]["left"]
        self.assertTrue(np.all(alpha[:, :left - 2] == 0))
        inside = alpha[:, left + 16:]
        self.assertTrue(np.any(inside < 30), "Clear glass areas should transmit most of the base")
        self.assertTrue(np.any((inside > 0) & (inside < 255)))
        self.assertTrue(np.any(inside > 200), "The reflected house/windows need visible alpha")

    def test_depth_has_distinct_behind_glass_objects(self):
        depths = {entry["id"]: entry["depth"] for entry in CONFIG["depths"]["regions"]}
        self.assertNotEqual(depths["laptop"], depths["ticker"])
        self.assertGreater(depths["laptop"], 1)
        self.assertGreater(depths["ticker"], 1)
        depth = Image.open(ROOT / "dist/assets/no_logo-depth.png").convert("L")
        self.assertEqual(depth.size, tuple(CONFIG["canvas"]))

    def test_scene_objects_move_relative_to_the_near_glass_plane(self):
        depth_config = CONFIG["depths"]
        parallax = CONFIG["parallax"]
        values = {entry["id"]: entry["depth"] for entry in depth_config["regions"]}

        def gray(level):
            return 236 - (level - 1) * 140 / 99

        def extreme_delta(depth):
            z = gray(depth) / 255
            near = depth_config["nearest_gray"] / 255
            return 2 * parallax["strength"] * (near - z) * (
                1 - (1 - parallax["mix"]) ** parallax["iterations"]
            ) * CONFIG["canvas"][0]

        for object_name in ("laptop", "ticker"):
            relative = extreme_delta(values[object_name])
            self.assertGreater(relative, 3, f"{object_name} must move relative to glass")

    def test_opacity_control_matches_documented_default(self):
        self.assertEqual(CONFIG["glass_alpha"]["default_opacity"], 0.68)
        html = (ROOT / "dist/index.html").read_text()
        script = (ROOT / "dist/parallax.js").read_text()
        self.assertIn('id="glass-alpha"', html)
        self.assertIn('value="0.68"', html)
        self.assertIn("layer.a*glassAlpha", script)


if __name__ == "__main__":
    unittest.main()
