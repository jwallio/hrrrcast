"""Run the local HRRRCast stack with one command."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipelines.ingest.build_profiles import load_build_profiles, resolve_build_profile  # noqa: E402
from pipelines.ingest.ensemble_products import build_ensemble_products  # noqa: E402
from pipelines.ingest.products import PRODUCT_SPECS, build_products  # noqa: E402
from scripts.warm_tile_cache import warm_tile_cache  # noqa: E402
from services.shared.store import DEFAULT_DATA_ROOT, get_run_manifest, resolve_run_selector  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run catalog API, tile API, and static web app together.")
    parser.add_argument("--catalog-port", type=int, default=8000)
    parser.add_argument("--tile-port", type=int, default=8001)
    parser.add_argument("--web-port", type=int, default=8080)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--bootstrap-run",
        help="Optionally build sample products before launch. Accepts YYYYMMDDHH, latest, or latest-ready.",
    )
    parser.add_argument("--bootstrap-member", help="Single member to bootstrap, such as m00.")
    parser.add_argument(
        "--bootstrap-all-members",
        action="store_true",
        help="Bootstrap every discovered ensemble member for the selected run/profile.",
    )
    parser.add_argument("--bootstrap-profile", help="Named build profile to use during bootstrap.")
    parser.add_argument("--bootstrap-hour", action="append", dest="bootstrap_hours", type=int)
    parser.add_argument("--bootstrap-overlay", action="append", dest="bootstrap_overlays")
    parser.add_argument("--bootstrap-domain", action="append", dest="bootstrap_domains")
    parser.add_argument("--warm-cache", action="store_true", help="Warm local tile cache after bootstrap builds.")
    parser.add_argument("--warm-min-zoom", type=int, default=2)
    parser.add_argument("--warm-max-zoom", type=int, default=4)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.warm_cache and not args.bootstrap_run:
        parser.error("--warm-cache requires --bootstrap-run.")

    if args.bootstrap_run:
        bootstrap_run_id = resolve_run_selector(args.bootstrap_run, ROOT / DEFAULT_DATA_ROOT)
        manifest = get_run_manifest(bootstrap_run_id, ROOT / DEFAULT_DATA_ROOT)
        bootstrap_members = resolve_members(manifest, args.bootstrap_member, args.bootstrap_all_members)
        bootstrap_hours = args.bootstrap_hours or [0]
        bootstrap_overlays = args.bootstrap_overlays or default_bootstrap_overlays()
        bootstrap_domains = args.bootstrap_domains or default_bootstrap_domains()
        if args.bootstrap_profile:
            profiles = load_build_profiles(ROOT / "config" / "build-profiles.json")
            plan = resolve_build_profile(
                manifest=manifest,
                member=bootstrap_members[0],
                profile_id=args.bootstrap_profile or profiles["defaultProfile"],
                path=ROOT / "config" / "build-profiles.json",
                overlays=args.bootstrap_overlays,
                domains=args.bootstrap_domains,
                forecast_hours=args.bootstrap_hours,
            )
            bootstrap_hours = plan["forecast_hours"]
            bootstrap_overlays = plan["overlays"]
            bootstrap_domains = plan["domains"]
        else:
            plan = None
        print(f"Bootstrapping run {bootstrap_run_id} for members {', '.join(bootstrap_members)}...")
        for member in bootstrap_members:
            print(f" member: {member}")
            for forecast_hour in bootstrap_hours:
                catalog = build_products(
                    run_id=bootstrap_run_id,
                    member=member,
                    forecast_hour=forecast_hour,
                    overlays=bootstrap_overlays,
                    domains=bootstrap_domains,
                    product_dir=ROOT / "data" / "processed" / "products",
                )
                built_assets = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") == "built")
                print(f"  f{forecast_hour:03d}: {built_assets} built assets")
                if args.warm_cache:
                    summary = warm_tile_cache(
                        run_selector=bootstrap_run_id,
                        member=member,
                        forecast_hour=forecast_hour,
                        overlays=bootstrap_overlays,
                        domains=bootstrap_domains,
                        min_zoom=args.warm_min_zoom,
                        max_zoom=args.warm_max_zoom,
                        data_root=ROOT / DEFAULT_DATA_ROOT,
                        cache_root=ROOT / "data" / "processed" / "tile_cache",
                    )
                    print(
                        "  cache warm: "
                        f"{summary['tiles_generated']} generated, {summary['tiles_reused']} reused "
                        f"across {summary['tiles_total']} tiles"
                    )
        if (
            len(bootstrap_members) > 1
            and plan is not None
            and plan.get("build_ensemble_derived")
            and plan.get("ensemble_overlays")
        ):
            print(" ensemble member: ens")
            for forecast_hour in bootstrap_hours:
                catalog = build_ensemble_products(
                    run_id=bootstrap_run_id,
                    forecast_hour=forecast_hour,
                    overlays=plan["ensemble_overlays"],
                    domains=bootstrap_domains,
                    members=bootstrap_members,
                    product_dir=ROOT / "data" / "processed" / "products",
                )
                built_assets = sum(1 for artifact in catalog["artifacts"] if artifact.get("status") == "built")
                print(f"  ensemble f{forecast_hour:03d}: {built_assets} built assets")

    commands = [
        (
            "catalog-api",
            [
                sys.executable,
                str(ROOT / "services" / "catalog-api" / "app.py"),
                "--host",
                args.host,
                "--port",
                str(args.catalog_port),
            ],
        ),
        (
            "tile-api",
            [
                sys.executable,
                str(ROOT / "services" / "tile-api" / "app.py"),
                "--host",
                args.host,
                "--port",
                str(args.tile_port),
            ],
        ),
        (
            "web",
            [
                sys.executable,
                "-m",
                "http.server",
                str(args.web_port),
                "-d",
                str(ROOT / "apps" / "web"),
                "--bind",
                args.host,
            ],
        ),
    ]

    processes: list[tuple[str, subprocess.Popen[str]]] = []
    try:
        for name, command in commands:
            processes.append(
                (
                    name,
                    subprocess.Popen(command, cwd=ROOT),
                )
            )
        time.sleep(1.5)
        print(f"catalog-api: http://{args.host}:{args.catalog_port}")
        print(f"tile-api:    http://{args.host}:{args.tile_port}")
        print(f"web:         http://{args.host}:{args.web_port}/")
        print("Press Ctrl+C to stop the stack.")
        while True:
            time.sleep(0.5)
            for name, process in processes:
                code = process.poll()
                if code is not None:
                    raise RuntimeError(f"{name} exited early with code {code}")
    except KeyboardInterrupt:
        pass
    finally:
        for _, process in processes:
            if process.poll() is None:
                process.terminate()
        for _, process in processes:
            if process.poll() is None:
                process.wait(timeout=10)
    return 0


def default_bootstrap_overlays() -> list[str]:
    return [overlay_id for overlay_id, spec in PRODUCT_SPECS.items() if spec.mode != "deferred"]


def default_bootstrap_domains() -> list[str]:
    domains_path = ROOT / "config" / "domains.json"
    payload = json.loads(domains_path.read_text(encoding="utf-8"))
    return [domain["id"] for domain in payload["domains"]]


def resolve_members(manifest: dict[str, object], member: str | None, all_members: bool) -> list[str]:
    if all_members or not member:
        return [str(item) for item in manifest["run"]["members"]]
    return [member]


if __name__ == "__main__":
    raise SystemExit(main())
