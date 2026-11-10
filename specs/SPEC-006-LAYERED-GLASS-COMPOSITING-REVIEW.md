# SPEC-006: Layered Glass Compositing Review

Review date: 2026-11-10
Implementation branch: `feat/layered-glass`
Review status: the three findings below have been addressed in the local candidate; full visual and interaction acceptance remains open.

This review records the implementation state and the three issues identified during local review. It does not change the implementation requirements in `SPEC-006-LAYERED-GLASS-COMPOSITING.md`.

## Work completed

- Added a layered renderer in `dist/parallax.js` that loads the base scene, a static scene-depth map, and a separate RGBA glass texture. The base and glass are sampled with separate depth transforms and composited in linear light.
- Added reproducible authoring scripts in `scripts/make_layered_glass.py` and `scripts/bake_glass_scene_depth.py`, with editable geometry and opacity settings in `test/glass_layers.json`.
- Added runtime assets for the base scene, scene depth, glass layer, fallback preview, and associated metadata under `dist/assets/`.
- Added an overall glass-opacity slider below the artwork, with a default value of 0.68.
- Registered the drawing layer to the new 1672 x 941 scene geometry.
- Updated the SPEC-006 implementation status and added a layered-glass generation workflow to `scripts/README.md`.

These items describe work present in the current worktree. They do not mean that all SPEC-006 acceptance criteria have passed; the specification still marks the full-page, mask, motion, and visual reviews as pending.

## Issues found

### 1. Pointer coordinates can prevent parallax from moving

`dist/parallax.js` creates `photo` with `new Image()` for the WebGL texture, then `pointerTarget()` calls `photo.getBoundingClientRect()`. This image is not the displayed page element, so its rectangle has no useful on-page dimensions. Dividing pointer coordinates by that zero-width rectangle can produce invalid target coordinates; `setTarget()` does not reject `NaN`. In the local page, pointer movement can therefore fail to move the artwork.

Resolved in the local candidate: coordinate calculation uses the displayed artwork element and rejects invalid or zero-size bounds. The complete page loaded and pointer movement shifted the rendered artwork in the browser. Touch-drag regression remains part of full-page acceptance.

### 2. The reflected city is masked only across the middle of the pane

`test/glass_layers.json` previously defined `glass_alpha.reflection_polygon` only across the middle of the image, clipping the reflected city.

Resolved in the local candidate: the reflected-architecture region now spans the full pane height with partial opacity. The alpha diagnostic reports partial coverage, and the composite shows the reflection from top to bottom. Visual acceptance remains open.

### 3. Laptop depth needs tuning to level 45

The review originally recorded laptop level 45. The latest user direction sets the laptop to level 21, matching the ticker's depth.

Resolved in the local candidate: the laptop is authored at level 21 and the static depth map was rebaked from the base photo's saved raw neural depth. At the configured scale, level 21 maps to grayscale 208. The base photograph and glass donor remain unchanged.

## Acceptance still required

- Recheck pointer coordinate mapping and confirm the page responds to the intended mouse gesture.
- Confirm the reflected city remains visible from the top to the bottom of the pane and follows the glass transform.
- Confirm the laptop at depth level 45 moves distinctly from the glass while remaining behind it; verify the ticker retains its separate depth.
- Review the complete local page at neutral and extreme camera positions, including the drawing layer and opacity control.
- Run the project checks listed in `scripts/README.md` after implementation changes and record the results before marking SPEC-006 acceptance complete.

## Scope of this review update

Only this review document is added by this update. Runtime code, source images, depth maps, glass masks, generated assets, and the implementation specification are not changed here.
