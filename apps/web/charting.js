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
    Chart.register(distributionPlugin, selectionPlugin, hoverOverlayPlugin, statusMessagePlugin);
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

  function createHoverController() {
    let clearTimer = 0;
    const charts = new Set();
    const controller = {
      register(chart) {
        charts.add(chart);
        chart.$hoverController = controller;
      },
      unregister(chart) {
        charts.delete(chart);
        clearChartHover(chart);
      },
      setHover(hour) {
        controller.hour = hour;
        if (clearTimer) {
          window.clearTimeout(clearTimer);
          clearTimer = 0;
        }
        for (const chart of charts) {
          applyChartHover(chart, hour);
        }
      },
      scheduleClear() {
        if (clearTimer) {
          window.clearTimeout(clearTimer);
        }
        clearTimer = window.setTimeout(() => controller.clear(), 35);
      },
      clear() {
        controller.hour = null;
        if (clearTimer) {
          window.clearTimeout(clearTimer);
          clearTimer = 0;
        }
        for (const chart of charts) {
          clearChartHover(chart);
        }
      },
      hour: null,
    };
    return controller;
  }

  function attachHoverHandlers(chart, controller) {
    if (!controller) {
      return;
    }
    controller.register(chart);
    const canvas = chart.canvas;
    canvas.addEventListener("mousemove", (event) => {
      if (chart.$selection) {
        return;
      }
      const point = nearestHoverPoint(chart, event.offsetX);
      if (!point) {
        controller.scheduleClear();
        return;
      }
      controller.setHover(point.forecast_hour);
    });
    canvas.addEventListener("mouseenter", (event) => {
      const point = nearestHoverPoint(chart, event.offsetX);
      if (point) {
        controller.setHover(point.forecast_hour);
      }
    });
    canvas.addEventListener("mouseleave", () => {
      controller.scheduleClear();
    });
  }

  function buildLineChart(canvas, config, palette, font) {
    const points = config.series.points.map((point) => ({
      x: point.forecast_hour,
      y: point.value,
      validTime: point.valid_time_utc,
    }));
    const color = config.series.id.includes("probability") ? palette.probability : palette.deterministic;
    const chart = new Chart(canvas.getContext("2d"), {
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
    chart.$statusMessage = zeroProbabilityMessage(config.series);
    chart.$hoverPoints = config.series.points;
    chart.$hoverResolver = (hour) => resolveLineHover(chart, config, hour);
    chart.$hoverPalette = palette;
    chart.$formatValue = config.formatValue;
    chart.$formatTime = config.formatTime;
    chart.$series = config.series;
    chart.$onHoverChange = config.onHoverChange;
    return chart;
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
    chart.$statusMessage = zeroProbabilityMessage(config.series);
    chart.$hoverPoints = config.series.points;
    chart.$hoverResolver = (hour) => resolveDistributionHover(chart, config, distributionPoints, hour);
    chart.$hoverPalette = palette;
    chart.$formatTime = config.formatTime;
    chart.$series = config.series;
    chart.$detSeries = config.detSeries;
    chart.$onHoverChange = config.onHoverChange;
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
          footerFont: { size: font.tooltip },
          callbacks: {
            title(items) {
              const datum = items[0].raw;
              return `${tooltipSeriesLabel(config.series)} | F${String(datum.x).padStart(3, "0")}`;
            },
            footer(items) {
              const datum = items[0].raw;
              return `Valid Time: ${config.formatTime(datum.validTime)}`;
            },
            label(item) {
              if (config.series.chart_type === "distribution") {
                const point = distributionPointWithPercentiles(config.series.points[item.dataIndex], config.settings);
                const suffix = config.series.units ? ` ${config.series.units}` : "";
                const boxLabel = `Box (${config.settings.boxlow}-${config.settings.boxhigh}%)`;
                const whiskerLabel = `Whiskers (${config.settings.whiskerlow}-${config.settings.whiskerhigh}%)`;
                const lines = [];
                if (config.settings.median) {
                  lines.push(`Median: ${formatHoverValue(config, point.median)}${suffix}`);
                }
                lines.push(`Mean: ${formatHoverValue(config, point.mean)}${suffix}`);
                if (config.settings.det && config.detSeries && Array.isArray(config.detSeries.points)) {
                  const detPoint = findExactPointByHour(config.detSeries.points, point.forecast_hour);
                  lines.push(`Deterministic: ${detPoint ? `${formatHoverValue(config, detPoint.value)}${suffix}` : "n/a"}`);
                }
                if (config.settings.boxes) {
                  lines.push(`${boxLabel}: ${formatHoverValue(config, point.q1)} to ${formatHoverValue(config, point.q3)}${suffix}`);
                }
                if (config.settings.whiskers) {
                  lines.push(`${whiskerLabel}: ${formatHoverValue(config, point.min)} to ${formatHoverValue(config, point.max)}${suffix}`);
                }
                lines.push(`Members: ${point.count}`);
                return lines;
              }
              const suffix = config.series.units ? ` ${config.series.units}` : "";
              return `${tooltipValueLabel(config.series)}: ${formatHoverValue(config, item.raw.y)}${suffix}`;
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
            maxTicksLimit: 9,
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
              return formatAxisTick(config.series, config.formatValue, value);
            },
          },
          grid: {
            color: config.theme.chartGrid,
          },
          title: {
            display: true,
            text: axisTitle(config.series),
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
      max = probabilityUpperBound(max, numeric);
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

  function probabilityUpperBound(currentMax, values) {
    const maxValue = Math.max(...values);
    if (maxValue <= 0) {
      return Math.max(2, currentMax);
    }
    if (maxValue <= 1) {
      return Math.max(2, roundProbabilityStep(currentMax, 0.5));
    }
    if (maxValue <= 5) {
      return Math.max(5, roundProbabilityStep(currentMax, 1));
    }
    if (maxValue <= 20) {
      return Math.max(10, roundProbabilityStep(currentMax, 5));
    }
    return currentMax;
  }

  function roundProbabilityStep(value, step) {
    return Math.ceil(value / step) * step;
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

  const hoverOverlayPlugin = {
    id: "hrrrcastHoverOverlay",
    afterDatasetsDraw(chart) {
      const hover = chart.$hoverContext;
      if (!hover) {
        return;
      }
      const ctx = chart.ctx;
      const area = chart.chartArea;
      const x = hover.x;
      ctx.save();
      ctx.strokeStyle = (chart.$hoverPalette || DEFAULT_PALETTE).crosshair;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
      if (hover.distributionBox) {
        drawHoveredDistributionBox(ctx, hover.distributionBox, chart.$hoverPalette || DEFAULT_PALETTE);
      }
      drawHoverMarkers(ctx, hover.markers || [], area, chart.$hoverPalette || DEFAULT_PALETTE);
      ctx.restore();
    },
  };

  const statusMessagePlugin = {
    id: "hrrrcastStatusMessage",
    afterDraw(chart) {
      if (!chart.$statusMessage) {
        return;
      }
      const area = chart.chartArea;
      if (!area) {
        return;
      }
      const ctx = chart.ctx;
      const centerX = (area.left + area.right) / 2;
      const centerY = area.top + Math.max(28, (area.bottom - area.top) * 0.22);
      const text = chart.$statusMessage;

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "600 13px Arial, sans-serif";

      const boxWidth = ctx.measureText(text).width + 22;
      const boxHeight = 28;
      const boxLeft = centerX - boxWidth / 2;
      const boxTop = centerY - boxHeight / 2;

      ctx.fillStyle = "rgba(15, 20, 28, 0.82)";
      ctx.strokeStyle = "rgba(147, 166, 186, 0.45)";
      ctx.lineWidth = 1;
      roundRect(ctx, boxLeft, boxTop, boxWidth, boxHeight, 7);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#e6edf4";
      ctx.fillText(text, centerX, centerY + 0.5);
      ctx.restore();
    },
  };

  function estimateStep(xScale) {
    const first = xScale.getPixelForValue(0);
    const second = xScale.getPixelForValue(1);
    return Math.abs(second - first) || 18;
  }

  function nearestHoverPoint(chart, offsetX) {
    if (!chart.$hoverPoints || !chart.$hoverPoints.length || !chart.scales.x) {
      return null;
    }
    const rawHour = chart.scales.x.getValueForPixel(offsetX);
    if (!Number.isFinite(rawHour)) {
      return null;
    }
    let nearest = chart.$hoverPoints[0];
    let bestDistance = Math.abs(Number(nearest.forecast_hour) - rawHour);
    for (const point of chart.$hoverPoints) {
      const distance = Math.abs(Number(point.forecast_hour) - rawHour);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = point;
      }
    }
    return nearest;
  }

  function applyChartHover(chart, hour) {
    if (!Number.isFinite(Number(hour)) || typeof chart.$hoverResolver !== "function") {
      clearChartHover(chart);
      return;
    }
    const hover = chart.$hoverResolver(Number(hour));
    if (!hover) {
      clearChartHover(chart);
      return;
    }
    chart.$hoverContext = hover;
    const active = hover.activeElements || [];
    chart.setActiveElements(active);
    if (chart.tooltip && typeof chart.tooltip.setActiveElements === "function") {
      chart.tooltip.setActiveElements(active, { x: hover.x, y: chart.chartArea.top + 10 });
    }
    if (typeof chart.$onHoverChange === "function") {
      chart.$onHoverChange(hover.readout);
    }
    chart.update("none");
  }

  function clearChartHover(chart) {
    chart.$hoverContext = null;
    chart.setActiveElements([]);
    if (chart.tooltip && typeof chart.tooltip.setActiveElements === "function") {
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    }
    if (typeof chart.$onHoverChange === "function") {
      chart.$onHoverChange(null);
    }
    chart.update("none");
  }

  function resolveLineHover(chart, config, hour) {
    const point = findExactPointByHour(config.series.points, hour);
    const x = chart.scales.x.getPixelForValue(hour);
    const suffix = config.series.units ? ` ${config.series.units}` : "";
    if (!point || !Number.isFinite(Number(point.value))) {
      return {
        x,
        activeElements: [],
        markers: [],
        readout: {
          hour: Number(hour),
          validTime: point && point.valid_time_utc ? config.formatTime(point.valid_time_utc) : "Valid time unavailable",
          entries: [
            {
              label: tooltipValueLabel(config.series),
              value: "n/a",
            },
          ],
          missing: true,
        },
      };
    }
    const dataIndex = config.series.points.indexOf(point);
    const datasetMeta = chart.getDatasetMeta(0);
    const element = datasetMeta && datasetMeta.data ? datasetMeta.data[dataIndex] : null;
    const y = element ? element.y : chart.scales.y.getPixelForValue(point.value);
    const valueText = `${formatHoverValue(config, point.value)}${suffix}`;
    return {
      x,
      activeElements: [{ datasetIndex: 0, index: dataIndex }],
      markers: [
        {
          x,
          y,
          color: chart.data.datasets[0].borderColor,
          text: valueText,
        },
      ],
      readout: {
        hour: Number(point.forecast_hour),
        validTime: config.formatTime(point.valid_time_utc),
        entries: [
          {
            label: tooltipValueLabel(config.series),
            value: valueText,
          },
        ],
      },
    };
  }

  function resolveDistributionHover(chart, config, distributionPoints, hour) {
    const originalPoint = findExactPointByHour(config.series.points, hour);
    const x = chart.scales.x.getPixelForValue(hour);
    const suffix = config.series.units ? ` ${config.series.units}` : "";
    if (!originalPoint) {
      return {
        x,
        activeElements: [],
        markers: [],
        readout: {
          hour: Number(hour),
          validTime: "Valid time unavailable",
          entries: [
            { label: config.series.label, value: "n/a" },
          ],
          missing: true,
        },
      };
    }
    const dataIndex = config.series.points.indexOf(originalPoint);
    const point = distributionPoints[dataIndex];
    const activeElements = [];
    const markers = [];
    for (let datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex += 1) {
      const dataset = chart.data.datasets[datasetIndex];
      const datum = dataset.data[dataIndex];
      if (!datum) {
        continue;
      }
      activeElements.push({ datasetIndex, index: dataIndex });
      const meta = chart.getDatasetMeta(datasetIndex);
      const element = meta && meta.data ? meta.data[dataIndex] : null;
      if (!element) {
        continue;
      }
      if (String(dataset.label || "").includes("Median")) {
        markers.push({ x: element.x, y: element.y, color: dataset.borderColor, text: `Med ${formatHoverValue(config, point.median)}${suffix}` });
      } else if (String(dataset.label || "").includes("Mean")) {
        markers.push({ x: element.x, y: element.y, color: dataset.borderColor, text: `Mean ${formatHoverValue(config, point.mean)}${suffix}` });
      } else if (String(dataset.label || "").includes("Deterministic")) {
        markers.push({ x: element.x, y: element.y, color: dataset.borderColor, text: `Det ${formatHoverValue(config, datum.y)}${suffix}` });
      }
    }
    const entries = [];
    if (config.settings.median) {
      entries.push({ label: "Median", value: `${formatHoverValue(config, point.median)}${suffix}` });
    }
    entries.push({ label: "Mean", value: `${formatHoverValue(config, point.mean)}${suffix}` });
    if (config.settings.det && config.detSeries && Array.isArray(config.detSeries.points)) {
      const detPoint = findExactPointByHour(config.detSeries.points, hour);
      entries.push({ label: "Deterministic", value: detPoint ? `${formatHoverValue(config, detPoint.value)}${suffix}` : "n/a" });
    }
    if (config.settings.boxes) {
      entries.push({
        label: `Box ${config.settings.boxlow}-${config.settings.boxhigh}%`,
        value: `${formatHoverValue(config, point.q1)}${suffix} to ${formatHoverValue(config, point.q3)}${suffix}`,
      });
    }
    if (config.settings.whiskers) {
      entries.push({
        label: `Whiskers ${config.settings.whiskerlow}-${config.settings.whiskerhigh}%`,
        value: `${formatHoverValue(config, point.min)}${suffix} to ${formatHoverValue(config, point.max)}${suffix}`,
      });
    }
    entries.push({ label: "Members", value: String(point.count) });
    return {
      x,
      activeElements,
      markers,
      distributionBox: {
        x,
        minY: chart.scales.y.getPixelForValue(point.min),
        q1Y: chart.scales.y.getPixelForValue(point.q1),
        medianY: chart.scales.y.getPixelForValue(point.median),
        q3Y: chart.scales.y.getPixelForValue(point.q3),
        maxY: chart.scales.y.getPixelForValue(point.max),
        boxWidth: Math.max(8, Math.min(20, estimateStep(chart.scales.x) * 0.42)),
        settings: config.settings,
      },
      readout: {
        hour: Number(point.forecast_hour),
        validTime: config.formatTime(point.valid_time_utc),
        entries,
      },
    };
  }

  function findPointByHour(points, hour) {
    if (!Array.isArray(points) || !points.length) {
      return null;
    }
    let nearest = points[0];
    let bestDistance = Math.abs(Number(nearest.forecast_hour) - Number(hour));
    for (const point of points) {
      const distance = Math.abs(Number(point.forecast_hour) - Number(hour));
      if (distance < bestDistance) {
        nearest = point;
        bestDistance = distance;
      }
    }
    return nearest;
  }

  function findExactPointByHour(points, hour) {
    if (!Array.isArray(points) || !points.length) {
      return null;
    }
    return points.find((point) => Number(point.forecast_hour) === Number(hour)) || null;
  }

  function formatHoverValue(config, value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "n/a";
    }
    return config.formatValue(numeric, "hover");
  }

  function drawHoveredDistributionBox(ctx, box, palette) {
    ctx.save();
    ctx.strokeStyle = hexWithAlpha(palette.whisker, 0.95);
    ctx.fillStyle = hexWithAlpha(palette.whisker, 0.2);
    ctx.lineWidth = 1.35;
    if (box.settings.whiskers) {
      ctx.beginPath();
      ctx.moveTo(box.x, box.minY);
      ctx.lineTo(box.x, box.maxY);
      ctx.moveTo(box.x - box.boxWidth * 0.35, box.minY);
      ctx.lineTo(box.x + box.boxWidth * 0.35, box.minY);
      ctx.moveTo(box.x - box.boxWidth * 0.35, box.maxY);
      ctx.lineTo(box.x + box.boxWidth * 0.35, box.maxY);
      ctx.stroke();
    }
    if (box.settings.boxes) {
      const top = Math.min(box.q1Y, box.q3Y);
      const height = Math.max(2, Math.abs(box.q3Y - box.q1Y));
      ctx.fillRect(box.x - box.boxWidth / 2, top, box.boxWidth, height);
      ctx.strokeRect(box.x - box.boxWidth / 2, top, box.boxWidth, height);
    }
    if (box.settings.median) {
      ctx.strokeStyle = palette.median;
      ctx.beginPath();
      ctx.moveTo(box.x - box.boxWidth / 2, box.medianY);
      ctx.lineTo(box.x + box.boxWidth / 2, box.medianY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHoverMarkers(ctx, markers, area, palette) {
    if (!markers || !markers.length) {
      return;
    }
    let offsetIndex = 0;
    for (const marker of markers) {
      if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) {
        continue;
      }
      ctx.save();
      ctx.fillStyle = marker.color || palette.overlay;
      ctx.strokeStyle = "#0f141c";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (marker.text) {
        const textX = Math.min(area.right - 6, marker.x + 10);
        const textY = Math.max(area.top + 12, Math.min(area.bottom - 12, marker.y - 10 + (offsetIndex * 14)));
        drawHoverLabel(ctx, textX, textY, marker.text, marker.color || palette.overlay, area);
        offsetIndex += 1;
      }
      ctx.restore();
    }
  }

  function drawHoverLabel(ctx, x, y, text, accent, area) {
    ctx.save();
    ctx.font = "600 11px Arial, sans-serif";
    const width = ctx.measureText(text).width + 12;
    const height = 18;
    const left = Math.max(area.left + 4, Math.min(area.right - width - 4, x));
    const top = Math.max(area.top + 4, Math.min(area.bottom - height - 4, y - height));
    ctx.fillStyle = "rgba(15, 20, 28, 0.88)";
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    roundRect(ctx, left, top, width, height, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f5f9fd";
    ctx.textBaseline = "middle";
    ctx.fillText(text, left + 6, top + height / 2 + 0.5);
    ctx.restore();
  }

  function hexWithAlpha(hex, alpha) {
    const clean = String(hex || "").replace("#", "");
    if (clean.length !== 6) {
      return hex;
    }
    const value = Math.max(0, Math.min(255, Math.round(alpha * 255)));
    return `#${clean}${value.toString(16).padStart(2, "0")}`;
  }

  function zeroProbabilityMessage(series) {
    if (!series || !String(series.id || "").includes("probability")) {
      return null;
    }
    if (!series.summary || !series.summary.all_zero) {
      const maximum = Number(series.summary && series.summary.max);
      if (!Number.isFinite(maximum) || maximum <= 0 || maximum > 5) {
        return null;
      }
      return `Probabilities stay below ${maximum <= 1 ? "1%" : "5%"} for this forecast period`;
    }
    return "Probability remains 0% for this forecast period";
  }

  function axisTitle(series) {
    if (!series) {
      return "Value";
    }
    const family = seriesFamily(series);
    if (family === "probability") { return "Probability of Exceedance (%)"; }
    if (family === "temperature") { return "2 m Temperature (F)"; }
    if (family === "dewpoint") { return "2 m Dewpoint (F)"; }
    if (family === "gust") { return "Surface Gust (mph)"; }
    if (family === "wind") { return "Wind Speed (mph)"; }
    if (family === "precip") { return "QPF / Accumulated Precipitation (in)"; }
    if (family === "visibility") { return "Visibility (mi)"; }
    if (family === "ceiling") { return "Ceiling Height (m)"; }
    if (series.units) {
      return `Value (${series.units})`;
    }
    return "Value";
  }

  function formatAxisTick(series, formatValue, value) {
    const family = seriesFamily(series);
    if (family === "probability") {
      return `${formatValue(value, "axis")}%`;
    }
    if (family === "ceiling") {
      return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    return formatValue(value, "axis");
  }

  function seriesFamily(series) {
    const id = String(series && series.id || "");
    const units = String(series && series.units || "");
    if (units === "%" || id.includes("probability")) { return "probability"; }
    if (units === "F" && id.includes("dewpoint")) { return "dewpoint"; }
    if (units === "F" && id.includes("temperature")) { return "temperature"; }
    if (units === "mph" && id.includes("gust")) { return "gust"; }
    if (units === "mph" && (id.includes("wind") || id.includes("shear"))) { return "wind"; }
    if (units === "in" && (id.includes("qpf") || id.includes("precip"))) { return "precip"; }
    if (units === "mi" && id.includes("visibility")) { return "visibility"; }
    if (units === "m" && id.includes("ceiling")) { return "ceiling"; }
    return "default";
  }

  function tooltipSeriesLabel(series) {
    const family = seriesFamily(series);
    if (family === "probability") { return "Probability"; }
    if (family === "temperature") { return "Temperature"; }
    if (family === "dewpoint") { return "Dewpoint"; }
    if (family === "gust") { return "Wind Gust"; }
    if (family === "wind") { return "Wind"; }
    if (family === "precip") { return "Precipitation"; }
    if (family === "visibility") { return "Visibility"; }
    if (family === "ceiling") { return "Ceiling"; }
    return series && series.label ? series.label : "Forecast";
  }

  function tooltipValueLabel(series) {
    const family = seriesFamily(series);
    if (family === "probability") { return "Exceedance Probability"; }
    if (family === "temperature") { return "2 m Temperature"; }
    if (family === "dewpoint") { return "2 m Dewpoint"; }
    if (family === "gust") { return "Surface Gust"; }
    if (family === "wind") { return "Wind Speed"; }
    if (family === "precip") { return "Accumulated Precipitation"; }
    if (family === "visibility") { return "Visibility"; }
    if (family === "ceiling") { return "Ceiling Height"; }
    return series && series.label ? series.label : "Value";
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
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
    createHoverController,
    attachHoverHandlers,
  };
})();
