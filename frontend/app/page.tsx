
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Zap,
  TrendingUp,
  BarChart3,
  RefreshCw,
  AlertCircle,
  BrainCircuit,
  CalendarDays,
  Clock,
} from "lucide-react";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

interface Summary {
  total_records: number;
  total_consumption_kwh: number;
  average_consumption_kwh: number;
  maximum_consumption_kwh: number;
  minimum_consumption_kwh: number;
}

interface ConsumptionPoint {
  timestamp: string;
  consumption_kwh: number;
}

interface PredictionPoint {
  consumption_kwh: number;
  prediction: number;
}

interface Metrics {
  training_records: number | null;
  records_evaluated: number;
  mae: number;
  rmse: number;
}

interface DailyRecord {
  date: string;
  total_consumption_kwh: number;
  average_consumption_kwh: number;
  peak_consumption_kwh: number;
  records: number;
}

interface MonthlyRecord {
  month: string;
  total_consumption_kwh: number;
  average_consumption_kwh: number;
  peak_consumption_kwh: number;
  records: number;
}

interface PeakData {
  peak_timestamp: string;
  peak_consumption_kwh: number;
  consumer_id: string;
  average_consumption_kwh: number;
  records_analyzed: number;
}

interface HourlyPatternRecord {
  hour: number;
  average_consumption_kwh: number;
  peak_consumption_kwh: number;
  records: number;
}

interface HourlyPatternData {
  count: number;
  results: HourlyPatternRecord[];
}

interface ForecastPoint {
  timestamp: string;
  predicted_consumption_kwh: number;
}

interface ForecastData {
  count: number;
  results: ForecastPoint[];
  forecast_origin: string;
  forecast_status: string;
  latest_forecast_timestamp: string;
  message: string;
}

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "10px",
  color: "#fff",
};

export default function Home() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<ConsumptionPoint[]>([]);
  const [predictions, setPredictions] = useState<PredictionPoint[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [daily, setDaily] = useState<DailyRecord[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRecord[]>([]);
  const [hourlyPattern, setHourlyPattern] = useState<HourlyPatternRecord[]>([]);
  const [peak, setPeak] = useState<PeakData | null>(null);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const endpoints = [
        `${API}/api/summary`,
        `${API}/api/consumption/trend?limit=48`,
        `${API}/api/predictions?limit=100`,
        `${API}/api/predictions/metrics`,
        `${API}/api/analytics/daily`,
        `${API}/api/analytics/monthly`,
        `${API}/api/analytics/hourly-pattern`,
        `${API}/api/analytics/peak`,
        `${API}/api/forecast/next-24-hours`,
      ];

      const responses = await Promise.all(
        endpoints.map((url) => fetch(url))
      );

      const failed = responses.findIndex((response) => !response.ok);

      if (failed !== -1) {
        throw new Error(
          `API request ${failed + 1} failed with status ${responses[failed].status}`
        );
      }

      const [
        summaryData,
        trendData,
        predictionData,
        metricsData,
        dailyData,
        monthlyData,
        hourlyPatternData,
        peakData,
        forecastData,
      ] = await Promise.all(responses.map((response) => response.json()));

      setSummary(summaryData);
      setTrend(trendData.results ?? []);
      setPredictions(predictionData.results ?? []);
      setMetrics(metricsData);
      setDaily(dailyData.results ?? []);
      setMonthly(monthlyData.results ?? []);
      setHourlyPattern(hourlyPatternData.results ?? []);
      setPeak(peakData);
      setForecast(forecastData);
    } catch (err) {
      console.error("GridPulse API Error:", err);
      setError(
        "Unable to load dashboard data. Check that the FastAPI backend is running on port 8000 and all analytics endpoints are available."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  const number = (value: number) =>
    Number(value).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    });

  // Display timestamps consistently in UTC.
  const shortDate = (value: string) =>
    new Date(value).toLocaleDateString("en-IN", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
    });

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString("en-IN", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const forecastResults = (forecast?.results ?? []).map((item) => ({
    ...item,
    historical_average_kwh: summary?.average_consumption_kwh ?? null,
  }));

  const forecastPeak =
    forecastResults.length > 0
      ? forecastResults.reduce((highest, item) =>
          item.predicted_consumption_kwh >
          highest.predicted_consumption_kwh
            ? item
            : highest
        )
      : null;

  const forecastAverage =
    forecastResults.length > 0
      ? forecastResults.reduce(
          (sum, item) => sum + item.predicted_consumption_kwh,
          0
        ) / forecastResults.length
      : null;

  const historicalAverage = summary?.average_consumption_kwh ?? null;

  const forecastDifference =
    forecastAverage !== null && historicalAverage !== null
      ? forecastAverage - historicalAverage
      : null;

  const peakAboveAverage =
    forecastPeak && forecastAverage !== null
      ? forecastPeak.predicted_consumption_kwh - forecastAverage
      : null;

  const dailyForecastSummary = forecastResults.reduce<
    Record<
      string,
      {
        total: number;
        count: number;
        peak: ForecastPoint;
      }
    >
  >((days, item) => {
    const day = item.timestamp.slice(0, 10);

    if (!days[day]) {
      days[day] = {
        total: 0,
        count: 0,
        peak: item,
      };
    }

    days[day].total += item.predicted_consumption_kwh;
    days[day].count += 1;

    if (
      item.predicted_consumption_kwh >
      days[day].peak.predicted_consumption_kwh
    ) {
      days[day].peak = item;
    }

    return days;
  }, {});

  const isHistorical = forecast?.forecast_status !== "current";

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              GridPulse
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Electricity Consumption Analytics &amp; Demand Prediction
            </p>
          </div>

          <button
            onClick={() => void fetchDashboardData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
          <div>
            <p className="text-sm font-medium">
              GridPulse Analytics Engine
            </p>
            <p className="text-xs text-slate-400">
              Apache Spark Â· FastAPI Â· Random Forest
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-900/50 bg-red-950/30 px-5 py-4">
            <AlertCircle size={20} className="shrink-0 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Consumption"
            value={
              summary
                ? `${number(summary.total_consumption_kwh)} kWh`
                : loading
                  ? "..."
                  : "Unavailable"
            }
            icon={<Zap size={22} />}
          />

          <MetricCard
            title="Average Consumption"
            value={
              summary
                ? `${number(summary.average_consumption_kwh)} kWh`
                : loading
                  ? "..."
                  : "Unavailable"
            }
            icon={<Activity size={22} />}
          />

          <MetricCard
            title="Peak Consumption"
            value={
              summary
                ? `${number(summary.maximum_consumption_kwh)} kWh`
                : loading
                  ? "..."
                  : "Unavailable"
            }
            icon={<TrendingUp size={22} />}
          />

          <MetricCard
            title="Data Records"
            value={
              summary
                ? number(summary.total_records)
                : loading
                  ? "..."
                  : "Unavailable"
            }
            icon={<BarChart3 size={22} />}
          />
        </div>

        {/* Peak demand insight */}
        <section className="mt-6 rounded-2xl border border-amber-900/50 bg-gradient-to-r from-amber-950/40 to-slate-900 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-amber-400/10 p-3">
              <Zap size={26} className="text-amber-400" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-300">
                Peak Demand Insight
              </p>

              {peak ? (
                <>
                  <p className="mt-2 text-3xl font-bold">
                    {number(peak.peak_consumption_kwh)} kWh
                  </p>

                  <p className="mt-2 text-sm text-slate-300">
                    Highest recorded consumption on{" "}
                    {formatDateTime(peak.peak_timestamp)}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
                    <span>Consumer: {peak.consumer_id}</span>
                    <span>
                      Dataset average:{" "}
                      {number(peak.average_consumption_kwh)} kWh
                    </span>
                    <span>
                      Records analyzed: {number(peak.records_analyzed)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-400">
                  {loading
                    ? "Loading peak-demand data..."
                    : "Peak data unavailable"}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Historical trend and dataset overview */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 lg:col-span-2">
            <SectionHeading
              title="Electricity Consumption"
              subtitle="Historical consumption across the dataset"
            />

            <div className="mt-6 h-80 w-full">
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trend}
                    margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                    />
                    <XAxis
                      dataKey="timestamp"
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => shortDate(String(value))}
                    />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(value) =>
                        formatDateTime(String(value))
                      }
                      formatter={(value) => [
                        `${Number(value).toFixed(2)} kWh`,
                        "Consumption",
                      ]}
                      contentStyle={tooltipStyle}
                    />
                    <Line
                      type="monotone"
                      dataKey="consumption_kwh"
                      name="Consumption"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState loading={loading} />
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <SectionHeading
              title="Dataset Overview"
              subtitle="Processed dataset statistics"
            />

            <div className="mt-6 space-y-5">
              <InfoRow
                label="Records"
                value={summary ? number(summary.total_records) : "..."}
              />
              <InfoRow
                label="Minimum"
                value={
                  summary
                    ? `${number(summary.minimum_consumption_kwh)} kWh`
                    : "..."
                }
              />
              <InfoRow
                label="Maximum"
                value={
                  summary
                    ? `${number(summary.maximum_consumption_kwh)} kWh`
                    : "..."
                }
              />
              <InfoRow
                label="Average"
                value={
                  summary
                    ? `${number(summary.average_consumption_kwh)} kWh`
                    : "..."
                }
              />
            </div>
          </div>
        </div>

        {/* Monthly analytics */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <SectionHeading
            title="Monthly Consumption Analysis"
            subtitle="Total electricity consumption grouped by month"
          />

          <div className="mt-6 h-80 w-full">
            {monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthly}
                  margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#334155"
                  />
                  <XAxis
                    dataKey="month"
                    stroke="#94a3b8"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value) => [
                      `${number(Number(value))} kWh`,
                      "Total consumption",
                    ]}
                    contentStyle={tooltipStyle}
                  />
                  <Bar
                    dataKey="total_consumption_kwh"
                    name="Monthly consumption"
                    fill="#38bdf8"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState loading={loading} />
            )}
          </div>
        </section>

        {/* Hourly consumption pattern */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <SectionHeading
            title="Average Hourly Consumption"
            subtitle="Compare average and peak electricity demand across all 24 hours"
          />

          <div className="mt-6 h-80 w-full">
            {hourlyPattern.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={hourlyPattern.map((item) => ({
                    ...item,
                    hour_label: `${String(item.hour).padStart(2, "0")}:00`,
                  }))}
                  margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="hour_label"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    interval={2}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fontSize: 11 }}
                    label={{
                      value: "Consumption (kWh)",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#94a3b8",
                      fontSize: 11,
                    }}
                  />
                  <Tooltip
                    labelFormatter={(value) => `Hour: ${String(value)}`}
                    formatter={(value, name) => [
                      `${number(Number(value))} kWh`,
                      String(name),
                    ]}
                    contentStyle={tooltipStyle}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="average_consumption_kwh"
                    name="Average demand"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="peak_consumption_kwh"
                    name="Peak demand"
                    stroke="#fb7185"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState loading={loading} />
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <SmallStat
              label="Hours analyzed"
              value={number(hourlyPattern.length)}
            />
            <SmallStat
              label="Highest average hour"
              value={
                hourlyPattern.length
                  ? `${String(
                      hourlyPattern.reduce((best, item) =>
                        item.average_consumption_kwh >
                        best.average_consumption_kwh
                          ? item
                          : best
                      ).hour
                    ).padStart(2, "0")}:00`
                  : "..."
              }
            />
            <SmallStat
              label="Lowest average demand"
              value={
                hourlyPattern.length
                  ? `${number(
                      Math.min(
                        ...hourlyPattern.map(
                          (item) => item.average_consumption_kwh
                        )
                      )
                    )} kWh`
                  : "..."
              }
            />
          </div>
        </section>

        {/* Daily analytics */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <SectionHeading
            title="Daily Consumption Analysis"
            subtitle="Daily totals from the processed electricity dataset"
          />

          <div className="mt-6 h-80 w-full">
            {daily.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={daily}
                  margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#334155"
                  />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                    tickFormatter={(value) => shortDate(String(value))}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(value) => String(value)}
                    formatter={(value) => [
                      `${number(Number(value))} kWh`,
                      "Daily total",
                    ]}
                    contentStyle={tooltipStyle}
                  />
                  <Line
                    type="monotone"
                    dataKey="total_consumption_kwh"
                    name="Daily total"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState loading={loading} />
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <SmallStat
              label="Days analyzed"
              value={number(daily.length)}
            />
            <SmallStat
              label="Highest daily total"
              value={
                daily.length
                  ? `${number(
                      Math.max(
                        ...daily.map((item) => item.total_consumption_kwh)
                      )
                    )} kWh`
                  : "..."
              }
            />
            <SmallStat
              label="Average daily total"
              value={
                daily.length
                  ? `${number(
                      daily.reduce(
                        (sum, item) => sum + item.total_consumption_kwh,
                        0
                      ) / daily.length
                    )} kWh`
                  : "..."
              }
            />
          </div>
        </section>

        {/* Model evaluation */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-800 p-3">
              <BrainCircuit size={24} className="text-sky-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                Demand Prediction Model
              </h2>
              <p className="text-sm text-slate-400">
                Random Forest evaluation using held-out records
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <PredictionCard label="Model" value="Random Forest" />
            <PredictionCard
              label="Evaluated Records"
              value={
                metrics
                  ? number(metrics.records_evaluated)
                  : loading
                    ? "..."
                    : "Unavailable"
              }
            />
            <PredictionCard
              label="Mean Absolute Error (MAE)"
              value={
                metrics
                  ? `${number(metrics.mae)} kWh`
                  : loading
                    ? "..."
                    : "Unavailable"
              }
            />
            <PredictionCard
              label="Root Mean Squared Error (RMSE)"
              value={
                metrics
                  ? `${number(metrics.rmse)} kWh`
                  : loading
                    ? "..."
                    : "Unavailable"
              }
            />
            <PredictionCard
              label="Training Records"
              value={
                metrics?.training_records != null
                  ? number(metrics.training_records)
                  : "Unavailable"
              }
            />
          </div>

          {/* Model evaluation interpretation */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-5">
            <SectionHeading
              title="Model Evaluation Insights"
              subtitle="Interpretation of the Random Forest model's held-out test results"
            />

            {metrics ? (
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <p className="text-sm font-medium text-cyan-300">
                    Average prediction error
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {number(metrics.mae)} kWh
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    Predictions differ from actual consumption by an average
                    absolute amount of {number(metrics.mae)} kWh on the
                    evaluated records.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <p className="text-sm font-medium text-violet-300">
                    Larger-error sensitivity
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {metrics.mae > 0
                      ? `${number(metrics.rmse / metrics.mae)}?`
                      : "N/A"}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    RMSE divided by MAE. A larger ratio can indicate that some
                    errors are substantially bigger than the typical absolute
                    error; it does not identify their cause.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <p className="text-sm font-medium text-emerald-300">
                    Evaluation coverage
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {number(metrics.records_evaluated)}
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    Held-out records used for evaluation, separate from the{" "}
                    {metrics.training_records != null
                      ? number(metrics.training_records)
                      : "unavailable"}{" "}
                    training records.
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                Model interpretation is unavailable until evaluation metrics
                are returned by the backend.
              </p>
            )}

            <p className="mt-4 text-xs leading-5 text-slate-500">
              These metrics describe performance on the saved test set. They do
              not guarantee future accuracy, and the dataset currently used by
              this project is synthetic rather than real smart-meter data.
            </p>
          </div>

          <div className="mt-8">
            <SectionHeading
              title="Actual vs. Predicted Consumption"
              subtitle="First 100 evaluation records returned by the prediction API"
            />

            <div className="mt-5 h-80 w-full">
              {predictions.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={predictions.map((item, index) => ({
                      record: index + 1,
                      actual: item.consumption_kwh,
                      predicted: item.prediction,
                    }))}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                    />
                    <XAxis
                      dataKey="record"
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value, name) => [
                        `${Number(value).toFixed(2)} kWh`,
                        String(name),
                      ]}
                      contentStyle={tooltipStyle}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Actual"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      name="Predicted"
                      stroke="#a78bfa"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState loading={loading} />
              )}
            </div>
          </div>
        </section>

        {/* 24-hour forecast */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-slate-800 p-3">
                <Clock size={24} className="text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  24-Hour Demand Forecast
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Hourly consumption predictions from the saved model
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {forecast && (
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    isHistorical
                      ? "border-amber-700/60 bg-amber-950/40 text-amber-300"
                      : "border-emerald-700/60 bg-emerald-950/40 text-emerald-300"
                  }`}
                >
                  {isHistorical ? "Historical forecast" : "Forecast available"}
                </span>
              )}

              <button
                type="button"
                disabled={forecastResults.length === 0}
                onClick={() => {
                  const escapeCsv = (value: string | number) =>
                    `"${String(value).replace(/"/g, '""')}"`;

                  const rows = [
                    [
                      "timestamp_utc",
                      "predicted_consumption_kwh",
                      "historical_average_kwh",
                      "demand_level",
                    ],
                    ...forecastResults.map((item) => [
                      item.timestamp,
                      item.predicted_consumption_kwh,
                      historicalAverage ?? "",
                      historicalAverage === null || historicalAverage <= 0
                        ? "Unavailable"
                        : item.predicted_consumption_kwh > historicalAverage * 1.25
                          ? "High"
                          : item.predicted_consumption_kwh > historicalAverage
                            ? "Elevated"
                            : "Normal",
                    ]),
                  ];

                  const csv = rows
                    .map((row) => row.map(escapeCsv).join(","))
                    .join("\r\n");

                  const blob = new Blob(["\uFEFF", csv], {
                    type: "text/csv;charset=utf-8;",
                  });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "gridpulse_24_hour_forecast.csv";
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-700/60 bg-cyan-950/40 px-4 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-900/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export CSV
              </button>
            </div>
          </div>

          {forecast && isHistorical && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-900/60 bg-amber-950/20 p-4">
              <AlertCircle
                size={20}
                className="mt-0.5 shrink-0 text-amber-400"
              />
              <div>
                <p className="text-sm font-medium text-amber-300">
                  Saved forecast is not current
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  {forecast.message}
                </p>
              </div>
            </div>
          )}

          {forecast && (
            <p className="mt-4 text-xs text-slate-500">
              Latest forecast timestamp:{" "}
              {formatDateTime(forecast.latest_forecast_timestamp)}
            </p>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PredictionCard
              label="Forecast Points"
              value={
                forecast
                  ? number(forecast.count)
                  : loading
                    ? "..."
                    : "Unavailable"
              }
            />

            <PredictionCard
              label="Average Predicted Consumption"
              value={
                forecastAverage !== null
                  ? `${number(forecastAverage)} kWh`
                  : loading
                    ? "..."
                    : "Unavailable"
              }
            />

            <PredictionCard
              label="Highest Predicted Consumption"
              value={
                forecastPeak
                  ? `${number(forecastPeak.predicted_consumption_kwh)} kWh`
                  : loading
                    ? "..."
                    : "Unavailable"
              }
            />

            <PredictionCard
              label="Peak Forecast Time"
              value={
                forecastPeak
                  ? formatDateTime(forecastPeak.timestamp)
                  : loading
                    ? "..."
                    : "Unavailable"
              }
            />
          </div>

          <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <SectionHeading
              title="Forecast Insights"
              subtitle="Automatic analysis of predicted demand against historical consumption"
            />

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-sm text-slate-400">Demand Status</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {forecastDifference === null
                    ? "Unavailable"
                    : Math.abs(forecastDifference) < 0.01
                      ? "Near historical average"
                      : forecastDifference > 0
                        ? "Above historical average"
                        : "Below historical average"}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {forecastDifference === null
                    ? "Waiting for forecast and summary data."
                    : `${forecastDifference > 0 ? "+" : ""}${number(forecastDifference)} kWh compared with the historical average.`}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-sm text-slate-400">Peak Demand</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {forecastPeak
                    ? `${number(forecastPeak.predicted_consumption_kwh)} kWh`
                    : "Unavailable"}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {forecastPeak
                    ? `Expected at ${formatDateTime(forecastPeak.timestamp)}.`
                    : "No forecast peak is available."}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-sm text-slate-400">Peak Above Forecast Average</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {peakAboveAverage === null
                    ? "Unavailable"
                    : `${number(peakAboveAverage)} kWh`}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {peakAboveAverage === null || forecastAverage === null
                    ? "Waiting for forecast data."
                    : `Forecast average: ${number(forecastAverage)} kWh.`}
                </p>
              </div>
            </div>
          </div>

          {/* Forecast risk alerts */}
          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <SectionHeading
              title="Forecast Risk Alerts"
              subtitle="Demand levels are classified using the historical average and a project-defined 125% threshold."
            />

            {(() => {
              const highDemand = forecastResults.filter(
                (item) =>
                  historicalAverage !== null &&
                  historicalAverage > 0 &&
                  item.predicted_consumption_kwh > historicalAverage * 1.25
              );

              const elevatedDemand = forecastResults.filter(
                (item) =>
                  historicalAverage !== null &&
                  historicalAverage > 0 &&
                  item.predicted_consumption_kwh > historicalAverage &&
                  item.predicted_consumption_kwh <= historicalAverage * 1.25
              );

              const topPeriods = [...forecastResults]
                .sort(
                  (a, b) =>
                    b.predicted_consumption_kwh -
                    a.predicted_consumption_kwh
                )
                .slice(0, 5);

              return (
                <>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4">
                      <p className="text-sm text-red-300">High-demand hours</p>
                      <p className="mt-2 text-3xl font-bold text-white">
                        {highDemand.length}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Above 125% of the historical average
                      </p>
                    </div>

                    <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-4">
                      <p className="text-sm text-amber-300">Elevated-demand hours</p>
                      <p className="mt-2 text-3xl font-bold text-white">
                        {elevatedDemand.length}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Above average, up to 125% of the historical average
                      </p>
                    </div>
                  </div>

                  {forecastResults.length > 0 && historicalAverage !== null && historicalAverage > 0 ? (
                    <div className="mt-5">
                      <h3 className="text-sm font-semibold text-slate-200">
                        Highest predicted demand periods
                      </h3>
                      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800">
                        <table className="w-full min-w-[480px] text-left text-sm">
                          <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                            <tr>
                              <th className="px-4 py-3 font-medium">Time (UTC)</th>
                              <th className="px-4 py-3 text-right font-medium">Predicted demand</th>
                              <th className="px-4 py-3 text-right font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topPeriods.map((item) => {
                              const level =
                                item.predicted_consumption_kwh > historicalAverage * 1.25
                                  ? "High"
                                  : item.predicted_consumption_kwh > historicalAverage
                                    ? "Elevated"
                                    : "Normal";

                              return (
                                <tr key={item.timestamp} className="border-t border-slate-800">
                                  <td className="px-4 py-3 text-slate-300">
                                    {formatDateTime(item.timestamp)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-medium text-cyan-300">
                                    {number(item.predicted_consumption_kwh)} kWh
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span
                                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                                        level === "High"
                                          ? "border-red-500/30 bg-red-500/10 text-red-300"
                                          : level === "Elevated"
                                            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                      }`}
                                    >
                                      {level}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-5 text-sm text-slate-400">
                      Risk alerts will appear when forecast and historical-average data are available.
                    </p>
                  )}
                </>
              );
            })()}
          </section>

          <div className="mt-8">
            <SectionHeading
              title="Hourly Predicted Consumption"
              subtitle="Each point represents one saved hourly prediction (UTC)"
            />

            <div className="mt-5 h-80 w-full">
              {forecastResults.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={forecastResults}
                    margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                    />

                    <XAxis
                      dataKey="timestamp"
                      stroke="#94a3b8"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                      tickFormatter={(value) =>
                        new Date(String(value)).toLocaleString("en-IN", {
                          timeZone: "UTC",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                        })
                      }
                    />

                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      label={{
                        value: "kWh",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#94a3b8",
                      }}
                    />

                    <Tooltip
                      labelFormatter={(value) =>
                        formatDateTime(String(value))
                      }
                      formatter={(value, name) => [
                        `${Number(value).toFixed(3)} kWh`,
                        String(name),
                      ]}
                      contentStyle={tooltipStyle}
                    />

                    <Line
                      type="monotone"
                      dataKey="predicted_consumption_kwh"
                      name="Predicted consumption"
                      stroke="#22d3ee"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#22d3ee" }}
                      activeDot={{ r: 6 }}
                    />

                    <Line
                      type="monotone"
                      dataKey="historical_average_kwh"
                      name="Historical average"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      activeDot={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState loading={loading} />
              )}
            </div>
          </div>

          {forecastResults.length > 0 && (
            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[440px] text-left text-sm">
                <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Timestamp (UTC)</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Predicted Consumption
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Demand Level
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {forecastResults.map((item, index) => (
                    <tr
                      key={`${item.timestamp}-${index}`}
                      className="border-t border-slate-800"
                    >
                      <td className="px-4 py-3 text-slate-300">
                        {formatDateTime(item.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-cyan-300">
                        {number(item.predicted_consumption_kwh)} kWh
                      </td>
                      <td className="px-4 py-3 text-right">
                        {historicalAverage === null || historicalAverage <= 0 ? (
                          <span className="text-slate-400">Unavailable</span>
                        ) : item.predicted_consumption_kwh > historicalAverage * 1.25 ? (
                          <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300">
                            High
                          </span>
                        ) : item.predicted_consumption_kwh > historicalAverage ? (
                          <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                            Elevated
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                            Normal
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Daily demand summary */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <SectionHeading
            title="Daily Demand Summary"
            subtitle="Daily totals and peak demand calculated from hourly forecasts (UTC)"
          />

          {Object.keys(dailyForecastSummary).length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Forecast Date (UTC)</th>
                    <th className="px-4 py-3 text-right font-medium">Forecast Hours</th>
                    <th className="px-4 py-3 text-right font-medium">Total Predicted Consumption</th>
                    <th className="px-4 py-3 text-right font-medium">Average per Hour</th>
                    <th className="px-4 py-3 text-right font-medium">Peak Demand</th>
                    <th className="px-4 py-3 font-medium">Peak Time (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dailyForecastSummary)
                    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                    .map(([date, day]) => (
                      <tr key={date} className="border-t border-slate-800">
                        <td className="px-4 py-3 text-slate-300">{date}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{day.count}</td>
                        <td className="px-4 py-3 text-right font-medium text-cyan-300">
                          {number(day.total)} kWh
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">
                          {number(day.total / day.count)} kWh
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-amber-300">
                          {number(day.peak.predicted_consumption_kwh)} kWh
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {formatDateTime(day.peak.timestamp)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState loading={loading} />
            </div>
          )}
        </section>

        {/* Technology stack */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold">Technology Stack</h2>

          <div className="mt-5 flex flex-wrap gap-3">
            {[
              "Apache Spark",
              "PySpark",
              "FastAPI",
              "Random Forest",
              "Next.js",
              "Recharts",
              "Tailwind CSS",
              "Parquet",
            ].map((technology) => (
              <span
                key={technology}
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-300"
              >
                {technology}
              </span>
            ))}
          </div>
        </section>

        <footer className="py-8 text-center text-xs text-slate-500">
          GridPulse Â· Electricity analytics and demand prediction
        </footer>
      </section>
    </main>
  );
}

function MetricCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-slate-400">{title}</p>
        <div className="rounded-lg bg-slate-800 p-2 text-slate-300">
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function PredictionCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-lg font-semibold">{value}</p>
    </div>
  );
}

function SmallStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div>
        {loading ? (
          <RefreshCw
            size={28}
            className="mx-auto mb-3 animate-spin text-slate-500"
          />
        ) : (
          <CalendarDays
            size={36}
            className="mx-auto mb-3 text-slate-600"
          />
        )}
        <p className="text-sm text-slate-400">
          {loading ? "Loading analytics..." : "No data available"}
        </p>
      </div>
    </div>
  );
}

