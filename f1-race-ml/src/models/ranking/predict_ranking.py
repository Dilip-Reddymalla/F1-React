"""Unified prediction for the next race: DNF + ranking → Monte Carlo engine.

This is the integration point of the whole pipeline. It produces, for each
driver in the next race:

    dnf_probability      P(the driver does not finish)
    expected_finish      predicted finishing position among finishers
    expected_rank        predicted overall position (DNF counted as last)
    win_probability      P(P1) from the Monte Carlo engine
    positions            the full P1..P20 distribution (engine output)

The engine ensures the outputs are a *coherent* race: exactly one winner, and
positions only go to drivers who finish.

Run:
    python src/models/ranking/predict_ranking.py
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

from config import (DNF_DATASET_CSV, RACE_RESULTS_CSV, DNF_MODEL_FILE,  # noqa: E402
                    RANKING_MODEL_FILE, RACE_ENGINE_FILE)
from src.data.fetch_latest import (get_current_season, next_race,           # noqa: E402
                                   latest_completed_entries,
                                   find_upcoming_with_qualifying)
from src.features.build_features import (compute_features,                 # noqa: E402
                                         FEATURE_COLUMNS, RANKING_FEATURES)
from src.simulation.race_simulator import monte_carlo, summarize_engine    # noqa: E402


def build_placeholder_rows(entries, race, grid_map=None):
    """grid_map: {driver: grid} from qualifying; when given, uses real grid."""
    rows = []
    for e in entries:
        grid = np.nan
        if grid_map is not None:
            grid = float(grid_map.get(e["driver"], np.nan))
        rows.append({
            "season": race["season"],
            "round": race["round"],
            "race": race["race"],
            "date": race["date"],
            "circuit": race["circuit"],
            "driver": e["driver"],
            "driver_id": e["driver_id"],
            "constructor": e["constructor"],
            "grid": grid,
            "dnf": np.nan,
        })
    return pd.DataFrame(rows)


def run_prediction(refresh=False, entries_with_grid=None, stage_hint=None,
                   race_override=None):
    """Run the race engine for the next race.

    entries_with_grid: optional [{driver, driver_id, constructor, grid}] from
        qualifying. When provided, the engine uses the REAL grid (post-qualifying)
        instead of imputing it.

    race_override: optional race dict (season, round, race, date, circuit) to
        use instead of recomputing next_race() (needed for post-qualifying so
        the labels match the grid passed in).
    """
    if race_override is not None:
        race = race_override
    else:
        season, races = get_current_season()
        race = next_race(season, races)
    if race is None:
        raise RuntimeError("No upcoming race found on the calendar.")

    if entries_with_grid is not None:
        entries = entries_with_grid
        last_race_name = "qualifying (real grid)"
        stage = "post-qualifying (real grid)"
    else:
        entries, last_race = latest_completed_entries(season)
        last_race_name = f"{last_race['raceName']} results (proxy entry list)"
        stage = "pre-qualifying (grid imputed)"
    if not entries:
        raise RuntimeError("No entry list available to build the prediction.")

    grid_map = None
    if entries_with_grid is not None:
        grid_map = {e["driver"]: e["grid"] for e in entries_with_grid}
    if stage_hint:
        stage = stage_hint

    dataset = pd.read_csv(DNF_DATASET_CSV)
    raw = pd.read_csv(RACE_RESULTS_CSV)
    placeholders = build_placeholder_rows(entries, race, grid_map=grid_map)
    full = pd.concat([dataset, placeholders], ignore_index=True)
    featured = compute_features(full, raw)
    pred_rows = featured[featured["dnf"].isna()].copy().reset_index(drop=True)

    # DNF model → P(DNF)
    dnf_model = joblib.load(DNF_MODEL_FILE)
    p_dnf = dnf_model.predict_proba(pred_rows[FEATURE_COLUMNS])[:, 1]

    # Ranking model → expected finishing position (strength)
    rank_model = joblib.load(RANKING_MODEL_FILE)
    exp_finish = rank_model.predict(pred_rows[RANKING_FEATURES])

    # Monte Carlo engine → coherent race distribution
    engine = monte_carlo(pred_rows["driver"].tolist(), p_dnf, exp_finish,
                         n_sims=10000)

    by_driver = {r["driver"]: r for r in engine}
    predictions = []
    for i, row in pred_rows.iterrows():
        d = by_driver[row["driver"]]
        predictions.append({
            "driver": row["driver"],
            "constructor": row["constructor"],
            "dnf_probability": d["dnf_prob"],
            "expected_finish": d["expected_finish"],
            "expected_rank": d["expected_rank"],
            "winner_probability": d["win_prob"],
            "positions": d["positions"],
        })

    # Rank by overall expected rank (P1 first).
    predictions.sort(key=lambda p: p["expected_rank"])

    result = {
        "race": race["race"],
        "season": race["season"],
        "round": race["round"],
        "date": race["date"],
        "circuit": race["circuit"],
        "entry_source": last_race_name,
        "stage": stage,
        "engine": "Monte Carlo (10,000 simulations)",
        "predictions": predictions,
    }

    RACE_ENGINE_FILE.write_text(json.dumps(result, indent=2))
    return result


def run_engine_post_qualifying():
    """Run the full engine for the upcoming race using REAL grid from qualifying."""
    race, quali = find_upcoming_with_qualifying()
    if race is None or quali is None:
        raise RuntimeError("No qualifying data available for the upcoming race.")
    entries = quali["entries"]
    race = dict(race)
    race["race"] = quali["race_info"]["raceName"]
    race["circuit"] = quali["race_info"]["Circuit"]["circuitName"]
    race["date"] = quali["race_info"]["date"]
    return run_prediction(
        entries_with_grid=entries,
        stage_hint="post-qualifying (real grid)",
        race_override=race,
    )


def run_prediction_auto():
    """Run the engine for the next race, auto-selecting the prediction stage.

    - If qualifying has already happened for the target race (a race weekend is
      underway), use the REAL grid (post-qualifying).
    - Otherwise, fall back to the pre-qualifying prediction (imputed grid).

    This is the behaviour of the main /predict/engine endpoint.
    """
    race, quali = find_upcoming_with_qualifying()
    if race is not None and quali is not None:
        return run_engine_post_qualifying()
    return run_prediction()


def print_result(result):
    print("\n" + "=" * 78)
    print(f"  RACE ENGINE — {result['race']} (Round {result['round']}, Season {result['season']})")
    print(f"  {result['date']}  |  {result['circuit']}")
    print(f"  Stage: {result['stage']}  |  {result['engine']}")
    print("=" * 78)
    print(f"{'#':<3}{'Driver':<21}{'Exp Rank':>9}{'Win%':>7}{'DNF%':>7}{'P1':>6}{'P2':>6}{'P3':>6}")
    print("-" * 78)
    for i, p in enumerate(result["predictions"], 1):
        pos = p["positions"]
        print(f"{i:<3}{p['driver']:<21}"
              f"{p['expected_rank']:>9.2f}"
              f"{p['winner_probability']:>6.1%}"
              f"{p['dnf_probability']:>6.1%}"
              f"{pos.get('P1',0):>6.1%}"
              f"{pos.get('P2',0):>6.1%}"
              f"{pos.get('P3',0):>6.1%}")
    print("-" * 78)
    print(f"Saved -> {RACE_ENGINE_FILE}")


if __name__ == "__main__":
    result = run_prediction()
    print_result(result)
