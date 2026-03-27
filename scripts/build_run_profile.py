"""Build a named HRRRCast product profile for one or more ensemble members."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipelines.ingest.build_profiles import (  # noqa: E402
    DEFAULT_BUILD_PROFILES_PATH,
    load_build_profiles,
    resolve_build_profile,
)
from pipelines.ingest.ensemble_products import build_ensemble_products  # noqa: E402
from pipelines.ingest.products import DEFAULT_PRODUCT_DIR, build_products  # noqa: E402
from services.shared.store import DEFAULT_DATA_ROOT, get_run_manifest, resolve_run_selector  # noqa: E402
from scripts.warm_tile_cache import warm_tile_cache  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build a named HRRRCast product profile.")
    parser.add_argument("--run-id", default="latest-ready", help="YYYYMMDDHH, latest, or latest-ready.")
    parser.add_argument("--member", help="Single member to build, such as m00.")
    parser.add_argument("--all-members", action="store_true", help="Build every discovered ensemble member.")
    parser.add_argument("--profile", help="Build profile id. Defaults to config defaultProfile.")
    parser.add_argument("--forecast-hour", action="append", dest="forecast_hours", type=int)
    parser.add_argument("--overlay", action="append", dest="overlays")
    parser.add_argument("--domain", action="append", dest="domains")
    parser.add_argument("--profiles-path", default=str(DEFAULT_BUILD_PROFILES_PATH))
    parser.add_argument("--output-root", default=DEFAULT_PRODUCT_DIR)
    parser.add_argument("--warm-cache", action="store_true")
    parser.add_argument("--warm-min-zoom", type=int, default=2)
    parser.add_argument("--warm-max-zoom", type=int, default=4)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    profiles = load_build_profiles(args.profiles_path)
    profile_id = args.profile or profiles["defaultProfile"]
    run_id = resolve_run_selector(args.run_id, ROOT / DEFAULT_DATA_ROOT)
    manifest = get_run_manifest(run_id, ROOT / DEFAULT_DATA_ROOT)
    members = resolve_members(manifest, args.member, args.all_members)

    first_plan = resolve_build_profile(
        manifest=manifest,
        member=members[0],
        profile_id=profile_id,
        path=args.profiles_path,
        overlays=args.overlays,
        domains=args.domains,
        forecast_hours=args.forecast_hours,
    )

    print(f"profile: {first_plan['profile_id']} ({first_plan['label']})")
    print(f"run_id: {run_id}")
    print(f"members: {', '.join(members)}")
    print(f"forecast_hours: {len(first_plan['forecast_hours'])}")
    print(f"overlays: {len(first_plan['overlays'])}")
    print(f"domains: {len(first_plan['domains'])}")

    total_built = 0
    total_skipped = 0
    for member in members:
        plan = resolve_build_profile(
            manifest=manifest,
            member=member,
            profile_id=profile_id,
            path=args.profiles_path,
            overlays=args.overlays,
            domains=args.domains,
            forecast_hours=args.forecast_hours,
        )
        print(f"member: {member}")
        for forecast_hour in plan["forecast_hours"]:
            catalog = build_products(
                run_id=run_id,
                member=member,
                forecast_hour=forecast_hour,
                overlays=plan["overlays"],
                domains=plan["domains"],
                product_dir=args.output_root,
            )
            built = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") == "built")
            skipped = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") != "built")
            total_built += built
            total_skipped += skipped
            print(f"  f{forecast_hour:03d}: built={built} skipped={skipped}")
            if args.warm_cache:
                summary = warm_tile_cache(
                    run_selector=run_id,
                    member=member,
                    forecast_hour=forecast_hour,
                    overlays=plan["overlays"],
                    domains=plan["domains"],
                    min_zoom=args.warm_min_zoom,
                    max_zoom=args.warm_max_zoom,
                    data_root=ROOT / DEFAULT_DATA_ROOT,
                    cache_root=ROOT / "data" / "processed" / "tile_cache",
                )
                print(
                    f"    cache: generated={summary['tiles_generated']} reused={summary['tiles_reused']} "
                    f"tiles={summary['tiles_total']}"
                )

    if len(members) > 1 and first_plan.get("build_ensemble_derived") and first_plan.get("ensemble_overlays"):
        print(f"ensemble member: ens ({len(first_plan['ensemble_overlays'])} overlays)")
        for forecast_hour in first_plan["forecast_hours"]:
            catalog = build_ensemble_products(
                run_id=run_id,
                forecast_hour=forecast_hour,
                overlays=first_plan["ensemble_overlays"],
                domains=first_plan["domains"],
                members=members,
                product_dir=args.output_root,
            )
            built = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") == "built")
            skipped = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") != "built")
            total_built += built
            total_skipped += skipped
            print(f"  ensemble f{forecast_hour:03d}: built={built} skipped={skipped}")

    print(f"total_built: {total_built}")
    print(f"total_skipped: {total_skipped}")
    return 0


def resolve_members(manifest: dict[str, object], member: str | None, all_members: bool) -> list[str]:
    if all_members or not member:
        return [str(item) for item in manifest["run"]["members"]]
    return [member]


if __name__ == "__main__":
    raise SystemExit(main())
