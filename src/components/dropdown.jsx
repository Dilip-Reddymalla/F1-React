// Year options are derived from the current local date — from the first F1
// season (1950) up to today's year. No hardcoded end year.
const CURRENT_YEAR = new Date().getFullYear();

const years = Array.from(
  { length: CURRENT_YEAR - 1950 + 1 },
  (_, i) => 1950 + i
);

export function Dropdown({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {years.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </select>
  );
}

export { CURRENT_YEAR };
