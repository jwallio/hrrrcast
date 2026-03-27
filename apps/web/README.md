# Web App

The viewer is a static MapLibre client that talks to the local catalog and tile APIs.

## Run It

Fast path:

```powershell
python scripts/run_local_stack.py
```

Or launch the pieces manually:

```powershell
python services/catalog-api/app.py --port 8000
python services/tile-api/app.py --port 8001
python -m http.server 8080 -d apps/web
```

Then open:

```text
http://127.0.0.1:8080/
```

## Viewer Features

- latest-ready button for avoiding in-flight partial runs
- archive toggle for showing older and partial runs
- `member`, `ensemble`, and `compare` viewing modes
- compare-member selector with overlay opacity control
- forecast-hour animation with speed control
- overlay legend panel
- overlay filter plus group filter for curated, ensemble, and native overlays
- domain presets and baselayer switching
- shareable URL state

## URL State

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
http://127.0.0.1:8080/?run=2026032617&member=m00&fhr=0&proj=conus&overlay=temperature_2m_mean&mode=ensemble&overlayGroup=ensemble&background=plain_ocean&state=states_brown&country=countries_brown&archive=false&speed=900
```

## Notes

- The map uses the local XYZ tile endpoints from `services/tile-api`.
- Only processed products appear as enabled overlays for a selected run/member/hour or ensemble mode.
- Native HRRRCast fields now appear alongside the curated overlays. Use the overlay filter to find them quickly.
- Ensemble-derived products are surfaced under the synthetic member id `ens`, but the UI presents them through the `ensemble` view mode.
- A GitHub Pages deploy can host the frontend shell, but it still needs reachable `catalogApi` and `tileApi` query parameters because Pages cannot run the Python APIs.
- `archive=false` prefers ready runs only.
- The legend is display-oriented; raw product units still live in the metadata responses.
