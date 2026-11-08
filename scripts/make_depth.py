"""Bake the cafe's relative depth once using Apple's Core ML Small FP16 model."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import time

from download_depth_model import MODEL_ID, PACKAGE, REVISION, ensure_model, model_errors, sha256

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', type=Path, help='Reuse an existing package; otherwise download to output/models/.')
    parser.add_argument('--runs', type=int, default=6)
    args = parser.parse_args()
    if args.runs < 1:
        parser.error('--runs must be positive')
    if platform.system() != 'Darwin':
        parser.error('Depth generation requires macOS Core ML; use scripts/build.py --check in CI.')
    try:
        import coremltools as ct
        import numpy as np
        import PIL
        from PIL import Image
    except ImportError:
        parser.error('Install scripts/depth-requirements.txt in a local Python 3.11 environment first.')
    model_path = args.model or ensure_model()
    problems = model_errors(model_path)
    if problems:
        parser.error('; '.join(problems))
    image_path = ROOT / 'dist/assets/cafe.jpg'
    source = Image.open(image_path).convert('RGB')
    started = time.perf_counter()
    model = ct.models.MLModel(str(model_path), compute_units=ct.ComputeUnit.ALL)
    load_seconds = time.perf_counter() - started
    spec = model.get_spec()
    feature = spec.description.input[0]
    width, height = feature.type.imageType.width, feature.type.imageType.height
    if not width or not height:
        raise ValueError('Expected a fixed-size RGB image-input Core ML model')
    scale = min(width / source.width, height / source.height)
    size = (round(source.width * scale), round(source.height * scale))
    left, top = (width - size[0]) // 2, (height - size[1]) // 2
    image = Image.new('RGB', (width, height))
    image.paste(source.resize(size, Image.Resampling.LANCZOS), (left, top))
    durations = []
    for _ in range(args.runs):
        started = time.perf_counter()
        result = model.predict({feature.name: image})
        durations.append((time.perf_counter() - started) * 1000)
    raw = np.asarray(result[spec.description.output[0].name], dtype=np.float32).squeeze()
    if raw.ndim != 2 or not np.isfinite(raw).all():
        raise ValueError('Expected a finite 2D depth map')
    sx, sy = raw.shape[1] / width, raw.shape[0] / height
    crop = Image.fromarray(raw).crop((round(left * sx), round(top * sy),
                                    round((left + size[0]) * sx), round((top + size[1]) * sy)))
    # This static map can be normalized once, without frame-to-frame scale changes.
    aligned = np.asarray(crop.resize((512, 512), Image.Resampling.BICUBIC))
    low, high = np.percentile(aligned, [1, 99])
    if high <= low:
        raise ValueError('The model returned constant depth')
    normalized = np.clip((aligned - low) / (high - low), 0, 1)
    output = ROOT / 'dist/assets/cafe-depth.png'
    Image.fromarray(np.round(normalized * 255).astype(np.uint8)).save(output)
    provenance = {
        'model': MODEL_ID,
        'revision': REVISION,
        'variant': PACKAGE,
        'license': 'Apache-2.0',
        'source': 'assets/cafe.jpg',
        'source_sha256': hashlib.sha256(image_path.read_bytes()).hexdigest(),
        'depth_sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'generator_sha256': sha256(Path(__file__)),
        'input_size': [width, height], 'depth_size': [512, 512],
        'preprocessing': 'aspect-preserving letterbox; remove padding from prediction',
        'semantics': 'relative inverse depth; white is near; not meters',
        'normalization_percentiles': [1, 99],
        'versions': {'coremltools': ct.__version__, 'numpy': np.__version__, 'pillow': PIL.__version__},
    }
    weights = model_path / 'Data/com.apple.CoreML/weights/weight.bin'
    if weights.is_file():
        provenance['weights_sha256'] = hashlib.sha256(weights.read_bytes()).hexdigest()
    (ROOT / 'dist/assets/cafe-depth.json').write_text(json.dumps(provenance, indent=2) + '\n')
    report = {'load_seconds': load_seconds, 'prediction_ms': durations,
              'warm_median_ms': float(np.median(durations[1:] or durations)), **provenance}
    report_dir = ROOT / 'output/depth'
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
