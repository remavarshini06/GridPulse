from pathlib import Path

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, to_timestamp

spark = (
    SparkSession.builder
    .appName("GridPulse CSV to Parquet")
    .master("local[*]")
    .getOrCreate()
)

spark.sparkContext.setLogLevel("WARN")

print("\n========================================")
print("      GRIDPULSE DATA PROCESSING")
print("========================================")

input_file = "data/sample/electricity_consumption.csv"
output_folder = "data/processed/electricity_parquet"

# 1. Load CSV
print("\nReading electricity dataset...")

df = spark.read.csv(
    input_file,
    header=True,
    inferSchema=True,
)

# 2. Parse timestamps
df = df.withColumn(
    "timestamp",
    to_timestamp(col("timestamp"), "yyyy-MM-dd HH:mm:ss"),
)

# 3. Remove invalid or missing records
df = df.filter(
    col("timestamp").isNotNull()
    & col("consumer_id").isNotNull()
    & col("consumption_kwh").isNotNull()
)

# 4. Remove duplicate consumer readings for the same timestamp
df = df.dropDuplicates(["timestamp", "consumer_id"])

# 5. Reject physically invalid negative consumption
df = df.filter(col("consumption_kwh") >= 0)

# 6. Count and inspect the cleaned dataset
record_count = df.count()

print("\n--- Cleaned Dataset ---")
df.orderBy("timestamp").show(10, truncate=False)

print("\nTotal cleaned records:", record_count)

df.printSchema()

# 7. Save as Parquet
print("\nSaving processed data as Parquet...")

Path(output_folder).parent.mkdir(parents=True, exist_ok=True)

df.write.mode("overwrite").parquet(output_folder)

print("Parquet dataset created successfully!")
print("Location:", output_folder)

# 8. Read Parquet back to verify it
print("\nVerifying Parquet dataset...")

parquet_df = spark.read.parquet(output_folder)
parquet_count = parquet_df.count()

print("Parquet records:", parquet_count)

parquet_df.show(5, truncate=False)

if record_count != parquet_count:
    raise RuntimeError(
        f"Record mismatch: cleaned={record_count}, "
        f"Parquet={parquet_count}"
    )

print("\nParquet verification successful!")

spark.stop()

print("\nGRIDPULSE PROCESSING COMPLETED")