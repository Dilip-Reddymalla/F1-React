
import "./resultsTable.css";

export function ResultsTable({ results, onDriverSelect, selectedDriverIds, onToggleSelection }) {
  if (!results || results.length === 0) return null;

  return (
    <div className="results-table-container">
      <table className="results-table">
        <thead>
          <tr>
            <th className="select-cell">Select</th>
            <th>Pos</th>
            <th>Driver</th>
            <th>Constructor</th>
            <th>Laps</th>
            <th>Time/Status</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
             const isSelected = selectedDriverIds?.includes(result.Driver.driverId);
             const isMaxSelected = selectedDriverIds?.length >= 5;
             const isDisabled = !isSelected && isMaxSelected;

             return (
                <tr 
                    key={result.position} 
                    onClick={() => onDriverSelect && onDriverSelect(result)}
                    className={onDriverSelect ? "clickable-row" : ""}
                >
                  <td className="select-cell" onClick={(e) => e.stopPropagation()}>
                     <label className="custom-checkbox">
                        <input 
                            type="checkbox" 
                            checked={isSelected || false}
                            disabled={isDisabled}
                            onChange={() => onToggleSelection && onToggleSelection(result.Driver.driverId)}
                        />
                        <span className="checkmark"></span>
                     </label>
                  </td>
                  <td className="pos-cell">{result.position}</td>
                  <td className="driver-cell">
                    {/* Flag placeholder if needed */}
                    {result.Driver.givenName} <strong>{result.Driver.familyName}</strong>
                  </td>
                  <td>{result.Constructor.name}</td>
                  <td>{result.laps}</td>
                  <td>{result.Time ? result.Time.time : result.status}</td>
                  <td className="points-cell">{result.points}</td>
                </tr>
             );
          })}
        </tbody>
      </table>
    </div>
  );
}
