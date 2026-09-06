import type { CrossAppResourceLink } from "@drts/contracts";
import {
  crossAppHref,
  platformAdminPaymentsLink,
} from "../../lib/ops-cross-app-links";
import { t } from "../../lib/translations";
import type {
  AssistantSelection,
  OpsAssistantContext,
} from "./context-envelope";
import { getAssistantAuditDescription } from "./translations";

export interface AssistantNavigationAction {
  kind: "navigate";
  label: string;
  description: string;
  route: string;
  board?: string;
  activeTab?: string;
  filters?: Record<string, string | string[]>;
}

export interface AssistantCrossAppAction {
  kind: "cross_app";
  label: string;
  description: string;
  link: CrossAppResourceLink;
}

export type AssistantAction =
  | AssistantNavigationAction
  | AssistantCrossAppAction;

export function resolvePlatformAdminOrigin(): string {
  const envCandidates = [
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL,
    process.env.PLATFORM_ADMIN_ORIGIN,
    process.env.PLATFORM_ADMIN_URL,
    process.env.DEV_PLATFORM_ADMIN_ORIGIN,
    process.env.STAGING_PLATFORM_ADMIN_ORIGIN,
    process.env.PROD_PLATFORM_ADMIN_ORIGIN,
  ];
  const envOrigin = envCandidates.find(
    (c) => typeof c === "string" && c.trim().length > 0,
  );
  if (envOrigin) {
    return envOrigin.trim().replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location) {
    const { hostname, protocol } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:3002`;
    }
    if (hostname.startsWith("ops.")) {
      return `${protocol}//platform-admin.${hostname.slice(4)}`;
    }
    if (hostname.startsWith("ops-console.")) {
      return `${protocol}//platform-admin.${hostname.slice(12)}`;
    }
  }

  return "http://localhost:3002";
}

export function buildPlatformAdminCrossAppHref(
  link: CrossAppResourceLink,
): string {
  if (link.route.startsWith("http://") || link.route.startsWith("https://")) {
    return link.route;
  }
  const base = resolvePlatformAdminOrigin();
  const route = link.route.startsWith("/") ? link.route : `/${link.route}`;
  const url = new URL(route, base);
  if (link.resourceId) {
    if (link.resourceType && !url.searchParams.has("resourceType")) {
      url.searchParams.set("resourceType", link.resourceType);
    }
    if (!url.searchParams.has("resourceId")) {
      url.searchParams.set("resourceId", link.resourceId);
    }
  }
  return url.toString();
}

type RouteConfig = {
  boardParam?: string;
  activeTabParam?: string;
  defaultActiveTab?: string;
};

const ROUTE_CONFIG: Record<string, RouteConfig> = {
  "/dispatch": { boardParam: "board" },
  "/drivers": { activeTabParam: "view", defaultActiveTab: "all" },
  "/vehicles": { activeTabParam: "tab", defaultActiveTab: "all" },
  "/revenue": { activeTabParam: "tab", defaultActiveTab: "matrix" },
  "/incidents": { activeTabParam: "tab", defaultActiveTab: "active" },
};

function appendFilterValue(
  params: URLSearchParams,
  key: string,
  value: string | string[],
) {
  if (Array.isArray(value)) {
    value
      .filter((entry) => entry.trim().length > 0)
      .forEach((entry) => params.append(key, entry));
    return;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "all") {
    return;
  }
  params.set(key, trimmed);
}

export function buildAssistantNavigationHref(
  action: Pick<
    AssistantNavigationAction,
    "route" | "board" | "activeTab" | "filters"
  >,
): string {
  const config = ROUTE_CONFIG[action.route] ?? {};
  const params = new URLSearchParams();

  if (config.boardParam && action.board && action.board !== "ready") {
    params.set(config.boardParam, action.board);
  }

  if (
    config.activeTabParam &&
    action.activeTab &&
    action.activeTab !== config.defaultActiveTab
  ) {
    params.set(config.activeTabParam, action.activeTab);
  }

  Object.entries(action.filters ?? {}).forEach(([key, value]) =>
    appendFilterValue(params, key, value),
  );

  const query = params.toString();
  return query ? `${action.route}?${query}` : action.route;
}

function buildSelectedEntityHref(selection: AssistantSelection): string | null {
  switch (selection.kind) {
    case "order":
      return `/dispatch/${encodeURIComponent(selection.id)}`;
    case "driver":
      return `/drivers/${encodeURIComponent(selection.id)}`;
    case "vehicle":
      return `/vehicles/${encodeURIComponent(selection.id)}`;
    case "complaint":
      return `/complaints/${encodeURIComponent(selection.id)}`;
    case "incident":
      return `/incidents/${encodeURIComponent(selection.id)}`;
    case "contract":
      return `/contracts/${encodeURIComponent(selection.id)}`;
    default:
      return null;
  }
}

function buildSelectionAction(
  selection: AssistantSelection | undefined,
  locale: OpsAssistantContext["locale"],
): AssistantNavigationAction | null {
  if (!selection) {
    return null;
  }

  const href = buildSelectedEntityHref(selection);
  if (!href) {
    return null;
  }

  return {
    kind: "navigate",
    label: t("opsAssistant.nav.openSelection", locale, {
      kind: selection.kind,
    }),
    description: t("opsAssistant.nav.openSelectionDescription", locale, {
      kind: selection.kind,
    }),
    route: href,
  };
}

function buildRouteSpecificActions(
  context: OpsAssistantContext,
): AssistantAction[] {
  switch (context.route) {
    case "/dispatch":
      return [
        {
          kind: "navigate",
          label: t("opsAssistant.nav.dispatch.noSupply", context.locale),
          description: t(
            "opsAssistant.nav.dispatch.noSupplyDescription",
            context.locale,
          ),
          route: "/dispatch",
          board: "no_supply",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "navigate",
          label: t("opsAssistant.nav.dispatch.assigned", context.locale),
          description: t(
            "opsAssistant.nav.dispatch.assignedDescription",
            context.locale,
          ),
          route: "/dispatch",
          board: "assigned",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "cross_app",
          label: t("opsAssistant.nav.dispatch.adapterRegistry", context.locale),
          description: t(
            "opsAssistant.nav.dispatch.adapterRegistryDescription",
            context.locale,
          ),
          link: {
            targetApp: "platform-admin",
            route: "/adapter-registry",
            resourceType: "adapter_registry",
            resourceId: "",
            openMode: "new_tab",
            label: t(
              "opsAssistant.nav.dispatch.adapterRegistryLink",
              context.locale,
            ),
          },
        },
        {
          kind: "cross_app",
          label: t("opsAssistant.audit.view", context.locale),
          description: getAssistantAuditDescription(context.locale),
          link: {
            targetApp: "platform-admin",
            route: context.selectedEntity
              ? `/audit?resourceType=${encodeURIComponent(context.selectedEntity.kind)}&resourceId=${encodeURIComponent(context.selectedEntity.id)}`
              : "/audit",
            resourceType: context.selectedEntity?.kind ?? "dispatch",
            resourceId: context.selectedEntity?.id ?? "",
            openMode: "new_tab",
            label: t("opsAssistant.audit.view", context.locale),
          },
        },
      ];
    case "/drivers":
      return [
        {
          kind: "navigate",
          label: t("opsAssistant.nav.drivers.suppressed", context.locale),
          description: t(
            "opsAssistant.nav.drivers.suppressedDescription",
            context.locale,
          ),
          route: "/drivers",
          activeTab: "suppression",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
      ];
    case "/vehicles":
      return [
        {
          kind: "navigate",
          label: t("opsAssistant.nav.vehicles.offboarding", context.locale),
          description: t(
            "opsAssistant.nav.vehicles.offboardingDescription",
            context.locale,
          ),
          route: "/vehicles",
          activeTab: "offboarding",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "cross_app",
          label: t("opsAssistant.nav.vehicles.governance", context.locale),
          description: t(
            "opsAssistant.nav.vehicles.governanceDescription",
            context.locale,
          ),
          link: {
            targetApp: "platform-admin",
            route: "/fleet?tab=offboarding",
            resourceType: "fleet_offboarding",
            resourceId: "",
            openMode: "new_tab",
            label: t(
              "opsAssistant.nav.vehicles.governanceLink",
              context.locale,
            ),
          },
        },
      ];
    case "/revenue":
      return [
        {
          kind: "cross_app",
          label: t("opsAssistant.nav.revenue.payments", context.locale),
          description: t(
            "opsAssistant.nav.revenue.paymentsDescription",
            context.locale,
          ),
          link: platformAdminPaymentsLink(
            t("opsAssistant.nav.revenue.payments", context.locale),
          ),
        },
      ];
    case "/contracts":
      return [
        {
          kind: "cross_app",
          label: t("opsAssistant.nav.contracts.governance", context.locale),
          description: t(
            "opsAssistant.nav.contracts.governanceDescription",
            context.locale,
          ),
          link: {
            targetApp: "platform-admin",
            route: "/partners",
            resourceType: "partner_registry",
            resourceId: "",
            openMode: "new_tab",
            label: t(
              "opsAssistant.nav.contracts.governanceLink",
              context.locale,
            ),
          },
        },
      ];
    default:
      return [];
  }
}

function actionKey(action: AssistantAction): string {
  if (action.kind === "cross_app") {
    return `cross:${action.link.targetApp}:${action.link.route}`;
  }
  return `nav:${buildAssistantNavigationHref(action)}`;
}

export function buildAssistantActions(
  context: OpsAssistantContext | null,
): AssistantAction[] {
  if (!context) {
    return [];
  }

  const actions: AssistantAction[] = [
    {
      kind: "navigate",
      label: t("opsAssistant.nav.resumeCurrentView", context.locale),
      description: t(
        "opsAssistant.nav.resumeCurrentViewDescription",
        context.locale,
      ),
      route: context.route,
      ...(context.board ? { board: context.board } : {}),
      ...(context.activeTab ? { activeTab: context.activeTab } : {}),
      ...(context.visibleFilters ? { filters: context.visibleFilters } : {}),
    },
    ...buildRouteSpecificActions(context),
  ];

  const selectionAction = buildSelectionAction(
    context.selectedEntity,
    context.locale,
  );
  if (selectionAction) {
    actions.splice(1, 0, selectionAction);
  }

  const deduped = new Map<string, AssistantAction>();
  actions.forEach((action) => {
    deduped.set(actionKey(action), action);
  });
  return [...deduped.values()].slice(0, 6);
}

export function resolveAssistantActionHref(action: AssistantAction): string {
  if (action.kind === "cross_app") {
    if (action.link.targetApp === "platform-admin") {
      return buildPlatformAdminCrossAppHref(action.link);
    }
    return crossAppHref(action.link);
  }
  return buildAssistantNavigationHref(action);
}
