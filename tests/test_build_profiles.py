import unittest

from pipelines.ingest.build_profiles import load_build_profiles, resolve_build_profile
from tests.fixture_data import sample_manifest


class BuildProfileTests(unittest.TestCase):
    def test_load_build_profiles(self) -> None:
        payload = load_build_profiles("config/build-profiles.json")
        self.assertEqual("core_operational", payload["defaultProfile"])
        self.assertIn("core_operational", payload["profilesById"])

    def test_resolve_core_operational_profile(self) -> None:
        manifest = sample_manifest(run_id="2026032300", forecast_hours=list(range(49)))
        plan = resolve_build_profile(manifest, "m00", "core_operational", "config/build-profiles.json")
        self.assertEqual(49, len(plan["forecast_hours"]))
        self.assertEqual(58, len(plan["overlays"]))
        self.assertEqual(6, len(plan["ensemble_overlays"]))
        self.assertTrue(plan["build_ensemble_derived"])
        self.assertEqual(7, len(plan["domains"]))

    def test_resolve_full_native_sample_profile(self) -> None:
        manifest = sample_manifest(run_id="2026032300", forecast_hours=list(range(49)))
        plan = resolve_build_profile(manifest, "m00", "full_native_sample", "config/build-profiles.json")
        self.assertEqual([0], plan["forecast_hours"])
        self.assertGreaterEqual(len(plan["overlays"]), 230)

    def test_resolve_pages_member_snapshot_profile(self) -> None:
        manifest = sample_manifest(run_id="2026032300", forecast_hours=list(range(19)))
        plan = resolve_build_profile(manifest, "m00", "pages_member_snapshot", "config/build-profiles.json")
        self.assertEqual(19, len(plan["forecast_hours"]))
        self.assertEqual(58, len(plan["overlays"]))
        self.assertEqual([], plan["ensemble_overlays"])
        self.assertFalse(plan["build_ensemble_derived"])
        self.assertEqual(["conus"], plan["domains"])


if __name__ == "__main__":
    unittest.main()
