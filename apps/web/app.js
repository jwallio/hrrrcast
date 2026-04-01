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
    "maplocations", "stationInput", "stationSubmit", "suggestions", "graphcol", "graphhgt", "elementbrowserbtn", "elementbrowser",
    "runbtn", "runmenu", "memberbtn", "membermenu", "groupbtn", "groupmenu", "timezonebtn", "timezonemenu",
    "timezonebtnmodal", "timezonemenumodal", "darkmodebtn", "darkmodemenu", "togglecharts", "cameraButton",
    "downloadButton", "settingsbtn", "datetitle", "boxwhiskerlabel", "infoboxwhiskersvalues", "main", "side-drawer",
    "map-btn", "quickstations", "drawerstatus", "stationmap", "stationmapstatus", "settings", "settingsclose", "customgroup", "customgroupbtn",
    "customgroupclose", "customgroupoptions", "customgroupsave", "customgroupclear", "obsonoff", "colorfriendly",
    "fontsizeslider", "whiskerlow", "whiskerhigh", "whiskerlowvalue", "whiskerhighvalue", "boxlow", "boxhigh",
    "boxlowvalue", "boxhighvalue", "boxwhiskersreadout", "boxreadout", "boxmedianreadout", "deterministicreadout",
    "boxwhiskerinfowrapper", "whiskerpercentilesrow", "boxpercentilesrow", "readoutheaderrow", "boxwhiskersrow",
    "boxesrow", "boxmedianrow", "deterministicrow", "stationsummary", "viewstatus"
  ]);

  const service = DataService.createDataService({ staticRoot: staticRoot(), backendRoot: backendRoot() });
  const state = UrlState.parseState(window.location.search);
  const refs = { runs: [], stations: [], payload: null, detPayload: null, charts: [], xRange: null, timer: 0, requestId: 0, busy: false, suggestionIndex: -1, suggestions: [], stationSelect: null, theme: { chartGrid: "rgba(143,164,184,0.12)", chartTick: "#91a5b9" } };

  Charts.registerPlugins();
  init().catch((error) => {
    console.error(error);
    dom.main.innerHTML = '<div class="chart-empty">Unable to load the HRRRCast 1D Viewer.</div>';
  });

  async function init() {
    bind();
    initA11y();
    refs.stations = await service.loadStations();
    refs.runs = await service.loadRuns();
    renderStationSelect();
    renderQuickStations();
    await loadPayload("replace");
  }

  function bind() {
    dom.stationSubmit.addEventListener("click", submitStation);
    dom.stationInput.addEventListener("keydown", onStationInputKeyDown);
    dom.stationInput.addEventListener("input", onSearchInput);
    dom.stationInput.addEventListener("focus", () => {
      if (refs.stationSelect) {
        refs.stationSelect.close();
      }
    });
    dom.maplocations.addEventListener("change", async () => {
      if (!dom.maplocations.value) { return; }
      state.station = dom.maplocations.value;
      refs.xRange = null;
      await loadPayload("push");
    });
    dom.graphcol.addEventListener("input", () => { state.col = Number(dom.graphcol.value); applyLayout(); syncUrl("replace"); });
    dom.graphhgt.addEventListener("input", () => { state.hgt = Number(dom.graphhgt.value); applyLayout(); syncUrl("replace"); });
    dom.togglecharts.addEventListener("click", () => {
      if (!isDistributionAvailable()) { return; }
      state.graph = state.graph === "chart" ? "distribution" : "chart";
      renderChartToggle();
      renderCharts();
      syncUrl("replace");
    });
    dom.cameraButton.addEventListener("click", copyLink);
    dom.downloadButton.addEventListener("click", downloadCurrentPayload);
    dom.settingsbtn.addEventListener("click", () => openModal(dom["settings"], dom.settingsbtn));
    dom.settingsclose.addEventListener("click", () => closeModal(dom["settings"]));
    dom.settingsclose.addEventListener("keydown", onCloseKeyDown);
    dom.customgroupbtn.addEventListener("click", () => { renderCustomGroupModal(); openModal(dom.customgroup, dom.customgroupbtn); });
    dom.customgroupclose.addEventListener("click", () => closeModal(dom.customgroup));
    dom.customgroupclose.addEventListener("keydown", onCloseKeyDown);
    dom.customgroupsave.addEventListener("click", () => { state.group = "custom"; state.elements = []; closeModal(dom.customgroup); renderSelectionView("push"); });
    dom.customgroupclear.addEventListener("click", () => { state.customgroup = []; if (state.group === "custom") { state.group = defaultGroup(); } closeModal(dom.customgroup); renderSelectionView("push"); });
    dom["map-btn"].addEventListener("click", toggleDrawer);
    dom.boxwhiskerlabel.addEventListener("click", () => openModal(dom["settings"], dom.boxwhiskerlabel));
    dom.boxwhiskerlabel.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openModal(dom["settings"], dom.boxwhiskerlabel);
      }
    });
    bindToggle(dom.obsonoff, "obs");
    bindToggle(dom.colorfriendly, "colorfriendly");
    bindToggle(dom.boxwhiskersreadout, "whiskers");
    bindToggle(dom.boxreadout, "boxes");
    bindToggle(dom.boxmedianreadout, "median");
    bindToggle(dom.deterministicreadout, "det", true);
    dom.fontsizeslider.addEventListener("input", () => { state.fontsize = Number(dom.fontsizeslider.value); applyTheme(); renderCharts(); syncUrl("replace"); });
    bindPercentileSlider(dom.whiskerlow, dom.whiskerlowvalue, "whiskerlow", 0, 50, () => {
      if (state.whiskerlow > state.boxlow) { state.boxlow = state.whiskerlow; }
      renderPercentileLabels();
    });
    bindPercentileSlider(dom.whiskerhigh, dom.whiskerhighvalue, "whiskerhigh", 50, 100, () => {
      if (state.whiskerhigh < state.boxhigh) { state.boxhigh = state.whiskerhigh; }
      renderPercentileLabels();
    });
    bindPercentileSlider(dom.boxlow, dom.boxlowvalue, "boxlow", 0, 50, () => {
      if (state.boxlow < state.whiskerlow) { state.whiskerlow = state.boxlow; }
      renderPercentileLabels();
    });
    bindPercentileSlider(dom.boxhigh, dom.boxhighvalue, "boxhigh", 50, 100, () => {
      if (state.boxhigh > state.whiskerhigh) { state.whiskerhigh = state.boxhigh; }
      renderPercentileLabels();
    });
    bindDropdowns();
    document.addEventListener("click", globalClick);
    document.addEventListener("keydown", hotkeys);
    window.addEventListener("popstate", () => { handlePopState().catch((error) => console.error(error)); });
  }

  async function loadPayload(urlMode) {
    const requestId = ++refs.requestId;
    setBusy(true, `Loading ${state.station} ${state.member === "ens" ? "ensemble" : state.member.toUpperCase()} data...`);
    try {
      const payload = await service.loadPointSeries(state.run, state.member, state.station);
      if (requestId !== refs.requestId) { return; }
      refs.payload = payload;
      state.station = refs.payload.station.id;
      state.member = refs.payload.member;
      refs.detPayload = null;
      if (state.det && state.member === "ens") {
        try { refs.detPayload = await service.loadPointSeries(state.run, "m00", state.station); } catch (error) { console.error(error); }
      }
      normalizeState();
      renderAll(urlMode);
      setBusy(false, `Loaded ${activeOverlayIds().length} ${activeOverlayIds().length === 1 ? "element" : "elements"} for ${state.station}.`);
    } catch (error) {
      if (requestId !== refs.requestId) { return; }
      console.error(error);
      setBusy(false, `Unable to load data for ${state.station}. Check the station code or selected run.`, true);
      if (!refs.payload) {
        dom.main.innerHTML = '<div class="chart-empty">Unable to load station data for this selection.</div>';
      }
    }
  }

  function renderAll(urlMode) {
    applyTheme();
    applyLayout();
    renderMenus();
    renderQuickStations();
    renderStationMap();
    renderCustomGroupModal();
    updateTitleBlock();
    updateDrawerStatus();
    renderCharts();
    syncUrl(urlMode);
  }

  function renderSelectionView(urlMode) {
    normalizeState();
    renderMenus();
    renderCustomGroupModal();
    updateTitleBlock();
    updateDrawerStatus();
    renderCharts();
    syncUrl(urlMode);
  }

  function renderMenus() {
    applyDistributionControls();
    renderRunMenu(); renderMemberMenu(); renderGroupMenu(); renderTimezoneMenus(); renderDarkModeMenu(); renderElementBrowser(); renderChartToggle();
    dom.stationInput.value = state.station;
    syncStationSelectValue();
    dom.stationInput.setAttribute("aria-expanded", String(!dom.suggestions.hidden));
    dom.stationInput.setAttribute("aria-controls", "suggestions");
    dom.obsonoff.checked = state.obs;
    dom.colorfriendly.checked = state.colorfriendly;
    dom.fontsizeslider.value = String(state.fontsize);
    dom.boxwhiskersreadout.checked = state.whiskers;
    dom.boxreadout.checked = state.boxes;
    dom.boxmedianreadout.checked = state.median;
    dom.deterministicreadout.checked = state.det;
    renderPercentileLabels();
  }

  function renderRunMenu() {
    fillMenu(dom.runmenu, [{ label: "Latest Ready", value: "latest-ready" }, ...refs.runs.slice().reverse().map((run) => ({ label: `${stamp(run.run_id)}${run.status === "ready" ? "" : " partial"}`, value: run.run_id }))], state.run, async (value) => { state.run = value; refs.xRange = null; await loadPayload("push"); });
    dom.runbtn.textContent = state.run === "latest-ready" ? "Latest Ready" : stamp(state.run);
  }

  function renderMemberMenu() {
    fillMenu(dom.membermenu, (refs.payload.available_members || []).map((member) => ({ label: member === "ens" ? "Ensemble" : member.toUpperCase(), value: member })), state.member, async (value) => { state.member = value; refs.xRange = null; await loadPayload("push"); });
    dom.memberbtn.textContent = state.member === "ens" ? "Ensemble" : state.member.toUpperCase();
  }

  function renderGroupMenu() {
    const items = [{ label: "All Elements", value: "all" }, ...activeGroupsRaw().map((group) => ({ label: groupTitle(group.id), value: group.id })), { label: "Custom Group", value: "custom" }];
    fillMenu(dom.groupmenu, items, state.group, async (value) => { state.group = value; state.elements = []; renderSelectionView("push"); });
    dom.groupbtn.textContent = groupTitle(state.group);
  }

  function renderTimezoneMenus() {
    const items = [{ label: "Current Timezone", value: "local" }, { label: "Timezone of Point", value: "station" }, { label: "UTC", value: "utc" }];
    fillMenu(dom.timezonemenu, items, state.tz, (value) => { state.tz = value; updateTitleBlock(); renderCharts(); syncUrl("replace"); });
    fillMenu(dom.timezonemenumodal, items, state.tz, (value) => { state.tz = value; updateTitleBlock(); renderCharts(); syncUrl("replace"); });
    const label = items.find((item) => item.value === state.tz)?.label || "Current Timezone";
    dom.timezonebtn.textContent = label;
    dom.timezonebtnmodal.textContent = label;
  }

  function renderDarkModeMenu() {
    const items = [{ label: "Auto", value: "auto" }, { label: "On", value: "on" }, { label: "Off", value: "off" }];
    fillMenu(dom.darkmodemenu, items, state.darkmode, (value) => { state.darkmode = value; applyTheme(); renderCharts(); syncUrl("replace"); });
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
        syncUrl("replace");
      });
      dom.customgroupoptions.appendChild(label);
    }
  }

  function bindToggle(element, key, ensureDet) {
    element.addEventListener("change", async () => {
      state[key] = element.checked;
      if (ensureDet && state.det && state.member === "ens") {
        try {
          refs.detPayload = await service.loadPointSeries(state.run, "m00", state.station);
        } catch (error) {
          console.error(error);
        }
      }
      applyTheme();
      renderCharts();
      updateTitleBlock();
      syncUrl("replace");
    });
  }

  function bindPercentileSlider(input, label, key, min, max, afterChange) {
    input.addEventListener("input", () => {
      state[key] = Math.max(min, Math.min(max, Number(input.value)));
      if (typeof afterChange === "function") {
        afterChange();
      }
      renderPercentileLabels();
      renderCharts();
      updateTitleBlock();
      syncUrl("replace");
    });
  }

  function renderPercentileLabels() {
    dom.whiskerlow.value = String(state.whiskerlow);
    dom.whiskerhigh.value = String(state.whiskerhigh);
    dom.boxlow.value = String(state.boxlow);
    dom.boxhigh.value = String(state.boxhigh);
    dom.whiskerlowvalue.textContent = `${state.whiskerlow}%`;
    dom.whiskerhighvalue.textContent = `${state.whiskerhigh}%`;
    dom.boxlowvalue.textContent = `${state.boxlow}%`;
    dom.boxhighvalue.textContent = `${state.boxhigh}%`;
  }

  function renderQuickStations() {
    dom.quickstations.innerHTML = "";
    const list = (refs.stations.length ? refs.stations : [{ id: "KRDU" }, { id: "KATL" }, { id: "KCLT" }, { id: "KDEN" }, { id: "KDFW" }, { id: "KJFK" }]).slice(0, 12);
    for (const station of list) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = station.id;
      button.className = station.id === state.station ? "is-active" : "";
      button.addEventListener("click", async () => { state.station = station.id; refs.xRange = null; await loadPayload("push"); });
      dom.quickstations.appendChild(button);
    }
  }

  function renderStationMap() {
    if (!dom.stationmap) { return; }
    const svg = dom.stationmap;
    svg.innerHTML = "";
    const width = 360;
    const height = 220;
    const pad = { left: 26, right: 14, top: 16, bottom: 18 };
    const bounds = { west: -125, east: -66, south: 24, north: 50 };
    const stations = refs.stations.length ? refs.stations : [{ id: "KRDU", lat: 35.89, lon: -78.78, site: "Raleigh-Durham Intl" }];
    const selected = stations.find((station) => station.id === state.station) || refs.payload?.station || stations[0];

    appendSvg(svg, "rect", {
      x: pad.left,
      y: pad.top,
      width: width - pad.left - pad.right,
      height: height - pad.top - pad.bottom,
      rx: 4,
      class: "stationmap-frame",
    });

    for (const lon of [-120, -110, -100, -90, -80, -70]) {
      const point = projectPoint(35, lon, width, height, pad, bounds);
      appendSvg(svg, "line", {
        x1: point.x,
        y1: pad.top,
        x2: point.x,
        y2: height - pad.bottom,
        class: "stationmap-grid",
      });
      appendSvg(svg, "text", {
        x: point.x,
        y: height - 4,
        class: "stationmap-label",
        "text-anchor": "middle",
      }, `${Math.abs(lon)}W`);
    }

    for (const lat of [25, 30, 35, 40, 45, 50]) {
      const point = projectPoint(lat, -96, width, height, pad, bounds);
      appendSvg(svg, "line", {
        x1: pad.left,
        y1: point.y,
        x2: width - pad.right,
        y2: point.y,
        class: "stationmap-grid",
      });
      appendSvg(svg, "text", {
        x: 6,
        y: point.y + 3,
        class: "stationmap-label",
      }, `${lat}N`);
    }

    for (const station of stations) {
      if (!Number.isFinite(Number(station.lat)) || !Number.isFinite(Number(station.lon))) { continue; }
      const point = projectPoint(Number(station.lat), Number(station.lon), width, height, pad, bounds);
      const active = station.id === selected.id;
      const marker = appendSvg(svg, "circle", {
        cx: point.x,
        cy: point.y,
        r: active ? 6 : 4,
        class: active ? "stationmap-marker is-active" : "stationmap-marker",
      });
      marker.addEventListener("click", async () => {
        state.station = station.id;
        refs.xRange = null;
        await loadPayload("push");
      });
      appendSvg(marker, "title", {}, `${station.id} ${station.site || ""}`.trim());

      if (active) {
        appendSvg(svg, "text", {
          x: point.x + 8,
          y: point.y - 8,
          class: "stationmap-text",
        }, station.id);
      }
    }

    dom.stationmapstatus.textContent = `${selected.id} ${selected.site || ""} | ${selected.state || ""} ${selected.country || ""}`.trim();
  }

  function renderStationSelect() {
    const stations = refs.stations.length ? refs.stations : [{ id: "KRDU", site: "Raleigh-Durham Intl" }];
    if (refs.stationSelect) {
      refs.stationSelect.clearOptions();
      refs.stationSelect.addOptions(stations.map((station) => ({
        value: station.id,
        text: `${station.id} ${station.site || ""}`.trim(),
      })));
      refs.stationSelect.refreshOptions(false);
    } else {
      dom.maplocations.innerHTML = "";
      for (const station of stations) {
        const option = document.createElement("option");
        option.value = station.id;
        option.textContent = `${station.id} ${station.site || ""}`.trim();
        dom.maplocations.appendChild(option);
      }
      initSearchableStationSelect();
    }
    syncStationSelectValue();
    dom.stationInput.value = state.station;
  }

  function renderChartToggle() {
    dom.togglecharts.textContent = state.graph === "distribution" ? "Spread" : "Chart";
    dom.togglecharts.hidden = !isDistributionAvailable();
  }

  function updateTitleBlock() {
    if (!refs.payload) { return; }
    const station = refs.payload.station;
    dom.maplocations.value = station.id;
    dom.stationInput.value = station.id;
    dom.stationsummary.innerHTML = `<strong>${station.id}</strong> ${station.site} | ${station.state || ""} ${station.country || ""} | ${Number(station.lat).toFixed(2)}, ${Number(station.lon).toFixed(2)}`;
    dom.datetitle.textContent = `${station.id} ${station.site} | ${refs.payload.member === "ens" ? "Ensemble" : refs.payload.member.toUpperCase()} ${groupTitle(state.group)} | ${stamp(refs.payload.run_id)} init | ${timezoneLabel(state.tz, station)}`;
    if (!isDistributionAvailable()) {
      dom.infoboxwhiskersvalues.textContent = "";
      return;
    }
    dom.infoboxwhiskersvalues.textContent = [
      state.whiskers ? "Whiskers on" : "Whiskers off",
      state.boxes ? "Boxes on" : "Boxes off",
      state.median ? "Median on" : "Median off",
      state.det ? "Deterministic on" : "Deterministic off",
      `W ${state.whiskerlow}-${state.whiskerhigh}%`,
      `B ${state.boxlow}-${state.boxhigh}%`,
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
      const modeBadge = series.chart_type === "distribution" ? '<span class="chart-badge is-spread">Ensemble Spread</span>' : '<span class="chart-badge is-line">Deterministic</span>';
      const unitBadge = series.units ? `<span class="chart-badge">${series.units}</span>` : "";
      const valueFormatter = (value, context) => formatSeriesValue(series, value, context);
      const panel = document.createElement("section");
      panel.className = `chart-panel${state.graph === "distribution" ? " compact" : ""} ${series.chart_type === "distribution" ? "is-distribution" : "is-deterministic"}`;
      panel.innerHTML = `<div class="chart-head"><div class="chart-head-left"><div class="chart-group-label">${groupTitle(groupForOverlay(overlayId))}</div><h3 class="chart-title">${series.label}</h3><div class="chart-badges">${modeBadge}${unitBadge}</div><p class="chart-description">${chartSubtitle(series)}</p></div><div class="chart-meta"><span>Latest ${valueFormatter(summary.latest, "meta")}${unit(series)}</span><span>Max ${valueFormatter(summary.max, "meta")}${unit(series)}</span><span>Min ${valueFormatter(summary.min, "meta")}${unit(series)}</span></div></div>${series.chart_type === "distribution" ? '<p class="chart-note">Drag to zoom. Click once on any plot to restore the full time range.</p>' : ""}<div class="chart-frame"><canvas></canvas></div>`;
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
        formatValue: valueFormatter,
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
    syncUrl("replace");
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
    if (!isDistributionAvailable()) {
      state.graph = "chart";
    }
    if (state.group === "custom" && !state.customgroup.length) { state.group = defaultGroup(); }
    if (!activeGroups().length) { state.group = defaultGroup(); }
  }

  function isDistributionAvailable() {
    return state.member === "ens";
  }

  function applyDistributionControls() {
    const show = isDistributionAvailable();
    if (!show && state.graph === "distribution") {
      state.graph = "chart";
    }
    const rows = [
      dom.boxwhiskerinfowrapper,
      dom.whiskerpercentilesrow,
      dom.boxpercentilesrow,
      dom.readoutheaderrow,
      dom.boxwhiskersrow,
      dom.boxesrow,
      dom.boxmedianrow,
      dom.deterministicrow,
    ];
    for (const row of rows) {
      if (row) {
        row.hidden = !show;
      }
    }
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
    syncUrl("replace");
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
    const match = resolveStationInput(dom.stationInput.value);
    if (match.needsChoice) {
      refs.suggestionIndex = refs.suggestions.length ? 0 : -1;
      renderSuggestions(refs.suggestions);
      setBusy(false, `Multiple stations match "${(dom.stationInput.value || "").trim().toUpperCase()}". Choose one from the list.`, false);
      return;
    }
    if (!match.stationId) {
      setBusy(false, `Station "${(dom.stationInput.value || "").trim().toUpperCase()}" was not found in the published station list.`, true);
      return;
    }
    state.station = match.stationId;
    refs.xRange = null;
    hideSuggestions();
    loadPayload("push").catch((error) => console.error(error));
  }

  function onSearchInput() {
    window.clearTimeout(refs.timer);
    const query = dom.stationInput.value.trim();
    if (refs.stationSelect) {
      refs.stationSelect.close();
      refs.stationSelect.blur();
    }
    refs.suggestionIndex = -1;
    if (!query) { hideSuggestions(); return; }
    refs.timer = window.setTimeout(async () => {
      const stations = await service.searchStations(query, refs.stations);
      if (!stations.length) { hideSuggestions(); return; }
      renderSuggestions(stations);
    }, 130);
  }

  function hideSuggestions() {
    refs.suggestions = [];
    refs.suggestionIndex = -1;
    dom.suggestions.hidden = true;
    dom.suggestions.innerHTML = "";
    dom.stationInput.setAttribute("aria-expanded", "false");
    dom.stationInput.removeAttribute("aria-activedescendant");
  }

  async function copyLink() {
    syncUrl("replace");
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
    dom["map-btn"].setAttribute("aria-expanded", String(open));
    if (open) {
      const target = dom.quickstations.querySelector("button") || dom.stationmap;
      if (target && typeof target.focus === "function") {
        window.setTimeout(() => target.focus(), 0);
      }
    } else {
      dom["map-btn"].focus();
    }
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
        applyTheme(); renderCharts(); syncUrl("replace");
        break;
      case "-":
        dom.fontsizeslider.value = String(Math.max(0.7, Number(dom.fontsizeslider.value) - 0.1));
        state.fontsize = Number(dom.fontsizeslider.value);
        applyTheme(); renderCharts(); syncUrl("replace");
        break;
      case "escape":
        closeAllDropdowns(); closeModal(dom["settings"]); closeModal(dom.customgroup);
        if (dom["side-drawer"].classList.contains("show-drawer")) {
          toggleDrawer();
        }
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
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = menu.classList.contains("is-open");
        closeAllDropdowns();
        if (!open) {
          menu.classList.add("is-open");
          button.setAttribute("aria-expanded", "true");
        }
      });
    });
  }

  function closeAllDropdowns() {
    for (const menu of document.querySelectorAll(".dropdown-content")) {
      menu.classList.remove("is-open");
    }
    for (const button of document.querySelectorAll(".dropbtn[aria-haspopup='menu']")) {
      button.setAttribute("aria-expanded", "false");
    }
  }

  function openModal(modal, trigger) {
    modal.dataset.returnFocusId = trigger && trigger.id ? trigger.id : "";
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    const target = modal.querySelector(".close, button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (target) {
      window.setTimeout(() => target.focus(), 0);
    }
  }

  function closeModal(modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    const returnFocusId = modal.dataset.returnFocusId;
    if (returnFocusId && dom[returnFocusId]) {
      dom[returnFocusId].focus();
    }
  }

  function fillMenu(menu, items, current, onPick) {
    menu.innerHTML = "";
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.value === current ? `${item.label} [Active]` : item.label;
      button.setAttribute("aria-current", item.value === current ? "true" : "false");
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

  function chartSubtitle(series) {
    if (series.chart_type === "distribution") {
      if (isTemperatureFamily(series)) {
        return "Ensemble 2 m temperature spread in degrees Fahrenheit with configurable box and whiskers.";
      }
      if (isWindFamily(series)) {
        return String(series.id || "").includes("gust")
          ? "Ensemble surface gust spread in miles per hour with configurable box and whiskers."
          : "Ensemble wind-speed spread in miles per hour with configurable box and whiskers.";
      }
      if (isPrecipFamily(series)) {
        return "Ensemble accumulated precipitation spread in inches through the forecast period.";
      }
      if (isVisibilityFamily(series)) {
        return "Ensemble visibility spread in statute miles with configurable box and whiskers.";
      }
      if (isCeilingFamily(series)) {
        return "Ensemble ceiling-height spread in meters with configurable box and whiskers.";
      }
      return "Ensemble member spread over time with configurable box and whiskers.";
    }
    if (String(series.id || "").includes("probability")) {
      return "Chance that the forecast exceeds the stated threshold at each forecast hour.";
    }
    if (isTemperatureFamily(series)) {
      return String(series.id || "").includes("dewpoint")
        ? "2 m dewpoint forecast in degrees Fahrenheit."
        : "2 m temperature forecast in degrees Fahrenheit.";
    }
    if (isWindFamily(series)) {
      return String(series.id || "").includes("gust")
        ? "Surface gust forecast in miles per hour."
        : "Wind-speed forecast in miles per hour.";
    }
    if (isPrecipFamily(series)) {
      return "Accumulated precipitation through each forecast hour in inches.";
    }
    if (isVisibilityFamily(series)) {
      return "Forecast visibility in statute miles.";
    }
    if (isCeilingFamily(series)) {
      return "Forecast ceiling height in meters.";
    }
    return "Deterministic forecast trace over time.";
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

  function formatSeriesValue(series, value, context) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "n/a";
    }
    if (isProbabilitySeries(series)) {
      if (numeric === 0) { return "0"; }
      if (Math.abs(numeric) < 1) { return numeric.toFixed(2); }
      if (Math.abs(numeric) < 10) { return numeric.toFixed(1); }
      return String(Math.round(numeric));
    }
    if (isPrecipFamily(series)) {
      if (Math.abs(numeric) < 1) { return numeric.toFixed(2); }
      if (Math.abs(numeric) < 10) { return numeric.toFixed(1); }
      return String(Math.round(numeric));
    }
    if (isCeilingFamily(series)) {
      return Math.round(numeric).toLocaleString();
    }
    if (isTemperatureFamily(series) || isWindFamily(series)) {
      return String(Math.round(numeric));
    }
    if (isVisibilityFamily(series)) {
      if (Math.abs(numeric) < 10) { return numeric.toFixed(1); }
      return String(Math.round(numeric));
    }
    if (context === "axis" && Math.abs(numeric) >= 10) {
      return String(Math.round(numeric));
    }
    return fmt(numeric);
  }

  function isProbabilitySeries(series) {
    return String(series && series.id || "").includes("probability") || series && series.units === "%";
  }

  function isTemperatureFamily(series) {
    const id = String(series && series.id || "");
    return series && series.units === "F" && (id.includes("temperature") || id.includes("dewpoint"));
  }

  function isWindFamily(series) {
    const id = String(series && series.id || "");
    return series && series.units === "mph" && (id.includes("wind") || id.includes("gust") || id.includes("shear"));
  }

  function isPrecipFamily(series) {
    const id = String(series && series.id || "");
    return series && series.units === "in" && (id.includes("qpf") || id.includes("precip"));
  }

  function isVisibilityFamily(series) {
    const id = String(series && series.id || "");
    return series && series.units === "mi" && id.includes("visibility");
  }

  function isCeilingFamily(series) {
    const id = String(series && series.id || "");
    return series && series.units === "m" && id.includes("ceiling");
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

  function syncUrl(mode) {
    if (!mode) {
      return;
    }
    UrlState.writeState(state, mode);
  }

  async function handlePopState() {
    const nextState = UrlState.parseState(window.location.search);
    const payloadChanged = nextState.station !== state.station || nextState.run !== state.run || nextState.member !== state.member;
    Object.assign(state, nextState);
    refs.xRange = null;
    if (payloadChanged) {
      await loadPayload();
      return;
    }
    applyTheme();
    applyLayout();
    renderSelectionView();
  }

  function resolveStationInput(value) {
    const text = String(value || "").trim().toUpperCase();
    if (!text) {
      return { stationId: UrlState.DEFAULTS.station, needsChoice: false };
    }
    const exact = refs.stations.find((station) =>
      [station.id, station.icaoId, station.faaId, station.iataId, ...(station.aliases || [])]
        .filter(Boolean)
        .map((item) => String(item).toUpperCase())
        .includes(text)
    );
    if (exact) {
      return { stationId: exact.id, needsChoice: false };
    }
    const matches = searchStationsFromCache(text);
    if (matches.length === 1) {
      return { stationId: matches[0].id, needsChoice: false };
    }
    if (matches.length > 1) {
      refs.suggestions = matches;
      return { stationId: null, needsChoice: true };
    }
    return { stationId: null, needsChoice: false };
  }

  function onStationInputKeyDown(event) {
    if (!refs.suggestions.length) {
      if (event.key === "Enter") {
        event.preventDefault();
        submitStation();
      }
      if (event.key === "Escape") {
        hideSuggestions();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      refs.suggestionIndex = Math.min(refs.suggestions.length - 1, refs.suggestionIndex + 1);
      renderSuggestions(refs.suggestions);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      refs.suggestionIndex = Math.max(0, refs.suggestionIndex - 1);
      renderSuggestions(refs.suggestions);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (refs.suggestionIndex >= 0 && refs.suggestionIndex < refs.suggestions.length) {
        selectSuggestedStation(refs.suggestions[refs.suggestionIndex].id).catch((error) => console.error(error));
        return;
      }
      submitStation();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      hideSuggestions();
    }
  }

  function searchStationsFromCache(query) {
    const text = String(query || "").trim().toUpperCase();
    if (!text) {
      return [];
    }
    const prefix = [];
    const contains = [];
    for (const station of refs.stations || []) {
      const haystack = [station.id, station.icaoId, station.faaId, station.iataId, ...(station.aliases || []), station.site]
        .filter(Boolean)
        .map((item) => String(item).toUpperCase());
      if (haystack.some((item) => item.startsWith(text))) {
        prefix.push(station);
      } else if (haystack.join(" ").includes(text)) {
        contains.push(station);
      }
    }
    return [...prefix, ...contains].slice(0, 10);
  }

  function renderSuggestions(stations) {
    refs.suggestions = stations.slice(0, 10);
    if (refs.suggestionIndex >= refs.suggestions.length) {
      refs.suggestionIndex = refs.suggestions.length ? 0 : -1;
    }
    dom.suggestions.innerHTML = "";
    for (const [index, station] of refs.suggestions.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `station-suggestion-${index}`;
      button.className = `suggestion-button${index === refs.suggestionIndex ? " is-active" : ""}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", index === refs.suggestionIndex ? "true" : "false");
      button.innerHTML = `<span class="suggestion-line"><strong>${station.id}</strong> ${station.site}</span><span class="suggestion-line">${[station.state, station.country].filter(Boolean).join(", ")} | ${station.lat.toFixed(2)}, ${station.lon.toFixed(2)}</span>`;
      button.addEventListener("mouseenter", () => {
        refs.suggestionIndex = index;
        renderSuggestions(refs.suggestions);
      });
      button.addEventListener("click", async () => { await selectSuggestedStation(station.id); });
      dom.suggestions.appendChild(button);
    }
    dom.suggestions.hidden = refs.suggestions.length === 0;
    dom.stationInput.setAttribute("aria-expanded", String(refs.suggestions.length > 0));
    if (refs.suggestionIndex >= 0) {
      dom.stationInput.setAttribute("aria-activedescendant", `station-suggestion-${refs.suggestionIndex}`);
    } else {
      dom.stationInput.removeAttribute("aria-activedescendant");
    }
  }

  async function selectSuggestedStation(stationId) {
    state.station = stationId;
    refs.xRange = null;
    hideSuggestions();
    await loadPayload("push");
  }

  function setBusy(isBusy, message, isError) {
    refs.busy = isBusy;
    const controls = [
      dom.stationInput,
      dom.stationSubmit,
      dom.maplocations,
      dom.runbtn,
      dom.memberbtn,
      dom.groupbtn,
      dom.timezonebtn,
      dom.darkmodebtn,
      dom.elementbrowserbtn,
    ];
    for (const control of controls) {
      if (control) {
        control.disabled = isBusy;
      }
    }
    if (refs.stationSelect) {
      if (isBusy) {
        refs.stationSelect.disable();
      } else {
        refs.stationSelect.enable();
      }
    }
    dom.viewstatus.textContent = message || "";
    dom.viewstatus.classList.toggle("is-loading", Boolean(isBusy));
    dom.viewstatus.classList.toggle("is-error", Boolean(isError));
    if (dom.main) {
      dom.main.setAttribute("aria-busy", isBusy ? "true" : "false");
    }
  }

  function initA11y() {
    dom.stationInput.setAttribute("autocomplete", "off");
    dom.stationInput.setAttribute("aria-autocomplete", "list");
    dom.stationInput.setAttribute("aria-controls", "suggestions");
    dom.stationInput.setAttribute("aria-label", "Airport code search");
    dom.maplocations.setAttribute("aria-label", "Station selector");
    dom.boxwhiskerlabel.setAttribute("tabindex", "0");
    dom.boxwhiskerlabel.setAttribute("role", "button");
    dom.boxwhiskerlabel.setAttribute("aria-label", "Open box whisker settings");
    dom["settings"].setAttribute("aria-hidden", "true");
    dom.customgroup.setAttribute("aria-hidden", "true");
    dom.quickstations.setAttribute("aria-label", "Quick station buttons");
  }

  function onCloseKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  }

  function initSearchableStationSelect() {
    if (!window.TomSelect || refs.stationSelect) {
      return;
    }
    refs.stationSelect = new TomSelect(dom.maplocations, {
      create: false,
      maxItems: 1,
      closeAfterSelect: true,
      searchField: ["text", "value"],
      placeholder: "Search station",
      allowEmptyOption: false,
      copyClassesToDropdown: false,
      render: {
        option(data, escape) {
          return `<div>${escape(data.text)}</div>`;
        },
      },
      onChange(value) {
        if (!value || value === state.station) {
          return;
        }
        dom.maplocations.value = value;
        dom.maplocations.dispatchEvent(new Event("change", { bubbles: true }));
      },
      onFocus() {
        hideSuggestions();
        refs.stationSelect.control_input.setAttribute("aria-expanded", String(refs.stationSelect.isOpen));
      },
      onDropdownOpen() {
        hideSuggestions();
        refs.stationSelect.control_input.setAttribute("aria-expanded", "true");
      },
      onDropdownClose() {
        refs.stationSelect.control_input.setAttribute("aria-expanded", "false");
      },
    });
    refs.stationSelect.wrapper.classList.add("station-select-shell");
    dom.maplocations.tabIndex = -1;
    refs.stationSelect.dropdown.id = "station-select-dropdown";
    refs.stationSelect.control_input.setAttribute("aria-label", "Searchable station selector");
    refs.stationSelect.control_input.setAttribute("aria-controls", refs.stationSelect.dropdown.id);
    refs.stationSelect.control_input.setAttribute("aria-expanded", "false");
    refs.stationSelect.control_input.setAttribute("aria-haspopup", "listbox");
    refs.stationSelect.control_input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        refs.stationSelect.close();
        refs.stationSelect.control_input.setAttribute("aria-expanded", "false");
        event.stopPropagation();
        return;
      }
      if (event.key === "Enter" && refs.stationSelect.isOpen) {
        hideSuggestions();
      }
    });
  }

  function syncStationSelectValue() {
    if (refs.stationSelect) {
      refs.stationSelect.setValue(state.station, true);
      return;
    }
    dom.maplocations.value = state.station;
  }

  function projectPoint(lat, lon, width, height, pad, bounds) {
    const xSpan = bounds.east - bounds.west;
    const ySpan = bounds.north - bounds.south;
    const x = pad.left + ((lon - bounds.west) / xSpan) * (width - pad.left - pad.right);
    const y = pad.top + ((bounds.north - lat) / ySpan) * (height - pad.top - pad.bottom);
    return { x, y };
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

  function appendSvg(parent, tag, attrs, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      node.setAttribute(key, String(value));
    }
    if (text != null) {
      node.textContent = text;
    }
    parent.appendChild(node);
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

