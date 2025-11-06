export type QuoteTick = {
  asset: string;
  timestamp: number;
  price: number;
  volume: number;
};

export type IndicatorSnapshot = {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
  momentum: number | null;
  crossover: "bullish" | "bearish" | null;
};

export type StrategySignal = {
  id: string;
  asset: string;
  direction: "up" | "down";
  timestamp: number;
  momentum: number;
  macd: number;
  signalLine: number;
  histogram: number;
  confidence: number;
  note?: string;
};
