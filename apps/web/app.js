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

const els = {
  runSelect: document.getElementById("run-select"),
  viewModeSelect: document.getElementById("view-mode-select"),
  memberSelect: document.getElementById("member-select"),
  compareControls: document.getElementById("compare-controls"),
  compareMemberSelect: document.getElementById("compare-member-select"),
  compareOpacityRow: document.getElementById("compare-opacity-row"),
  compareOpacitySlider: document.getElementById("compare-opacity-slider"),
  compareOpacityReadout: document.getElementById("compare-opacity-readout"),
  fhrSelect: document.getElementById("fhr-select"),
  domainGrid: document.getElementById("domain-grid"),
  overlayGrid: document.getElementById("overlay-grid"),
  overlayGroupSelect: document.getElementById("overlay-group-select"),
  backgroundGrid: document.getElementById("background-grid"),
  stateStyleSelect: document.getElementById("state-style-select"),
  countryStyleSelect: document.getElementById("country-style-select"),
  timelineSlider: document.getElementById("timeline-slider"),
  timelineReadout: document.getElementById("timeline-readout"),
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
  legendPanel: document.getElementById("legend-panel"),
  legendUnits: document.getElementById("legend-units"),
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

  appState.archive = parseBoolean(query.get("archive"), false);
  appState.proj = query.get("proj") || domainsConfig.defaultDomain;
  appState.background = query.get("background") || layersConfig.defaults.baselayer;
  appState.overlay = query.get("overlay") || layersConfig.defaults.weatherOverlay;
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

  const defaultRun = selectDefaultRun();
  appState.run = query.get("run") || defaultRun;

  buildMap();
  bindControls();
  populateBackgroundButtons();
  populateDomainButtons();
  populateRunSelect();
  renderLegend();
  updateAnimationUi();
  els.overlayFilterInput.value = appState.overlayFilter;
  els.overlayGroupSelect.value = appState.overlayGroup;
  els.viewModeSelect.value = appState.viewMode;
  els.compareOpacitySlider.value = String(Math.round(appState.compareOpacity * 100));
  els.compareOpacityReadout.textContent = `${Math.round(appState.compareOpacity * 100)}%`;
  await syncSelectionState({ preserveUrl: false });
}

function buildMap() {
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
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.on("load", () => {
    appState.loaded = true;
    addReferenceSources(map);
    updateBoundaryStyles();
    refreshOverlay().catch((error) => {
      console.error(error);
      setAssetStatus(`Overlay refresh failed: ${error.message}`, "error");
    });
  });
  appState.map = map;
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
  map.addSource("states-source", {
    type: "geojson",
    data: remoteGeoJson.states,
  });
  map.addSource("countries-source", {
    type: "geojson",
    data: remoteGeoJson.countries,
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

function bindControls() {
  els.runSelect.addEventListener("change", async (event) => {
    appState.run = event.target.value;
    await syncSelectionState();
  });
  els.viewModeSelect.addEventListener("change", async (event) => {
    appState.viewMode = event.target.value;
    await syncSelectionState();
  });
  els.memberSelect.addEventListener("change", async (event) => {
    appState.member = event.target.value;
    await syncSelectionState();
  });
  els.compareMemberSelect.addEventListener("change", async (event) => {
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
    appState.fhr = appState.availableFhrs[index] || appState.fhr;
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
  els.animationSpeedSelect.addEventListener("change", () => {
    appState.animationDelay = Number(els.animationSpeedSelect.value);
    if (appState.isAnimating) {
      refreshAnimationLoop();
    }
    updateUrl();
  });
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
  for (const run of getVisibleRuns()) {
    const option = document.createElement("option");
    option.value = run.run_id;
    option.textContent = `${run.run_id} | ${run.status}`;
    fragment.appendChild(option);
  }
  els.runSelect.replaceChildren(fragment);
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
}

async function syncSelectionState({ preserveUrl = true } = {}) {
  const visibleRuns = getVisibleRuns();
  const runRecord = visibleRuns.find((run) => run.run_id === appState.run) || visibleRuns[0] || appState.runs[0];
  if (!runRecord) {
    throw new Error("No runs are available from the catalog API.");
  }
  appState.run = runRecord.run_id;
  els.runSelect.value = appState.run;
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
    els.memberSelect.disabled = true;
  } else {
    if (!effectiveMemberOptions.includes(appState.member)) {
      appState.member = effectiveMemberOptions[0] || runRecord.members?.[0] || "m00";
    }
    populateSelect(els.memberSelect, effectiveMemberOptions, appState.member);
    els.memberSelect.disabled = false;
  }
  syncCompareControls(effectiveMemberOptions);
  els.viewModeSelect.value = appState.viewMode;

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
  els.timelineSlider.min = "0";
  els.timelineSlider.max = String(Math.max(0, effectiveFhrs.length - 1));
  els.timelineSlider.value = String(Math.max(0, effectiveFhrs.indexOf(appState.fhr)));
  els.timelineReadout.textContent = appState.fhr.toUpperCase();

  populateOverlayButtons(fhIndex[appState.fhr]?.overlays || {});
  moveToDomain();
  updateAnimationUi();
  if (effectiveFhrs.length < 2) {
    stopAnimation();
  } else if (appState.isAnimating) {
    refreshAnimationLoop();
  }
  if (appState.loaded) {
    updateBoundaryStyles();
    await refreshOverlay();
  }
  if (preserveUrl) {
    updateUrl();
  }
}

function syncCompareControls(memberOptions) {
  const isCompareMode = appState.viewMode === "compare";
  els.compareControls.classList.toggle("hidden", !isCompareMode);
  els.compareOpacityRow.classList.toggle("hidden", !isCompareMode);
  if (!isCompareMode) {
    return;
  }
  const compareOptions = memberOptions.filter((member) => member !== appState.member);
  if (!compareOptions.includes(appState.compareMember)) {
    appState.compareMember = compareOptions[0] || appState.member;
  }
  populateSelect(els.compareMemberSelect, compareOptions, appState.compareMember);
  els.compareOpacitySlider.value = String(Math.round(appState.compareOpacity * 100));
  els.compareOpacityReadout.textContent = `${Math.round(appState.compareOpacity * 100)}%`;
}

function populateOverlayButtons(builtOverlayMap) {
  const configured = appState.layersConfig.weatherOverlays;
  const builtOverlays = Object.keys(builtOverlayMap);
  if (!builtOverlays.includes(appState.overlay)) {
    appState.overlay = builtOverlays[0] || configured[0]?.id || "temperature_2m";
  }
  const fragment = document.createDocumentFragment();
  const filteredConfigured = configured.filter((overlay) => matchesOverlayFilter(overlay, appState.overlayFilter));
  const visibleConfigured = filteredConfigured.length > 0 ? filteredConfigured : configured;
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
          await refreshOverlay();
          updateUrl();
        },
        !isBuilt
      )
    );
  }
  els.overlayGrid.replaceChildren(fragment);
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
    renderLegend(metadata);
  } catch (error) {
    els.assetPath.textContent = "No processed asset found for this combination";
    els.mapTitle.textContent = `${labelForOverlay(appState.overlay)} | ${appState.proj.toUpperCase()}`;
    els.mapSubtitle.textContent = `${appState.run} | ${currentPrimaryMember()} | ${appState.fhr.toUpperCase()}`;
    setAssetStatus(
      `No processed tile asset exists for ${appState.overlay} / ${domainId} / ${currentPrimaryMember()} / ${appState.fhr.toUpperCase()}.`,
      "warning"
    );
    renderLegend();
  }
}

function addPrimaryOverlay(map, metadata, primaryMember, domainId) {
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
        "raster-opacity": appState.viewMode === "compare" ? 0.78 : 0.82,
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
      "raster-opacity": appState.viewMode === "compare" ? 0.78 : 0.82,
      "raster-fade-duration": 0,
    },
  });
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
  if (!appState.map) {
    return;
  }
  for (const id of Object.keys(backgroundSources)) {
    appState.map.setLayoutProperty(
      `basemap-${id}`,
      "visibility",
      id === appState.background ? "visible" : "none"
    );
  }
}

function updateBoundaryStyles() {
  if (!appState.map || !appState.loaded) {
    return;
  }
  setLineStyle("states-layer", appState.stateLayer, {
    brown: "#8e6344",
    white: "rgba(255,255,255,0.92)",
  });
  setLineStyle("countries-layer", appState.countryLayer, {
    brown: "#8e6344",
    white: "rgba(255,255,255,0.92)",
  });
  els.stateStyleSelect.value = appState.stateLayer;
  els.countryStyleSelect.value = appState.countryLayer;
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
  if (appState.map) {
    appState.map.easeTo({
      center: domain.viewport.center,
      zoom: domain.viewport.zoom,
      duration: 850,
    });
  }
}

function renderLegend(metadata = null) {
  const config = resolveOverlayStyle(appState.overlay, metadata) || {
    units: "",
    type: "message",
    note: "Legend is not configured for this overlay yet.",
  };
  els.legendUnits.textContent = config.units || "";

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
    els.legendPanel.replaceChildren(gradient, labels);
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
    els.legendPanel.replaceChildren(fragment);
    return;
  }

  els.legendPanel.replaceChildren(makeLegendNote(config.note));
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

function currentPrimaryMember() {
  return appState.viewMode === "ensemble" ? "ens" : appState.member;
}

function matchesOverlayFilter(overlay, rawFilter) {
  if (appState.overlayGroup !== "all" && (overlay.group || "curated") !== appState.overlayGroup) {
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
  if (appState.availableFhrs.length < 2) {
    return;
  }
  const currentIndex = appState.availableFhrs.indexOf(appState.fhr);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % appState.availableFhrs.length : 0;
  appState.fhr = appState.availableFhrs[nextIndex];
  await syncSelectionState();
}

function updateAnimationUi() {
  els.animateToggle.textContent = appState.isAnimating ? "Pause" : "Play";
  els.animateToggle.disabled = appState.availableFhrs.length < 2;
  els.animationSpeedSelect.value = String(appState.animationDelay);
}

function updateUrl() {
  const params = new URLSearchParams(window.location.search);
  params.set("run", appState.run);
  params.set("member", appState.member);
  params.set("mode", appState.viewMode);
  params.set("fhr", appState.fhr.slice(1));
  params.set("proj", appState.proj);
  params.set("overlay", appState.overlay);
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
  return lookupOverlayEntry(overlayId)?.label || overlayId;
}

function labelForDomain(domainId) {
  return getDomain(domainId)?.label || domainId;
}

function setAssetStatus(message, tone) {
  els.assetStatus.textContent = message;
  els.assetStatus.className = `asset-status${tone && tone !== "ok" ? ` ${tone}` : ""}`;
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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

function domainsUrl() {
  return staticMode ? `${catalogBase}/domains.json` : `${catalogBase}/api/domains`;
}

function layersUrl() {
  return staticMode ? `${catalogBase}/layers.json` : `${catalogBase}/api/layers`;
}

function runsUrl() {
  return staticMode ? `${catalogBase}/runs.json` : `${catalogBase}/api/runs`;
}

function latestReadyUrl() {
  return staticMode ? `${catalogBase}/latest-ready.json` : `${catalogBase}/api/runs/latest-ready`;
}

function productsIndexUrl() {
  return staticMode ? `${tileBase}/products-index.json` : `${tileBase}/api/products-index`;
}

function productMetadataUrl(runId, member, overlayId, fhrToken, domainId) {
  return staticMode
    ? `${tileBase}/products/${runId}/${member}/${overlayId}/${fhrToken}/${domainId}.json`
    : `${tileBase}/api/products/${runId}/${member}/${overlayId}/${fhrToken}/${domainId}`;
}

function previewImageUrl(runId, member, overlayId, fhrToken, domainId) {
  return staticMode
    ? `${tileBase}/products/${runId}/${member}/${overlayId}/${fhrToken}/${domainId}.preview.png`
    : `${tileBase}/api/products/${runId}/${member}/${overlayId}/${fhrToken}/${domainId}/preview.png`;
}

function staticPreviewUrl(metadata, member, domainId) {
  if (!staticMode) {
    return previewImageUrl(appState.run, member, appState.overlay, appState.fhr, domainId);
  }
  const previewUrl = metadata?.preview_url;
  if (!previewUrl) {
    return previewImageUrl(appState.run, member, appState.overlay, appState.fhr, domainId);
  }
  if (/^https?:\/\//i.test(previewUrl)) {
    return previewUrl;
  }
  if (previewUrl.startsWith(`${tileBase}/`)) {
    return previewUrl;
  }
  if (previewUrl.startsWith("./products/")) {
    return `${tileBase}/${previewUrl.slice(2)}`;
  }
  if (previewUrl.startsWith("products/")) {
    return `${tileBase}/${previewUrl}`;
  }
  if (previewUrl.startsWith("./")) {
    return `${window.location.pathname.replace(/[^/]+$/, "")}${previewUrl.slice(2)}`;
  }
  return `${tileBase}/${previewUrl.replace(/^\//, "")}`;
}

function tileTemplateUrl(runId, member, overlayId, fhrToken, domainId) {
  return `${tileBase}/tiles/${runId}/${member}/${overlayId}/${fhrToken}/${domainId}/{z}/{x}/{y}.png`;
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
  return appState.layersConfig?.weatherOverlays?.find((overlay) => overlay.id === overlayId) || null;
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
