/**
 * PostWriter module — creates F1 auto-posts in MongoDB.
 *
 * Handles:
 * - F1-Bot system user creation (auto-creates if not found)
 * - Slug generation and deduplication
 * - Post document creation with correct schema fields
 */

import slugify from "slugify";
import connectDb from "../mongoose.js";
import Post from "../postModel.js";
import { SESSION_TAGS, F1_BOT_NAME, F1_BOT_EMAIL } from "./config.js";

// Cached bot user ID (fetched once per cold start)
let cachedBotId = null;

/**
 * Get or create the F1-Bot system user in the database.
 * Uses the existing "user" model/collection.
 *
 * @returns {Promise<import("mongoose").Types.ObjectId>}
 */
async function getOrCreateBotUser() {
  if (cachedBotId) return cachedBotId;

  await connectDb();

  // We need to work with the user collection directly via mongoose
  const mongoose = (await import("mongoose")).default;

  // Try to find existing bot user
  const usersCollection = mongoose.connection.collection("users");
  let botUser = await usersCollection.findOne({ email: F1_BOT_EMAIL });

  if (!botUser) {
    console.log("[postWriter] Creating F1-Bot system user...");
    const result = await usersCollection.insertOne({
      name: F1_BOT_NAME,
      email: F1_BOT_EMAIL,
      password: "not-a-real-login", // Bot doesn't log in
      role: "system",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cachedBotId = result.insertedId;
    console.log(`[postWriter] F1-Bot created with _id: ${cachedBotId}`);
  } else {
    cachedBotId = botUser._id;
    console.log(`[postWriter] F1-Bot found with _id: ${cachedBotId}`);
  }

  return cachedBotId;
}

/**
 * Generate a URL-safe slug from the article title.
 * Appends a short hash if the slug already exists.
 *
 * @param {string} title
 * @returns {string}
 */
function generateSlug(title) {
  return slugify(title, {
    lower: true,
    strict: true, // Remove special characters
    trim: true,
  });
}

/**
 * Check if a post with this slug already exists (deduplication).
 *
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
export async function postExists(slug) {
  await connectDb();
  const existing = await Post.findOne({ slug }).select("_id").lean();
  return !!existing;
}

/**
 * Check if an official post for a completed session already exists in MongoDB.
 *
 * @param {{ sessionType: string, sessionName: string, location: string, country: string, meetingName: string }} session
 * @returns {Promise<import("../postModel.js").default | null>}
 */
export async function findExistingSessionPost(session) {
  try {
    await connectDb();

    const sessionName = (session.sessionName || session.sessionType || "").toLowerCase();
    const sessionType = (session.sessionType || "").toLowerCase();
    const loc = (session.location || "").toLowerCase();
    const country = (session.country || "").toLowerCase();
    const meeting = (session.meetingName || "").toLowerCase();

    const locKeywords = [loc, country, meeting]
      .map((s) => s.replace(/grand prix|gp/gi, "").trim())
      .filter((s) => s.length >= 3);

    if (locKeywords.length === 0) return null;

    const locRegex = new RegExp(locKeywords.join("|"), "i");

    const isSprintQuali =
      sessionName.includes("sprint quali") ||
      (sessionType.includes("qualifying") && sessionName.includes("sprint"));
    const isSprint = (sessionName === "sprint" || sessionType === "sprint") && !isSprintQuali;
    const isQuali = sessionType.includes("qualifying") && !isSprintQuali;
    const isRace = sessionType.includes("race") && !isSprint;

    const candidatePosts = await Post.find({
      $or: [
        { title: locRegex },
        { slug: locRegex },
        { tags: { $in: locKeywords.map((k) => new RegExp(k, "i")) } },
      ],
    }).lean();

    for (const post of candidatePosts) {
      const title = (post.title || "").toLowerCase();
      const slug = (post.slug || "").toLowerCase();
      const tags = (post.tags || []).map((t) => t.toLowerCase());

      if (isSprintQuali) {
        if (
          (title.includes("sprint") &&
            (title.includes("qualifying") || title.includes("shootout") || title.includes("pole"))) ||
          (slug.includes("sprint") && (slug.includes("qualifying") || slug.includes("pole"))) ||
          tags.includes("sprint qualifying")
        ) {
          return post;
        }
      } else if (isSprint) {
        if (
          title.includes("sprint") &&
          !title.includes("qualifying") &&
          !title.includes("shootout") &&
          !slug.includes("qualifying")
        ) {
          return post;
        }
      } else if (isQuali) {
        if (
          !title.includes("sprint") &&
          !slug.includes("sprint") &&
          (title.includes("qualifying") ||
            title.includes("pole position") ||
            slug.includes("qualifying") ||
            tags.includes("qualifying"))
        ) {
          return post;
        }
      } else if (isRace) {
        if (
          !title.includes("sprint") &&
          !slug.includes("sprint") &&
          (title.includes("race") ||
            title.includes("grand prix") ||
            title.includes("wins") ||
            title.includes("victory") ||
            tags.includes("race report"))
        ) {
          return post;
        }
      }
    }

    return null;
  } catch (err) {
    console.warn("[postWriter] Error checking existing session post:", err.message);
    return null;
  }
}

/**
 * Create and save an auto-generated F1 post.
 *
 * @param {string} sessionType - e.g. "Qualifying", "Race"
 * @param {{title: string, coverImage: string, content: string, sourceUrl: string}} articleData
 * @param {{location: string, country: string, meetingName: string}} sessionInfo
 * @returns {Promise<{success: boolean, slug?: string, reason?: string}>}
 */
export async function createAutoPost(sessionType, articleData, sessionInfo = {}) {
  try {
    await connectDb();

    // Generate slug
    const slug = generateSlug(articleData.title);

    if (!slug) {
      return { success: false, reason: "Could not generate slug from title." };
    }

    // Deduplication check
    if (await postExists(slug)) {
      console.log(`[postWriter] Post already exists: "${slug}" — skipping.`);
      return { success: false, reason: `Duplicate: ${slug}` };
    }

    // Get or create bot user
    const authorId = await getOrCreateBotUser();

    // Determine tags
    const baseTags = SESSION_TAGS[sessionType] || ["F1"];
    const tags = [...baseTags];
    if (sessionInfo.meetingName) {
      tags.push(sessionInfo.meetingName);
    }
    if (sessionInfo.country) {
      tags.push(sessionInfo.country);
    }

    // Add source attribution to content
    const contentWithAttribution = `${articleData.content}\n<p class="auto-post-source"><em>Source: <a href="${articleData.sourceUrl}" target="_blank" rel="noopener">formula1.com</a></em></p>`;

    // Create the post document
    const post = new Post({
      title: articleData.title.slice(0, 200),
      slug,
      content: contentWithAttribution,
      coverImage: articleData.coverImage || "",
      author: authorId,
      tags,
      status: "published",
      approvalStatus: "approved",
    });

    await post.save();

    console.log(`[postWriter] ✅ Auto-posted: "${post.title}" (slug: ${slug})`);
    return { success: true, slug };
  } catch (err) {
    console.error("[postWriter] Failed to create post:", err.message);
    return { success: false, reason: err.message };
  }
}
