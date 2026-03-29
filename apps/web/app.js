(function () {
  "use strict";

  const STATIC_ROOT = "./static-api";
  const SOURCE_DOMAIN_ID = "conus";
  const DEFAULT_DOMAIN_ID = "south_central";
  const MOBILE_BREAKPOINT = 720;
  const CACHE_LIMIT = 48;
  const SOURCE_BBOX = [-127.0, 23.0, -66.0, 50.0];

  const DEFAULT_OVERLAY_BY_MEMBER = {
    ens: "composite_reflectivity_probability_gt_40dbz",
    m00: "composite_reflectivity",
  };

  const FAMILY_CONFIG = [
    { id: "featured", label: "Featured" },
    { id: "storm", label: "Storm" },
    { id: "instability", label: "Instability" },
    { id: "rotation", label: "Rotation" },
    { id: "shear", label: "Shear" },
    { id: "wind", label: "Wind" },
    { id: "all", label: "All" },
  ];

  const QUICK_PRESETS = [
    ["Storm Signals", "ens", "storm", "composite_reflectivity_probability_gt_40dbz", "south_central"],
    ["Instability", "ens", "instability", "cape_probability_gt_1000", "south_central"],
    ["Low-Level Rotation", "ens", "rotation", "helicity_0_1km_probability_gt_100", "southeast"],
    ["Deep-Layer Shear", "ens", "shear", "shear_0_6km_probability_gt_40kt", "south_central"],
    ["Wind Risk", "ens", "wind", "wind_10m_probability_gt_25kt", "southeast"],
    ["Member Radar", "m00", "storm", "composite_reflectivity", "south_central"],
  ].map(([label, member, family, overlay, domain]) => ({ label, member, family, overlay, domain }));

  const PUBLIC_OVERLAY_META = {
    composite_reflectivity_probability_gt_40dbz: { family: "storm", order: 1, featured: true, description: "Share of ensemble members producing at least 40 dBZ composite reflectivity.", hint: "Best first-look storm signal for where organized convection is most likely." },
    qpf_probability_gt_0p10: { family: "storm", order: 2, featured: true, description: "Share of ensemble members producing at least 0.10 inches of precipitation.", hint: "Good for broad rain coverage, but less specific to severe storms than reflectivity probability." },
    composite_reflectivity: { family: "storm", order: 11, featured: true, description: "Single-member simulated composite reflectivity.", hint: "Useful for storm placement and structure, but noisier than the ensemble probability view." },
    cape_probability_gt_1000: { family: "instability", order: 21, featured: true, description: "Share of ensemble members reaching at least 1000 J/kg of CAPE.", hint: "Use with storm and shear fields to see whether storms also have enough fuel." },
    cape: { family: "instability", order: 22, featured: true, description: "Single-member surface-based CAPE.", hint: "High CAPE alone does not guarantee severe weather. Pair it with storm and shear signals." },
    cin_surface: { family: "instability", order: 23, description: "Single-member convective inhibition.", hint: "More negative values suggest a cap that may suppress storm initiation." },
    helicity_0_1km_probability_gt_100: { family: "rotation", order: 31, featured: true, description: "Share of ensemble members exceeding 100 m²/s² of 0 to 1 km helicity.", hint: "Most useful when storms are already expected nearby." },
    helicity_0_3km_probability_gt_250: { family: "rotation", order: 32, description: "Share of ensemble members exceeding 250 m²/s² of 0 to 3 km helicity.", hint: "Shows whether rotation support extends through a deeper layer." },
    helicity_0_1km: { family: "rotation", order: 33, featured: true, description: "Single-member 0 to 1 km storm-relative helicity.", hint: "Useful for low-level rotation support, but only meaningful where storms exist." },
    helicity_0_3km: { family: "rotation", order: 34, description: "Single-member 0 to 3 km storm-relative helicity.", hint: "Shows broader rotation support beyond the lowest kilometer." },
    relative_vorticity_0_1km: { family: "rotation", order: 35, description: "Single-member 0 to 1 km relative vorticity.", hint: "Advanced field. Treat it as a supplement to helicity, not the main public product." },
    relative_vorticity_0_2km: { family: "rotation", order: 36, description: "Single-member 0 to 2 km relative vorticity.", hint: "Useful for comparing corridors of low-level spin." },
    shear_0_6km_probability_gt_40kt: { family: "shear", order: 41, featured: true, description: "Share of ensemble members exceeding 40 kt of 0 to 6 km bulk shear.", hint: "Best summary of organized-storm support." },
    shear_0_1km_probability_gt_20kt: { family: "shear", order: 42, description: "Share of ensemble members exceeding 20 kt of 0 to 1 km shear.", hint: "Useful for low-level wind support when storms and instability are also present." },
    shear_u_0_1km: { family: "shear", order: 43, description: "Single-member 0 to 1 km U-shear component.", hint: "Advanced diagnostic. The threshold probability is usually clearer for public use." },
    shear_v_0_1km: { family: "shear", order: 44, description: "Single-member 0 to 1 km V-shear component.", hint: "Advanced diagnostic. Use after checking the threshold fields first." },
    shear_u_0_6km: { family: "shear", order: 45, description: "Single-member 0 to 6 km U-shear component.", hint: "Better as a supplement to the 40 kt probability field than a first-look product." },
    shear_v_0_6km: { family: "shear", order: 46, description: "Single-member 0 to 6 km V-shear component.", hint: "Better as a supplement to the 40 kt probability field than a first-look product." },
    wind_10m_probability_gt_25kt: { family: "wind", order: 51, featured: true, description: "Share of ensemble members exceeding 25 kt near-surface wind speed.", hint: "Useful for broad wind risk, but pair it with storm fields for convective interpretation." },
    gust_surface: { family: "wind", order: 52, featured: true, description: "Single-member surface wind gust field.", hint: "Best used with reflectivity for convective wind risk and impacts." },
    wind_10m: { family: "wind", order: 53, description: "Single-member 10 m wind speed.", hint: "Shows sustained near-surface wind rather than gust potential." },
  };

  const DOMAIN_PADDING = {
    conus: { x: 0.02, y: 0.04 },
    southeast: { x: 0.1, y: 0.14 },
    northeast: { x: 0.12, y: 0.15 },
    south_central: { x: 0.12, y: 0.16 },
    northwest: { x: 0.12, y: 0.14 },
    southwest: { x: 0.12, y: 0.14 },
    carolinas: { x: 0.2, y: 0.2 },
  };

  const REGION_STATE_NAMES = {
    southeast: ["Alabama", "Florida", "Georgia", "Mississippi", "North Carolina", "South Carolina", "Tennessee"],
    northeast: ["Connecticut", "Delaware", "Maine", "Maryland", "Massachusetts", "New Hampshire", "New Jersey", "New York", "Pennsylvania", "Rhode Island", "Vermont", "Virginia", "West Virginia"],
    south_central: ["Arkansas", "Kansas", "Louisiana", "Missouri", "New Mexico", "Oklahoma", "Texas"],
    northwest: ["Idaho", "Montana", "Oregon", "Washington", "Wyoming"],
    southwest: ["Arizona", "California", "Colorado", "Nevada", "New Mexico", "Utah"],
    carolinas: ["North Carolina", "South Carolina"],
  };

  const MEMBER_LABELS = {
    ens: "Ens Probabilities",
    m00: "Member 00",
  };

  const dom = {
    runBadge: document.getElementById("runBadge"),
    runSelect: document.getElementById("runSelect"),
    memberSelect: document.getElementById("memberSelect"),
    domainSelect: document.getElementById("domainSelect"),
    familySelect: document.getElementById("familySelect"),
    overlaySelect: document.getElementById("overlaySelect"),
    presetStrip: document.getElementById("presetStrip"),
    overlayFamilyLabel: document.getElementById("overlayFamilyLabel"),
    productTitle: document.getElementById("productTitle"),
    metaInit: document.getElementById("metaInit"),
    metaValid: document.getElementById("metaValid"),
    metaMember: document.getElementById("metaMember"),
    fieldDescription: document.getElementById("fieldDescription"),
    fieldHint: document.getElementById("fieldHint"),
    imageShell: document.getElementById("imageShell"),
    canvas: document.getElementById("forecastCanvas"),
    loading: document.getElementById("imageLoading"),
    legendLabel: document.getElementById("legendLabel"),
    legendUnits: document.getElementById("legendUnits"),
    legendScale: document.getElementById("legendScale"),
    prevHourButton: document.getElementById("prevHourButton"),
    playButton: document.getElementById("playButton"),
    nextHourButton: document.getElementById("nextHourButton"),
    speedSelect: document.getElementById("speedSelect"),
    hourLabel: document.getElementById("hourLabel"),
    validLabel: document.getElementById("validLabel"),
    hourRange: document.getElementById("hourRange"),
    hourChips: document.getElementById("hourChips"),
  };

  const ctx = dom.canvas.getContext("2d");

  const state = {
    runId: null,
    member: null,
    familyId: "featured",
    overlayId: null,
    domainId: DEFAULT_DOMAIN_ID,
    hour: 0,
    playDelay: Number(dom.speedSelect.value) || 700,
    playing: false,
    lastHour: 0,
  };

  const refs = {
    runs: [],
    runMap: new Map(),
    layerMap: new Map(),
    domainMap: new Map(),
    index: null,
    statesGeo: [],
  };

  const imageCache = new Map();
  let playTimer = null;
  let renderTicket = 0;
  let resizeFrame = 0;

  init().catch((error) => {
    console.error(error);
    dom.runBadge.textContent = "Snapshot load failed";
    dom.loading.hidden = false;
    dom.loading.textContent = "Snapshot load failed";
  });

  async function init() {
    const [runsPayload, layersPayload, domainsPayload, indexPayload, statesPayload] = await Promise.all([
      loadJson(`${STATIC_ROOT}/runs.json`),
      loadJson(`${STATIC_ROOT}/layers.json`),
      loadJson(`${STATIC_ROOT}/domains.json`),
      loadJson(`${STATIC_ROOT}/products-index.json`),
      loadJson("./us-states.geojson"),
    ]);

    refs.runs = Array.isArray(runsPayload.runs) ? runsPayload.runs.slice() : [];
    refs.runMap = new Map(refs.runs.map((run) => [run.run_id, run]));
    refs.layerMap = new Map((layersPayload.weatherOverlays || []).map((overlay) => [overlay.id, overlay]));
    refs.domainMap = new Map((domainsPayload.domains || []).map((domain) => [domain.id, domain]));
    refs.index = indexPayload.runs || {};
    refs.statesGeo = (statesPayload.features || []).filter((feature) => {
      const name = feature && feature.properties ? feature.properties.name : "";
      return !["Alaska", "Hawaii", "Puerto Rico"].includes(name);
    });

    hydrateStateFromUrl();
    seedDefaults(layersPayload.defaults || {});
    bindEvents();
    renderAll();
    window.addEventListener("resize", handleResize);
  }

  function bindEvents() {
    dom.runSelect.addEventListener("change", () => {
      state.runId = dom.runSelect.value;
      state.member = null;
      state.overlayId = null;
      ensureConsistentState();
      renderAll();
    });

    dom.memberSelect.addEventListener("change", () => {
      state.member = dom.memberSelect.value;
      if (!state.overlayId || !getAvailableOverlays(state.runId, state.member).some((overlay) => overlay.id === state.overlayId)) {
        state.overlayId = DEFAULT_OVERLAY_BY_MEMBER[state.member] || null;
      }
      ensureConsistentState();
      renderAll();
    });

    dom.domainSelect.addEventListener("change", () => {
      state.domainId = dom.domainSelect.value;
      renderHeader();
      renderFrame();
      updateUrl();
    });

    dom.familySelect.addEventListener("change", () => {
      state.familyId = dom.familySelect.value;
      ensureConsistentState();
      renderAll();
    });

    dom.overlaySelect.addEventListener("change", () => {
      state.overlayId = dom.overlaySelect.value;
      const family = FAMILY_CONFIG.find((item) => overlayMatchesFamily(state.overlayId, item.id));
      if (family) {
        state.familyId = family.id;
      }
      ensureConsistentState();
      renderAll();
    });

    dom.prevHourButton.addEventListener("click", () => stepHour(-1));
    dom.nextHourButton.addEventListener("click", () => stepHour(1));
    dom.playButton.addEventListener("click", togglePlayback);

    dom.speedSelect.addEventListener("change", () => {
      state.playDelay = Number(dom.speedSelect.value) || 700;
      if (state.playing) {
        stopPlayback();
        startPlayback();
      }
    });

    dom.hourRange.addEventListener("input", () => {
      state.hour = Number(dom.hourRange.value);
      ensureConsistentState();
      renderHeader();
      renderTimeline();
      renderFrame();
      updateUrl();
    });
  }

  function hydrateStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    state.runId = params.get("run");
    state.member = params.get("member");
    state.overlayId = params.get("overlay");
    state.domainId = params.get("proj") || DEFAULT_DOMAIN_ID;
    state.familyId = params.get("family") || "featured";

    const parsedHour = Number(params.get("fhr"));
    if (Number.isFinite(parsedHour) && parsedHour >= 0) {
      state.hour = parsedHour;
      state.lastHour = parsedHour;
    }
  }

  function seedDefaults(defaults) {
    if (!state.runId && refs.runs.length) {
      state.runId = refs.runs[0].run_id;
    }
    if (!state.member) {
      state.member = DEFAULT_OVERLAY_BY_MEMBER[defaults.member] ? defaults.member : "ens";
    }
    if (!state.overlayId) {
      state.overlayId = DEFAULT_OVERLAY_BY_MEMBER[state.member] || defaults.weatherOverlay || null;
    }
    if (!refs.domainMap.has(state.domainId)) {
      state.domainId = DEFAULT_DOMAIN_ID;
    }
    if (!FAMILY_CONFIG.some((item) => item.id === state.familyId)) {
      state.familyId = "featured";
    }
    ensureConsistentState();
  }

  function ensureConsistentState() {
    if (!refs.runMap.has(state.runId) && refs.runs.length) {
      state.runId = refs.runs[0].run_id;
    }

    const members = getAvailableMembers(state.runId);
    if (!members.length) {
      return;
    }
    if (!members.includes(state.member)) {
      state.member = members.includes("ens") ? "ens" : members[0];
    }
    if (!refs.domainMap.has(state.domainId)) {
      state.domainId = DEFAULT_DOMAIN_ID;
    }

    let familyOverlays = getOverlaysForFamily(state.runId, state.member, state.familyId);
    if (!familyOverlays.length) {
      const fallback = findFirstAvailableFamily(state.runId, state.member);
      state.familyId = fallback ? fallback.id : "featured";
      familyOverlays = getOverlaysForFamily(state.runId, state.member, state.familyId);
    }
    if (!familyOverlays.length) {
      state.overlayId = null;
      return;
    }
    if (!familyOverlays.some((overlay) => overlay.id === state.overlayId)) {
      const preferred = DEFAULT_OVERLAY_BY_MEMBER[state.member];
      const preferredOverlay = familyOverlays.find((overlay) => overlay.id === preferred);
      state.overlayId = preferredOverlay ? preferredOverlay.id : familyOverlays[0].id;
    }

    const availableHours = getOverlayHours(state.runId, state.member, state.overlayId);
    state.hour = availableHours.length ? nearestHour(availableHours, state.hour) : 0;
  }

  function renderAll() {
    renderRunOptions();
    renderMemberOptions();
    renderDomainOptions();
    renderFamilyOptions();
    renderOverlayOptions();
    renderPresetStrip();
    renderHeader();
    renderLegend();
    renderTimeline();
    renderFrame();
    renderInsight();
    updateUrl();
  }

  function renderRunOptions() {
    dom.runSelect.innerHTML = "";
    for (const run of refs.runs) {
      const option = document.createElement("option");
      option.value = run.run_id;
      option.textContent = `${formatRunStamp(run.run_id)}${run.status === "ready" ? "" : " partial"}`;
      option.selected = run.run_id === state.runId;
      dom.runSelect.appendChild(option);
    }
  }

  function renderMemberOptions() {
    dom.memberSelect.innerHTML = "";
    for (const member of getAvailableMembers(state.runId)) {
      const option = document.createElement("option");
      option.value = member;
      option.textContent = MEMBER_LABELS[member] || member.toUpperCase();
      option.selected = member === state.member;
      dom.memberSelect.appendChild(option);
    }
  }

  function renderDomainOptions() {
    dom.domainSelect.innerHTML = "";
    for (const domain of refs.domainMap.values()) {
      const option = document.createElement("option");
      option.value = domain.id;
      option.textContent = domain.label;
      option.selected = domain.id === state.domainId;
      dom.domainSelect.appendChild(option);
    }
  }

  function renderFamilyOptions() {
    dom.familySelect.innerHTML = "";
    for (const family of FAMILY_CONFIG) {
      const overlays = getOverlaysForFamily(state.runId, state.member, family.id);
      if (!overlays.length) {
        continue;
      }
      const option = document.createElement("option");
      option.value = family.id;
      option.textContent = family.label;
      option.selected = family.id === state.familyId;
      dom.familySelect.appendChild(option);
    }
  }

  function renderOverlayOptions() {
    const overlays = getOverlaysForFamily(state.runId, state.member, state.familyId);
    dom.overlaySelect.innerHTML = "";
    for (const overlay of overlays) {
      const option = document.createElement("option");
      option.value = overlay.id;
      option.textContent = overlay.label;
      option.selected = overlay.id === state.overlayId;
      dom.overlaySelect.appendChild(option);
    }
  }

  function renderPresetStrip() {
    dom.presetStrip.innerHTML = "";
    for (const preset of QUICK_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-button";
      button.textContent = preset.label;
      if (state.member === preset.member && state.overlayId === preset.overlay && state.domainId === preset.domain) {
        button.classList.add("is-active");
      }
      button.addEventListener("click", () => {
        state.member = preset.member;
        state.familyId = preset.family;
        state.overlayId = preset.overlay;
        state.domainId = preset.domain;
        ensureConsistentState();
        renderAll();
      });
      dom.presetStrip.appendChild(button);
    }
  }

  function renderHeader() {
    const run = refs.runMap.get(state.runId);
    const overlay = refs.layerMap.get(state.overlayId);
    const domain = refs.domainMap.get(state.domainId);

    dom.runBadge.textContent = `Latest ready · ${formatRunStamp(state.runId)}${run && run.status !== "ready" ? " partial" : ""}`;
    dom.overlayFamilyLabel.textContent = familyLabel(state.familyId);
    dom.productTitle.textContent = overlay ? `${overlay.label} | ${domain ? domain.label : "CONUS"}` : "Forecast product";
    dom.metaInit.textContent = `${formatRunStamp(state.runId)} init`;
    dom.metaValid.textContent = `${formatValidStamp(state.runId, state.hour)} valid`;
    dom.metaMember.textContent = MEMBER_LABELS[state.member] || state.member.toUpperCase();
  }

  function renderLegend() {
    const overlay = refs.layerMap.get(state.overlayId);
    const style = overlay && overlay.style ? overlay.style : {};
    dom.legendLabel.textContent = overlay ? overlay.label : "Legend";
    dom.legendUnits.textContent = isProbabilityOverlay(state.overlayId) ? "%" : style.units || "";
    dom.legendScale.innerHTML = "";

    if (!overlay) {
      return;
    }

    const colors = Array.isArray(style.colors) ? style.colors : [];
    const labels = Array.isArray(style.labels) ? style.labels : [];
    if (!colors.length) {
      return;
    }

    const isCategorical =
      style.type === "categorical" ||
      overlay.id === "ptype" ||
      (colors.length <= 5 && labels.length === colors.length && !style.range && !isProbabilityOverlay(overlay.id));

    if (isCategorical) {
      colors.forEach((color, index) => {
        const chip = document.createElement("div");
        chip.className = "legend-chip";
        chip.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${labels[index] || ""}</span>`;
        dom.legendScale.appendChild(chip);
      });
      return;
    }

    const bar = document.createElement("div");
    bar.className = "legend-bar";
    bar.style.setProperty("--stop-count", String(colors.length));
    colors.forEach((color) => {
      const stop = document.createElement("span");
      stop.className = "legend-stop";
      stop.style.background = color;
      bar.appendChild(stop);
    });

    const ticks = document.createElement("div");
    ticks.className = "legend-ticks";
    const tickValues = labels.length
      ? [labels[0], labels[Math.floor((labels.length - 1) / 2)], labels[labels.length - 1]]
      : [formatNumber(style.range && style.range[0]), "", formatNumber(style.range && style.range[1])];
    ticks.style.setProperty("--tick-count", String(tickValues.length));
    tickValues.forEach((value) => {
      const span = document.createElement("span");
      span.textContent = value || "";
      ticks.appendChild(span);
    });

    dom.legendScale.appendChild(bar);
    dom.legendScale.appendChild(ticks);
  }

  function renderTimeline() {
    const hours = getOverlayHours(state.runId, state.member, state.overlayId);
    const minHour = hours.length ? hours[0] : 0;
    const maxHour = hours.length ? hours[hours.length - 1] : 0;

    dom.hourRange.min = String(minHour);
    dom.hourRange.max = String(maxHour);
    dom.hourRange.value = String(state.hour);
    dom.hourLabel.textContent = `F${padHour(state.hour)}`;
    dom.validLabel.textContent = formatValidStamp(state.runId, state.hour);
    dom.playButton.classList.toggle("is-active", state.playing);
    dom.playButton.textContent = state.playing ? "Pause" : "Play";

    dom.hourChips.innerHTML = "";
    for (const hour of hours) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "hour-chip";
      chip.textContent = `+${padHour(hour)}`;
      if (hour === state.hour) {
        chip.classList.add("is-active");
      }
      chip.addEventListener("click", () => {
        state.hour = hour;
        stopPlayback();
        renderHeader();
        renderTimeline();
        renderFrame();
        updateUrl();
      });
      dom.hourChips.appendChild(chip);
    }
  }

  function renderInsight() {
    const overlay = refs.layerMap.get(state.overlayId);
    const meta = getOverlayMeta(state.overlayId);
    if (!overlay) {
      dom.fieldDescription.textContent = "Forecast field details unavailable.";
      dom.fieldHint.textContent = "";
      return;
    }
    dom.fieldDescription.textContent = meta.description || `${overlay.label} from the latest ready HRRRCast severe snapshot.`;
    dom.fieldHint.textContent = meta.hint || (isProbabilityOverlay(overlay.id)
      ? "Probability fields show the share of ensemble members exceeding the labeled threshold."
      : "Single-member fields show one member’s solution and can be noisier than ensemble probabilities.");
  }

  function renderFrame() {
    if (!state.overlayId) {
      return;
    }

    const currentTicket = ++renderTicket;
    const frameDomainId = getFrameDomainId(state.runId, state.member, state.overlayId, state.hour, state.domainId);
    const key = getFrameKey(state.runId, state.member, state.overlayId, state.hour, frameDomainId);
    dom.loading.hidden = false;
    dom.loading.textContent = "Loading frame";

    getImageForFrame(key)
      .then((image) => {
        if (currentTicket !== renderTicket) {
          return;
        }
        drawFrame(image, frameDomainId);
        dom.loading.hidden = true;
        preloadNeighborFrames();
      })
      .catch((error) => {
        console.error(error);
        if (currentTicket !== renderTicket) {
          return;
        }
        clearCanvas();
        dom.loading.hidden = false;
        dom.loading.textContent = "Frame unavailable";
      });
  }

  function drawFrame(image, frameDomainId) {
    const rect = dom.imageShell.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;

    dom.canvas.width = Math.max(1, Math.round(width * dpr));
    dom.canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const usesNativeDomainFrame = frameDomainId === state.domainId;
    const viewBBox = getViewBBox(width, height, state.domainId);
    if (usesNativeDomainFrame) {
      ctx.drawImage(image, 0, 0, width, height);
    } else {
      const crop = computeCropRect(viewBBox, image.naturalWidth, image.naturalHeight);
      ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
    }

    const vignette = ctx.createLinearGradient(0, 0, 0, height);
    vignette.addColorStop(0, "rgba(7, 16, 28, 0.04)");
    vignette.addColorStop(0.8, "rgba(7, 16, 28, 0)");
    vignette.addColorStop(1, "rgba(7, 16, 28, 0.08)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    drawStateOverlay(viewBBox, width, height);
  }

  function clearCanvas() {
    const rect = dom.imageShell.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    dom.canvas.width = Math.max(1, Math.round(width * dpr));
    dom.canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0f1925";
    ctx.fillRect(0, 0, width, height);
  }

  function getViewBBox(viewWidth, viewHeight, domainId) {
    const domain = refs.domainMap.get(domainId) || refs.domainMap.get(SOURCE_DOMAIN_ID);
    const targetBBox = domain && domain.viewport ? domain.viewport.bbox : SOURCE_BBOX;
    return fitBBoxToAspect(targetBBox, viewWidth / viewHeight, domainId, SOURCE_BBOX);
  }

  function computeCropRect(viewBBox, imageWidth, imageHeight) {
    const sourceWidth = SOURCE_BBOX[2] - SOURCE_BBOX[0];
    const sourceHeight = SOURCE_BBOX[3] - SOURCE_BBOX[1];
    const left = (viewBBox[0] - SOURCE_BBOX[0]) / sourceWidth;
    const right = (viewBBox[2] - SOURCE_BBOX[0]) / sourceWidth;
    const top = (SOURCE_BBOX[3] - viewBBox[3]) / sourceHeight;
    const bottom = (SOURCE_BBOX[3] - viewBBox[1]) / sourceHeight;

    return {
      sx: clamp(left, 0, 1) * imageWidth,
      sy: clamp(top, 0, 1) * imageHeight,
      sw: Math.max(1, (clamp(right, 0, 1) - clamp(left, 0, 1)) * imageWidth),
      sh: Math.max(1, (clamp(bottom, 0, 1) - clamp(top, 0, 1)) * imageHeight),
    };
  }

  function drawStateOverlay(viewBBox, width, height) {
    if (!refs.statesGeo.length) {
      return;
    }

    const highlightedStates = new Set(REGION_STATE_NAMES[state.domainId] || []);
    const scaleX = width / (viewBBox[2] - viewBBox[0]);
    const scaleY = height / (viewBBox[3] - viewBBox[1]);

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (const feature of refs.statesGeo) {
      if (!featureIntersectsBBox(feature, viewBBox)) {
        continue;
      }

      const name = feature.properties ? feature.properties.name : "";
      const isHighlighted = highlightedStates.has(name);
      const polygons = feature.geometry && feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : (feature.geometry && feature.geometry.coordinates) || [];

      ctx.beginPath();
      for (const polygon of polygons) {
        for (const ring of polygon) {
          ring.forEach((point, index) => {
            const x = (point[0] - viewBBox[0]) * scaleX;
            const y = (viewBBox[3] - point[1]) * scaleY;
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.closePath();
        }
      }

      if (isHighlighted) {
        ctx.fillStyle = "rgba(231, 154, 55, 0.05)";
        ctx.fill();
      }

      ctx.strokeStyle = isHighlighted ? "rgba(28, 42, 58, 0.84)" : "rgba(27, 43, 61, 0.74)";
      ctx.lineWidth = isHighlighted ? 2.2 : 1.5;
      ctx.stroke();
      ctx.strokeStyle = isHighlighted ? "rgba(248, 250, 252, 0.98)" : "rgba(240, 245, 251, 0.84)";
      ctx.lineWidth = isHighlighted ? 0.95 : 0.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  function featureIntersectsBBox(feature, bbox) {
    const polygons = feature.geometry && feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : (feature.geometry && feature.geometry.coordinates) || [];

    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const point of ring) {
          if (point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3]) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function fitBBoxToAspect(targetBBox, aspect, domainId, bounds) {
    const pad = DOMAIN_PADDING[domainId] || DOMAIN_PADDING[SOURCE_DOMAIN_ID];
    let minLon = targetBBox[0] - (targetBBox[2] - targetBBox[0]) * pad.x;
    let maxLon = targetBBox[2] + (targetBBox[2] - targetBBox[0]) * pad.x;
    let minLat = targetBBox[1] - (targetBBox[3] - targetBBox[1]) * pad.y;
    let maxLat = targetBBox[3] + (targetBBox[3] - targetBBox[1]) * pad.y;

    let width = maxLon - minLon;
    let height = maxLat - minLat;
    if (width / height > aspect) {
      const targetHeight = width / aspect;
      const delta = (targetHeight - height) / 2;
      minLat -= delta;
      maxLat += delta;
    } else {
      const targetWidth = height * aspect;
      const delta = (targetWidth - width) / 2;
      minLon -= delta;
      maxLon += delta;
    }

    width = maxLon - minLon;
    height = maxLat - minLat;
    const boundWidth = bounds[2] - bounds[0];
    const boundHeight = bounds[3] - bounds[1];

    if (width > boundWidth) {
      minLon = bounds[0];
      maxLon = bounds[2];
    } else if (minLon < bounds[0]) {
      maxLon += bounds[0] - minLon;
      minLon = bounds[0];
    } else if (maxLon > bounds[2]) {
      minLon -= maxLon - bounds[2];
      maxLon = bounds[2];
    }

    if (height > boundHeight) {
      minLat = bounds[1];
      maxLat = bounds[3];
    } else if (minLat < bounds[1]) {
      maxLat += bounds[1] - minLat;
      minLat = bounds[1];
    } else if (maxLat > bounds[3]) {
      minLat -= maxLat - bounds[3];
      maxLat = bounds[3];
    }

    return [minLon, minLat, maxLon, maxLat];
  }

  function getImageForFrame(key) {
    if (imageCache.has(key)) {
      const entry = imageCache.get(key);
      imageCache.delete(key);
      imageCache.set(key, entry);
      return entry.promise;
    }

    const image = new Image();
    image.decoding = "async";
    const promise = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load ${key}`));
    });

    image.src = getFrameUrlFromKey(key);
    imageCache.set(key, { promise });
    trimImageCache();
    return promise;
  }

  function preloadNeighborFrames() {
    const hours = getOverlayHours(state.runId, state.member, state.overlayId);
    if (!hours.length) {
      return;
    }

    const direction = state.hour >= state.lastHour ? 1 : -1;
    state.lastHour = state.hour;
    const offsets = direction > 0 ? [1, 2, 3, -1, 4, -2, 5, -3] : [-1, -2, -3, 1, -4, 2, -5, 3];

    for (const offset of offsets) {
      const target = nearestHour(hours, state.hour + offset);
      if (target === state.hour) {
        continue;
      }
      const frameDomainId = getFrameDomainId(state.runId, state.member, state.overlayId, target, state.domainId);
      getImageForFrame(getFrameKey(state.runId, state.member, state.overlayId, target, frameDomainId)).catch(() => {});
    }
  }

  function trimImageCache() {
    while (imageCache.size > CACHE_LIMIT) {
      imageCache.delete(imageCache.keys().next().value);
    }
  }

  function stepHour(direction) {
    const hours = getOverlayHours(state.runId, state.member, state.overlayId);
    if (!hours.length) {
      return;
    }

    const currentIndex = hours.indexOf(state.hour);
    state.hour = hours[(currentIndex + direction + hours.length) % hours.length];
    stopPlayback();
    renderHeader();
    renderTimeline();
    renderFrame();
    updateUrl();
  }

  function togglePlayback() {
    if (state.playing) {
      stopPlayback();
      renderTimeline();
      return;
    }
    startPlayback();
    renderTimeline();
  }

  function startPlayback() {
    stopPlayback();
    state.playing = true;
    playTimer = window.setInterval(() => {
      const hours = getOverlayHours(state.runId, state.member, state.overlayId);
      if (!hours.length) {
        stopPlayback();
        return;
      }
      const currentIndex = hours.indexOf(state.hour);
      state.hour = hours[(currentIndex + 1) % hours.length];
      renderHeader();
      renderTimeline();
      renderFrame();
      updateUrl();
    }, state.playDelay);
  }

  function stopPlayback() {
    state.playing = false;
    if (playTimer !== null) {
      window.clearInterval(playTimer);
      playTimer = null;
    }
  }

  function handleResize() {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      renderFrame();
    });
  }

  function updateUrl() {
    const params = new URLSearchParams();
    params.set("run", state.runId);
    params.set("member", state.member);
    params.set("overlay", state.overlayId);
    params.set("proj", state.domainId);
    params.set("fhr", String(state.hour));
    params.set("family", state.familyId);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }

  function getFrameKey(runId, member, overlayId, hour, domainId) {
    return [runId, member, overlayId, padHour(hour), domainId, prefersMobilePreview() ? "mobile" : "desktop"].join("|");
  }

  function getFrameUrlFromKey(key) {
    const [runId, member, overlayId, hour, domainId, variant] = key.split("|");
    const suffix = variant === "mobile" ? ".mobile.webp" : ".preview.png";
    return `${STATIC_ROOT}/products/${runId}/${member}/${overlayId}/f${hour}/${domainId}${suffix}?v=${runId}`;
  }

  function prefersMobilePreview() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function getAvailableMembers(runId) {
    const run = refs.index[runId];
    if (!run || !run.members) {
      return [];
    }
    const members = Object.keys(run.members);
    return members.sort((left, right) => {
      if (left === right) {
        return 0;
      }
      if (left === "ens") {
        return -1;
      }
      if (right === "ens") {
        return 1;
      }
      return left.localeCompare(right);
    });
  }

  function getOverlayHours(runId, member, overlayId) {
    const run = refs.index[runId];
    if (!run || !run.members || !run.members[member]) {
      return [];
    }
    const hours = [];
    const forecastHours = run.members[member].forecast_hours || {};
    for (const [hourKey, hourData] of Object.entries(forecastHours)) {
      if (hourData.overlays && overlayId in hourData.overlays) {
        hours.push(Number(hourKey.slice(1)));
      }
    }
    return hours.sort((left, right) => left - right);
  }

  function getFrameDomainId(runId, member, overlayId, forecastHour, requestedDomainId) {
    const domains = getOverlayDomains(runId, member, overlayId, forecastHour);
    if (domains.includes(requestedDomainId)) {
      return requestedDomainId;
    }
    if (domains.includes(SOURCE_DOMAIN_ID)) {
      return SOURCE_DOMAIN_ID;
    }
    return domains[0] || SOURCE_DOMAIN_ID;
  }

  function getOverlayDomains(runId, member, overlayId, forecastHour) {
    const run = refs.index[runId];
    if (!run || !run.members || !run.members[member]) {
      return [];
    }
    const forecastHours = run.members[member].forecast_hours || {};
    const hourToken = `f${padHour(forecastHour)}`;
    const hourData = forecastHours[hourToken];
    if (!hourData || !hourData.overlays || !hourData.overlays[overlayId]) {
      return [];
    }
    return hourData.overlays[overlayId].slice();
  }

  function getAvailableOverlays(runId, member) {
    const run = refs.index[runId];
    if (!run || !run.members || !run.members[member]) {
      return [];
    }

    const overlayIds = new Set();
    for (const hourData of Object.values(run.members[member].forecast_hours || {})) {
      for (const overlayId of Object.keys(hourData.overlays || {})) {
        overlayIds.add(overlayId);
      }
    }

    return [...overlayIds]
      .map((id) => refs.layerMap.get(id))
      .filter((overlay) => overlay && isPublicOverlay(overlay.id))
      .sort(sortOverlayList);
  }

  function getOverlaysForFamily(runId, member, familyId) {
    return getAvailableOverlays(runId, member).filter((overlay) => overlayMatchesFamily(overlay.id, familyId));
  }

  function findFirstAvailableFamily(runId, member) {
    return FAMILY_CONFIG.find((family) => getOverlaysForFamily(runId, member, family.id).length) || null;
  }

  function familyLabel(familyId) {
    return (FAMILY_CONFIG.find((item) => item.id === familyId) || { label: "Featured" }).label;
  }

  function sortOverlayList(left, right) {
    const leftMeta = getOverlayMeta(left.id);
    const rightMeta = getOverlayMeta(right.id);
    const leftOrder = typeof leftMeta.order === "number" ? leftMeta.order : 999;
    const rightOrder = typeof rightMeta.order === "number" ? rightMeta.order : 999;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.label.localeCompare(right.label);
  }

  function getOverlayMeta(overlayId) {
    return PUBLIC_OVERLAY_META[overlayId] || {};
  }

  function isPublicOverlay(overlayId) {
    return Object.prototype.hasOwnProperty.call(PUBLIC_OVERLAY_META, overlayId);
  }

  function overlayMatchesFamily(overlayId, familyId) {
    const meta = getOverlayMeta(overlayId);
    if (!meta) {
      return false;
    }
    if (familyId === "all") {
      return true;
    }
    if (familyId === "featured") {
      return Boolean(meta.featured);
    }
    return meta.family === familyId;
  }

  function isProbabilityOverlay(overlayId) {
    return typeof overlayId === "string" && overlayId.includes("_probability_");
  }

  function nearestHour(hours, target) {
    if (!hours.length) {
      return 0;
    }
    if (hours.includes(target)) {
      return target;
    }
    let best = hours[0];
    let bestDistance = Math.abs(best - target);
    for (const hour of hours) {
      const distance = Math.abs(hour - target);
      if (distance < bestDistance) {
        best = hour;
        bestDistance = distance;
      }
    }
    return best;
  }

  function formatRunStamp(runId) {
    return formatStamp(parseRunDate(runId));
  }

  function formatValidStamp(runId, forecastHour) {
    const date = parseRunDate(runId);
    date.setUTCHours(date.getUTCHours() + forecastHour);
    return formatStamp(date);
  }

  function parseRunDate(runId) {
    const year = Number(runId.slice(0, 4));
    const month = Number(runId.slice(4, 6)) - 1;
    const day = Number(runId.slice(6, 8));
    const hour = Number(runId.slice(8, 10));
    return new Date(Date.UTC(year, month, day, hour));
  }

  function formatStamp(date) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${String(date.getUTCHours()).padStart(2, "0")}Z ${months[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function padHour(value) {
    return String(value).padStart(3, "0");
  }

  function formatNumber(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "";
    }
    return Math.abs(value) >= 100 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: "default" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return response.json();
  }
})();
