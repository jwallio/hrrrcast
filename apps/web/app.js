(function () {
  "use strict";

  const STATIC_ROOT = "./static-api";
  const SOURCE_DOMAIN_ID = "conus";
  const MOBILE_BREAKPOINT = 720;
  const CACHE_LIMIT = 48;
  const SOURCE_BBOX = [-127.0, 23.0, -66.0, 50.0];

  const FAMILY_CONFIG = [
    {
      id: "featured",
      label: "Featured",
      match: (overlay) => overlay.featured && overlay.group !== "native",
    },
    {
      id: "precip",
      label: "Precip",
      match: (overlay) =>
        ["precipitation", "radar", "winter", "moisture"].includes(overlay.family),
    },
    {
      id: "severe",
      label: "Severe",
      match: (overlay) => overlay.family === "severe",
    },
    {
      id: "surface",
      label: "Surface",
      match: (overlay) => ["surface", "synoptic", "temperature"].includes(overlay.family),
    },
    {
      id: "upper_air",
      label: "Upper",
      match: (overlay) => overlay.family === "upper_air",
    },
    {
      id: "wind",
      label: "Wind",
      match: (overlay) => ["wind", "dynamics"].includes(overlay.family),
    },
    {
      id: "clouds",
      label: "Clouds",
      match: (overlay) => overlay.family === "clouds",
    },
    {
      id: "ensemble",
      label: "Ens",
      match: (overlay) => overlay.family === "ensemble",
    },
  ];

  const DOMAIN_PADDING = {
    conus: { x: 0.02, y: 0.04 },
    southeast: { x: 0.1, y: 0.14 },
    northeast: { x: 0.12, y: 0.15 },
    south_central: { x: 0.12, y: 0.16 },
    northwest: { x: 0.12, y: 0.14 },
    southwest: { x: 0.12, y: 0.14 },
    carolinas: { x: 0.2, y: 0.2 },
  };

  const MEMBER_LABELS = {
    ens: "Ensemble",
    m00: "Member 00",
  };

  const dom = {
    runBadge: document.getElementById("runBadge"),
    familyStrip: document.getElementById("familyStrip"),
    runSelect: document.getElementById("runSelect"),
    domainSelect: document.getElementById("domainSelect"),
    memberSelect: document.getElementById("memberSelect"),
    overlaySelect: document.getElementById("overlaySelect"),
    overlayFamilyLabel: document.getElementById("overlayFamilyLabel"),
    productTitle: document.getElementById("productTitle"),
    metaInit: document.getElementById("metaInit"),
    metaValid: document.getElementById("metaValid"),
    metaMember: document.getElementById("metaMember"),
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
    domainId: SOURCE_DOMAIN_ID,
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
    const [runsPayload, layersPayload, domainsPayload, indexPayload] = await Promise.all([
      loadJson(`${STATIC_ROOT}/runs.json`),
      loadJson(`${STATIC_ROOT}/layers.json`),
      loadJson(`${STATIC_ROOT}/domains.json`),
      loadJson(`${STATIC_ROOT}/products-index.json`),
    ]);

    refs.runs = Array.isArray(runsPayload.runs) ? runsPayload.runs.slice() : [];
    refs.runMap = new Map(refs.runs.map((run) => [run.run_id, run]));
    refs.layerMap = new Map(
      (layersPayload.weatherOverlays || []).map((overlay) => [overlay.id, overlay])
    );
    refs.domainMap = new Map(
      (domainsPayload.domains || []).map((domain) => [domain.id, domain])
    );
    refs.index = indexPayload.runs || {};

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

    dom.domainSelect.addEventListener("change", () => {
      state.domainId = dom.domainSelect.value;
      renderHeader();
      updateUrl();
      renderFrame();
    });

    dom.memberSelect.addEventListener("change", () => {
      state.member = dom.memberSelect.value;
      ensureConsistentState();
      renderAll();
    });

    dom.overlaySelect.addEventListener("change", () => {
      state.overlayId = dom.overlaySelect.value;
      const family = FAMILY_CONFIG.find((item) =>
        item.match(refs.layerMap.get(state.overlayId) || {})
      );
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
    state.domainId = params.get("proj") || SOURCE_DOMAIN_ID;
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
      state.member = defaults.member || "ens";
    }
    if (!state.overlayId) {
      state.overlayId = defaults.weatherOverlay || null;
    }
    if (!refs.domainMap.has(state.domainId)) {
      state.domainId = SOURCE_DOMAIN_ID;
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
      state.member = members[0];
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
      state.overlayId = familyOverlays[0].id;
    }

    const availableHours = getOverlayHours(state.runId, state.member, state.overlayId);
    if (availableHours.length) {
      state.hour = nearestHour(availableHours, state.hour);
    } else {
      state.hour = 0;
    }

    if (!refs.domainMap.has(state.domainId)) {
      state.domainId = SOURCE_DOMAIN_ID;
    }
  }

  function renderAll() {
    renderRunOptions();
    renderMemberOptions();
    renderFamilyStrip();
    renderOverlayOptions();
    renderHeader();
    renderLegend();
    renderTimeline();
    renderFrame();
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

    dom.domainSelect.innerHTML = "";
    for (const domain of refs.domainMap.values()) {
      const option = document.createElement("option");
      option.value = domain.id;
      option.textContent = domain.label;
      option.selected = domain.id === state.domainId;
      dom.domainSelect.appendChild(option);
    }
  }

  function renderMemberOptions() {
    const members = getAvailableMembers(state.runId);
    dom.memberSelect.innerHTML = "";
    for (const member of members) {
      const option = document.createElement("option");
      option.value = member;
      option.textContent = MEMBER_LABELS[member] || member.toUpperCase();
      option.selected = member === state.member;
      dom.memberSelect.appendChild(option);
    }
  }

  function renderFamilyStrip() {
    dom.familyStrip.innerHTML = "";
    for (const family of FAMILY_CONFIG) {
      const enabled = getOverlaysForFamily(state.runId, state.member, family.id).length > 0;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "family-button";
      button.textContent = family.label;
      button.disabled = !enabled;
      button.setAttribute("aria-pressed", String(state.familyId === family.id));
      button.addEventListener("click", () => {
        state.familyId = family.id;
        ensureConsistentState();
        renderAll();
      });
      dom.familyStrip.appendChild(button);
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

  function renderHeader() {
    const run = refs.runMap.get(state.runId);
    const overlay = refs.layerMap.get(state.overlayId);
    const domain = refs.domainMap.get(state.domainId);

    dom.runBadge.textContent = `Run ${formatRunStamp(state.runId)}${run && run.status !== "ready" ? " partial" : ""}`;
    dom.overlayFamilyLabel.textContent = familyLabel(state.familyId);
    dom.productTitle.textContent = overlay
      ? `${overlay.label} | ${domain ? domain.label : "CONUS"}`
      : "Forecast product";
    dom.metaInit.textContent = `${formatRunStamp(state.runId)} init`;
    dom.metaValid.textContent = `${formatValidStamp(state.runId, state.hour)} valid`;
    dom.metaMember.textContent = MEMBER_LABELS[state.member] || state.member.toUpperCase();
  }

  function renderLegend() {
    const overlay = refs.layerMap.get(state.overlayId);
    const style = overlay && overlay.style ? overlay.style : {};
    dom.legendLabel.textContent = overlay ? overlay.label : "Legend";
    dom.legendUnits.textContent = style.units || "";
    dom.legendScale.innerHTML = "";

    if (!overlay || !style) {
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
      colors.length <= 5 && labels.length === colors.length && !style.range;

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

  function renderFrame() {
    if (!state.overlayId) {
      return;
    }

    const currentTicket = ++renderTicket;
    const key = getFrameKey(state.runId, state.member, state.overlayId, state.hour);
    dom.loading.hidden = false;
    dom.loading.textContent = "Loading frame";

    getImageForFrame(key)
      .then((image) => {
        if (currentTicket !== renderTicket) {
          return;
        }
        drawFrame(image);
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

  function drawFrame(image) {
    const rect = dom.imageShell.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;

    dom.canvas.width = Math.max(1, Math.round(width * dpr));
    dom.canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const crop = computeCropRect(width, height, state.domainId, image.naturalWidth, image.naturalHeight);
    ctx.drawImage(
      image,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      width,
      height
    );

    const vignette = ctx.createLinearGradient(0, 0, 0, height);
    vignette.addColorStop(0, "rgba(7, 16, 28, 0.08)");
    vignette.addColorStop(0.8, "rgba(7, 16, 28, 0)");
    vignette.addColorStop(1, "rgba(7, 16, 28, 0.12)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
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

  function computeCropRect(viewWidth, viewHeight, domainId, imageWidth, imageHeight) {
    const source = SOURCE_BBOX;
    const domain = refs.domainMap.get(domainId) || refs.domainMap.get(SOURCE_DOMAIN_ID);
    const targetBBox = domain && domain.viewport ? domain.viewport.bbox : source;
    const paddedBBox = fitBBoxToAspect(targetBBox, viewWidth / viewHeight, domainId, source);

    const sourceWidth = source[2] - source[0];
    const sourceHeight = source[3] - source[1];
    const left = (paddedBBox[0] - source[0]) / sourceWidth;
    const right = (paddedBBox[2] - source[0]) / sourceWidth;
    const top = (source[3] - paddedBBox[3]) / sourceHeight;
    const bottom = (source[3] - paddedBBox[1]) / sourceHeight;

    return {
      sx: clamp(left, 0, 1) * imageWidth,
      sy: clamp(top, 0, 1) * imageHeight,
      sw: Math.max(1, (clamp(right, 0, 1) - clamp(left, 0, 1)) * imageWidth),
      sh: Math.max(1, (clamp(bottom, 0, 1) - clamp(top, 0, 1)) * imageHeight),
    };
  }

  function fitBBoxToAspect(targetBBox, aspect, domainId, bounds) {
    const pad = DOMAIN_PADDING[domainId] || DOMAIN_PADDING[SOURCE_DOMAIN_ID];
    let minLon = targetBBox[0];
    let minLat = targetBBox[1];
    let maxLon = targetBBox[2];
    let maxLat = targetBBox[3];

    const expandLon = (maxLon - minLon) * pad.x;
    const expandLat = (maxLat - minLat) * pad.y;
    minLon -= expandLon;
    maxLon += expandLon;
    minLat -= expandLat;
    maxLat += expandLat;

    let width = maxLon - minLon;
    let height = maxLat - minLat;
    const currentAspect = width / height;

    if (currentAspect > aspect) {
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
      const key = getFrameKey(state.runId, state.member, state.overlayId, target);
      getImageForFrame(key).catch(() => {});
    }
  }

  function trimImageCache() {
    while (imageCache.size > CACHE_LIMIT) {
      const oldestKey = imageCache.keys().next().value;
      imageCache.delete(oldestKey);
    }
  }

  function stepHour(direction) {
    const hours = getOverlayHours(state.runId, state.member, state.overlayId);
    if (!hours.length) {
      return;
    }

    const currentIndex = hours.indexOf(state.hour);
    const nextIndex = (currentIndex + direction + hours.length) % hours.length;
    state.hour = hours[nextIndex];
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
      const nextIndex = (currentIndex + 1) % hours.length;
      state.hour = hours[nextIndex];
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
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", nextUrl);
  }

  function getFrameKey(runId, member, overlayId, hour) {
    const variant = prefersMobilePreview() ? "mobile" : "desktop";
    return [runId, member, overlayId, padHour(hour), variant].join("|");
  }

  function getFrameUrlFromKey(key) {
    const [runId, member, overlayId, hour, variant] = key.split("|");
    const suffix = variant === "mobile" ? ".mobile.webp" : ".preview.png";
    return `${STATIC_ROOT}/products/${runId}/${member}/${overlayId}/f${hour}/${SOURCE_DOMAIN_ID}${suffix}?v=${runId}`;
  }

  function prefersMobilePreview() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function getAvailableMembers(runId) {
    const run = refs.index[runId];
    if (!run || !run.members) {
      return [];
    }
    return Object.keys(run.members);
  }

  function getOverlayHours(runId, member, overlayId) {
    const run = refs.index[runId];
    if (!run || !run.members || !run.members[member]) {
      return [];
    }

    const hours = [];
    const forecastHours = run.members[member].forecast_hours || {};
    for (const [hourKey, hourData] of Object.entries(forecastHours)) {
      const numericHour = Number(hourKey.slice(1));
      if (hourData.overlays && overlayId in hourData.overlays) {
        hours.push(numericHour);
      }
    }
    return hours.sort((left, right) => left - right);
  }

  function getAvailableOverlays(runId, member) {
    const run = refs.index[runId];
    if (!run || !run.members || !run.members[member]) {
      return [];
    }

    const overlayIds = new Set();
    const forecastHours = run.members[member].forecast_hours || {};
    for (const hourData of Object.values(forecastHours)) {
      for (const overlayId of Object.keys(hourData.overlays || {})) {
        overlayIds.add(overlayId);
      }
    }

    return [...overlayIds]
      .map((id) => refs.layerMap.get(id))
      .filter(Boolean)
      .sort(sortOverlayList);
  }

  function getOverlaysForFamily(runId, member, familyId) {
    const family = FAMILY_CONFIG.find((item) => item.id === familyId);
    if (!family) {
      return [];
    }
    return getAvailableOverlays(runId, member).filter((overlay) => family.match(overlay));
  }

  function findFirstAvailableFamily(runId, member) {
    return FAMILY_CONFIG.find((family) => getOverlaysForFamily(runId, member, family.id).length) || null;
  }

  function familyLabel(familyId) {
    return (FAMILY_CONFIG.find((item) => item.id === familyId) || { label: "Featured" }).label;
  }

  function sortOverlayList(left, right) {
    if (left.featured !== right.featured) {
      return left.featured ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  }

  function nearestHour(hours, target) {
    if (!hours.length) {
      return 0;
    }
    if (hours.includes(target)) {
      return target;
    }

    let best = hours[0];
    let bestDistance = Math.abs(hours[0] - target);
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
    const date = parseRunDate(runId);
    return formatStamp(date);
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
    return `${String(date.getUTCHours()).padStart(2, "0")}Z ${months[date.getUTCMonth()]} ${String(
      date.getUTCDate()
    ).padStart(2, "0")}`;
  }

  function padHour(value) {
    return String(value).padStart(3, "0");
  }

  function formatNumber(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "";
    }
    if (Math.abs(value) >= 100 || Number.isInteger(value)) {
      return String(Math.round(value));
    }
    return value.toFixed(1);
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
