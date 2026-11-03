"""Real-time data fetching from the Jolpica F1 API.

What this does:
1. Discovers the current season (e.g. 2026) from the API.
2. Downloads results for every race in that season that has already
   happened (date <= today) and appends them to data/raw/race_results.csv.
3. Rebuilds the DNF dataset and feature dataset so training data stays
   up to date.
4. Identifies the NEXT upcoming race (the one we will predict).

Run directly:
    python src/data/fetch_latest.py
"""
import sys
import time
from datetime import date
from pathlib import Path

import pandas as pd
import requests


def _root():
    for p in Path(__file__).resolve().parents:
        if (p / "config.py").exists():
            return p
    raise RuntimeError("Could not locate project root")


ROOT = _root()
sys.path.insert(0, str(ROOT))

from config import JOLPICA_BASE, RACE_RESULTS_CSV                         # noqa: E402
from src.data.create_dataset import build_dnf_dataset                     # noqa: E402
from src.features.build_features import build_feature_file                # noqa: E402

SESSION = requests.Session()


# ---------------------------------------------------------------------------
# Low-level API helpers
# ---------------------------------------------------------------------------
def api_get(url):
    """GET a URL with retry handling for rate limits / transient errors."""
    for attempt in range(5):
        try:
            response = SESSION.get(url, timeout=30)
            if response.status_code == 429:
                print("Rate limited. Waiting 20 seconds...")
                time.sleep(20)
                continue
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Request failed (attempt {attempt + 1}/5): {e}")
            time.sleep(5)
    raise RuntimeError(f"Failed after 5 attempts: {url}")


def get_current_season():
    """Return (season, races) for the current F1 season."""
    data = api_get(f"{JOLPICA_BASE}/current.json")
    rt = data["MRData"]["RaceTable"]
    season = int(rt["season"])
    races = [
        {
            "round": int(r["round"]),
            "race": r["raceName"],
            "date": r["date"],
            "circuit": r["Circuit"]["circuitName"],
        }
        for r in rt["Races"]
    ]
    return season, races


def parse_results(race_info, season):
    """Convert one race's results payload into our raw CSV row format."""
    rows = []
    for drv in race_info["Results"]:
        rows.append({
            "season": season,
            "round": int(race_info["round"]),
            "race": race_info["raceName"],
            "date": race_info["date"],
            "circuit": race_info["Circuit"]["circuitName"],
            "driver": f'{drv["Driver"]["givenName"]} {drv["Driver"]["familyName"]}',
            "driver_id": drv["Driver"]["driverId"],
            "constructor": drv["Constructor"]["name"],
            "grid": drv["grid"],
            "finish_position": drv.get("position"),
            "status": drv["status"],
            "points": drv["points"],
        })
    return rows


def fetch_results_for_round(season, round_no):
    """Fetch results for one round. Returns a list of row dicts."""
    url = f"{JOLPICA_BASE}/{season}/{round_no}/results.json?limit=100"
    data = api_get(url)
    races = data["MRData"]["RaceTable"]["Races"]
    if not races:
        return []
    return parse_results(races[0], season)


# ---------------------------------------------------------------------------
# Refresh logic
# ---------------------------------------------------------------------------
def load_existing():
    """Load the existing raw CSV and the set of (season, round) already done."""
    if RACE_RESULTS_CSV.exists():
        df = pd.read_csv(RACE_RESULTS_CSV)
        done = set(zip(df["season"], df["round"]))
        return df, done
    return pd.DataFrame(), set()


def refresh_historical(season, races):
    """Append any newly completed races of the current season to the CSV."""
    df, done = load_existing()
    rows = df.to_dict("records") if not df.empty else []
    today = date.today().isoformat()
    added = 0

    for r in races:
        if r["date"] > today:
            continue  # race has not happened yet
        if (season, r["round"]) in done:
            continue

        res = fetch_results_for_round(season, r["round"])
        if not res:
            continue

        rows.extend(res)
        done.add((season, r["round"]))
        added += len(res)

        # Save after every race so a partial run is not lost.
        pd.DataFrame(rows).to_csv(RACE_RESULTS_CSV, index=False)
        print(f"  Added {r['race']} (round {r['round']}): {len(res)} driver records")
        time.sleep(2)

    return added


def next_race(season=None, races=None):
    """Return the first upcoming race (earliest future date), or None."""
    if season is None:
        season, races = get_current_season()
    today = date.today().isoformat()
    upcoming = [r for r in races if r["date"] > today]
    if not upcoming:
        return None
    soonest = min(upcoming, key=lambda r: r["date"])
    return {**soonest, "season": season}


def latest_completed_entries(season=None):
    """Return (entries, race_info) from the most recent completed race.

    This is used as a *proxy* entry list for the upcoming race: the API
    does not expose which drivers are entered until a race has results.
    The last completed race's field is the best available estimate.
    """
    if season is None:
        season, _ = get_current_season()
    data = api_get(f"{JOLPICA_BASE}/{season}/last/results.json?limit=100")
    races = data["MRData"]["RaceTable"]["Races"]
    if not races:
        return [], None
    race_info = races[0]
    entries = [
        {
            "driver_id": d["Driver"]["driverId"],
            "driver": f'{d["Driver"]["givenName"]} {d["Driver"]["familyName"]}',
            "constructor": d["Constructor"]["name"],
        }
        for d in race_info["Results"]
    ]
    return entries, race_info


def refresh_latest():
    """Refresh historical data and rebuild datasets. Returns a summary dict."""
    season, races = get_current_season()
    added = refresh_historical(season, races)
    print(f"\nSeason {season}: {added} new driver records downloaded.")

    if added > 0 or not RACE_RESULTS_CSV.exists():
        print("Rebuilding DNF dataset and features...")
        build_dnf_dataset()
        build_feature_file()

    nr = next_race(season, races)
    print("Next upcoming race:", nr)
    return {
        "season": season,
        "new_records": added,
        "next_race": nr,
    }


if __name__ == "__main__":
    import json
    print(json.dumps(refresh_latest(), indent=2))
