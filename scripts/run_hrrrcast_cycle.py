"""Single-entrypoint HRRRCast cycle runner for local processing and Pages export."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import UTC, datetime
import errno
import json
import logging
import os
from pathlib import Path
import shutil
import sys
import tempfile
import traceback


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipelines.ingest.build_profiles import DEFAULT_BUILD_PROFILES_PATH, load_build_profiles, resolve_build_profile  # noqa: E402
from pipelines.ingest.ensemble_products import ENSEMBLE_MEMBER_ID, build_ensemble_products  # noqa: E402
from pipelines.ingest.manifest import ManifestThresholds, build_run_manifest, write_latest_manifest_alias, write_manifest  # noqa: E402
from pipelines.ingest.noaa_s3 import NOAAHrrrCastClient  # noqa: E402
from pipelines.ingest.products import build_products  # noqa: E402
from pipelines.ingest.settings import DEFAULT_CACHE_DIR, DEFAULT_MANIFEST_DIR  # noqa: E402
from scripts.export_station_viewer_static import DEFAULT_MEMBERS, DEFAULT_OUTPUT_DIR, DEFAULT_STATIONS, export_runs, export_station_subset, write_payload  # noqa: E402
from scripts.sync_latest_ready_profile import DEFAULT_STATE_ROOT, build_state_path, ensemble_plan, load_state, profile_is_current, write_state  # noqa: E402
from services.shared.point_series import build_point_series  # noqa: E402
from services.shared.retention import prune_processed_runs, select_runs_to_keep  # noqa: E402
from services.shared.station_direct import export_station_bundle_direct  # noqa: E402
from services.shared.store import DEFAULT_DATA_ROOT, get_product_catalog  # noqa: E402


DEFAULT_RUNNER_DIR = ROOT / "output" / "hrrrcast_cycle"
DEFAULT_SUMMARY_PATH = DEFAULT_RUNNER_DIR / "run_summary.json"
DEFAULT_LOCK_PATH = DEFAULT_RUNNER_DIR / "run.lock"
DEFAULT_LOG_DIR = DEFAULT_RUNNER_DIR / "logs"
DEFAULT_MIN_FREE_GB = 5.0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run one frozen HRRRCast cycle and optionally export Pages data.")
    target_group = parser.add_mutually_exclusive_group()
    target_group.add_argument("--latest", action="store_true", help="Discover the latest ready NOAA HRRRCast run.")
    target_group.add_argument("--run-id", help="Run ID to build, such as YYYYMMDDHH.")
    parser.add_argument("--profile", default="core_operational", help="Build profile id.")
    parser.add_argument("--member", help="Single member to build, such as m00.")
    parser.add_argument("--all-members", action="store_true", help="Build every discovered deterministic member.")
    parser.add_argument("--export-pages", action="store_true", help="Export the station-viewer static bundle.")
    parser.add_argument(
        "--pages-source",
        choices=["station-only", "processed"],
        default="station-only",
        help="How to source Pages station payloads when --export-pages is used.",
    )
    parser.add_argument("--station", action="append", dest="stations", help="Station to include in static export.")
    parser.add_argument("--export-member", action="append", dest="export_members", help="Viewer member payload to export.")
    parser.add_argument("--data-root", default=str(DEFAULT_DATA_ROOT))
    parser.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR)
    parser.add_argument("--manifest-dir", default=DEFAULT_MANIFEST_DIR)
    parser.add_argument("--profiles-path", default=str(DEFAULT_BUILD_PROFILES_PATH))
    parser.add_argument("--state-root", default=str(DEFAULT_STATE_ROOT))
    parser.add_argument("--output-root", default="data/processed/products")
    parser.add_argument("--pages-output", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--runner-output", default=str(DEFAULT_RUNNER_DIR))
    parser.add_argument("--lockfile", default=str(DEFAULT_LOCK_PATH))
    parser.add_argument("--recent-runs-to-scan", type=int, default=8)
    parser.add_argument("--required-members", type=int, default=6)
    parser.add_argument("--required-min-fhr", type=int, default=18)
    parser.add_argument("--keep-ready-runs", type=int, default=2)
    parser.add_argument("--keep-partial-runs", type=int, default=1)
    parser.add_argument("--force", action="store_true", help="Force rebuild even if the frozen run/profile appears current.")
    parser.add_argument("--no-prune", action="store_true", help="Do not prune older processed runs after a successful build.")
    parser.add_argument("--min-free-gb", type=float, default=DEFAULT_MIN_FREE_GB, help="Minimum free space required before build/export steps.")
    parser.add_argument("--dry-run", action="store_true", help="Plan and log the cycle without building or exporting.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.latest and not args.run_id:
        args.latest = True
    if not args.member and not args.all_members:
        args.all_members = True

    runner_output = Path(args.runner_output)
    runner_output.mkdir(parents=True, exist_ok=True)
    summary_path = DEFAULT_SUMMARY_PATH if Path(args.runner_output) == DEFAULT_RUNNER_DIR else runner_output / "run_summary.json"
    log_path = initialize_logging(Path(args.runner_output))
    summary: dict[str, object] = {
        "started_at_utc": datetime.now(UTC).isoformat(),
        "success": False,
        "dry_run": args.dry_run,
        "profile": args.profile,
        "export_pages": bool(args.export_pages),
        "log_path": str(log_path),
        "steps": [],
    }

    logger = logging.getLogger("hrrrcast_cycle")
    logger.info("starting HRRRCast cycle")

    try:
        with acquire_lock(Path(args.lockfile), logger):
            cycle = plan_cycle(args, logger)
            summary["frozen_run_id"] = cycle["run_id"]
            summary["candidate_latest_run_id"] = cycle.get("latest_run_id")
            summary["steps"].append(
                {
                    "name": "discover_run",
                    "status": "ok",
                    "run_id": cycle["run_id"],
                    "latest_run_id": cycle.get("latest_run_id"),
                }
            )
            if args.dry_run:
                log_plan(args, cycle, logger)
                summary["steps"].extend(
                    [
                        {"name": "build_products", "status": "planned" if not skip_product_build(args) else "skipped"},
                        {"name": "export_pages", "status": "planned" if args.export_pages else "skipped"},
                    ]
                )
            else:
                if skip_product_build(args):
                    summary["steps"].append({"name": "build_products", "status": "skipped", "reason": "station-only Pages export"})
                else:
                    sync_summary = run_build_cycle(args, cycle["manifest"], logger)
                    summary["sync_summary"] = sync_summary
                    summary["steps"].append({"name": "build_products", "status": "ok", "summary": sync_summary})
                if args.export_pages:
                    export_summary = export_pages_bundle(args, cycle["manifest"], logger)
                    summary["export_summary"] = export_summary
                    summary["steps"].append({"name": "export_pages", "status": "ok", "summary": export_summary})
                else:
                    summary["steps"].append({"name": "export_pages", "status": "skipped"})
            summary["success"] = True
            return 0
    except Exception as error:  # noqa: BLE001
        logger.exception("cycle failed: %s", error)
        summary["error"] = str(error)
        summary["traceback"] = traceback.format_exc()
        return 1
    finally:
        summary["finished_at_utc"] = datetime.now(UTC).isoformat()
        write_summary(summary_path, summary)
        logging.shutdown()


def plan_cycle(args: argparse.Namespace, logger: logging.Logger) -> dict[str, object]:
    if args.latest:
        return discover_latest_ready_run(args, logger)
    manifest = build_run_manifest(
        run_id=args.run_id,
        client=NOAAHrrrCastClient(),
        cache_dir=args.cache_dir,
        thresholds=ManifestThresholds(
            required_member_count=args.required_members,
            required_min_forecast_hour=args.required_min_fhr,
        ),
    )
    write_manifest(Path(args.manifest_dir) / f"{args.run_id}.json", manifest)
    if manifest["run"]["status"] == "ready":
        write_latest_manifest_alias(manifest, args.manifest_dir)
    return {"run_id": str(args.run_id), "latest_run_id": str(args.run_id), "manifest": manifest}


def discover_latest_ready_run(args: argparse.Namespace, logger: logging.Logger) -> dict[str, object]:
    client = NOAAHrrrCastClient()
    candidate_run_ids = client.recent_run_ids(limit=args.recent_runs_to_scan)
    if not candidate_run_ids:
        raise RuntimeError("No recent HRRRCast runs were discovered in NOAA S3.")
    thresholds = ManifestThresholds(
        required_member_count=args.required_members,
        required_min_forecast_hour=args.required_min_fhr,
    )
    ready_manifest = None
    latest_run_id = candidate_run_ids[0]
    logger.info("latest discovered run: %s", latest_run_id)
    for index, run_id in enumerate(candidate_run_ids):
        manifest = build_run_manifest(
            run_id=run_id,
            client=client,
            cache_dir=args.cache_dir,
            thresholds=thresholds,
        )
        logger.info("manifest %s status=%s members=%s max_fhr=%s", run_id, manifest["run"]["status"], manifest["run"]["member_count"], manifest["run"]["forecast_hours"][-1] if manifest["run"]["forecast_hours"] else None)
        if not args.dry_run:
            write_manifest(Path(args.manifest_dir) / f"{run_id}.json", manifest)
            if index == 0:
                write_latest_manifest_alias(manifest, args.manifest_dir)
        if manifest["run"]["status"] == "ready":
            ready_manifest = manifest
            break
    if ready_manifest is None:
        raise RuntimeError(f"No ready HRRRCast run was found in the {len(candidate_run_ids)} most recent cycles.")
    logger.info("frozen ready run: %s", ready_manifest["run"]["run_id"])
    return {
        "run_id": str(ready_manifest["run"]["run_id"]),
        "latest_run_id": str(latest_run_id),
        "manifest": ready_manifest,
    }


def run_build_cycle(args: argparse.Namespace, manifest: dict[str, object], logger: logging.Logger) -> dict[str, object]:
    run_id = str(manifest["run"]["run_id"])
    profiles = load_build_profiles(args.profiles_path)
    profile_id = args.profile or profiles["defaultProfile"]
    members = resolve_members(manifest, args.member, args.all_members)
    output_root = Path(args.output_root)
    state_root = Path(args.state_root)
    data_root = Path(args.data_root)
    pre_removed = {"manifests": [], "products": [], "tile_cache": []}
    if not args.no_prune:
        keep_runs = select_runs_to_keep(
            data_root,
            keep_ready_runs=args.keep_ready_runs,
            keep_partial_runs=args.keep_partial_runs,
            protected_runs={run_id},
        )
        pre_removed = prune_processed_runs(data_root, keep_runs)
        logger.info(
            "pre-pruned manifests=%s products=%s tile_cache=%s failed=%s",
            len(pre_removed["manifests"]),
            len(pre_removed["products"]),
            len(pre_removed["tile_cache"]),
            len(pre_removed["failed"]),
        )
    ensure_free_space(output_root, args.min_free_gb, "build products", logger)

    member_summaries: list[dict[str, object]] = []
    total_built = 0
    total_skipped = 0
    for member in members:
        plan = resolve_build_profile(manifest=manifest, member=member, profile_id=profile_id, path=args.profiles_path)
        state_path = build_state_path(state_root, profile_id, member)
        state = load_state(state_path)
        current = not args.force and profile_is_current(state, run_id, plan, output_root)
        summary: dict[str, object] = {
            "member": member,
            "mode": "noop" if current else "synced",
            "forecast_hour_summaries": [],
        }
        logger.info("member %s profile %s mode=%s", member, profile_id, summary["mode"])
        if not current:
            for forecast_hour in plan["forecast_hours"]:
                catalog = build_products(
                    run_id=run_id,
                    member=member,
                    forecast_hour=forecast_hour,
                    overlays=plan["overlays"],
                    domains=plan["domains"],
                    product_dir=output_root,
                )
                built = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") == "built")
                skipped = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") != "built")
                total_built += built
                total_skipped += skipped
                item = {"forecast_hour": forecast_hour, "built": built, "skipped": skipped}
                logger.info("member %s f%03d built=%s skipped=%s", member, forecast_hour, built, skipped)
                summary["forecast_hour_summaries"].append(item)
            write_state(
                state_path,
                {
                    "synced_at_utc": datetime.now(UTC).isoformat(),
                    "run_id": run_id,
                    "profile_id": profile_id,
                    "member": member,
                    "forecast_hours": plan["forecast_hours"],
                    "overlays": plan["overlays"],
                    "domains": plan["domains"],
                    "built_assets": sum(item["built"] for item in summary["forecast_hour_summaries"]),
                    "skipped_assets": sum(item["skipped"] for item in summary["forecast_hour_summaries"]),
                },
            )
        member_summaries.append(summary)

    ensemble_summary: dict[str, object] | None = None
    first_plan = resolve_build_profile(manifest=manifest, member=members[0], profile_id=profile_id, path=args.profiles_path)
    if len(members) > 1 and first_plan.get("build_ensemble_derived") and first_plan.get("ensemble_overlays"):
        state_path = build_state_path(state_root, profile_id, ENSEMBLE_MEMBER_ID)
        state = load_state(state_path)
        plan = ensemble_plan(first_plan)
        current = not args.force and profile_is_current(state, run_id, plan, output_root)
        ensemble_summary = {
            "member": ENSEMBLE_MEMBER_ID,
            "mode": "noop" if current else "synced",
            "forecast_hour_summaries": [],
        }
        logger.info("ensemble derived mode=%s", ensemble_summary["mode"])
        if not current:
            for forecast_hour in first_plan["forecast_hours"]:
                catalog = build_ensemble_products(
                    run_id=run_id,
                    forecast_hour=forecast_hour,
                    overlays=first_plan["ensemble_overlays"],
                    domains=first_plan["domains"],
                    product_dir=output_root,
                )
                built = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") == "built")
                skipped = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") != "built")
                total_built += built
                total_skipped += skipped
                item = {"forecast_hour": forecast_hour, "built": built, "skipped": skipped}
                logger.info("ensemble f%03d built=%s skipped=%s", forecast_hour, built, skipped)
                ensemble_summary["forecast_hour_summaries"].append(item)
            write_state(
                state_path,
                {
                    "synced_at_utc": datetime.now(UTC).isoformat(),
                    "run_id": run_id,
                    "profile_id": profile_id,
                    "member": ENSEMBLE_MEMBER_ID,
                    "forecast_hours": first_plan["forecast_hours"],
                    "overlays": first_plan["ensemble_overlays"],
                    "domains": first_plan["domains"],
                    "built_assets": sum(item["built"] for item in ensemble_summary["forecast_hour_summaries"]),
                    "skipped_assets": sum(item["skipped"] for item in ensemble_summary["forecast_hour_summaries"]),
                },
            )

    removed = {"manifests": [], "products": [], "tile_cache": []}
    if not args.no_prune:
        keep_runs = select_runs_to_keep(
            data_root,
            keep_ready_runs=args.keep_ready_runs,
            keep_partial_runs=args.keep_partial_runs,
            protected_runs={run_id},
        )
        removed = prune_processed_runs(data_root, keep_runs)
        logger.info(
            "pruned manifests=%s products=%s tile_cache=%s failed=%s",
            len(removed["manifests"]),
            len(removed["products"]),
            len(removed["tile_cache"]),
            len(removed["failed"]),
        )

    return {
        "run_id": run_id,
        "profile_id": profile_id,
        "members": members,
        "member_summaries": member_summaries,
        "ensemble_summary": ensemble_summary,
        "total_built": total_built,
        "total_skipped": total_skipped,
        "pre_removed": pre_removed,
        "removed": removed,
    }


def export_pages_bundle(args: argparse.Namespace, manifest: dict[str, object], logger: logging.Logger) -> dict[str, object]:
    run_id = str(manifest["run"]["run_id"])
    stations = [item.upper() for item in (args.stations or DEFAULT_STATIONS)]
    export_members = args.export_members or DEFAULT_MEMBERS
    final_dir = Path(args.pages_output)
    ensure_free_space(final_dir, args.min_free_gb, "export Pages bundle", logger)
    stage_parent = final_dir.parent
    stage_parent.mkdir(parents=True, exist_ok=True)
    stage_dir = Path(tempfile.mkdtemp(prefix=".static-api-stage-", dir=stage_parent))
    backup_dir = stage_parent / f".static-api-backup-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"

    try:
        logger.info("exporting Pages bundle to staging dir %s", stage_dir)
        if args.pages_source == "station-only":
            export_station_bundle_direct(stage_dir, manifest, stations, export_members, logger=logger)
        else:
            export_runs(stage_dir, run_id)
            export_station_subset(stage_dir, stations)
            for member in export_members:
                for station in stations:
                    payload = build_point_series(run_id, station, member)
                    write_payload(stage_dir, "latest-ready", member, station, payload)
                    write_payload(stage_dir, run_id, member, station, payload)
        if final_dir.exists():
            final_dir.rename(backup_dir)
        stage_dir.rename(final_dir)
        if backup_dir.exists():
            shutil.rmtree(backup_dir)
        logger.info("published Pages bundle to %s", final_dir)
    except Exception:  # noqa: BLE001
        if final_dir.exists() and backup_dir.exists():
            shutil.rmtree(final_dir, ignore_errors=True)
            backup_dir.rename(final_dir)
        raise
    finally:
        if stage_dir.exists():
            shutil.rmtree(stage_dir, ignore_errors=True)
        if backup_dir.exists():
            shutil.rmtree(backup_dir, ignore_errors=True)

    return {
        "run_id": run_id,
        "output_dir": str(final_dir),
        "stations": stations,
        "members": export_members,
        "pages_source": args.pages_source,
    }


def resolve_members(manifest: dict[str, object], member: str | None, all_members: bool) -> list[str]:
    if all_members or not member:
        return [str(item) for item in manifest["run"]["members"]]
    return [member]


def log_plan(args: argparse.Namespace, cycle: dict[str, object], logger: logging.Logger) -> None:
    logger.info("dry-run selected frozen run %s", cycle["run_id"])
    logger.info("profile=%s all_members=%s member=%s export_pages=%s pages_source=%s", args.profile, args.all_members, args.member, args.export_pages, args.pages_source)
    if args.export_pages:
        logger.info("export stations=%s members=%s output=%s", args.stations or DEFAULT_STATIONS, args.export_members or DEFAULT_MEMBERS, args.pages_output)


def skip_product_build(args: argparse.Namespace) -> bool:
    return bool(args.export_pages and args.pages_source == "station-only")


def initialize_logging(runner_output: Path) -> Path:
    log_dir = runner_output / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"run_{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
        handlers=[
            logging.FileHandler(log_path, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
        force=True,
    )
    logging.Formatter.converter = time_gmt
    return log_path


def ensure_free_space(target_path: Path, min_free_gb: float, step_name: str, logger: logging.Logger) -> None:
    free_bytes = free_space_bytes(target_path)
    free_gb = free_bytes / (1024 ** 3)
    logger.info("free space before %s on %s: %.2f GB", step_name, target_path.anchor or target_path, free_gb)
    if free_gb < float(min_free_gb):
        raise RuntimeError(
            f"Insufficient free space to {step_name}: {free_gb:.2f} GB available on "
            f"{target_path.anchor or target_path}, requires at least {float(min_free_gb):.2f} GB."
        )


def free_space_bytes(path: Path) -> int:
    target = path if path.exists() else path.parent
    target.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(target)
    return int(usage.free)


def write_summary(summary_path: Path, summary: dict[str, object]) -> None:
    payload = json.dumps(summary, indent=2, sort_keys=True)
    try:
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(payload, encoding="utf-8")
    except OSError as error:
        if error.errno != errno.ENOSPC:
            raise
        fallback_dir = Path(tempfile.gettempdir()) / "hrrrcast_cycle"
        fallback_dir.mkdir(parents=True, exist_ok=True)
        fallback_path = fallback_dir / "run_summary.json"
        summary["summary_fallback_path"] = str(fallback_path)
        fallback_path.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")


@contextmanager
def acquire_lock(lock_path: Path, logger: logging.Logger):
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = None
    payload = {
        "pid": os.getpid(),
        "started_at_utc": datetime.now(UTC).isoformat(),
    }
    try:
        descriptor = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(descriptor, json.dumps(payload, indent=2, sort_keys=True).encode("utf-8"))
        os.close(descriptor)
        descriptor = None
    except FileExistsError as error:
        existing = lock_path.read_text(encoding="utf-8") if lock_path.exists() else ""
        raise RuntimeError(f"Lockfile already exists at {lock_path}. Existing lock:\n{existing}") from error
    logger.info("acquired lock %s", lock_path)
    try:
        yield
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if lock_path.exists():
            lock_path.unlink()
        logger.info("released lock %s", lock_path)


def time_gmt(*args):
    return datetime.now(UTC).timetuple()


if __name__ == "__main__":
    raise SystemExit(main())
