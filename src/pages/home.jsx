import { useEffect, useState } from "react";
import { Header } from "../components/header";
import "./home.css";

const cache = new Map();

export function Home() {
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
        const res = await fetch("https://modern-blog-page-backend.onrender.com/api/get/postByTag/F1");
        if (!res.ok) {
          throw new Error("Failed to fetch posts");
        }
        const data = await res.json();

        if (!cancelled) {
          // Sort posts by date descending (latest first)
          const sortedPosts = data.posts.sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
          );
          cache.set("f1_posts", sortedPosts);

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
            <h1>Feel the Apex. <br />Experience the Thrill.</h1>
            <p>
              Ignite your passion for Formula 1. Dive into breaking news, real-time championship standings, deep technical analysis, and exclusive driver insights.
            </p>
            <div className="hero-cta-group">
              <a href="#latest-posts" className="hero-btn primary-btn">Latest News</a>
              <a href="/standings" className="hero-btn secondary-btn">View Standings</a>
            </div>
          </div>
        </section>

        <section className="latest-posts" id="latest-posts">
          <h2>Latest Post</h2>
          {loading && <p className="loading-text">Loading latest posts...</p>}
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
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
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
