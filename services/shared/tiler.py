"""XYZ tile rendering over processed NetCDF assets."""

from __future__ import annotations

from functools import lru_cache
from io import BytesIO
import math
from pathlib import Path
import shutil

import numpy as np
from PIL import Image
import xarray as xr

from pipelines.ingest.field_catalog import style_for_overlay_id
from .preview import PALETTES, apply_palette, render_ptype

TILE_SIZE = 256
DEFAULT_TILE_CACHE_ROOT = Path("data/processed/tile_cache")
MAX_MERCATOR_LAT = 85.05112878

OVERLAY_SCALES: dict[str, tuple[float, float]] = {
    "temperature_2m": (250.0, 315.0),
    "qpf": (0.0, 25.0),
    "composite_reflectivity": (0.0, 70.0),
    "mslp": (98000.0, 104000.0),
    "cape": (0.0, 4000.0),
    "wind_10m": (0.0, 35.0),
}


def render_tile_png(
    netcdf_path: str | Path,
    overlay_id: str,
    z: int,
    x: int,
    y: int,
    metadata: dict[str, object] | None = None,
) -> bytes:
    asset = load_asset_grid(str(netcdf_path))
    lon_grid, lat_grid = tile_lonlat_grid(z, x, y)
    sampled, valid_mask = sample_asset(asset, lon_grid, lat_grid)
    if not np.any(valid_mask):
        return blank_tile_png()
    rgba = colorize_overlay(sampled, valid_mask, overlay_id, metadata)
    image = Image.fromarray(rgba, mode="RGBA")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def render_tile_png_cached(
    netcdf_path: str | Path,
    overlay_id: str,
    z: int,
    x: int,
    y: int,
    cache_path: str | Path | None = None,
    metadata: dict[str, object] | None = None,
) -> bytes:
    if cache_path is not None:
        cache_path = Path(cache_path)
        if cache_path.exists():
            return cache_path.read_bytes()
    payload = render_tile_png(netcdf_path, overlay_id, z, x, y, metadata=metadata)
    if cache_path is not None:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(payload)
    return payload


def build_tile_cache_path(
    run_id: str,
    member: str,
    overlay_id: str,
    forecast_hour: int,
    domain_id: str,
    z: int,
    x: int,
    y: int,
    cache_root: str | Path = DEFAULT_TILE_CACHE_ROOT,
) -> Path:
    return (
        Path(cache_root)
        / run_id
        / member
        / overlay_id
        / f"f{forecast_hour:03d}"
        / domain_id
        / str(z)
        / str(x)
        / f"{y}.png"
    )


def invalidate_tile_cache(
    run_id: str,
    member: str,
    overlay_id: str,
    forecast_hour: int,
    domain_id: str,
    cache_root: str | Path = DEFAULT_TILE_CACHE_ROOT,
) -> int:
    cache_dir = (
        Path(cache_root)
        / run_id
        / member
        / overlay_id
        / f"f{forecast_hour:03d}"
        / domain_id
    )
    if not cache_dir.exists():
        return 0
    shutil.rmtree(cache_dir)
    return 1


def clear_runtime_caches() -> None:
    load_asset_grid.cache_clear()


def tile_bounds_lonlat(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    west = tile_x_to_lon(x, z)
    east = tile_x_to_lon(x + 1, z)
    north = tile_y_to_lat(y, z)
    south = tile_y_to_lat(y + 1, z)
    return west, south, east, north


def tile_range_for_bbox(bbox: list[float] | tuple[float, float, float, float], z: int) -> tuple[range, range]:
    west, south, east, north = bbox
    scale = 2**z
    epsilon = 1e-9
    x_start = clamp_tile_index(math.floor(lon_to_tile_x(west, z)), scale)
    x_end = clamp_tile_index(math.floor(lon_to_tile_x(east - epsilon, z)), scale)
    y_start = clamp_tile_index(math.floor(lat_to_tile_y(north, z)), scale)
    y_end = clamp_tile_index(math.floor(lat_to_tile_y(south + epsilon, z)), scale)
    return range(x_start, x_end + 1), range(y_start, y_end + 1)


def tile_lonlat_grid(z: int, x: int, y: int) -> tuple[np.ndarray, np.ndarray]:
    west, south, east, north = tile_bounds_lonlat(z, x, y)
    xs = np.linspace(west, east, num=TILE_SIZE, endpoint=False, dtype=np.float32)
    ys = np.linspace(north, south, num=TILE_SIZE, endpoint=False, dtype=np.float32)
    lon_grid, lat_grid = np.meshgrid(xs, ys)
    return lon_grid, lat_grid


def sample_asset(asset: dict[str, np.ndarray], lon_grid: np.ndarray, lat_grid: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    lon_axis = asset["lon_axis"]
    lat_axis = asset["lat_axis"]
    values = asset["values"]

    lon_grid = lon_grid.copy()
    if asset["wrap_longitudes"]:
        lon_grid = np.where(lon_grid < 0.0, lon_grid + 360.0, lon_grid)

    lon_mask = (lon_grid >= lon_axis[0]) & (lon_grid <= lon_axis[-1])
    lat_mask = (lat_grid >= lat_axis[0]) & (lat_grid <= lat_axis[-1])
    valid_mask = lon_mask & lat_mask
    sampled = np.full(lon_grid.shape, np.nan, dtype=np.float32)
    if not np.any(valid_mask):
        return sampled, valid_mask

    x_indices = np.interp(lon_grid[valid_mask], lon_axis, np.arange(lon_axis.size, dtype=np.float32))
    y_indices = np.interp(lat_grid[valid_mask], lat_axis, np.arange(lat_axis.size, dtype=np.float32))

    x0 = np.floor(x_indices).astype(np.int32)
    y0 = np.floor(y_indices).astype(np.int32)
    x1 = np.clip(x0 + 1, 0, values.shape[1] - 1)
    y1 = np.clip(y0 + 1, 0, values.shape[0] - 1)
    x0 = np.clip(x0, 0, values.shape[1] - 1)
    y0 = np.clip(y0, 0, values.shape[0] - 1)
    wx = x_indices - x0
    wy = y_indices - y0

    v00 = values[y0, x0]
    v10 = values[y0, x1]
    v01 = values[y1, x0]
    v11 = values[y1, x1]
    sample = (
        v00 * (1 - wx) * (1 - wy)
        + v10 * wx * (1 - wy)
        + v01 * (1 - wx) * wy
        + v11 * wx * wy
    )
    sampled[valid_mask] = sample.astype(np.float32)
    return sampled, valid_mask


def colorize_overlay(
    sampled: np.ndarray,
    valid_mask: np.ndarray,
    overlay_id: str,
    metadata: dict[str, object] | None = None,
) -> np.ndarray:
    rgba = np.zeros(sampled.shape + (4,), dtype=np.uint8)
    style = resolve_style(overlay_id, metadata)
    if style.get("type") == "categorical" and overlay_id == "ptype":
        rgb = render_ptype(np.nan_to_num(sampled, nan=0.0).astype(np.int16))
    else:
        lower, upper = configured_range(overlay_id, sampled, style)
        if not np.isfinite(lower):
            lower, upper = 0.0, 1.0
        normalized = np.clip((sampled - lower) / max(upper - lower, 1e-6), 0.0, 1.0)
        rgb = apply_palette(
            np.nan_to_num(normalized, nan=0.0).astype(np.float32),
            palette_for_style(overlay_id, style),
        )
    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(valid_mask & np.isfinite(sampled), 220, 0).astype(np.uint8)
    return rgba


@lru_cache(maxsize=64)
def load_asset_grid(netcdf_path: str) -> dict[str, np.ndarray]:
    with xr.open_dataset(netcdf_path) as dataset:
        variable_name = list(dataset.data_vars)[0]
        data_array = dataset[variable_name]
        if "time" in data_array.dims:
            data_array = data_array.isel(time=0)
        values = np.asarray(data_array.values, dtype=np.float32)
        latitude = np.asarray(dataset["latitude"].values, dtype=np.float32)
        longitude = np.asarray(dataset["longitude"].values, dtype=np.float32)

    lon_axis = longitude[longitude.shape[0] // 2, :]
    lat_axis = latitude[:, latitude.shape[1] // 2]
    if lon_axis[0] > lon_axis[-1]:
        lon_axis = lon_axis[::-1]
        values = values[:, ::-1]
    if lat_axis[0] > lat_axis[-1]:
        lat_axis = lat_axis[::-1]
        values = values[::-1, :]

    wrap_longitudes = bool(np.nanmax(lon_axis) > 180.0)
    return {
        "values": values,
        "lon_axis": lon_axis.astype(np.float32),
        "lat_axis": lat_axis.astype(np.float32),
        "wrap_longitudes": wrap_longitudes,
    }


def tile_x_to_lon(x: int, z: int) -> float:
    return x / (2**z) * 360.0 - 180.0


def lon_to_tile_x(lon: float, z: int) -> float:
    return (lon + 180.0) / 360.0 * (2**z)


def tile_y_to_lat(y: int, z: int) -> float:
    n = math.pi - (2.0 * math.pi * y) / (2**z)
    return math.degrees(math.atan(math.sinh(n)))


def lat_to_tile_y(lat: float, z: int) -> float:
    clamped_lat = max(-MAX_MERCATOR_LAT, min(MAX_MERCATOR_LAT, lat))
    lat_radians = math.radians(clamped_lat)
    mercator = math.asinh(math.tan(lat_radians))
    return (1.0 - (mercator / math.pi)) / 2.0 * (2**z)


def clamp_tile_index(index: int, scale: int) -> int:
    return max(0, min(scale - 1, index))


@lru_cache(maxsize=1)
def blank_tile_png() -> bytes:
    image = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def resolve_style(overlay_id: str, metadata: dict[str, object] | None = None) -> dict[str, object]:
    if metadata and metadata.get("style"):
        return dict(metadata["style"])
    field_key = str(metadata.get("field_key")) if metadata and metadata.get("field_key") else None
    return style_for_overlay_id(overlay_id, field_key)


def configured_range(
    overlay_id: str,
    sampled: np.ndarray,
    style: dict[str, object],
) -> tuple[float, float]:
    if style.get("range"):
        lower, upper = style["range"]
        return float(lower), float(upper)
    return OVERLAY_SCALES.get(overlay_id, (float(np.nanmin(sampled)), float(np.nanmax(sampled))))


def palette_for_style(overlay_id: str, style: dict[str, object]) -> list[tuple[int, int, int]]:
    colors = style.get("colors")
    if colors:
        return [hex_to_rgb(color) for color in colors]
    return PALETTES.get(overlay_id, PALETTES["temperature_2m"])


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    stripped = value.lstrip("#")
    return tuple(int(stripped[index : index + 2], 16) for index in (0, 2, 4))
