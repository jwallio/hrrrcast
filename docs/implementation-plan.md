# Implementation Plan

## Phase 0: Validation

- confirm the current bucket cadence and naming convention
- confirm the HRRRCast field inventory you want to support first
- confirm how many members and forecast hours are consistently published
- verify whether the bucket retains archives or only recent runs
- define when a run should be treated as `partial` versus `ready`
- decide where processed tiles and manifests will live

Exit criteria:

- known run identity and cadence assumptions
- known list of initial overlays
- known run/member/hour retention assumptions
- known run completeness rule
- known hosting target for tiles and app

## Phase 1: Data Backbone

- build S3 discovery for date, cycle, member, and forecast hour
- parse `.idx` files into structured message inventories
- normalize run identity to a single `runId` such as `YYYYMMDDHH`
- create a local cache layout for raw files and extracted slices
- emit a run-status record that distinguishes in-flight publication from fully ready runs
- emit per-overlay availability by run/member/forecast hour
- produce a run manifest JSON for one sample cycle

Exit criteria:

- one CLI command can discover a run and produce a normalized manifest plus availability/status metadata

## Phase 2: Derived Products

- choose 4 to 6 high-value overlays for MVP
- implement extraction and styling metadata for each
- write COG outputs and metadata records
- add smoke tests for missing hours, missing members, and nodata ranges
- keep MVP rendering raster-first even for products that may later want contours or vectors

Suggested MVP overlays:

- composite reflectivity
- 2 m temperature
- dominant precipitation type
- MSLP shading only in MVP
- accumulated precipitation
- snowfall if and only if the raw publication exposes a defensible snow-supporting source field

## Phase 3: APIs

- expose run manifests and layer definitions through `catalog-api`
- serve raster tiles through `tile-api`
- add health checks and cache headers

Exit criteria:

- one frontend page can request latest run metadata and render at least one overlay

## Phase 4: Web Viewer

- build layout patterned after PolarWX
- add URL parameters for `run`, `member`, `fhr`, `proj`, `background`, `overlay`, `state`, and `country`
- add domain picker and forecast hour scrubber
- add baselayer and reference-layer controls
- support desktop and mobile layouts

Exit criteria:

- shareable deep links reproduce map state exactly

## Phase 5: Operations

- add scheduled ingest for new runs
- publish processed assets
- add archive pruning and manifest retention rules
- add regression snapshots for major overlays/domains

## Risks To Manage Early

- HRRRCast publication format may evolve because it is experimental
- latest cycles may be partially published when discovery first sees them
- native precipitation-type support may require derivation instead of a single direct field
- some variables may be absent for some hours or members, so overlay availability cannot be assumed globally
- member count and retention may vary by cycle
- regional domain presets can drift if not centralized in config
