"""Overlay availability checks for Phase 1 manifests."""

from __future__ import annotations

from .models import OverlayAvailability
from .settings import OVERLAY_REQUIREMENTS


def evaluate_overlay_availability(field_keys: set[str]) -> dict[str, OverlayAvailability]:
    """Map raw GRIB field presence to overlay availability metadata."""
    result: dict[str, OverlayAvailability] = {}
    for spec in OVERLAY_REQUIREMENTS:
        missing_all = [field for field in spec.all_of if field not in field_keys]
        missing_any: list[str] = []
        if spec.any_of and not any(field in field_keys for field in spec.any_of):
            missing_any = list(spec.any_of)
        available = not missing_all and not missing_any
        result[spec.overlay_id] = OverlayAvailability(
            available=available,
            missing_all_of=missing_all,
            missing_any_of=missing_any,
            notes=spec.notes,
        )
    return result
