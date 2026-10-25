/**
 * Vercel Cron Job — F1 Auto Post Adder
 *
 * Runs once daily via Vercel cron. Checks for F1 sessions that
 * completed recently, scrapes formula1.com for matching official reports,
 * and creates posts in MongoDB without duplicates.
 *
 * Schedule: "0 3 * * *" (3:00 AM UTC daily)
 */

import "../../lib/loadEnv.js";
import { syncSessionPosts } from "../../lib/autoPost/syncEngine.js";

export default async function handler(req, res) {
  // ── Auth check ─────────────────────────────────────────────────────────
  const env = globalThis.process?.env ?? {};
  const cronSecret = env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn("[auto-post] Unauthorized cron request.");
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  console.log("[auto-post] ====== Cron job started ======");
  console.log(`[auto-post] Time: ${new Date().toISOString()}`);

  try {
    const result = await syncSessionPosts({ lookbackHours: 72 });

    console.log("[auto-post] ====== Cron job finished ======");
    return res.status(result.success ? 200 : 500).json({
      status: result.success ? "ok" : "error",
      processedAt: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    console.error("[auto-post] Unhandled error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
}
