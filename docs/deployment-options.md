# Deployment Options

This project is now beyond a pure prototype, but it is still using a deliberately lightweight tile path. These are the practical deployment shapes from least to most operationally heavy.

## Option 1: Single-Host Python Stack

Best for:

- internal use
- low traffic
- quick iteration on ingest logic and overlays

Shape:

- static web app served by a basic web server or CDN
- `catalog-api` and `tile-api` on one Python host
- processed NetCDF assets and tile cache on local disk

Pros:

- simplest deployment and debugging path
- lowest operational overhead
- matches current local architecture closely

Limits:

- tile rendering remains CPU-bound on demand
- cache persistence and invalidation are host-local
- horizontal scale is limited

## Option 2: Static Frontend + Thin Python APIs + Shared Object Storage

Best for:

- small public deployment
- moderate traffic
- keeping the current Python code with better durability

Shape:

- frontend on static hosting
- APIs on a small VM or container service
- processed products and warmed tile cache stored in shared object storage or a mounted volume

Pros:

- easier rollback and persistence story
- better separation between app and data
- still operationally simple

Limits:

- on-demand tile generation is still not a purpose-built geospatial stack
- cache coordination becomes more important

## Option 3: Pre-Rendered Raster Distribution

Best for:

- predictable public traffic
- a stable overlay set
- wanting low tile latency without a heavy runtime renderer

Shape:

- keep current ingest/product pipeline
- pre-render commonly requested tiles per run/domain/hour
- serve those PNGs from object storage or CDN

Pros:

- very fast serving path
- cheap to scale with CDN caching
- lower runtime complexity

Limits:

- larger storage footprint
- slower publish step for new runs
- less flexible when overlay styling changes

## Option 4: Stronger Geospatial Tile Backend

Best for:

- higher traffic
- more domains and overlays
- more demanding reprojection and styling requirements

Shape:

- migrate processed assets toward COG-friendly outputs
- use a stronger tile backend such as rio-tiler or TiTiler
- optionally move metadata APIs separately from tile serving

Pros:

- more production-grade reprojection and tiling
- stronger cache and scaling patterns
- cleaner path to future contours and richer geospatial products

Limits:

- more infrastructure and dependency weight
- higher implementation cost than the current lightweight stack

## Recommendation

Short term:

- Option 1 or 2
- keep the current viewer and APIs
- continue improving cache warming, health checks, and overlay coverage

If this becomes a public-facing product or the tile load grows materially:

- move toward Option 3 or 4
- especially if you want better reprojection fidelity, lower latency, or broader archive coverage
