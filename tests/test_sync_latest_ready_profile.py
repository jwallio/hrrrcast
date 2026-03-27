from pathlib import Path
import tempfile
import unittest

from scripts.sync_latest_ready_profile import profile_is_current, resolve_members
from tests.fixture_data import sample_manifest, write_product_asset


class SyncLatestReadyProfileTests(unittest.TestCase):
    def test_resolve_members_defaults_to_full_ensemble(self) -> None:
        manifest = sample_manifest(run_id="2026032300")
        members = resolve_members(manifest, None, False)
        self.assertEqual(manifest["run"]["members"], members)

    def test_resolve_members_honors_single_member_override(self) -> None:
        manifest = sample_manifest(run_id="2026032300")
        members = resolve_members(manifest, "m03", False)
        self.assertEqual(["m03"], members)

    def test_profile_is_current_false_without_state(self) -> None:
        self.assertFalse(
            profile_is_current(
                None,
                "2026032300",
                {
                    "forecast_hours": [0],
                    "overlays": ["temperature_2m"],
                    "domains": ["conus"],
                },
                "data/processed/products",
            )
        )

    def test_profile_is_current_true_for_existing_sample_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            write_product_asset(data_root, run_id="2026032300", overlay_id="temperature_2m")
            write_product_asset(
                data_root,
                run_id="2026032300",
                overlay_id="mslp",
                variable_name="MSLMA_surface",
                field_key="MSLMA:mean sea level",
            )
            state = {
                "run_id": "2026032300",
                "member": "m00",
                "forecast_hours": [0],
                "overlays": ["temperature_2m", "mslp"],
                "domains": ["conus"],
            }
            plan = {
                "forecast_hours": [0],
                "overlays": ["temperature_2m", "mslp"],
                "domains": ["conus"],
            }
            self.assertTrue(profile_is_current(state, "2026032300", plan, data_root / "products"))


if __name__ == "__main__":
    unittest.main()
