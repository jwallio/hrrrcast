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
      options: baseOptions(config, font, computeYBounds(config.series, points)),
    });
  }

  function buildDistributionChart(canvas, config, palette, font) {
    const distributionPoints = config.series.points.map((point) => distributionPointWithPercentiles(point, config.settings));
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
    const yBounds = computeDistributionYBounds(config.series, distributionPoints, config.detSeries, config.settings);
    const chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { datasets },
      options: baseOptions(config, font, yBounds),
    });
    chart.$distributionPoints = distributionPoints;
    chart.$distributionSettings = config.settings;
    chart.$distributionPalette = palette;
    chart.$distributionUnits = config.series.units || "";
    chart.$formatValue = config.formatValue;
    return chart;
  }

  function baseOptions(config, font, yBounds) {
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
                const point = distributionPointWithPercentiles(config.series.points[item.dataIndex], config.settings);
                const suffix = config.series.units ? ` ${config.series.units}` : "";
                return [
                  `Median: ${config.formatValue(point.median)}${suffix}`,
                  `Mean: ${config.formatValue(point.mean)}${suffix}`,
                  `Box: ${config.formatValue(point.q1)} to ${config.formatValue(point.q3)}${suffix}`,
                  `Whiskers: ${config.formatValue(point.min)} to ${config.formatValue(point.max)}${suffix}`,
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
          beginAtZero: false,
          min: yBounds ? yBounds.min : undefined,
          max: yBounds ? yBounds.max : undefined,
          suggestedMin: yBounds ? undefined : rangeValue(config.series.style, 0),
          suggestedMax: yBounds ? undefined : rangeValue(config.series.style, 1),
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

  function computeYBounds(series, points) {
    const values = points
      .map((point) => Number(point.y))
      .filter(Number.isFinite);
    return normalizeBounds(values, series.style, series.units);
  }

  function computeDistributionYBounds(series, distributionPoints, detSeries, settings) {
    const values = [];
    for (const point of distributionPoints) {
      if (settings.whiskers) {
        values.push(point.min, point.max);
      }
      if (settings.boxes) {
        values.push(point.q1, point.q3);
      }
      if (settings.median) {
        values.push(point.median);
      }
      values.push(point.mean);
    }
    if (settings.det && detSeries && Array.isArray(detSeries.points)) {
      for (const point of detSeries.points) {
        values.push(point.value);
      }
    }
    return normalizeBounds(values, series.style, series.units);
  }

  function normalizeBounds(values, style, units) {
    const numeric = values.map(Number).filter(Number.isFinite);
    if (!numeric.length) {
      if (style && Array.isArray(style.range)) {
        return { min: Number(style.range[0]), max: Number(style.range[1]) };
      }
      return null;
    }

    let min = Math.min(...numeric);
    let max = Math.max(...numeric);

    if (min === max) {
      const singlePad = Math.max(Math.abs(max) * 0.1, units === "%" ? 2 : 1);
      min -= singlePad;
      max += singlePad;
    } else {
      const span = max - min;
      const pad = Math.max(span * 0.08, units === "%" ? 1 : span * 0.03);
      min -= pad;
      max += pad;
    }

    const positivePreferred = shouldBeginAtZero(style);
    if (positivePreferred && min > 0) {
      const originalMin = Math.min(...numeric);
      if (originalMin <= max * 0.15) {
        min = 0;
      }
    }

    if (units === "%") {
      min = Math.max(0, min);
      max = Math.min(100, max);
    }

    if (style && Array.isArray(style.range)) {
      const [styleMin, styleMax] = style.range.map(Number);
      if (Number.isFinite(styleMin) && Number.isFinite(styleMax)) {
        if (numeric.every((value) => value >= styleMin && value <= styleMax)) {
          min = Math.max(min, styleMin);
          max = Math.min(max, styleMax);
        }
      }
    }

    if (min >= max) {
      max = min + 1;
    }

    return {
      min: roundBound(min),
      max: roundBound(max),
    };
  }

  function roundBound(value) {
    if (!Number.isFinite(value)) {
      return value;
    }
    const magnitude = Math.abs(value);
    if (magnitude >= 100) {
      return Math.round(value);
    }
    if (magnitude >= 10) {
      return Math.round(value * 10) / 10;
    }
    return Math.round(value * 100) / 100;
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

  function distributionPointWithPercentiles(point, settings) {
    const values = Array.isArray(point.member_values) && point.member_values.length
      ? point.member_values.slice().sort((left, right) => left - right)
      : null;
    if (!values) {
      return point;
    }
    const lowBox = clamp(settings.boxlow, 0, 50);
    const highBox = clamp(settings.boxhigh, 50, 100);
    const lowWhisker = clamp(settings.whiskerlow, 0, 50);
    const highWhisker = clamp(settings.whiskerhigh, 50, 100);
    return {
      ...point,
      min: percentile(values, lowWhisker),
      q1: percentile(values, lowBox),
      median: percentile(values, 50),
      q3: percentile(values, highBox),
      max: percentile(values, highWhisker),
      mean: mean(values),
      count: values.length,
    };
  }

  function percentile(values, pct) {
    if (!values.length) {
      return NaN;
    }
    if (values.length === 1) {
      return values[0];
    }
    const rank = (pct / 100) * (values.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) {
      return values[lower];
    }
    const weight = rank - lower;
    return values[lower] * (1 - weight) + values[upper] * weight;
  }

  function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  window.HRRRCAST_CHARTS = {
    registerPlugins,
    buildChart,
    syncRange,
    attachZoomHandlers,
  };
})();
