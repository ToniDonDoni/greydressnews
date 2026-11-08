"""Save an uncorrected Depth Anything V2 prediction for a reference-like photo."""

import argparse
import hashlib
import json
from pathlib import Path
import platform
import time

import numpy as np
import PIL
from PIL import Image

from download_depth_model import MODEL_ID, REVISION, ensure_model, model_errors


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = ROOT / "output/models/DepthAnythingV2SmallF16.mlpackage"
COMMITTED_DEPTH = ROOT / "dist/assets/ElGrayPimenovLeiterWindow2-depth.png"


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def predict(source_path, output_path, model_path=None):
    if not source_path.is_file():
        raise SystemExit(
            f"Source photo not found: {source_path}\n"
            "Pass an existing image, for example --source references/ElGrayPimenovLeiterWindow2.png"
        )
    if platform.system() != "Darwin":
        raise SystemExit("Core ML depth inference requires macOS")
    if output_path.resolve() in (source_path.resolve(), COMMITTED_DEPTH.resolve()):
        raise ValueError("Raw output must not overwrite the source photo or committed depth map")
    import coremltools as ct

    model_path = model_path or (DEFAULT_MODEL if DEFAULT_MODEL.exists() else ensure_model())
    problems = model_errors(model_path)
    if problems:
        raise ValueError("; ".join(problems))
    with Image.open(source_path) as photo:
        source = photo.convert("RGB")
    model = ct.models.MLModel(str(model_path), compute_units=ct.ComputeUnit.ALL)
    feature = model.get_spec().description.input[0]
    width, height = feature.type.imageType.width, feature.type.imageType.height
    if not width or not height:
        raise ValueError("Expected a fixed-size RGB image-input Core ML model")

    scale = min(width / source.width, height / source.height)
    size = (round(source.width * scale), round(source.height * scale))
    left, top = (width - size[0]) // 2, (height - size[1]) // 2
    model_image = Image.new("RGB", (width, height))
    model_image.paste(source.resize(size, Image.Resampling.LANCZOS), (left, top))
    started = time.perf_counter()
    result = model.predict({feature.name: model_image})
    elapsed_ms = (time.perf_counter() - started) * 1000

    raw = np.asarray(result[model.get_spec().description.output[0].name], dtype=np.float32).squeeze()
    if raw.ndim != 2 or not np.isfinite(raw).all():
        raise ValueError("Expected a finite 2D depth map")
    sx, sy = raw.shape[1] / width, raw.shape[0] / height
    crop = Image.fromarray(raw).crop((
        round(left * sx), round(top * sy),
        round((left + size[0]) * sx), round((top + size[1]) * sy),
    ))
    target_width = 1024
    target_height = round(target_width * source.height / source.width)
    aligned = np.asarray(crop.resize((target_width, target_height), Image.Resampling.BICUBIC))
    low, high = np.percentile(aligned, [1, 99])
    if high <= low:
        raise ValueError("The model returned constant depth")
    normalized = np.clip((aligned - low) / (high - low), 0, 1)
    predicted = Image.fromarray(np.rint(normalized * 255).astype(np.uint8))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    predicted.save(output_path, optimize=True)

    report = {
        "model": MODEL_ID,
        "revision": REVISION,
        "source_name": source_path.name,
        "source_sha256": sha256(source_path),
        "raw_depth_sha256": sha256(output_path),
        "source_size": list(source.size),
        "depth_size": list(predicted.size),
        "normalization_percentiles": [1, 99],
        "semantics": "relative inverse depth; white is near; not meters",
        "prediction_ms": round(elapsed_ms, 1),
        "versions": {"coremltools": ct.__version__, "numpy": np.__version__, "pillow": PIL.__version__},
    }
    report_path = output_path.with_suffix(".json")
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="ascii")
    return output_path, report_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="Reference-like photo to infer")
    parser.add_argument("--output", required=True, type=Path, help="Uncorrected grayscale depth PNG")
    parser.add_argument("--model", type=Path, help="Verified Core ML model package; defaults to the project cache")
    args = parser.parse_args()
    output_path, report_path = predict(args.source, args.output, args.model)
    print(f"Wrote {output_path}")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
