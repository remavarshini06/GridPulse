from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    avg,
    sum as spark_sum,
    max as spark_max,
    min as spark_min,
    count,
    hour,
    date_format,
    dayofweek,
    when,
    col,
    stddev,
)

# --------------------------------------------------
# 1. Initialize Spark
# --------------------------------------------------

spark = (
    SparkSession.builder
    .appName("GridPulse Analytics Engine")
    .master("local[*]")
    .getOrCreate()
)

spark.sparkContext.setLogLevel("WARN")

INPUT_PATH = "data/processed/electricity_parquet"
OUTPUT_DIR = Path("data/analytics")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

print("\n======================================")
print("     GRIDPULSE ANALYTICS ENGINE")
print("======================================")

# --------------------------------------------------
# 2. Load processed data
# --------------------------------------------------

df = spark.read.parquet(INPUT_PATH)

print("\nTotal records:", df.count())

# --------------------------------------------------
# 3. Overall consumption summary
# --------------------------------------------------

print("\n--- Overall Consumption Summary ---")

summary = df.agg(
    count("*").alias("total_readings"),
    spark_sum("consumption_kwh").alias("total_consumption_kwh"),
    avg("consumption_kwh").alias("average_consumption_kwh"),
    spark_max("consumption_kwh").alias("maximum_consumption_kwh"),
    spark_min("consumption_kwh").alias("minimum_consumption_kwh"),
)

summary.show(truncate=False)

summary.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(str(OUTPUT_DIR / "summary"))

# --------------------------------------------------
# 4. Hourly consumption
# --------------------------------------------------

print("\n--- Average Consumption by Hour ---")

hourly = (
    df.withColumn("hour", hour("timestamp"))
    .groupBy("hour")
    .agg(
        avg("consumption_kwh").alias("average_consumption_kwh"),
        spark_sum("consumption_kwh").alias("total_consumption_kwh"),
    )
    .orderBy("hour")
)

hourly.show(24, truncate=False)

hourly.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(str(OUTPUT_DIR / "hourly"))

# Identify the hour with the highest average usage
peak_hour = hourly.orderBy(
    col("average_consumption_kwh").desc()
).first()

print(
    "\nPeak average-consumption hour:",
    peak_hour["hour"],
)

# --------------------------------------------------
# 5. Daily consumption
# --------------------------------------------------

print("\n--- Daily Consumption ---")

daily = (
    df.withColumn(
        "date",
        date_format("timestamp", "yyyy-MM-dd"),
    )
    .groupBy("date")
    .agg(
        spark_sum("consumption_kwh").alias("daily_consumption_kwh"),
        avg("consumption_kwh").alias("average_hourly_kwh"),
    )
    .orderBy("date")
)

daily.show(10, truncate=False)

daily.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(str(OUTPUT_DIR / "daily"))

# --------------------------------------------------
# 6. Monthly consumption
# --------------------------------------------------

print("\n--- Monthly Consumption ---")

monthly = (
    df.withColumn(
        "month",
        date_format("timestamp", "yyyy-MM"),
    )
    .groupBy("month")
    .agg(
        spark_sum("consumption_kwh").alias("monthly_consumption_kwh"),
        avg("consumption_kwh").alias("average_hourly_kwh"),
    )
    .orderBy("month")
)

monthly.show(12, truncate=False)

monthly.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(str(OUTPUT_DIR / "monthly"))

# --------------------------------------------------
# 7. Weekday vs weekend
# --------------------------------------------------

print("\n--- Weekday vs Weekend ---")

week_patterns = (
    df.withColumn("day_number", dayofweek("timestamp"))
    .withColumn(
        "day_type",
        when(col("day_number").isin(1, 7), "Weekend")
        .otherwise("Weekday"),
    )
    .groupBy("day_type")
    .agg(
        avg("consumption_kwh").alias("average_consumption_kwh"),
        spark_sum("consumption_kwh").alias("total_consumption_kwh"),
    )
)

week_patterns.show(truncate=False)

week_patterns.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(str(OUTPUT_DIR / "weekday_weekend"))

# --------------------------------------------------
# 8. Flag unusually high readings
# --------------------------------------------------

print("\n--- High Consumption Readings ---")

stats = df.agg(
    avg("consumption_kwh").alias("mean"),
    stddev("consumption_kwh").alias("stddev"),
).first()

mean_value = stats["mean"]
stddev_value = stats["stddev"]

if stddev_value is not None:
    threshold = mean_value + (2 * stddev_value)

    unusual = df.filter(
        col("consumption_kwh") > threshold
    ).orderBy(
        col("consumption_kwh").desc()
    )

    print(f"High-consumption threshold: {threshold:.2f} kWh")
    print("Flagged readings:", unusual.count())

    unusual.show(20, truncate=False)

    unusual.coalesce(1).write.mode("overwrite").option(
        "header", True
    ).csv(str(OUTPUT_DIR / "high_consumption"))

# --------------------------------------------------
# 9. Finish
# --------------------------------------------------

print("\nAnalytics results saved under:", OUTPUT_DIR)

spark.stop()

print("\nGRIDPULSE ANALYTICS COMPLETED")