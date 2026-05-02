const driverLapCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const F1_TEAM_COLORS = {
  // 🟠 McLaren — Papaya Orange / Anthracite
  mclaren: { primary: "#FF8000", accent: "#1A1A2E" },

  // 🔴 Scuderia Ferrari — Rosso Corsa / Yellow
  ferrari: { primary: "#DC0000", accent: "#FFF200" },

  // 🔵 Red Bull Racing — Dark Blue / Red
  redbull: { primary: "#1E3A6E", accent: "#CC1E1E" },

  // ⚫ Mercedes-AMG Petronas — Silver / Teal
  mercedes: { primary: "#C0C0C0", accent: "#00A19B" },

  // 🟢 Aston Martin — British Racing Green / Lime
  astonmartin: { primary: "#00665E", accent: "#B0FF00" },

  // 🩷 Alpine — Blue / Pink
  alpine: { primary: "#0078FF", accent: "#FF69B4" },

  // ⚪ Haas — White / Red
  haas: { primary: "#E8002D", accent: "#FFFFFF" },

  // ⚪ Racing Bulls (VCARB) — White / Navy
  racingbulls: { primary: "#1E41FF", accent: "#C8102E" },

  // 🔵 Williams — Navy Blue / Azure
  williams: { primary: "#005AFF", accent: "#00A3E0" },

  // 🟢 Kick Sauber — Lime Green / Black
  sauber: { primary: "#52E252", accent: "#121212" },
};

const F1_DRIVER_COLORS = {
  // McLaren
  norris: F1_TEAM_COLORS.mclaren.primary, // Lando Norris  #4  🟠
  piastri: F1_TEAM_COLORS.mclaren.accent, // Oscar Piastri #81

  // Ferrari
  leclerc: F1_TEAM_COLORS.ferrari.primary, // Charles Leclerc #16 🔴
  hamilton: F1_TEAM_COLORS.ferrari.accent, // Lewis Hamilton  #44

  // Red Bull Racing
  verstappen: F1_TEAM_COLORS.redbull.primary, // Max Verstappen #1  🔵
  lawson: F1_TEAM_COLORS.redbull.accent, // Liam Lawson    #30

  // Mercedes
  russell: F1_TEAM_COLORS.mercedes.primary, // George Russell  #63 ⚫
  antonelli: F1_TEAM_COLORS.mercedes.accent, // Kimi Antonelli  #12

  // Aston Martin
  alonso: F1_TEAM_COLORS.astonmartin.primary, // Fernando Alonso #14 🟢
  stroll: F1_TEAM_COLORS.astonmartin.accent, // Lance Stroll    #18

  // Alpine
  gasly: F1_TEAM_COLORS.alpine.primary, // Pierre Gasly    #10 🩷
  colapinto: F1_TEAM_COLORS.alpine.accent, // Franco Colapinto #43

  // Haas
  ocon: F1_TEAM_COLORS.haas.primary, // Esteban Ocon   #31 ⚪
  bearman: F1_TEAM_COLORS.haas.accent, // Oliver Bearman #87

  // Racing Bulls
  tsunoda: F1_TEAM_COLORS.racingbulls.primary, // Yuki Tsunoda   #22 ⚪
  hadjar: F1_TEAM_COLORS.racingbulls.accent, // Isack Hadjar   #6

  // Williams
  sainz: F1_TEAM_COLORS.williams.primary, // Carlos Sainz   #55 🔵
  albon: F1_TEAM_COLORS.williams.accent, // Alex Albon     #23

  // Kick Sauber
  hulkenberg: F1_TEAM_COLORS.sauber.primary, // Nico Hülkenberg #27 🟢
  bortoleto: F1_TEAM_COLORS.sauber.accent, // Gabriel Bortoleto #5
};

function normalizeDriverKey(id = "") {
  return String(id)
    .toLowerCase()
    .replace(/[\s\-_]+/g, "")
    .replace(/[^a-z]/g, "");
}

function hashColor(seed) {
  // Deterministic fallback from a palette of team secondaries
  const fallbackPool = Object.values(F1_TEAM_COLORS).flatMap((t) => [
    t.primary,
    t.accent,
  ]);
  const hash = Math.abs(
    String(seed)
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
  );
  return fallbackPool[hash % fallbackPool.length];
}

// ─────────────────────────────────────────────────────────────────
// Public API  (drop-in replacement for your original functions)
// ─────────────────────────────────────────────────────────────────

export function assignDriverColor(driverId, index = 0) {
  const key = normalizeDriverKey(driverId);
  return F1_DRIVER_COLORS[key] ?? hashColor(driverId || index);
}

export function assignDriverColors(drivers = []) {
  return drivers.map((driver, index) => ({
    ...driver,
    color:
      driver.color ||
      assignDriverColor(driver.id ?? driver.driverId ?? driver.name, index),
  }));
}

export { F1_TEAM_COLORS, F1_DRIVER_COLORS };
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
