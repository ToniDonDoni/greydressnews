# SPEC-006: Review 3 - Normalized Geometry

Review date: 2026-11-10
Branch: `feat/layered-glass`
Status: required change; not yet implemented.

## Problem

The drawing module hardcodes image dimensions and logical object bounds as absolute pixel coordinates (`IMAGE`, `GLASS`, and `HOUSE`). The same geometry is also represented in `test/glass_layers.json` and rewritten by string substitution in `scripts/build_layered_preview.py`. This ties the implementation to the current reference-image resolution.

## Required Change

Store logical image geometry as normalized coordinates in the range `0..1`, relative to the image width and height. This applies to the glass pane, house/hint area, and any other image-relative interaction bounds.

Keep this geometry in one canonical configuration consumed by the drawing module and asset-generation/preview scripts. At runtime or build time, convert normalized coordinates to pixels using the actual dimensions of the loaded image:

- `x = u * image_width`
- `y = v * image_height`

Remove hardcoded source-image dimensions and absolute logical bounds from the drawing module. Remove the coordinate string replacements from `scripts/build_layered_preview.py`; the builder must use the shared configuration without rewriting source code.

## Acceptance Criteria

- [ ] Logical image positions and bounds are stored only as normalized coordinates.
- [ ] The drawing module and generation/preview scripts use the same canonical geometry configuration.
- [ ] Pixel coordinates are derived from the actual image dimensions, not hardcoded.
- [ ] The current 1672 x 941 reference retains its existing pane, hint, and interaction placement.
- [ ] A different-resolution reference with the same composition works without source-code coordinate changes.
- [ ] Drawing, hit-testing, and hint placement remain aligned after responsive scaling.
- [ ] Existing drawing appearance and music behavior remain unchanged.

This is a geometry representation change only. It does not require changes to the parallax algorithm, depth values, glass compositing, or visual design. If a replacement reference changes the composition rather than only its resolution, its normalized geometry must be reviewed.
