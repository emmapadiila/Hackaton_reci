import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from waste_data import prepare


class DatasetTest(unittest.TestCase):
    def test_duplicate_crossing_test_boundary_is_kept_in_test(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for split_index, split in enumerate(("TRAIN", "TEST")):
                for label_index, label in enumerate(("O", "R")):
                    folder = root / split / label
                    folder.mkdir(parents=True)
                    for i in range(4):
                        Image.new("RGB", (16, 16), (split_index * 100, label_index * 100, i * 20)).save(
                            folder / f"{i}.png"
                        )
            shutil.copyfile(root / "TEST/O/0.png", root / "TRAIN/O/copy.png")
            (root / "TRAIN/O/broken.jpg").write_bytes(b"broken")
            result = prepare(root, root / "manifest.json")
            self.assertEqual(result["stats"]["duplicates"], 1)
            self.assertEqual(result["stats"]["invalid"], 1)
            splits = {name: {item["path"] for item in rows}
                      for name, rows in result["partitions"].items()}
            self.assertIn("TEST/O/0.png", splits["test"])
            self.assertTrue(all("TRAIN/O/copy.png" not in paths for paths in splits.values()))
            self.assertTrue(splits["train"].isdisjoint(splits["validation"]))
