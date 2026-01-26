import "./standingsTable.css";

export function StandingsTable({ standings, type, onClick }) {
  if (!standings || standings.length === 0) return null;

  const isDriver = type === "Drivers Championship";

  return (
    <div className="standings-table-container">
      <table className="standings-table">
        <thead>
          <tr>
            <th className="pos-cell">Pos</th>
            <th>{isDriver ? "Driver" : "Constructor"}</th>
            {isDriver && <th>Constructor</th>}
            <th>Wins</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((item) => {
             const name = isDriver 
                ? `${item.Driver.givenName} ${item.Driver.familyName}`
                : item.Constructor.name;
             
             const constructorName = isDriver ? item.Constructors[0]?.name : null;

             return (
                <tr 
                    key={item.position}
                    onClick={() => onClick && onClick(item)}
                    className="clickable-row"
                >
                  <td className="pos-cell">{item.position}</td>
                  <td className={isDriver ? "driver-cell" : "team-cell"}>
                    {isDriver ? (
                        <>
                            {item.Driver.givenName} <strong>{item.Driver.familyName}</strong>
                        </>
                    ) : (
                        <strong>{name}</strong>
                    )}
                  </td>
                  {isDriver && <td>{constructorName}</td>}
                  <td>{item.wins}</td>
                  <td className="points-cell">{item.points}</td>
                </tr>
             );
          })}
        </tbody>
      </table>
    </div>
  );
}
