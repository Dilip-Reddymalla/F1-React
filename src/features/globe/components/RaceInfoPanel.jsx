import React, { useState, useEffect } from 'react';
import { getCircuitMeta, getCircuitTrack } from '../data/circuitsMeta';
import { formatInTimezone, formatTimeUTC, formatDateUTC, countdownParts, getRaceStatus } from '../utils/time';
import './raceInfoPanel.css';

export function RaceInfoPanel({ race }) {
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    if (!race) return;
    const tick = () => {
      setCountdown(countdownParts(race));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [race]);

  if (!race) return null;

  const meta = getCircuitMeta(race.circuitId);
  const track = getCircuitTrack(race.circuitId || race.circuitName);
  const status = getRaceStatus(race.date, race.time);
  const circuitTimezone = meta?.timezone || 'UTC';

  const sessions = race.sessions || {};
  const isSprintWeekend = !!(sessions.Sprint || sessions.SprintQualifying || sessions.SprintShootout);

  // Ordered timeline of session events
  const sessionList = [
    { key: 'FirstPractice', label: 'Practice 1', type: 'practice', data: sessions.FirstPractice },
    { key: 'SprintQualifying', label: 'Sprint Shootout / Qualifying', type: 'sprint-quali', data: sessions.SprintQualifying || sessions.SprintShootout },
    { key: 'Sprint', label: 'Sprint Race', type: 'sprint', data: sessions.Sprint },
    { key: 'SecondPractice', label: 'Practice 2', type: 'practice', data: sessions.SecondPractice },
    { key: 'ThirdPractice', label: 'Practice 3', type: 'practice', data: sessions.ThirdPractice },
    { key: 'Qualifying', label: 'Grand Prix Qualifying', type: 'qualifying', data: sessions.Qualifying },
    { key: 'Race', label: 'Grand Prix', type: 'race', data: { date: race.date, time: race.time } },
  ].filter((s) => s.data && s.data.date);

  return (
    <div className="race-info-grid" id="schedule">
      {/* Card 1: Grand Prix Overview & Live Countdown */}
      <div className="f1-telemetry-card hero-overview-card">
        <div className="card-header-row">
          <span className="card-kicker">ROUND {String(race.round).padStart(2, '0')}</span>
          <div className="card-badge-group">
            {isSprintWeekend && <span className="sprint-tag">SPRINT WEEKEND</span>}
            <span className={`status-badge status-${status.toLowerCase()}`}>{status}</span>
          </div>
        </div>

        <div className="card-title-group">
          <h2 className="race-headline">{race.raceName}</h2>
          <div className="circuit-subhead">{race.circuitName}</div>
        </div>

        <div className="location-flag-row">
          <img
            src={`https://flagcdn.com/w40/${meta?.flagIso || 'un'}.png`}
            alt={race.location?.country || ''}
            className="card-flag"
            loading="lazy"
          />
          <span className="location-text">
            {race.location?.locality}, {race.location?.country}
          </span>
        </div>

        {/* Live Countdown Clock */}
        {countdown && !countdown.over && (
          <div className="countdown-box">
            <span className="countdown-label">COUNTDOWN TO LIGHTS OUT</span>
            <div className="countdown-digits">
              <div className="digit-col">
                <span className="digit-value">{countdown.d}</span>
                <span className="digit-unit">DAYS</span>
              </div>
              <span className="digit-colon">:</span>
              <div className="digit-col">
                <span className="digit-value">{String(countdown.h).padStart(2, '0')}</span>
                <span className="digit-unit">HRS</span>
              </div>
              <span className="digit-colon">:</span>
              <div className="digit-col">
                <span className="digit-value">{String(countdown.m).padStart(2, '0')}</span>
                <span className="digit-unit">MIN</span>
              </div>
              <span className="digit-colon">:</span>
              <div className="digit-col">
                <span className="digit-value">{String(countdown.s).padStart(2, '0')}</span>
                <span className="digit-unit">SEC</span>
              </div>
            </div>
          </div>
        )}

        {countdown && countdown.over && (
          <div className="race-concluded-badge">
            <span>🏁 RACE WEEKEND COMPLETED</span>
          </div>
        )}
      </div>

      {/* Card 2: Authentic Vector Circuit Map */}
      <div className="f1-telemetry-card track-layout-card">
        <div className="card-header-row">
          <span className="card-kicker">CIRCUIT SCHEMATIC</span>
          <span className="track-code-badge">{meta?.shortName || 'TRACK'}</span>
        </div>

        <div className="track-svg-container">
          <svg viewBox={track.viewBox || '0 0 500 500'} className="circuit-vector-svg">
            {/* Background Glow Path */}
            <path d={track.path} className="track-path-glow" />
            {/* Main Crisp Track Path */}
            <path d={track.path} className="track-path-main" />
            {/* Start / Finish Indicator Line */}
            {track.startLine && (
              <line
                x1={track.startLine.x1}
                y1={track.startLine.y1}
                x2={track.startLine.x2}
                y2={track.startLine.y2}
                className="track-start-line"
              />
            )}
          </svg>
        </div>

        <div className="track-meta-footer">
          <div className="meta-stat">
            <span className="stat-label">LOCAL TIMEZONE</span>
            <span className="stat-val">{circuitTimezone}</span>
          </div>
          <div className="meta-stat">
            <span className="stat-label">FORMAT</span>
            <span className="stat-val">{isSprintWeekend ? 'SPRINT (100KM)' : 'STANDARD'}</span>
          </div>
        </div>
      </div>

      {/* Card 3: Weekend Session Timetable with dual-timezone accuracy & Sprint inclusion */}
      <div className="f1-telemetry-card schedule-card">
        <div className="card-header-row">
          <span className="card-kicker">WEEKEND SCHEDULE</span>
          <span className="tz-label">TRACK & LOCAL TIME</span>
        </div>

        <div className="session-list">
          {sessionList.map(({ key, label, type, data: sData }) => {
            const isGrandPrix = key === 'Race';
            const isSprint = key === 'Sprint';
            const isSprintQ = key === 'SprintQualifying';
            const userLocalStr = formatInTimezone(sData.date, sData.time, Intl.DateTimeFormat().resolvedOptions().timeZone);
            const trackLocalStr = formatInTimezone(sData.date, sData.time, circuitTimezone);

            return (
              <div 
                key={key} 
                className={`session-row ${isGrandPrix ? 'session-gp' : ''} ${isSprint ? 'session-sprint' : ''} ${isSprintQ ? 'session-sprint-q' : ''}`}
              >
                <div className="session-name-group">
                  <span className={`session-indicator indicator-${type}`} />
                  <span className="session-title">{label}</span>
                </div>
                <div className="session-times-group">
                  <div className="time-primary">{userLocalStr}</div>
                  <div className="time-secondary">Track: {trackLocalStr}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
