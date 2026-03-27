"""Sync the latest ready HRRRCast run for a named build profile and prune older processed runs."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipelines.ingest.build_profiles import DEFAULT_BUILD_PROFILES_PATH, load_build_profiles, resolve_build_profile  # noqa: E402
from pipelines.ingest.ensemble_products import ENSEMBLE_MEMBER_ID, build_ensemble_products  # noqa: E402
from pipelines.ingest.products import build_products  # noqa: E402
from scripts.warm_tile_cache import warm_tile_cache  # noqa: E402
from services.shared.retention import prune_processed_runs, select_runs_to_keep  # noqa: E402
from services.shared.store import DEFAULT_DATA_ROOT, get_product_catalog, latest_ready_manifest  # noqa: E402


DEFAULT_STATE_ROOT = Path("data/processed/build_state")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build the latest ready run for a named profile and prune older runs.")
    parser.add_argument("--profile", help="Build profile id. Defaults to config defaultProfile.")
    parser.add_argument("--member", help="Single member to sync, such as m00.")
    parser.add_argument("--all-members", action="store_true", help="Sync every discovered ensemble member.")
    parser.add_argument("--profiles-path", default=str(DEFAULT_BUILD_PROFILES_PATH))
    parser.add_argument("--data-root", default=str(DEFAULT_DATA_ROOT))
    parser.add_argument("--state-root", default=str(DEFAULT_STATE_ROOT))
    parser.add_argument("--output-root", default="data/processed/products")
    parser.add_argument("--keep-ready-runs", type=int, default=2)
    parser.add_argument("--keep-partial-runs", type=int, default=1)
    parser.add_argument("--no-prune", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--warm-cache", action="store_true")
    parser.add_argument("--warm-min-zoom", type=int, default=2)
    parser.add_argument("--warm-max-zoom", type=int, default=4)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    summary = sync_latest_ready_profile(
        profile=args.profile,
        member=args.member,
        all_members=args.all_members,
        profiles_path=args.profiles_path,
        data_root=args.data_root,
        state_root=args.state_root,
        output_root=args.output_root,
        keep_ready_runs=args.keep_ready_runs,
        keep_partial_runs=args.keep_partial_runs,
        prune=not args.no_prune,
        force=args.force,
        warm_cache=args.warm_cache,
        warm_min_zoom=args.warm_min_zoom,
        warm_max_zoom=args.warm_max_zoom,
    )
    if summary["mode"] == "noop":
        print(
            f"Latest ready run {summary['run_id']} already synced for profile {summary['profile_id']} "
            f"and member set {summary['member_selector']}."
        )
    elif summary["mode"] == "multi":
        print(
            f"syncing latest-ready run {summary['run_id']} for profile {summary['profile_id']} "
            f"and members {', '.join(summary['members'])}"
        )
        for member_summary in summary["member_summaries"]:
            print(f" member {member_summary['member']}: mode={member_summary['mode']}")
            for item in member_summary.get("forecast_hour_summaries", []):
                print(f"  f{item['forecast_hour']:03d}: built={item['built']} skipped={item['skipped']}")
                if "cache" in item:
                    cache = item["cache"]
                    print(
                        f"    cache: generated={cache['tiles_generated']} reused={cache['tiles_reused']} "
                        f"tiles={cache['tiles_total']}"
                    )
        if summary.get("ensemble_summary"):
            ensemble_summary = summary["ensemble_summary"]
            print(f" ensemble {ensemble_summary['member']}: mode={ensemble_summary['mode']}")
            for item in ensemble_summary.get("forecast_hour_summaries", []):
                print(f"  f{item['forecast_hour']:03d}: built={item['built']} skipped={item['skipped']}")
        print(f"total_built: {summary['total_built']}")
        print(f"total_skipped: {summary['total_skipped']}")
    else:
        print(
            f"syncing latest-ready run {summary['run_id']} for profile {summary['profile_id']} "
            f"and member {summary['member']}"
        )
        for item in summary["forecast_hour_summaries"]:
            print(f"  f{item['forecast_hour']:03d}: built={item['built']} skipped={item['skipped']}")
            if "cache" in item:
                cache = item["cache"]
                print(
                    f"    cache: generated={cache['tiles_generated']} reused={cache['tiles_reused']} "
                    f"tiles={cache['tiles_total']}"
                )
        print(f"total_built: {summary['total_built']}")
        print(f"total_skipped: {summary['total_skipped']}")
    print_prune_summary(summary["removed"])
    return 0


def sync_latest_ready_profile(
    profile: str | None = None,
    member: str | None = None,
    all_members: bool = False,
    profiles_path: str | Path = DEFAULT_BUILD_PROFILES_PATH,
    data_root: str | Path = DEFAULT_DATA_ROOT,
    state_root: str | Path = DEFAULT_STATE_ROOT,
    output_root: str | Path = "data/processed/products",
    keep_ready_runs: int = 2,
    keep_partial_runs: int = 1,
    prune: bool = True,
    force: bool = False,
    warm_cache: bool = False,
    warm_min_zoom: int = 2,
    warm_max_zoom: int = 4,
) -> dict[str, object]:
    manifest = latest_ready_manifest(data_root)
    members = resolve_members(manifest, member, all_members)
    if len(members) > 1:
        return sync_latest_ready_members(
            profile=profile,
            members=members,
            profiles_path=profiles_path,
            data_root=data_root,
            state_root=state_root,
            output_root=output_root,
            keep_ready_runs=keep_ready_runs,
            keep_partial_runs=keep_partial_runs,
            prune=prune,
            force=force,
            warm_cache=warm_cache,
            warm_min_zoom=warm_min_zoom,
            warm_max_zoom=warm_max_zoom,
        )
    member = members[0]

    profiles = load_build_profiles(profiles_path)
    profile_id = profile or profiles["defaultProfile"]
    run_id = str(manifest["run"]["run_id"])
    plan = resolve_build_profile(
        manifest=manifest,
        member=member,
        profile_id=profile_id,
        path=profiles_path,
    )

    state_path = build_state_path(state_root, profile_id, member)
    state = load_state(state_path)
    if not force and profile_is_current(state, run_id, plan, output_root):
        removed = {"manifests": [], "products": [], "tile_cache": []}
        if prune:
            keep_runs = select_runs_to_keep(
                data_root,
                keep_ready_runs=keep_ready_runs,
                keep_partial_runs=keep_partial_runs,
                protected_runs={run_id},
            )
            removed = prune_processed_runs(data_root, keep_runs)
        return {
            "mode": "noop",
            "run_id": run_id,
            "profile_id": profile_id,
            "member": member,
            "member_selector": member,
            "removed": removed,
        }

    total_built = 0
    total_skipped = 0
    forecast_hour_summaries: list[dict[str, object]] = []
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
        item_summary: dict[str, object] = {
            "forecast_hour": forecast_hour,
            "built": built,
            "skipped": skipped,
        }
        if warm_cache:
            summary = warm_tile_cache(
                run_selector=run_id,
                member=member,
                forecast_hour=forecast_hour,
                overlays=plan["overlays"],
                domains=plan["domains"],
                min_zoom=warm_min_zoom,
                max_zoom=warm_max_zoom,
                data_root=data_root,
                cache_root=Path(data_root) / "tile_cache",
            )
            item_summary["cache"] = summary
        forecast_hour_summaries.append(item_summary)

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
            "built_assets": total_built,
            "skipped_assets": total_skipped,
        },
    )

    removed = {"manifests": [], "products": [], "tile_cache": []}
    if prune:
        keep_runs = select_runs_to_keep(
            data_root,
            keep_ready_runs=keep_ready_runs,
            keep_partial_runs=keep_partial_runs,
            protected_runs={run_id},
        )
        removed = prune_processed_runs(data_root, keep_runs)

    return {
        "mode": "synced",
        "run_id": run_id,
        "profile_id": profile_id,
        "member": member,
        "member_selector": member,
        "forecast_hour_summaries": forecast_hour_summaries,
        "total_built": total_built,
        "total_skipped": total_skipped,
        "removed": removed,
    }


def sync_latest_ready_members(
    profile: str | None,
    members: list[str],
    profiles_path: str | Path,
    data_root: str | Path,
    state_root: str | Path,
    output_root: str | Path,
    keep_ready_runs: int,
    keep_partial_runs: int,
    prune: bool,
    force: bool,
    warm_cache: bool,
    warm_min_zoom: int,
    warm_max_zoom: int,
) -> dict[str, object]:
    member_summaries: list[dict[str, object]] = []
    total_built = 0
    total_skipped = 0
    run_id = None
    profile_id = None
    ensemble_summary: dict[str, object] | None = None
    for member in members:
        summary = sync_latest_ready_profile(
            profile=profile,
            member=member,
            all_members=False,
            profiles_path=profiles_path,
            data_root=data_root,
            state_root=state_root,
            output_root=output_root,
            keep_ready_runs=keep_ready_runs,
            keep_partial_runs=keep_partial_runs,
            prune=False,
            force=force,
            warm_cache=warm_cache,
            warm_min_zoom=warm_min_zoom,
            warm_max_zoom=warm_max_zoom,
        )
        member_summaries.append(summary)
        run_id = summary["run_id"]
        profile_id = summary["profile_id"]
        total_built += int(summary.get("total_built", 0))
        total_skipped += int(summary.get("total_skipped", 0))

    manifest = latest_ready_manifest(data_root)
    if run_id is not None and profile_id is not None:
        plan = resolve_build_profile(
            manifest=manifest,
            member=members[0],
            profile_id=profile_id,
            path=profiles_path,
        )
        if plan.get("build_ensemble_derived") and plan.get("ensemble_overlays"):
            ensemble_summary = sync_ensemble_profile(
                run_id=str(run_id),
                profile_id=str(profile_id),
                member_count=len(members),
                plan=plan,
                state_root=state_root,
                output_root=output_root,
                force=force,
            )
            total_built += int(ensemble_summary.get("total_built", 0))
            total_skipped += int(ensemble_summary.get("total_skipped", 0))

    removed = {"manifests": [], "products": [], "tile_cache": []}
    if prune and run_id is not None:
        keep_runs = select_runs_to_keep(
            data_root,
            keep_ready_runs=keep_ready_runs,
            keep_partial_runs=keep_partial_runs,
            protected_runs={run_id},
        )
        removed = prune_processed_runs(data_root, keep_runs)

    noop_members = all(summary["mode"] == "noop" for summary in member_summaries)
    noop_ensemble = ensemble_summary is None or ensemble_summary["mode"] == "noop"
    if noop_members and noop_ensemble:
        mode = "noop"
    else:
        mode = "multi"
    return {
        "mode": mode,
        "run_id": run_id,
        "profile_id": profile_id,
        "members": members,
        "member_selector": "all",
        "member_summaries": member_summaries,
        "ensemble_summary": ensemble_summary,
        "total_built": total_built,
        "total_skipped": total_skipped,
        "removed": removed,
    }


def sync_ensemble_profile(
    run_id: str,
    profile_id: str,
    member_count: int,
    plan: dict[str, object],
    state_root: str | Path,
    output_root: str | Path,
    force: bool,
) -> dict[str, object]:
    if member_count < 2:
        return {
            "mode": "noop",
            "run_id": run_id,
            "profile_id": profile_id,
            "member": ENSEMBLE_MEMBER_ID,
            "member_selector": ENSEMBLE_MEMBER_ID,
            "total_built": 0,
            "total_skipped": 0,
        }
    state_path = build_state_path(state_root, profile_id, ENSEMBLE_MEMBER_ID)
    state = load_state(state_path)
    if not force and profile_is_current(state, run_id, ensemble_plan(plan), output_root):
        return {
            "mode": "noop",
            "run_id": run_id,
            "profile_id": profile_id,
            "member": ENSEMBLE_MEMBER_ID,
            "member_selector": ENSEMBLE_MEMBER_ID,
            "total_built": 0,
            "total_skipped": 0,
        }

    total_built = 0
    total_skipped = 0
    forecast_hour_summaries: list[dict[str, object]] = []
    for forecast_hour in plan["forecast_hours"]:
        catalog = build_ensemble_products(
            run_id=run_id,
            forecast_hour=forecast_hour,
            overlays=plan["ensemble_overlays"],
            domains=plan["domains"],
            product_dir=output_root,
        )
        built = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") == "built")
        skipped = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") != "built")
        total_built += built
        total_skipped += skipped
        forecast_hour_summaries.append(
            {
                "forecast_hour": forecast_hour,
                "built": built,
                "skipped": skipped,
            }
        )

    write_state(
        state_path,
        {
            "synced_at_utc": datetime.now(UTC).isoformat(),
            "run_id": run_id,
            "profile_id": profile_id,
            "member": ENSEMBLE_MEMBER_ID,
            "forecast_hours": plan["forecast_hours"],
            "overlays": plan["ensemble_overlays"],
            "domains": plan["domains"],
            "built_assets": total_built,
            "skipped_assets": total_skipped,
        },
    )
    return {
        "mode": "synced",
        "run_id": run_id,
        "profile_id": profile_id,
        "member": ENSEMBLE_MEMBER_ID,
        "member_selector": ENSEMBLE_MEMBER_ID,
        "forecast_hour_summaries": forecast_hour_summaries,
        "total_built": total_built,
        "total_skipped": total_skipped,
    }


def build_state_path(state_root: str | Path, profile_id: str, member: str) -> Path:
    return Path(state_root) / f"{profile_id}_{member}.json"


def load_state(path: str | Path) -> dict[str, object] | None:
    path = Path(path)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_state(path: str | Path, payload: dict[str, object]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def profile_is_current(
    state: dict[str, object] | None,
    run_id: str,
    plan: dict[str, object],
    output_root: str | Path,
) -> bool:
    if not state:
        return False
    if state.get("run_id") != run_id:
        return False
    if not state.get("member"):
        return False
    if state.get("forecast_hours") != plan["forecast_hours"]:
        return False
    if state.get("overlays") != plan["overlays"]:
        return False
    if state.get("domains") != plan["domains"]:
        return False
    for forecast_hour in plan["forecast_hours"]:
        try:
            catalog = get_product_catalog(run_id, str(state["member"]), forecast_hour, output_root_parent(output_root))
        except FileNotFoundError:
            return False
        built_keys = {
            (artifact.get("overlay_id"), artifact.get("domain_id"))
            for artifact in catalog["artifacts"]
            if artifact.get("status") == "built"
        }
        for overlay_id in plan["overlays"]:
            for domain_id in plan["domains"]:
                if (overlay_id, domain_id) not in built_keys:
                    return False
    return True


def output_root_parent(output_root: str | Path) -> Path:
    return Path(output_root).parent


def print_prune_summary(removed: dict[str, list[str]]) -> None:
    print(f"pruned_manifests: {len(removed['manifests'])}")
    print(f"pruned_products: {len(removed['products'])}")
    print(f"pruned_tile_cache: {len(removed['tile_cache'])}")


def resolve_members(manifest: dict[str, object], member: str | None, all_members: bool) -> list[str]:
    if all_members or not member:
        return list(manifest["run"]["members"])
    return [member]


def ensemble_plan(plan: dict[str, object]) -> dict[str, object]:
    return {
        "forecast_hours": plan["forecast_hours"],
        "overlays": plan["ensemble_overlays"],
        "domains": plan["domains"],
    }


if __name__ == "__main__":
    raise SystemExit(main())
