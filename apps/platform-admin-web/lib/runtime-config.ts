import { createElement } from "react";
import {
  DEFAULT_PLATFORM_ADMIN_AUTHORITY,
  type PlatformAdminAuthority,
} from "./platform-admin-identity";

type RuntimeConfig = {
  apiBaseUrl: string;
  platformAdminActorId: string;
  platformAdminAssistantEnabled: boolean;
  platformAdminScopes: string[];
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

export function getRuntimeApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return resolveServerApiBaseUrl();
  }

  return (
    window.__DRTS_RUNTIME_CONFIG__?.apiBaseUrl || resolveBrowserApiBaseUrl()
  );
}

export function getRuntimePlatformAdminActorId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_PLATFORM_ADMIN_AUTHORITY.actorId;
  }

  return (
    window.__DRTS_RUNTIME_CONFIG__?.platformAdminActorId ||
    DEFAULT_PLATFORM_ADMIN_AUTHORITY.actorId
  );
}

export function getRuntimePlatformAdminScopes(): string[] {
  if (typeof window === "undefined") {
    return DEFAULT_PLATFORM_ADMIN_AUTHORITY.scopes;
  }

  return (
    window.__DRTS_RUNTIME_CONFIG__?.platformAdminScopes ||
    DEFAULT_PLATFORM_ADMIN_AUTHORITY.scopes
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

export function RuntimeConfigScript({
  authority,
}: {
  authority: PlatformAdminAuthority;
}) {
  const config: RuntimeConfig = {
    apiBaseUrl: resolveBrowserApiBaseUrl(),
    platformAdminActorId: authority.actorId,
    platformAdminAssistantEnabled: resolvePlatformAdminAssistantEnabled(),
    platformAdminScopes: authority.scopes,
  };
  const serializedConfig = JSON.stringify(config).replace(/</g, "\\u003c");

  return createElement("script", {
    dangerouslySetInnerHTML: {
      __html: `window.${RUNTIME_CONFIG_WINDOW_KEY} = ${serializedConfig};`,
    },
  });
}
