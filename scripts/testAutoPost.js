/**
 * Local test script for the F1 Auto Post system.
 *
 * Usage:
 *   node scripts/testAutoPost.js [sessionType]
 *
 * Examples:
 *   node scripts/testAutoPost.js Qualifying
 *   node scripts/testAutoPost.js Race
 *
 * This script:
 * 1. Tests the scraper against formula1.com/en/latest
 * 2. Shows what would be posted (DRY RUN — does NOT write to MongoDB)
 * 3. Also tests the OpenF1 scheduler to show recent sessions
 */

import "../lib/loadEnv.js";
import { getRecentlyCompletedSessions } from "../lib/autoPost/scheduler.js";
import { scrapeF1Article } from "../lib/autoPost/scraper.js";

const sessionType = process.argv[2] || "Qualifying";

console.log("═══════════════════════════════════════════════════════");
console.log("  F1 Auto Post — Test Runner");
console.log("═══════════════════════════════════════════════════════\n");

// ── Test 1: OpenF1 Scheduler ────────────────────────────────────────────
console.log("── Test 1: OpenF1 Scheduler (recent sessions) ──\n");

let targetSession = null;

try {
  const sessions = await getRecentlyCompletedSessions(72); // Look back 72 hrs for testing
  if (sessions.length === 0) {
    console.log("  No completed sessions found in the last 72 hours.");
    console.log("  (This is normal if there's no race weekend.)\n");
  } else {
    for (const s of sessions) {
      console.log(`  • ${s.sessionType} — ${s.meetingName}`);
      console.log(`    Location: ${s.location}, ${s.country}`);
      console.log(`    Started:  ${s.dateStart.toISOString()}`);
      console.log(`    Ended:    ${s.dateEnd.toISOString()}\n`);
    }
    // Match session of requested type
    targetSession = sessions.find((s) => s.sessionType === sessionType) || sessions[0];
  }
} catch (err) {
  console.error("  Error fetching sessions:", err.message, "\n");
}

// ── Test 2: F1.com Scraper with Session End Time ────────────────────────
console.log(
  `── Test 2: Scraping formula1.com for "${sessionType}" article matching session end time ──\n`
);

try {
  const scrapeOptions = {
    meetingName: targetSession?.meetingName || "",
    dateStart: targetSession?.dateStart || null,
    dateEnd: targetSession?.dateEnd || null,
  };

  const article = await scrapeF1Article(sessionType, scrapeOptions);
  if (!article) {
    console.log("  ⚠️  No matching article found.");
    console.log(`  Tip: Try a different session type or check formula1.com/en/latest manually.\n`);
  } else {
    console.log(`\n  ✅ Article found!\n`);
    console.log(`  Title:      ${article.title}`);
    console.log(`  Cover:      ${article.coverImage}`);
    console.log(`  Source URL:  ${article.sourceUrl}`);
    console.log(`  Content length: ${article.content.length} chars`);
    console.log(`\n  ── Content Preview (first 500 chars) ──`);
    console.log(`  ${article.content.slice(0, 500)}...`);
  }
} catch (err) {
  console.error("  Error scraping:", err.message);
  console.error(err.stack);
}

console.log("\n═══════════════════════════════════════════════════════");
console.log("  Test complete. No data was written to MongoDB.");
console.log("═══════════════════════════════════════════════════════\n");
