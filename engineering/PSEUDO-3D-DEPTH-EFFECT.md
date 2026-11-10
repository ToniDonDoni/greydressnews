# Building the Pseudo-3D Depth Effect

Grey Dress News creates a 2.5D image-space illusion by combining a photograph, a relative-depth field, a virtual horizontal camera, and a separately rendered glass layer. It is not a polygonal 3D scene: depth controls where image samples are taken, while separate image layers allow overlapping contributions to move independently.

## 1. Build the base scene-depth field

Depth estimation is an offline asset-generation step, not a browser feature. On macOS with Apple Silicon, `scripts/generate_raw_reference_depth.py` runs the pinned Apple Depth Anything V2 Small FP16 Core ML model against the base photograph and writes a raw relative-depth PNG. The model is cached locally; it is not downloaded or executed by the published page.

The raw prediction is only a starting point. Editable semantic regions in `test/depth_regions.json` correct meaningful objects such as the city, studio wall, presenter, laptop, and ticker. `scripts/apply_depth_regions.py` applies those regions in a deterministic order and writes the corrected grayscale depth texture plus a report. For the layered-glass scene, `scripts/bake_glass_scene_depth.py` performs this bake from the raw depth candidate and the same region map.

The stored map is relative inverse depth, not metric distance: brighter values are nearer. The current shader's useful range maps the nearest authoring level to grayscale 236 and the farthest to 96. Region overlays, ordering checks, sample-point checks, source hashes, and output hashes make the bake inspectable and reproducible. Earlier iterations used three manually authored FAR, MIDGROUND, and NEAR planes; the current base map uses semantic regions instead.

At runtime the browser loads the already-generated `assets/scene-depth.png`. It does not run the neural model or regenerate the map.

## 2. Turn depth into parallax

At runtime WebGL draws a full-screen textured quad. For each output pixel, the fragment shader samples the depth texture and iteratively adjusts the source-image coordinate. The displacement depends on that pixel's depth and the horizontal virtual-camera position. Near regions therefore travel farther than distant regions, creating relative motion without reconstructing mesh geometry.

The current shader uses a 0.045 horizontal camera-shift strength, a 0.38 depth pivot, seven refinement iterations, and a 0.6 interpolation factor per iteration. Each iteration moves the current coordinate 60% toward the depth-dependent target. The pointer sets a horizontal camera target in the range -1 to +1; the camera position is eased over time. The `prefers-reduced-motion` setting disables pointer-driven movement. A shared 5% overscan window maps the output coordinates with a 0.95 scale and 0.025 offset, keeping the viewport covered while the image shifts.

This is a 2D image warp. It cannot reveal pixels that do not exist in the source photograph, so newly exposed object boundaries are approximated by the available image samples and edge clamping. Overscan reduces exposed outer edges; it does not reconstruct hidden scene content.

## 3. Give the glass its own depth and color contribution

A single image plus one depth value per pixel cannot move two overlapping surfaces independently. The glass is therefore not painted into the base depth map.

The base photograph is `references/no_logo.png`. A cleaned donor, `references/no_logo_leiter_glass.png`, supplies the glass RGB. The pane geometry in `test/glass_layers.json` defines a full-height rectangular region on the right side of the 1672 x 941 canvas: x = 1095 through 1671, y = 0 through 940. The generator `scripts/make_layered_glass.py` copies donor RGB inside that configured region and creates alpha 255 there and alpha 0 everywhere else. This is a configured rectangular pane matte, not a per-pixel segmentation or a physically estimated glass boundary.

Droplets, streaks, tint, and reflected architecture remain together in the donor RGB and move as one near-plane contribution. The renderer samples three textures independently: the base photograph, its scene-depth map, and the glass overlay. The base uses per-pixel depth; the glass uses a fixed near depth of 236/255, corresponding to authoring depth 1. Both use the same camera input and iterative warp, so objects in the base move relative to the glass. The opacity slider scales pane alpha (default 0.68) without changing either layer's depth or motion.

## 4. Composite and keep interaction registered

The editable glass asset uses straight-alpha RGBA with sRGB RGB values. Its runtime derivative, `assets/glass-runtime.png`, stores linear-light RGB premultiplied by alpha, plus alpha, in an RGBA8 texture. Transparent texels have zero RGB. The WebGL upload disables browser colorspace conversion and additional upload-time alpha premultiplication.

The fragment shader samples the runtime glass texture, multiplies its premultiplied RGB by the slider opacity, and combines it with the base converted to linear light. The effective alpha is the sampled pane alpha multiplied by the slider value. The result is encoded to sRGB once. This avoids filtering straight-alpha edge colors and avoids blending the two image contributions in gamma-encoded sRGB space. The offline fallback composite uses the same linear-light premultiplied-alpha convention.

Drawing strokes and the optional visual hint use the near-plane displacement and pane clipping so they remain attached to the moving glass. Their canvas coordinates are registered to the 1672 x 941 composition. If the WebGL depth view cannot initialize or loses its context, the page hides the depth canvas and leaves the static composite poster visible.

## 5. Assets, build flow, and scope

The layered-glass page consumes these generated assets:

- `assets/no_logo.png`: opaque base photograph.
- `assets/scene-depth.png`: static base-only relative-depth map.
- `assets/glass-layer.png`: editable straight-alpha glass layer.
- `assets/glass-runtime.png`: linear-light premultiplied runtime texture.
- `assets/glass-alpha.png`: pane alpha diagnostic.
- `assets/glass-composite.png`: static fallback composite at the default opacity.

The reproducible local flow is: generate raw depth with the pinned Core ML model, bake semantic base depth, generate the glass layer and its runtime derivative, assemble the local page, then run browser checks. The local layered preview is assembled under ignored `output/`; the tracked `dist/` page is promoted only after review. The browser does not need the Core ML model because all required image and depth assets are static files.

The repository also retains an earlier procedural cafe artwork experiment. That path generates an illustration, extracts selected elements into raster sprites (including lamps and windows), bakes a separate relative-depth map with the Core ML depth model, and uses its own browser parallax page. Sprite animation and depth-driven camera motion are related but distinct techniques. They document the evolution of the project; they are not loaded by the current Grey Dress page.

The current effect is a controlled 2.5D image-space illusion: offline neural depth estimation plus semantic correction, depth-dependent texture warping, overscan and eased camera motion, an independent alpha glass layer, linear-light compositing, and registered interaction layers. It does not claim full 3D geometry, hidden-surface reconstruction, or physically accurate refraction.
