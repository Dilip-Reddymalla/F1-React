/**
 * Configuration for the F1 Auto Post Adder system.
 *
 * Buffers, keywords, tags, and selectors are centralized here
 * so they can be tuned without touching business logic.
 */

// ─── Session Buffers (minutes after session start/end) ──────────────────────
// Auto-triggers exactly 20 minutes after session end / countdown completion.
export const POST_SESSION_BUFFER_MINUTES = 20;

export const SESSION_DURATIONS_MINUTES = {
  Qualifying: 60,
  Race: 120,
  Sprint: 60,
  "Sprint Qualifying": 44,
  "Sprint Shootout": 44,
};

export const SESSION_BUFFERS = {
  Qualifying: 80, // 60 min session + 20 min buffer
  Race: 140, // 120 min race + 20 min buffer
  Sprint: 50, // 30 min race + 20 min buffer
  "Sprint Qualifying": 64, // 44 min max + 20 min buffer
  "Sprint Shootout": 64, // alias
};

// ─── Keywords to search article titles on formula1.com ──────────────────────
// ─── Keywords to search article titles on formula1.com ──────────────────────
// Ordered by priority — first match wins.
export const SESSION_KEYWORDS = {
  Qualifying: ["pole", "qualifying", "grid"],
  Race: ["wins", "victory", "race report", "grand prix", "result"],
  Sprint: ["sprint race", "sprint result", "sprint"],
  "Sprint Qualifying": ["sprint shootout", "sprint qualifying", "sprint grid"],
  "Sprint Shootout": ["sprint shootout", "sprint qualifying", "sprint grid"],
};

// ─── Blocked Keywords (articles that should never be converted into session posts) ───
export const BLOCKED_KEYWORDS = [
  "betting",
  "bet",
  "bets",
  "odds",
  "tips",
  "quiz",
  "gambling",
  "stake",
  "prediction",
  "predictions",
  "preview",
  "tickets",
  "travel",
  "podcast",
  "f1-kids",
  "merchandise",
  "storylines",
  "trivia",
  "facts",
  "watch closely",
];


// ─── Tags applied to MongoDB posts ─────────────────────────────────────────
export const SESSION_TAGS = {
  Qualifying: ["F1", "Qualifying", "Pole Position"],
  Race: ["F1", "Race", "Grand Prix", "Race Report"],
  Sprint: ["F1", "Sprint", "Sprint Race"],
  "Sprint Qualifying": ["F1", "Sprint", "Sprint Qualifying"],
  "Sprint Shootout": ["F1", "Sprint", "Sprint Qualifying"],
};

// ─── OpenF1 API ─────────────────────────────────────────────────────────────
export const OPENF1_BASE = "https://api.openf1.org/v1";

// Session types we care about (others like Practice are ignored)
export const TRACKED_SESSION_TYPES = [
  "Qualifying",
  "Race",
  "Sprint",
  "Sprint Qualifying",
  "Sprint Shootout",
];

// ─── formula1.com selectors (verified from live DOM inspection) ─────────────
export const F1_LATEST_URL = "https://www.formula1.com/en/latest?page=1";

// Max age (hours) — only consider articles published within this window
export const ARTICLE_MAX_AGE_HOURS = 36;

// Number of intro paragraphs to extract as "gist"
export const GIST_PARAGRAPH_COUNT = 4;

// Max retries if no matching article is found
export const SCRAPE_MAX_RETRIES = 2;
export const SCRAPE_RETRY_DELAY_MS = 30_000; // 30 seconds between retries

// ─── F1-Bot system author name (auto-created if missing) ────────────────────
export const F1_BOT_NAME = "F1-Bot";
export const F1_BOT_EMAIL = "f1bot@f1-react.local";
