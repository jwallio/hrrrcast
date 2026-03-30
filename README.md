# hrrrcast

Public-facing HRRRCast project centered on a static 1D station viewer for airport-code lookups and stacked forecast charts.

The public site serves the station viewer at:

- [jwallio.github.io/hrrrcast](https://jwallio.github.io/hrrrcast/)

## Public App

The deployed app is the static station viewer in [apps/web](/d:/weather-projects/hrrrcast-visualizer/apps/web).

Current public experience:

- operational left-rail / stacked-chart layout
- airport lookup by ICAO / FAA / IATA code
- `ens` severe probabilities plus member-spread charts
- deterministic member support such as `m00`
- URL-restored settings and custom field selections
- GitHub Pages-friendly static data bundle in [apps/web/static-api](/d:/weather-projects/hrrrcast-visualizer/apps/web/static-api)

Viewer documentation:

- [apps/web/README.md](/d:/weather-projects/hrrrcast-visualizer/apps/web/README.md)
- [apps/web/CHANGELOG.md](/d:/weather-projects/hrrrcast-visualizer/apps/web/CHANGELOG.md)

## Local Usage

Serve the public static app:

```powershell
python -m http.server 8080 -d apps/web
```

For local backend-driven development:

```powershell
python services/backend/app.py --port 8080
python -m http.server 8090 -d apps/station-viewer
```

Then open:

```text
http://127.0.0.1:8090/?backend=http://127.0.0.1:8080
```

## Backend and Data Pipeline

The ingest and backend code remains in the repo to support local processing and point-series generation:

- [services/backend](/d:/weather-projects/hrrrcast-visualizer/services/backend)
- [services/shared/point_series.py](/d:/weather-projects/hrrrcast-visualizer/services/shared/point_series.py)
- [pipelines/ingest](/d:/weather-projects/hrrrcast-visualizer/pipelines/ingest)

## Notes

- The old public map-viewer pipeline is no longer part of the Pages experience.
- The deployed Pages app is station-viewer only.
