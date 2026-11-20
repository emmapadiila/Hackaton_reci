import unittest
from io import BytesIO
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageDraw
from starlette.datastructures import Headers

from api.main import read_photo
from api.residuos import analizar, resumir_whatsapp


class TestResiduos(unittest.TestCase):
    def test_can_on_desk_excludes_background_and_duplicate(self):
        photo = Image.new("RGB", (400, 700), "white")
        draw = ImageDraw.Draw(photo)
        for x in range(0, 400, 14):
            draw.line((x, 0, x, 700), fill="black", width=4)
        boxes = [
            ((120, 190, 268, 538), .90, "residuo"),
            ((137, 192, 265, 539), .88, "residuo"),
            ((0, 357, 325, 667), .85, "residuo"),
            ((215, 166, 390, 685), .80, "residuo"),
            ((0, 565, 294, 699), .75, "residuo"),
            ((66, 0, 177, 108), .72, "residuo"),
        ]
        def visual(photos):
            replies = { (148, 348): {"tipo": "aluminio", "claro": True},
                        (128, 347): {"tipo": "aluminio", "claro": True} }
            return [replies.get(image.size, {"tipo": "ninguno", "claro": False}) for image in photos]

        events = analizar(photo, lambda _: boxes,
                          lambda crops: [{"categoria": "aprovechable"} for _ in crops], vision=visual)
        result = list(events)[-1]["resultado"]
        self.assertEqual([(item["nombre"], item["categoria"]) for item in result["residuos"]],
                         [("Lata", "reciclable")])

    def setUp(self):
        self.photo = Image.new("RGB", (400, 400), "white")
        draw = ImageDraw.Draw(self.photo)
        for x in range(0, 400, 14):
            draw.line((x, 0, x, 400), fill="black", width=4)

    def run_analysis(self, boxes, context=(), description=""):
        return list(analizar(self.photo, lambda _: boxes,
                             lambda crops: [{"categoria": "aprovechable"} for _ in crops],
                             lambda _: context, description))

    def test_three_bottles_with_duplicate_and_table(self):
        bottles = [((110, 100, 145, 210), .8, "residuo"),
                   ((155, 100, 195, 210), .85, "residuo"),
                   ((220, 150, 250, 230), .75, "residuo")]
        table = ((20, 40, 370, 370), .7, "residuo")
        duplicate = ((112, 100, 145, 208), .63, "residuo")
        context = [(box, score, "bottle") for box, score, _ in bottles]
        context.append((table[0], table[1], "dining table"))
        events = self.run_analysis([table, duplicate, *bottles], context)
        result = events[-1]["resultado"]
        self.assertEqual(result["resumen"]["total_objetos_detectados"], 3)
        self.assertEqual([item["nombre"] for item in result["residuos"]], ["Botella"] * 3)
        for item in result["residuos"]:
            self.assertTrue(item["requiere_revision"])
            self.assertIsNone(item["aprovechable"])
            box = item["bounding_box"]
            self.assertLessEqual(box["x"] + box["width"], 1)
        self.assertIn("Recicladores".lower(), resumir_whatsapp(result))

    def test_uncertain_intent_keeps_centered_chair_for_human_review(self):
        box = (95, 90, 304, 320)
        events = self.run_analysis([(box, .75, "residuo")], [(box, .85, "chair")], "Silla rota")
        item = events[-1]["resultado"]["residuos"][0]
        self.assertEqual(item["nombre"], "Silla")
        self.assertIsNone(item["categoria"])

    def test_blurry_or_empty_skips_classification(self):
        def unexpected(_):
            self.fail("Etapa innecesaria")

        photo = Image.new("RGB", (400, 400), "gray")
        result = list(analizar(photo, unexpected, unexpected))[-1]["resultado"]
        self.assertEqual(result["residuos"], [])
        self.assertTrue(result["advertencias"])
        events = list(analizar(self.photo, lambda _: [], unexpected))
        self.assertEqual(events[-1]["resultado"]["residuos"], [])
        self.assertNotIn({"etapa": "Identificando materiales…"}, events)

    def test_inconsistent_category_is_not_assigned(self):
        box = (105, 100, 250, 240)
        result = list(analizar(self.photo, lambda _: [(box, .8, "residuo")],
                               lambda _: [{"categoria": "organico"}],
                               lambda _: [(box, .9, "bottle")]))[-1]["resultado"]
        self.assertIsNone(result["residuos"][0]["categoria"])

    def test_background_scene_requires_corroboration(self):
        first, second = (95, 85, 175, 230), (250, 150, 330, 230)
        boxes = [(first, .7, "residuo"), (second, .6, "residuo")]
        vision = [{"tipo": "ninguno", "claro": True}, {"tipo": "plastico_pet", "claro": True},
                  {"tipo": "papel", "claro": True}]
        result = list(analizar(self.photo, lambda _: boxes,
                               lambda crops: [{"categoria": "aprovechable"} for _ in crops],
                               lambda _: [(first, .9, "bottle")],
                               vision=lambda _: vision))[-1]["resultado"]
        self.assertEqual([item["nombre"] for item in result["residuos"]], ["Botella"])

    def test_partial_and_full_proposals_share_one_context_object(self):
        complete = (130, 75, 250, 390)
        partial = (135, 75, 245, 260)
        events = self.run_analysis([(complete, .9, "residuo"), (partial, .7, "residuo")],
                                   [(complete, .8, "bottle")])
        self.assertEqual(len(events[-1]["resultado"]["residuos"]), 1)

    def test_uploaded_image_validation_ignores_ultralytics_pillow_patch(self):
        upload = UploadFile(BytesIO(b"no es una imagen"), headers=Headers({"content-type": "image/jpeg"}))
        with patch.object(Image, "open", side_effect=ModuleNotFoundError("pi_heif")):
            with self.assertRaises(HTTPException) as error:
                read_photo(upload)
        self.assertEqual(error.exception.status_code, 422)

    def test_parts_of_can_are_not_counted_as_extra_objects(self):
        body = ((15, 84, 344, 305), .54, "residuo")
        parts = [((249, 63, 315, 195), .9, "residuo"),
                 ((263, 108, 318, 207), .88, "residuo"),
                 ((269, 118, 306, 173), .8, "residuo")]
        separate = ((357, 90, 393, 183), .66, "residuo")
        def classify(crops):
            return [{"categoria": "organico" if crop.width < 70 else "aprovechable"}
                    for crop in crops]

        for boxes, count in (([body, *parts], 1), ([body, *parts, separate], 2)):
            result = list(analizar(self.photo, lambda _: boxes, classify))[-1]["resultado"]
            self.assertEqual(result["resumen"]["total_objetos_detectados"], count)
            self.assertEqual(result["resumen"]["reciclables"], 1)
            if count == 1:
                self.assertEqual(result["resumen"]["organicos"], 0)

        result = self.run_analysis([body, parts[0]], [(parts[0][0], .9, "bottle")])[-1]["resultado"]
        self.assertEqual(result["resumen"]["total_objetos_detectados"], 2)
