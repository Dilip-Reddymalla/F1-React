/**
 * Scraper module — fetches and extracts official F1 session articles.
 *
 * Primary engine: Serverless-optimized HTTP fetch parser (fast, zero binary dependency,
 * runs in < 500ms on Vercel without Playwright/Chromium crashes).
 *
 * Fallback engine: Playwright (for local dev environments if needed).
 */

import {
  SESSION_KEYWORDS,
  SESSION_REPORT_PATTERNS,
  BLOCKED_KEYWORDS,
  GIST_PARAGRAPH_COUNT,
} from "./config.js";
import { cleanTableHtml } from "./tableFormatter.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Helper to parse relative time string ("5 minutes ago", "2 hours ago", "1 day ago")
 * into an estimated Date object.
 */
function parseRelativeTime(text, referenceDate = new Date()) {
  if (!text) return null;
  const minMatch = text.match(/(\d+)\s+min(?:ute)?s?\s+ago/i);
  if (minMatch)
    return new Date(referenceDate.getTime() - parseInt(minMatch[1], 10) * 60 * 1000);
  const hrMatch = text.match(/(\d+)\s+hour?s?\s+ago/i);
  if (hrMatch)
    return new Date(referenceDate.getTime() - parseInt(hrMatch[1], 10) * 3600 * 1000);
  const dayMatch = text.match(/(\d+)\s+day?s?\s+ago/i);
  if (dayMatch)
    return new Date(referenceDate.getTime() - parseInt(dayMatch[1], 10) * 86400 * 1000);
  return null;
}

/**
 * Clean HTML text tags and unescape entities.
 */
function decodeHtml(html = "") {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * Fetch and index articles from formula1.com news feed pages.
 */
async function fetchNewsIndex(maxPages = 2) {
  const articles = [];
  const seenUrls = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = `https://www.formula1.com/en/latest?page=${page}`;
    try {
      const res = await fetch(pageUrl, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) break;

      const html = await res.text();

      // Find all article cards
      const regex = /<a[^>]+href=["'](\/en\/latest\/article\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      let countOnPage = 0;

      while ((match = regex.exec(html)) !== null) {
        const path = match[1];
        const rawContent = match[2];
        const title = decodeHtml(rawContent);

        if (title.length > 15 && !seenUrls.has(path)) {
          seenUrls.add(path);

          // Extract relative time if present around the link
          const timeMatch = rawContent.match(/(\d+)\s+(minute|hour|day)s?\s+ago/i);

          articles.push({
            url: path.startsWith("http") ? path : `https://www.formula1.com${path}`,
            path,
            title,
            relativeTime: timeMatch ? timeMatch[0] : null,
          });
          countOnPage++;
        }
      }

      console.log(`[scraper] HTTP Index: Page ${page} found ${countOnPage} articles.`);
      if (countOnPage === 0) break;
    } catch (err) {
      console.warn(`[scraper] Error indexing page ${page}:`, err.message);
      break;
    }
  }

  return articles;
}

/**
 * Extract full article details from formula1.com article page using HTTP fetch.
 */
async function fetchArticlePageDetails(url, sessionType) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      console.warn(`[scraper] Failed to fetch article ${url}: status ${res.status}`);
      return null;
    }

    const html = await res.text();

    // 1. JSON-LD NewsArticle structured data
    let ldData = null;
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ldMatch) {
      try {
        const parsed = JSON.parse(ldMatch[1]);
        if (parsed["@type"] === "NewsArticle") {
          ldData = parsed;
        }
      } catch {
        // Ignore JSON-LD parse error
      }
    }

    // Headline
    const headline =
      ldData?.headline ||
      decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "") ||
      html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] ||
      "";

    // Cover Image
    const coverImage =
      (typeof ldData?.image === "string" ? ldData.image : ldData?.image?.url) ||
      html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] ||
      "";

    // Date
    const publishedDate = ldData?.datePublished
      ? new Date(ldData.datePublished)
      : new Date();

    // Body paragraphs
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs = [];
    let pMatch;

    while ((pMatch = pRegex.exec(html)) !== null) {
      const cleanText = decodeHtml(pMatch[1]);
      const lower = cleanText.toLowerCase();

      if (
        cleanText.length > 25 &&
        !lower.includes("cookie") &&
        !lower.includes("return to the homepage") &&
        !lower.includes("privacy policy") &&
        !lower.includes("all rights reserved") &&
        !lower.includes("sign in") &&
        !lower.includes("need help?")
      ) {
        paragraphs.push(pMatch[1].trim());
      }
    }

    const gistParagraphs = paragraphs.slice(0, GIST_PARAGRAPH_COUNT);
    let contentHtml = gistParagraphs.map((p) => `<p>${p}</p>`).join("\n");

    if (!contentHtml && ldData?.description) {
      contentHtml = `<p>${ldData.description}</p>`;
    }
    if (!contentHtml) {
      const metaDesc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1];
      if (metaDesc) contentHtml = `<p>${metaDesc}</p>`;
    }

    // Extract results table if available
    const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
    if (tableMatch) {
      contentHtml += `\n${cleanTableHtml(tableMatch[0])}`;
    }

    return {
      title: headline.slice(0, 200),
      coverImage: coverImage || "",
      content: contentHtml || "<p>Content could not be extracted.</p>",
      datePublished: publishedDate,
      sourceUrl: url,
    };
  } catch (err) {
    console.error(`[scraper] Error parsing article content for ${url}:`, err.message);
    return null;
  }
}

/**
 * Filter and score candidate articles to ensure we ONLY match official session reports
 * and NEVER pick up opinion/interview/wrong posts.
 */
function scoreCandidate(article, { sessionType, meetingName, location, country, dateStart, dateEnd, now }) {
  const titleLower = article.title.toLowerCase();
  const urlLower = (article.url || "").toLowerCase();

  // 1. Hard Block: Blocked keywords (interviews, opinions, quotes, odds, etc.)
  for (const blocked of BLOCKED_KEYWORDS) {
    if (titleLower.includes(blocked) || urlLower.includes(blocked)) {
      return -1000;
    }
  }

  // 2. Penalty for quotes / reactions in title (e.g. "‘I just did a bad job’ – Norris")
  if (
    titleLower.startsWith("‘") ||
    titleLower.startsWith("“") ||
    titleLower.startsWith('"') ||
    titleLower.includes(" – ") ||
    titleLower.includes(" - ") && titleLower.includes(" on ")
  ) {
    return -500;
  }

  // 3. Penalty for driver interview verbs
  if (
    titleLower.includes(" reflects ") ||
    titleLower.includes(" admits ") ||
    titleLower.includes(" says ") ||
    titleLower.includes(" hopes ") ||
    titleLower.includes(" insists ")
  ) {
    return -400;
  }

  // 4. Session Type Keywords
  const keywords = SESSION_KEYWORDS[sessionType] || [];
  const matchesKeyword = keywords.some((kw) => titleLower.includes(kw.toLowerCase()));
  if (!matchesKeyword) {
    return -200;
  }

  let score = 50;

  // 5. Official Session Report patterns (Massive boost for the official report)
  const reportPatterns = SESSION_REPORT_PATTERNS[sessionType] || [];
  for (const pattern of reportPatterns) {
    if (titleLower.includes(pattern) || urlLower.includes(pattern.replace(/\s+/g, "-"))) {
      score += 150;
      break;
    }
  }

  // 6. Meeting / Location / Country match
  const locationTerms = [meetingName, location, country]
    .filter(Boolean)
    .flatMap((term) =>
      term
        .toLowerCase()
        .replace(/grand prix|gp/gi, "")
        .split(/\s+/)
    )
    .filter((w) => w.length >= 3);

  const matchedLocationTerms = locationTerms.filter(
    (term) => titleLower.includes(term) || urlLower.includes(term)
  );

  if (locationTerms.length > 0 && matchedLocationTerms.length === 0) {
    // If article doesn't match the grand prix location/meeting at all, heavy penalty!
    return -300;
  }

  score += matchedLocationTerms.length * 30;

  // 7. Time correlation with session end time
  if (dateEnd && article.relativeTime) {
    const pubDate = parseRelativeTime(article.relativeTime, now);
    if (pubDate) {
      const diffMins = (pubDate.getTime() - dateEnd.getTime()) / (60 * 1000);
      // Article published shortly after session end (within -15 mins to +4 hours)
      if (diffMins >= -15 && diffMins <= 240) {
        score += 40;
      } else if (diffMins > 240 && diffMins <= 1440) {
        score += 10;
      }
    }
  }

  return score;
}

/**
 * Scrape formula1.com for the official session report article.
 *
 * @param {string} sessionType - e.g. "Qualifying", "Race", "Sprint"
 * @param {Object} options
 * @param {string} [options.meetingName]
 * @param {string} [options.location]
 * @param {string} [options.country]
 * @param {Date|string} [options.dateStart]
 * @param {Date|string} [options.dateEnd]
 * @param {number} [options.maxPages=2]
 * @returns {Promise<{title: string, coverImage: string, content: string, sourceUrl: string} | null>}
 */
export async function scrapeF1Article(
  sessionType,
  { meetingName = "", location = "", country = "", dateStart = null, dateEnd = null, maxPages = 2 } = {}
) {
  console.log(`[scraper] 🔍 Searching for ${sessionType} report (${meetingName || location || country})...`);

  const now = new Date();
  const targetStartTime = dateStart ? new Date(dateStart) : null;
  const targetEndTime = dateEnd ? new Date(dateEnd) : null;

  // ── Step 1: Index latest articles via lightweight HTTP fetch ───────────
  const articles = await fetchNewsIndex(maxPages);

  if (articles.length === 0) {
    console.warn("[scraper] ⚠️ No articles found in news feed.");
    return null;
  }

  // ── Step 2: Score and rank candidate articles ──────────────────────────
  const scored = [];

  for (const article of articles) {
    const score = scoreCandidate(article, {
      sessionType,
      meetingName,
      location,
      country,
      dateStart: targetStartTime,
      dateEnd: targetEndTime,
      now,
    });

    if (score > 0) {
      scored.push({ ...article, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  console.log(`[scraper] Found ${scored.length} matching candidate(s):`);
  for (const s of scored.slice(0, 5)) {
    console.log(`  [score: ${s.score}] "${s.title}"`);
  }

  if (scored.length === 0) {
    console.warn(`[scraper] ⚠️ No suitable official report found for ${sessionType} at ${meetingName || location}.`);
    return null;
  }

  const bestMatch = scored[0];
  console.log(`[scraper] 🎯 Selected top candidate (score ${bestMatch.score}): "${bestMatch.title}"`);

  // ── Step 3: Fetch full article details ─────────────────────────────────
  const details = await fetchArticlePageDetails(bestMatch.url, sessionType);

  if (!details || !details.title) {
    console.warn(`[scraper] ⚠️ Failed to extract details for: ${bestMatch.url}`);
    return null;
  }

  return details;
}
