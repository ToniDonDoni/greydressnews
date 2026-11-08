# Project guidance

## Depth-region review

The editable depth-region draft, overlay renderer, and verification instructions live in `Test/README.md`. When a new reference photograph arrives, render `Test/depth_regions.json` over it with `Test/render_depth_regions.py` and review the alignment before changing the production depth map or parallax code. Keep the mask data and reproducible test sources in `Test/`.
