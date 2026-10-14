
from datetime import timedelta
from pathlib import Path
from math import sqrt
import shutil
import json

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor


# --------------------------------------------------
# GRIDPULSE DEMAND FORECASTING
# Uses pandas + scikit-learn.
# Dataset readings are synthetic demonstration data.
# --------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent

INPUT_PATH = ROOT / "data" / "processed" / "electricity_parquet"
PREDICTIONS_PATH = ROOT / "data" / "processed" / "predictions"
FORECAST_PATH = ROOT / "data" / "forecasts" / "next_24_hours"
MODEL_PATH = ROOT / "models" / "demand_random_forest_sklearn.joblib"
METADATA_PATH = ROOT / "data" / "processed" / "prediction_metadata.json"

FEATURES = ["hour", "day_of_week", "month", "lag_24", "lag_168"]


def load_data():
    print("\nLoading processed electricity data...")

    df = pd.read_parquet(INPUT_PATH)
    df = df[["timestamp", "consumption_kwh"]].copy()

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["consumption_kwh"] = pd.to_numeric(
        df["consumption_kwh"], errors="coerce"
    )

    df = df.dropna(subset=["timestamp", "consumption_kwh"])
    df = df[df["consumption_kwh"] >= 0]
    df = (
        df.sort_values("timestamp")
        .drop_duplicates(subset=["timestamp"])
        .reset_index(drop=True)
    )

    if len(df) < 200:
        raise ValueError("Not enough historical records to train.")

    print("Total records:", len(df))
    print("First timestamp:", df["timestamp"].min())
    print("Last timestamp:", df["timestamp"].max())

    return df


def create_features(df):
    featured = df.copy()

    featured["hour"] = featured["timestamp"].dt.hour

    # Sunday=1, Monday=2, ..., Saturday=7.
    featured["day_of_week"] = (
        (featured["timestamp"].dt.dayofweek + 1) % 7
    ) + 1

    featured["month"] = featured["timestamp"].dt.month
    featured["lag_24"] = featured["consumption_kwh"].shift(24)
    featured["lag_168"] = featured["consumption_kwh"].shift(168)

    return featured.dropna(
        subset=FEATURES + ["consumption_kwh"]
    ).reset_index(drop=True)


def save_test_predictions(test, predicted, training_records):
    """Save evaluation predictions and metadata for the latest model."""

    predictions = pd.DataFrame({
        "timestamp": test["timestamp"].to_numpy(),
        "consumption_kwh": test["consumption_kwh"].to_numpy(),
        "prediction": predicted,
    })

    # Replace the previous model's evaluation predictions.
    if PREDICTIONS_PATH.exists():
        shutil.rmtree(PREDICTIONS_PATH)

    PREDICTIONS_PATH.mkdir(parents=True, exist_ok=True)

    output_file = PREDICTIONS_PATH / "part-00000.parquet"
    predictions.to_parquet(output_file, index=False)

    METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    METADATA_PATH.write_text(
        __import__("json").dumps(
            {
                "training_records": int(training_records),
                "records_evaluated": int(len(predictions)),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print("\nEvaluation predictions saved to:", output_file)
    print("Saved evaluation records:", len(predictions))
    print("Training metadata saved to:", METADATA_PATH)


def main():
    print("\n========================================")
    print("   GRIDPULSE DEMAND FORECASTING")
    print("========================================")
    print("Data type: SIMULATED electricity readings")

    df = load_data()
    featured = create_features(df)

    # Chronological 80/20 train-test split.
    split_point = int(len(featured) * 0.80)

    if split_point <= 0 or split_point >= len(featured):
        raise ValueError("Unable to create training and testing sets.")

    train = featured.iloc[:split_point]
    test = featured.iloc[split_point:]

    print("\nTraining records:", len(train))
    print("Testing records:", len(test))

    print("\nTraining Random Forest model...")

    model = RandomForestRegressor(
        n_estimators=80,
        max_depth=8,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(train[FEATURES], train["consumption_kwh"])
    print("Model training completed.")

    # Evaluate the latest model on unseen chronological test records.
    print("\nEvaluating model...")

    actual = test["consumption_kwh"].to_numpy()
    predicted = model.predict(test[FEATURES])

    errors = actual - predicted
    mae = float(abs(errors).mean())
    rmse = float(sqrt((errors ** 2).mean()))

    nonzero = actual != 0
    mape = (
        float((abs(errors[nonzero] / actual[nonzero])).mean() * 100)
        if nonzero.any()
        else float("nan")
    )

    print("\n--- MODEL EVALUATION ---")
    print(f"MAE:  {mae:.4f} kWh")
    print(f"RMSE: {rmse:.4f} kWh")
    print(f"MAPE: {mape:.2f}%")

    # Save actual test values and their corresponding predictions.
    save_test_predictions(test, predicted, len(train))

    # Generate the next 24 hourly predictions.
    print("\nGenerating the next 24 hourly predictions...")

    history = df.set_index("timestamp")["consumption_kwh"]
    last_timestamp = df["timestamp"].max()

    future_rows = []

    for step in range(1, 25):
        future_timestamp = last_timestamp + timedelta(hours=step)

        lag24_timestamp = future_timestamp - timedelta(hours=24)
        lag168_timestamp = future_timestamp - timedelta(hours=168)

        if (
            lag24_timestamp not in history.index
            or lag168_timestamp not in history.index
        ):
            raise ValueError(
                f"Missing historical lag data for {future_timestamp}."
            )

        day_of_week = ((future_timestamp.weekday() + 1) % 7) + 1

        future_rows.append({
            "timestamp": future_timestamp,
            "hour": future_timestamp.hour,
            "day_of_week": day_of_week,
            "month": future_timestamp.month,
            "lag_24": float(history.loc[lag24_timestamp]),
            "lag_168": float(history.loc[lag168_timestamp]),
        })

    future_df = pd.DataFrame(future_rows)
    future_df["predicted_consumption_kwh"] = model.predict(
        future_df[FEATURES]
    )

    forecast = future_df[
        ["timestamp", "predicted_consumption_kwh"]
    ].copy()

    forecast["predicted_consumption_kwh"] = (
        forecast["predicted_consumption_kwh"].clip(lower=0).round(3)
    )

    FORECAST_PATH.mkdir(parents=True, exist_ok=True)

    for old_file in FORECAST_PATH.glob("part-*.csv"):
        old_file.unlink()

    forecast_file = FORECAST_PATH / "part-00000.csv"
    forecast.to_csv(forecast_file, index=False)

    print("\n--- FORECAST SUMMARY ---")
    print("Forecast points:", len(forecast))
    print("First forecast:", forecast["timestamp"].min())
    print("Last forecast:", forecast["timestamp"].max())
    print(
        "Average predicted consumption:",
        round(forecast["predicted_consumption_kwh"].mean(), 3),
        "kWh",
    )
    print(
        "Peak predicted consumption:",
        round(forecast["predicted_consumption_kwh"].max(), 3),
        "kWh",
    )
    print("Forecast saved to:", forecast_file)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print("Trained model saved to:", MODEL_PATH)

    print("\nGRIDPULSE FORECASTING COMPLETED SUCCESSFULLY")
    print("Reminder: forecasts use synthetic demonstration data.")


if __name__ == "__main__":
    main()
