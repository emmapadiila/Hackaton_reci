import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageOps


def prepare(source, destination):
    annotations = json.loads((source / "data/annotations.json").read_text(encoding="utf-8"))
    boxes = {}
    for item in annotations["annotations"]:
        boxes.setdefault(item["image_id"], []).append(item["bbox"])
    splits = {"train": [], "val": [], "test": []}
    sources = []
    for photo in annotations["images"]:
        original = source / "data" / photo["file_name"]
        thumbnail = source / "miniaturas" / f'{photo["id"]}.jpg'
        path = original if original.is_file() else thumbnail
        if path.is_file() and photo["id"] in boxes:
            sources.append((photo, path, photo["file_name"].split("/")[0]))
    batches = sorted({batch for _, _, batch in sources},
                     key=lambda batch: hashlib.sha256(batch.encode()).digest())
    if len(batches) < 3:
        raise ValueError("Se necesitan al menos tres lotes anotados de TACO")
    holdout = max(1, round(len(batches) * 0.15))
    test_batches = set(batches[:holdout])
    val_batches = set(batches[holdout:2 * holdout])
    seen = set()
    for photo, path, batch in sources:
        identifier = photo["id"]
        width, height = photo["width"], photo["height"]
        labels = []
        for x, y, w, h in boxes.get(identifier, []):
            x1, y1, x2, y2 = max(0, x), max(0, y), min(width, x + w), min(height, y + h)
            if x2 > x1 and y2 > y1:
                values = ((x1 + x2) / (2 * width), (y1 + y2) / (2 * height),
                          (x2 - x1) / width, (y2 - y1) / height)
                labels.append("0 " + " ".join(f"{value:.8f}" for value in values))
        if not labels:
            continue
        with Image.open(path) as file:
            rgb = ImageOps.exif_transpose(file).convert("RGB")
            if abs((rgb.width / rgb.height) / (width / height) - 1) > 0.02:
                continue
            signature = hashlib.sha256(rgb.resize((64, 64)).tobytes()).digest()
            if signature in seen:
                continue
            seen.add(signature)
            # Las fotos de un lote permanecen juntas.
            split = "test" if batch in test_batches else "val" if batch in val_batches else "train"
            image_path = destination / "images" / split / f"{identifier}.jpg"
            label_path = destination / "labels" / split / f"{identifier}.txt"
            image_path.parent.mkdir(parents=True, exist_ok=True)
            label_path.parent.mkdir(parents=True, exist_ok=True)
            rgb.thumbnail((1280, 1280))
            rgb.save(image_path, quality=92)
            label_path.write_text("\n".join(labels) + "\n", encoding="utf-8")
        splits[split].append(image_path.as_posix())
    counts = {key: len(paths) for key, paths in splits.items()}
    print("Fotos anotadas de TACO:", counts, flush=True)
    if counts["train"] < 50 or min(counts["val"], counts["test"]) < 10:
        raise ValueError("Faltan imágenes TACO para entrenar y evaluar en lotes separados")
    for key, paths in splits.items():
        (destination / f"{key}.txt").write_text("\n".join(paths) + "\n", encoding="utf-8")
    config = destination / "taco.yaml"
    config.write_text(json.dumps({"path": destination.as_posix(), "names": ["residuo"],
                                  **{key: f"{key}.txt" for key in splits}}), encoding="utf-8")
    return config


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("taco-dataset"))
    parser.add_argument("--dataset", type=Path, default=Path("data/yolo"))
    parser.add_argument("--output", type=Path, default=Path("models"))
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--image-size", type=int, default=416)
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    config = prepare(args.source, args.dataset.resolve())
    if not args.prepare_only:
        from ultralytics import YOLO

        output = args.output.resolve()
        output.mkdir(parents=True, exist_ok=True)
        trained = YOLO(str(output / "yolov8n.pt"))
        trained.train(data=str(config), epochs=args.epochs, imgsz=args.image_size, workers=0,
                      project=str(output), name="yolo", plots=True, seed=42)
        best = Path(trained.trainer.best)
        metrics = YOLO(str(best)).val(data=str(config), split="test", imgsz=args.image_size,
                                     workers=0, project=str(output), name="yolo_prueba")
        (output / "yolo_metricas.json").write_text(json.dumps(metrics.results_dict, indent=2), encoding="utf-8")
        final = output / "ecoconecta_yolo.pt"
        shutil.copyfile(best, final.with_suffix(".part"))
        final.with_suffix(".part").replace(final)
