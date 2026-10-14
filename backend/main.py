
from pathlib import Path
from datetime import datetime
import json
import os

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="GridPulse API",
    description="Electricity Consumption Analytics and Demand Prediction",
    version="1.2.0",
)

frontend_origin = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:3000",
).rstrip("/")

allowed_origins = list(
    dict.fromkeys([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        frontend_origin,
    ])
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "processed" / "electricity_parquet"
PREDICTIONS_PATH = ROOT / "data" / "processed" / "predictions"
METADATA_PATH = ROOT / "data" / "processed" / "prediction_metadata.json"
FORECAST_PATH = ROOT / "data" / "forecasts" / "next_24_hours"


def read_parquet(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Dataset not found: {path}",
        )

    try:
        return pd.read_parquet(path)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read dataset: {exc}",
        ) from exc


def read_forecast() -> pd.DataFrame:
    if not FORECAST_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="Saved forecast folder was not found.",
        )

    files = sorted(FORECAST_PATH.glob("part-*.csv"))

    if not files:
        raise HTTPException(
            status_code=404,
            detail="No forecast CSV file was found.",
        )

    try:
        frames = [pd.read_csv(file) for file in files]
        df = pd.concat(frames, ignore_index=True)

        required = {
            "timestamp",
            "predicted_consumption_kwh",
        }

        if not required.issubset(df.columns):
            raise HTTPException(
                status_code=500,
                detail="Forecast CSV is missing required columns.",
            )

        df["timestamp"] = pd.to_datetime(
            df["timestamp"], errors="coerce", utc=True
        )
        df["predicted_consumption_kwh"] = pd.to_numeric(
            df["predicted_consumption_kwh"], errors="coerce"
        )

        df = (
            df.dropna(
                subset=["timestamp", "predicted_consumption_kwh"]
            )
            .sort_values("timestamp")
            .reset_index(drop=True)
        )

        if df.empty:
            raise HTTPException(
                status_code=500,
                detail="No valid forecast records were found.",
            )

        return df

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read forecast: {exc}",
        ) from exc


@app.get("/")
def home():
    return {
        "project": "GridPulse",
        "message": "Electricity analytics API is running",
    }


@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.get("/api/summary")
def summary():
    df = read_parquet(DATA_PATH)

    if "consumption_kwh" not in df.columns:
        raise HTTPException(
            status_code=500,
            detail="consumption_kwh column is missing",
        )

    consumption = pd.to_numeric(
        df["consumption_kwh"], errors="coerce"
    ).dropna()

    if consumption.empty:
        raise HTTPException(
            status_code=500,
            detail="No valid consumption values found",
        )

    return {
        "total_records": int(len(df)),
        "total_consumption_kwh": round(float(consumption.sum()), 2),
        "average_consumption_kwh": round(float(consumption.mean()), 2),
        "maximum_consumption_kwh": round(float(consumption.max()), 2),
        "minimum_consumption_kwh": round(float(consumption.min()), 2),
    }


@app.get("/api/consumption/trend")
def consumption_trend(
    limit: int = Query(default=48, ge=1, le=8760),
):
    df = read_parquet(DATA_PATH)

    required = {"timestamp", "consumption_kwh"}
    if not required.issubset(df.columns):
        raise HTTPException(
            status_code=500,
            detail="Dataset must contain timestamp and consumption_kwh columns",
        )

    df = df[["timestamp", "consumption_kwh"]].copy()
    df["timestamp"] = pd.to_datetime(
        df["timestamp"], errors="coerce"
    )
    df["consumption_kwh"] = pd.to_numeric(
        df["consumption_kwh"], errors="coerce"
    )
    df = df.dropna(
        subset=["timestamp", "consumption_kwh"]
    ).sort_values("timestamp")

    if df.empty:
        raise HTTPException(
            status_code=500,
            detail="No valid timestamped consumption records found",
        )

    if len(df) > limit:
        if limit == 1:
            indices = [0]
        else:
            indices = (
                pd.Series(range(limit)) * (len(df) - 1) // (limit - 1)
            ).astype(int).tolist()

        df = df.iloc[indices]

    results = [
        {
            "timestamp": row["timestamp"].isoformat(),
            "consumption_kwh": round(float(row["consumption_kwh"]), 3),
        }
        for _, row in df.iterrows()
    ]

    return {"count": len(results), "results": results}


@app.get("/api/predictions")
def predictions(limit: int = Query(default=100, ge=1, le=1685)):
    df = read_parquet(PREDICTIONS_PATH)

    required = {"consumption_kwh", "prediction"}
    if not required.issubset(df.columns):
        raise HTTPException(
            status_code=500,
            detail="Expected prediction columns are missing",
        )

    df = df[["consumption_kwh", "prediction"]].head(limit).astype(float)

    return {
        "count": len(df),
        "results": df.round(3).to_dict(orient="records"),
    }


@app.get("/api/predictions/metrics")
def prediction_metrics():
    df = read_parquet(PREDICTIONS_PATH)
    required = {"consumption_kwh", "prediction"}

    if not required.issubset(df.columns):
        raise HTTPException(
            status_code=500,
            detail="Prediction dataset must contain consumption_kwh and prediction",
        )

    actual = pd.to_numeric(df["consumption_kwh"], errors="coerce")
    predicted = pd.to_numeric(df["prediction"], errors="coerce")
    valid = pd.DataFrame({
        "actual": actual,
        "predicted": predicted,
    }).dropna()

    if valid.empty:
        raise HTTPException(
            status_code=500,
            detail="No valid evaluation predictions found",
        )

    errors = valid["actual"] - valid["predicted"]

    training_records = None
    if METADATA_PATH.exists():
        try:
            metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
            training_records = metadata.get("training_records")
        except (OSError, json.JSONDecodeError):
            training_records = None

    return {
        "training_records": training_records,
        "records_evaluated": int(len(valid)),
        "mae": round(float(errors.abs().mean()), 4),
        "rmse": round(float((errors.pow(2).mean()) ** 0.5), 4),
    }

@app.get("/api/analytics/daily")
def daily_analytics():
    df = read_parquet(DATA_PATH)

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df["consumption_kwh"] = pd.to_numeric(
        df["consumption_kwh"], errors="coerce"
    )
    df = df.dropna(subset=["timestamp", "consumption_kwh"])
    df["date"] = df["timestamp"].dt.strftime("%Y-%m-%d")

    daily = (
        df.groupby("date")["consumption_kwh"]
        .agg(total="sum", average="mean", peak="max", records="count")
        .reset_index()
        .sort_values("date")
    )

    return {
        "count": len(daily),
        "results": [
            {
                "date": row["date"],
                "total_consumption_kwh": round(float(row["total"]), 2),
                "average_consumption_kwh": round(float(row["average"]), 2),
                "peak_consumption_kwh": round(float(row["peak"]), 2),
                "records": int(row["records"]),
            }
            for _, row in daily.iterrows()
        ],
    }


@app.get("/api/analytics/monthly")
def monthly_analytics():
    df = read_parquet(DATA_PATH)

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df["consumption_kwh"] = pd.to_numeric(
        df["consumption_kwh"], errors="coerce"
    )
    df = df.dropna(subset=["timestamp", "consumption_kwh"])
    df["month"] = df["timestamp"].dt.to_period("M").astype(str)

    monthly = (
        df.groupby("month")["consumption_kwh"]
        .agg(total="sum", average="mean", peak="max", records="count")
        .reset_index()
        .sort_values("month")
    )

    return {
        "count": len(monthly),
        "results": [
            {
                "month": row["month"],
                "total_consumption_kwh": round(float(row["total"]), 2),
                "average_consumption_kwh": round(float(row["average"]), 2),
                "peak_consumption_kwh": round(float(row["peak"]), 2),
                "records": int(row["records"]),
            }
            for _, row in monthly.iterrows()
        ],
    }


@app.get("/api/analytics/hourly-pattern")
def hourly_pattern_analytics():
    df = read_parquet(DATA_PATH)

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df["consumption_kwh"] = pd.to_numeric(
        df["consumption_kwh"], errors="coerce"
    )
    df = df.dropna(subset=["timestamp", "consumption_kwh"]).copy()

    if df.empty:
        return {"count": 0, "results": []}

    df["hour"] = df["timestamp"].dt.hour

    hourly = (
        df.groupby("hour")["consumption_kwh"]
        .agg(average="mean", peak="max", records="count")
        .reindex(range(24))
    )

    results = [
        {
            "hour": int(hour),
            "average_consumption_kwh": round(float(row["average"]), 2),
            "peak_consumption_kwh": round(float(row["peak"]), 2),
            "records": int(row["records"]),
        }
        for hour, row in hourly.iterrows()
        if pd.notna(row["average"]) and pd.notna(row["peak"])
    ]

    return {"count": len(results), "results": results}


@app.get("/api/analytics/peak")
def peak_analytics():
    df = read_parquet(DATA_PATH)

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df["consumption_kwh"] = pd.to_numeric(
        df["consumption_kwh"], errors="coerce"
    )
    df = df.dropna(subset=["timestamp", "consumption_kwh"])

    if df.empty:
        raise HTTPException(
            status_code=500,
            detail="No valid consumption records found",
        )

    peak_index = df["consumption_kwh"].idxmax()
    peak = df.loc[peak_index]

    return {
        "peak_timestamp": peak["timestamp"].isoformat(),
        "peak_consumption_kwh": round(float(peak["consumption_kwh"]), 2),
        "consumer_id": str(peak["consumer_id"]),
        "average_consumption_kwh": round(
            float(df["consumption_kwh"].mean()), 2
        ),
        "records_analyzed": int(len(df)),
    }


@app.get("/api/forecast/next-24-hours")
def next_24_hours_forecast():
    df = read_forecast()

    latest = df["timestamp"].max()
    now = pd.Timestamp.now(tz="UTC")
    is_current = latest >= now

    results = [
        {
            "timestamp": row["timestamp"].isoformat(),
            "predicted_consumption_kwh": round(
                float(row["predicted_consumption_kwh"]), 3
            ),
        }
        for _, row in df.iterrows()
    ]

    return {
        "count": len(results),
        "results": results,
        "forecast_origin": "latest timestamp in the historical dataset",
        "forecast_status": (
            "current" if is_current else "historical"
        ),
        "latest_forecast_timestamp": latest.isoformat(),
        "message": (
            "Forecast timestamps are later than the current time."
            if is_current
            else (
                "This saved forecast is historical, not a forecast "
                "for the current date. Refresh the historical data "
                "and regenerate the forecast before using it as a "
                "current demand forecast."
            )
        ),
    }
