# Building the Pseudo-3D Depth Effect

Grey Dress News creates a 2.5D illusion by combining an image, a depth field, a virtual horizontal camera, and a separately rendered glass layer. It is not a polygonal 3D scene: depth controls how image samples move, while independent layers solve overlaps that a single depth map cannot represent.

## 1. Create a usable scene-depth field

The base photograph is passed through Apple Depth Anything V2 Small FP16 using Core ML to obtain a relative depth prediction. This is a starting point, not the final geometry. The editable semantic regions in `test/depth_regions.json` correct the prediction around meaningful objects such as the city, studio, presenter, laptop, and ticker. Reviewed masks are applied deterministically to produce the static grayscale depth texture.

The map stores relative inverse depth, not metric distance: brighter values are nearer. Region review overlays and validation checks make the object boundaries, ordering, coverage, and baked result inspectable and reproducible. Earlier iterations used three manually authored FAR, MIDGROUND, and NEAR planes; the current base map uses more detailed semantic regions.

## 2. Turn depth into parallax

At runtime WebGL draws a full-screen textured quad. For each output pixel, the fragment shader samples the depth texture and iteratively adjusts the source-image coordinate. The displacement depends on the pixel's depth and the horizontal virtual-camera position. Near regions therefore travel farther than distant regions, creating relative motion without reconstructing mesh geometry.

The current shader uses a 0.045 horizontal camera-shift strength, a 0.38 depth pivot, seven refinement iterations, and a 0.6 interpolation factor per iteration. The camera target follows pointer movement and is eased over time; reduced-motion preferences disable the animated response. A 5% overscan window (0.95 scale with 0.025 offset) keeps the image edges covered as the view shifts.

## 3. Give the glass its own depth and color contribution

A single image plus one depth value per pixel cannot move two overlapping surfaces independently. The glass is therefore not painted into the base depth map. A cleaned donor supplies the right pane's RGB, while a reviewed pane mask supplies alpha: opaque inside the pane and transparent outside. Droplets, streaks, tint, and reflected architecture remain together in this first near-plane approximation.

The renderer samples three textures independently: the base photograph, its scene-depth map, and the glass overlay. The base uses per-pixel depth; the glass uses a fixed near depth of 236/255. Both are displaced by the same camera, so objects in the base move relative to the glass. The opacity slider scales pane alpha (default 0.68) without changing either layer's depth or motion.

## 4. Composite and keep interaction registered

The editable glass asset uses straight-alpha RGBA. Its runtime texture is converted to linear-light RGB and premultiplied by alpha before filtering. WebGL uploads it without another colorspace conversion or premultiplication, blends it over the independently warped base in linear light, then encodes the final color to sRGB. This avoids the edge fringes and brightness errors that can appear when transparent textures are filtered or blended in the wrong color space.

Drawing strokes and the optional visual hint use the same near-plane coordinate transform and pane clipping, so they remain attached to the moving glass. A static composite remains visible if the WebGL depth view fails.

## Scope

The repository also retains an earlier procedural café artwork experiment. That path paints the illustration, separates selected elements into raster sprites (including lamps and windows), and animates those layers. It is a distinct layered-animation technique, not part of the current Grey Dress depth-map renderer.

The current effect is therefore a controlled 2.5D image-space illusion: neural depth estimation plus semantic correction, depth-dependent texture warping, overscan and eased camera motion, independent alpha glass, linear-light compositing, and registered interaction layers. It does not claim full 3D geometry or physically accurate refraction.
