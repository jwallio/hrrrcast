import unittest

from pipelines.ingest.build_profiles import load_build_profiles, resolve_build_profile
from services.shared.store import get_run_manifest


class BuildProfileTests(unittest.TestCase):
    def test_load_build_profiles(self) -> None:
        payload = load_build_profiles("config/build-profiles.json")
        self.assertEqual("core_operational", payload["defaultProfile"])
        self.assertIn("core_operational", payload["profilesById"])

    def test_resolve_core_operational_profile(self) -> None:
        manifest = get_run_manifest("2026032300")
        plan = resolve_build_profile(manifest, "m00", "core_operational", "config/build-profiles.json")
        self.assertEqual(49, len(plan["forecast_hours"]))
        self.assertEqual(15, len(plan["overlays"]))
        self.assertEqual(6, len(plan["ensemble_overlays"]))
        self.assertTrue(plan["build_ensemble_derived"])
        self.assertEqual(7, len(plan["domains"]))

    def test_resolve_full_native_sample_profile(self) -> None:
        manifest = get_run_manifest("2026032300")
        plan = resolve_build_profile(manifest, "m00", "full_native_sample", "config/build-profiles.json")
        self.assertEqual([0], plan["forecast_hours"])
        self.assertGreaterEqual(len(plan["overlays"]), 179)


if __name__ == "__main__":
    unittest.main()
