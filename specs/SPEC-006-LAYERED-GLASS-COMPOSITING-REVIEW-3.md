# SPEC-006: Review 3 - Resolution-Independent Geometry

Review date: 2026-11-10
Branch: `feat/layered-glass`
Status: required architectural change; not yet implemented.

This review records the required change to drawing, pane, and interaction geometry. It supplements SPEC-006 and Reviews 1 and 2. It does not claim that the current implementation already satisfies these requirements.

## 1. Problem

The current drawing module stores image dimensions and logical object bounds as absolute pixel coordinates:

- `IMAGE` stores the source canvas dimensions.
- `GLASS` stores the pane bounds in source-image pixels.
- `HOUSE` stores the interactive house/hint region in source-image pixels.

The same geometry is duplicated in `test/glass_layers.json` and in string replacements inside `scripts/build_layered_preview.py`. The preview builder expects exact legacy declarations and rewrites them to the current image dimensions and bounds.

This couples the implementation to specific reference-image dimensions and makes preview generation dependent on source-code text matching. Replacing the reference image with another resolution requires editing absolute coordinates and keeping multiple copies synchronized. A changed declaration can also make the builder fail before the preview is assembled.

## 2. Required State

Logical geometry must be independent of reference-image resolution.

- Store positions and bounds as normalized coordinates in the range `0..1`, relative to the full reference-image canvas.
- Represent rectangles using normalized edges or normalized origin and size. Represent polygonal regions using normalized vertices.
- Keep logical objects such as the glass pane, house/hint hit area, drawing bounds, and other image-registered interaction regions in this normalized coordinate space.
- Keep the reference image dimensions as image metadata, not as part of the logical geometry definition.
- Derive pixel coordinates at runtime from the actual loaded image dimensions. For a normalized point `(u, v)` and image dimensions `(W, H)`, calculate `x = u * W` and `y = v * H`. Apply the same conversion consistently to rectangle edges, polygon vertices, hit-testing, clipping, and drawing registration.
- Use one canonical geometry configuration as the source of truth. The drawing module, glass generator, and preview builder must consume that configuration rather than maintaining independent absolute-coordinate copies.
- Preserve the existing visual placement and interaction behavior when migrating the current 1672 x 941 reference. Normalization is a representation change, not permission to move the pane, alter the hint area, recolor the brush, or change music gestures.

## 3. Required Implementation

1. Define the canonical normalized geometry in the existing geometry configuration, `test/glass_layers.json`, or move it to a dedicated shared geometry file if that makes ownership clearer. Do not duplicate the same pane or interaction bounds in JavaScript and Python.
2. Convert the current absolute pane and house/hint bounds to normalized coordinates using the current 1672 x 941 reference as the migration baseline.
3. Update the drawing module to read the canonical geometry and resolve it against the dimensions of the loaded reference image. Do not declare source width, source height, pane edges, or hit areas as hardcoded pixel constants in the drawing module.
4. Update the glass-generation scripts to use the same normalized pane geometry and resolve it against the actual donor dimensions after validating that the base and donor are registered to the same composition.
5. Simplify `scripts/build_layered_preview.py`. It must copy or assemble the current drawing module and assets without searching for legacy coordinate declarations or replacing source-code strings. Geometry changes belong in the canonical configuration, not in builder text substitutions.
6. Validate image dimensions and coordinate conversion before generating assets or starting the preview. Reject missing dimensions, zero-sized images, invalid normalized values, and incompatible base/donor registration with clear errors.
7. Keep image-space geometry separate from viewport-space layout. Responsive CSS sizing must not rewrite the canonical normalized geometry; pointer and touch coordinates must first be mapped into the image's normalized coordinate space before hit-testing or drawing.
8. Document any geometry that is intentionally measured in physical display pixels, such as brush width, separately from image-relative positions. Such values must not be confused with source-image coordinates.

## 4. Acceptance Criteria

- [ ] No logical image-space object bounds are hardcoded as absolute source-image pixel coordinates in the drawing module.
- [ ] Pane, house/hint, drawing, and hit-test geometry have one canonical normalized definition.
- [ ] The glass generator, drawing module, and preview builder all consume the same geometry source.
- [ ] The current 1672 x 941 reference produces the same pane boundary and interaction regions as the approved existing composition, within the existing visual tolerances.
- [ ] The same normalized geometry resolves correctly for a reference image with different pixel dimensions but the same composition and aspect ratio, without editing JavaScript or Python source.
- [ ] Pointer, touch, drawing, clipping, and hint hit-testing remain aligned after responsive scaling.
- [ ] The preview builder no longer performs string replacement of absolute coordinate declarations and can rebuild the preview without depending on legacy pixel values.
- [ ] Changing the reference image dimensions does not require changing logical geometry. If the composition or aspect ratio changes, the normalized geometry is explicitly reviewed rather than silently assumed to match.
- [ ] Existing music behavior, brush appearance, and drawing behavior remain unchanged.

## 5. Scope and Constraints

This change removes resolution-specific pixel coordinates from logical image geometry. It does not require changing the parallax algorithm, depth authoring levels, glass compositing, music behavior, brush styling, or the approved composition.

Normalized coordinates make geometry resolution-independent; they do not automatically make a different composition semantically equivalent. A replacement reference with a different crop, object placement, or aspect ratio still requires review and, where necessary, adjustment of the normalized logical geometry.

SPEC-006 acceptance remains pending until these criteria and the existing visual and interaction criteria have been verified.
