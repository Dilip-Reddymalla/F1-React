/**
 * Clean invalid posts from MongoDB.
 *
 * IMPORTANT: only deletes posts whose SOURCE is formula1.com (the auto-scraped
 * F1 posts are identified by the `auto-post-source` attribution in their
 * content). Manual/curated posts without that source are left untouched.
 *
 * Usage:
 *   node scripts/cleanInvalidPosts.mjs [--dry-run]
 */
import "../lib/loadEnv.js";
import connectDb from "../lib/mongoose.js";
import Post from "../lib/postModel.js";

const DRY_RUN = process.argv.includes("--dry-run");

const INVALID_SLUGS = [
  "one-piece-elbaph-arc-tp5-9c",                                        // anime
  "the-f1-2026-grid-takes-shape-t9pds0",                                // pre-season grid preview
  "long-straights-new-rules-china-gp-tests-the-2026-f1-cars-gvk0xr",    // technical
  "mercedes-dominates-the-australian-grand-prix-i3noej",                // generic, not official report
  "the-new-f1-2025-grid-is-here-9cpnql",                                // 2025 preview
  "lando-norris-wins-the-2025-drivers-championship-vghjm4",             // 2025 summary
  "mclaren-racing-wins-2025-constructors-championship-zfu5it",          // 2025 summary
  "antonelli-takes-championship-lead-with-victory-at-japanese-grand-prix-eppqhh", // generic, not official report
  "mclaren-upgrades-shine-ferrari-chases-red-bull-progress-miami-gp-sprint",     // analysis
  "it-was-such-a-mess-arvid-lindblad-reflects-on-2026-formula-1-las-vegas-grand-prix-qualifying-ahead-of-p5-start", // driver quote, not a report
  "lewis-hamilton-charles-leclerc-and-max-verstappen-all-hit-with-sao-paulo-grand-prix-penalties-after-power-unit-changes", // news item, not a session report
  "fred-vasseur-sets-out-ferraris-approach-to-mexico-city-grand-prix-after-lewis-hamiltons-fantastic-job-in-qualifying", // team-principal quote
];

function isFromF1Source(post) {
  const content = String(post.content || "");
  // Auto-scraped posts embed a source attribution to formula1.com.
  return content.includes("auto-post-source") && content.includes("formula1.com");
}

await connectDb();

const posts = await Post.find({ slug: { $in: INVALID_SLUGS } }).select("slug title content").lean();

const f1Sourced = posts.filter(isFromF1Source);
const other = posts.filter((p) => !isFromF1Source(p));

console.log(`Found ${posts.length} invalid post(s); ${f1Sourced.length} from formula1.com (deletable), ${other.length} other (kept).\n`);

for (const p of f1Sourced) {
  console.log(`  [F1 source] ${p.slug}\n    ${p.title}`);
}
for (const p of other) {
  console.log(`  [kept — not F1-scraped] ${p.slug}\n    ${p.title}`);
}

if (DRY_RUN) {
  console.log("\n[dry-run] No changes made.");
  process.exit(0);
}

if (f1Sourced.length > 0) {
  const slugs = f1Sourced.map((p) => p.slug);
  const res = await Post.deleteMany({ slug: { $in: slugs } });
  console.log(`\nDeleted ${res.deletedCount} F1-sourced invalid post(s).`);
} else {
  console.log("\nNothing to delete (no F1-sourced invalid posts).");
}

console.log(`Total posts remaining: ${await Post.countDocuments()}`);
process.exit(0);
