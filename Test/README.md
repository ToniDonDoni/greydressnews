# Depth-region review mask

`depth_regions.json` is the editable, project-local draft of the scene's semantic depth regions. It is a review aid, not the depth texture used by the website. The colors and labels let us compare a regenerated photograph with the agreed regions before changing the production renderer.

The map stores every polygon and light ellipse in pixel coordinates of the 1920 x 1077 reference image. It also stores each region's proposed depth, tint color, opacity, and label position. **Depth 1 is nearest; depth 100 is farthest.** Current values are provisional:

| Region | Depth |
| --- | ---: |
| City building | 100 |
| Five lights behind the glass, A-E | 93, 90, 87, 84, 81 |
| Red light trail behind the glass | 68 |
| Studio wall behind the presenter | 48 |
| Presenter | 26 |
| News ticker, in front of the presenter and behind the glass | 21 |
| Foreground glass with droplets | 1 |

The right-side light regions and red trail overlap the glass in image coordinates. Their separate values express the intended depth ordering; this draft does not yet extract them into transparent image layers. Boundaries are intentionally rough and need review against every new photograph.

## Render a comparison

Install the repository's Python dependencies, then run from the project root:

```sh
python3 -m pip install -r requirements.txt
python3 Test/render_depth_regions.py references/ElGrayPimenovLeiterWindow2.png --output output/depth-mask-original.png
python3 Test/render_depth_regions.py path/to/new-photo.png --output output/depth-mask-new.png
```

The renderer leaves the input untouched and writes an annotated PNG with a legend. A new image may have different pixel dimensions if its aspect ratio is within 1% of the reference; the renderer scales it to the reference size for visual comparison. If the framing or composition changes, adjust the coordinates in `depth_regions.json` before treating the overlay as aligned.

Edit the JSON to move a boundary, change a depth, or reposition a label. Polygon `points`, ellipse `center` and `radius`, and `badge` positions all use the same reference-image coordinates. The legend reads the depths from the region entries, so changed values appear on the next render without editing the script.

## Check the reusable overlay

```sh
python3 Test/test_depth_regions.py
```

This checks the region contract and renders the reference twice to confirm a deterministic preview. The generated comparison PNGs belong under ignored `output/`; keep the JSON, renderer, and test in `Test/`.
