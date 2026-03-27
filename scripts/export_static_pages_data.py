"""Export a static Pages-compatible data bundle from built HRRRCast products."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services.shared.preview import render_preview_png  # noqa: E402
from services.shared.store import (  # noqa: E402
    build_layers_index,
    build_product_index,
    build_run_summaries,
    get_asset_metadata,
    latest_ready_manifest,
)


DEFAULT_OUTPUT_DIR = ROOT / "apps" / "web" / "static-api"
DEFAULT_MEMBERS = ["ens", "m00", "m01"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export static Pages data from processed HRRRCast products.")
    parser.add_argument("--run-id", help="Specific ready run to export. Defaults to latest-ready.")
    parser.add_argument(
        "--member",
        action="append",
        dest="members",
        help="Member ids to export. Repeat to include multiple members. Defaults to ens, m00, and m01 when available.",
    )
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--max-preview-dimension", type=int, default=640)
    parser.add_argument("--clean", action="store_true", help="Delete the output directory before export.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    output_dir = Path(args.output_dir)
    if args.clean and output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = latest_ready_manifest()
    run_id = str(args.run_id or manifest["run"]["run_id"])
    product_index = build_product_index()
    run_payload = product_index["runs"].get(run_id)
    if not run_payload:
        raise FileNotFoundError(f"No built products found for run {run_id}.")

    available_members = sorted(run_payload["members"])
    members = args.members or [member for member in DEFAULT_MEMBERS if member in available_members]
    if not members:
        raise RuntimeError(f"No exportable members available for run {run_id}. Found: {available_members}")

    export_root_payloads(output_dir, run_id, members, product_index)
    export_assets(
        output_dir=output_dir,
        run_id=run_id,
        members=members,
        run_payload=run_payload,
        max_preview_dimension=args.max_preview_dimension,
    )
    print(f"Exported static Pages data for run {run_id} and members {', '.join(members)} to {output_dir}")
    return 0


def export_root_payloads(
    output_dir: Path,
    run_id: str,
    members: list[str],
    product_index: dict[str, object],
) -> None:
    latest_ready = latest_ready_manifest()
    run_summaries = build_run_summaries()
    run_summary = next(run for run in run_summaries if str(run["run_id"]) == run_id)
    run_summary = dict(run_summary)
    run_summary["members"] = members

    runs_payload = {"runs": [run_summary]}
    (output_dir / "runs.json").write_text(json.dumps(runs_payload, indent=2, sort_keys=True), encoding="utf-8")
    (output_dir / "latest-ready.json").write_text(json.dumps(latest_ready, indent=2, sort_keys=True), encoding="utf-8")
    (output_dir / "latest.json").write_text(json.dumps(latest_ready, indent=2, sort_keys=True), encoding="utf-8")
    (output_dir / "domains.json").write_text(
        (ROOT / "config" / "domains.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    layers_payload = build_layers_index(ROOT / "config" / "layers.json")
    (output_dir / "layers.json").write_text(json.dumps(layers_payload, indent=2, sort_keys=True), encoding="utf-8")

    run_payload = product_index["runs"][run_id]
    filtered_members = {member: run_payload["members"][member] for member in members}
    static_index = {"runs": {run_id: {"members": filtered_members}}}
    (output_dir / "products-index.json").write_text(
        json.dumps(static_index, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def export_assets(
    output_dir: Path,
    run_id: str,
    members: list[str],
    run_payload: dict[str, object],
    max_preview_dimension: int,
) -> None:
    for member in members:
        forecast_hours = run_payload["members"][member]["forecast_hours"]
        for fhr_token, fh_payload in forecast_hours.items():
            forecast_hour = int(fhr_token[1:])
            for overlay_id, domains in fh_payload["overlays"].items():
                for domain_id in domains:
                    metadata = get_asset_metadata(run_id, member, overlay_id, forecast_hour, domain_id)
                    relative_metadata_dir = Path("products") / run_id / member / overlay_id / fhr_token
                    target_dir = output_dir / relative_metadata_dir
                    target_dir.mkdir(parents=True, exist_ok=True)
                    preview_path = target_dir / f"{domain_id}.preview.png"
                    preview_bytes = render_preview_png(
                        metadata["netcdf_path"],
                        overlay_id,
                        max_dimension=max_preview_dimension,
                        metadata=metadata,
                    )
                    preview_path.write_bytes(preview_bytes)

                    payload = dict(metadata)
                    payload["display_path"] = f"{run_id}/{member}/{overlay_id}/{fhr_token}/{domain_id}"
                    payload["preview_url"] = static_preview_url(output_dir, preview_path)
                    payload["static_export"] = True
                    payload_path = target_dir / f"{domain_id}.json"
                    payload_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def relative_url(root: Path, path: Path) -> str:
    return "./" + path.relative_to(root).as_posix()


def static_preview_url(output_dir: Path, path: Path) -> str:
    static_root = output_dir.parent
    return "./" + path.relative_to(static_root).as_posix()


if __name__ == "__main__":
    raise SystemExit(main())
