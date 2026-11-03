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
import os
import sys
import time
from pathlib import Path

from contextlib import asynccontextmanager
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


def _root():
    for p in Path(__file__).resolve().parents:
        if (p / "config.py").exists():
            return p
    raise RuntimeError("Could not locate project root")


ROOT = _root()
sys.path.insert(0, str(ROOT))

from config import RETRAIN_POLL_SECONDS, DNF_MODEL_FILE, RANKING_MODEL_FILE, QUALI_MODEL_FILE  # noqa: E402
from src.data.fetch_latest import get_current_season, next_race, refresh_latest  # noqa: E402
from src.models.dnf.predict_dnf import run_prediction                            # noqa: E402
from src.models.ranking.predict_ranking import run_prediction as run_engine_prediction  # noqa: E402
from src.models.quali.predict_quali import run_quali_prediction                  # noqa: E402
from src.models.retrain import retrain_all, needs_retrain                       # noqa: E402

def _refresh_engine_cache():
    """Compute the engine result and store it in the shared cache. Returns it."""
    season, races = get_current_season()
    nr = next_race(season, races)
    key = (nr["season"], nr["round"]) if nr else None
    result = run_engine_prediction()
    _engine_cache["key"] = key
    _engine_cache["result"] = result
    return result


def _invalidate_engine_cache():
    _engine_cache["key"] = None
    _engine_cache["result"] = None


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
    def _warm():
        try:
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

# Allow the Vite dev server to call this API during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    refresh: bool = False


@app.get("/health")
def health():
    return {"status": "ok", "service": "f1-dnf-prediction", "models_ready": models_ready()}


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
    """Force refit all models on the current data (optionally fetch first)."""
    summary = retrain_all(fetch=req.fetch)
    _invalidate_engine_cache()
    return summary


@app.post("/predict")
def predict_endpoint(req: PredictRequest):
    result = run_prediction(refresh=req.refresh)
    return result


@app.post("/predict/engine")
def predict_engine_endpoint():
    """Unified engine prediction (DNF + ranking -> Monte Carlo) for next race.

    Cached by upcoming race so the heavy first compute is only done once
    (it is also pre-warmed at startup).
    """
    if not models_ready():
        raise HTTPException(
            status_code=503,
            detail="Models not trained yet. Run `npm run dev` (auto-bootstraps) "
                   "or `python src/models/retrain.py --fetch`.",
        )
    season, races = get_current_season()
    nr = next_race(season, races)
    key = (nr["season"], nr["round"]) if nr else None
    if key and _engine_cache["key"] == key and _engine_cache["result"] is not None:
        return _engine_cache["result"]
    return _refresh_engine_cache()


@app.post("/predict/quali")
def predict_quali_endpoint(season: int | None = None, round: int | None = None):
    """Post-qualifying prediction. Defaults to the latest completed race."""
    return run_quali_prediction(season=season, rnd=round)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
