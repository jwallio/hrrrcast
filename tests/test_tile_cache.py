from pathlib import Path
import tempfile
import unittest

from services.shared.tiler import build_tile_cache_path, invalidate_tile_cache, tile_range_for_bbox


class TileCacheTests(unittest.TestCase):
    def test_build_tile_cache_path(self) -> None:
        path = build_tile_cache_path(
            run_id="2026032300",
            member="m00",
            overlay_id="temperature_2m",
            forecast_hour=0,
            domain_id="conus",
            z=3,
            x=2,
            y=3,
        )
        self.assertTrue(str(path).endswith("2026032300\\m00\\temperature_2m\\f000\\conus\\3\\2\\3.png"))

    def test_invalidate_tile_cache_removes_matching_tree(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_file = build_tile_cache_path(
                run_id="2026032300",
                member="m00",
                overlay_id="temperature_2m",
                forecast_hour=0,
                domain_id="conus",
                z=3,
                x=2,
                y=3,
                cache_root=tmpdir,
            )
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_bytes(b"png")
            self.assertTrue(Path(cache_file).exists())
            removed = invalidate_tile_cache("2026032300", "m00", "temperature_2m", 0, "conus", tmpdir)
            self.assertEqual(1, removed)
            self.assertFalse(cache_file.parent.exists())

    def test_tile_range_for_bbox(self) -> None:
        x_range, y_range = tile_range_for_bbox([-127.0, 23.0, -66.0, 50.0], 3)
        self.assertGreater(len(x_range), 0)
        self.assertGreater(len(y_range), 0)


if __name__ == "__main__":
    unittest.main()
