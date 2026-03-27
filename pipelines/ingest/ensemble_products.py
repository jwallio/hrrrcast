"""Derived ensemble products built from processed member NetCDF assets."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
from pathlib import Path

import numpy as np
import xarray as xr

from .products import DEFAULT_PRODUCT_DIR, merge_artifacts, invalidate_catalog_tile_cache
from .settings import DEFAULT_MANIFEST_DIR
from services.shared.store import get_run_manifest


ENSEMBLE_MEMBER_ID = "ens"


@dataclass(frozen=True)
class EnsembleProductSpec:
    overlay_id: str
    source_overlay_id: str | None
    mode: str
    source_overlay_ids: tuple[str, ...] = ()
    threshold: float | None = None
    threshold_units: str | None = None
    threshold_raw: float | None = None
    notes: str | None = None


ENSEMBLE_PRODUCT_SPECS: dict[str, EnsembleProductSpec] = {
    "temperature_2m_mean": EnsembleProductSpec(
        overlay_id="temperature_2m_mean",
        source_overlay_id="temperature_2m",
        mode="mean",
        notes="Ensemble mean of 2 m temperature from all processed members.",
    ),
    "temperature_2m_spread": EnsembleProductSpec(
        overlay_id="temperature_2m_spread",
        source_overlay_id="temperature_2m",
        mode="spread",
        notes="Ensemble standard deviation of 2 m temperature from all processed members.",
    ),
    "qpf_probability_gt_0p10": EnsembleProductSpec(
        overlay_id="qpf_probability_gt_0p10",
        source_overlay_id="qpf",
        mode="probability",
        threshold=0.10,
        threshold_units="in",
        threshold_raw=2.54,
        notes="Probability that accumulated precipitation exceeds 0.10 in.",
    ),
    "wind_10m_probability_gt_25kt": EnsembleProductSpec(
        overlay_id="wind_10m_probability_gt_25kt",
        source_overlay_id="wind_10m",
        mode="probability",
        threshold=25.0,
        threshold_units="kt",
        threshold_raw=12.8611,
        notes="Probability that 10 m wind speed exceeds 25 kt.",
    ),
    "composite_reflectivity_probability_gt_40dbz": EnsembleProductSpec(
        overlay_id="composite_reflectivity_probability_gt_40dbz",
        source_overlay_id="composite_reflectivity",
        mode="probability",
        threshold=40.0,
        threshold_units="dBZ",
        threshold_raw=40.0,
        notes="Probability that composite reflectivity exceeds 40 dBZ.",
    ),
    "cape_probability_gt_1000": EnsembleProductSpec(
        overlay_id="cape_probability_gt_1000",
        source_overlay_id="cape",
        mode="probability",
        threshold=1000.0,
        threshold_units="J/kg",
        threshold_raw=1000.0,
        notes="Probability that surface CAPE exceeds 1000 J/kg.",
    ),
    "helicity_0_1km_probability_gt_100": EnsembleProductSpec(
        overlay_id="helicity_0_1km_probability_gt_100",
        source_overlay_id="helicity_0_1km",
        mode="probability",
        threshold=100.0,
        threshold_units="m2/s2",
        threshold_raw=100.0,
        notes="Probability that 0 to 1 km storm-relative helicity exceeds 100 m2/s2.",
    ),
    "helicity_0_3km_probability_gt_250": EnsembleProductSpec(
        overlay_id="helicity_0_3km_probability_gt_250",
        source_overlay_id="helicity_0_3km",
        mode="probability",
        threshold=250.0,
        threshold_units="m2/s2",
        threshold_raw=250.0,
        notes="Probability that 0 to 3 km storm-relative helicity exceeds 250 m2/s2.",
    ),
    "shear_0_1km_probability_gt_20kt": EnsembleProductSpec(
        overlay_id="shear_0_1km_probability_gt_20kt",
        source_overlay_id=None,
        source_overlay_ids=("shear_u_0_1km", "shear_v_0_1km"),
        mode="vector_probability",
        threshold=20.0,
        threshold_units="kt",
        threshold_raw=10.2889,
        notes="Probability that 0 to 1 km bulk shear magnitude exceeds 20 kt.",
    ),
    "shear_0_6km_probability_gt_40kt": EnsembleProductSpec(
        overlay_id="shear_0_6km_probability_gt_40kt",
        source_overlay_id=None,
        source_overlay_ids=("shear_u_0_6km", "shear_v_0_6km"),
        mode="vector_probability",
        threshold=40.0,
        threshold_units="kt",
        threshold_raw=20.5778,
        notes="Probability that 0 to 6 km bulk shear magnitude exceeds 40 kt.",
    ),
}


def ensemble_overlay_ids() -> list[str]:
    return sorted(ENSEMBLE_PRODUCT_SPECS)


def build_ensemble_products(
    run_id: str,
    forecast_hour: int,
    overlays: list[str],
    domains: list[str],
    members: list[str] | None = None,
    manifest_path: str | Path | None = None,
    product_dir: str | Path = DEFAULT_PRODUCT_DIR,
) -> dict[str, object]:
    manifest = load_manifest(run_id, manifest_path)
    resolved_members = members or [str(member) for member in manifest["run"]["members"]]
    artifacts: list[dict[str, object]] = []
    for overlay_id in overlays:
        spec = ENSEMBLE_PRODUCT_SPECS.get(overlay_id)
        if spec is None:
            artifacts.append(
                {
                    "overlay_id": overlay_id,
                    "status": "skipped",
                    "reason": "overlay is not a recognized ensemble product",
                }
            )
            continue
        for domain_id in domains:
            try:
                artifacts.append(
                    build_single_ensemble_product(
                        run_id=run_id,
                        forecast_hour=forecast_hour,
                        domain_id=domain_id,
                        members=resolved_members,
                        spec=spec,
                        product_dir=product_dir,
                    )
                )
            except FileNotFoundError as exc:
                artifacts.append(
                    {
                        "run_id": run_id,
                        "member": ENSEMBLE_MEMBER_ID,
                        "forecast_hour": forecast_hour,
                        "overlay_id": overlay_id,
                        "domain_id": domain_id,
                        "status": "skipped",
                        "reason": str(exc),
                    }
                )

    catalog_path = (
        Path(product_dir)
        / run_id
        / ENSEMBLE_MEMBER_ID
        / f"f{forecast_hour:03d}"
        / "catalog.json"
    )
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    existing_artifacts = []
    existing_overlays: list[str] = []
    existing_domains: list[str] = []
    if catalog_path.exists():
        existing_catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        existing_artifacts = existing_catalog.get("artifacts", [])
        existing_overlays = existing_catalog.get("overlays", [])
        existing_domains = existing_catalog.get("domains", [])
    merged_artifacts = merge_artifacts(existing_artifacts, artifacts)
    invalidated_cache_entries = invalidate_catalog_tile_cache(
        run_id=run_id,
        member=ENSEMBLE_MEMBER_ID,
        forecast_hour=forecast_hour,
        artifacts=artifacts,
    )
    catalog = {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "run_id": run_id,
        "member": ENSEMBLE_MEMBER_ID,
        "forecast_hour": forecast_hour,
        "source_members": resolved_members,
        "overlays": sorted(set(existing_overlays) | set(overlays)),
        "domains": sorted(set(existing_domains) | set(domains)),
        "artifacts": merged_artifacts,
        "tile_cache_invalidations": invalidated_cache_entries,
    }
    catalog_path.write_text(json.dumps(catalog, indent=2, sort_keys=True), encoding="utf-8")
    catalog["catalog_path"] = str(catalog_path)
    return catalog


def build_single_ensemble_product(
    run_id: str,
    forecast_hour: int,
    domain_id: str,
    members: list[str],
    spec: EnsembleProductSpec,
    product_dir: str | Path,
) -> dict[str, object]:
    metadata_sets, stacked, units = load_member_stack(
        run_id=run_id,
        forecast_hour=forecast_hour,
        domain_id=domain_id,
        members=members,
        spec=spec,
        product_dir=product_dir,
    )
    try:
        if spec.mode == "mean":
            derived = stacked.mean(dim="member").astype(np.float32)
            variable_name = f"{sanitize_id(spec.overlay_id).upper()}"
        elif spec.mode == "spread":
            derived = stacked.std(dim="member").astype(np.float32)
            variable_name = f"{sanitize_id(spec.overlay_id).upper()}"
        elif spec.mode == "probability":
            threshold_raw = float(spec.threshold_raw if spec.threshold_raw is not None else spec.threshold or 0.0)
            derived = (stacked >= threshold_raw).mean(dim="member").astype(np.float32) * 100.0
            variable_name = f"{sanitize_id(spec.overlay_id).upper()}"
            units = "%"
        elif spec.mode == "vector_probability":
            threshold_raw = float(spec.threshold_raw if spec.threshold_raw is not None else spec.threshold or 0.0)
            derived = (stacked >= threshold_raw).mean(dim="member").astype(np.float32) * 100.0
            variable_name = f"{sanitize_id(spec.overlay_id).upper()}"
            units = "%"
        else:  # pragma: no cover - guarded by spec table
            raise ValueError(f"Unsupported ensemble mode: {spec.mode}")

        derived.attrs.update(
            {
                "long_name": spec.overlay_id.replace("_", " "),
                "units": units or "",
            }
        )
        derived_dataset = derived.to_dataset(name=variable_name)
        first_dataset = metadata_sets[0]["dataset"]
        if "latitude" in first_dataset.variables:
            derived_dataset["latitude"] = first_dataset["latitude"].load()
        if "longitude" in first_dataset.variables:
            derived_dataset["longitude"] = first_dataset["longitude"].load()
    finally:
        for payload in metadata_sets:
            payload["dataset"].close()

    output_dir = Path(product_dir) / run_id / ENSEMBLE_MEMBER_ID / spec.overlay_id / f"f{forecast_hour:03d}"
    output_dir.mkdir(parents=True, exist_ok=True)
    netcdf_path = output_dir / f"{domain_id}.nc"
    derived_dataset.to_netcdf(netcdf_path)
    dataset_variable_name = list(derived_dataset.data_vars)[0]
    values = derived_dataset[dataset_variable_name].values
    first_meta = metadata_sets[0]["metadata"]
    metadata = {
        "run_id": run_id,
        "member": ENSEMBLE_MEMBER_ID,
        "forecast_hour": forecast_hour,
        "overlay_id": spec.overlay_id,
        "domain_id": domain_id,
        "bbox": first_meta["bbox"],
        "netcdf_path": str(netcdf_path),
        "variable_name": dataset_variable_name,
        "long_name": spec.notes or spec.overlay_id.replace("_", " "),
        "units": units,
        "shape": [int(size) for size in values.shape],
        "stats": {
            "min": float(np.nanmin(values)),
            "max": float(np.nanmax(values)),
        },
        "source_overlay_id": spec.source_overlay_id,
        "source_overlay_ids": list(spec.source_overlay_ids),
        "source_members": members,
        "ensemble_mode": spec.mode,
        "status": "built",
    }
    if spec.threshold is not None:
        metadata["threshold"] = spec.threshold
        metadata["threshold_units"] = spec.threshold_units
        metadata["threshold_raw"] = spec.threshold_raw
    if spec.notes:
        metadata["notes"] = spec.notes
    metadata_path = output_dir / f"{domain_id}.json"
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    metadata["metadata_path"] = str(metadata_path)
    return metadata


def load_member_metadata(
    run_id: str,
    member: str,
    overlay_id: str,
    forecast_hour: int,
    domain_id: str,
    product_dir: str | Path,
) -> dict[str, object]:
    path = (
        Path(product_dir)
        / run_id
        / member
        / overlay_id
        / f"f{forecast_hour:03d}"
        / f"{domain_id}.json"
    )
    if not path.exists():
        raise FileNotFoundError(
            f"Missing processed member asset for {run_id}/{member}/{overlay_id}/f{forecast_hour:03d}/{domain_id}"
        )
    return json.loads(path.read_text(encoding="utf-8"))


def load_member_stack(
    run_id: str,
    forecast_hour: int,
    domain_id: str,
    members: list[str],
    spec: EnsembleProductSpec,
    product_dir: str | Path,
) -> tuple[list[dict[str, object]], xr.DataArray, str | None]:
    if spec.mode == "vector_probability":
        return load_vector_member_stack(
            run_id=run_id,
            forecast_hour=forecast_hour,
            domain_id=domain_id,
            members=members,
            spec=spec,
            product_dir=product_dir,
        )
    source_overlay_id = spec.source_overlay_id
    if not source_overlay_id:
        raise ValueError(f"Ensemble product {spec.overlay_id} is missing a source overlay id.")
    payloads: list[dict[str, object]] = []
    arrays = []
    units: str | None = None
    for member in members:
        metadata = load_member_metadata(run_id, member, source_overlay_id, forecast_hour, domain_id, product_dir)
        dataset = xr.open_dataset(Path(metadata["netcdf_path"]))
        variable_name = list(dataset.data_vars)[0]
        data_array = dataset[variable_name]
        if "time" in data_array.dims:
            data_array = data_array.isel(time=0)
        loaded = data_array.load()
        units = loaded.attrs.get("units", units)
        arrays.append(loaded)
        payloads.append({"metadata": metadata, "dataset": dataset})
    stacked = xr.concat(arrays, dim="member").assign_coords(member=np.asarray(members, dtype=object))
    return payloads, stacked, units


def load_vector_member_stack(
    run_id: str,
    forecast_hour: int,
    domain_id: str,
    members: list[str],
    spec: EnsembleProductSpec,
    product_dir: str | Path,
) -> tuple[list[dict[str, object]], xr.DataArray, str | None]:
    if len(spec.source_overlay_ids) != 2:
        raise ValueError(f"Vector ensemble product {spec.overlay_id} requires exactly two source overlays.")
    u_overlay_id, v_overlay_id = spec.source_overlay_ids
    payloads: list[dict[str, object]] = []
    magnitudes = []
    units: str | None = None
    for member in members:
        u_metadata = load_member_metadata(run_id, member, u_overlay_id, forecast_hour, domain_id, product_dir)
        v_metadata = load_member_metadata(run_id, member, v_overlay_id, forecast_hour, domain_id, product_dir)
        u_dataset = xr.open_dataset(Path(u_metadata["netcdf_path"]))
        v_dataset = xr.open_dataset(Path(v_metadata["netcdf_path"]))
        u_variable = list(u_dataset.data_vars)[0]
        v_variable = list(v_dataset.data_vars)[0]
        u_array = u_dataset[u_variable]
        v_array = v_dataset[v_variable]
        if "time" in u_array.dims:
            u_array = u_array.isel(time=0)
        if "time" in v_array.dims:
            v_array = v_array.isel(time=0)
        u_loaded = u_array.load()
        v_loaded = v_array.load()
        units = u_loaded.attrs.get("units", units)
        magnitude = np.hypot(u_loaded, v_loaded).astype(np.float32)
        magnitudes.append(magnitude)
        payloads.append({"metadata": u_metadata, "dataset": u_dataset})
        payloads.append({"metadata": v_metadata, "dataset": v_dataset})
    stacked = xr.concat(magnitudes, dim="member").assign_coords(member=np.asarray(members, dtype=object))
    return payloads, stacked, units


def load_manifest(run_id: str, manifest_path: str | Path | None) -> dict[str, object]:
    if manifest_path:
        path = Path(manifest_path)
    else:
        path = Path(DEFAULT_MANIFEST_DIR) / f"{run_id}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return get_run_manifest(run_id)


def sanitize_id(value: str) -> str:
    return value.replace("-", "_").replace(".", "_")
