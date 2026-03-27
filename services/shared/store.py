"""Helpers for reading processed manifests and product catalogs."""

from __future__ import annotations

import json
from pathlib import Path

from pipelines.ingest.field_catalog import build_layers_payload, collect_manifest_field_keys, load_static_layers


DEFAULT_DATA_ROOT = Path("data/processed")


def load_json(path: str | Path) -> dict[str, object]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def manifests_dir(data_root: str | Path = DEFAULT_DATA_ROOT) -> Path:
    return Path(data_root) / "manifests"


def products_dir(data_root: str | Path = DEFAULT_DATA_ROOT) -> Path:
    return Path(data_root) / "products"


def list_run_manifests(data_root: str | Path = DEFAULT_DATA_ROOT) -> list[dict[str, object]]:
    directory = manifests_dir(data_root)
    manifests: list[dict[str, object]] = []
    for path in sorted(directory.glob("*.json")):
        if path.name == "latest.json":
            continue
        manifests.append(load_json(path))
    manifests.sort(key=lambda manifest: manifest["run"]["run_id"])
    return manifests


def latest_manifest(data_root: str | Path = DEFAULT_DATA_ROOT) -> dict[str, object]:
    latest_path = manifests_dir(data_root) / "latest.json"
    if latest_path.exists():
        return load_json(latest_path)
    manifests = list_run_manifests(data_root)
    if not manifests:
        raise FileNotFoundError("No run manifests found.")
    return manifests[-1]


def latest_ready_manifest(data_root: str | Path = DEFAULT_DATA_ROOT) -> dict[str, object]:
    ready_manifests = [
        manifest for manifest in list_run_manifests(data_root) if manifest["run"]["status"] == "ready"
    ]
    if not ready_manifests:
        raise FileNotFoundError("No ready run manifests found.")
    return ready_manifests[-1]


def resolve_run_selector(run_selector: str, data_root: str | Path = DEFAULT_DATA_ROOT) -> str:
    selector = run_selector.strip().lower()
    if selector == "latest":
        return str(latest_manifest(data_root)["run"]["run_id"])
    if selector == "latest-ready":
        return str(latest_ready_manifest(data_root)["run"]["run_id"])
    return run_selector


def get_run_manifest(run_id: str, data_root: str | Path = DEFAULT_DATA_ROOT) -> dict[str, object]:
    path = manifests_dir(data_root) / f"{run_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Run manifest not found for {run_id}")
    return load_json(path)


def collect_all_manifest_field_keys(data_root: str | Path = DEFAULT_DATA_ROOT) -> set[str]:
    field_keys: set[str] = set()
    for manifest in list_run_manifests(data_root):
        field_keys.update(collect_manifest_field_keys(manifest))
    latest_path = manifests_dir(data_root) / "latest.json"
    if latest_path.exists():
        field_keys.update(collect_manifest_field_keys(load_json(latest_path)))
    return field_keys


def build_layers_index(
    layers_path: str | Path,
    data_root: str | Path = DEFAULT_DATA_ROOT,
) -> dict[str, object]:
    static_layers = load_static_layers(layers_path)
    return build_layers_payload(static_layers, collect_all_manifest_field_keys(data_root))


def build_run_summaries(data_root: str | Path = DEFAULT_DATA_ROOT) -> list[dict[str, object]]:
    summaries: list[dict[str, object]] = []
    for manifest in list_run_manifests(data_root):
        run = manifest["run"]
        summaries.append(
            {
                "run_id": run["run_id"],
                "status": run["status"],
                "member_count": run["member_count"],
                "members": run["members"],
                "max_forecast_hour": run["forecast_hours"][-1] if run["forecast_hours"] else None,
                "status_reasons": run["status_reasons"],
            }
        )
    return summaries


def build_run_availability(run_id: str, data_root: str | Path = DEFAULT_DATA_ROOT) -> dict[str, object]:
    manifest = get_run_manifest(run_id, data_root)
    payload: dict[str, object] = {
        "run_id": run_id,
        "status": manifest["run"]["status"],
        "members": {},
    }
    for member, member_payload in manifest["members"].items():
        member_summary: dict[str, object] = {
            "forecast_hours": member_payload["forecast_hours"],
            "forecast_hour_details": {},
        }
        for forecast_hour, detail in member_payload["forecast_hour_details"].items():
            overlays = detail["overlays"]
            member_summary["forecast_hour_details"][forecast_hour] = {
                "available_overlays": sorted(
                    overlay_id
                    for overlay_id, overlay_payload in overlays.items()
                    if overlay_payload["available"]
                ),
                "unavailable_overlays": sorted(
                    overlay_id
                    for overlay_id, overlay_payload in overlays.items()
                    if not overlay_payload["available"]
                ),
            }
        payload["members"][member] = member_summary
    return payload


def get_product_catalog(
    run_id: str,
    member: str,
    forecast_hour: int,
    data_root: str | Path = DEFAULT_DATA_ROOT,
) -> dict[str, object]:
    path = products_dir(data_root) / run_id / member / f"f{forecast_hour:03d}" / "catalog.json"
    if not path.exists():
        raise FileNotFoundError(f"Product catalog not found for {run_id}/{member}/f{forecast_hour:03d}")
    return load_json(path)


def get_asset_metadata(
    run_id: str,
    member: str,
    overlay_id: str,
    forecast_hour: int,
    domain_id: str,
    data_root: str | Path = DEFAULT_DATA_ROOT,
) -> dict[str, object]:
    path = (
        products_dir(data_root)
        / run_id
        / member
        / overlay_id
        / f"f{forecast_hour:03d}"
        / f"{domain_id}.json"
    )
    if not path.exists():
        raise FileNotFoundError(
            f"Asset metadata not found for {run_id}/{member}/{overlay_id}/f{forecast_hour:03d}/{domain_id}"
    )
    return load_json(path)


def build_product_index(data_root: str | Path = DEFAULT_DATA_ROOT) -> dict[str, object]:
    root = products_dir(data_root)
    index: dict[str, object] = {"runs": {}}
    if not root.exists():
        return index
    for run_dir in sorted(path for path in root.iterdir() if path.is_dir()):
        run_payload: dict[str, object] = {"members": {}}
        for member_dir in sorted(path for path in run_dir.iterdir() if path.is_dir()):
            member_payload: dict[str, object] = {"forecast_hours": {}}
            for fh_dir in sorted(path for path in member_dir.iterdir() if path.is_dir() and path.name.startswith("f")):
                if fh_dir.name == "f000" and (fh_dir / "catalog.json").exists():
                    catalog = load_json(fh_dir / "catalog.json")
                    overlays: dict[str, list[str]] = {}
                    for artifact in catalog["artifacts"]:
                        if artifact.get("status") != "built":
                            continue
                        overlays.setdefault(artifact["overlay_id"], []).append(artifact["domain_id"])
                    member_payload["forecast_hours"][fh_dir.name] = {
                        "overlays": {overlay_id: sorted(domains) for overlay_id, domains in overlays.items()}
                    }
            for overlay_dir in sorted(path for path in member_dir.iterdir() if path.is_dir() and not path.name.startswith("f")):
                overlay_id = overlay_dir.name
                for fh_dir in sorted(path for path in overlay_dir.iterdir() if path.is_dir() and path.name.startswith("f")):
                    fh_payload = member_payload["forecast_hours"].setdefault(fh_dir.name, {"overlays": {}})
                    domains = sorted(path.stem for path in fh_dir.glob("*.json"))
                    if domains:
                        fh_payload["overlays"][overlay_id] = domains
            run_payload["members"][member_dir.name] = member_payload
        index["runs"][run_dir.name] = run_payload
    return index
