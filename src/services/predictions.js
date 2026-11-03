// Predictions data service.
// Preferred source is the live FastAPI (f1-race-ml/src/api/main.py). When the
// Python service is not running, we fall back to a static snapshot committed in
// public/predictions/race_engine.json so the page still renders real output.

// Same-origin path proxied by Vite to the FastAPI service (localhost:8000).
// Override in production with VITE_PREDICTION_API pointing at the deployed API.
const DEFAULT_API = "/ml";
const STATIC_ENGINE = "/predictions/race_engine.json";

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

/** Full Monte Carlo race engine prediction for the next race. */
export async function fetchRaceEngine() {
  const base = apiBase();
  try {
    // The engine loads models + runs 10k simulations, so allow a generous
    // timeout (the server caches after the first call).
    const data = await fetchJson(`${base}/predict/engine`, { method: "POST" }, 30000);
    if (data && Array.isArray(data.predictions) && data.predictions.length > 0) {
      return { source: "live", data };
    }
  } catch {
    // fall through to snapshot
  }

  const data = await fetchJson(STATIC_ENGINE, {}, 5000);
  return { source: "snapshot", data };
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
