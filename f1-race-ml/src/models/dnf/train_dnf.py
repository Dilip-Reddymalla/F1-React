"""Train and compare DNF models (v2: rich features, model ladder, calibration).

Evaluation strategy — walk-forward temporal validation. Instead of a single
fixed test year, we repeatedly train on the past and test on the next unseen
season. This mimics the real deployment: "train on the past, predict the future".

    test 2024 : train on 2018-2023
    test 2025 : train on 2018-2024
    test 2026 : train on 2018-2025

Models compared (the learning ladder):
    logistic_regression  -> linear baseline (coefficients, easy to read)
    random_forest         -> bagging ensemble
    gradient_boosting     -> boosted trees (HistGradientBoosting)

The best model (by mean ROC-AUC) is then *calibrated* with isotonic
regression so its probabilities are trustworthy, and retrained on ALL
available data (everything before the upcoming race) for deployment.
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

from config import DNF_FEATURES_CSV, DNF_MODEL_FILE, DNF_MODEL_META  # noqa: E402
from src.evaluation.metrics import evaluate_binary  # noqa: E402
from src.features.build_features import FEATURE_COLUMNS  # noqa: E402

from sklearn.impute import SimpleImputer  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.calibration import CalibratedClassifierCV  # noqa: E402

TEST_YEARS = [2024, 2025, 2026]

MODELS = ["logistic_regression", "random_forest", "gradient_boosting"]

METRICS = ["log_loss", "brier_score", "roc_auc", "precision", "recall", "f1",
           "expected_calibration_error"]


def make_candidate(name):
    """Return an unfitted estimator for a model family.

    Note: we intentionally use DEFAULT class weights (true prevalence).
    Heavily rebalancing (class_weight='balanced') inflates the predicted
    probabilities, which destroys log-loss / Brier / calibration — the
    metrics that matter here. Ranking (AUC) is unaffected by the weighting,
    so balanced weights buy nothing useful for this task.
    """
    if name == "logistic_regression":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=3000, random_state=42)),
        ])
    if name == "random_forest":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("clf", RandomForestClassifier(n_estimators=500, min_samples_leaf=5,
                                           random_state=42, n_jobs=-1)),
        ])
    if name == "gradient_boosting":
        # Handles NaN natively, no imputer/scaler needed.
        return HistGradientBoostingClassifier(
            max_iter=400, learning_rate=0.04, max_depth=5,
            min_samples_leaf=50, l2_regularization=1.0,
            random_state=42,
        )
    raise ValueError(f"Unknown model: {name}")


def load_data():
    df = pd.read_csv(DNF_FEATURES_CSV)
    X = df[FEATURE_COLUMNS].copy()
    y = df["dnf"].astype(int).copy()
    return df, X, y


def print_row(name, means):
    print(f"  {name:<22}" + "".join(f"{means[m]:>9.4f}" for m in METRICS))


def walk_forward(df, X, y):
    """Temporal walk-forward evaluation of the *calibrated* models.

    Each fold fits a CalibratedClassifierCV (isotonic) on the past and
    evaluates on the next unseen season. This reflects what actually ships.
    """
    season = df["season"]
    folds = {m: [] for m in MODELS}
    baseline = []
    for yr in TEST_YEARS:
        tr = (season < yr).values
        te = (season == yr).values

        base_p = float(y[tr].mean())
        baseline.append(evaluate_binary(y[te].values, np.full(int(te.sum()), base_p)))

        for m in MODELS:
            est = CalibratedClassifierCV(
                make_candidate(m), method="isotonic", cv=3
            )
            est.fit(X[tr], y[tr])
            proba = est.predict_proba(X[te])[:, 1]
            folds[m].append(evaluate_binary(y[te].values, proba))
    return folds, baseline


def aggregate(folds):
    return {m: {metric: float(np.mean([f[metric] for f in fl]))
                for metric in METRICS}
            for m, fl in folds.items()}


def main():
    df, X, y = load_data()
    print(f"Data: {X.shape[0]} races, {X.shape[1]} features\n")

    folds, baseline = walk_forward(df, X, y)
    means = aggregate(folds)

    print("=== WALK-FORWARD EVALUATION (test years 2024 / 2025 / 2026) ===")
    print(f"  {'model':<22}" + "".join(f"{m:>9}" for m in METRICS))
    print("  " + "-" * (22 + 9 * len(METRICS)))
    print_row("baseline_majority",
              {m: float(np.mean([f[m] for f in baseline])) for m in METRICS})
    for m in MODELS:
        print_row(m, means[m])
    print()

    # Per-year AUC table for insight.
    print("ROC-AUC per test season:")
    header = f"  {'model':<22}" + "".join(f"{yr:>10}" for yr in TEST_YEARS)
    print(header)
    print("  " + "-" * (22 + 10 * len(TEST_YEARS)))
    for m in MODELS:
        row = f"  {m:<22}" + "".join(f"{f['roc_auc']:>10.4f}" for f in folds[m])
        print(row)
    print()

    # Choose best model by mean ROC-AUC.
    best = max(MODELS, key=lambda m: means[m]["roc_auc"])
    print(f"Best model (mean ROC-AUC): {best}")

    # ---- Final deployment model: calibrated best, trained on ALL data ------
    final = CalibratedClassifierCV(
        make_candidate(best), method="isotonic", cv=5
    )
    final.fit(X, y)
    joblib.dump(final, DNF_MODEL_FILE)

    # Feature importance / coefficients for interpretation.
    interpretable = make_candidate(best)
    interpretable.fit(X, y)
    if hasattr(interpretable, "named_steps") and "clf" in interpretable.named_steps:
        clf = interpretable.named_steps["clf"]
        if hasattr(clf, "coef_"):
            importance = dict(zip(FEATURE_COLUMNS, np.abs(clf.coef_[0])))
        else:
            importance = dict(zip(FEATURE_COLUMNS, clf.feature_importances_))
    else:
        importance = dict(zip(FEATURE_COLUMNS, interpretable.feature_importances_))
    top_features = sorted(importance.items(), key=lambda kv: kv[1], reverse=True)

    meta = {
        "model": f"Calibrated({best}) + isotonic",
        "base_model": best,
        "features": FEATURE_COLUMNS,
        "feature_count": len(FEATURE_COLUMNS),
        "test_years": TEST_YEARS,
        "walk_forward": means,
        "best_by": "mean_roc_auc",
        "top_features": [{"feature": k, "importance": float(v)} for k, v in top_features[:10]],
    }
    DNF_MODEL_META.write_text(json.dumps(meta, indent=2))

    print("\nTop 10 features by importance:")
    for k, v in top_features[:10]:
        print(f"    {k:<32} {v:.4f}")

    print(f"\nFinal calibrated model saved -> {DNF_MODEL_FILE}")
    print(f"Metadata saved -> {DNF_MODEL_META}")
    return best, means


if __name__ == "__main__":
    main()
