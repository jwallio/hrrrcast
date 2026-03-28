const query = new URLSearchParams(window.location.search);

const runtimeConfig = window.HRRRCAST_CONFIG || {};
const isLocalHost = ["127.0.0.1", "localhost"].includes(window.location.hostname);
const forceStaticMode = query.get("static") === "true";
const backendBase = query.get("backend") || runtimeConfig.backendBase || "";
const explicitCatalogBase = query.get("catalogApi");
const explicitTileBase = query.get("tileApi");
const staticMode =
  forceStaticMode || (!isLocalHost && !backendBase && !explicitCatalogBase && !explicitTileBase);
const catalogBase =
  explicitCatalogBase || (backendBase ? backendBase : staticMode ? "./static-api" : "http://127.0.0.1:8000");
const tileBase =
  explicitTileBase || (backendBase ? backendBase : staticMode ? "./static-api" : "http://127.0.0.1:8001");
const mobileSafariStaticMode = staticMode && detectMobileSafari();

const backgroundSources = {
  plain_ocean: {
    label: "Plain Ocean",
    tiles: ["https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"],
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO',
  },
  terrain_light: {
    label: "Terrain Light",
    tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
    tileSize: 256,
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>, <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
  satellite: {
    label: "Satellite",
    tiles: [
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    attribution: "Tiles &copy; Esri",
  },
};

const remoteGeoJson = {
  states:
    "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json",
  countries:
    "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson",
};

const REGION_STATES = {
  southeast: [
    "Alabama",
    "Arkansas",
    "Florida",
    "Georgia",
    "Louisiana",
    "Mississippi",
    "North Carolina",
    "South Carolina",
    "Tennessee",
  ],
  northeast: [
    "Connecticut",
    "Delaware",
    "Maine",
    "Maryland",
    "Massachusetts",
    "New Hampshire",
    "New Jersey",
    "New York",
    "Pennsylvania",
    "Rhode Island",
    "Vermont",
    "Virginia",
    "West Virginia",
  ],
  south_central: ["Kansas", "Missouri", "New Mexico", "Oklahoma", "Texas"],
  northwest: ["Idaho", "Montana", "Oregon", "Washington", "Wyoming"],
  southwest: ["Arizona", "California", "Colorado", "Nevada", "New Mexico", "Utah"],
  carolinas: ["North Carolina", "South Carolina"],
};

const FAMILY_THEMES = {
  default: {
    accent: "#f28c45",
    background: "plain_ocean",
    stateColor: "#8e6344",
    countryColor: "#7f5d47",
    stateOpacity: 0.52,
    countryOpacity: 0.62,
    basemapOpacity: 0.78,
    basemapSaturation: -0.45,
    basemapBrightnessMin: 0.95,
    basemapBrightnessMax: 1.05,
    maskOpacity: 0.12,
    graticuleOpacity: 0.14,
    overlayOpacity: 0.9,
  },
  severe: {
    accent: "#ef7b39",
    background: "terrain_light",
    stateColor: "#6e5b4f",
    countryColor: "#5c4d43",
    stateOpacity: 0.38,
    countryOpacity: 0.5,
    basemapOpacity: 0.52,
    basemapSaturation: -0.65,
    basemapBrightnessMin: 0.78,
    basemapBrightnessMax: 0.92,
    maskOpacity: 0.2,
    graticuleOpacity: 0.1,
    overlayOpacity: 0.96,
  },
  upper_air: {
    accent: "#d8733a",
    background: "plain_ocean",
    stateColor: "#927566",
    countryColor: "#81695c",
    stateOpacity: 0.34,
    countryOpacity: 0.46,
    basemapOpacity: 0.58,
    basemapSaturation: -0.72,
    basemapBrightnessMin: 0.9,
    basemapBrightnessMax: 1.02,
    maskOpacity: 0.14,
    graticuleOpacity: 0.18,
    overlayOpacity: 0.94,
  },
  synoptic: {
    accent: "#d8894e",
    background: "plain_ocean",
    stateColor: "#8d7364",
    countryColor: "#7a6558",
    stateOpacity: 0.36,
    countryOpacity: 0.5,
    basemapOpacity: 0.63,
    basemapSaturation: -0.58,
    basemapBrightnessMin: 0.92,
    basemapBrightnessMax: 1.03,
    maskOpacity: 0.16,
    graticuleOpacity: 0.16,
    overlayOpacity: 0.93,
  },
  surface: {
    accent: "#f28c45",
    background: "plain_ocean",
    stateColor: "#8e6344",
    countryColor: "#7f5d47",
    stateOpacity: 0.46,
    countryOpacity: 0.58,
    basemapOpacity: 0.72,
    basemapSaturation: -0.5,
    basemapBrightnessMin: 0.95,
    basemapBrightnessMax: 1.05,
    maskOpacity: 0.12,
    graticuleOpacity: 0.14,
    overlayOpacity: 0.9,
  },
  wind: {
    accent: "#e0894c",
    background: "plain_ocean",
    stateColor: "#877062",
    countryColor: "#77655b",
    stateOpacity: 0.32,
    countryOpacity: 0.44,
    basemapOpacity: 0.58,
    basemapSaturation: -0.68,
    basemapBrightnessMin: 0.91,
    basemapBrightnessMax: 1.02,
    maskOpacity: 0.15,
    graticuleOpacity: 0.18,
    overlayOpacity: 0.94,
  },
  moisture: {
    accent: "#e38b4f",
    background: "plain_ocean",
    stateColor: "#8d7162",
    countryColor: "#7a6459",
    stateOpacity: 0.38,
    countryOpacity: 0.5,
    basemapOpacity: 0.64,
    basemapSaturation: -0.54,
    basemapBrightnessMin: 0.94,
    basemapBrightnessMax: 1.04,
    maskOpacity: 0.12,
    graticuleOpacity: 0.15,
    overlayOpacity: 0.92,
  },
  precipitation: {
    accent: "#f28c45",
    background: "plain_ocean",
    stateColor: "#8a6f61",
    countryColor: "#756256",
    stateOpacity: 0.3,
    countryOpacity: 0.42,
    basemapOpacity: 0.54,
    basemapSaturation: -0.72,
    basemapBrightnessMin: 0.9,
    basemapBrightnessMax: 1,
    maskOpacity: 0.16,
    graticuleOpacity: 0.1,
    overlayOpacity: 0.96,
  },
  clouds: {
    accent: "#db8750",
    background: "plain_ocean",
    stateColor: "#907467",
    countryColor: "#7d685d",
    stateOpacity: 0.26,
    countryOpacity: 0.4,
    basemapOpacity: 0.5,
    basemapSaturation: -0.8,
    basemapBrightnessMin: 0.94,
    basemapBrightnessMax: 1.05,
    maskOpacity: 0.14,
    graticuleOpacity: 0.12,
    overlayOpacity: 0.94,
  },
  winter: {
    accent: "#d88248",
    background: "plain_ocean",
    stateColor: "#8d7667",
    countryColor: "#79675c",
    stateOpacity: 0.34,
    countryOpacity: 0.46,
    basemapOpacity: 0.56,
    basemapSaturation: -0.74,
    basemapBrightnessMin: 0.96,
    basemapBrightnessMax: 1.08,
    maskOpacity: 0.14,
    graticuleOpacity: 0.16,
    overlayOpacity: 0.95,
  },
  native: {
    accent: "#d3854b",
    background: "plain_ocean",
    stateColor: "#8d7466",
    countryColor: "#7b685d",
    stateOpacity: 0.3,
    countryOpacity: 0.42,
    basemapOpacity: 0.58,
    basemapSaturation: -0.72,
    basemapBrightnessMin: 0.92,
    basemapBrightnessMax: 1.02,
    maskOpacity: 0.14,
    graticuleOpacity: 0.18,
    overlayOpacity: 0.94,
  },
  radar: {
    accent: "#ff8c3a",
    background: "plain_ocean",
    stateColor: "#8a6c59",
    countryColor: "#756153",
    stateOpacity: 0.28,
    countryOpacity: 0.38,
    basemapOpacity: 0.48,
    basemapSaturation: -0.76,
    basemapBrightnessMin: 0.86,
    basemapBrightnessMax: 0.98,
    maskOpacity: 0.18,
    graticuleOpacity: 0.1,
    overlayOpacity: 0.97,
  },
  ensemble: {
    accent: "#d97a44",
    background: "plain_ocean",
    stateColor: "#8d7162",
    countryColor: "#78665b",
    stateOpacity: 0.36,
    countryOpacity: 0.48,
    basemapOpacity: 0.6,
    basemapSaturation: -0.66,
    basemapBrightnessMin: 0.9,
    basemapBrightnessMax: 1.01,
    maskOpacity: 0.16,
    graticuleOpacity: 0.16,
    overlayOpacity: 0.93,
  },
};

const MOBILE_PANEL_BREAKPOINT = 820;
const OVERLAY_ALIASES = {
  pressure_surface: "surface_pressure",
};

const els = {
  controlPanel: document.querySelector(".control-panel"),
  mapStage: document.querySelector(".map-stage"),
  mapContainer: document.getElementById("map"),
  runSelect: document.getElementById("run-select"),
  mobileRunSelect: document.getElementById("mobile-run-select"),
  viewModeSelect: document.getElementById("view-mode-select"),
  mobileViewModeSelect: document.getElementById("mobile-view-mode-select"),
  memberSelect: document.getElementById("member-select"),
  mobileMemberSelect: document.getElementById("mobile-member-select"),
  compareControls: document.getElementById("compare-controls"),
  mobileCompareControls: document.getElementById("mobile-compare-controls"),
  compareMemberSelect: document.getElementById("compare-member-select"),
  mobileCompareMemberSelect: document.getElementById("mobile-compare-member-select"),
  compareOpacityRow: document.getElementById("compare-opacity-row"),
  compareOpacitySlider: document.getElementById("compare-opacity-slider"),
  compareOpacityReadout: document.getElementById("compare-opacity-readout"),
  fhrSelect: document.getElementById("fhr-select"),
  mobileFhrSelect: document.getElementById("mobile-fhr-select"),
  timelineInitLabel: document.getElementById("timeline-init-label"),
  timelineValidLabel: document.getElementById("timeline-valid-label"),
  timelineStepLabel: document.getElementById("timeline-step-label"),
  timelineTicks: document.getElementById("timeline-ticks"),
  domainGrid: document.getElementById("domain-grid"),
  mobileDomainSelect: document.getElementById("mobile-domain-select"),
  overlayGrid: document.getElementById("overlay-grid"),
  overlayGroupSelect: document.getElementById("overlay-group-select"),
  mobileOverlayGroupSelect: document.getElementById("mobile-overlay-group-select"),
  mobileOverlaySelect: document.getElementById("mobile-overlay-select"),
  backgroundGrid: document.getElementById("background-grid"),
  stateStyleSelect: document.getElementById("state-style-select"),
  countryStyleSelect: document.getElementById("country-style-select"),
  timelineSlider: document.getElementById("timeline-slider"),
  timelineReadout: document.getElementById("timeline-readout"),
  prevHourButton: document.getElementById("prev-hour-button"),
  nextHourButton: document.getElementById("next-hour-button"),
  runStatusPill: document.getElementById("run-status-pill"),
  runStatusText: document.getElementById("run-status-text"),
  domainLabel: document.getElementById("domain-label"),
  overlayMeta: document.getElementById("overlay-meta"),
  overlayFilterInput: document.getElementById("overlay-filter-input"),
  assetStatus: document.getElementById("asset-status"),
  assetPath: document.getElementById("asset-path"),
  mapTitle: document.getElementById("map-title"),
  mapSubtitle: document.getElementById("map-subtitle"),
  catalogBaseLabel: document.getElementById("catalog-base-label"),
  tileBaseLabel: document.getElementById("tile-base-label"),
  latestReadyButton: document.getElementById("latest-ready-button"),
  archiveToggle: document.getElementById("archive-toggle"),
  animateToggle: document.getElementById("animate-toggle"),
  animationSpeedSelect: document.getElementById("animation-speed-select"),
  timelineGroupPanel: document.getElementById("timeline-group-panel"),
  desktopTimelineHost: document.getElementById("desktop-timeline-host"),
  mapLegendRail: document.getElementById("map-legend-rail"),
  legendPanel: document.getElementById("legend-panel"),
  legendUnits: document.getElementById("legend-units"),
  mapLegendPanel: document.getElementById("map-legend-panel"),
  mapLegendUnits: document.getElementById("map-legend-units"),
  mobilePanelToggle: document.getElementById("mobile-panel-toggle"),
  mobileQuickPanel: document.getElementById("mobile-quick-panel"),
  quickFamilyStrip: document.getElementById("quick-family-strip"),
  mobileAdvancedToggleRow: document.querySelector(".mobile-advanced-toggle-row"),
  mobileTimelineHost: document.getElementById("mobile-timeline-host"),
  mobileLegendHost: document.getElementById("mobile-legend-host"),
  summaryRun: document.getElementById("summary-run"),
  summaryMember: document.getElementById("summary-member"),
  summaryHour: document.getElementById("summary-hour"),
  summaryValid: document.getElementById("summary-valid"),
  summaryRegion: document.getElementById("summary-region"),
  mapFamilyTag: document.getElementById("map-family-tag"),
  mapInitTag: document.getElementById("map-init-tag"),
  mapValidTag: document.getElementById("map-valid-tag"),
};

const appState = {
  domainsConfig: null,
  layersConfig: null,
  runs: [],
  productIndex: {},
  latestReadyRun: null,
  map: null,
  loaded: false,
  run: null,
  member: null,
  compareMember: null,
  fhr: "f000",
  proj: "conus",
  overlay: "temperature_2m",
  viewMode: "member",
  overlayGroup: "all",
  background: "plain_ocean",
  stateLayer: "states_brown",
  countryLayer: "countries_brown",
  archive: false,
  overlayFilter: "",
  availableFhrs: [],
  animationDelay: 900,
  animationTimeoutId: null,
  isAnimating: false,
  compareOpacity: 0.45,
  modeNotice: "",
  panelCollapsed: false,
  mobileStaticViewport: null,
  mobileStaticPayloadCache: new Map(),
  mobileStaticImageCache: new Map(),
  mobileStaticPrefetchTimeoutId: null,
  mobileStaticRenderToken: 0,
  mobileStaticPrefetchDirection: 1,
  staticAssetVersion: null,
};

init().catch((error) => {
  console.error(error);
  setAssetStatus(`Startup failed: ${error.message}`, "error");
});

async function init() {
  els.catalogBaseLabel.textContent = staticMode ? "bundled static export" : catalogBase.replace(/^https?:\/\//, "");
  els.tileBaseLabel.textContent = staticMode ? "bundled static export" : tileBase.replace(/^https?:\/\//, "");

  const [domainsConfig, layersConfig, runsPayload, productIndex, latestReadyPayload] = await Promise.all([
    fetchJson(domainsUrl()),
    fetchJson(layersUrl()),
    fetchJson(runsUrl()),
    fetchJson(productsIndexUrl()),
    fetchJson(latestReadyUrl()).catch(() => null),
  ]);

  appState.domainsConfig = domainsConfig;
  appState.layersConfig = layersConfig;
  appState.runs = runsPayload.runs || [];
  appState.productIndex = productIndex.runs || {};
  appState.latestReadyRun = latestReadyPayload?.run?.run_id || null;
  appState.staticAssetVersion =
    latestReadyPayload?.run?.run_id || runsPayload.runs?.[0]?.static_asset_version || null;

  appState.archive = parseBoolean(query.get("archive"), false);
  appState.proj = query.get("proj") || domainsConfig.defaultDomain;
  appState.background = query.get("background") || layersConfig.defaults.baselayer;
  appState.overlay = canonicalOverlayId(query.get("overlay") || layersConfig.defaults.weatherOverlay);
  appState.viewMode = query.get("mode") || layersConfig.defaults.viewMode || "member";
  appState.stateLayer = query.get("state") || layersConfig.defaults.stateLayer;
  appState.countryLayer = query.get("country") || layersConfig.defaults.countryLayer;
  appState.member = query.get("member") || layersConfig.defaults.member;
  appState.compareMember = query.get("compareMember");
  appState.fhr = normalizeFhrToken(query.get("fhr")) || "f000";
  appState.animationDelay = Number(query.get("speed")) || 900;
  const compareOpacityParam = Number(query.get("compareOpacity"));
  appState.compareOpacity = Number.isFinite(compareOpacityParam)
    ? Math.max(0.1, Math.min(0.9, compareOpacityParam / 100))
    : 0.45;
  appState.overlayFilter = query.get("overlayFilter") || "";
  appState.overlayGroup = query.get("overlayGroup") || layersConfig.defaults.overlayGroup || "all";
  appState.panelCollapsed = true;

  const defaultRun = selectDefaultRun();
  appState.run = query.get("run") || defaultRun;

  buildMap();
  bindControls();
  bindResponsiveUi();
  populateBackgroundButtons();
  populateDomainButtons();
  populateRunSelect();
  populateQuickFamilyStrip();
  renderLegend();
  updateAnimationUi();
  updatePanelUi();
  updateSummaryStrip();
  els.overlayFilterInput.value = appState.overlayFilter;
  els.overlayGroupSelect.value = appState.overlayGroup;
  els.mobileOverlayGroupSelect.value = appState.overlayGroup;
  els.viewModeSelect.value = appState.viewMode;
  els.mobileViewModeSelect.value = appState.viewMode;
  els.compareOpacitySlider.value = String(Math.round(appState.compareOpacity * 100));
  els.compareOpacityReadout.textContent = `${Math.round(appState.compareOpacity * 100)}%`;
  await syncSelectionState({ preserveUrl: false });
}

function buildMap() {
  if (mobileSafariStaticMode) {
    buildMobileStaticViewport();
    appState.loaded = true;
    return;
  }
  const domain = getDomain(appState.proj);
  const style = {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: buildBasemapSources(),
    layers: buildBasemapLayers(),
  };
  const map = new maplibregl.Map({
    container: "map",
    style,
    center: domain.viewport.center,
    zoom: domain.viewport.zoom,
    hash: false,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.on("load", () => {
    appState.loaded = true;
    addReferenceSources(map);
    updateMapPresentation();
    refreshOverlay().catch((error) => {
      console.error(error);
      setAssetStatus(`Overlay refresh failed: ${error.message}`, "error");
    });
    window.requestAnimationFrame(() => map.resize());
  });
  appState.map = map;
}

function buildMobileStaticViewport() {
  const surface = document.createElement("div");
  surface.className = "ios-static-map";
  surface.innerHTML = `
    <div class="ios-static-backdrop"></div>
    <div class="ios-static-vignette"></div>
    <div class="ios-static-track">
      <img class="ios-static-image ios-static-image-primary" alt="" />
      <img class="ios-static-image ios-static-image-compare hidden" alt="" />
      <div class="ios-static-focus-ring"></div>
    </div>
    <div class="ios-static-topbar">
      <div class="ios-static-kicker">HRRRCast Mobile</div>
      <div class="ios-static-title"></div>
      <div class="ios-static-subtitle"></div>
    </div>
    <div class="ios-static-bottom">
      <div class="ios-static-legend">
        <div class="ios-static-legend-head">
          <span class="ios-static-legend-name">Legend</span>
          <span class="ios-static-legend-units"></span>
        </div>
        <div class="ios-static-legend-scale"></div>
        <div class="ios-static-legend-labels"></div>
      </div>
      <div class="ios-static-badge">Safari static mode</div>
    </div>
  `;
  els.mapContainer.replaceChildren(surface);
  appState.mobileStaticViewport = {
    surface,
    track: surface.querySelector(".ios-static-track"),
    primaryImage: surface.querySelector(".ios-static-image-primary"),
    compareImage: surface.querySelector(".ios-static-image-compare"),
    focusRing: surface.querySelector(".ios-static-focus-ring"),
    title: surface.querySelector(".ios-static-title"),
    subtitle: surface.querySelector(".ios-static-subtitle"),
    legendScale: surface.querySelector(".ios-static-legend-scale"),
    legendLabels: surface.querySelector(".ios-static-legend-labels"),
    legendUnits: surface.querySelector(".ios-static-legend-units"),
    legendName: surface.querySelector(".ios-static-legend-name"),
    badge: surface.querySelector(".ios-static-badge"),
  };
}

function buildBasemapSources() {
  const sources = {};
  for (const [id, config] of Object.entries(backgroundSources)) {
    sources[`basemap-${id}`] = {
      type: "raster",
      tiles: config.tiles,
      tileSize: config.tileSize,
      attribution: config.attribution,
    };
  }
  return sources;
}

function buildBasemapLayers() {
  return Object.keys(backgroundSources).map((id) => ({
    id: `basemap-${id}`,
    type: "raster",
    source: `basemap-${id}`,
    layout: {
      visibility: id === appState.background ? "visible" : "none",
    },
    paint: {
      "raster-opacity": 1,
      "raster-saturation": id === "satellite" ? 0.05 : 0,
    },
  }));
}

function addReferenceSources(map) {
  map.addSource("graticule-source", {
    type: "geojson",
    data: buildGraticuleGeoJson(),
  });
  map.addSource("states-source", {
    type: "geojson",
    data: remoteGeoJson.states,
  });
  map.addSource("countries-source", {
    type: "geojson",
    data: remoteGeoJson.countries,
  });
  map.addSource("domain-focus-source", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });
  map.addLayer({
    id: "graticule-layer",
    type: "line",
    source: "graticule-source",
    paint: {
      "line-color": "#8e7b70",
      "line-width": 1,
      "line-opacity": 0.14,
      "line-dasharray": [2, 4],
    },
  });
  map.addLayer({
    id: "domain-mask-layer",
    type: "fill",
    source: "domain-focus-source",
    layout: {
      visibility: "none",
    },
    paint: {
      "fill-color": "#081019",
      "fill-opacity": 0.12,
    },
  });
  map.addLayer({
    id: "domain-fill-layer",
    type: "fill",
    source: "states-source",
    layout: {
      visibility: "none",
    },
    filter: ["==", ["get", "name"], ""],
    paint: {
      "fill-color": "#f28c45",
      "fill-opacity": 0.08,
    },
  });
  map.addLayer({
    id: "domain-outline-layer",
    type: "line",
    source: "states-source",
    layout: {
      visibility: "none",
    },
    filter: ["==", ["get", "name"], ""],
    paint: {
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        1.6,
        5,
        2.2,
        7,
        3,
      ],
      "line-color": "#f28c45",
      "line-opacity": 0.95,
    },
  });
  map.addLayer({
    id: "countries-layer",
    type: "line",
    source: "countries-source",
    paint: {
      "line-width": 1.2,
      "line-color": "#8e6344",
      "line-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "states-layer",
    type: "line",
    source: "states-source",
    paint: {
      "line-width": 0.9,
      "line-color": "#8e6344",
      "line-opacity": 0.9,
    },
  });
}

function buildGraticuleGeoJson() {
  const features = [];
  for (let lon = -140; lon <= -60; lon += 10) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [lon, 15],
          [lon, 60],
        ],
      },
      properties: { kind: "meridian", value: lon },
    });
  }
  for (let lat = 20; lat <= 55; lat += 5) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [-140, lat],
          [-60, lat],
        ],
      },
      properties: { kind: "parallel", value: lat },
    });
  }
  return {
    type: "FeatureCollection",
    features,
  };
}

function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function bindControls() {
  els.runSelect.addEventListener("change", async (event) => {
    appState.run = event.target.value;
    await syncSelectionState();
  });
  els.mobileRunSelect.addEventListener("change", async (event) => {
    appState.run = event.target.value;
    await syncSelectionState();
  });
  els.viewModeSelect.addEventListener("change", async (event) => {
    appState.viewMode = event.target.value;
    await syncSelectionState();
  });
  els.mobileViewModeSelect.addEventListener("change", async (event) => {
    appState.viewMode = event.target.value;
    await syncSelectionState();
  });
  els.memberSelect.addEventListener("change", async (event) => {
    appState.member = event.target.value;
    await syncSelectionState();
  });
  els.mobileMemberSelect.addEventListener("change", async (event) => {
    appState.member = event.target.value;
    await syncSelectionState();
  });
  els.compareMemberSelect.addEventListener("change", async (event) => {
    appState.compareMember = event.target.value;
    await refreshOverlay();
    updateUrl();
  });
  els.mobileCompareMemberSelect.addEventListener("change", async (event) => {
    appState.compareMember = event.target.value;
    await refreshOverlay();
    updateUrl();
  });
  els.compareOpacitySlider.addEventListener("input", () => {
    appState.compareOpacity = Number(els.compareOpacitySlider.value) / 100;
    els.compareOpacityReadout.textContent = `${Math.round(appState.compareOpacity * 100)}%`;
    updateCompareLayerOpacity();
    updateUrl();
  });
  els.fhrSelect.addEventListener("change", async (event) => {
    appState.fhr = normalizeFhrToken(event.target.value);
    await syncSelectionState();
  });
  els.mobileFhrSelect.addEventListener("change", async (event) => {
    appState.fhr = normalizeFhrToken(event.target.value);
    await syncSelectionState();
  });
  els.stateStyleSelect.addEventListener("change", (event) => {
    appState.stateLayer = event.target.value;
    updateBoundaryStyles();
    updateUrl();
  });
  els.countryStyleSelect.addEventListener("change", (event) => {
    appState.countryLayer = event.target.value;
    updateBoundaryStyles();
    updateUrl();
  });
  els.timelineSlider.addEventListener("input", async (event) => {
    const index = Number(event.target.value);
    const nextFhr = appState.availableFhrs[index] || appState.fhr;
    if (mobileSafariStaticMode) {
      await previewForecastHour(nextFhr);
      return;
    }
    appState.fhr = nextFhr;
    els.timelineReadout.textContent = appState.fhr.toUpperCase();
    await syncSelectionState();
  });
  els.overlayFilterInput.addEventListener("input", () => {
    appState.overlayFilter = els.overlayFilterInput.value.trim();
    populateOverlayButtons(currentBuiltOverlayMap());
    updateUrl();
  });
  els.overlayGroupSelect.addEventListener("change", () => {
    appState.overlayGroup = els.overlayGroupSelect.value;
    populateOverlayButtons(currentBuiltOverlayMap());
    populateQuickFamilyStrip();
    updateUrl();
  });
  els.mobileOverlayGroupSelect.addEventListener("change", () => {
    appState.overlayGroup = els.mobileOverlayGroupSelect.value;
    populateOverlayButtons(currentBuiltOverlayMap());
    populateQuickFamilyStrip();
    updateUrl();
  });
  els.mobileOverlaySelect.addEventListener("change", async (event) => {
    appState.overlay = event.target.value;
    populateOverlayButtons(currentBuiltOverlayMap());
    await refreshOverlay();
    updateUrl();
  });
  els.mobileDomainSelect.addEventListener("change", async (event) => {
    appState.proj = event.target.value;
    moveToDomain();
    populateDomainButtons();
    await refreshOverlay();
    updateUrl();
  });
  els.latestReadyButton.addEventListener("click", async () => {
    if (!appState.latestReadyRun) {
      return;
    }
    appState.archive = false;
    appState.run = appState.latestReadyRun;
    populateRunSelect();
    await syncSelectionState();
  });
  els.archiveToggle.addEventListener("change", async (event) => {
    appState.archive = event.target.checked;
    populateRunSelect();
    if (!getVisibleRuns().some((run) => run.run_id === appState.run)) {
      appState.run = selectDefaultRun();
    }
    await syncSelectionState();
  });
  els.animateToggle.addEventListener("click", () => {
    if (appState.isAnimating) {
      stopAnimation();
      return;
    }
    startAnimation();
  });
  els.prevHourButton.addEventListener("click", async () => {
    await stepForecastHour(-1);
  });
  els.nextHourButton.addEventListener("click", async () => {
    await stepForecastHour(1);
  });
  els.animationSpeedSelect.addEventListener("change", () => {
    appState.animationDelay = Number(els.animationSpeedSelect.value);
    if (appState.isAnimating) {
      refreshAnimationLoop();
    }
    updateUrl();
  });
}

function bindResponsiveUi() {
  relocateMobilePanels();
  els.mobilePanelToggle.addEventListener("click", () => {
    appState.panelCollapsed = !appState.panelCollapsed;
    updatePanelUi();
    requestMapResize();
  });
  window.addEventListener("resize", () => {
    relocateMobilePanels();
    updatePanelUi();
    requestMapResize();
  });
}

function updatePanelUi() {
  els.mobilePanelToggle.textContent = appState.panelCollapsed ? "Advanced" : "Hide";
  els.mobilePanelToggle.setAttribute("aria-expanded", String(!appState.panelCollapsed));
  els.controlPanel.classList.toggle("collapsed", appState.panelCollapsed);
  document.querySelectorAll(".advanced-panel").forEach((panel) => {
    panel.classList.toggle("hidden", appState.panelCollapsed);
  });
  if (!appState.panelCollapsed) {
    populateOverlayButtons(currentBuiltOverlayMap());
  }
}

function isMobileViewport() {
  return window.innerWidth <= MOBILE_PANEL_BREAKPOINT;
}

function relocateMobilePanels() {
  if (!els.timelineGroupPanel || !els.mapLegendRail) {
    return;
  }
  if (isMobileViewport()) {
    if (els.timelineGroupPanel.parentElement !== els.mobileTimelineHost) {
      els.mobileTimelineHost.appendChild(els.timelineGroupPanel);
    }
    if (els.mapLegendRail.parentElement !== els.mobileLegendHost) {
      els.mobileLegendHost.appendChild(els.mapLegendRail);
    }
    return;
  }
  if (els.timelineGroupPanel.parentElement !== els.desktopTimelineHost) {
    els.desktopTimelineHost.appendChild(els.timelineGroupPanel);
  }
  const mapLowerRail = els.desktopTimelineHost.parentElement;
  if (els.mapLegendRail.parentElement !== mapLowerRail) {
    mapLowerRail.insertBefore(els.mapLegendRail, els.desktopTimelineHost);
  }
  const firstAdvancedPanel = els.controlPanel.querySelector(".advanced-panel");
  if (els.mobileAdvancedToggleRow.parentElement !== els.controlPanel) {
    els.controlPanel.insertBefore(els.mobileAdvancedToggleRow, firstAdvancedPanel);
  }
  if (els.mobileQuickPanel.parentElement !== els.controlPanel) {
    els.controlPanel.insertBefore(els.mobileQuickPanel, els.mobileAdvancedToggleRow);
  }
}

function getVisibleRuns() {
  const readyRuns = appState.runs.filter((run) => run.status === "ready");
  if (!appState.archive && readyRuns.length > 0) {
    return readyRuns;
  }
  return appState.runs;
}

function selectDefaultRun() {
  const visibleRuns = getVisibleRuns();
  if (!appState.archive && appState.latestReadyRun) {
    const latestReady = visibleRuns.find((run) => run.run_id === appState.latestReadyRun);
    if (latestReady) {
      return latestReady.run_id;
    }
  }

  const builtRuns = Object.keys(appState.productIndex).sort();
  const visibleBuiltRuns = builtRuns.filter((runId) => visibleRuns.some((run) => run.run_id === runId));
  if (visibleBuiltRuns.length > 0) {
    return visibleBuiltRuns[visibleBuiltRuns.length - 1];
  }
  if (visibleRuns.length > 0) {
    return visibleRuns[visibleRuns.length - 1].run_id;
  }
  return appState.runs.length > 0 ? appState.runs[appState.runs.length - 1].run_id : null;
}

function populateRunSelect() {
  const fragment = document.createDocumentFragment();
  const mobileFragment = document.createDocumentFragment();
  for (const run of getVisibleRuns()) {
    const option = document.createElement("option");
    option.value = run.run_id;
    option.textContent = `${run.run_id} | ${run.status}`;
    fragment.appendChild(option);
    mobileFragment.appendChild(option.cloneNode(true));
  }
  els.runSelect.replaceChildren(fragment);
  els.mobileRunSelect.replaceChildren(mobileFragment);
  els.archiveToggle.checked = appState.archive;
  els.latestReadyButton.disabled = !appState.latestReadyRun;
}

function populateBackgroundButtons() {
  const fragment = document.createDocumentFragment();
  for (const [id, config] of Object.entries(backgroundSources)) {
    fragment.appendChild(
      makeChip(config.label, id === appState.background, () => {
        appState.background = id;
        updateBasemapVisibility();
        populateBackgroundButtons();
        updateUrl();
      })
    );
  }
  els.backgroundGrid.replaceChildren(fragment);
}

function populateDomainButtons() {
  const fragment = document.createDocumentFragment();
  for (const domain of appState.domainsConfig.domains) {
    fragment.appendChild(
      makeChip(domain.label, domain.id === appState.proj, async () => {
        appState.proj = domain.id;
        moveToDomain();
        populateDomainButtons();
        await refreshOverlay();
        updateUrl();
      })
    );
  }
  els.domainGrid.replaceChildren(fragment);
  populateSelect(
    els.mobileDomainSelect,
    appState.domainsConfig.domains.map((domain) => domain.id),
    appState.proj,
    (value) => getDomain(value)?.label || value
  );
}

function populateQuickFamilyStrip() {
  if (!els.quickFamilyStrip) {
    return;
  }
  const families = [
    ["featured", "Featured"],
    ["precipitation", "Precip"],
    ["severe", "Severe"],
    ["surface", "Surface"],
    ["upper_air", "Upper Air"],
    ["wind", "Wind"],
    ["clouds", "Clouds"],
    ["ensemble", "Ensemble"],
  ];
  const fragment = document.createDocumentFragment();
  for (const [value, label] of families) {
    fragment.appendChild(
      makeChip(label, appState.overlayGroup === value, () => {
        appState.overlayGroup = value;
        els.overlayGroupSelect.value = value;
        els.mobileOverlayGroupSelect.value = value;
        populateQuickFamilyStrip();
        populateOverlayButtons(currentBuiltOverlayMap());
        updateUrl();
      })
    );
  }
  els.quickFamilyStrip.replaceChildren(fragment);
}

async function syncSelectionState({ preserveUrl = true } = {}) {
  const visibleRuns = getVisibleRuns();
  const runRecord = visibleRuns.find((run) => run.run_id === appState.run) || visibleRuns[0] || appState.runs[0];
  if (!runRecord) {
    throw new Error("No runs are available from the catalog API.");
  }
  appState.overlay = canonicalOverlayId(appState.overlay);
  appState.run = runRecord.run_id;
  els.runSelect.value = appState.run;
  els.mobileRunSelect.value = appState.run;
  setRunStatus(runRecord);

  const builtMemberIndex = appState.productIndex[appState.run]?.members || {};
  const memberOptions = Object.keys(builtMemberIndex).sort();
  const hasEnsembleProducts = memberOptions.includes("ens");
  const standardMemberOptions = memberOptions.filter((member) => member !== "ens");
  const fallbackMembers = runRecord.members || [];
  const effectiveMemberOptions = standardMemberOptions.length > 0 ? standardMemberOptions : fallbackMembers;
  appState.modeNotice = "";
  if ((appState.viewMode === "member" || appState.viewMode === "compare") && standardMemberOptions.length === 0 && hasEnsembleProducts) {
    appState.viewMode = "ensemble";
    appState.modeNotice = "Only ensemble products are published for this hosted dataset, so the viewer switched to ensemble mode.";
  }
  if (appState.viewMode === "ensemble" && !hasEnsembleProducts) {
    appState.viewMode = "member";
    if (appState.overlayGroup === "ensemble") {
      appState.overlayGroup = "curated";
      els.overlayGroupSelect.value = appState.overlayGroup;
    }
    appState.modeNotice = "Ensemble products are not built for this run, so the viewer fell back to member mode.";
  }
  if (appState.viewMode === "compare" && effectiveMemberOptions.length < 2) {
    appState.viewMode = hasEnsembleProducts ? "ensemble" : "member";
    appState.modeNotice = "Compare mode needs at least two processed members, so the viewer switched to a supported mode.";
  }
  if (appState.viewMode === "ensemble") {
    appState.member = "ens";
    populateSelect(els.memberSelect, ["ens"], "ens", () => "Ensemble");
    populateSelect(els.mobileMemberSelect, ["ens"], "ens", () => "Ensemble");
    els.memberSelect.disabled = true;
    els.mobileMemberSelect.disabled = true;
  } else {
    if (!effectiveMemberOptions.includes(appState.member)) {
      appState.member = effectiveMemberOptions[0] || runRecord.members?.[0] || "m00";
    }
    populateSelect(els.memberSelect, effectiveMemberOptions, appState.member);
    populateSelect(els.mobileMemberSelect, effectiveMemberOptions, appState.member);
    els.memberSelect.disabled = false;
    els.mobileMemberSelect.disabled = false;
  }
  syncCompareControls(effectiveMemberOptions);
  els.viewModeSelect.value = appState.viewMode;
  els.mobileViewModeSelect.value = appState.viewMode;

  const activeMemberKey = currentPrimaryMember();
  const fhIndex = builtMemberIndex[activeMemberKey]?.forecast_hours || {};
  const fhOptions = Object.keys(fhIndex).sort();
  const fallbackFhrs =
    runRecord.max_forecast_hour != null
      ? Array.from({ length: runRecord.max_forecast_hour + 1 }, (_, value) =>
          normalizeFhrToken(String(value))
        )
      : ["f000"];
  const effectiveFhrs = fhOptions.length > 0 ? fhOptions : fallbackFhrs;
  appState.availableFhrs = effectiveFhrs;
  if (!effectiveFhrs.includes(appState.fhr)) {
    appState.fhr = effectiveFhrs[0];
  }
  populateSelect(els.fhrSelect, effectiveFhrs, appState.fhr, (value) => value.toUpperCase());
  populateSelect(els.mobileFhrSelect, effectiveFhrs, appState.fhr, (value) => value.toUpperCase());
  syncForecastHourControls();

  populateOverlayButtons(fhIndex[appState.fhr]?.overlays || {});
  updateMapPresentation();
  moveToDomain();
  if (effectiveFhrs.length < 2) {
    stopAnimation();
  } else if (appState.isAnimating) {
    refreshAnimationLoop();
  }
  if (appState.loaded) {
    await refreshOverlay();
  }
  scheduleMobileStaticPrefetch();
  if (preserveUrl) {
    updateUrl();
  }
}

function syncCompareControls(memberOptions) {
  const isCompareMode = appState.viewMode === "compare";
  els.compareControls.classList.toggle("hidden", !isCompareMode);
  els.mobileCompareControls.classList.toggle("hidden", !isCompareMode);
  els.compareOpacityRow.classList.toggle("hidden", !isCompareMode);
  if (!isCompareMode) {
    return;
  }
  const compareOptions = memberOptions.filter((member) => member !== appState.member);
  if (!compareOptions.includes(appState.compareMember)) {
    appState.compareMember = compareOptions[0] || appState.member;
  }
  populateSelect(els.compareMemberSelect, compareOptions, appState.compareMember);
  populateSelect(els.mobileCompareMemberSelect, compareOptions, appState.compareMember);
  els.compareOpacitySlider.value = String(Math.round(appState.compareOpacity * 100));
  els.compareOpacityReadout.textContent = `${Math.round(appState.compareOpacity * 100)}%`;
}

function populateOverlayButtons(builtOverlayMap) {
  const configured = appState.layersConfig.weatherOverlays;
  const builtOverlays = Array.from(new Set(Object.keys(builtOverlayMap).map((overlayId) => canonicalOverlayId(overlayId))));
  if (!builtOverlays.includes(appState.overlay)) {
    const firstBuiltConfigured = configured.find((overlay) => builtOverlays.includes(overlay.id));
    appState.overlay = firstBuiltConfigured?.id || builtOverlays[0] || configured[0]?.id || "temperature_2m";
  }
  const fragment = document.createDocumentFragment();
  const filteredConfigured = configured.filter((overlay) => matchesOverlayFilter(overlay, appState.overlayFilter));
  const visibleConfigured = sortVisibleOverlays(filteredConfigured.length > 0 ? filteredConfigured : configured, builtOverlays);
  const visibleOverlayIds = visibleConfigured.map((overlay) => overlay.id);
  if (!visibleOverlayIds.includes(appState.overlay)) {
    const firstVisibleBuilt = visibleConfigured.find((overlay) => builtOverlays.includes(overlay.id));
    appState.overlay = firstVisibleBuilt?.id || visibleConfigured[0]?.id || appState.overlay;
  }
  for (const overlay of visibleConfigured) {
    const isBuilt = builtOverlays.includes(overlay.id);
    fragment.appendChild(
      makeChip(
        overlay.label,
        overlay.id === appState.overlay,
        async () => {
          if (!isBuilt) {
            return;
          }
          appState.overlay = overlay.id;
          populateOverlayButtons(builtOverlayMap);
          updateSummaryStrip();
          await refreshOverlay();
          updateUrl();
        },
        !isBuilt
      )
    );
  }
  if (!appState.panelCollapsed) {
    els.overlayGrid.replaceChildren(fragment);
  } else if (els.overlayGrid.childElementCount > 0) {
    els.overlayGrid.replaceChildren();
  }
  populateSelect(
    els.mobileOverlaySelect,
    visibleConfigured.map((overlay) => overlay.id),
    appState.overlay,
    (value) => {
      const overlay = visibleConfigured.find((item) => item.id === value);
      if (!overlay) {
        return value;
      }
      const builtNote = builtOverlays.includes(value) ? "" : " | unavailable";
      return `${overlay.label}${builtNote}`;
    }
  );
  Array.from(els.mobileOverlaySelect.options).forEach((option) => {
    option.disabled = !builtOverlays.includes(option.value);
  });
  els.overlayGroupSelect.value = appState.overlayGroup;
  els.mobileOverlayGroupSelect.value = appState.overlayGroup;
  const domainCount = builtOverlayMap[appState.overlay]?.length || 0;
  const visibleNativeCount = visibleConfigured.filter((overlay) => overlay.native).length;
  const visibleEnsembleCount = visibleConfigured.filter((overlay) => overlay.group === "ensemble").length;
  const visibleCuratedCount = visibleConfigured.length - visibleNativeCount - visibleEnsembleCount;
  els.overlayMeta.textContent = domainCount
    ? `${domainCount} processed domains | ${visibleCuratedCount} curated | ${visibleEnsembleCount} ensemble | ${visibleNativeCount} native`
    : `${visibleConfigured.length} visible overlays`;
  renderLegend();
}

async function refreshOverlay() {
  if (mobileSafariStaticMode) {
    await refreshMobileStaticOverlay();
    return;
  }
  const map = appState.map;
  if (!map || !appState.loaded) {
    return;
  }

  const domainId = appState.proj;
  const forecastHourNumber = parseInt(appState.fhr.slice(1), 10);
  const primaryMember = currentPrimaryMember();
  removeOverlayLayers(map);
  try {
    const metadata = await fetchJson(productMetadataUrl(appState.run, primaryMember, appState.overlay, appState.fhr, domainId));
    addPrimaryOverlay(map, metadata, primaryMember, domainId);

    let subtitleMode = primaryMember;
    let compareNote = "";
    let assetPathText = metadata.display_path || metadata.netcdf_path;
    if (appState.viewMode === "compare" && appState.compareMember) {
      const compareMetadata = await fetchJson(
        productMetadataUrl(appState.run, appState.compareMember, appState.overlay, appState.fhr, domainId)
      );
      addCompareOverlay(map, compareMetadata, domainId);
      subtitleMode = `${appState.member} vs ${appState.compareMember}`;
      compareNote = ` Compare layer opacity ${Math.round(appState.compareOpacity * 100)}%.`;
      assetPathText = `${metadata.display_path || metadata.netcdf_path} | compare ${
        compareMetadata.display_path || compareMetadata.netcdf_path
      }`;
    } else if (appState.viewMode === "ensemble") {
      subtitleMode = "ensemble";
      compareNote = metadata.notes ? ` ${metadata.notes}` : "";
    }
    els.assetPath.textContent = assetPathText;
    els.mapTitle.textContent = `${labelForOverlay(appState.overlay)} | ${appState.proj.toUpperCase()}`;
    els.mapSubtitle.textContent = `${appState.run} | ${appState.member} | f${String(
      forecastHourNumber
    ).padStart(3, "0")} | ${subtitleMode} | ${metadata.long_name || metadata.variable_name}`;
    setAssetStatus(
      `${buildAssetSummary(metadata, appState.overlay, domainId)}${compareNote}`,
      "ok"
    );
    updateSummaryStrip();
    renderLegend(metadata);
  } catch (error) {
    els.assetPath.textContent = "No processed asset found for this combination";
    els.mapTitle.textContent = `${labelForOverlay(appState.overlay)} | ${appState.proj.toUpperCase()}`;
    els.mapSubtitle.textContent = `${appState.run} | ${currentPrimaryMember()} | ${appState.fhr.toUpperCase()}`;
    setAssetStatus(
      `No processed tile asset exists for ${appState.overlay} / ${domainId} / ${currentPrimaryMember()} / ${appState.fhr.toUpperCase()}.`,
      "warning"
    );
    updateSummaryStrip();
    renderLegend();
  }
}

async function refreshMobileStaticOverlay() {
  if (!appState.loaded || !appState.mobileStaticViewport) {
    return;
  }

  const renderToken = ++appState.mobileStaticRenderToken;
  const domainId = appState.proj;
  const primaryMember = currentPrimaryMember();

  try {
    const primaryPayload = await fetchPreferredMetadata(primaryMember, domainId, appState.fhr);
    let comparePayload = null;

    if (appState.viewMode === "compare" && appState.compareMember) {
      comparePayload = await fetchPreferredMetadata(appState.compareMember, domainId, appState.fhr);
    }

    if (renderToken !== appState.mobileStaticRenderToken) {
      return;
    }
    applyMobileStaticOverlay(primaryPayload, comparePayload);
    scheduleMobileStaticPrefetch();
  } catch (error) {
    els.assetPath.textContent = "No processed asset found for this combination";
    els.mapTitle.textContent = `${labelForOverlay(appState.overlay)} | ${appState.proj.toUpperCase()}`;
    els.mapSubtitle.textContent = `${appState.run} | ${currentPrimaryMember()} | ${appState.fhr.toUpperCase()}`;
    setAssetStatus(
      `No processed preview exists for ${appState.overlay} / ${domainId} / ${currentPrimaryMember()} / ${appState.fhr.toUpperCase()}.`,
      "warning"
    );
    clearMobileStaticViewport();
    updateSummaryStrip();
    renderLegend();
  }
}

function addPrimaryOverlay(map, metadata, primaryMember, domainId) {
  const theme = currentFamilyTheme();
  if (staticMode) {
    map.addSource("overlay-primary", {
      type: "image",
      url: staticPreviewUrl(metadata, primaryMember, domainId),
      coordinates: imageCoordinatesForBbox(metadata.bbox),
    });
    map.addLayer({
      id: "overlay-primary-layer",
      type: "raster",
      source: "overlay-primary",
      paint: {
        "raster-opacity": appState.viewMode === "compare" ? Math.max(0.7, theme.overlayOpacity - 0.16) : theme.overlayOpacity,
        "raster-fade-duration": 0,
      },
    });
    return;
  }
  map.addSource("overlay-primary", {
    type: "raster",
    tiles: [tileTemplateUrl(appState.run, primaryMember, appState.overlay, appState.fhr, domainId)],
    tileSize: 256,
    bounds: metadata.bbox,
  });
  map.addLayer({
    id: "overlay-primary-layer",
    type: "raster",
    source: "overlay-primary",
    paint: {
      "raster-opacity": appState.viewMode === "compare" ? Math.max(0.7, theme.overlayOpacity - 0.16) : theme.overlayOpacity,
      "raster-fade-duration": 0,
    },
  });
}

function applyMobileStaticOverlay(primaryPayload, comparePayload = null) {
  const domainId = appState.proj;
  const forecastHourNumber = parseInt(appState.fhr.slice(1), 10);
  let subtitleMode = currentPrimaryMember();
  let compareNote = "";
  let assetPathText = primaryPayload.metadata.display_path || primaryPayload.metadata.netcdf_path;
  if (appState.viewMode === "compare" && comparePayload) {
    subtitleMode = `${appState.member} vs ${appState.compareMember}`;
    compareNote = ` Compare layer opacity ${Math.round(appState.compareOpacity * 100)}%.`;
    assetPathText = `${assetPathText} | compare ${
      comparePayload.metadata.display_path || comparePayload.metadata.netcdf_path
    }`;
  } else if (appState.viewMode === "ensemble") {
    subtitleMode = "ensemble";
    compareNote = primaryPayload.metadata.notes ? ` ${primaryPayload.metadata.notes}` : "";
  }
  renderMobileStaticViewport(primaryPayload, comparePayload);
  els.assetPath.textContent = assetPathText;
  els.mapTitle.textContent = `${labelForOverlay(appState.overlay)} | ${appState.proj.toUpperCase()}`;
  els.mapSubtitle.textContent = `${appState.run} | ${appState.member} | f${String(forecastHourNumber).padStart(
    3,
    "0"
  )} | ${subtitleMode} | ${primaryPayload.metadata.long_name || primaryPayload.metadata.variable_name}`;
  setAssetStatus(`${buildAssetSummary(primaryPayload.metadata, appState.overlay, domainId)}${compareNote}`, "ok");
  updateSummaryStrip();
  renderLegend(primaryPayload.metadata);
}

async function fetchPreferredMetadata(member, domainId, fhrToken = appState.fhr) {
  const cacheKey = mobileStaticCacheKey(member, domainId, fhrToken);
  const cached = appState.mobileStaticPayloadCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const preferredDomains =
    mobileSafariStaticMode && domainId !== "conus" ? ["conus", domainId] : [domainId];
  const pending = (async () => {
    let lastError = null;
    for (const candidateDomain of preferredDomains) {
      try {
        const metadata = await fetchJson(
          productMetadataUrl(appState.run, member, appState.overlay, fhrToken, candidateDomain)
        );
        const previewUrl = staticPreviewUrl(metadata, member, candidateDomain);
        await preloadStaticFrame(previewUrl);
        return {
          metadata,
          domainId: candidateDomain,
          requestedDomainId: domainId,
          previewUrl,
          fhrToken,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`No preview metadata found for ${member} / ${domainId}`);
  })().catch((error) => {
    appState.mobileStaticPayloadCache.delete(cacheKey);
    throw error;
  });
  appState.mobileStaticPayloadCache.set(cacheKey, pending);
  trimMobileStaticCache(appState.mobileStaticPayloadCache, 72);
  return pending;
}

function renderMobileStaticViewport(primaryPayload, comparePayload = null) {
  const viewport = appState.mobileStaticViewport;
  if (!viewport) {
    return;
  }

  const width = viewport.surface.clientWidth;
  const height = viewport.surface.clientHeight;
  if (!width || !height) {
    window.requestAnimationFrame(() => renderMobileStaticViewport(primaryPayload, comparePayload));
    return;
  }

  const sourceBbox = primaryPayload.metadata?.bbox || getDomain("conus")?.viewport?.bbox;
  const focusBbox = getDomain(appState.proj)?.viewport?.bbox || sourceBbox;
  if (!sourceBbox || !focusBbox) {
    return;
  }

  const transform = computeStaticViewportTransform(sourceBbox, focusBbox, width, height, appState.proj);
  applyStaticViewportImage(
    viewport.primaryImage,
    primaryPayload.previewUrl,
    transform,
    appState.viewMode === "compare" ? 0.92 : 1
  );

  if (comparePayload) {
    viewport.compareImage.classList.remove("hidden");
    applyStaticViewportImage(viewport.compareImage, comparePayload.previewUrl, transform, appState.compareOpacity);
  } else {
    viewport.compareImage.classList.add("hidden");
    viewport.compareImage.removeAttribute("src");
  }

  renderMobileStaticFocus(viewport, sourceBbox, focusBbox, transform);
  renderMobileStaticLegend(primaryPayload.metadata);
  const memberLabel =
    appState.viewMode === "ensemble"
      ? "Ensemble"
      : appState.viewMode === "compare"
      ? `${appState.member} vs ${appState.compareMember}`
      : appState.member;
  viewport.title.textContent = `${labelForOverlay(appState.overlay)} | ${labelForDomain(appState.proj)}`;
  viewport.subtitle.textContent = `${formatRunLabel(appState.run)} init | ${formatValidTimeLabel(
    appState.run,
    appState.fhr
  )} valid | ${memberLabel}`;
  viewport.badge.textContent =
    appState.viewMode === "compare"
      ? `Compare ${Math.round(appState.compareOpacity * 100)}%`
      : `${labelForDomain(appState.proj)} view`;
}

function applyStaticViewportImage(imageEl, url, transform, opacity) {
  imageEl.src = url;
  imageEl.style.width = `${transform.width}px`;
  imageEl.style.height = `${transform.height}px`;
  imageEl.style.transform = `translate(${transform.translateX}px, ${transform.translateY}px)`;
  imageEl.style.opacity = String(opacity);
}

function clearMobileStaticViewport() {
  const viewport = appState.mobileStaticViewport;
  if (!viewport) {
    return;
  }
  viewport.primaryImage.removeAttribute("src");
  viewport.compareImage.removeAttribute("src");
  viewport.compareImage.classList.add("hidden");
  viewport.focusRing.style.cssText = "";
  viewport.title.textContent = "";
  viewport.subtitle.textContent = "";
  viewport.legendScale.replaceChildren();
  viewport.legendLabels.replaceChildren();
  viewport.legendUnits.textContent = "";
}

function computeStaticViewportTransform(sourceBbox, focusBbox, containerWidth, containerHeight, domainId) {
  const sourceWidth = sourceBbox[2] - sourceBbox[0];
  const sourceHeight = sourceBbox[3] - sourceBbox[1];
  const focusWidth = Math.max(0.5, focusBbox[2] - focusBbox[0]);
  const focusHeight = Math.max(0.5, focusBbox[3] - focusBbox[1]);
  const padding = staticViewportPadding(domainId);
  const paddedFocusWidth = focusWidth * padding.x;
  const paddedFocusHeight = focusHeight * padding.y;
  const sourceScale = Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const focusScale = Math.min(
    containerWidth / (sourceScale * paddedFocusWidth),
    containerHeight / (sourceScale * paddedFocusHeight)
  );
  const paddedScale = focusScale * padding.zoom;
  const renderedWidth = sourceWidth * sourceScale * paddedScale;
  const renderedHeight = sourceHeight * sourceScale * paddedScale;
  const focusCenterX = (focusBbox[0] + focusBbox[2]) / 2 + padding.offsetX * focusWidth;
  const focusCenterY = (focusBbox[1] + focusBbox[3]) / 2 + padding.offsetY * focusHeight;
  const centerXPx = ((focusCenterX - sourceBbox[0]) / sourceWidth) * renderedWidth;
  const centerYPx = ((sourceBbox[3] - focusCenterY) / sourceHeight) * renderedHeight;

  return {
    width: renderedWidth,
    height: renderedHeight,
    translateX: containerWidth / 2 - centerXPx,
    translateY: containerHeight / 2 - centerYPx,
  };
}

function staticViewportPadding(domainId) {
  const presets = {
    conus: { x: 1.02, y: 1.06, zoom: 0.98, offsetX: 0, offsetY: 0.01 },
    southeast: { x: 1.12, y: 1.16, zoom: 0.98, offsetX: -0.02, offsetY: 0.02 },
    northeast: { x: 1.14, y: 1.18, zoom: 0.97, offsetX: -0.01, offsetY: 0.01 },
    south_central: { x: 1.12, y: 1.14, zoom: 0.98, offsetX: 0, offsetY: 0.01 },
    northwest: { x: 1.14, y: 1.14, zoom: 0.98, offsetX: -0.01, offsetY: 0 },
    southwest: { x: 1.14, y: 1.16, zoom: 0.98, offsetX: 0.01, offsetY: 0.01 },
    carolinas: { x: 1.24, y: 1.3, zoom: 0.96, offsetX: -0.02, offsetY: 0.01 },
  };
  return presets[domainId] || { x: 1.12, y: 1.14, zoom: 0.98, offsetX: 0, offsetY: 0 };
}

function renderMobileStaticFocus(viewport, sourceBbox, focusBbox, transform) {
  const left = ((focusBbox[0] - sourceBbox[0]) / (sourceBbox[2] - sourceBbox[0])) * transform.width + transform.translateX;
  const right = ((focusBbox[2] - sourceBbox[0]) / (sourceBbox[2] - sourceBbox[0])) * transform.width + transform.translateX;
  const top = ((sourceBbox[3] - focusBbox[3]) / (sourceBbox[3] - sourceBbox[1])) * transform.height + transform.translateY;
  const bottom = ((sourceBbox[3] - focusBbox[1]) / (sourceBbox[3] - sourceBbox[1])) * transform.height + transform.translateY;
  const width = Math.max(32, right - left);
  const height = Math.max(28, bottom - top);

  viewport.focusRing.style.left = `${Math.max(8, left)}px`;
  viewport.focusRing.style.top = `${Math.max(8, top)}px`;
  viewport.focusRing.style.width = `${Math.max(24, Math.min(viewport.surface.clientWidth - 16, width))}px`;
  viewport.focusRing.style.height = `${Math.max(24, Math.min(viewport.surface.clientHeight - 16, height))}px`;
}

function renderMobileStaticLegend(metadata) {
  const viewport = appState.mobileStaticViewport;
  if (!viewport) {
    return;
  }
  const config = resolveOverlayStyle(appState.overlay, metadata) || { units: "", type: "message", note: "" };
  viewport.legendUnits.textContent = config.units || "";
  viewport.legendName.textContent = labelForOverlay(appState.overlay);
  viewport.legendScale.replaceChildren();
  viewport.legendLabels.replaceChildren();
  viewport.legendScale.style.background = "";

  if (config.type === "continuous") {
    viewport.legendScale.className = "ios-static-legend-scale ios-static-legend-scale-gradient";
    viewport.legendScale.style.background = `linear-gradient(90deg, ${config.colors.join(", ")})`;
    const labels = config.labels || inferLegendLabels(config, metadata);
    labels.forEach((label) => {
      const span = document.createElement("span");
      span.textContent = label;
      viewport.legendLabels.appendChild(span);
    });
    return;
  }

  if (config.type === "categorical") {
    viewport.legendScale.className = "ios-static-legend-scale ios-static-legend-scale-categorical";
    const items = (config.items || []).slice(0, 4);
    items.forEach((item) => {
      const swatch = document.createElement("span");
      swatch.className = "ios-static-legend-chip";
      swatch.style.background = item.color;
      swatch.textContent = item.label;
      viewport.legendScale.appendChild(swatch);
    });
    return;
  }

  viewport.legendScale.className = "ios-static-legend-scale ios-static-legend-scale-message";
  const note = document.createElement("span");
  note.className = "ios-static-legend-message";
  note.textContent = config.note || "Legend pending";
  viewport.legendScale.appendChild(note);
}

function addCompareOverlay(map, metadata, domainId) {
  if (staticMode) {
    map.addSource("overlay-compare", {
      type: "image",
      url: staticPreviewUrl(metadata, appState.compareMember, domainId),
      coordinates: imageCoordinatesForBbox(metadata.bbox),
    });
  } else {
    map.addSource("overlay-compare", {
      type: "raster",
      tiles: [tileTemplateUrl(appState.run, appState.compareMember, appState.overlay, appState.fhr, domainId)],
      tileSize: 256,
      bounds: metadata.bbox,
    });
  }
  map.addLayer({
    id: "overlay-compare-layer",
    type: "raster",
    source: "overlay-compare",
    paint: {
      "raster-opacity": appState.compareOpacity,
      "raster-fade-duration": 0,
    },
  });
}

function removeOverlayLayers(map) {
  if (map.getLayer("overlay-compare-layer")) {
    map.removeLayer("overlay-compare-layer");
  }
  if (map.getSource("overlay-compare")) {
    map.removeSource("overlay-compare");
  }
  if (map.getLayer("overlay-primary-layer")) {
    map.removeLayer("overlay-primary-layer");
  }
  if (map.getSource("overlay-primary")) {
    map.removeSource("overlay-primary");
  }
}

function updateCompareLayerOpacity() {
  if (mobileSafariStaticMode && appState.mobileStaticViewport?.compareImage) {
    appState.mobileStaticViewport.compareImage.style.opacity = String(appState.compareOpacity);
    return;
  }
  if (!appState.map || !appState.loaded || !appState.map.getLayer("overlay-compare-layer")) {
    return;
  }
  appState.map.setPaintProperty("overlay-compare-layer", "raster-opacity", appState.compareOpacity);
}

function buildAssetSummary(metadata, overlayId, domainId) {
  const style = resolveOverlayStyle(overlayId, metadata);
  if (style.type === "categorical") {
    return `Previewing ${labelForOverlay(overlayId)} for ${labelForDomain(domainId)}. ${style.note || "Categorical field."}`;
  }
  return `Previewing ${labelForOverlay(overlayId)} for ${labelForDomain(domainId)}. Range ${formatRangeForOverlay(
    overlayId,
    metadata.stats.min,
    metadata.stats.max,
    style
  )}.`;
}

function updateBasemapVisibility() {
  const theme = currentFamilyTheme();
  appState.mapStage.dataset.family = currentOverlayEntry()?.family || currentOverlayEntry()?.group || "default";
  appState.mapStage.style.setProperty("--map-accent", theme.accent);
  if (!appState.map || !appState.loaded) {
    return;
  }
  const activeBackground = appState.background || theme.background;
  for (const id of Object.keys(backgroundSources)) {
    const isActive = id === activeBackground;
    appState.map.setLayoutProperty(
      `basemap-${id}`,
      "visibility",
      isActive ? "visible" : "none"
    );
    appState.map.setPaintProperty(`basemap-${id}`, "raster-opacity", isActive ? theme.basemapOpacity : 0);
    appState.map.setPaintProperty(`basemap-${id}`, "raster-saturation", theme.basemapSaturation);
    appState.map.setPaintProperty(`basemap-${id}`, "raster-brightness-min", theme.basemapBrightnessMin);
    appState.map.setPaintProperty(`basemap-${id}`, "raster-brightness-max", theme.basemapBrightnessMax);
  }
  appState.map.setPaintProperty("graticule-layer", "line-opacity", theme.graticuleOpacity);
}

function updateMapPresentation() {
  updateBasemapVisibility();
  if (!appState.loaded) {
    return;
  }
  if (!mobileSafariStaticMode) {
    updateBoundaryStyles();
    updateDomainHighlight();
  } else {
    appState.mapStage.dataset.family = currentOverlayEntry()?.family || currentOverlayEntry()?.group || "default";
    appState.mapStage.style.setProperty("--map-accent", currentFamilyTheme().accent);
  }
}

function updateBoundaryStyles() {
  if (!appState.map || !appState.loaded) {
    return;
  }
  const theme = currentFamilyTheme();
  setLineStyle("states-layer", appState.stateLayer, {
    brown: theme.stateColor,
    white: "rgba(255,255,255,0.92)",
  });
  setLineStyle("countries-layer", appState.countryLayer, {
    brown: theme.countryColor,
    white: "rgba(255,255,255,0.92)",
  });
  appState.map.setPaintProperty("states-layer", "line-opacity", appState.stateLayer.endsWith("white") ? 0.72 : theme.stateOpacity);
  appState.map.setPaintProperty(
    "countries-layer",
    "line-opacity",
    appState.countryLayer.endsWith("white") ? 0.82 : theme.countryOpacity
  );
  els.stateStyleSelect.value = appState.stateLayer;
  els.countryStyleSelect.value = appState.countryLayer;
}

function updateDomainHighlight() {
  if (!appState.map || !appState.loaded) {
    return;
  }
  const theme = currentFamilyTheme();
  const stateNames = REGION_STATES[appState.proj] || [];
  const visible = stateNames.length > 0;
  const filter = visible
    ? ["match", ["get", "name"], ["literal", stateNames], true, false]
    : ["==", ["get", "name"], ""];

  appState.map.setFilter("domain-fill-layer", filter);
  appState.map.setFilter("domain-outline-layer", filter);
  appState.map.setLayoutProperty("domain-fill-layer", "visibility", visible ? "visible" : "none");
  appState.map.setLayoutProperty("domain-outline-layer", "visibility", visible ? "visible" : "none");
  appState.map.setPaintProperty("domain-fill-layer", "fill-color", theme.accent);
  appState.map.setPaintProperty("domain-outline-layer", "line-color", theme.accent);
  appState.map.setPaintProperty("domain-fill-layer", "fill-opacity", visible ? 0.08 : 0);
  updateDomainMask();
}

function updateDomainMask() {
  if (!appState.map || !appState.loaded) {
    return;
  }
  const source = appState.map.getSource("domain-focus-source");
  if (!source) {
    return;
  }
  const bbox = getDomain(appState.proj)?.viewport?.bbox;
  const theme = currentFamilyTheme();
  if (!Array.isArray(bbox) || bbox.length !== 4 || appState.proj === "conus") {
    source.setData(emptyFeatureCollection());
    appState.map.setLayoutProperty("domain-mask-layer", "visibility", "none");
    return;
  }
  source.setData(domainMaskGeoJson(bbox));
  appState.map.setLayoutProperty("domain-mask-layer", "visibility", "visible");
  appState.map.setPaintProperty("domain-mask-layer", "fill-opacity", theme.maskOpacity);
}

function domainMaskGeoJson(bbox) {
  const [west, south, east, north] = bbox;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-180, -90],
              [180, -90],
              [180, 90],
              [-180, 90],
              [-180, -90],
            ],
            [
              [west, south],
              [west, north],
              [east, north],
              [east, south],
              [west, south],
            ],
          ],
        },
      },
    ],
  };
}

function currentOverlayEntry() {
  return lookupOverlayEntry(appState.overlay);
}

function currentFamilyTheme() {
  const family = currentOverlayEntry()?.family || currentOverlayEntry()?.group || "default";
  return FAMILY_THEMES[family] || FAMILY_THEMES.default;
}

function setLineStyle(layerId, layerSetting, palette) {
  const map = appState.map;
  const hidden = layerSetting === "none";
  map.setLayoutProperty(layerId, "visibility", hidden ? "none" : "visible");
  if (!hidden) {
    const color = layerSetting.endsWith("white") ? palette.white : palette.brown;
    map.setPaintProperty(layerId, "line-color", color);
    map.setPaintProperty(layerId, "line-opacity", layerId === "countries-layer" ? 0.9 : 0.82);
  }
}

function moveToDomain() {
  const domain = getDomain(appState.proj);
  els.domainLabel.textContent = domain.label;
  if (mobileSafariStaticMode) {
    if (appState.loaded) {
      refreshOverlay().catch((error) => {
        console.error(error);
      });
    }
    return;
  }
  if (appState.map) {
    updateDomainHighlight();
    const bbox = domain.viewport?.bbox;
    if (Array.isArray(bbox) && bbox.length === 4) {
      appState.map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        {
          padding: domainFitPadding(),
          duration: 850,
          essential: true,
          maxZoom: domain.viewport.zoom + 0.4,
        }
      );
      return;
    }
    appState.map.easeTo({
      center: domain.viewport.center,
      zoom: domain.viewport.zoom,
      duration: 850,
      essential: true,
    });
  }
}

function domainFitPadding() {
  return isMobileViewport()
    ? { top: 12, right: 12, bottom: 12, left: 12 }
    : { top: 28, right: 28, bottom: 28, left: 28 };
}

function requestMapResize() {
  if (mobileSafariStaticMode) {
    if (appState.loaded) {
      refreshOverlay().catch((error) => {
        console.error(error);
      });
    }
    return;
  }
  if (!appState.map) {
    return;
  }
  window.requestAnimationFrame(() => {
    appState.map.resize();
  });
}

function renderLegend(metadata = null) {
  const config = resolveOverlayStyle(appState.overlay, metadata) || {
    units: "",
    type: "message",
    note: "Legend is not configured for this overlay yet.",
  };
  els.legendUnits.textContent = config.units || "";
  els.mapLegendUnits.textContent = config.units || "";

  if (config.type === "continuous") {
    const gradient = document.createElement("div");
    gradient.className = "legend-gradient";
    gradient.style.background = `linear-gradient(90deg, ${config.colors.join(", ")})`;

    const labels = document.createElement("div");
    labels.className = "legend-labels";
    const labelsToShow = config.labels || inferLegendLabels(config, metadata);
    labelsToShow.forEach((label) => {
      const span = document.createElement("span");
      span.textContent = label;
      labels.appendChild(span);
    });
    replaceLegendPanels([gradient, labels]);
    return;
  }

  if (config.type === "categorical") {
    const fragment = document.createDocumentFragment();
    config.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "legend-item";
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.background = item.color;
      const label = document.createElement("span");
      label.textContent = item.label;
      row.append(swatch, label);
      fragment.appendChild(row);
    });
    if (config.note) {
      fragment.appendChild(makeLegendNote(config.note));
    }
    replaceLegendPanels([fragment]);
    return;
  }

  replaceLegendPanels([makeLegendNote(config.note)]);
}

function replaceLegendPanels(nodes) {
  els.legendPanel.replaceChildren(...nodes.map((node) => node.cloneNode(true)));
  els.mapLegendPanel.replaceChildren(...nodes.map((node) => node.cloneNode(true)));
}

function makeLegendNote(text) {
  const note = document.createElement("p");
  note.className = "legend-note";
  note.textContent = text;
  return note;
}

function getDomain(domainId) {
  return appState.domainsConfig.domains.find((domain) => domain.id === domainId);
}

function populateSelect(selectEl, values, selectedValue, labelFn = (value) => value) {
  const fragment = document.createDocumentFragment();
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelFn(value);
    fragment.appendChild(option);
  });
  selectEl.replaceChildren(fragment);
  selectEl.value = selectedValue;
}

function makeChip(label, active, onClick, disabled = false) {
  const button = document.createElement("button");
  button.className = `chip${active ? " active" : ""}${disabled ? " disabled" : ""}`;
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function currentBuiltOverlayMap() {
  return appState.productIndex[appState.run]?.members?.[currentPrimaryMember()]?.forecast_hours?.[appState.fhr]?.overlays || {};
}

function mobileStaticCacheKey(member, domainId, fhrToken = appState.fhr) {
  return [appState.run, canonicalOverlayId(appState.overlay), member, normalizeFhrToken(fhrToken), domainId].join("|");
}

function trimMobileStaticCache(cache, maxEntries) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function preloadStaticFrame(url) {
  const cached = appState.mobileStaticImageCache.get(url);
  if (cached) {
    return cached;
  }
  const pending = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to preload ${url}`));
    image.src = url;
  }).catch((error) => {
    appState.mobileStaticImageCache.delete(url);
    throw error;
  });
  appState.mobileStaticImageCache.set(url, pending);
  trimMobileStaticCache(appState.mobileStaticImageCache, 96);
  return pending;
}

async function previewForecastHour(token) {
  const nextFhr = normalizeFhrToken(token);
  if (!nextFhr || nextFhr === appState.fhr) {
    return;
  }
  const previousIndex = appState.availableFhrs.indexOf(appState.fhr);
  const nextIndex = appState.availableFhrs.indexOf(nextFhr);
  if (previousIndex >= 0 && nextIndex >= 0 && previousIndex !== nextIndex) {
    appState.mobileStaticPrefetchDirection = nextIndex > previousIndex ? 1 : -1;
  }
  appState.fhr = nextFhr;
  const renderToken = ++appState.mobileStaticRenderToken;
  syncForecastHourControls();
  try {
    const primaryPayload = await fetchPreferredMetadata(currentPrimaryMember(), appState.proj, appState.fhr);
    const comparePayload =
      appState.viewMode === "compare" && appState.compareMember
        ? await fetchPreferredMetadata(appState.compareMember, appState.proj, appState.fhr)
        : null;
    if (renderToken !== appState.mobileStaticRenderToken) {
      return;
    }
    applyMobileStaticOverlay(primaryPayload, comparePayload);
    scheduleMobileStaticPrefetch();
  } catch (error) {
    console.error(error);
  }
  updateUrl();
}

function scheduleMobileStaticPrefetch() {
  if (!mobileSafariStaticMode) {
    return;
  }
  if (appState.mobileStaticPrefetchTimeoutId != null) {
    window.clearTimeout(appState.mobileStaticPrefetchTimeoutId);
  }
  appState.mobileStaticPrefetchTimeoutId = window.setTimeout(() => {
    appState.mobileStaticPrefetchTimeoutId = null;
    void primeMobileStaticFrames();
  }, 90);
}

async function primeMobileStaticFrames() {
  if (!mobileSafariStaticMode || appState.availableFhrs.length < 2) {
    return;
  }
  const centerIndex = appState.availableFhrs.indexOf(appState.fhr);
  if (centerIndex < 0) {
    return;
  }
  const members = [currentPrimaryMember()];
  if (appState.viewMode === "compare" && appState.compareMember) {
    members.push(appState.compareMember);
  }
  const requests = [];
  const directionalOffsets =
    appState.mobileStaticPrefetchDirection >= 0
      ? [0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4]
      : [0, -1, -2, -3, -4, -5, -6, -7, 1, 2, 3, 4];
  for (const offset of directionalOffsets) {
    const index = centerIndex + offset;
    if (index < 0 || index >= appState.availableFhrs.length) {
      continue;
    }
    const token = appState.availableFhrs[index];
    for (const member of members) {
      requests.push(fetchPreferredMetadata(member, appState.proj, token));
    }
  }
  await Promise.allSettled(requests);
}

function currentPrimaryMember() {
  return appState.viewMode === "ensemble" ? "ens" : appState.member;
}

function matchesOverlayFilter(overlay, rawFilter) {
  if (!matchesOverlayGroup(overlay)) {
    return false;
  }
  if (!rawFilter) {
    return true;
  }
  const filter = rawFilter.toLowerCase();
  const haystacks = [overlay.label, overlay.id, overlay.fieldKey, overlay.variable, overlay.level, overlay.family]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return haystacks.some((value) => value.includes(filter));
}

function matchesOverlayGroup(overlay) {
  const group = appState.overlayGroup;
  if (group === "all") {
    return true;
  }
  if (group === "featured") {
    return Boolean(overlay.featured);
  }
  if (group === "curated" || group === "ensemble" || group === "native") {
    return (overlay.group || "curated") === group;
  }
  return overlay.family === group;
}

function sortVisibleOverlays(overlays, builtOverlayIds) {
  return [...overlays].sort((left, right) => {
    const leftFeatured = left.featured ? 1 : 0;
    const rightFeatured = right.featured ? 1 : 0;
    if (leftFeatured !== rightFeatured) {
      return rightFeatured - leftFeatured;
    }
    const leftBuilt = builtOverlayIds.includes(left.id) ? 1 : 0;
    const rightBuilt = builtOverlayIds.includes(right.id) ? 1 : 0;
    if (leftBuilt !== rightBuilt) {
      return rightBuilt - leftBuilt;
    }
    return left.label.localeCompare(right.label);
  });
}

function setRunStatus(runRecord) {
  els.runStatusPill.textContent = runRecord.status;
  els.runStatusPill.className = `status-pill ${runRecord.status}`;
  const modeNote = appState.archive ? "Showing archive and partial runs." : "Showing ready runs only.";
  const viewNote = `Current view: ${appState.viewMode}.`;
  const reasons = runRecord.status_reasons || [];
  const notices = [modeNote, viewNote];
  if (appState.modeNotice) {
    notices.push(appState.modeNotice);
  }
  els.runStatusText.textContent = [...notices, ...reasons].join(" ");
}

function startAnimation() {
  if (appState.availableFhrs.length < 2) {
    return;
  }
  appState.isAnimating = true;
  refreshAnimationLoop();
  updateAnimationUi();
}

function stopAnimation() {
  appState.isAnimating = false;
  if (appState.animationTimeoutId != null) {
    window.clearTimeout(appState.animationTimeoutId);
    appState.animationTimeoutId = null;
  }
  updateAnimationUi();
}

function refreshAnimationLoop() {
  if (appState.animationTimeoutId != null) {
    window.clearTimeout(appState.animationTimeoutId);
    appState.animationTimeoutId = null;
  }
  if (!appState.isAnimating) {
    return;
  }
  appState.animationTimeoutId = window.setTimeout(async () => {
    if (!appState.isAnimating) {
      return;
    }
    await advanceForecastHour();
    refreshAnimationLoop();
  }, appState.animationDelay);
}

async function advanceForecastHour() {
  await stepForecastHour(1);
}

async function stepForecastHour(direction) {
  if (appState.availableFhrs.length < 2) {
    return;
  }
  const currentIndex = appState.availableFhrs.indexOf(appState.fhr);
  const nextIndex =
    currentIndex >= 0
      ? (currentIndex + direction + appState.availableFhrs.length) % appState.availableFhrs.length
      : 0;
  const nextFhr = appState.availableFhrs[nextIndex];
  if (mobileSafariStaticMode) {
    await previewForecastHour(nextFhr);
    return;
  }
  appState.fhr = nextFhr;
  await syncSelectionState();
}

function updateAnimationUi() {
  els.animateToggle.textContent = appState.isAnimating ? "Pause" : "Play";
  els.animateToggle.disabled = appState.availableFhrs.length < 2;
  els.prevHourButton.disabled = appState.availableFhrs.length < 2;
  els.nextHourButton.disabled = appState.availableFhrs.length < 2;
  els.animationSpeedSelect.value = String(appState.animationDelay);
}

function syncForecastHourControls() {
  els.timelineSlider.min = "0";
  els.timelineSlider.max = String(Math.max(0, appState.availableFhrs.length - 1));
  els.fhrSelect.value = appState.fhr;
  els.mobileFhrSelect.value = appState.fhr;
  els.timelineSlider.value = String(Math.max(0, appState.availableFhrs.indexOf(appState.fhr)));
  els.timelineReadout.textContent = appState.fhr.toUpperCase();
  updateTimelineRail();
  updateSummaryStrip();
  updateAnimationUi();
}

function updateTimelineRail() {
  els.timelineInitLabel.textContent = formatRunLabel(appState.run);
  els.timelineValidLabel.textContent = formatValidTimeLabel(appState.run, appState.fhr);
  els.timelineStepLabel.textContent = appState.fhr ? appState.fhr.toUpperCase() : "--";
  const fragment = document.createDocumentFragment();
  const currentIndex = appState.availableFhrs.indexOf(appState.fhr);
  const start = Math.max(0, currentIndex - 3);
  const end = Math.min(appState.availableFhrs.length, currentIndex + 4);
  for (let index = start; index < end; index += 1) {
    const token = appState.availableFhrs[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `timeline-tick${token === appState.fhr ? " active" : ""}`;
    button.textContent = token.toUpperCase().replace("F", "+");
    button.addEventListener("click", async () => {
      appState.fhr = token;
      await syncSelectionState();
    });
    fragment.appendChild(button);
  }
  els.timelineTicks.replaceChildren(fragment);
}

function updateUrl() {
  const params = new URLSearchParams(window.location.search);
  params.set("run", appState.run);
  params.set("member", appState.member);
  params.set("mode", appState.viewMode);
  params.set("fhr", appState.fhr.slice(1));
  params.set("proj", appState.proj);
  params.set("overlay", canonicalOverlayId(appState.overlay));
  params.set("overlayGroup", appState.overlayGroup);
  params.set("background", appState.background);
  params.set("state", appState.stateLayer);
  params.set("country", appState.countryLayer);
  params.set("archive", String(appState.archive));
  params.set("speed", String(appState.animationDelay));
  if (appState.compareMember) {
    params.set("compareMember", appState.compareMember);
  } else {
    params.delete("compareMember");
  }
  params.set("compareOpacity", String(Math.round(appState.compareOpacity * 100)));
  if (appState.overlayFilter) {
    params.set("overlayFilter", appState.overlayFilter);
  } else {
    params.delete("overlayFilter");
  }
  if (!staticMode) {
    if (backendBase) {
      params.set("backend", backendBase);
      params.delete("catalogApi");
      params.delete("tileApi");
    } else {
      params.delete("backend");
      params.set("catalogApi", catalogBase);
      params.set("tileApi", tileBase);
    }
  } else {
    params.delete("backend");
    params.delete("catalogApi");
    params.delete("tileApi");
  }
  if (forceStaticMode) {
    params.set("static", "true");
  } else {
    params.delete("static");
  }
  history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

function normalizeFhrToken(value) {
  if (value == null || value === "") {
    return null;
  }
  if (String(value).startsWith("f")) {
    return `f${String(value).slice(1).padStart(3, "0")}`;
  }
  return `f${String(value).padStart(3, "0")}`;
}

function labelForOverlay(overlayId) {
  const canonicalId = canonicalOverlayId(overlayId);
  return lookupOverlayEntry(canonicalId)?.label || canonicalId;
}

function labelForDomain(domainId) {
  return getDomain(domainId)?.label || domainId;
}

function setAssetStatus(message, tone) {
  els.assetStatus.textContent = message;
  els.assetStatus.className = `asset-status${tone && tone !== "ok" ? ` ${tone}` : ""}`;
}

function formatRunLabel(runId) {
  const parsed = parseRunDate(runId);
  if (!parsed) {
    return runId || "--";
  }
  return `${String(parsed.getUTCHours()).padStart(2, "0")}Z ${parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })}`;
}

function formatValidTimeLabel(runId, fhrToken) {
  const parsed = parseRunDate(runId);
  const offsetHours = Number.parseInt((fhrToken || "f000").slice(1), 10);
  if (!parsed || !Number.isFinite(offsetHours)) {
    return "--";
  }
  const valid = new Date(parsed.getTime() + offsetHours * 60 * 60 * 1000);
  return `${String(valid.getUTCHours()).padStart(2, "0")}Z ${valid.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })}`;
}

function parseRunDate(runId) {
  if (!/^\d{10}$/.test(runId || "")) {
    return null;
  }
  const year = Number.parseInt(runId.slice(0, 4), 10);
  const month = Number.parseInt(runId.slice(4, 6), 10) - 1;
  const day = Number.parseInt(runId.slice(6, 8), 10);
  const hour = Number.parseInt(runId.slice(8, 10), 10);
  return new Date(Date.UTC(year, month, day, hour));
}

function formatRangeForOverlay(overlayId, minValue, maxValue, style = null) {
  return `${formatOverlayValue(overlayId, minValue, style)} to ${formatOverlayValue(overlayId, maxValue, style)}`;
}

function formatOverlayValue(overlayId, value, style = null) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const effectiveStyle = style || resolveOverlayStyle(overlayId);
  const transformed = applyTransform(value, effectiveStyle?.transform);
  const decimals = determinePrecision(transformed, effectiveStyle);
  const suffix = effectiveStyle?.units ? ` ${effectiveStyle.units}` : "";
  return `${transformed.toFixed(decimals)}${suffix}`;
}

function parseBoolean(value, defaultValue) {
  if (value == null) {
    return defaultValue;
  }
  return value === "true";
}

function detectMobileSafari() {
  const ua = navigator.userAgent || "";
  const mobileApple = /iPhone|iPod|iPad/i.test(ua);
  const webKit = /WebKit/i.test(ua);
  const excluded = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return mobileApple && webKit && !excluded;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: cacheModeForUrl(url) });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

function cacheModeForUrl(url) {
  if (!staticMode) {
    return "no-store";
  }
  return isStaticRootPayload(url) ? "no-store" : "force-cache";
}

function isStaticRootPayload(url) {
  return /\/(domains|layers|runs|latest-ready|latest|products-index|snapshot)\.json(?:\?|$)/i.test(url);
}

function domainsUrl() {
  return staticMode ? withStaticVersion(`${catalogBase}/domains.json`, false) : `${catalogBase}/api/domains`;
}

function layersUrl() {
  return staticMode ? withStaticVersion(`${catalogBase}/layers.json`, false) : `${catalogBase}/api/layers`;
}

function runsUrl() {
  return staticMode ? withStaticVersion(`${catalogBase}/runs.json`, false) : `${catalogBase}/api/runs`;
}

function latestReadyUrl() {
  return staticMode ? withStaticVersion(`${catalogBase}/latest-ready.json`, false) : `${catalogBase}/api/runs/latest-ready`;
}

function productsIndexUrl() {
  return staticMode ? withStaticVersion(`${tileBase}/products-index.json`, false) : `${tileBase}/api/products-index`;
}

function productMetadataUrl(runId, member, overlayId, fhrToken, domainId) {
  return staticMode
    ? withStaticVersion(`${tileBase}/products/${runId}/${member}/${overlayId}/${fhrToken}/${domainId}.json`)
    : `${tileBase}/api/products/${runId}/${member}/${overlayId}/${fhrToken}/${domainId}`;
}

function previewImageUrl(runId, member, overlayId, fhrToken, domainId) {
  return staticMode
    ? withStaticVersion(`${tileBase}/products/${runId}/${member}/${overlayId}/${fhrToken}/${domainId}.preview.png`)
    : `${tileBase}/api/products/${runId}/${member}/${overlayId}/${fhrToken}/${domainId}/preview.png`;
}

function staticPreviewUrl(metadata, member, domainId) {
  if (!staticMode) {
    return previewImageUrl(appState.run, member, appState.overlay, appState.fhr, domainId);
  }
  const previewUrl = preferMobileStaticPreview()
    ? metadata?.mobile_preview_url || metadata?.preview_url
    : metadata?.preview_url;
  if (!previewUrl) {
    return previewImageUrl(appState.run, member, appState.overlay, appState.fhr, domainId);
  }
  if (/^https?:\/\//i.test(previewUrl)) {
    return withStaticVersion(previewUrl);
  }
  if (previewUrl.startsWith(`${tileBase}/`)) {
    return withStaticVersion(previewUrl);
  }
  if (previewUrl.startsWith("./products/")) {
    return withStaticVersion(`${tileBase}/${previewUrl.slice(2)}`);
  }
  if (previewUrl.startsWith("products/")) {
    return withStaticVersion(`${tileBase}/${previewUrl}`);
  }
  if (previewUrl.startsWith("./")) {
    return withStaticVersion(`${window.location.pathname.replace(/[^/]+$/, "")}${previewUrl.slice(2)}`);
  }
  return withStaticVersion(`${tileBase}/${previewUrl.replace(/^\//, "")}`);
}

function tileTemplateUrl(runId, member, overlayId, fhrToken, domainId) {
  return `${tileBase}/tiles/${runId}/${member}/${overlayId}/${fhrToken}/${domainId}/{z}/{x}/{y}.png`;
}

function withStaticVersion(url, includeVersion = true) {
  if (!staticMode || !includeVersion) {
    return url;
  }
  const version = appState.staticAssetVersion;
  if (!version) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

function preferMobileStaticPreview() {
  return mobileSafariStaticMode || (staticMode && isMobileViewport());
}

function imageCoordinatesForBbox(bbox) {
  return [
    [bbox[0], bbox[3]],
    [bbox[2], bbox[3]],
    [bbox[2], bbox[1]],
    [bbox[0], bbox[1]],
  ];
}

function lookupOverlayEntry(overlayId) {
  const canonicalId = canonicalOverlayId(overlayId);
  return appState.layersConfig?.weatherOverlays?.find((overlay) => overlay.id === canonicalId) || null;
}

function resolveOverlayStyle(overlayId, metadata = null) {
  if (metadata?.style) {
    return metadata.style;
  }
  return lookupOverlayEntry(overlayId)?.style || null;
}

function inferLegendLabels(style, metadata) {
  if (metadata?.stats && Number.isFinite(metadata.stats.min) && Number.isFinite(metadata.stats.max)) {
    const values = [0, 0.25, 0.5, 0.75, 1].map((fraction) =>
      metadata.stats.min + (metadata.stats.max - metadata.stats.min) * fraction
    );
    return values.map((value) => formatOverlayValue(appState.overlay, value, style).replace(/^(-?\d+(?:\.\d+)?)\s*/, "$1"));
  }
  return ["Low", "", "", "", "High"];
}

function applyTransform(value, transform) {
  switch (transform) {
    case "kelvin_to_fahrenheit":
      return ((value - 273.15) * 9) / 5 + 32;
    case "kelvin_delta_to_fahrenheit":
      return value * 1.8;
    case "mm_to_inches":
      return value / 25.4;
    case "pa_to_hpa":
      return value / 100;
    case "mps_to_mph":
      return value * 2.23694;
    case "m_to_miles":
      return value / 1609.34;
    case "kgkg_to_gkg":
      return value * 1000;
    default:
      return value;
  }
}

function determinePrecision(value, style) {
  if (!style?.units) {
    return Math.abs(value) >= 100 ? 0 : 2;
  }
  if (["in", "mi"].includes(style.units)) {
    return 2;
  }
  if (["hPa"].includes(style.units)) {
    return 1;
  }
  if (["F", "mph", "J/kg", "%", "dBZ", "K", "m", "m/s", "m2/s2"].includes(style.units)) {
    return 0;
  }
  return Math.abs(value) >= 100 ? 0 : 2;
}

function canonicalOverlayId(overlayId) {
  if (!overlayId) {
    return overlayId;
  }
  return OVERLAY_ALIASES[overlayId] || overlayId;
}

function updateSummaryStrip() {
  const overlayEntry = currentOverlayEntry();
  els.summaryRun.textContent = formatRunLabel(appState.run);
  const memberLabel =
    appState.viewMode === "ensemble"
      ? "ENS"
      : appState.viewMode === "compare"
      ? `${appState.member || "--"} / ${appState.compareMember || "--"}`
      : currentPrimaryMember() || "--";
  els.summaryMember.textContent = memberLabel;
  els.summaryHour.textContent = appState.fhr ? appState.fhr.toUpperCase().replace("F", "+") : "+000";
  els.summaryValid.textContent = formatValidTimeLabel(appState.run, appState.fhr);
  els.summaryRegion.textContent = labelForDomain(appState.proj || "conus");
  els.mapFamilyTag.textContent = overlayEntry?.family ? overlayEntry.family.replace("_", " ") : "curated";
  els.mapInitTag.textContent = formatRunLabel(appState.run);
  els.mapValidTag.textContent = formatValidTimeLabel(appState.run, appState.fhr);
}
