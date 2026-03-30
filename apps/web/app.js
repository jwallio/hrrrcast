(function () {
  "use strict";

  const CONFIG = window.HRRRCAST_STATION_VIEWER || {};
  const STATIC_ROOT = resolveStaticRoot();
  const STATIC_MODE = Boolean(STATIC_ROOT);
  const BACKEND_ROOT = STATIC_MODE ? "" : resolveBackendRoot();
  const DEFAULT_STATION = "KRDU";
  const DEFAULT_MEMBER = "ens";
  const SEARCH_DEBOUNCE_MS = 160;
  const CHART_TICK_COLOR = "#8fa4b8";
  const CHART_GRID_COLOR = "rgba(143, 164, 184, 0.12)";

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
    member: DEFAULT_MEMBER,
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

  registerDistributionPlugin();

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
      option.textContent = member === "ens" ? "Ens Spread + Probabilities" : member.toUpperCase();
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
    const modeCopy = payload.member === "ens"
      ? "Ensemble mode shows severe probabilities plus member spread charts with median, quartiles, and whiskers."
      : "Deterministic mode shows nearest-grid HRRRCast time series from the selected member.";
    dom.stationCopy.textContent = `${modeCopy} Values come from the closest processed model grid point for each forecast hour.`;
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
        const summary = summarizeSeries(series);
        const summaryHtml = renderChartSummary(summary, series.units || "");
        const noteHtml = renderChartNote(series, summary);
        card.innerHTML = `
          <div class="chart-card-head">
            <h3 class="chart-title">${series.label}</h3>
            <span class="chart-units">${series.units || ""}</span>
          </div>
          ${summaryHtml}
          ${noteHtml}
          <div class="chart-frame"><canvas></canvas></div>
        `;
        chartList.appendChild(card);
        refs.charts.push(buildChart(card.querySelector("canvas"), series, summary));
      }

      if (chartList.children.length) {
        dom.chartGroups.appendChild(section);
      }
    }

    if (!renderedCharts) {
      dom.chartGroups.innerHTML = '<section class="chart-section"><div class="chart-empty">No charts match the selected element group.</div></section>';
    }
  }

  function buildChart(canvas, series, summary) {
    if (series.chart_type === "distribution") {
      return buildDistributionChart(canvas, series, summary);
    }
    const labels = series.points.map((point) => `+${String(point.forecast_hour).padStart(3, "0")}`);
    const color = chartColor(series.style, series.id);
    const allZero = Boolean(summary && summary.allZero);
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
            borderWidth: allZero ? 2.5 : 2.25,
            pointRadius: labels.length <= 24 ? 1.5 : 0,
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
              color: CHART_TICK_COLOR,
            },
            grid: { color: CHART_GRID_COLOR },
          },
          y: {
            beginAtZero: shouldBeginAtZero(series.style),
            min: allZero ? -5 : undefined,
            suggestedMin: allZero ? undefined : rangeValue(series.style, 0),
            suggestedMax: allZero ? Math.max(rangeValue(series.style, 1) || 5, 5) : rangeValue(series.style, 1),
            ticks: {
              color: CHART_TICK_COLOR,
              callback(value) {
                return series.units === "%" ? `${value}%` : value;
              },
            },
            grid: { color: CHART_GRID_COLOR },
          },
        },
      },
    });
  }

  function buildDistributionChart(canvas, series) {
    const labels = series.points.map((point) => `+${String(point.forecast_hour).padStart(3, "0")}`);
    const color = chartColor(series.style, series.id);
    return new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: `${series.label} Median`,
            data: series.points.map((point) => point.median),
            borderColor: color,
            borderWidth: 2.2,
            pointRadius: labels.length <= 24 ? 1.75 : 0,
            pointHitRadius: 12,
            tension: 0.12,
            fill: false,
          },
          {
            label: `${series.label} Mean`,
            data: series.points.map((point) => point.mean),
            borderColor: hexWithAlpha(color, 0.72),
            borderDash: [5, 4],
            borderWidth: 1.4,
            pointRadius: 0,
            pointHitRadius: 12,
            tension: 0.12,
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
          distributionBoxWhisker: {
            points: series.points,
            color,
          },
          tooltip: {
            callbacks: {
              title(items) {
                const point = series.points[items[0].dataIndex];
                return `${items[0].label} | ${formatLocalTime(point.valid_time_utc)}`;
              },
              label(item) {
                const point = series.points[item.dataIndex];
                const suffix = series.units ? ` ${series.units}` : "";
                return [
                  `Median: ${formatValue(point.median)}${suffix}`,
                  `Mean: ${formatValue(point.mean)}${suffix}`,
                  `IQR: ${formatValue(point.q1)}${suffix} to ${formatValue(point.q3)}${suffix}`,
                  `Range: ${formatValue(point.min)}${suffix} to ${formatValue(point.max)}${suffix}`,
                  `Members: ${point.count}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              color: CHART_TICK_COLOR,
            },
            grid: { color: CHART_GRID_COLOR },
          },
          y: {
            beginAtZero: shouldBeginAtZero(series.style),
            suggestedMin: rangeValue(series.style, 0),
            suggestedMax: rangeValue(series.style, 1),
            ticks: {
              color: CHART_TICK_COLOR,
              callback(value) {
                return series.units === "%" ? `${value}%` : value;
              },
            },
            grid: { color: CHART_GRID_COLOR },
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
    state.member = params.get("member") || DEFAULT_MEMBER;
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

  function summarizeSeries(series) {
    if (series && series.chart_type === "distribution" && series.summary) {
      return {
        count: Number(series.summary.count || 0),
        min: normalizeNumber(series.summary.min),
        max: normalizeNumber(series.summary.max),
        latest: normalizeNumber(series.summary.latest),
        allZero: Boolean(series.summary.all_zero),
      };
    }
    if (series && series.summary) {
      return {
        count: Number(series.summary.count || 0),
        min: normalizeNumber(series.summary.min),
        max: normalizeNumber(series.summary.max),
        latest: normalizeNumber(series.summary.latest),
        allZero: Boolean(series.summary.all_zero),
      };
    }
    const values = (series.points || [])
      .map((point) => normalizeNumber(point.value))
      .filter((value) => Number.isFinite(value));
    if (!values.length) {
      return { count: 0, min: null, max: null, latest: null, allZero: false };
    }
    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      latest: values[values.length - 1],
      allZero: values.every((value) => Math.abs(value) < 1e-6),
    };
  }

  function renderChartSummary(summary, units) {
    const suffix = units ? ` ${units}` : "";
    return `
      <div class="chart-summary">
        <span>Latest <strong>${formatValue(summary.latest)}${suffix}</strong></span>
        <span>Max <strong>${formatValue(summary.max)}${suffix}</strong></span>
        <span>Min <strong>${formatValue(summary.min)}${suffix}</strong></span>
      </div>
    `;
  }

  function renderChartNote(series, summary) {
    if (series.chart_type === "distribution") {
      return '<p class="chart-note">Boxes show the 25th to 75th percentile member spread, whiskers show min to max, solid line is median, dashed line is mean.</p>';
    }
    if (summary.allZero) {
      return '<p class="chart-note">All forecast hours are currently zero for this element at this station.</p>';
    }
    return "";
  }

  function normalizeNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function hexWithAlpha(hex, alpha) {
    const clean = String(hex || "").replace("#", "");
    if (clean.length !== 6) {
      return hex;
    }
    const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
    return `#${clean}${a.toString(16).padStart(2, "0")}`;
  }

  function registerDistributionPlugin() {
    if (!window.Chart || Chart.registry.plugins.get("distributionBoxWhisker")) {
      return;
    }
    Chart.register({
      id: "distributionBoxWhisker",
      afterDatasetsDraw(chart, _args, pluginOptions) {
        if (!pluginOptions || !Array.isArray(pluginOptions.points) || !pluginOptions.points.length) {
          return;
        }
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        if (!xScale || !yScale) {
          return;
        }
        const ctx = chart.ctx;
        const color = pluginOptions.color || "#49a7ff";
        const fill = hexWithAlpha(color, 0.18);
        const points = pluginOptions.points;
        const boxWidth = Math.max(8, Math.min(22, xStepEstimate(xScale, points.length) * 0.42));

        ctx.save();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = hexWithAlpha(color, 0.95);
        ctx.fillStyle = fill;
        for (let index = 0; index < points.length; index += 1) {
          const point = points[index];
          const x = xScale.getPixelForValue(index);
          const yMin = yScale.getPixelForValue(point.min);
          const yQ1 = yScale.getPixelForValue(point.q1);
          const yMedian = yScale.getPixelForValue(point.median);
          const yQ3 = yScale.getPixelForValue(point.q3);
          const yMax = yScale.getPixelForValue(point.max);
          ctx.beginPath();
          ctx.moveTo(x, yMin);
          ctx.lineTo(x, yMax);
          ctx.stroke();

          ctx.fillRect(x - boxWidth / 2, Math.min(yQ1, yQ3), boxWidth, Math.max(2, Math.abs(yQ3 - yQ1)));
          ctx.strokeRect(x - boxWidth / 2, Math.min(yQ1, yQ3), boxWidth, Math.max(2, Math.abs(yQ3 - yQ1)));

          ctx.beginPath();
          ctx.moveTo(x - boxWidth / 2, yMedian);
          ctx.lineTo(x + boxWidth / 2, yMedian);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x - boxWidth * 0.3, yMin);
          ctx.lineTo(x + boxWidth * 0.3, yMin);
          ctx.moveTo(x - boxWidth * 0.3, yMax);
          ctx.lineTo(x + boxWidth * 0.3, yMax);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }

  function xStepEstimate(xScale, count) {
    if (!xScale || count < 2) {
      return 18;
    }
    const first = xScale.getPixelForValue(0);
    const second = xScale.getPixelForValue(1);
    return Math.abs(second - first) || 18;
  }
})();
