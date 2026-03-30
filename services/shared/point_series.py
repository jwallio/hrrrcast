"""Airport/station lookup and HRRRCast point time-series extraction."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import xarray as xr

from pipelines.ingest.field_catalog import load_static_layers, style_for_overlay_id
from services.shared.store import DEFAULT_DATA_ROOT, build_product_index, get_asset_metadata, resolve_run_selector


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STATION_CATALOG_PATH = ROOT / "data" / "reference" / "aviation_stations_conus.json"
DEFAULT_LAYERS_PATH = ROOT / "config" / "layers.json"

DEFAULT_MEMBER_OVERLAYS: dict[str, list[str]] = {
    "ens": [
        "composite_reflectivity_probability_gt_40dbz",
        "qpf_probability_gt_0p10",
        "cape_probability_gt_1000",
        "helicity_0_1km_probability_gt_100",
        "helicity_0_3km_probability_gt_250",
        "shear_0_1km_probability_gt_20kt",
        "shear_0_6km_probability_gt_40kt",
        "wind_10m_probability_gt_25kt",
    ],
    "m00": [
        "composite_reflectivity",
        "qpf",
        "cape",
        "cin_surface",
        "dewpoint_2m",
        "rh_2m",
        "pwat",
        "visibility",
        "ceiling",
        "surface_pressure",
        "helicity_0_1km",
        "helicity_0_3km",
        "storm_motion_u",
        "storm_motion_v",
        "relative_vorticity_0_1km",
        "relative_vorticity_0_2km",
        "shear_u_0_1km",
        "shear_v_0_1km",
        "shear_u_0_6km",
        "shear_v_0_6km",
        "wind_10m",
        "gust_surface",
        "height_500mb",
        "temperature_850mb",
        "wind_500mb",
        "vertical_velocity_500mb",
    ],
}

ENSEMBLE_SPREAD_OVERLAYS: dict[str, dict[str, object]] = {
    "composite_reflectivity_member_spread": {"source": "composite_reflectivity", "label": "Composite Reflectivity Member Spread"},
    "qpf_member_spread": {"source": "qpf", "label": "Accumulated Precipitation Member Spread"},
    "cape_member_spread": {"source": "cape", "label": "Surface CAPE Member Spread"},
    "helicity_0_1km_member_spread": {"source": "helicity_0_1km", "label": "0 to 1 km Helicity Member Spread"},
    "helicity_0_3km_member_spread": {"source": "helicity_0_3km", "label": "0 to 3 km Helicity Member Spread"},
    "shear_0_1km_speed_member_spread": {"source": "shear_0_1km_speed", "label": "0 to 1 km Shear Member Spread"},
    "shear_0_6km_speed_member_spread": {"source": "shear_0_6km_speed", "label": "0 to 6 km Shear Member Spread"},
    "wind_10m_member_spread": {"source": "wind_10m", "label": "10 m Wind Member Spread"},
    "gust_surface_member_spread": {"source": "gust_surface", "label": "Surface Gust Member Spread"},
}

CHART_GROUPS: dict[str, list[dict[str, object]]] = {
    "ens": [
        {
            "id": "storm",
            "title": "Storm Signals",
            "overlays": [
                "composite_reflectivity_probability_gt_40dbz",
                "qpf_probability_gt_0p10",
                "composite_reflectivity_member_spread",
                "qpf_member_spread",
            ],
        },
        {"id": "instability", "title": "Instability", "overlays": ["cape_probability_gt_1000", "cape_member_spread"]},
        {
            "id": "rotation",
            "title": "Rotation",
            "overlays": [
                "helicity_0_1km_probability_gt_100",
                "helicity_0_3km_probability_gt_250",
                "helicity_0_1km_member_spread",
                "helicity_0_3km_member_spread",
            ],
        },
        {
            "id": "shear",
            "title": "Shear",
            "overlays": [
                "shear_0_1km_probability_gt_20kt",
                "shear_0_6km_probability_gt_40kt",
                "shear_0_1km_speed_member_spread",
                "shear_0_6km_speed_member_spread",
            ],
        },
        {
            "id": "wind",
            "title": "Wind",
            "overlays": [
                "wind_10m_probability_gt_25kt",
                "wind_10m_member_spread",
                "gust_surface_member_spread",
            ],
        },
    ],
    "m00": [
        {"id": "storm", "title": "Storm Signals", "overlays": ["composite_reflectivity", "qpf"]},
        {"id": "instability", "title": "Instability", "overlays": ["cape", "cin_surface"]},
        {"id": "moisture", "title": "Moisture", "overlays": ["dewpoint_2m", "rh_2m", "pwat", "surface_pressure"]},
        {"id": "aviation", "title": "Aviation", "overlays": ["visibility", "ceiling"]},
        {"id": "rotation", "title": "Rotation", "overlays": ["helicity_0_1km", "helicity_0_3km"]},
        {"id": "kinematics", "title": "Kinematics", "overlays": ["storm_motion_u", "storm_motion_v", "relative_vorticity_0_1km", "relative_vorticity_0_2km"]},
        {"id": "shear", "title": "Shear", "overlays": ["shear_0_1km_speed", "shear_0_6km_speed"]},
        {"id": "wind", "title": "Wind", "overlays": ["wind_10m", "gust_surface"]},
        {"id": "upper", "title": "Upper Air", "overlays": ["height_500mb", "temperature_850mb", "wind_500mb", "vertical_velocity_500mb"]},
    ],
}

DERIVED_POINT_OVERLAYS = {
    "shear_0_1km_speed": {
        "label": "0 to 1 km Shear Speed",
        "units": "m s-1",
        "style": {"type": "continuous", "units": "m s-1", "range": [0.0, 40.0], "labels": ["0", "10", "20", "30", "40"]},
        "components": ("shear_u_0_1km", "shear_v_0_1km"),
    },
    "shear_0_6km_speed": {
        "label": "0 to 6 km Shear Speed",
        "units": "m s-1",
        "style": {"type": "continuous", "units": "m s-1", "range": [0.0, 60.0], "labels": ["0", "15", "30", "45", "60"]},
        "components": ("shear_u_0_6km", "shear_v_0_6km"),
    },
}


@lru_cache(maxsize=1)
def load_station_catalog(path: str | Path = DEFAULT_STATION_CATALOG_PATH) -> dict[str, object]:
    import json

    return json.loads(Path(path).read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def station_alias_index(path: str | Path = DEFAULT_STATION_CATALOG_PATH) -> tuple[dict[str, dict[str, object]], list[dict[str, object]]]:
    catalog = load_station_catalog(path)
    stations = list(catalog["stations"])
    alias_map: dict[str, dict[str, object]] = {}
    for station in stations:
        alias_map[str(station["id"]).upper()] = station
        for alias in station.get("aliases", []):
            alias_map[str(alias).upper()] = station
    return alias_map, stations


def search_stations(query: str, limit: int = 12, path: str | Path = DEFAULT_STATION_CATALOG_PATH) -> list[dict[str, object]]:
    text = query.strip().upper()
    if not text:
        return []
    alias_map, stations = station_alias_index(path)
    exact = alias_map.get(text)
    if exact:
        return [exact]

    prefix_matches: list[dict[str, object]] = []
    contains_matches: list[dict[str, object]] = []
    seen: set[str] = set()
    for station in stations:
        tokens = [station["id"], *station.get("aliases", []), station.get("site", "")]
        haystack = [str(token).upper() for token in tokens if token]
        if any(item.startswith(text) for item in haystack):
            if station["id"] not in seen:
                prefix_matches.append(station)
                seen.add(station["id"])
            continue
        if text in " ".join(haystack) and station["id"] not in seen:
            contains_matches.append(station)
            seen.add(station["id"])
    return (prefix_matches + contains_matches)[:limit]


def get_station(station_code: str, path: str | Path = DEFAULT_STATION_CATALOG_PATH) -> dict[str, object]:
    alias_map, _ = station_alias_index(path)
    station = alias_map.get(station_code.strip().upper())
    if not station:
        raise FileNotFoundError(f"Station not found for code {station_code}")
    return station


def build_point_series(
    run_selector: str,
    station_code: str,
    member: str,
    overlays: list[str] | None = None,
    data_root: str | Path = DEFAULT_DATA_ROOT,
    station_catalog_path: str | Path = DEFAULT_STATION_CATALOG_PATH,
) -> dict[str, object]:
    run_id = resolve_run_selector(run_selector, data_root)
    station = get_station(station_code, station_catalog_path)
    product_index = build_product_index(data_root)
    run_payload = product_index["runs"].get(run_id)
    if not run_payload:
        raise FileNotFoundError(f"No built products found for run {run_id}")
    has_deterministic_members = any(member_id.startswith("m") for member_id in run_payload["members"].keys())
    if member not in run_payload["members"] and not (member == "ens" and has_deterministic_members):
        raise FileNotFoundError(f"Member {member} not found for run {run_id}")

    member_payload = run_payload["members"].get(member, {})
    available_overlay_ids = collect_member_overlays(member_payload)
    requested_overlays = overlays or DEFAULT_MEMBER_OVERLAYS.get(member, [])
    selected_overlay_ids = [overlay_id for overlay_id in requested_overlays if overlay_id in available_overlay_ids]

    series_payload: dict[str, object] = {}
    for overlay_id in selected_overlay_ids:
        points = build_overlay_series(run_id, member, overlay_id, station, data_root, run_payload)
        if points:
            series_payload[overlay_id] = overlay_payload(overlay_id, points)

    if member == "m00":
        for derived_overlay_id, config in DERIVED_POINT_OVERLAYS.items():
            left = series_payload.get(config["components"][0])
            right = series_payload.get(config["components"][1])
            if left and right:
                series_payload[derived_overlay_id] = derive_vector_magnitude(derived_overlay_id, left, right)
    elif member == "ens":
        for derived_overlay_id in ENSEMBLE_SPREAD_OVERLAYS:
            points = build_ensemble_distribution_series(run_id, derived_overlay_id, station, data_root, run_payload)
            if points:
                series_payload[derived_overlay_id] = ensemble_distribution_payload(derived_overlay_id, points)

    chart_groups = []
    for group in CHART_GROUPS.get(member, []):
        group_overlays = [overlay_id for overlay_id in group["overlays"] if overlay_id in series_payload]
        if group_overlays:
            chart_groups.append({**group, "overlays": group_overlays})

    return {
        "run_id": run_id,
        "member": member,
        "station": station,
        "available_members": sorted(run_payload["members"].keys()),
        "chart_groups": chart_groups,
        "series": series_payload,
    }


def collect_member_overlays(member_payload: dict[str, object]) -> set[str]:
    overlay_ids: set[str] = set()
    for hour_payload in member_payload.get("forecast_hours", {}).values():
        overlay_ids.update(hour_payload.get("overlays", {}).keys())
    return overlay_ids


def build_overlay_series(
    run_id: str,
    member: str,
    overlay_id: str,
    station: dict[str, object],
    data_root: str | Path,
    run_payload: dict[str, object],
) -> list[dict[str, object]]:
    points: list[dict[str, object]] = []
    forecast_hours = run_payload["members"][member]["forecast_hours"]
    for hour_token, hour_payload in sorted(forecast_hours.items()):
        domains = hour_payload.get("overlays", {}).get(overlay_id)
        if not domains:
            continue
        forecast_hour = int(hour_token[1:])
        domain_id = "conus" if "conus" in domains else domains[0]
        metadata = get_asset_metadata(run_id, member, overlay_id, forecast_hour, domain_id, data_root)
        sample = sample_netcdf_point(metadata["netcdf_path"], float(station["lat"]), float(station["lon"]))
        if sample["value"] is None:
            continue
        points.append(
            {
                "forecast_hour": forecast_hour,
                "valid_time_utc": valid_time_for_hour(run_id, forecast_hour),
                "value": sample["value"],
                "domain_id": domain_id,
                "grid_lat": sample["grid_lat"],
                "grid_lon": sample["grid_lon"],
            }
        )
    return points


def overlay_payload(overlay_id: str, points: list[dict[str, object]]) -> dict[str, object]:
    style = overlay_style(overlay_id)
    normalized_points = normalize_overlay_points(points, style)
    return {
        "id": overlay_id,
        "label": overlay_label(overlay_id),
        "units": overlay_units(overlay_id),
        "style": style,
        "points": normalized_points,
        "summary": summarize_points(normalized_points),
    }


def overlay_label(overlay_id: str) -> str:
    if overlay_id in ENSEMBLE_SPREAD_OVERLAYS:
        return str(ENSEMBLE_SPREAD_OVERLAYS[overlay_id]["label"])
    if overlay_id in DERIVED_POINT_OVERLAYS:
        return str(DERIVED_POINT_OVERLAYS[overlay_id]["label"])
    overlay = curated_overlay_map().get(overlay_id)
    if overlay:
        return str(overlay.get("label") or overlay_id.replace("_", " ").title())
    return overlay_id.replace("_", " ").title()


def overlay_units(overlay_id: str) -> str:
    if overlay_id in ENSEMBLE_SPREAD_OVERLAYS:
        return overlay_units(str(ENSEMBLE_SPREAD_OVERLAYS[overlay_id]["source"]))
    if overlay_id in DERIVED_POINT_OVERLAYS:
        return str(DERIVED_POINT_OVERLAYS[overlay_id]["units"])
    style = style_for_overlay_id(overlay_id)
    return str(style.get("units") or "")


def overlay_style(overlay_id: str) -> dict[str, object]:
    if overlay_id in ENSEMBLE_SPREAD_OVERLAYS:
        return style_for_overlay_id(str(ENSEMBLE_SPREAD_OVERLAYS[overlay_id]["source"]))
    if overlay_id in DERIVED_POINT_OVERLAYS:
        return dict(DERIVED_POINT_OVERLAYS[overlay_id]["style"])
    return style_for_overlay_id(overlay_id)


def normalize_overlay_points(points: list[dict[str, object]], style: dict[str, object]) -> list[dict[str, object]]:
    units = str(style.get("units") or "")
    style_range = style.get("range") if isinstance(style, dict) else None
    if units != "%" or not isinstance(style_range, list) or len(style_range) < 2 or float(style_range[1]) <= 1.0:
        return points

    values = [float(point["value"]) for point in points if point.get("value") is not None]
    if not values:
        return points
    if max(abs(value) for value in values) > 1.0 + 1e-6:
        return points

    scaled_points: list[dict[str, object]] = []
    for point in points:
        value = point.get("value")
        scaled_points.append(
            {
                **point,
                "value": None if value is None else float(value) * 100.0,
            }
        )
    return scaled_points


def summarize_points(points: list[dict[str, object]]) -> dict[str, object]:
    values = [float(point["value"]) for point in points if point.get("value") is not None]
    if not values:
        return {"count": 0, "min": None, "max": None, "latest": None, "all_zero": False}
    latest_value = float(points[-1]["value"]) if points[-1].get("value") is not None else values[-1]
    return {
        "count": len(values),
        "min": float(min(values)),
        "max": float(max(values)),
        "latest": latest_value,
        "all_zero": all(abs(value) < 1e-6 for value in values),
    }


def summarize_distribution(points: list[dict[str, object]]) -> dict[str, object]:
    if not points:
        return {"count": 0, "min": None, "max": None, "latest": None, "all_zero": False}
    median_values = [float(point["median"]) for point in points]
    min_values = [float(point["min"]) for point in points]
    max_values = [float(point["max"]) for point in points]
    return {
        "count": len(points),
        "min": float(min(min_values)),
        "max": float(max(max_values)),
        "latest": float(points[-1]["median"]),
        "all_zero": all(abs(value) < 1e-6 for value in median_values) and all(abs(value) < 1e-6 for value in max_values),
    }


def ensemble_distribution_payload(overlay_id: str, points: list[dict[str, object]]) -> dict[str, object]:
    style = overlay_style(overlay_id)
    return {
        "id": overlay_id,
        "label": overlay_label(overlay_id),
        "units": overlay_units(overlay_id),
        "style": style,
        "chart_type": "distribution",
        "points": points,
        "summary": summarize_distribution(points),
    }


def derive_vector_magnitude(
    overlay_id: str,
    left: dict[str, object],
    right: dict[str, object],
) -> dict[str, object]:
    right_points = {int(point["forecast_hour"]): point for point in right["points"]}
    derived_points = []
    for left_point in left["points"]:
        forecast_hour = int(left_point["forecast_hour"])
        right_point = right_points.get(forecast_hour)
        if not right_point:
            continue
        magnitude = float(np.hypot(float(left_point["value"]), float(right_point["value"])))
        derived_points.append(
            {
                "forecast_hour": forecast_hour,
                "valid_time_utc": left_point["valid_time_utc"],
                "value": magnitude,
                "domain_id": left_point["domain_id"],
                "grid_lat": left_point["grid_lat"],
                "grid_lon": left_point["grid_lon"],
            }
        )
    return overlay_payload(overlay_id, derived_points)


def build_ensemble_distribution_series(
    run_id: str,
    overlay_id: str,
    station: dict[str, object],
    data_root: str | Path,
    run_payload: dict[str, object],
) -> list[dict[str, object]]:
    source_overlay = str(ENSEMBLE_SPREAD_OVERLAYS[overlay_id]["source"])
    member_ids = [member_id for member_id in sorted(run_payload["members"].keys()) if member_id.startswith("m")]
    hour_values: dict[int, list[float]] = {}
    representative_points: dict[int, dict[str, object]] = {}
    for member_id in member_ids:
        member_points = build_member_source_series(run_id, member_id, source_overlay, station, data_root, run_payload)
        for point in member_points:
            forecast_hour = int(point["forecast_hour"])
            hour_values.setdefault(forecast_hour, []).append(float(point["value"]))
            representative_points.setdefault(
                forecast_hour,
                {
                    "forecast_hour": forecast_hour,
                    "valid_time_utc": point["valid_time_utc"],
                    "domain_id": point["domain_id"],
                    "grid_lat": point["grid_lat"],
                    "grid_lon": point["grid_lon"],
                },
            )

    distribution_points: list[dict[str, object]] = []
    for forecast_hour in sorted(hour_values):
        values = hour_values[forecast_hour]
        if len(values) < 2:
            continue
        array = np.asarray(values, dtype=np.float32)
        q0, q1, q2, q3, q4 = np.percentile(array, [0, 25, 50, 75, 100])
        distribution_points.append(
            {
                **representative_points[forecast_hour],
                "count": int(array.size),
                "min": float(q0),
                "q1": float(q1),
                "median": float(q2),
                "q3": float(q3),
                "max": float(q4),
                "mean": float(np.mean(array)),
            }
        )
    return distribution_points


def build_member_source_series(
    run_id: str,
    member_id: str,
    source_overlay: str,
    station: dict[str, object],
    data_root: str | Path,
    run_payload: dict[str, object],
) -> list[dict[str, object]]:
    if source_overlay in DERIVED_POINT_OVERLAYS:
        config = DERIVED_POINT_OVERLAYS[source_overlay]
        left_points = build_overlay_series(run_id, member_id, str(config["components"][0]), station, data_root, run_payload)
        right_points = build_overlay_series(run_id, member_id, str(config["components"][1]), station, data_root, run_payload)
        if not left_points or not right_points:
            return []
        return derive_vector_magnitude(
            source_overlay,
            overlay_payload(str(config["components"][0]), left_points),
            overlay_payload(str(config["components"][1]), right_points),
        )["points"]
    return build_overlay_series(run_id, member_id, source_overlay, station, data_root, run_payload)


def sample_netcdf_point(netcdf_path: str | Path, station_lat: float, station_lon: float) -> dict[str, float | None]:
    values, latitude, longitude = load_netcdf_point_arrays(netcdf_path)
    target_lon = normalize_longitude(station_lon, longitude)
    finite_mask = np.isfinite(values)
    if not np.any(finite_mask):
        return {"value": None, "grid_lat": None, "grid_lon": None}
    distance = ((latitude - station_lat) ** 2) + ((longitude - target_lon) ** 2)
    distance = np.where(finite_mask, distance, np.inf)
    y_index, x_index = np.unravel_index(int(np.argmin(distance)), distance.shape)
    value = values[y_index, x_index]
    return {
        "value": None if not np.isfinite(value) else float(value),
        "grid_lat": float(latitude[y_index, x_index]),
        "grid_lon": normalize_longitude_back(float(longitude[y_index, x_index])),
    }


@lru_cache(maxsize=256)
def load_netcdf_point_arrays(netcdf_path: str | Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    with xr.open_dataset(netcdf_path) as dataset:
        variable_name = list(dataset.data_vars)[0]
        data_array = dataset[variable_name]
        if "time" in data_array.dims:
            data_array = data_array.isel(time=0)
        values = np.asarray(data_array.values, dtype=np.float32)
        latitude = np.asarray(dataset["latitude"].values, dtype=np.float32)
        longitude = np.asarray(dataset["longitude"].values, dtype=np.float32)
    return values, latitude, longitude


def normalize_longitude(lon: float, longitude_grid: np.ndarray) -> float:
    if float(np.nanmin(longitude_grid)) >= 0.0:
        return lon % 360.0
    return lon


def normalize_longitude_back(lon: float) -> float:
    return lon - 360.0 if lon > 180.0 else lon


def valid_time_for_hour(run_id: str, forecast_hour: int) -> str:
    from datetime import UTC, datetime, timedelta

    init_time = datetime(
        year=int(run_id[0:4]),
        month=int(run_id[4:6]),
        day=int(run_id[6:8]),
        hour=int(run_id[8:10]),
        tzinfo=UTC,
    )
    return (init_time + timedelta(hours=forecast_hour)).isoformat()


@lru_cache(maxsize=1)
def curated_overlay_map() -> dict[str, dict[str, object]]:
    payload = load_static_layers(DEFAULT_LAYERS_PATH)
    return {str(overlay["id"]): overlay for overlay in payload.get("weatherOverlays", [])}
