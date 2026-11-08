import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "../components/header";
import { DriverImage } from "../components/driverImage";
import { fetchRaceEngine, fetchRecentComparison } from "../services/predictions";
import "./predictions.css";

const pct = (x) => `${(x * 100).toFixed(1)}%`;

const MODES = [
  { id: "pre", label: "Pre-Quali" },
  { id: "post", label: "Post-Quali" },
  { id: "compare", label: "Compare Past" },
];

// Approximate 2026 constructor colours (fallback grey).
const TEAM_COLORS = {
  "Red Bull": "#3671c6",
  Ferrari: "#e8002d",
  Mercedes: "#27f4d2",
  McLaren: "#ff8000",
  "Aston Martin": "#229971",
  Alpine: "#ff87bc",
  Williams: "#64c4ff",
  RB: "#6692ff",
  Audi: "#52e252",
  Sauber: "#52e252",
  Haas: "#b6babd",
  Cadillac: "#c8102e",
};
const teamColor = (name) => TEAM_COLORS[name] || "#7a7f8a";

// Real driver photo (Wikipedia thumbnail, same source as the standings pages)
// wrapped in a team-coloured ring. Falls back to the F1 logo if unavailable.
function DriverPhoto({ name, team, size = 42 }) {
  const parts = String(name || "").trim().split(/\s+/);
  const family = parts.pop() || "";
  const given = parts.join(" ") || family;
  return (
    <div
      className="photo-ring"
      style={{ width: size, height: size, "--tc": teamColor(team) }}
    >
      <DriverImage givenName={given} familyName={family} imgClassName="pred-photo" />
    </div>
  );
}

function Hero({ engine, source }) {
  const sims = (engine.engine && engine.engine.match(/\d[\d,]*/)) ? engine.engine.match(/\d[\d,]*/)[0] : "10,000";
  return (
    <section className="pred-hero reveal">
      <div className="pred-hero-bg">
        <span className="orb o1" />
        <span className="orb o2" />
        <div className="grid-floor" />
      </div>
      <div className="pred-hero-content">
        <span className="pred-eyebrow">🏁 ML Race Predictions</span>
        <h1 className="pred-title">
          Next Race <span className="line">Forecast</span>
        </h1>
        <div className="pred-race-chip">
          <span className="pred-race-name">🏁 {engine.race}</span>
          <span className="pred-race-round">Round {engine.round}</span>
        </div>
        <div className="pred-meta">
          <span>🗓️ <b>{new Date(engine.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</b></span>
          <span>📍 <b>{engine.circuit}</b></span>
          <span>🏆 <b>Season {engine.season}</b></span>
        </div>
        <div className="pred-badges">
          <span className="pred-badge stage"><span className="dot" />{engine.stage || "pre-qualifying"}</span>
          <span className={`pred-badge ${source === "live" ? "live" : "snapshot"}`}>
            <span className="dot" />{source === "live" ? "Live model" : "Static snapshot"}
          </span>
          <span className="pred-badge">{engine.engine || "Monte Carlo"}</span>
        </div>
        {source !== "live" && (
          <p className="pred-hint">
            Showing the saved snapshot. For live model data, run
            <code> npm run dev </code> (starts the ML API + site together).
          </p>
        )}
        <div className="pred-stats">
          <div className="stat-chip"><span className="stat-label">Engine</span><span className="stat-value">Monte Carlo</span></div>
          <div className="stat-chip"><span className="stat-label">Simulations</span><span className="stat-value">{sims}</span></div>
          <div className="stat-chip"><span className="stat-label">Field</span><span className="stat-value">{engine.predictions.length} drivers</span></div>
          <div className="stat-chip"><span className="stat-label">Data</span><span className="stat-value">{source === "live" ? "Live API" : "Snapshot"}</span></div>
        </div>
      </div>
    </section>
  );
}

function ModeSelector({ mode, onChange }) {
  return (
    <div className="pred-modes" role="tablist" aria-label="Prediction mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          className={`mode-btn ${mode === m.id ? "active" : ""}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function WinnerSection({ predictions }) {
  const sorted = [...predictions].sort((a, b) => b.winner_probability - a.winner_probability);
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3, 9);
  const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;
  const podiumClass = ["podium-2", "podium-1", "podium-3"];

  return (
    <section className="glass reveal">
      <h2 className="pred-section-title">Winner Probability</h2>

      {top3.length > 0 && (
        <div className="podium">
          {podiumOrder.map((p, i) => {
            const cls = podiumClass[i % 3];
            return (
              <div className="podium-step" key={p.driver}>
                <DriverPhoto name={p.driver} team={p.constructor} size={48} />
                <div className={`podium-block ${cls}`}>{i === 1 ? 1 : i === 0 ? 2 : 3}</div>
                <div className="podium-name">{p.driver}</div>
                <div className="podium-team">{pct(p.winner_probability)}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="leaderboard" style={{ marginTop: "1.4rem" }}>
        {rest.map((p, i) => (
          <div className="lb-row" key={p.driver} style={{ animationDelay: `${i * 55}ms` }}>
            <span className={`lb-rank ${i === 0 ? "r4" : "rank"}`}>{i + 4}</span>
            <div className="lb-main">
              <div className="lb-name">{p.driver}</div>
              <div className="lb-team">{p.constructor}</div>
            </div>
            <div className="lb-bar-track">
              <div className="lb-bar" style={{ width: `${Math.max(2, p.winner_probability * 100)}%` }} />
            </div>
            <div className="lb-value">{pct(p.winner_probability)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OrderList({ predictions, selected, onSelect }) {
  const ordered = [...predictions].sort((a, b) => a.expected_rank - b.expected_rank);
  return (
    <section className="glass reveal">
      <h2 className="pred-section-title">Predicted Finishing Order</h2>
      <div className="order-list">
        {ordered.map((p, i) => (
          <div
            key={p.driver}
            className={`order-row ${selected?.driver === p.driver ? "selected" : ""} ${i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : ""}`}
            onClick={() => onSelect(p)}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="order-pos">{[<span key="1" className="pos-1">1</span>, <span key="2" className="pos-2">2</span>, <span key="3" className="pos-3">3</span>][i] || i + 1}</span>
            <DriverPhoto name={p.driver} team={p.constructor} />
            <div className="order-body">
              <div className="order-driver">{p.driver}</div>
              <div className="order-team">{p.constructor}</div>
            </div>
            <div className="order-metrics">
              <div className="order-metric">
                <span className="m-label">Exp</span>
                <span className="m-value">{p.expected_rank.toFixed(2)}</span>
              </div>
              <div className="order-metric">
                <span className="m-label">Win</span>
                <span className="m-value">{pct(p.winner_probability)}</span>
                <div className="mini-track"><div className="mini-fill win" style={{ width: `${Math.max(2, p.winner_probability * 100)}%` }} /></div>
              </div>
              <div className="order-metric">
                <span className="m-label">DNF</span>
                <span className="m-value">{pct(p.dnf_probability)}</span>
                <div className="mini-track"><div className="mini-fill dnf" style={{ width: `${Math.max(2, p.dnf_probability * 100)}%` }} /></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// The actual distribution bars, shared by the inline desktop panel and the
// mobile modal.
function DistContent({ selected }) {
  const positions = selected.positions || {};
  const entries = Object.entries(positions).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxVal = Math.max(1, ...entries.map((e) => e[1]));
  return (
    <>
      <div className="dist-driver">
        <DriverPhoto name={selected.driver} team={selected.constructor} size={38} />
        {selected.driver}
      </div>
      <div className="dist-sub">{selected.constructor} · Expected rank <b style={{ color: "#ff6a5c" }}>{selected.expected_rank.toFixed(2)}</b></div>
      <div className="dist-list">
        {entries.map(([pos, val], i) => (
          <div className="dist-item" key={pos} style={{ animationDelay: `${i * 40}ms` }}>
            <span className="dist-pos">{pos}</span>
            <div className="dist-track">
              <div className="dist-fill" style={{ width: `${(val / maxVal) * 100}%` }} />
            </div>
            <span className="dist-val">{pct(val)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function DistributionPanel({ selected }) {
  if (!selected) {
    return (
      <section className="glass reveal dist-panel">
        <h2 className="pred-section-title">Position Distribution</h2>
        <div className="dist-empty">Select a driver to see their P1–P10 probabilities.</div>
      </section>
    );
  }
  return (
    <section className="glass reveal dist-panel">
      <h2 className="pred-section-title">Position Distribution</h2>
      <DistContent selected={selected} />
    </section>
  );
}

// Mobile-only modal for the position distribution (mirrors the standings modal).
function DistModal({ selected, onClose }) {
  if (!selected) return null;
  return (
    <div className="dist-modal-backdrop" onClick={onClose}>
      <div className="dist-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dist-modal-header">
          <span className="pred-section-title">Position Distribution</span>
          <button className="dist-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dist-modal-body">
          <DistContent selected={selected} />
        </div>
        <div className="dist-modal-footer">
          <button type="button" className="dist-modal-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function DnfRisk({ predictions }) {
  const top = [...predictions].sort((a, b) => b.dnf_probability - a.dnf_probability).slice(0, 12);
  return (
    <section className="glass reveal">
      <h2 className="pred-section-title">DNF Risk</h2>
      <div className="dnf-list">
        {top.map((p, i) => (
          <div className="dnf-row" key={p.driver} style={{ animationDelay: `${i * 45}ms` }}>
            <div className="dnf-top">
              <span className="dnf-name">{p.driver}</span>
              <span className="dnf-num">{pct(p.dnf_probability)}</span>
            </div>
            <div className="dnf-track"><div className="dnf-fill" style={{ width: `${Math.max(2, p.dnf_probability * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComparisonView({ data }) {
  const agg = data.aggregate || {};
  return (
    <>
      <section className="pred-hero reveal">
        <div className="pred-hero-bg"><span className="orb o2" /><div className="grid-floor" /></div>
        <div className="pred-hero-content">
          <span className="pred-eyebrow">📊 Prediction vs Reality</span>
          <h1 className="pred-title">Recent <span className="line">Accuracy</span></h1>
          <div className="pred-meta">
            <span>🔢 <b>Last {data.races.length} races</b></span>
            <span>🏆 <b>Winner hit rate</b></span>
          </div>
          <div className="pred-stats">
            <div className="stat-chip"><span className="stat-label">Winner hit</span><span className="stat-value">{pct(agg.winner_hit_rate)}</span></div>
            <div className="stat-chip"><span className="stat-label">Spearman</span><span className="stat-value">{agg.spearman?.toFixed(3)}</span></div>
            <div className="stat-chip"><span className="stat-label">Top-3 overlap</span><span className="stat-value">{pct(agg.top3_overlap)}</span></div>
            <div className="stat-chip"><span className="stat-label">Expected MAE</span><span className="stat-value">{agg.expected_mae}</span></div>
          </div>
        </div>
      </section>

      <section className="glass reveal">
        <h2 className="pred-section-title">Race-by-race</h2>
        <div className="table-wrap">
          <table className="order-table cmp-table">
            <thead>
              <tr>
                <th>Race</th><th>Actual Winner</th><th>Predicted Winner</th><th>Hit</th><th>Spearman</th><th>Top-3</th><th>MAE</th>
              </tr>
            </thead>
            <tbody>
              {data.races.map((r) => (
                <tr key={`${r.season}-${r.round}`}>
                  <td className="table-driver">
                    R{r.round} · {r.race}
                    <div className="table-team">{new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                  </td>
                  <td className="table-driver">{r.actual_winner}</td>
                  <td className="table-driver">{r.predicted_winner}</td>
                  <td>{r.winner_hit ? <span className="hit-yes">✓</span> : <span className="hit-no">✗</span>}</td>
                  <td className="table-num">{r.spearman?.toFixed(3) ?? "—"}</td>
                  <td className="table-num">{pct(r.top3_overlap)}</td>
                  <td className="table-num">{r.expected_mae}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pred-notes" style={{ marginTop: "1rem" }}>
          <strong>How this works:</strong> models are trained only on data strictly
          before each held-out race (no leakage), then compared to the real result.
        </p>
      </section>
    </>
  );
}

export default function Predictions() {
  const [mode, setMode] = useState("pre");
  const [engine, setEngine] = useState(null);
  const [compare, setCompare] = useState(null);
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showDistModal, setShowDistModal] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
  );
  const mainRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (e) => setIsNarrow(e.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const loadData = useCallback(async (m) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setShowDistModal(false);
    try {
      if (m === "compare") {
        const { source: src, data } = await fetchRecentComparison(6);
        setCompare(data);
        setEngine(null);
        setSource(src);
      } else {
        const { source: src, data } = await fetchRaceEngine(m);
        setEngine(data);
        setCompare(null);
        setSource(src);
        if (!window.matchMedia("(max-width: 640px)").matches) {
          setSelected(data.predictions[0] || null);
        }
      }
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(mode);
  }, [mode, loadData]);

  const handleSelect = (driver) => {
    setSelected(driver);
    if (isNarrow) setShowDistModal(true);
  };

  useEffect(() => {
    if (!showDistModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showDistModal]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && showDistModal) setShowDistModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDistModal]);

  useEffect(() => {
    if ((!engine && !compare) || !mainRef.current) return;
    const els = mainRef.current.querySelectorAll(".reveal");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [engine, compare]);

  return (
    <>
      <Header />
      <main className="predictions-page" ref={mainRef}>
        <ModeSelector mode={mode} onChange={setMode} />

        {loading && <div className="pred-state">Loading…</div>}
        {error && <div className="pred-state">Error: {error}</div>}

        {!loading && !error && mode === "compare" && compare && (
          <ComparisonView data={compare} />
        )}

        {!loading && !error && mode !== "compare" && engine && (
          <>
            <Hero engine={engine} source={source} />
            <div className="checker" />

            <div className="pred-grid">
              <WinnerSection predictions={engine.predictions} />
              <OrderList
                predictions={engine.predictions}
                selected={selected}
                onSelect={handleSelect}
              />
            </div>

            <div className="pred-grid span2">
              <DistributionPanel selected={selected} />
              <DnfRisk predictions={engine.predictions} />
            </div>

            {showDistModal && (
              <DistModal selected={selected} onClose={() => setShowDistModal(false)} />
            )}

            <p className="pred-notes reveal">
              <strong>Methodology:</strong> the DNF model estimates each driver&apos;s
              chance of not finishing; the ranking model estimates finishing strength.
              The Monte Carlo engine (10,000 simulated races) combines both into a
              coherent P1–P20 distribution, winner probability, and expected rank.
              All predictions use only pre-race information (no leakage).
              <strong> Pre-Quali</strong> imputes the grid; <strong>Post-Quali</strong>
              uses the real grid once qualifying has happened.
            </p>
          </>
        )}
      </main>
    </>
  );
}
