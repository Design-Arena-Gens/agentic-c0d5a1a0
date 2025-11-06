import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeIndicators } from "@/lib/analysis";
import { IndicatorSnapshot, QuoteTick, StrategySignal } from "@/lib/types";

type StreamStatus = "connecting" | "open" | "closed" | "error";

const INITIAL_INDICATOR_STATE: IndicatorSnapshot = {
  macd: null,
  signal: null,
  histogram: null,
  momentum: null,
  crossover: null,
};

const MAX_TICKS = 500;
const MAX_SIGNALS = 100;
const RECONNECT_BASE_DELAY = 2000;

function resolveWebSocketUrl(asset: string) {
  const envUrl = process.env.NEXT_PUBLIC_QUOTEX_WS_URL;

  if (typeof window === "undefined") {
    return null;
  }

  if (envUrl && envUrl.trim().length > 0) {
    const url = new URL(envUrl);
    url.searchParams.set("asset", asset);
    return url.toString();
  }

  const origin = window.location.origin.replace(/^http/, "ws");
  return `${origin}/api/quotex-stream?asset=${asset}`;
}

async function readEventData(data: Blob | ArrayBuffer | string): Promise<string> {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof Blob) {
    return data.text();
  }

  return new TextDecoder().decode(data);
}

export function useQuoteStream(asset: string) {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [ticks, setTicks] = useState<QuoteTick[]>([]);
  const [signals, setSignals] = useState<StrategySignal[]>([]);
  const [indicators, setIndicators] =
    useState<IndicatorSnapshot>(INITIAL_INDICATOR_STATE);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) {
      return;
    }

    attemptRef.current += 1;
    const delay = RECONNECT_BASE_DELAY * Math.min(attemptRef.current, 5);

    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connectRef.current?.();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    const url = resolveWebSocketUrl(asset);
    if (!url) {
      return;
    }

    setStatus("connecting");
    setError(null);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      setStatus("open");
    };

    ws.onclose = () => {
      setStatus("closed");
      scheduleReconnect();
    };

    ws.onerror = () => {
      setStatus("error");
      setError("Stream connection failed");
      scheduleReconnect();
    };

    ws.onmessage = async (event) => {
      try {
        const payload = await readEventData(event.data);
        const parsed = JSON.parse(payload) as QuoteTick & {
          type?: string;
          message?: string;
        };

        if (parsed.type === "error") {
          setError(parsed.message ?? "Stream error");
          return;
        }

        const tick: QuoteTick = {
          asset: parsed.asset ?? asset,
          price: parsed.price,
          timestamp: parsed.timestamp,
          volume: parsed.volume ?? 0,
        };

        setTicks((prev) => {
          const next = [...prev, tick];
          if (next.length > MAX_TICKS) {
            next.splice(0, next.length - MAX_TICKS);
          }

          const { snapshot, signal } = computeIndicators(next);
          setIndicators(snapshot);

          if (signal) {
            setSignals((existing) => {
              const deduped = existing.find((item) => item.id === signal.id);
              if (deduped) {
                return existing;
              }
              const nextSignals = [signal, ...existing];
              if (nextSignals.length > MAX_SIGNALS) {
                return nextSignals.slice(0, MAX_SIGNALS);
              }
              return nextSignals;
            });
          }

          return next;
        });
      } catch (err) {
        console.error("Failed to parse incoming tick", err);
      }
    };
  }, [asset, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        connectRef.current?.();
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      wsRef.current?.close();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [connect]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTicks([]);
      setSignals([]);
      setIndicators(INITIAL_INDICATOR_STATE);
    }, 0);
    return () => clearTimeout(timer);
  }, [asset]);

  const lastSignal = useMemo(
    () => (signals.length > 0 ? signals[0] : null),
    [signals]
  );

  return {
    status,
    ticks,
    signals,
    indicators,
    lastSignal,
    error,
    reconnect: connect,
  };
}
