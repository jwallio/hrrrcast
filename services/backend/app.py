"""Unified backend for catalog metadata, product metadata, and XYZ tiles."""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.shared.preview import render_preview_png  # noqa: E402
from services.shared.point_series import (  # noqa: E402
    DEFAULT_STATION_CATALOG_PATH,
    build_point_series,
    get_station,
    search_stations,
)
from services.shared.store import (  # noqa: E402
    DEFAULT_DATA_ROOT,
    build_layers_index,
    build_product_index,
    build_run_availability,
    build_run_summaries,
    get_asset_metadata,
    get_product_catalog,
    get_run_manifest,
    latest_manifest,
    latest_ready_manifest,
    load_json,
)
from services.shared.tiler import (  # noqa: E402
    DEFAULT_TILE_CACHE_ROOT,
    build_tile_cache_path,
    render_tile_png_cached,
)


class BackendRequestHandler(BaseHTTPRequestHandler):
    data_root = DEFAULT_DATA_ROOT
    tile_cache_root = DEFAULT_TILE_CACHE_ROOT
    station_catalog_path = DEFAULT_STATION_CATALOG_PATH
    domains_path = ROOT / "config" / "domains.json"
    layers_path = ROOT / "config" / "layers.json"

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        try:
            if path == "/health":
                self._json_response({"status": "ok"})
                return
            if path == "/api/domains":
                self._json_response(load_json(self.domains_path))
                return
            if path == "/api/layers":
                self._json_response(build_layers_index(self.layers_path, self.data_root))
                return
            if path == "/api/runs":
                self._json_response({"runs": build_run_summaries(self.data_root)})
                return
            if path == "/api/runs/latest":
                self._json_response(latest_manifest(self.data_root))
                return
            if path == "/api/runs/latest-ready":
                self._json_response(latest_ready_manifest(self.data_root))
                return
            if path.startswith("/api/runs/"):
                self._handle_run_request(path)
                return
            if path == "/api/products-index":
                self._json_response(build_product_index(self.data_root))
                return
            if path == "/api/stations/search":
                query = parse_qs(parsed.query)
                limit = int(query.get("limit", ["12"])[0])
                term = query.get("q", [""])[0]
                self._json_response({"stations": search_stations(term, limit, self.station_catalog_path)})
                return
            if path.startswith("/api/stations/"):
                station_code = path[len("/api/stations/") :]
                self._json_response(get_station(station_code, self.station_catalog_path))
                return
            if path == "/api/point-series":
                self._handle_point_series_request(parsed)
                return
            if path.startswith("/api/products/"):
                self._handle_product_request(path, parsed)
                return
            if path.startswith("/tiles/"):
                self._handle_tile_request(path)
                return
            self._json_response({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
        except FileNotFoundError as exc:
            self._json_response({"error": str(exc)}, status=HTTPStatus.NOT_FOUND)

    def log_message(self, format: str, *args: object) -> None:
        return

    def _handle_run_request(self, path: str) -> None:
        remainder = path[len("/api/runs/") :]
        if remainder.endswith("/availability"):
            run_id = remainder[: -len("/availability")]
            self._json_response(build_run_availability(run_id, self.data_root))
            return
        self._json_response(get_run_manifest(remainder, self.data_root))

    def _handle_product_request(self, path: str, parsed) -> None:
        remainder = path[len("/api/products/") :]
        parts = remainder.split("/")
        if len(parts) == 3:
            run_id, member, fhour_token = parts
            self._json_response(get_product_catalog(run_id, member, int(fhour_token[1:]), self.data_root))
            return
        if len(parts) == 5:
            run_id, member, overlay_id, fhour_token, domain_id = parts
            self._json_response(
                get_asset_metadata(run_id, member, overlay_id, int(fhour_token[1:]), domain_id, self.data_root)
            )
            return
        if len(parts) == 6 and parts[-1] == "preview.png":
            run_id, member, overlay_id, fhour_token, domain_id, _ = parts
            metadata = get_asset_metadata(run_id, member, overlay_id, int(fhour_token[1:]), domain_id, self.data_root)
            query = parse_qs(parsed.query)
            max_dimension = int(query.get("max_dimension", ["900"])[0])
            png = render_preview_png(
                metadata["netcdf_path"],
                overlay_id,
                max_dimension=max_dimension,
                metadata=metadata,
            )
            self._png_response(png)
            return
        self._json_response({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def _handle_point_series_request(self, parsed) -> None:
        query = parse_qs(parsed.query)
        station_code = query.get("station", [""])[0]
        member = query.get("member", ["ens"])[0]
        run_selector = query.get("run", ["latest-ready"])[0]
        overlays = query.get("overlay") or None
        if not station_code:
            self._json_response({"error": "station query parameter is required"}, status=HTTPStatus.BAD_REQUEST)
            return
        payload = build_point_series(
            run_selector=run_selector,
            station_code=station_code,
            member=member,
            overlays=overlays,
            data_root=self.data_root,
            station_catalog_path=self.station_catalog_path,
        )
        self._json_response(payload, cache_control="public, max-age=300")

    def _handle_tile_request(self, path: str) -> None:
        remainder = path[len("/tiles/") :]
        parts = remainder.split("/")
        if len(parts) == 6 and parts[-1] == "tilejson.json":
            run_id, member, overlay_id, fhour_token, domain_id, _ = parts
            self._json_response(
                build_tilejson(
                    run_id=run_id,
                    member=member,
                    overlay_id=overlay_id,
                    forecast_hour=int(fhour_token[1:]),
                    domain_id=domain_id,
                    request_handler=self,
                    data_root=self.data_root,
                )
            )
            return
        if len(parts) == 8 and parts[-1].endswith(".png"):
            run_id, member, overlay_id, fhour_token, domain_id, z_token, x_token, y_token = parts
            forecast_hour = int(fhour_token[1:])
            metadata = get_asset_metadata(run_id, member, overlay_id, forecast_hour, domain_id, self.data_root)
            cache_path = build_tile_cache_path(
                run_id=run_id,
                member=member,
                overlay_id=overlay_id,
                forecast_hour=forecast_hour,
                domain_id=domain_id,
                z=int(z_token),
                x=int(x_token),
                y=int(y_token[:-4]),
                cache_root=self.tile_cache_root,
            )
            png = render_tile_png_cached(
                metadata["netcdf_path"],
                overlay_id,
                int(z_token),
                int(x_token),
                int(y_token[:-4]),
                cache_path=cache_path,
                metadata=metadata,
            )
            self._png_response(png, cache_control="public, max-age=86400")
            return
        self._json_response({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)

    def _request_origin(self) -> str:
        proto = self.headers.get("X-Forwarded-Proto", "http")
        host = self.headers.get("Host", "127.0.0.1:8080")
        return f"{proto}://{host}"

    def _json_response(
        self,
        payload: dict[str, object],
        status: HTTPStatus = HTTPStatus.OK,
        cache_control: str = "no-store",
    ) -> None:
        body = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", cache_control)
        self.end_headers()
        self.wfile.write(body)

    def _png_response(self, payload: bytes, cache_control: str = "public, max-age=3600") -> None:
        self.send_response(HTTPStatus.OK.value)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", cache_control)
        self.end_headers()
        self.wfile.write(payload)


def build_tilejson(
    run_id: str,
    member: str,
    overlay_id: str,
    forecast_hour: int,
    domain_id: str,
    request_handler: BackendRequestHandler,
    data_root: Path,
) -> dict[str, object]:
    metadata = get_asset_metadata(run_id, member, overlay_id, forecast_hour, domain_id, data_root)
    base_url = request_handler._request_origin()
    return {
        "tilejson": "3.0.0",
        "name": f"{run_id}-{member}-{overlay_id}-{domain_id}-f{forecast_hour:03d}",
        "tiles": [
            f"{base_url}/tiles/{run_id}/{member}/{overlay_id}/f{forecast_hour:03d}/{domain_id}/{{z}}/{{x}}/{{y}}.png"
        ],
        "bounds": metadata["bbox"],
        "minzoom": 0,
        "maxzoom": 8,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the unified HRRRCast backend.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", default=int(os.environ.get("PORT", "8080")), type=int)
    parser.add_argument("--data-root", default=str(DEFAULT_DATA_ROOT))
    parser.add_argument("--tile-cache-root", default=str(DEFAULT_TILE_CACHE_ROOT))
    parser.add_argument("--station-catalog", default=str(DEFAULT_STATION_CATALOG_PATH))
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    BackendRequestHandler.data_root = Path(args.data_root)
    BackendRequestHandler.tile_cache_root = Path(args.tile_cache_root)
    BackendRequestHandler.station_catalog_path = Path(args.station_catalog)
    server = ThreadingHTTPServer((args.host, args.port), BackendRequestHandler)
    print(f"HRRRCast backend listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
