import unittest

from services.shared.preview import render_preview_png


class RendererTests(unittest.TestCase):
    def test_render_preview_png_returns_png_bytes(self) -> None:
        payload = render_preview_png(
            "data/processed/products/2026032300/m00/temperature_2m/f000/conus.nc",
            "temperature_2m",
            max_dimension=256,
        )
        self.assertTrue(payload.startswith(b"\x89PNG\r\n\x1a\n"))


if __name__ == "__main__":
    unittest.main()
