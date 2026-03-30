(function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    station: "KRDU",
    run: "latest-ready",
    member: "ens",
    group: "storm",
    customgroup: [],
    darkmode: "on",
    tz: "local",
    obs: false,
    fontsize: 1,
    boxes: true,
    whiskers: true,
    median: true,
    det: true,
    colorfriendly: false,
    whiskerlow: 0,
    whiskerhigh: 100,
    boxlow: 25,
    boxhigh: 75,
    elements: [],
    col: 2,
    hgt: 1,
    graph: "chart",
  });

  const TIMEZONES = new Set(["local", "station", "utc"]);
  const DARKMODES = new Set(["auto", "on", "off"]);
  const GRAPHS = new Set(["chart", "distribution"]);

  function parseState(search) {
    const params = new URLSearchParams(search || window.location.search);
    return {
      station: normalizeStation(params.get("station") || params.get("location") || DEFAULTS.station),
      run: params.get("run") || DEFAULTS.run,
      member: params.get("member") || DEFAULTS.member,
      group: params.get("group") || params.get("selectedgroup") || DEFAULTS.group,
      customgroup: parseList(params.get("customgroup")),
      darkmode: DARKMODES.has(params.get("darkmode")) ? params.get("darkmode") : DEFAULTS.darkmode,
      tz: TIMEZONES.has(params.get("tz")) ? params.get("tz") : DEFAULTS.tz,
      obs: parseBoolean(params.get("obs"), DEFAULTS.obs),
      fontsize: clampNumber(params.get("fontsize"), 0.7, 1.4, DEFAULTS.fontsize),
      boxes: parseBoolean(params.get("boxes"), DEFAULTS.boxes),
      whiskers: parseBoolean(params.get("whiskers"), DEFAULTS.whiskers),
      median: parseBoolean(params.get("median"), DEFAULTS.median),
      det: parseBoolean(params.get("det"), DEFAULTS.det),
      colorfriendly: parseBoolean(params.get("colorfriendly"), DEFAULTS.colorfriendly),
      whiskerlow: clampInt(params.get("whiskerlow"), 0, 50, DEFAULTS.whiskerlow),
      whiskerhigh: clampInt(params.get("whiskerhigh"), 50, 100, DEFAULTS.whiskerhigh),
      boxlow: clampInt(params.get("boxlow"), 0, 50, DEFAULTS.boxlow),
      boxhigh: clampInt(params.get("boxhigh"), 50, 100, DEFAULTS.boxhigh),
      elements: parseList(params.get("elements")),
      col: clampInt(params.get("col"), 1, 3, DEFAULTS.col),
      hgt: clampNumber(params.get("hgt"), 0.7, 2, DEFAULTS.hgt),
      graph: GRAPHS.has(params.get("graph")) ? params.get("graph") : DEFAULTS.graph,
    };
  }

  function normalizeState(input, availableMembers, availableGroups, allowedElements) {
    return {
      station: normalizeStation(input.station || DEFAULTS.station),
      run: input.run || DEFAULTS.run,
      member: normalizeChoice(input.member, availableMembers, DEFAULTS.member),
      group: normalizeChoice(input.group, availableGroups, DEFAULTS.group),
      customgroup: filterElements(input.customgroup, allowedElements),
      darkmode: DARKMODES.has(input.darkmode) ? input.darkmode : DEFAULTS.darkmode,
      tz: TIMEZONES.has(input.tz) ? input.tz : DEFAULTS.tz,
      obs: Boolean(input.obs),
      fontsize: clampNumber(input.fontsize, 0.7, 1.4, DEFAULTS.fontsize),
      boxes: Boolean(input.boxes),
      whiskers: Boolean(input.whiskers),
      median: Boolean(input.median),
      det: Boolean(input.det),
      colorfriendly: Boolean(input.colorfriendly),
      whiskerlow: clampInt(input.whiskerlow, 0, 50, DEFAULTS.whiskerlow),
      whiskerhigh: clampInt(input.whiskerhigh, 50, 100, DEFAULTS.whiskerhigh),
      boxlow: clampInt(input.boxlow, 0, 50, DEFAULTS.boxlow),
      boxhigh: clampInt(input.boxhigh, 50, 100, DEFAULTS.boxhigh),
      elements: filterElements(input.elements, allowedElements),
      col: clampInt(input.col, 1, 3, DEFAULTS.col),
      hgt: clampNumber(input.hgt, 0.7, 2, DEFAULTS.hgt),
      graph: GRAPHS.has(input.graph) ? input.graph : DEFAULTS.graph,
    };
  }

  function writeState(state) {
    const params = new URLSearchParams();
    params.set("location", normalizeStation(state.station || DEFAULTS.station));
    params.set("run", state.run || DEFAULTS.run);
    params.set("member", state.member || DEFAULTS.member);
    params.set("selectedgroup", state.group || DEFAULTS.group);
    params.set("darkmode", state.darkmode || DEFAULTS.darkmode);
    params.set("tz", state.tz || DEFAULTS.tz);
    params.set("obs", state.obs ? "true" : "false");
    params.set("fontsize", String(clampNumber(state.fontsize, 0.7, 1.4, DEFAULTS.fontsize)));
    params.set("boxes", state.boxes ? "true" : "false");
    params.set("whiskers", state.whiskers ? "true" : "false");
    params.set("median", state.median ? "true" : "false");
    params.set("det", state.det ? "true" : "false");
    params.set("colorfriendly", state.colorfriendly ? "true" : "false");
    params.set("whiskerlow", String(clampInt(state.whiskerlow, 0, 50, DEFAULTS.whiskerlow)));
    params.set("whiskerhigh", String(clampInt(state.whiskerhigh, 50, 100, DEFAULTS.whiskerhigh)));
    params.set("boxlow", String(clampInt(state.boxlow, 0, 50, DEFAULTS.boxlow)));
    params.set("boxhigh", String(clampInt(state.boxhigh, 50, 100, DEFAULTS.boxhigh)));
    params.set("col", String(clampInt(state.col, 1, 3, DEFAULTS.col)));
    params.set("hgt", String(clampNumber(state.hgt, 0.7, 2, DEFAULTS.hgt)));
    params.set("graph", state.graph || DEFAULTS.graph);
    if (Array.isArray(state.customgroup) && state.customgroup.length) {
      params.set("customgroup", state.customgroup.join(","));
    }
    if (Array.isArray(state.elements) && state.elements.length) {
      params.set("elements", state.elements.join(","));
    }
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }

  function parseBoolean(value, fallback) {
    if (value == null || value === "") {
      return fallback;
    }
    const text = String(value).toLowerCase();
    return text === "1" || text === "true" || text === "on" || text === "yes";
  }

  function parseList(value) {
    if (!value) {
      return [];
    }
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeStation(value) {
    return String(value || DEFAULTS.station).trim().toUpperCase();
  }

  function normalizeChoice(value, allowed, fallback) {
    if (Array.isArray(allowed) && allowed.length && allowed.includes(value)) {
      return value;
    }
    return allowed && allowed.length ? allowed[0] : fallback;
  }

  function filterElements(elements, allowed) {
    if (!Array.isArray(elements) || !elements.length) {
      return [];
    }
    const allowedSet = new Set(Array.isArray(allowed) ? allowed : []);
    return elements.filter((item) => allowedSet.has(item));
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
  }

  function clampInt(value, min, max, fallback) {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, numeric));
  }

  window.HRRRCAST_URL_STATE = {
    DEFAULTS,
    parseState,
    normalizeState,
    writeState,
  };
})();
