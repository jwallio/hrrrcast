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
    source_overlay_id: str
    mode: str
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
    source_metadata = [load_member_metadata(run_id, member, spec.source_overlay_id, forecast_hour, domain_id, product_dir) for member in members]
    paths = [Path(item["netcdf_path"]) for item in source_metadata]
    source_datasets = [xr.open_dataset(path) for path in paths]
    try:
        arrays = []
        for source_dataset in source_datasets:
            variable_name = list(source_dataset.data_vars)[0]
            data_array = source_dataset[variable_name]
            if "time" in data_array.dims:
                data_array = data_array.isel(time=0)
            arrays.append(data_array.load())

        stacked = xr.concat(arrays, dim="member").assign_coords(member=np.asarray(members, dtype=object))
        if spec.mode == "mean":
            derived = stacked.mean(dim="member").astype(np.float32)
            variable_name = f"{sanitize_id(spec.overlay_id).upper()}"
            units = arrays[0].attrs.get("units")
        elif spec.mode == "spread":
            derived = stacked.std(dim="member").astype(np.float32)
            variable_name = f"{sanitize_id(spec.overlay_id).upper()}"
            units = arrays[0].attrs.get("units")
        elif spec.mode == "probability":
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
        if "latitude" in source_datasets[0].variables:
            derived_dataset["latitude"] = source_datasets[0]["latitude"].load()
        if "longitude" in source_datasets[0].variables:
            derived_dataset["longitude"] = source_datasets[0]["longitude"].load()
    finally:
        for source_dataset in source_datasets:
            source_dataset.close()

    output_dir = Path(product_dir) / run_id / ENSEMBLE_MEMBER_ID / spec.overlay_id / f"f{forecast_hour:03d}"
    output_dir.mkdir(parents=True, exist_ok=True)
    netcdf_path = output_dir / f"{domain_id}.nc"
    derived_dataset.to_netcdf(netcdf_path)
    dataset_variable_name = list(derived_dataset.data_vars)[0]
    values = derived_dataset[dataset_variable_name].values
    first_meta = source_metadata[0]
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
