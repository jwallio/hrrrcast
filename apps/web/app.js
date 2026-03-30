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
    all: { title: "All Elements", description: "All available fields for the current member." },
    custom: { title: "Custom Group", description: "User-selected weather elements saved to the URL." },
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
    NC: "America/New_York", GA: "America/New_York", SC: "America/New_York", FL: "America/New_York",
    TN: "America/Chicago", TX: "America/Chicago", IL: "America/Chicago", CO: "America/Denver",
    NY: "America/New_York", VA: "America/New_York",
  };

  const dom = grab([
    "stationInput", "stationSubmit", "suggestions", "graphcol", "graphhgt", "elementbrowserbtn", "elementbrowser",
    "runbtn", "runmenu", "memberbtn", "membermenu", "groupbtn", "groupmenu", "timezonebtn", "timezonemenu",
    "timezonebtnmodal", "timezonemenumodal", "darkmodebtn", "darkmodemenu", "togglecharts", "cameraButton",
    "downloadButton", "settingsbtn", "datetitle", "boxwhiskerlabel", "infoboxwhiskersvalues", "main", "side-drawer",
    "map-btn", "quickstations", "drawerstatus", "settings", "settingsclose", "customgroup", "customgroupbtn",
    "customgroupclose", "customgroupoptions", "customgroupsave", "customgroupclear", "obsonoff", "colorfriendly",
    "fontsizeslider", "boxwhiskersreadout", "boxreadout", "boxmedianreadout", "deterministicreadout"
  ]);

  const service = DataService.createDataService({ staticRoot: staticRoot(), backendRoot: backendRoot() });
  const state = UrlState.parseState(window.location.search);
  const refs = { runs: [], stations: [], payload: null, detPayload: null, charts: [], xRange: null, timer: 0, theme: { chartGrid: "rgba(143,164,184,0.12)", chartTick: "#91a5b9" } };

  Charts.registerPlugins();
  init().catch((error) => {
    console.error(error);
    dom.main.innerHTML = '<div class="chart-empty">Unable to load the HRRRCast 1D Viewer.</div>';
  });

  async function init() {
    bind();
    refs.stations = await service.loadStations();
    refs.runs = await service.loadRuns();
    renderQuickStations();
    await loadPayload();
  }

  function bind() {
    dom.stationSubmit.addEventListener("click", submitStation);
    dom.stationInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); submitStation(); } });
    dom.stationInput.addEventListener("input", onSearchInput);
    dom.graphcol.addEventListener("input", () => { state.col = Number(dom.graphcol.value); applyLayout(); syncUrl(); });
    dom.graphhgt.addEventListener("input", () => { state.hgt = Number(dom.graphhgt.value); applyLayout(); syncUrl(); });
    dom.togglecharts.addEventListener("click", () => { state.graph = state.graph === "chart" ? "distribution" : "chart"; renderChartToggle(); renderCharts(); syncUrl(); });
    dom.cameraButton.addEventListener("click", copyLink);
    dom.downloadButton.addEventListener("click", downloadCurrentPayload);
    dom.settingsbtn.addEventListener("click", () => openModal(dom["settings"]));
    dom.settingsclose.addEventListener("click", () => closeModal(dom["settings"]));
    dom.customgroupbtn.addEventListener("click", () => { renderCustomGroupModal(); openModal(dom.customgroup); });
    dom.customgroupclose.addEventListener("click", () => closeModal(dom.customgroup));
    dom.customgroupsave.addEventListener("click", () => { state.group = "custom"; state.elements = []; closeModal(dom.customgroup); renderAll(); });
    dom.customgroupclear.addEventListener("click", () => { state.customgroup = []; if (state.group === "custom") { state.group = defaultGroup(); } closeModal(dom.customgroup); renderAll(); });
    dom["map-btn"].addEventListener("click", toggleDrawer);
    dom.boxwhiskerlabel.addEventListener("click", () => openModal(dom["settings"]));
    bindToggle(dom.obsonoff, "obs");
    bindToggle(dom.colorfriendly, "colorfriendly");
    bindToggle(dom.boxwhiskersreadout, "whiskers");
    bindToggle(dom.boxreadout, "boxes");
    bindToggle(dom.boxmedianreadout, "median");
    bindToggle(dom.deterministicreadout, "det", true);
    dom.fontsizeslider.addEventListener("input", () => { state.fontsize = Number(dom.fontsizeslider.value); applyTheme(); renderCharts(); syncUrl(); });
    bindDropdowns();
    document.addEventListener("click", globalClick);
    document.addEventListener("keydown", hotkeys);
  }

  async function loadPayload() {
    refs.payload = await service.loadPointSeries(state.run, state.member, state.station);
    state.station = refs.payload.station.id;
    state.member = refs.payload.member;
    refs.detPayload = null;
    if (state.det && state.member === "ens") {
      try { refs.detPayload = await service.loadPointSeries(state.run, "m00", state.station); } catch (error) { console.error(error); }
    }
    normalizeState();
    renderAll();
  }

  function renderAll() {
    applyTheme();
    applyLayout();
    renderMenus();
    renderQuickStations();
    renderCustomGroupModal();
    updateTitleBlock();
    updateDrawerStatus();
    renderCharts();
    syncUrl();
  }

  function renderMenus() {
    renderRunMenu(); renderMemberMenu(); renderGroupMenu(); renderTimezoneMenus(); renderDarkModeMenu(); renderElementBrowser(); renderChartToggle();
    dom.stationInput.value = state.station;
    dom.obsonoff.checked = state.obs;
    dom.colorfriendly.checked = state.colorfriendly;
    dom.fontsizeslider.value = String(state.fontsize);
    dom.boxwhiskersreadout.checked = state.whiskers;
    dom.boxreadout.checked = state.boxes;
    dom.boxmedianreadout.checked = state.median;
    dom.deterministicreadout.checked = state.det;
  }

  function renderRunMenu() {
    fillMenu(dom.runmenu, [{ label: "Latest Ready", value: "latest-ready" }, ...refs.runs.slice().reverse().map((run) => ({ label: `${stamp(run.run_id)}${run.status === "ready" ? "" : " partial"}`, value: run.run_id }))], state.run, async (value) => { state.run = value; refs.xRange = null; await loadPayload(); });
    dom.runbtn.textContent = state.run === "latest-ready" ? "Latest Ready" : stamp(state.run);
  }

  function renderMemberMenu() {
    fillMenu(dom.membermenu, (refs.payload.available_members || []).map((member) => ({ label: member === "ens" ? "Ensemble" : member.toUpperCase(), value: member })), state.member, async (value) => { state.member = value; state.group = defaultGroup(); state.elements = []; refs.xRange = null; await loadPayload(); });
    dom.memberbtn.textContent = state.member === "ens" ? "Ensemble" : state.member.toUpperCase();
  }

  function renderGroupMenu() {
    const items = [{ label: "All Elements", value: "all" }, ...activeGroupsRaw().map((group) => ({ label: groupTitle(group.id), value: group.id })), { label: "Custom Group", value: "custom" }];
    fillMenu(dom.groupmenu, items, state.group, async (value) => { state.group = value; state.elements = []; renderAll(); });
    dom.groupbtn.textContent = groupTitle(state.group);
  }

  function renderTimezoneMenus() {
    const items = [{ label: "Current Timezone", value: "local" }, { label: "Timezone of Point", value: "station" }, { label: "UTC", value: "utc" }];
    fillMenu(dom.timezonemenu, items, state.tz, (value) => { state.tz = value; updateTitleBlock(); renderCharts(); syncUrl(); });
    fillMenu(dom.timezonemenumodal, items, state.tz, (value) => { state.tz = value; updateTitleBlock(); renderCharts(); syncUrl(); });
    const label = items.find((item) => item.value === state.tz)?.label || "Current Timezone";
    dom.timezonebtn.textContent = label;
    dom.timezonebtnmodal.textContent = label;
  }

  function renderDarkModeMenu() {
    const items = [{ label: "Auto", value: "auto" }, { label: "On", value: "on" }, { label: "Off", value: "off" }];
    fillMenu(dom.darkmodemenu, items, state.darkmode, (value) => { state.darkmode = value; applyTheme(); renderCharts(); syncUrl(); });
    dom.darkmodebtn.textContent = items.find((item) => item.value === state.darkmode)?.label || "On";
  }

  function renderElementBrowser() {
    dom.elementbrowser.innerHTML = "";
    for (const group of activeGroups()) {
      dom.elementbrowser.appendChild(el("div", "browser-section-title", groupTitle(group.id)));
      for (const overlayId of group.overlays) {
        const series = refs.payload.series[overlayId];
        if (!series) { continue; }
        const label = document.createElement("label");
        label.className = "browser-option";
        label.innerHTML = `<input type="checkbox" value="${overlayId}" ${activeOverlayIds().includes(overlayId) ? "checked" : ""} /><span class="browser-option-copy"><span>${series.label}</span><span class="browser-option-meta">${elementDescription(overlayId)}</span></span>`;
        label.querySelector("input").addEventListener("change", (event) => toggleOverlay(overlayId, event.target.checked));
        dom.elementbrowser.appendChild(label);
      }
    }
  }

  function renderCustomGroupModal() {
    dom.customgroupoptions.innerHTML = "";
    const seen = new Set();
    for (const overlayId of activeGroupsRaw().flatMap((group) => group.overlays)) {
      if (seen.has(overlayId) || !refs.payload.series[overlayId]) { continue; }
      seen.add(overlayId);
      const label = document.createElement("label");
      label.className = "customgroup-item";
      label.innerHTML = `<input type="checkbox" value="${overlayId}" ${state.customgroup.includes(overlayId) ? "checked" : ""} /><span><strong>${refs.payload.series[overlayId].label}</strong><br /><span class="browser-option-meta">${elementDescription(overlayId)}</span></span>`;
      label.querySelector("input").addEventListener("change", (event) => {
        state.customgroup = event.target.checked ? [...new Set([...state.customgroup, overlayId])] : state.customgroup.filter((item) => item !== overlayId);
        syncUrl();
      });
      dom.customgroupoptions.appendChild(label);
    }
  }

  function renderQuickStations() {
    dom.quickstations.innerHTML = "";
    const list = (refs.stations.length ? refs.stations : [{ id: "KRDU" }, { id: "KATL" }, { id: "KCLT" }, { id: "KDEN" }, { id: "KDFW" }, { id: "KJFK" }]).slice(0, 12);
    for (const station of list) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = station.id;
      button.addEventListener("click", async () => { state.station = station.id; refs.xRange = null; await loadPayload(); });
      dom.quickstations.appendChild(button);
    }
  }

  function renderChartToggle() {
    dom.togglecharts.textContent = state.graph === "distribution" ? "Spread" : "Chart";
  }

  function updateTitleBlock() {
    if (!refs.payload) { return; }
    const station = refs.payload.station;
    dom.datetitle.textContent = `${station.id} ${station.site} | ${refs.payload.member === "ens" ? "Ensemble" : refs.payload.member.toUpperCase()} ${groupTitle(state.group)} | ${stamp(refs.payload.run_id)} init | ${timezoneLabel(state.tz, station)}`;
    dom.infoboxwhiskersvalues.textContent = [
      state.whiskers ? "Whiskers on" : "Whiskers off",
      state.boxes ? "Boxes on" : "Boxes off",
      state.median ? "Median on" : "Median off",
      state.det ? "Deterministic on" : "Deterministic off",
    ].join(" | ");
  }

  function updateDrawerStatus() {
    if (!refs.payload) { return; }
    const station = refs.payload.station;
    dom.drawerstatus.innerHTML = `
      <div><strong>${station.id}</strong> ${station.site}</div>
      <div>${station.state || ""} ${station.country || ""}</div>
      <div>${station.lat.toFixed(2)}, ${station.lon.toFixed(2)}</div>
      <div>Run ${stamp(refs.payload.run_id)} | ${refs.payload.member === "ens" ? "Ensemble" : refs.payload.member.toUpperCase()}</div>
      <div>${activeOverlayIds().length} active elements</div>
    `;
  }

  function renderCharts() {
    destroyCharts();
    dom.main.innerHTML = "";
    const overlayIds = activeOverlayIds().filter((overlayId) => state.graph !== "distribution" || refs.payload.series[overlayId].chart_type === "distribution");
    if (!overlayIds.length) {
      dom.main.innerHTML = '<div class="chart-empty">No chartable fields match the current graph mode and selection.</div>';
      return;
    }
    for (const overlayId of overlayIds) {
      const series = refs.payload.series[overlayId];
      const summary = summarize(series);
      const panel = document.createElement("section");
      panel.className = `chart-panel${state.graph === "distribution" ? " compact" : ""}`;
      panel.innerHTML = `<div class="chart-head"><div class="chart-head-left"><div class="chart-group-label">${groupTitle(groupForOverlay(overlayId))}</div><h3 class="chart-title">${series.label}</h3><p class="chart-description">${elementDescription(overlayId)}</p></div><div class="chart-meta"><span>Latest ${fmt(summary.latest)}${unit(series)}</span><span>Max ${fmt(summary.max)}${unit(series)}</span><span>Min ${fmt(summary.min)}${unit(series)}</span></div></div>${series.chart_type === "distribution" ? '<p class="chart-note">Drag to zoom. Click once on any plot to restore the full time range.</p>' : ""}<div class="chart-frame"><canvas></canvas></div>`;
      dom.main.appendChild(panel);
      const chart = Charts.buildChart(panel.querySelector("canvas"), {
        series,
        detSeries: deterministicSeries(overlayId),
        settings: state,
        colorfriendly: state.colorfriendly,
        fontsize: fontToken(),
        sharedRange: refs.xRange,
        theme: refs.theme,
        formatTime: formatValidTime,
        formatValue: fmt,
      });
      Charts.attachZoomHandlers(chart, (range) => { refs.xRange = range; syncChartRange(); });
      refs.charts.push(chart);
    }
  }

  function syncChartRange() {
    for (const chart of refs.charts) {
      Charts.syncRange(chart, refs.xRange);
    }
    updateTitleBlock();
    syncUrl();
  }

  function destroyCharts() {
    for (const chart of refs.charts) { chart.destroy(); }
    refs.charts = [];
  }

  function applyTheme() {
    let mode = state.darkmode;
    if (mode === "auto") {
      mode = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "on" : "off";
    }
    document.body.dataset.theme = mode === "on" ? "dark" : "light";
    document.body.dataset.fontsize = fontToken();
    document.body.style.fontSize = `${state.fontsize}rem`;
    refs.theme = {
      chartGrid: getComputedStyle(document.body).getPropertyValue("--chart-grid").trim() || "rgba(143,164,184,0.12)",
      chartTick: getComputedStyle(document.body).getPropertyValue("--chart-tick").trim() || "#91a5b9",
    };
  }

  function applyLayout() {
    dom.graphcol.value = String(state.col);
    dom.graphhgt.value = String(state.hgt);
    document.documentElement.style.setProperty("--chart-columns", String(state.col));
    document.documentElement.style.setProperty("--chart-height", `${Math.round(250 * state.hgt)}px`);
  }

  function normalizeState() {
    const next = UrlState.normalizeState(
      state,
      refs.payload ? refs.payload.available_members : [],
      ["all", "custom", ...activeGroupsRaw().map((group) => group.id)],
      activeGroupsRaw().flatMap((group) => group.overlays)
    );
    Object.assign(state, next);
    if (state.group === "custom" && !state.customgroup.length) { state.group = defaultGroup(); }
    if (!activeGroups().length) { state.group = defaultGroup(); }
  }

  function activeGroupsRaw() {
    return refs.payload && Array.isArray(refs.payload.chart_groups) ? refs.payload.chart_groups : [];
  }

  function activeGroups() {
    if (state.group === "all") { return activeGroupsRaw(); }
    if (state.group === "custom") {
      return [{ id: "custom", title: FIELD_LIBRARY.custom.title, overlays: state.customgroup.filter((overlayId) => refs.payload.series[overlayId]) }];
    }
    return activeGroupsRaw().filter((group) => group.id === state.group);
  }

  function activeOverlayIds() {
    const allowed = activeGroups().flatMap((group) => group.overlays);
    return state.elements.length ? state.elements.filter((overlayId) => allowed.includes(overlayId)) : allowed;
  }

  function toggleOverlay(overlayId, enabled) {
    const allowed = activeGroups().flatMap((group) => group.overlays);
    const current = new Set(state.elements.length ? state.elements : allowed);
    if (enabled) { current.add(overlayId); } else { current.delete(overlayId); }
    state.elements = Array.from(current).filter((item) => allowed.includes(item));
    renderElementBrowser();
    renderCharts();
    updateDrawerStatus();
    syncUrl();
  }

  function groupForOverlay(overlayId) {
    for (const group of activeGroupsRaw()) {
      if (group.overlays.includes(overlayId)) { return group.id; }
    }
    return state.group === "custom" ? "custom" : "all";
  }

  function deterministicSeries(overlayId) {
    if (!refs.detPayload) { return null; }
    const sourceId = ENS_TO_DET[overlayId];
    return sourceId ? refs.detPayload.series[sourceId] : null;
  }

  function defaultGroup() {
    return activeGroupsRaw().some((group) => group.id === "storm") ? "storm" : ((activeGroupsRaw()[0] && activeGroupsRaw()[0].id) || "all");
  }

  function submitStation() {
    state.station = (dom.stationInput.value || "").trim().toUpperCase() || UrlState.DEFAULTS.station;
    refs.xRange = null;
    loadPayload().catch((error) => console.error(error));
  }

  function onSearchInput() {
    window.clearTimeout(refs.timer);
    const query = dom.stationInput.value.trim();
    if (!query) { hideSuggestions(); return; }
    refs.timer = window.setTimeout(async () => {
      const stations = await service.searchStations(query, refs.stations);
      if (!stations.length) { hideSuggestions(); return; }
      dom.suggestions.innerHTML = "";
      for (const station of stations) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "suggestion-button";
        button.innerHTML = `<span class="suggestion-line"><strong>${station.id}</strong> ${station.site}</span><span class="suggestion-line">${[station.state, station.country].filter(Boolean).join(", ")} | ${station.lat.toFixed(2)}, ${station.lon.toFixed(2)}</span>`;
        button.addEventListener("click", async () => { state.station = station.id; refs.xRange = null; hideSuggestions(); await loadPayload(); });
        dom.suggestions.appendChild(button);
      }
      dom.suggestions.hidden = false;
    }, 130);
  }

  function hideSuggestions() {
    dom.suggestions.hidden = true;
    dom.suggestions.innerHTML = "";
  }

  async function copyLink() {
    syncUrl();
    try {
      await navigator.clipboard.writeText(window.location.href);
      dom.cameraButton.textContent = "Copied";
      window.setTimeout(() => { dom.cameraButton.textContent = "Share"; }, 1200);
    } catch (error) {
      console.error(error);
    }
  }

  function downloadCurrentPayload() {
    if (!refs.payload) { return; }
    const blob = new Blob([JSON.stringify(refs.payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${refs.payload.run_id}_${refs.payload.member}_${refs.payload.station.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleDrawer() {
    const open = !dom["side-drawer"].classList.contains("show-drawer");
    dom["side-drawer"].classList.toggle("show-drawer", open);
    dom["side-drawer"].classList.toggle("hide-drawer", !open);
  }

  function globalClick(event) {
    if (!event.target.closest(".dropdown")) { closeAllDropdowns(); }
    if (!dom.suggestions.contains(event.target) && event.target !== dom.stationInput) { hideSuggestions(); }
    if (event.target === dom["settings"]) { closeModal(dom["settings"]); }
    if (event.target === dom.customgroup) { closeModal(dom.customgroup); }
  }

  function hotkeys(event) {
    const activeType = document.activeElement && document.activeElement.getAttribute("type");
    if (activeType === "text") { return; }
    switch (event.key.toLowerCase()) {
      case "o": dom.obsonoff.click(); break;
      case "c": dom.customgroupbtn.click(); break;
      case "w": dom.boxwhiskersreadout.click(); break;
      case "b": dom.boxreadout.click(); break;
      case "m": dom.boxmedianreadout.click(); break;
      case "d": dom.deterministicreadout.click(); break;
      case "+":
      case "=":
        dom.fontsizeslider.value = String(Math.min(1.4, Number(dom.fontsizeslider.value) + 0.1));
        state.fontsize = Number(dom.fontsizeslider.value);
        applyTheme(); renderCharts(); syncUrl();
        break;
      case "-":
        dom.fontsizeslider.value = String(Math.max(0.7, Number(dom.fontsizeslider.value) - 0.1));
        state.fontsize = Number(dom.fontsizeslider.value);
        applyTheme(); renderCharts(); syncUrl();
        break;
      case "escape":
        closeAllDropdowns(); closeModal(dom["settings"]); closeModal(dom.customgroup);
        break;
      default:
        break;
    }
  }

  function bindDropdowns() {
    [
      [dom.elementbrowserbtn, dom.elementbrowser], [dom.runbtn, dom.runmenu], [dom.memberbtn, dom.membermenu],
      [dom.groupbtn, dom.groupmenu], [dom.timezonebtn, dom.timezonemenu], [dom.timezonebtnmodal, dom.timezonemenumodal],
      [dom.darkmodebtn, dom.darkmodemenu],
    ].forEach(([button, menu]) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = menu.classList.contains("is-open");
        closeAllDropdowns();
        if (!open) { menu.classList.add("is-open"); }
      });
    });
  }

  function closeAllDropdowns() {
    for (const menu of document.querySelectorAll(".dropdown-content")) {
      menu.classList.remove("is-open");
    }
  }

  function openModal(modal) {
    modal.classList.add("is-open");
  }

  function closeModal(modal) {
    modal.classList.remove("is-open");
  }

  function fillMenu(menu, items, current, onPick) {
    menu.innerHTML = "";
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.value === current ? `${item.label} ✓` : item.label;
      button.addEventListener("click", async () => {
        closeAllDropdowns();
        await onPick(item.value);
      });
      menu.appendChild(button);
    }
  }

  function groupTitle(id) {
    return (FIELD_LIBRARY[id] && FIELD_LIBRARY[id].title) || id;
  }

  function elementDescription(overlayId) {
    return overlayId.replaceAll("_", " ");
  }

  function summarize(series) {
    if (series.summary) { return series.summary; }
    const values = (series.points || []).map((point) => Number(point.value)).filter(Number.isFinite);
    if (!values.length) { return { latest: null, max: null, min: null }; }
    return { latest: values[values.length - 1], max: Math.max(...values), min: Math.min(...values) };
  }

  function fmt(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) { return "n/a"; }
    return Math.abs(numeric) >= 100 || Number.isInteger(numeric) ? String(Math.round(numeric)) : numeric.toFixed(1);
  }

  function unit(series) {
    return series.units ? ` ${series.units}` : "";
  }

  function fontToken() {
    if (state.fontsize <= 0.9) { return "sm"; }
    if (state.fontsize >= 1.1) { return "lg"; }
    return "md";
  }

  function stamp(runId) {
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
    return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone })} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: state.tz === "utc" ? "short" : undefined })}`;
  }

  function timezoneLabel(mode, station) {
    if (mode === "utc") { return "UTC"; }
    if (mode === "station") { return stationTimeZone(station).split("/").pop().replace("_", " "); }
    return "Current Timezone";
  }

  function stationTimeZone(station) {
    return (station && (station.timeZone || STATE_TIMEZONES[station.state])) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  function syncUrl() {
    UrlState.writeState(state);
  }

  function grab(ids) {
    const output = {};
    for (const id of ids) { output[id] = document.getElementById(id); }
    return output;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text != null) { node.textContent = text; }
    return node;
  }

  function backendRoot() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("backend");
    if (value) { return value; }
    return typeof CONFIG.backend === "string" ? CONFIG.backend : window.location.origin;
  }

  function staticRoot() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("staticRoot");
    if (value) { return value; }
    return typeof CONFIG.staticRoot === "string" ? CONFIG.staticRoot : "";
  }
})();
