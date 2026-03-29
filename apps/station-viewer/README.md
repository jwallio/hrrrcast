# HRRRCast 1D Viewer

Airport-code HRRRCast viewer modeled after a compact NBM-style 1D chart workflow.

## What It Does

- searches a local CONUS aviation station catalog by ICAO, FAA, or IATA code
- requests point-extracted HRRRCast time series from the backend
- renders stacked interactive charts for severe-weather products

## Current Modes

- `ens`: ensemble severe probabilities
- `m00`: deterministic member charts with derived bulk-shear speed

## Run Locally

Start the backend:

```powershell
python services/backend/app.py --port 8080
```

Serve the app:

```powershell
python -m http.server 8090 -d apps/station-viewer
```

Open:

```text
http://127.0.0.1:8090/?backend=http://127.0.0.1:8080
```

## Supporting Data

The station catalog is built from NOAA/AWC's official station cache via:

```powershell
python scripts/build_station_catalog.py
```
