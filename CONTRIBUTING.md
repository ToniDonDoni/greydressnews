# Contributing

## Language

Write source code, identifiers, comments, documentation, Markdown content, and commit messages in English. Preserve text that is part of a supplied reference image. Do not add machine-specific paths, credentials, or personal identifiers to tracked files.

## Names

- Name Markdown files with uppercase English letters and digits, separating words with hyphens, and keep the `.md` extension lowercase. Examples: `README.md`, `CONTRIBUTING.md`, `SPEC-001-DEPTH-REGIONS.md`.
- Name project directories with lowercase English letters and digits, separating words with underscores. Examples: `test/`, `depth_review/`, `site_preview/`.
- Keep required platform directories such as `.github/` under their platform-defined names.
- Use project-root-relative paths in tracked code and documentation.

## Working on the depth artwork

Start with `scripts/README.md` for the current workflow. Keep editable region coordinates in `test/depth_regions.json`, render an overlay on a new photograph, and review alignment before applying those depths to a neural map. Write generated previews and model caches under ignored `output/`. Run the checks listed in `scripts/README.md` before committing changes.
