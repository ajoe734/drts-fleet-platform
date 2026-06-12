import { createElement } from "react";

const DEFAULT_SERVER_API_BASE_URL = "http://localhost:3001";
const DEFAULT_BROWSER_API_BASE_URL = "/control-plane-proxy";

declare global {
  interface Window {
    __DRTS_PARTNER_BOOKING_CONFIG__?: {
      apiBaseUrl?: string;
    };
  }
}

export function getServerApiBaseUrl() {
  return (
    process.env.DRTS_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_SERVER_API_BASE_URL
  );
}

export function getBrowserApiBaseUrl() {
  if (typeof window !== "undefined") {
    return (
      window.__DRTS_PARTNER_BOOKING_CONFIG__?.apiBaseUrl ||
      process.env.NEXT_PUBLIC_API_URL ||
      DEFAULT_BROWSER_API_BASE_URL
    );
  }

  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_BROWSER_API_BASE_URL;
}

export function RuntimeConfigScript() {
  const config = {
    apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || DEFAULT_BROWSER_API_BASE_URL,
  };

  return createElement("script", {
    id: "drts-partner-booking-runtime-config",
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: {
      __html: `window.__DRTS_PARTNER_BOOKING_CONFIG__=${JSON.stringify(config).replace(/</g, "\\u003c")};`,
    },
  });
}
