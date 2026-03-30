from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from services.shared.point_series import build_point_series, search_stations
from tests.fixture_data import write_product_asset


class PointSeriesTests(unittest.TestCase):
    def test_search_stations_matches_aliases(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            catalog_path = Path(tmpdir) / "stations.json"
            catalog_path.write_text(
                json.dumps(
                    {
                        "stations": [
                            {
                                "id": "KATL",
                                "aliases": ["ATL"],
                                "site": "Atlanta International",
                                "lat": 33.64,
                                "lon": -84.43,
                                "elev": 313,
                                "state": "GA",
                                "country": "US",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            matches = search_stations("atl", path=catalog_path)
        self.assertEqual(matches[0]["id"], "KATL")

    def test_build_point_series_returns_member_and_derived_series(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            catalog_path = Path(tmpdir) / "stations.json"
            catalog_path.write_text(
                json.dumps(
                    {
                        "stations": [
                            {
                                "id": "KCLT",
                                "aliases": ["CLT"],
                                "site": "Charlotte",
                                "lat": 35.0,
                                "lon": -80.0,
                                "elev": 200,
                                "state": "NC",
                                "country": "US",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            write_product_asset(
                data_root,
                run_id="2026032820",
                member="ens",
                overlay_id="helicity_0_1km_probability_gt_100",
                forecast_hour=0,
                variable_name="prob",
                values=np.array([[0.0, 20.0], [40.0, 80.0]], dtype=np.float32),
                field_key="HLCY:1000-0 m above ground",
            )
            write_product_asset(
                data_root,
                run_id="2026032820",
                member="ens",
                overlay_id="helicity_0_1km_probability_gt_100",
                forecast_hour=1,
                variable_name="prob",
                values=np.array([[0.0, 30.0], [50.0, 90.0]], dtype=np.float32),
                field_key="HLCY:1000-0 m above ground",
            )

            write_product_asset(
                data_root,
                run_id="2026032820",
                member="m00",
                overlay_id="shear_u_0_6km",
                forecast_hour=0,
                variable_name="u",
                values=np.array([[3.0, 4.0], [0.0, 0.0]], dtype=np.float32),
                field_key="VUCSH:6000-0 m above ground",
            )
            write_product_asset(
                data_root,
                run_id="2026032820",
                member="m00",
                overlay_id="shear_v_0_6km",
                forecast_hour=0,
                variable_name="v",
                values=np.array([[4.0, 3.0], [0.0, 0.0]], dtype=np.float32),
                field_key="VVCSH:6000-0 m above ground",
            )

            ens_payload = build_point_series(
                "2026032820",
                "KCLT",
                "ens",
                data_root=data_root,
                station_catalog_path=catalog_path,
            )
            m00_payload = build_point_series(
                "2026032820",
                "KCLT",
                "m00",
                data_root=data_root,
                station_catalog_path=catalog_path,
            )

        self.assertIn("helicity_0_1km_probability_gt_100", ens_payload["series"])
        self.assertEqual(len(ens_payload["series"]["helicity_0_1km_probability_gt_100"]["points"]), 2)
        self.assertIn("shear_0_6km_speed", m00_payload["series"])
        self.assertAlmostEqual(m00_payload["series"]["shear_0_6km_speed"]["points"][0]["value"], 5.0, places=4)

    def test_build_point_series_scales_fractional_probability_to_percent(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            catalog_path = Path(tmpdir) / "stations.json"
            catalog_path.write_text(
                json.dumps(
                    {
                        "stations": [
                            {
                                "id": "KRDU",
                                "aliases": ["RDU"],
                                "site": "Raleigh-Durham",
                                "lat": 35.9,
                                "lon": -78.8,
                                "elev": 132,
                                "state": "NC",
                                "country": "US",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            write_product_asset(
                data_root,
                run_id="2026032820",
                member="ens",
                overlay_id="helicity_0_1km_probability_gt_100",
                forecast_hour=0,
                variable_name="prob",
                values=np.array([[0.00, 0.25], [0.50, 0.75]], dtype=np.float32),
                field_key="HLCY:1000-0 m above ground",
            )

            payload = build_point_series(
                "2026032820",
                "KRDU",
                "ens",
                overlays=["helicity_0_1km_probability_gt_100"],
                data_root=data_root,
                station_catalog_path=catalog_path,
            )

        series = payload["series"]["helicity_0_1km_probability_gt_100"]
        self.assertEqual(series["units"], "%")
        self.assertAlmostEqual(series["points"][0]["value"], 25.0, places=4)
        self.assertAlmostEqual(series["summary"]["max"], 25.0, places=4)
        self.assertFalse(series["summary"]["all_zero"])

    def test_build_point_series_adds_ensemble_distribution_series(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            data_root = Path(tmpdir) / "data" / "processed"
            catalog_path = Path(tmpdir) / "stations.json"
            catalog_path.write_text(
                json.dumps(
                    {
                        "stations": [
                            {
                                "id": "KRDU",
                                "aliases": ["RDU"],
                                "site": "Raleigh-Durham",
                                "lat": 35.9,
                                "lon": -78.8,
                                "elev": 132,
                                "state": "NC",
                                "country": "US",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            for member_id, value in [("m00", 100.0), ("m01", 200.0), ("m02", 300.0)]:
                write_product_asset(
                    data_root,
                    run_id="2026032820",
                    member=member_id,
                    overlay_id="cape",
                    forecast_hour=0,
                    variable_name="cape",
                    values=np.array([[0.0, value], [0.0, 0.0]], dtype=np.float32),
                    field_key="CAPE:surface",
                )

            payload = build_point_series(
                "2026032820",
                "KRDU",
                "ens",
                data_root=data_root,
                station_catalog_path=catalog_path,
            )

        series = payload["series"]["cape_member_spread"]
        self.assertEqual(series["chart_type"], "distribution")
        self.assertEqual(len(series["points"]), 1)
        point = series["points"][0]
        self.assertAlmostEqual(point["median"], 200.0, places=4)
        self.assertAlmostEqual(point["min"], 100.0, places=4)
        self.assertAlmostEqual(point["max"], 300.0, places=4)
        self.assertEqual(point["member_values"], [100.0, 200.0, 300.0])


if __name__ == "__main__":
    unittest.main()
