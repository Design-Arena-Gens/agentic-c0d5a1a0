"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQuoteStream } from "@/hooks/useQuoteStream";
import { StrategySignal } from "@/lib/types";
import { MACD } from "technicalindicators";
import { MACD_DEFAULT_CONFIG } from "@/lib/analysis";

const ASSETS = [
  { label: "EUR/USD OTC", value: "EURUSD_OTC" },
  { label: "GBP/USD OTC", value: "GBPUSD_OTC" },
  { label: "USD/JPY OTC", value: "USDJPY_OTC" },
];

const STATUS_COLORS: Record<string, string> = {
  connecting: "bg-yellow-500",
  open: "bg-emerald-500",
  closed: "bg-zinc-400",
  error: "bg-rose-500",
};

const formatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatNumber(value: number | null | undefined, digits = 5) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(digits);
}

function formatPercentage(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(digits)}%`;
}

function MetricCard({
  label,
  primary,
  secondary,
  tone = "default",
}: {
  label: string;
  primary: string;
  secondary?: string;
  tone?: "default" | "bullish" | "bearish";
}) {
  const toneClasses =
    tone === "bullish"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : tone === "bearish"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : "border-white/10 text-white/90";

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClasses}`}>
      <p className="text-sm text-white/50">{label}</p>
      <p className="mt-1 text-xl font-semibold">{primary}</p>
      {secondary ? (
        <p className="mt-1 text-xs text-white/60">{secondary}</p>
      ) : null}
    </div>
  );
}

function SignalBadge({ direction }: { direction: "up" | "down" }) {
  const isBullish = direction === "up";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
        isBullish
          ? "bg-emerald-500/10 text-emerald-300"
          : "bg-rose-500/10 text-rose-300"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          isBullish ? "bg-emerald-300" : "bg-rose-300"
        }`}
      />
      {isBullish ? "CALL" : "PUT"}
    </span>
  );
}

function SignalsTable({ signals }: { signals: StrategySignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-white/40">
        Awaiting confirmed MACD crossovers with strong momentum…
      </div>
    );
  }

  return (
    <div className="max-h-[320px] overflow-y-auto">
      <table className="w-full min-w-[540px] text-left text-sm text-white/80">
        <thead className="sticky top-0 z-10 bg-white/5 text-xs uppercase tracking-wide text-white/40 backdrop-blur">
          <tr>
            <th className="px-3 py-2">Time</th>
            <th className="px-3 py-2">Asset</th>
            <th className="px-3 py-2">Signal</th>
            <th className="px-3 py-2">Momentum</th>
            <th className="px-3 py-2">MACD</th>
            <th className="px-3 py-2">Signal</th>
            <th className="px-3 py-2">Histogram</th>
            <th className="px-3 py-2">Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {signals.map((signal) => (
            <tr key={signal.id} className="hover:bg-white/5">
              <td className="px-3 py-2 text-white/60">
                {formatter.format(signal.timestamp)}
              </td>
              <td className="px-3 py-2 font-medium">{signal.asset}</td>
              <td className="px-3 py-2">
                <SignalBadge direction={signal.direction} />
              </td>
              <td className="px-3 py-2 text-white/70">
                {signal.momentum.toFixed(5)}
              </td>
              <td className="px-3 py-2 text-white/70">
                {signal.macd.toFixed(5)}
              </td>
              <td className="px-3 py-2 text-white/70">
                {signal.signalLine.toFixed(5)}
              </td>
              <td className="px-3 py-2 text-white/70">
                {signal.histogram.toFixed(5)}
              </td>
              <td className="px-3 py-2 text-white/70">
                {signal.confidence}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [asset, setAsset] = useState(ASSETS[0]?.value ?? "EURUSD_OTC");
  const { ticks, indicators, status, error, signals, lastSignal, reconnect } =
    useQuoteStream(asset);

  const priceChartData = useMemo(
    () =>
      ticks.map((tick) => ({
        time: formatter.format(tick.timestamp),
        timestamp: tick.timestamp,
        price: tick.price,
        volume: tick.volume,
      })),
    [ticks]
  );

  const macdSeries = useMemo(() => {
    if (ticks.length === 0) {
      return [];
    }

    const prices = ticks.map((tick) => tick.price);
    const macdValues = MACD.calculate({
      ...MACD_DEFAULT_CONFIG,
      values: prices,
    });

    const offset = ticks.length - macdValues.length;

    return macdValues.map((value, index) => {
      const tick = ticks[index + offset];
      return {
        time: formatter.format(tick.timestamp),
        timestamp: tick.timestamp,
        macd: value.MACD ?? 0,
        signal: value.signal ?? 0,
        histogram: value.histogram ?? 0,
      };
    });
  }, [ticks]);

  const latestPrice = ticks.length > 0 ? ticks[ticks.length - 1].price : null;
  const relativeMomentum =
    indicators.momentum && latestPrice
      ? (indicators.momentum / latestPrice) * 100
      : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-lg md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white/90">
              Quotex OTC Strategy Console
            </h1>
            <p className="text-sm text-white/50">
              Realtime MACD crossover detection aligned with 5s momentum.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-white/60">
              Asset
              <select
                value={asset}
                onChange={(event) => setAsset(event.target.value)}
                className="rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                {ASSETS.map((item) => (
                  <option
                    key={item.value}
                    value={item.value}
                    className="bg-zinc-900 text-white"
                  >
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => reconnect()}
              className="rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Reconnect
            </button>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs uppercase tracking-wide text-white/60">
              <span
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  STATUS_COLORS[status] ?? STATUS_COLORS.connecting
                }`}
              />
              {status}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Last Price"
            primary={formatNumber(latestPrice)}
            secondary={asset}
          />
          <MetricCard
            label="MACD"
            primary={formatNumber(indicators.macd)}
            secondary={`Signal ${formatNumber(indicators.signal)}`}
            tone={
              indicators.crossover === "bullish"
                ? "bullish"
                : indicators.crossover === "bearish"
                ? "bearish"
                : "default"
            }
          />
          <MetricCard
            label="Histogram"
            primary={formatNumber(indicators.histogram, 6)}
            secondary={
              indicators.crossover
                ? `${indicators.crossover.toUpperCase()} bias`
                : undefined
            }
            tone={
              indicators.histogram && indicators.histogram > 0
                ? "bullish"
                : indicators.histogram && indicators.histogram < 0
                ? "bearish"
                : "default"
            }
          />
          <MetricCard
            label="Momentum (5s)"
            primary={formatNumber(indicators.momentum)}
            secondary={`Relative ${formatPercentage(relativeMomentum)}`}
            tone={
              indicators.momentum && indicators.momentum > 0
                ? "bullish"
                : indicators.momentum && indicators.momentum < 0
                ? "bearish"
                : "default"
            }
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur lg:col-span-3">
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                Price Action
              </h2>
              <p className="text-xs text-white/40">Live ticks · 5m depth</p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={priceChartData}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff16" />
                  <XAxis dataKey="time" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#020617",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#f9fafb",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#34d399"
                    fillOpacity={1}
                    fill="url(#priceGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur lg:col-span-2">
            <div>
              <div className="flex items-center justify-between pb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                  MACD & Signal
                </h2>
                <p className="text-xs text-white/40">12/26/9</p>
              </div>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={macdSeries.slice(-120)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff16" />
                    <XAxis dataKey="time" stroke="#6b7280" hide />
                    <YAxis stroke="#6b7280" domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#f9fafb",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="macd"
                      stroke="#38bdf8"
                      dot={false}
                      strokeWidth={2}
                      name="MACD"
                    />
                    <Line
                      type="monotone"
                      dataKey="signal"
                      stroke="#f9a8d4"
                      dot={false}
                      strokeWidth={2}
                      name="Signal"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between pb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                  Histogram Intensity
                </h2>
                <p className="text-xs text-white/40">
                  Positive favors calls · Negative favors puts
                </p>
              </div>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={macdSeries.slice(-120)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff16" />
                    <XAxis dataKey="time" stroke="#6b7280" hide />
                    <YAxis stroke="#6b7280" domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#f9fafb",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="histogram"
                      stroke="#f97316"
                      fill="#f97316"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-5">
          <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
                Signal Feed
              </h2>
              {lastSignal ? (
                <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-xs text-white/70">
                  <SignalBadge direction={lastSignal.direction} />
                  {formatter.format(lastSignal.timestamp)}
                  <span className="text-white/40">
                    {lastSignal.confidence}% confidence
                  </span>
                </div>
              ) : (
                <p className="text-xs text-white/40">
                  Awaiting strategy confirmation…
                </p>
              )}
            </div>
            <SignalsTable signals={signals.slice(0, 25)} />
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/70 backdrop-blur lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
              Strategy Notes
            </h2>
            <ul className="mt-3 space-y-3 text-white/60">
              <li>
                • Signals fire on confirmed MACD crossovers within the last 5
                seconds when directional momentum magnitude exceeds 0.1% of
                price.
              </li>
              <li>
                • Confidence combines relative momentum and MACD histogram
                strength to prioritise the cleanest setups.
              </li>
              <li>
                • Connect to a live Quotex WebSocket feed by setting
                <code className="mx-1 rounded bg-black/60 px-1 py-0.5 text-xs text-white">
                  NEXT_PUBLIC_QUOTEX_WS_URL
                </code>
                before deploying.
              </li>
              <li>
                • The bundled mock stream mirrors OTC volatility for EUR/USD,
                GBP/USD, and USD/JPY pairs for dry-run validation.
              </li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
