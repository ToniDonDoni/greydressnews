# SPEC-006: Layered Glass Compositing Review

Review date: 2026-11-10
Implementation branch: `feat/layered-glass`
Review status: implementation is present, visual and interaction acceptance remain open.

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

The coordinate calculation must use the displayed artwork element and reject invalid or zero-size bounds. Verify both mouse movement and touch dragging in the complete page after correction.

### 2. The reflected city is masked only across the middle of the pane

`test/glass_layers.json` defines `glass_alpha.reflection_polygon` with vertical coordinates from approximately 195 to 520 in a 941-pixel-high image. The supplied donor, `references/no_logo_leiter_glass.png`, shows the reflected city across the full height of the right pane. The generated alpha consequently clips that reflection to the middle, regardless of the page opacity slider value.

Revise the reflection mask to follow the full-height reflected architecture in the donor. Inspect the alpha-only output and composite against the base before accepting the mask; keep the pane boundary and droplet/detail alpha independent from the city mask.

### 3. Laptop depth needs tuning to level 45

The current authoring level for the laptop in `test/glass_layers.json` is 32. The bake conversion maps this to grayscale value 192, while the glass near plane is 236. The user requested laptop level 45. With the current conversion, level 45 maps to grayscale value 174. This is a depth-tuning request, not an implementation bug.

Update the laptop authoring level to 45, rebake the static scene-depth asset and its metadata, then inspect laptop motion relative to the glass and ticker at the reference camera extremes. The base photograph and glass donor remain unchanged.

## Acceptance still required

- Recheck pointer coordinate mapping and confirm the page responds to the intended mouse gesture.
- Confirm the reflected city remains visible from the top to the bottom of the pane and follows the glass transform.
- Confirm the laptop at depth level 45 moves distinctly from the glass while remaining behind it; verify the ticker retains its separate depth.
- Review the complete local page at neutral and extreme camera positions, including the drawing layer and opacity control.
- Run the project checks listed in `scripts/README.md` after implementation changes and record the results before marking SPEC-006 acceptance complete.

## Scope of this review update

Only this review document is added by this update. Runtime code, source images, depth maps, glass masks, generated assets, and the implementation specification are not changed here.
