import "./standingsPodium.css";
import { DriverImage } from "../driverImage";
import { ConstructorImage } from "../constructorImg";

export function StandingsPodium({ standings, type, onClick }) {
  if (!standings || standings.length < 3) return null;

  const [p1, p2, p3] = standings;

  const renderStep = (item, positionClass, rank) => {
    const isDriver = type === "Drivers Championship";
    const name = isDriver 
        ? `${item.Driver.givenName} ${item.Driver.familyName}`
        : item.Constructor.name;
    
    const detail = isDriver
        ? item.Constructors[0]?.name
        : `Wins: ${item.wins}`;

    return (
      <div 
        className={`podium-step ${positionClass}`} 
        key={rank}
        onClick={() => onClick && onClick(item)}
      >
        {isDriver ? (
            <DriverImage 
                givenName={item.Driver.givenName} 
                familyName={item.Driver.familyName} 
                url={item.Driver.url} 
                className="driver-photo"
            />
        ) : (
            <div className="team-logo-container">
                 <ConstructorImage 
                    teamName={item.Constructor.name}
                    url={item.Constructor.url}
                 />
            </div>
        )}
        
        <div className="position">{rank}</div>
        <div className={isDriver ? "driver-name" : "team-name"}>{name}</div>
        <div className="detail-text">{detail}</div>
        <div className="points-badge">{item.points} PTS</div>
      </div>
    );
  };

  return (
    <div className="podium-container">
      {renderStep(p2, "p2", 2)}
      {renderStep(p1, "p1", 1)}
      {renderStep(p3, "p3", 3)}
    </div>
  );
}
