# Catalog API

Purpose:

- expose run availability
- expose overlay metadata
- expose domain config
- provide the frontend a stable contract independent of raw NOAA bucket quirks

Suggested implementation:

- standard-library HTTP server for now
- read manifests written by `pipelines/ingest`
- keep responses cacheable and versioned

Current entrypoint:

```powershell
python services/catalog-api/app.py --port 8000
```

Implemented endpoints:

- `GET /health`
- `GET /api/domains`
- `GET /api/layers`
- `GET /api/runs`
- `GET /api/runs/latest`
- `GET /api/runs/latest-ready`
- `GET /api/runs/{runId}`
- `GET /api/runs/{runId}/availability`
