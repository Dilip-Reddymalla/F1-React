/**
 * Vercel Cron Job — F1 Auto Post Adder
 *
 * Runs once daily via Vercel cron. Checks for F1 sessions that
 * completed in the last 26 hours, scrapes formula1.com for matching
 * articles, and creates posts in MongoDB.
 *
 * Schedule: "0 3 * * *" (3:00 AM UTC daily)
 *
 * Authentication: Requires CRON_SECRET in the Authorization header
 * (automatically sent by Vercel for cron invocations).
 */

import "../../lib/loadEnv.js";
import { getRecentlyCompletedSessions } from "../../lib/autoPost/scheduler.js";
import { scrapeF1Article } from "../../lib/autoPost/scraper.js";
import { createAutoPost, findExistingSessionPost } from "../../lib/autoPost/postWriter.js";
import { SCRAPE_MAX_RETRIES, SCRAPE_RETRY_DELAY_MS } from "../../lib/autoPost/config.js";

/**
 * Sleep helper for retry delays.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  const results = [];

  try {
    // ── Step 1: Find recently completed sessions ─────────────────────────
    const sessions = await getRecentlyCompletedSessions(26);

    if (sessions.length === 0) {
      console.log("[auto-post] No completed sessions found. Nothing to do.");
      return res.status(200).json({
        status: "ok",
        message: "No completed sessions in the last 26 hours.",
        results: [],
      });
    }

    // ── Step 2: Process each session ─────────────────────────────────────
    for (const session of sessions) {
      const sessionDisplayName = `${session.sessionType} — ${session.meetingName || session.sessionName || session.location}`;
      console.log(
        `\n[auto-post] Processing: ${sessionDisplayName} (${session.location}, ${session.country})`
      );

      // Pre-check: Does a post for this session already exist in DB?
      const existingPost = await findExistingSessionPost(session);
      if (existingPost) {
        console.log(
          `[auto-post] ℹ️ Post already exists in DB for this session: "${existingPost.title}" (${existingPost.slug}). Skipping scraper.`
        );
        results.push({
          session: sessionDisplayName,
          status: "already_synced",
          slug: existingPost.slug,
          articleTitle: existingPost.title,
        });
        continue;
      }

      let articleData = null;

      // Retry loop for scraping
      for (let attempt = 0; attempt <= SCRAPE_MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          console.log(
            `[auto-post] Retry ${attempt}/${SCRAPE_MAX_RETRIES} after ${SCRAPE_RETRY_DELAY_MS / 1000}s...`
          );
          await sleep(SCRAPE_RETRY_DELAY_MS);
        }

        articleData = await scrapeF1Article(session.sessionType, {
          meetingName: session.meetingName,
          dateStart: session.dateStart,
          dateEnd: session.dateEnd,
        });

        if (articleData) break;
      }

      if (!articleData) {
        const msg = `No matching article found for ${session.sessionType} at ${session.meetingName} after ${SCRAPE_MAX_RETRIES + 1} attempts.`;
        console.warn(`[auto-post] ⚠️ ${msg}`);
        results.push({
          session: `${session.sessionType} — ${session.meetingName}`,
          status: "skipped",
          reason: msg,
        });
        continue;
      }

      // ── Step 3: Create the post ──────────────────────────────────────
      const postResult = await createAutoPost(
        session.sessionType,
        articleData,
        {
          location: session.location,
          country: session.country,
          meetingName: session.meetingName,
        }
      );

      results.push({
        session: `${session.sessionType} — ${session.meetingName}`,
        status: postResult.success ? "created" : "skipped",
        slug: postResult.slug || null,
        reason: postResult.reason || null,
        articleTitle: articleData.title,
      });
    }
  } catch (err) {
    console.error("[auto-post] Unhandled error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message,
      results,
    });
  }

  console.log("\n[auto-post] ====== Cron job finished ======");
  console.log("[auto-post] Results:", JSON.stringify(results, null, 2));

  return res.status(200).json({
    status: "ok",
    processedAt: new Date().toISOString(),
    results,
  });
}
