import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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

function localApiPostsPlugin() {
  return {
    name: "local-api-posts-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path === "/api/refresh-posts") {
          if (!res.status) {
            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
          }
          if (!res.json) {
            res.json = (payload) => {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify(payload));
              return res;
            };
          }

          try {
            const { default: refreshHandler } = await import("./api/refresh-posts.js");
            await refreshHandler(req, res);
          } catch (error) {
            console.error("Local refresh-posts handler error:", error);
            res.status(500).json({ error: error.message });
          }
          return;
        }

        if (path === "/api/cron/auto-post") {
          if (!res.status) {
            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
          }
          if (!res.json) {
            res.json = (payload) => {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify(payload));
              return res;
            };
          }

          try {
            const { default: cronHandler } = await import("./api/cron/auto-post.js");
            await cronHandler(req, res);
          } catch (error) {
            console.error("Local cron handler error:", error);
            res.status(500).json({ error: error.message });
          }
          return;
        }
        next();
      });

      server.middlewares.use("/api/posts", async (req, res, next) => {
        if (req.method && req.method !== "GET") {
          next();
          return;
        }

        if (!res.status) {
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
        }

        if (!res.json) {
          res.json = (payload) => {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(payload));
            return res;
          };
        }

        try {
          const { default: postsHandler } = await import("./api/posts.js");
          await postsHandler(req, res);
        } catch (error) {
          console.warn(
            "Local API handler failed. Using fallback posts.",
            error?.message,
          );
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader(
            "Cache-Control",
            "public, max-age=30, stale-while-revalidate=60",
          );
          res.statusCode = 200;
          res.end(JSON.stringify(fallbackPosts));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApiPostsPlugin()],
  server: {
    host: "0.0.0.0",
    middlewareMode: false,
  },
  preview: {
    host: "0.0.0.0",
  },
});
