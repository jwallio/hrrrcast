(function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    station: "KRDU",
    run: "latest-ready",
    member: "ens",
    group: "storm",
    darkmode: true,
    tz: "local",
    obs: false,
    fontsize: "md",
    boxes: true,
    whiskers: true,
    median: true,
    det: true,
    colorfriendly: false,
    elements: [],
  });

  const FONT_SIZES = new Set(["sm", "md", "lg"]);
  const TIMEZONES = new Set(["local", "station", "utc"]);

  function parseState(search) {
    const params = new URLSearchParams(search || window.location.search);
    return {
      station: normalizeStation(params.get("station") || DEFAULTS.station),
      run: params.get("run") || DEFAULTS.run,
      member: params.get("member") || DEFAULTS.member,
      group: params.get("group") || params.get("selectedgroup") || DEFAULTS.group,
      darkmode: parseBoolean(params.get("darkmode"), DEFAULTS.darkmode),
      tz: TIMEZONES.has(params.get("tz")) ? params.get("tz") : DEFAULTS.tz,
      obs: parseBoolean(params.get("obs"), DEFAULTS.obs),
      fontsize: FONT_SIZES.has(params.get("fontsize")) ? params.get("fontsize") : DEFAULTS.fontsize,
      boxes: parseBoolean(params.get("boxes"), DEFAULTS.boxes),
      whiskers: parseBoolean(params.get("whiskers"), DEFAULTS.whiskers),
      median: parseBoolean(params.get("median"), DEFAULTS.median),
      det: parseBoolean(params.get("det"), DEFAULTS.det),
      colorfriendly: parseBoolean(params.get("colorfriendly"), DEFAULTS.colorfriendly),
      elements: parseList(params.get("elements")),
    };
  }

  function normalizeState(input, availableMembers, availableGroups, allowedElements) {
    return {
      station: normalizeStation(input.station || DEFAULTS.station),
      run: input.run || DEFAULTS.run,
      member: normalizeChoice(input.member, availableMembers, DEFAULTS.member),
      group: normalizeChoice(input.group, availableGroups, DEFAULTS.group),
      darkmode: Boolean(input.darkmode),
      tz: TIMEZONES.has(input.tz) ? input.tz : DEFAULTS.tz,
      obs: Boolean(input.obs),
      fontsize: FONT_SIZES.has(input.fontsize) ? input.fontsize : DEFAULTS.fontsize,
      boxes: Boolean(input.boxes),
      whiskers: Boolean(input.whiskers),
      median: Boolean(input.median),
      det: Boolean(input.det),
      colorfriendly: Boolean(input.colorfriendly),
      elements: filterElements(input.elements, allowedElements),
    };
  }

  function writeState(state) {
    const params = new URLSearchParams();
    params.set("station", normalizeStation(state.station || DEFAULTS.station));
    params.set("run", state.run || DEFAULTS.run);
    params.set("member", state.member || DEFAULTS.member);
    params.set("group", state.group || DEFAULTS.group);
    params.set("darkmode", state.darkmode ? "on" : "off");
    params.set("tz", state.tz || DEFAULTS.tz);
    params.set("obs", state.obs ? "on" : "off");
    params.set("fontsize", state.fontsize || DEFAULTS.fontsize);
    params.set("boxes", state.boxes ? "on" : "off");
    params.set("whiskers", state.whiskers ? "on" : "off");
    params.set("median", state.median ? "on" : "off");
    params.set("det", state.det ? "on" : "off");
    params.set("colorfriendly", state.colorfriendly ? "on" : "off");
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

  window.HRRRCAST_URL_STATE = {
    DEFAULTS,
    parseState,
    normalizeState,
    writeState,
  };
})();
