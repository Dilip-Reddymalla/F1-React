"""Train the post-qualifying ranking model.

This is a SEPARATE model from the pre-qualifying ranking model. Once a race's
qualifying has happened, we know the grid and qualifying-derived signals. This
model consumes those and predicts the finishing order of *that* race.

Features = ranking features (24) + grid + qualifying-derived signals:
    field_size                             size of the grid for this race
    grid_normalized                        grid / field size
    driver_grid_overperformance            how much this driver out-qualified
                                           their own historical average grid
    constructor_grid_overperformance       same, for the constructor

Evaluation: same walk-forward scheme (2024/2025/2026), race-level Spearman,
winner hit-rate and top-3 overlap. Compare against the plain ranking baseline.
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

from config import DNF_FEATURES_CSV, QUALI_MODEL_FILE, QUALI_MODEL_META  # noqa: E402
from src.features.build_features import POST_QUALIFYING_FEATURES  # noqa: E402
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
    df = df.dropna(subset=["finish_position"]).copy()
    X = df[POST_QUALIFYING_FEATURES].copy()
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


def main():
    df, X, y = load_data()
    print(f"Post-qualifying data: {X.shape[0]} rows, {X.shape[1]} features\n")
    folds = walk_forward(df, X, y)
    means = {m: {k: float(np.mean([f[k] for f in fl])) for k in RANK_METRICS}
             for m, fl in folds.items()}

    print("=== WALK-FORWARD POST-QUALIFYING RANKING (2024/2025/2026) ===")
    print(f"  {'model':<21}{'Spearman':>10}{'WinnerHit':>13}{'Top3Overlap':>13}")
    print("  " + "-" * (21 + 10 + 13 + 13))
    for m in MODELS:
        print(f"  {m:<21}"
              f"{means[m]['spearman']:>10.4f}"
              f"{means[m]['winner_hit_rate']:>13.3f}"
              f"{means[m]['top3_overlap']:>13.3f}")
    print()
    print("  (plain pre-qualifying ranking baseline: Spearman ~0.685)")
    print()

    best = max(MODELS, key=lambda m: means[m]["spearman"])
    print(f"Best post-qualifying model (mean Spearman): {best}")

    final = make_candidate(best)
    final.fit(X, y)
    joblib.dump(final, QUALI_MODEL_FILE)

    interpretable = make_candidate(best)
    interpretable.fit(X, y)
    if hasattr(interpretable, "named_steps") and "reg" in interpretable.named_steps:
        reg = interpretable.named_steps["reg"]
        if hasattr(reg, "coef_"):
            importance = dict(zip(POST_QUALIFYING_FEATURES, np.abs(reg.coef_)))
        else:
            importance = dict(zip(POST_QUALIFYING_FEATURES, reg.feature_importances_))
    else:
        importance = dict(zip(POST_QUALIFYING_FEATURES, interpretable.feature_importances_))
    top = sorted(importance.items(), key=lambda kv: kv[1], reverse=True)

    meta = {
        "model": f"PostQualifyingRanking({best})",
        "features": POST_QUALIFYING_FEATURES,
        "feature_count": len(POST_QUALIFYING_FEATURES),
        "test_years": TEST_YEARS,
        "walk_forward": means,
        "best_by": "mean_spearman",
        "top_features": [{"feature": k, "importance": float(v)} for k, v in top[:12]],
    }
    QUALI_MODEL_META.write_text(json.dumps(meta, indent=2))

    print("\nTop 12 features by importance:")
    for k, v in top[:12]:
        print(f"    {k:<32} {v:.4f}")
    print(f"\nFinal post-qualifying model saved -> {QUALI_MODEL_FILE}")
    return best, means


if __name__ == "__main__":
    main()
