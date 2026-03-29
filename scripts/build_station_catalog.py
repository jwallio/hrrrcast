"""Build a slim CONUS airport/station catalog for the HRRRCast station viewer."""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path
import sys
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_PATH = ROOT / "data" / "reference" / "aviation_stations_conus.json"
DEFAULT_SOURCE_URL = "https://aviationweather.gov/data/cache/stations.cache.json.gz"
CONUS_BBOX = (-127.0, 23.0, -66.0, 50.0)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build the HRRRCast station catalog from NOAA/AWC station data.")
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument("--output-path", default=str(DEFAULT_OUTPUT_PATH))
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    output_path = Path(args.output_path)
    stations = load_station_cache(args.source_url)
    catalog = build_catalog(stations)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(catalog, indent=2, sort_keys=True), encoding="utf-8")
    print(f"Wrote {len(catalog['stations'])} stations to {output_path}")
    return 0


def load_station_cache(source_url: str) -> list[dict[str, object]]:
    request = urllib.request.Request(source_url, headers={"User-Agent": "HRRRCast station catalog builder"})
    with urllib.request.urlopen(request, timeout=120) as response:
        compressed = response.read()
    return json.loads(gzip.decompress(compressed).decode("utf-8"))


def build_catalog(stations: list[dict[str, object]]) -> dict[str, object]:
    payload: list[dict[str, object]] = []
    for station in stations:
        lat = station.get("lat")
        lon = station.get("lon")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        if not point_in_bbox(float(lon), float(lat), CONUS_BBOX):
            continue
        icao = clean_code(station.get("icaoId"))
        faa = clean_code(station.get("faaId"))
        iata = clean_code(station.get("iataId"))
        aliases = [code for code in [icao, faa, iata] if code]
        if not aliases:
            continue
        payload.append(
            {
                "id": icao or faa or iata,
                "icaoId": icao,
                "faaId": faa,
                "iataId": iata,
                "aliases": aliases,
                "site": str(station.get("site") or (icao or faa or iata)),
                "lat": round(float(lat), 5),
                "lon": round(float(lon), 5),
                "elev": int(station.get("elev") or 0),
                "state": str(station.get("state") or ""),
                "country": str(station.get("country") or "US"),
                "siteType": [str(item) for item in station.get("siteType") or []],
            }
        )
    payload.sort(key=lambda item: (item["id"], item["site"]))
    return {
        "source_url": DEFAULT_SOURCE_URL,
        "bbox": list(CONUS_BBOX),
        "station_count": len(payload),
        "stations": payload,
    }


def clean_code(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip().upper()
    return text or None


def point_in_bbox(lon: float, lat: float, bbox: tuple[float, float, float, float]) -> bool:
    return bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
