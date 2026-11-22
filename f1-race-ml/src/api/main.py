"""FastAPI service wrapping the real-time fetch + prediction pipeline.

Run:
    python src/api/main.py
    # or
    uvicorn src.api.main:app --reload

Endpoints:
    GET  /health       -> service status
    GET  /next-race    -> the upcoming race (Brazilian GP 2026)
    POST /refresh      -> download newest data + rebuild datasets (+ retrain if new)
    POST /retrain      -> force refit models on current data
    POST /predict      -> DNF predictions for the next race
    POST /predict/engine -> full Monte Carlo race engine
    POST /predict/quali  -> post-qualifying ranking

Auto-retraining:
    A background scheduler checks periodically (default 1h, env
    PREDICT_RETRAIN_POLL_SECONDS) whether a race completed after the last
    training run. If so, it fetches the new results and refits all models.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from contextlib import asynccontextmanager
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel


def _root():
    for p in Path(__file__).resolve().parents:
        if (p / "config.py").exists():
            return p
    raise RuntimeError("Could not locate project root")


ROOT = _root()
sys.path.insert(0, str(ROOT))

from config import (RETRAIN_POLL_SECONDS, DNF_MODEL_FILE, RANKING_MODEL_FILE,  # noqa: E402
                    QUALI_MODEL_FILE, RACE_ENGINE_FILE)
from src.data.fetch_latest import (get_current_season, next_race, refresh_latest,  # noqa: E402
                                   find_upcoming_with_qualifying,
                                   fetch_actual_starting_grid,
                                   fetch_qualifying_for_round,
                                   latest_completed_entries)
from src.models.dnf.predict_dnf import run_prediction                            # noqa: E402
from src.models.ranking.predict_ranking import (run_prediction as run_engine_prediction,  # noqa: E402
                                                run_engine_post_qualifying,
                                                run_prediction_auto)
from src.models.quali.predict_quali import (run_quali_prediction,               # noqa: E402
                                            run_quali_prediction_upcoming)
from src.models.retrain import retrain_all, needs_retrain, _latest_completed_key  # noqa: E402
from src.evaluation.engine_eval import compare_recent_races                    # noqa: E402
from src.api.prediction_store import _store as mongo_store                     # noqa: E402

def _refresh_engine_cache():
    """Compute the engine result (auto pre/post-qualifying) and cache it."""
    result = run_prediction_auto()
    # Cache key includes the stage so the cache refreshes when qualifying
    # becomes available for the same race (pre-quali -> post-quali).
    key = (result.get("season"), result.get("round"), result.get("stage"))
    _engine_cache["key"] = key
    _engine_cache["result"] = result
    return result


def _data_round():
    """Latest race round the models were trained through (for staleness)."""
    try:
        season, rnd = _latest_completed_key()
        return rnd
    except Exception:
        return 0


def _engine_from_mongo(season, round_, stage):
    """Try to read a stored engine result from MongoDB."""
    result = mongo_store.get(season, round_, stage, data_round=_data_round())
    if result is not None:
        return result
    return None


def _engine_into_mongo(result):
    """Persist a computed engine result into MongoDB (best-effort)."""
    try:
        season = int(result.get("season"))
        round_ = int(result.get("round"))
        stage = result.get("stage", "engine")
        mongo_store.put(season, round_, stage, data_round=_data_round(), payload=result)
    except Exception as exc:  # noqa: BLE001
        print(f"[mongo] store engine failed: {exc}")


def _load_engine_from_disk():
    """Load a previously persisted engine result, if it still matches the
    current target race/stage. Lets cold starts serve instantly without a
    heavy recompute (which can exceed client timeouts on free-tier hosts)."""
    try:
        if not RACE_ENGINE_FILE.exists():
            return None, None
        result = json.loads(RACE_ENGINE_FILE.read_text())
        key = (result.get("season"), result.get("round"), result.get("stage"))
        if key and _current_engine_key() == key and result.get("predictions"):
            return key, result
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] engine disk-load skipped: {exc}")
    return None, None


def _invalidate_engine_cache():
    _engine_cache["key"] = None
    _engine_cache["result"] = None
    _compare_cache["key"] = None
    _compare_cache["result"] = None


def _current_engine_key():
    """Cheaply compute the expected cache key for the next race.

    If qualifying has happened for the target race, the key is the post-quali
    stage; otherwise pre-quali. Comparing this to the cached key lets us serve
    the fast cached result when nothing changed, and refresh the moment
    qualifying becomes available.
    """
    race, quali = find_upcoming_with_qualifying()
    if race is not None and quali is not None:
        return (race["season"], race["round"], "post-qualifying (real grid)")
    season, races = get_current_season()
    nr = next_race(season, races)
    if nr is None:
        return None
    return (nr["season"], nr["round"], "pre-qualifying (grid imputed)")


def models_ready():
    """True if all trained model files exist (they are generated on first run)."""
    return all(p.exists() for p in (DNF_MODEL_FILE, RANKING_MODEL_FILE, QUALI_MODEL_FILE))


def _run_retrain_scheduler():
    """Background loop: retrain whenever a new race completed since last train."""
    poll = int(os.environ.get("PREDICT_RETRAIN_POLL_SECONDS", RETRAIN_POLL_SECONDS))
    while True:
        try:
            if needs_retrain():
                print("[scheduler] New race data detected -> retraining...")
                retrain_all(fetch=True)
                _invalidate_engine_cache()
        except Exception as exc:  # noqa: BLE001
            print(f"[scheduler] retrain check error: {exc}")
        time.sleep(poll)


@asynccontextmanager
async def lifespan(_app):
    # 1. Pre-warm the engine cache so the first page load is fast.
    #    Prefer a persisted result (instant); recompute only if stale/missing.
    def _warm():
        try:
            key, cached = _load_engine_from_disk()
            if cached is not None:
                _engine_cache["key"] = key
                _engine_cache["result"] = cached
                print("[startup] loaded engine result from disk cache")
                return
            _refresh_engine_cache()
        except Exception as exc:  # noqa: BLE001
            print(f"[startup] engine pre-warm failed: {exc}")
    threading.Thread(target=_warm, daemon=True).start()

    # 2. Auto-retrain scheduler.
    threading.Thread(target=_run_retrain_scheduler, daemon=True).start()
    yield


app = FastAPI(title="F1 DNF Prediction API", version="0.1.0", lifespan=lifespan)

# Simple in-memory cache for the (expensive) Monte Carlo engine result.
# Keyed by (season, round) of the upcoming race; cleared on /refresh.
_engine_cache = {"key": None, "result": None}

# Cache for the compare/recent endpoint (model training is the expensive part).
_compare_cache = {"key": None, "result": None}

# Allow origins: dev + anything passed via PREDICT_ALLOW_ORIGINS
# (comma-separated, e.g. "https://f1-react.vercel.app,https://mysite.com").
# Origins are normalized (trimmed, trailing slash stripped, lowercased) so a
# small paste mismatch (e.g. a trailing "/") cannot silently block the browser.
def _normalize_origin(o):
    o = o.strip().rstrip("/")
    return o.lower() if o.lower().startswith("http") else o


ALLOWED_ORIGINS = [
    _normalize_origin("http://localhost:5173"),
    _normalize_origin("http://127.0.0.1:5173"),
]
for _o in os.environ.get("PREDICT_ALLOW_ORIGINS", "").split(","):
    _o = _normalize_origin(_o)
    if _o and _o not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(_o)

print(f"[startup] Allowed CORS origins: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    refresh: bool = False


# ── Retrain background job ─────────────────────────────────────────────────
# Retraining can take minutes; we run it in a background thread and expose a
# status endpoint so the frontend can poll instead of holding a request open.
_retrain_job = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "result": None,
    "error": None,
}
_retrain_lock = threading.Lock()


def _prewarm_prediction_records():
    """After retraining, pre-compute and store fresh prediction records so the
    frontend's MongoDB fast path serves them instantly.

    - Compare (last 6 races): ~24s cold compute -> pre-warmed.
    - Engine pre-qualifying for the next race -> pre-warmed.
    - Engine post-qualifying: best-effort (may skip if grid unavailable).
    """
    try:
        data_round = _data_round()
        season, _ = get_current_season()

        # Compare
        try:
            compare = compare_recent_races(k=6)
            mongo_store.put(season, data_round, "compare:6",
                            data_round=data_round, payload=compare)
            print("[prewarm] compare:6 stored")
        except Exception as exc:  # noqa: BLE001
            print(f"[prewarm] compare failed: {exc}")

        # Engine pre-quali (next race)
        try:
            nr = next_race(season)
            if nr is not None:
                engine = run_engine_prediction(stage_hint="pre-qualifying (grid imputed)")
                _engine_into_mongo(engine)
                print("[prewarm] engine pre-quali stored")
        except Exception as exc:  # noqa: BLE001
            print(f"[prewarm] engine pre-quali failed: {exc}")

        # Engine post-quali (best-effort)
        try:
            engine_post = run_engine_post_qualifying()
            _engine_into_mongo(engine_post)
            print("[prewarm] engine post-quali stored")
        except Exception as exc:  # noqa: BLE001
            print(f"[prewarm] engine post-quali skipped: {exc}")
    except Exception as exc:  # noqa: BLE001
        print(f"[prewarm] failed: {exc}")


def _retrain_worker(fetch):
    def _run():
        try:
            result = retrain_all(fetch=fetch)
            with _retrain_lock:
                _retrain_job["result"] = result
                _retrain_job["error"] = None
            _prewarm_prediction_records()
        except Exception as exc:  # noqa: BLE001
            with _retrain_lock:
                _retrain_job["error"] = str(exc)
                _retrain_job["result"] = None
        finally:
            with _retrain_lock:
                _retrain_job["running"] = False
                _retrain_job["finished_at"] = datetime.now(timezone.utc).isoformat()
            _invalidate_engine_cache()
    return _run


def _start_retrain_job(fetch=True):
    with _retrain_lock:
        if _retrain_job["running"]:
            return {"started": False, "running": True}
        _retrain_job.update({
            "running": True,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": None,
            "result": None,
            "error": None,
        })
    threading.Thread(target=_retrain_worker(fetch), daemon=True).start()
    return {"started": True, "running": True}


def _retrain_status():
    with _retrain_lock:
        return {
            "running": _retrain_job["running"],
            "started_at": _retrain_job["started_at"],
            "finished_at": _retrain_job["finished_at"],
            "result": _retrain_job["result"],
            "error": _retrain_job["error"],
        }


class GridOverrideRequest(BaseModel):
    """Optional post-penalty starting grid, keyed by driverId or driver name.

    Example:
        {"grids": {"norris": 1, "max verstappen": 2}}
    Drivers not listed keep their qualifying position as the starting grid.
    """
    grids: dict[str, int] | None = None


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "f1-dnf-prediction",
        "models_ready": models_ready(),
        "prediction_store": mongo_store.status(),
    }


_HOME_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>F1 ML Prediction API</title>
<style>
  :root { --bg:#0b0b0d; --surface:#1a1a1e; --red:#ff1801; --text:#fff; --muted:#b5b7ba; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font-family:system-ui,-apple-system,"Segoe UI",sans-serif; line-height:1.6; }
  .wrap { max-width:860px; margin:0 auto; padding:3.5rem 1.5rem; }
  .badge { display:inline-block; background:rgba(255,24,1,.14); color:#ff6a5c;
           border:1px solid rgba(255,24,1,.4); padding:.3rem .9rem; border-radius:999px;
           font-size:.8rem; letter-spacing:2px; text-transform:uppercase; font-weight:800; }
  h1 { font-size:2.6rem; margin:.9rem 0 .4rem; letter-spacing:-1px; }
  h1 span { color:var(--red); }
  .sub { color:var(--muted); max-width:640px; }
  .status { margin:1.5rem 0; display:flex; gap:1rem; flex-wrap:wrap; }
  .chip { background:var(--surface); border:1px solid #2a2a30; border-radius:12px;
          padding:.6rem 1rem; font-size:.9rem; }
  .chip b { color:var(--red); }
  table { width:100%; border-collapse:collapse; margin-top:1.5rem; font-size:.95rem; }
  th { text-align:left; background:rgba(255,24,1,.12); padding:.7rem 1rem;
       font-size:.75rem; letter-spacing:1px; text-transform:uppercase;
       border-bottom:2px solid rgba(255,24,1,.5); }
  td { padding:.65rem 1rem; border-bottom:1px solid rgba(255,255,255,.06); }
  code { background:rgba(255,255,255,.08); padding:.1rem .4rem; border-radius:6px; }
  a { color:#ff6a5c; text-decoration:none; }
  .foot { margin-top:2.5rem; color:var(--muted); font-size:.85rem; }
</style>
</head>
<body>
<div class="wrap">
  <span class="badge">🏁 F1 Race Predictions</span>
  <h1>ML <span>Prediction API</span></h1>
  <p class="sub">FastAPI service for the Formula 1 prediction system: DNF
  probabilities, finishing-order ranking (pre/post-qualifying), and a Monte
  Carlo race engine producing P1–P20 distributions.</p>

  <div class="status">
    <span class="chip">Models ready: <b>__MODELS_READY__</b></span>
    <span class="chip">Interactive docs: <a href="/docs">/docs</a></span>
  </div>

  <h2>Endpoints</h2>
  <table>
    <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td>GET</td><td><code>/health</code></td><td>Service + model status</td></tr>
      <tr><td>GET</td><td><code>/next-race</code></td><td>Upcoming race info</td></tr>
      <tr><td>POST</td><td><code>/predict/engine</code></td><td>Engine — auto (uses qualifying if available)</td></tr>
      <tr><td>POST</td><td><code>/predict/engine/pre-quali</code></td><td>Engine — pre-qualifying (imputed grid)</td></tr>
      <tr><td>POST</td><td><code>/predict/engine/post-quali</code></td><td>Engine — post-qualifying (real grid)</td></tr>
      <tr><td>POST</td><td><code>/predict</code></td><td>DNF probabilities for next race</td></tr>
      <tr><td>POST</td><td><code>/predict/quali/upcoming</code></td><td>Post-quali finishing order (real grid)</td></tr>
      <tr><td>GET</td><td><code>/compare/recent?races=6</code></td><td>Predicted vs actual for recent races</td></tr>
      <tr><td>POST</td><td><code>/retrain</code></td><td>Start background retrain (returns immediately)</td></tr>
      <tr><td>GET</td><td><code>/retrain/status</code></td><td>Poll retrain job status</td></tr>
      <tr><td>POST</td><td><code>/refresh</code></td><td>Fetch latest data (+ retrain if new race)</td></tr>
    </tbody>
  </table>

  <p class="foot">Auto-retraining runs after each completed race. Models are
  trained offline; inference is cached and fast.</p>
</div>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
def home():
    # Use replace() (NOT .format / because the HTML/CSS contains {} braces.
    ready = "yes" if models_ready() else "no"
    return _HOME_HTML.replace("__MODELS_READY__", ready)


@app.get("/next-race")
def next_race_endpoint():
    season, races = get_current_season()
    return next_race(season, races)


class RetrainRequest(BaseModel):
    fetch: bool = True


@app.post("/refresh")
def refresh_endpoint():
    """Download newest data; if a race completed, rebuild features + retrain."""
    summary = refresh_latest()
    _invalidate_engine_cache()
    if summary.get("new_records", 0) > 0:
        summary["retrained"] = retrain_all(fetch=False)["models"]
    return summary


@app.post("/retrain")
def retrain_endpoint(req: RetrainRequest):
    """Start a background retrain job (fetch latest data by default).

    Returns immediately; poll GET /retrain/status for progress.
    """
    return _start_retrain_job(fetch=req.fetch)


@app.get("/retrain/status")
def retrain_status_endpoint():
    """Current status of the background retrain job."""
    return _retrain_status()


@app.post("/predict")
def predict_endpoint(req: PredictRequest):
    result = run_prediction(refresh=req.refresh)
    return result


@app.post("/predict/engine")
def predict_engine_endpoint():
    """Unified engine prediction (DNF + ranking -> Monte Carlo) for next race.

    Served from MongoDB when a stored record exists for the current
    (season, round, stage); otherwise computed and persisted.
    """
    if not models_ready():
        raise HTTPException(
            status_code=503,
            detail="Models not trained yet. Run `npm run dev` (auto-bootstraps) "
                   "or `python src/models/retrain.py --fetch`.",
        )
    key = _current_engine_key()
    if key and _engine_cache["key"] == key and _engine_cache["result"] is not None:
        return _engine_cache["result"]
    if key:
        season, round_, stage = key
        stored = _engine_from_mongo(season, round_, stage)
        if stored is not None:
            _engine_cache["key"] = key
            _engine_cache["result"] = stored
            return stored
    result = _refresh_engine_cache()
    _engine_into_mongo(result)
    return result


@app.post("/predict/quali")
def predict_quali_endpoint(season: int | None = None, round: int | None = None):
    """Post-qualifying prediction. Defaults to the latest completed race."""
    return run_quali_prediction(season=season, rnd=round)


@app.post("/predict/quali/upcoming")
def predict_quali_upcoming_endpoint(req: GridOverrideRequest | None = None):
    """Update prediction for the UPCOMING race using its real qualifying grid.

    Optional body {"grids": {...}} applies post-penalty starting positions.
    """
    grids = (req.grids if req else None)
    return run_quali_prediction_upcoming(grid_overrides=grids)


@app.post("/predict/engine/quali")
def predict_engine_quali_endpoint():
    """Full race engine for the upcoming race using REAL grid (post-qualifying)."""
    return run_engine_post_qualifying()


@app.post("/predict/engine/pre-quali")
def predict_engine_pre_quali_endpoint():
    """Full race engine for the next race — forced pre-qualifying (imputed grid)."""
    season, races = get_current_season()
    nr = next_race(season, races)
    if nr is None:
        raise HTTPException(status_code=404, detail="No upcoming race found.")
    result = _engine_from_mongo(nr["season"], nr["round"], "pre-qualifying (grid imputed)")
    if result is not None:
        return result
    result = run_engine_prediction(stage_hint="pre-qualifying (grid imputed)")
    _engine_into_mongo(result)
    return result


@app.post("/predict/engine/post-quali")
def predict_engine_post_quali_endpoint(req: GridOverrideRequest | None = None):
    """Full race engine for the next race — forced post-qualifying (real grid).

    Optional body {"grids": {...}} applies post-penalty starting positions.
    """
    grids = (req.grids if req else None)
    result = run_engine_post_qualifying(grid_overrides=grids)
    _engine_into_mongo(result)
    return result


@app.get("/grid")
def grid_endpoint(season: int | None = None, round: int | None = None):
    """Actual starting grid (post-penalty) for a round.

    Source: OpenF1 (includes penalties). Falls back to Jolpica qualifying
    positions when the real grid is not published yet.
    Returns {"race":…, "grid": [{position, driver, constructor, driver_id}]}.
    """
    if season is None:
        season, _ = get_current_season()

    race, entries = fetch_actual_starting_grid(season=season, round_no=round)
    if entries is None:
        # fallback: qualifying positions for that round
        q = fetch_qualifying_for_round(season, round)
        if q is None or not q["entries"]:
            raise HTTPException(status_code=404, detail="No grid data for this round.")
        entries = q["entries"]
        race = {"season": season, "round": round,
                "race": q["race_info"]["raceName"],
                "date": q["race_info"]["date"],
                "circuit": q["race_info"]["Circuit"]["circuitName"]}

    # merge constructor/driver_id from base entries when available
    base, _ = latest_completed_entries(season) if race else ([], None)
    base_by_name = {e["driver"].strip().lower(): e for e in base}
    grid_rows = []
    for e in sorted(entries, key=lambda x: x["grid"]):
        b = base_by_name.get(e["driver"].strip().lower(), {})
        grid_rows.append({
            "position": int(e["grid"]),
            "driver": e["driver"],
            "constructor": b.get("constructor", "") or e.get("constructor", ""),
            "driver_id": b.get("driver_id", "") or e.get("driver_id", ""),
        })

    return {
        "season": race.get("season"),
        "round": race.get("round"),
        "race": race.get("race"),
        "date": race.get("date"),
        "circuit": race.get("circuit"),
        "source": "openf1-actual-grid",
        "grid": grid_rows,
    }


@app.get("/compare/recent")
def compare_recent_endpoint(races: int = 6):
    """Predicted vs actual results for the most recent completed races.

    Cached (training is the expensive part) so repeat requests are instant.
    Also persisted to MongoDB, keyed by the latest trained round so it only
    recomputes when new race data arrives.
    """
    key = ("recent", races)
    if _compare_cache["key"] == key and _compare_cache["result"] is not None:
        return _compare_cache["result"]

    data_round = _data_round()
    season, _ = get_current_season()
    stored = mongo_store.get(season, data_round, f"compare:{races}", data_round=data_round)
    if stored is not None:
        _compare_cache["key"] = key
        _compare_cache["result"] = stored
        return stored

    result = compare_recent_races(k=races)
    mongo_store.put(season, data_round, f"compare:{races}",
                    data_round=data_round, payload=result)
    _compare_cache["key"] = key
    _compare_cache["result"] = result
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
