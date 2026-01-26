
export function DriverMarker({ driver, x, y, position, lap, color }) {
  if (isNaN(x) || isNaN(y)) return null;

  return (
    <g className="driver-marker-group" transform={`translate(${x}, ${y})`}>
      <circle 
        className="driver-marker-circle" 
        stroke={color} 
        fill="#111"
      />
      <text className="driver-marker-text" y="1">
        {driver.code || driver.familyName.substring(0,3).toUpperCase()}
      </text>
      
      {/* Simple title for native hover, customized tooltip would be phase 7 */}
      <title>{`${driver.givenName} ${driver.familyName} - P${position} (Lap ${lap})`}</title>
    </g>
  );
}
