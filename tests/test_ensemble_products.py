from pathlib import Path
import tempfile
import unittest

import numpy as np
import xarray as xr

from pipelines.ingest.ensemble_products import ENSEMBLE_MEMBER_ID, build_ensemble_products
from tests.fixture_data import sample_manifest, write_manifest


class EnsembleProductTests(unittest.TestCase):
    def test_build_ensemble_mean_spread_and_probability(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            lat = xr.DataArray(np.array([[35.0, 35.0], [34.0, 34.0]], dtype=np.float32), dims=("y", "x"))
            lon = xr.DataArray(np.array([[-81.0, -80.0], [-81.0, -80.0]], dtype=np.float32), dims=("y", "x"))
            self.write_member_asset(
                root,
                "2026032300",
                "m00",
                "temperature_2m",
                "TMP_2m",
                np.array([[273.15, 274.15], [275.15, 276.15]], dtype=np.float32),
                lat,
                lon,
            )
            self.write_member_asset(
                root,
                "2026032300",
                "m01",
                "temperature_2m",
                "TMP_2m",
                np.array([[275.15, 276.15], [277.15, 278.15]], dtype=np.float32),
                lat,
                lon,
            )
            self.write_member_asset(
                root,
                "2026032300",
                "m00",
                "qpf",
                "APCP_surface",
                np.array([[0.0, 5.0], [1.0, 4.0]], dtype=np.float32),
                lat,
                lon,
            )
            self.write_member_asset(
                root,
                "2026032300",
                "m01",
                "qpf",
                "APCP_surface",
                np.array([[3.0, 0.0], [4.0, 5.0]], dtype=np.float32),
                lat,
                lon,
            )
            self.write_member_asset(
                root,
                "2026032300",
                "m00",
                "helicity_0_1km",
                "HLCY_1000m",
                np.array([[150.0, 80.0], [120.0, 40.0]], dtype=np.float32),
                lat,
                lon,
            )
            self.write_member_asset(
                root,
                "2026032300",
                "m01",
                "helicity_0_1km",
                "HLCY_1000m",
                np.array([[80.0, 120.0], [140.0, 60.0]], dtype=np.float32),
                lat,
                lon,
            )
            self.write_member_asset(
                root,
                "2026032300",
                "m00",
                "shear_u_0_6km",
                "VUCSH_6000m",
                np.array([[21.0, 8.0], [12.0, 18.0]], dtype=np.float32),
                lat,
                lon,
            )
            self.write_member_asset(
                root,
                "2026032300",
                "m00",
                "shear_v_0_6km",
                "VVCSH_6000m",
                np.array([[0.0, 6.0], [18.0, 5.0]], dtype=np.float32),
                lat,
                lon,
            )
            self.write_member_asset(
                root,
                "2026032300",
                "m01",
                "shear_u_0_6km",
                "VUCSH_6000m",
                np.array([[15.0, 4.0], [10.0, 25.0]], dtype=np.float32),
                lat,
                lon,
            )
            self.write_member_asset(
                root,
                "2026032300",
                "m01",
                "shear_v_0_6km",
                "VVCSH_6000m",
                np.array([[15.0, 3.0], [6.0, 5.0]], dtype=np.float32),
                lat,
                lon,
            )
            manifest_root = root / "data" / "processed"
            write_manifest(
                manifest_root,
                sample_manifest(run_id="2026032300", members=["m00", "m01"], forecast_hours=[0]),
            )

            catalog = build_ensemble_products(
                run_id="2026032300",
                forecast_hour=0,
                overlays=[
                    "temperature_2m_mean",
                    "temperature_2m_spread",
                    "qpf_probability_gt_0p10",
                    "helicity_0_1km_probability_gt_100",
                    "shear_0_6km_probability_gt_40kt",
                ],
                domains=["conus"],
                members=["m00", "m01"],
                manifest_path=manifest_root / "manifests" / "2026032300.json",
                product_dir=root,
            )
            self.assertEqual(5, len([artifact for artifact in catalog["artifacts"] if artifact["status"] == "built"]))

            mean_path = root / "2026032300" / ENSEMBLE_MEMBER_ID / "temperature_2m_mean" / "f000" / "conus.nc"
            spread_path = root / "2026032300" / ENSEMBLE_MEMBER_ID / "temperature_2m_spread" / "f000" / "conus.nc"
            prob_path = root / "2026032300" / ENSEMBLE_MEMBER_ID / "qpf_probability_gt_0p10" / "f000" / "conus.nc"
            helicity_prob_path = root / "2026032300" / ENSEMBLE_MEMBER_ID / "helicity_0_1km_probability_gt_100" / "f000" / "conus.nc"
            shear_prob_path = root / "2026032300" / ENSEMBLE_MEMBER_ID / "shear_0_6km_probability_gt_40kt" / "f000" / "conus.nc"

            with xr.open_dataset(mean_path) as dataset:
                values = dataset[list(dataset.data_vars)[0]].values
                self.assertAlmostEqual(274.15, float(values[0, 0]), places=2)
            with xr.open_dataset(spread_path) as dataset:
                values = dataset[list(dataset.data_vars)[0]].values
                self.assertAlmostEqual(1.0, float(values[0, 0]), places=2)
            with xr.open_dataset(prob_path) as dataset:
                values = dataset[list(dataset.data_vars)[0]].values
                self.assertAlmostEqual(50.0, float(values[0, 0]), places=2)
                self.assertAlmostEqual(100.0, float(values[1, 1]), places=2)
            with xr.open_dataset(helicity_prob_path) as dataset:
                values = dataset[list(dataset.data_vars)[0]].values
                self.assertAlmostEqual(50.0, float(values[0, 0]), places=2)
                self.assertAlmostEqual(100.0, float(values[1, 0]), places=2)
            with xr.open_dataset(shear_prob_path) as dataset:
                values = dataset[list(dataset.data_vars)[0]].values
                self.assertAlmostEqual(100.0, float(values[0, 0]), places=2)
                self.assertAlmostEqual(0.0, float(values[0, 1]), places=2)

    def write_member_asset(
        self,
        root: Path,
        run_id: str,
        member: str,
        overlay_id: str,
        variable_name: str,
        values: np.ndarray,
        latitude: xr.DataArray,
        longitude: xr.DataArray,
    ) -> None:
        output_dir = root / run_id / member / overlay_id / "f000"
        output_dir.mkdir(parents=True, exist_ok=True)
        netcdf_path = output_dir / "conus.nc"
        dataset = xr.Dataset(
            {
                variable_name: xr.DataArray(values, dims=("y", "x")),
                "latitude": latitude,
                "longitude": longitude,
            }
        )
        dataset.to_netcdf(netcdf_path)
        (output_dir / "conus.json").write_text(
            (
                "{\n"
                f'  "bbox": [-82.0, 33.0, -79.0, 36.0],\n'
                f'  "domain_id": "conus",\n'
                f'  "forecast_hour": 0,\n'
                f'  "member": "{member}",\n'
                f'  "netcdf_path": "{netcdf_path.as_posix()}",\n'
                f'  "overlay_id": "{overlay_id}",\n'
                f'  "run_id": "{run_id}"\n'
                "}\n"
            ),
            encoding="utf-8",
        )


if __name__ == "__main__":
    unittest.main()
