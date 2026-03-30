# hrrrcast

Public-facing HRRRCast project centered on a static 1D station viewer for airport-code lookups and stacked forecast charts.

The public site now serves the station viewer at the GitHub Pages root:

- [jwallio.github.io/hrrrcast](https://jwallio.github.io/hrrrcast/)

## Public App

The deployed app is the static station viewer in [apps/web](/d:/weather-projects/hrrrcast-visualizer/apps/web).

It includes:

- airport lookup by ICAO / FAA / IATA code
- `ens` severe probabilities plus member-spread charts
- `m00` deterministic station charts
- static data under [apps/web/static-api](/d:/weather-projects/hrrrcast-visualizer/apps/web/static-api)

## Local Apps

- [apps/web](/d:/weather-projects/hrrrcast-visualizer/apps/web)
  Public static station viewer bundle
- [apps/station-viewer](/d:/weather-projects/hrrrcast-visualizer/apps/station-viewer)
  Local/live station viewer shell for backend-driven use

## Backend and Data Pipeline

The ingest and backend code remains in the repo to support local processing and point-series generation:

- [services/backend](/d:/weather-projects/hrrrcast-visualizer/services/backend)
- [services/shared/point_series.py](/d:/weather-projects/hrrrcast-visualizer/services/shared/point_series.py)
- [pipelines/ingest](/d:/weather-projects/hrrrcast-visualizer/pipelines/ingest)

## Local Usage

Serve the public static app:

```powershell
python -m http.server 8080 -d apps/web
```

Serve the live local station viewer against the backend:

```powershell
python services/backend/app.py --port 8080
python -m http.server 8090 -d apps/station-viewer
```

Then open:

```text
http://127.0.0.1:8090/?backend=http://127.0.0.1:8080
```

## Notes

- The old public map-viewer Pages pipeline has been removed.
- The repo still contains model-processing code, but the deployed Pages experience is now station-viewer only.
