from pathlib import Path
import tempfile
import unittest

from services.shared.tiler import render_tile_png, tile_bounds_lonlat
from tests.fixture_data import write_product_asset


class TilerTests(unittest.TestCase):
    def test_tile_bounds_lonlat(self) -> None:
        west, south, east, north = tile_bounds_lonlat(2, 1, 1)
        self.assertLess(west, east)
        self.assertLess(south, north)

    def test_render_tile_png_returns_png_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            metadata = write_product_asset(data_root)
            payload = render_tile_png(metadata["netcdf_path"], "temperature_2m", 3, 2, 3)
        self.assertTrue(payload.startswith(b"\x89PNG\r\n\x1a\n"))


if __name__ == "__main__":
    unittest.main()
