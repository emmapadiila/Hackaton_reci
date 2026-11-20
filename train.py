import argparse
import json
import shutil
from pathlib import Path

from waste_data import dataset, prepare


def build(tf, architecture):
    keras = tf.keras
    layers = keras.layers
    size = (60, 30) if architecture == "cnn" else (96, 96)
    inputs = keras.Input((*size, 3))
    x = keras.Sequential([
        layers.RandomFlip("horizontal"), layers.RandomRotation(0.08),
        layers.RandomTranslation(0.1, 0.1),
    ], name="aumentacion")(inputs)
    if architecture == "cnn":
        x = layers.Rescaling(1 / 255)(x)
        for filters in (32, 64):
            for index in range(3):
                padding = "same" if filters == 32 and index == 0 else "valid"
                x = layers.Conv2D(filters, 3, padding=padding, activation="relu")(x)
            if filters == 32:
                x = layers.MaxPooling2D()(x)
            x = layers.Dropout(0.25)(x)
        x = layers.Flatten()(x)
        for _ in range(2):
            x = layers.Dense(512, activation="relu")(x)
            x = layers.Dropout(0.5)(x)
    else:
        backbone = keras.applications.MobileNetV2(input_shape=(*size, 3), include_top=False,
                                                   weights="imagenet", pooling="avg")
        backbone.trainable = False
        x = backbone(layers.Rescaling(1 / 127.5, offset=-1)(x), training=False)
        x = layers.Dropout(0.2)(x)
    model = keras.Model(inputs, layers.Dense(2, activation="softmax", dtype="float32")(x))
    model.compile(keras.optimizers.Adam(learning_rate=1e-4 if architecture == "cnn" else 1e-3),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return model, size


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/kaggle")
    parser.add_argument("--output", type=Path, default=Path("models"))
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--limit-per-class", type=int)
    args = parser.parse_args()
    if args.epochs < 1 or (args.limit_per_class is not None and args.limit_per_class < 3):
        parser.error("Se necesita al menos una época y tres imágenes por clase")
    from evaluate import evaluate, training_plot
    import tensorflow as tf

    tf.keras.utils.set_random_seed(42)
    print("GPU:", tf.config.list_physical_devices("GPU"), flush=True)
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = prepare(args.data, args.output / "dataset.json", args.limit_per_class)
    scores = {}
    for architecture in ("cnn", "mobilenetv2"):
        tf.keras.backend.clear_session()
        model, size = build(tf, architecture)
        checkpoint = args.output / f"{architecture}.keras"
        history = model.fit(dataset(manifest, "train", size),
                            validation_data=dataset(manifest, "validation", size),
                            epochs=args.epochs, verbose=2, callbacks=[
                                tf.keras.callbacks.EarlyStopping(patience=3),
                                tf.keras.callbacks.ModelCheckpoint(checkpoint, save_best_only=True),
                            ])
        scores[architecture] = min(history.history["val_loss"])
        training_plot(history.history, args.output / f"{architecture}_curvas.png")

    winner = min(scores, key=scores.get)
    comparison = {"winner": winner, "validation_loss": scores, "limit_per_class": args.limit_per_class}
    for architecture in scores:
        comparison[architecture] = evaluate(args.output / f"{architecture}.keras", manifest,
                                            args.output / f"{architecture}_prueba")
    final = args.output / "ecoconecta_classifier.keras"
    shutil.copyfile(args.output / f"{winner}.keras", final.with_suffix(".part"))
    final.with_suffix(".part").replace(final)
    (args.output / "comparison.json").write_text(json.dumps(comparison, indent=2), encoding="utf-8")
    print(json.dumps(comparison), flush=True)


if __name__ == "__main__":
    main()
