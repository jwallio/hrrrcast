from pathlib import Path
import tempfile
import unittest

from services.shared.preview import render_preview_png
from tests.fixture_data import write_product_asset


class RendererTests(unittest.TestCase):
    def test_render_preview_png_returns_png_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            metadata = write_product_asset(data_root)
            payload = render_preview_png(metadata["netcdf_path"], "temperature_2m", max_dimension=256)
        self.assertTrue(payload.startswith(b"\x89PNG\r\n\x1a\n"))


if __name__ == "__main__":
    unittest.main()
