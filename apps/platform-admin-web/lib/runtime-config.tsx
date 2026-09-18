type RuntimeConfig = {
  apiBaseUrl: string;
  platformAdminAssistantEnabled: boolean;
  opsConsoleOrigin: string;
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

function resolvePlatformAdminAssistantEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED === "true";
}

/**
 * Ops Console deployment origin for cross-app deep links.
 *
 * Deployments supply this as a Cloud Run runtime env var, but the image is
 * built before the Ops Console URL is known, so a client component reading
 * `process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN` directly always inlines "".
 * It has to travel through the runtime config script, which renders on the
 * server per request and therefore sees the deployed value.
 */
function resolveOpsConsoleOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN?.trim().replace(/\/$/, "") ?? ""
  );
}

export function getRuntimeApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return resolveServerApiBaseUrl();
  }

  return (
    window.__DRTS_RUNTIME_CONFIG__?.apiBaseUrl || resolveBrowserApiBaseUrl()
  );
}

export function getRuntimeOpsConsoleOrigin(): string {
  if (typeof window === "undefined") {
    return resolveOpsConsoleOrigin();
  }

  return (
    window.__DRTS_RUNTIME_CONFIG__?.opsConsoleOrigin ||
    resolveOpsConsoleOrigin()
  );
}

export function isPlatformAdminAssistantEnabled(): boolean {
  if (typeof window === "undefined") {
    return resolvePlatformAdminAssistantEnabled();
  }

  return (
    window.__DRTS_RUNTIME_CONFIG__?.platformAdminAssistantEnabled ||
    resolvePlatformAdminAssistantEnabled()
  );
}

export function RuntimeConfigScript() {
  const config: RuntimeConfig = {
    apiBaseUrl: resolveBrowserApiBaseUrl(),
    platformAdminAssistantEnabled: resolvePlatformAdminAssistantEnabled(),
    opsConsoleOrigin: resolveOpsConsoleOrigin(),
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
