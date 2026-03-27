"""Lightweight JSON catalog API using the standard library."""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.shared.store import (  # noqa: E402
    DEFAULT_DATA_ROOT,
    build_layers_index,
    build_run_availability,
    build_run_summaries,
    get_run_manifest,
    latest_manifest,
    latest_ready_manifest,
    load_json,
)


class CatalogRequestHandler(BaseHTTPRequestHandler):
    data_root = DEFAULT_DATA_ROOT
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
                remainder = path[len("/api/runs/") :]
                if remainder.endswith("/availability"):
                    run_id = remainder[: -len("/availability")]
                    self._json_response(build_run_availability(run_id, self.data_root))
                    return
                self._json_response(get_run_manifest(remainder, self.data_root))
                return
            self._json_response({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
        except FileNotFoundError as exc:
            self._json_response({"error": str(exc)}, status=HTTPStatus.NOT_FOUND)

    def log_message(self, format: str, *args: object) -> None:
        return

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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the local HRRRCast catalog API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    parser.add_argument("--data-root", default=str(DEFAULT_DATA_ROOT))
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    CatalogRequestHandler.data_root = Path(args.data_root)
    server = ThreadingHTTPServer((args.host, args.port), CatalogRequestHandler)
    print(f"Catalog API listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
