# Depth-region review mask

For the complete generation, validation, preview, and publication workflow, start with [scripts/README.md](../scripts/README.md).

`depth_regions.json` is the editable, project-local draft of the scene's semantic depth regions. The colors and labels let us compare a regenerated photograph with the agreed regions. `scripts/apply_depth_regions.py` then applies the same configuration to an uncorrected neural depth PNG. Both outputs are review artifacts until explicitly promoted to the website.

The map stores every polygon and light ellipse in pixel coordinates of the 1920 x 1077 reference image. It also stores each region's proposed depth, tint color, opacity, and label position. **Depth 1 is nearest; depth 100 is farthest.** Current values are provisional:

| Region | Depth |
| --- | ---: |
| City building | 100 |
| Five lights behind the glass, A-E | 93, 90, 87, 84, 81 |
| Studio wall behind the presenter | 48 |
| Presenter | 26 |
| News ticker, in front of the presenter and behind the glass | 21 |
| Foreground glass with droplets and the broad red streak | 1 |

Only the five right-side lights have separate depth regions within the glass area. The broad red streak shares the foreground glass depth and has no independent parallax. This draft does not yet extract the lights into transparent image layers. The presenter mask reaches the ticker top at y=978; the ticker is a distinct depth-21 region across the lower-third graphic. A single-channel depth PNG can hold only one value per pixel, so the `depth_bake.write_order` in the JSON resolves overlaps, with the ticker written last. This is a deliberate approximation until image layers are separated. Boundaries are intentionally rough and need review against every new photograph.

## Render a comparison

Follow the setup in `scripts/README.md`, then run from the project root:

```sh
output/depth_venv/bin/python test/render_depth_regions.py references/ElGrayPimenovLeiterWindow2.png --output output/depth_review/depth-mask-original.png
```

The command uses the committed reference photo and can be pasted as written. Replace that photo path with an existing new image when reviewing a replacement. The renderer leaves the input untouched and writes an annotated PNG with a legend. A new image may have different pixel dimensions if its aspect ratio is within 1% of the reference; the renderer scales it to the reference size for visual comparison. If the framing or composition changes, adjust the coordinates in `depth_regions.json` before treating the overlay as aligned.

Edit the JSON to move a boundary, change a depth, or reposition a label. Polygon `points`, ellipse `center` and `radius`, and `badge` positions all use the same reference-image coordinates. The legend reads the depths from the region entries, so changed values appear on the next render without editing the script.

## Apply the regions to a neural depth map

First save the raw neural prediction on an Apple Silicon Mac with Python 3.11 and the project's Core ML dependencies installed:

```sh
output/depth_venv/bin/python scripts/generate_raw_reference_depth.py --source references/ElGrayPimenovLeiterWindow2.png --output output/depth_review/raw-depth.png
```

Then apply the JSON to that raw map:

```sh
output/depth_venv/bin/python scripts/apply_depth_regions.py --photo references/ElGrayPimenovLeiterWindow2.png --input-depth output/depth_review/raw-depth.png --output output/depth_review/corrected-depth.png
```

For the current reference image, `specs/evidence/depth-before.png` can be used as the saved raw neural map. The correction script writes an 8-bit inverse-depth PNG and a JSON report beside it. It never overwrites its input. The review scale maps 1 (nearest) to grayscale 236 and 100 (farthest) to grayscale 96, matching the existing shader's working range. `neural_detail_strength` in each region keeps a controlled amount of the neural map's local variation; zero makes a region flat. Mask edges are antialiased when scaled to the neural map's resolution.

Review the corrected map and browser motion before replacing `dist/assets/ElGrayPimenovLeiterWindow2-depth.png`. The current production map is the semantic-region bake from this JSON over `specs/evidence/depth-before.png`; `python3 scripts/check_reference_depth.py` validates the committed result.

## Check the reusable overlay

```sh
output/depth_venv/bin/python test/test_depth_regions.py
output/depth_venv/bin/python test/test_apply_depth_regions.py
```

This checks the region contract and renders the reference twice to confirm a deterministic preview. `test/test_apply_depth_regions.py` checks depth conversion and input preservation. Generated comparison PNGs belong under ignored `output/`; keep mask data and reproducible tests in `test/`.
