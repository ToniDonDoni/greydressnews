# SPEC-006: Layered Glass Compositing Review 2

Review date: 2026-11-10
Branch: `feat/layered-glass`
Reviewed commits: `13e3226`, `5641a22`, `3fb5bd4`
Verdict: rework required; SPEC-006 acceptance has not passed.

This review covers [SPEC-006](SPEC-006-LAYERED-GLASS-COMPOSITING.md), the [first review](SPEC-006-LAYERED-GLASS-COMPOSITING-REVIEW.md), committed implementation files, and the local candidate in `output/site_preview_layered_glass/`. It supersedes the first review's claims that the three findings have been resolved sufficiently for acceptance. Local candidate changes and committed changes are distinguished below.

## 1. Clarified scene and depth ownership

The user clarified that the base photograph has no separate rain-glass layer. Its right background and laptop belong to the scene behind the future glass. Assigning that entire background to glass depth is incorrect.

| Contribution | Source | Authoring depth | Ownership |
| --- | --- | ---: | --- |
| Left city | `references/no_logo.png` | 100 | Base scene depth map |
| Studio wall | `references/no_logo.png` | 48 | Base scene depth map |
| Presenter, including both arms | `references/no_logo.png` | 26 | Base scene depth map |
| Laptop | `references/no_logo.png` | 21 | Base scene depth map; latest explicit user instruction |
| News ticker | `references/no_logo.png` | 21 | Base scene depth map |
| Right painted background | `references/no_logo.png` | Proposed 48 | Background behind glass; review the proposed continuation of the studio wall before baking |
| Rain glass, droplets, streaks, reflected house and its lights | Right pane of `references/no_logo_leiter_glass.png` | 1 | Separate alpha overlay and near-plane transform |

Required re-marking:

- Remove the `front_glass` depth-1 rectangle from the base scene map. Keep the pane geometry separately for the glass overlay and drawing hit-testing.
- Give the right base background a scene depth behind the glass. Level 48 is the proposed continuation of the studio wall, rather than an already accepted measurement.
- Preserve the reviewed presenter outline and the requested 20-source-pixel rightward boundary adjustment. Background contours must disappear behind the presenter instead of cutting through the sleeve. The earlier sleeve correction was made in a diagnostic overlay; it must also be respected by the final region overlap logic.
- Preserve the traced laptop at depth 21, the ticker at depth 21, and removal of the five independent right-side light regions.
- Show the revised base map on the base photo before baking. Show the separate glass pane at depth 1 in a second diagnostic so the two ownership models cannot be confused.

The house in the donor is a reflection from the viewer's side. Its lights remain part of the glass overlay and do not become independent far-depth holes. Base and glass must be sampled at separate coordinates before alpha compositing.

The latest laptop depth 21 supersedes the earlier request for 45. Equal laptop and ticker depths are intentional under the latest instruction; they are not a new implementation defect. SPEC-006's different-depth wording and the first review's remaining level-45 checklist are stale.

### 1.1 Exact input files and permitted uses

All three reference files below are 1672 x 941 pixels. Similar dimensions and similar appearance do not make them interchangeable.

| File | Contents and role | Supplies studio color? | Input to studio depth inference? | Supplies glass RGB/alpha? |
| --- | --- | --- | --- | --- |
| `references/no_logo.png` | Base studio scene: presenter, both arms, left city, studio wall, laptop, ticker, and the supplied painted right background. The right painted color remains part of this base. | Yes; this is the runtime base color texture. | **Yes; this is the only reference-image input for studio depth.** | No |
| `references/no_logo_leiter_glass.png` | Glass donor. Its right pane contains rain, droplets, streaks and reflected architecture. The laptop and right ticker were removed from that pane. The left part still contains the presenter/studio and must be excluded from the overlay. | No | **No** | **Yes; only the approved right pane.** Alpha is prepared separately because this source is an opaque RGB image. |
| `references/no_logo_laiter_spec_gpt.png` | Flattened appearance comparison, where glass, reflected architecture, studio objects and ticker have already been combined. | No | **No** | No; comparison only, not a runtime layer. |

Canonical SHA-256 identities:

```text
references/no_logo.png
0e3fe9c852a2638a0126303652688fbbea5aaf6dbc220cf9c5292b4bc8c07ace

references/no_logo_leiter_glass.png
5eb180b7225b800a6e68bc23c3f2ffca688336360af8075fb18404e04973b120

references/no_logo_laiter_spec_gpt.png
6f08fe12eeeba2c20805c52d4a3fd2f331b6d7f352bd37fa2c47b902b41f4980
```

`references/ElGrayPimenovLeiterWindow2.png` belongs to the earlier page. Its depth and evidence are historical inputs, not substitutes for the new studio's raw depth. Files under `draft/` are excluded from this work by user instruction.

### 1.2 Studio depth: input, region map, and output

The required studio-depth chain is:

```text
references/no_logo.png                       test/depth_regions.json
        |                                   reviewed BASE regions only
        v                                             |
scripts/generate_raw_reference_depth.py               |
        |                                             |
        v                                             |
output/glass_review/base-raw-depth.png + .json         |
        |                                             |
        +--------> scripts/apply_depth_regions.py <----+
                              |
                              v
                output/glass_review/scene-depth.png + .json
                STATIC DEPTH OF THE BASE STUDIO ONLY
```

The raw prediction is inferred from `no_logo.png` without any glass overlay applied. Manual correction assigns the reviewed studio-object depths over that raw prediction. Neither the donor image, donor alpha, reflection polygon nor opacity slider participates in this depth calculation.

`test/depth_regions.json` is the editable source for base-object contours and levels. It must contain city, studio/background, presenter, laptop, and ticker regions after correction. It must not contain `front_glass`, independent reflected-window holes, or a region assigning the right background to level 1. Pane geometry may still exist in the separate glass configuration; it is not a base-depth region.

The existing `output/glass_review/base-raw-depth.json` records `source_name = no_logo.png` and the correct source hash above. Its raw PNG hash is `db89587639c1525e238bbd6d78a530c22c6ab95ea26ecd44226d13ec8315838e`. It can be reused only after verifying these identities. Regenerating neural inference is unnecessary when the exact source and verified raw prediction are unchanged; rebaking the edited semantic regions is still required.

Do **not** reuse `output/depth_review/new_photo_raw_depth.png` for this studio. Its companion report identifies `no_logo_laiter_spec_gpt.png`, the flattened appearance image, as its source. A filename containing `new_photo` is not proof of the correct input.

`scene-depth-manual.png` is the current alternate candidate identified in R2-02. Consolidate the existing generation paths so the accepted studio bake and the preview consume one declared output, `output/glass_review/scene-depth.png`, with its matching provenance report. The current files are not accepted merely because they have these names.

### 1.3 Glass: input, alpha, and separate depth 1

The glass chain is independent:

```text
references/no_logo_leiter_glass.png
        |
        v
approved full-height RIGHT pane + alpha preparation
        |
        v
output/glass_review/glass-layer.png
        |
        +----> near-plane sampler with authoring depth 1
               (independent of the studio depth texture)
```

`scripts/make_layered_glass.py` reads the glass donor and `test/glass_layers.json`. It may read `references/no_logo.png` to generate a diagnostic composite, but it must not use the composite or donor to overwrite studio depth. The single pane alpha is 1 inside the approved right pane and 0 outside; the runtime slider scales it. The donor's left presenter/studio never enters the overlay.

The authoring level **1 belongs to the separate glass plane**. It is applied by the renderer when calculating the sampling displacement of the alpha overlay. In the current convention, the near plane is represented by `236/255` in the displacement calculation. This does not require a depth-1 rectangle in the studio texture and does not require neural depth inference from the glass donor. A constant near-plane parameter is sufficient for the agreed first implementation.

Depth and opacity are different controls:

- Glass depth 1 determines how the glass layer moves.
- Glass texture alpha determines where and how strongly the donor contributes.
- The slider scales that alpha from 0 to 1, with default 0.68. It does not change glass depth or rewrite studio depth.
- Slider value 1 means full use of the prepared alpha texture; it does not automatically mean every pane pixel is opaque.
- Slider value 0 removes the glass color contribution. The studio and its depth map remain the same.

The reflected house and its lights move with this glass layer in the agreed approximation. They are not reclassified as a far physical building behind the studio.

### 1.4 Composition: two coordinate lookups, no merged depth map

The renderer must keep these three texture inputs distinct:

```text
baseTex  = references/no_logo.png
depthTex = corrected depth inferred from references/no_logo.png
glassTex = alpha overlay derived from references/no_logo_leiter_glass.png
```

For each output pixel:

```text
studio_uv = scene_depth_warp(output_uv, camera, depthTex)
glass_uv  = near_plane_warp(output_uv, camera, glass_depth = 1)

B      = sample(baseTex, studio_uv)
(F, a) = sample(glassTex, glass_uv)
a_eff  = a * opacity_slider

C_linear = a_eff * F_linear + (1 - a_eff) * B_linear
```

This formula states layer ownership; the premultiplied runtime representation and correct filtering remain subject to R2-05. The output is a composite color. Do not produce a single "combined depth PNG" by alpha-mixing studio depth with glass depth: one scalar would again collapse two overlapping surfaces into one moving surface.

In particular, a laptop pixel remains studio depth 21 in `depthTex` even when visible through a glass pixel moving at depth 1. At camera extremes the laptop must move relative to a nearby droplet. The same applies to ticker depth 21. Equal laptop/ticker levels mean those two objects can share motion; both must still move relative to the glass.

### 1.5 Authoring levels, grayscale, and coordinate systems

Depth levels 1-100 are authoring values, not meters and not literal PNG byte values. The current conversion is `round(236 - (level - 1) * 140 / 99)`:

| Level | Nominal grayscale | Use |
| ---: | ---: | --- |
| 1 | 236 | Separate glass-plane displacement only |
| 21 | 208 | Laptop and ticker in studio depth |
| 26 | 201 | Presenter in studio depth |
| 48 | 170 | Studio wall; proposed right-background depth |
| 100 | 96 | Left city in studio depth |

Regions retaining configured neural detail can vary around their nominal grayscale. Therefore tests must verify authored semantic levels and object-interior samples using the configured bake formula, not reject every isolated raw pixel equal to 236. The prohibited case is the authored near-glass rectangle or a broad base-background assignment to level 1.

Reviewed base polygons currently use a 1920 x 1077 authoring canvas; the source images use 1672 x 941. Scale coordinates explicitly when creating image-sized masks. The requested 20-source-pixel horizontal shift corresponds to approximately 23 authoring pixels (`1235 -> 1258`). Do not silently interpret these coordinates as 1672 x 941 pixels. Preview fitting, normalized texture coordinates, pane masking and drawing hit-testing must describe the same registered composition.

## 2. Findings

### R2-01 - P1: The live renderer binds all three samplers to the photograph

Location: `output/site_preview_layered_glass/parallax.js`, `initialize()`.

The renderer calls `gl.uniform1i()` before activating the linked program with `gl.useProgram()`. The first activation happens later in `draw()`. The sampler assignments therefore fail and leave their default texture-unit values at zero.

An isolated diagnostic copy of the same renderer reported the actual values after initialization:

```json
{
  "samplers": {
    "baseTex": 0,
    "depthTex": 0,
    "glassTex": 0
  },
  "glError": 1282
}
```

`1282` is `INVALID_OPERATION`. Expected sampler units are 0, 1, and 2. The depth and glass inputs currently sample the base color texture. Visible motion can consequently be a color-driven warp, and a responsive opacity label does not demonstrate working alpha compositing.

Required correction: activate the program before setting its uniforms; verify the actual sampler bindings, absence of WebGL errors, and the rendered contribution of each texture. Then repeat AC-04 landmark displacement measurements at settled camera positions -1, 0, and +1. Earlier screenshots and pointer checks cannot establish independent layer motion for this renderer.

### R2-02 - P1: The documented depth bake ignores the reviewed region map

Locations: `scripts/bake_glass_scene_depth.py`, `test/glass_layers.json`, `test/depth_regions.json`, and the layered workflow in `scripts/README.md`.

The documented layered bake reads its own polygons from `test/glass_layers.json`, including an older coarse presenter polygon. The manually reviewed boundaries live in `test/depth_regions.json`. Editing the reviewed map therefore does not update the documented layered bake.

The actual local preview uses a third artifact produced by `scripts/apply_depth_regions.py`:

| Artifact | Dimensions | SHA-256 prefix |
| --- | --- | --- |
| `output/glass_review/scene-depth.png` | 1672 x 941 | `17dd8bb4797b5ab1` |
| `output/glass_review/scene-depth-manual.png` | 1024 x 576 | `a22efd3e4f07de74` |
| `output/site_preview_layered_glass/assets/scene-depth.png` | 1024 x 576 | `a22efd3e4f07de74` |

Different depth-map resolution is not itself the defect. The defect is that the instruction and the served preview use different geometry and generation paths. The served manual map also contains `front_glass` at level 1, violating the base-only depth model clarified in section 1 and SPEC-006 section 5.4.

Required correction: make the reviewed base geometry the single authoring source, separate the pane from base depth, and make the documented generation command reproduce the asset actually served in the preview. Verify foreground ownership over both arms and laptop/ticker overlap.

### R2-03 - P1: The committed files do not reproduce the complete candidate

Locations: `output/site_preview_layered_glass/`, `scripts/README.md`, and the reviewed commits.

The layered runtime implementation and opacity control exist only in ignored preview files. The committed `dist/index.html` and `dist/parallax.js` still implement the previous single-image scene. No committed preview template or assembly command reproduces the local layered page. The pointer-bound correction in `dist/parallax.js` is an uncommitted working-tree change.

This is an AC-08 reproducibility defect, not a request to commit `dist/`. Preserve the user's instruction excluding `dist/` from commits. Keep the editable candidate source or its generator in an appropriate tracked project location so the existing preview workflow can reproduce it.

### R2-04 - P2: Drawing geometry is still registered to the previous pane

Location: `output/site_preview_layered_glass/glass-ink.js`, constants `IMAGE`, `GLASS`, and `MUSIC_HINT`.

The preview retains `IMAGE = 1920 x 1077` and `GLASS = {left: 1240, bottom: 970}` from the previous composition. Its right pane is therefore not the approved full-height pane. The normalized drawing boundary starts to the left of the new pane and ends at about 90% of image height, excluding the lower glass over the ticker. Reusing a legacy coordinate system is possible only with an explicit, verified registration; these bounds do not provide one.

Required correction: derive drawing and hint geometry from the same pane and near transform as the glass renderer. Verify that drawing is accepted on the lower pane, rejected outside it, and stays aligned within one rendered pixel at camera extremes. Do not recolor the brush or change music behavior as part of registration.

### R2-05 - P2: Alpha leaks beyond the pane and the specified runtime representation is missing

Locations: `scripts/make_layered_glass.py`, pane feathering and RGBA export; local renderer texture upload and sampling.

The pane is blurred across its left boundary without restoring exact zero alpha outside it. Inspection of the generated `glass-layer.png` found 1841 pixels with nonzero alpha at source x = 1093-1094, left of the configured pane start x = 1095. Maximum leaked alpha is 32/255. AC-02 explicitly requires zero outside the approved pane.

The generator exports a straight-alpha PNG only. It retains donor RGB in transparent texels; 1028554 zero-alpha pixels have nonzero RGB. This is valid for an editable straight-alpha image, but it is not the separate linear premultiplied runtime derivative required by SPEC-006 section 5.5. The preview filters the straight RGB/alpha texture before converting the sampled RGB to linear light. The required premultiplied filtering and numerical reference-composite check are absent. The prepared matte is the pane boundary only: alpha 1 throughout the approved right pane and 0 outside. The overall UI slider scales that alpha; no feature-specific reflection, window, droplet, tint, streak, or frame masks are part of this agreed first version.

Required correction: remove outward alpha leakage and use the pane-only alpha recipe in SPEC-006 section 5.3. Preserve the donor RGB inside the pane. Provide and validate the separate linear premultiplied runtime representation and numerical reference composite. Inspect the seam over black, white, checkerboard, and the moving base for halos and contaminated edge colors.

### R2-06 - P2: Feature acceptance checks are incomplete and currently fail

Locations: `test/test_layered_glass.py`, `scripts/check.mjs`, `scripts/check_reference_depth.py`, and the first review.

The two general region-map suites pass, but they do not exercise the live shader or verify texture bindings. The focused layered suite has two failures and one error out of five checks. It expects assets and controls in `dist/`, which conflicts with the current preview-only candidate, and still requires unequal laptop/ticker depths despite the user's latest depth-21 instruction. `scripts/check.mjs` also expects a layered fallback poster that is absent from the committed page. The committed semantic-depth evidence no longer matches the edited region-map checksum.

Required correction: target acceptance checks at the actual generated candidate and current agreed depths. Preserve validation of the existing committed page without pretending that its historical evidence describes the new candidate. Add a meaningful runtime check of sampler assignments and actual landmark motion; the current analytical displacement calculation tests configuration arithmetic only.

### R2-07 - P2: Full-page fallback and visual acceptance remain open

Locations: `output/site_preview_layered_glass/index.html` and `parallax.js`.

The preview's fallback poster is the bare base photograph rather than the neutral glass composite required by section 5.5. The candidate also omits the existing renderer's context-loss handling. Missing overlay, WebGL failure, context loss, touch dragging, reduced motion, and complete drawing/music interactions have not been demonstrated to satisfy AC-09.

Required correction: verify the required failure paths and complete desktop/mobile interactions after correcting R2-01. A loaded page, a moving image, or a changed slider label is insufficient acceptance evidence.

## 3. Status of the first review's three findings

| Earlier finding | Verified state in this review |
| --- | --- |
| Pointer coordinates | The local candidate uses displayed artwork bounds. The working-tree correction in `dist/parallax.js` remains outside the commits. The detached-image description in the first review refers to an earlier candidate; the committed renderer uses the poster element. Correct coordinates do not resolve the independent sampler defect. |
| Reflection clipped to the middle | The configured polygon now spans y = 0-940. This fixes the mask's vertical extent, but the live renderer is not sampling the glass texture correctly. Runtime appearance remains unaccepted. |
| Laptop depth | Level 21 is present in both authoring configurations and in the manual depth report, mapping to grayscale 208. It supersedes 45. The two geometry pipelines and the live texture binding still prevent acceptance of the overall result. |

## 4. Acceptance assessment

| Criterion | Result | Evidence or remaining work |
| --- | --- | --- |
| AC-02 - Usable transparency | Fail | Nonzero alpha outside the pane; runtime glass sampling is broken. |
| AC-03 - Clean overlay | Not demonstrated | Source identities are verified; complete diagnostic-background inspections and acceptance evidence are missing. |
| AC-04 - Independent motion | Fail | Actual samplers are 0/0/0. Required settled-camera landmark measurements are absent. |
| AC-05 - Scene depth | Fail | Two authoring maps; documented bake differs from served asset; base map still contains the near-glass rectangle. Equal laptop/ticker depth 21 is a user-approved change requiring spec wording alignment. |
| AC-06 - Boundaries | Not demonstrated | Repeat seam, edge, halo, and clipping checks after runtime correction. |
| AC-07 - Drawing and music | Partial; not accepted | Generic music checks pass. Full-height pane registration and complete drawing/touch/reduced-motion regressions remain open. |
| AC-08 - Reproducibility | Fail | Complete candidate source/assembly is not tracked; generation path differs from the served map; specified runtime derivative is absent. |
| AC-09 - Full-page review | Fail / incomplete | Candidate loads, but layered rendering is broken; fallback and desktop/mobile failure-path evidence are incomplete. |

The first draft of SPEC-006 prescribed internal reflection/detail masks and different laptop/ticker depths. The revised specification now describes one full-pane alpha overlay and level 21 for both laptop and ticker, following the conversation. Spatially varying alpha or further artistic masks remain out of scope unless discussed and approved separately.

## 5. Checks actually performed

| Check | Result |
| --- | --- |
| `test/test_depth_regions.py` | 3 passed |
| `test/test_apply_depth_regions.py` | 2 passed |
| `test/test_layered_glass.py` | 2 passed, 2 failed, 1 error |
| `node scripts/check.mjs` | Failed: layered fallback poster assertion |
| `node scripts/check-ui.mjs` | Passed the existing procedural audio/gesture scheduling checks |
| `python3 scripts/build.py --check` | Passed validation of the existing committed static page |
| `scripts/check_reference_depth.py` using the project Python environment | Failed: stale region-map checksum |
| `scripts/check_build.py` using the project Python environment | 11 passed |
| Live local preview | Loaded; slider UI changed from 0 to 1 and was restored to 0.68. This did not establish correct compositing. |
| Isolated WebGL diagnostic | Confirmed sampler units 0/0/0 and error 1282 |
| Source hashes | Base and glass donor match the identities recorded in SPEC-006 |

The isolated diagnostic is under `output/site_preview_layered_glass/review/`. It adds a readout to a copy of the candidate renderer and does not fix its initialization order. Original preview files and tracked implementation files were not changed by the review.

## 6. Rework and verification sequence

1. Align the written depth ownership with section 1 and the latest user instructions. Review the base-only overlay with no depth-1 glass rectangle.
2. Use one reviewed base-region source and reproduce the served static depth asset through the documented command.
3. Correct texture-unit initialization and verify actual runtime sampler units 0/1/2 with no WebGL error.
4. Make the complete candidate reproducible from tracked project sources while retaining the existing project workflow and the user's exclusion of `dist/` from commits.
5. Resolve pane-edge alpha and runtime filtering; register ink and hint geometry to the same full-height pane.
6. Repeat diagnostic-background, camera-extreme, landmark-motion, drawing, music, mobile, reduced-motion, and failure-path checks. Record the actual evidence before marking acceptance criteria complete.

This document records review findings and required rework. It does not mark fixes as implemented or authorize publication.

## 7. Concrete correction plan and verification criteria

The following items specify required corrections to the current implementation. They are not claims that those corrections have already been made. Build and preview handling continues to follow the existing project workflow.

### 7.1 Correct the studio authoring map first

Edit `test/depth_regions.json`:

1. Remove `front_glass` from `regions`, `legend`, and `depth_bake.write_order`.
2. Add scene-background coverage for the right side, or extend the matching background region. Review proposed level 48 over the actual base photo before baking.
3. Write background regions before the presenter and laptop. Keep ticker last at overlaps. Verify that rear regions never overwrite a visible part of either arm.
4. Preserve city 100, presenter 26, laptop 21, ticker 21, and the removal of all five light regions.
5. Render the corrected contours over `references/no_logo.png`. The right side must be labeled as studio/background, with no `GLASS 1` label in this base diagnostic. A glass-only diagnostic may separately show the pane at level 1.

Verification: a configuration check rejects any `front_glass` entry or level-1 base region. It also checks that every active region appears exactly once in the legend and write order, that all contours fit the authoring canvas, and that the presenter owns the sleeve/hand overlap. The reviewed base overlay must visibly match the intended silhouettes.

### 7.2 Consolidate and rebake studio depth

Use `scripts/apply_depth_regions.py` with the corrected `test/depth_regions.json`. Refactor `scripts/bake_glass_scene_depth.py` to delegate to that same reviewed map if it remains the layered-scene entry point. Remove the independently editable duplicate base polygons from `test/glass_layers.json`, or make them generated data with no separate authoring authority. Keep pane geometry and glass parameters in that file.

After correcting and reviewing the map, the existing raw prediction can be applied with:

```sh
output/depth_venv/bin/python scripts/apply_depth_regions.py --photo references/no_logo.png --input-depth output/glass_review/base-raw-depth.png --map test/depth_regions.json --output output/glass_review/scene-depth.png
```

If the verified base raw prediction is unavailable or invalid, regenerate it from this exact input first:

```sh
output/depth_venv/bin/python scripts/generate_raw_reference_depth.py --source references/no_logo.png --output output/glass_review/base-raw-depth.png
```

Verification: the corrected-depth report identifies the base source hash, raw-depth hash, corrected region-map hash and output hash. Its region list contains no glass region and records laptop/ticker levels 21. The preview's served depth file must have the same hash as this declared corrected output. The report's background coverage must include the former glass rectangle at the reviewed background depth.

### 7.3 Keep glass generation isolated from studio depth

Use `references/no_logo_leiter_glass.png` as the sole glass-color donor in `scripts/make_layered_glass.py`. Retain the entire approved right pane from top to bottom; the reflection's upper and lower parts must not be discarded. Keep donor RGB unchanged inside the pane, set alpha to 1 inside and 0 outside, and let the overall slider scale alpha. Do not subdivide the donor with feature-specific masks. Correct the runtime representation described by R2-05.

Verification: donor provenance matches the recorded glass hash; alpha is exactly one inside the approved pane and zero outside; the output contains no second presenter, laptop/logo or ticker letters. Inspect its RGB and alpha separately and on diagnostic backgrounds. Changing the opacity slider must leave the overlay and studio-depth bytes unchanged. Changing studio region depths must not alter the donor or regenerate it from another image.

### 7.4 Correct the renderer's texture and depth ownership

In the candidate renderer, activate the linked program before assigning sampler uniforms. Bind base color to texture unit 0, studio depth to unit 1, and glass to unit 2. Base coordinates use `depthTex`; glass coordinates use the separate constant level-1 near plane. Apply slider opacity only to the glass color contribution. Register ink to the same glass coordinates.

Verification: runtime diagnostics report `baseTex=0`, `depthTex=1`, `glassTex=2` and no WebGL error. Check the actual bound assets as well as the integer sampler values. Do not accept a label change or an analytically computed displacement as proof of the rendered effect.

### 7.5 Required checks for the repaired candidate

| Check | Trigger and expected result |
| --- | --- |
| D-01 - Base identity | Studio raw and corrected reports identify `references/no_logo.png` with its exact hash. Neither donor nor flattened appearance image is used for studio inference. |
| D-02 - No near glass in studio depth | The base config, bake report and sampled background area contain no authored glass-depth rectangle. The former right pane area uses the reviewed scene/background level except where presenter, laptop or ticker own the pixel. |
| D-03 - Base object depths | Interior samples match city 100, presenter 26, laptop 21 and ticker 21 under the documented grayscale/detail conversion. Background samples match the reviewed background level. |
| D-04 - Correct artifact served | The studio-depth asset loaded by the page matches the declared generated PNG's hash. Rerunning the documented generation path reproduces that result from the same inputs/settings. |
| D-05 - Independent source ownership | Changing the slider through 0, 0.68 and 1 does not change the studio-depth bytes or its source identity. Glass generation identifies only the cleaned donor as glass RGB input. |
| D-06 - Correct runtime inputs | Actual bound texture units/assets are base 0, depth 1, glass 2, with no WebGL error; base color is not accepted as depth or glass. |
| D-07 - Glass disabled | At slider 0 the image equals a base-only render at the same camera position within the documented numerical tolerance. It remains a depth-warped studio, rather than becoming a flat static poster. |
| D-08 - Glass enabled | At default 0.68 and at 1 the donor's droplets/reflection contribute inside the pane. Off-pane studio pixels are unchanged by slider changes. Level 1 controls overlay movement regardless of slider value. |
| D-09 - Relative motion | At settled camera -1, 0 and +1, identify a laptop landmark, right-ticker landmark and adjacent droplet. At a 1672-pixel artwork width, each base-object landmark moves by more than 3 pixels relative to the droplet between extremes, matching configured transforms within 1 pixel as required by AC-04. Reflected windows move with the glass. |
| D-10 - Occlusion and edges | At neutral/intermediate/extreme views the presenter retains both arms, the rear contour does not cut the sleeve, and no pane seam, doubled frame, stretched border or halo appears. The separate glass covers the ticker down to image bottom. |
| D-11 - Drawing and failures | Drawing/hint registration is within 1 rendered pixel, including the lower pane. Recheck touch, music gestures, reduced motion, missing glass and WebGL/context-loss fallback on the complete page. |

Update `test/test_depth_regions.py`, `test/test_apply_depth_regions.py` and `test/test_layered_glass.py` to assert these current layer responsibilities. Replace stale tests requiring `front_glass` inside the base map, unequal laptop/ticker depths, or accepted preview assets in the committed `dist/` page. Retain meaningful checks for historical page assets against their own evidence. Align SPEC-006 and both review checklists with the latest level-21 instruction and base/glass separation before declaring acceptance complete.

## 8. Rework implementation status

Updated after applying the corrections in this review. This status supplements the findings above; it does not mark full SPEC-006 acceptance complete.

| Finding | Current state | Verification / remaining work |
| --- | --- | --- |
| R2-01 - WebGL samplers | Corrected in the tracked preview renderer. The program is activated before sampler uniforms are assigned. | `scripts/check_layered_preview.mjs` passed: samplers `[0, 1, 2]`, WebGL error `0`, pane pixel changed from `[173, 190, 218]` at alpha 0 to `[74, 86, 105]` at alpha 1. |
| R2-02 - Depth source of truth | Corrected bake now reads `test/depth_regions.json`; the depth-1 glass region is removed. The right background is assigned the proposed level 48; laptop and ticker remain 21. | Raw depth provenance identifies `references/no_logo.png`; the preview builder copies the generated scene map. The right-background level remains a visual proposal for review. |
| R2-03 - Reproducible candidate | Added tracked preview template and `scripts/build_layered_preview.py`; it assembles the complete local page under ignored `output/`. | Build completed successfully. The existing `dist/` page was read for retained music and ink modules and was not written by the builder. |
| R2-04 - Ink registration | The preview build registers canvas dimensions and pane bounds to 1672 x 941 and x=1095..1672, y=0..941. | Geometry generation succeeds. Full drawing alignment, hint placement, and touch checks at camera extremes remain open. |
| R2-05 - Alpha/runtime texture | Replaced feature-specific alpha construction with one pane matte: 1 inside, 0 outside. The generator emits straight RGBA and a linear premultiplied runtime texture. | Python coverage checks and the browser alpha 0/1 pixel check pass. Diagnostic-background and seam review at camera extremes remain open. |
| R2-06 - Acceptance checks | Updated focused tests to the base-only map and equal level-21 laptop/ticker. Added a browser test for actual sampler bindings and pane pixels. | `test_depth_regions.py` (3), `test_apply_depth_regions.py` (2), `test_layered_glass.py` (4), and the historical `scripts/check_reference_depth.py` all pass. Legacy depth validation reads its own recorded evidence rather than treating the candidate region map as its source. |
| R2-07 - Fallback and full-page review | Preview fallback now uses the generated neutral glass composite; a context-loss handler retains that poster and reports the failure. | Desktop page loads and the alpha pixel test passes. Mobile touch, reduced motion, music gestures, missing-texture, and context-loss acceptance are not yet complete. |

Pixel test evidence at canvas coordinate `(1170, 500)`, camera at rest:

```text
alpha 0:       [173, 190, 218, 255]
base reference:[173, 190, 217]
max delta:     1
alpha 1:       [74, 86, 105, 255]
max change:    113
```

The result demonstrates that alpha 0 returns the base pixel and alpha 1 contributes the glass donor at this pane location. It does not by itself establish optical quality or the remaining interaction criteria.
