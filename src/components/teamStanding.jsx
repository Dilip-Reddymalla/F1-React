import { ConstructorImage } from "../components/constructorImg";
import "../pages/standings.css";

export function TeamStanding({ team }) {
  if (!team?.Constructor) return null;

  return (
    <>
      <h2 className="standings-name">{team.Constructor.name}</h2>

      <ConstructorImage
        teamName={team.Constructor.name}
        url={team.Constructor.url}
      />

      <ul className="standings-data">
        <li>
          <strong>Position:</strong> {team.position}
        </li>
        <li>
          <strong>Constructor:</strong> {team.Constructor.name ?? "N/A"}
        </li>
        <li>
          <strong>Points:</strong> {team.points}
        </li>
        <li>
          <strong>Wins:</strong> {team.wins}
        </li>
      </ul>
    </>
  );
}
