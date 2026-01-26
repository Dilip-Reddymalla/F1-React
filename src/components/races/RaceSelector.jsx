
export function RaceSelector({ races, selectedRound, onChange }) {
  if (!races || races.length === 0) {
    return (
        <select disabled>
          <option>Loading races...</option>
        </select>
    );
  }

  return (
    <select 
      value={selectedRound || ""} 
      onChange={(e) => onChange(e.target.value)}
      className="race-selector"
    >
      <option value="" disabled>Select a Race</option>
      {races.map((race) => (
        <option key={race.round} value={race.round}>
          {race.raceName}
        </option>
      ))}
    </select>
  );
}
