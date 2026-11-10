# Project scripts and workflows

Run commands from the repository root. The current artwork is a static site in `dist/`: there is no JavaScript bundling step. `dist/index.html` loads the base photograph, its static scene-depth PNG, the separate RGBA glass layer, the WebGL parallax script, normalized glass geometry, the glass-ink layer, and the procedural music module directly.

This guide is the entry point for working on the current reference-photo page. The depth-region schema and editable coordinates are described in [test/README.md](../test/README.md); project conventions are in [CONTRIBUTING.md](../CONTRIBUTING.md). Photo-taking commands below use the committed `references/ElGrayPimenovLeiterWindow2.png` image and can be pasted as written. For a new photo, replace that path in each command with the path to your actual image; quote paths containing spaces.

## Formatting

The static page sources in `dist/` are formatted with Prettier. Install the local tool once, then format or verify:

```sh
npm install
npm run format
npm run format:check
```

`npm run format` rewrites `dist/*.{js,mjs,css,html}`. `npm run format:check` is the non-mutating version used by GitHub Actions. Keep generated assets and review evidence out of the formatter; `.prettierignore` already excludes them.

## Build stamp

The page footer reads `dist/build.json` and shows the short commit hash with a link to the exact commit. Locally the file is absent, so the footer stays at `BUILD local`.

GitHub Actions writes the file after the browser tests and before uploading the Pages artifact using `github.sha`. When the Pages workflow is dispatched manually from Actions and a branch is selected, `github.sha` is the tip of that branch, and checkout uses the same ref. The footer therefore identifies the exact commit that was built.

`python3 scripts/write_build_info.py <full-sha>` regenerates the file for a manual preview.

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

The editable map is `test/depth_regions.json`. It records semantic polygons in coordinates of the 1920 x 1077 review canvas. Depth 1 is nearest and depth 100 is farthest. Render the map over the supplied photo before generating or replacing any depth PNG:

```sh
output/depth_venv/bin/python test/render_depth_regions.py references/ElGrayPimenovLeiterWindow2.png --output output/depth_review/photo_overlay.png
```

Open `output/depth_review/photo_overlay.png`. Check the city contour, presenter silhouette, studio wall, laptop, ticker, and glass boundary. The broad red streak shares the glass depth rather than forming a separate region. If the composition moved, edit the coordinates or depths in `test/depth_regions.json` and render again. The preview renderer accepts another resolution when its aspect ratio is within 1% of the reference; it scales the photo to the reference size for comparison. It does not change the supplied photo.

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

Open `http://127.0.0.1:8001/` and move the pointer or drag on a phone. Inspect both camera extremes for cut edges, holes, and whether the city, presenter, studio, laptop, ticker, and glass move in a believable order. The broad red streak should remain attached to the glass. Stop the server with Ctrl-C. `output/` is ignored by Git.

`scripts/check_reference_parallax.mjs` checks the layered page's served scene-depth pixels, measures far/mid/near motion in the rendered page, and verifies that first-click audio still works. It makes the donor fully opaque during the near-plane image-match measurement so the base beneath it does not dilute the measured motion; it restores the default slider value before checking audio interaction.

## How the layered parallax and glass alpha work

The page keeps the studio and the glass donor as separate image inputs:

| Input | Runtime role | Motion |
| --- | --- | --- |
| `assets/no_logo.png` | Opaque base scene, including presenter, city, ticker, and laptop | Each pixel samples `assets/scene-depth.png` and receives that depth's horizontal parallax. |
| `assets/scene-depth.png` | Static depth map for the base scene only | Drives the base image warp; it contains no depth-1 glass plane. |
| `assets/glass-runtime.png` | Full-frame, linear-light, premultiplied RGBA made from the approved right pane of the cleaned glass donor | Sampled independently at the near-plane transform corresponding to authoring depth 1 (grayscale 236/255). The donor's droplets, reflected house, streaks, and tint move together. |

The pointer position sets a horizontal camera value from -1 to +1. The fragment shader starts from shared 5% overscan coordinates. For each base pixel it samples the static depth, then performs seven iterations that move the sample coordinate toward `baseUV - camera * (0.045, 0) * (depth - 0.38)`, mixing 60% toward the target on every iteration. Darker/farther base regions therefore move less than brighter/nearer regions. The glass uses the same camera and iteration count, but its depth is fixed at 236/255; it does not read or write the base depth map. Pointer smoothing changes how quickly the camera reaches its target, not the depth assignment.

The glass alpha is one throughout the reviewed full-height right pane and zero outside. The UI slider multiplies this matte: effective alpha is `glassAlpha * slider`, where the slider defaults to 0.68. The runtime RGB is already linear and premultiplied, so the shader blends `glassPremultiplied * slider + linear(base) * (1 - effectiveAlpha)`, then encodes the result to sRGB once. At slider 0 the frame is the depth-warped base; at 1 the donor is fully visible over that still-moving base. Slider input changes neither image nor depth asset.

This is a single-pane alpha overlay, not a recovered physical transmission/refraction model. The reflected city and glass surface details are one donor image and therefore move as one near layer. The implementation and review constraints are specified in [SPEC-006](../specs/SPEC-006-LAYERED-GLASS-COMPOSITING.md).

## Build the layered glass preview

The layered preview uses `references/no_logo.png` as the base scene and `references/no_logo_leiter_glass.png` as the glass RGB donor. The flattened comparison image is for appearance reference only. `test/depth_regions.json` is the single editable base-depth map; it has no glass region. `test/glass_layers.json` is the canonical normalized source for the glass pane, house hit area, hint position and size, plus near depth and default opacity. The drawing module receives its browser geometry from `dist/glass-geometry.js`, generated from the JSON by `scripts/glass_geometry.py`. Alpha generation scales the normalized pane bounds against the actual base/donor dimensions.

Generate a raw base depth map on Apple Silicon if the verified saved candidate is unavailable. Then bake the reviewed base regions and the single-pane glass layer:

```sh
mkdir -p output/coreml_tmp output/glass_review
TMPDIR="$PWD/output/coreml_tmp" output/depth_venv/bin/python scripts/generate_raw_reference_depth.py --source references/no_logo.png --output output/glass_review/base-raw-depth.png
output/depth_venv/bin/python scripts/bake_glass_scene_depth.py
output/depth_venv/bin/python scripts/make_layered_glass.py
python3 scripts/build_layered_preview.py
```

The overlay copies the donor RGB from the reviewed right pane and assigns alpha 1 inside, 0 outside. The slider multiplies this alpha, starting at 0.68; it does not alter depth. Inspect `output/glass_review/glass-alpha.png`, `glass-layer.png`, and `glass-composite.png`. The full page is assembled under ignored `output/site_preview_layered_glass/` by copying the committed `dist/` site and replacing its layered-glass assets with the generated review assets. The local preview uses the same committed HTML, CSS, and JavaScript that CI checks and the manual Pages publish deploys.

Run the preview and its pixel-level alpha check:

```sh
python3 -m http.server 8767 --bind 127.0.0.1 --directory output/site_preview_layered_glass
```

In another terminal, run `LAYERED_PREVIEW_URL=http://127.0.0.1:8767/ node scripts/check_layered_preview.mjs`. It verifies sampler units 0/1/2, checks for WebGL errors, and reads the same rendered pane pixel at alpha 0 and 1. At alpha 0 that pixel must match the depth-warped base; at alpha 1 it must include the donor glass. `TEASER_URL=http://127.0.0.1:8767/ node scripts/check_reference_parallax.mjs` then measures the rendered layer motion and checks audio behavior on the complete page. `scripts/check_glass_drawing.mjs` also resizes the artwork to half resolution and verifies that pane interaction, hint placement, and ink canvases follow the new dimensions.

After the preview is reviewed, promote the complete page and the assets it references into `dist/`:

```sh
cp output/site_preview_layered_glass/index.html dist/index.html
cp output/site_preview_layered_glass/style.css dist/style.css
cp output/site_preview_layered_glass/parallax.js dist/parallax.js
cp output/site_preview_layered_glass/glass-ink.js dist/glass-ink.js
cp output/site_preview_layered_glass/glass-geometry.js dist/glass-geometry.js
cp output/site_preview_layered_glass/assets/{no_logo.png,scene-depth.png,glass-runtime.png,glass-layer.png,glass-alpha.png,glass-composite.png} dist/assets/
```

The page retains the existing music and drawing modules. Pane, house, and hint geometry stays normalized in the canonical configuration; the drawing module derives pixel bounds from the loaded poster dimensions. Serve `dist/` over HTTP and run `node scripts/check_layered_preview.mjs` and `node scripts/check_glass_drawing.mjs` against that URL before committing the promoted page.

## Run and check the current page

The page already lives in `dist/`. The following commands validate the committed assets and source without regenerating the reference photograph or its depth map:

```sh
python3 scripts/build.py --check
python3 scripts/check_reference_depth.py
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
TEASER_URL=http://127.0.0.1:8000/ node scripts/check_glass_drawing.mjs
TEASER_URL=http://127.0.0.1:8000/ node scripts/check_reference_parallax.mjs
```

The glass check writes captures and a report under `output/glass_drawing_check/`; the depth/audio check writes under `output/reference_parallax_check/`. The GitHub Pages workflow runs both, plus JavaScript syntax checks. `python3 scripts/build.py` without `--check` is different: it regenerates the legacy cafe depth asset, not the current reference-photo depth map.

## Promote a candidate

The current reference map is promoted from `test/depth_regions.json`. To rebuild it, run `scripts/apply_depth_regions.py` from `specs/evidence/depth-before.png`, update `dist/assets/ElGrayPimenovLeiterWindow2-depth.png`, its metadata, and `specs/evidence/depth-report-semantic.json`, then run `scripts/check_reference_depth.py` and `scripts/check_reference_parallax.mjs`. The older `scripts/make_reference_depth.py` and `scripts/manual_depth_planes.py` still produce the previous three-plane map; do not use them for the current semantic map.

`.github/workflows/pages.yml` currently builds on pushes to `teaser` and `fix/flat-front-glass-depth`, and on pull requests to `teaser`. Deployment occurs on a push to `teaser` or a manual workflow dispatch. `.github/workflows/bake-manual-depth.yml` is the older three-plane baking workflow on `fix/flat-front-glass-depth`.

## Script inventory

| Script | Purpose |
| --- | --- |
| `scripts/generate_raw_reference_depth.py` | Infer an uncorrected 1024-pixel-wide reference depth PNG with Core ML. |
| `scripts/apply_depth_regions.py` | Apply `test/depth_regions.json` to a raw neural depth PNG and write a report. |
| `scripts/bake_glass_scene_depth.py` | Bake the layered scene's base-only depth from the verified raw map and reviewed regions. |
| `scripts/make_layered_glass.py` | Create the pane-only alpha source, linear-premultiplied runtime texture, and review composite. |
| `scripts/build_layered_preview.py` | Assemble a local asset preview from the committed `dist/` site under ignored `output/`. |
| `scripts/check_layered_preview.mjs` | Browser pixel test for sampler ownership and alpha 0/1 compositing in the local preview. |
| `test/render_depth_regions.py` | Draw the editable zones over a photograph for alignment review. |
| `test/test_depth_regions.py` | Check mask values and repeatable overlay rendering. |
| `test/test_apply_depth_regions.py` | Check correction order, depth conversion, and input preservation. |
| `scripts/download_depth_model.py` | Download or verify the pinned local Core ML model cache. |
| `scripts/check_reference_depth.py` | Validate hashes, light centers, and sample points for the committed semantic reference depth map. |
| `scripts/manual_depth_planes.py` | Bake or validate the earlier three-plane reference map and evidence. |
| `scripts/make_reference_depth.py` | Infer reference depth, then apply the earlier three-plane correction. |
| `scripts/check_glass_drawing.mjs` | Browser regression for glass hit-testing, finger ink, coupled parallax, clipping, and mobile touch. |
| `scripts/check_reference_parallax.mjs` | Browser and Web Audio regression for the committed reference page and semantic depth evidence. |
| `scripts/build.py` | Validate static assets with `--check`; without it, regenerate the legacy cafe depth. |
| `scripts/check_build.py` | Check missing/stale cafe map errors and model-cache behavior. |
| `scripts/check.mjs` | Check repository text, local assets, and procedural audio output. |
| `scripts/check-ui.mjs` | Check first-gesture audio startup and mobile audio behavior. |
| `scripts/draw_teaser.py` | Regenerate the older procedural cafe artwork. |
| `scripts/make_layers.py` | Derive animated cafe layers from that artwork. |
| `scripts/make_depth.py` | Infer and commit the older cafe depth map. |
| `scripts/check-parallax.mjs` | Browser regression for the older interactive cafe page; not the current reference page. |

The cafe scripts remain in the repository because `scripts/build.py --check` and the Pages workflow still validate their committed assets. They are not the route for a new gray-dress reference photograph.
