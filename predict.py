import argparse
import json
from pathlib import Path

from PIL import Image

from waste_data import LABELS, photo_array

DEFAULT_MODEL = Path("models/ecoconecta_classifier.keras")
REVIEW_THRESHOLD = 0.75


def classify(model, photos):
    import numpy as np

    pixels = np.stack([photo_array(photo, model.input_shape[1:3]) for photo in photos])
    predictions = model(pixels, training=False).numpy()
    if (predictions.shape != (len(pixels), len(LABELS)) or not np.isfinite(predictions).all()
            or np.any((predictions < 0) | (predictions > 1)) or not np.allclose(predictions.sum(axis=1), 1)):
        raise ValueError("El clasificador devolvió probabilidades inválidas")
    results = []
    for scores in predictions:
        best = int(scores.argmax())
        confidence = float(scores[best])
        review = confidence < REVIEW_THRESHOLD
        results.append({
            "categoria": None if review else LABELS[best],
            "confianza": confidence,
            "nivel_confianza": "requiere_revision" if review else "suficiente",
            "probabilidades": dict(zip(LABELS, map(float, scores))),
            "recomendacion": "Revisa o corrige la categoría." if review else None,
        })
    return results


def load_classifier(path):
    import tensorflow as tf

    return tf.keras.models.load_model(path, compile=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("photo", type=Path)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    args = parser.parse_args()
    with Image.open(args.photo) as image:
        print(json.dumps(classify(load_classifier(args.model), [image])[0], indent=2))
