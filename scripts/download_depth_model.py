"""Download and verify the official Core ML model in the ignored local cache."""
import argparse
import hashlib
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_ID = 'apple/coreml-depth-anything-v2-small'
REVISION = 'cfef6f6f2a70783dedc0bfae40cecbc2052285d3'
PACKAGE = 'DepthAnythingV2SmallF16.mlpackage'
DEFAULT_MODEL = ROOT / 'output/models' / PACKAGE
WEIGHTS_SHA256 = 'fa60d9b6a155734f59029ebb882fd54e549bfaee3539c1a9cbd2cbbab64a0fed'
FILES_SHA256 = {
    'Manifest.json': '2883ae290c48fe916dc5ececac03a7d847fa277165a49ef5652fa1d2b9cb55f7',
    'Data/com.apple.CoreML/model.mlmodel': '44ac97a3efcfd52113183fb2862ff59cd0368e9ec2e30a90a54980dd11407042',
    'Data/com.apple.CoreML/weights/weight.bin': WEIGHTS_SHA256,
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def model_errors(model):
    errors = []
    for name, expected in FILES_SHA256.items():
        path = model / name
        if not path.is_file():
            errors.append(f'Missing model file: {name}')
        elif sha256(path) != expected:
            errors.append(f'Model checksum mismatch: {name}')
    return errors


def download_package(model, repair=False):
    # Keep both package files and Hub cache under ignored output/ by default.
    cache = ROOT / 'output/huggingface'
    os.environ.setdefault('HF_HOME', str(cache))
    os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
    try:
        from huggingface_hub import snapshot_download
    except ImportError as error:
        raise RuntimeError('Install scripts/depth-requirements.txt before downloading the model.') from error
    snapshot_download(repo_id=MODEL_ID, revision=REVISION,
                      allow_patterns=[PACKAGE + '/*', 'README.md'],
                      local_dir=str(model.parent), cache_dir=str(cache / 'hub'),
                      force_download=repair, token=False)


def ensure_model(model=DEFAULT_MODEL):
    model = Path(model)
    problems = model_errors(model)
    if not problems:
        print('Using verified cached Core ML model.', flush=True)
        return model
    print('Downloading pinned Apple Small FP16 model (about 50 MB).', flush=True)
    download_package(model, repair=model.exists())
    problems = model_errors(model)
    if problems:
        raise RuntimeError('Downloaded model failed verification: ' + '; '.join(problems))
    return model


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        model = ensure_model()
    except Exception as error:
        parser.exit(1, f'Model preparation failed: {error}\n')
    print(model.relative_to(ROOT))


if __name__ == '__main__':
    main()
