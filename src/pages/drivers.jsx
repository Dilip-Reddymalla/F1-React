import { useEffect, useState } from "react";
import { Dropdown } from "../components/dropdown";
import { Header } from "../components/header";
import {DriverImage} from "../components/driverImage";
import "./drivers.css";


export function Driver({ year, setYear }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [fetchTrigger, setFetchTrigger] = useState(0);

  useEffect(() => {
    if (fetchTrigger === 0) return;

    async function fetchDrivers() {
      setLoading(true);
      setError(null);

      try {
        const url = `https://api.jolpi.ca/ergast/f1/${year}/drivers.json`;
        const res = await fetch(url);
        const result = await res.json();
        const driversData = result.MRData.DriverTable.Drivers;

        setDrivers(driversData);
      } catch (err) {
        setError("Failed to load drivers", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDrivers();
  }, [fetchTrigger]);

  function handleButtonClick() {
    setFetchTrigger((prev) => prev + 1);
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
