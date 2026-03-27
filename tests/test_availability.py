import unittest

from pipelines.ingest.availability import evaluate_overlay_availability


class OverlayAvailabilityTests(unittest.TestCase):
    def test_availability_marks_simple_mvp_fields(self) -> None:
        field_keys = {
            "APCP:surface",
            "CFRZR:surface",
            "CRAIN:surface",
            "MSLMA:mean sea level",
            "REFC:entire atmosphere",
            "TMP:2 m above ground",
            "UGRD:10 m above ground",
            "VGRD:10 m above ground",
        }
        availability = evaluate_overlay_availability(field_keys)
        self.assertTrue(availability["composite_reflectivity"].available)
        self.assertTrue(availability["temperature_2m"].available)
        self.assertTrue(availability["ptype"].available)
        self.assertTrue(availability["mslp"].available)
        self.assertTrue(availability["qpf"].available)
        self.assertTrue(availability["wind_10m"].available)
        self.assertFalse(availability["snowfall"].available)
        self.assertEqual(
            ["CSNOW:surface", "SNOD:surface", "WEASD:surface"],
            availability["snowfall"].missing_any_of,
        )


if __name__ == "__main__":
    unittest.main()
