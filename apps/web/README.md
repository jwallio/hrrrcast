# Web App

`apps/web` is now the public 1D station viewer.

It serves a static HRRRCast airport/station experience with:

- airport lookup by code
- `ens` severe probability and member-spread charts
- `m00` deterministic station charts
- a GitHub Pages-friendly static data bundle in `apps/web/static-api`

## Run It

For the static public app:

```powershell
python -m http.server 8080 -d apps/web
```

Then open:

```text
http://127.0.0.1:8080/
```

For the live local backend version:

```powershell
python services/backend/app.py --port 8080
python -m http.server 8090 -d apps/station-viewer
```

Then open:

```text
http://127.0.0.1:8090/?backend=http://127.0.0.1:8080
```

## URL State

Supported parameters:

```text
station
member
run
group
backend
staticRoot
```

Example:

```text
http://127.0.0.1:8080/?station=KRDU&member=ens&run=latest-ready&group=all
```

## Notes

- The GitHub Pages root now serves this station viewer directly.
- `apps/web/static-api/` is station-viewer data, not the old map snapshot bundle.
- The old public map viewer pipeline has been removed from the Pages deploy path.
