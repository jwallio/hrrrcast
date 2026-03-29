from io import BytesIO
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image

from services.shared.preview import render_preview_png
from tests.fixture_data import write_product_asset


class RendererTests(unittest.TestCase):
    def test_render_preview_png_returns_png_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            metadata = write_product_asset(data_root)
            payload = render_preview_png(metadata["netcdf_path"], "temperature_2m", max_dimension=256)
        self.assertTrue(payload.startswith(b"\x89PNG\r\n\x1a\n"))

    def test_probability_preview_makes_zero_values_transparent(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            metadata = write_product_asset(
                data_root,
                member="ens",
                overlay_id="helicity_0_1km_probability_gt_100",
                variable_name="helicity_prob",
                values=np.array([[0.0, 0.0], [11.1111, 100.0]], dtype=np.float32),
                field_key="HLCY:1000-0 m above ground",
            )
            payload = render_preview_png(
                metadata["netcdf_path"],
                "helicity_0_1km_probability_gt_100",
                max_dimension=256,
            )
        image = Image.open(BytesIO(payload))
        image.load()
        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.getpixel((0, 0))[3], 0)
        self.assertEqual(image.getpixel((1, 0))[3], 0)
        self.assertGreater(image.getpixel((0, 1))[3], 0)
        self.assertEqual(image.getpixel((1, 1))[3], 255)


if __name__ == "__main__":
    unittest.main()
