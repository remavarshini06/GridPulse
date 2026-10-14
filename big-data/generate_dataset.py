
import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

OUTPUT_FILE = Path("data/sample/electricity_consumption.csv")

# Synthetic demonstration data, not actual smart-meter readings.
START_DATE = datetime(2025, 1, 1, 0, 0)
END_DATE = datetime(2026, 10, 14, 23, 0)

CONSUMER_ID = "Consumer_001"
RANDOM_SEED = 42

random.seed(RANDOM_SEED)
OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

total_records = 0

with OUTPUT_FILE.open("w", newline="", encoding="utf-8") as file:
    writer = csv.writer(file)

    writer.writerow([
        "timestamp",
        "consumer_id",
        "consumption_kwh",
    ])

    current_time = START_DATE

    while current_time <= END_DATE:
        hour = current_time.hour
        month = current_time.month
        weekday = current_time.weekday()

        # Baseline consumption
        consumption = 10.0

        # Morning demand peak
        if 6 <= hour <= 9:
            consumption += 8

        # Evening demand peak
        if 18 <= hour <= 22:
            consumption += 12

        # Afternoon demand
        if 12 <= hour <= 15:
            consumption += 5

        # Weekend variation
        if weekday >= 5:
            consumption += 3

        # Seasonal variation
        if month in [4, 5, 6]:
            consumption += 5

        if month in [11, 12, 1]:
            consumption -= 2

        # Small deterministic random variation
        consumption += random.uniform(-2, 2)
        consumption = max(2, round(consumption, 2))

        writer.writerow([
            current_time.strftime("%Y-%m-%d %H:%M:%S"),
            CONSUMER_ID,
            consumption,
        ])

        total_records += 1
        current_time += timedelta(hours=1)

print("\n========================================")
print("      GRIDPULSE DATA GENERATION")
print("========================================")
print("Dataset type: SIMULATED")
print("First timestamp:", START_DATE)
print("Last timestamp:", END_DATE)
print("Total records:", total_records)
print("Expected records: 15,648")
print("Output file:", OUTPUT_FILE.resolve())

if total_records != 15648:
    raise RuntimeError(
        f"Unexpected record count: {total_records}"
    )

print("\nSimulated dataset created successfully.")

