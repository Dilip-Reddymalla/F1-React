import "./standingsDetails.css";
import { DriverImage } from "../driverImage";
import { ConstructorImage } from "../constructorImg";

export function StandingsDetails({ data, type, onClose }) {
  if (!data) return null;

  const isDriver = type === "Drivers Championship";
  
  const name = isDriver 
      ? `${data.Driver.givenName} ${data.Driver.familyName}`
      : data.Constructor.name;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{name}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
            <div className="details-header">
                {isDriver ? (
                    <div className="details-image">
                       <DriverImage 
                           givenName={data.Driver.givenName} 
                           familyName={data.Driver.familyName} 
                           url={data.Driver.url} 
                       />
                    </div>
                ) : (
                    <div className="details-image team-logo">
                        <ConstructorImage 
                            teamName={data.Constructor.name}
                            url={data.Constructor.url}
                        />
                    </div>
                )}
            </div>

          <div className="driver-info-grid">
            <div className="info-item">
              <label>Championship Position</label>
              <span>{data.position}</span>
            </div>
            
            <div className="info-item">
              <label>Points</label>
              <span>{data.points}</span>
            </div>

            <div className="info-item">
              <label>Wins</label>
              <span>{data.wins}</span>
            </div>

            {isDriver ? (
                <>
                    <div className="info-item">
                        <label>Team</label>
                        <span>{data.Constructors[0]?.name}</span>
                    </div>
                    <div className="info-item">
                        <label>Nationality</label>
                        <span>{data.Driver.nationality}</span>
                    </div>
                    <div className="info-item">
                        <label>Driver Number</label>
                        <span>{data.Driver.permanentNumber}</span>
                    </div>
                </>
            ) : (
                <>
                    <div className="info-item">
                        <label>Nationality</label>
                        <span>{data.Constructor.nationality}</span>
                    </div>
                </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
