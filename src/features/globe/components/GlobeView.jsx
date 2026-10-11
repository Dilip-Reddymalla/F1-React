import React, { useEffect, useRef, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import { getCircuitMeta } from '../data/circuitsMeta';

export function GlobeView({ 
  races = [], 
  selectedRound, 
  onSelectRound,
  countriesGeoJson 
}) {
  const globeRef = useRef();
  const containerRef = useRef();
  const [globeReady, setGlobeReady] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // ResizeObserver for zero-lag layout adapting
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

  // Compute selected race and coordinates
  const currentRace = useMemo(() => {
    return races.find((r) => String(r.round) === String(selectedRound)) || races[0];
  }, [races, selectedRound]);

  // Smooth POV camera flight when selected round changes
  useEffect(() => {
    if (!globeRef.current || !currentRace || !globeReady) return;

    const lat = parseFloat(currentRace.location?.lat || 0);
    const lng = parseFloat(currentRace.location?.long || 0);

    const targetAlt = window.innerWidth < 768 ? 1.9 : 1.35;
    globeRef.current.pointOfView(
      {
        lat,
        lng,
        altitude: targetAlt,
      },
      1400
    );
  }, [currentRace, globeReady]);

  // Prepare all circuit pins - prominently sized with rich hover label
  const circuitPins = useMemo(() => {
    return races.map((race) => {
      const lat = parseFloat(race.location?.lat || 0);
      const lng = parseFloat(race.location?.long || 0);
      const isSelected = String(race.round) === String(selectedRound);
      const meta = getCircuitMeta(race.circuitId);

      return {
        lat,
        lng,
        round: race.round,
        raceName: race.raceName,
        locality: race.location?.locality || '',
        country: race.location?.country || '',
        flagIso: meta?.flagIso || 'un',
        isSelected,
        color: isSelected ? '#ff1801' : 'rgba(255, 255, 255, 0.95)',
        // Significantly larger points: 1.4 for selected, 0.8 for unselected
        radius: isSelected ? 1.4 : 0.8,
        altitude: isSelected ? 0.03 : 0.015,
      };
    });
  }, [races, selectedRound]);

  // Calendar trajectory arcs connecting rounds 1 -> 2 -> ... -> 24
  const trajectoryArcs = useMemo(() => {
    if (!races || races.length < 2) return [];
    const arcs = [];
    for (let i = 0; i < races.length - 1; i++) {
      const from = races[i];
      const to = races[i + 1];
      const isCurrentLeg = String(from.round) === String(selectedRound);

      arcs.push({
        startLat: parseFloat(from.location?.lat || 0),
        startLng: parseFloat(from.location?.long || 0),
        endLat: parseFloat(to.location?.lat || 0),
        endLng: parseFloat(to.location?.long || 0),
        color: isCurrentLeg 
          ? ['rgba(255, 24, 1, 0.95)', 'rgba(255, 255, 255, 0.95)'] 
          : ['rgba(225, 6, 0, 0.3)', 'rgba(255, 255, 255, 0.25)'],
        stroke: isCurrentLeg ? 0.7 : 0.3,
        dashLength: isCurrentLeg ? 0.4 : 0.2,
      });
    }
    return arcs;
  }, [races, selectedRound]);

  // Glowing pulse rings around selected race location
  const ringsData = useMemo(() => {
    if (!currentRace) return [];
    const lat = parseFloat(currentRace.location?.lat || 0);
    const lng = parseFloat(currentRace.location?.long || 0);
    return [
      {
        lat,
        lng,
        maxR: 3.8,
        propagationSpeed: 2.2,
        repeatPeriod: 750,
      },
    ];
  }, [currentRace]);

  return (
    <div className="globe-canvas-shell" ref={containerRef}>
      {/* Ambient Vignette & Scanlines */}
      <div className="globe-vignette-overlay" />
      
      {/* Telemetry Corner HUD */}
      <div className="globe-telemetry-hud">
        <div className="telemetry-badge">
          <span className="live-dot" /> LIVE 3D ORBIT
        </div>
        <div className="telemetry-coords">
          LAT: {parseFloat(currentRace?.location?.lat || 0).toFixed(4)}° | 
          LNG: {parseFloat(currentRace?.location?.long || 0).toFixed(4)}°
        </div>
      </div>

      <Globe
        ref={globeRef}
        onGlobeReady={() => {
          setGlobeReady(true);
          const controls = globeRef.current?.controls?.();
          if (controls) {
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.autoRotate = false;
          }
        }}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        showAtmosphere={true}
        atmosphereColor="#e10600"
        atmosphereAltitude={0.15}
        
        // Circuit Pins / Points Layer with prominent size and hover tooltip
        pointsData={circuitPins}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointRadius="radius"
        pointAltitude="altitude"
        pointsMerge={false}
        pointLabel={(d) => `
          <div style="
            background: rgba(11, 11, 13, 0.94);
            border: 1px solid #e10600;
            padding: 6px 12px;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.8);
            font-family: system-ui, -apple-system, sans-serif;
            pointer-events: none;
            backdrop-filter: blur(8px);
          ">
            <div style="font-size: 10px; font-weight: 800; color: #e10600; letter-spacing: 0.1em; text-transform: uppercase;">
              ROUND ${String(d.round).padStart(2, '0')}
            </div>
            <div style="font-size: 13px; font-weight: 800; color: #ffffff; margin-top: 2px;">
              ${d.raceName}
            </div>
            <div style="font-size: 11px; color: #b5b7ba; margin-top: 2px;">
              📍 ${d.locality}, ${d.country}
            </div>
          </div>
        `}
        onPointHover={(point) => {
          setHoveredPoint(point || null);
        }}
        onPointClick={(d) => {
          if (d?.round) onSelectRound(d.round);
        }}
        
        // Active selected Marker HUD beacon
        htmlElementsData={circuitPins.filter((p) => p.isSelected)}
        htmlElement={(d) => {
          const el = document.createElement('div');
          el.className = 'globe-active-marker-hud';
          el.innerHTML = `
            <div class="marker-pulse-beacon">
              <span class="beacon-core"></span>
              <span class="beacon-ring"></span>
            </div>
            <div class="marker-label-box">
              <span class="marker-round">R${String(d.round).padStart(2, '0')}</span>
              <span class="marker-city">${d.locality}</span>
            </div>
          `;
          return el;
        }}
        htmlAltitude={0.035}

        // Season Journey Arcs
        arcsData={trajectoryArcs}
        arcColor="color"
        arcStroke="stroke"
        arcDashLength="dashLength"
        arcDashGap={0.15}
        arcDashAnimateTime={2500}
        arcAltitudeAutoScale={0.25}

        // Pulsing Target Ring
        ringsData={ringsData}
        ringColor={() => '#e10600'}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
      />
    </div>
  );
}
