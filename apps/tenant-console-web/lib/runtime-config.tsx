import { createElement } from "react";

const DEFAULT_SERVER_API_BASE_URL = "http://localhost:3001";
const DEFAULT_BROWSER_API_BASE_URL = "/control-plane-proxy";

export type CrossAppTarget = "ops-console" | "platform-admin";

declare global {
  interface Window {
    __DRTS_TENANT_CONSOLE_CONFIG__?: {
      apiBaseUrl?: string;
      opsConsoleOrigin?: string;
      platformAdminOrigin?: string;
    };
  }
}

/**
 * Deployed origin of another app, for cross-app deep links.
 *
 * Deployments supply these as Cloud Run runtime env vars. Only the
 * `NEXT_PUBLIC_` ones could ever reach a client component at all, and even
 * those are inlined at image build time -- before the deployed URLs exist -- so
 * a client component reading `process.env` directly sees nothing and silently
 * falls back to localhost. The value has to be resolved here, on the server,
 * per request, and handed to the browser through the runtime config script.
 *
 * Returns "" when this deployment has no origin configured. Callers must treat
 * that as "no link available", never as a base to build a URL on.
 */
function resolveCrossAppOrigin(target: CrossAppTarget): string {
  const candidates =
    target === "platform-admin"
      ? [
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
          process.env.PLATFORM_ADMIN_ORIGIN,
          process.env.DEV_PLATFORM_ADMIN_ORIGIN,
          process.env.STAGING_PLATFORM_ADMIN_ORIGIN,
          process.env.PROD_PLATFORM_ADMIN_ORIGIN,
        ]
      : [
          process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
          process.env.OPS_CONSOLE_ORIGIN,
          process.env.DEV_OPS_CONSOLE_ORIGIN,
          process.env.STAGING_OPS_CONSOLE_ORIGIN,
          process.env.PROD_OPS_CONSOLE_ORIGIN,
        ];

  const resolved = candidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  return resolved ? resolved.trim().replace(/\/$/, "") : "";
}

export function getRuntimeCrossAppOrigin(target: CrossAppTarget): string {
  if (typeof window === "undefined") {
    return resolveCrossAppOrigin(target);
  }

  const config = window.__DRTS_TENANT_CONSOLE_CONFIG__;
  const fromConfig =
    target === "platform-admin"
      ? config?.platformAdminOrigin
      : config?.opsConsoleOrigin;

  return fromConfig || resolveCrossAppOrigin(target);
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
      window.__DRTS_TENANT_CONSOLE_CONFIG__?.apiBaseUrl ||
      process.env.NEXT_PUBLIC_API_URL ||
      DEFAULT_BROWSER_API_BASE_URL
    );
  }

  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_BROWSER_API_BASE_URL;
}

export function RuntimeConfigScript() {
  const config = {
    apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || DEFAULT_BROWSER_API_BASE_URL,
    opsConsoleOrigin: resolveCrossAppOrigin("ops-console"),
    platformAdminOrigin: resolveCrossAppOrigin("platform-admin"),
  };

  return createElement("script", {
    id: "drts-tenant-console-runtime-config",
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: {
      __html: `window.__DRTS_TENANT_CONSOLE_CONFIG__=${JSON.stringify(config).replace(/</g, "\\u003c")};`,
    },
  });
}
