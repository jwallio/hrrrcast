# Ingest Pipeline

Primary jobs:

- discover new runs from the NOAA HRRRCast S3 bucket
- parse `.idx` files
- extract only required variables
- derive viewer-ready products
- write manifests and cloud-optimized rasters

Recommended output naming:

```text
processed/{runId}/{member}/{overlay}/f{forecastHour}.tif
manifests/{runId}.json
```

## Phase 1 CLI

Phase 1 adds a runnable manifest builder:

```powershell
python -m pipelines.ingest --run-id 2026032300
python -m pipelines.ingest --latest
```

Useful options:

- `--cache-dir` to change where `.idx` files are cached
- `--output` to choose a manifest path
- `--required-members` to tune readiness thresholds
- `--required-min-fhr` to tune readiness thresholds

Manifest contents include:

- normalized run identity
- discovered members and forecast hours
- run status: `ready`, `partial`, or `failed`
- per-member and per-hour field inventories
- per-overlay availability based on raw source fields

## Phase 2 CLI

Initial derived-product support is available for single-field raster overlays:

```powershell
python -m pipelines.ingest.products_cli --run-id 2026032300 --member m00 --forecast-hour 0
python -m pipelines.ingest.products_cli --run-id 2026032300 --member m00 --forecast-hour 0 --overlay temperature_2m --overlay mslp --domain conus --domain southeast
python -m pipelines.ingest.products_cli --run-id 2026032300 --member m00 --forecast-hour 0 --all-native
```

Current implemented overlays:

- `temperature_2m`
- `dewpoint_2m`
- `rh_2m`
- `qpf`
- `pwat`
- `composite_reflectivity`
- `mslp`
- `cape`
- `ptype`
- `wind_10m`
- `visibility`
- `cloud_cover_total`
- `ceiling`
- `height_500mb`
- `temperature_850mb`

Current implemented ensemble overlays:

- `temperature_2m_mean`
- `temperature_2m_spread`
- `qpf_probability_gt_0p10`
- `wind_10m_probability_gt_25kt`
- `composite_reflectivity_probability_gt_40dbz`
- `cape_probability_gt_1000`

Native field support:

- every raw field present in a manifest can now be exposed directly as a raster overlay
- `--all-native` builds the full native field inventory for one run/member/hour
- native overlay ids use a sanitized `field_*` form such as `field_tmp_2_m_above_ground`
- `--ensemble` builds the derived ensemble overlay set under the synthetic `ens` member

Named build profiles:

- `core_operational`
  Curated operational overlays for all available forecast hours and all domains
- `core_conus_fast`
  Curated operational overlays for all available forecast hours on CONUS only
- `full_native_sample`
  Curated plus native overlays for a single sample hour

Run them with:

```powershell
python scripts/build_run_profile.py --run-id latest-ready --profile core_operational
python scripts/build_run_profile.py --run-id latest-ready --member m00 --profile core_conus_fast
python scripts/build_run_profile.py --run-id latest-ready --member m00 --profile full_native_sample
```

Automated latest-ready sync:

```powershell
python scripts/sync_latest_ready_profile.py --profile core_operational
```

That command:

- resolves the current `latest-ready` run
- defaults to every discovered ensemble member unless `--member` is supplied
- builds configured ensemble-derived overlays after the member products when the selected profile enables them
- skips rebuilds when the latest-ready run is already fully synced for that profile/member set
- writes state under `data/processed/build_state/`
- prunes older processed manifests, products, and tile cache directories using retention limits

Repeated end-to-end refresh workflow:

```powershell
python scripts/refresh_latest_ready_workflow.py --profile core_operational --skip-health-check
```

That workflow:

- discovers the newest HRRRCast run from NOAA
- writes `data/processed/manifests/<runId>.json`
- updates `data/processed/manifests/latest.json`
- syncs the latest ready run for the selected profile across the full discovered ensemble unless `--member` is supplied
- can optionally run the local health check when catalog, tile, and web endpoints are already up

Current deferred overlays:

- `snowfall`

Phase 2 outputs currently write:

- single-message GRIB extracts into `data/raw/noaa/HRRRCast_fields/`
- per-domain clipped GRIB and NetCDF assets into `data/processed/products/`
- per-run/hour product catalogs with variable names and basic statistics

Derived overlay notes:

- `ptype` currently distinguishes `none`, `rain`, and `freezing_rain`
- `wind_10m` currently renders raster wind speed, not barbs or streamlines
- ensemble probabilities currently target `qpf > 0.10 in`, `10 m wind > 25 kt`, `reflectivity > 40 dBZ`, and `CAPE > 1000 J/kg`
- ensemble products currently write under the synthetic member id `ens`
- `snowfall` remains deferred until a snow-supporting raw field or a defensible derivation path is added
