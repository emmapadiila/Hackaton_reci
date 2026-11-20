import json
import logging
import os
import sqlite3
from contextlib import closing
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from PIL.Image import open as open_image
from pydantic import BaseModel, Field, StringConstraints

from predict import DEFAULT_MODEL, classify, load_classifier
from api.residuos import analizar, inferir_cajas
from api.vision_contextual import VisionContextual

app = FastAPI(title="EcoConecta IA")
MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 24_000_000
FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
MODEL_PATH = Path(os.getenv("ECO_CLASSIFIER", str(DEFAULT_MODEL)))
YOLO_PATH = Path(os.getenv("ECO_YOLO", "models/ecoconecta_yolo.pt"))
CONTEXT_PATH = Path(os.getenv("ECO_CONTEXT", "models/yolov8n.pt"))
CLIP_PATH = Path(os.getenv("ECO_CLIP_VISION", "models/clip_vision_q8.onnx"))
REQUEST_DB = Path(os.getenv("ECO_REQUEST_DB", "data/recolecciones.sqlite3"))
DATABASE_URL = os.getenv("ECO_DATABASE_URL")
inference_lock = Lock()
logger = logging.getLogger(__name__)


@lru_cache
def classifier():
    return load_classifier(MODEL_PATH)


@lru_cache
def detector():
    from ultralytics import YOLO

    return YOLO(YOLO_PATH)


@lru_cache
def context_detector():
    from ultralytics import YOLO

    return YOLO(CONTEXT_PATH)


@lru_cache
def vision_contextual():
    return VisionContextual(CLIP_PATH)


def require_local_models(detection=False):
    if os.getenv("ECO_LOCAL_MODELS") != "1":
        raise HTTPException(503, "El servicio de reconocimiento todavía no está habilitado.")
    if not MODEL_PATH.is_file() or (detection and not YOLO_PATH.is_file()):
        raise HTTPException(503, "Los modelos de análisis todavía no están disponibles.")
    if detection and not CLIP_PATH.is_file():
        raise HTTPException(503, "La comprobación visual del fondo no está disponible.")


def read_photo(file):
    if file.content_type not in FORMATS:
        raise HTTPException(415, "Usa una fotografía JPEG, PNG o WebP.")
    payload = file.file.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        raise HTTPException(413, "La fotografía supera los 10 MB.")
    try:
        # Ultralytics amplía Image.open al cargar YOLO. La API admite solo sus tres formatos declarados.
        with open_image(BytesIO(payload), formats=list(FORMATS.values())) as original:
            if original.format != FORMATS[file.content_type]:
                raise HTTPException(415, "El contenido no coincide con el tipo de imagen.")
            if original.width * original.height > MAX_PIXELS:
                raise HTTPException(413, "La fotografía supera los 24 megapíxeles.")
            return ImageOps.exif_transpose(original).convert("RGB")
    except Image.DecompressionBombError as error:
        raise HTTPException(413, "La fotografía supera los 24 megapíxeles.") from error
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise HTTPException(422, "La fotografía está dañada o no se puede abrir.") from error


@app.post("/api/ia/detectar")
def detectar(imagen: UploadFile = File(...)):
    photo = read_photo(imagen)
    require_local_models()
    width, height = photo.size
    with inference_lock:
        if not YOLO_PATH.is_file():
            return {"modo": "foto_completa", "ancho": width, "alto": height,
                    "clasificacion": classify(classifier(), [photo])[0], "objetos": []}
        prediction = detector().predict(photo, conf=0.4, max_det=20, verbose=False)[0]
        objects, crops = [], []
        for box in prediction.boxes:
            x1, y1, x2, y2 = map(round, box.xyxy[0].tolist())
            x1, y1, x2, y2 = max(0, x1), max(0, y1), min(width, x2), min(height, y2)
            if x2 <= x1 or y2 <= y1:
                continue
            label = prediction.names[int(box.cls.item())]
            objects.append({"numero": len(objects) + 1, "clase": label, "descripcion": label,
                            "confianza_detector": float(box.conf.item()),
                            "caja": {"x": x1, "y": y1, "ancho": x2 - x1, "alto": y2 - y1}})
            crops.append((x1, y1, x2, y2))
        if crops:
            for item, result in zip(objects, classify(classifier(), (photo.crop(box) for box in crops))):
                item.update(result)
    return {"modo": "deteccion", "ancho": width, "alto": height, "objetos": objects}


def eventos_analisis(photo, descripcion="", referencia=None):
    require_local_models(detection=True)

    def detectar_autorizado(image, modelo, confidence, limit):
        with inference_lock:
            return inferir_cajas(modelo(), image, confidence, limit)

    def clasificar(crops):
        with inference_lock:
            return classify(classifier(), crops)

    def vision(photos):
        with inference_lock:
            return vision_contextual().revisar(photos)

    context = (lambda image: detectar_autorizado(image, context_detector, .35, 30)) if CONTEXT_PATH.is_file() else None
    yield from analizar(photo, lambda image: detectar_autorizado(image, detector, .4, 20),
                       clasificar, context, descripcion, referencia,
                       vision)


@app.post("/api/ia/analizar-residuos")
def analizar_residuos(request: Request, imagen: UploadFile = File(...),
                     descripcion: str = Form("", max_length=300),
                     referencia: str | None = Form(None, max_length=100)):
    photo = read_photo(imagen)
    require_local_models(detection=True)

    def eventos():
        try:
            yield from eventos_analisis(photo, descripcion.strip(), referencia)
        except Exception:
            logger.exception("Falló la inferencia de residuos")
            yield {"error": "El modelo devolvió una respuesta inválida o dejó de estar disponible."}

    if "application/x-ndjson" in request.headers.get("accept", ""):
        return StreamingResponse((json.dumps(event, ensure_ascii=False) + "\n" for event in eventos()),
                                 media_type="application/x-ndjson", headers={"X-Accel-Buffering": "no"})
    final = list(eventos())[-1]
    if "error" in final:
        raise HTTPException(502, final["error"])
    return final["resultado"]


class Recoleccion(BaseModel):
    direccion: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=250)]
    categorias: list[Literal["organico", "aprovechable"]] = Field(min_length=1, max_length=20)


@app.post("/api/recolecciones", status_code=201)
def crear_recoleccion(solicitud: Recoleccion):
    if DATABASE_URL:
        import psycopg

        with psycopg.connect(DATABASE_URL) as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS recolecciones (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, direccion TEXT NOT NULL,
                categorias JSONB NOT NULL, creado TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            row = connection.execute(
                "INSERT INTO recolecciones (direccion, categorias) VALUES (%s, %s::jsonb) RETURNING id",
                (solicitud.direccion, json.dumps(solicitud.categorias)),
            ).fetchone()
            return {"id": row[0], "estado": "registrada_localmente"}
    REQUEST_DB.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(REQUEST_DB)) as connection, connection:
        connection.execute("""CREATE TABLE IF NOT EXISTS recolecciones (
            id INTEGER PRIMARY KEY, direccion TEXT NOT NULL, categorias TEXT NOT NULL,
            creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        cursor = connection.execute("INSERT INTO recolecciones (direccion, categorias) VALUES (?, ?)",
                                    (solicitud.direccion, json.dumps(solicitud.categorias)))
        return {"id": cursor.lastrowid, "estado": "registrada_localmente"}
