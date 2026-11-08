# SPEC-001: Three-Plane Depth Correction

## 1. Problem and Current State

- The current Z-map produces only two visually distinguishable depth planes.
- The glass on the right appears as one large foreground wall.
- The woman and studio do not read clearly as a separate midground.
- The current Z-map must be corrected manually. Do not regenerate it with an AI depth model.
- The page already uses the intended reference image. Changing the reference image is out of scope.

## 2. Required State

The scene must contain exactly three semantic depth planes:

| Plane | Objects | Relative depth |
|---|---|---|
| Far | Plain background, house on the left, lights behind the glass on the right | Far |
| Midground | Studio and woman | Medium |
| Near | Glass with water droplets and rain, directly in front of the camera | Near |

Additional requirements:

- The glass must read as a flat plane parallel to the screen and directly in front of the viewer.
- The house and the lights behind the glass must remain on the far plane.
- The studio and woman must remain on the midground plane.
- The glass, visible water droplets and rain must occupy the near plane.
- Preserve the existing reference image and page composition.
- Do not run AI depth inference or replace the source image.

## 3. Acceptance Criteria

- [ ] **AC-01: Far plane**
  - The plain background is assigned to the far depth range.
  - The house on the left is assigned to the far depth range.
  - Visible lights behind the glass on the right are assigned to the far depth range.
  - Evidence: far-plane mask overlay and per-mask depth statistics.

- [ ] **AC-02: Midground**
  - The studio is assigned to the midground depth range.
  - The woman, including hair and clothing, is assigned to the midground depth range.
  - Evidence: midground mask overlay and per-mask depth statistics.

- [ ] **AC-03: Near plane**
  - The glass surface is assigned to the near depth range.
  - Visible water droplets and rain on the glass are assigned to the near depth range.
  - The glass plane has a consistent depth, apart from a narrow boundary feather where required.
  - Evidence: near-plane mask overlay and per-mask depth statistics.

- [ ] **AC-04: Region separation**
  - The three semantic masks are mutually exclusive.
  - Right-side background lights are excluded from the near-glass mask.
  - No large unintended region of the woman or studio is assigned to the near plane.
  - Evidence: combined color-coded mask image and overlap/coverage report.

- [ ] **AC-05: Numerical depth validation**
  - Each semantic mask has the expected depth ordering: far < midground < near, using the project's inverse-depth convention.
  - Report pixel count, coverage, minimum, maximum, median and percentile distribution for each mask.
  - Evidence: machine-readable JSON report and depth-profile visualization.

- [ ] **AC-06: Parallax behavior**
  - Near-plane displacement is greater than midground displacement.
  - Midground displacement is greater than far-plane displacement.
  - The glass reads as a frontal plane rather than a side wall.
  - Evidence: rendered captures at center and at multiple camera offsets, with measured region displacement.

- [ ] **AC-07: Regression**
  - The reference image and page composition remain unchanged.
  - The static depth asset and its metadata/checksums are consistent.
  - The project checks and GitHub Pages build pass.
  - Evidence: test output, build log and final page capture.

## 4. Analysis

- The existing depth map is the starting point and must be edited directly.
- Use hand-authored, object-aware masks rather than another model prediction.
- A single-channel Z-map stores only one depth per pixel. Where a light and a glass detail overlap at the same pixel, the visible pixel must be assigned to one layer; prioritize clearly visible light regions as far and distinguishable droplets/rain as near.
- The map uses relative inverse depth: brighter values are nearer. The final numeric levels must be selected after inspecting the current map and the parallax shader's depth interpretation.

## 5. Proposed Solution

1. Inspect the current reference and depth map; identify object boundaries before changing pixel values.
2. Create explicit, mutually exclusive masks for far, midground and near regions. Keep the right-side background lights separate from the glass mask.
3. Manually paint the existing depth map with three stable depth levels, using only narrow feathering at genuine object boundaries.
4. Add a deterministic correction script so the committed map can be reproduced without AI inference.
5. Update depth metadata and checksums to record the manual correction and its source inputs.
6. Add a depth-validation test that checks mask coverage, overlap, depth ordering and per-region statistics.
7. Generate review evidence:
   - a color-coded mask overlay;
   - a three-level depth visualization;
   - horizontal/vertical depth profiles;
   - a JSON report with per-region pixel counts and depth statistics.
8. Run the browser parallax check at several camera offsets. Measure the displacement of marked regions and verify near > midground > far.
9. Run project checks and the GitHub Pages build. Commit all implementation and evidence changes to this feature branch for visual review.

## 6. ToDo

- [ ] Inspect the current Z-map and parallax depth convention.
- [ ] Define and review the three object masks.
- [ ] Select the three numeric depth levels.
- [ ] Implement deterministic manual Z-map correction.
- [ ] Generate mask, depth and profile diagnostics.
- [ ] Add automated region and depth-order validation.
- [ ] Add parallax displacement measurements.
- [ ] Run project checks and GitHub Pages build.
- [ ] Collect evidence for every acceptance criterion.
- [ ] Commit implementation to the existing feature branch.
- [ ] Publish the branch for visual review.
