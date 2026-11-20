"""Prueba de integración con fotografías locales. Escribe casos fallidos y pendientes."""

import argparse
import json
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from PIL import Image, ImageFilter

FIXTURES = Path("data/validacion-eco")
TACO = Path("taco-dataset/miniaturas")
CASES = (
    ("botella individual", FIXTURES / "botella.jpg", 1, 1, "reciclable"),
    ("botellas sobre mesa", FIXTURES / "botellas-mesa.jpg", 2, None, "reciclable"),
    ("tres botellas frente a pared", FIXTURES / "tres-botellas-pared.jpg", 3, 3, "reciclable"),
    ("papel y cartón", TACO / "1488.jpg", 2, None, "reciclable"),
    ("latas de bebida", TACO / "723.jpg", 2, 2, "reciclable"),
    ("cáscaras de fruta", FIXTURES / "cascara.jpg", 1, None, "organico"),
    ("residuos separados", TACO / "1239.jpg", 2, None, "reciclable"),
    ("residuos mezclados", TACO / "99.jpg", 2, None, "reciclable"),
    ("pared", FIXTURES / "pared.jpg", 0, 0, None),
    ("techo", FIXTURES / "techo.jpg", 0, 0, None),
    ("habitación vacía", FIXTURES / "oficina.jpg", 0, 0, None),
    ("foto borrosa", FIXTURES / "borrosa.jpg", 0, 0, None),
    ("objeto ambiguo", TACO / "841.jpg", 1, None, None),
)


def derivados():
    office = FIXTURES / "oficina.jpg"
    if office.is_file():
        with Image.open(office) as image:
            image.crop((230, 550, 805, 777)).save(FIXTURES / "pared.jpg")
            image.crop((10, 10, 1300, 468)).save(FIXTURES / "techo.jpg")
    original = TACO / "1239.jpg"
    if original.is_file():
        with Image.open(original) as image:
            image.filter(ImageFilter.GaussianBlur(radius=22)).save(FIXTURES / "borrosa.jpg")


def request_photo(path, base_url):
    boundary = uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="imagen"; filename="foto.jpg"\r\n'
            "Content-Type: image/jpeg\r\n\r\n").encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    route = base_url.rstrip("/") + "/api/ia/analizar-residuos"
    request = Request(route, body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urlopen(request, timeout=90) as response:
        return json.load(response)


def matches_annotated(path, items, annotations):
    identifier = int(path.stem)
    photo = next(p for p in annotations["images"] if p["id"] == identifier)
    width, height = photo["width"], photo["height"]
    expected = [(x/width, y/height, w/width, h/height)
                for item in annotations["annotations"] if item["image_id"] == identifier
                for x, y, w, h in [item["bbox"]]]
    matched = 0
    for item in items:
        box = item["bounding_box"]
        x, y, w, h = (box[key] for key in ("x", "y", "width", "height"))
        scores = []
        for a, b, c, d in expected:
            overlap = max(0, min(x+w, a+c) - max(x, a)) * max(0, min(y+h, b+d) - max(y, b))
            scores.append(overlap / (w*h + c*d - overlap))
        if scores and max(scores) >= .5:
            expected.pop(scores.index(max(scores)))
            matched += 1
    return matched, len(expected)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8002")
    args = parser.parse_args()
    FIXTURES.mkdir(parents=True, exist_ok=True)
    derivados()
    source = TACO.parent / "data/annotations.json"
    annotations = json.loads(source.read_text(encoding="utf-8")) if source.is_file() else None
    results = []
    for name, path, minimum, maximum, category in CASES:
        row = {"caso": name, "foto": str(path), "estado": "pendiente"}
        if path.is_file():
            try:
                data = request_photo(path, args.url)
                items = data["residuos"]
                count_ok = len(items) >= minimum and (maximum is None or len(items) <= maximum)
                category_ok = category is None or any(item["categoria"] == category for item in items)
                review_ok = all(item["requiere_revision"] for item in items)
                row.update(estado="pasa" if count_ok and category_ok and review_ok else "fallo",
                           cantidad=len(items), categorias=[item["categoria"] for item in items],
                           advertencias=data["advertencias"])
                if annotations and path.parent == TACO:
                    matched, missed = matches_annotated(path, items, annotations)
                    row.update(cajas_con_iou_50=matched, anotadas_sin_coincidencia=missed,
                               candidatas_sin_coincidencia=len(items)-matched)
                    if matched < minimum or (maximum is not None and len(items) != matched):
                        row["estado"] = "fallo"
            except (URLError, TimeoutError, ValueError, KeyError) as error:
                row.update(estado="error", detalle=str(error))
        results.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
    (FIXTURES / "informe.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    return int(any(row["estado"] in {"fallo", "error"} for row in results))


if __name__ == "__main__":
    raise SystemExit(main())
