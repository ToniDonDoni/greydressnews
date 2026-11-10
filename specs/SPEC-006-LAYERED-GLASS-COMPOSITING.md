# SPEC-006: Layered Glass Compositing

Status: acceptance pending. Implementation findings are recorded in [SPEC-006-LAYERED-GLASS-COMPOSITING-REVIEW.md](SPEC-006-LAYERED-GLASS-COMPOSITING-REVIEW.md).

Project workflow: [scripts/README.md](../scripts/README.md).

## 1. Problem and Current State

- `dist/parallax.js` samples one flattened color image and one static grayscale depth texture. Its seven-step lookup changes horizontal sampling coordinates before returning an opaque color. One pixel has one depth, even when it depicts both glass and a visible object behind glass.
- Assigning the right pane to near depth moves its baked-in droplets, reflected building, laptop, and ticker together. Changing depth values cannot recover the concealed studio or independently move two contributions at the same pixel.
- `references/no_logo.png` supplies the base scene: presenter, studio, left building, laptop, ticker, and the diffuse painted right background. That painted background remains as supplied; it is not treated as an extracted house reflection.
- `references/no_logo_laiter_spec_gpt.png` is the flattened appearance reference with rain glass, reflected architecture, laptop, and ticker on the right.
- `references/no_logo_leiter_glass.png` is the new glass donor. The right laptop and ticker have been removed and replaced with continued rain glass and reflection. The left scene is still present in this file and must not enter the overlay. The donor is RGB, not an existing transparent asset.
- The house visible in the right glass is a reflection from the viewer's side. It is not a physical building behind the studio glass. Its illuminated windows belong to that reflection, not to separate holes in the glass depth mask.
- The current drawing layer has translucent gray strokes. The optional pale-yellow music hint is a separate feature. Their styling and music behavior are unrelated to extracting glass.

## 2. Required State

| Contribution | Source and ownership | Motion |
| --- | --- | --- |
| Base scene | `references/no_logo.png`, including laptop and complete ticker | Static scene depth map controls horizontal parallax |
| Near glass | Right pane of `references/no_logo_leiter_glass.png`: droplets, streaks, tint, reflected house and its lights | One independently sampled near plane for the first implementation |
| Drawing and hint | Existing drawing/hint layers | Registered to the same near-plane transform and pane mask |

- The laptop and right ticker are visible through the glass and move relative to its droplets. They have separate base-scene regions at the currently agreed level 21; neither receives glass depth simply because it is under the pane.
- The complete ticker remains in the base, including the part under the glass. This work does not add an independently scrolling text animation.
- The pane spans the full image height on the right, including the area covering the ticker and laptop. Its left edge follows the donor's actual pane boundary, approximately x = 1095 in the 1672 x 941 source; this estimate requires an overlay review before use as geometry.
- Reflected architecture and droplets share the near overlay in the first version. This is an intentional 2D approximation, not a claim that real reflections have the same apparent depth as the glass surface.
- The neutral view preserves the supplied composition and the character of the glass. Transparency and visibility of the base take priority over exact pixel matching to the opaque donor.
- A page control below the artwork adjusts the whole glass pane opacity from 0 to 1 in real time. Its default value is 0.68. The prepared overlay uses one pane alpha: 1 across the approved right pane and 0 outside it.
- This specification supersedes the interpretation of right-side house lights as far physical objects in SPEC-001 for this new composition only. It does not rewrite the historical implementation or its evidence.
- Layered sampling requires coordinated renderer and page changes; replacing only the photograph and one depth PNG cannot provide this effect. Those changes are part of this implementation.

## 3. Acceptance Criteria

- [ ] **AC-02 - Usable transparency.** The exported glass is a full-frame RGBA PNG made from the right pane of the glass donor. Alpha is exactly 1 inside the approved pane and 0 outside it; the page opacity control scales this alpha from 0 to 1, defaulting to 0.68. The base scene remains a separate moving layer beneath the pane.
- [ ] **AC-03 - Clean overlay.** Checkerboard, black, white, and base-background inspections show no second presenter, laptop outline, laptop logo, ticker letters, or rectangular remnants in the glass texture. Reflected architecture, including its dark parts, is preserved deliberately.
- [ ] **AC-04 - Independent motion.** Captures at settled camera positions -1, 0, and +1 show a laptop landmark and a right ticker landmark moving relative to a nearby droplet. At a reference viewport rendering the artwork at 1672 pixels wide, each relative displacement between the two extremes exceeds 3 pixels and matches the configured transforms within 1 pixel. No bright window in the reflection moves independently of the glass in this version.
- [ ] **AC-05 - Scene depth.** The base has an aligned static depth asset with explicit presenter, studio, left building/background, laptop, and ticker regions. Laptop and ticker are both level 21 in the base and remain behind the separate glass plane at level 1. Numeric levels and contours are reviewed in an overlay before baking.
- [ ] **AC-06 - Boundaries.** Both camera extremes and intermediate views show no exposed image edge, stretched border stripe, doubled pane frame, gap at the pane seam, or transparent halo. The ticker remains behind the glass down to the image bottom. Off-pane artwork is unchanged apart from its intended parallax.
- [ ] **AC-07 - Drawing and music.** Original gray strokes and the optional yellow hint retain their appearance and remain aligned to the glass within 1 rendered pixel. First-gesture groove playback, handwritten-letter selection of the waltz, touch behavior, and reduced-motion behavior pass regression checks.
- [ ] **AC-08 - Reproducibility.** Reviewed pane geometry, settings, source hashes, tool versions, and deterministic generation steps reproduce the alpha/depth assets. Reports record exact pane alpha coverage, settings, clipping, dimensions, and output hashes.
- [ ] **AC-09 - Full-page review.** The complete page, including music and drawing, passes desktop and mobile interaction checks. Missing-texture and WebGL failure paths retain a usable poster.

Acceptance criteria are checked only after the corresponding runtime behavior and review evidence pass.

## 4. Analysis

### 4.1 Why the existing depth map is insufficient

The current renderer performs a single color lookup at a depth-displaced coordinate. Two surfaces that overlap in screen space cannot receive independent motion through that one lookup. The solution requires separate color contributions and separate sampling coordinates. A deeper or more detailed single depth map cannot supply pixels hidden by the baked reflection.

The base photo supplies those background pixels. A depth map for this base is separate from the pane's near-plane position. A normal map describes local orientation, not transparent layering, and is unnecessary for the first alpha-compositing experiment.

### 4.2 What can and cannot be recovered from these files

For ordinary alpha compositing in linear light:

```text
C = alpha * F + (1 - alpha) * B
```

Here B is the base scene, F is the chosen overlay color, and C is the final composite. A flattened RGB image does not uniquely determine both F and alpha. This is the standard matting ambiguity described in [Compositing, segmentation and matting](https://people.csail.mit.edu/fredo/comp-photo-book/08-single-image-computational-photography-08-compositing-segmentation-and-matting.html).

The donor is also not an exact optical capture of the base through known glass: removal/inpainting changed content, and the base has a different painted right background. Image subtraction therefore does not isolate physical glass. Solving F from a chosen alpha and the actual base could bake compensating laptop/ticker colors into F, producing ghosts when the layers move. That approach is excluded from the recommended pipeline.

The first result is an artist-directed translucent overlay with one uniform alpha across the approved right pane. It retains the donor's supplied RGB and lets the separate base show through according to the overall opacity slider. This simple blend is not a physically recovered transmission map and may not reproduce the opaque donor's contrast exactly. Any later change to spatially varying alpha is an appearance decision that requires discussion.

Actual refractive glass needs more than conventional alpha. [Environment Matting and Compositing](https://grail.cs.washington.edu/projects/digital-matting/envmatte/) models reflection and refraction as additional environment interactions. Such reconstruction is outside the first implementation; no claim of measured optical accuracy is made here.

## 5. Proposed Solution

### 5.1 Canonical inputs

All inputs are 1672 x 941 pixels. The base file is RGBA but its alpha extrema are 255 and 255, so it is fully opaque. Both glass images are RGB.

| File | Role | SHA-256 |
| --- | --- | --- |
| `references/no_logo.png` | Unmodified base scene | `0e3fe9c852a2638a0126303652688fbbea5aaf6dbc220cf9c5292b4bc8c07ace` |
| `references/no_logo_laiter_spec_gpt.png` | Flattened appearance comparison; not a runtime overlay | `6f08fe12eeeba2c20805c52d4a3fd2f331b6d7f352bd37fa2c47b902b41f4980` |
| `references/no_logo_leiter_glass.png` | Cleaned glass donor | `5eb180b7225b800a6e68bc23c3f2ffca688336360af8075fb18404e04973b120` |

The existing `references/ElGrayPimenovLeiterWindow2.png` remains intact.

### 5.2 Pane registration

- The reference coordinate system is the full 1672 x 941 frame. Equal image dimensions are not sufficient evidence of alignment: presenter edges, pane seam, and ticker baseline are compared before generating masks.
- Only donor-derived data is aligned if needed. The base remains unmodified. Any alignment matrix and interpolation setting are recorded.
- Use one manually reviewed full-frame pane boundary to include the donor's complete right pane and exclude its left presenter/studio. The pane spans the full image height and includes the bottom strip over the ticker.
- Do not split the pane into reflection, windows, streak, droplets, tint, or frame masks. Those features remain part of the donor RGB and move together as one overlay at depth 1.
- Keep the alpha edge inside the reviewed pane boundary; alpha must be exactly zero outside the pane. Do not blur alpha outward across the seam. Inspect the donor seam and retained frame in the composite for doubled edges.
- Store pane geometry and the overall UI opacity in `test/glass_layers.json`. Base semantic-depth coordinates remain in `test/depth_regions.json` and do not contain a glass-depth region.

### 5.3 Alpha construction

Prepare a single overlay directly from `references/no_logo_leiter_glass.png`:

1. Create a full-frame RGBA image at the donor's native 1672 x 941 dimensions. Preserve donor RGB at its original pixel coordinates inside the approved right pane; do not shift, crop, recolor, or derive RGB from the flattened comparison.
2. Set alpha to 1 throughout the approved right pane and 0 everywhere outside it. Use only the reviewed pane boundary. Do not create separate masks for the reflected house/windows, red streak, tint, droplets, highlights, rims, or frame.
3. At runtime multiply this pane alpha by the overall opacity slider. The slider range is 0-1 and its default is 0.68. It changes only glass visibility, never the pane depth or base depth map.
4. Generate the runtime filtering texture from the editable RGBA source by converting RGB to linear light and premultiplying it by alpha. Set premultiplied RGB to zero where alpha is zero. Filter premultiplied color and alpha consistently; do not apply a second premultiplication at upload.
5. Composite the sampled glass over the independently warped base in linear light, then encode the result to sRGB once. Keep the near-plane transform at authoring depth 1, independent of the slider value.
6. Emit the straight-alpha source, runtime texture, alpha diagnostic, neutral composite, and a report with source/settings/output hashes and exact inside/outside alpha coverage.

This is a deliberately simple artist-directed layer, not a physically recovered transmission map. The pane's donor RGB, with the reflected house, droplets, streaks, and tint, moves together. If visual review later calls for spatially varying alpha, that is a separate appearance decision and must be discussed before adding masks or changing the alpha recipe.

### 5.4 Static scene depth

- Base depth is baked offline and remains a static file at runtime. It describes the studio/base only; it contains no near-glass rectangle and no independent far-depth holes for reflected windows.
- The laptop silhouette and ticker have explicit regions, separate from the studio wall and presenter. They use the reviewed level 21 in this scene, both behind the separate glass plane at level 1. Existing 1-100 authoring semantics and the grayscale conversion are retained.
- The supplied base's right background is preserved. Depth boundaries follow visible objects, with narrow edge treatment rather than a blur across the whole pane.
- The base is still a single-image depth warp. Newly exposed pixels at scene-object boundaries are not magically recovered. Small motion, overscan, and visual checks bound this limitation; a full multilayer studio reconstruction is outside scope.

### 5.5 Renderer integration

The renderer reuses horizontal camera input, smoothing, and base depth sampling. It computes base coordinates from scene depth and glass coordinates from one near-plane transform, then combines the samples:

```text
B = sample_base_at_scene_depth(base_uv, camera)
(P, a) = sample_premultiplied_glass(glass_uv, camera)
C_linear = P + (1 - a) * B_linear
```

- The near-plane displacement initially matches the existing glass convention, including its seven-iteration convergence factor. Drawing and hint placement consume the same transform; a second independently approximated CSS transform is not introduced.
- Color and opacity are filtered in a consistent premultiplied representation. The editable RGBA PNG uses straight alpha and sRGB RGB; the proposed runtime derivative stores linear premultiplied RGB plus linear alpha as explicitly documented data. Runtime upload disables implicit color conversion and additional premultiplication for that derivative. The base is converted to linear light for the mix, and the result is encoded to sRGB once. A numerical reference composite verifies the convention and catches double multiplication or gamma errors.
- The runtime derivative is a separate generated asset, not an ambiguous reinterpretation of the editable PNG. Transparent texels have zero premultiplied RGB, preventing dark fringes from filtering unrelated colors. Eight-bit quantization is checked visually; higher precision is considered only if banding is demonstrated.
- Full-frame texture coordinates avoid an independently fitted crop. Outside the pane texture alpha is zero. Shared overscan is calculated from the maximum base and glass displacement; clamping must not create a visible stretched glass strip.
- Canvas fitting, pane hit-testing, and the optional left-house hint trigger are registered to the new source dimensions. Existing 1920 x 1077 drawing constants cannot be assumed to align with this composition merely by changing the photo. Geometry changes required for registration do not authorize brush-color, opacity, music, or gesture changes.
- The loading/failure poster is an offline neutral composite of the selected base and overlay. The existing flattened photo is an appearance reference, not a second live color layer.

### 5.6 Validation and scope

The feature requires base color, scene depth, editable glass RGBA, a premultiplied glass runtime texture, and a fallback poster.

Validation includes:

- Mask overlay, alpha-only view, checkerboard composite, and neutral full-scene composite.
- Side-by-side camera extremes and a short pointer-motion recording of the complete page, with identified laptop, ticker, reflection, and droplet landmarks.
- Source/alpha checks, gamma and premultiplication fixture, scene-depth ordering, and landmark displacement measurements.
- Desktop and mobile checks of original stroke appearance, groove start, waltz selection, clipping, missing overlay, WebGL failure, and reduced motion.

Normal-map generation, refractive distortion, physically moving reflected scenery, live relighting, recoloring the pencil, music changes, and unrelated refactoring are outside this feature.

## 6. ToDo

- [x] Inspect the base, flattened reference, cleaned glass donor, and current single-image renderer.
- [x] Record source identities, layer semantics, constraints, and the proposed alpha pipeline.
- [ ] Prepare and review the full-height right-pane boundary.
- [ ] Generate the single-pane alpha overlay and inspect it on diagnostic backgrounds and the moving base.
- [ ] Approve the glass appearance and useful transmission before page integration.
- [ ] Author and review base-only semantic depth, including laptop and ticker.
- [x] Implement reproducible glass-alpha generation and separate layered sampling.
- [x] Register drawing/hint geometry for the new canvas dimensions.
- [x] Add an overall glass-opacity slider with default 0.68.
- [ ] Review the complete local page at camera extremes and on mobile.
- [ ] Collect acceptance evidence and complete regression checks.

Acceptance remains pending until the required visual and interaction checks pass.
