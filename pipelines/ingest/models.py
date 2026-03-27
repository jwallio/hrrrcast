"""Dataclasses used by the Phase 1 ingest backbone."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class IdxRecord:
    message_number: int
    offset: int
    reference_time: str
    variable: str
    level: str
    extra: str

    @property
    def field_key(self) -> str:
        return f"{self.variable}:{self.level}"


@dataclass(frozen=True)
class S3Object:
    key: str
    size: int
    last_modified: str | None = None


@dataclass
class OverlayAvailability:
    available: bool
    missing_all_of: list[str] = field(default_factory=list)
    missing_any_of: list[str] = field(default_factory=list)
    notes: str | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass
class ForecastHourInventory:
    forecast_hour: int
    member: str
    cycle_hour: str
    grib_key: str
    idx_key: str
    grib_size_bytes: int | None
    idx_size_bytes: int | None
    field_count: int
    variable_count: int
    field_keys: list[str]
    variable_names: list[str]
    cached_idx_path: str
    overlays: dict[str, OverlayAvailability]

    def to_dict(self) -> dict[str, object]:
        payload = asdict(self)
        payload["overlays"] = {
            overlay_id: availability.to_dict()
            for overlay_id, availability in self.overlays.items()
        }
        return payload
