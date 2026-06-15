import { createElement } from "react";

const DEFAULT_SERVER_API_BASE_URL = "http://localhost:3001";
const DEFAULT_BROWSER_API_BASE_URL = "/control-plane-proxy";

declare global {
  interface Window {
    __DRTS_ENTERPRISE_DISPATCH_CONFIG__?: {
      apiBaseUrl?: string;
    };
  }
}

function resolveServerApiBaseUrl(): string {
  return (
    process.env.DRTS_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    DEFAULT_SERVER_API_BASE_URL
  );
}

function resolveBrowserApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_BROWSER_API_BASE_URL
  );
}

export function getRuntimeApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return (
      window.__DRTS_ENTERPRISE_DISPATCH_CONFIG__?.apiBaseUrl ||
      resolveBrowserApiBaseUrl()
    );
  }

  return resolveServerApiBaseUrl();
}

export function RuntimeConfigScript() {
  const config = {
    apiBaseUrl: resolveBrowserApiBaseUrl(),
  };

  return createElement("script", {
    id: "drts-enterprise-dispatch-runtime-config",
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: {
      __html:
        "window.__DRTS_ENTERPRISE_DISPATCH_CONFIG__=" +
        JSON.stringify(config).replace(/</g, "\\u003c"),
    },
  });
}
