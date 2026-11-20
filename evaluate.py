import argparse
import json
from pathlib import Path

from waste_data import LABELS, dataset


def training_plot(history, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figure, axes = plt.subplots(1, 2, figsize=(9, 4))
    for axis, metric in zip(axes, ("accuracy", "loss")):
        axis.plot(range(1, len(history[metric]) + 1), history[metric], label="Entrenamiento")
        axis.plot(range(1, len(history[metric]) + 1), history[f"val_{metric}"], label="Validación")
        axis.set(xlabel="Época", ylabel=metric)
        axis.legend()
    figure.tight_layout()
    figure.savefig(output)
    plt.close(figure)


def evaluate(model_path, manifest, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import tensorflow as tf
    from sklearn.metrics import ConfusionMatrixDisplay, classification_report, confusion_matrix

    model = tf.keras.models.load_model(model_path)
    test = dataset(manifest, "test", tuple(model.input_shape[1:3]))
    prediction = model.predict(test, verbose=0).argmax(axis=1)
    truth = [row["label"] for row in manifest["partitions"]["test"]]
    matrix = confusion_matrix(truth, prediction, labels=[0, 1])
    report = classification_report(truth, prediction, labels=[0, 1], target_names=LABELS,
                                   output_dict=True, zero_division=0)
    metrics = {"report": report, "confusion_matrix": matrix.tolist()}
    output.with_suffix(".json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    display = ConfusionMatrixDisplay(matrix, display_labels=LABELS).plot(colorbar=False)
    display.figure_.tight_layout()
    display.figure_.savefig(output.with_suffix(".png"))
    plt.close(display.figure_)
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("models/ecoconecta_classifier.keras"))
    parser.add_argument("--manifest", type=Path, default=Path("models/dataset.json"))
    parser.add_argument("--output", type=Path, default=Path("models/evaluacion"))
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    print(json.dumps(evaluate(args.model, manifest, args.output), indent=2))
