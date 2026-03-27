# Tile API

Purpose:

- serve styled raster tiles from precomputed COG assets
- keep heavy raster logic off the client

Suggested implementation:

- standard-library HTTP server for now
- preview PNG rendering from processed NetCDF assets
- JSON metadata endpoints over built products

Current entrypoint:

```powershell
python services/tile-api/app.py --port 8001
```

Implemented endpoints:

- `GET /health`
- `GET /api/products-index`
- `GET /api/products/{runId}/{member}/f{forecastHour}`
- `GET /api/products/{runId}/{member}/{overlay}/f{forecastHour}/{domain}`
- `GET /api/products/{runId}/{member}/{overlay}/f{forecastHour}/{domain}/preview.png`
- `GET /tiles/{runId}/{member}/{overlay}/f{forecastHour}/{domain}/tilejson.json`
- `GET /tiles/{runId}/{member}/{overlay}/f{forecastHour}/{domain}/{z}/{x}/{y}.png`

The tile endpoints are lightweight NetCDF-backed XYZ rendering, intended for local development and initial frontend integration.

Tile responses are now cached on disk under:

```text
data/processed/tile_cache/
```

Useful companion scripts:

- `python scripts/warm_tile_cache.py --run-id latest-ready --member m00 --forecast-hour 0`
- `python scripts/health_check.py`
