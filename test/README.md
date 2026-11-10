# Depth-region review mask

For the complete generation, validation, preview, and publication workflow, start with [scripts/README.md](../scripts/README.md).

`depth_regions.json` is the editable, project-local map of the base studio scene. Its colors and labels let us compare the reviewed regions with `references/no_logo.png`. `scripts/apply_depth_regions.py` applies these regions to a raw neural depth PNG generated from that same base. The separate glass layer is configured in `test/glass_layers.json` and is not part of this depth map.

The map stores each polygon in pixel coordinates of the 1920 x 1077 reference image, along with its proposed depth, tint color, opacity, and label position. **Depth 1 is nearest; depth 100 is farthest.** Current values are provisional:

| Region | Depth |
| --- | ---: |
| City building | 100 |
| Studio wall behind the presenter | 48 |
| Presenter | 26 |
| Laptop and news ticker behind the glass | 21 |
| Separate glass overlay (not in this map) | 1 |

The right-side lights do not have separate depth regions. The right background is part of the base at proposed depth 48. The full-height glass pane, reflected house, droplets, and streaks are a separate runtime overlay at depth 1. The laptop has its own traced region at depth 21, the same as the ticker; the ticker is written last where they overlap. The presenter mask reaches the ticker top at y=978. A single-channel depth PNG can hold only one value per pixel, so `depth_bake.write_order` resolves overlaps. Boundaries are provisional and should be reviewed against each new photograph.

## Render a comparison

Follow the setup in `scripts/README.md`, then run from the project root:

```sh
output/depth_venv/bin/python test/render_depth_regions.py references/no_logo.png --output output/depth_review/no-logo-depth-regions.png
```

The renderer leaves the input untouched and writes an annotated PNG with a legend. `depth_regions.json` is authored on its 1920 x 1077 review canvas and is scaled to the 1672 x 941 base for visual comparison. Review the contours on `no_logo.png` before baking; adjust the JSON coordinates if the silhouettes do not align.

Edit the JSON to move a boundary, change a depth, or reposition a label. Polygon `points`, ellipse `center` and `radius`, and `badge` positions all use the same reference-image coordinates. The legend reads the depths from the region entries, so changed values appear on the next render without editing the script.

## Apply the regions to a neural depth map

First save the raw neural prediction on an Apple Silicon Mac with Python 3.11 and the project's Core ML dependencies installed:

```sh
output/depth_venv/bin/python scripts/generate_raw_reference_depth.py --source references/no_logo.png --output output/glass_review/base-raw-depth.png
```

Then apply the JSON to that raw map:

```sh
output/depth_venv/bin/python scripts/apply_depth_regions.py --photo references/no_logo.png --input-depth output/glass_review/base-raw-depth.png --output output/glass_review/scene-depth.png
```

Use only a raw neural map generated from `references/no_logo.png`. The correction script writes an 8-bit inverse-depth PNG and a JSON report beside it. It never overwrites its input. The review scale maps 1 (nearest) to grayscale 236 and 100 (farthest) to grayscale 96, matching the renderer's working range. `neural_detail_strength` in each region keeps a controlled amount of the neural map's local variation; zero makes a region flat. Mask edges are antialiased when scaled to the neural map's resolution.

Review the corrected map in the output preview before considering any later promotion. This workflow writes generated maps and evidence only under ignored `output/`.

## Check the reusable overlay

```sh
output/depth_venv/bin/python test/test_depth_regions.py
output/depth_venv/bin/python test/test_apply_depth_regions.py
```

This checks the region contract and renders the reference twice to confirm a deterministic preview. `test/test_apply_depth_regions.py` checks depth conversion and input preservation. Generated comparison PNGs belong under ignored `output/`; keep mask data and reproducible tests in `test/`.
