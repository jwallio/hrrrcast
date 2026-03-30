(function () {
  "use strict";

  const DEFAULT_PALETTE = {
    probability: "#f78f3f",
    distribution: "#54a3ff",
    deterministic: "#54a3ff",
    overlay: "#f2c866",
    median: "#f2c866",
    mean: "#96bde6",
    whisker: "#7dc8ff",
    crosshair: "rgba(255,255,255,0.2)",
    selection: "rgba(123, 180, 255, 0.18)",
    selectionBorder: "rgba(123, 180, 255, 0.86)",
  };

  const COLOR_FRIENDLY_PALETTE = {
    probability: "#d787ff",
    distribution: "#36cfc9",
    deterministic: "#36cfc9",
    overlay: "#ffb86c",
    median: "#ffb86c",
    mean: "#8dc5ff",
    whisker: "#73f0cb",
    crosshair: "rgba(255,255,255,0.18)",
    selection: "rgba(130, 225, 212, 0.16)",
    selectionBorder: "rgba(130, 225, 212, 0.82)",
  };

  const FONT_SIZES = {
    sm: { tick: 10, title: 11, tooltip: 11 },
    md: { tick: 11, title: 12, tooltip: 12 },
    lg: { tick: 12, title: 13, tooltip: 13 },
  };

  function registerPlugins() {
    if (!window.Chart || Chart.registry.plugins.get("hrrrcastDistribution")) {
      return;
    }
    Chart.register(distributionPlugin, selectionPlugin, crosshairPlugin);
  }

  function buildChart(canvas, config) {
    const palette = config.colorfriendly ? COLOR_FRIENDLY_PALETTE : DEFAULT_PALETTE;
    const font = FONT_SIZES[config.fontsize] || FONT_SIZES.md;
    return config.series.chart_type === "distribution"
      ? buildDistributionChart(canvas, config, palette, font)
      : buildLineChart(canvas, config, palette, font);
  }

  function syncRange(chart, range) {
    chart.options.scales.x.min = range ? range.min : undefined;
    chart.options.scales.x.max = range ? range.max : undefined;
    chart.update("none");
  }

  function attachZoomHandlers(chart, onRangeChange) {
    const canvas = chart.canvas;
    let startX = null;
    let pointerDown = false;

    canvas.addEventListener("mousedown", (event) => {
      pointerDown = true;
      startX = event.offsetX;
      chart.$selection = { startX, endX: startX };
      chart.draw();
    });

    canvas.addEventListener("mousemove", (event) => {
      if (!pointerDown || startX == null) {
        return;
      }
      chart.$selection = { startX, endX: event.offsetX };
      chart.draw();
    });

    const finish = (event) => {
      if (!pointerDown || startX == null) {
        return;
      }
      pointerDown = false;
      const endX = event.offsetX;
      const distance = Math.abs(endX - startX);
      const xScale = chart.scales.x;
      chart.$selection = null;
      chart.draw();
      if (distance < 5) {
        onRangeChange(null);
        startX = null;
        return;
      }
      const rawMin = xScale.getValueForPixel(Math.min(startX, endX));
      const rawMax = xScale.getValueForPixel(Math.max(startX, endX));
      startX = null;
      if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
        return;
      }
      onRangeChange({
        min: Math.max(0, Math.floor(rawMin)),
        max: Math.ceil(rawMax),
      });
    };

    canvas.addEventListener("mouseup", finish);
    canvas.addEventListener("mouseleave", () => {
      pointerDown = false;
      startX = null;
      chart.$selection = null;
      chart.draw();
    });
  }

  function buildLineChart(canvas, config, palette, font) {
    const points = config.series.points.map((point) => ({
      x: point.forecast_hour,
      y: point.value,
      validTime: point.valid_time_utc,
    }));
    const color = config.series.id.includes("probability") ? palette.probability : palette.deterministic;
    return new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        datasets: [
          {
            label: config.series.label,
            data: points,
            borderColor: color,
            backgroundColor: hexWithAlpha(color, 0.15),
            borderWidth: 2,
            pointRadius: points.length <= 24 ? 1.8 : 0,
            pointHitRadius: 10,
            fill: false,
            tension: 0.16,
          },
        ],
      },
      options: baseOptions(config, font),
    });
  }

  function buildDistributionChart(canvas, config, palette, font) {
    const distributionPoints = config.series.points;
    const datasets = [];
    if (config.settings.median) {
      datasets.push({
        label: `${config.series.label} Median`,
        data: distributionPoints.map((point) => ({ x: point.forecast_hour, y: point.median, validTime: point.valid_time_utc })),
        borderColor: palette.median,
        borderWidth: 2,
        pointRadius: distributionPoints.length <= 24 ? 1.5 : 0,
        pointHitRadius: 10,
        fill: false,
        tension: 0.12,
      });
    }
    datasets.push({
      label: `${config.series.label} Mean`,
      data: distributionPoints.map((point) => ({ x: point.forecast_hour, y: point.mean, validTime: point.valid_time_utc })),
      borderColor: hexWithAlpha(palette.mean, 0.95),
      borderDash: [5, 4],
      borderWidth: 1.35,
      pointRadius: 0,
      pointHitRadius: 10,
      fill: false,
      tension: 0.12,
    });
    if (config.settings.det && config.detSeries && Array.isArray(config.detSeries.points)) {
      datasets.push({
        label: `${config.detSeries.label} Deterministic`,
        data: config.detSeries.points.map((point) => ({ x: point.forecast_hour, y: point.value, validTime: point.valid_time_utc })),
        borderColor: palette.overlay,
        borderWidth: 1.35,
        pointRadius: 2,
        pointStyle: "circle",
        pointHitRadius: 10,
        fill: false,
        tension: 0.08,
      });
    }
    const chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { datasets },
      options: baseOptions(config, font),
    });
    chart.$distributionPoints = distributionPoints;
    chart.$distributionSettings = config.settings;
    chart.$distributionPalette = palette;
    return chart;
  }

  function baseOptions(config, font) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      interaction: { mode: "nearest", intersect: false },
      parsing: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          bodyFont: { size: font.tooltip },
          titleFont: { size: font.tooltip },
          callbacks: {
            title(items) {
              const datum = items[0].raw;
              return `F${String(datum.x).padStart(3, "0")} | ${config.formatTime(datum.validTime)}`;
            },
            label(item) {
              if (config.series.chart_type === "distribution") {
                const point = config.series.points[item.dataIndex];
                const suffix = config.series.units ? ` ${config.series.units}` : "";
                return [
                  `Median: ${config.formatValue(point.median)}${suffix}`,
                  `Mean: ${config.formatValue(point.mean)}${suffix}`,
                  `IQR: ${config.formatValue(point.q1)} to ${config.formatValue(point.q3)}${suffix}`,
                  `Range: ${config.formatValue(point.min)} to ${config.formatValue(point.max)}${suffix}`,
                  `Members: ${point.count}`,
                ];
              }
              const suffix = config.series.units ? ` ${config.series.units}` : "";
              return `${config.series.label}: ${config.formatValue(item.raw.y)}${suffix}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: config.sharedRange ? config.sharedRange.min : undefined,
          max: config.sharedRange ? config.sharedRange.max : undefined,
          ticks: {
            color: config.theme.chartTick,
            font: { size: font.tick },
            callback(value) {
              return `F${String(Math.round(value)).padStart(3, "0")}`;
            },
          },
          grid: {
            color: config.theme.chartGrid,
          },
          title: {
            display: true,
            text: "Forecast Hour",
            color: config.theme.chartTick,
            font: { size: font.title, weight: "600" },
          },
        },
        y: {
          beginAtZero: shouldBeginAtZero(config.series.style),
          suggestedMin: rangeValue(config.series.style, 0),
          suggestedMax: rangeValue(config.series.style, 1),
          ticks: {
            color: config.theme.chartTick,
            font: { size: font.tick },
            callback(value) {
              return config.series.units === "%" ? `${value}%` : config.formatValue(value);
            },
          },
          grid: {
            color: config.theme.chartGrid,
          },
          title: {
            display: true,
            text: config.series.units || "Value",
            color: config.theme.chartTick,
            font: { size: font.title, weight: "600" },
          },
        },
      },
    };
  }

  function shouldBeginAtZero(style) {
    return style && Array.isArray(style.range) ? Number(style.range[0]) >= 0 : true;
  }

  function rangeValue(style, index) {
    return style && Array.isArray(style.range) ? Number(style.range[index]) : undefined;
  }

  const distributionPlugin = {
    id: "hrrrcastDistribution",
    afterDatasetsDraw(chart) {
      const points = chart.$distributionPoints;
      const settings = chart.$distributionSettings;
      if (!points || !points.length || !settings) {
        return;
      }
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      const ctx = chart.ctx;
      const palette = chart.$distributionPalette || DEFAULT_PALETTE;
      const boxWidth = Math.max(8, Math.min(20, estimateStep(xScale) * 0.42));
      ctx.save();
      ctx.strokeStyle = palette.whisker;
      ctx.fillStyle = hexWithAlpha(palette.whisker, 0.12);
      ctx.lineWidth = 1.1;
      for (const point of points) {
        const x = xScale.getPixelForValue(point.forecast_hour);
        const yMin = yScale.getPixelForValue(point.min);
        const yQ1 = yScale.getPixelForValue(point.q1);
        const yMedian = yScale.getPixelForValue(point.median);
        const yQ3 = yScale.getPixelForValue(point.q3);
        const yMax = yScale.getPixelForValue(point.max);
        if (settings.whiskers) {
          ctx.beginPath();
          ctx.moveTo(x, yMin);
          ctx.lineTo(x, yMax);
          ctx.moveTo(x - boxWidth * 0.3, yMin);
          ctx.lineTo(x + boxWidth * 0.3, yMin);
          ctx.moveTo(x - boxWidth * 0.3, yMax);
          ctx.lineTo(x + boxWidth * 0.3, yMax);
          ctx.stroke();
        }
        if (settings.boxes) {
          const top = Math.min(yQ1, yQ3);
          const height = Math.max(2, Math.abs(yQ3 - yQ1));
          ctx.fillRect(x - boxWidth / 2, top, boxWidth, height);
          ctx.strokeRect(x - boxWidth / 2, top, boxWidth, height);
        }
        if (settings.median) {
          ctx.beginPath();
          ctx.moveTo(x - boxWidth / 2, yMedian);
          ctx.lineTo(x + boxWidth / 2, yMedian);
          ctx.strokeStyle = palette.median;
          ctx.stroke();
          ctx.strokeStyle = palette.whisker;
        }
      }
      ctx.restore();
    },
  };

  const selectionPlugin = {
    id: "hrrrcastSelection",
    afterDraw(chart) {
      if (!chart.$selection) {
        return;
      }
      const ctx = chart.ctx;
      const area = chart.chartArea;
      const left = Math.max(area.left, Math.min(chart.$selection.startX, chart.$selection.endX));
      const right = Math.min(area.right, Math.max(chart.$selection.startX, chart.$selection.endX));
      ctx.save();
      ctx.fillStyle = DEFAULT_PALETTE.selection;
      ctx.strokeStyle = DEFAULT_PALETTE.selectionBorder;
      ctx.fillRect(left, area.top, right - left, area.bottom - area.top);
      ctx.strokeRect(left, area.top, right - left, area.bottom - area.top);
      ctx.restore();
    },
  };

  const crosshairPlugin = {
    id: "hrrrcastCrosshair",
    afterDatasetsDraw(chart) {
      const active = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
      if (!active || !active.length) {
        return;
      }
      const ctx = chart.ctx;
      const area = chart.chartArea;
      const x = active[0].element.x;
      ctx.save();
      ctx.strokeStyle = DEFAULT_PALETTE.crosshair;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  function estimateStep(xScale) {
    const first = xScale.getPixelForValue(0);
    const second = xScale.getPixelForValue(1);
    return Math.abs(second - first) || 18;
  }

  function hexWithAlpha(hex, alpha) {
    const clean = String(hex || "").replace("#", "");
    if (clean.length !== 6) {
      return hex;
    }
    const value = Math.max(0, Math.min(255, Math.round(alpha * 255)));
    return `#${clean}${value.toString(16).padStart(2, "0")}`;
  }

  window.HRRRCAST_CHARTS = {
    registerPlugins,
    buildChart,
    syncRange,
    attachZoomHandlers,
  };
})();
