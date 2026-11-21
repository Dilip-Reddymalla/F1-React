import "../lib/loadEnv.js";
import connectDb from "../lib/mongoose.js";
import Post from "../lib/postModel.js";
import { scrapeF1Article } from "../lib/autoPost/scraper.js";
import { getRecentlyCompletedSessions } from "../lib/autoPost/scheduler.js";

// 1. Is Las Vegas Qualifying considered "completed" by the scheduler?
const sessions = await getRecentlyCompletedSessions(72);
console.log("=== Completed sessions (72h lookback) ===");
for (const s of sessions) {
  console.log(`  ${s.sessionType} @ ${s.meetingName || "?"} (${s.location || "?"}) end=${s.dateEnd?.toISOString?.() ?? "?"}`);
}

// 2. Try scraping with production default (2 pages)
console.log("\n=== scrape with maxPages=2 (production default) ===");
const res2 = await scrapeF1Article("Qualifying", {
  meetingName: "Las Vegas",
  location: "Las Vegas",
  country: "United States",
  dateStart: new Date("2026-11-20T00:00:00Z"),
  dateEnd: new Date("2026-11-21T23:59:59Z"),
  maxPages: 2,
});
console.log("result:", res2 ? `FOUND: ${res2.title}` : "null (not found)");

// 3. Try with 20 pages
console.log("\n=== scrape with maxPages=20 ===");
const res20 = await scrapeF1Article("Qualifying", {
  meetingName: "Las Vegas",
  location: "Las Vegas",
  country: "United States",
  dateStart: new Date("2026-11-20T00:00:00Z"),
  dateEnd: new Date("2026-11-21T23:59:59Z"),
  maxPages: 20,
});
console.log("result:", res20 ? `FOUND: ${res20.title}` : "null (not found)");

// 4. Existing posts mentioning Vegas
await connectDb();
const vegas = await Post.find({ title: /vegas|las vegas/i }).select("title slug createdAt").lean();
console.log(`\n=== Existing Vegas-related posts (${vegas.length}) ==="`);
for (const p of vegas) {
  console.log(`  ${p.createdAt?.toISOString?.().slice(0,10)} | ${p.title} | ${p.slug}`);
}

process.exit(0);
