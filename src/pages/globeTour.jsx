import React, { useState, useEffect } from 'react';
import { Header } from '../components/header';
import { useF1Season } from '../features/globe/hooks/useF1Season';
import { GlobeView } from '../features/globe/components/GlobeView';
import { SeasonStrip } from '../features/globe/components/SeasonStrip';
import { RaceInfoPanel } from '../features/globe/components/RaceInfoPanel';
import '../features/globe/globeHero.css';

export default function GlobeTour({ year = '2026', setYear }) {
  const currentSeasonYear = String(year || '2026');
  const { races, loading, error, isFallback, suggestedIndex } = useF1Season(currentSeasonYear);
  const [selectedRound, setSelectedRound] = useState('1');
  const [searchQuery, setSearchQuery] = useState('');

  // Default selected round to upcoming GP when data loads
  useEffect(() => {
    if (races.length > 0) {
      const target = races[suggestedIndex] || races[0];
      setSelectedRound(target.round);
    }
  }, [races, suggestedIndex]);

  const currentRace = races.find((r) => String(r.round) === String(selectedRound)) || races[0];

  const filteredRaces = searchQuery.trim()
    ? races.filter((r) => {
        const q = searchQuery.toLowerCase();
        return (
          r.raceName.toLowerCase().includes(q) ||
          r.circuitName.toLowerCase().includes(q) ||
          (r.location?.country && r.location.country.toLowerCase().includes(q)) ||
          (r.location?.locality && r.location.locality.toLowerCase().includes(q))
        );
      })
    : races;

  return (
    <div className="f1-globe-hub-layout">
      {/* Standard F1 React Navbar */}
      <Header />

      {/* Subheader Season Switcher & Anchor Nav */}
      <div className="globe-subnav-bar">
        <div className="globe-subnav-links">
          <a href="#hero" className="active">Overview</a>
          <a href="#season-strip">Calendar</a>
          <a href="#telemetry">Telemetry</a>
          <a href="#schedule">Schedule</a>
        </div>
        <div className="globe-subnav-actions">
          {setYear && (
            <select
              value={currentSeasonYear}
              onChange={(e) => setYear(e.target.value)}
              className="season-select"
              aria-label="Select Season"
            >
              <option value="2026">2026 Season</option>
              <option value="2025">2025 Season</option>
              <option value="2024">2024 Season</option>
            </select>
          )}
        </div>
      </div>

      {/* Hero Header & Telemetry Canvas Shell */}
      <section className="globe-hero-section" id="hero">
        <div className="hero-atmosphere-backdrop" />

        {/* Hero Headline Overlay */}
        <div className="hero-text-overlay">
          <div className="hero-kicker-badge">
            <span className="pulse-dot" /> GLOBAL RACING TELEMETRY
          </div>
          <h1 className="hero-main-title">
            FORMULA 1 <span className="highlight-text">{currentSeasonYear} WORLD TOUR</span>
          </h1>
          <p className="hero-subtitle">
            Interactive 3D orbit connecting all 24 Grand Prix circuits across the globe. Click any track pin or calendar round below to initiate telemetry lock.
          </p>

          {/* Quick Search Input */}
          <div className="quick-search-wrapper">
            <input
              type="text"
              placeholder="Search race, circuit, or country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="quick-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="clear-search-btn"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {searchQuery && filteredRaces.length > 0 && (
            <div className="search-results-dropdown">
              {filteredRaces.map((r) => (
                <button
                  key={r.round}
                  type="button"
                  className="search-result-item"
                  onClick={() => {
                    setSelectedRound(r.round);
                    setSearchQuery('');
                  }}
                >
                  <span className="res-round">R{String(r.round).padStart(2, '0')}</span>
                  <span className="res-name">{r.raceName}</span>
                  <span className="res-loc">{r.location?.country}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3D Globe View Canvas */}
        <div className="globe-canvas-viewport" id="telemetry">
          {loading && races.length === 0 ? (
            <div className="globe-loading-state">
              <div className="f1-spinner" />
              <div className="loading-label">LOCKING TELEMETRY SATELLITE...</div>
            </div>
          ) : (
            <GlobeView
              races={races}
              selectedRound={selectedRound}
              onSelectRound={setSelectedRound}
            />
          )}
        </div>
      </section>

      {/* Horizontal Full-Season Strip Carousel */}
      <SeasonStrip
        races={races}
        selectedRound={selectedRound}
        onSelectRound={setSelectedRound}
      />

      {/* Telemetry Details Cards (Overview, Schematic SVG, Schedule) */}
      <RaceInfoPanel race={currentRace} />

      {/* Footer Banner */}
      <footer className="globe-hub-footer">
        <div className="footer-content">
          <span>F1 TELEMETRY HUB • RACING INTELLIGENCE & 3D TRAJECTORY SYSTEM</span>
          {isFallback && <span className="fallback-note">● RUNNING LOCAL {currentSeasonYear} CALENDAR FALLBACK</span>}
        </div>
      </footer>
    </div>
  );
}
