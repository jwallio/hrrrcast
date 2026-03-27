"""Retention helpers for processed HRRRCast artifacts."""

from __future__ import annotations

import shutil
from pathlib import Path

from .store import latest_manifest, list_run_manifests


def select_runs_to_keep(
    data_root: str | Path,
    keep_ready_runs: int = 2,
    keep_partial_runs: int = 1,
    protected_runs: set[str] | None = None,
) -> set[str]:
    manifests = list_run_manifests(data_root)
    protected = set(protected_runs or set())

    ready_runs = [manifest["run"]["run_id"] for manifest in manifests if manifest["run"]["status"] == "ready"]
    partial_runs = [manifest["run"]["run_id"] for manifest in manifests if manifest["run"]["status"] == "partial"]
    try:
        latest = latest_manifest(data_root)
    except FileNotFoundError:
        latest = None
    if latest and latest["run"]["status"] == "partial":
        partial_runs.append(latest["run"]["run_id"])

    protected.update(ready_runs[-keep_ready_runs:])
    protected.update(partial_runs[-keep_partial_runs:])
    return protected


def prune_processed_runs(
    data_root: str | Path,
    keep_runs: set[str],
    prune_manifests: bool = True,
    prune_products: bool = True,
    prune_tile_cache: bool = True,
) -> dict[str, list[str]]:
    root = Path(data_root)
    removed = {
        "manifests": [],
        "products": [],
        "tile_cache": [],
    }

    if prune_manifests:
        manifests_dir = root / "manifests"
        for path in sorted(manifests_dir.glob("*.json")):
            if path.name == "latest.json":
                continue
            run_id = path.stem
            if run_id not in keep_runs:
                path.unlink()
                removed["manifests"].append(run_id)

    if prune_products:
        products_dir = root / "products"
        if products_dir.exists():
            for path in sorted(products_dir.iterdir()):
                if path.is_dir() and path.name not in keep_runs:
                    shutil.rmtree(path)
                    removed["products"].append(path.name)

    if prune_tile_cache:
        tile_cache_dir = root / "tile_cache"
        if tile_cache_dir.exists():
            for path in sorted(tile_cache_dir.iterdir()):
                if path.is_dir() and path.name not in keep_runs:
                    shutil.rmtree(path)
                    removed["tile_cache"].append(path.name)

    return removed
