/**
 * API Endpoint: /api/refresh-posts
 *
 * Triggered on demand (e.g. from the UI "Refresh Posts" button).
 * Checks for missing sessions, scrapes formula1.com, and creates posts in MongoDB.
 */

import "../lib/loadEnv.js";
import { syncSessionPosts } from "../lib/autoPost/syncEngine.js";
import { clearPostsCache } from "./posts.js";

export default async function handler(req, res) {
  // Allow GET or POST
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  console.log("[api/refresh-posts] Refresh requested via UI/API...");

  try {
    // Clear in-memory posts cache
    clearPostsCache();

    // Run sync with 7 days lookback
    const result = await syncSessionPosts({ lookbackHours: 168 });

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    console.error("[api/refresh-posts] Error during manual refresh:", err);
    return res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
}
