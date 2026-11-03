"""Central paths and constants for the F1 ML project.

Every module in this project imports from here so that file paths
are defined in exactly one place and scripts work regardless of the
directory they are launched from. This file lives at the project root
(f1-race-ml/config.py); BASE_DIR is that same root.
"""
from pathlib import Path

# Root of the ML project: f1-race-ml/ (this file's directory)
BASE_DIR = Path(__file__).resolve().parent

# ---- Data directories -------------------------------------------------
DATA_RAW = BASE_DIR / "data" / "raw"
DATA_PROCESSED = BASE_DIR / "data" / "processed"
MODELS_DIR = BASE_DIR / "models"
DNF_MODEL_DIR = MODELS_DIR / "dnf_model"
RANKING_MODEL_DIR = MODELS_DIR / "ranking_model"
QUALI_MODEL_DIR = MODELS_DIR / "quali_model"
PREDICTIONS_DIR = DATA_PROCESSED / "predictions"

# ---- Specific files ----------------------------------------------------
RACE_RESULTS_CSV = DATA_RAW / "race_results.csv"
DNF_DATASET_CSV = DATA_PROCESSED / "dnf_dataset.csv"
DNF_FEATURES_CSV = DATA_PROCESSED / "dnf_features.csv"

DNF_MODEL_FILE = DNF_MODEL_DIR / "logistic_regression.joblib"
DNF_MODEL_META = DNF_MODEL_DIR / "model_meta.json"

RANKING_MODEL_FILE = RANKING_MODEL_DIR / "ranking_model.joblib"
RANKING_MODEL_META = RANKING_MODEL_DIR / "model_meta.json"

QUALI_MODEL_FILE = QUALI_MODEL_DIR / "quali_model.joblib"
QUALI_MODEL_META = QUALI_MODEL_DIR / "model_meta.json"

PREDICTION_FILE = PREDICTIONS_DIR / "next_race.json"
PREDICTED_ORDER_FILE = PREDICTIONS_DIR / "next_race_order.json"
RACE_ENGINE_FILE = PREDICTIONS_DIR / "race_engine.json"

# Stamp recording which race's data the models were last trained through.
TRAIN_STAMP = MODELS_DIR / "train_stamp.json"

# How often (seconds) the API checks for a newly completed race to retrain.
# Override with env PREDICT_RETRAIN_POLL_SECONDS.
RETRAIN_POLL_SECONDS = 3600  # 1 hour

# ---- External API ------------------------------------------------------
JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"

# Ensure output directories exist.
for _d in (DATA_RAW, DATA_PROCESSED, MODELS_DIR, DNF_MODEL_DIR,
           RANKING_MODEL_DIR, QUALI_MODEL_DIR, PREDICTIONS_DIR):
    _d.mkdir(parents=True, exist_ok=True)
