import hashlib
import json
import random
import shutil
from collections import Counter
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

from PIL import Image, ImageOps

LABELS = ("organico", "aprovechable")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def extract_kaggle(archive, destination):
    # Kaggle publica el mismo árbol DATASET en dos prefijos.
    folders = set()
    with ZipFile(archive) as source:
        for member in source.infolist():
            parts = PurePosixPath(member.filename).parts
            if (len(parts) != 4 or parts[0] != "DATASET" or parts[1] not in ("TRAIN", "TEST")
                    or parts[2] not in ("O", "R") or Path(parts[3]).suffix.lower() not in IMAGE_EXTENSIONS
                    or any(char in parts[3] for char in "\\:")):
                continue
            target = Path(destination).joinpath(*parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open(member) as incoming, target.open("wb") as outgoing:
                shutil.copyfileobj(incoming, outgoing)
            folders.add(parts[1:3])
    if folders != {(split, label) for split in ("TRAIN", "TEST") for label in ("O", "R")}:
        raise ValueError("El ZIP no contiene las cuatro carpetas del dataset original")


def prepare(root, output, limit=None):
    root = Path(root).resolve()
    source = root / "DATASET" if (root / "DATASET").is_dir() else root
    if not (source / "TRAIN").is_dir():
        candidates = [path.parent for path in root.rglob("TRAIN") if (path.parent / "TEST").is_dir()]
        if len(candidates) != 1:
            raise ValueError("Se esperaba una carpeta con TRAIN/O, TRAIN/R, TEST/O y TEST/R")
        source = candidates[0]
    images = {}
    invalid = duplicates = 0
    # Prioriza TEST para conservar la partición original cuando hay copias cruzadas.
    for split in ("TEST", "TRAIN"):
        for label, folder in enumerate(("O", "R")):
            directory = source / split / folder
            if not directory.is_dir():
                raise ValueError(f"Falta {directory}")
            for path in sorted(directory.iterdir()):
                if path.suffix.lower() not in IMAGE_EXTENSIONS:
                    continue
                try:
                    with Image.open(path) as photo:
                        rgb = ImageOps.exif_transpose(photo).convert("RGB")
                        rgb.load()
                        normalized = rgb.resize((64, 64), Image.Resampling.BILINEAR)
                        key = hashlib.sha256(normalized.tobytes()).hexdigest()
                except (OSError, ValueError, Image.DecompressionBombError):
                    invalid += 1
                    continue
                existing = images.get(key)
                if existing:
                    duplicates += 1
                    existing["conflict"] |= existing["label"] != label
                else:
                    images[key] = {"path": path.relative_to(root).as_posix(), "label": label,
                                   "original": split, "conflict": False}
    rng = random.Random(42)
    partitions = {"train": [], "validation": [], "test": []}
    for label in range(len(LABELS)):
        for original in ("TRAIN", "TEST"):
            group = [row for row in images.values() if row["label"] == label
                     and row["original"] == original and not row["conflict"]]
            rng.shuffle(group)
            if limit is not None:
                group = group[:limit if original == "TRAIN" else max(2, limit // 5)]
            if original == "TRAIN":
                validation = max(1, round(len(group) * 0.15))
                partitions["validation"].extend(group[:validation])
                partitions["train"].extend(group[validation:])
            else:
                partitions["test"].extend(group)
    counts = {name: dict(Counter(LABELS[row["label"]] for row in rows))
              for name, rows in partitions.items()}
    if any(set(count) != set(LABELS) for count in counts.values()):
        raise ValueError("Cada partición necesita imágenes de las dos clases")
    stats = {"counts": counts, "invalid": invalid, "duplicates": duplicates,
             "conflicts": sum(row["conflict"] for row in images.values())}
    manifest = {"root": str(root), "partitions": partitions, "stats": stats}
    output.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(stats), flush=True)
    return manifest


def photo_array(photo, size):
    import numpy as np

    height, width = size
    return np.asarray(ImageOps.pad(ImageOps.exif_transpose(photo).convert("RGB"),
                                  (width, height), Image.Resampling.BILINEAR), dtype="float32")


def dataset(manifest, partition, size, batch=32):
    import tensorflow as tf

    rows = manifest["partitions"][partition]
    paths = [str(Path(manifest["root"]) / row["path"]) for row in rows]
    stream = tf.data.Dataset.from_tensor_slices((paths, [row["label"] for row in rows]))
    if partition == "train":
        stream = stream.shuffle(len(rows), seed=42)

    def decode(path):
        with Image.open(path.numpy().decode()) as photo:
            return photo_array(photo, size)

    def load(path, label):
        image = tf.py_function(decode, [path], Tout=tf.float32)
        image.set_shape((*size, 3))
        return image, label

    options = tf.data.Options()
    options.threading.private_threadpool_size = 4
    return stream.map(load, num_parallel_calls=4).batch(batch).prefetch(2).with_options(options)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("archivo", type=Path)
    parser.add_argument("destino", type=Path)
    args = parser.parse_args()
    extract_kaggle(args.archivo, args.destino)
