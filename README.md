# HRRRCast Visualizer

Map-first visualizer for NOAA GSL's experimental HRRRCast model output, with a PolarWX-style interface over locally processed products.

Current capabilities:

- named domains: `conus`, `southeast`, `northeast`, `south_central`, `northwest`, `southwest`, `carolinas`
- switchable baselayers and boundary overlays
- processed weather overlays rendered as XYZ tiles
- ensemble-derived mean, spread, and probability products exposed under the synthetic `ens` member
- native HRRRCast field catalog exposed as overlays in addition to curated derived products
- shareable URL state for run, member, forecast hour, domain, baselayer, overlay, view mode, and archive mode
- local cache warming and stack health checks
- GitHub Pages static export for the latest-ready ensemble snapshot
- unified backend entrypoint for container deployment
- container image publishing workflow to GHCR

## Current Stack

- `apps/web`
  Static MapLibre GL JS viewer
- `services/catalog-api`
  Standard-library Python JSON API for manifests, domains, and layers
- `services/tile-api`
  Standard-library Python tile and product API over processed NetCDF assets
- `services/backend`
  Single-process deployable backend exposing both API surfaces on one port
- `pipelines/ingest`
  Python ingest and product generation for NOAA HRRRCast GRIB2 data
- `scripts`
  Local stack launcher, health check, and tile cache warmers

## Implemented Data Flow

1. Discover HRRRCast runs and parse `.idx` inventories from the NOAA experimental S3 bucket.
2. Build processed manifests with run status, member/hour coverage, and overlay availability.
3. Extract selected GRIB2 fields and derive map-ready NetCDF products by named domain.
4. Serve catalog metadata plus XYZ raster tiles from the processed assets.
5. Render those tiles in the browser with URL-driven state and domain presets.

## Implemented Overlays

Curated member overlays:

- `composite_reflectivity`
- `temperature_2m`
- `dewpoint_2m`
- `rh_2m`
- `ptype`
- `mslp`
- `qpf`
- `pwat`
- `cape`
- `wind_10m`
- `visibility`
- `cloud_cover_total`
- `ceiling`
- `height_500mb`
- `temperature_850mb`

Ensemble overlays:

- `temperature_2m_mean`
- `temperature_2m_spread`
- `qpf_probability_gt_0p10`
- `wind_10m_probability_gt_25kt`
- `composite_reflectivity_probability_gt_40dbz`
- `cape_probability_gt_1000`

Native fields:

- the sampled ready run now exposes 172 native HRRRCast field overlays through the API and viewer
- these use overlay ids like `field_tmp_2_m_above_ground` and preserve the original GRIB field key in metadata
- a sample all-native build has been materialized for `2026032300 / m00 / f000`

Deferred:

- `snowfall`
  The sampled HRRRCast inventories checked on March 26, 2026 did not expose a defensible snow-supporting source field such as `CSNOW`, `SNOD`, or `WEASD`.

## Repo Layout

```text
hrrrcast-visualizer/
  apps/
    web/
  config/
    domains.json
    layers.json
  docs/
    architecture.md
    deployment-options.md
    implementation-plan.md
  pipelines/
    ingest/
  scripts/
    build_run_profile.py
    health_check.py
    refresh_latest_ready_workflow.py
    run_local_stack.py
    sync_latest_ready_profile.py
    warm_tile_cache.py
  services/
    catalog-api/
    tile-api/
  tests/
```

## Local Usage

Launch the existing local stack:

```powershell
python scripts/run_local_stack.py
```

Run the unified backend locally:

```powershell
python services/backend/app.py --host 127.0.0.1 --port 8080
```

Bootstrap sample products for the latest ready processed run, warm common tiles, and then launch:

```powershell
python scripts/run_local_stack.py --bootstrap-run latest-ready --warm-cache
```

Warm tiles for an existing built hour:

```powershell
python scripts/warm_tile_cache.py --run-id latest-ready --member m00 --forecast-hour 0
```

Build every native field for one run/member/hour:

```powershell
python -m pipelines.ingest.products_cli --run-id 2026032300 --member m00 --forecast-hour 0 --all-native
```

Build ensemble products for one run/hour:

```powershell
python -m pipelines.ingest.products_cli --run-id latest-ready --forecast-hour 0 --ensemble
```

Build a named profile:

```powershell
python scripts/build_run_profile.py --run-id latest-ready --profile core_operational
python scripts/build_run_profile.py --run-id latest-ready --member m00 --profile full_native_sample
```

Sync the latest ready run and prune older processed artifacts:

```powershell
python scripts/sync_latest_ready_profile.py --profile core_operational
```

Run the full repeated refresh workflow:

```powershell
python scripts/refresh_latest_ready_workflow.py --profile core_operational --skip-health-check
```

Run the Windows scheduler wrapper once:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_refresh_latest_ready.ps1 -Profile core_operational
```

Register an hourly Task Scheduler job:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register_refresh_task.ps1 -Profile core_operational
```

Export the current latest-ready run for GitHub Pages:

```powershell
python scripts/export_static_pages_data.py --clean --member ens
```

Smoke-check the local services:

```powershell
python scripts/health_check.py
```

## Viewer URL State

Supported parameters:

```text
run
member
fhr
proj
overlay
background
state
country
archive
speed
mode
compareMember
compareOpacity
overlayGroup
catalogApi
tileApi
```

Example:

```text
http://127.0.0.1:8080/?run=2026032617&member=m00&fhr=0&proj=conus&overlay=temperature_2m&mode=compare&compareMember=m01&compareOpacity=45&overlayGroup=curated&background=plain_ocean&state=states_brown&country=countries_brown&archive=false
```

For a single public backend:

```text
https://jwallio.github.io/HRRRCast/?backend=https://your-backend-host.example.com
```

## Notes

- The tile path is intentionally lightweight and suited to local development, internal sharing, and early product iteration.
- Tile cache invalidation now runs when products are rebuilt, so stale PNG tiles are less likely after a product refresh.
- `latest-ready` is treated separately from `latest` so the UI can avoid drifting onto in-flight partial runs.
- Named build profiles now separate the expensive native sample build from the practical all-hours operational overlay build.
- Latest-ready sync now writes build-state markers under `data/processed/build_state/` and can prune older manifest, product, and tile-cache runs by retention policy.
- The operational sync and refresh workflows now default to the full discovered ensemble member set. Use `--member` only when you intentionally want a single-member build.
- The web app now supports `member`, `ensemble`, and `compare` viewing modes, plus overlay-group filtering for curated, ensemble, and native layers.
- Windows scheduler helper scripts are available under `scripts/run_refresh_latest_ready.ps1` and `scripts/register_refresh_task.ps1`.
- GitHub Pages currently serves a static export of the latest-ready ensemble snapshot from `apps/web/static-api/`.
- GitHub cannot host the Python backend itself. The public Pages site can point at a single deployed backend URL through `?backend=...` or `apps/web/config.js`.
- The deployable backend expects processed artifacts under `data/processed/`. A real public host still needs persistent storage or a startup sync strategy for those artifacts.
- The one-command refresh workflow now discovers the newest run, updates `latest.json`, syncs the latest ready profile, and can optionally run health checks.

## References

- [NOAA GSL HRRRCast article](https://gsl.noaa.gov/news/hrrr-cast-unleashes-ai-for-regional-weather-forecasting)
- [NOAA experimental HRRRCast bucket](https://noaa-gsl-experimental-pds.s3.amazonaws.com/index.html#HRRRCast/)
- [PolarWX viewer reference](https://polarwx.com/models/?model=hrrr&base=ptype&background=plain_ocean&state=states_brown&country=countries_brown&proj=conus&archive=false&run=2026032612)
