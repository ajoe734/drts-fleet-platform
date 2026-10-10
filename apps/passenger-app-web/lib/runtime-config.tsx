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

const DEFAULT_SSE_PATH = "/control-plane-proxy/passenger-rides";

function resolveDataMode(): PassengerDataMode {
  if (process.env.NODE_ENV === "production") {
    return "live";
  }
  return process.env.NEXT_PUBLIC_PASSENGER_RIDE_DATA_MODE === "live"
    ? "live"
    : "fixture";
}

/**
 * Resolves the data mode for one page render. A `?mode=` query value can only
 * ever opt *into* live mode; production is pinned to live no matter what the
 * query string, the env var, or an injected runtime-config global says.
 */
export function resolvePassengerDataMode(
  queryMode: string | null | undefined,
): PassengerDataMode {
  if (process.env.NODE_ENV === "production") {
    return "live";
  }
  return queryMode === "live" ? "live" : "fixture";
}

function resolveSseEndpoint(): string | null {
  return (
    process.env.NEXT_PUBLIC_PASSENGER_RIDE_SSE_URL?.trim() || DEFAULT_SSE_PATH
  );
}

export function getPassengerRuntimeConfig() {
  if (typeof window !== "undefined") {
    const injected = window.__DRTS_PASSENGER_WEB_CONFIG__;
    return {
      // The injected global is a non-production convenience only. Honouring it
      // in production would let anything able to set that global downgrade a
      // real passenger to fixture data.
      dataMode:
        process.env.NODE_ENV === "production"
          ? "live"
          : injected?.dataMode || resolveDataMode(),
      sseEndpoint: injected?.sseEndpoint || resolveSseEndpoint(),
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
