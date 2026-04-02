"""Direct station-viewer export path that bypasses raster product storage."""

from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import re
from threading import Lock

import numpy as np
import xarray as xr

from pipelines.ingest.ensemble_products import ENSEMBLE_PRODUCT_SPECS
from pipelines.ingest.idx import parse_idx_text
from pipelines.ingest.products import DEFAULT_FIELD_CACHE_DIR, PRODUCT_SPECS, download_field_message
from services.shared.point_series import (
    CHART_GROUPS,
    DEFAULT_MEMBER_OVERLAYS,
    DERIVED_POINT_OVERLAYS,
    get_station,
    normalize_longitude,
    overlay_payload,
    valid_time_for_hour,
)


PROBABILITY_SOURCE_OVERLAYS: dict[str, str] = {
    "qpf_probability_gt_0p10": "qpf",
    "wind_10m_probability_gt_25kt": "wind_10m",
    "composite_reflectivity_probability_gt_40dbz": "composite_reflectivity",
    "cape_probability_gt_1000": "cape",
    "helicity_0_1km_probability_gt_100": "helicity_0_1km",
    "shear_0_6km_probability_gt_40kt": "shear_0_6km_speed",
}

FIELD_RAW_PREFIX = "__field__::"
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STATION_SAMPLE_CACHE_ROOT = ROOT / "data" / "processed" / "station_samples"
DEFAULT_STATION_EXPORT_WORKERS = 4
GRIB_READ_LOCK = Lock()


def export_station_bundle_direct(
    output_dir: Path,
    manifest: dict[str, object],
    stations: list[str],
    members: list[str],
    logger=None,
) -> dict[str, object]:
    station_records = {
        station_code.upper(): get_station(station_code)
        for station_code in stations
    }
    payloads = build_station_payloads_from_manifest(
        manifest=manifest,
        station_records=station_records,
        export_members=members,
        logger=logger,
    )
    run_id = str(manifest["run"]["run_id"])
    export_runs_from_manifest(output_dir, manifest)
    export_station_subset(output_dir, list(station_records.values()))
    for member in members:
        for station_code in stations:
            payload = payloads[(member, station_code.upper())]
            write_payload(output_dir, "latest-ready", member, station_code.upper(), payload)
            write_payload(output_dir, run_id, member, station_code.upper(), payload)
    return {
        "run_id": run_id,
        "output_dir": str(output_dir),
        "stations": [station.upper() for station in stations],
        "members": members,
        "mode": "station_only",
    }


def export_runs_from_manifest(output_dir: Path, manifest: dict[str, object]) -> None:
    run = manifest["run"]
    payload = {
        "runs": [
            {
                "run_id": run["run_id"],
                "status": run["status"],
                "member_count": run["member_count"],
                "members": run["members"],
                "max_forecast_hour": run["forecast_hours"][-1] if run["forecast_hours"] else None,
                "status_reasons": run["status_reasons"],
            }
        ]
    }
    (output_dir / "runs.json").write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def export_station_subset(output_dir: Path, stations: list[dict[str, object]]) -> None:
    payload = {"stations": stations}
    (output_dir / "stations.json").write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def write_payload(output_dir: Path, run_token: str, member: str, station: str, payload: dict[str, object]) -> None:
    target_dir = output_dir / "point-series" / run_token / member
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / f"{station}.json").write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def build_station_payloads_from_manifest(
    manifest: dict[str, object],
    station_records: dict[str, dict[str, object]],
    export_members: list[str],
    logger=None,
) -> dict[tuple[str, str], dict[str, object]]:
    run_id = str(manifest["run"]["run_id"])
    station_codes = sorted(station_records)
    needed_logical = required_logical_overlays(export_members)
    needed_raw = required_raw_overlays(needed_logical)
    deterministic_members = exported_deterministic_members(manifest, export_members)
    raw_samples = collect_raw_station_samples(
        manifest=manifest,
        raw_overlay_ids=needed_raw,
        station_records=station_records,
        include_all_members=bool(deterministic_members or "ens" in export_members),
        logger=logger,
    )
    logical_samples = build_logical_sample_store(raw_samples, needed_logical)
    available_members = (["ens"] if "ens" in export_members else []) + deterministic_members
    payloads: dict[tuple[str, str], dict[str, object]] = {}
    for station_code in station_codes:
        for member in deterministic_members:
            payloads[(member, station_code)] = build_member_payload_from_store(
                run_id=run_id,
                member=member,
                station=station_records[station_code],
                available_members=available_members,
                logical_samples=logical_samples,
                manifest=manifest,
            )
        if "ens" in export_members:
            payloads[("ens", station_code)] = build_ensemble_payload_from_store(
                run_id=run_id,
                station=station_records[station_code],
                available_members=available_members,
                logical_samples=logical_samples,
                manifest=manifest,
            )
    return payloads


def required_logical_overlays(export_members: list[str]) -> set[str]:
    overlays: set[str] = set()
    if any(member.startswith("m") for member in export_members):
        overlays.update(DEFAULT_MEMBER_OVERLAYS["m00"])
        overlays.update(
            overlay_id
            for overlay_id in DEFAULT_MEMBER_OVERLAYS["m00"]
            if overlay_id in DERIVED_POINT_OVERLAYS
        )
    if "ens" in export_members:
        overlays.update(PROBABILITY_SOURCE_OVERLAYS.values())
    return overlays


def exported_deterministic_members(manifest: dict[str, object], export_members: list[str]) -> list[str]:
    manifest_members = [str(member) for member in manifest["run"]["members"]]
    if any(member.startswith("m") for member in export_members):
        requested = {str(member) for member in export_members if str(member).startswith("m")}
        return [member for member in manifest_members if member in requested]
    return []


def required_raw_overlays(logical_overlays: set[str]) -> set[str]:
    overlays: set[str] = set()
    for overlay_id in logical_overlays:
        overlays.update(raw_requirements_for_overlay(overlay_id))
    return overlays


def raw_requirements_for_overlay(overlay_id: str) -> set[str]:
    if overlay_id in DERIVED_POINT_OVERLAYS:
        return {str(component) for component in DERIVED_POINT_OVERLAYS[overlay_id]["components"]}
    spec = PRODUCT_SPECS.get(overlay_id)
    if spec is None:
        raise KeyError(f"No product spec found for overlay {overlay_id}")
    if spec.mode == "single_field":
        return {overlay_id}
    if spec.mode == "derived_wind_speed":
        return {raw_overlay_id_for_field_key(field_key) for field_key in spec.component_field_keys}
    raise KeyError(f"Overlay {overlay_id} is not supported by the station-only exporter")


def raw_overlay_id_for_field_key(field_key: str) -> str:
    try:
        return overlay_id_for_field_key(field_key)
    except KeyError:
        return f"{FIELD_RAW_PREFIX}{field_key}"


def overlay_id_for_field_key(field_key: str) -> str:
    for overlay_id, spec in PRODUCT_SPECS.items():
        if spec.mode == "single_field" and spec.field_key == field_key:
            return overlay_id
    raise KeyError(f"No single-field overlay id found for {field_key}")


def field_key_for_raw_overlay_id(raw_overlay_id: str) -> str:
    if raw_overlay_id.startswith(FIELD_RAW_PREFIX):
        return raw_overlay_id[len(FIELD_RAW_PREFIX):]
    spec = PRODUCT_SPECS[raw_overlay_id]
    if not spec.field_key:
        raise KeyError(f"No field key for raw overlay {raw_overlay_id}")
    return str(spec.field_key)


def collect_raw_station_samples(
    manifest: dict[str, object],
    raw_overlay_ids: set[str],
    station_records: dict[str, dict[str, object]],
    include_all_members: bool,
    logger=None,
    field_cache_root: Path = Path(DEFAULT_FIELD_CACHE_DIR),
    sample_cache_root: Path = DEFAULT_STATION_SAMPLE_CACHE_ROOT,
    max_workers: int = DEFAULT_STATION_EXPORT_WORKERS,
) -> dict[str, dict[str, dict[int, dict[str, float]]]]:
    run_id = str(manifest["run"]["run_id"])
    member_ids = sorted(str(member) for member in manifest["run"]["members"]) if include_all_members else ["m00"]
    station_codes = sorted(station_records)
    raw_store: dict[str, dict[str, dict[int, dict[str, float]]]] = defaultdict(lambda: defaultdict(dict))
    total_steps = total_raw_sampling_steps(manifest, member_ids, raw_overlay_ids)
    completed_steps = 0
    field_cache_root = Path(field_cache_root)
    sample_cache_root = Path(sample_cache_root)
    field_cache_root.mkdir(parents=True, exist_ok=True)
    sample_cache_root.mkdir(parents=True, exist_ok=True)
    if logger:
        logger.info(
            "station-only export sampling %s raw overlay/hour/member steps for %s station(s)",
            total_steps,
            len(station_codes),
        )
    for member in member_ids:
        member_payload = manifest["members"].get(member)
        if not member_payload:
            continue
        if logger:
            logger.info("station-only sampling member=%s hours=%s", member, len(member_payload["forecast_hours"]))
        for forecast_hour in member_payload["forecast_hours"]:
            hour_token = f"{int(forecast_hour):03d}"
            hour_detail = member_payload["forecast_hour_details"][hour_token]
            idx_records = parse_idx_text(Path(hour_detail["cached_idx_path"]).read_text(encoding="utf-8"))
            grib_key = str(hour_detail["grib_key"])
            grib_size = int(hour_detail["grib_size_bytes"])
            available_field_keys = set(hour_detail.get("field_keys", []))
            eligible_overlay_ids: list[str] = []
            for overlay_id in sorted(raw_overlay_ids):
                if not overlay_available(hour_detail, overlay_id):
                    continue
                field_key = field_key_for_raw_overlay_id(overlay_id)
                if field_key not in available_field_keys:
                    continue
                eligible_overlay_ids.append(overlay_id)
            if not eligible_overlay_ids:
                continue
            workers = max(1, min(int(max_workers), len(eligible_overlay_ids)))
            with ThreadPoolExecutor(max_workers=workers) as executor:
                future_map = {
                    executor.submit(
                        load_or_sample_raw_overlay_for_stations,
                        run_id=run_id,
                        member=member,
                        forecast_hour=int(forecast_hour),
                        overlay_id=overlay_id,
                        field_key=field_key_for_raw_overlay_id(overlay_id),
                        grib_key=grib_key,
                        idx_records=idx_records,
                        grib_size_bytes=grib_size,
                        station_records=station_records,
                        field_cache_root=field_cache_root,
                        sample_cache_root=sample_cache_root,
                    ): overlay_id
                    for overlay_id in eligible_overlay_ids
                }
                for future in as_completed(future_map):
                    overlay_id = future_map[future]
                    field_key = field_key_for_raw_overlay_id(overlay_id)
                    samples, cache_status = future.result()
                    completed_steps += 1
                    if logger:
                        logger.info(
                            "station-only sampling step %s/%s member=%s f%03d field=%s source=%s",
                            completed_steps,
                            total_steps,
                            member,
                            int(forecast_hour),
                            field_key,
                            cache_status,
                        )
                    for station_code in station_codes:
                        value = samples.get(station_code)
                        if value is None:
                            continue
                        raw_store[member][overlay_id].setdefault(int(forecast_hour), {})[station_code] = float(value)
    return raw_store


def load_or_sample_raw_overlay_for_stations(
    run_id: str,
    member: str,
    forecast_hour: int,
    overlay_id: str,
    field_key: str,
    grib_key: str,
    idx_records: list[object],
    grib_size_bytes: int,
    station_records: dict[str, dict[str, object]],
    field_cache_root: Path,
    sample_cache_root: Path,
) -> tuple[dict[str, float | None], str]:
    cache_path = station_sample_cache_path(sample_cache_root, run_id, member, forecast_hour, overlay_id)
    if cache_path.exists():
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
        return {key: (None if value is None else float(value)) for key, value in payload["samples"].items()}, "cache"
    samples = sample_raw_overlay_for_stations(
        grib_key=grib_key,
        idx_records=idx_records,
        grib_size_bytes=grib_size_bytes,
        field_key=field_key,
        station_records=station_records,
        field_cache_root=field_cache_root,
    )
    write_station_sample_cache(cache_path, run_id, member, forecast_hour, overlay_id, field_key, samples)
    return samples, "sampled"


def total_raw_sampling_steps(
    manifest: dict[str, object],
    member_ids: list[str],
    raw_overlay_ids: set[str],
) -> int:
    total = 0
    for member in member_ids:
        member_payload = manifest["members"].get(member)
        if not member_payload:
            continue
        for forecast_hour in member_payload["forecast_hours"]:
            hour_token = f"{int(forecast_hour):03d}"
            hour_detail = member_payload["forecast_hour_details"][hour_token]
            available_field_keys = set(hour_detail.get("field_keys", []))
            for overlay_id in raw_overlay_ids:
                if not overlay_available(hour_detail, overlay_id):
                    continue
                field_key = field_key_for_raw_overlay_id(overlay_id)
                if field_key in available_field_keys:
                    total += 1
    return total


def overlay_available(hour_detail: dict[str, object], overlay_id: str) -> bool:
    overlay_detail = hour_detail.get("overlays", {}).get(overlay_id)
    if overlay_detail is None:
        return True
    return bool(overlay_detail.get("available"))


def sample_raw_overlay_for_stations(
    grib_key: str,
    idx_records: list[object],
    grib_size_bytes: int,
    field_key: str,
    station_records: dict[str, dict[str, object]],
    field_cache_root: Path,
) -> dict[str, float | None]:
    grib_path = download_field_message(
        grib_key=grib_key,
        idx_records=idx_records,
        target_field_key=field_key,
        grib_size_bytes=grib_size_bytes,
        output_root=field_cache_root,
    )
    return sample_grib_points(Path(grib_path), station_records)


def station_sample_cache_path(
    sample_cache_root: Path,
    run_id: str,
    member: str,
    forecast_hour: int,
    overlay_id: str,
) -> Path:
    target_dir = sample_cache_root / run_id / member / f"f{forecast_hour:03d}"
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir / f"{safe_id(overlay_id)}.json"


def write_station_sample_cache(
    cache_path: Path,
    run_id: str,
    member: str,
    forecast_hour: int,
    overlay_id: str,
    field_key: str,
    samples: dict[str, float | None],
) -> None:
    payload = {
        "run_id": run_id,
        "member": member,
        "forecast_hour": forecast_hour,
        "overlay_id": overlay_id,
        "field_key": field_key,
        "samples": samples,
    }
    cache_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def safe_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").lower()


def sample_grib_points(
    grib_path: Path,
    station_records: dict[str, dict[str, object]],
) -> dict[str, float | None]:
    # eccodes/cfgrib is not consistently thread-safe on Windows for concurrent reads.
    with GRIB_READ_LOCK:
        with xr.open_dataset(grib_path, engine="cfgrib", backend_kwargs={"indexpath": ""}) as dataset:
            data_array = dataset[list(dataset.data_vars)[0]]
            while data_array.ndim > 2:
                data_array = data_array.isel({data_array.dims[0]: 0})
            values = np.asarray(data_array.values, dtype=np.float32)
            latitude = np.asarray(dataset["latitude"].values, dtype=np.float32)
            longitude = np.asarray(dataset["longitude"].values, dtype=np.float32)

    finite_mask = np.isfinite(values)
    if not np.any(finite_mask):
        return {station_code: None for station_code in station_records}

    samples: dict[str, float | None] = {}
    for station_code, station in station_records.items():
        target_lon = normalize_longitude(float(station["lon"]), longitude)
        distance = ((latitude - float(station["lat"])) ** 2) + ((longitude - target_lon) ** 2)
        distance = np.where(finite_mask, distance, np.inf)
        y_index, x_index = np.unravel_index(int(np.argmin(distance)), distance.shape)
        value = values[y_index, x_index]
        samples[station_code] = None if not np.isfinite(value) else float(value)
    return samples


def build_logical_sample_store(
    raw_samples: dict[str, dict[str, dict[int, dict[str, float]]]],
    logical_overlays: set[str],
) -> dict[str, dict[str, dict[int, dict[str, float]]]]:
    logical_store: dict[str, dict[str, dict[int, dict[str, float]]]] = defaultdict(lambda: defaultdict(dict))
    for member, overlays in raw_samples.items():
        for overlay_id in logical_overlays:
            if overlay_id in DERIVED_POINT_OVERLAYS:
                left_id, right_id = [str(component) for component in DERIVED_POINT_OVERLAYS[overlay_id]["components"]]
                logical_store[member][overlay_id] = combine_vector_component_samples(overlays.get(left_id, {}), overlays.get(right_id, {}))
                continue
            spec = PRODUCT_SPECS.get(overlay_id)
            if spec and spec.mode == "derived_wind_speed":
                left_id, right_id = [raw_overlay_id_for_field_key(field_key) for field_key in spec.component_field_keys]
                logical_store[member][overlay_id] = combine_vector_component_samples(overlays.get(left_id, {}), overlays.get(right_id, {}))
                continue
            if overlay_id in overlays:
                logical_store[member][overlay_id] = overlays[overlay_id]
    return logical_store


def combine_vector_component_samples(
    left_points: dict[int, dict[str, float]],
    right_points: dict[int, dict[str, float]],
) -> dict[int, dict[str, float]]:
    combined: dict[int, dict[str, float]] = {}
    for forecast_hour in sorted(set(left_points) | set(right_points)):
        left_by_station = left_points.get(forecast_hour, {})
        right_by_station = right_points.get(forecast_hour, {})
        station_values: dict[str, float] = {}
        for station_code in sorted(set(left_by_station) | set(right_by_station)):
            if station_code not in left_by_station or station_code not in right_by_station:
                continue
            station_values[station_code] = float(np.hypot(float(left_by_station[station_code]), float(right_by_station[station_code])))
        if station_values:
            combined[forecast_hour] = station_values
    return combined


def build_member_payload_from_store(
    run_id: str,
    member: str,
    station: dict[str, object],
    available_members: list[str],
    logical_samples: dict[str, dict[str, dict[int, dict[str, float]]]],
    manifest: dict[str, object],
) -> dict[str, object]:
    station_code = str(station["id"]).upper()
    member_profile = "m00" if member.startswith("m") else member
    series_payload: dict[str, object] = {}
    for overlay_id in DEFAULT_MEMBER_OVERLAYS[member_profile]:
        points = logical_line_points(run_id, logical_samples.get(member, {}).get(overlay_id, {}), station_code, station)
        if points:
            series_payload[overlay_id] = overlay_payload(overlay_id, points)
    for derived_overlay_id in DERIVED_POINT_OVERLAYS:
        points = logical_line_points(run_id, logical_samples.get(member, {}).get(derived_overlay_id, {}), station_code, station)
        if points:
            series_payload[derived_overlay_id] = overlay_payload(derived_overlay_id, points)

    chart_groups = []
    for group in CHART_GROUPS.get(member_profile, []):
        group_overlays = [overlay_id for overlay_id in group["overlays"] if overlay_id in series_payload]
        if group_overlays:
            chart_groups.append({**group, "overlays": group_overlays})
    return {
        "run_id": run_id,
        "member": member,
        "station": station,
        "available_members": available_members,
        "chart_groups": chart_groups,
        "series": series_payload,
    }


def build_ensemble_payload_from_store(
    run_id: str,
    station: dict[str, object],
    available_members: list[str],
    logical_samples: dict[str, dict[str, dict[int, dict[str, float]]]],
    manifest: dict[str, object],
) -> dict[str, object]:
    station_code = str(station["id"]).upper()
    deterministic_members = sorted(str(member) for member in manifest["run"]["members"])
    series_payload: dict[str, object] = {}

    for overlay_id in DEFAULT_MEMBER_OVERLAYS["ens"]:
        spec = ENSEMBLE_PRODUCT_SPECS[overlay_id]
        source_overlay = PROBABILITY_SOURCE_OVERLAYS[overlay_id]
        points = probability_points(
            run_id=run_id,
            logical_samples=logical_samples,
            source_overlay=source_overlay,
            members=deterministic_members,
            station_code=station_code,
            station=station,
            threshold=float(spec.threshold_raw if spec.threshold_raw is not None else spec.threshold or 0.0),
        )
        if points:
            series_payload[overlay_id] = overlay_payload(overlay_id, points)

    chart_groups = []
    for group in CHART_GROUPS.get("ens", []):
        group_overlays = [overlay_id for overlay_id in group["overlays"] if overlay_id in series_payload]
        if group_overlays:
            chart_groups.append({**group, "overlays": group_overlays})

    return {
        "run_id": run_id,
        "member": "ens",
        "station": station,
        "available_members": available_members,
        "chart_groups": chart_groups,
        "series": series_payload,
    }


def logical_line_points(
    run_id: str,
    forecast_hour_values: dict[int, dict[str, float]],
    station_code: str,
    station: dict[str, object],
) -> list[dict[str, object]]:
    points: list[dict[str, object]] = []
    for forecast_hour in sorted(forecast_hour_values):
        value = forecast_hour_values[forecast_hour].get(station_code)
        if value is None:
            continue
        points.append(
            {
                "forecast_hour": int(forecast_hour),
                "valid_time_utc": valid_time_for_hour(run_id, int(forecast_hour)),
                "value": float(value),
                "domain_id": "point",
                "grid_lat": float(station["lat"]),
                "grid_lon": float(station["lon"]),
            }
        )
    return points


def probability_points(
    run_id: str,
    logical_samples: dict[str, dict[str, dict[int, dict[str, float]]]],
    source_overlay: str,
    members: list[str],
    station_code: str,
    station: dict[str, object],
    threshold: float,
) -> list[dict[str, object]]:
    forecast_hours = sorted(
        {
            forecast_hour
            for member in members
            for forecast_hour in logical_samples.get(member, {}).get(source_overlay, {}).keys()
        }
    )
    points: list[dict[str, object]] = []
    for forecast_hour in forecast_hours:
        values = [
            float(logical_samples[member][source_overlay][forecast_hour][station_code])
            for member in members
            if station_code in logical_samples.get(member, {}).get(source_overlay, {}).get(forecast_hour, {})
        ]
        if not values:
            continue
        probability = (sum(value >= threshold for value in values) / len(values)) * 100.0
        points.append(
            {
                "forecast_hour": int(forecast_hour),
                "valid_time_utc": valid_time_for_hour(run_id, int(forecast_hour)),
                "value": float(probability),
                "domain_id": "point",
                "grid_lat": float(station["lat"]),
                "grid_lon": float(station["lon"]),
            }
        )
    return points


def distribution_points(
    run_id: str,
    logical_samples: dict[str, dict[str, dict[int, dict[str, float]]]],
    source_overlay: str,
    members: list[str],
    station_code: str,
    station: dict[str, object],
) -> list[dict[str, object]]:
    forecast_hours = sorted(
        {
            forecast_hour
            for member in members
            for forecast_hour in logical_samples.get(member, {}).get(source_overlay, {}).keys()
        }
    )
    points: list[dict[str, object]] = []
    for forecast_hour in forecast_hours:
        values = [
            float(logical_samples[member][source_overlay][forecast_hour][station_code])
            for member in members
            if station_code in logical_samples.get(member, {}).get(source_overlay, {}).get(forecast_hour, {})
        ]
        if len(values) < 2:
            continue
        array = np.asarray(values, dtype=np.float32)
        q0, q1, q2, q3, q4 = np.percentile(array, [0, 25, 50, 75, 100])
        points.append(
            {
                "forecast_hour": int(forecast_hour),
                "valid_time_utc": valid_time_for_hour(run_id, int(forecast_hour)),
                "domain_id": "point",
                "grid_lat": float(station["lat"]),
                "grid_lon": float(station["lon"]),
                "count": int(array.size),
                "min": float(q0),
                "q1": float(q1),
                "median": float(q2),
                "q3": float(q3),
                "max": float(q4),
                "mean": float(np.mean(array)),
                "member_values": [float(value) for value in np.sort(array)],
            }
        )
    return points
