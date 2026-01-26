import { useState, useEffect, useRef } from "react";
import { Header } from "../components/header";
import { Dropdown } from "../components/dropdown";
import { RaceSelector } from "../components/races/RaceSelector";
import { Podium } from "../components/races/Podium";
import { ResultsTable } from "../components/races/ResultsTable";
import { DriverDetails } from "../components/races/DriverDetails";
import { getRaceData } from "../components/races/raceDataService"; 
import { RaceAnimation } from "../components/races/RaceAnimation";
import "./races.css"; 

export default function Races({ year, setYear }) {
  // 1. State Declarations (Must be first)
  const [races, setRaces] = useState([]);
  const [selectedRound, setSelectedRound] = useState(null);
  const [allResults, setAllResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultsError, setResultsError] = useState(null);
 
  const [selectedDriverResult, setSelectedDriverResult] = useState(null);
  const [selectedDriverIds, setSelectedDriverIds] = useState([]);
  const [animationLoading, setAnimationLoading] = useState(false);
  const [raceTimeline, setRaceTimeline] = useState(null);
  
  const animationRef = useRef(null);

  // 2. Effects
  // Reset state when year changes
  useEffect(() => {
    setRaces([]);
    setSelectedRound(null);
    setAllResults([]);
    setError(null);
    setResultsError(null);
    setSelectedDriverResult(null);
    setSelectedDriverIds([]);
    setRaceTimeline(null);
  }, [year]);

  // Scroll to animation when it starts
  useEffect(() => {
    if (raceTimeline && animationRef.current) {
        animationRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [raceTimeline]);

  async function fetchRaces() {
    setLoading(true);
    setError(null);
    try {
        const response = await fetch(`https://api.jolpi.ca/ergast/f1/${year}.json`);
        const data = await response.json();
        const raceList = data.MRData.RaceTable.Races;
        setRaces(raceList);
    } catch (err) {
        setError("Failed to fetch race schedule.");
        console.error(err);
    } finally {
        setLoading(false);
    }
  }

  async function fetchResults() {
      if (!selectedRound) return;
      
      setResultsLoading(true);
      setResultsError(null);
      setAllResults([]);
      setSelectedDriverResult(null);
      setSelectedDriverIds([]); 
      setRaceTimeline(null);

      try {
          const response = await fetch(`https://api.jolpi.ca/ergast/f1/${year}/${selectedRound}/results.json`);
          const data = await response.json();
          const raceData = data.MRData.RaceTable.Races[0];
          
          if (raceData && raceData.Results) {
              setAllResults(raceData.Results);
          } else {
              setResultsError("No results found for this race yet.");
          }
      } catch (err) {
          setResultsError("Failed to fetch race results.");
          console.error(err);
      } finally {
          setResultsLoading(false);
      }
  }

  function handleRoundChange(round) {
      setSelectedRound(round);
      setAllResults([]); 
      setResultsError(null);
      setSelectedDriverResult(null);
      setSelectedDriverIds([]);
      setRaceTimeline(null);
  }

  function handleDriverSelect(driverResult) {
    setSelectedDriverResult(driverResult);
  }

  function handleToggleSelection(driverId) {
    if (selectedDriverIds.includes(driverId)) {
        setSelectedDriverIds(prev => prev.filter(id => id !== driverId));
    } else {
        if (selectedDriverIds.length < 5) {
            setSelectedDriverIds(prev => [...prev, driverId]);
        }
    }
  }

  async function handleAnimateRace() {
      setAnimationLoading(true);
      try {
          const data = await getRaceData(year, selectedRound, selectedDriverIds, allResults);
          setRaceTimeline(data);
          // Scroll effect is handled purely by useEffect now
          
      } catch (err) {
          console.error("Animation prep failed", err);
          alert("Failed to prepare animation data");
      } finally {
          setAnimationLoading(false);
      }
  }

  return (
    <>
      <Header />
      <main className="races-page">
        <h1>Race Results</h1>
        
        {/* Controls... */}
        <div className="controls-container">
            <div className="control-group">
                <label>Select Year:</label>
                <Dropdown value={year} onChange={setYear} />
                <button onClick={fetchRaces} disabled={loading}>
                    {loading ? "Loading..." : "Get Schedule"}
                </button>
            </div>

            <div className="control-group">
                <label>Select Race:</label>
                <RaceSelector 
                    races={races} 
                    selectedRound={selectedRound} 
                    onChange={handleRoundChange} 
                />
                <button 
                    onClick={fetchResults} 
                    disabled={!selectedRound || resultsLoading}
                    className="action-button"
                >
                    {resultsLoading ? "Loading Results..." : "Get Results"}
                </button>
            </div>
        </div>

        {error && <p className="error-message">{error}</p>}
        {resultsError && <p className="error-message">{resultsError}</p>}
        
        {/* Animation Section */}
        {raceTimeline && (
            <div ref={animationRef} className="animation-wrapper">
                <RaceAnimation 
                    timeline={raceTimeline} 
                    allResults={allResults}
                    onClose={() => setRaceTimeline(null)}
                />
            </div>
        )}

        {/* Results Table (Hide if animating? No, keep it) */}
        {allResults.length > 0 && (
            <div className="results-container">
                <Podium results={allResults.slice(0, 3)} />
                <ResultsTable 
                    results={allResults} 
                    onDriverSelect={handleDriverSelect} 
                    selectedDriverIds={selectedDriverIds}
                    onToggleSelection={handleToggleSelection}
                />
            </div>
        )}

        {/* Animation Floating Action Bar - Hide if Animation Active */}
        {allResults.length > 0 && selectedDriverIds.length > 0 && !raceTimeline && (
            <div className="animation-fab-container">
                    <span className="selection-count">
                    {selectedDriverIds.length} / 5 Selected
                    </span>
                    <button 
                    onClick={handleAnimateRace}
                    disabled={selectedDriverIds.length < 2 || animationLoading}
                    className="animate-button"
                    >
                    {animationLoading ? "Preparing Data..." : 
                        (selectedDriverIds.length < 2 
                        ? "Select at least 2 drivers" 
                        : "Animate Race")
                    }
                    </button>
            </div>
        )}

        {selectedDriverResult && (
            <DriverDetails 
                result={selectedDriverResult} 
                onClose={() => setSelectedDriverResult(null)} 
            />
        )}
      </main>
    </>
  );
}
