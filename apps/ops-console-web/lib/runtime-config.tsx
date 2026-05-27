type RuntimeConfig = {
  apiBaseUrl: string;
  platformAdminBaseUrl: string | null;
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

function resolvePlatformAdminBaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL || null;
}

export function getRuntimeApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return resolveServerApiBaseUrl();
  }

  return (
    window.__DRTS_RUNTIME_CONFIG__?.apiBaseUrl || resolveBrowserApiBaseUrl()
  );
}

export function getRuntimePlatformAdminBaseUrl(): string | null {
  if (typeof window === "undefined") {
    return resolvePlatformAdminBaseUrl();
  }

  return (
    window.__DRTS_RUNTIME_CONFIG__?.platformAdminBaseUrl ??
    resolvePlatformAdminBaseUrl()
  );
}

export function RuntimeConfigScript() {
  const config: RuntimeConfig = {
    apiBaseUrl: resolveBrowserApiBaseUrl(),
    platformAdminBaseUrl: resolvePlatformAdminBaseUrl(),
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
