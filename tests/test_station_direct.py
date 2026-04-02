from __future__ import annotations

import unittest
from unittest import mock

from services.shared.station_direct import build_station_payloads_from_manifest
from tests.fixture_data import sample_manifest


class StationDirectTests(unittest.TestCase):
    def test_build_station_payloads_from_manifest_uses_direct_samples(self) -> None:
        manifest = sample_manifest(
            run_id="2026040115",
            members=["m00", "m01", "m02"],
            forecast_hours=[0, 1],
            status="ready",
        )
        station_records = {
            "KRDU": {
                "id": "KRDU",
                "aliases": ["RDU"],
                "site": "Raleigh-Durham",
                "lat": 35.9,
                "lon": -78.8,
                "elev": 132,
                "state": "NC",
                "country": "US",
            }
        }
        raw_store = {
            "m00": {
                "temperature_2m": {
                    0: {"KRDU": 273.15},
                    1: {"KRDU": 274.15},
                },
                "qpf": {
                    0: {"KRDU": 1.0},
                    1: {"KRDU": 3.0},
                },
            },
            "m01": {
                "temperature_2m": {
                    0: {"KRDU": 274.15},
                    1: {"KRDU": 275.15},
                },
                "qpf": {
                    0: {"KRDU": 3.0},
                    1: {"KRDU": 0.0},
                },
            },
            "m02": {
                "temperature_2m": {
                    0: {"KRDU": 275.15},
                    1: {"KRDU": 276.15},
                },
                "qpf": {
                    0: {"KRDU": 4.0},
                    1: {"KRDU": 5.0},
                },
            },
        }

        with mock.patch("services.shared.station_direct.collect_raw_station_samples", return_value=raw_store):
            payloads = build_station_payloads_from_manifest(
                manifest=manifest,
                station_records=station_records,
                export_members=["ens", "m00", "m01", "m02"],
            )

        m00_payload = payloads[("m00", "KRDU")]
        m01_payload = payloads[("m01", "KRDU")]
        ens_payload = payloads[("ens", "KRDU")]

        self.assertEqual(["ens", "m00", "m01", "m02"], m00_payload["available_members"])
        self.assertIn("temperature_2m", m00_payload["series"])
        self.assertAlmostEqual(m00_payload["series"]["temperature_2m"]["points"][0]["value"], 32.0, places=1)
        self.assertEqual("m01", m01_payload["member"])
        self.assertAlmostEqual(m01_payload["series"]["temperature_2m"]["points"][0]["value"], 33.8, places=1)

        self.assertEqual(["ens", "m00", "m01", "m02"], ens_payload["available_members"])
        self.assertIn("qpf_probability_gt_0p10", ens_payload["series"])
        self.assertAlmostEqual(ens_payload["series"]["qpf_probability_gt_0p10"]["points"][0]["value"], 66.6666, places=3)
        self.assertFalse(any(series.get("chart_type") == "distribution" for series in ens_payload["series"].values()))


if __name__ == "__main__":
    unittest.main()
