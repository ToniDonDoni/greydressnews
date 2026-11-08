# Grey Dress News

An interactive visual study of a television presenter, a city at night, and the rain-streaked glass between the viewer and the scene.

**[View the live study](https://tonidondoni.github.io/greydressnews/)**

## Artistic concept

The presenter's **gray dress** establishes the image's restrained tonal register. It recalls the muted atmosphere of Yuri Pimenov's urban painting and suggests a way of reimagining the city behind her: architecture softened into broken brushstrokes, luminous windows, and transitions of light that make the skyline feel painted rather than simply photographed.

Saul Leiter introduces a different way of seeing the city. His language of reflections, partially obscured views, and translucent planes of color informs the rain-covered glass on the right. Its red creates a chromatic counterpoint to Pimenov's quiet palette. Where Pimenov lends the city its painterly atmosphere, Leiter complicates the view through layers of glass, moisture, and light.

The intention is **a visual dialogue between Pimenov's painterly city and Leiter's photographic sense of color and reflection**, not a reproduction of either artist's work. The presenter remains the compositional anchor, while the city and the glass become distinct ways of experiencing depth.

For the artistic research, independent style studies, and development of the Pimenov-Leiter hybrid, see **[SPEC-004: Blonde News Presenter in a City](https://github.com/ToniDonDoni/adavilazil/blob/main/test/explore_visual_styles/test6/SPEC-004-PRESENTER.md)** in the `adavilazil` repository. The specification treats Pimenov as the primary artistic reference and Leiter as the complementary study of glass and color. Edward Steichen is explored separately, not as part of this hybrid.

## Interactive depth study

The page presents the already-selected image `references/ElGrayPimenovLeiterWindow2.png` as a small interactive 2.5D scene. Moving the pointer horizontally, or dragging on a touch screen, shifts the view using a committed relative depth map. The artwork itself remains a still image; the viewpoint changes, rather than the presenter or city being animated.

The scene uses **three manually defined Z-planes**:

| Plane | Image elements | Grayscale inverse depth |
| --- | --- | --- |
| Far | Plain background, house on the left, selected lights behind the glass on the right | 96 |
| Midground | News studio and presenter | 156 |
| Near | Rain-streaked glass, droplets, and visible water texture in front of the camera | 236 |

The glass is treated as a plane parallel to the screen, rather than a wall receding sideways. Selected visible light cores on the right remain assigned to the far plane instead of moving with the glass.

The map is a **manually corrected, deterministic interpretation** of the image, not a new neural prediction. A single depth-map pixel can represent only one distance; transparent glass and the lights seen through it cannot occupy separate depths at the same pixel. The masks therefore prioritize distinguishable rain texture as near and selected light cores as far. This is an artistic parallax construction, not a full reconstruction of the space.

The scope, test strategy, and acceptance evidence are recorded in **[SPEC-001: Three-Plane Depth Correction](specs/spec_001_three_plane_depth_correction.md)**.

## Implementation

The site is static HTML, CSS, and JavaScript, published from `dist/` to GitHub Pages. `dist/parallax.js` loads the still image and the committed grayscale depth texture into a WebGL shader; no AI model or inference service runs in the browser.

The project keeps both the manual correction script and its verification artifacts under version control:

| Path | Purpose |
| --- | --- |
| `references/ElGrayPimenovLeiterWindow2.png` | Source image |
| `dist/index.html`, `dist/parallax.js` | Display and pointer-driven WebGL parallax |
| `dist/assets/ElGrayPimenovLeiterWindow2-depth.png` | Committed 1024 x 574 depth map |
| `dist/assets/ElGrayPimenovLeiterWindow2-depth.json` | Depth values, source checksum, and correction provenance |
| `scripts/manual_depth_planes.py` | Reproducible manual object masks, map correction, and validation |
| `specs/evidence/` | Color-coded regions, before/after maps, depth profile, and statistical report |
| `scripts/check_reference_parallax.mjs` | Browser-based comparison of far, midground, and near motion |
| `.github/workflows/pages.yml` | Build, browser validation, and Pages publishing |

The optional `scripts/make_reference_depth.py` retains a historical depth-model generation path. It is **not needed** to reproduce or check the manual map, and no AI depth regeneration is part of the current task.

## Run and verify

Serve the committed site from the repository root:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/` and move the pointer across the image. Use a static HTTP server instead of opening `dist/index.html` directly.

To verify the committed depth map and run the existing project checks:

```sh
python3 -m pip install 'Pillow>=10,<14'
python3 scripts/manual_depth_planes.py --check
python3 scripts/build.py --check
node scripts/check.mjs
node scripts/check-ui.mjs
```

To regenerate the same manual depth map and its diagnostic images without neural inference, run `python3 scripts/manual_depth_planes.py` and commit the resulting PNG, JSON, and evidence together.

For a rendered browser test, install Playwright and Chromium, start the local server above, and run:

```sh
npm install --no-save --no-package-lock playwright
npx playwright install chromium
TEASER_URL=http://127.0.0.1:8000/ node scripts/check_reference_parallax.mjs
```

The browser test captures center, left, and right viewpoints and measures how far each depth region moves. Its screenshots and JSON report appear in `output/reference-parallax-check/`. GitHub Actions also runs this test and uploads a `reference-depth-parallax-evidence` artifact. The depth-mask diagnostics are retained in `specs/evidence/`.

## Publishing

`.github/workflows/pages.yml` validates changes in `teaser` and the feature branch. Successful pushes to `teaser` publish automatically. To preview a feature branch before merging, use **Actions > Publish to GitHub Pages > Run workflow** and select the feature branch. A manual deployment replaces the current content at the same Pages URL; it does not create a separate PR preview URL. The `github-pages` environment must permit deployments from that branch.

## License

MIT. See [LICENSE](LICENSE).
