/**
 * Historical Post Synchronization Script
 *
 * Backfills all missing F1 Qualifying, Sprint, and Race posts
 * from after the Miami GP Sprint (May 2026) up to current date.
 *
 * Uses both formula1.com latest feeds and official 2026 Race Hubs
 * (/en/racing/2026/<round>) to ensure 100% of historical reports are captured.
 *
 * Usage:
 *   node scripts/syncHistoricalPosts.js
 */

import slugify from "slugify";
import "../lib/loadEnv.js";
import connectDb from "../lib/mongoose.js";
import Post from "../lib/postModel.js";
import {
  OPENF1_BASE,
  SESSION_TAGS,
  F1_BOT_NAME,
  F1_BOT_EMAIL,
  GIST_PARAGRAPH_COUNT,
} from "../lib/autoPost/config.js";
import { cleanTableHtml } from "../lib/autoPost/tableFormatter.js";

const MIAMI_SPRINT_CUTOFF = new Date("2026-05-02T18:00:00Z");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const HUB_MAP = {
  "miami gardens": "miami",
  "miami": "miami",
  "montréal": "canada",
  "montreal": "canada",
  "canada": "canada",
  "monte carlo": "monaco",
  "monaco": "monaco",
  "barcelona": "barcelona-catalunya",
  "catalunya": "barcelona-catalunya",
  "spielberg": "austria",
  "austria": "austria",
  "silverstone": "great-britain",
  "great britain": "great-britain",
  "spa-francorchamps": "belgium",
  "spa": "belgium",
  "belgium": "belgium",
  "budapest": "hungary",
  "hungary": "hungary",
  "zandvoort": "netherlands",
  "netherlands": "netherlands",
  "monza": "italy",
  "italy": "italy",
  "madrid": "spain",
  "spain": "spain",
  "baku": "azerbaijan",
  "azerbaijan": "azerbaijan",
  "kuala lumpur": "bahrain",
  "bahrain": "bahrain",
  "marina bay": "singapore",
  "singapore": "singapore",
};

// ── 1. Fetch completed sessions from OpenF1 ─────────────────────────────────
async function getSessionsToSync() {
  console.log("📡 Fetching 2026 F1 sessions from OpenF1...");
  const res = await fetch(`${OPENF1_BASE}/sessions?year=2026`);
  if (!res.ok) throw new Error(`OpenF1 error: ${res.statusText}`);
  const sessions = await res.json();

  const now = new Date();
  const validTypes = ["Qualifying", "Race", "Sprint", "Sprint Qualifying", "Sprint Shootout"];

  const filtered = sessions.filter((s) => {
    if (!validTypes.includes(s.session_type)) return false;
    const start = new Date(s.date_start);
    return start > MIAMI_SPRINT_CUTOFF && start < now;
  });

  filtered.sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
  console.log(`✅ Found ${filtered.length} completed session(s) after Miami GP Sprint.`);
  return filtered;
}

// ── 2. Index articles from F1 Race Hub ──────────────────────────────────────
const hubArticlesCache = {};

function getSlugFromUrl(url) {
  const parts = url.split("/");
  const file = parts[parts.length - 1];
  return file.split(".")[0];
}

async function getHubArticles(hubName) {
  if (hubArticlesCache[hubName]) return hubArticlesCache[hubName];

  try {
    const res = await fetch(`https://www.formula1.com/en/racing/2026/${hubName}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return [];

    const html = await res.text();
    const linkMatches = [
      ...html.matchAll(/href=["'](\/en\/latest\/article\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
    ];

    const articles = linkMatches.map((m) => {
      const url = m[1].startsWith("http") ? m[1] : `https://www.formula1.com${m[1]}`;
      const linkText = m[2].replace(/<[^>]+>/g, "").trim();
      const slug = getSlugFromUrl(m[1]);
      return { url, linkText, slug };
    });

    hubArticlesCache[hubName] = articles;
    return articles;
  } catch (err) {
    console.warn(`Warning fetching hub ${hubName}:`, err.message);
    return [];
  }
}

// ── 3. Index latest articles feed ───────────────────────────────────────────
async function indexLatestArticles(maxPages = 20) {
  console.log(`📚 Indexing recent F1 news feed (up to ${maxPages} pages)...`);
  const articles = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetch(`https://www.formula1.com/en/latest?page=${page}`, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) break;

      const html = await res.text();
      const regex = /<a[^>]+href=["'](\/en\/latest\/article\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      let countOnPage = 0;

      while ((match = regex.exec(html)) !== null) {
        const url = match[1];
        const title = match[2].replace(/<[^>]+>/g, "").trim();
        if (title.length > 15 && !seen.has(url)) {
          seen.add(url);
          articles.push({
            url: url.startsWith("http") ? url : `https://www.formula1.com${url}`,
            title,
            slug: getSlugFromUrl(url),
          });
          countOnPage++;
        }
      }

      process.stdout.write(`\r  Scanned page ${page}/${maxPages} — Indexed ${articles.length} articles`);
      if (countOnPage === 0) break;
      await sleep(100);
    } catch {
      break;
    }
  }

  console.log(`\n✅ Indexed ${articles.length} recent articles.`);
  return articles;
}

// ── 4. Parse full article content ───────────────────────────────────────────
async function fetchArticleDetails(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const html = await res.text();

    // 1. JSON-LD NewsArticle
    let ldData = null;
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ldMatch) {
      try {
        const parsed = JSON.parse(ldMatch[1]);
        if (parsed["@type"] === "NewsArticle") ldData = parsed;
      } catch {}
    }

    // Headline
    const headline =
      ldData?.headline ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "")?.trim() ||
      "";

    // Image
    const image =
      (typeof ldData?.image === "string" ? ldData.image : ldData?.image?.url) ||
      html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] ||
      "";

    // Date
    const publishedDate = ldData?.datePublished
      ? new Date(ldData.datePublished)
      : new Date();

    // Description / body paragraphs
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs = [];
    let pMatch;
    while ((pMatch = pRegex.exec(html)) !== null) {
      const text = pMatch[1].replace(/<[^>]+>/g, "").trim();
      const lower = text.toLowerCase();
      if (
        text.length > 25 &&
        !lower.includes("cookie") &&
        !lower.includes("homepage") &&
        !lower.includes("privacy policy") &&
        !lower.includes("rights reserved") &&
        !lower.includes("sign in")
      ) {
        paragraphs.push(pMatch[1].trim());
      }
    }

    const gistParagraphs = paragraphs.slice(0, GIST_PARAGRAPH_COUNT);
    let contentHtml = gistParagraphs.map((p) => `<p>${p}</p>`).join("\n");

    if (!contentHtml && ldData?.description) {
      contentHtml = `<p>${ldData.description}</p>`;
    }

    // Extract table in article if available
    const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
    if (tableMatch) {
      contentHtml += `\n${cleanTableHtml(tableMatch[0])}`;
    }

    contentHtml += `\n<p class="auto-post-source"><em>Source: <a href="${url}" target="_blank" rel="noopener">formula1.com</a></em></p>`;

    return {
      title: headline || "",
      coverImage: image || "",
      content: contentHtml,
      datePublished: publishedDate,
      sourceUrl: url,
    };
  } catch (err) {
    console.error(`  Error parsing article ${url}:`, err.message);
    return null;
  }
}

// ── 5. Main synchronization flow ────────────────────────────────────────────
async function runSync() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  F1 Historical Post Synchronization (Post-Miami 2026)");
  console.log("═══════════════════════════════════════════════════════\n");

  await connectDb();
  console.log("✅ Connected to MongoDB.");

  // Get or create F1-Bot user
  const mongoose = (await import("mongoose")).default;
  const usersCollection = mongoose.connection.collection("users");
  let botUser = await usersCollection.findOne({ email: F1_BOT_EMAIL });
  if (!botUser) {
    const res = await usersCollection.insertOne({
      name: F1_BOT_NAME,
      email: F1_BOT_EMAIL,
      role: "system",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    botUser = { _id: res.insertedId };
  }

  // Get existing post slugs & titles in DB
  const existingPosts = await Post.find().select("title slug createdAt tags").lean();
  const existingSlugs = new Set(existingPosts.map((p) => p.slug));
  console.log(`ℹ️ Existing posts in MongoDB: ${existingPosts.length}\n`);

  // 1. Get OpenF1 sessions
  const sessions = await getSessionsToSync();

  // 2. Index recent articles
  const latestArticles = await indexLatestArticles(20);

  // 3. Match and sync each session
  console.log("\n🚀 Starting session post matching & synchronization...\n");
  let createdCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const sType = session.session_type;
    const location = session.location || session.meeting_name || "";
    const country = session.country_name || "";
    const startDate = new Date(session.date_start);
    const locLower = location.toLowerCase();

    console.log(
      `[${i + 1}/${sessions.length}] ${sType} — ${location} (${startDate.toLocaleDateString()})`
    );

    const isQuali = sType.includes("Qualifying") && !sType.includes("Sprint");
    const isSprintQuali = sType.includes("Sprint Qualifying") || sType.includes("Sprint Shootout");
    const isSprint = sType === "Sprint";
    const isRace = sType === "Race";

    // 1. Try matching from Race Hub
    let matchedArticle = null;
    const hubKey = HUB_MAP[locLower] || HUB_MAP[country.toLowerCase()];

    if (hubKey) {
      const hubArticles = await getHubArticles(hubKey);

      if (isSprintQuali) {
        matchedArticle = hubArticles.find((a) => {
          const s = a.slug;
          return s.includes("sprint") && (s.includes("pole") || s.includes("qualifying"));
        });
      } else if (isSprint) {
        matchedArticle = hubArticles.find((a) => {
          const s = a.slug;
          return (
            s.includes("sprint") &&
            (s.includes("wins") || s.includes("victory") || s.includes("win") || s.includes("report")) &&
            !s.includes("qualifying")
          );
        });
      } else if (isQuali) {
        matchedArticle = hubArticles.find((a) => {
          const s = a.slug;
          if (s.includes("sprint")) return false;
          return s.includes("pole") || s.includes("qualifying");
        });
      } else if (isRace) {
        matchedArticle = hubArticles.find((a) => {
          const s = a.slug;
          if (s.includes("sprint") || s.includes("qualifying") || s.startsWith("fp") || s.includes("practice"))
            return false;
          return s.includes("wins") || s.includes("victory") || s.includes("win") || s.includes("report");
        });
      }
    }

    // 2. Fallback to latestArticles if hub didn't match
    if (!matchedArticle) {
      const locKeywords = [locLower, country.toLowerCase()].filter(Boolean);
      const candidates = latestArticles.filter((a) => {
        const t = a.title.toLowerCase();
        if (t.includes("betting") || t.includes("odds") || t.includes("quiz")) return false;
        const matchesLoc = locKeywords.some((kw) => kw.length > 3 && t.includes(kw));
        if (!matchesLoc) return false;

        if (isSprintQuali) return t.includes("sprint") && (t.includes("pole") || t.includes("qualifying"));
        if (isSprint) return t.includes("sprint") && (t.includes("wins") || t.includes("report"));
        if (isQuali) return !t.includes("sprint") && (t.includes("pole") || t.includes("qualifying") || t.includes("grid"));
        if (isRace) return !t.includes("sprint") && (t.includes("wins") || t.includes("victory") || t.includes("report") || t.includes("grand prix"));
        return false;
      });

      if (candidates.length > 0) {
        matchedArticle = candidates.find((c) => c.title.toLowerCase().includes("report")) || candidates[0];
      }
    }

    if (!matchedArticle) {
      console.log(`  ⚠️ No matching article found for ${sType} at ${location}. Skipping.`);
      skippedCount++;
      continue;
    }

    console.log(`  🎯 Match: "${matchedArticle.slug || matchedArticle.title}"`);

    // Fetch full article details
    const articleData = await fetchArticleDetails(matchedArticle.url);
    if (!articleData || !articleData.title) {
      console.log(`  ⚠️ Failed to extract content for: ${matchedArticle.url}`);
      skippedCount++;
      continue;
    }

    const slug = slugify(articleData.title, { lower: true, strict: true, trim: true });
    if (existingSlugs.has(slug)) {
      console.log(`  ℹ️ Post already in DB (slug: ${slug}). Skipping.`);
      skippedCount++;
      continue;
    }

    // Tags
    const baseTags = SESSION_TAGS[sType] || ["F1"];
    const tags = Array.from(new Set([...baseTags, location, country].filter(Boolean)));

    // Create and save post
    const post = new Post({
      title: articleData.title.slice(0, 200),
      slug,
      content: articleData.content,
      coverImage: articleData.coverImage || "",
      author: botUser._id,
      tags,
      status: "published",
      approvalStatus: "approved",
      createdAt: articleData.datePublished || startDate,
    });

    await post.save();
    existingSlugs.add(slug);
    createdCount++;

    console.log(`  ✅ Saved to MongoDB: "${post.title}"\n`);
    await sleep(200);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log(`🎉 Sync Complete!`);
  console.log(`   Created: ${createdCount} new posts`);
  console.log(`   Skipped: ${skippedCount} posts`);
  console.log(`   Total in DB now: ${await Post.countDocuments()} posts`);
  console.log("═══════════════════════════════════════════════════════\n");

  process.exit(0);
}

runSync().catch((err) => {
  console.error("Fatal sync error:", err);
  process.exit(1);
});
