"""Warm local XYZ tile cache entries for built HRRRCast products."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.shared.store import (  # noqa: E402
    DEFAULT_DATA_ROOT,
    get_asset_metadata,
    get_product_catalog,
    resolve_run_selector,
)
from services.shared.tiler import (  # noqa: E402
    DEFAULT_TILE_CACHE_ROOT,
    build_tile_cache_path,
    invalidate_tile_cache,
    render_tile_png_cached,
    tile_range_for_bbox,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Warm cached PNG tiles for one built run/member/hour.")
    parser.add_argument(
        "--run-id",
        default="latest-ready",
        help="Run selector: explicit YYYYMMDDHH, latest, or latest-ready.",
    )
    parser.add_argument("--member", default="m00")
    parser.add_argument("--forecast-hour", type=int, default=0)
    parser.add_argument("--overlay", action="append", dest="overlays")
    parser.add_argument("--domain", action="append", dest="domains")
    parser.add_argument("--min-zoom", type=int, default=2)
    parser.add_argument("--max-zoom", type=int, default=4)
    parser.add_argument("--refresh", action="store_true", help="Drop existing matching tile cache trees first.")
    parser.add_argument("--data-root", default=str(DEFAULT_DATA_ROOT))
    parser.add_argument("--cache-root", default=str(DEFAULT_TILE_CACHE_ROOT))
    return parser


def warm_tile_cache(
    run_selector: str,
    member: str,
    forecast_hour: int,
    overlays: list[str] | None = None,
    domains: list[str] | None = None,
    min_zoom: int = 2,
    max_zoom: int = 4,
    refresh: bool = False,
    data_root: str | Path = DEFAULT_DATA_ROOT,
    cache_root: str | Path = DEFAULT_TILE_CACHE_ROOT,
) -> dict[str, object]:
    if max_zoom < min_zoom:
        raise ValueError("max_zoom must be greater than or equal to min_zoom.")

    run_id = resolve_run_selector(run_selector, data_root)
    catalog = get_product_catalog(run_id, member, forecast_hour, data_root)
    built_assets = build_asset_lookup(catalog)
    selected_overlays = sorted(overlays or built_assets)

    summary = {
        "run_id": run_id,
        "member": member,
        "forecast_hour": forecast_hour,
        "assets": 0,
        "tiles_total": 0,
        "tiles_generated": 0,
        "tiles_reused": 0,
        "cache_invalidations": 0,
    }

    for overlay_id in selected_overlays:
        overlay_domains = built_assets.get(overlay_id, set())
        if not overlay_domains:
            continue
        selected_domains = sorted(domains or overlay_domains)
        for domain_id in selected_domains:
            if domain_id not in overlay_domains:
                continue
            if refresh:
                summary["cache_invalidations"] += invalidate_tile_cache(
                    run_id=run_id,
                    member=member,
                    overlay_id=overlay_id,
                    forecast_hour=forecast_hour,
                    domain_id=domain_id,
                    cache_root=cache_root,
                )
            metadata = get_asset_metadata(run_id, member, overlay_id, forecast_hour, domain_id, data_root)
            summary["assets"] += 1
            for z in range(min_zoom, max_zoom + 1):
                x_range, y_range = tile_range_for_bbox(metadata["bbox"], z)
                for x in x_range:
                    for y in y_range:
                        cache_path = build_tile_cache_path(
                            run_id=run_id,
                            member=member,
                            overlay_id=overlay_id,
                            forecast_hour=forecast_hour,
                            domain_id=domain_id,
                            z=z,
                            x=x,
                            y=y,
                            cache_root=cache_root,
                        )
                        existed = cache_path.exists()
                        render_tile_png_cached(
                            metadata["netcdf_path"],
                            overlay_id,
                            z,
                            x,
                            y,
                            cache_path=cache_path,
                        )
                        summary["tiles_total"] += 1
                        if existed:
                            summary["tiles_reused"] += 1
                        else:
                            summary["tiles_generated"] += 1
    return summary


def build_asset_lookup(catalog: dict[str, object]) -> dict[str, set[str]]:
    lookup: dict[str, set[str]] = {}
    for artifact in catalog["artifacts"]:
        if artifact.get("status") != "built":
            continue
        lookup.setdefault(str(artifact["overlay_id"]), set()).add(str(artifact["domain_id"]))
    return lookup


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    summary = warm_tile_cache(
        run_selector=args.run_id,
        member=args.member,
        forecast_hour=args.forecast_hour,
        overlays=args.overlays,
        domains=args.domains,
        min_zoom=args.min_zoom,
        max_zoom=args.max_zoom,
        refresh=args.refresh,
        data_root=args.data_root,
        cache_root=args.cache_root,
    )
    print(f"run_id:              {summary['run_id']}")
    print(f"member/hour:         {summary['member']} f{summary['forecast_hour']:03d}")
    print(f"assets_warmed:       {summary['assets']}")
    print(f"tiles_total:         {summary['tiles_total']}")
    print(f"tiles_generated:     {summary['tiles_generated']}")
    print(f"tiles_reused:        {summary['tiles_reused']}")
    print(f"cache_invalidations: {summary['cache_invalidations']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
