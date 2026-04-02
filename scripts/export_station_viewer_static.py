"""Export a static Pages bundle for the HRRRCast station viewer."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.shared.point_series import build_point_series, search_stations  # noqa: E402
from services.shared.store import build_run_summaries, latest_ready_manifest  # noqa: E402


DEFAULT_OUTPUT_DIR = ROOT / "apps" / "web" / "static-api"
DEFAULT_STATIONS = ["KRDU", "KATL", "KCLT", "KDEN", "KDFW", "KBNA", "KJFK", "KORD"]
DEFAULT_MEMBERS = ["ens"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export static station-viewer payloads for GitHub Pages.")
    parser.add_argument("--run", default="latest-ready")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--station", action="append", dest="stations")
    parser.add_argument("--member", action="append", dest="members")
    parser.add_argument("--clean", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    output_dir = Path(args.output_dir)
    if args.clean and output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    run_selector = args.run
    stations = [item.upper() for item in (args.stations or DEFAULT_STATIONS)]
    latest_ready = latest_ready_manifest()
    run_id = str(latest_ready["run"]["run_id"]) if run_selector == "latest-ready" else run_selector
    members = args.members or ["ens", *[str(member) for member in latest_ready["run"]["members"]]]
    export_runs(output_dir, run_id)
    export_station_subset(output_dir, stations)

    for member in members:
        for station in stations:
            payload = build_point_series(run_selector, station, member)
            write_payload(output_dir, "latest-ready", member, station, payload)
            if run_id != "latest-ready":
                write_payload(output_dir, run_id, member, station, payload)

    print(f"Exported station-viewer bundle for run {run_id} to {output_dir}")
    return 0


def export_runs(output_dir: Path, run_id: str) -> None:
    summaries = build_run_summaries()
    selected = [run for run in summaries if str(run["run_id"]) == run_id]
    if not selected:
        selected = summaries[-1:] if summaries else []
    payload = {"runs": selected}
    (output_dir / "runs.json").write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def export_station_subset(output_dir: Path, stations: list[str]) -> None:
    subset = []
    for station in stations:
        matches = search_stations(station, limit=1)
        if matches:
            subset.append(matches[0])
    payload = {"stations": subset}
    (output_dir / "stations.json").write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def write_payload(output_dir: Path, run_token: str, member: str, station: str, payload: dict[str, object]) -> None:
    target_dir = output_dir / "point-series" / run_token / member
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / f"{station}.json").write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
