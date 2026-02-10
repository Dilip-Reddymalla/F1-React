import { useEffect, useState, useRef } from "react";
import { Header } from "../components/header";
import { Dropdown } from "../components/dropdown";
import { TeamImage } from "../components/teamsImg";
import "./teams.css";

export function TeamDetails({ year, setYear }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const teamsCacheRef = useRef(new Map());

  useEffect(() => {
    setYear(2026);
  }, []);

  useEffect(() => {
    if (fetchTrigger === 0) return;
    async function fetchTeams() {
      const cached = teamsCacheRef.current;

      const allcached = cached.has(year);
      if (allcached) {
        setTeams(cached.get(year));
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const url = `https://api.jolpi.ca/ergast/f1/${year}/constructors.json`;
        const res = await fetch(url);
        const result = await res.json();
        const teams = result.MRData.ConstructorTable.Constructors;
        cached.set(year, teams);
        setTeams(teams);
      } catch (err) {
        setError("Failed to load teams", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTeams();
  }, [fetchTrigger]);

  function handleButtonClick() {
    setFetchTrigger((prev) => prev + 1);
  }

  return (
    <>
      <Header />
      <main>
        <h1>Teams in the Year</h1>

        <div className="dropdown">
          <label htmlFor="year">Select Year:</label>
          <Dropdown value={year} onChange={setYear} />
          <button onClick={handleButtonClick}>Get Teams</button>
        </div>

        {loading && <p>Loading...</p>}
        {error && <p>{error}</p>}

        <div id="teams-container">
          {teams.map((team) => {
            return (
              <div className="team-card" key={team.constructorId}>
                <h2 className="team-name">{team.name}</h2>
                <TeamImage team={team} url={team.url} year={year} />

                <ul className="team-data">
                  <li>
                    <strong>Nationality:</strong> {team.nationality}
                  </li>
                  <li>
                    <strong>ID:</strong> {team.constructorId}
                  </li>
                </ul>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
