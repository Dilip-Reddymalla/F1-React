import "../lib/loadEnv.js";
import connectDb from "../lib/mongoose.js";
import Post from "../lib/postModel.js";

const fallbackPosts = [
  {
    _id: "fallback-1",
    title: "McLaren storms to a dominant weekend win",
    content:
      "<p>McLaren delivered a commanding showing across the weekend, with pace that looked strong in both qualifying trim and race conditions.</p>",
    coverImage:
      "https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1200&q=80",
    tags: ["F1", "Race Week"],
    createdAt: "2026-09-04T08:00:00.000Z",
  },
  {
    _id: "fallback-2",
    title: "Ferrari refines the silver arrows challenge",
    content:
      "<p>The Scuderia focused on setup changes overnight, aiming to close the gap and turn one-lap speed into tire management advantage.</p>",
    coverImage:
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
    tags: ["F1", "Technical"],
    createdAt: "2026-09-02T08:00:00.000Z",
  },
  {
    _id: "fallback-3",
    title: "Title fight tightens with strategy swings",
    content:
      "<p>The championship battle remains intense as tire windows and pit timing become decisive in the closing stages.</p>",
    coverImage:
      "https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=1200&q=80",
    tags: ["F1", "Championship"],
    createdAt: "2026-08-28T08:00:00.000Z",
  },
];

let cachedPosts = null;
let cachedAt = 0;
const cacheTtlMs = 30 * 1000;

export default async function handler(req, res) {
  try {
    const env = globalThis.process?.env ?? {};
    const now = Date.now();

    // Query parameters
    let pageNum = NaN;
    let limitNum = NaN;
    try {
      const urlObj = new URL(req.url || "", "http://localhost");
      pageNum = parseInt(req.query?.page || urlObj.searchParams.get("page"), 10);
      limitNum = parseInt(req.query?.limit || urlObj.searchParams.get("limit"), 10);
    } catch {
      pageNum = parseInt(req.query?.page, 10);
      limitNum = parseInt(req.query?.limit, 10);
    }

    const isPaginated = !isNaN(pageNum) && pageNum > 0 && !isNaN(limitNum) && limitNum > 0;

    // Use in-memory cache for default (unpaginated) fetch
    if (!isPaginated && cachedPosts && now - cachedAt < cacheTtlMs) {
      res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=10");
      return res.status(200).json(cachedPosts);
    }

    let allPosts = fallbackPosts;
    let totalCount = fallbackPosts.length;
    let isLiveDb = false;

    if (env.MONGODB_URI) {
      try {
        await connectDb();
        const filter = { tags: { $in: ["F1"] } };

        if (isPaginated) {
          totalCount = await Post.countDocuments(filter);
          const skip = (pageNum - 1) * limitNum;
          const paginatedPosts = await Post.find(filter)
            .select("title content coverImage tags createdAt updatedAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

          console.log(`[api/posts] Serving ${paginatedPosts.length} paginated posts from MongoDB.`);
          res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=10");
          return res.status(200).json({
            posts: paginatedPosts,
            page: pageNum,
            limit: limitNum,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limitNum),
          });
        }

        allPosts = await Post.find(filter)
          .select("title content coverImage tags createdAt updatedAt")
          .sort({ createdAt: -1 })
          .lean();

        isLiveDb = true;
        console.log(`[api/posts] Serving ${allPosts.length} posts from MongoDB.`);
      } catch (dbError) {
        console.warn("[api/posts] MongoDB query failed. Using fallback posts:", dbError.message);
      }
    } else {
      console.warn("[api/posts] MONGODB_URI is not set. Using fallback posts.");
    }

    if (isPaginated) {
      const skip = (pageNum - 1) * limitNum;
      const slice = allPosts.slice(skip, skip + limitNum);
      return res.status(200).json({
        posts: slice,
        page: pageNum,
        limit: limitNum,
        total: allPosts.length,
        totalPages: Math.ceil(allPosts.length / limitNum),
      });
    }

    if (isLiveDb) {
      cachedPosts = allPosts;
      cachedAt = now;
    }

    res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=10");
    res.status(200).json(allPosts);
  } catch (error) {
    console.error("[api/posts] Failed to load posts:", error);
    res.status(200).json(fallbackPosts);
  }
}
