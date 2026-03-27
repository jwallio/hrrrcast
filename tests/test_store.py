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


class StoreTests(unittest.TestCase):
    def test_product_catalog_exists_for_sample_run(self) -> None:
        catalog = get_product_catalog("2026032300", "m00", 0)
        self.assertEqual("2026032300", catalog["run_id"])
        self.assertEqual("m00", catalog["member"])
        self.assertGreaterEqual(len(catalog["artifacts"]), 49)

    def test_asset_metadata_exists_for_sample_product(self) -> None:
        metadata = get_asset_metadata("2026032300", "m00", "temperature_2m", 0, "conus")
        self.assertEqual("temperature_2m", metadata["overlay_id"])
        self.assertEqual("conus", metadata["domain_id"])

    def test_run_availability_summary(self) -> None:
        availability = build_run_availability("2026032300")
        self.assertEqual("ready", availability["status"])
        self.assertIn("m00", availability["members"])

    def test_latest_ready_manifest(self) -> None:
        manifest = latest_ready_manifest()
        self.assertEqual("ready", manifest["run"]["status"])
        self.assertEqual(str(manifest["run"]["run_id"]), resolve_run_selector("latest-ready"))

    def test_resolve_run_selector(self) -> None:
        self.assertEqual(str(latest_ready_manifest()["run"]["run_id"]), resolve_run_selector("latest-ready"))
        self.assertEqual(str(latest_manifest()["run"]["run_id"]), resolve_run_selector("latest"))
        self.assertEqual("2026032401", resolve_run_selector("2026032401"))

    def test_build_layers_index_includes_native_weather_overlays(self) -> None:
        payload = build_layers_index("config/layers.json")
        self.assertIn("nativeWeatherOverlays", payload)
        self.assertGreaterEqual(payload["nativeFieldCount"], 172)
        native_ids = {entry["id"] for entry in payload["nativeWeatherOverlays"]}
        self.assertIn("field_tmp_2_m_above_ground", native_ids)


if __name__ == "__main__":
    unittest.main()
