/**
 * Post Synchronization Engine
 *
 * Orchestrates fetching completed sessions, scraping formula1.com,
 * deduplicating, and persisting posts to MongoDB.
 *
 * Used by:
 * - /api/cron/auto-post (scheduled Vercel cron)
 * - /api/refresh-posts (user manual refresh button)
 */

import connectDb from "../mongoose.js";
import Post from "../postModel.js";
import { getRecentlyCompletedSessions } from "./scheduler.js";
import { scrapeF1Article } from "./scraper.js";
import { createAutoPost, findExistingSessionPost } from "./postWriter.js";

/**
 * Execute synchronization of F1 session posts into MongoDB.
 *
 * @param {Object} [options]
 * @param {number} [options.lookbackHours=168] - Hours to look back for completed sessions (default: 7 days)
 * @returns {Promise<{success: boolean, message: string, createdCount: number, results: Array}>}
 */
export async function syncSessionPosts({ lookbackHours = 168 } = {}) {
  await connectDb();

  console.log(`[syncEngine] 🏎️ Starting sync (lookback: ${lookbackHours}h)...`);
  const results = [];
  let createdCount = 0;

  try {
    // ── 1. Check for recently completed sessions from OpenF1 ─────────────
    const sessions = await getRecentlyCompletedSessions(lookbackHours);
    console.log(`[syncEngine] Found ${sessions.length} eligible completed session(s).`);

    for (const session of sessions) {
      const sessionDisplayName = `${session.sessionType} — ${
        session.meetingName || session.location || session.sessionName
      }`;

      // Check if session post already exists in MongoDB
      const existing = await findExistingSessionPost(session);
      if (existing) {
        console.log(`[syncEngine] ℹ️ Post already in DB for ${sessionDisplayName}: "${existing.title}"`);
        results.push({
          session: sessionDisplayName,
          status: "already_synced",
          slug: existing.slug,
          articleTitle: existing.title,
        });
        continue;
      }

      console.log(`[syncEngine] 🚀 Fetching article for missing session: ${sessionDisplayName}`);

      const articleData = await scrapeF1Article(session.sessionType, {
        meetingName: session.meetingName,
        location: session.location,
        country: session.country,
        dateStart: session.dateStart,
        dateEnd: session.dateEnd,
      });

      if (!articleData) {
        results.push({
          session: sessionDisplayName,
          status: "skipped",
          reason: "No official report article found on formula1.com",
        });
        continue;
      }

      const postResult = await createAutoPost(session.sessionType, articleData, {
        location: session.location,
        country: session.country,
        meetingName: session.meetingName,
        dateStart: session.dateStart,
      });

      if (postResult.success) {
        createdCount++;
        results.push({
          session: sessionDisplayName,
          status: "created",
          slug: postResult.slug,
          articleTitle: articleData.title,
        });
      } else {
        results.push({
          session: sessionDisplayName,
          status: "skipped",
          reason: postResult.reason,
          slug: postResult.slug,
        });
      }
    }

    const message =
      createdCount > 0
        ? `Successfully synced ${createdCount} new post(s).`
        : "All recent sessions are up to date. No new posts to add.";

    console.log(`[syncEngine] ✅ Sync finished: ${message}`);
    return {
      success: true,
      message,
      createdCount,
      results,
    };
  } catch (err) {
    console.error("[syncEngine] ❌ Sync error:", err);
    return {
      success: false,
      message: err.message,
      createdCount,
      results,
    };
  }
}
