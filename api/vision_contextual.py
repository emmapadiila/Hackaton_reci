import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

MATERIAL = {
    "carton": "Cartón", "papel": "Papel", "plastico_pet": "Plástico de botella",
    "plastico_otro": "Plástico", "aluminio": "Metal de lata", "vidrio": "Vidrio probable",
    "organico": "Restos vegetales",
}


class VisionContextual:
    def __init__(self, model_path):
        import onnxruntime as ort

        options = ort.SessionOptions()
        options.intra_op_num_threads = 3
        self.session = ort.InferenceSession(str(model_path), sess_options=options,
                                            providers=["CPUExecutionProvider"])
        path = Path(__file__).resolve().parents[1] / "src/services/reconocimiento/embeddings-texto.json"
        categories = json.loads(path.read_text(encoding="utf-8"))["categorias"]
        extra = Path(__file__).with_name("embeddings-fondo.json")
        if extra.is_file():
            negative = next(row for row in categories if row["id"] == "ninguno")
            negative["vectores"].extend(json.loads(extra.read_text(encoding="utf-8"))["vectores"])
        self.vectors = [(row["id"], np.asarray(row["vectores"], dtype=np.float32)) for row in categories]

    def revisar(self, photos):
        inputs = [np.asarray(ImageOps.fit(photo, (224, 224), Image.Resampling.BICUBIC),
                             dtype=np.float32) / 255 for photo in photos]
        pixels = np.asarray(inputs, dtype=np.float32)
        pixels -= np.asarray([.48145466, .4578275, .40821073], dtype=np.float32)
        pixels /= np.asarray([.26862954, .26130258, .27577711], dtype=np.float32)
        batch = np.ascontiguousarray(pixels.transpose(0, 3, 1, 2))
        vectors, = self.session.run(["image_embeds"], {"pixel_values": batch})
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        if not np.isfinite(vectors).all() or np.any(norms <= 0):
            raise ValueError("El modelo visual devolvió una representación inválida")
        results = []
        for vector in vectors / norms:
            scores = sorted(((float((group @ vector).max()), label) for label, group in self.vectors),
                            reverse=True)
            (score, top), (second, _) = scores[:2]
            results.append({"tipo": top, "claro": score >= .19 and score - second >= .015})
        return results
