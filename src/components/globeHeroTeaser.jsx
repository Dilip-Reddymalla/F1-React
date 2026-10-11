import React, { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { Link } from 'react-router-dom';
import { useF1Season } from '../features/globe/hooks/useF1Season';
import './globeHeroTeaser.css';

export function GlobeHeroTeaser({ year = '2026' }) {
  const { races, suggestedIndex } = useF1Season(String(year || '2026'));
  const globeRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 340, height: 340 });

  // Dynamically size container
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Configure slow ambient auto-rotation
  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.9;
      controls.enableZoom = false; // keep hero interactive without trapping page scrolls
    }
    globeRef.current.pointOfView({ altitude: 2.1 });
  }, []);

  const nextRace = races[suggestedIndex] || races[0] || null;

  // Circuit pins
  const pins = (races || []).map((r) => ({
    lat: parseFloat(r.location?.lat || 0),
    lng: parseFloat(r.location?.long || 0),
    name: r.raceName,
    round: r.round,
    isNext: nextRace && String(r.round) === String(nextRace.round),
    color: nextRace && String(r.round) === String(nextRace.round) ? '#00e676' : '#ff1801',
    radius: nextRace && String(r.round) === String(nextRace.round) ? 1.6 : 0.75,
  }));

  // Connection arcs
  const arcs = [];
  if (races && races.length > 1) {
    for (let i = 0; i < races.length - 1; i++) {
      arcs.push({
        startLat: parseFloat(races[i].location?.lat || 0),
        startLng: parseFloat(races[i].location?.long || 0),
        endLat: parseFloat(races[i + 1].location?.lat || 0),
        endLng: parseFloat(races[i + 1].location?.long || 0),
        color: ['rgba(255, 24, 1, 0.4)', 'rgba(255, 255, 255, 0.3)'],
        stroke: 0.35,
        dashLength: 0.3,
      });
    }
  }

  return (
    <div className="globe-hero-teaser-card">
      {/* Visual 3D Preview Orb */}
      <div className="teaser-globe-wrapper" ref={containerRef}>
        <div className="teaser-ambient-glow" />
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          showAtmosphere={true}
          atmosphereColor="#e10600"
          atmosphereAltitude={0.18}
          pointsData={pins}
          pointLat="lat"
          pointLng="lng"
          pointColor="color"
          pointRadius="radius"
          pointAltitude={0.03}
          arcsData={arcs}
          arcStartLat="startLat"
          arcStartLng="startLng"
          arcEndLat="endLat"
          arcEndLng="endLng"
          arcColor="color"
          arcDashLength="dashLength"
          arcDashGap={1}
          arcDashInitialGap={() => Math.random()}
          arcDashAnimateTime={2500}
          arcStroke="stroke"
          arcAltitude={0.12}
        />
        <div className="teaser-scan-overlay" />
      </div>

      {/* Teaser Telemetry Info */}
      <div className="teaser-info-pane">
        <div className="teaser-badge-row">
          <span className="teaser-live-pill">
            <span className="teaser-dot" /> LIVE 3D TELEMETRY
          </span>
          <span className="teaser-year-pill">{year} CALENDAR</span>
        </div>

        <h3 className="teaser-heading">
          Explore The 24-Round <span className="highlight-red">Global Odyssey</span>
        </h3>
        <p className="teaser-desc">
          Fly across continuous 3D orbital trajectories, inspect live circuit blueprints,
          and track official track schedules worldwide.
        </p>

        {nextRace && (
          <div className="teaser-spotlight">
            <span className="spotlight-kicker">NEXT DESTINATION</span>
            <div className="spotlight-title">{nextRace.raceName}</div>
            <div className="spotlight-loc">
              📍 {nextRace.location?.locality}, {nextRace.location?.country} (Round {nextRace.round})
            </div>
          </div>
        )}

        <div className="teaser-action-row">
          <Link to="/globe" className="teaser-launch-btn">
            Launch Full 3D World Tour <span className="btn-arrow">→</span>
          </Link>
          <span className="teaser-telemetry-stats">
            <strong>24</strong> Circuits • <strong>5</strong> Continents
          </span>
        </div>
      </div>
    </div>
  );
}
export default GlobeHeroTeaser;
