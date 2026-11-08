"""Bake relative inverse depth for the reference image using the project's Core ML model."""
import hashlib
import json
from pathlib import Path
import platform
import time

import coremltools as ct
import numpy as np
import PIL
from PIL import Image

from download_depth_model import MODEL_ID, REVISION, ensure_model, model_errors, sha256
from manual_depth_planes import apply_manual_depth_planes, provenance

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'references/ElGrayPimenovLeiterWindow2.png'
OUTPUT = ROOT / 'dist/assets/ElGrayPimenovLeiterWindow2-depth.png'
MODEL = ROOT / 'output/models/DepthAnythingV2SmallF16.mlpackage'


def main():
    if platform.system() != 'Darwin':
        raise SystemExit('Depth inference requires macOS Core ML.')
    model_path = MODEL if MODEL.exists() else ensure_model()
    problems = model_errors(model_path)
    if problems:
        raise SystemExit('; '.join(problems))

    source = Image.open(SOURCE).convert('RGB')
    model = ct.models.MLModel(str(model_path), compute_units=ct.ComputeUnit.ALL)
    feature = model.get_spec().description.input[0]
    width, height = feature.type.imageType.width, feature.type.imageType.height
    if not width or not height:
        raise ValueError('Expected a fixed-size RGB image-input Core ML model')

    scale = min(width / source.width, height / source.height)
    size = (round(source.width * scale), round(source.height * scale))
    left, top = (width - size[0]) // 2, (height - size[1]) // 2
    image = Image.new('RGB', (width, height))
    image.paste(source.resize(size, Image.Resampling.LANCZOS), (left, top))
    started = time.perf_counter()
    result = model.predict({feature.name: image})
    elapsed_ms = (time.perf_counter() - started) * 1000

    spec = model.get_spec()
    raw = np.asarray(result[spec.description.output[0].name], dtype=np.float32).squeeze()
    if raw.ndim != 2 or not np.isfinite(raw).all():
        raise ValueError('Expected a finite 2D depth map')
    sx, sy = raw.shape[1] / width, raw.shape[0] / height
    crop = Image.fromarray(raw).crop((round(left * sx), round(top * sy),
                                     round((left + size[0]) * sx), round((top + size[1]) * sy)))
    target_width = 1024
    target_height = round(target_width * source.height / source.width)
    aligned = np.asarray(crop.resize((target_width, target_height), Image.Resampling.BICUBIC))
    low, high = np.percentile(aligned, [1, 99])
    if high <= low:
        raise ValueError('The model returned constant depth')
    normalized = np.clip((aligned - low) / (high - low), 0, 1)
    predicted = Image.fromarray(np.round(normalized * 255).astype(np.uint8))
    corrected, _, _, _ = apply_manual_depth_planes(source, predicted)
    corrected.save(OUTPUT, optimize=True)

    metadata = {
        'model': MODEL_ID,
        'revision': REVISION,
        'source': 'references/ElGrayPimenovLeiterWindow2.png',
        'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'depth_sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
        'generator_sha256': sha256(Path(__file__)),
        'source_size': [source.width, source.height],
        'depth_size': [target_width, target_height],
        'preprocessing': 'aspect-preserving letterbox; remove padding from prediction',
        'semantics': 'relative inverse depth; white is near; not meters',
        'normalization_percentiles': [1, 99],
        'manual_depth_planes': provenance(),
        'prediction_ms': round(elapsed_ms, 1),
        'versions': {'coremltools': ct.__version__, 'numpy': np.__version__, 'pillow': PIL.__version__},
    }
    metadata_path = OUTPUT.with_suffix('.json')
    metadata_path.write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
