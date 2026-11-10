# SPEC-006: Layered Glass Compositing

Status: implementation in progress on `feat/layered-glass`. The local page now uses separate base, depth, and RGBA glass assets; manual mask review and full acceptance checks remain in progress.

## 1. Problem and Current State

- `dist/parallax.js` samples one flattened color image and one static grayscale depth texture. Its seven-step lookup changes horizontal sampling coordinates before returning an opaque color. One pixel has one depth, even when it depicts both glass and a visible object behind glass.
- Assigning the right pane to near depth moves its baked-in droplets, reflected building, laptop, and ticker together. Changing depth values cannot recover the concealed studio or independently move two contributions at the same pixel.
- The committed site and the disposable preview are distinct. At specification preparation, the new-photo experiment is in ignored `output/site_preview_new_photo/`; its candidate depth is in ignored `output/depth_review/`. These are not canonical source assets and are not committed by this specification.
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

- The laptop and right ticker are visible through the glass and move relative to its droplets. They retain distinct authored scene depths where appropriate; neither receives glass depth simply because it is under the pane.
- The complete ticker remains in the base, including the part under the glass. This work does not add an independently scrolling text animation.
- The pane spans the full image height on the right, including the area covering the ticker and laptop. Its left edge follows the donor's actual pane boundary, approximately x = 1095 in the 1672 x 941 source; this estimate requires an overlay review before use as geometry.
- Reflected architecture and droplets share the near overlay in the first version. This is an intentional 2D approximation, not a claim that real reflections have the same apparent depth as the glass surface.
- The neutral view preserves the supplied composition and the character of the glass. Transparency and visibility of the base take priority over exact pixel matching to the opaque donor.
- A page control below the artwork adjusts the overall glass opacity from 0 to 1 in real time. Its default value is 0.68; generated alpha remains independently spatially varying.
- This specification supersedes the interpretation of right-side house lights as far physical objects in SPEC-001 for this new composition only. It does not rewrite the historical implementation or its evidence.
- Layered sampling requires coordinated renderer and page changes; replacing only the photograph and one depth PNG cannot provide this effect. Those changes are part of this implementation.

## 3. Acceptance Criteria

- [ ] **AC-02 - Usable transparency.** The exported glass is a full-frame RGBA PNG. Alpha is exactly zero outside the approved pane mask. Clear areas inside the pane transmit the base; the entire pane is not an opaque rectangle or a uniform translucent screenshot.
- [ ] **AC-03 - Clean overlay.** Checkerboard, black, white, and base-background inspections show no second presenter, laptop outline, laptop logo, ticker letters, or rectangular remnants in the glass texture. Reflected architecture, including its dark parts, is preserved deliberately.
- [ ] **AC-04 - Independent motion.** Captures at settled camera positions -1, 0, and +1 show a laptop landmark and a right ticker landmark moving relative to a nearby droplet. At a reference viewport rendering the artwork at 1672 pixels wide, each relative displacement between the two extremes exceeds 3 pixels and matches the configured transforms within 1 pixel. No bright window in the reflection moves independently of the glass in this version.
- [ ] **AC-05 - Scene depth.** The base has an aligned static depth asset with explicit presenter, studio, left building/background, laptop, and ticker regions. Laptop and ticker use different declared depths, both behind glass. Numeric levels and masks are reviewed in an overlay before baking.
- [ ] **AC-06 - Boundaries.** Both camera extremes and intermediate views show no exposed image edge, stretched border stripe, doubled pane frame, gap at the pane seam, or transparent halo. The ticker remains behind the glass down to the image bottom. Off-pane artwork is unchanged apart from its intended parallax.
- [ ] **AC-07 - Drawing and music.** Original gray strokes and the optional yellow hint retain their appearance and remain aligned to the glass within 1 rendered pixel. First-gesture groove playback, handwritten-letter selection of the waltz, touch behavior, and reduced-motion behavior pass regression checks.
- [ ] **AC-08 - Reproducibility.** Committed manual masks, settings, source hashes, tool versions, and deterministic generation steps reproduce the promoted alpha/depth assets. Reports record alpha coverage, settings, clipping, dimensions, and output hashes.
- [ ] **AC-09 - Full-page review.** The local review uses the complete site copied under `output/`, including music and drawing. Evidence covers desktop and mobile interaction, not only a static composite. Missing-texture and WebGL failure paths retain a usable poster.

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

The proposed result is an artist-directed translucent overlay. It retains selected donor colors and details with a spatially controlled alpha. It cannot guarantee identical donor contrast while also revealing the base everywhere. Simply lowering the opacity of the entire right rectangle would retain too much uniform blue/gray veil and flatten the effect.

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

### 5.2 Registration and editable masks

- The reference coordinate system is the full 1672 x 941 frame. Equal image dimensions are not sufficient evidence of alignment: presenter edges, pane seam, and ticker baseline are compared before generating masks.
- Only donor-derived data is aligned if needed. The base remains unmodified. Any alignment matrix and interpolation setting are recorded.
- A manually reviewed pane mask excludes the left scene and includes the complete right strip. A narrow inward feather, initially 1-3 source pixels, is restricted to a genuine soft seam; the visible frame is handled explicitly rather than blurred into the presenter.
- The reflective frame, if retained from the donor, exists only in the overlay and follows its transform. Inspection must reject an accidental second frame.
- Separate editable grayscale masks identify clear/tinted pane, reflected building and red streaks, droplet highlights, droplet dark rims, and frame. A cleanup mask excludes any remaining generated studio/ticker/laptop artifacts. The bottom of the donor is inspected specifically for horizontal remnants.
- Geometry/settings belong in proposed `test/glass_layers.json`; manual raster masks belong in proposed `test/glass_masks/`. These are future files. Base semantic depth coordinates remain in `test/depth_regions.json`, following its schema; existing light-hole masks do not carry into this new glass model.

### 5.3 Alpha construction

The first candidate uses donor RGB with a manually controlled, nonuniform alpha. This deliberately avoids a background-dependent inversion.

1. Decode the donor to a documented sRGB working space and linearize color for analysis. Preserve the untouched reference. Build a low-frequency estimate L with a recorded filter radius, initially 8 source pixels, and a signed luminance residual H = luminance(G) - luminance(L). G is the aligned donor.
2. Positive and negative residuals provide candidate detail masks through separately recorded thresholds and smooth ramps. They are only suggestions inside the hand-reviewed droplet masks: reflected windows and painterly noise must not be classified automatically as droplets. Keep dark droplet rims as well as bright edges.
3. Author opacity fields for tint, reflection, highlights, dark rims, and frame. Starting review ranges are 0.03-0.12 in clear tinted areas, 0.20-0.55 for reflected architecture/red streaks, and 0.35-0.80 for selected droplet edges. Frame opacity may reach 1. These are trial settings, not measured transmittance or acceptance targets.
4. Combine contributions without adding opacity unchecked. For normalized masks m and their opacity weights w, use the union below; keep an explicit cleanup exclusion mask E and pane mask M:

   ```text
   alpha = M * (1 - E) * (1 - product_i(1 - w_i * m_i))
   F = G
   P = alpha * F
   ```

   F initially retains the donor color, including reflected house colors. P is the linear premultiplied color used for compositing. Outside the pane both P and alpha are zero.
5. Review alpha and color independently. Reduce the clear-pane field where a blue/gray sheet obscures the laptop or ticker. Increase selected reflection/detail masks where the building or droplets disappear. Do not use brightness as alpha globally: it would erase dark reflection structure and droplet shadows. Do not increase all opacity to restore a lost highlight.
6. If source RGB still carries an unwanted flat veil, use a local color correction restricted to the corresponding manual mask, stored as reproducible curves/settings. Any unavoidable pixel retouch is saved as a separate source correction layer under `test/glass_masks/`, with its provenance. Do not change the original reference or repaint the base.
7. Generate low, medium, and high reflection-opacity candidates using recorded multipliers. Compare on checkerboard, black, white, mid-gray, and the actual moving base. Select by independent-motion readability and preserved glass character, not by an exact match to the opaque donor.
8. Export a straight-alpha RGBA PNG plus a linear premultiplied runtime texture described below. Export alpha as a separate grayscale diagnostic. Record alpha percentiles and zero/partial/opaque coverage inside the pane, output hashes, parameters, and source hashes.

This procedure does not infer missing physical transparency. If no opacity/correction combination preserves both readable studio motion and the intended glass, the alpha-only candidate fails visual acceptance. A separately scoped fallback may split reflection from droplet detail or introduce RGB transmission and refraction. It is not silently added to this first implementation.

### 5.4 Static scene depth

- Base depth is baked offline and remains a static file at runtime. It describes the studio/base only; it contains no near-glass rectangle and no independent far-depth holes for reflected windows.
- The laptop silhouette and ticker have explicit masks, separate from the studio wall and presenter. They use different reviewed inverse-depth levels below the glass value. Existing 1-100 authoring semantics and the grayscale conversion are retained unless a later spec explicitly changes them.
- The supplied base's right background is preserved. Depth boundaries follow visible objects, with narrow edge treatment rather than a blur across the whole pane.
- The base is still a single-image depth warp. Newly exposed pixels at scene-object boundaries are not magically recovered. Small motion, overscan, and visual checks bound this limitation; a full multilayer studio reconstruction is outside scope.

### 5.5 Future renderer integration

The future renderer reuses horizontal camera input, smoothing, and base depth sampling. It computes base coordinates from scene depth and glass coordinates from one near-plane transform, then combines the samples:

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
- Asset versions change with promoted content so local review does not reuse stale scripts or textures. The implementation review verifies the served content, not just Git status.

### 5.6 Artifacts, review, and scope boundaries

Future generated candidates, reports, and contact sheets belong under `output/glass_review/`. A complete future page preview belongs under `output/site_preview_layered_glass/`, copied from `dist/` with the candidate runtime integration. It is served over HTTP using the workflow in `scripts/README.md`. Neither folder is a substitute for committing canonical inputs and reproducible generation sources.

After visual acceptance, runtime assets and their metadata can be promoted into `dist/assets/`, with coordinated renderer/geometry changes and updated validation. Exact proposed output roles are base color, scene depth, editable glass RGBA, premultiplied glass runtime texture, and fallback poster. Final filenames are declared together in the implementation's asset manifest rather than overwriting the historical photograph as an undocumented shortcut.

The future review includes:

- Mask overlay, alpha-only view, checkerboard composite, and neutral full-scene composite.
- Side-by-side camera extremes and a short pointer-motion recording of the complete page, with identified laptop, ticker, reflection, and droplet landmarks.
- Source/alpha checks, gamma and premultiplication fixture, scene-depth ordering, and landmark displacement measurements.
- Existing build, formatting, audio, UI, drawing, and parallax checks, updated only where new geometry makes old reference-specific assertions obsolete.
- Desktop and mobile checks of original stroke appearance, groove start, waltz selection, clipping, missing overlay, WebGL failure, and reduced motion.

Normal-map generation, refractive distortion, physically moving reflected scenery, live relighting, recoloring the pencil, music changes, publication, and unrelated refactoring are outside this first implementation. New runtime assets and renderer changes live in `dist/`; generated diagnostics remain under ignored `output/`. Existing artwork and music code outside the registration points stay intact.

## 6. ToDo

- [x] Inspect the base, flattened reference, cleaned glass donor, and current single-image renderer.
- [x] Record source identities, layer semantics, constraints, and the proposed alpha pipeline.
- [ ] Prepare and review pane, reflection, droplet, frame, and cleanup masks.
- [ ] Generate alpha candidates and inspect them on diagnostic backgrounds and the base.
- [ ] Approve the glass appearance and useful transmission before page integration.
- [ ] Author and review base-only semantic depth, including laptop and ticker.
- [x] Implement reproducible glass-alpha generation and separate layered sampling.
- [x] Register drawing/hint geometry for the new canvas dimensions.
- [x] Add an overall glass-opacity slider with default 0.68.
- [ ] Review the complete local page at camera extremes and on mobile.
- [ ] Collect acceptance evidence, run regressions, and promote accepted assets.

Depth generation and base scene integration are implemented. Visual review and the remaining acceptance criteria stay pending until independently verified.
