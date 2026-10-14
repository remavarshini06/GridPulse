from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    avg,
    max as spark_max,
    min as spark_min,
    sum as spark_sum,
    count,
    hour,
    dayofweek,
)

spark = (
    SparkSession.builder
    .appName("GridPulse Electricity Analytics")
    .master("local[*]")
    .getOrCreate()
)

spark.sparkContext.setLogLevel("WARN")

print("\n========================================")
print("     GRIDPULSE BIG DATA ANALYTICS")
print("========================================")

input_file = "data/sample/electricity_consumption.csv"

# 1. Read the dataset
df = spark.read.csv(
    input_file,
    header=True,
    inferSchema=True,
)

# 2. Convert the timestamp to a timestamp data type
from pyspark.sql.functions import col, to_timestamp

df = df.withColumn(
    "timestamp",
    to_timestamp(col("timestamp"), "yyyy-MM-dd HH:mm:ss"),
)

# 3. Remove records with missing required values
df = df.filter(
    col("timestamp").isNotNull()
    & col("consumer_id").isNotNull()
    & col("consumption_kwh").isNotNull()
)

print("\n--- Dataset Schema ---")
df.printSchema()

print("\n--- First 10 Records ---")
df.show(10, truncate=False)

print("\n--- Dataset Size ---")
print("Total rows:", df.count())

# 4. Calculate consumption statistics
print("\n--- Consumption Statistics ---")

df.select(
    count("consumption_kwh").alias("readings"),
    avg("consumption_kwh").alias("average_kwh"),
    spark_max("consumption_kwh").alias("maximum_kwh"),
    spark_min("consumption_kwh").alias("minimum_kwh"),
    spark_sum("consumption_kwh").alias("total_kwh"),
).show(truncate=False)

# 5. Analyze hourly consumption
print("\n--- Average Consumption by Hour ---")

hourly_consumption = (
    df.withColumn("hour", hour("timestamp"))
    .groupBy("hour")
    .agg(
        avg("consumption_kwh").alias("average_consumption_kwh")
    )
    .orderBy("hour")
)

hourly_consumption.show(24, truncate=False)

# 6. Analyze consumption by day of week
print("\n--- Average Consumption by Day of Week ---")
print("Spark day numbers: 1 = Sunday, 7 = Saturday")

daily_pattern = (
    df.withColumn("day_of_week", dayofweek("timestamp"))
    .groupBy("day_of_week")
    .agg(
        avg("consumption_kwh").alias("average_consumption_kwh")
    )
    .orderBy("day_of_week")
)

daily_pattern.show(7, truncate=False)

# 7. Display the highest readings
print("\n--- Top 10 Highest Consumption Readings ---")

df.orderBy(
    col("consumption_kwh").desc()
).show(10, truncate=False)

spark.stop()

print("\nGRIDPULSE ANALYSIS COMPLETED")