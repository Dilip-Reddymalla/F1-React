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

from config import DNF_FEATURES_CSV  # noqa: E402
from src.features.build_features import FEATURE_COLUMNS, RANKING_FEATURES  # noqa: E402
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
