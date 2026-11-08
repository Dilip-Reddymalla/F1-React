"""Post-qualifying prediction: use a race's REAL grid (qualifying result).

Once qualifying has happened we know the grid. The post-qualifying model
(quali_model) consumes it — via grid, grid_normalized, and driver/constructor
overperformance — to predict that race's finishing order.

By default we demonstrate on the most recent COMPLETED race (whose grid and
actual result both exist), so we can compare prediction vs reality. The same
code works for any race that has a grid (e.g. the upcoming race after its
qualifying session).

Run:
    python src/models/quali/predict_quali.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from scipy.stats import spearmanr


def _root():
    for p in Path(__file__).resolve().parents:
        if (p / "config.py").exists():
            return p
    raise RuntimeError("Could not locate project root")


ROOT = _root()
sys.path.insert(0, str(ROOT))

from config import (DNF_DATASET_CSV, RACE_RESULTS_CSV, QUALI_MODEL_FILE,  # noqa: E402
                    DNF_MODEL_FILE)
from src.data.fetch_latest import (latest_completed_entries,              # noqa: E402
                                   find_upcoming_with_qualifying)
from src.features.build_features import (compute_features, POST_QUALIFYING_FEATURES,  # noqa: E402
                                         FEATURE_COLUMNS)
from src.simulation.race_simulator import monte_carlo  # noqa: E402


def find_target():
    """Default: the most recent completed race."""
    return latest_completed_entries()


def build_placeholders(raw, season, rnd, race_name, date, circuit):
    sub = raw[(raw["season"] == season) & (raw["round"] == rnd)]
    rows = []
    for _, r in sub.iterrows():
        rows.append({
            "season": season,
            "round": rnd,
            "race": race_name,
            "date": date,
            "circuit": circuit,
            "driver": r["driver"],
            "driver_id": r["driver_id"],
            "constructor": r["constructor"],
            "grid": float(r["grid"]),   # REAL grid: the qualifying result
            "dnf": np.nan,
        })
    return pd.DataFrame(rows)


def build_placeholders_from_entries(entries, race):
    """Placeholder rows for an upcoming race using REAL grid from qualifying."""
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
            "grid": float(e["grid"]),
            "dnf": np.nan,
        })
    return pd.DataFrame(rows)


def run_quali_prediction_upcoming(season=None, rnd=None):
    """Post-qualifying prediction for the upcoming race (real grid).

    Uses the just-run qualifying session for the next race to update the
    predicted finishing order. This is the "update after quali" path.
    """
    if season is None:
        race, quali = find_upcoming_with_qualifying()
    else:
        from src.data.fetch_latest import fetch_qualifying_for_round, get_current_season
        _, races = get_current_season()
        race = next((r for r in races if r["round"] == rnd), None)
        if race is None:
            raise RuntimeError(f"No race found for season {season} round {rnd}")
        race = {**race, "season": season}
        quali = fetch_qualifying_for_round(season, rnd)

    if quali is None or not quali["entries"]:
        raise RuntimeError("No qualifying data available for the upcoming race yet.")

    race_info = quali["race_info"]
    race["race"] = race_info["raceName"]
    race["circuit"] = race_info["Circuit"]["circuitName"]
    race["date"] = race_info["date"]

    placeholders = build_placeholders_from_entries(quali["entries"], race)

    raw = pd.read_csv(RACE_RESULTS_CSV)
    dataset = pd.read_csv(DNF_DATASET_CSV)
    full = pd.concat([dataset, placeholders], ignore_index=True)
    featured = compute_features(full, raw)
    pred_rows = featured[featured["dnf"].isna()].copy().reset_index(drop=True)

    quali_model = joblib.load(QUALI_MODEL_FILE)
    pred_position = quali_model.predict(pred_rows[POST_QUALIFYING_FEATURES])

    pred_rows["pred_position"] = pred_position
    pred_rows["pred_rank"] = pred_rows["pred_position"].rank(method="first")
    pred_rows = pred_rows.sort_values("pred_rank")

    result = {
        "race": race["race"],
        "season": race["season"],
        "round": race["round"],
        "date": race["date"],
        "circuit": race["circuit"],
        "source": "upcoming race (post-qualifying)",
        "model": "QualiModel (LinearRegression, post-qualifying)",
        "predicted_order": [
            {
                "driver": r["driver"],
                "constructor": r["constructor"],
                "grid": int(r["grid"]),
                "predicted_position": round(float(r["pred_position"]), 2),
            }
            for _, r in pred_rows.iterrows()
        ],
    }
    return result


def run_quali_prediction(season=None, rnd=None):
    # Determine target race (default: latest completed).
    if season is None:
        entries, race_info = find_target()
        season = int(race_info["season"])
        rnd = int(race_info["round"])
        race_name = race_info["raceName"]
        date = race_info["date"]
        circuit = race_info["Circuit"]["circuitName"]
        source = "latest completed race"
    else:
        raw = pd.read_csv(RACE_RESULTS_CSV)
        sub = raw[(raw["season"] == season) & (raw["round"] == rnd)]
        race_name = sub["race"].iloc[0]
        date = sub["date"].iloc[0]
        circuit = sub["circuit"].iloc[0]
        source = f"season {season} round {rnd}"

    raw = pd.read_csv(RACE_RESULTS_CSV)
    placeholders = build_placeholders(raw, season, rnd, race_name, date, circuit)

    dataset = pd.read_csv(DNF_DATASET_CSV)
    full = pd.concat([dataset, placeholders], ignore_index=True)
    featured = compute_features(full, raw)
    pred_rows = featured[featured["dnf"].isna()].copy().reset_index(drop=True)

    quali_model = joblib.load(QUALI_MODEL_FILE)
    pred_position = quali_model.predict(pred_rows[POST_QUALIFYING_FEATURES])

    # Actual finishing order (for comparison).
    actual = raw[(raw["season"] == season) & (raw["round"] == rnd)] \
        .sort_values("finish_position")[["driver", "grid", "finish_position"]]

    # Merge predicted position onto actual.
    pred_map = dict(zip(pred_rows["driver"], pred_position))
    actual["pred_position"] = actual["driver"].map(pred_map)
    actual = actual.dropna(subset=["pred_position"]).copy()
    actual["pred_rank"] = actual["pred_position"].rank(method="first")
    actual["actual_rank"] = actual["finish_position"].rank(method="first")
    actual = actual.sort_values("pred_rank")

    rho, _ = spearmanr(actual["actual_rank"], actual["pred_rank"])
    predicted_winner = actual.iloc[0]["driver"]
    actual_winner = actual.loc[actual["finish_position"].idxmin(), "driver"]
    winner_hit = int(predicted_winner == actual_winner)

    result = {
        "race": race_name,
        "season": season,
        "round": rnd,
        "date": date,
        "circuit": circuit,
        "source": source,
        "model": "QualiModel (LinearRegression, post-qualifying)",
        "spearman_vs_actual": round(float(rho), 4),
        "winner_hit": winner_hit == 1,
        "predicted_winner": predicted_winner,
        "actual_winner": actual_winner,
        "predicted_order": [
            {
                "driver": r["driver"],
                "grid": int(r["grid"]),
                "predicted_position": round(float(r["pred_position"]), 2),
                "actual_finish": int(r["finish_position"]),
            }
            for _, r in actual.iterrows()
        ],
    }
    return result


def print_result(result):
    print("\n" + "=" * 70)
    print(f"  POST-QUALIFYING PREDICTION — {result['race']} (Round {result['round']})")
    print(f"  {result['date']} | {result['circuit']} | {result['source']}")
    print(f"  Spearman vs actual: {result['spearman_vs_actual']}  |  "
          f"Predicted winner: {result['predicted_winner']} (actual: {result['actual_winner']})")
    print("=" * 70)
    print(f"{'#':<3}{'Driver':<22}{'Grid':>6}{'Actual':>8}{'Hit':>5}")
    print("-" * 70)
    for i, r in enumerate(result["predicted_order"], 1):
        mark = " *" if r["actual_finish"] == i else ""
        print(f"{i:<3}{r['driver']:<22}{r['grid']:>6}{r['actual_finish']:>8}{mark:>5}")
    print("-" * 70)


if __name__ == "__main__":
    res = run_quali_prediction()
    print_result(res)
    print("\n(saved full JSON to models/quali_model/… see run_quali_prediction output)")
