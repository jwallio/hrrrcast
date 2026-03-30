(function () {
  "use strict";

  function createDataService(config) {
    const staticRoot = normalizeRoot(config.staticRoot);
    const backendRoot = normalizeRoot(config.backendRoot);
    const staticMode = Boolean(staticRoot);
    const cache = new Map();

    return {
      staticMode,
      async loadRuns() {
        const url = staticMode ? `${staticRoot}/runs.json` : `${backendRoot}/api/runs`;
        const payload = await fetchJson(url, staticMode ? "default" : "no-store");
        return Array.isArray(payload.runs) ? payload.runs : [];
      },
      async loadStations() {
        if (!staticMode) {
          return [];
        }
        const payload = await fetchJson(`${staticRoot}/stations.json`, "default");
        return Array.isArray(payload.stations) ? payload.stations : [];
      },
      async searchStations(query, stations) {
        if (staticMode) {
          return searchStaticStations(query, stations, 10);
        }
        const payload = await fetchJson(
          `${backendRoot}/api/stations/search?q=${encodeURIComponent(query)}&limit=10`,
          "no-store"
        );
        return Array.isArray(payload.stations) ? payload.stations : [];
      },
      async loadPointSeries(run, member, station) {
        const key = `${run}|${member}|${station}`;
        if (cache.has(key)) {
          return cache.get(key);
        }
        const url = staticMode
          ? `${staticRoot}/point-series/${encodeURIComponent(run)}/${encodeURIComponent(member)}/${encodeURIComponent(station)}.json`
          : `${backendRoot}/api/point-series?run=${encodeURIComponent(run)}&member=${encodeURIComponent(member)}&station=${encodeURIComponent(station)}`;
        const payload = await fetchJson(url, staticMode ? "default" : "no-store");
        cache.set(key, payload);
        return payload;
      },
    };
  }

  async function fetchJson(url, cacheMode) {
    const response = await fetch(url, { cache: cacheMode || "default" });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  function searchStaticStations(query, stations, limit) {
    const text = String(query || "").trim().toUpperCase();
    if (!text) {
      return [];
    }
    const prefix = [];
    const contains = [];
    for (const station of stations || []) {
      const haystack = [station.id, station.icaoId, station.faaId, station.iataId, ...(station.aliases || []), station.site]
        .filter(Boolean)
        .map((item) => String(item).toUpperCase());
      if (haystack.some((item) => item.startsWith(text))) {
        prefix.push(station);
      } else if (haystack.join(" ").includes(text)) {
        contains.push(station);
      }
    }
    return [...prefix, ...contains].slice(0, limit);
  }

  function normalizeRoot(root) {
    return typeof root === "string" && root ? root.replace(/\/$/, "") : "";
  }

  window.HRRRCAST_DATA = {
    createDataService,
  };
})();
