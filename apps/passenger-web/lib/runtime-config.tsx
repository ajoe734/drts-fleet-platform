import { createElement } from "react";

export type PassengerDataMode = "fixture" | "live";

declare global {
  interface Window {
    __DRTS_PASSENGER_WEB_CONFIG__?: {
      dataMode?: PassengerDataMode;
      sseEndpoint?: string | null;
    };
  }
}

const DEFAULT_SSE_PATH = "/api/passenger-rides/sse";

function resolveDataMode(): PassengerDataMode {
  return process.env.NEXT_PUBLIC_PASSENGER_RIDE_DATA_MODE === "live"
    ? "live"
    : "fixture";
}

function resolveSseEndpoint(): string | null {
  return (
    process.env.NEXT_PUBLIC_PASSENGER_RIDE_SSE_URL?.trim() || DEFAULT_SSE_PATH
  );
}

export function getPassengerRuntimeConfig() {
  if (typeof window !== "undefined") {
    return {
      dataMode:
        window.__DRTS_PASSENGER_WEB_CONFIG__?.dataMode || resolveDataMode(),
      sseEndpoint:
        window.__DRTS_PASSENGER_WEB_CONFIG__?.sseEndpoint ||
        resolveSseEndpoint(),
    };
  }

  return {
    dataMode: resolveDataMode(),
    sseEndpoint: resolveSseEndpoint(),
  };
}

export function RuntimeConfigScript() {
  const config = {
    dataMode: resolveDataMode(),
    sseEndpoint: resolveSseEndpoint(),
  };

  return createElement("script", {
    id: "drts-passenger-web-runtime-config",
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: {
      __html:
        "window.__DRTS_PASSENGER_WEB_CONFIG__=" +
        JSON.stringify(config).replace(/</g, "\\u003c"),
    },
  });
}
