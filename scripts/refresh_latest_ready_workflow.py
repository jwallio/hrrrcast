"""End-to-end latest-refresh workflow for repeated HRRRCast operation."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipelines.ingest.manifest import (  # noqa: E402
    ManifestThresholds,
    build_run_manifest,
    write_latest_manifest_alias,
    write_manifest,
)
from pipelines.ingest.noaa_s3 import NOAAHrrrCastClient  # noqa: E402
from pipelines.ingest.settings import DEFAULT_CACHE_DIR, DEFAULT_MANIFEST_DIR  # noqa: E402
from scripts.health_check import main as health_check_main  # noqa: E402
from scripts.sync_latest_ready_profile import sync_latest_ready_profile  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Refresh latest manifest state, sync latest-ready profile, and optionally run health checks."
    )
    parser.add_argument("--profile", default="core_operational")
    parser.add_argument("--member", help="Single member to sync, such as m00.")
    parser.add_argument("--all-members", action="store_true", help="Sync every discovered ensemble member.")
    parser.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR)
    parser.add_argument("--manifest-dir", default=DEFAULT_MANIFEST_DIR)
    parser.add_argument("--required-members", type=int, default=6)
    parser.add_argument("--required-min-fhr", type=int, default=18)
    parser.add_argument("--keep-ready-runs", type=int, default=2)
    parser.add_argument("--keep-partial-runs", type=int, default=1)
    parser.add_argument("--warm-cache", action="store_true")
    parser.add_argument("--warm-min-zoom", type=int, default=2)
    parser.add_argument("--warm-max-zoom", type=int, default=4)
    parser.add_argument("--force-sync", action="store_true")
    parser.add_argument("--skip-health-check", action="store_true")
    parser.add_argument("--catalog-base")
    parser.add_argument("--tile-base")
    parser.add_argument("--web-base")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    client = NOAAHrrrCastClient()
    latest_run_id = client.latest_run_id()
    thresholds = ManifestThresholds(
        required_member_count=args.required_members,
        required_min_forecast_hour=args.required_min_fhr,
    )
    manifest = build_run_manifest(
        run_id=latest_run_id,
        client=client,
        cache_dir=args.cache_dir,
        thresholds=thresholds,
    )
    manifest_path = write_manifest(Path(args.manifest_dir) / f"{latest_run_id}.json", manifest)
    latest_alias_path = write_latest_manifest_alias(manifest, args.manifest_dir)

    print(f"latest_run_id: {latest_run_id}")
    print(f"latest_status: {manifest['run']['status']}")
    print(f"manifest_path: {manifest_path}")
    print(f"latest_alias: {latest_alias_path}")

    sync_summary = sync_latest_ready_profile(
        profile=args.profile,
        member=args.member,
        all_members=args.all_members,
        keep_ready_runs=args.keep_ready_runs,
        keep_partial_runs=args.keep_partial_runs,
        warm_cache=args.warm_cache,
        warm_min_zoom=args.warm_min_zoom,
        warm_max_zoom=args.warm_max_zoom,
        force=args.force_sync,
    )
    print(f"sync_mode: {sync_summary['mode']}")
    print(f"sync_run_id: {sync_summary['run_id']}")
    print(f"sync_profile: {sync_summary['profile_id']}")
    print(f"sync_member_selector: {sync_summary['member_selector']}")
    if sync_summary["mode"] in {"synced", "multi"}:
        print(f"sync_total_built: {sync_summary['total_built']}")
        print(f"sync_total_skipped: {sync_summary['total_skipped']}")
    print(f"pruned_manifests: {len(sync_summary['removed']['manifests'])}")
    print(f"pruned_products: {len(sync_summary['removed']['products'])}")
    print(f"pruned_tile_cache: {len(sync_summary['removed']['tile_cache'])}")

    should_run_health = not args.skip_health_check and args.catalog_base and args.tile_base and args.web_base
    if should_run_health:
        print("health_check: starting")
        health_member = args.member or first_member(manifest)
        health_status = health_check_main(
            [
                "--catalog-base",
                args.catalog_base,
                "--tile-base",
                args.tile_base,
                "--web-base",
                args.web_base,
                "--run-id",
                "latest-ready",
                "--member",
                health_member,
            ]
        )
        print(f"health_check_status: {health_status}")
    else:
        print("health_check: skipped")
    return 0


def first_member(manifest: dict[str, object]) -> str:
    members = manifest["run"]["members"]
    if not members:
        raise RuntimeError("Manifest does not contain any ensemble members.")
    return str(members[0])


if __name__ == "__main__":
    raise SystemExit(main())
