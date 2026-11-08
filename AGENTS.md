# Project guidance

Read [CONTRIBUTING.md](CONTRIBUTING.md) for language and naming conventions.

## Working on the depth artwork

Start with [scripts/README.md](scripts/README.md) for the current workflow. Keep editable region coordinates in `test/depth_regions.json`; the schema is documented in [test/README.md](test/README.md). Render an overlay on a new photograph and review alignment before applying those depths to a neural map. Keep mask data and reproducible tests in `test/`. Write generated previews and model caches under ignored `output/`. Run the checks listed in [scripts/README.md](scripts/README.md) before committing changes.
