# SPEC-005: Procedural Piano Waltz

## 1. Problem and Current State

- The page starts a procedural instrumental hip-hop groove on the first trusted user gesture.
- The groove uses drum voices, a 4/4 bar model, and a 74 BPM tempo.
- The supplied score, *Valzer d'Inverno*, is a piano solo in D-flat major / B-flat minor, 3/4, at quarter note = 165.
- The page must retain its unobtrusive first-gesture playback and leave the artwork and parallax behavior unchanged.

## 2. Required State

- Replace the hip-hop arrangement with a procedural piano-only waltz.
- Use a 3/4 meter at 165 BPM.
- Alternate an opening theme lasting approximately 20 seconds with a second, higher-register theme lasting approximately 16 seconds.
- Use a real, recorded grand-piano timbre in the browser, repitched from a small sample set without physical modeling.
- Use a note-for-note transcription of the first 33 measures of the supplied score for both hands, including the written right-hand 8va shift from measure 19 onward. Loop these 33 measures; no music beyond measure 33 is represented.
- Keep first trusted pointer/touch activation, the fixed 80 percent master gain, and the existing mobile retry behavior.
- Preserve the artwork, depth map, glass drawing, parallax renderer, and absence of visible audio controls.

## 3. Acceptance Criteria

- [x] AC-01: The audio engine uses 165 BPM and three quarter-note beats per bar.
- [x] AC-02: The 33-measure loop reproduces all 124 right-hand and 157 left-hand note events, including MIDI pitch, beat offset, duration, and notated velocity.
- [x] AC-03: The playback engine uses the Salamander Grand Piano recordings with nearest-key resampling and note envelopes.
- [x] AC-04: The arrangement contains no hip-hop drum voices.
- [x] AC-05: No audio starts before a trusted gesture; the first gesture starts audio synchronously.
- [x] AC-06: Later page gestures do not restart playback, and master gain remains 0.8.
- [x] AC-07: Existing visual and parallax behavior remains unchanged (browser regression passed).
- [x] AC-08: Full source, audio, mobile gesture, browser, and CI regressions pass.

## 4. Analysis

- At 165 quarter-note BPM, a 3/4 bar lasts approximately 1.091 seconds.
- Eighteen bars last approximately 19.64 seconds; fifteen bars last approximately 16.36 seconds.
- These phrase lengths map the first 18 measures to approximately 19.64 seconds and the next 15 measures to approximately 16.36 seconds.
- The transcription applies the written right-hand octave shift beginning at measure 19 and preserves the left-hand bass, dyads, and sustained opening of the second section.
- The browser uses recorded Salamander piano samples; the approved preview used a General MIDI SoundFont, so timbre is not identical.
- The sample bank is fetched from Tone.js audio hosting, so first-time playback requires connectivity. Download begins before the first gesture; audio activation itself remains gesture-gated.
- If downloads fail, the existing math-generated piano is retained as an audible fallback.

## 5. Proposed Solution

1. Replace the drum-and-bass groove with a three-beat piano arrangement.
2. Encode the first 33 measures as explicit right-hand and left-hand MIDI note events, preserving pitch, beat, duration, and notated velocity.
3. Load 14 Salamander Grand Piano key recordings, repitch nearby notes, and apply gentle attack/release envelopes.
4. Keep the existing first-gesture Web Audio lifecycle and fixed master gain.
5. Extend source checks to compare every scheduled note against the 33-measure transcription, while retaining the browser gesture and visual regressions.

## 6. ToDo

- [x] Create a feature branch from the latest teaser branch.
- [x] Implement the procedural piano voice.
- [x] Replace the audible timbre with 14 recorded piano notes, retaining the original synthesizer as a network fallback.
- [x] Attribute the CC BY 3.0 sample recordings.
- [x] Implement the alternating waltz themes and 3/4 accompaniment.
- [x] Replace the score-inspired first theme and simplified second-theme accompaniment with the complete first-33-measure, both-hands transcription.
- [x] Update source and gesture tests.
- [x] Run the full CI workflow and review its browser evidence.

## 7. Attribution and Verification

- Piano recordings: Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0.
- Sample hosting: https://tonejs.github.io/audio/salamander/
- Original: https://github.com/sfzinstruments/SalamanderGrandPiano
- License: https://creativecommons.org/licenses/by/3.0/
- Changes: selected 14 recorded notes, repitched adjacent notes, used Web Audio gain envelopes and effects.
- Source and browser tests should verify samples are decoded before audible notes start, while mobile Web Audio activation remains synchronous with a trusted gesture.
- The complete first-33-measure transcription is stored in `dist/waltz-score.mjs`; `scripts/check.mjs` compares every scheduled right- and left-hand note against that data.
- The transcription ends at measure 33. The browser loops those 33 measures and does not claim to reproduce the rest of the score.
- Real piano sample timbre can differ from the preview's General MIDI SoundFont.
