# Project guidance

Read [CONTRIBUTING.md](CONTRIBUTING.md) for language and naming conventions. Use [scripts/README.md](scripts/README.md) as the entry point for generation, review, validation, local serving, and publication workflows.

The editable region map and its detailed schema live in [test/README.md](test/README.md). Review a new photograph with `test/render_depth_regions.py` before applying its regions with `scripts/apply_depth_regions.py`. Keep mask data and reproducible test sources in `test/`, and keep generated output under ignored `output/`.
