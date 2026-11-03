import requests
import pandas as pd
from pathlib import Path
import time

BASE_URL = "https://api.jolpi.ca/ergast/f1"

START_YEAR = 2018
END_YEAR = 2025

OUTPUT = Path("data/raw/race_results.csv")

session = requests.Session()

# Load existing data if available
if OUTPUT.exists():
    df_existing = pd.read_csv(OUTPUT)
    rows = df_existing.to_dict("records")

    completed = set(
        zip(
            df_existing["season"],
            df_existing["round"]
        )
    )

    print(f"Existing rows: {len(rows)}")
    print(f"Already downloaded races: {len(completed)}")

else:
    rows = []
    completed = set()


def get(url):
    """Request with retry handling."""

    for attempt in range(5):

        try:
            response = session.get(
                url,
                timeout=30
            )

            if response.status_code == 429:
                print("Rate limited. Waiting 20 seconds...")
                time.sleep(20)
                continue

            response.raise_for_status()

            return response.json()

        except requests.exceptions.RequestException as e:

            print(
                f"Request failed "
                f"(attempt {attempt + 1}/5): {e}"
            )

            time.sleep(5)

    raise RuntimeError(f"Failed after 5 attempts: {url}")


for year in range(START_YEAR, END_YEAR + 1):

    print(f"\nDownloading {year}...")

    races_url = f"{BASE_URL}/{year}.json"

    data = get(races_url)

    races = data["MRData"]["RaceTable"]["Races"]

    for race in races:

        round_number = int(race["round"])

        # Skip races already downloaded
        if (year, round_number) in completed:

            print(
                f"  Skipping Round {round_number}: "
                f"already downloaded"
            )

            continue

        results_url = (
            f"{BASE_URL}/{year}/{round_number}/results.json"
            "?limit=100"
        )

        data = get(results_url)

        race_data = (
            data["MRData"]["RaceTable"]["Races"]
        )

        if not race_data:
            continue

        race_info = race_data[0]

        for driver in race_info["Results"]:

            rows.append({
                "season": year,
                "round": round_number,
                "race": race_info["raceName"],
                "date": race_info["date"],
                "circuit": race_info["Circuit"]["circuitName"],

                "driver": (
                    driver["Driver"]["givenName"]
                    + " "
                    + driver["Driver"]["familyName"]
                ),

                "driver_id": driver["Driver"]["driverId"],

                "constructor": driver["Constructor"]["name"],

                "grid": driver["grid"],
                "finish_position": driver.get("position"),
                "status": driver["status"],
                "points": driver["points"],
            })

        # Mark race complete
        completed.add((year, round_number))

        # SAVE IMMEDIATELY
        pd.DataFrame(rows).to_csv(
            OUTPUT,
            index=False
        )

        print(
            f"  Downloaded Round {round_number}: "
            f"{race_info['raceName']}"
        )

        # Slow down requests
        time.sleep(2)


print("\n==============================")
print("DOWNLOAD COMPLETE")
print("==============================")
print("Rows:", len(rows))
print("Saved:", OUTPUT)