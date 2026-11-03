"""Ranking metrics.

Ranking is a within-race problem, so a model is judged on how well it
*orders the drivers inside each race*, not just on per-driver error.

Metrics returned per (season, round) race group:
    spearman     rank correlation between predicted and actual finishing order
    winner_hit   1 if the predicted winner is the actual winner, else 0
    top3_overlap |predicted top-3 ∩ actual top-3| / 3
"""
import numpy as np
import pandas as pd
from scipy.stats import spearmanr


def race_level_metrics(df_with_pred):
    """Compute ranking metrics for a DataFrame that already has a
    `pred_finish` column alongside the actual `finish_position`."""
    rows = []
    for (season, round_), grp in df_with_pred.groupby(["season", "round"]):
        if len(grp) < 2:
            continue
        actual = grp["finish_position"].astype(float).values
        pred = grp["pred_finish"].astype(float).values

        rho, _ = spearmanr(actual, pred)

        actual_top3 = set(grp.nsmallest(3, "finish_position").index)
        pred_top3 = set(grp.nsmallest(3, "pred_finish").index)

        winner_hit = int(grp.loc[grp["pred_finish"].idxmin(), "finish_position"]
                         == grp["finish_position"].min())
        top3_overlap = len(actual_top3 & pred_top3) / 3.0

        rows.append({
            "season": season, "round": round_,
            "n_drivers": len(grp),
            "spearman": float(rho),
            "winner_hit": winner_hit,
            "top3_overlap": top3_overlap,
        })
    return pd.DataFrame(rows)


def summarize_ranking(race_df):
    """Average ranking metrics across all races in a DataFrame."""
    if race_df.empty:
        return {"n_races": 0, "spearman": float("nan"),
                "winner_hit_rate": float("nan"), "top3_overlap": float("nan")}
    return {
        "n_races": int(len(race_df)),
        "spearman": float(race_df["spearman"].mean()),
        "winner_hit_rate": float(race_df["winner_hit"].mean()),
        "top3_overlap": float(race_df["top3_overlap"].mean()),
    }
