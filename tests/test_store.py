from pathlib import Path
import tempfile
import unittest

from services.shared.store import (
    build_layers_index,
    build_run_availability,
    get_asset_metadata,
    get_product_catalog,
    latest_manifest,
    latest_ready_manifest,
    resolve_run_selector,
)
from tests.fixture_data import sample_manifest, write_manifest, write_product_asset


class StoreTests(unittest.TestCase):
    def test_product_catalog_exists_for_sample_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            write_product_asset(data_root)
            catalog = get_product_catalog("2026032617", "m00", 0, data_root)
        self.assertEqual("2026032617", catalog["run_id"])
        self.assertEqual("m00", catalog["member"])
        self.assertGreaterEqual(len(catalog["artifacts"]), 1)

    def test_asset_metadata_exists_for_sample_product(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            write_product_asset(data_root)
            metadata = get_asset_metadata("2026032617", "m00", "temperature_2m", 0, "conus", data_root)
        self.assertEqual("temperature_2m", metadata["overlay_id"])
        self.assertEqual("conus", metadata["domain_id"])

    def test_run_availability_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            write_manifest(data_root, sample_manifest())
            availability = build_run_availability("2026032617", data_root)
        self.assertEqual("ready", availability["status"])
        self.assertIn("m00", availability["members"])

    def test_latest_ready_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            ready_manifest = sample_manifest(run_id="2026032617", status="ready")
            latest_partial = sample_manifest(run_id="2026032619", members=["m00"], forecast_hours=list(range(8)), status="partial")
            write_manifest(data_root, ready_manifest)
            write_manifest(data_root, latest_partial, latest=True)
            manifest = latest_ready_manifest(data_root)
            self.assertEqual("ready", manifest["run"]["status"])
            self.assertEqual(str(manifest["run"]["run_id"]), resolve_run_selector("latest-ready", data_root))

    def test_resolve_run_selector(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            ready_manifest = sample_manifest(run_id="2026032617", status="ready")
            latest_partial = sample_manifest(run_id="2026032619", members=["m00"], forecast_hours=list(range(8)), status="partial")
            write_manifest(data_root, ready_manifest)
            write_manifest(data_root, latest_partial, latest=True)
            self.assertEqual(str(latest_ready_manifest(data_root)["run"]["run_id"]), resolve_run_selector("latest-ready", data_root))
            self.assertEqual(str(latest_manifest(data_root)["run"]["run_id"]), resolve_run_selector("latest", data_root))
            self.assertEqual("2026032401", resolve_run_selector("2026032401", data_root))

    def test_build_layers_index_includes_native_weather_overlays(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            write_manifest(data_root, sample_manifest())
            payload = build_layers_index("config/layers.json", data_root)
        self.assertIn("nativeWeatherOverlays", payload)
        self.assertGreaterEqual(payload["nativeFieldCount"], 172)
        native_ids = {entry["id"] for entry in payload["nativeWeatherOverlays"]}
        self.assertIn("field_tmp_2_m_above_ground", native_ids)


if __name__ == "__main__":
    unittest.main()
