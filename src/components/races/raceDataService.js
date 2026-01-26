
// Helper to pause for simulation effects
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function getRaceData(year, round, driverIds, finalResults) {
    if (!year || !round || !driverIds) return null;

    try {
        // Fetch up to 2000 laps (coverage for most races)
        const response = await fetch(`https://api.jolpi.ca/ergast/f1/${year}/${round}/laps.json?limit=2000`);
        const data = await response.json();
        const raceInfo = data.MRData.RaceTable.Races[0];
        const lapsData = raceInfo?.Laps;
        
        // Extract circuit name for track rendering
        const circuitName = raceInfo?.Circuit?.circuitName || "Unknown Circuit";
        console.log("🏁 Circuit detected:", circuitName); // DEBUG

        // Determine total laps from the winner's result
        const winner = finalResults.find(r => r.position === "1");
        const totalRaceLaps = winner ? parseInt(winner.laps) : 50; // Fallback if missing

        if (lapsData && lapsData.length > 0) {
            console.log(`Found real lap data (${lapsData.length} laps). Total race laps: ${totalRaceLaps}`);
            
            const realTimeline = processRealLaps(lapsData, driverIds);
            
            if (realTimeline.length === 0) {
                 console.warn("Real data found but no matching driver times. Using simulation.");
                 return generateSimulatedLaps(driverIds, finalResults, totalRaceLaps, circuitName);
            }

            const lastRealLap = realTimeline[realTimeline.length - 1].lap;

            if (lastRealLap < totalRaceLaps) {
                console.warn(`Partial Data Detected: Real data ends at lap ${lastRealLap}, Race is ${totalRaceLaps} laps. Extending with simulation...`);
                return extendWithSimulation(realTimeline, totalRaceLaps, driverIds, finalResults, circuitName);
            }

            return {
                type: 'REAL',
                totalLaps: lastRealLap,
                lapData: realTimeline,
                circuitName: circuitName
            };
        } else {
            console.warn("No lap data found. Generating full simulation...");
            return generateSimulatedLaps(driverIds, finalResults, totalRaceLaps, circuitName);
        }

    } catch (err) {
        console.error("Error fetching lap data, falling back to full simulation:", err);
        return generateSimulatedLaps(driverIds, finalResults, 50, "Unknown Circuit");
    }
}

function processRealLaps(lapsData, driverIds) {
    const processed = [];

    lapsData.forEach(lap => {
        const timings = lap.Timings.filter(t => driverIds.includes(t.driverId));
        
        if (timings.length > 0) {
            const lapNumber = parseInt(lap.number);
            const positions = timings.map(t => ({
                driverId: t.driverId,
                position: parseInt(t.position)
            }));

            processed.push({
                lap: lapNumber,
                positions: positions
            });
        }
    });
    
    // Sort by lap number just in case
    return processed.sort((a, b) => a.lap - b.lap);
}

function extendWithSimulation(realTimeline, totalLaps, driverIds, finalResults, circuitName) {
    const lastRealData = realTimeline[realTimeline.length - 1];
    const startLap = lastRealData.lap + 1;
    const missingLaps = totalLaps - lastRealData.lap;
    
    const simulatedPart = [];

    // Get starting positions for simulation (from last real lap)
    // If a driver wasn't in the last real lap (e.g. out), use their last known or bottom
    const simDrivers = driverIds.map(id => {
        const inLastLap = lastRealData.positions.find(p => p.driverId === id);
        const finalRes = finalResults.find(r => r.Driver.driverId === id);
        return {
            id: id,
            startPos: inLastLap ? inLastLap.position : parseInt(finalRes.grid || 20), // Fallback
            endPos: parseInt(finalRes.positionText === "R" || !finalRes.position ? 20 : finalRes.position) // Handle DNFs roughly
        };
    });

    // Interpolate
    for (let i = 0; i < missingLaps; i++) {
        const currentLap = startLap + i;
        const progress = (i + 1) / missingLaps;

        const currentPositions = simDrivers.map(d => {
            // Linear iterpolation from LastReal -> Final
            const exactPos = d.startPos + (d.endPos - d.startPos) * progress;
            // Less noise since we want to converge smoothly
            const noise = (Math.random() - 0.5) * 2; 
            let simulatedPos = Math.round(exactPos + (progress < 0.9 ? noise : 0));
            if (simulatedPos < 1) simulatedPos = 1;
            if (simulatedPos > 22) simulatedPos = 22;

            return {
                driverId: d.id,
                position: simulatedPos
            };
        });

        simulatedPart.push({
            lap: currentLap,
            positions: currentPositions
        });
    }

    return {
        type: 'HYBRID (Real + Sim)',
        totalLaps: totalLaps,
        lapData: [...realTimeline, ...simulatedPart],
        circuitName: circuitName
    };
}

function generateSimulatedLaps(driverIds, finalResults, totalLaps = 50, circuitName = "Unknown Circuit") {
    // ... (This function remains mostly same, just ensuring args match)
    
    const drivers = driverIds.map(id => {
        const result = finalResults.find(r => r.Driver.driverId === id);
        let endP = parseInt(result.position);
        if (isNaN(endP)) endP = 20; // Handle non-finishes

        return {
            id: id,
            startPos: parseInt(result.grid) || 20,
            endPos: endP
        };
    });

    const lapData = [];

    for (let i = 0; i <= totalLaps; i++) {
        const progress = i / totalLaps;
        
        const currentPositions = drivers.map(d => {
            const exactPos = d.startPos + (d.endPos - d.startPos) * progress;
            let simulatedPos;
            
            if (i < 5 || i > (totalLaps - 5)) {
                simulatedPos = Math.round(exactPos);
            } else {
                const noise = (Math.random() - 0.5) * 5; 
                simulatedPos = Math.round(exactPos + noise);
            }
            if (simulatedPos < 1) simulatedPos = 1;
            if (simulatedPos > 22) simulatedPos = 22;
            
            return { driverId: d.id, position: simulatedPos };
        });

        lapData.push({
            lap: i,
            positions: currentPositions
        });
    }

    return {
        type: 'SIMULATION',
        totalLaps: totalLaps,
        lapData: lapData,
        circuitName: circuitName
    };
}
