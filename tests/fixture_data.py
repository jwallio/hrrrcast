from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import xarray as xr


FIXTURE_BBOX = [-82.0, 33.0, -79.0, 36.0]


def sample_field_keys(count: int = 172) -> list[str]:
    base = [
        "TMP:2 m above ground",
        "VVEL:500 mb",
        "VGRD:10 m above ground",
        "UGRD:10 m above ground",
        "APCP:surface",
        "MSLMA:mean sea level",
        "REFC:entire atmosphere",
        "CAPE:surface",
        "CFRZR:surface",
        "CRAIN:surface",
        "DPT:2 m above ground",
        "RH:2 m above ground",
        "PWAT:entire atmosphere",
        "VIS:surface",
        "TCDC:entire atmosphere",
        "HGT:cloud ceiling",
        "HGT:500 mb",
        "TMP:850 mb",
    ]
    index = 1
    while len(base) < count:
        base.append(f"TEST{index:03d}:level {index}")
        index += 1
    return base


def sample_overlay_availability() -> dict[str, object]:
    available = {
        "available": True,
        "missing_all_of": [],
        "missing_any_of": [],
        "notes": None,
    }
    unavailable = {
        "available": False,
        "missing_all_of": [],
        "missing_any_of": ["CSNOW:surface", "SNOD:surface", "WEASD:surface"],
        "notes": "Fixture marks snowfall unavailable.",
    }
    return {
        "cape": dict(available),
        "composite_reflectivity": dict(available),
        "mslp": dict(available),
        "ptype": dict(available),
        "qpf": dict(available),
        "snowfall": unavailable,
        "temperature_2m": dict(available),
        "wind_10m": dict(available),
    }


def sample_manifest(
    run_id: str = "2026032617",
    members: list[str] | None = None,
    forecast_hours: list[int] | None = None,
    status: str = "ready",
) -> dict[str, object]:
    member_ids = members or [f"m0{i}" for i in range(6)]
    hours = forecast_hours or list(range(19))
    date = run_id[:8]
    cycle_hour = run_id[8:10]
    field_keys = sample_field_keys()
    overlays = sample_overlay_availability()
    member_payloads: dict[str, object] = {}
    for member in member_ids:
        hour_details: dict[str, object] = {}
        for hour in hours:
            hour_details[f"{hour:03d}"] = {
                "cached_idx_path": f"tests/fixtures/{run_id}/{member}/f{hour:03d}.idx",
                "cycle_hour": cycle_hour,
                "field_count": len(field_keys),
                "field_keys": field_keys,
                "forecast_hour": hour,
                "grib_key": f"HRRRCast/{date}/{cycle_hour}/hrrrcast.{member}.t{cycle_hour}z.pgrb2.f{hour:02d}",
                "grib_size_bytes": 123456789,
                "idx_key": f"HRRRCast/{date}/{cycle_hour}/hrrrcast.{member}.t{cycle_hour}z.pgrb2.f{hour:02d}.idx",
                "idx_size_bytes": 4096,
                "member": member,
                "overlays": overlays,
                "variable_count": len({field.split(':', 1)[0] for field in field_keys}),
                "variable_names": sorted({field.split(':', 1)[0] for field in field_keys}),
            }
        member_payloads[member] = {
            "forecast_hours": hours,
            "forecast_hour_details": hour_details,
        }

    return {
        "generated_at_utc": "2026-03-27T00:00:00+00:00",
        "members": member_payloads,
        "run": {
            "cycle_hour": cycle_hour,
            "date": date,
            "forecast_hours": hours,
            "member_count": len(member_ids),
            "members": member_ids,
            "overlay_ready_slots": len(member_ids) * len(hours) * 7,
            "prefix": f"HRRRCast/{date}/{cycle_hour}/",
            "run_id": run_id,
            "status": status,
            "status_reasons": [f"Fixture status: {status}."],
        },
        "source": {
            "bucket_url": "https://noaa-gsl-experimental-pds.s3.amazonaws.com",
            "root_prefix": "HRRRCast/",
        },
        "thresholds": {
            "required_member_count": 6,
            "required_min_forecast_hour": 18,
        },
    }


def write_manifest(data_root: str | Path, manifest: dict[str, object], latest: bool = False) -> Path:
    manifests_dir = Path(data_root) / "manifests"
    manifests_dir.mkdir(parents=True, exist_ok=True)
    run_id = str(manifest["run"]["run_id"])
    path = manifests_dir / f"{run_id}.json"
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    if latest:
        (manifests_dir / "latest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return path


def write_product_asset(
    data_root: str | Path,
    run_id: str = "2026032617",
    member: str = "m00",
    overlay_id: str = "temperature_2m",
    forecast_hour: int = 0,
    domain_id: str = "conus",
    variable_name: str = "TMP_2m",
    values: np.ndarray | None = None,
    field_key: str = "TMP:2 m above ground",
    native: bool = False,
) -> dict[str, object]:
    products_dir = Path(data_root) / "products" / run_id / member / overlay_id / f"f{forecast_hour:03d}"
    products_dir.mkdir(parents=True, exist_ok=True)
    netcdf_path = products_dir / f"{domain_id}.nc"
    metadata_path = products_dir / f"{domain_id}.json"
    clipped_grib_path = products_dir / f"{domain_id}.grib2"
    clipped_grib_path.write_bytes(b"grib")

    array = values if values is not None else np.array([[273.15, 274.15], [275.15, 276.15]], dtype=np.float32)
    latitude = xr.DataArray(np.array([[35.0, 35.0], [34.0, 34.0]], dtype=np.float32), dims=("y", "x"))
    longitude = xr.DataArray(np.array([[-81.0, -80.0], [-81.0, -80.0]], dtype=np.float32), dims=("y", "x"))
    dataset = xr.Dataset(
        {
            variable_name: xr.DataArray(array, dims=("y", "x"), attrs={"long_name": overlay_id, "units": "K"}),
            "latitude": latitude,
            "longitude": longitude,
        }
    )
    dataset.to_netcdf(netcdf_path)

    metadata = {
        "bbox": FIXTURE_BBOX,
        "clipped_grib_path": str(clipped_grib_path),
        "domain_id": domain_id,
        "field_key": field_key,
        "forecast_hour": forecast_hour,
        "long_name": overlay_id,
        "member": member,
        "native": native,
        "netcdf_path": str(netcdf_path),
        "overlay_id": overlay_id,
        "run_id": run_id,
        "shape": list(array.shape),
        "stats": {
            "min": float(np.nanmin(array)),
            "max": float(np.nanmax(array)),
        },
        "units": "K",
        "variable_name": variable_name,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    _upsert_catalog_artifact(Path(data_root), metadata)
    return metadata


def _upsert_catalog_artifact(data_root: Path, metadata: dict[str, object]) -> None:
    catalog_dir = data_root / "products" / metadata["run_id"] / metadata["member"] / f"f{int(metadata['forecast_hour']):03d}"
    catalog_dir.mkdir(parents=True, exist_ok=True)
    catalog_path = catalog_dir / "catalog.json"
    if catalog_path.exists():
        payload = json.loads(catalog_path.read_text(encoding="utf-8"))
    else:
        payload = {
            "generated_at_utc": "2026-03-27T00:00:00+00:00",
            "run_id": metadata["run_id"],
            "member": metadata["member"],
            "forecast_hour": metadata["forecast_hour"],
            "overlays": [],
            "domains": [],
            "artifacts": [],
        }
    payload["overlays"] = sorted(set(payload.get("overlays", [])) | {metadata["overlay_id"]})
    payload["domains"] = sorted(set(payload.get("domains", [])) | {metadata["domain_id"]})
    artifacts = [
        artifact
        for artifact in payload.get("artifacts", [])
        if not (
            artifact.get("overlay_id") == metadata["overlay_id"]
            and artifact.get("domain_id") == metadata["domain_id"]
            and artifact.get("status") == "built"
        )
    ]
    artifacts.append(
        {
            "bbox": metadata["bbox"],
            "domain_id": metadata["domain_id"],
            "forecast_hour": metadata["forecast_hour"],
            "member": metadata["member"],
            "metadata_path": str(
                data_root
                / "products"
                / metadata["run_id"]
                / metadata["member"]
                / metadata["overlay_id"]
                / f"f{int(metadata['forecast_hour']):03d}"
                / f"{metadata['domain_id']}.json"
            ),
            "overlay_id": metadata["overlay_id"],
            "run_id": metadata["run_id"],
            "status": "built",
            "variable_name": metadata["variable_name"],
        }
    )
    payload["artifacts"] = artifacts
    catalog_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
