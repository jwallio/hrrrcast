Unified deployable backend for public hosting.

Run locally:

```powershell
python services/backend/app.py --host 127.0.0.1 --port 8080
```

This service exposes:

- `/health`
- `/api/domains`
- `/api/layers`
- `/api/runs`
- `/api/runs/latest`
- `/api/runs/latest-ready`
- `/api/runs/{runId}`
- `/api/runs/{runId}/availability`
- `/api/products-index`
- `/api/products/{runId}/{member}/f{forecastHour}`
- `/api/products/{runId}/{member}/{overlay}/f{forecastHour}/{domain}`
- `/api/products/{runId}/{member}/{overlay}/f{forecastHour}/{domain}/preview.png`
- `/tiles/{runId}/{member}/{overlay}/f{forecastHour}/{domain}/tilejson.json`
- `/tiles/{runId}/{member}/{overlay}/f{forecastHour}/{domain}/{z}/{x}/{y}.png`

The backend expects processed artifacts under `data/processed/`.
