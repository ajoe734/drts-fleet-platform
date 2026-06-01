type RuntimeConfig = {
  apiBaseUrl: string;
  opsConsoleUrl: string;
  platformAdminUrl: string;
  tenantConsoleUrl: string;
};

const DEFAULT_SERVER_API_BASE_URL = "http://localhost:3001";
const DEFAULT_BROWSER_API_BASE_URL = "/control-plane-proxy";
const DEFAULT_PLATFORM_ADMIN_URL = "http://localhost:3002";
const DEFAULT_OPS_CONSOLE_URL = "http://localhost:3003";
const DEFAULT_TENANT_CONSOLE_URL = "http://localhost:3004";
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

function resolveAppBaseUrl(
  targetApp: "ops-console" | "platform-admin" | "tenant-console",
): string {
  if (targetApp === "ops-console") {
    return process.env.NEXT_PUBLIC_OPS_CONSOLE_URL || DEFAULT_OPS_CONSOLE_URL;
  }
  if (targetApp === "tenant-console") {
    return (
      process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL || DEFAULT_TENANT_CONSOLE_URL
    );
  }
  return (
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL || DEFAULT_PLATFORM_ADMIN_URL
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

export function getCrossAppBaseUrl(
  targetApp: "ops-console" | "platform-admin" | "tenant-console",
): string {
  if (typeof window === "undefined") {
    return resolveAppBaseUrl(targetApp);
  }

  const config = window.__DRTS_RUNTIME_CONFIG__;
  if (targetApp === "ops-console") {
    return config?.opsConsoleUrl || resolveAppBaseUrl(targetApp);
  }
  if (targetApp === "tenant-console") {
    return config?.tenantConsoleUrl || resolveAppBaseUrl(targetApp);
  }
  return config?.platformAdminUrl || resolveAppBaseUrl(targetApp);
}

export function RuntimeConfigScript() {
  const config: RuntimeConfig = {
    apiBaseUrl: resolveBrowserApiBaseUrl(),
    opsConsoleUrl: resolveAppBaseUrl("ops-console"),
    platformAdminUrl: resolveAppBaseUrl("platform-admin"),
    tenantConsoleUrl: resolveAppBaseUrl("tenant-console"),
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
