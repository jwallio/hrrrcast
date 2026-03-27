"""Catalog helpers for native HRRRCast fields exposed as overlays."""

from __future__ import annotations

from pathlib import Path
import re


NATIVE_OVERLAY_PREFIX = "field_"

VARIABLE_LABELS: dict[str, str] = {
    "APCP": "Accumulated Precipitation",
    "CAPE": "Convective Available Potential Energy",
    "CFRZR": "Categorical Freezing Rain",
    "CIN": "Convective Inhibition",
    "CRAIN": "Categorical Rain",
    "DPT": "Dewpoint",
    "GUST": "Wind Gust",
    "HCDC": "High Cloud Cover",
    "HGT": "Geopotential Height",
    "HLCY": "Storm Relative Helicity",
    "LAND": "Land Mask",
    "LCDC": "Low Cloud Cover",
    "MAXDVV": "Maximum Downward Vertical Velocity",
    "MAXUVV": "Maximum Upward Vertical Velocity",
    "MCDC": "Middle Cloud Cover",
    "MNUPHL": "Minimum Updraft Helicity",
    "MSLMA": "Mean Sea Level Pressure",
    "MXUPHL": "Maximum Updraft Helicity",
    "POT": "Potential Temperature",
    "PRES": "Pressure",
    "PWAT": "Precipitable Water",
    "REFC": "Composite Reflectivity",
    "RELV": "Relative Vorticity",
    "RH": "Relative Humidity",
    "SPFH": "Specific Humidity",
    "TCDC": "Total Cloud Cover",
    "TMP": "Temperature",
    "UGRD": "U Wind Component",
    "USTM": "U Storm Motion",
    "VGRD": "V Wind Component",
    "VIS": "Visibility",
    "VSTM": "V Storm Motion",
    "VUCSH": "Vertical U Shear",
    "VVCSH": "Vertical V Shear",
    "VVEL": "Vertical Velocity",
    "WIND": "Wind Speed",
}

VARIABLE_FAMILIES: dict[str, str] = {
    "APCP": "precipitation",
    "CAPE": "severe",
    "CFRZR": "winter",
    "CIN": "severe",
    "CRAIN": "precipitation",
    "DPT": "surface",
    "GUST": "surface",
    "HCDC": "clouds",
    "HGT": "upper_air",
    "HLCY": "severe",
    "LAND": "surface",
    "LCDC": "clouds",
    "MAXDVV": "dynamics",
    "MAXUVV": "dynamics",
    "MCDC": "clouds",
    "MNUPHL": "severe",
    "MSLMA": "synoptic",
    "MXUPHL": "severe",
    "POT": "surface",
    "PRES": "surface",
    "PWAT": "moisture",
    "REFC": "radar",
    "RELV": "dynamics",
    "RH": "moisture",
    "SPFH": "moisture",
    "TCDC": "clouds",
    "TMP": "temperature",
    "UGRD": "wind",
    "USTM": "severe",
    "VGRD": "wind",
    "VIS": "surface",
    "VSTM": "severe",
    "VUCSH": "severe",
    "VVCSH": "severe",
    "VVEL": "dynamics",
    "WIND": "wind",
}

PALETTES: dict[str, list[str]] = {
    "temperature": ["#213875", "#4a90e2", "#f6f6c6", "#e67b3a", "#93210b"],
    "precip": ["#f5f5f5", "#c6e9b4", "#7fcdbb", "#41b6c4", "#225ea8"],
    "reflectivity": ["#0a0a0a", "#3c781e", "#b4c828", "#ffa000", "#d22828"],
    "pressure": ["#203268", "#7dacd6", "#f5f5f5", "#e29e54", "#872620"],
    "severe": ["#141428", "#3a66ac", "#55be78", "#f0d649", "#d15329"],
    "wind": ["#0b1840", "#3c6db5", "#70b796", "#facc40", "#db5231"],
    "diverging": ["#234c8c", "#7aa6d8", "#f2f2f2", "#e8a16d", "#8d2d2a"],
    "clouds": ["#0f1720", "#5f7893", "#a7bccf", "#dbe6f0", "#f8fbff"],
    "moisture": ["#1f2c5b", "#4974b8", "#74b98a", "#d5dc73", "#e1934e"],
    "terrain": ["#16381a", "#4b7f31", "#b7b76f", "#b08b61", "#ffffff"],
}

VARIABLE_STYLES: dict[str, dict[str, object]] = {
    "APCP": {
        "palette": "precip",
        "units": "in",
        "rawUnits": "mm",
        "transform": "mm_to_inches",
        "range": [0.0, 50.8],
        "labels": ["0", "0.25", "0.5", "1.0", "2.0+"],
        "type": "continuous",
    },
    "CAPE": {
        "palette": "severe",
        "units": "J/kg",
        "rawUnits": "J/kg",
        "range": [0.0, 4000.0],
        "labels": ["0", "500", "1000", "2500", "4000"],
        "type": "continuous",
    },
    "CIN": {
        "palette": "diverging",
        "units": "J/kg",
        "rawUnits": "J/kg",
        "range": [-400.0, 0.0],
        "labels": ["-400", "-200", "-100", "-25", "0"],
        "type": "continuous",
    },
    "CFRZR": {
        "palette": "precip",
        "units": "flag",
        "rawUnits": "flag",
        "range": [0.0, 1.0],
        "labels": ["0", "0.25", "0.5", "0.75", "1"],
        "type": "continuous",
    },
    "CRAIN": {
        "palette": "precip",
        "units": "flag",
        "rawUnits": "flag",
        "range": [0.0, 1.0],
        "labels": ["0", "0.25", "0.5", "0.75", "1"],
        "type": "continuous",
    },
    "DPT": {
        "palette": "temperature",
        "units": "F",
        "rawUnits": "K",
        "transform": "kelvin_to_fahrenheit",
        "range": [250.0, 315.0],
        "labels": ["-10", "10", "32", "60", "90"],
        "type": "continuous",
    },
    "GUST": {
        "palette": "wind",
        "units": "mph",
        "rawUnits": "m/s",
        "transform": "mps_to_mph",
        "range": [0.0, 40.0],
        "labels": ["0", "15", "30", "50", "75"],
        "type": "continuous",
    },
    "HCDC": {
        "palette": "clouds",
        "units": "%",
        "rawUnits": "%",
        "range": [0.0, 100.0],
        "labels": ["0", "25", "50", "75", "100"],
        "type": "continuous",
    },
    "HGT": {
        "palette": "terrain",
        "units": "m",
        "rawUnits": "m",
        "range": None,
        "labels": None,
        "type": "continuous",
    },
    "HLCY": {
        "palette": "severe",
        "units": "m2/s2",
        "rawUnits": "m2/s2",
        "range": [0.0, 600.0],
        "labels": ["0", "100", "200", "400", "600"],
        "type": "continuous",
    },
    "LAND": {
        "palette": "terrain",
        "units": "flag",
        "rawUnits": "flag",
        "range": [0.0, 1.0],
        "labels": ["0", "0.25", "0.5", "0.75", "1"],
        "type": "continuous",
    },
    "LCDC": {
        "palette": "clouds",
        "units": "%",
        "rawUnits": "%",
        "range": [0.0, 100.0],
        "labels": ["0", "25", "50", "75", "100"],
        "type": "continuous",
    },
    "MAXDVV": {
        "palette": "diverging",
        "units": "m/s",
        "rawUnits": "m/s",
        "range": [-10.0, 0.0],
        "labels": ["-10", "-7", "-5", "-2", "0"],
        "type": "continuous",
    },
    "MAXUVV": {
        "palette": "severe",
        "units": "m/s",
        "rawUnits": "m/s",
        "range": [0.0, 10.0],
        "labels": ["0", "2", "5", "7", "10"],
        "type": "continuous",
    },
    "MCDC": {
        "palette": "clouds",
        "units": "%",
        "rawUnits": "%",
        "range": [0.0, 100.0],
        "labels": ["0", "25", "50", "75", "100"],
        "type": "continuous",
    },
    "MNUPHL": {
        "palette": "diverging",
        "units": "m2/s2",
        "rawUnits": "m2/s2",
        "range": [-300.0, 0.0],
        "labels": ["-300", "-200", "-100", "-50", "0"],
        "type": "continuous",
    },
    "MSLMA": {
        "palette": "pressure",
        "units": "hPa",
        "rawUnits": "Pa",
        "transform": "pa_to_hpa",
        "range": [98000.0, 104000.0],
        "labels": ["980", "995", "1010", "1025", "1040"],
        "type": "continuous",
    },
    "MXUPHL": {
        "palette": "severe",
        "units": "m2/s2",
        "rawUnits": "m2/s2",
        "range": [0.0, 300.0],
        "labels": ["0", "50", "100", "200", "300"],
        "type": "continuous",
    },
    "POT": {
        "palette": "temperature",
        "units": "K",
        "rawUnits": "K",
        "range": [260.0, 340.0],
        "labels": ["260", "280", "300", "320", "340"],
        "type": "continuous",
    },
    "PRES": {
        "palette": "pressure",
        "units": "hPa",
        "rawUnits": "Pa",
        "transform": "pa_to_hpa",
        "range": [85000.0, 105000.0],
        "labels": ["850", "900", "950", "1000", "1050"],
        "type": "continuous",
    },
    "PWAT": {
        "palette": "moisture",
        "units": "in",
        "rawUnits": "kg/m2",
        "transform": "mm_to_inches",
        "range": [0.0, 63.5],
        "labels": ["0", "0.5", "1.0", "1.5", "2.5"],
        "type": "continuous",
    },
    "REFC": {
        "palette": "reflectivity",
        "units": "dBZ",
        "rawUnits": "dBZ",
        "range": [0.0, 70.0],
        "labels": ["0", "20", "35", "50", "70"],
        "type": "continuous",
    },
    "RELV": {
        "palette": "diverging",
        "units": "1/s",
        "rawUnits": "1/s",
        "range": None,
        "labels": None,
        "type": "continuous",
    },
    "RH": {
        "palette": "moisture",
        "units": "%",
        "rawUnits": "%",
        "range": [0.0, 100.0],
        "labels": ["0", "25", "50", "75", "100"],
        "type": "continuous",
    },
    "SPFH": {
        "palette": "moisture",
        "units": "g/kg",
        "rawUnits": "kg/kg",
        "transform": "kgkg_to_gkg",
        "range": [0.0, 0.024],
        "labels": ["0", "4", "8", "16", "24"],
        "type": "continuous",
    },
    "TCDC": {
        "palette": "clouds",
        "units": "%",
        "rawUnits": "%",
        "range": [0.0, 100.0],
        "labels": ["0", "25", "50", "75", "100"],
        "type": "continuous",
    },
    "TMP": {
        "palette": "temperature",
        "units": "F",
        "rawUnits": "K",
        "transform": "kelvin_to_fahrenheit",
        "range": [250.0, 315.0],
        "labels": ["-10", "10", "32", "60", "90"],
        "type": "continuous",
    },
    "UGRD": {
        "palette": "diverging",
        "units": "mph",
        "rawUnits": "m/s",
        "transform": "mps_to_mph",
        "range": [-40.0, 40.0],
        "labels": ["-90", "-45", "0", "45", "90"],
        "type": "continuous",
    },
    "USTM": {
        "palette": "diverging",
        "units": "mph",
        "rawUnits": "m/s",
        "transform": "mps_to_mph",
        "range": [-40.0, 40.0],
        "labels": ["-90", "-45", "0", "45", "90"],
        "type": "continuous",
    },
    "VGRD": {
        "palette": "diverging",
        "units": "mph",
        "rawUnits": "m/s",
        "transform": "mps_to_mph",
        "range": [-40.0, 40.0],
        "labels": ["-90", "-45", "0", "45", "90"],
        "type": "continuous",
    },
    "VIS": {
        "palette": "clouds",
        "units": "mi",
        "rawUnits": "m",
        "transform": "m_to_miles",
        "range": [0.0, 16093.0],
        "labels": ["0", "1", "3", "6", "10"],
        "type": "continuous",
    },
    "VSTM": {
        "palette": "diverging",
        "units": "mph",
        "rawUnits": "m/s",
        "transform": "mps_to_mph",
        "range": [-40.0, 40.0],
        "labels": ["-90", "-45", "0", "45", "90"],
        "type": "continuous",
    },
    "VUCSH": {
        "palette": "severe",
        "units": "m/s",
        "rawUnits": "m/s",
        "range": [0.0, 40.0],
        "labels": ["0", "10", "20", "30", "40"],
        "type": "continuous",
    },
    "VVCSH": {
        "palette": "severe",
        "units": "m/s",
        "rawUnits": "m/s",
        "range": [0.0, 40.0],
        "labels": ["0", "10", "20", "30", "40"],
        "type": "continuous",
    },
    "VVEL": {
        "palette": "diverging",
        "units": "Pa/s",
        "rawUnits": "Pa/s",
        "range": [-2.0, 2.0],
        "labels": ["-2", "-1", "0", "1", "2"],
        "type": "continuous",
    },
    "WIND": {
        "palette": "wind",
        "units": "mph",
        "rawUnits": "m/s",
        "transform": "mps_to_mph",
        "range": [0.0, 40.0],
        "labels": ["0", "15", "30", "50", "75"],
        "type": "continuous",
    },
}

CURATED_OVERLAY_STYLES: dict[str, dict[str, object]] = {
    "temperature_2m": VARIABLE_STYLES["TMP"],
    "dewpoint_2m": VARIABLE_STYLES["DPT"],
    "rh_2m": VARIABLE_STYLES["RH"],
    "qpf": VARIABLE_STYLES["APCP"],
    "pwat": VARIABLE_STYLES["PWAT"],
    "composite_reflectivity": VARIABLE_STYLES["REFC"],
    "mslp": VARIABLE_STYLES["MSLMA"],
    "cape": VARIABLE_STYLES["CAPE"],
    "visibility": VARIABLE_STYLES["VIS"],
    "cloud_cover_total": VARIABLE_STYLES["TCDC"],
    "ceiling": VARIABLE_STYLES["HGT"],
    "height_500mb": VARIABLE_STYLES["HGT"],
    "temperature_850mb": VARIABLE_STYLES["TMP"],
    "wind_10m": VARIABLE_STYLES["WIND"],
    "temperature_2m_mean": VARIABLE_STYLES["TMP"],
    "temperature_2m_spread": {
        "palette": "temperature",
        "units": "F",
        "rawUnits": "K",
        "transform": "kelvin_delta_to_fahrenheit",
        "range": [0.0, 9.0],
        "labels": ["0", "2", "4", "8", "16"],
        "type": "continuous",
    },
    "qpf_probability_gt_0p10": {
        "palette": "precip",
        "units": "%",
        "rawUnits": "%",
        "range": [0.0, 100.0],
        "labels": ["0", "25", "50", "75", "100"],
        "type": "continuous",
    },
    "wind_10m_probability_gt_25kt": {
        "palette": "wind",
        "units": "%",
        "rawUnits": "%",
        "range": [0.0, 100.0],
        "labels": ["0", "25", "50", "75", "100"],
        "type": "continuous",
    },
    "composite_reflectivity_probability_gt_40dbz": {
        "palette": "reflectivity",
        "units": "%",
        "rawUnits": "%",
        "range": [0.0, 100.0],
        "labels": ["0", "25", "50", "75", "100"],
        "type": "continuous",
    },
    "cape_probability_gt_1000": {
        "palette": "severe",
        "units": "%",
        "rawUnits": "%",
        "range": [0.0, 100.0],
        "labels": ["0", "25", "50", "75", "100"],
        "type": "continuous",
    },
    "ptype": {
        "type": "categorical",
        "units": "categories",
        "rawUnits": "categories",
        "items": [
            {"label": "None", "color": "#000000"},
            {"label": "Rain", "color": "#41b05d"},
            {"label": "Freezing Rain", "color": "#de5c3c"},
        ],
        "note": "Current HRRRCast derivation only distinguishes none, rain, and freezing rain.",
    },
    "snowfall": {
        "type": "message",
        "units": "pending",
        "rawUnits": "pending",
        "note": "Snowfall remains deferred until a defensible snow-supporting source field is available.",
    },
}


def sanitize_field_key(field_key: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", field_key).strip("_").lower()


def native_overlay_id(field_key: str) -> str:
    return f"{NATIVE_OVERLAY_PREFIX}{sanitize_field_key(field_key)}"


def is_native_overlay_id(overlay_id: str) -> bool:
    return overlay_id.startswith(NATIVE_OVERLAY_PREFIX)


def overlay_entry_for_field(field_key: str) -> dict[str, object]:
    variable, level = split_field_key(field_key)
    return {
        "id": native_overlay_id(field_key),
        "label": format_field_label(field_key),
        "family": VARIABLE_FAMILIES.get(variable, "native"),
        "renderMode": "raster",
        "priority": "native",
        "native": True,
        "group": "native",
        "fieldKey": field_key,
        "variable": variable,
        "level": level,
        "style": style_for_field_key(field_key),
    }


def collect_native_overlay_entries(field_keys: set[str]) -> list[dict[str, object]]:
    return sorted((overlay_entry_for_field(field_key) for field_key in field_keys), key=lambda entry: entry["label"])


def build_field_overlay_lookup(field_keys: set[str]) -> dict[str, dict[str, object]]:
    return {
        entry["id"]: entry
        for entry in collect_native_overlay_entries(field_keys)
    }


def collect_manifest_field_keys(manifest: dict[str, object]) -> set[str]:
    field_keys: set[str] = set()
    for member_payload in manifest.get("members", {}).values():
        for detail in member_payload.get("forecast_hour_details", {}).values():
            field_keys.update(detail.get("field_keys", []))
    return field_keys


def build_layers_payload(static_layers: dict[str, object], field_keys: set[str]) -> dict[str, object]:
    payload = dict(static_layers)
    weather_overlays = [augment_overlay_entry(entry) for entry in static_layers.get("weatherOverlays", [])]
    weather_overlays.extend(collect_native_overlay_entries(field_keys))
    payload["weatherOverlays"] = weather_overlays
    payload["nativeWeatherOverlays"] = collect_native_overlay_entries(field_keys)
    payload["nativeFieldCount"] = len(field_keys)
    return payload


def resolve_field_key_for_overlay(
    overlay_id: str,
    field_keys: set[str],
    layers_payload: dict[str, object] | None = None,
) -> str | None:
    if layers_payload is not None:
        entries = layers_payload.get("nativeWeatherOverlays", [])
        for entry in entries:
            if entry["id"] == overlay_id:
                return str(entry["fieldKey"])
    for field_key in field_keys:
        if native_overlay_id(field_key) == overlay_id:
            return field_key
    return None


def format_field_label(field_key: str) -> str:
    variable, level = split_field_key(field_key)
    base = VARIABLE_LABELS.get(variable, variable)
    level = level.replace("mb", "mb").replace("0C", "0 C")
    return f"{base} ({level})"


def split_field_key(field_key: str) -> tuple[str, str]:
    variable, level = field_key.split(":", maxsplit=1)
    return variable, level


def style_for_field_key(field_key: str) -> dict[str, object]:
    variable, _ = split_field_key(field_key)
    base_style = VARIABLE_STYLES.get(variable)
    if base_style is None:
        family = VARIABLE_FAMILIES.get(variable, "native")
        palette = {
            "temperature": "temperature",
            "precipitation": "precip",
            "radar": "reflectivity",
            "synoptic": "pressure",
            "wind": "wind",
            "moisture": "moisture",
            "clouds": "clouds",
            "upper_air": "terrain",
            "dynamics": "diverging",
            "severe": "severe",
            "surface": "terrain",
        }.get(family, "terrain")
        base_style = {
            "palette": palette,
            "units": "",
            "rawUnits": "",
            "range": None,
            "labels": None,
            "type": "continuous",
        }
    style = dict(base_style)
    palette_name = style.get("palette")
    if palette_name:
        style["colors"] = PALETTES[palette_name]
    return style


def style_for_overlay_id(overlay_id: str, field_key: str | None = None) -> dict[str, object]:
    if overlay_id in CURATED_OVERLAY_STYLES:
        style = dict(CURATED_OVERLAY_STYLES[overlay_id])
        palette_name = style.get("palette")
        if palette_name:
            style["colors"] = PALETTES[palette_name]
        return style
    if field_key:
        return style_for_field_key(field_key)
    return {
        "type": "message",
        "units": "",
        "rawUnits": "",
        "note": "Display metadata is not configured for this overlay yet.",
    }


def augment_overlay_entry(entry: dict[str, object]) -> dict[str, object]:
    payload = dict(entry)
    payload.setdefault("native", False)
    payload.setdefault("group", "curated")
    payload["style"] = style_for_overlay_id(str(payload["id"]), str(payload.get("fieldKey")) if payload.get("fieldKey") else None)
    return payload


def load_static_layers(path: str | Path) -> dict[str, object]:
    import json

    return json.loads(Path(path).read_text(encoding="utf-8"))
