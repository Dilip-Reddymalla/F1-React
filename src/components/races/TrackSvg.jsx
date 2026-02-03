import { forwardRef, useEffect } from "react";
import { CIRCUIT_TRACKS, getCircuitKey } from "./circuitTracks";

export const TrackSvg = forwardRef(
  ({ circuitName = "Unknown Circuit", onViewBox }, ref) => {
    // Get the circuit key and track data
    // const circuitKey = getCircuitKey(circuitName);
    // const trackData = CIRCUIT_TRACKS[circuitKey] || CIRCUIT_TRACKS.generic;

    // FORCE GENERIC TRACK AS REQUESTED
    const trackData = CIRCUIT_TRACKS.generic;

    useEffect(() => {
      onViewBox?.(trackData.viewBox);
    }, [trackData.viewBox, onViewBox]);

    return (
      <svg viewBox={trackData.viewBox} className="track-svg">
        {/* Background/Border Track */}
        <path d={trackData.path} className="track-path-bg" />

        {/* Main Path for Animation */}
        <path
          ref={ref}
          id="race-path"
          d={trackData.path}
          className="track-path-main"
        />

        {/* Start/Finish Line */}
        <line
          x1={trackData.startLine.x1}
          y1={trackData.startLine.y1}
          x2={trackData.startLine.x2}
          y2={trackData.startLine.y2}
          stroke="white"
          strokeWidth="4"
        />
      </svg>
    );
  },
);

TrackSvg.displayName = "TrackSvg";
