"""Smoke-check the local HRRRCast services and one sample tile path."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.shared.tiler import tile_range_for_bbox  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check local catalog, tile, and web endpoints.")
    parser.add_argument("--catalog-base", default="http://127.0.0.1:8000")
    parser.add_argument("--tile-base", default="http://127.0.0.1:8001")
    parser.add_argument("--web-base", default="http://127.0.0.1:8080")
    parser.add_argument(
        "--run-id",
        default="latest-ready",
        help="Run selector used through the catalog API: explicit YYYYMMDDHH, latest, or latest-ready.",
    )
    parser.add_argument("--member", default="m00")
    parser.add_argument("--forecast-hour", type=int, default=0)
    parser.add_argument("--overlay", default="temperature_2m")
    parser.add_argument("--domain", default="conus")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    checks: list[str] = []
    fetch_json(f"{args.catalog_base}/health")
    checks.append("catalog health")
    fetch_json(f"{args.tile_base}/health")
    checks.append("tile health")
    html = fetch_text(args.web_base)
    if "<title>HRRRCast Visualizer</title>" not in html:
        raise RuntimeError("Web root did not return the expected viewer HTML.")
    checks.append("web root")

    run_id = resolve_remote_run_id(args.catalog_base, args.run_id)
    runs_payload = fetch_json(f"{args.catalog_base}/api/runs")
    checks.append(f"run list ({len(runs_payload.get('runs', []))} runs)")

    metadata = fetch_json(
        f"{args.tile_base}/api/products/{run_id}/{args.member}/{args.overlay}/f{args.forecast_hour:03d}/{args.domain}"
    )
    checks.append("product metadata")

    zoom = 4
    x_range, y_range = tile_range_for_bbox(metadata["bbox"], zoom)
    tile_url = (
        f"{args.tile_base}/tiles/{run_id}/{args.member}/{args.overlay}/f{args.forecast_hour:03d}/"
        f"{args.domain}/{zoom}/{x_range.start}/{y_range.start}.png"
    )
    tile_bytes = fetch_bytes(tile_url)
    if not tile_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Tile endpoint did not return a PNG payload.")
    checks.append("tile png")

    print("Health check passed.")
    print(f"run_id: {run_id}")
    print("checks:")
    for item in checks:
        print(f"- {item}")
    return 0


def resolve_remote_run_id(catalog_base: str, selector: str) -> str:
    lowered = selector.lower()
    if lowered == "latest-ready":
        manifest = fetch_json(f"{catalog_base}/api/runs/latest-ready")
        return str(manifest["run"]["run_id"])
    if lowered == "latest":
        manifest = fetch_json(f"{catalog_base}/api/runs/latest")
        return str(manifest["run"]["run_id"])
    return selector


def fetch_json(url: str) -> dict[str, object]:
    return json.loads(fetch_text(url))


def fetch_text(url: str) -> str:
    return fetch_bytes(url).decode("utf-8")


def fetch_bytes(url: str) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            return response.read()
    except urllib.error.HTTPError as exc:  # pragma: no cover - exercised in smoke usage
        raise RuntimeError(f"{exc.code} {exc.reason} for {url}") from exc


if __name__ == "__main__":
    raise SystemExit(main())
