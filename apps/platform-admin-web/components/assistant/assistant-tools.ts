"use client";

import type { CrossAppResourceLink } from "@drts/contracts";
import { useMemo } from "react";
import type {
  AssistantToolResult,
  PlatformAdminAssistantPageBridge,
  PlatformAdminRouteId,
} from "./route-context";
import {
  resolvePlatformAdminRoute,
  resolvePlatformAdminRouteByHref,
  usePlatformAdminAssistantRouteContext,
} from "./route-context";

export type RouteOpenRequest =
  | { routeId: PlatformAdminRouteId; href?: never }
  | { href: string; routeId?: never };

export type RouteOpenCrossAppRequest = {
  linkId: string;
};

export type PageApplyFilterRequest = {
  filterId: string;
  value: unknown;
};

export type PageFillDraftRequest = {
  draftId: string;
  values: Record<string, unknown>;
};

export type PlatformAdminAssistantToolsContext = {
  pageBridge: PlatformAdminAssistantPageBridge | null;
  navigateToHref: (href: string) => AssistantToolResult;
  openCrossAppLink: (link: CrossAppResourceLink) => AssistantToolResult;
};

function reject(code: string, message: string): AssistantToolResult {
  return { ok: false, code, message };
}

function resolveRouteHref(request: RouteOpenRequest) {
  if ("routeId" in request) {
    return {
      routeId: request.routeId,
      href: resolvePlatformAdminRoute(request.routeId),
    };
  }

  return resolvePlatformAdminRouteByHref(request.href);
}

export function createPlatformAdminAssistantTools(
  context: PlatformAdminAssistantToolsContext,
) {
  return {
    route: {
      open(request: RouteOpenRequest): AssistantToolResult {
        const route = resolveRouteHref(request);
        if (!route) {
          return reject(
            "route_not_allowed",
            "route.open only accepts registered Platform Admin routes.",
          );
        }

        return context.navigateToHref(route.href);
      },
      open_cross_app(request: RouteOpenCrossAppRequest): AssistantToolResult {
        const link = context.pageBridge?.crossAppLinks?.[request.linkId];
        if (!link) {
          return reject(
            "cross_app_link_not_allowed",
            "Cross-app open is only allowed for page-owned CrossAppResourceLink entries.",
          );
        }
        if (link.openMode !== "new_tab") {
          return reject(
            "cross_app_new_tab_required",
            "Cross-app assistant opens must use new_tab links.",
          );
        }
        return context.openCrossAppLink(link);
      },
    },
    page: {
      apply_filter(request: PageApplyFilterRequest): AssistantToolResult {
        const adapter = context.pageBridge?.filters?.[request.filterId];
        if (!adapter) {
          return reject(
            "filter_not_allowed",
            "page.apply_filter only accepts page-owned filter adapters.",
          );
        }
        return adapter.apply(request.value);
      },
      fill_draft(request: PageFillDraftRequest): AssistantToolResult {
        const adapter = context.pageBridge?.drafts?.[request.draftId];
        if (!adapter) {
          return reject(
            "draft_not_allowed",
            "page.fill_draft only accepts page-owned draft adapters.",
          );
        }
        return adapter.fill(request.values);
      },
    },
  };
}

export function usePlatformAdminAssistantTools() {
  const { pageBridge, navigateToHref, openCrossAppLink } =
    usePlatformAdminAssistantRouteContext();

  return useMemo(
    () =>
      createPlatformAdminAssistantTools({
        pageBridge,
        navigateToHref,
        openCrossAppLink,
      }),
    [navigateToHref, openCrossAppLink, pageBridge],
  );
}
