import { useState, useEffect, useRef } from "react";
import { Header } from "../components/header";
import { Dropdown } from "../components/dropdown";
import { DriverImage } from "../components/driverImage";
import "./qualifying.css";

const TEAM_COLORS = {
  "Red Bull": "#3671c6",
  "Red Bull Racing": "#4781d7",
  Ferrari: "#e8002d",
  Mercedes: "#27f4d2",
  McLaren: "#ff8000",
  "Aston Martin": "#229971",
  Alpine: "#ff87bc",
  Williams: "#64c4ff",
  RB: "#6692ff",
  "Racing Bulls": "#6c98ff",
  Audi: "#52e252",
  Haas: "#b6babd",
  "Haas F1 Team": "#9c9fa2",
  Cadillac: "#c8102e",
};
const teamColor = (name) => TEAM_COLORS[name] || "#7a7f8a";

// Uses the official OpenF1 headshot when available, else Wikipedia (DriverImage).
function DriverPhoto({ name, team, size = 40, headshot }) {
  const [shotFailed, setShotFailed] = useState(false);
  const parts = String(name || "").trim().split(/\s+/);
  const family = parts.pop() || "";
  const given = parts.join(" ") || family;
  const useShot = headshot && !shotFailed;
  return (
    <div
      className="grid-photo"
      style={{ width: size, height: size, "--tc": teamColor(team) }}
    >
      {useShot ? (
        <img
          src={headshot}
          alt={name}
          className="grid-photo-img"
          loading="lazy"
          onError={() => setShotFailed(true)}
        />
      ) : (
        <DriverImage givenName={given} familyName={family} imgClassName="grid-photo-img" />
      )}
    </div>
  );
}

// Real F1 starting grid — staggered formation: each position is offset to the
// alternating side (P1 left-front, P2 right, P3 left, …) like the actual
// track layout where being ahead gives the advantage.
function GridBoard({ rows }) {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  return (
    <div className="grid-track">
      <div className="grid-road">
        <div className="grid-curb left" aria-hidden="true" />
        <div className="grid-centerline" aria-hidden="true" />
        <div className="grid-curb right" aria-hidden="true" />
        <div className="grid-rows-staggered">
          {sorted.map((item, i) => {
            const side = i % 2 === 0 ? "left" : "right";
            return (
              <div
                className={`grid-stagger ${side} ${i === 0 ? "front" : ""}`}
                key={item.position}
              >
                <GridCell item={item} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid-gantry">
        <span className="gantry-light" />
        <span className="gantry-label">GRID</span>
        <span className="gantry-light" />
      </div>
    </div>
  );
}

function GridCell({ item, front }) {
  return (
    <div className={`grid-cell ${front ? "front" : ""}`}>
      <div className="grid-pos">P{item.position}</div>
      <DriverPhoto
        name={item.driver}
        team={item.constructor}
        size={front ? 56 : 46}
        headshot={item.headshot}
      />
      <div className="grid-name">{item.driver}</div>
      <div className="grid-team">{item.constructor}</div>
    </div>
  );
}

// Format a lap time from the API (e.g. "1:17.341").
const fmtLap = (t) => t || "—";

function QualifyingTable({ results }) {
  if (!results || results.length === 0) {
    return <p className="q-empty">No qualifying results available for this race yet.</p>;
  }
  return (
    <div className="q-table-wrap">
      <table className="q-table">
        <thead>
          <tr>
            <th className="q-pos">Pos</th>
            <th>Driver</th>
            <th>Constructor</th>
            <th>Q1</th>
            <th>Q2</th>
            <th>Q3</th>
          </tr>
        </thead>
        <tbody>
          {results.map((q) => {
            const pos = Number(q.position);
            return (
              <tr key={q.position || q.Driver.driverId} className={pos === 1 ? "pole-row" : ""}>
                <td className={`q-pos ${pos === 1 ? "pole" : ""}`}>
                  <span className="q-pos-badge">{q.position}</span>
                  {pos === 1 && <span className="pole-tag">POLE</span>}
                </td>
                <td className="q-driver">
                  <DriverPhoto
                    name={`${q.Driver.givenName} ${q.Driver.familyName}`}
                    team={q.Constructor.name}
                    size={32}
                  />
                  <span className="q-driver-name">
                    {q.Driver.givenName} <strong>{q.Driver.familyName}</strong>
                  </span>
                </td>
                <td className="q-constructor">{q.Constructor.name}</td>
                <td className="q-time">{fmtLap(q.Q1)}</td>
                <td className="q-time">{fmtLap(q.Q2)}</td>
                <td className="q-time q3">{fmtLap(q.Q3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Qualifying() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [races, setRaces] = useState([]);
  const [selectedRound, setSelectedRound] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [qualifying, setQualifying] = useState(null);
  const [qualiLoading, setQualiLoading] = useState(false);
  const [qualiError, setQualiError] = useState(null);
  const [gridData, setGridData] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState(null);

  useEffect(() => {
    setRaces([]);
    setSelectedRound(null);
    setQualifying(null);
    setError(null);
    setQualiError(null);
  }, [year]);

  async function fetchSchedule() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://api.jolpi.ca/ergast/f1/${year}.json`);
      const data = await res.json();
      setRaces(data.MRData.RaceTable.Races);
    } catch {
      setError("Failed to fetch race schedule.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchQualifying() {
    if (!selectedRound) return;
    setQualiLoading(true);
    setQualiError(null);
    setQualifying(null);
    setGridData(null);
    setGridError(null);
    try {
      const res = await fetch(
        `https://api.jolpi.ca/ergast/f1/${year}/${selectedRound}/qualifying.json`
      );
      const data = await res.json();
      const raceData = data.MRData.RaceTable.Races[0];
      if (raceData && raceData.QualifyingResults) {
        setQualifying({
          race: raceData.raceName,
          date: raceData.date,
          circuit: raceData.Circuit.circuitName,
          results: raceData.QualifyingResults,
        });
      } else {
        setQualiError("No qualifying data for this race yet.");
      }
    } catch {
      setQualiError("Failed to fetch qualifying results.");
    } finally {
      setQualiLoading(false);
    }
  }

  // Fetch the ACTUAL starting grid (post-penalty) directly from OpenF1
  // (public API, no key/backend needed). Falls back to the qualifying order.
  // Results are cached in-memory by year + circuit to avoid re-fetching and
  // hitting OpenF1's rate limits (free tier: 30 req/min).
  const OPENF1 = "https://api.openf1.org/v1";
  const GRID_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  const gridCacheRef = useRef(new Map());

  async function fetchActualGrid() {
    if (!selectedRound) return;
    setGridLoading(true);
    setGridError(null);
    try {
      const race = races.find((r) => Number(r.round) === selectedRound);
      if (!race) throw new Error("race not found");
      const raceDate = String(race.date).slice(0, 10);
      const raceCircuit = race.Circuit.circuitName;
      const cacheKey = `${year}:${raceCircuit}`;

      // In-memory cache hit (year + circuit).
      const cached = gridCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.at < GRID_CACHE_TTL) {
        setGridData(cached.data);
        return;
      }

      // Find this race's session by date, then its qualifying session.
      const sessionsRes = await fetch(
        `${OPENF1}/sessions?year=${year}&session_type=Race`,
        { signal: AbortSignal.timeout(20000) }
      );
      if (!sessionsRes.ok) throw new Error(`sessions HTTP ${sessionsRes.status}`);
      const sessions = await sessionsRes.json();
      const raceSession = sessions.find(
        (s) => String(s.date_start || "").slice(0, 10) === raceDate
      );
      if (!raceSession) throw new Error("race session not found");
      const meetingKey = raceSession.meeting_key;

      const msessionsRes = await fetch(
        `${OPENF1}/sessions?meeting_key=${meetingKey}`,
        { signal: AbortSignal.timeout(20000) }
      );
      const msessions = await msessionsRes.json();
      const quali = msessions.find((s) => s.session_type === "Qualifying");
      if (!quali) throw new Error("qualifying session not found");
      const qualiKey = quali.session_key;

      const [gridRes, driversRes] = await Promise.all([
        fetch(`${OPENF1}/starting_grid?session_key=${qualiKey}`, {
          signal: AbortSignal.timeout(20000),
        }),
        fetch(`${OPENF1}/drivers?session_key=${qualiKey}`, {
          signal: AbortSignal.timeout(20000),
        }),
      ]);
      if (!gridRes.ok) throw new Error(`grid HTTP ${gridRes.status}`);
      const grid = await gridRes.json();
      const drivers = await driversRes.json();

      if (!Array.isArray(grid) || grid.length === 0) throw new Error("no grid rows");
      const byNumber = Object.fromEntries(
        drivers.map((d) => [d.driver_number, d])
      );

      const rows = grid
        .filter((g) => g.position != null)
        .map((g) => {
          const d = byNumber[g.driver_number] || {};
          return {
            position: Number(g.position),
            driver: d.full_name || `#${g.driver_number}`,
            constructor: d.team_name || "",
            headshot: d.headshot_url || null,
          };
        })
        .sort((a, b) => a.position - b.position);

      const data = {
        race: race.raceName,
        date: race.date,
        circuit: raceCircuit,
        grid: rows,
      };
      // Store in cache (year + circuit).
      gridCacheRef.current.set(cacheKey, { at: Date.now(), data });
      setGridData(data);
    } catch (err) {
      console.warn("Actual grid unavailable:", err.message);
      setGridError("Starting grid (actual) unavailable right now — qualifying times shown below.");
      setGridData(null);
    } finally {
      setGridLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="qualifying-page">
        <h1>Qualifying Grid</h1>
        <p className="q-subtitle">Starting grid &amp; session times for each round</p>

        <div className="q-controls">
          <div className="q-control-group">
            <label>Select Year:</label>
            <Dropdown value={year} onChange={setYear} />
            <button onClick={fetchSchedule} disabled={loading}>
              {loading ? "Loading..." : "Get Schedule"}
            </button>
          </div>

          <div className="q-control-group">
            <label>Select Race:</label>
            <select
              className="q-select"
              value={selectedRound || ""}
              onChange={(e) => {
                setSelectedRound(e.target.value ? Number(e.target.value) : null);
                setQualifying(null);
                setQualiError(null);
              }}
            >
              <option value="">Select a round</option>
              {races.map((r) => (
                <option key={r.round} value={r.round}>
                  R{r.round} · {r.raceName}
                </option>
              ))}
            </select>
            <button onClick={fetchQualifying} disabled={!selectedRound || qualiLoading}>
              {qualiLoading ? "Loading Qualifying..." : "Get Qualifying"}
            </button>
            <button
              onClick={fetchActualGrid}
              disabled={!selectedRound || gridLoading}
              className="q-primary-btn"
            >
              {gridLoading ? "Loading Grid..." : "Get Starting Grid"}
            </button>
          </div>
        </div>

        {error && <p className="q-error">{error}</p>}
        {qualiError && <p className="q-error">{qualiError}</p>}
        {gridError && <p className="q-error q-warn">{gridError}</p>}

        {/* Actual starting grid (OpenF1, post-penalty): card grid board */}
        {gridData && (
          <div className="q-result">
            <div className="q-header">
              <h2>{gridData.race}</h2>
              <span className="q-meta">
                {new Date(gridData.date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                · {gridData.circuit}
                <span className="q-source"> · Actual grid</span>
              </span>
            </div>
            <div className="q-grid-section">
              <h3 className="q-section-title">Starting Grid</h3>
              <GridBoard rows={gridData.grid} />
            </div>
          </div>
        )}

        {/* Qualifying results: plain table only (no card grid) */}
        {qualifying && (
          <div className="q-result">
            <div className="q-header">
              <h2>{qualifying.race}</h2>
              <span className="q-meta">
                {new Date(qualifying.date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                · {qualifying.circuit}
              </span>
            </div>
            <div className="q-table-section">
              <h3 className="q-section-title">Session Times</h3>
              <QualifyingTable results={qualifying.results} />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
