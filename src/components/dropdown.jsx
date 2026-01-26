const years = Array.from(
  { length: 2026 - 1950 + 1 },
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
