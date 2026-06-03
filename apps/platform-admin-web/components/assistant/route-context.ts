"use client";

import type { CrossAppResourceLink } from "@drts/contracts";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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
  | { ok: true; code: string; message: string; payload?: Record<string, unknown> }
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

type PlatformAdminRouteContextValue = {
  pathname: string;
  pageBridge: PlatformAdminAssistantPageBridge | null;
  setPageBridge: (bridge: PlatformAdminAssistantPageBridge | null) => void;
  navigateToHref: (href: string) => AssistantToolResult;
  openCrossAppLink: (link: CrossAppResourceLink) => AssistantToolResult;
};

const DEFAULT_PLATFORM_ADMIN_BASE = "/_apps/platform-admin";
const DEFAULT_OPS_CONSOLE_BASE = "/_apps/ops-console";
const DEFAULT_TENANT_CONSOLE_BASE = "/_apps/tenant-console";

const PlatformAdminRouteContext =
  createContext<PlatformAdminRouteContextValue | null>(null);

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

export function PlatformAdminAssistantProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [pageBridge, setPageBridge] =
    useState<PlatformAdminAssistantPageBridge | null>(null);

  const value = useMemo<PlatformAdminRouteContextValue>(
    () => ({
      pathname,
      pageBridge,
      setPageBridge,
      navigateToHref(href) {
        router.push(href);
        return {
          ok: true,
          code: "route_opened",
          message: `Opened platform route ${href}.`,
          payload: { href },
        };
      },
      openCrossAppLink(link) {
        const href = resolveCrossAppHref(link);
        window.open(href, "_blank", "noopener,noreferrer");
        return {
          ok: true,
          code: "cross_app_opened",
          message: `Opened ${link.targetApp} resource in a new tab.`,
          payload: {
            href,
            targetApp: link.targetApp,
            resourceType: link.resourceType,
            resourceId: link.resourceId,
          },
        };
      },
    }),
    [pageBridge, pathname, router],
  );

  return (
    <PlatformAdminRouteContext.Provider value={value}>
      {children}
    </PlatformAdminRouteContext.Provider>
  );
}

function usePlatformAdminRouteContext() {
  const context = useContext(PlatformAdminRouteContext);
  if (!context) {
    throw new Error(
      "PlatformAdminAssistantProvider is required for assistant route context.",
    );
  }
  return context;
}

export function usePlatformAdminAssistantPage(
  bridge: PlatformAdminAssistantPageBridge,
) {
  const { setPageBridge } = usePlatformAdminRouteContext();
  useEffect(() => {
    setPageBridge(bridge);
    return () => {
      setPageBridge(null);
    };
  }, [bridge, setPageBridge]);
}

export function usePlatformAdminAssistantRouteContext() {
  return usePlatformAdminRouteContext();
}
