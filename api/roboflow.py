import math
import os
from pathlib import Path

import numpy as np
from PIL import Image

MODEL_ID = "yolo-waste-detection/1"
ENV_PATH = Path(__file__).resolve().parent.parent / "data" / "roboflow.env"


class RoboflowConfigurationError(RuntimeError):
    pass


class RoboflowInferenceError(RuntimeError):
    pass


def leer_api_key(path=ENV_PATH):
    api_key = os.getenv("ROBOFLOW_API_KEY")
    if api_key:
        return api_key
    try:
        contenido = path.read_text(encoding="utf-8")
    except OSError:
        return None
    for linea in contenido.splitlines():
        nombre, separador, valor = linea.strip().partition("=")
        if separador and nombre.strip() == "ROBOFLOW_API_KEY":
            return valor.strip().strip("'\"") or None
    return None


def inferir_roboflow(photo: Image.Image):
    api_key = leer_api_key()
    if not api_key:
        raise RoboflowConfigurationError(
            "Falta configurar ROBOFLOW_API_KEY en el entorno o en data/roboflow.env."
        )

    try:
        from inference_sdk import InferenceConfiguration, InferenceHTTPClient
        from inference_sdk.http.errors import HTTPClientError
    except ImportError as error:
        raise RoboflowConfigurationError("Instala requirements-roboflow.txt para usar Roboflow.") from error

    client = InferenceHTTPClient(
        api_url="https://serverless.roboflow.com",
        api_key=api_key,
    ).configure(InferenceConfiguration(api_key_transport="header"))
    try:
        return client.infer(np.asarray(photo.convert("RGB")), model_id=MODEL_ID)
    except HTTPClientError as error:
        raise RoboflowInferenceError("Falló la solicitud de inferencia a Roboflow.") from error


def normalizar_predicciones(result, width, height):
    predictions = result.get("predictions") if isinstance(result, dict) else None
    if not isinstance(predictions, list):
        raise ValueError("La respuesta de Roboflow no contiene una lista de predicciones.")

    objects = []
    for prediction in predictions:
        if not isinstance(prediction, dict) or not isinstance(prediction.get("class"), str):
            raise ValueError("Roboflow devolvió una predicción sin clase válida.")
        try:
            x, y, box_width, box_height, confidence = (
                float(prediction[key]) for key in ("x", "y", "width", "height", "confidence")
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("Roboflow devolvió coordenadas o confianza inválidas.") from error
        if (not all(math.isfinite(value) for value in (x, y, box_width, box_height, confidence))
                or box_width <= 0 or box_height <= 0 or not 0 <= confidence <= 1):
            raise ValueError("Roboflow devolvió coordenadas o confianza fuera de rango.")

        left, top = max(0, round(x - box_width / 2)), max(0, round(y - box_height / 2))
        right, bottom = min(width, round(x + box_width / 2)), min(height, round(y + box_height / 2))
        if right <= left or bottom <= top:
            continue
        label = prediction["class"]
        objects.append({
            "numero": len(objects) + 1,
            "clase": label,
            "descripcion": label,
            "confianza_detector": confidence,
            "caja": {"x": left, "y": top, "ancho": right - left, "alto": bottom - top},
            "categoria": None,
            "requiere_revision": True,
        })
    return objects
