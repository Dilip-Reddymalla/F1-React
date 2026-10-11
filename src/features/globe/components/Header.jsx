import React from 'react';
import './header.css';

export function Header({ year = '2026', onYearChange }) {
  return (
    <header className="navbar">
      <nav>
        <a href="#hero" className="active">Overview</a>
        <a href="#season-strip">Calendar</a>
        <a href="#telemetry">Telemetry</a>
        <a href="#schedule">Schedule</a>
      </nav>
      <div className="nav-brand">
        <div className="f1-badge">F1</div>
        <span className="brand-title">TELEMETRY HUB</span>
      </div>
      <div className="nav-actions">
        {onYearChange ? (
          <select 
            value={year} 
            onChange={(e) => onYearChange(e.target.value)} 
            className="season-select"
            aria-label="Select Championship Season"
          >
            <option value="2026">2026 Season</option>
            <option value="2025">2025 Season</option>
            <option value="2024">2024 Season</option>
          </select>
        ) : (
          <span className="season-pill">{year} SEASON</span>
        )}
      </div>
    </header>
  );
}
