# Public Viewer

`apps/web` is the public HRRRCast 1D station viewer.

It is now rebuilt around an operational, NOAA NBM 1D Viewer-inspired layout:

- left control rail
- structured element browser
- stacked time-series charts
- URL-restored settings and selected fields
- ensemble spread controls for boxes, whiskers, median, and deterministic overlay
- click-drag chart zoom with single-click reset

## Run It

Serve the public static app:

```powershell
python -m http.server 8080 -d apps/web
```

Then open:

```text
http://127.0.0.1:8080/
```

## URL Parameters

Supported public URL state:

```text
station
run
member
group
darkmode
tz
obs
fontsize
boxes
whiskers
median
det
colorfriendly
elements
backend
staticRoot
```

Parameter notes:

- `station`: ICAO / FAA / IATA-style airport code, example `KRDU`
- `run`: `latest-ready` or a concrete run like `2026032820`
- `member`: `ens`, `m00`, and any built member available in the payload
- `group`: `all` or a chart group id such as `storm`, `rotation`, `shear`, `moisture`, `aviation`, `upper`
- `darkmode`: `on` or `off`
- `tz`: `local`, `station`, or `utc`
- `obs`: `on` or `off`
- `fontsize`: `sm`, `md`, or `lg`
- `boxes`: `on` or `off`
- `whiskers`: `on` or `off`
- `median`: `on` or `off`
- `det`: `on` or `off`
- `colorfriendly`: `on` or `off`
- `elements`: comma-separated overlay ids for a custom field selection

## Example Deep Links

KRDU ensemble severe setup:

```text
https://jwallio.github.io/hrrrcast/?station=KRDU&run=latest-ready&member=ens&group=storm&darkmode=on&tz=local&obs=off&fontsize=md&boxes=on&whiskers=on&median=on&det=on&colorfriendly=off
```

KATL rotation setup:

```text
https://jwallio.github.io/hrrrcast/?station=KATL&run=latest-ready&member=ens&group=rotation&darkmode=on&tz=station&obs=off&fontsize=md&boxes=on&whiskers=on&median=on&det=on&colorfriendly=off
```

KRDU deterministic moisture setup with selected elements:

```text
https://jwallio.github.io/hrrrcast/?station=KRDU&run=latest-ready&member=m00&group=moisture&darkmode=on&tz=station&obs=off&fontsize=md&boxes=on&whiskers=on&median=on&det=on&colorfriendly=off&elements=dewpoint_2m,rh_2m,pwat
```

## Notes

- Observation overlays are not yet present in the static bundle, so the observation setting is a clean stub for now.
- The public site keeps GitHub Pages compatibility and uses the existing point-series payloads.
- URL state is the primary source of truth for restore/share behavior.
