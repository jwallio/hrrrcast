"""Helpers for parsing NOAA HRRRCast GRIB2 index files."""

from __future__ import annotations

from .models import IdxRecord


def parse_idx_text(text: str) -> list[IdxRecord]:
    """Parse wgrib2-style index text into records."""
    records: list[IdxRecord] = []
    for line in text.splitlines():
        raw = line.strip()
        if not raw:
            continue
        parts = raw.split(":")
        if len(parts) < 6:
            raise ValueError(f"Unparseable idx line: {raw}")
        message_number = int(parts[0])
        offset = int(parts[1])
        reference_raw = parts[2]
        reference_time = reference_raw[2:] if reference_raw.startswith("d=") else reference_raw
        variable = parts[3]
        level = parts[4]
        extra = ":".join(parts[5:]).strip(":")
        records.append(
            IdxRecord(
                message_number=message_number,
                offset=offset,
                reference_time=reference_time,
                variable=variable,
                level=level,
                extra=extra,
            )
        )
    return records
