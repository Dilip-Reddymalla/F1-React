"""Probability evaluation metrics for the DNF model.

Accuracy alone is a terrible metric here because ~85% of drivers finish.
A model that always predicts "Finish" gets 85% accuracy but is useless.

These metrics judge the *quality of the probabilities*:
- Log loss          -> penalises confident mistakes
- Brier score       -> mean squared error between probability and outcome
- ROC-AUC           -> how well the model ranks DNFs above non-DNFs
- Precision/Recall  -> how good the model is at actually spotting DNFs
- Calibration (ECE) -> when the model says 20%, does ~20% really DNF?
"""
import numpy as np
from sklearn.metrics import log_loss, roc_auc_score, precision_recall_fscore_support


def brier_score(y_true, y_prob):
    """Mean squared error between predicted probabilities and outcomes."""
    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.clip(np.asarray(y_prob, dtype=float), 0.0, 1.0)
    return float(np.mean((y_prob - y_true) ** 2))


def expected_calibration_error(y_true, y_prob, n_bins=10):
    """Expected Calibration Error (ECE).

    Bins the predicted probabilities and measures how far the mean
    predicted probability in each bin is from the actual outcome rate.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_prob = np.asarray(y_prob, dtype=float)
    n = len(y_true)
    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        lo, hi = bin_edges[i], bin_edges[i + 1]
        inside = (y_prob >= lo) & (y_prob < hi)
        if i == n_bins - 1:
            inside |= y_prob == 1.0
        if inside.sum() == 0:
            continue
        acc = y_true[inside].mean()
        conf = y_prob[inside].mean()
        ece += (inside.sum() / n) * abs(acc - conf)
    return float(ece)


def evaluate_binary(y_true, y_prob):
    """Return a dict of all the binary metrics for a probability vector."""
    y_true = np.asarray(y_true)
    y_prob = np.clip(np.asarray(y_prob, dtype=float), 1e-6, 1.0 - 1e-6)
    pred = (y_prob >= 0.5).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, pred, average="binary", pos_label=1, zero_division=0
    )
    return {
        "n": int(len(y_true)),
        "positive_rate": float(y_true.mean()),
        "log_loss": float(log_loss(y_true, y_prob)),
        "brier_score": brier_score(y_true, y_prob),
        "roc_auc": float(roc_auc_score(y_true, y_prob)),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "expected_calibration_error": expected_calibration_error(y_true, y_prob),
    }
