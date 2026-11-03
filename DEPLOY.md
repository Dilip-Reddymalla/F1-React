# Deployment — F1 Race Predictions

The app is **two services**, hosted separately:

| Service | Technology | Host |
| ------- | ---------- | ---- |
| React website (predictions page) | Vite / React | **Vercel** (serverless static) |
| ML FastAPI (predictions engine) | Python / FastAPI | **Render / Railway / Fly.io** (process host) |

> Vercel cannot run the Python service — its Build/Install commands only build the
> static site, and it never keeps a long-running process alive.

---

## 1. Deploy the React site to Vercel (unchanged)

These are already configured in `vercel.json`:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** (default — `npm install`)

Steps:
1. Push the repo to GitHub; import it into Vercel.
2. Add the API URL env var (Vercel → Project → Settings → Environment Variables):
   - `VITE_PREDICTION_API = https://<your-api-host>.onrender.com`
   - (The frontend reads this at build time; without it, it falls back to the static snapshot.)
3. Redeploy.

The predictions page automatically uses the live API when reachable, and falls back
to the committed snapshot (`public/predictions/race_engine.json`) otherwise.

---

## 2. Deploy the ML API to Render

1. Ensure `f1-race-ml/` is in a GitHub repo (its own repo, or a folder of this one).
2. Render → **New → Web Service** → connect that repo/folder.
3. Settings:
   - **Runtime:** Python 3 (Render installs `requirements.txt` automatically).
   - **Start command:** `uvicorn src.api.main:app --host 0.0.0.0 --port $PORT`
     (this is also in the committed `Procfile`, which Render honours).
   - **Environment:** `PREDICT_ALLOW_ORIGINS = https://<your-vercel-app>.vercel.app`
     (comma-separated if multiple origins; the local dev origins are always allowed).
4. **Bootstrap the models (one-time).** The trained model files are *not* committed
   (the DNF model is ~80 MB). Generate them once:
   - Render → your service → **Shell**, then run:
     ```bash
     python src/models/retrain.py --fetch
     ```
   - This downloads results from the Jolpica API and trains all models.
   - Alternative: leave it to the API — on first boot, if models are missing, the
     background scheduler fetches and trains automatically (so the first requests
     may return `503` with guidance until training finishes; after that it's fast).

---

## 3. Verify

- API: `GET https://<your-api-host>.onrender.com/health` → `{"status":"ok", ..., "models_ready": true}`.
- Site: open the predictions page → it shows the **Live model** badge (green).
  If it shows **Static snapshot**, the API URL env var is missing or the API is
  unreachable (check CORS: the API must allow your Vercel origin).

---

## Model retraining after each race

The API includes a background scheduler that detects newly completed races and
retrains automatically (configurable interval via `PREDICT_RETRAIN_POLL_SECONDS`,
default 1 hour). No manual step is needed once deployed.

---

## Common pitfalls

- **CORS blocked:** the API must allow the exact Vercel origin in
  `PREDICT_ALLOW_ORIGINS` (no trailing slash).
- **Still showing snapshot:** the `VITE_PREDICTION_API` env var must be set *before*
  the Vercel build (it is baked into the frontend bundle).
- **Slow first load:** the first `/predict/engine` call after boot is slow (model
  load + 10k simulations); the API caches the result per race, so subsequent calls
  are fast.
