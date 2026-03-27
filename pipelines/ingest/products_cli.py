"""CLI entrypoint for Phase 2 product generation."""

from __future__ import annotations

import argparse
from pathlib import Path

from .ensemble_products import build_ensemble_products, ensemble_overlay_ids
from .field_catalog import collect_manifest_field_keys, native_overlay_id
from .products import DEFAULT_PRODUCT_DIR, PRODUCT_SPECS, build_products
from .settings import DEFAULT_MANIFEST_DIR


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build Phase 2 clipped raster products for one HRRRCast run/member/hour."
    )
    parser.add_argument("--run-id", required=True, help="Run id in YYYYMMDDHH format.")
    parser.add_argument("--member", default="m00", help="Member id such as m00.")
    parser.add_argument("--ensemble", action="store_true", help="Build ensemble-derived products under the synthetic ens member.")
    parser.add_argument("--forecast-hour", type=int, required=True, help="Forecast hour integer.")
    parser.add_argument(
        "--overlay",
        action="append",
        dest="overlays",
        help="Overlay id to build. Repeat for multiple overlays.",
    )
    parser.add_argument(
        "--all-native",
        action="store_true",
        help="Include every native HRRRCast field found in the manifest for this run.",
    )
    parser.add_argument(
        "--domain",
        action="append",
        dest="domains",
        help="Domain id to build. Repeat for multiple domains. Defaults to all configured domains.",
    )
    parser.add_argument(
        "--manifest",
        help="Optional existing manifest JSON path. If omitted, the default processed manifest is used or built.",
    )
    parser.add_argument(
        "--output-root",
        default=DEFAULT_PRODUCT_DIR,
        help="Root directory for processed product outputs.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    overlays = list(args.overlays or [])
    if args.all_native:
        manifest = load_manifest_payload(args.manifest, args.run_id)
        field_keys = collect_manifest_field_keys(manifest)
        overlays.extend(sorted(native_overlay_id(field_key) for field_key in field_keys))
    if not overlays:
        overlays = ensemble_overlay_ids() if args.ensemble else [
            overlay_id
            for overlay_id, spec in PRODUCT_SPECS.items()
            if spec.mode != "deferred"
        ]
    overlays = sorted(dict.fromkeys(overlays))
    domains = args.domains or [
        "conus",
        "southeast",
        "northeast",
        "south_central",
        "northwest",
        "southwest",
        "carolinas",
    ]

    if args.ensemble:
        catalog = build_ensemble_products(
            run_id=args.run_id,
            forecast_hour=args.forecast_hour,
            overlays=overlays,
            domains=domains,
            manifest_path=args.manifest,
            product_dir=args.output_root,
        )
    else:
        catalog = build_products(
            run_id=args.run_id,
            member=args.member,
            forecast_hour=args.forecast_hour,
            overlays=overlays,
            domains=domains,
            manifest_path=args.manifest,
            product_dir=args.output_root,
        )
    print(f"Wrote product catalog: {catalog['catalog_path']}")
    built = [artifact for artifact in catalog["artifacts"] if artifact["status"] == "built"]
    skipped = [artifact for artifact in catalog["artifacts"] if artifact["status"] != "built"]
    print(f"Built assets: {len(built)}")
    print(f"Skipped assets: {len(skipped)}")
    return 0

def load_manifest_payload(manifest_path: str | None, run_id: str) -> dict[str, object]:
    import json

    path = Path(manifest_path) if manifest_path else Path(DEFAULT_MANIFEST_DIR) / f"{run_id}.json"
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    raise SystemExit(main())
