# F1 Race Prediction ML — Pipeline (DNF + Ranking + Monte Carlo Engine)

A learning-first Formula 1 machine learning system, kept separate from the React
website (`../`), built one concept at a time.

Implemented end-to-end pipeline:

```text
                    F1 DATA  (cron fetch, Jolpica API)
                       │
                       ▼
            FEATURE ENGINE (shared, leakage-safe) ──► dnf_features.csv
                       │                            (24 features + quali signals)
          ┌────────────┴────────────┐
          ▼                         ▼
     DNF MODEL                 RANKING MODEL
     (LR|RF|GB,                (LinReg|RF|GB,
      calibrated RF)             LinearRegression best)
          │                         │
          ▼                         ▼
     P(DNF) per driver          Expected position / strength
          │                         │
          └────────────┬────────────┘
                       ▼
                RACE ENGINE (Monte Carlo, 10k sims)
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
       Position Distribution   Winner Probability
                       │
                       ▼
        EVALUATION GATE (walk-forward backtest)
                       │
                       ▼
                    API → React
```

A separate **post-qualifying model** (`quali_model`) consumes a race's real
grid (qualifying result) to sharpen the ranking once qualifying has happened.

---

## The five models / stages

| Stage | Script | Output |
| ----- | ------ | ------ |
| 1. DNF probability | `src/models/dnf/` | P(DNF), P(Finish) per driver |
| 2. Pre-qualifying ranking | `src/models/ranking/` | expected finishing order (grid imputed) |
| 3. Post-qualifying ranking | `src/models/quali/` | order using real grid + quali overperformance |
| 4. Race engine | `src/simulation/race_simulator.py` | P1–P20 distribution, win prob, expected ranks |
| 5. Evaluation gate | `src/evaluation/engine_eval.py` | walk-forward backtest of the whole engine |

## Running the site with live predictions

The React page loads **live** predictions from the FastAPI via a Vite dev proxy
(same-origin, no CORS).

```bash
npm run dev     # ONE command: provisions Python/venv/requirements, then starts
                # the ML API (:8000) AND Vite (:5173) together.
# open http://localhost:5173/predictions
```

`npm run dev` (`scripts/dev.mjs`) is the single entry point. It:
1. Checks for Python (3.10+); if missing, tries to install it
   (winget / brew / apt-get).
2. Creates the `.venv` if needed.
3. Installs `requirements.txt` if missing or changed (tracked by a hash stamp).
4. Starts the FastAPI and Vite together, and stops both on Ctrl-C.

Convenience aliases: `npm run dev:web` (Vite only), `npm run dev:api`
(ML API only). If the ML API is not running, the page automatically falls back
to the committed static snapshot (`public/predictions/race_engine.json`) and
shows a "Static snapshot" badge with a hint.

---

## Commands

All run from `f1-race-ml/` with `./.venv/Scripts/python.exe`:

```bash
# Data & features
./.venv/Scripts/python.exe src/data/fetch_latest.py            # refresh + rebuild
./.venv/Scripts/python.exe src/features/build_features.py      # rebuild features only

# Train each model (walk-forward evaluation, saves best)
./.venv/Scripts/python.exe src/models/dnf/train_dnf.py
./.venv/Scripts/python.exe src/models/ranking/train_ranking.py
./.venv/Scripts/python.exe src/models/quali/train_quali.py

# Automatic retraining after each race (fetch new data + refit all models)
./.venv/Scripts/python.exe src/models/retrain.py --fetch
./.venv/Scripts/python.exe src/models/retrain.py              # refit current data only

# Predictions
./.venv/Scripts/python.exe src/models/ranking/predict_ranking.py   # engine: next race
./.venv/Scripts/python.exe src/models/quali/predict_quali.py       # post-quali (Mexico City demo)

# Pipeline backtest (the evaluation gate)
./.venv/Scripts/python.exe src/evaluation/engine_eval.py

# API -> http://127.0.0.1:8000/docs
./.venv/Scripts/python.exe src/api/main.py
```

### API endpoints

```
GET  /health
GET  /next-race
POST /refresh                # download newest data (+ retrain if a race completed)
POST /retrain                # force refit all models (optional fetch)
POST /predict                # DNF probabilities for next race
POST /predict/engine         # full race engine (distribution + winner) for next race
POST /predict/quali          # post-qualifying ranking (default: latest completed race)
```

### Auto-retraining after each race

A background scheduler in the API (default interval 1 hour, configurable via
`PREDICT_RETRAIN_POLL_SECONDS`) checks whether a race completed after the last
training run (using `models/train_stamp.json`). If so, it fetches the new
results, rebuilds the datasets/features, refits all three deployment models
(DNF, ranking, post-qualifying) on the full data, and updates the stamp. The
engine cache is invalidated so the next prediction uses the fresh models.

Retraining is **offline** — it never runs during a user request, so inference
stays fast.

---

## Results (honest, walk-forward)

### DNF (test 2024/2025/2026, calibrated)
- ROC-AUC ≈ 0.55 — close to the realistic ceiling (DNF is chaotic).
- Calibration is the win here: ECE ≈ 0.05 (when it says 20%, ~20% really DNF).

### Ranking (test 2024/2025/2026)
- Pre-qualifying: Spearman ≈ **0.685**, winner hit ~39%.
- Post-qualifying (with real grid): Spearman ≈ **0.687**, winner hit ~42%; on the
  Mexico City demo, Spearman vs actual = **0.80**.

### Engine backtest (whole pipeline, test 2024/2025/2026)
```
year     #races  WinnerHit  WinnerBrier  Spearman  ExpMAE
2024     24      0.375     0.0438       0.7295    2.94
2025     24      0.375     0.0322       0.6419    3.34
2026     19      0.368     0.0337       0.6759    3.48
ALL      67      0.373     0.0368       0.6829    3.24
```
Context: random winner chance for a 22-car field is ~4.5%; perfect Spearman = 1.0.
Winner Brier ≈ 0.037 means the simulated win probabilities are well-calibrated.

---

## Leakage rules (still the #1 rule)

Every feature uses only races **before** the one being predicted (`shift(1)`).
The grid/quali signals used by the post-qualifying model are legitimate because
grid is known *before* the race (after qualifying) — but never the result itself.

---

## Next steps (from the blueprint)

1. **Learning-to-Rank** (LightGBM LambdaRank) as an advanced comparison to the
   regression ranking baseline — through the same evaluation gate.
2. **Real qualifying time gaps** (Q1/Q2/Q3, gap to pole) instead of grid-derived
   proxies (the API already exposes them; needs a one-time fetch).
3. Integrate the engine output into the React site (charts/table of P1–P20).
4. Periodic retraining + model versioning/monitoring.
