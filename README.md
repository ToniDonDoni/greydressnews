# Grey Dress News

[View the interactive study](https://tonidondoni.github.io/greydressnews/)

## Artistic concept

A news presenter in a gray dress becomes the point of departure for a dialogue between the urban visions of **Yuri Pimenov** and **Saul Leiter**.

The gray of her dress recalls the restrained palette of Pimenov's cityscapes. That quiet chromatic affinity suggests a transformation of the city behind her: architecture softens into broken painterly strokes, windows flicker through the night, and buildings are held together by subtle transitions of light rather than hard outlines. Pimenov's vision is the foundation of the composition, not merely a decorative quotation.

Leiter introduces a different way of seeing the city. Rain-streaked glass, reflections and translucent fields of color interrupt the view, placing the observer at a remove from the scene. The red at the right becomes a chromatic counterpoint to Pimenov's subdued tones. One artist lends the city its painted atmosphere; the other reframes it through the unstable surface of a window.

The aim is not to imitate two signatures side by side, but to bring painting and photography into a single contemporary image. The presenter anchors the scene in the visual language of broadcast news, while the city and the glass complicate what is foreground, what is distant, and what it means to look through an image.

**Art-direction source:** Read [SPEC-004: Blonde News Presenter in a City](https://github.com/ToniDonDoni/adavilazil/blob/main/test/explore_visual_styles/test6/SPEC-004-PRESENTER.md) before revising the composition. The source study establishes **Pimenov as the primary visual language** and **Leiter as the photographic and chromatic counterpoint**. Edward Steichen is explored there as an independent comparison, not as part of this hybrid.

## Interactive depth study

This repository presents the fixed reference image `references/ElGrayPimenovLeiterWindow2.png` as an interactive, browser-based parallax study. The displayed image is served from `dist/assets/ElGrayPimenovLeiterWindow2.png`; the site does not redraw the artwork or generate new pictures at runtime.

Pointer movement changes the apparent viewpoint through a WebGL warp of the photograph. The depth is deliberately authored around three spatial planes:

| Plane | Visual elements | Inverse-depth value |
| --- | --- | --- |
| Far | Plain background, the building on the left, selected lights behind the glass on the right | 96 |
| Midground | The presenter and television studio | 156 |
| Near | The rain-covered glass directly in front of the camera | 236 |

The rain-covered glass is treated as a screen-parallel foreground surface; selected light sources visible beyond it are assigned to the distant plane. These values are relative, not physical distances. A single-channel depth map assigns one value per pixel, so overlapping transparent and distant elements remain a deliberate 2.5D approximation rather than a full 3D reconstruction.

**Depth implementation and acceptance criteria:** [SPEC-001: Three-Plane Depth Correction](specs/spec_001_three_plane_depth_correction.md). The manually corrected Z-map, its metadata, object masks and numerical evidence are committed in `dist/assets/` and `specs/evidence/`.

## Implementation and verification

The page is a static HTML, CSS and JavaScript experience in `dist/`. It requires no model inference, server-side rendering or external image service during playback.

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/` and move the pointer or drag across the image to inspect the depth separation.

To validate the committed Z-map without regenerating it:

```sh
python3 -m pip install 'Pillow>=10,<14'
python3 scripts/manual_depth_planes.py --check
python3 scripts/build.py --check
node scripts/check.mjs
```

To reproduce the manual Z-map correction and its diagnostic images, run `python3 scripts/manual_depth_planes.py`. This uses hand-authored masks and fixed depth levels; it **does not call an AI depth model**. Commit the resulting depth PNG, metadata JSON and evidence together.

The optional browser test requires Playwright and Chromium. Start the local server first, then run:

```sh
npm install --no-save --no-package-lock playwright
npx playwright install chromium
TEASER_URL=http://127.0.0.1:8000/ node scripts/check_reference_parallax.mjs
```

The test captures center, left and right views; verifies browser-loaded depth samples; and measures whether foreground displacement exceeds midground displacement, which in turn exceeds background displacement. GitHub Actions also runs the depth checks and uploads browser evidence.

## Project files

| Path | Purpose |
| --- | --- |
| `references/ElGrayPimenovLeiterWindow2.png` | Reference artwork |
| `dist/index.html`, `dist/style.css`, `dist/parallax.js` | Interactive presentation |
| `dist/assets/ElGrayPimenovLeiterWindow2-depth.png` | Committed three-plane depth map |
| `dist/assets/ElGrayPimenovLeiterWindow2-depth.json` | Depth metadata and checksums |
| `scripts/manual_depth_planes.py` | Deterministic manual mask correction and verification |
| `scripts/check_reference_parallax.mjs` | Browser displacement test |
| `specs/spec_001_three_plane_depth_correction.md` | Depth acceptance criteria |
| `specs/evidence/` | Mask overlays, depth visualizations and reports |
| `.github/workflows/pages.yml` | Site validation and GitHub Pages publication |

## Publishing

The GitHub Actions workflow validates the feature branch and pull requests. Publishing to the shared GitHub Pages address is configured for `teaser`; a feature-branch test does not create a separate preview URL. The live page shows whichever revision was most recently deployed through the Pages workflow.

## License

MIT. See [LICENSE](LICENSE).
