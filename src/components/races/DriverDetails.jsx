
import "./driverDetails.css";

export function DriverDetails({ result, onClose }) {
  if (!result) return null;

  const { Driver, Constructor, Time, FastestLap, grid, laps, status, points } = result;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {Driver?.givenName} {Driver?.familyName}
          </h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="driver-info-grid">
            <div className="info-item">
              <label>Team</label>
              <span>{Constructor?.name}</span>
            </div>
            <div className="info-item">
              <label>Number</label>
              <span>{Driver?.permanentNumber || "N/A"}</span>
            </div>
            <div className="info-item">
              <label>Nationality</label>
              <span>{Driver?.nationality}</span>
            </div>
            <div className="info-item">
              <label>Points</label>
              <span>{points}</span>
            </div>
            <div className="info-item">
              <label>Grid Position</label>
              <span>{grid}</span>
            </div>
            <div className="info-item">
              <label>Final Status</label>
              <span>{status}</span>
            </div>
            <div className="info-item">
              <label>Laps Completed</label>
              <span>{laps}</span>
            </div>
            <div className="info-item">
              <label>Total Time</label>
              <span>{Time?.time || "N/A"}</span>
            </div>
          </div>

          {FastestLap && (
            <div className="fastest-lap-section">
              <h3>Fastest Lap Stats</h3>
              <div className="driver-info-grid">
                <div className="info-item">
                    <label>Lap Number</label>
                    <span>{FastestLap.lap}</span>
                </div>
                <div className="info-item">
                    <label>Rank</label>
                    <span>{FastestLap.rank}</span>
                </div>
                <div className="info-item">
                    <label>Time</label>
                    <span>{FastestLap.Time?.time || "N/A"}</span>
                </div>
                <div className="info-item">
                    <label>Avg Speed</label>
                    <span>
                        {FastestLap.AverageSpeed?.speed} {FastestLap.AverageSpeed?.units}
                    </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
