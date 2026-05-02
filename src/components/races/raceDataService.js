const driverLapCache = new Map();
const driverColorPalette = [
  "#1E41FF",
  "#00D2BE",
  "#DC0000",
  "#FF8700",
  "#006F62",
  "#9B59B6",
  "#F1C40F",
  "#E67E22",
  "#95A5A6",
  "#E74C3C",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function assignDriverColor(driverId, index = 0) {
  const fallbackIndex = Math.abs(String(driverId || index).split("").reduce((total, char) => total + char.charCodeAt(0), 0));
  return driverColorPalette[fallbackIndex % driverColorPalette.length];
}

export function assignDriverColors(drivers = []) {
  return drivers.map((driver, index) => ({
    ...driver,
    color: driver.color || assignDriverColor(driver.id || driver.driverId, index),
  }));
}

export async function getRaceData(year, round, driverIds) {
  if (!year || !round || !driverIds) return null;

  try {
    // Fetch lap data for each driver individually
    const allLapsData = {};
    let circuitName = "Unknown Circuit";

    for (const driverId of driverIds) {
      try {
        const cacheKey = `${year}:${round}:${driverId}`;
        if (driverLapCache.has(cacheKey)) {
          allLapsData[driverId] = driverLapCache.get(cacheKey);
          continue;
        }

        const response = await fetch(
          `https://api.jolpi.ca/ergast/f1/${year}/${round}/drivers/${driverId}/laps.json?limit=2000`,
        );
        const data = await response.json();
        const raceInfo = data.MRData.RaceTable.Races[0];

        // Extract circuit name from first successful response
        if (!circuitName || circuitName === "Unknown Circuit") {
          circuitName = raceInfo?.Circuit?.circuitName || "Unknown Circuit";
        }

        const lapsData = raceInfo?.Laps || [];
        if (lapsData.length > 0) {
          allLapsData[driverId] = lapsData;
          driverLapCache.set(cacheKey, lapsData);
        }
      } catch (err) {
        console.warn(`Error fetching lap data for driver ${driverId}:`, err);
      }

      await sleep(250);
    }

    if (Object.keys(allLapsData).length === 0) {
      console.error("No lap data found for any driver");
      return null;
    }

    // Process and combine lap data
    const { lapData, driverTotalTimes } =
      processRealLapsIndividual(allLapsData);

    if (lapData.length === 0) {
      console.error("Failed to process lap data");
      return null;
    }

    // Convert total times to HH:MM:SS format
    const formattedTotalTimes = {};
    Object.entries(driverTotalTimes).forEach(([driverId, totalSeconds]) => {
      formattedTotalTimes[driverId] = convertSecondsToTime(totalSeconds);
    });

    const totalRaceLaps = lapData[lapData.length - 1].lap;

    return {
      type: "REAL",
      totalLaps: totalRaceLaps,
      lapData: {
        laps: lapData,
        driverTotalTimes: formattedTotalTimes,
      },
      circuitName: circuitName,
    };
  } catch (err) {
    console.error("Error fetching lap data:", err);
    return null;
  }
}

function processRealLapsIndividual(allLapsData) {
  // Create a map to track lap data for each driver
  const lapMap = new Map();
  const driverTotalTimes = {}; // Track total time for each driver

  // Process each driver's lap data
  Object.entries(allLapsData).forEach(([driverId, lapsData]) => {
    driverTotalTimes[driverId] = 0;

    lapsData.forEach((lap) => {
      const lapNumber = parseInt(lap.number);

      if (!lapMap.has(lapNumber)) {
        lapMap.set(lapNumber, {
          lap: lapNumber,
          positions: [],
          lapTimes: {},
        });
      }
      // Each driver should have one timing entry per lap
      if (lap.Timings && lap.Timings.length > 0) {
        const timing = lap.Timings[0];
        const lapTime = timing.time; // Get lap time from API

        lapMap.get(lapNumber).positions.push({
          driverId: driverId,
          position: parseInt(timing.position),
        });

        // Store lap time for this driver and lap
        lapMap.get(lapNumber).lapTimes[driverId] = lapTime;

        // Add to total time if lap time exists
        if (lapTime) {
          driverTotalTimes[driverId] += convertTimeToSeconds(lapTime);
        }
      }
    });
  });

  // Convert map to array and sort by lap number
  const processed = Array.from(lapMap.values()).sort((a, b) => a.lap - b.lap);

  return {
    lapData: processed,
    driverTotalTimes: driverTotalTimes,
  };
}

// Helper function to convert time string (MM:SS.mmm) to seconds
function convertTimeToSeconds(timeString) {
  if (!timeString) return 0;
  const parts = timeString.split(":");
  const minutes = parseInt(parts[0]) || 0;
  const seconds = parseFloat(parts[1]) || 0;
  return minutes * 60 + seconds;
}

// Helper function to convert seconds to HH:MM:SS format
function convertSecondsToTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = (seconds % 60).toFixed(0);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
