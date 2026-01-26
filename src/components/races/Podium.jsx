
import "./podium.css";
import { DriverImage } from "../driverImage";

export function Podium({ results }) {
  if (!results || results.length < 3) return null;

  const [p1, p2, p3] = results;

  return (
    <div className="podium-container">
      <div className="podium-step p2">
        <DriverImage 
            givenName={p2.Driver.givenName} 
            familyName={p2.Driver.familyName} 
            url={p2.Driver.url} 
        />
        <div className="position">2</div>
        <div className="driver-name">{p2.Driver.givenName} {p2.Driver.familyName}</div>
        <div className="constructor">{p2.Constructor.name}</div>
      </div>
      
      <div className="podium-step p1">
        <DriverImage 
            givenName={p1.Driver.givenName} 
            familyName={p1.Driver.familyName} 
            url={p1.Driver.url} 
        />
        <div className="position">1</div>
        <div className="driver-name">{p1.Driver.givenName} {p1.Driver.familyName}</div>
        <div className="constructor">{p1.Constructor.name}</div>
        <div className="time">{p1.Time?.time}</div>
      </div>
      
      <div className="podium-step p3">
        <DriverImage 
            givenName={p3.Driver.givenName} 
            familyName={p3.Driver.familyName} 
            url={p3.Driver.url} 
        />
        <div className="position">3</div>
        <div className="driver-name">{p3.Driver.givenName} {p3.Driver.familyName}</div>
        <div className="constructor">{p3.Constructor.name}</div>
      </div>
    </div>
  );
}
