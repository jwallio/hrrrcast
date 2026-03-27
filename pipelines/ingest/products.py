"""Phase 2 derived-product builder for simple raster overlays."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.parse
import urllib.request

import numpy as np
import xarray as xr

from .field_catalog import resolve_field_key_for_overlay, style_for_overlay_id
from .domains import load_domains
from .idx import parse_idx_text
from .manifest import build_run_manifest, normalize_run_id, write_manifest
from .settings import DEFAULT_MANIFEST_DIR
from services.shared.tiler import DEFAULT_TILE_CACHE_ROOT, clear_runtime_caches, invalidate_tile_cache

WGRIB2_EXE = r"C:\wgrib2\wgrib2.exe"
DEFAULT_PRODUCT_DIR = "data/processed/products"
DEFAULT_FIELD_CACHE_DIR = "data/raw/noaa/HRRRCast_fields"


@dataclass(frozen=True)
class ProductSpec:
    overlay_id: str
    field_key: str | None
    mode: str
    notes: str | None = None
    component_field_keys: tuple[str, ...] = ()
    variable_name: str | None = None
    long_name: str | None = None


PRODUCT_SPECS: dict[str, ProductSpec] = {
    "temperature_2m": ProductSpec("temperature_2m", "TMP:2 m above ground", "single_field"),
    "dewpoint_2m": ProductSpec("dewpoint_2m", "DPT:2 m above ground", "single_field"),
    "rh_2m": ProductSpec("rh_2m", "RH:2 m above ground", "single_field"),
    "specific_humidity_2m": ProductSpec("specific_humidity_2m", "SPFH:2 m above ground", "single_field"),
    "temperature_potential_2m": ProductSpec("temperature_potential_2m", "POT:2 m above ground", "single_field"),
    "qpf": ProductSpec("qpf", "APCP:surface", "single_field"),
    "pwat": ProductSpec("pwat", "PWAT:entire atmosphere", "single_field"),
    "composite_reflectivity": ProductSpec("composite_reflectivity", "REFC:entire atmosphere", "single_field"),
    "mslp": ProductSpec("mslp", "MSLMA:mean sea level", "single_field"),
    "cape": ProductSpec("cape", "CAPE:surface", "single_field"),
    "cin_surface": ProductSpec("cin_surface", "CIN:surface", "single_field"),
    "visibility": ProductSpec("visibility", "VIS:surface", "single_field"),
    "cloud_cover_total": ProductSpec("cloud_cover_total", "TCDC:entire atmosphere", "single_field"),
    "cloud_cover_low": ProductSpec("cloud_cover_low", "LCDC:low cloud layer", "single_field"),
    "cloud_cover_mid": ProductSpec("cloud_cover_mid", "MCDC:middle cloud layer", "single_field"),
    "cloud_cover_high": ProductSpec("cloud_cover_high", "HCDC:high cloud layer", "single_field"),
    "ceiling": ProductSpec("ceiling", "HGT:cloud ceiling", "single_field"),
    "land_mask": ProductSpec("land_mask", "LAND:surface", "single_field"),
    "gust_surface": ProductSpec("gust_surface", "GUST:surface", "single_field"),
    "surface_pressure": ProductSpec("surface_pressure", "PRES:surface", "single_field"),
    "pressure_surface": ProductSpec("pressure_surface", "PRES:surface", "single_field"),
    "height_0c_isotherm": ProductSpec("height_0c_isotherm", "HGT:0C isotherm", "single_field"),
    "rh_0c_isotherm": ProductSpec("rh_0c_isotherm", "RH:0C isotherm", "single_field"),
    "wind_0c_isotherm": ProductSpec("wind_0c_isotherm", "WIND:0C isotherm", "single_field"),
    "u_wind_0c_isotherm": ProductSpec("u_wind_0c_isotherm", "UGRD:0C isotherm", "single_field"),
    "v_wind_0c_isotherm": ProductSpec("v_wind_0c_isotherm", "VGRD:0C isotherm", "single_field"),
    "u_wind_10m": ProductSpec("u_wind_10m", "UGRD:10 m above ground", "single_field"),
    "v_wind_10m": ProductSpec("v_wind_10m", "VGRD:10 m above ground", "single_field"),
    "u_wind_80m": ProductSpec("u_wind_80m", "UGRD:80 m above ground", "single_field"),
    "v_wind_80m": ProductSpec("v_wind_80m", "VGRD:80 m above ground", "single_field"),
    "height_500mb": ProductSpec("height_500mb", "HGT:500 mb", "single_field"),
    "height_700mb": ProductSpec("height_700mb", "HGT:700 mb", "single_field"),
    "height_850mb": ProductSpec("height_850mb", "HGT:850 mb", "single_field"),
    "temperature_850mb": ProductSpec("temperature_850mb", "TMP:850 mb", "single_field"),
    "temperature_700mb": ProductSpec("temperature_700mb", "TMP:700 mb", "single_field"),
    "temperature_925mb": ProductSpec("temperature_925mb", "TMP:925 mb", "single_field"),
    "specific_humidity_700mb": ProductSpec("specific_humidity_700mb", "SPFH:700 mb", "single_field"),
    "specific_humidity_850mb": ProductSpec("specific_humidity_850mb", "SPFH:850 mb", "single_field"),
    "u_wind_500mb": ProductSpec("u_wind_500mb", "UGRD:500 mb", "single_field"),
    "v_wind_500mb": ProductSpec("v_wind_500mb", "VGRD:500 mb", "single_field"),
    "vertical_velocity_500mb": ProductSpec("vertical_velocity_500mb", "VVEL:500 mb", "single_field"),
    "vertical_velocity_700mb": ProductSpec("vertical_velocity_700mb", "VVEL:700 mb", "single_field"),
    "helicity_0_1km": ProductSpec("helicity_0_1km", "HLCY:1000-0 m above ground", "single_field"),
    "helicity_0_3km": ProductSpec("helicity_0_3km", "HLCY:3000-0 m above ground", "single_field"),
    "storm_motion_u": ProductSpec("storm_motion_u", "USTM:0-6000 m above ground", "single_field"),
    "storm_motion_v": ProductSpec("storm_motion_v", "VSTM:0-6000 m above ground", "single_field"),
    "shear_u_0_1km": ProductSpec("shear_u_0_1km", "VUCSH:1000-0 m above ground", "single_field"),
    "shear_v_0_1km": ProductSpec("shear_v_0_1km", "VVCSH:1000-0 m above ground", "single_field"),
    "shear_u_0_6km": ProductSpec("shear_u_0_6km", "VUCSH:6000-0 m above ground", "single_field"),
    "shear_v_0_6km": ProductSpec("shear_v_0_6km", "VVCSH:6000-0 m above ground", "single_field"),
    "relative_vorticity_0_1km": ProductSpec("relative_vorticity_0_1km", "RELV:1000-0 m above ground", "single_field"),
    "relative_vorticity_0_2km": ProductSpec("relative_vorticity_0_2km", "RELV:2000-0 m above ground", "single_field"),
    "ptype": ProductSpec(
        "ptype",
        None,
        "derived_ptype",
        notes="Derived from categorical rain/freezing-rain support fields currently published in HRRRCast.",
    ),
    "snowfall": ProductSpec(
        "snowfall",
        None,
        "deferred",
        notes="Snowfall derivation is deferred until Phase 2 adds multi-field accumulation logic.",
    ),
    "wind_10m": ProductSpec(
        "wind_10m",
        None,
        "derived_wind_speed",
        notes="Derived raster wind speed from 10 m UGRD/VGRD components.",
        component_field_keys=("UGRD:10 m above ground", "VGRD:10 m above ground"),
        variable_name="WINDSPD_10maboveground",
        long_name="10 m wind speed",
    ),
    "wind_speed_80m": ProductSpec(
        "wind_speed_80m",
        None,
        "derived_wind_speed",
        notes="Derived raster wind speed from 80 m UGRD/VGRD components.",
        component_field_keys=("UGRD:80 m above ground", "VGRD:80 m above ground"),
        variable_name="WINDSPD_80maboveground",
        long_name="80 m wind speed",
    ),
    "wind_500mb": ProductSpec(
        "wind_500mb",
        None,
        "derived_wind_speed",
        notes="Derived raster wind speed from 500 mb UGRD/VGRD components.",
        component_field_keys=("UGRD:500 mb", "VGRD:500 mb"),
        variable_name="WINDSPD_500mb",
        long_name="500 mb wind speed",
    ),
    "wind_700mb": ProductSpec(
        "wind_700mb",
        None,
        "derived_wind_speed",
        notes="Derived raster wind speed from 700 mb UGRD/VGRD components.",
        component_field_keys=("UGRD:700 mb", "VGRD:700 mb"),
        variable_name="WINDSPD_700mb",
        long_name="700 mb wind speed",
    ),
    "wind_850mb": ProductSpec(
        "wind_850mb",
        None,
        "derived_wind_speed",
        notes="Derived raster wind speed from 850 mb UGRD/VGRD components.",
        component_field_keys=("UGRD:850 mb", "VGRD:850 mb"),
        variable_name="WINDSPD_850mb",
        long_name="850 mb wind speed",
    ),
}


def build_products(
    run_id: str,
    member: str,
    forecast_hour: int,
    overlays: list[str],
    domains: list[str],
    manifest_path: str | Path | None = None,
    product_dir: str | Path = DEFAULT_PRODUCT_DIR,
    field_cache_dir: str | Path = DEFAULT_FIELD_CACHE_DIR,
    tile_cache_root: str | Path = DEFAULT_TILE_CACHE_ROOT,
) -> dict[str, object]:
    manifest = _load_or_build_manifest(run_id, manifest_path)
    hour_key = f"{forecast_hour:03d}"
    hour_detail = manifest["members"][member]["forecast_hour_details"][hour_key]
    idx_path = Path(hour_detail["cached_idx_path"])
    idx_records = parse_idx_text(idx_path.read_text(encoding="utf-8"))
    record_by_field = {record.field_key: record for record in idx_records}
    available_field_keys = set(record_by_field)
    domains_cfg = load_domains()
    selected_domains = [domains_cfg[domain_id] for domain_id in domains]
    grib_size = hour_detail["grib_size_bytes"]
    grib_key = hour_detail["grib_key"]

    artifacts: list[dict[str, object]] = []
    for overlay_id in overlays:
        spec = resolve_product_spec(overlay_id, available_field_keys)
        overlay_availability = hour_detail["overlays"].get(overlay_id)
        if overlay_availability is None:
            if spec.field_key:
                overlay_availability = {
                    "available": spec.field_key in available_field_keys,
                    "missing_all_of": [] if spec.field_key in available_field_keys else [spec.field_key],
                    "missing_any_of": [],
                    "notes": spec.notes,
                }
            elif spec.mode == "derived_wind_speed" and spec.component_field_keys:
                missing = [field_key for field_key in spec.component_field_keys if field_key not in available_field_keys]
                overlay_availability = {
                    "available": not missing,
                    "missing_all_of": missing,
                    "missing_any_of": [],
                    "notes": spec.notes,
                }
        if overlay_availability is None:
            artifacts.append(
                {
                    "overlay_id": overlay_id,
                    "status": "skipped",
                    "reason": "overlay is not recognized by the product catalog",
                }
            )
            continue
        if not overlay_availability["available"]:
            artifacts.append(
                {
                    "overlay_id": overlay_id,
                    "status": "skipped",
                    "reason": "overlay unavailable for this member/hour",
                    "availability": overlay_availability,
                }
            )
            continue
        if spec.mode != "single_field" or not spec.field_key:
            if spec.mode == "derived_ptype":
                for domain in selected_domains:
                    artifacts.append(
                        build_ptype_product(
                            run_id=run_id,
                            member=member,
                            forecast_hour=forecast_hour,
                            grib_key=grib_key,
                            idx_records=idx_records,
                            grib_size_bytes=grib_size,
                            domain=domain,
                            field_cache_dir=field_cache_dir,
                            product_dir=product_dir,
                        )
                    )
                continue
            if spec.mode == "derived_wind_speed":
                for domain in selected_domains:
                    artifacts.append(
                        build_wind_speed_product(
                            spec=spec,
                            run_id=run_id,
                            member=member,
                            forecast_hour=forecast_hour,
                            grib_key=grib_key,
                            idx_records=idx_records,
                            grib_size_bytes=grib_size,
                            domain=domain,
                            field_cache_dir=field_cache_dir,
                            product_dir=product_dir,
                        )
                    )
                continue
            artifacts.append(
                {
                    "overlay_id": overlay_id,
                    "status": "skipped",
                    "reason": spec.notes or "overlay processing mode is not implemented yet",
                }
            )
            continue
        record = record_by_field[spec.field_key]
        single_message_path = download_field_message(
            grib_key=grib_key,
            idx_records=idx_records,
            target_field_key=spec.field_key,
            grib_size_bytes=grib_size,
            output_root=field_cache_dir,
        )
        for domain in selected_domains:
            artifact = build_domain_netcdf(
                single_message_path=single_message_path,
                run_id=run_id,
                member=member,
                forecast_hour=forecast_hour,
                overlay_id=overlay_id,
                field_key=spec.field_key,
                domain=domain,
                output_root=product_dir,
                notes=spec.notes,
            )
            artifact["source_field_offset"] = record.offset
            artifacts.append(artifact)

    catalog_path = (
        Path(product_dir)
        / run_id
        / member
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
    catalog = {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "run_id": run_id,
        "member": member,
        "forecast_hour": forecast_hour,
        "overlays": sorted(set(existing_overlays) | set(overlays)),
        "domains": sorted(set(existing_domains) | set(domains)),
        "artifacts": merged_artifacts,
    }
    invalidated_cache_entries = invalidate_catalog_tile_cache(
        run_id=run_id,
        member=member,
        forecast_hour=forecast_hour,
        artifacts=artifacts,
        tile_cache_root=tile_cache_root,
    )
    if invalidated_cache_entries:
        clear_runtime_caches()
    catalog["tile_cache_invalidations"] = invalidated_cache_entries
    catalog_path.write_text(json.dumps(catalog, indent=2, sort_keys=True), encoding="utf-8")
    catalog["catalog_path"] = str(catalog_path)
    return catalog


def download_field_message(
    grib_key: str,
    idx_records: list,
    target_field_key: str,
    grib_size_bytes: int,
    output_root: str | Path,
) -> Path:
    index = None
    for i, record in enumerate(idx_records):
        if record.field_key == target_field_key:
            index = i
            break
    if index is None:
        raise KeyError(f"Field key {target_field_key!r} is not present in the idx inventory.")

    start = idx_records[index].offset
    end = grib_size_bytes - 1 if index == len(idx_records) - 1 else idx_records[index + 1].offset - 1
    if end < start:
        raise ValueError(f"Invalid byte range for {target_field_key}: {start}-{end}")

    run_match = re.match(r"^HRRRCast/(?P<date>\d{8})/(?P<cycle>\d{2})/hrrrcast\.(?P<member>m\d{2})\.t\d{2}z\.pgrb2\.f(?P<fhr>\d{2,3})$", grib_key)
    if not run_match:
        raise ValueError(f"Unexpected GRIB key format: {grib_key}")
    parts = run_match.groupdict()
    safe_field = sanitize_name(target_field_key)
    output_dir = Path(output_root) / parts["date"] / parts["cycle"] / parts["member"]
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"f{parts['fhr']}_{safe_field}.grib2"
    if output_path.exists() and output_path.stat().st_size > 0:
        return output_path

    url = "https://noaa-gsl-experimental-pds.s3.amazonaws.com/" + urllib.parse.quote(grib_key)
    request = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    output_path.write_bytes(data)
    return output_path


def build_domain_netcdf(
    single_message_path: str | Path,
    run_id: str,
    member: str,
    forecast_hour: int,
    overlay_id: str,
    field_key: str,
    domain: dict[str, object],
    output_root: str | Path,
    notes: str | None = None,
) -> dict[str, object]:
    single_message_path = Path(single_message_path)
    bbox = domain["viewport"]["bbox"]
    domain_id = domain["id"]
    overlay_dir = Path(output_root) / run_id / member / overlay_id / f"f{forecast_hour:03d}"
    overlay_dir.mkdir(parents=True, exist_ok=True)
    clipped_grib_path = overlay_dir / f"{domain_id}.grib2"
    netcdf_path = overlay_dir / f"{domain_id}.nc"

    _run_wgrib2(
        [
            str(single_message_path),
            "-small_grib",
            f"{bbox[0]}:{bbox[2]}",
            f"{bbox[1]}:{bbox[3]}",
            str(clipped_grib_path),
        ]
    )
    _run_wgrib2([str(clipped_grib_path), "-netcdf", str(netcdf_path)])

    with xr.open_dataset(netcdf_path) as dataset:
        variable_names = list(dataset.data_vars)
        variable_name = variable_names[0]
        data_array = dataset[variable_name]
        attrs = {key: str(value) for key, value in data_array.attrs.items()}
        stats = {
            "min": float(data_array.min().item()),
            "max": float(data_array.max().item()),
        }
        shape = [int(size) for size in data_array.shape]

    metadata = {
        "run_id": run_id,
        "member": member,
        "forecast_hour": forecast_hour,
        "overlay_id": overlay_id,
        "field_key": field_key,
        "domain_id": domain_id,
        "bbox": bbox,
        "netcdf_path": str(netcdf_path),
        "clipped_grib_path": str(clipped_grib_path),
        "variable_name": variable_name,
        "long_name": attrs.get("long_name"),
        "units": attrs.get("units"),
        "style": style_for_overlay_id(overlay_id, field_key),
        "shape": shape,
        "stats": stats,
        "native": overlay_id.startswith("field_"),
    }
    if notes:
        metadata["notes"] = notes
    metadata_path = overlay_dir / f"{domain_id}.json"
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    metadata["metadata_path"] = str(metadata_path)
    metadata["status"] = "built"
    return metadata


def build_ptype_product(
    run_id: str,
    member: str,
    forecast_hour: int,
    grib_key: str,
    idx_records: list,
    grib_size_bytes: int,
    domain: dict[str, object],
    field_cache_dir: str | Path,
    product_dir: str | Path,
) -> dict[str, object]:
    rain = _build_component_netcdf(
        run_id,
        member,
        forecast_hour,
        "ptype",
        "CRAIN:surface",
        grib_key,
        idx_records,
        grib_size_bytes,
        domain,
        field_cache_dir,
        product_dir,
        "component_rain",
    )
    freezing = _build_component_netcdf(
        run_id,
        member,
        forecast_hour,
        "ptype",
        "CFRZR:surface",
        grib_key,
        idx_records,
        grib_size_bytes,
        domain,
        field_cache_dir,
        product_dir,
        "component_freezing_rain",
    )

    with xr.open_dataset(rain["netcdf_path"]) as rain_ds, xr.open_dataset(freezing["netcdf_path"]) as frzr_ds:
        rain_var = list(rain_ds.data_vars)[0]
        frzr_var = list(frzr_ds.data_vars)[0]
        rain_values = rain_ds[rain_var]
        frzr_values = frzr_ds[frzr_var]
        ptype_values = xr.where(frzr_values > 0, 3, xr.where(rain_values > 0, 1, 0)).astype(np.int16)
        ptype_values.name = "PTYPE_surface"
        ptype_values.attrs.update(
            {
                "long_name": "Precipitation type (limited derived categories)",
                "category_0": "none",
                "category_1": "rain",
                "category_3": "freezing_rain",
            }
        )
        dataset = ptype_values.to_dataset()
        if "latitude" in rain_ds.variables:
            dataset["latitude"] = rain_ds["latitude"]
        if "longitude" in rain_ds.variables:
            dataset["longitude"] = rain_ds["longitude"]

    output_dir = Path(product_dir) / run_id / member / "ptype" / f"f{forecast_hour:03d}"
    output_dir.mkdir(parents=True, exist_ok=True)
    netcdf_path = output_dir / f"{domain['id']}.nc"
    dataset.to_netcdf(netcdf_path)

    values = dataset["PTYPE_surface"].values
    metadata = {
        "run_id": run_id,
        "member": member,
        "forecast_hour": forecast_hour,
        "overlay_id": "ptype",
        "domain_id": domain["id"],
        "bbox": domain["viewport"]["bbox"],
        "netcdf_path": str(netcdf_path),
        "variable_name": "PTYPE_surface",
        "shape": [int(size) for size in values.shape],
        "stats": {
            "min": float(np.nanmin(values)),
            "max": float(np.nanmax(values)),
        },
        "category_map": {
            "0": "none",
            "1": "rain",
            "3": "freezing_rain",
        },
        "notes": "Current HRRRCast-derived precip type only distinguishes none, rain, and freezing rain.",
        "style": style_for_overlay_id("ptype"),
        "status": "built",
    }
    metadata_path = output_dir / f"{domain['id']}.json"
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    metadata["metadata_path"] = str(metadata_path)
    metadata["component_paths"] = [rain["netcdf_path"], freezing["netcdf_path"]]
    metadata["source_field_offsets"] = {
        "CRAIN:surface": rain["source_field_offset"],
        "CFRZR:surface": freezing["source_field_offset"],
    }
    return metadata


def build_wind_speed_product(
    spec: ProductSpec,
    run_id: str,
    member: str,
    forecast_hour: int,
    grib_key: str,
    idx_records: list,
    grib_size_bytes: int,
    domain: dict[str, object],
    field_cache_dir: str | Path,
    product_dir: str | Path,
) -> dict[str, object]:
    if len(spec.component_field_keys) != 2:
        raise ValueError(f"{spec.overlay_id} requires exactly two wind component field keys.")
    u_field_key, v_field_key = spec.component_field_keys
    ugrd = _build_component_netcdf(
        run_id,
        member,
        forecast_hour,
        spec.overlay_id,
        u_field_key,
        grib_key,
        idx_records,
        grib_size_bytes,
        domain,
        field_cache_dir,
        product_dir,
        "component_ugrd",
    )
    vgrd = _build_component_netcdf(
        run_id,
        member,
        forecast_hour,
        spec.overlay_id,
        v_field_key,
        grib_key,
        idx_records,
        grib_size_bytes,
        domain,
        field_cache_dir,
        product_dir,
        "component_vgrd",
    )

    with xr.open_dataset(ugrd["netcdf_path"]) as ugrd_ds, xr.open_dataset(vgrd["netcdf_path"]) as vgrd_ds:
        ugrd_var = list(ugrd_ds.data_vars)[0]
        vgrd_var = list(vgrd_ds.data_vars)[0]
        wind_speed = np.sqrt((ugrd_ds[ugrd_var] ** 2) + (vgrd_ds[vgrd_var] ** 2)).astype(np.float32)
        wind_speed.name = spec.variable_name or sanitize_name(f"{spec.overlay_id}_wind_speed")
        wind_speed.attrs.update(
            {
                "long_name": spec.long_name or f"{spec.overlay_id} wind speed",
                "units": "m s-1",
            }
        )
        dataset = wind_speed.to_dataset()
        if "latitude" in ugrd_ds.variables:
            dataset["latitude"] = ugrd_ds["latitude"]
        if "longitude" in ugrd_ds.variables:
            dataset["longitude"] = ugrd_ds["longitude"]

    output_dir = Path(product_dir) / run_id / member / spec.overlay_id / f"f{forecast_hour:03d}"
    output_dir.mkdir(parents=True, exist_ok=True)
    netcdf_path = output_dir / f"{domain['id']}.nc"
    dataset.to_netcdf(netcdf_path)

    variable_name = list(dataset.data_vars)[0]
    values = dataset[variable_name].values
    metadata = {
        "run_id": run_id,
        "member": member,
        "forecast_hour": forecast_hour,
        "overlay_id": spec.overlay_id,
        "domain_id": domain["id"],
        "bbox": domain["viewport"]["bbox"],
        "netcdf_path": str(netcdf_path),
        "variable_name": variable_name,
        "shape": [int(size) for size in values.shape],
        "stats": {
            "min": float(np.nanmin(values)),
            "max": float(np.nanmax(values)),
        },
        "units": "m s-1",
        "style": style_for_overlay_id(spec.overlay_id),
        "status": "built",
    }
    metadata_path = output_dir / f"{domain['id']}.json"
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    metadata["metadata_path"] = str(metadata_path)
    metadata["component_paths"] = [ugrd["netcdf_path"], vgrd["netcdf_path"]]
    metadata["source_field_offsets"] = {
        u_field_key: ugrd["source_field_offset"],
        v_field_key: vgrd["source_field_offset"],
    }
    return metadata


def _build_component_netcdf(
    run_id: str,
    member: str,
    forecast_hour: int,
    overlay_id: str,
    field_key: str,
    grib_key: str,
    idx_records: list,
    grib_size_bytes: int,
    domain: dict[str, object],
    field_cache_dir: str | Path,
    product_dir: str | Path,
    component_name: str,
) -> dict[str, object]:
    field_path = download_field_message(
        grib_key=grib_key,
        idx_records=idx_records,
        target_field_key=field_key,
        grib_size_bytes=grib_size_bytes,
        output_root=field_cache_dir,
    )
    output_dir = Path(product_dir) / run_id / member / overlay_id / f"f{forecast_hour:03d}" / "_components"
    output_dir.mkdir(parents=True, exist_ok=True)
    clipped_grib_path = output_dir / f"{domain['id']}_{component_name}.grib2"
    netcdf_path = output_dir / f"{domain['id']}_{component_name}.nc"
    bbox = domain["viewport"]["bbox"]

    _run_wgrib2(
        [
            str(field_path),
            "-small_grib",
            f"{bbox[0]}:{bbox[2]}",
            f"{bbox[1]}:{bbox[3]}",
            str(clipped_grib_path),
        ]
    )
    _run_wgrib2([str(clipped_grib_path), "-netcdf", str(netcdf_path)])

    source_offset = next(record.offset for record in idx_records if record.field_key == field_key)
    return {
        "field_key": field_key,
        "netcdf_path": str(netcdf_path),
        "clipped_grib_path": str(clipped_grib_path),
        "source_field_offset": source_offset,
    }


def sanitize_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").lower()


def merge_artifacts(
    existing_artifacts: list[dict[str, object]],
    new_artifacts: list[dict[str, object]],
) -> list[dict[str, object]]:
    merged: dict[tuple[object, ...], dict[str, object]] = {}
    for artifact in existing_artifacts + new_artifacts:
        key = (
            artifact.get("overlay_id"),
            artifact.get("domain_id"),
            artifact.get("forecast_hour"),
            artifact.get("member"),
            artifact.get("run_id"),
            artifact.get("status"),
        )
        merged[key] = artifact
    return list(merged.values())


def resolve_product_spec(overlay_id: str, field_keys: set[str]) -> ProductSpec:
    if overlay_id in PRODUCT_SPECS:
        return PRODUCT_SPECS[overlay_id]
    field_key = resolve_field_key_for_overlay(overlay_id, field_keys)
    if field_key:
        return ProductSpec(
            overlay_id=overlay_id,
            field_key=field_key,
            mode="single_field",
            notes="Native HRRRCast GRIB2 field exposed directly as a raster overlay.",
        )
    raise KeyError(f"Unknown overlay id: {overlay_id}")


def invalidate_catalog_tile_cache(
    run_id: str,
    member: str,
    forecast_hour: int,
    artifacts: list[dict[str, object]],
    tile_cache_root: str | Path = DEFAULT_TILE_CACHE_ROOT,
) -> int:
    invalidations = 0
    seen_keys: set[tuple[str, str]] = set()
    for artifact in artifacts:
        if artifact.get("status") != "built":
            continue
        overlay_id = str(artifact.get("overlay_id", ""))
        domain_id = str(artifact.get("domain_id", ""))
        if not overlay_id or not domain_id:
            continue
        cache_key = (overlay_id, domain_id)
        if cache_key in seen_keys:
            continue
        seen_keys.add(cache_key)
        invalidations += invalidate_tile_cache(
            run_id=run_id,
            member=member,
            overlay_id=overlay_id,
            forecast_hour=forecast_hour,
            domain_id=domain_id,
            cache_root=tile_cache_root,
        )
    return invalidations


def _load_or_build_manifest(run_id: str, manifest_path: str | Path | None) -> dict[str, object]:
    if manifest_path:
        path = Path(manifest_path)
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    default_path = Path(DEFAULT_MANIFEST_DIR) / f"{run_id}.json"
    if default_path.exists():
        return json.loads(default_path.read_text(encoding="utf-8"))
    manifest = build_run_manifest(run_id)
    write_manifest(default_path, manifest)
    return manifest


def _run_wgrib2(arguments: list[str]) -> None:
    command = [resolve_wgrib2_executable(), *arguments]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            "wgrib2 command failed\n"
            f"command={' '.join(command)}\n"
            f"stdout={result.stdout}\n"
            f"stderr={result.stderr}"
        )


def resolve_wgrib2_executable() -> str:
    candidates = [
        os.environ.get("WGRIB2_EXE"),
        WGRIB2_EXE,
        shutil.which("wgrib2"),
        shutil.which("wgrib2.exe"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(candidate)
    raise FileNotFoundError(
        "wgrib2 executable not found. Set WGRIB2_EXE or install wgrib2 on PATH."
    )
