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

# OpenF1: free API (no key) that exposes the ACTUAL starting grid
# (post-penalty) for an upcoming race after qualifying is published.
# Docs: https://openf1.org/docs
OPENF1_BASE = "https://api.openf1.org/v1"


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


def fetch_qualifying_for_round(season, round_no):
    """Fetch qualifying for one round. Returns {"race_info":…, "entries":[…]}.

    Each entry carries the REAL grid position from qualifying (position 1 =
    pole). Returns None if qualifying is not yet available for that round.
    """
    url = f"{JOLPICA_BASE}/{season}/{round_no}/qualifying.json?limit=100"
    data = api_get(url)
    races = data["MRData"]["RaceTable"]["Races"]
    if not races:
        return None
    race_info = races[0]
    quals = race_info.get("QualifyingResults") or []
    if not quals:
        return None
    entries = [
        {
            "driver_id": q["Driver"]["driverId"],
            "driver": f'{q["Driver"]["givenName"]} {q["Driver"]["familyName"]}',
            "constructor": q["Constructor"]["name"],
            "grid": int(q["position"]),
        }
        for q in quals
    ]
    return {"race_info": race_info, "entries": entries}


def find_upcoming_with_qualifying():
    """Earliest race (today or later) that currently has qualifying data.

    Returns (race, qualifying) or (None, None). This is what we use to update
    predictions once a race weekend's qualifying session has happened.
    """
    season, races = get_current_season()
    today = date.today().isoformat()
    candidates = [r for r in races if r["date"] >= today]
    for r in candidates:
        q = fetch_qualifying_for_round(season, r["round"])
        if q and q["entries"]:
            return {**r, "season": season}, q
    return None, None


# ---------------------------------------------------------------------------
# OpenF1 actual starting grid (post-penalty)
# ---------------------------------------------------------------------------
def openf1_get(url):
    """GET an OpenF1 URL with the same retry handling as Jolpica."""
    for attempt in range(5):
        try:
            response = SESSION.get(url, timeout=30)
            if response.status_code == 429:
                print("OpenF1 rate limited. Waiting 20 seconds...")
                time.sleep(20)
                continue
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"OpenF1 request failed (attempt {attempt + 1}/5): {e}")
            time.sleep(5)
    raise RuntimeError(f"Failed after 5 attempts: {url}")


_OPENF1_GRID_CACHE = {"key": None, "at": 0.0, "result": None}
_OPENF1_GRID_TTL = 600.0  # seconds; avoid rate limits (free tier: 30 req/min)


def fetch_actual_starting_grid(season=None, races=None, round_no=None):
    """Return (race, entries) using OpenF1's ACTUAL starting grid.

    OpenF1 publishes the real grid (qualifying + penalties) shortly after
    qualifying ends. `entries` = [{"driver", "grid"}, ...] ordered by grid.

    Returns (None, None) if not available yet. Result is cached briefly.

    round_no: optional round to fetch for (defaults to the next upcoming race).
    """
    import time as _time
    try:
        if races is None:
            season, races = get_current_season()
        if round_no is not None:
            nr = next((r for r in races if r["round"] == round_no), None)
            if nr is not None:
                nr = {**nr, "season": season}
        else:
            nr = next_race(season, races)
        if nr is None:
            return None, None

        # Serve from cache if fresh (keyed by season/round).
        cache_key = (season, nr["round"])
        now = _time.time()
        if (_OPENF1_GRID_CACHE["key"] == cache_key
                and now - _OPENF1_GRID_CACHE["at"] < _OPENF1_GRID_TTL):
            return _OPENF1_GRID_CACHE["result"]

        def _store(result):
            _OPENF1_GRID_CACHE["key"] = cache_key
            _OPENF1_GRID_CACHE["at"] = now
            _OPENF1_GRID_CACHE["result"] = result
            return result

        race_date = nr["date"][:10]

        # Find this race's session (matched by date).
        sessions = openf1_get(f"{OPENF1_BASE}/sessions?year={season}&session_type=Race")
        race_session = next(
            (s for s in sessions if (s.get("date_start") or "")[:10] == race_date),
            None,
        )
        if race_session is None:
            return _store((None, None))
        meeting_key = race_session.get("meeting_key")

        # Qualifying session for the same meeting.
        msessions = openf1_get(f"{OPENF1_BASE}/sessions?meeting_key={meeting_key}")
        quali = next(
            (s for s in msessions if s.get("session_type") == "Qualifying"), None
        )
        if quali is None:
            return _store((None, None))
        quali_key = quali.get("session_key")

        grid = openf1_get(
            f"{OPENF1_BASE}/starting_grid?session_key={quali_key}"
        )
        if not isinstance(grid, list) or not grid:
            return _store((None, None))

        drivers = openf1_get(
            f"{OPENF1_BASE}/drivers?session_key={quali_key}"
        )
        name_by_number = {d.get("driver_number"): d.get("full_name") for d in drivers}

        entries = [
            {
                "driver": name_by_number.get(r.get("driver_number"),
                                             str(r.get("driver_number"))),
                "grid": int(r["position"]),
            }
            for r in grid
            if r.get("position") is not None
        ]
        entries.sort(key=lambda e: e["grid"])
        return _store((nr, entries))
    except Exception as exc:  # noqa: BLE001
        print(f"[openf1] starting grid fetch failed: {exc}")
        return None, None


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
