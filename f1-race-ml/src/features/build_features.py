"""Leakage-safe feature engineering for the DNF model (v2, rich features).

The single most important rule of this project: features for a race may
ONLY use information from races that happened BEFORE it. Every feature
below is computed with shift(1) so the current race never leaks into its
own features.

The same compute_features() builds BOTH the historical training data and
the feature rows for a future race, so definitions never diverge.

Feature groups (all driver / constructor / circuit-specific, historical):

  Driver reliability     recent / season / career DNF rate
  Driver performance     recent / season / career avg finish, points, podiums
  Constructor reliability recent / season / career DNF rate
  Constructor performance recent / season avg finish
  Circuit (track) history driver & constructor stats at that specific circuit
  Context                round, season
"""
import sys
from pathlib import Path


def _root():
    for p in Path(__file__).resolve().parents:
        if (p / "config.py").exists():
            return p
    raise RuntimeError("Could not locate project root")


ROOT = _root()
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from config import DNF_DATASET_CSV, RACE_RESULTS_CSV, DNF_FEATURES_CSV  # noqa: E402

# ---------------------------------------------------------------------------
# Feature groups
# ---------------------------------------------------------------------------
DRIVER_RELIABILITY = [
    "driver_recent_dnf_rate",
    "driver_season_dnf_rate",
    "driver_career_dnf_rate",
    "driver_career_race_count",   # experience (rookie vs veteran)
    "driver_recent_race_count",    # races in the last window
]

DRIVER_PERFORMANCE = [
    "driver_recent_avg_finish",
    "driver_season_avg_finish",
    "driver_career_avg_finish",
    "driver_season_points",
    "driver_recent_podium_rate",
]

CONSTRUCTOR_RELIABILITY = [
    "constructor_recent_dnf_rate",
    "constructor_season_dnf_rate",
    "constructor_career_dnf_rate",
]

CONSTRUCTOR_PERFORMANCE = [
    "constructor_recent_avg_finish",
    "constructor_season_avg_finish",
]

TRACK_DRIVER = [
    "driver_track_dnf_rate",
    "driver_track_avg_finish",
    "driver_track_race_count",
]

TRACK_CONSTRUCTOR = [
    "constructor_track_dnf_rate",
    "constructor_track_avg_finish",
    "constructor_track_race_count",
]

CONTEXT = [
    "round",
    "season",
    "circuit_historical_dnf_rate",  # how dangerous this circuit tends to be
]

FEATURE_COLUMNS = (
    DRIVER_RELIABILITY
    + DRIVER_PERFORMANCE
    + CONSTRUCTOR_RELIABILITY
    + CONSTRUCTOR_PERFORMANCE
    + TRACK_DRIVER
    + TRACK_CONSTRUCTOR
    + CONTEXT
)

# Ranking uses the same features + grid position (known after qualifying).
RANKING_FEATURES = FEATURE_COLUMNS + ["grid"]

# Post-qualifying model: ranking features + qualifying-derived signals.
# These encode *that race's* qualifying result (grid), normalized and relative
# to how the driver/constructor usually qualifies.
QUALI_FEATURES = [
    "field_size",
    "grid_normalized",
    "driver_grid_overperformance",
    "constructor_grid_overperformance",
]
POST_QUALIFYING_FEATURES = RANKING_FEATURES + QUALI_FEATURES


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _recent(series, window=3):
    """Mean over the previous `window` races (current race excluded)."""
    return series.shift(1).rolling(window, min_periods=1).mean()


def _season_expanding(series):
    """Cumulative mean within the current season (current race excluded)."""
    return series.shift(1).expanding(min_periods=1).mean()


def _career_expanding(series):
    """Cumulative mean over the driver's whole career (current race excluded)."""
    return series.shift(1).expanding(min_periods=1).mean()


# ---------------------------------------------------------------------------
# Main feature computation
# ---------------------------------------------------------------------------
def compute_features(dataset_df, raw_df):
    """Add all DNF features to a race-level dataset.

    Parameters
    ----------
    dataset_df : pd.DataFrame
        Rows of (season, round, race, date, circuit, driver, driver_id,
        constructor, grid, dnf). dnf is NaN for future races.
    raw_df : pd.DataFrame
        Raw race results (provides finish_position and points).
    """
    df = dataset_df.copy()

    # Merge raw per-race numbers not present in the DNF dataset.
    for col in ("finish_position", "points"):
        if col in df.columns:
            df = df.drop(columns=[col])
    merge_cols = [c for c in ("season", "round", "driver_id", "finish_position", "points")
                  if c in raw_df.columns]
    df = df.merge(raw_df[merge_cols], on=["season", "round", "driver_id"], how="left")

    # Sort chronologically per driver so shift/rolling are time-ordered.
    df = df.sort_values(["driver_id", "season", "round"]).reset_index(drop=True)

    g_driver = df.groupby("driver_id")
    g_season = df.groupby(["driver_id", "season"])
    g_constructor = df.groupby("constructor")
    g_con_season = df.groupby(["constructor", "season"])
    g_track_driver = df.groupby(["driver_id", "circuit"])
    g_track_con = df.groupby(["constructor", "circuit"])
    g_circuit = df.groupby("circuit")

    # ---- Derived target helpers ------------------------------------------
    completed_finish = df["finish_position"].where(df["dnf"] == 0)
    podium = ((df["finish_position"] <= 3) & (df["dnf"] == 0)).astype(float)

    # ---- Driver reliability -----------------------------------------------
    df["driver_recent_dnf_rate"] = g_driver["dnf"].transform(_recent)
    df["driver_season_dnf_rate"] = g_season["dnf"].transform(_season_expanding)
    df["driver_career_dnf_rate"] = g_driver["dnf"].transform(_career_expanding)
    df["driver_career_race_count"] = (
        g_driver["dnf"].transform(lambda x: x.shift(1).expanding(min_periods=1).count())
    )
    df["driver_recent_race_count"] = (
        g_driver["dnf"].transform(lambda x: x.shift(1).rolling(3, min_periods=1).count())
    )

    # ---- Driver performance -----------------------------------------------
    df["driver_recent_avg_finish"] = (
        completed_finish.groupby(df["driver_id"]).transform(_recent)
    )
    df["driver_season_avg_finish"] = (
        completed_finish.groupby(df["driver_id"]).transform(_season_expanding)
    )
    df["driver_career_avg_finish"] = (
        completed_finish.groupby(df["driver_id"]).transform(_career_expanding)
    )
    df["driver_season_points"] = (
        g_season["points"].transform(lambda x: x.shift(1).expanding(min_periods=1).sum())
    )
    df["driver_recent_podium_rate"] = (
        podium.groupby(df["driver_id"]).transform(_recent)
    )

    # ---- Constructor reliability ------------------------------------------
    df["constructor_recent_dnf_rate"] = g_constructor["dnf"].transform(_recent)
    df["constructor_season_dnf_rate"] = g_con_season["dnf"].transform(_season_expanding)
    df["constructor_career_dnf_rate"] = g_constructor["dnf"].transform(_career_expanding)

    # ---- Constructor performance ------------------------------------------
    df["constructor_recent_avg_finish"] = (
        completed_finish.groupby(df["constructor"]).transform(_recent)
    )
    df["constructor_season_avg_finish"] = (
        completed_finish.groupby(df["constructor"]).transform(_season_expanding)
    )

    # ---- Circuit-track history (driver) ------------------------------------
    df["driver_track_dnf_rate"] = g_track_driver["dnf"].transform(_career_expanding)
    df["driver_track_avg_finish"] = (
        completed_finish.groupby([df["driver_id"], df["circuit"]])
        .transform(_career_expanding)
    )
    df["driver_track_race_count"] = _track_count(g_track_driver, df)

    # ---- Circuit-track history (constructor) -------------------------------
    df["constructor_track_dnf_rate"] = g_track_con["dnf"].transform(_career_expanding)
    df["constructor_track_avg_finish"] = (
        completed_finish.groupby([df["constructor"], df["circuit"]])
        .transform(_career_expanding)
    )
    df["constructor_track_race_count"] = _track_count(g_track_con, df)

    # ---- Circuit context ----------------------------------------------------
    # How dangerous this track historically is: expanding DNF rate across ALL
    # cars at this circuit, computed only from races before the current one.
    df["circuit_historical_dnf_rate"] = g_circuit["dnf"].transform(_career_expanding)

    # ---- Qualifying-derived features (post-qualifying stage) --------------
    # grid is the qualifying result of THIS race. We encode it directly,
    # normalized by field size, and relative to the driver's/constructor's
    # usual grid (all from history, so leakage-safe).
    field_size = df.groupby(["season", "round"])["driver_id"].transform("size")
    df["field_size"] = field_size.astype(float)
    df["grid_normalized"] = df["grid"] / field_size

    driver_avg_grid = g_driver["grid"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    constructor_avg_grid = g_constructor["grid"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    df["driver_grid_overperformance"] = driver_avg_grid - df["grid"]
    df["constructor_grid_overperformance"] = constructor_avg_grid - df["grid"]

    return df


def _track_count(grouped, df):
    """Cumulative number of previous appearances of each group at a circuit."""
    count = grouped.cumcount()          # aligned to sorted df order
    count.name = "_track_count"
    return count.reindex(df.index).fillna(0).astype(float)


def build_feature_file():
    """Rebuild dnf_features.csv from the current DNF dataset."""
    ds = pd.read_csv(DNF_DATASET_CSV)
    raw = pd.read_csv(RACE_RESULTS_CSV)
    feat = compute_features(ds, raw)
    feat.to_csv(DNF_FEATURES_CSV, index=False)
    return feat


if __name__ == "__main__":
    f = build_feature_file()
    print("\nFeature dataset rebuilt.")
    print(f"Shape: {f.shape}")
    print(f"Saved to: {DNF_FEATURES_CSV}\n")
    print("Feature columns:", len(FEATURE_COLUMNS))
    print(FEATURE_COLUMNS)
    show = ["season", "round", "driver", "dnf"] + FEATURE_COLUMNS
    print("\nLast rows (2026 season):")
    print(f[f["season"] == 2026].tail(6)[show].to_string())
