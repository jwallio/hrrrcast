"""CLI entrypoint for Phase 1 manifest generation."""

from __future__ import annotations

import argparse
from pathlib import Path

from .manifest import ManifestThresholds, build_run_manifest, write_latest_manifest_alias, write_manifest
from .noaa_s3 import NOAAHrrrCastClient
from .settings import DEFAULT_CACHE_DIR, DEFAULT_MANIFEST_DIR


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build a Phase 1 HRRRCast run manifest from the NOAA experimental bucket."
    )
    parser.add_argument(
        "--run-id",
        help="Explicit run id in YYYYMMDDHH format. Mutually exclusive with --latest.",
    )
    parser.add_argument(
        "--latest",
        action="store_true",
        help="Discover the latest run id from the NOAA bucket.",
    )
    parser.add_argument(
        "--cache-dir",
        default=DEFAULT_CACHE_DIR,
        help="Directory used to cache downloaded idx files.",
    )
    parser.add_argument(
        "--output",
        help="Optional manifest output path. Defaults to data/processed/manifests/<runId>.json.",
    )
    parser.add_argument(
        "--required-members",
        type=int,
        default=6,
        help="Minimum member count needed for a run to be considered ready.",
    )
    parser.add_argument(
        "--required-min-fhr",
        type=int,
        default=18,
        help="Minimum contiguous forecast hour required for a run to be considered ready.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if bool(args.run_id) == bool(args.latest):
        parser.error("Choose exactly one of --run-id or --latest.")

    client = NOAAHrrrCastClient()
    run_id = args.run_id or client.latest_run_id()
    thresholds = ManifestThresholds(
        required_member_count=args.required_members,
        required_min_forecast_hour=args.required_min_fhr,
    )
    manifest = build_run_manifest(
        run_id=run_id,
        client=client,
        cache_dir=args.cache_dir,
        thresholds=thresholds,
    )
    output_path = args.output or str(Path(DEFAULT_MANIFEST_DIR) / f"{run_id}.json")
    written_path = write_manifest(output_path, manifest)
    latest_path = None
    if args.latest:
        latest_path = write_latest_manifest_alias(manifest, Path(output_path).parent)
    print(f"Wrote manifest: {written_path}")
    if latest_path is not None:
        print(f"Updated latest alias: {latest_path}")
    print(f"Run status: {manifest['run']['status']}")
    return 0
