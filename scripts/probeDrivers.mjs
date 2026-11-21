const year = 2026;

// 1. drivers.json with explicit limit=100
const d = await (await fetch(`https://api.jolpi.ca/ergast/f1/${year}/drivers.json?limit=100`)).json();
const drivers = d.MRData.DriverTable.Drivers;
console.log("drivers (limit=100): count:", drivers.length, "| has VER:", drivers.some((x) => x.driverId === "max_verstappen"));
console.log("driver ids:", drivers.map((x) => x.driverId).join(", "));

// 2. drivers.json default (no limit) — see what orders come back
const d0 = await (await fetch(`https://api.jolpi.ca/ergast/f1/${year}/drivers.json`)).json();
const drivers0 = d0.MRData.DriverTable.Drivers;
console.log("\ndrivers (default): count:", drivers0.length);
console.log("ids:", drivers0.map((x) => x.driverId).join(", "));

// 3. results.json with limit=100
const r = await (await fetch(`https://api.jolpi.ca/ergast/f1/${year}/results.json?limit=100`)).json();
const races = r.MRData?.RaceTable?.Races ?? [];
console.log("\nresults (limit=100): races:", races.length, "| total:", r.MRData.total);
const seen = new Set();
for (const race of races) {
  for (const res of race.Results || []) seen.add(res.Driver.driverId);
}
console.log("unique drivers seen:", seen.size, "| has VER:", seen.has("max_verstappen"));
