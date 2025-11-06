import { MACD } from "technicalindicators";
import { IndicatorSnapshot, QuoteTick, StrategySignal } from "./types";

export const MACD_DEFAULT_CONFIG = {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  SimpleMAOscillator: false,
  SimpleMASignal: false,
};

export const MOMENTUM_PERIOD = 5;
const MIN_RELATIVE_MOMENTUM = 0.001; // ≈0.1% move in the last 5s.
const HISTOGRAM_REFERENCE = 0.0005;

type MacdOutput = {
  MACD?: number;
  signal?: number;
  histogram?: number;
};

function toIndicatorSnapshot(
  macdValue: MacdOutput | undefined,
  momentum: number | undefined
): IndicatorSnapshot {
  if (!macdValue) {
    return {
      macd: null,
      signal: null,
      histogram: null,
      momentum: momentum ?? null,
      crossover: null,
    };
  }

  return {
    macd: macdValue.MACD ?? null,
    signal: macdValue.signal ?? null,
    histogram: macdValue.histogram ?? null,
    momentum: momentum ?? null,
    crossover: null,
  };
}

export function computeIndicators(
  ticks: QuoteTick[]
): {
  snapshot: IndicatorSnapshot;
  signal: StrategySignal | null;
} {
  const prices = ticks.map((tick) => tick.price);

  if (
    prices.length <
    Math.max(MACD_DEFAULT_CONFIG.slowPeriod, MOMENTUM_PERIOD) + 5
  ) {
    return { snapshot: toIndicatorSnapshot(undefined, undefined), signal: null };
  }

  const macdSeries = MACD.calculate({
    ...MACD_DEFAULT_CONFIG,
    values: prices,
  }) as MacdOutput[];

  const latestMacd = macdSeries[macdSeries.length - 1];
  const prevMacd = macdSeries[macdSeries.length - 2];

  const momentumIndex = prices.length - 1 - MOMENTUM_PERIOD;
  const latestMomentum =
    momentumIndex >= 0 ? prices[prices.length - 1] - prices[momentumIndex] : undefined;

  const snapshot = toIndicatorSnapshot(latestMacd, latestMomentum);

  if (!latestMacd || !prevMacd || typeof latestMomentum !== "number") {
    return { snapshot, signal: null };
  }

  const lastPrice = prices[prices.length - 1];
  const relativeMomentum =
    lastPrice === 0 ? 0 : Math.abs(latestMomentum / lastPrice);

  let crossover: IndicatorSnapshot["crossover"] = null;
  if (
    prevMacd.MACD !== undefined &&
    prevMacd.signal !== undefined &&
    latestMacd.MACD !== undefined &&
    latestMacd.signal !== undefined
  ) {
    if (prevMacd.MACD <= prevMacd.signal && latestMacd.MACD > latestMacd.signal) {
      crossover = "bullish";
    }
    if (prevMacd.MACD >= prevMacd.signal && latestMacd.MACD < latestMacd.signal) {
      crossover = "bearish";
    }
  }

  snapshot.crossover = crossover;

  if (!crossover) {
    return { snapshot, signal: null };
  }

  if (
    (crossover === "bullish" && latestMomentum <= 0) ||
    (crossover === "bearish" && latestMomentum >= 0)
  ) {
    return { snapshot, signal: null };
  }

  if (relativeMomentum < MIN_RELATIVE_MOMENTUM) {
    return { snapshot, signal: null };
  }

  const histogramStrength = Math.min(
    1,
    Math.abs((latestMacd.histogram ?? 0) / HISTOGRAM_REFERENCE)
  );
  const momentumStrength = Math.min(
    1,
    relativeMomentum / MIN_RELATIVE_MOMENTUM
  );

  const confidence = Math.round((0.55 * momentumStrength + 0.45 * histogramStrength) * 100);
  const direction = crossover === "bullish" ? "up" : "down";

  const signal: StrategySignal = {
    id: `${ticks[ticks.length - 1]?.timestamp ?? Date.now()}-${direction}`,
    asset: ticks[ticks.length - 1]?.asset ?? "UNKNOWN",
    direction,
    timestamp: ticks[ticks.length - 1]?.timestamp ?? Date.now(),
    momentum: latestMomentum,
    macd: latestMacd.MACD ?? 0,
    signalLine: latestMacd.signal ?? 0,
    histogram: latestMacd.histogram ?? 0,
    confidence,
    note:
      confidence >= 80
        ? "Momentum and MACD are strongly aligned."
        : "Momentum confirmed the MACD crossover.",
  };

  return {
    snapshot,
    signal,
  };
}
