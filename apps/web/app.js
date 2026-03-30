(function () {
  "use strict";

  const CONFIG = window.HRRRCAST_STATION_VIEWER || {};
  const UrlState = window.HRRRCAST_URL_STATE;
  const DataService = window.HRRRCAST_DATA;
  const Charts = window.HRRRCAST_CHARTS;

  const FIELD_LIBRARY = {
    storm: { title: "Storm Signals", description: "Radar and precipitation markers for convective timing and coverage." },
    instability: { title: "Instability", description: "Buoyancy and inhibition for updraft potential." },
    rotation: { title: "Rotation", description: "Low-level rotational support and helicity signal." },
    shear: { title: "Shear", description: "Deep-layer and low-level shear magnitude or threshold support." },
    wind: { title: "Wind", description: "Surface wind and gust signal." },
    moisture: { title: "Temperature / Moisture", description: "Near-surface thermodynamic fields and moisture transport." },
    aviation: { title: "Cloud / Ceiling / Visibility", description: "Flight-category relevant ceiling and visibility trends." },
    kinematics: { title: "Kinematics", description: "Storm motion and vorticity diagnostics." },
    upper: { title: "Upper Air", description: "Key synoptic-level support fields." },
  };

  const ELEMENT_DESCRIPTIONS = {
    composite_reflectivity_probability_gt_40dbz: "Probability that members exceed 40 dBZ composite reflectivity.",
    qpf_probability_gt_0p10: "Probability that accumulation exceeds 0.10 inches.",
    cape_probability_gt_1000: "Probability that surface CAPE exceeds 1000 J/kg.",
    helicity_0_1km_probability_gt_100: "Probability that 0-1 km storm-relative helicity exceeds 100 m^2/s^2.",
    helicity_0_3km_probability_gt_250: "Probability that 0-3 km storm-relative helicity exceeds 250 m^2/s^2.",
    shear_0_1km_probability_gt_20kt: "Probability that 0-1 km shear exceeds 20 kt.",
    shear_0_6km_probability_gt_40kt: "Probability that 0-6 km shear exceeds 40 kt.",
    wind_10m_probability_gt_25kt: "Probability that 10 m sustained wind exceeds 25 kt.",
    composite_reflectivity_member_spread: "Member distribution of composite reflectivity at the nearest HRRRCast grid point.",
    qpf_member_spread: "Member distribution of accumulated precipitation.",
    cape_member_spread: "Member distribution of surface CAPE.",
    helicity_0_1km_member_spread: "Member distribution of 0-1 km helicity.",
    helicity_0_3km_member_spread: "Member distribution of 0-3 km helicity.",
    shear_0_1km_speed_member_spread: "Member distribution of 0-1 km shear magnitude.",
    shear_0_6km_speed_member_spread: "Member distribution of 0-6 km shear magnitude.",
    wind_10m_member_spread: "Member distribution of 10 m wind speed.",
    gust_surface_member_spread: "Member distribution of surface gust.",
    composite_reflectivity: "Deterministic composite reflectivity from the selected member.",
    qpf: "Deterministic accumulated precipitation.",
    cape: "Deterministic surface-based CAPE.",
    cin_surface: "Deterministic convective inhibition.",
    dewpoint_2m: "Deterministic 2 m dewpoint.",
    rh_2m: "Deterministic 2 m relative humidity.",
    pwat: "Deterministic precipitable water.",
    visibility: "Deterministic visibility.",
    ceiling: "Deterministic cloud ceiling.",
    surface_pressure: "Deterministic surface pressure.",
    helicity_0_1km: "Deterministic 0-1 km storm-relative helicity.",
    helicity_0_3km: "Deterministic 0-3 km storm-relative helicity.",
    storm_motion_u: "Deterministic storm motion U component.",
    storm_motion_v: "Deterministic storm motion V component.",
    relative_vorticity_0_1km: "Deterministic low-level relative vorticity.",
    relative_vorticity_0_2km: "Deterministic 0-2 km relative vorticity.",
    shear_0_1km_speed: "Deterministic 0-1 km shear magnitude.",
    shear_0_6km_speed: "Deterministic 0-6 km shear magnitude.",
    wind_10m: "Deterministic 10 m wind speed.",
    gust_surface: "Deterministic surface gust.",
    height_500mb: "Deterministic 500 mb height.",
    temperature_850mb: "Deterministic 850 mb temperature.",
    wind_500mb: "Deterministic 500 mb wind speed.",
    vertical_velocity_500mb: "Deterministic 500 mb vertical velocity.",
  };

  const ENS_TO_DET = {
    composite_reflectivity_member_spread: "composite_reflectivity",
    qpf_member_spread: "qpf",
    cape_member_spread: "cape",
    helicity_0_1km_member_spread: "helicity_0_1km",
    helicity_0_3km_member_spread: "helicity_0_3km",
    shear_0_1km_speed_member_spread: "shear_0_1km_speed",
    shear_0_6km_speed_member_spread: "shear_0_6km_speed",
    wind_10m_member_spread: "wind_10m",
    gust_surface_member_spread: "gust_surface",
  };

  const STATE_TIMEZONES = {
    NC: "America/New_York",
    GA: "America/New_York",
    SC: "America/New_York",
    FL: "America/New_York",
    TN: "America/Chicago",
    TX: "America/Chicago",
    IL: "America/Chicago",
    CO: "America/Denver",
    NY: "America/New_York",
    VA: "America/New_York",
  };

  const dom = {
    statusPill: document.getElementById("statusPill"),
    copyLinkButton: document.getElementById("copyLinkButton"),
    lookupForm: document.getElementById("lookupForm"),
    stationInput: document.getElementById("stationInput"),
    suggestions: document.getElementById("suggestions"),
    runSelect: document.getElementById("runSelect"),
    memberSelect: document.getElementById("memberSelect"),
    groupSelect: document.getElementById("groupSelect"),
    timezoneSelect: document.getElementById("timezoneSelect"),
    selectAllElementsButton: document.getElementById("selectAllElementsButton"),
    elementBrowser: document.getElementById("elementBrowser"),
    browserHelp: document.getElementById("browserHelp"),
    darkmodeToggle: document.getElementById("darkmodeToggle"),
    colorfriendlyToggle: document.getElementById("colorfriendlyToggle"),
    obsToggle: document.getElementById("obsToggle"),
    boxesToggle: document.getElementById("boxesToggle"),
    whiskersToggle: document.getElementById("whiskersToggle"),
    medianToggle: document.getElementById("medianToggle"),
    detToggle: document.getElementById("detToggle"),
    fontSizeControl: document.getElementById("fontSizeControl"),
    stationTitle: document.getElementById("stationTitle"),
    stationMeta: document.getElementById("stationMeta"),
    stationCopy: document.getElementById("stationCopy"),
    summaryKicker: document.getElementById("summaryKicker"),
    viewChipRow: document.getElementById("viewChipRow"),
    resetZoomButton: document.getElementById("resetZoomButton"),
    restoreDefaultsButton: document.getElementById("restoreDefaultsButton"),
    infoBanner: document.getElementById("infoBanner"),
    chartGroups: document.getElementById("chartGroups"),
  };

  const service = DataService.createDataService({
    staticRoot: resolveStaticRoot(),
    backendRoot: resolveBackendRoot(),
  });

  const state = UrlState.parseState(window.location.search);
  const refs = {
    runs: [],
    stations: [],
    charts: [],
    suggestionTimer: 0,
    payload: null,
    detPayload: null,
    xRange: null,
    theme: {
      chartGrid: "rgba(143, 164, 184, 0.12)",
      chartTick: "#91a5b9",
    },
  };

  Charts.registerPlugins();

  init().catch((error) => {
    console.error(error);
    dom.statusPill.textContent = "Viewer load failed";
    dom.chartGroups.innerHTML = '<div class="chart-empty">Unable to load the HRRRCast station viewer.</div>';
  });

  async function init() {
    bindEvents();
    applyShellState();
    refs.stations = await service.loadStations();
    refs.runs = await service.loadRuns();
    renderRunOptions();
    await loadCurrentPayload();
  }

  function bindEvents() {
    dom.lookupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.station = dom.stationInput.value.trim().toUpperCase() || UrlState.DEFAULTS.station;
      refs.xRange = null;
      await loadCurrentPayload();
    });

    dom.stationInput.addEventListener("input", () => {
      const query = dom.stationInput.value.trim();
      window.clearTimeout(refs.suggestionTimer);
      if (!query) {
        hideSuggestions();
        return;
      }
      refs.suggestionTimer = window.setTimeout(() => {
        loadSuggestions(query).catch((error) => console.error(error));
      }, 130);
    });

    document.addEventListener("click", (event) => {
      if (!dom.suggestions.contains(event.target) && event.target !== dom.stationInput) {
        hideSuggestions();
      }
    });

    dom.runSelect.addEventListener("change", async () => {
      state.run = dom.runSelect.value;
      refs.xRange = null;
      await loadCurrentPayload();
    });

    dom.memberSelect.addEventListener("change", async () => {
      state.member = dom.memberSelect.value;
      state.group = UrlState.DEFAULTS.group;
      state.elements = [];
      refs.xRange = null;
      await loadCurrentPayload();
    });

    dom.groupSelect.addEventListener("change", () => {
      state.group = dom.groupSelect.value;
      state.elements = [];
      refs.xRange = null;
      renderElementBrowser();
      renderCharts();
      syncUrlAndChrome();
    });

    dom.timezoneSelect.addEventListener("change", () => {
      state.tz = dom.timezoneSelect.value;
      renderSummary();
      renderCharts();
      syncUrlAndChrome();
    });

    dom.copyLinkButton.addEventListener("click", async () => {
      UrlState.writeState(state);
      try {
        await navigator.clipboard.writeText(window.location.href);
        dom.statusPill.textContent = "Share link copied";
      } catch (error) {
        console.error(error);
        dom.statusPill.textContent = "Unable to copy link";
      }
    });

    dom.resetZoomButton.addEventListener("click", () => {
      refs.xRange = null;
      syncChartRange();
      renderSummary();
    });

    dom.restoreDefaultsButton.addEventListener("click", async () => {
      Object.assign(state, UrlState.parseState(""));
      state.elements = [];
      refs.xRange = null;
      applyShellState();
      await loadCurrentPayload();
    });

    dom.selectAllElementsButton.addEventListener("click", () => {
      state.elements = activeGroups().flatMap((group) => group.overlays);
      renderElementBrowser();
      renderCharts();
      syncUrlAndChrome();
    });

    dom.darkmodeToggle.addEventListener("change", () => updateSetting("darkmode", dom.darkmodeToggle.checked, true));
    dom.colorfriendlyToggle.addEventListener("change", () => updateSetting("colorfriendly", dom.colorfriendlyToggle.checked, true));
    dom.obsToggle.addEventListener("change", () => updateSetting("obs", dom.obsToggle.checked, true));
    dom.boxesToggle.addEventListener("change", () => updateSetting("boxes", dom.boxesToggle.checked, true));
    dom.whiskersToggle.addEventListener("change", () => updateSetting("whiskers", dom.whiskersToggle.checked, true));
    dom.medianToggle.addEventListener("change", () => updateSetting("median", dom.medianToggle.checked, true));
    dom.detToggle.addEventListener("change", async () => {
      state.det = dom.detToggle.checked;
      if (state.det && state.member === "ens") {
        await ensureDeterministicOverlayPayload();
      }
      renderCharts();
      syncUrlAndChrome();
    });

    dom.fontSizeControl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-size]");
      if (!button) {
        return;
      }
      updateSetting("fontsize", button.dataset.size, true);
    });

    window.addEventListener("popstate", async () => {
      const next = UrlState.parseState(window.location.search);
      const shouldReload = next.station !== state.station || next.run !== state.run || next.member !== state.member;
      Object.assign(state, next);
      refs.xRange = null;
      applyShellState();
      if (shouldReload) {
        await loadCurrentPayload();
      } else {
        renderElementBrowser();
        renderSummary();
        renderCharts();
        syncUrlAndChrome();
      }
    });
  }

  async function loadSuggestions(query) {
    const stations = await service.searchStations(query, refs.stations);
    if (!stations.length) {
      hideSuggestions();
      return;
    }
    dom.suggestions.innerHTML = "";
    for (const station of stations) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion-button";
      button.innerHTML = `
        <span class="suggestion-line"><strong>${station.id}</strong> ${station.site}</span>
        <span class="suggestion-line">${[station.state, station.country].filter(Boolean).join(", ")} | ${station.lat.toFixed(2)}, ${station.lon.toFixed(2)}</span>
      `;
      button.addEventListener("click", async () => {
        state.station = station.id;
        refs.xRange = null;
        hideSuggestions();
        await loadCurrentPayload();
      });
      dom.suggestions.appendChild(button);
    }
    dom.suggestions.hidden = false;
  }

  function hideSuggestions() {
    dom.suggestions.hidden = true;
    dom.suggestions.innerHTML = "";
  }

  async function loadCurrentPayload() {
    dom.statusPill.textContent = `Loading ${state.station}`;
    dom.stationInput.value = state.station;
    hideSuggestions();
    const payload = await service.loadPointSeries(state.run, state.member, state.station);
    refs.payload = payload;
    state.member = payload.member;
    refs.detPayload = null;
    if (state.det && state.member === "ens") {
      await ensureDeterministicOverlayPayload();
    }
    normalizeGroupAndElements();
    renderRunOptions();
    renderMemberOptions(payload.available_members || []);
    renderGroupOptions();
    applyShellState();
    renderSummary();
    renderElementBrowser();
    renderCharts();
    syncUrlAndChrome();
  }

  async function ensureDeterministicOverlayPayload() {
    if (refs.detPayload || state.member !== "ens") {
      return;
    }
    try {
      refs.detPayload = await service.loadPointSeries(state.run, "m00", state.station);
    } catch (error) {
      console.error(error);
      refs.detPayload = null;
    }
  }

  function renderRunOptions() {
    dom.runSelect.innerHTML = "";
    const latest = document.createElement("option");
    latest.value = "latest-ready";
    latest.textContent = "Latest Ready";
    dom.runSelect.appendChild(latest);
    for (const run of refs.runs.slice().reverse()) {
      const option = document.createElement("option");
      option.value = run.run_id;
      option.textContent = `${formatRunStamp(run.run_id)}${run.status === "ready" ? "" : " partial"}`;
      dom.runSelect.appendChild(option);
    }
    dom.runSelect.value = state.run;
  }

  function renderMemberOptions(members) {
    dom.memberSelect.innerHTML = "";
    for (const member of members) {
      const option = document.createElement("option");
      option.value = member;
      option.textContent = member === "ens" ? "Ens" : member.toUpperCase();
      dom.memberSelect.appendChild(option);
    }
    dom.memberSelect.value = state.member;
  }

  function renderGroupOptions() {
    dom.groupSelect.innerHTML = "";
    const groups = activeGroupsRaw();
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All Groups";
    dom.groupSelect.appendChild(allOption);
    for (const group of groups) {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = groupTitle(group.id, group.title);
      dom.groupSelect.appendChild(option);
    }
    dom.groupSelect.value = state.group;
  }

  function renderSummary() {
    if (!refs.payload) {
      return;
    }
    const station = refs.payload.station;
    dom.stationTitle.textContent = `${station.id} | ${station.site}`;
    dom.summaryKicker.textContent = refs.payload.member === "ens" ? "HRRRCast Ensemble Station Guidance" : "HRRRCast Deterministic Station Guidance";
    dom.stationMeta.innerHTML = "";
    const metaItems = [
      `Run ${formatRunStamp(refs.payload.run_id)}`,
      refs.payload.member === "ens" ? "Ensemble" : refs.payload.member.toUpperCase(),
      `TZ ${formatTimezoneLabel(state.tz, station)}`,
      `Lat ${station.lat.toFixed(2)}`,
      `Lon ${station.lon.toFixed(2)}`,
      station.elev ? `${station.elev} m` : null,
    ].filter(Boolean);
    for (const item of metaItems) {
      const chip = document.createElement("span");
      chip.textContent = item;
      dom.stationMeta.appendChild(chip);
    }

    const group = activeGroupsRaw().find((item) => item.id === state.group);
    const modeCopy = refs.payload.member === "ens"
      ? "Ensemble mode emphasizes probability guidance and member spread diagnostics."
      : "Deterministic mode shows a single selected member with station-point guidance.";
    const groupCopy = group ? groupDescription(group.id, group.title) : "Forecast fields are organized into operational weather groups.";
    dom.stationCopy.textContent = `${modeCopy} ${groupCopy}`;

    dom.viewChipRow.innerHTML = "";
    const chips = [
      state.group === "all" ? "All Groups" : groupTitle(state.group),
      `${activeOverlayIds().length} fields`,
      state.obs ? "Obs on" : "Obs off",
      refs.xRange ? `Zoom F${String(refs.xRange.min).padStart(3, "0")} to F${String(refs.xRange.max).padStart(3, "0")}` : "Full range",
    ];
    for (const text of chips) {
      const chip = document.createElement("span");
      chip.className = "view-chip";
      chip.textContent = text;
      dom.viewChipRow.appendChild(chip);
    }
    updateInfoBanner();
  }

  function renderElementBrowser() {
    dom.elementBrowser.innerHTML = "";
    for (const group of activeGroups()) {
      const block = document.createElement("section");
      block.className = "element-group";
      block.innerHTML = `<h3 class="element-group-title">${groupTitle(group.id, group.title)}</h3>`;
      for (const overlayId of group.overlays) {
        const series = refs.payload.series[overlayId];
        if (!series) {
          continue;
        }
        const label = document.createElement("label");
        label.className = "element-option";
        label.innerHTML = `
          <input type="checkbox" value="${overlayId}" />
          <span class="element-copy">
            <span class="element-name">${series.label}</span>
            <span class="element-meta">${elementDescription(overlayId, series)}</span>
          </span>
        `;
        const input = label.querySelector("input");
        input.checked = isOverlaySelected(overlayId);
        input.addEventListener("change", () => {
          toggleOverlay(overlayId, input.checked);
        });
        block.appendChild(label);
      }
      dom.elementBrowser.appendChild(block);
    }
    dom.browserHelp.textContent = state.group === "all"
      ? "Choose any combination of elements across all available groups. Shared URL state saves custom field picks."
      : `${groupDescription(state.group)} Toggle individual charts on or off for a custom view.`;
  }

  function renderCharts() {
    destroyCharts();
    dom.chartGroups.innerHTML = "";
    const selectedIds = activeOverlayIds();
    if (!refs.payload || !selectedIds.length) {
      dom.chartGroups.innerHTML = '<div class="chart-empty">No chartable elements are selected for this station and configuration.</div>';
      return;
    }
    for (const overlayId of selectedIds) {
      const series = refs.payload.series[overlayId];
      if (!series) {
        continue;
      }
      const card = document.createElement("article");
      card.className = "chart-panel";
      const summary = summarizeSeries(series);
      card.innerHTML = `
        <div class="chart-panel-head">
          <div>
            <p class="chart-kicker">${groupTitle(groupForOverlay(overlayId))}</p>
            <h2 class="chart-title">${series.label}</h2>
            <p class="chart-description">${elementDescription(overlayId, series)}</p>
          </div>
          <div class="chart-panel-meta">
            <span>Latest ${formatValue(summary.latest)}${series.units ? ` ${series.units}` : ""}</span>
            <span>Max ${formatValue(summary.max)}${series.units ? ` ${series.units}` : ""}</span>
            <span>Min ${formatValue(summary.min)}${series.units ? ` ${series.units}` : ""}</span>
          </div>
        </div>
        ${series.chart_type === "distribution"
          ? '<p class="chart-note">Drag to zoom across forecast hours. Click once on any chart to reset the shared x-axis window.</p>'
          : ""}
        <div class="chart-frame"><canvas></canvas></div>
      `;
      dom.chartGroups.appendChild(card);
      const chart = Charts.buildChart(card.querySelector("canvas"), {
        series,
        detSeries: distributionDeterministicSeries(overlayId),
        settings: state,
        colorfriendly: state.colorfriendly,
        fontsize: state.fontsize,
        sharedRange: refs.xRange,
        theme: refs.theme,
        formatTime: formatValidTime,
        formatValue,
      });
      Charts.attachZoomHandlers(chart, (range) => {
        refs.xRange = range;
        syncChartRange();
        renderSummary();
      });
      refs.charts.push(chart);
    }
  }

  function syncChartRange() {
    for (const chart of refs.charts) {
      Charts.syncRange(chart, refs.xRange);
    }
    syncUrlAndChrome();
  }

  function destroyCharts() {
    for (const chart of refs.charts) {
      chart.destroy();
    }
    refs.charts = [];
  }

  function normalizeGroupAndElements() {
    const groups = activeGroupsRaw();
    const validGroups = ["all", ...groups.map((group) => group.id)];
    if (!validGroups.includes(state.group)) {
      state.group = groups.some((group) => group.id === "storm") ? "storm" : "all";
    }
    const validOverlays = groups.flatMap((group) => group.overlays);
    state.elements = state.elements.filter((overlayId) => validOverlays.includes(overlayId));
  }

  function activeGroupsRaw() {
    return refs.payload && Array.isArray(refs.payload.chart_groups) ? refs.payload.chart_groups : [];
  }

  function activeGroups() {
    if (state.group === "all") {
      return activeGroupsRaw();
    }
    return activeGroupsRaw().filter((group) => group.id === state.group);
  }

  function activeOverlayIds() {
    const allowed = activeGroups().flatMap((group) => group.overlays);
    if (!state.elements.length) {
      return allowed;
    }
    return state.elements.filter((overlayId) => allowed.includes(overlayId));
  }

  function isOverlaySelected(overlayId) {
    return activeOverlayIds().includes(overlayId);
  }

  function toggleOverlay(overlayId, enabled) {
    const allowed = activeGroups().flatMap((group) => group.overlays);
    const current = new Set(state.elements.length ? state.elements : allowed);
    if (enabled) {
      current.add(overlayId);
    } else {
      current.delete(overlayId);
    }
    state.elements = Array.from(current).filter((item) => allowed.includes(item));
    renderElementBrowser();
    renderCharts();
    syncUrlAndChrome();
  }

  function groupForOverlay(overlayId) {
    for (const group of activeGroupsRaw()) {
      if (group.overlays.includes(overlayId)) {
        return group.id;
      }
    }
    return "all";
  }

  function distributionDeterministicSeries(overlayId) {
    if (!refs.detPayload) {
      return null;
    }
    const sourceId = ENS_TO_DET[overlayId];
    return sourceId ? refs.detPayload.series[sourceId] : null;
  }

  function updateSetting(key, value, rerenderCharts) {
    state[key] = value;
    applyShellState();
    if (rerenderCharts) {
      renderSummary();
      renderCharts();
    }
    syncUrlAndChrome();
  }

  function applyShellState() {
    document.body.dataset.theme = state.darkmode ? "dark" : "light";
    document.body.dataset.fontsize = state.fontsize;
    refs.theme = {
      chartGrid: getComputedStyle(document.body).getPropertyValue("--chart-grid").trim() || "rgba(143, 164, 184, 0.12)",
      chartTick: getComputedStyle(document.body).getPropertyValue("--chart-tick").trim() || "#91a5b9",
    };
    dom.stationInput.value = state.station;
    dom.timezoneSelect.value = state.tz;
    dom.darkmodeToggle.checked = state.darkmode;
    dom.colorfriendlyToggle.checked = state.colorfriendly;
    dom.obsToggle.checked = state.obs;
    dom.boxesToggle.checked = state.boxes;
    dom.whiskersToggle.checked = state.whiskers;
    dom.medianToggle.checked = state.median;
    dom.detToggle.checked = state.det;
    for (const button of dom.fontSizeControl.querySelectorAll("[data-size]")) {
      button.classList.toggle("is-active", button.dataset.size === state.fontsize);
    }
  }

  function syncUrlAndChrome() {
    const next = UrlState.normalizeState(
      state,
      refs.payload ? refs.payload.available_members : null,
      ["all", ...activeGroupsRaw().map((group) => group.id)],
      activeGroupsRaw().flatMap((group) => group.overlays)
    );
    next.elements = normalizeElementParam(next.elements, activeGroups());
    Object.assign(state, next);
    UrlState.writeState(state);
    dom.statusPill.textContent = refs.payload
      ? `${refs.payload.run_id} | ${state.member.toUpperCase()} | ${state.station}`
      : `Loading ${state.station}`;
  }

  function normalizeElementParam(selected, groups) {
    const all = groups.flatMap((group) => group.overlays);
    if (!selected.length || selected.length === all.length) {
      return [];
    }
    return selected;
  }

  function updateInfoBanner() {
    const messages = [];
    if (state.obs) {
      messages.push("Observation overlays are not yet available in the published HRRRCast station bundle.");
    }
    if (state.member === "ens") {
      messages.push("Ensemble spread charts support boxes, whiskers, median, and deterministic overlays from member 00.");
    }
    if (refs.xRange) {
      messages.push("Click once inside any chart to reset the shared zoom window.");
    }
    dom.infoBanner.hidden = messages.length === 0;
    dom.infoBanner.textContent = messages.join(" ");
  }

  function formatRunStamp(runId) {
    const year = Number(runId.slice(0, 4));
    const month = Number(runId.slice(4, 6)) - 1;
    const day = Number(runId.slice(6, 8));
    const hour = Number(runId.slice(8, 10));
    const date = new Date(Date.UTC(year, month, day, hour));
    return `${String(date.getUTCHours()).padStart(2, "0")}Z ${date.toLocaleDateString(undefined, { month: "short", day: "2-digit", timeZone: "UTC" })}`;
  }

  function formatValidTime(value) {
    const date = new Date(value);
    const timeZone = state.tz === "utc" ? "UTC" : state.tz === "station" ? stationTimeZone(refs.payload && refs.payload.station) : undefined;
    return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone })} ${date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: state.tz === "utc" ? "short" : undefined,
    })}`;
  }

  function formatTimezoneLabel(mode, station) {
    if (mode === "utc") {
      return "UTC";
    }
    if (mode === "station") {
      return stationTimeZone(station).split("/").pop().replace("_", " ");
    }
    return "Browser";
  }

  function stationTimeZone(station) {
    return (station && (station.timeZone || STATE_TIMEZONES[station.state])) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  function summarizeSeries(series) {
    if (series.summary) {
      return series.summary;
    }
    const values = (series.points || []).map((point) => Number(point.value)).filter(Number.isFinite);
    if (!values.length) {
      return { latest: null, max: null, min: null };
    }
    return {
      latest: values[values.length - 1],
      max: Math.max(...values),
      min: Math.min(...values),
    };
  }

  function formatValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "n/a";
    }
    return Math.abs(numeric) >= 100 || Number.isInteger(numeric) ? String(Math.round(numeric)) : numeric.toFixed(1);
  }

  function groupTitle(id, fallback) {
    return (FIELD_LIBRARY[id] && FIELD_LIBRARY[id].title) || fallback || id;
  }

  function groupDescription(id, fallback) {
    return (FIELD_LIBRARY[id] && FIELD_LIBRARY[id].description) || fallback || "Grouped forecast elements.";
  }

  function elementDescription(overlayId, series) {
    return ELEMENT_DESCRIPTIONS[overlayId] || `${series.units || "Forecast"} field from the HRRRCast station-point bundle.`;
  }

  function resolveBackendRoot() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("backend");
    if (value) {
      return value;
    }
    return typeof CONFIG.backend === "string" ? CONFIG.backend : window.location.origin;
  }

  function resolveStaticRoot() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("staticRoot");
    if (value) {
      return value;
    }
    return typeof CONFIG.staticRoot === "string" ? CONFIG.staticRoot : "";
  }
})();
