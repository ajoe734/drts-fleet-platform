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
import type {
  AssistantToolResult,
  PlatformAdminAssistantPageBridge,
} from "./assistant-bridge";
import { resolveCrossAppHref } from "./assistant-bridge";

type PlatformAdminRouteContextValue = {
  pathname: string;
  pageBridge: PlatformAdminAssistantPageBridge | null;
  setPageBridge: (bridge: PlatformAdminAssistantPageBridge | null) => void;
  navigateToHref: (href: string) => AssistantToolResult;
  openCrossAppLink: (link: CrossAppResourceLink) => AssistantToolResult;
};

const PlatformAdminRouteContext =
  createContext<PlatformAdminRouteContextValue | null>(null);

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
