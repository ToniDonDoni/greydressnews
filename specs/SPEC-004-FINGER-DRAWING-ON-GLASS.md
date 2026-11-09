# SPEC-004: Finger Drawing on the Rain-Streaked Glass

**Status:** implemented on 2026-11-09, pending review. The drawing feature and its browser regression pass; one pre-existing depth-asset mismatch is documented in Section 8.

**Revision:** 2026-11-09 - drawing and parallax are deliberately coupled. The camera never freezes for a stroke; the same finger movement paints the glass and drives the view. Implementation followed this revision.

## 1. Problem and Current State

- The page is a single 1920 x 1077 reference photograph with a WebGL depth-parallax view.
- On desktop, pointer movement pans the view horizontally. On touch, a one-finger drag pans the view.
- The right side of the photograph is a rain-streaked glass pane in the near depth plane. It begins at approximately `x = 1240` and continues to the right edge; the news ticker begins at approximately `y = 970`.
- There is currently no way to leave a mark on the glass. A touch that starts on the glass is consumed by the parallax pan.
- The source image, its hand-authored depth map, the three-plane composition, and the first-click music behavior are already working and must not regress.

## 2. Required State

### 2.1 Drawing surface

- The drawable area is the glass pane only, expressed in source-image pixels as:

  | Edge | Value |
  | --- | --- |
  | Left | 1240 |
  | Top | 0 |
  | Right | 1920 |
  | Bottom | 970 (above the news ticker) |

- A stroke may start only when the initial pointer contact is inside this rectangle. The stroke is clipped to the rectangle, so it cannot paint on the presenter, the frame, the ticker, or the left side of the image.
- Drawing must work with one finger on a phone and with a pressed mouse drag on desktop.
- A single tap leaves a small dot. A drag leaves a continuous line, including a fast drag (no visible gaps between pointer samples).
- **The same one-finger drag must also move the parallax.** Drawing and camera motion are intentionally coupled: dragging across the glass paints a mark while the view glides in the same direction. The mark is laid onto the glass as it moves, so strokes drawn during motion may curve or smear with the glass. This is the effect, not a side effect.
- Strokes persist for the lifetime of the page. Reloading clears them. There is no clear/undo/color UI in this version.

### 2.2 Gesture behavior

- A gesture that starts **inside the glass** draws **and** pans. Every pointer movement updates both the stroke and the horizontal camera target, using the existing parallax easing. The camera follows horizontal finger movement, as it does today for any drag; a purely vertical stroke changes the ink path but not the horizontal camera.
- A gesture that starts **outside the glass** keeps the current behavior: one-finger drag pans on touch, mouse movement pans on hover, and no ink is produced.
- Mouse hover over the glass must still pan the view. Pressing the mouse button on the glass starts drawing, and dragging continues to pan while drawing.
- The camera must never be frozen or paused because a stroke is active.
- Only the primary pointer draws and pans. Additional fingers are ignored in this version.
- When a stroke ends, parallax continues to ease toward its current target as usual. On touch, the existing release behavior returns the camera to center; on mouse, the last pointer position remains the target until the pointer leaves. The next gesture outside the glass pans without drawing.
- The drawing gesture must not block the existing first-click music start. The music module listens on `pointerdown` in the capture phase and must continue to do so.

### 2.3 Visual treatment

- The mark should read as a finger drawn through condensation on wet glass: a translucent, cool gray line with a soft edge, not an opaque marker.
- Target appearance:
  - core color approximately `rgb(205, 216, 222)`, alpha approximately `0.21`;
  - a wider, softer halo at alpha approximately `0.07`;
  - no pure-white core and no hard black outline;
  - visible against both the pale gray reflections and the dark red areas of the glass.
- Nominal stroke width: 4.2-8 CSS pixels depending on the painting width, converted back into source-image pixels. A phone and a desktop therefore receive the same physical finger-mark thickness.
- Use rounded caps and joins. Do not use a costly per-point blur filter; build the soft edge from two layered strokes.
- The ink is rendered in image space, not screen space, so it scales with the artwork and stays attached to the glass.

### 2.4 Parallax registration

- The existing shader samples the photograph with a 5% zoom (`uv * 0.95 + 0.025`) and displaces near-plane pixels with the camera.
- The ink layer must use the same image-space transform as the near glass plane, not a fixed screen overlay. At maximum camera displacement the drawn mark must stay visually attached to the glass, not slide across the droplets.
- Implementation target: the ink layer applies:
  - scale `1 / 0.95 = 1.0526`;
  - offset `-0.025 / 0.95 = -2.632%` on both axes;
  - a horizontal near-plane shift derived from the shader's camera value, approximately `2.58%` of the layer width per camera unit (`0.045 * (236/255 - 0.38) * (1 - 0.4^7) / 0.95`).
- Pointer coordinates must be converted back through the transform that is currently on screen before being written into the ink canvas. Because the camera is moving during the gesture, the projection uses the same rendered camera value that the shader and the ink layer used for that frame, not a stale or target value.
- Existing ink moves with the glass. New ink is stamped at the glass point currently under the finger. A stroke made while the camera moves therefore records the combined finger path and glass motion; if the finger stops, the already drawn ink may continue to glide while the camera settles, but no new ink is added.
- The ink layer transform and the parallax camera must update in the same animation frame so the mark does not lag behind the photograph. The implementation sets a `--ink-shift-x` custom property from the same parallax draw call that updates the shader camera.
- With reduced motion enabled, the camera is zero and the ink layer still aligns through the same static zoom/offset.

### 2.5 Preservation

- Do not change the source photograph, depth PNG, depth metadata, or the three-plane depth values.
- Do not change the music synthesizer, tempo, gain, first-gesture behavior, or footer layout.
- The existing parallax must remain smooth and must continue to work at every viewport size.
- The page should remain a static, dependency-free site: no framework, no new runtime package, no server requirement beyond a static file server.

## 3. Acceptance Criteria

- [x] **AC-01 - Drawable region.** A pointer press inside the glass rectangle produces ink; the same press outside it produces no ink. A stroke dragged across the glass boundary is clipped at the boundary.
- [x] **AC-02 - Continuous stroke.** One-finger and mouse drags produce a continuous line. Fast movement consumes coalesced pointer samples and leaves no visible gaps. A tap leaves a dot.
- [x] **AC-03 - Appearance.** A sampled stroke pixel is translucent gray, not opaque white or black. The core alpha is in the range 0.08-0.30 and the RGB channels are close to neutral/cool gray. No hard edge is visible at normal display size.
- [x] **AC-04 - Coupled gesture.** A touch drag starting outside the glass pans the view and produces no ink; a touch drag starting on the glass produces ink **and changes the camera while the stroke is active**. Mouse hover still pans; mouse press-drag on the glass draws and pans.
- [x] **AC-05 - Parallax registration.** During and after a stroke, the ink layer's transform follows the near-plane camera shift. At maximum horizontal camera displacement the stroke remains attached to the glass within 2 CSS pixels at a 1200 px display width, and a stroke made while the camera moves shows the resulting curved/smeared path rather than a screen-space overlay.
- [x] **AC-06 - Coupled drawing continuity.** Drawing across the glass while the view is moving still produces a continuous stroke with no gaps or detached segments; the camera is never frozen by the stroke.
- [x] **AC-07 - Responsive mapping.** At 390 x 844 (mobile portrait), 1200 x 820 (desktop), and a 3x device pixel ratio, a finger/mouse point maps to the same visual point on the glass within 1 CSS pixel. No page scrolling or pinch zoom occurs while drawing.
- [x] **AC-08 - Lifecycle.** `pointerup`, `pointercancel`, and `lostpointercapture` end the stroke cleanly. Resizing or rotating the viewport keeps existing marks aligned; reloading clears them.
- [ ] **AC-09 - No regression.** The source image hash, depth asset hash, music first-click playback, existing parallax displacement, and current static checks remain unchanged and passing. Blocked by the pre-existing depth mismatch in Section 8; this change itself does not touch those assets.
- [ ] **AC-10 - Performance.** Drawing does not drop the page below 50 fps on a mid-range mobile emulation, and no single pointer event causes a main-thread task longer than 50 ms. Not formally benchmarked in this checkout; the live stroke alone is redrawn and the committed canvas is never copied per move.

## 4. Analysis

### 4.1 Why the overlay must live in image space

The parallax fragment shader does not draw the image at a plain `0..1` UV. It samples `base = uv * 0.95 + 0.025` and then warps toward `base - cameraShift * (depth - 0.38)`. A normal full-screen overlay canvas would therefore be misaligned by several percent at the edges even before the camera moves: the image is effectively zoomed 5%, and the glass is displaced by the near-plane camera shift.

The glass is a constant-depth near plane (`236 / 255` in the committed inverse-depth map). That makes a single affine transform sufficient: the ink layer is drawn in source-image coordinates, then transformed with the same zoom, offset, and near-plane shift as the shader. No per-pixel ink warping or shader changes are required.

### 4.2 Two ink canvases, one gesture stream

The existing WebGL canvas stays untouched. Two transparent 2D canvases hold the ink: a committed canvas with finished strokes and a live canvas with only the current stroke. Both sit in one `.ink-layer` over the painting, are `pointer-events: none`, and are transformed together by CSS. Pointer handling remains on the existing `#painting` element. Committing the live canvas on release keeps a single smooth path per stroke instead of compositing dozens of overlapping segments.

The ink controller and `parallax.js` share one pointer stream:

1. On `pointerdown`, the ink controller checks the glass rectangle.
2. If the point is inside, it starts a stroke and captures the pointer. Parallax still receives the same gesture and keeps updating its camera target exactly as it does today.
3. If the point is outside, parallax handles the gesture as it does today and the ink controller stays inactive.
4. While a stroke is active, every pointer move both adds ink and updates the camera target. The camera is never suppressed.
5. On release or cancellation, the stroke ends; parallax keeps easing toward the last target.

The two effects must be driven from the same pointer samples and the same animation-frame clock. The ink controller reads the rendered camera value, not the target, when projecting a pointer position onto the image. This keeps the new mark exactly under the finger at the moment it is stamped, while previously drawn ink continues to move with the glass.

### 4.3 Finger vs. mouse

Touch has no hover, so a touch that lands on the glass immediately starts the combined draw-and-pan gesture. A mouse has hover, which is the existing parallax affordance; therefore mouse movement without a pressed button keeps panning, and a pressed drag on the glass draws while the camera follows the same pointer motion. This preserves the desktop hover behavior and makes the phone interaction direct.

### 4.4 Out of scope

- Color picker, brush-size UI, undo, redo, clear button, or saved drawings.
- Drawing on the presenter, ticker, frame, or left side of the image.
- Two-finger panning while drawing.
- New depth inference, image edits, or a different glass texture.
- Persistence across reloads or sharing drawings.

## 5. Implemented Solution

1. Added `dist/glass-ink.js`, loaded before `parallax.js`, with hit-testing, stroke begin/move/end, a `clear()` test hook, and an `active` flag.
2. Added committed and live `<canvas id="glass-ink">` / `<canvas id="glass-ink-live">` elements inside a full-size `.ink-layer` over the painting. The existing WebGL canvas remains below them.
3. Defined the glass rectangle as shared constants in source-image pixels and used it for both hit-testing and canvas clipping.
4. Rendered the current stroke as one path in image coordinates, with a wide translucent halo and a narrow gray core. Only the live canvas is redrawn while the pointer moves; it is composited into the committed canvas on release. Coalesced pointer events and a minimum sample spacing handle fast drags.
5. Published the rendered camera value from `parallax.js` through `window.parallaxView` and a `--ink-shift-x` CSS custom property. The `.ink-layer` is transformed with the shader's 5% zoom, its 2.632% offset, and the near-plane shift.
6. On every pointer move, converted the screen position back through the currently rendered transform and stamped ink at that image point. The parallax update is not frozen or suppressed: the same pointer move also advances the camera target.
7. Kept the camera update and ink-layer transform in the same animation frame. Previously stamped ink moves with the glass; new ink lands at the glass point currently under the finger.
8. Updated the footer hint to `move to explore / draw on the glass`, without adding controls.
9. Added `scripts/check_glass_drawing.mjs` as a Playwright regression covering hit-testing, clipping, stroke continuity, coupled draw-and-pan behavior, color/alpha, mobile mapping, and near-plane transform. The existing parallax and music tests remain intact.
10. Ran the static, build, music, and new glass-drawing checks, captured desktop/mobile screenshots, and recorded evidence below. The pre-existing depth baseline is documented in Section 8.

## 6. ToDo

- [x] Confirm the interaction model and visual treatment in this spec.
- [x] Add the ink canvases, layer transform, and glass constants.
- [x] Implement the translucent layered brush and pointer handling.
- [x] Couple drawing to the live parallax camera and publish the rendered camera value.
- [x] Update the footer hint.
- [x] Add the browser regression test.
- [x] Run static, build, music, and new glass-drawing checks.
- [x] Capture desktop and mobile evidence.
- [x] Record verification evidence in Section 7.
- [ ] Re-run the existing depth/audio browser baseline after the pre-existing depth asset/metadata mismatch in Section 8 is repaired.

## 7. Verification Evidence

Verified on 2026-11-09 at 1200 x 820 desktop and 390 x 844 mobile at 3x device pixel ratio:

- `node scripts/check_glass_drawing.mjs` passes. It confirms:
  - a stroke can start only inside the glass rectangle and is clipped before `x = 1240` and below `y = 970`;
  - a mouse drag on the glass produces a continuous stroke while the camera moves from about `0.44` to `0.80`;
  - the ink layer translated by about `10.7 px` for that camera change, matching the expected near-plane shift within the 2 px tolerance;
  - the strongest stroke pixel is `rgb(206, 218, 225)` with alpha `68 / 255`, a translucent cool gray;
  - a tap leaves a dot, an outside-glass drag leaves no ink while still panning, and a mobile touch drag leaves about `20,000` ink pixels while the camera moves to about `0.77`;
  - the page emits no errors.
- Screenshots: [desktop-drawn.png](evidence/glass-drawing/desktop-drawn.png), [mobile-drawn.png](evidence/glass-drawing/mobile-drawn.png).
- Raw report: [report.json](evidence/glass-drawing/report.json).
- `node scripts/check.mjs`, `node scripts/check-ui.mjs`, `python3 scripts/build.py --check`, and `node --check` for `glass-ink.js` / `parallax.js` pass.
- The source photograph, depth PNG, and depth metadata were not modified by this change.

## 8. Known Pre-Existing Issue

Commit `1c93a46` ("Update depth map") replaced `dist/assets/ElGrayPimenovLeiterWindow2-depth.png` with a `14817`-byte image whose SHA-256 is `d16dbbae45110636adbb6b10e62e8cc8e29bc2596aa20f1d8518a561101181ce`, but the metadata and `specs/evidence/depth-report.json` still record `d760e4299ce696e246027869c61a61540d5a71bd7f8bd9faee08473fecdd2e64`. The sample at `(160, 250)` decodes to `95` instead of the recorded `96`.

Consequences on this checkout, before any drawing code runs:

- `python3 scripts/manual_depth_planes.py --check` fails with `far mask contains pixels outside its fixed depth level`.
- `scripts/check_reference_parallax.mjs` fails at its browser depth-sample assertion (`95 !== 96`).

This is unrelated to the glass drawing and is deliberately not "fixed" by overwriting the user's latest depth map. The new drawing regression, static checks, build check, and music check all pass. The depth metadata/evidence should be reconciled separately.
