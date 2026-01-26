
import { useEffect, useRef, useState } from "react";
import { TrackSvg } from "./TrackSvg";
import { DriverMarker } from "./DriverMarker";
import "./raceAnimation.css";

// Colors for markers to distinguish drivers easily
const DRIVER_COLORS = [
    "#e10600", // Red (F1)
    "#00d2be", // Mercedes Teal
    "#ff8700", // McLaren Papaya
    "#0600ef", // Alpine Blue
    "#006f62", // Aston Green
];

export function RaceAnimation({ timeline, allResults, onClose }) {
  const [currentLap, setCurrentLap] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [displaySpeed, setDisplaySpeed] = useState(1); // UI State
  const [markers, setMarkers] = useState([]);
  const [trackViewBox, setTrackViewBox] = useState("0 0 900 600");

  
  const pathRef = useRef(null);
  const requestRef = useRef();
  const startTimeRef = useRef(null);
  const lapProgressRef = useRef(0);
  
  // Refs for mutable values accessed in loop
  const speedRef = useRef(1);
  const isPlayingRef = useRef(false);
  const timelineRef = useRef(timeline);
  const driversMap = useRef({});

  // Update refs when props/state change
  useEffect(() => { speedRef.current = displaySpeed; }, [displaySpeed]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { timelineRef.current = timeline; }, [timeline]);

  const totalLaps = timeline?.totalLaps || 50;
  
  // Build drivers map once
  useEffect(() => {
    allResults.forEach(r => {
        driversMap.current[r.Driver.driverId] = {
            ...r.Driver,
            color: null 
        };
    });

    const firstLap = timeline?.lapData[0];
    if (firstLap) {
        firstLap.positions.forEach((p, idx) => {
            if (driversMap.current[p.driverId]) {
                driversMap.current[p.driverId].color = DRIVER_COLORS[idx % DRIVER_COLORS.length];
            }
        });
    }
  }, [allResults, timeline]);

  // Main Animation Loop
  // Defined as ref to be stable but access latest refs
  const tickRef = useRef();
  
  tickRef.current = () => {
     // CRITICAL: Use ref instead of state to avoid stale closure
     if (isPlayingRef.current) {
        // Slower speed for better viewing
        // 0.05 laps per frame @ 60fps = 3 laps per second
        // A 78 lap race completes in ~26 seconds
        const increment = 0.05 * speedRef.current;
        
        lapProgressRef.current += increment;
        
        // Debug logging (remove after testing)
        if (Math.floor(lapProgressRef.current) !== Math.floor(lapProgressRef.current - increment)) {
            console.log(`Lap ${Math.floor(lapProgressRef.current)}/${totalLaps}`);
        }
        
        // Stop at 105% to show victory lap past finish line
        if (lapProgressRef.current >= totalLaps * 1.05) {
            lapProgressRef.current = totalLaps * 1.05;
            setIsPlaying(false);
            console.log("Race complete!");
            return; // Stop the loop
        }

        // CRITICAL: Update currentLap EVERY frame to force React re-render
        setCurrentLap(Math.min(Math.floor(lapProgressRef.current), totalLaps));
        updateMarkerPositions(lapProgressRef.current);
        
        // Always request next frame
        requestRef.current = requestAnimationFrame(tickRef.current);
     }
  };

  useEffect(() => {
    if (isPlaying) {
        requestRef.current = requestAnimationFrame(tickRef.current);
    } else {
        cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying]);

  function updateMarkerPositions(progressFloat) {
      if (!pathRef.current || !timelineRef.current) return;

      try {
        const tData = timelineRef.current;
        const totalL = tData.totalLaps;
        
        // Current lap index for data lookup
        const currentLapIndex = Math.min(Math.floor(progressFloat), totalL);
        const nextLapIndex = Math.min(currentLapIndex + 1, totalL);
        const lapInternalFraction = progressFloat % 1; 

        // Get position data for current and next lap
        const prevData = tData.lapData.find(d => d.lap === currentLapIndex) || tData.lapData[tData.lapData.length-1];
        const nextData = tData.lapData.find(d => d.lap === nextLapIndex) || prevData; 

        if (!prevData) return;

        const pathLength = pathRef.current.getTotalLength();
        
        // KEY LOGIC: All drivers move the same distance per lap
        // Allow going past 100% for victory lap
        const baseRaceProgress = Math.min(progressFloat / totalL, 1.05);
        
        // Debug: Log progress every 5 laps
        if (currentLapIndex % 5 === 0 && lapInternalFraction < 0.1) {
            console.log(`Lap ${currentLapIndex}: baseRaceProgress = ${(baseRaceProgress * 100).toFixed(1)}% of track`);
        }
        
        // CRITICAL FIX: Sort drivers by position to get RELATIVE rank (1, 2, 3...)
        // instead of using absolute race position (which could be 1, 20)
        const sortedPositions = [...prevData.positions].sort((a, b) => a.position - b.position);
        
        const newMarkers = sortedPositions.map((pos, relativeIndex) => {
            const driverId = pos.driverId;
            const driverInfo = driversMap.current?.[driverId];
            
            if (!driverInfo) return null; 

            // Get position for this driver in next lap (for smooth interpolation)
            const nextPosOpt = nextData?.positions.find(p => p.driverId === driverId);
            const nextPos = nextPosOpt ? nextPosOpt.position : pos.position;

            const currentRank = pos.position; // Actual race position (1-20)
            const targetRank = nextPos;
            
            // Smooth interpolation of position rank within the current lap
            const interpolatedRank = currentRank + (targetRank - currentRank) * lapInternalFraction;

            // CRITICAL: After race ends (past 100%), use larger spacing for clear separation
            let visualOffset;
            if (baseRaceProgress > 1.0) {
                // Victory lap - use relative rank with LARGER spacing for clarity
                // 4% per position: P1=0%, P2=4%, P3=8%, P4=12%, P5=16%
                // All stay between 89-105% of track (past finish line)
                visualOffset = relativeIndex * 0.04;
            } else {
                // During race - use smaller relative rank spacing (tight pack)
                visualOffset = relativeIndex * 0.015;
            }
            
            // Final track position: everyone moves together!
            let trackProgress = baseRaceProgress - visualOffset;
            
            // Clamp to valid range [0, 1]
            trackProgress = Math.max(0, Math.min(1.0, trackProgress));
            
            // Convert to path position
            const pathPosition = trackProgress * pathLength;

            const point = pathRef.current.getPointAtLength(pathPosition);
            
            return {
                id: driverId,
                info: driverInfo,
                x: point.x,
                y: point.y,
                position: Math.round(interpolatedRank), 
                lap: currentLapIndex,
                color: driverInfo.color || "#fff"
            };
        }).filter(Boolean);

        // Debug: Log EVERY update for the first few laps
        if (currentLapIndex < 3) {
            console.log(`Frame: Lap ${progressFloat.toFixed(2)}, Progress=${(baseRaceProgress*100).toFixed(1)}%`, 
                newMarkers.map(m => `${m.info.code}:(${m.x.toFixed(0)},${m.y.toFixed(0)})`).join(' '));
        }

        setMarkers(newMarkers);
      } catch (err) {
          console.error("Animation Loop Error:", err);
      }
  }

  const handleScrub = (e) => {
      const val = parseFloat(e.target.value);
      lapProgressRef.current = val;
      setCurrentLap(Math.min(Math.floor(val), totalLaps));
      updateMarkerPositions(val);
  };

  return (
    <div className="race-animation-container">
        <TrackSvg 
            ref={pathRef}    
            circuitName={timeline.circuitName}
            onViewBox={setTrackViewBox}
            />
        
        {/* Render Markers */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 900 600">
             {markers.map(m => (
                 <DriverMarker 
                    key={`${m.id}-${m.x.toFixed(0)}-${m.y.toFixed(0)}`}
                    driver={m.info}
                    x={m.x}
                    y={m.y}
                    position={m.position}
                    lap={m.lap}
                    color={m.color}
                 />
             ))}
        </svg>

        <div className="race-controls-bar">
            <button className="play-button" onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? "||" : "▶"}
            </button>
            
            <span className="race-info-display">
                Lap {currentLap}/{totalLaps}
            </span>

            <input 
                type="range" 
                min="0" 
                max={totalLaps} 
                step="0.1"
                value={lapProgressRef.current}
                onChange={handleScrub}
                className="progress-slider"
            />
            
            <select 
                value={displaySpeed} 
                onChange={(e) => setDisplaySpeed(Number(e.target.value))}
                style={{ background: '#333', color: 'white', border: '1px solid #555' }}
            >
                <option value="0.5">0.5x</option>
                <option value="1">1x</option>
                <option value="2">2x</option>
                <option value="5">5x</option>
            </select>
            
            <button className="play-button" style={{fontSize: '1rem', width: 'auto', padding: '0 1rem', borderRadius: '4px'}} onClick={onClose}>
                Close
            </button>
        </div>
    </div>
  );
}
