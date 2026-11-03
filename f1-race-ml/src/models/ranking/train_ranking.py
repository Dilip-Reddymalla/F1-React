"""Train the Ranking model: predict finishing position, then rank per race.

This is the second big ML problem after DNF. We predict a numeric expected
finishing position per driver (regression), then ORDER drivers within each
race by that prediction.

Why regression-then-rank (for now)?

* It is the honest baseline the blueprint calls for before jumping to
  Learning-to-Rank (LightGBM LambdaRank). Regression gives us a first,
  interpretable model that already produces a valid finishing order.
* The same walk-forward evaluation tells us how much ranking signal the
  features actually carry.

Features: the 24 DNF features + `grid` (grid is known before the race, after
qualifying, and is one of the strongest predictors of finishing position).

Evaluation: race-level Spearman correlation, winner hit-rate and top-3
overlap, averaged over walk-forward test seasons 2024 / 2025 / 2026.
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

from config import DNF_FEATURES_CSV, RANKING_MODEL_FILE, RANKING_MODEL_META  # noqa: E402
from src.features.build_features import RANKING_FEATURES  # noqa: E402
from src.evaluation.ranking_metrics import race_level_metrics, summarize_ranking  # noqa: E402

from sklearn.linear_model import LinearRegression  # noqa: E402
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.impute import SimpleImputer  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

TEST_YEARS = [2024, 2025, 2026]

MODELS = ["linear_regression", "random_forest", "gradient_boosting"]

RANK_METRICS = ["spearman", "winner_hit_rate", "top3_overlap", "n_races"]


def make_candidate(name):
    if name == "linear_regression":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("reg", LinearRegression()),
        ])
    if name == "random_forest":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("reg", RandomForestRegressor(
                n_estimators=500, min_samples_leaf=5,
                random_state=42, n_jobs=-1)),
        ])
    if name == "gradient_boosting":
        return HistGradientBoostingRegressor(
            max_iter=400, learning_rate=0.05, max_depth=5,
            min_samples_leaf=50, random_state=42,
        )
    raise ValueError(f"Unknown model: {name}")


def load_data():
    df = pd.read_csv(DNF_FEATURES_CSV)
    df = df.dropna(subset=["finish_position", "grid"]).copy()
    X = df[RANKING_FEATURES].copy()
    y = df["finish_position"].astype(float).copy()
    return df, X, y


def walk_forward(df, X, y):
    season = df["season"]
    folds = {m: [] for m in MODELS}
    for yr in TEST_YEARS:
        tr = (season < yr).values
        te = (season == yr).values
        test_df = df[te].copy()
        for m in MODELS:
            est = make_candidate(m)
            est.fit(X[tr], y[tr])
            test_df["pred_finish"] = est.predict(X[te])
            race_metrics = race_level_metrics(test_df)
            folds[m].append(summarize_ranking(race_metrics))
    return folds


def print_unit(m):
    return f"{m['spearman']:>9.4f}{m['winner_hit_rate']:>13.3f}" \
           f"{m['top3_overlap']:>13.3f}{int(m['n_races']):>10}"


def main():
    df, X, y = load_data()
    print(f"Ranking data: {X.shape[0]} driver-race rows, {X.shape[1]} features\n")

    folds = walk_forward(df, X, y)

    # Average each metric across folds.
    means = {m: {k: float(np.mean([f[k] for f in fl])) for k in RANK_METRICS}
             for m, fl in folds.items()}

    print("=== WALK-FORWARD RANKING (test years 2024 / 2025 / 2026) ===")
    print(f"  {'model':<21}{'Spearman':>10}{'WinnerHit':>13}{'Top3Overlap':>13}{'#Races':>10}")
    print("  " + "-" * (21 + 10 + 13 + 13 + 10))
    for m in MODELS:
        print(f"  {m:<21}" + print_unit(means[m]))
    print()

    # Per-year Spearman table.
    print("Spearman per test season:")
    print(f"  {'model':<21}" + "".join(f"{yr:>10}" for yr in TEST_YEARS))
    print("  " + "-" * (21 + 10 * len(TEST_YEARS)))
    for m in MODELS:
        row = f"  {m:<21}" + "".join(f"{f['spearman']:>10.4f}" for f in folds[m])
        print(row)
    print()

    best = max(MODELS, key=lambda m: means[m]["spearman"])
    print(f"Best ranking model (mean Spearman): {best}")

    # ---- Final model: fit on ALL data, save -------------------------------
    final = make_candidate(best)
    final.fit(X, y)
    joblib.dump(final, RANKING_MODEL_FILE)

    # Feature importance / coefficients.
    interpretable = make_candidate(best)
    interpretable.fit(X, y)
    if hasattr(interpretable, "named_steps") and "reg" in interpretable.named_steps:
        reg = interpretable.named_steps["reg"]
        if hasattr(reg, "coef_"):
            importance = dict(zip(RANKING_FEATURES, np.abs(reg.coef_)))
        else:
            importance = dict(zip(RANKING_FEATURES, reg.feature_importances_))
    else:
        importance = dict(zip(RANKING_FEATURES, interpretable.feature_importances_))
    top = sorted(importance.items(), key=lambda kv: kv[1], reverse=True)

    meta = {
        "model": f"Ranking({best})",
        "target": "finish_position (regression, then rank per race)",
        "features": RANKING_FEATURES,
        "feature_count": len(RANKING_FEATURES),
        "test_years": TEST_YEARS,
        "walk_forward": means,
        "best_by": "mean_spearman",
        "top_features": [{"feature": k, "importance": float(v)} for k, v in top[:12]],
    }
    RANKING_MODEL_META.write_text(json.dumps(meta, indent=2))

    print("\nTop 12 features by importance:")
    for k, v in top[:12]:
        print(f"    {k:<32} {v:.4f}")
    print(f"\nFinal ranking model saved -> {RANKING_MODEL_FILE}")
    return best, means


if __name__ == "__main__":
    main()
