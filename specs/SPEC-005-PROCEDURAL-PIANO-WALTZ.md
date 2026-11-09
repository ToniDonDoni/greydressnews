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
- Use a warm, modern piano timbre generated in the browser without recorded samples or network audio.
- Treat the note sequence as a score-inspired adaptation of the opening motifs, not a full note-for-note transcription of the complete score.
- Keep first trusted pointer/touch activation, the fixed 80 percent master gain, and the existing mobile retry behavior.
- Preserve the artwork, depth map, glass drawing, parallax renderer, and absence of visible audio controls.

## 3. Acceptance Criteria

- [x] AC-01: The audio engine uses 165 BPM and three quarter-note beats per bar.
- [x] AC-02: The arrangement alternates an 18-bar opening theme and a 15-bar upper-register theme.
- [x] AC-03: The generated instrument uses piano-like partials, inharmonicity, hammer attack, string beating, and an algorithmic room tail.
- [x] AC-04: The arrangement contains no hip-hop drum voices.
- [x] AC-05: No audio starts before a trusted gesture; the first gesture starts audio synchronously.
- [x] AC-06: Later page gestures do not restart playback, and master gain remains 0.8.
- [x] AC-07: Existing visual and parallax behavior remains unchanged (browser regression passed).
- [x] AC-08: Full source, audio, mobile gesture, browser, and CI regressions pass.

## 4. Analysis

- At 165 quarter-note BPM, a 3/4 bar lasts approximately 1.091 seconds.
- Eighteen bars last approximately 19.64 seconds; fifteen bars last approximately 16.36 seconds.
- These phrase lengths map the requested first 20-second and 20-to-36-second sections to two alternating musical blocks.
- A lightweight additive/modal approximation can provide a piano-like attack and decay while keeping the site sample-free and dependency-free.

## 5. Proposed Solution

1. Replace the drum-and-bass groove with a three-beat piano arrangement.
2. Encode the two opening score motifs as separate 18-bar and 15-bar sections, then loop them in alternation.
3. Synthesize piano notes with inharmonic partials, slightly detuned strings, a hammer transient, pitch-dependent damping, and a small algorithmic room.
4. Keep the existing first-gesture Web Audio lifecycle and fixed master gain.
5. Extend source and UI checks to validate meter, tempo, section lengths, non-silent output, and mobile activation.

## 6. ToDo

- [x] Create a feature branch from the latest teaser branch.
- [x] Implement the procedural piano voice.
- [x] Implement the alternating waltz themes and 3/4 accompaniment.
- [x] Update source and gesture tests.
- [x] Run the full CI workflow and review its browser evidence.
