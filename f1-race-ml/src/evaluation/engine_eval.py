"""Evaluation gate for the whole pipeline (engine backtest).

This is the "does the full system actually work?" check. For each walk-forward
test season we retrain DNF + ranking models ONLY on the past, then simulate the
upcoming races with the Monte Carlo engine, and compare the simulated outcomes
with the real results:

    winner hit rate    the simulated P1 matches the actual winner
    winner Brier       calibration of simulated win probabilities
    Spearman           correlation between simulated and actual finishing order
    expected MAE       error of expected finishing position vs actual
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.pipeline import Pipeline
from scipy.stats import spearmanr


def _root():
    for p in Path(__file__).resolve().parents:
        if (p / "config.py").exists():
            return p
    raise RuntimeError("Could not locate project root")


ROOT = _root()
sys.path.insert(0, str(ROOT))

from config import DNF_FEATURES_CSV, RACE_RESULTS_CSV  # noqa: E402
from src.features.build_features import (FEATURE_COLUMNS, RANKING_FEATURES,  # noqa: E402
                                         compute_features)
from src.simulation.race_simulator import monte_carlo  # noqa: E402

TEST_YEARS = [2024, 2025, 2026]
N_SIMS = 2000


def dnf_pipeline():
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=3000)),
    ])


def ranking_pipeline():
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("reg", LinearRegression()),
    ])


def eval_year(df, year):
    season = df["season"]
    tr = (season < year).values
    te = (season == year).values

    dnf_model = dnf_pipeline().fit(df[tr][FEATURE_COLUMNS], df[tr]["dnf"])
    rank_model = ranking_pipeline().fit(df[tr][RANKING_FEATURES],
                                        df[tr]["finish_position"])

    race_rows = []
    for (yr, rnd), grp in df[te].groupby(["season", "round"]):
        X_dnf = grp[FEATURE_COLUMNS]
        X_rank = grp[RANKING_FEATURES]

        p_dnf = dnf_model.predict_proba(X_dnf)[:, 1]
        exp_finish = rank_model.predict(X_rank)

        sim = monte_carlo(grp["driver"].tolist(), p_dnf, exp_finish,
                          n_sims=N_SIMS, seed=42)
        win_prob = {r["driver"]: r["win_prob"] for r in sim}
        exp_rank = {r["driver"]: r["expected_rank"] for r in sim}

        actual_winner = grp.loc[grp["finish_position"].idxmin(), "driver"]

        # Predicted order by expected rank.
        predicted_order = sorted(exp_rank, key=exp_rank.get)
        actual_order = grp.sort_values("finish_position")["driver"].tolist()

        winner_hit = int(max(win_prob, key=win_prob.get) == actual_winner)
        winner_brier = float(np.mean(
            [(win_prob[d] - int(d == actual_winner)) ** 2 for d in win_prob]
        ))
        rho, _ = spearmanr(
            [actual_order.index(d) for d in predicted_order],
            list(range(len(predicted_order))),
        )
        mae = float(np.mean(
            [abs(exp_rank[d] - grp.loc[grp["driver"] == d, "finish_position"].iloc[0])
             for d in grp["driver"]]
        ))

        race_rows.append({
            "season": yr, "round": rnd,
            "winner_hit": winner_hit,
            "winner_brier": winner_brier,
            "spearman": rho,
            "expected_mae": mae,
        })
    return pd.DataFrame(race_rows)


def main():
    df = pd.read_csv(DNF_FEATURES_CSV)
    df = df.dropna(subset=["finish_position"]).copy()

    print("=== ENGINE BACKTEST (walk-forward) ===")
    print(f"  {'year':<6}{'#races':>8}{'WinnerHit':>10}{'WinnerBrier':>13}"
          f"{'Spearman':>10}{'ExpMAE':>9}")
    print("  " + "-" * (6 + 8 + 10 + 13 + 10 + 9))
    all_rows = []
    for yr in TEST_YEARS:
        rr = eval_year(df, yr)
        all_rows.append(rr)
        print(f"  {yr:<6}{len(rr):>8}"
              f"{rr['winner_hit'].mean():>10.3f}"
              f"{rr['winner_brier'].mean():>13.4f}"
              f"{rr['spearman'].mean():>10.4f}"
              f"{rr['expected_mae'].mean():>9.2f}")
    full = pd.concat(all_rows)
    print("  " + "-" * (6 + 8 + 10 + 13 + 10 + 9))
    print(f"  {'ALL':<6}{len(full):>8}"
          f"{full['winner_hit'].mean():>10.3f}"
          f"{full['winner_brier'].mean():>13.4f}"
          f"{full['spearman'].mean():>10.4f}"
          f"{full['expected_mae'].mean():>9.2f}")

    # Chance baselines for context.
    n_avg = full["spearman"].notna().sum()
    print(f"\n  (context: random winner chance ~1/22 = 4.5%; "
          f"perfect Spearman = 1.0)")
    return full


if __name__ == "__main__":
    main()

def compare_recent_races(k=6):
    """Compare the engine's predicted finishing order vs ACTUAL results for the
    most recent `k` completed races (walk-forward: models trained only on data
    strictly before each hold-out race).

    Returns per-race predictions vs actual + aggregate accuracy metrics.
    """
    df = pd.read_csv(DNF_FEATURES_CSV)
    raw = pd.read_csv(RACE_RESULTS_CSV)

    races = df[["season", "round"]].drop_duplicates() \
        .sort_values(["season", "round"]).reset_index(drop=True)
    if len(races) < 2:
        raise RuntimeError("Not enough completed races to compare.")
    k = min(k, len(races) - 1)
    holdout = races.tail(k).reset_index(drop=True)

    # Train once on everything BEFORE the first hold-out race.
    first = holdout.iloc[0]
    train_df = df[((df["season"] < first["season"]) |
                   ((df["season"] == first["season"]) & (df["round"] < first["round"])))].copy()

    dnf = dnf_pipeline()
    dnf.fit(train_df[FEATURE_COLUMNS], train_df["dnf"].astype(int))
    r_tr = train_df.dropna(subset=["finish_position", "grid"])
    rank = ranking_pipeline()
    rank.fit(r_tr[RANKING_FEATURES], r_tr["finish_position"].astype(float))

    rows = []
    for _, rr in holdout.iterrows():
        s = int(rr["season"]); rnd = int(rr["round"])
        ctx = df[((df["season"] < s) | ((df["season"] == s) & (df["round"] < rnd)))]
        sub_raw = raw[(raw["season"] == s) & (raw["round"] == rnd)] \
            .sort_values("finish_position")

        placeholders = []
        for _, d in sub_raw.iterrows():
            placeholders.append({
                "season": s, "round": rnd, "race": d["race"], "date": d["date"],
                "circuit": d["circuit"], "driver": d["driver"],
                "driver_id": d["driver_id"], "constructor": d["constructor"],
                "grid": float(d["grid"]), "dnf": np.nan,
            })
        full = pd.concat([ctx, pd.DataFrame(placeholders)], ignore_index=True)
        feat = compute_features(full, raw)
        pr = feat[feat["dnf"].isna()].reset_index(drop=True)

        p_dnf = dnf.predict_proba(pr[FEATURE_COLUMNS])[:, 1]
        exp = rank.predict(pr[RANKING_FEATURES])
        sim = monte_carlo(pr["driver"].tolist(), p_dnf, exp, n_sims=N_SIMS)
        exp_rank = {x["driver"]: x["expected_rank"] for x in sim}

        predicted_order = sorted(exp_rank, key=exp_rank.get)
        actual_order = sub_raw["driver"].tolist()
        actual_winner = actual_order[0]
        predicted_winner = predicted_order[0]

        idx = [actual_order.index(d) for d in predicted_order if d in actual_order]
        if len(idx) >= 2:
            rho = float(spearmanr(idx, list(range(len(idx)))).statistic)
        else:
            rho = None

        finish_map = dict(zip(sub_raw["driver"], sub_raw["finish_position"]))
        mae = float(np.mean([abs(exp_rank[d] - finish_map[d])
                             for d in exp_rank if d in finish_map]))
        top3_overlap = len(set(predicted_order[:3]) & set(actual_order[:3])) / 3.0

        rows.append({
            "season": s, "round": rnd,
            "race": sub_raw["race"].iloc[0],
            "date": sub_raw["date"].iloc[0],
            "circuit": sub_raw["circuit"].iloc[0],
            "actual_winner": actual_winner,
            "predicted_winner": predicted_winner,
            "winner_hit": bool(actual_winner == predicted_winner),
            "spearman": rho,
            "top3_overlap": round(top3_overlap, 3),
            "expected_mae": round(mae, 2),
        })

    return {
        "k": k,
        "races": rows,
        "aggregate": {
            "winner_hit_rate": round(float(np.mean([r["winner_hit"] for r in rows])), 3),
            "spearman": round(float(np.nanmean(
                [r["spearman"] for r in rows if r["spearman"] is not None])), 4),
            "top3_overlap": round(float(np.mean([r["top3_overlap"] for r in rows])), 3),
            "expected_mae": round(float(np.mean([r["expected_mae"] for r in rows])), 2),
        },
    }
