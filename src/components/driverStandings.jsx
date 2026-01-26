import { DriverImage } from "./driverImage";
import "../pages/standings.css";
export function DriverStandings({ player, imageSrc }) {
  return (
    <>
      <h2 className="standings-name">
        {player.Driver.givenName} {player.Driver.familyName}
      </h2>
      <DriverImage
        givenName={player.Driver.givenName}
        familyName={player.Driver.familyName}
        url={imageSrc}
      />
      <ul className="standings-data">
        <li>
          <strong>Position:</strong> {player.position}
        </li>
        <li>
          <strong>Code:</strong> {player.Driver.code ?? "N/A"}
        </li>
        <li>
          <strong>Driver ID:</strong> {player.Driver.driverId}
        </li>
        <li>
          <strong>Points:</strong> {player.points}
        </li>
        <li>
          <strong>Wins:</strong> {player.wins}
        </li>
        <li>
          <strong>Nationality:</strong> {player.Driver.nationality}
        </li>
        <li>
          <strong>Permanent Number:</strong>{" "}
          {player.Driver.permanentNumber ?? "N/A"}
        </li>
      </ul>
    </>
  );
}
