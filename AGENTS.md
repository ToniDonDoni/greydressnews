# Project guidance

## Depth-region review

The editable depth-region draft, overlay renderer, correction workflow, and verification instructions live in `Test/README.md`. When a new reference photograph arrives, render `Test/depth_regions.json` over it with `Test/render_depth_regions.py` and review the alignment. Generate a raw neural depth PNG with `scripts/generate_raw_reference_depth.py`, then apply the same JSON with `scripts/apply_depth_regions.py`. Review the result before changing the production depth map or parallax code. Keep the mask data and reproducible test sources in `Test/`.
