import { useState, useEffect } from "react";
import { Header } from "../components/header";
import { Dropdown } from "../components/dropdown";
import "./qualifying.css";

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
          {results.map((q) => (
            <tr key={q.position || q.Driver.driverId}>
              <td className={`q-pos ${Number(q.position) === 1 ? "pole" : ""}`}>
                {q.position}
                {Number(q.position) === 1 && <span className="pole-tag">POLE</span>}
              </td>
              <td className="q-driver">
                {q.Driver.givenName} <strong>{q.Driver.familyName}</strong>
              </td>
              <td>{q.Constructor.name}</td>
              <td className="q-time">{fmtLap(q.Q1)}</td>
              <td className="q-time">{fmtLap(q.Q2)}</td>
              <td className="q-time q3">{fmtLap(q.Q3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Qualifying() {
  const [year, setYear] = useState("2026");
  const [races, setRaces] = useState([]);
  const [selectedRound, setSelectedRound] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [qualifying, setQualifying] = useState(null);
  const [qualiLoading, setQualiLoading] = useState(false);
  const [qualiError, setQualiError] = useState(null);

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
              {qualiLoading ? "Loading Qualifying..." : "Get Grid"}
            </button>
          </div>
        </div>

        {error && <p className="q-error">{error}</p>}
        {qualiError && <p className="q-error">{qualiError}</p>}

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
            <QualifyingTable results={qualifying.results} />
          </div>
        )}
      </main>
    </>
  );
}
