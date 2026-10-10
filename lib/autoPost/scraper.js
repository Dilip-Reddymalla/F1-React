/**
 * Scraper module — uses Playwright to scrape formula1.com/en/latest.
 *
 * 1. Opens the latest news page.
 * 2. Searches article titles for session-specific keywords.
 * 3. Navigates into the matching article.
 * 4. Extracts title, cover image, and content (gist + results).
 */

import { chromium as playwrightChromium } from "playwright-core";
import {
  SESSION_KEYWORDS,
  BLOCKED_KEYWORDS,
  F1_LATEST_URL,
  GIST_PARAGRAPH_COUNT,
} from "./config.js";

/**
 * Get a launched browser instance.
 * Uses @sparticuz/chromium in serverless (Vercel), falls back to local chromium.
 */
async function launchBrowser() {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    try {
      const chromium = await import("@sparticuz/chromium");
      const mod = chromium.default || chromium;
      const executablePath = await mod.executablePath();
      return playwrightChromium.launch({
        executablePath,
        args: [
          ...(mod.args || []),
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
        headless: true,
      });
    } catch (err) {
      console.warn("[scraper] Failed to launch with @sparticuz/chromium:", err.message);
    }
  }

  // Local development: launch system Chrome or Edge
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };

  try {
    return await playwrightChromium.launch({ ...launchOptions, channel: "chrome" });
  } catch {
    try {
      return await playwrightChromium.launch({ ...launchOptions, channel: "msedge" });
    } catch {
      return await playwrightChromium.launch(launchOptions);
    }
  }
}

/**
 * Accept the cookie consent banner if it appears.
 */
async function dismissCookieBanner(page) {
  try {
    const btn = page.locator(
      'button:has-text("Accept"), button#onetrust-accept-btn-handler'
    );
    await btn.first().click({ timeout: 5000 });
    console.log("[scraper] Cookie banner dismissed.");
  } catch {
    // Banner didn't appear — fine
  }
}

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
 * Scrape the formula1.com /en/latest page and find the article published
 * closest to the session end time.
 *
 * @param {string} sessionType - e.g. "Qualifying", "Race", "Sprint"
 * @param {Object} options
 * @param {string} [options.meetingName] - e.g. "Singapore Grand Prix"
 * @param {Date|string} [options.dateStart] - Session scheduled start time
 * @param {Date|string} [options.dateEnd] - Session scheduled/actual end time
 * @param {number} [options.maxPages=2] - Max pagination pages to inspect
 * @returns {Promise<{title: string, coverImage: string, content: string, sourceUrl: string} | null>}
 */
export async function scrapeF1Article(
  sessionType,
  { meetingName = "", dateStart = null, dateEnd = null, maxPages = 2 } = {}
) {
  const keywords = SESSION_KEYWORDS[sessionType];
  if (!keywords || keywords.length === 0) {
    console.error(`[scraper] No keywords defined for session type: ${sessionType}`);
    return null;
  }

  const targetStartTime = dateStart ? new Date(dateStart) : null;
  const targetEndTime = dateEnd ? new Date(dateEnd) : null;

  console.log(
    `[scraper] Searching for ${sessionType} article (keywords: ${keywords.join(", ")})`
  );
  if (targetEndTime) {
    console.log(
      `[scraper] Session timing: started ${targetStartTime?.toISOString() || "unknown"}, ended ${targetEndTime.toISOString()}`
    );
  }

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    const now = new Date();

    await page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });

    const allDiscoveredArticles = [];

    // Scan up to maxPages (default 2)
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const pageUrl = `https://www.formula1.com/en/latest?page=${pageNum}`;
      console.log(`[scraper] Fetching latest articles from ${pageUrl}...`);

      await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2500);

      if (pageNum === 1) {
        await dismissCookieBanner(page);
      }

      const pageArticles = await page.evaluate(() => {
        const results = [];
        const links = document.querySelectorAll('a[href*="/en/latest/article/"]');
        for (const a of links) {
          const parent = a.parentElement?.parentElement;
          const timeMatch = parent?.innerText?.match(
            /(\d+)\s+(minute|hour|day)s?\s+ago/i
          );
          const href = a.getAttribute("href");
          const text = a.textContent?.trim() || "";
          if (href && text && text.length > 10) {
            results.push({
              title: text,
              url: href.startsWith("http")
                ? href
                : `https://www.formula1.com${href}`,
              relativeTime: timeMatch ? timeMatch[0] : null,
            });
          }
        }
        return results;
      });

      console.log(`[scraper] Page ${pageNum} returned ${pageArticles.length} articles.`);
      allDiscoveredArticles.push(...pageArticles);

      // If we already found articles older than session end time, no need to paginate further
      if (targetEndTime) {
        const oldestOnPage = pageArticles
          .map((a) => parseRelativeTime(a.relativeTime, now))
          .filter(Boolean)
          .sort((a, b) => a - b)[0];

        if (oldestOnPage && oldestOnPage.getTime() < targetEndTime.getTime() - 2 * 3600 * 1000) {
          console.log("[scraper] Reached articles older than session window. Stopping pagination.");
          break;
        }
      }
    }

    // Deduplicate by URL
    const seen = new Set();
    const articles = allDiscoveredArticles.filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    console.log(`[scraper] Total unique articles discovered: ${articles.length}`);

    if (articles.length === 0) {
      console.error("[scraper] No articles found across pages.");
      return null;
    }

    // ── Filter out betting / odds / promotional articles ─────────────────
    const editorialArticles = articles.filter((a) => {
      const t = a.title.toLowerCase();
      const u = (a.url || "").toLowerCase();
      const isBlocked = BLOCKED_KEYWORDS.some((kw) => t.includes(kw) || u.includes(kw));
      return !isBlocked;
    });

    // ── Find candidate articles matching keywords or meeting name ───────
    const candidates = editorialArticles.filter((a) => {
      const titleLower = a.title.toLowerCase();
      const keywordHit = keywords.some((kw) => titleLower.includes(kw.toLowerCase()));
      if (keywordHit) return true;

      if (meetingName) {
        const meetingWords = meetingName
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        const meetingHit = meetingWords.some((w) => titleLower.includes(w));
        if (meetingHit && (titleLower.includes("report") || titleLower.includes("results"))) {
          return true;
        }
      }
      return false;
    });

    console.log(`[scraper] Found ${candidates.length} keyword-matching candidate article(s).`);

    if (candidates.length === 0) {
      console.warn(
        `[scraper] No matching articles found for ${sessionType}. Discovered titles:`,
        articles.slice(0, 8).map((a) => a.title)
      );
      return null;
    }

    // ── Rank candidates by publication time relative to session end time ─
    let match = null;

    if (targetEndTime) {
      for (const c of candidates) {
        c.pubDate = parseRelativeTime(c.relativeTime, now);
        if (c.pubDate) {
          // Difference in minutes from target session end time
          c.diffMinutes = (c.pubDate.getTime() - targetEndTime.getTime()) / (60 * 1000);
        } else {
          c.diffMinutes = Infinity;
        }
      }

      console.log("[scraper] Candidates with time delta from session end:");
      for (const c of candidates) {
        console.log(
          `  • [${c.relativeTime || "unknown"}] (${c.diffMinutes !== Infinity ? `${Math.round(c.diffMinutes)}m from end` : "no timestamp"}) "${c.title}"`
        );
      }

      // Filter: article should not have been published before session started
      const validCandidates = candidates.filter((c) => {
        if (!c.pubDate || !targetStartTime) return true;
        return c.pubDate.getTime() >= targetStartTime.getTime() - 30 * 60 * 1000;
      });

      const candidatesToSort = validCandidates.length > 0 ? validCandidates : candidates;

      // Sort by closest to session end time:
      // Prioritize articles published shortly after the session ended (e.g. 0m to 180m after session end)
      candidatesToSort.sort((a, b) => {
        const aIsAfter = a.diffMinutes >= -15 && a.diffMinutes <= 240;
        const bIsAfter = b.diffMinutes >= -15 && b.diffMinutes <= 240;
        if (aIsAfter && !bIsAfter) return -1;
        if (!aIsAfter && bIsAfter) return 1;
        return Math.abs(a.diffMinutes) - Math.abs(b.diffMinutes);
      });

      match = candidatesToSort[0];
      console.log(
        `[scraper] 🎯 Selected article closest to session end: "${match.title}" (${match.relativeTime || "unknown"})`
      );
    } else {
      match = candidates[0];
      console.log(`[scraper] No session end time provided. Selected top candidate: "${match.title}"`);
    }

    // ── Step 4: Navigate to the article page ────────────────────────────
    console.log(`[scraper] Navigating to article: ${match.url}`);
    await page.goto(match.url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // ── Step 5: Extract article content ─────────────────────────────────
    const articleData = await page.evaluate(
      ({ gistCount, sType }) => {
        // Check for JSON-LD NewsArticle metadata
        let ldData = null;
        try {
          const ldScripts = document.querySelectorAll(
            'script[type="application/ld+json"]'
          );
          for (const s of ldScripts) {
            const parsed = JSON.parse(s.textContent);
            if (parsed["@type"] === "NewsArticle") {
              ldData = parsed;
              break;
            }
          }
        } catch {
          // Ignore JSON-LD parse errors
        }

        // Title
        const title =
          ldData?.headline ||
          document.querySelector('meta[property="og:title"]')?.content ||
          document.querySelector("h1")?.textContent?.trim() ||
          document.title;

        // Cover image
        const coverImage =
          (typeof ldData?.image === "string" ? ldData.image : ldData?.image?.url) ||
          document.querySelector('meta[property="og:image"]')?.content ||
          "";

        // Article body paragraphs
        const allParagraphs = [];
        const pElements = document.querySelectorAll(
          "article p, main p, .f1-article p, [class*='Article'] p, [class*='article'] p"
        );
        for (const p of pElements) {
          const text = p.textContent?.trim() || "";
          const lower = text.toLowerCase();
          // Exclude footer / navigation / consent / cookie boilerplate
          if (
            text.length > 25 &&
            !lower.includes("return to the homepage") &&
            !lower.includes("need help?") &&
            !lower.includes("cookie") &&
            !lower.includes("privacy policy") &&
            !lower.includes("all rights reserved")
          ) {
            allParagraphs.push(p.innerHTML);
          }
        }

        // Build content: gist paragraphs (first N paragraphs)
        const gistParagraphs = allParagraphs.slice(0, gistCount);
        let contentHtml = gistParagraphs
          .map((html) => `<p>${html}</p>`)
          .join("\n");

        // If no paragraphs found, fallback to description from ldData or meta description
        if (!contentHtml && ldData?.description) {
          contentHtml = `<p>${ldData.description}</p>`;
        }
        if (!contentHtml) {
          const metaDesc = document.querySelector('meta[name="description"]')?.content;
          if (metaDesc) contentHtml = `<p>${metaDesc}</p>`;
        }

        // For Race & Qualifying: look for results/standings in the article
        if (sType === "Race" || sType === "Qualifying" || sType === "Sprint") {
          // Look for result tables
          const tables = document.querySelectorAll("table");
          for (const table of tables) {
            contentHtml += `\n${table.outerHTML}`;
          }

          // Look for ordered/unordered lists that might contain results
          const lists = document.querySelectorAll(
            "article ol, main ol, [class*='Article'] ol, [class*='article'] ol"
          );
          for (const list of lists) {
            const text = list.textContent || "";
            // Check if this list looks like results (contains driver names or positions)
            if (
              text.match(/\d+\.\s/) ||
              text.toLowerCase().includes("lap") ||
              text.toLowerCase().includes("gap")
            ) {
              contentHtml += `\n${list.outerHTML}`;
            }
          }

          // Look for a results-like section (divs with position numbers, driver names)
          const resultSections = document.querySelectorAll(
            '[class*="result" i], [class*="Result" i], [class*="standings" i], [class*="classification" i]'
          );
          for (const section of resultSections) {
            contentHtml += `\n${section.outerHTML}`;
          }
        }

        return {
          title: title.slice(0, 200),
          coverImage,
          content: contentHtml || "<p>Content could not be extracted.</p>",
        };
      },
      { gistCount: GIST_PARAGRAPH_COUNT, sType: sessionType }
    );

    if (articleData?.content && articleData.content.includes("<table")) {
      const { cleanTableHtml } = await import("./tableFormatter.js");
      const rawMatch = articleData.content.match(/<table[\s\S]*?<\/table>/i);
      if (rawMatch) {
        articleData.content = articleData.content.replace(rawMatch[0], cleanTableHtml(rawMatch[0]));
      }
    }

    return {
      ...articleData,
      sourceUrl: match.url,
    };
  } finally {
    await browser.close();
  }
}
