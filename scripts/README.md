# Project scripts and workflows

Run commands from the repository root. The current artwork is a static site in `dist/`: there is no JavaScript bundling step. `dist/index.html` loads the reference photograph, its depth PNG, the WebGL parallax script, and the procedural music module directly.

This guide is the entry point for working on the current reference-photo page. The depth-region schema and editable coordinates are described in [test/README.md](../test/README.md); project conventions are in [CONTRIBUTING.md](../CONTRIBUTING.md). Photo-taking commands below use the committed `references/ElGrayPimenovLeiterWindow2.png` image and can be pasted as written. For a new photo, replace that path in each command with the path to your actual image; quote paths containing spaces.

## Quick route

| Goal | Start here |
| --- | --- |
| Run the complete workflow on the committed photo | [Copy-paste walkthrough](#copy-paste-walkthrough-with-the-committed-photo) |
| Check whether a new photo matches the current hand-drawn regions | [Compare a new photo](#compare-a-new-photo-with-the-region-map) |
| Generate a neural map and apply the hand-set depths | [Generate a corrected depth candidate](#generate-a-corrected-depth-candidate) |
| See that candidate in the page without changing committed assets | [Preview the candidate in a copy of the site](#preview-the-candidate-in-a-copy-of-the-site) |
| Run the current site and its checks | [Run and check the current page](#run-and-check-the-current-page) |
| Understand what is required to publish the new map | [Promote a candidate](#promote-a-candidate) |

## Setup

For the full depth workflow, use macOS on Apple Silicon and Python 3.11. The Core ML requirements also include Pillow and NumPy, which the region scripts use:

```sh
python3.11 -m venv output/depth_venv
source output/depth_venv/bin/activate
output/depth_venv/bin/python -m pip install -r scripts/depth-requirements.txt
```

The model is a pinned, checksum-verified Apple Depth Anything V2 Small FP16 package. The raw generator reuses `output/models/DepthAnythingV2SmallF16.mlpackage/` when present and downloads it there when needed. `output/depth_venv/bin/python scripts/download_depth_model.py` prepares the cache separately.

For overlay-only work, a normal Python environment with `requirements.txt` is sufficient. Do not install both requirement files into one environment: they specify different Pillow versions. Node.js 22 or newer is recommended for the JavaScript checks. Playwright and Chromium are needed only for the browser check.

## Copy-paste walkthrough with the committed photo

Run the Setup block above from the repository root. The following blocks use the real `references/ElGrayPimenovLeiterWindow2.png` file already in the repository. Paste them in order, pausing to inspect each image. Every Python command names the virtual environment explicitly, so it also works in a new terminal after Setup. For another photo, replace that one source path in the overlay, raw-depth, correction, and site-preview commands.

First draw and inspect the region overlay:

```sh
output/depth_venv/bin/python test/render_depth_regions.py references/ElGrayPimenovLeiterWindow2.png --output output/depth_review/photo_overlay.png
open output/depth_review/photo_overlay.png
```

After the regions align with the photo, generate a raw neural map, apply `test/depth_regions.json`, and inspect the corrected map:

```sh
output/depth_venv/bin/python scripts/generate_raw_reference_depth.py --source references/ElGrayPimenovLeiterWindow2.png --output output/depth_review/raw_depth.png
output/depth_venv/bin/python scripts/apply_depth_regions.py --photo references/ElGrayPimenovLeiterWindow2.png --input-depth output/depth_review/raw_depth.png --output output/depth_review/corrected_depth.png
open output/depth_review/corrected_depth.png
```

Preview that corrected map in a copy of the static page:

```sh
mkdir -p output/site_preview
cp -R dist/. output/site_preview/
cp references/ElGrayPimenovLeiterWindow2.png output/site_preview/assets/ElGrayPimenovLeiterWindow2.png
cp output/depth_review/corrected_depth.png output/site_preview/assets/ElGrayPimenovLeiterWindow2-depth.png
output/depth_venv/bin/python -m http.server 8001 --directory output/site_preview
```

Open `http://127.0.0.1:8001/` on the Mac. Stop the server with Ctrl-C. This preview does not replace the committed `dist/` depth map. The optional `source` command in Setup makes bare `python` available in that terminal; the commands here use the explicit path either way.

## Compare a new photo with the region map

The editable map is `test/depth_regions.json`. It records polygons and five individual light ellipses in coordinates of the 1920 x 1077 reference. Depth 1 is nearest and depth 100 is farthest. Render the map over a supplied photo before generating or replacing any depth PNG:

```sh
output/depth_venv/bin/python test/render_depth_regions.py references/ElGrayPimenovLeiterWindow2.png --output output/depth_review/photo_overlay.png
```

Open `output/depth_review/photo_overlay.png`. Check the city contour, presenter silhouette, studio wall, ticker, glass boundary, red trail, and each light A-E. If the composition moved, edit the coordinates or depths in `test/depth_regions.json` and render again. The preview renderer accepts another resolution when its aspect ratio is within 1% of the reference; it scales the photo to the reference size for comparison. It does not change the supplied photo.

Check the edited configuration:

```sh
output/depth_venv/bin/python test/test_depth_regions.py
output/depth_venv/bin/python test/test_apply_depth_regions.py
```

These tests use the committed reference image and generated temporary inputs. They check the map contract, repeatable overlays, depth ordering, and input preservation; they do not compare your new photo or `output/depth_review/` files with a saved target image. Their verbose output lists the inputs and comparisons.

## Generate a corrected depth candidate

First generate an uncorrected neural depth PNG for the same photo:

```sh
output/depth_venv/bin/python scripts/generate_raw_reference_depth.py --source references/ElGrayPimenovLeiterWindow2.png --output output/depth_review/raw_depth.png
```

The command writes `raw_depth.png` and `raw_depth.json`. It does not touch `dist/`. For the original photograph, the saved raw prediction `specs/evidence/depth-before.png` can also serve as input.

Apply the hand-set regions and depths from `test/depth_regions.json`:

```sh
output/depth_venv/bin/python scripts/apply_depth_regions.py --photo references/ElGrayPimenovLeiterWindow2.png --input-depth output/depth_review/raw_depth.png --output output/depth_review/corrected_depth.png
```

The command writes `corrected_depth.png` and a JSON report with source and output checksums, each region's target grayscale value, and coverage. It preserves the photo and raw map. The 1-100 review scale maps to the existing shader's inverse-grayscale range: 1 -> 236 (near) and 100 -> 96 (far). `neural_detail_strength` retains some local neural variation in selected regions; zero makes a region flat. `depth_bake.write_order` resolves overlapping regions. The ticker is written last at depth 21.

Review the output image and report. A single grayscale pixel cannot encode glass and an object behind it simultaneously. The current overlap order is a testable approximation, and the region outlines are still provisional.

## Preview the candidate in a copy of the site

Use a disposable copy so the committed `dist/` assets stay intact:

```sh
mkdir -p output/site_preview
cp -R dist/. output/site_preview/
cp references/ElGrayPimenovLeiterWindow2.png output/site_preview/assets/ElGrayPimenovLeiterWindow2.png
cp output/depth_review/corrected_depth.png output/site_preview/assets/ElGrayPimenovLeiterWindow2-depth.png
python3 -m http.server 8001 --directory output/site_preview
```

Open `http://127.0.0.1:8001/` and move the pointer or drag on a phone. Inspect both camera extremes for cut edges, holes, and whether the city, presenter, studio, ticker, red trail, five lights, and glass move in a believable order. Stop the server with Ctrl-C. `output/` is ignored by Git.

`scripts/check_reference_parallax.mjs` is currently tied to the committed three-plane map and its saved evidence. It is a baseline test for the current published map, not an acceptance test for this new candidate.

## Run and check the current page

The page already lives in `dist/`. The following commands validate the committed assets and source without regenerating the reference photograph or its depth map:

```sh
python3 scripts/build.py --check
output/depth_venv/bin/python scripts/manual_depth_planes.py --check
node scripts/check.mjs
node scripts/check-ui.mjs
python3 scripts/check_build.py
```

Then serve the current page:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://127.0.0.1:8000/`. The page must load over HTTP because it uses JavaScript modules and local assets. Stop the server with Ctrl-C.

For the browser regression, keep that server running in one terminal. In another terminal, install Playwright and its Chromium browser if needed, then run:

```sh
npm install --no-save --no-package-lock playwright
npx playwright install chromium
TEASER_URL=http://127.0.0.1:8000/ node scripts/check_reference_parallax.mjs
```

The browser check writes captures and a report under `output/reference_parallax_check/`. The GitHub Pages workflow runs these checks for the current map, plus JavaScript syntax checks. `python3 scripts/build.py` without `--check` is different: it regenerates the legacy cafe depth asset, not the current reference-photo depth map.

## Promote a candidate

The new region workflow currently stops at a reviewable candidate. Copying `corrected_depth.png` directly into `dist/assets/` would leave the committed reference-depth metadata, three-plane evidence, `scripts/manual_depth_planes.py --check`, and `scripts/check_reference_parallax.mjs` out of sync. Before publishing a candidate, update those validation rules and the depth metadata for the new map, run the browser test against its expected regions, then commit the new photo, depth PNG, metadata, and evidence together. The older `scripts/make_reference_depth.py` and `scripts/manual_depth_planes.py` still produce the previous three-plane map; do not use them to bake the new region scheme.

`.github/workflows/pages.yml` currently builds on pushes to `teaser` and `fix/flat-front-glass-depth`, and on pull requests to `teaser`. Deployment occurs on a push to `teaser` or a manual workflow dispatch. `.github/workflows/bake-manual-depth.yml` is the older three-plane baking workflow on `fix/flat-front-glass-depth`.

## Script inventory

| Script | Purpose |
| --- | --- |
| `scripts/generate_raw_reference_depth.py` | Infer an uncorrected 1024-pixel-wide reference depth PNG with Core ML. |
| `scripts/apply_depth_regions.py` | Apply `test/depth_regions.json` to a raw neural depth PNG and write a report. |
| `test/render_depth_regions.py` | Draw the editable zones over a photograph for alignment review. |
| `test/test_depth_regions.py` | Check mask values and repeatable overlay rendering. |
| `test/test_apply_depth_regions.py` | Check correction order, depth conversion, and input preservation. |
| `scripts/download_depth_model.py` | Download or verify the pinned local Core ML model cache. |
| `scripts/manual_depth_planes.py` | Bake or validate the earlier three-plane reference map and evidence. |
| `scripts/make_reference_depth.py` | Infer reference depth, then apply the earlier three-plane correction. |
| `scripts/check_reference_parallax.mjs` | Browser and Web Audio regression for the committed reference page and old depth evidence. |
| `scripts/build.py` | Validate static assets with `--check`; without it, regenerate the legacy cafe depth. |
| `scripts/check_build.py` | Check missing/stale cafe map errors and model-cache behavior. |
| `scripts/check.mjs` | Check repository text, local assets, and procedural audio output. |
| `scripts/check-ui.mjs` | Check first-gesture audio startup and mobile audio behavior. |
| `scripts/draw_teaser.py` | Regenerate the older procedural cafe artwork. |
| `scripts/make_layers.py` | Derive animated cafe layers from that artwork. |
| `scripts/make_depth.py` | Infer and commit the older cafe depth map. |
| `scripts/check-parallax.mjs` | Browser regression for the older interactive cafe page; not the current reference page. |

The cafe scripts remain in the repository because `scripts/build.py --check` and the Pages workflow still validate their committed assets. They are not the route for a new gray-dress reference photograph.
