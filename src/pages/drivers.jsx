import { useEffect, useState, useRef } from "react";
import { Dropdown } from "../components/dropdown";
import { Header } from "../components/header";
import { DriverImage } from "../components/driverImage";
import "./drivers.css";

export function Driver({ year, setYear }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [teamData, setTeamData] = useState({});

  const [fetchTrigger, setFetchTrigger] = useState(0);
  const cacheDriverRef = useRef(new Map());
  const teamCacheRef = useRef(new Map());

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchDriverTeams(driversArray) {
    const teams = {};
    const teamCache = teamCacheRef.current;

    const allCached = driversArray.every((driver) =>
      teamCache.has(`${year}-${driver.driverId}`),
    );

    if (allCached) {
      driversArray.forEach((driver) => {
        teams[driver.driverId] = teamCache.get(`${year}-${driver.driverId}`);
      });

      setTeamData(teams);
      return;
    }

    const batchSize = 2;
    const delayMs = 300;

    for (let i = 0; i < driversArray.length; i += batchSize) {
      const batch = driversArray.slice(i, i + batchSize);

      const promises = batch.map(async (driver) => {
        const key = `${year}-${driver.driverId}`;

        if (teamCache.has(key)) {
          return {
            driverId: driver.driverId,
            team: teamCache.get(key),
          };
        }

        try {
          const url = `https://api.jolpi.ca/ergast/f1/${year}/drivers/${driver.driverId}/constructors.json`;
          const res = await fetch(url);

          if (!res.ok) return null;

          const result = await res.json();

          const team =
            result.MRData?.ConstructorTable?.Constructors[0]?.name ?? "N/A";

          teamCache.set(`${year}-${driver.driverId}`, team);

          return { driverId: driver.driverId, team };
        } catch (err) {
          console.error(
            "Error fetching team for driver:",
            driver.driverId,
            err,
          );
          return null;
        }
      });

      const results = await Promise.all(promises);

      results.forEach((r) => {
        if (r) teams[r.driverId] = r.team;
      });
      await sleep(delayMs);
    }

    setTeamData(teams);
  }

  useEffect(() => {
    setYear(2026);
  }, []);

  async function fectchChachedDrivers(url) {
    const cache = cacheDriverRef.current;
    if (cache.has(url)) {
      return cache.get(url);
    }
    const res = await fetch(url);
    const result = await res.json();
    const driversData = result.MRData.DriverTable.Drivers;
    const raceDrivers = driversData.filter((d) => d.code);
    cache.set(url, raceDrivers);
    return raceDrivers;
  }

  useEffect(() => {
    //setYear(2026);
    if (!fetchTrigger) return;

    async function fetchDrivers() {
      setDrivers([]);
      setTeamData({});
      setLoading(true);
      setError(null);

      try {
        const url = `https://api.jolpi.ca/ergast/f1/${year}/drivers.json`;
        const driversData = await fectchChachedDrivers(url);

        setDrivers(driversData);
        await fetchDriverTeams(driversData);
      } catch (err) {
        setError("Failed to load drivers", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDrivers();
  }, [fetchTrigger]);

  function handleButtonClick() {
    setFetchTrigger(year);
  }

  return (
    <>
      <Header />
      <main>
        <h1>Drivers in the Year</h1>

        <div className="dropdown">
          <label htmlFor="year">Select Year:</label>
          <Dropdown value={year} onChange={setYear} />

          <button onClick={handleButtonClick}>Get Drivers</button>
        </div>

        {loading && <p>Loading...</p>}
        {error && <p>{error}</p>}

        <div className="drivers-container">
          {drivers.map((driver) => (
            <div className="driver-card" key={driver.driverId}>
              <h2 className="driver-name">
                {driver.givenName} {driver.familyName}
              </h2>

              <DriverImage
                givenName={driver.givenName}
                familyName={driver.familyName}
                url={driver.url}
              />
              <ul className="driver-data">
                <li>
                  <strong>Team:</strong> {teamData[driver.driverId] ?? "N/A"}
                </li>
                <li>
                  <strong>Code:</strong> {driver.code ?? "N/A"}
                </li>
                <li>
                  <strong>Date of Birth:</strong> {driver.dateOfBirth}
                </li>
                <li>
                  <strong>Driver ID:</strong> {driver.driverId}
                </li>
                <li>
                  <strong>Nationality:</strong> {driver.nationality}
                </li>
                <li>
                  <strong>Permanent Number:</strong>{" "}
                  {driver.permanentNumber ?? "N/A"}
                </li>
              </ul>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

export default Driver;
