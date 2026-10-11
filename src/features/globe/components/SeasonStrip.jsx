import React, { useRef, useEffect } from 'react';
import { getRaceStatus } from '../utils/time';
import { getCircuitMeta } from '../data/circuitsMeta';
import './seasonStrip.css';

export function SeasonStrip({ races = [], selectedRound, onSelectRound }) {
  const containerRef = useRef(null);
  const pillRefs = useRef({});

  // Auto-scroll to selectedRound smoothly whenever it changes
  useEffect(() => {
    if (!selectedRound) return;
    const activePill = pillRefs.current[String(selectedRound)];
    if (activePill && containerRef.current) {
      const container = containerRef.current;
      const pillLeft = activePill.offsetLeft;
      const pillWidth = activePill.offsetWidth;
      const containerWidth = container.offsetWidth;
      const targetScroll = pillLeft - (containerWidth / 2) + (pillWidth / 2);

      container.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, [selectedRound, races]);

  const handleScroll = (direction) => {
    if (!containerRef.current) return;
    const scrollAmount = direction === 'left' ? -320 : 320;
    containerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  return (
    <div className="season-strip-wrapper" id="season-strip">
      <div className="season-strip-controls">
        <div className="season-strip-header">
          <span className="strip-badge">OFFICIAL CALENDAR</span>
          <h3 className="strip-title">24 GRANDS PRIX</h3>
        </div>
        <div className="strip-nav-buttons">
          <button 
            type="button" 
            className="strip-nav-btn" 
            onClick={() => handleScroll('left')}
            aria-label="Scroll left"
          >
            ←
          </button>
          <button 
            type="button" 
            className="strip-nav-btn" 
            onClick={() => handleScroll('right')}
            aria-label="Scroll right"
          >
            →
          </button>
        </div>
      </div>

      <div className="season-strip-scroller" ref={containerRef}>
        {races.map((race) => {
          const isSelected = String(race.round) === String(selectedRound);
          const status = getRaceStatus(race.date, race.time);
          const meta = getCircuitMeta(race.circuitId);
          const flagIso = meta?.flagIso || 'un';

          return (
            <button
              key={race.round}
              ref={(el) => { pillRefs.current[String(race.round)] = el; }}
              type="button"
              className={`race-pill-card ${isSelected ? 'active' : ''} status-${status.toLowerCase()}`}
              onClick={() => onSelectRound(race.round)}
            >
              <div className="pill-top">
                <span className="pill-round">R{String(race.round).padStart(2, '0')}</span>
                <span className={`status-pill status-${status.toLowerCase()}`}>
                  {status}
                </span>
              </div>

              <div className="pill-main">
                <div className="pill-flag-wrapper">
                  <img
                    src={`https://flagcdn.com/w40/${flagIso}.png`}
                    alt={race.location?.country || ''}
                    className="pill-flag"
                    loading="lazy"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <span className="pill-locality">{race.location?.locality || race.circuitId}</span>
                </div>
                <div className="pill-name">{race.raceName.replace(' Grand Prix', ' GP')}</div>
              </div>

              <div className="pill-footer">
                <span className="pill-date">
                  {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
                    new Date(`${race.date}T12:00:00Z`)
                  )}
                </span>
                <span className="pill-track-code">{meta?.shortName || 'F1'}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
