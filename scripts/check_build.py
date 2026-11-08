"""Check missing/stale depth failures and offline model-cache reuse with stdlib."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import build
import download_depth_model as models

ROOT = Path(__file__).resolve().parents[1]


class StaticBuildTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        shutil.copytree(ROOT / 'dist', self.root / 'dist')
        (self.root / 'scripts').mkdir()
        shutil.copyfile(ROOT / 'scripts/make_depth.py', self.root / 'scripts/make_depth.py')
        self.metadata = self.root / 'dist/assets/cafe-depth.json'
        self.info = json.loads(self.metadata.read_text())
        self.info['generator_sha256'] = models.sha256(self.root / 'scripts/make_depth.py')
        self.save_metadata()

    def save_metadata(self):
        self.metadata.write_text(json.dumps(self.info))

    def test_committed_static_site_needs_no_model(self):
        build.validate_site(self.root)
        self.assertFalse((self.root / 'output/models').exists())

    def test_missing_map_explains_local_build_and_commit(self):
        (self.root / 'dist/assets/cafe-depth.png').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing.*python scripts/build.py.*commit'):
            build.validate_site(self.root)

    def test_changed_source_rejects_old_depth(self):
        with (self.root / 'dist/assets/cafe.jpg').open('ab') as stream:
            stream.write(b'changed')
        with self.assertRaisesRegex(ValueError, 'source_sha256'):
            build.validate_site(self.root)

    def test_changed_depth_rejects_old_metadata(self):
        with (self.root / 'dist/assets/cafe-depth.png').open('ab') as stream:
            stream.write(b'changed')
        with self.assertRaisesRegex(ValueError, 'depth_sha256'):
            build.validate_site(self.root)

    def test_changed_generator_requires_rebaking(self):
        with (self.root / 'scripts/make_depth.py').open('a') as stream:
            stream.write('\n# Changed generator\n')
        with self.assertRaisesRegex(ValueError, 'generator_sha256'):
            build.validate_site(self.root)

    def test_wrong_model_provenance_is_rejected(self):
        self.info['revision'] = 'wrong-revision'
        self.save_metadata()
        with self.assertRaisesRegex(ValueError, 'revision'):
            build.validate_site(self.root)

    def test_incomplete_png_is_rejected_even_with_matching_hash(self):
        depth = self.root / 'dist/assets/cafe-depth.png'
        depth.write_bytes(depth.read_bytes()[:-12])
        self.info['depth_sha256'] = models.sha256(depth)
        self.save_metadata()
        with self.assertRaisesRegex(ValueError, 'Invalid or incomplete'):
            build.validate_site(self.root)

    def test_missing_page_resource_is_rejected(self):
        with (self.root / 'dist/index.html').open('a') as stream:
            stream.write('<script src="missing.js"></script>')
        with self.assertRaisesRegex(ValueError, 'missing.js'):
            build.validate_site(self.root)


class ModelCacheTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.model = Path(self.directory.name) / models.PACKAGE
        self.files = {'Manifest.json': b'manifest', 'Data/model': b'graph', 'Data/weights': b'weights'}
        hashes = {name: hashlib.sha256(data).hexdigest() for name, data in self.files.items()}
        patcher = patch.dict(models.FILES_SHA256, hashes, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def populate(self, *_args, **_kwargs):
        for name, data in self.files.items():
            path = self.model / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

    def test_verified_cache_is_reused_without_network(self):
        self.populate()
        with patch.object(models, 'download_package', side_effect=AssertionError('Network must not run')):
            self.assertEqual(models.ensure_model(self.model), self.model)

    def test_corrupt_cache_is_repaired_and_verified(self):
        self.populate()
        (self.model / 'Data/weights').write_bytes(b'corrupt')
        with patch.object(models, 'download_package', side_effect=self.populate) as download:
            models.ensure_model(self.model)
            download.assert_called_once_with(self.model, repair=True)
        self.assertEqual(models.model_errors(self.model), [])

    def test_incomplete_download_fails_instead_of_using_bad_model(self):
        with patch.object(models, 'download_package'):
            with self.assertRaisesRegex(RuntimeError, 'failed verification'):
                models.ensure_model(self.model)


if __name__ == '__main__':
    unittest.main()
