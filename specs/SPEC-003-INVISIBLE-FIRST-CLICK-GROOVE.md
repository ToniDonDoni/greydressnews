# SPEC-003: Invisible First-Click Groove at 80 Percent Volume

## 1. Problem and Current State

- The artwork overlays a prominent music button and a volume slider on the news image.
- The controls obscure the composition, even though the groove already starts on the first page click.
- The previous implementation restores a saved volume level, which may differ from the requested default.
- This change supersedes the visible-control requirements in SPEC-002.

## 2. Required State

- Remove the entire on-screen music interface, including its icon, button, label, slider, and styling.
- Keep the existing procedural VibeCat groove and its default 74 BPM.
- Do not start sound before a user gesture.
- Start playback on the first trusted click or tap on the page.
- Use a fixed 80 percent output gain, independent of previously stored volume preferences.
- Subsequent page clicks must not toggle or restart playback.
- Preserve the image, depth texture, and interactive parallax unchanged.

## 3. Acceptance Criteria

- [x] AC-01: The HTML and CSS contain no visible music controls.
- [x] AC-02: The music module is loaded, but no AudioContext or audio source starts before interaction.
- [x] AC-03: The first trusted page click starts non-silent audio at the original tempo.
- [x] AC-04: Master gain targets exactly 0.8, without reading persisted volume settings.
- [x] AC-05: Later page clicks do not restart playback or change output gain.
- [x] AC-06: Existing parallax and visual resources are unaffected.
- [x] AC-07: GitHub Actions source, groove, and browser tests pass.

## 4. Analysis

- Browser autoplay policy requires the first real user gesture to unlock Web Audio.
- The synthesizer and browser scheduler do not require on-screen DOM elements.
- The old music module references the removed controls and a persisted volume setting; both dependencies must go.
- Web Audio tests should assert that real synthesized buffers contain audio data, not merely that a button changed state.

## 5. Proposed Solution

1. Delete the soundbar markup and its dedicated CSS.
2. Make the audio module self-contained and attach its one-time startup to trusted page clicks.
3. Initialize the master gain to a fixed 0.8 on playback start.
4. Replace visible-control tests with hidden-interface, trusted-click, audio-buffer, and gain-level checks.
5. Preserve the original synthesizer, tempo, parallax renderer, and README.

## 6. ToDo

- [x] Remove music button, text, and volume slider.
- [x] Remove obsolete CSS.
- [x] Set startup volume to 80 percent and avoid previous user volume preferences.
- [x] Preserve first-click playback and non-retriggering subsequent clicks.
- [x] Update unit and browser regression tests.
- [x] Verify CI success and record evidence.

## 7. Verification Evidence

- [GitHub Actions run #42513023318](https://github.com/ToniDonDoni/greydressnews/actions/runs/42513023318) passed all checks, including real Chromium audio playback with no on-screen controls.
- Three non-silent audio buffer sources were scheduled, the AudioContext entered the running state, and the master gain target was exactly 0.8.
- The test confirmed silence before interaction, first-click playback, and no restart on subsequent clicks.
