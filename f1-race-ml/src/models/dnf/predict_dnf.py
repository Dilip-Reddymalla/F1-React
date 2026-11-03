"""Predict DNF probabilities for the next upcoming F1 race.

How it works:
1. Fetch the next upcoming race from the API (e.g. Brazilian GP, round 20).
2. Build a *proxy* entry list from the most recent completed race's drivers
   (the API does not reveal entries until a race has results).
3. Append placeholder rows for those drivers at the next race, then run the
   SAME leakage-safe compute_features() used for training. Because the
   placeholder race has no result yet, its features are computed purely from
   history *before* that race.
4. Load the trained Logistic Regression pipeline and predict P(DNF).

Run directly:
    python src/models/dnf/predict_dnf.py            # use existing data
    python src/models/dnf/predict_dnf.py --refresh  # fetch fresh data first
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import joblib


def _root():
    for p in Path(__file__).resolve().parents:
        if (p / "config.py").exists():
            return p
    raise RuntimeError("Could not locate project root")


ROOT = _root()
sys.path.insert(0, str(ROOT))

from config import (DNF_DATASET_CSV, RACE_RESULTS_CSV,                      # noqa: E402
                    DNF_MODEL_FILE, PREDICTION_FILE)
from src.data.fetch_latest import (get_current_season, next_race,           # noqa: E402
                                   latest_completed_entries, refresh_latest)
from src.features.build_features import compute_features, FEATURE_COLUMNS   # noqa: E402


def _build_placeholder_rows(entries, race):
    """Rows for the upcoming race with unknown outcome (dnf = NaN)."""
    rows = []
    for e in entries:
        rows.append({
            "season": race["season"],
            "round": race["round"],
            "race": race["race"],
            "date": race["date"],
            "circuit": race["circuit"],
            "driver": e["driver"],
            "driver_id": e["driver_id"],
            "constructor": e["constructor"],
            "grid": np.nan,          # unknown before qualifying
            "dnf": np.nan,           # the thing we are predicting
        })
    return pd.DataFrame(rows)


def run_prediction(refresh=False):
    if refresh:
        print("Refreshing data first...")
        refresh_latest()

    # 1. Locate the next race.
    season, races = get_current_season()
    race = next_race(season, races)
    if race is None:
        raise RuntimeError("No upcoming race found on the calendar.")

    # 2. Proxy entry list = drivers from the most recent completed race.
    entries, last_race = latest_completed_entries(season)
    if not entries:
        raise RuntimeError("No completed race available to build the entry list.")

    # 3. Compute features for the placeholder (future) race using history.
    dataset = pd.read_csv(DNF_DATASET_CSV)
    raw = pd.read_csv(RACE_RESULTS_CSV)
    placeholders = _build_placeholder_rows(entries, race)
    full = pd.concat([dataset, placeholders], ignore_index=True)
    featured = compute_features(full, raw)

    pred_rows = featured[featured["dnf"].isna()].copy()
    pred_rows = pred_rows.reset_index(drop=True)
    X_pred = pred_rows[FEATURE_COLUMNS].copy()

    # Flag drivers with no usable history (e.g. rookies) — features are NaN.
    has_history = ~X_pred.isna().any(axis=1)

    # 4. Load model and predict.
    pipeline = joblib.load(DNF_MODEL_FILE)
    p_dnf = pipeline.predict_proba(X_pred)[:, 1]
    p_finish = 1.0 - p_dnf

    # 5. Assemble the result.
    predictions = []
    for i, row in pred_rows.iterrows():
        predictions.append({
            "driver": row["driver"],
            "constructor": row["constructor"],
            "dnf_probability": round(float(p_dnf[i]), 4),
            "finish_probability": round(float(p_finish[i]), 4),
            "has_history": bool(has_history[i]),
            **{f: (round(float(row[f]), 4) if pd.notna(row[f]) else None)
               for f in FEATURE_COLUMNS},
        })

    # Rank by DNF risk (highest first).
    predictions.sort(key=lambda p: p["dnf_probability"], reverse=True)

    result = {
        "race": race["race"],
        "season": race["season"],
        "round": race["round"],
        "date": race["date"],
        "circuit": race["circuit"],
        "entry_source": f"{last_race['raceName']} results (proxy entry list)",
        "model": "LogisticRegression (baseline)",
        "predictions": predictions,
    }

    PREDICTION_FILE.write_text(json.dumps(result, indent=2))
    return result


def print_prediction(result):
    print("\n" + "=" * 62)
    print(f"  NEXT RACE: {result['race']} — Round {result['round']}, Season {result['season']}")
    print(f"  Date: {result['date']}  |  Circuit: {result['circuit']}")
    print(f"  Entry list source: {result['entry_source']}")
    print("=" * 62)
    print(f"{'Driver':<22}{'Constructor':<14}{'P(DNF)':>9}{'P(Finish)':>11}")
    print("-" * 62)
    for p in result["predictions"]:
        flag = "" if p["has_history"] else "  (no history)"
        print(f"{p['driver']:<22}{p['constructor']:<14}"
              f"{p['dnf_probability']:>8.1%}{p['finish_probability']:>10.1%}{flag}")
    print("-" * 62)
    print(f"Saved -> {PREDICTION_FILE}")


if __name__ == "__main__":
    _refresh = "--refresh" in sys.argv
    result = run_prediction(refresh=_refresh)
    print_prediction(result)
