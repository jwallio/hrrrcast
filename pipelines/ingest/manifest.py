"""Run discovery and manifest generation for Phase 1."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
from pathlib import Path
import re

from .availability import evaluate_overlay_availability
from .idx import parse_idx_text
from .models import ForecastHourInventory, S3Object
from .noaa_s3 import NOAAHrrrCastClient
from .settings import DEFAULT_CACHE_DIR

OBJECT_RE = re.compile(
    r"^HRRRCast/(?P<date>\d{8})/(?P<cycle>\d{2})/hrrrcast\.(?P<member>m\d{2})\.t(?P=cycle)z\.pgrb2\.f(?P<fhr>\d{2,3})(?P<idx>\.idx)?$"
)


@dataclass(frozen=True)
class ManifestThresholds:
    required_member_count: int = 6
    required_min_forecast_hour: int = 18


def normalize_run_id(run_id: str) -> tuple[str, str]:
    cleaned = run_id.strip()
    if not re.fullmatch(r"\d{10}", cleaned):
        raise ValueError("run_id must use YYYYMMDDHH format.")
    return cleaned[:8], cleaned[8:]


def build_run_manifest(
    run_id: str,
    client: NOAAHrrrCastClient | None = None,
    cache_dir: str | Path = DEFAULT_CACHE_DIR,
    thresholds: ManifestThresholds | None = None,
) -> dict[str, object]:
    client = client or NOAAHrrrCastClient()
    thresholds = thresholds or ManifestThresholds()
    run_date, cycle_hour = normalize_run_id(run_id)
    prefix = f"HRRRCast/{run_date}/{cycle_hour}/"
    objects = client.list_objects(prefix)
    grouped = _group_run_objects(objects)

    cache_root = Path(cache_dir) / run_date / cycle_hour
    cache_root.mkdir(parents=True, exist_ok=True)

    members_payload: dict[str, object] = {}
    discovered_member_hours: dict[str, list[int]] = {}
    discovered_overlay_ready = 0
    for member, hour_map in sorted(grouped.items()):
        available_hours: list[int] = []
        hour_payload: dict[str, object] = {}
        for forecast_hour, object_pair in sorted(hour_map.items()):
            idx_object = object_pair.get("idx")
            if idx_object is None:
                continue
            grib_object = object_pair.get("grib")
            idx_text = client.fetch_text(idx_object.key)
            cached_idx_path = cache_root / Path(idx_object.key).name
            cached_idx_path.write_text(idx_text, encoding="utf-8")
            idx_records = parse_idx_text(idx_text)
            field_keys = sorted({record.field_key for record in idx_records})
            variable_names = sorted({record.variable for record in idx_records})
            overlay_map = evaluate_overlay_availability(set(field_keys))
            discovered_overlay_ready += sum(1 for overlay in overlay_map.values() if overlay.available)
            inventory = ForecastHourInventory(
                forecast_hour=forecast_hour,
                member=member,
                cycle_hour=cycle_hour,
                grib_key=grib_object.key if grib_object else idx_object.key[:-4],
                idx_key=idx_object.key,
                grib_size_bytes=grib_object.size if grib_object else None,
                idx_size_bytes=idx_object.size,
                field_count=len(idx_records),
                variable_count=len(variable_names),
                field_keys=field_keys,
                variable_names=variable_names,
                cached_idx_path=str(cached_idx_path),
                overlays=overlay_map,
            )
            hour_payload[f"{forecast_hour:03d}"] = inventory.to_dict()
            available_hours.append(forecast_hour)
        discovered_member_hours[member] = available_hours
        members_payload[member] = {
            "forecast_hours": available_hours,
            "forecast_hour_count": len(available_hours),
            "forecast_hour_details": hour_payload,
        }

    status, reasons = infer_run_status(discovered_member_hours, thresholds)
    manifest = {
        "generated_at_utc": datetime.now(UTC).isoformat(),
        "run": {
            "run_id": run_id,
            "date": run_date,
            "cycle_hour": cycle_hour,
            "prefix": prefix,
            "status": status,
            "status_reasons": reasons,
            "member_count": len(discovered_member_hours),
            "members": sorted(discovered_member_hours),
            "forecast_hours": sorted({hour for hours in discovered_member_hours.values() for hour in hours}),
            "overlay_ready_slots": discovered_overlay_ready,
        },
        "source": {
            "bucket_url": client.bucket_url,
            "root_prefix": client.root_prefix,
        },
        "thresholds": {
            "required_member_count": thresholds.required_member_count,
            "required_min_forecast_hour": thresholds.required_min_forecast_hour,
        },
        "members": members_payload,
    }
    return manifest


def infer_run_status(
    discovered_member_hours: dict[str, list[int]],
    thresholds: ManifestThresholds,
) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if not discovered_member_hours:
        return "failed", ["No member/hour inventories were discovered for this run."]

    members = sorted(discovered_member_hours)
    member_count = len(members)
    if member_count < thresholds.required_member_count:
        reasons.append(
            f"Only {member_count} members discovered; threshold is {thresholds.required_member_count}."
        )

    max_hours: list[int] = []
    for member in members:
        hours = sorted(discovered_member_hours[member])
        if not hours:
            reasons.append(f"{member} has no forecast hours.")
            continue
        if hours[0] != 0:
            reasons.append(f"{member} does not start at f00.")
        contiguous_expected = list(range(hours[0], hours[-1] + 1))
        if hours != contiguous_expected:
            reasons.append(f"{member} forecast hours are not contiguous through f{hours[-1]:03d}.")
        max_hours.append(hours[-1])

    if not max_hours:
        return "failed", reasons or ["No usable forecast hour inventories were discovered."]

    min_member_max_hour = min(max_hours)
    if min_member_max_hour < thresholds.required_min_forecast_hour:
        reasons.append(
            f"Shortest member only reaches f{min_member_max_hour:03d}; "
            f"threshold is f{thresholds.required_min_forecast_hour:03d}."
        )

    if len(set(max_hours)) > 1:
        reasons.append("Members do not share the same maximum forecast hour.")

    if reasons:
        return "partial", reasons
    return "ready", ["All discovered members meet the configured Phase 1 completeness thresholds."]


def write_manifest(path: str | Path, manifest: dict[str, object]) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return output_path


def write_latest_manifest_alias(
    manifest: dict[str, object],
    manifest_dir: str | Path,
) -> Path:
    latest_path = Path(manifest_dir) / "latest.json"
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    latest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return latest_path


def _group_run_objects(objects: list[S3Object]) -> dict[str, dict[int, dict[str, S3Object]]]:
    grouped: dict[str, dict[int, dict[str, S3Object]]] = {}
    for obj in objects:
        match = OBJECT_RE.match(obj.key)
        if not match:
            continue
        member = match.group("member")
        forecast_hour = int(match.group("fhr"))
        grouped.setdefault(member, {}).setdefault(forecast_hour, {})
        kind = "idx" if match.group("idx") else "grib"
        grouped[member][forecast_hour][kind] = obj
    return grouped
