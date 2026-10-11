import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "../components/header";
import "./home.css";
import CountDown from "../components/countDown";
import GlobeHeroTeaser from "../components/globeHeroTeaser";

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

        // Only cache real MongoDB posts, not fallback posts
        const isFallback = sortedPosts.some((p) =>
          String(p._id || "").startsWith("fallback-")
        );
        if (!isFallback && sortedPosts.length > 0) {
          cache.set("f1_posts", sortedPosts);
        }

        return sortedPosts;
      })
      .finally(() => {
        postsPromise = null;
      });
  }

  return postsPromise;
}

const POSTS_PER_PAGE = 4;

function getVisiblePages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3)
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export function Home({ year }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

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

    const handleAutoSync = () => {
      console.log("[Home] Post auto-synced! Refreshing posts feed...");
      cache.delete("f1_posts");
      loadPosts()
        .then((updated) => setPosts(updated))
        .catch(console.error);
    };

    window.addEventListener("f1:post-auto-synced", handleAutoSync);

    return () => {
      cancelled = true;
      window.removeEventListener("f1:post-auto-synced", handleAutoSync);
    };
  }, []);

  const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE);
  const paginatedPosts = posts.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  );

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    const el = document.getElementById("latest-posts");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

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
            <div className="hero-cta-group">
              <Link to="/globe" className="hero-btn globe-cta-btn">
                <span className="cta-globe-icon">🌐</span> 3D World Tour
              </Link>
              <a href="#latest-posts" className="hero-btn primary-btn">
                Latest News
              </a>
              <a href="/standings" className="hero-btn secondary-btn">
                Standings
              </a>
            </div>
          </div>
          <div className="hero-timeline-row">
            <CountDown year={year} />
          </div>

          <div className="hero-teaser-row">
            <GlobeHeroTeaser year={year} />
          </div>
        </section>

        <section className="latest-posts" id="latest-posts">
          <h2>Latest Posts</h2>
          {loading && (
            <div className="loading-text">
              <p>Loading latest posts...</p>{" "}
            </div>
          )}
          {error && <p className="error-text">Error: {error}</p>}

          {!loading && !error && (
            <>
              <div className="posts-container">
                {paginatedPosts.map((post) => (
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

              {totalPages > 1 && (
                <div className="posts-pagination">
                  <div className="pagination-info">
                    Showing {(currentPage - 1) * POSTS_PER_PAGE + 1}–
                    {Math.min(currentPage * POSTS_PER_PAGE, posts.length)} of{" "}
                    {posts.length} posts
                  </div>
                  <div className="pagination-controls">
                    <button
                      className="pagination-btn nav-btn"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      aria-label="Previous page"
                    >
                      ‹ Prev
                    </button>

                    <div className="pagination-numbers">
                      {getVisiblePages(currentPage, totalPages).map((item, idx) =>
                        item === "..." ? (
                          <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                            …
                          </span>
                        ) : (
                          <button
                            key={item}
                            className={`pagination-btn number-btn ${
                              currentPage === item ? "active" : ""
                            }`}
                            onClick={() => handlePageChange(item)}
                            aria-label={`Go to page ${item}`}
                          >
                            {item}
                          </button>
                        )
                      )}
                    </div>

                    <button
                      className="pagination-btn nav-btn"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      aria-label="Next page"
                    >
                      Next ›
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}

export default Home;
