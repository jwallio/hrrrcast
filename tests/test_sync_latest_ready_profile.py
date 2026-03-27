import unittest

from scripts.sync_latest_ready_profile import profile_is_current, resolve_members
from services.shared.store import get_run_manifest


class SyncLatestReadyProfileTests(unittest.TestCase):
    def test_resolve_members_defaults_to_full_ensemble(self) -> None:
        manifest = get_run_manifest("2026032300")
        members = resolve_members(manifest, None, False)
        self.assertEqual(manifest["run"]["members"], members)

    def test_resolve_members_honors_single_member_override(self) -> None:
        manifest = get_run_manifest("2026032300")
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
        self.assertTrue(profile_is_current(state, "2026032300", plan, "data/processed/products"))


if __name__ == "__main__":
    unittest.main()
