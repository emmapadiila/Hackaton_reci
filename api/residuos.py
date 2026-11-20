from itertools import chain
from uuid import uuid4

import numpy as np
from PIL import Image
from api.vision_contextual import MATERIAL

from predict import classify


def orientacion(categoria):
    if categoria == "reciclable":
        return "recicladores", "Vacía y separa el material. Confirma que esté limpio y seco antes de entregarlo."
    if categoria == "organico":
        return "huerta", "Separa el residuo de su empaque y consulta si la huerta lo recibe."
    if categoria == "no_aprovechable":
        return None, "Consulta la disposición que corresponde a este material."
    return None, "Identifica el material antes de decidir cómo separarlo."


def area_caja(box):
    return (box[2] - box[0]) * (box[3] - box[1])


def interseccion(a, b):
    return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))


def iou(a, b):
    intersection = interseccion(a, b)
    return intersection / (area_caja(a) + area_caja(b) - intersection)


def quitar_detalles(residuos):
    conservados = []
    for candidato in sorted(residuos, key=lambda item: -area_caja(item[4])):
        caja, ancla = candidato[4:]
        area = area_caja(caja)
        if any(
            (ancla is None or ancla == exterior[5])
            and (iou(caja, exterior[4]) >= .45 or
                 interseccion(caja, exterior[4]) >= .75 * area and
                 (area <= .40 * area_caja(exterior[4]) or
                  candidato[3] is not None and candidato[3] == exterior[3]))
            for exterior in conservados):
            continue
        conservados.append(candidato)
    return conservados


def cajas_validas(candidatos, width, height):
    kept = []
    for box, score, name in sorted(candidatos, key=lambda item: -item[1]):
        if not np.isfinite(score) or not all(np.isfinite(box)):
            raise ValueError("Coordenadas o puntuación inválidas del detector")
        x, y, right, bottom = map(round, box)
        box = (max(0, x), max(0, y), min(width, right), min(height, bottom))
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        if all(iou(box, previous[0]) < 0.55 for previous in kept):
            kept.append((box, score, name))
    return kept


def nitidez(photo):
    image = photo.convert("L")
    image.thumbnail((384, 384), Image.Resampling.BILINEAR)
    pixels = np.asarray(image, dtype=np.float32)
    if min(pixels.shape) < 3:
        return 0
    center = pixels[1:-1, 1:-1]
    edges = 4 * center - pixels[2:, 1:-1] - pixels[:-2, 1:-1] - pixels[1:-1, 2:] - pixels[1:-1, :-2]
    return float(edges.var())


NOMBRES = {"bottle": "Botella", "can": "Lata", "banana": "Banano", "apple": "Manzana",
           "orange": "Naranja", "cup": "Vaso", "chair": "Silla", "tv": "Pantalla",
           "laptop": "Computador", "dining table": "Mesa", "couch": "Sofá", "person": "Persona",
           "handbag": "Bolso", "backpack": "Mochila", "suitcase": "Maleta"}
ENTORNO = {"chair", "tv", "laptop", "dining table", "couch", "person", "bed", "potted plant"}
OBJETOS_RECONOCIBLES = {"bottle", "can", "cup", "banana", "apple", "orange"}


def inferir_cajas(model, photo, conf, limit):
    result = model.predict(photo, conf=conf, max_det=limit, verbose=False)[0]
    return [(tuple(item.xyxy[0].tolist()), float(item.conf.item()),
             result.names[int(item.cls.item())]) for item in result.boxes]


def analizar(photo, detectar, clasificar, contexto=None, descripcion="", referencia=None, vision=None):
    """Genera etapas reales. Web y WhatsApp pueden consumir este mismo iterador."""
    width, height = photo.size
    residuos, advertencias = [], []
    yield {"etapa": "Buscando posibles residuos…"}
    if min(width, height) < 160 or nitidez(photo) < 3:
        advertencias.append("La foto parece borrosa, uniforme o demasiado pequeña. Toma otra con más luz y enfoque.")
    else:
        candidatos = cajas_validas(detectar(photo), width, height)
        if candidatos:
            yield {"etapa": "Identificando materiales…"}
            escenas = cajas_validas(contexto(photo), width, height) if contexto else []
            candidatos = [item for item in candidatos if nitidez(photo.crop(item[0])) >= 3]
            if candidatos:
                etiquetas = clasificar(photo.crop(box) for box, _, _ in candidatos)
                if len(etiquetas) != len(candidatos):
                    raise ValueError("Número de recortes clasificados incorrecto")
                yield {"etapa": "Verificando clasificación…"}
                escenas_y_recortes = chain((photo,), (photo.crop(box) for box, _, _ in candidatos))
                escena, *materiales = vision(escenas_y_recortes) if vision else [None] * (len(candidatos) + 1)
                fondo = escena and escena["tipo"] == "ninguno" and escena["claro"]
                anclas_usadas = {}
                objeto_principal = any(
                    name in OBJETOS_RECONOCIBLES
                    and (b[2]-b[0]) * (b[3]-b[1]) > .28 * width * height
                    and .3 * width <= (b[0]+b[2]) / 2 <= .7 * width
                    for b, _, name in escenas
                )
                for (box, score, _), etiqueta, visual in zip(candidatos, etiquetas, materiales, strict=True):
                    x, y, right, bottom = box
                    overlaps = [(iou(box, context_box), index, name)
                                for index, (context_box, _, name) in enumerate(escenas)]
                    overlap, ancla, objeto = max(overlaps, default=(0, -1, ""))
                    objeto = objeto if overlap >= 0.4 else ""
                    nombre = NOMBRES.get(objeto, "Material por identificar")
                    mencionado = bool(objeto and nombre.casefold() in descripcion.casefold())
                    corroborado = objeto in OBJETOS_RECONOCIBLES
                    if corroborado and any(iou(box, previa) >= .25 for previa in anclas_usadas.get(ancla, [])):
                        continue
                    if fondo and not (corroborado or mencionado):
                        continue
                    if visual and visual["tipo"] == "ninguno" and visual["claro"] and not corroborado and not mencionado:
                        continue
                    centro = abs((x + right) / (2 * width) - .5) + abs((y + bottom) / (2 * height) - .5)
                    area = (right-x) * (bottom-y) / (width*height)
                    if objeto == "person":
                        continue
                    if objeto in ENTORNO and not mencionado:
                        competencia = any(other != box and iou(box, other) < .35 and
                                          (other[2]-other[0])*(other[3]-other[1]) < (right-x)*(bottom-y)
                                          for other, _, _ in candidatos)
                        if competencia or centro > .4 or score < .55:
                            continue
                    touches_border = sum((x <= .02 * width, y <= .02 * height,
                                          right >= .98 * width, bottom >= .98 * height))
                    if area > .72 and (score < .55 or not objeto) and touches_border >= 2:
                        continue
                    if objeto_principal and touches_border and centro > .25 and not (corroborado or mencionado) and not (
                            visual and visual["claro"] and visual["tipo"] in MATERIAL):
                        continue
                    # shortcut: la CNN binaria sugiere familia, la persona verifica el material y el destino.
                    categoria = {"aprovechable": "reciclable", "organico": "organico"}.get(etiqueta["categoria"])
                    material = None
                    if visual and visual["claro"] and visual["tipo"] in MATERIAL:
                        material = MATERIAL[visual["tipo"]]
                        sugerida = "organico" if visual["tipo"] == "organico" else "reciclable"
                        if categoria != sugerida and visual["tipo"] not in {"carton", "papel"}:
                            categoria = None
                        else:
                            categoria = sugerida
                        if not objeto:
                            nombre = material
                    if objeto in ENTORNO or objeto in {"handbag", "backpack", "suitcase"}:
                        categoria = None
                    if (objeto in {"bottle", "can"} and categoria == "organico" or
                            objeto in {"banana", "apple", "orange"} and categoria == "reciclable"):
                        categoria = None
                    # La clasificación binaria por sí sola no demuestra que el recorte sea un residuo.
                    if vision and not (corroborado or mencionado or material and categoria):
                        continue
                    if material == MATERIAL["aluminio"] and not objeto:
                        nombre = "Lata"
                    if corroborado:
                        anclas_usadas.setdefault(ancla, []).append(box)
                    residuos.append((centro - (.18 if nombre.casefold() in descripcion.casefold() else 0),
                                     nombre, categoria, material, box, ancla if corroborado else None))
    yield {"etapa": "Preparando recomendaciones…"}
    items = []
    ordenados = sorted(quitar_detalles(residuos), key=lambda entry: entry[0])
    for i, (_, nombre, categoria, material, (x, y, right, bottom), _) in enumerate(ordenados, 1):
        colectivo, consejo = orientacion(categoria)
        items.append({"id": f"obj-{i}", "nombre": nombre, "material": material, "categoria": categoria,
                      "colectivo_sugerido": colectivo, "aprovechable": None, "requiere_revision": True,
                      "bounding_box": {"x": x/width, "y": y/height, "width": (right-x)/width,
                                       "height": (bottom-y)/height}, "recomendacion": consejo})
    if len(items) > 1:
        advertencias.append("Los materiales mezclados o contaminados requieren revisión.")
    yield {"resultado": {"analisis_id": str(uuid4()), "referencia": referencia, "estado": "completado",
                         "residuos": items, "advertencias": advertencias, "resumen": {
                             "total_objetos_detectados": len(items),
                             "reciclables": sum(x["categoria"] == "reciclable" for x in items),
                             "organicos": sum(x["categoria"] == "organico" for x in items),
                             "no_aprovechables": 0, "requiere_revision": bool(items)}}}


def resumir_whatsapp(resultado):
    lines = [f'{x["nombre"]} · {x["categoria"] or "por revisar"}. {x["recomendacion"]} '
             f'Colectivo: {x["colectivo_sugerido"] or "por confirmar"}.'
             for x in resultado["residuos"]]
    if not lines:
        lines.append("No identificamos residuos con suficiente claridad. Envía otra foto o indica el material.")
    return "\n".join(lines + resultado["advertencias"] +
                     ["Puedes corregir los materiales o continuar con una solicitud de recolección."])
