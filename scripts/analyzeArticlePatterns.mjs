/**
 * Article Title Pattern Analyzer
 *
 * Indexes up to 20+ pages of formula1.com latest articles and validates the
 * title-identification logic against recent real sessions (Qualifying/Race/
 * Sprint). Prints, for each session:
 *   - how many candidates pass the strict "official report" rules
 *   - the exact titles that pass (to inspect the naming pattern)
 *   - how many are blocked and the main reason
 *
 * Usage:
 *   node scripts/analyzeArticlePatterns.mjs [pages] [lookbackDays]
 */
import {
  OPENF1_BASE,
  TRACKED_SESSION_TYPES,
  BLOCKED_KEYWORDS,
  QUOTE_BLOCKED_PATTERNS,
  SESSION_KEYWORDS,
  SESSION_RESULT_PATTERNS,
  SESSION_REPORT_PATTERNS,
} from "../lib/autoPost/config.js";
import {
  scoreCandidate,
  fetchNewsIndex,
} from "../lib/autoPost/scraper.js";

const MAX_PAGES = parseInt(process.argv[2] || "20", 10);
const LOOKBACK_DAYS = parseInt(process.argv[3] || "14", 10);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

async function fetchSessions() {
  const url = `${OPENF1_BASE}/sessions?year=2026`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`OpenF1 error ${res.status}`);
  return res.json();
}

function reasonForBlock(article, sessionType) {
  const title = article.title;
  const lower = title.toLowerCase();
  const url = (article.url || "").toLowerCase();

  for (const b of BLOCKED_KEYWORDS) {
    if (lower.includes(b) || url.includes(b)) return `blocked keyword: "${b}"`;
  }
  if (QUOTE_BLOCKED_PATTERNS.some((re) => re.test(title))) return "quote/interview title";
  const kw = SESSION_KEYWORDS[sessionType] || [];
  if (!kw.some((k) => lower.includes(k.toLowerCase()))) return `no session keyword (${kw.join("/")})`;
  const resultPats = SESSION_RESULT_PATTERNS[sessionType] || [];
  if (!resultPats.some((p) => lower.includes(p))) {
    return "no result pattern";
  }
  const repPats = SESSION_REPORT_PATTERNS[sessionType] || [];
  if (!repPats.some((p) => lower.includes(p) || url.includes(p.replace(/\s+/g, "-")))) {
    return "no report-pattern boost";
  }
  return null;
}

async function main() {
  console.log(`\n=== F1 Article Title Pattern Analyzer ===`);
  console.log(`Pages: ${MAX_PAGES} | Lookback: ${LOOKBACK_DAYS} days\n`);

  // 1. Index 20+ pages
  console.log(`Indexing latest feed (up to ${MAX_PAGES} pages)...`);
  const articles = await fetchNewsIndex(MAX_PAGES);
  console.log(`Indexed ${articles.length} articles\n`);

  // 2. Recent sessions
  const sessions = await fetchSessions();
  const now = new Date();
  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recent = sessions
    .filter((s) => {
      if (!TRACKED_SESSION_TYPES.includes(s.session_type)) return false;
      const start = new Date(s.date_start);
      return start > cutoff && start < now;
    })
    .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

  console.log(`Recent sessions (${recent.length}):`);
  for (const s of recent) {
    console.log(`  ${s.session_type.padEnd(18)} ${s.meeting_name} — ${s.location} (${String(s.date_start).slice(0,10)})`);
  }
  console.log();

  let totalAccepted = 0;
  let totalBlocked = 0;
  const reasons = {};

  for (const session of recent) {
    const sessionType = session.session_type;
    const opts = {
      sessionType,
      meetingName: session.meeting_name || "",
      location: session.location || "",
      country: session.country_name || "",
      dateStart: new Date(session.date_start),
      dateEnd: session.date_end ? new Date(session.date_end) : null,
      now,
    };

    const accepted = [];
    const blocked = [];

    for (const a of articles) {
      const sc = scoreCandidate(a, opts);
      if (sc > 0) {
        accepted.push({ ...a, score: sc });
      } else {
        const reason = reasonForBlock(a, sessionType);
        const key = reason || "low score";
        reasons[key] = (reasons[key] || 0) + 1;
        blocked.push(key);
      }
    }

    accepted.sort((a, b) => b.score - a.score);
    totalAccepted += accepted.length;
    totalBlocked += blocked.length;

    console.log(`── ${sessionType} @ ${session.meeting_name} ──`);
    console.log(`  Accepted: ${accepted.length} | Blocked: ${blocked.length}`);
    for (const a of accepted.slice(0, 4)) {
      console.log(`    ✓ [${a.score}] ${a.title}`);
    }
    if (accepted.length === 0) {
      console.log(`    (none accepted — pattern/rules may need tuning)`);
    }
    console.log();
  }

  console.log(`=== SUMMARY ===`);
  console.log(`Total accepted: ${totalAccepted} | Total blocked: ${totalBlocked}`);
  console.log(`\nBlock reasons distribution:`);
  for (const [reason, count] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${reason}`);
  }
  console.log();

  // 3. Pattern insight on accepted titles
  console.log(`=== Accepted title pattern insight ===`);
  const allAccepted = [];
  for (const session of recent) {
    const opts = {
      sessionType: session.session_type,
      meetingName: session.meeting_name || "",
      location: session.location || "",
      country: session.country_name || "",
      dateStart: new Date(session.date_start),
      dateEnd: session.date_end ? new Date(session.date_end) : null,
      now,
    };
    for (const a of articles) {
      if (scoreCandidate(a, opts) > 0) allAccepted.push(a.title);
    }
  }
  const withReport = allAccepted.filter((t) => /report/i.test(t)).length;
  console.log(`Accepted titles total: ${allAccepted.length}`);
  console.log(`Contain "report": ${withReport} (${((withReport / Math.max(1, allAccepted.length)) * 100).toFixed(0)}%)`);
  console.log(`\nUnique accepted titles:`);
  [...new Set(allAccepted)].slice(0, 30).forEach((t) => console.log(`  - ${t}`));

  process.exit(0);
}

main().catch((err) => {
  console.error("Analyzer failed:", err);
  process.exit(1);
});
