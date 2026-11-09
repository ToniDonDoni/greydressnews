# SPEC-005: Dual Music Themes and Handwritten Letter-E Selection

## 1. Problem and Current State

- The original teaser played a procedural instrumental hip-hop groove at 74 BPM in 4/4 on the first trusted user gesture.
- The piano-waltz change replaced that original groove instead of retaining it as the default.
- The score-aligned piano theme transcribes the first 33 measures of Valzer d'Inverno in D-flat major / B-flat minor, 3/4, at quarter note = 165.
- The page already supports finger drawing on the rain-streaked glass and touch-driven parallax. Music selection must not interfere with either interaction.

## 2. Required State

- Keep the original procedural groove as the default theme. It must start on the first trusted pointer/touch gesture, as it did before the waltz change.
- Keep the score-aligned piano waltz as a second theme. Preserve its 33-measure, both-hands transcription, Salamander piano samples, and procedural fallback.
- A handwritten lowercase `e`, drawn as one continuous stroke entirely on the right rain-streaked glass, selects the piano waltz. The recognizer looks for a broad middle crossbar and a looped bowl, not a closed circle.
- The yellow hint is an optional visual cheat only. A double-click inside the left building hit area toggles a pale, sunlit lowercase `e` on the glass. Its glyph is mirrored horizontally around its vertical centerline, matching the intended reading direction. It follows the near-plane parallax transform and disappears after a successful letter gesture. Its visibility must never gate music selection.
- Accept a slightly uneven loop, a slanted or wobbly crossbar, varied proportions, and an imperfect hand-drawn shape. Ignore simple lines, old circle gestures, severely irregular scribbles, gestures outside the glass, and cancelled gestures. A valid letter remains visible as a normal translucent glass-ink stroke.
- Switch immediately after the letter is completed, using a short crossfade. Start the waltz at measure 1 without recreating the AudioContext.
- Keep the original 80 percent master gain, first-gesture activation, mobile resume retry, and no-visible-audio-controls behavior.
- Preserve the artwork, depth map, glass drawing, parallax renderer, and mobile interaction.

## 3. Acceptance Criteria

- [x] **AC-01 - Default theme.** The original 74 BPM, 4/4 procedural groove remains the first theme and starts on the first trusted gesture.
- [x] **AC-02 - Alternate theme.** The piano waltz retains the 165 BPM, 3/4 score transcription of measures 1-33 for both hands.
- [x] **AC-03 - Letter recognition.** A single-stroke handwritten lowercase `e` drawn on the right rain glass selects the waltz.
- [x] **AC-04 - False-positive rejection.** A plain closed circle, open line, irregular scribble, or letter outside the glass does not select the waltz.
- [x] **AC-10 - House cheat.** A double-click on the left building toggles a soft pale-yellow lowercase `e` hint on the glass; double-clicking the presenter does nothing.
- [x] **AC-11 - Visible gesture.** The hint follows the glass parallax plane, and drawing a successful letter both selects the waltz and leaves a normal glass-ink stroke.
- [x] **AC-12 - Optional hint.** A loose letter selects the waltz without ever showing the yellow hint, on both desktop and mobile.
- [ ] **AC-13 - Hint orientation.** The yellow hint glyph is mirrored horizontally around its vertical centerline, and a browser pixel test confirms the loop opens toward the intended side.
- [x] **AC-05 - Immediate transition.** The completed gesture crossfades to the waltz, starting at measure 1, without creating another AudioContext.
- [x] **AC-06 - Sample readiness.** The waltz uses recorded Salamander piano notes when decoded and its procedural piano remains available while samples load or if loading fails.
- [x] **AC-07 - Mobile behavior.** Touch gestures select the waltz; the original touch activation and blocked-resume retry still work.
- [x] **AC-08 - Visual regression.** Glass drawing, clipping, parallax, and the artwork remain unchanged.
- [x] **AC-09 - Automated verification.** Source, audio, UI, desktop letter, mobile letter, and browser regressions pass.

## 4. Analysis

- The original groove and the waltz have different meters and tempos, so they use independent synthesizers and bar clocks.
- Each theme has its own gain bus. A short crossfade silences already scheduled bars from the previous theme without restarting the shared master chain or AudioContext.
- The recognizer checks the gesture's bounding box, central crossbar, loop coverage, path length, endpoint separation, and position on the glass. It does not require a closed path or a visible hint.
- The recognizer is deliberately tolerant: aspect ratio 0.72-2.8, crossbar span at least 56 percent of the gesture width, crossbar vertical deviation up to 36 percent of gesture height, angular coverage at least 1.12*pi, and path length 1.7-6.8 times the larger gesture dimension.
- Every sampled point and the gesture center must remain inside the source-image glass rectangle. The old circle shape no longer qualifies because it has no continuous middle crossbar.
- The hint is drawn in source-image space on a separate transparent canvas inside the same transformed ink layer. The glyph is reflected around its vertical centerline before stroking, so the shape faces the intended direction without changing its screen-space anchor. Its soft screen-blended halo and pale golden letter therefore move with the near glass plane.
- While the piano samples decode, only one procedural fallback bar is queued ahead. Once samples are ready, the fallback bus fades out and recorded piano takes over on the next scheduled bar.

## 5. Proposed Solution

1. Preserve the original teaser synthesizer in `dist/legacy-groove.mjs`; keep the score-aligned engine in `dist/groove-core.mjs`.
2. Make the legacy groove the default in `dist/music.mjs`. Route the legacy groove, sampled waltz, and temporary waltz fallback through separate gain buses.
3. Listen for a `music-theme-change` event from the drawing controller. Reset the selected theme's bar index and schedule it from the current audio time.
4. Replace circle recognition with a tolerant handwritten-letter recognizer in `dist/glass-ink.js`. Track one primary pointer beginning on the rain glass and dispatch the theme event only after the crossbar-and-loop shape checks pass.
5. Draw the optional pale-yellow lowercase `e` on the separate parallax-registered hint canvas. A trusted double-click inside the left building hit area toggles the hint.
6. Keep the existing glass-only ink hit-testing. The music-selection letter is drawn as an ordinary translucent glass-ink stroke and does not bypass clipping.
7. Extend `scripts/check_glass_drawing.mjs` to test letter recognition with the hint never shown, the optional house hint, rejection cases, and actual mouse/touch gestures.
8. Capture desktop hint/letter and mobile letter screenshots, then run the complete Pages workflow, including formatting, audio, drawing, and parallax regressions.

## 6. ToDo

- [x] Restore the original 74 BPM groove as a separate synthesizer module.
- [x] Keep the score-aligned piano waltz as the alternate theme.
- [x] Add independent theme buses and a short crossfade.
- [x] Recognize a handwritten lowercase `e` on the right rain glass.
- [x] Add a house double-click cheat that displays the same pale-yellow letter.
- [x] Keep the music-selection letter as a clipped, visible glass-ink stroke.
- [x] Test a loose letter, the old circle gesture, open lines, irregular scribbles, and gestures outside the glass.
- [x] Test default playback, waltz selection, sample scheduling, and mobile retry.
- [x] Test letter selection while the hint has never been shown.
- [x] Test the house double-click and hint color/placement.
- [ ] Verify the mirrored letter orientation with a browser pixel-position assertion.
- [x] Capture desktop hint/letter and mobile letter screenshots.
- [x] Run the full CI workflow and review browser regressions.

### Piano sample attribution

- Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0.
- Sample hosting: https://tonejs.github.io/audio/salamander/
- Original: https://github.com/sfzinstruments/SalamanderGrandPiano
- License: https://creativecommons.org/licenses/by/3.0/
- The browser uses 14 recorded notes, repitches nearby keys, and applies Web Audio envelopes and effects.
- If sample loading fails, the score-aligned procedural piano remains audible as a fallback.
