import { useState, useEffect } from "react";
import { Header } from "../components/header";
import { Dropdown } from "../components/dropdown";
import { StandingsPodium } from "../components/standings/StandingsPodium";
import { StandingsTable } from "../components/standings/StandingsTable";
import { StandingsDetails } from "../components/standings/StandingsDetails";
import "./standings.css";

export function Standings({ year, setYear }) {
  useEffect(() => {
    setYear("2025");
  }, []);

  const [standings, setStandings] = useState("Drivers Championship");
  const [loadedStandings, setLoadedStandings] = useState(null);
  const [data, setData] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  useEffect(() => {
    if (fetchTrigger === 0) return;

    const url =
      standings === "Drivers Championship"
        ? `https://api.jolpi.ca/ergast/f1/${year}/driverstandings.json`
        : `https://api.jolpi.ca/ergast/f1/${year}/constructorstandings.json`;

    const key =
      standings === "Drivers Championship"
        ? "DriverStandings"
        : "ConstructorStandings";

    async function fetchStandings() {
      setLoading(true);
      setError(null);
      setData(null);
      setSelectedItem(null);

      try {
        const res = await fetch(url);
        const result = await res.json();
        setData(result.MRData.StandingsTable.StandingsLists[0][key]);
        setLoadedStandings(standings); // 🔑
      } catch {
        setError("Failed to load standings");
      } finally {
        setLoading(false);
      }
    }

    fetchStandings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTrigger]);

  function handleButtonClick() {
    setFetchTrigger((prev) => prev + 1);
  }

  function handleItemClick(item) {
    setSelectedItem(item);
  }

  return (
    <>
      <Header />

      <main>
        <h1>Championship in the Year</h1>

        <div className="dropdown">
          <label htmlFor="year">Select Year:</label>
          <Dropdown value={year} onChange={setYear} />
          <label htmlFor="type">Select Championship Type:</label>
          <select
            id="type"
            name="championship"
            value={standings}
            onChange={(e) => setStandings(e.target.value)}
          >
            <option value="Drivers Championship">Drivers Championship</option>
            <option value="Constructors Championship">
              Constructors Championship
            </option>
          </select>
          <button onClick={handleButtonClick}>Get Standings</button>
        </div>

        {loading && <p>Loading...</p>}
        {error && <p>{error}</p>}
        {data && loadedStandings === standings && (
          <>
            <div className="standings-podium-section">
                <StandingsPodium 
                    standings={data.slice(0, 3)} 
                    type={standings} 
                    onClick={handleItemClick}
                />
            </div>
            
            <div className="standings-list-section">
                <StandingsTable 
                    standings={data.slice(3)} 
                    type={standings} 
                    onClick={handleItemClick}
                />
            </div>
          </>
        )}

        {selectedItem && (
            <StandingsDetails 
                data={selectedItem} 
                type={standings} 
                onClose={() => setSelectedItem(null)} 
            />
        )}
      </main>
    </>
  );
}
