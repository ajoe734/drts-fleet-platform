"use client";

import type { CrossAppResourceLink } from "@drts/contracts";

export const PLATFORM_ADMIN_ROUTE_REGISTRY = {
  home: { href: "/" },
  tenants: { href: "/tenants" },
  "tenant-governance": { href: "/tenant-governance" },
  partners: { href: "/partners" },
  users: { href: "/users" },
  fleet: { href: "/fleet" },
  switchboard: { href: "/switchboard" },
  pricing: { href: "/pricing" },
  payments: { href: "/payments" },
  "adapter-registry": { href: "/adapter-registry" },
  health: { href: "/health" },
  notices: { href: "/notices" },
  audit: { href: "/audit" },
  "feature-flags": { href: "/feature-flags" },
} as const;

export type PlatformAdminRouteId = keyof typeof PLATFORM_ADMIN_ROUTE_REGISTRY;

export type AssistantToolResult =
  | {
      ok: true;
      code: string;
      message: string;
      payload?: Record<string, unknown>;
    }
  | {
      ok: false;
      code: string;
      message: string;
      payload?: Record<string, unknown>;
    };

export type AssistantFilterAdapter = {
  apply: (value: unknown) => AssistantToolResult;
};

export type AssistantDraftAdapter = {
  fill: (values: Record<string, unknown>) => AssistantToolResult;
};

export type PlatformAdminAssistantPageBridge = {
  pageId: string;
  filters?: Record<string, AssistantFilterAdapter>;
  drafts?: Record<string, AssistantDraftAdapter>;
  crossAppLinks?: Record<string, CrossAppResourceLink>;
};

const DEFAULT_PLATFORM_ADMIN_BASE = "/_apps/platform-admin";
const DEFAULT_OPS_CONSOLE_BASE = "/_apps/ops-console";
const DEFAULT_TENANT_CONSOLE_BASE = "/_apps/tenant-console";

function trimBaseUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim().replace(/\/$/, "");
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function joinBase(base: string, route: string) {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${base}${normalizedRoute}`;
}

export function resolvePlatformAdminRoute(
  routeId: PlatformAdminRouteId,
): string {
  return PLATFORM_ADMIN_ROUTE_REGISTRY[routeId].href;
}

export function resolvePlatformAdminRouteByHref(href: string) {
  const normalizedHref = href.trim();
  const routeEntry = Object.entries(PLATFORM_ADMIN_ROUTE_REGISTRY).find(
    ([, route]) => route.href === normalizedHref,
  );
  if (!routeEntry) {
    return null;
  }
  const [routeId, route] = routeEntry;
  return {
    routeId: routeId as PlatformAdminRouteId,
    href: route.href,
  };
}

export function resolveCrossAppHref(link: CrossAppResourceLink): string {
  const base =
    link.targetApp === "platform-admin"
      ? trimBaseUrl(
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
            process.env.DRTS_PLATFORM_ADMIN_URL,
          DEFAULT_PLATFORM_ADMIN_BASE,
        )
      : link.targetApp === "ops-console"
        ? trimBaseUrl(
            process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ??
              process.env.DRTS_OPS_CONSOLE_URL,
            DEFAULT_OPS_CONSOLE_BASE,
          )
        : trimBaseUrl(
            process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ??
              process.env.DRTS_TENANT_CONSOLE_URL,
            DEFAULT_TENANT_CONSOLE_BASE,
          );

  return joinBase(base, link.route);
}
