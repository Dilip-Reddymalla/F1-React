// Predictions data service — MongoDB-first, Python backend fallback.
//
// Flow:
//   1. Try the fast path: read a completed prediction from MongoDB via the
//      Node endpoint (/api/predictions). This returns instantly.
//   2. If the record is missing/stale (404), call the Python FastAPI backend
//      (f1-race-ml), which computes and stores the fresh record in Mongo —
//      so the NEXT request hits the fast path.

const DEFAULT_API = "/ml";
const STATIC_ENGINE = "/predictions/race_engine.json";

// Engine stage labels used as the MongoDB key (must match the Python backend).
const STAGE_LABELS = {
  pre: "pre-qualifying (grid imputed)",
  post: "post-qualifying (real grid)",
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

/** MongoDB fast path for engine predictions (explicit stage). */
async function fetchFromMongo(season, round, stage) {
  try {
    const url =
      `/api/predictions?season=${season}&round=${round}` +
      `&stage=${encodeURIComponent(stage)}`;
    const data = await fetchJson(url, {}, 6000);
    if (data && data.cached && Array.isArray(data.predictions) && data.predictions.length > 0) {
      return { source: "mongo", data };
    }
  } catch {
    // fall through to backend
  }
  return null;
}

/** Full Monte Carlo race engine prediction.
 *  mode: "auto" | "pre" | "post"
 *    auto  -> compute via backend (which itself serves/creates the Mongo record)
 *    pre   -> MongoDB-first, then backend (imputed grid)
 *    post  -> MongoDB-first, then backend (real grid)
 */
export async function fetchRaceEngine(mode = "auto") {
  const base = apiBase();

  // Fast path for explicit modes.
  if (mode === "pre" || mode === "post") {
    try {
      const nxt = await fetchJson(`${base}/next-race`, {}, 8000);
      if (nxt && nxt.season && nxt.round) {
        const hit = await fetchFromMongo(nxt.season, nxt.round, STAGE_LABELS[mode]);
        if (hit) return hit;
      }
    } catch {
      // backend unreachable — continue to normal path
    }
  }

  // Backend path (the backend serves its own Mongo/in-memory cache after the
  // first compute, so repeat calls are fast; allow a long timeout for the
  // first compute).
  const endpoint =
    mode === "pre" ? "/predict/engine/pre-quali"
    : mode === "post" ? "/predict/engine/post-quali"
    : "/predict/engine";
  try {
    const data = await fetchJson(`${base}${endpoint}`, { method: "POST" }, 120000);
    if (data && Array.isArray(data.predictions) && data.predictions.length > 0) {
      return { source: "live", data };
    }
  } catch {
    // fall through to snapshot
  }

  const data = await fetchJson(STATIC_ENGINE, {}, 5000);
  return { source: "snapshot", data };
}

/** Compare predicted vs ACTUAL results — MongoDB-first, backend fallback. */
export async function fetchRecentComparison(races = 6) {
  const base = apiBase();

  try {
    const data = await fetchJson(`/api/predictions/compare?races=${races}`, {}, 6000);
    if (data && data.cached && Array.isArray(data.races)) {
      return { source: "mongo", data };
    }
  } catch {
    // fall through to backend
  }

  const data = await fetchJson(`${base}/compare/recent?races=${races}`, {}, 150000);
  if (!data || !Array.isArray(data.races)) {
    throw new Error("Comparison data unavailable");
  }
  return { source: "live", data };
}

/** Start a background model retrain job (returns immediately).
 *  The job runs on the backend and can take minutes; poll
 *  getRetrainStatus() for progress.
 */
export async function startRetrain(fetchFirst = true) {
  const base = apiBase();
  const res = await fetch(`${base}/retrain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fetch: fetchFirst }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Current status of the background retrain job. */
export async function getRetrainStatus() {
  const base = apiBase();
  const res = await fetch(`${base}/retrain/status`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
