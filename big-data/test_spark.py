from pyspark.sql import SparkSession

spark = (
    SparkSession.builder
    .appName("GridPulse")
    .master("local[*]")
    .getOrCreate()
)

print("================================")
print("     GRIDPULSE SPARK TEST")
print("================================")

print("Spark Version:", spark.version)

data = [
    ("House A", 12.5),
    ("House B", 18.2),
    ("House C", 9.7),
    ("House D", 22.4),
]

df = spark.createDataFrame(
    data,
    ["consumer", "consumption_kwh"]
)

print("\nElectricity Data:")
df.show()

print("Total consumption:")
df.groupBy().sum("consumption_kwh").show()

spark.stop()

print("Spark test completed successfully.")