import { useEffect, useState } from "react";
import { Header } from "../components/header";
import "./home.css";
import CountDown from "../components/countDown";

const cache = new Map();
let postsPromise = null;

async function loadPosts() {
  if (cache.has("f1_posts")) {
    return cache.get("f1_posts");
  }

  if (!postsPromise) {
    postsPromise = fetch("/api/posts")
      .then(async (res) => {
        const contentType = res.headers.get("content-type") || "";
        const text = await res.text();

        if (!res.ok) {
          console.error(
            "Non-OK response from /api/posts:",
            res.status,
            res.statusText,
            text,
          );
          throw new Error(
            `Failed to fetch posts: ${res.status} ${res.statusText}`,
          );
        }

        if (!contentType.includes("application/json")) {
          console.error("Non-JSON response from /api/posts:", text);
          throw new Error(
            "Invalid JSON response from API; check Network tab for details",
          );
        }

        const data = JSON.parse(text);
        const postsArray = Array.isArray(data) ? data : data.posts || [];
        const sortedPosts = postsArray.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        );

        cache.set("f1_posts", sortedPosts);
        return sortedPosts;
      })
      .finally(() => {
        postsPromise = null;
      });
  }

  return postsPromise;
}

export function Home({year}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPosts() {
      if (cache.has("f1_posts")) {
        setPosts(cache.get("f1_posts"));
        setLoading(false);
        return;
      }

      try {
        const sortedPosts = await loadPosts();
        console.log("Fetched posts:", sortedPosts);

        if (!cancelled) {
          setPosts(sortedPosts);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    fetchPosts();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Header />
      <main>
        <section className="intro animated-hero">
          <div className="hero-content">
            <span className="hero-badge">Pinnacle of Motorsport</span>
            <h1>
              Feel the Apex. <br />
              Experience the Thrill.
            </h1>
            <p>
              Ignite your passion for Formula 1. Dive into breaking news,
              real-time championship standings, deep technical analysis, and
              exclusive driver insights.
            </p>
            <CountDown year={year}  />
            <div className="hero-cta-group">
              <a href="#latest-posts" className="hero-btn primary-btn">
                Latest News
              </a>
              <a href="/standings" className="hero-btn secondary-btn">
                View Standings
              </a>
            </div>
          </div>
        </section>

        <section className="latest-posts" id="latest-posts">
          <h2>Latest Post</h2>
          {loading && (
            <div className="loading-text">
              <p>Loading latest posts...</p>{" "}
            </div>
          )}
          {error && <p className="error-text">Error: {error}</p>}

          {!loading && !error && (
            <div className="posts-container">
              {posts.map((post) => (
                <article key={post._id} className="post-card">
                  <div className="post-image-container">
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      className="post-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="post-content-container">
                    <div className="post-tags">
                      {post.tags.map((tag, idx) => (
                        <span key={idx} className="post-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h3 className="post-title">{post.title}</h3>
                    <div className="post-date">
                      {new Date(post.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                    <div
                      className="post-body"
                      dangerouslySetInnerHTML={{ __html: post.content }}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default Home;
