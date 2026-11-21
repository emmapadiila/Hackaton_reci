import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from api.roboflow import leer_api_key, normalizar_predicciones


class RoboflowApiKeyTest(unittest.TestCase):
    def test_reads_key_from_env_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "roboflow.env"
            path.write_text("# comentario\nROBOFLOW_API_KEY='rf_prueba'\n", encoding="utf-8")
            with patch.dict(os.environ, {"ROBOFLOW_API_KEY": ""}):
                self.assertEqual(leer_api_key(path), "rf_prueba")

    def test_missing_file_returns_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {"ROBOFLOW_API_KEY": ""}):
                self.assertIsNone(leer_api_key(Path(tmp) / "no-existe.env"))

    def test_environment_takes_precedence(self):
        with patch.dict(os.environ, {"ROBOFLOW_API_KEY": "rf_entorno"}):
            self.assertEqual(leer_api_key(Path("/ruta/inexistente")), "rf_entorno")


class RoboflowPredictionTest(unittest.TestCase):
    def test_normalizes_and_clips_boxes_to_image(self):
        result = {"predictions": [
            {"class": "bottle", "x": 5, "y": 5, "width": 20, "height": 12, "confidence": 0.9},
            {"class": "can", "x": 80, "y": 50, "width": 40, "height": 20, "confidence": 0.7},
        ]}

        objects = normalizar_predicciones(result, 100, 100)

        self.assertEqual(len(objects), 2)
        self.assertEqual(objects[0]["caja"], {"x": 0, "y": 0, "ancho": 15, "alto": 11})
        self.assertEqual(objects[1]["caja"], {"x": 60, "y": 40, "ancho": 40, "alto": 20})
        self.assertTrue(all(item["requiere_revision"] for item in objects))

    def test_rejects_invalid_confidence(self):
        result = {"predictions": [
            {"class": "bottle", "x": 5, "y": 5, "width": 10, "height": 10, "confidence": 1.2}
        ]}

        with self.assertRaises(ValueError):
            normalizar_predicciones(result, 100, 100)

    def test_accepts_empty_predictions(self):
        self.assertEqual(normalizar_predicciones({"predictions": []}, 100, 100), [])


if __name__ == "__main__":
    unittest.main()
