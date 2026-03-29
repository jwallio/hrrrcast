"""Preview rendering for processed NetCDF assets."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image
import xarray as xr

from pipelines.ingest.field_catalog import style_for_overlay_id


PALETTES: dict[str, list[tuple[int, int, int]]] = {
    "temperature_2m": [(33, 56, 117), (74, 144, 226), (246, 246, 198), (230, 123, 58), (147, 33, 11)],
    "qpf": [(245, 245, 245), (198, 233, 180), (127, 205, 187), (65, 182, 196), (34, 94, 168)],
    "composite_reflectivity": [(10, 10, 10), (60, 120, 30), (180, 200, 40), (255, 160, 0), (210, 40, 40)],
    "mslp": [(32, 50, 104), (125, 172, 214), (245, 245, 245), (226, 158, 84), (135, 38, 32)],
    "cape": [(20, 20, 40), (58, 102, 172), (85, 190, 120), (240, 214, 73), (209, 83, 41)],
    "wind_10m": [(11, 24, 64), (60, 109, 181), (112, 183, 150), (250, 204, 64), (219, 82, 49)],
}


def render_preview_png(
    netcdf_path: str | Path,
    overlay_id: str,
    max_dimension: int = 900,
    metadata: dict[str, object] | None = None,
) -> bytes:
    with xr.open_dataset(netcdf_path) as dataset:
        variable_name = list(dataset.data_vars)[0]
        data_array = dataset[variable_name]
        if "time" in data_array.dims:
            data_array = data_array.isel(time=0)
        values = np.asarray(data_array.values, dtype=np.float32)
        latitude = dataset["latitude"].values if "latitude" in dataset.variables else None

    if latitude is not None and float(latitude[0, 0]) < float(latitude[-1, 0]):
        values = np.flipud(values)

    mask = ~np.isfinite(values)
    finite = values[~mask]
    style = resolve_style(overlay_id, metadata)
    if style.get("type") == "categorical" and overlay_id == "ptype":
        rgb = render_ptype(values)
        image = Image.fromarray(rgb, mode="RGB")
        image.thumbnail((max_dimension, max_dimension))
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    if finite.size == 0:
        normalized = np.zeros_like(values, dtype=np.float32)
    else:
        configured_range = style.get("range")
        if configured_range:
            lower, upper = float(configured_range[0]), float(configured_range[1])
        else:
            lower = float(np.nanpercentile(finite, 2))
            upper = float(np.nanpercentile(finite, 98))
        if upper <= lower:
            lower = float(np.nanmin(finite))
            upper = float(np.nanmax(finite)) or lower + 1.0
        normalized = np.clip((values - lower) / (upper - lower), 0.0, 1.0)

    rgb = apply_palette(normalized, palette_for_style(overlay_id, style))
    rgb[mask] = (0, 0, 0)
    if is_probability_overlay(overlay_id):
        alpha = probability_alpha(values, mask, normalized)
        rgba = np.dstack((rgb, alpha))
        image = Image.fromarray(rgba, mode="RGBA")
    else:
        image = Image.fromarray(rgb, mode="RGB")
    image.thumbnail((max_dimension, max_dimension))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def apply_palette(values: np.ndarray, palette: list[tuple[int, int, int]]) -> np.ndarray:
    positions = np.linspace(0.0, 1.0, num=len(palette), dtype=np.float32)
    rgb = np.zeros(values.shape + (3,), dtype=np.uint8)
    flat = values.reshape(-1)
    for channel in range(3):
        palette_channel = np.asarray([color[channel] for color in palette], dtype=np.float32)
        rgb[..., channel] = np.interp(flat, positions, palette_channel).reshape(values.shape).astype(np.uint8)
    return rgb


def render_ptype(values: np.ndarray) -> np.ndarray:
    rgb = np.zeros(values.shape + (3,), dtype=np.uint8)
    rgb[...] = (0, 0, 0)
    rgb[values == 0] = (0, 0, 0)
    rgb[values == 1] = (65, 176, 93)
    rgb[values == 3] = (222, 92, 60)
    return rgb


def probability_alpha(values: np.ndarray, mask: np.ndarray, normalized: np.ndarray) -> np.ndarray:
    alpha = np.zeros(values.shape, dtype=np.uint8)
    finite_nonzero = (~mask) & (values > 0.0)
    if not np.any(finite_nonzero):
        return alpha
    scaled = np.interp(normalized[finite_nonzero], [0.0, 0.15, 1.0], [0.0, 168.0, 255.0])
    alpha[finite_nonzero] = np.clip(scaled, 0.0, 255.0).astype(np.uint8)
    return alpha


def resolve_style(overlay_id: str, metadata: dict[str, object] | None = None) -> dict[str, object]:
    if metadata and metadata.get("style"):
        return dict(metadata["style"])
    field_key = str(metadata.get("field_key")) if metadata and metadata.get("field_key") else None
    return style_for_overlay_id(overlay_id, field_key)


def palette_for_style(overlay_id: str, style: dict[str, object]) -> list[tuple[int, int, int]]:
    colors = style.get("colors")
    if colors:
        return [hex_to_rgb(color) for color in colors]
    return PALETTES.get(overlay_id, PALETTES["temperature_2m"])


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    stripped = value.lstrip("#")
    return tuple(int(stripped[index : index + 2], 16) for index in (0, 2, 4))


def is_probability_overlay(overlay_id: str) -> bool:
    return "_probability_" in overlay_id
