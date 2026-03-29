(function () {
  "use strict";

  const CONFIG = window.HRRRCAST_STATION_VIEWER || {};
  const STATIC_ROOT = resolveStaticRoot();
  const STATIC_MODE = Boolean(STATIC_ROOT);
  const BACKEND_ROOT = STATIC_MODE ? "" : resolveBackendRoot();
  const DEFAULT_STATION = "KRDU";
  const SEARCH_DEBOUNCE_MS = 160;

  const dom = {
    statusPill: document.getElementById("statusPill"),
    lookupForm: document.getElementById("lookupForm"),
    stationInput: document.getElementById("stationInput"),
    suggestions: document.getElementById("suggestions"),
    runSelect: document.getElementById("runSelect"),
    memberSelect: document.getElementById("memberSelect"),
    groupFilters: document.getElementById("groupFilters"),
    stationTitle: document.getElementById("stationTitle"),
    stationMeta: document.getElementById("stationMeta"),
    stationCopy: document.getElementById("stationCopy"),
    chartGroups: document.getElementById("chartGroups"),
  };

  const state = {
    run: "latest-ready",
    member: "ens",
    station: DEFAULT_STATION,
    group: "all",
  };

  const refs = {
    runs: [],
    charts: [],
    suggestionTimer: 0,
    lastPayload: null,
    staticStations: [],
  };

  init().catch((error) => {
    console.error(error);
    dom.statusPill.textContent = "Viewer load failed";
    dom.stationCopy.textContent = "Unable to load the station viewer.";
  });

  async function init() {
    hydrateStateFromUrl();
    bindEvents();
    if (STATIC_MODE) {
      refs.staticStations = await loadStaticStations();
    }
    await loadRuns();
    await loadPointSeries(state.station);
  }

  function bindEvents() {
    dom.lookupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = dom.stationInput.value.trim().toUpperCase();
      if (!code) {
        return;
      }
      await loadPointSeries(code);
    });

    dom.stationInput.addEventListener("input", () => {
      const query = dom.stationInput.value.trim();
      window.clearTimeout(refs.suggestionTimer);
      if (!query) {
        hideSuggestions();
        return;
      }
      refs.suggestionTimer = window.setTimeout(() => {
        searchStations(query).catch((error) => console.error(error));
      }, SEARCH_DEBOUNCE_MS);
    });

    dom.stationInput.addEventListener("focus", () => {
      const query = dom.stationInput.value.trim();
      if (query) {
        searchStations(query).catch((error) => console.error(error));
      }
    });

    document.addEventListener("click", (event) => {
      if (!dom.suggestions.contains(event.target) && event.target !== dom.stationInput) {
        hideSuggestions();
      }
    });

    dom.runSelect.addEventListener("change", async () => {
      state.run = dom.runSelect.value;
      await loadPointSeries(state.station);
    });

    dom.memberSelect.addEventListener("change", async () => {
      state.member = dom.memberSelect.value;
      state.group = "all";
      await loadPointSeries(state.station);
    });
  }

  async function loadRuns() {
    const payload = STATIC_MODE
      ? await fetchJson(`${STATIC_ROOT}/runs.json`)
      : await fetchJson(`${BACKEND_ROOT}/api/runs`);
    refs.runs = Array.isArray(payload.runs) ? payload.runs : [];
    renderRunOptions();
  }

  function renderRunOptions() {
    dom.runSelect.innerHTML = "";
    const latestReady = document.createElement("option");
    latestReady.value = "latest-ready";
    latestReady.textContent = "Latest Ready";
    latestReady.selected = state.run === "latest-ready";
    dom.runSelect.appendChild(latestReady);
    for (const run of refs.runs.slice().reverse()) {
      const option = document.createElement("option");
      option.value = run.run_id;
      option.textContent = `${formatRunStamp(run.run_id)}${run.status === "ready" ? "" : " partial"}`;
      option.selected = run.run_id === state.run;
      dom.runSelect.appendChild(option);
    }
  }

  async function searchStations(query) {
    const stations = STATIC_MODE
      ? searchStaticStations(query, 8)
      : await fetchBackendStations(query);
    if (!stations.length) {
      hideSuggestions();
      return;
    }
    dom.suggestions.innerHTML = "";
    for (const station of stations) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion-button";
      button.innerHTML = [
        `<span class="suggestion-line"><strong>${station.id}</strong> ${station.site}</span>`,
        `<span class="suggestion-line">${[station.state, station.country].filter(Boolean).join(", ")} | ${station.lat.toFixed(2)}, ${station.lon.toFixed(2)}</span>`,
      ].join("");
      button.addEventListener("click", async () => {
        dom.stationInput.value = station.id;
        hideSuggestions();
        await loadPointSeries(station.id);
      });
      dom.suggestions.appendChild(button);
    }
    dom.suggestions.hidden = false;
  }

  function hideSuggestions() {
    dom.suggestions.hidden = true;
    dom.suggestions.innerHTML = "";
  }

  async function loadPointSeries(stationCode) {
    state.station = stationCode.toUpperCase();
    dom.stationInput.value = state.station;
    dom.statusPill.textContent = `Loading ${state.station}`;
    hideSuggestions();

    const payload = STATIC_MODE
      ? await fetchStaticPointSeries(state.run, state.member, state.station)
      : await fetchJson(`${BACKEND_ROOT}/api/point-series?run=${encodeURIComponent(state.run)}&station=${encodeURIComponent(state.station)}&member=${encodeURIComponent(state.member)}`);
    refs.lastPayload = payload;
    state.member = payload.member;
    if (!payload.chart_groups.some((group) => group.id === state.group)) {
      state.group = "all";
    }
    renderMemberOptions(payload.available_members || []);
    renderStation(payload);
    renderGroupFilters(payload.chart_groups || []);
    renderCharts(payload);
    dom.statusPill.textContent = `${payload.run_id} | ${payload.member.toUpperCase()} | ${payload.station.id}`;
    updateUrl();
  }

  function renderMemberOptions(availableMembers) {
    dom.memberSelect.innerHTML = "";
    for (const member of availableMembers) {
      const option = document.createElement("option");
      option.value = member;
      option.textContent = member === "ens" ? "Ens Probabilities" : member.toUpperCase();
      option.selected = member === state.member;
      dom.memberSelect.appendChild(option);
    }
  }

  function renderStation(payload) {
    const station = payload.station;
    dom.stationTitle.textContent = `${station.id} | ${station.site}`;
    dom.stationMeta.innerHTML = "";
    const badges = [
      station.icaoId ? `ICAO ${station.icaoId}` : null,
      station.faaId ? `FAA ${station.faaId}` : null,
      station.iataId ? `IATA ${station.iataId}` : null,
      `${station.lat.toFixed(2)}, ${station.lon.toFixed(2)}`,
      station.elev ? `${station.elev} m` : null,
    ].filter(Boolean);
    for (const text of badges) {
      const chip = document.createElement("span");
      chip.textContent = text;
      dom.stationMeta.appendChild(chip);
    }
    dom.stationCopy.textContent = `Nearest-grid HRRRCast time series for ${station.id}. Values come from the closest processed model grid point for each forecast hour.`;
  }

  function renderGroupFilters(groups) {
    dom.groupFilters.innerHTML = "";
    const items = [{ id: "all", title: "All Elements" }, ...groups.map((group) => ({ id: group.id, title: group.title }))];
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "group-button";
      button.textContent = item.title;
      if (item.id === state.group) {
        button.classList.add("is-active");
      }
      button.addEventListener("click", () => {
        state.group = item.id;
        renderCharts(refs.lastPayload);
        updateUrl();
      });
      dom.groupFilters.appendChild(button);
    }
  }

  function renderCharts(payload) {
    destroyCharts();
    dom.chartGroups.innerHTML = "";
    if (!payload || !payload.chart_groups || !payload.chart_groups.length) {
      dom.chartGroups.innerHTML = '<section class="chart-section"><div class="chart-empty">No chartable products are available for this station and member.</div></section>';
      return;
    }

    let renderedCharts = 0;
    for (const group of payload.chart_groups) {
      if (state.group !== "all" && group.id !== state.group) {
        continue;
      }
      const section = document.createElement("section");
      section.className = "chart-section";
      section.innerHTML = `
        <div class="section-head">
          <div>
            <p class="section-kicker">Element Group</p>
            <h2 class="section-title">${group.title}</h2>
          </div>
        </div>
      `;
      const chartList = document.createElement("div");
      chartList.className = "chart-list";
      section.appendChild(chartList);

      for (const overlayId of group.overlays) {
        const series = payload.series[overlayId];
        if (!series || !series.points || !series.points.length) {
          continue;
        }
        renderedCharts += 1;
        const card = document.createElement("article");
        card.className = "chart-card";
        card.innerHTML = `
          <div class="chart-card-head">
            <h3 class="chart-title">${series.label}</h3>
            <span class="chart-units">${series.units || ""}</span>
          </div>
          <div class="chart-frame"><canvas></canvas></div>
        `;
        chartList.appendChild(card);
        refs.charts.push(buildChart(card.querySelector("canvas"), series));
      }

      if (chartList.children.length) {
        dom.chartGroups.appendChild(section);
      }
    }

    if (!renderedCharts) {
      dom.chartGroups.innerHTML = '<section class="chart-section"><div class="chart-empty">No charts match the selected element group.</div></section>';
    }
  }

  function buildChart(canvas, series) {
    const labels = series.points.map((point) => `+${String(point.forecast_hour).padStart(3, "0")}`);
    const color = chartColor(series.style, series.id);
    return new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: series.label,
            data: series.points.map((point) => point.value),
            borderColor: color,
            backgroundColor: `${color}24`,
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 12,
            tension: 0.18,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) {
                const point = series.points[items[0].dataIndex];
                return `${items[0].label} | ${formatLocalTime(point.valid_time_utc)}`;
              },
              label(item) {
                const suffix = series.units ? ` ${series.units}` : "";
                return `${series.label}: ${formatValue(item.parsed.y)}${suffix}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              color: "#566a7c",
            },
            grid: { color: "rgba(28, 42, 58, 0.08)" },
          },
          y: {
            beginAtZero: shouldBeginAtZero(series.style),
            suggestedMin: rangeValue(series.style, 0),
            suggestedMax: rangeValue(series.style, 1),
            ticks: { color: "#566a7c" },
            grid: { color: "rgba(28, 42, 58, 0.08)" },
          },
        },
      },
    });
  }

  function destroyCharts() {
    for (const chart of refs.charts) {
      chart.destroy();
    }
    refs.charts = [];
  }

  function chartColor(style, overlayId) {
    if (style && Array.isArray(style.colors) && style.colors.length) {
      return style.colors[style.colors.length - 1];
    }
    if (overlayId.includes("probability")) {
      return "#cb5f24";
    }
    return "#2b6fbe";
  }

  function shouldBeginAtZero(style) {
    return style && Array.isArray(style.range) ? style.range[0] >= 0 : true;
  }

  function rangeValue(style, index) {
    return style && Array.isArray(style.range) ? style.range[index] : undefined;
  }

  function hydrateStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    state.station = (params.get("station") || DEFAULT_STATION).trim().toUpperCase();
    state.member = params.get("member") || "ens";
    state.run = params.get("run") || "latest-ready";
    state.group = params.get("group") || "all";
  }

  function updateUrl() {
    const params = new URLSearchParams();
    params.set("station", state.station);
    params.set("member", state.member);
    params.set("run", state.run);
    params.set("group", state.group);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async function fetchBackendStations(query) {
    const payload = await fetchJson(`${BACKEND_ROOT}/api/stations/search?q=${encodeURIComponent(query)}&limit=8`);
    return Array.isArray(payload.stations) ? payload.stations : [];
  }

  async function loadStaticStations() {
    const payload = await fetchJson(`${STATIC_ROOT}/stations.json`);
    return Array.isArray(payload.stations) ? payload.stations : [];
  }

  function searchStaticStations(query, limit) {
    const text = query.trim().toUpperCase();
    if (!text) {
      return [];
    }
    const prefix = [];
    const contains = [];
    for (const station of refs.staticStations) {
      const tokens = [station.id, ...(station.aliases || []), station.site].filter(Boolean).map((item) => String(item).toUpperCase());
      if (tokens.some((item) => item.startsWith(text))) {
        prefix.push(station);
      } else if (tokens.join(" ").includes(text)) {
        contains.push(station);
      }
    }
    return [...prefix, ...contains].slice(0, limit);
  }

  async function fetchStaticPointSeries(run, member, station) {
    const runToken = run === "latest-ready" ? "latest-ready" : run;
    return fetchJson(`${STATIC_ROOT}/point-series/${runToken}/${member}/${station}.json`);
  }

  function resolveBackendRoot() {
    const params = new URLSearchParams(window.location.search);
    const paramRoot = params.get("backend");
    if (paramRoot) {
      return paramRoot.replace(/\/$/, "");
    }
    if (typeof CONFIG.backend === "string" && CONFIG.backend) {
      return CONFIG.backend.replace(/\/$/, "");
    }
    return window.location.origin;
  }

  function resolveStaticRoot() {
    const params = new URLSearchParams(window.location.search);
    const paramRoot = params.get("staticRoot");
    if (paramRoot) {
      return paramRoot.replace(/\/$/, "");
    }
    if (typeof CONFIG.staticRoot === "string" && CONFIG.staticRoot) {
      return CONFIG.staticRoot.replace(/\/$/, "");
    }
    return "";
  }

  function formatRunStamp(runId) {
    const year = Number(runId.slice(0, 4));
    const month = Number(runId.slice(4, 6)) - 1;
    const day = Number(runId.slice(6, 8));
    const hour = Number(runId.slice(8, 10));
    const date = new Date(Date.UTC(year, month, day, hour));
    return `${String(date.getUTCHours()).padStart(2, "0")}Z ${date.toLocaleString(undefined, { month: "short", day: "2-digit", timeZone: "UTC" })}`;
  }

  function formatLocalTime(value) {
    const date = new Date(value);
    return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  function formatValue(value) {
    if (!Number.isFinite(value)) {
      return "n/a";
    }
    return Math.abs(value) >= 100 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
  }
})();
