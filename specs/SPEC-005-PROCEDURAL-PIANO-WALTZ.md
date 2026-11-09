# SPEC-005: Dual Music Themes and Circle Selection

## 1. Problem and Current State

- The original teaser played a procedural instrumental hip-hop groove at 74 BPM in 4/4 on the first trusted user gesture.
- The piano-waltz change replaced that original groove instead of retaining it as the default.
- The score-aligned piano theme transcribes the first 33 measures of Valzer d'Inverno in D-flat major / B-flat minor, 3/4, at quarter note = 165.
- The page already supports finger drawing on the rain-streaked glass and touch-driven parallax. Music selection must not interfere with either interaction.

## 2. Required State

- Keep the original procedural groove as the default theme. It must start on the first trusted pointer/touch gesture, as it did before the waltz change.
- Keep the score-aligned piano waltz as a second theme. Preserve its 33-measure, both-hands transcription, Salamander piano samples, and procedural fallback.
- A closed, approximately circular gesture drawn entirely on the right rain-streaked glass selects the piano waltz. Recognition depends on path geometry, not on a click, tap, fixed coordinate, or visible hint.
- The yellow circle is an optional visual cheat only. A double-click inside the left building hit area toggles it on the glass; it follows the near-plane parallax transform and disappears after a successful music circle. Its visibility must never gate music selection.
- Accept moderate radial variation, mild ovality, and a slightly imperfect endpoint closure. Ignore open strokes, severely irregular scribbles, circles outside the glass, and gestures that are cancelled. A valid music circle remains visible as a normal translucent glass-ink stroke.
- Switch immediately after the circle is completed, using a short crossfade. Start the waltz at measure 1 without recreating the AudioContext.
- Keep the original 80 percent master gain, first-gesture activation, mobile resume retry, and no-visible-audio-controls behavior.
- Preserve the artwork, depth map, glass drawing, parallax renderer, and mobile interaction.

## 3. Acceptance Criteria

- [x] **AC-01 - Default theme.** The original 74 BPM, 4/4 procedural groove remains the first theme and starts on the first trusted gesture.
- [x] **AC-02 - Alternate theme.** The piano waltz retains the 165 BPM, 3/4 score transcription of measures 1-33 for both hands.
- [x] **AC-03 - Circle recognition.** A closed, approximately circular pointer path drawn entirely on the right rain glass selects the waltz, even when the hint is hidden.
- [x] **AC-04 - False-positive rejection.** Open strokes, severely irregular closed scribbles, and circles outside the glass do not select the waltz.
- [x] **AC-10 - House cheat.** A double-click on the left building toggles a soft pale-yellow circle hint on the glass; double-clicking the presenter does nothing.
- [x] **AC-11 - Visible gesture.** The hint follows the glass parallax plane, and drawing a successful circle both selects the waltz and leaves a normal glass-ink mark.
- [x] **AC-12 - Optional hint.** A moderately uneven circle selects the waltz without ever showing the yellow hint, on both desktop and mobile.
- [x] **AC-05 - Immediate transition.** The completed circle crossfades to the waltz, starting at measure 1, without creating another AudioContext.
- [x] **AC-06 - Sample readiness.** The waltz uses recorded Salamander piano notes when decoded and its procedural piano remains available while samples load or if loading fails.
- [x] **AC-07 - Mobile behavior.** Touch circles select the waltz; the original touch activation and blocked-resume retry still work.
- [x] **AC-08 - Visual regression.** Glass drawing, clipping, parallax, and the artwork remain unchanged.
- [x] **AC-09 - Automated verification.** Source, audio, UI, desktop gesture, mobile gesture, and browser regressions pass.

## 4. Analysis

- The original groove and the waltz have different meters and tempos, so they use independent synthesizers and bar clocks.
- Each theme has its own gain bus. A short crossfade silences already scheduled bars from the previous theme without restarting the shared master chain or AudioContext.
- The circle recognizer measures closure, angular travel, path length, radial deviation, aspect ratio, and center position. It allows moderate hand-drawn variation while rejecting taps, open strokes, and severely irregular scribbles. Current tolerances are radial error <= 0.36, aspect ratio 0.62-1.62, endpoint gap <= max(18 px, 0.45r), path length 3.8r-9.5r, and angular travel 1.45π-2.65π.
- Hint visibility is never read by the gesture recognizer. The yellow circle is a visual-only target and can be toggled independently.
- The recognizer validates every sampled point against the source-image glass rectangle, so a circle must remain on the drawable pane at desktop and mobile sizes.
- The hint is drawn in source-image space on a separate transparent canvas inside the same transformed ink layer. Its soft screen-blended halo and pale ring therefore move with the near glass plane.
- While the piano samples decode, only one procedural fallback bar is queued ahead. Once samples are ready, the fallback bus fades out and recorded piano takes over on the next scheduled bar.

## 5. Proposed Solution

1. Preserve the original teaser synthesizer in dist/legacy-groove.mjs; keep the score-aligned engine in dist/groove-core.mjs.
2. Make the legacy groove the default in dist/music.mjs. Route the legacy groove, sampled waltz, and temporary waltz fallback through separate gain buses.
3. Listen for a music-theme-change event from the drawing controller. Reset the selected theme's bar index and schedule it from the current audio time.
4. Add a geometry-based circle recognizer to dist/glass-ink.js. Track one primary pointer beginning on the rain glass and dispatch the theme event only after a completed circle passes the shape checks.
5. Add a separate, parallax-registered hint canvas. A trusted double-click inside the left building hit area toggles a soft solar-yellow circle at the intended glass position.
6. Keep the existing glass-only ink hit-testing. The music-selection circle is drawn as an ordinary translucent glass stroke and does not bypass clipping.
7. Extend scripts/check-ui.mjs to verify the original groove starts by default, the waltz starts after selection, and mobile activation/retry remain intact.
8. Extend scripts/check_glass_drawing.mjs to test circle selection with the hint never shown, moderately uneven desktop/mobile circles, house double-click, hint placement/color, and rejection cases.
9. Capture desktop hint/circle and mobile circle screenshots, then run the complete Pages workflow, including formatting, audio, drawing, and parallax regressions.

## 6. ToDo

- [x] Restore the original 74 BPM groove as a separate synthesizer module.
- [x] Keep the score-aligned piano waltz as the alternate theme.
- [x] Add independent theme buses and a short crossfade.
- [x] Recognize a closed circle drawn on the right rain glass.
- [x] Add a house double-click cheat and a parallax-registered solar-yellow hint.
- [x] Keep the music circle as a clipped, visible glass-ink stroke.
- [x] Test valid circles, invalid gestures, and circles outside the selection region.
- [x] Test default playback, waltz selection, sample scheduling, and mobile retry.
- [x] Test circle selection while the hint has never been shown.
- [x] Test moderately uneven circle gestures on desktop and mobile.
- [x] Test the house double-click and hint color/placement.
- [x] Capture desktop hint/circle and mobile circle screenshots.
- [x] Run the full CI workflow and review browser regressions.

### Piano sample attribution

- Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0.
- Sample hosting: https://tonejs.github.io/audio/salamander/
- Original: https://github.com/sfzinstruments/SalamanderGrandPiano
- License: https://creativecommons.org/licenses/by/3.0/
- The browser uses 14 recorded notes, repitches nearby keys, and applies Web Audio envelopes and effects.
- If sample loading fails, the score-aligned procedural piano remains audible as a fallback.
