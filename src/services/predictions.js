// Predictions data service.
// Preferred source is the live FastAPI (f1-race-ml/src/api/main.py). When the
// Python service is not running, engine predictions fall back to a static
// snapshot committed in public/predictions/race_engine.json.

// Same-origin path proxied by Vite to the FastAPI service (localhost:8000).
// Override in production with VITE_PREDICTION_API pointing at the deployed API.
const DEFAULT_API = "/ml";
const STATIC_ENGINE = "/predictions/race_engine.json";

// Engine prediction mode -> API endpoint.
const ENGINE_ENDPOINTS = {
  auto: "/predict/engine",
  pre: "/predict/engine/pre-quali",
  post: "/predict/engine/post-quali",
};

function apiBase() {
  return import.meta.env?.VITE_PREDICTION_API || DEFAULT_API;
}

async function fetchJson(url, options, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Full Monte Carlo race engine prediction for the next race.
 *  mode: "auto" | "pre" | "post"
 *    auto  -> uses qualifying if available, else pre-qualifying
 *    pre   -> force pre-qualifying (imputed grid)
 *    post  -> force post-qualifying (real grid)
 */
export async function fetchRaceEngine(mode = "auto") {
  const base = apiBase();
  const endpoint = ENGINE_ENDPOINTS[mode] || ENGINE_ENDPOINTS.auto;
  try {
    // The engine loads models + runs 10k simulations, so allow a generous
    // timeout. Cold hosts (e.g. Render free tier waking from sleep) can take up
    // to ~60s on the first call, so 60s prevents spurious "cancelled" aborts.
    const data = await fetchJson(`${base}${endpoint}`, { method: "POST" }, 60000);
    if (data && Array.isArray(data.predictions) && data.predictions.length > 0) {
      return { source: "live", data };
    }
  } catch {
    // fall through to snapshot
  }

  const data = await fetchJson(STATIC_ENGINE, {}, 5000);
  return { source: "snapshot", data };
}

/** Compare predicted vs ACTUAL results for the most recent completed races. */
export async function fetchRecentComparison(races = 6) {
  const base = apiBase();
  const url = `${base}/compare/recent?races=${races}`;
  const data = await fetchJson(url, {}, 60000);
  if (!data || !Array.isArray(data.races)) {
    throw new Error("Comparison data unavailable");
  }
  return { source: "live", data };
}

/** Post-qualifying ranking for the latest completed race (optional). */
export async function fetchQualiPrediction() {
  const base = apiBase();
  try {
    const data = await fetchJson(`${base}/predict/quali`, { method: "POST" });
    if (data && Array.isArray(data.predicted_order)) {
      return { source: "live", data };
    }
  } catch {
    // ignore
  }
  return { source: "unavailable", data: null };
}
