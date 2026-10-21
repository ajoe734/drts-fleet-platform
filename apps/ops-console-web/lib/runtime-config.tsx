type RuntimeConfig = {
  apiBaseUrl: string;
  platformAdminBaseUrl?: string;
};

const DEFAULT_SERVER_API_BASE_URL = "http://localhost:3001";
const DEFAULT_BROWSER_API_BASE_URL = "/control-plane-proxy";
const RUNTIME_CONFIG_WINDOW_KEY = "__DRTS_RUNTIME_CONFIG__";

declare global {
  interface Window {
    __DRTS_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

function resolveServerApiBaseUrl(): string {
  return (
    process.env.DRTS_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_SERVER_API_BASE_URL
  );
}

function resolveBrowserApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_BROWSER_API_BASE_URL;
}

export function getRuntimeApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return resolveServerApiBaseUrl();
  }

  return (
    window.__DRTS_RUNTIME_CONFIG__?.apiBaseUrl || resolveBrowserApiBaseUrl()
  );
}

export function RuntimeConfigScript() {
  // The Cloud Run origin is supplied after image build. Read it on the server
  // per request, like the existing API base, rather than baking a client value.
  const environment = process.env;
  const platformAdminBaseUrl = (
    environment.NEXT_PUBLIC_PLATFORM_ADMIN_URL ||
    environment.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN ||
    environment.DRTS_PLATFORM_ADMIN_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  const config: RuntimeConfig = {
    apiBaseUrl: resolveBrowserApiBaseUrl(),
    platformAdminBaseUrl,
  };
  const serializedConfig = JSON.stringify(config).replace(/</g, "\\u003c");

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.${RUNTIME_CONFIG_WINDOW_KEY} = ${serializedConfig};`,
      }}
    />
  );
}
