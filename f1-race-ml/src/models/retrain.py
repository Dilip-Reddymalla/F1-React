"""Automatic retraining after each race.

The models are trained *offline* (not per-request). This module refits all
three deployment models — DNF, ranking, post-qualifying — on the latest data
whenever a new race completes.

It uses a training stamp (models/train_stamp.json) recording which race's data
the models last saw, so retraining only happens when there is genuinely new
data (not on every startup).

Steps:
    retrain_all(fetch=True)   -> download new results, rebuild datasets,
                                  then refit all models and update the stamp
    needs_retrain()           -> True if a race completed after the last training

Run directly:
    python src/models/retrain.py  [--fetch]
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd

from sklearn.calibration import CalibratedClassifierCV


def _root():
    for p in Path(__file__).resolve().parents:
        if (p / "config.py").exists():
            return p
    raise RuntimeError("Could not locate project root")


ROOT = _root()
sys.path.insert(0, str(ROOT))

from config import (  # noqa: E402
    DNF_FEATURES_CSV, RACE_RESULTS_CSV,
    DNF_MODEL_FILE, DNF_MODEL_META,
    RANKING_MODEL_FILE, RANKING_MODEL_META,
    QUALI_MODEL_FILE, QUALI_MODEL_META,
    TRAIN_STAMP,
)
from src.features.build_features import (  # noqa: E402
    FEATURE_COLUMNS, RANKING_FEATURES, POST_QUALIFYING_FEATURES,
    build_feature_file,
)
from src.data.fetch_latest import refresh_latest  # noqa: E402

# Champion model per task (from our walk-forward results). Overridden by the
# saved model metadata when it is present.
BEST_DEFAULTS = {
    "dnf": "random_forest",
    "ranking": "linear_regression",
    "quali": "linear_regression",
}


# ---------------------------------------------------------------------------
# Stamp helpers
# ---------------------------------------------------------------------------
def _latest_completed_key():
    """Return (season, round) of the most recent race in the raw data."""
    raw = pd.read_csv(RACE_RESULTS_CSV)
    if raw.empty:
        return (0, 0)
    idx = raw["season"] * 1000 + raw["round"]
    best = raw.loc[idx.idxmax()]
    return (int(best["season"]), int(best["round"]))


def _read_stamp():
    if TRAIN_STAMP.exists():
        try:
            return json.loads(TRAIN_STAMP.read_text())
        except Exception:
            pass
    return {"max_season": 0, "max_round": 0, "trained_at": None}


def _write_stamp(season, round_):
    TRAIN_STAMP.write_text(json.dumps({
        "max_season": season,
        "max_round": round_,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2))


def needs_retrain():
    """True if a race completed after the last training run."""
    stamp = _read_stamp()
    latest = _latest_completed_key()
    return (stamp["max_season"], stamp["max_round"]) != latest


MODEL_FILES = [DNF_MODEL_FILE, RANKING_MODEL_FILE, QUALI_MODEL_FILE]


def models_ready():
    """True if all three trained model files exist."""
    return all(p.exists() for p in MODEL_FILES)


def bootstrap_models(fetch: bool = True):
    """Ensure models exist, training only when needed.

    Used as the server start step so a fresh host self-heals (builds models on
    first boot) without re-training on every restart.
    """
    if models_ready() and not needs_retrain():
        return {"status": "up-to-date", "trained": False}
    return retrain_all(fetch=fetch)


def _best_model(meta_path, default):
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            raw = meta.get("model") or meta.get("base_model") or ""
            # e.g. "Calibrated(random_forest) + isotonic" -> random_forest
            if "(" in raw and ")" in raw:
                return raw.split("(", 1)[1].split(")", 1)[0]
            if "base_model" in meta:
                return meta["base_model"]
        except Exception:
            pass
    return default


# ---------------------------------------------------------------------------
# Model fitting (all trained on the FULL current dataset)
# ---------------------------------------------------------------------------
def _load_features():
    return pd.read_csv(DNF_FEATURES_CSV)


def fit_dnf():
    from src.models.dnf.train_dnf import make_candidate as candidate
    df = _load_features()
    X = df[FEATURE_COLUMNS].copy()
    y = df["dnf"].astype(int).copy()
    best = _best_model(DNF_MODEL_META, BEST_DEFAULTS["dnf"])
    final = CalibratedClassifierCV(candidate(best), method="isotonic", cv=5)
    final.fit(X, y)
    joblib.dump(final, DNF_MODEL_FILE)
    return {"model": f"Calibrated({best}) + isotonic", "rows": len(df)}


def fit_ranking():
    from src.models.ranking.train_ranking import make_candidate as candidate
    df = _load_features().dropna(subset=["finish_position", "grid"])
    X = df[RANKING_FEATURES].copy()
    y = df["finish_position"].astype(float).copy()
    best = _best_model(RANKING_MODEL_META, BEST_DEFAULTS["ranking"])
    final = candidate(best)
    final.fit(X, y)
    joblib.dump(final, RANKING_MODEL_FILE)
    return {"model": f"Ranking({best})", "rows": len(df)}


def fit_quali():
    from src.models.quali.train_quali import make_candidate as candidate
    df = _load_features().dropna(subset=["finish_position"])
    X = df[POST_QUALIFYING_FEATURES].copy()
    y = df["finish_position"].astype(float).copy()
    best = _best_model(QUALI_MODEL_META, BEST_DEFAULTS["quali"])
    final = candidate(best)
    final.fit(X, y)
    joblib.dump(final, QUALI_MODEL_FILE)
    return {"model": f"PostQualifyingRanking({best})", "rows": len(df)}


def retrain_all(fetch: bool = False):
    """Confetch data (optional), rebuild features, refit all models, stamp."""
    if fetch:
        print("Fetching latest race data...")
        refresh_latest()
    else:
        print("Rebuilding feature matrix...")
        build_feature_file()

    season, round_ = _latest_completed_key()

    print("\nFitting DNF model ...")
    dnf = fit_dnf()
    print("Fitting ranking model ...")
    ranking = fit_ranking()
    print("Fitting post-qualifying model ...")
    quali = fit_quali()

    _write_stamp(season, round_)

    summary = {
        "trained_through": {"season": season, "round": round_},
        "trained_at": _read_stamp()["trained_at"],
        "models": {"dnf": dnf, "ranking": ranking, "quali": quali},
    }
    print("\n" + json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    if "--bootstrap" in sys.argv:
        print(json.dumps(bootstrap_models(fetch="--fetch" in sys.argv), indent=2))
    else:
        retrain_all(fetch="--fetch" in sys.argv)
