export const runtime = "edge";
export const dynamic = "force-dynamic";

const ASSETS = [
  {
    symbol: "EURUSD_OTC",
    basePrice: 1.085,
    volatility: 0.0008,
  },
  {
    symbol: "GBPUSD_OTC",
    basePrice: 1.272,
    volatility: 0.0009,
  },
  {
    symbol: "USDJPY_OTC",
    basePrice: 157.1,
    volatility: 0.09,
  },
];

type StreamMessage = {
  asset: string;
  timestamp: number;
  price: number;
  volume: number;
};

function parseAsset(request: Request): (typeof ASSETS)[number] {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("asset");
    if (symbol) {
      const match = ASSETS.find((item) => item.symbol === symbol);
      if (match) {
        return match;
      }
    }
  } catch {
    // Ignore parsing errors and fallback to default asset.
  }

  return ASSETS[0];
}

function createRandomWalkGenerator(basePrice: number, volatility: number) {
  let lastPrice = basePrice;
  return () => {
    const drift = (Math.random() - 0.5) * volatility * 2;
    const shock = volatility * (Math.random() - 0.5) * 1.5;
    const nextPrice = Math.max(
      0.0001,
      lastPrice * (1 + drift) + shock * Math.sqrt(Math.random())
    );
    lastPrice = nextPrice;
    const volume =
      100 + Math.floor(Math.random() * 50) + Math.abs(shock) * 1000;

    return {
      price: Number(nextPrice.toFixed(5)),
      volume: Number(volume.toFixed(2)),
    };
  };
}

export async function GET(request: Request) {
  if (request.headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  const EdgeWebSocketPair = (globalThis as unknown as {
    WebSocketPair?: { new (): { 0: WebSocket; 1: WebSocket } };
  }).WebSocketPair;

  if (!EdgeWebSocketPair) {
    return new Response("WebSocket not supported in this runtime", {
      status: 500,
    });
  }

  const pair = new EdgeWebSocketPair();
  const client = pair[0] as WebSocket;
  const server = pair[1] as WebSocket & { accept: () => void };
  const asset = parseAsset(request);
  const generate = createRandomWalkGenerator(
    asset.basePrice,
    asset.volatility
  );

  server.accept();

  const interval = setInterval(() => {
    try {
      const payload = generate();
      const message: StreamMessage = {
        asset: asset.symbol,
        timestamp: Date.now(),
        price: payload.price,
        volume: payload.volume,
      };
      server.send(JSON.stringify(message));
    } catch (error) {
      console.error("Failed to push mock quote:", error);
      try {
        server.send(
          JSON.stringify({
            type: "error",
            message: "Internal stream error",
          })
        );
      } catch {
        // Ignore secondary failures.
      }
    }
  }, 1000);

  server.addEventListener("close", () => clearInterval(interval));
  server.addEventListener("error", () => clearInterval(interval));

  return new Response(null, {
    status: 101,
    webSocket: client,
  } as ResponseInit & { webSocket: WebSocket });
}
