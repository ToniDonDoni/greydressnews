"""Bake depth locally, or validate committed static assets without ML in CI."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import platform
import struct
import subprocess
import sys
from urllib.parse import urlsplit

from download_depth_model import MODEL_ID, PACKAGE, REVISION, WEIGHTS_SHA256, sha256

ROOT = Path(__file__).resolve().parents[1]
REPAIR = ('On an Apple Silicon Mac, run python scripts/build.py, then commit '
          'dist/assets/cafe-depth.png and dist/assets/cafe-depth.json with the source image before pushing.')


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, _tag, attrs):
        self.urls.extend(value for key, value in attrs if key in {'src', 'href'} and value)


def validate_site(root=ROOT):
    dist = root / 'dist'
    source = dist / 'assets/cafe.jpg'
    depth = dist / 'assets/cafe-depth.png'
    metadata = dist / 'assets/cafe-depth.json'
    for path in [source, depth, metadata]:
        if not path.is_file():
            raise ValueError(f'Missing {path.relative_to(root)}. {REPAIR}')
    try:
        info = json.loads(metadata.read_text())
    except (ValueError, OSError) as error:
        raise ValueError(f'Invalid depth metadata. {REPAIR}') from error
    expected = {
        'model': MODEL_ID, 'revision': REVISION, 'variant': PACKAGE,
        'source': 'assets/cafe.jpg', 'source_sha256': sha256(source),
        'depth_sha256': sha256(depth), 'weights_sha256': WEIGHTS_SHA256,
        'generator_sha256': sha256(root / 'scripts/make_depth.py'),
    }
    for key, value in expected.items():
        if info.get(key) != value:
            raise ValueError(f'Stale or mismatched depth metadata ({key}). {REPAIR}')
    data = depth.read_bytes()
    if (len(data) < 45 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR'
            or struct.unpack('>II', data[16:24]) != (512, 512)
            or data[-12:] != b'\x00\x00\x00\x00IEND\xaeB`\x82'):
        raise ValueError(f'Invalid or incomplete 512 x 512 depth PNG. {REPAIR}')
    parser = References()
    parser.feed((dist / 'index.html').read_text())
    resources = parser.urls + ['assets/windows.json', 'groove-core.mjs']
    for url in resources:
        parts = urlsplit(url)
        if parts.scheme or parts.netloc or not parts.path:
            continue
        path = (dist / parts.path).resolve()
        if not path.is_relative_to(dist.resolve()) or not path.is_file():
            raise ValueError(f'Missing or invalid static resource: {parts.path}')
    return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true',
                        help='Validate committed map and static files; no model, network or ML dependencies.')
    parser.add_argument('--model', type=Path, help='Reuse an existing verified Apple FP16 package on macOS.')
    args = parser.parse_args()
    if args.check and args.model:
        parser.error('--model is only used when generating depth')
    try:
        if not args.check:
            if platform.system() != 'Darwin':
                raise ValueError('Depth generation requires macOS Core ML. Use --check on GitHub Actions or Linux.')
            command = [sys.executable, str(ROOT / 'scripts/make_depth.py')]
            if args.model:
                command.extend(['--model', str(args.model)])
            subprocess.run(command, cwd=ROOT, check=True)
        validate_site()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'Build failed: {error}\n')
    print('Static site ready: dist/ (committed depth verified; no model needed at runtime).')


if __name__ == '__main__':
    main()
