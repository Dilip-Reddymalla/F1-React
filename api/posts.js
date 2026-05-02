import connectDb from "../lib/mongoose.js";
import Post from "../lib/postModel.js";

let cachedPosts = null;
let cachedAt = 0;
const cacheTtlMs = 30 * 1000;

export default async function handler(req, res) {
  try {
    const now = Date.now();
    if (cachedPosts && now - cachedAt < cacheTtlMs) {
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      return res.status(200).json(cachedPosts);
    }

    await connectDb();
    const posts = await Post.find({ tags: { $in: ["F1"] } })
      .select("title content coverImage tags createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    cachedPosts = posts;
    cachedAt = now;

    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
}
