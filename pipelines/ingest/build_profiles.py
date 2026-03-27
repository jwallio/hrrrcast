"""Named build profile resolution for HRRRCast product batches."""

from __future__ import annotations

import json
from pathlib import Path

from .ensemble_products import ensemble_overlay_ids
from .field_catalog import collect_manifest_field_keys, native_overlay_id
from .products import PRODUCT_SPECS

DEFAULT_BUILD_PROFILES_PATH = Path("config/build-profiles.json")


def load_build_profiles(path: str | Path = DEFAULT_BUILD_PROFILES_PATH) -> dict[str, object]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    payload["profilesById"] = {profile["id"]: profile for profile in payload["profiles"]}
    return payload


def resolve_build_profile(
    manifest: dict[str, object],
    member: str,
    profile_id: str,
    path: str | Path = DEFAULT_BUILD_PROFILES_PATH,
    overlays: list[str] | None = None,
    domains: list[str] | None = None,
    forecast_hours: list[int] | None = None,
) -> dict[str, object]:
    payload = load_build_profiles(path)
    try:
        profile = payload["profilesById"][profile_id]
    except KeyError as exc:
        raise KeyError(f"Unknown build profile: {profile_id}") from exc

    resolved_overlays = overlays or profile_overlay_ids(profile, manifest)
    resolved_domains = domains or profile.get("domains") or default_domain_ids()
    resolved_hours = forecast_hours or profile_forecast_hours(profile, manifest, member)

    return {
        "profile_id": profile["id"],
        "label": profile["label"],
        "description": profile.get("description", ""),
        "overlays": sorted(dict.fromkeys(resolved_overlays)),
        "ensemble_overlays": profile_ensemble_overlay_ids(profile),
        "build_ensemble_derived": bool(profile.get("includeEnsembleDerived")),
        "domains": list(resolved_domains),
        "forecast_hours": list(resolved_hours),
    }


def profile_overlay_ids(profile: dict[str, object], manifest: dict[str, object]) -> list[str]:
    overlays: list[str] = list(profile.get("overlayIds", []))
    if profile.get("includeDerived"):
        overlays.extend(derived_overlay_ids())
    if profile.get("includeNative"):
        overlays.extend(native_overlay_id(field_key) for field_key in sorted(collect_manifest_field_keys(manifest)))
    if not overlays:
        overlays.extend(derived_overlay_ids())
    return sorted(dict.fromkeys(overlays))


def profile_forecast_hours(profile: dict[str, object], manifest: dict[str, object], member: str) -> list[int]:
    if profile.get("hours"):
        return [int(value) for value in profile["hours"]]
    if profile.get("hourMode") == "all_available":
        return list(manifest["members"][member]["forecast_hours"])
    return [0]


def derived_overlay_ids() -> list[str]:
    return [overlay_id for overlay_id, spec in PRODUCT_SPECS.items() if spec.mode != "deferred"]


def profile_ensemble_overlay_ids(profile: dict[str, object]) -> list[str]:
    if not profile.get("includeEnsembleDerived"):
        return []
    return list(profile.get("ensembleOverlayIds") or ensemble_overlay_ids())


def default_domain_ids() -> list[str]:
    payload = json.loads(Path("config/domains.json").read_text(encoding="utf-8"))
    return [domain["id"] for domain in payload["domains"]]
