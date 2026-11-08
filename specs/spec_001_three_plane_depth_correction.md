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

- [x] **AC-01: Far plane**
  - [x] Plain background and the house on the left use far depth 96.
  - [x] Selected lights behind the glass on the right use far depth 96 (547 pixels).
  - Evidence: specs/evidence/depth-regions.png and specs/evidence/depth-report.json.

- [x] **AC-02: Midground**
  - [x] Studio and presenter, including hair and clothing, use depth 156 (170,815 pixels, 29.061%).
  - Evidence: region overlay and per-region statistics in specs/evidence/depth-report.json.

- [x] **AC-03: Near plane**
  - [x] Rain-covered glass, water droplets and rain use depth 236 (209,537 pixels, 35.649%).
  - [x] The glass is a constant-depth, screen-parallel plane.
  - Evidence: specs/evidence/depth-after.png and specs/evidence/depth-profiles.png.

- [x] **AC-04: Region separation**
  - [x] Far, midground and near masks are mutually exclusive and partition all 587,776 pixels.
  - [x] The right-side light mask is excluded from the near-glass mask.
  - [x] No studio or presenter pixels are assigned to the near plane.
  - Evidence: specs/evidence/depth-visualization.png and specs/evidence/depth-report.json.

- [x] **AC-05: Numerical depth validation**
  - [x] Inverse-depth ordering is 96 < 156 < 236.
  - [x] The report includes pixel count, coverage, min, p05, median, p95 and max for every plane.
  - [x] Every plane has one stable depth value.
  - Evidence: specs/evidence/depth-report.json.

- [x] **AC-06: Parallax behavior**
  - [x] Browser-measured displacement across camera extremes: far 0 px, midground 25 px, near 58 px.
  - [x] Measured ordering is near > midground > far.
  - [x] The browser test reports no page errors.
  - Evidence: scripts/check_reference_parallax.mjs; [GitHub Actions run and browser evidence](https://github.com/ToniDonDoni/greydressnews/actions/runs/42506558149).

- [x] **AC-07: Regression**
  - [x] The reference image is unchanged (source_sha256: c75794dbfe69920916fae155722dff042b3db787884db44a97a668b618406bd3).
  - [x] The depth asset and metadata checksums match.
  - [x] Manual depth validation, project checks, browser parallax test and Pages build pass.
  - Evidence: specs/evidence/depth-report.json; [successful Pages build and test run](https://github.com/ToniDonDoni/greydressnews/actions/runs/42506563875).

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

- [x] Inspect the current Z-map and shader depth convention.
- [x] Define and review the far, midground and near masks.
- [x] Select the three numeric depth levels.
- [x] Implement deterministic manual Z-map correction.
- [x] Generate mask, depth and profile diagnostics.
- [x] Add automated region, checksum and depth-order validation.
- [x] Add browser-measured parallax displacement checks.
- [x] Run project checks and GitHub Pages build.
- [x] Collect evidence for every acceptance criterion.
- [x] Commit implementation to the existing feature branch.
- [x] Publish the changes in the existing pull request.
