"""Write dist/build.json for the deployed page build stamp."""

import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist" / "build.json"


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: write_build_info.py <40-character-git-sha>")
    sha = sys.argv[1].strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise SystemExit(f"not a full git SHA: {sha!r}")
    repository = os.environ.get("GITHUB_REPOSITORY", "ToniDonDoni/greydressnews")
    ref = os.environ.get("GITHUB_REF_NAME", "")
    info = {
        "sha": sha,
        "short": sha[:7],
        "url": f"https://github.com/{repository}/commit/{sha}",
        "repository": repository,
        "ref": ref,
    }
    OUT.write_text(json.dumps(info, ensure_ascii=True, indent=2) + "\n", encoding="ascii")
    print(f"Wrote {OUT.relative_to(ROOT)} for {sha[:7]}")


if __name__ == "__main__":
    main()
