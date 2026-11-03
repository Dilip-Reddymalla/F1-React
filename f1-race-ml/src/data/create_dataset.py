"""Build the DNF training dataset from raw race results.

Turns raw F1 status strings into a clean binary target:

    dnf = 0  -> finished the race (or lapped/classified)
    dnf = 1  -> did not finish (DNF)

Exposed as build_dnf_dataset() so other scripts (real-time fetch,
prediction) can rebuild the same dataset programmatically.
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

import pandas as pd  # noqa: E402
from config import RACE_RESULTS_CSV, DNF_DATASET_CSV  # noqa: E402

# A driver "finished" if they completed the race, even if lapped/classified.
FINISH_STATUS = r"^(Finished|Lapped|\+\d+ Laps?)$"


def build_dnf_dataset():
    """Read raw results and write dnf_dataset.csv. Returns the dataset."""
    df = pd.read_csv(RACE_RESULTS_CSV)
    finished = df["status"].str.match(FINISH_STATUS)
    df["dnf"] = (~finished).astype(int)

    cols = [
        "season", "round", "race", "date", "circuit",
        "driver", "driver_id", "constructor", "grid", "dnf",
    ]
    dataset = df[cols]
    dataset.to_csv(DNF_DATASET_CSV, index=False)
    return dataset


if __name__ == "__main__":
    ds = build_dnf_dataset()
    print("Dataset created.")
    print("Shape:", ds.shape)
    print("\nTarget distribution:")
    print(ds["dnf"].value_counts())
    print("\nTarget percentage:")
    print(ds["dnf"].value_counts(normalize=True) * 100)
