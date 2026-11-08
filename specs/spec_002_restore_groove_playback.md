# SPEC-002: Restore First-Click Groove Playback

## 1. Problem and Current State

- The reference-photo page preserved `dist/music.mjs` and `dist/groove-core.mjs` but removed their script import and their DOM controls.
- Consequently the original VibeCat procedural music did not play.
- The interactive Z-map and artistic composition are already working and must be preserved.

## 2. Required State

- Keep the same procedural instrumental hip-hop synthesizer and default 74 BPM.
- Start playback on the first trusted user click anywhere on the page, in compliance with browser autoplay policy.
- Later clicks on the artwork must not toggle playback.
- Allow explicit pause/resume through a compact button and show a volume slider while playing.
- Do not add a tempo slider or alter the source image, depth texture, or parallax motion.
- Keep the exhibition-style README short; keep implementation details here.

## 3. Acceptance Criteria

- [ ] AC-01: The page imports `music.mjs` and renders a usable music button and volume slider. Evidence: HTML and browser UI assertions.
- [ ] AC-02: No sound starts before interaction; the first trusted page click starts playback. Evidence: browser and mocked AudioContext tests.
- [ ] AC-03: A subsequent page click does not pause the music. Evidence: browser and mocked AudioContext tests.
- [ ] AC-04: Music button clicks pause and resume playback, including after the one-time click shortcut is consumed. Evidence: browser and mocked AudioContext tests.
- [ ] AC-05: The volume slider appears when playing and can adjust the volume; no tempo UI appears. Evidence: browser assertions and markup checks.
- [ ] AC-06: No depth map, art composition, or parallax regression. Evidence: existing depth and Playwright validation.
- [ ] AC-07: GitHub Actions build and browser tests pass. Evidence: linked CI run.

## 4. Analysis

- `dist/music.mjs` was originally written to require `music`, `musicLabel`, `volume`, `soundbar`, `bpm` and `bpmValue` elements.
- The musical synthesis, scheduler, first-click behavior, and per-user volume persistence are still implemented.
- On the reference-photo page, tempo elements are intentionally absent; the module must accept optional tempo controls.
- The script should load once as an ES module, so the first click is handled once rather than toggling twice through event bubbling.

## 5. Proposed Solution

1. Add the original groove module import and compact accessible controls to the page.
2. Position controls over the picture without obstructing the foreground glass or changing the underlying artwork.
3. Allow optional tempo elements in the music module; retain the original default tempo and synthesis.
4. Update static checks to require the audio module and prohibit unintended tempo controls.
5. Extend the browser regression to confirm trusted first-click activation, subsequent-page-click behavior, explicit pause/resume, and visible volume controls.
6. Keep evidence and technical documentation in `specs/` and CI, not in the gallery-label README.

## 6. ToDo

- [x] Find and compare the preserved music module with the original VibeCat implementation.
- [x] Restore the module import and accessible groove controls.
- [x] Restore compact control styling.
- [x] Make tempo controls optional without changing the default BPM.
- [x] Update static site checks.
- [ ] Extend browser playback regression tests.
- [ ] Verify all existing page and parallax tests pass.
- [ ] Record verification evidence.
