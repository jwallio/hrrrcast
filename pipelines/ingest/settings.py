"""Ingest settings and overlay source requirements."""

from __future__ import annotations

from dataclasses import dataclass

NOAA_HRRRCAST_BUCKET_URL = "https://noaa-gsl-experimental-pds.s3.amazonaws.com"
NOAA_HRRRCAST_ROOT_PREFIX = "HRRRCast/"
DEFAULT_CACHE_DIR = "data/raw/noaa/HRRRCast"
DEFAULT_MANIFEST_DIR = "data/processed/manifests"


@dataclass(frozen=True)
class OverlayRequirement:
    overlay_id: str
    mode: str
    all_of: tuple[str, ...] = ()
    any_of: tuple[str, ...] = ()
    notes: str | None = None


OVERLAY_REQUIREMENTS: tuple[OverlayRequirement, ...] = (
    OverlayRequirement(
        overlay_id="composite_reflectivity",
        mode="all_of",
        all_of=("REFC:entire atmosphere",),
    ),
    OverlayRequirement(
        overlay_id="temperature_2m",
        mode="all_of",
        all_of=("TMP:2 m above ground",),
    ),
    OverlayRequirement(
        overlay_id="ptype",
        mode="all_of",
        all_of=(
            "CRAIN:surface",
            "CFRZR:surface",
        ),
        notes=(
            "Current raw support covers rain and freezing-rain categories. "
            "Full dominant precip type support may still need extra published categories or derivation."
        ),
    ),
    OverlayRequirement(
        overlay_id="mslp",
        mode="all_of",
        all_of=("MSLMA:mean sea level",),
    ),
    OverlayRequirement(
        overlay_id="qpf",
        mode="all_of",
        all_of=("APCP:surface",),
    ),
    OverlayRequirement(
        overlay_id="snowfall",
        mode="all_of",
        all_of=("APCP:surface",),
        any_of=(
            "CSNOW:surface",
            "SNOD:surface",
            "WEASD:surface",
        ),
        notes=(
            "Phase 1 treats snowfall as unavailable unless an explicit snow-supporting "
            "field appears in the raw index. Derived snowfall can be added in Phase 2."
        ),
    ),
    OverlayRequirement(
        overlay_id="cape",
        mode="all_of",
        all_of=("CAPE:surface",),
    ),
    OverlayRequirement(
        overlay_id="wind_10m",
        mode="all_of",
        all_of=(
            "UGRD:10 m above ground",
            "VGRD:10 m above ground",
        ),
        notes="Phase 2 derives raster wind speed from UGRD/VGRD. Vector barbs remain a later enhancement.",
    ),
)
