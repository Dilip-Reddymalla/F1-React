/**
 * API Endpoint: /api/predictions
 *
 * Serves completed F1 predictions from MongoDB (fast path) so the frontend
 * does NOT have to wait on the heavy Python Monte Carlo engine every time.
 *
 * Usage:
 *   GET /api/predictions?season=2026&round=21&stage=post-qualifying%20(real%20grid)
 *
 * Freshness: a record is considered fresh when its `data_round` equals the
 * latest completed F1 round. If the record is missing or stale, this returns
 * 404 and the frontend falls back to the Python backend (which recomputes and
 * stores the fresh record).
 */
import "../lib/loadEnv.js";
import connectDb from "../lib/mongoose.js";

async function getLatestCompletedRound() {
  try {
    const year = new Date().getUTCFullYear();
    const res = await fetch(
      `https://api.jolpi.ca/ergast/f1/${year}/last/results.json?limit=1`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const races = data?.MRData?.RaceTable?.Races ?? [];
    return races.length ? parseInt(races[0].round, 10) : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    await connectDb();
    const mongoose = (await import("mongoose")).default;
    const coll = mongoose.connection.collection("prediction_records");

    const latestRound = await getLatestCompletedRound();
    const year = new Date().getUTCFullYear();

    // Special case: /api/predictions/compare?races=N
    const url = new URL(req.url || "", "http://localhost");
    if (url.pathname.endsWith("/compare")) {
      const races = parseInt(url.searchParams.get("races") || "6", 10);
      if (isNaN(races) || races <= 0) {
        return res.status(400).json({ error: "races must be a positive integer" });
      }
      const doc = await coll.findOne({
        season: Number(year),
        stage: `compare:${races}`,
      });
      if (doc && (latestRound === null || doc.data_round === latestRound)) {
        res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
        return res.status(200).json({ cached: true, ...(doc.payload || {}) });
      }
      return res.status(404).json({ cached: false });
    }

    const season = url.searchParams.get("season");
    const round = url.searchParams.get("round");
    const stage = url.searchParams.get("stage");
    if (!season || !round || !stage) {
      return res.status(400).json({ error: "season, round and stage are required" });
    }

    const doc = await coll.findOne({
      season: Number(season),
      round: Number(round),
      stage: String(stage),
    });

    if (doc && (latestRound === null || doc.data_round === latestRound)) {
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      return res.status(200).json({ cached: true, ...(doc.payload || {}) });
    }

    return res.status(404).json({ cached: false });
  } catch (err) {
    console.error("[api/predictions] Error:", err.message);
    return res.status(404).json({ cached: false, error: err.message });
  }
}
