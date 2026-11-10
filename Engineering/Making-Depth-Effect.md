# Making the Depth Effect

The effect is built from two independently moving image layers rather than one flattened photograph with a single depth map.

## 1. Separate the scene from the glass

The original studio image is the base layer. Its depth map describes only objects in that scene: the city, studio wall, presenter, laptop, and ticker. The map is inferred from the base image and then corrected with reviewed semantic regions so important silhouettes and overlaps have deliberate depth values.

Rain, droplets, streaks, tint, and the reflected house are extracted from the glass donor as one full-frame overlay. A pane mask gives this overlay full alpha inside the right-hand glass area and zero alpha everywhere else. The glass is not painted into the studio depth map: it is a separate near plane with its own fixed depth.

## 2. Move both layers independently

For every output pixel, the renderer performs two texture lookups. The base image is sampled at coordinates displaced by its scene-depth value. The glass texture is sampled at coordinates displaced by the constant near-plane depth. A short iterative refinement converges each lookup toward its depth-dependent coordinate.

Because the two lookups use different transforms, the laptop and ticker move relative to nearby droplets and reflections as the pointer moves the virtual camera. The glass features remain together on one plane in this first version. This is a controlled 2D parallax approximation, not a full 3D reconstruction.

## 3. Composite transparent glass correctly

The editable glass image uses straight-alpha RGBA. For runtime filtering, its color is converted from sRGB to linear light and premultiplied by alpha. This avoids dark or colored fringes around transparent texels when the texture is filtered.

The shader combines the premultiplied glass contribution with the independently sampled base in linear light, then converts the result back to sRGB. The page opacity control scales the pane alpha without changing either layer's depth or motion. Its default is 0.68; zero reveals the base scene, while one uses the prepared pane alpha at full strength.

## 4. Keep interaction registered to the glass

Drawing strokes and the optional visual hint use the same near-plane displacement as the glass. Their coordinates are mapped between screen space and the source image, so marks stay attached to the moving pane instead of sliding over the composited result.

The static composite remains available as the loading and failure fallback. The result is a lightweight layered illusion: scene depth creates background parallax, a separately sampled alpha overlay creates the glass plane, and linear-light compositing lets the two move independently while remaining visually integrated.
