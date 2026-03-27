from pathlib import Path
import tempfile
import unittest

from pipelines.ingest.products import (
    PRODUCT_SPECS,
    invalidate_catalog_tile_cache,
    merge_artifacts,
    resolve_product_spec,
    sanitize_name,
)


class ProductHelpersTests(unittest.TestCase):
    def test_sanitize_name(self) -> None:
        self.assertEqual("tmp_2_m_above_ground", sanitize_name("TMP:2 m above ground"))

    def test_has_initial_single_field_product_specs(self) -> None:
        self.assertEqual("single_field", PRODUCT_SPECS["temperature_2m"].mode)
        self.assertEqual("TMP:2 m above ground", PRODUCT_SPECS["temperature_2m"].field_key)
        self.assertEqual("single_field", PRODUCT_SPECS["dewpoint_2m"].mode)
        self.assertEqual("single_field", PRODUCT_SPECS["height_500mb"].mode)
        self.assertEqual("single_field", PRODUCT_SPECS["mslp"].mode)
        self.assertEqual("derived_ptype", PRODUCT_SPECS["ptype"].mode)
        self.assertEqual("derived_wind_speed", PRODUCT_SPECS["wind_10m"].mode)
        self.assertEqual("deferred", PRODUCT_SPECS["snowfall"].mode)

    def test_merge_artifacts_replaces_matching_overlay_domain(self) -> None:
        existing = [
            {
                "run_id": "2026032300",
                "member": "m00",
                "forecast_hour": 0,
                "overlay_id": "temperature_2m",
                "domain_id": "conus",
                "status": "built",
                "variable_name": "old",
            }
        ]
        new = [
            {
                "run_id": "2026032300",
                "member": "m00",
                "forecast_hour": 0,
                "overlay_id": "temperature_2m",
                "domain_id": "conus",
                "status": "built",
                "variable_name": "new",
            },
            {
                "run_id": "2026032300",
                "member": "m00",
                "forecast_hour": 0,
                "overlay_id": "mslp",
                "domain_id": "conus",
                "status": "built",
                "variable_name": "mslp",
            },
        ]
        merged = merge_artifacts(existing, new)
        self.assertEqual(2, len(merged))
        values = {artifact["overlay_id"]: artifact["variable_name"] for artifact in merged}
        self.assertEqual("new", values["temperature_2m"])
        self.assertEqual("mslp", values["mslp"])

    def test_invalidate_catalog_tile_cache_drops_built_overlay_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            target = (
                Path(tmpdir)
                / "2026032300"
                / "m00"
                / "temperature_2m"
                / "f000"
                / "conus"
                / "3"
                / "2"
            )
            target.mkdir(parents=True, exist_ok=True)
            (target / "3.png").write_bytes(b"png")
            artifacts = [
                {
                    "run_id": "2026032300",
                    "member": "m00",
                    "forecast_hour": 0,
                    "overlay_id": "temperature_2m",
                    "domain_id": "conus",
                    "status": "built",
                },
                {
                    "run_id": "2026032300",
                    "member": "m00",
                    "forecast_hour": 0,
                    "overlay_id": "temperature_2m",
                    "domain_id": "conus",
                    "status": "built",
                },
            ]
            removed = invalidate_catalog_tile_cache("2026032300", "m00", 0, artifacts, tmpdir)
            self.assertEqual(1, removed)
            self.assertFalse((Path(tmpdir) / "2026032300" / "m00" / "temperature_2m" / "f000" / "conus").exists())

    def test_resolve_product_spec_for_native_field_overlay(self) -> None:
        spec = resolve_product_spec("field_tmp_2_m_above_ground", {"TMP:2 m above ground"})
        self.assertEqual("single_field", spec.mode)
        self.assertEqual("TMP:2 m above ground", spec.field_key)


if __name__ == "__main__":
    unittest.main()
