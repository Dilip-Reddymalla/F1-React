import "../lib/loadEnv.js";
import connectDb from "../lib/mongoose.js";
import Post from "../lib/postModel.js";

const LIMIT = parseInt(process.argv[2] || "60", 10);

await connectDb();

const posts = await Post.find({})
  .select("title slug tags createdAt author")
  .sort({ createdAt: -1 })
  .limit(LIMIT)
  .lean();

console.log(`Total fetched: ${posts.length}`);
for (const p of posts) {
  console.log(
    `${p.createdAt ? p.createdAt.toISOString().slice(0, 10) : "????-??-??"}  ` +
    `[${(p.tags || []).join(",")}]  ` +
    `${p.title}  (slug: ${p.slug})`
  );
}
process.exit(0);
