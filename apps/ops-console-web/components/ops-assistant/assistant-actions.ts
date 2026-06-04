import type { CrossAppResourceLink } from "@drts/contracts";
import {
  crossAppHref,
  platformAdminPaymentsLink,
} from "@/lib/ops-cross-app-links";
import { t } from "@/lib/translations";
import type {
  AssistantSelection,
  OpsAssistantContext,
} from "./context-envelope";

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
    label: t("assistant.action.selection.label", locale, {
      kind: selection.kind,
    }),
    description: t("assistant.action.selection.description", locale, {
      kind: selection.kind,
    }),
    route: href,
  };
}

function buildRouteSpecificActions(
  context: OpsAssistantContext,
): AssistantAction[] {
  const locale = context.locale;

  switch (context.route) {
    case "/dispatch":
      return [
        {
          kind: "navigate",
          label: t("assistant.action.dispatch.noSupply.label", locale),
          description: t(
            "assistant.action.dispatch.noSupply.description",
            locale,
          ),
          route: "/dispatch",
          board: "no_supply",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "navigate",
          label: t("assistant.action.dispatch.assigned.label", locale),
          description: t(
            "assistant.action.dispatch.assigned.description",
            locale,
          ),
          route: "/dispatch",
          board: "assigned",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "cross_app",
          label: t("assistant.action.dispatch.adapterRegistry.label", locale),
          description: t(
            "assistant.action.dispatch.adapterRegistry.description",
            locale,
          ),
          link: {
            targetApp: "platform-admin",
            route: "/adapter-registry",
            resourceType: "adapter_registry",
            resourceId: "",
            openMode: "new_tab",
            label: t("assistant.action.dispatch.adapterRegistry.label", locale),
          },
        },
      ];
    case "/drivers":
      return [
        {
          kind: "navigate",
          label: t("assistant.action.drivers.suppressed.label", locale),
          description: t(
            "assistant.action.drivers.suppressed.description",
            locale,
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
          label: t("assistant.action.vehicles.offboarding.label", locale),
          description: t(
            "assistant.action.vehicles.offboarding.description",
            locale,
          ),
          route: "/vehicles",
          activeTab: "offboarding",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "cross_app",
          label: t("assistant.action.vehicles.governance.label", locale),
          description: t(
            "assistant.action.vehicles.governance.description",
            locale,
          ),
          link: {
            targetApp: "platform-admin",
            route: "/fleet?tab=offboarding",
            resourceType: "fleet_offboarding",
            resourceId: "",
            openMode: "new_tab",
            label: t("assistant.action.vehicles.governance.label", locale),
          },
        },
      ];
    case "/revenue":
      return [
        {
          kind: "cross_app",
          label: t("assistant.action.revenue.payments.label", locale),
          description: t(
            "assistant.action.revenue.payments.description",
            locale,
          ),
          link: platformAdminPaymentsLink(
            t("assistant.action.revenue.payments.label", locale),
          ),
        },
      ];
    case "/contracts":
      return [
        {
          kind: "cross_app",
          label: t("assistant.action.contracts.governance.label", locale),
          description: t(
            "assistant.action.contracts.governance.description",
            locale,
          ),
          link: {
            targetApp: "platform-admin",
            route: "/partners",
            resourceType: "partner_registry",
            resourceId: "",
            openMode: "new_tab",
            label: t("assistant.action.contracts.governance.label", locale),
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
      label: t("assistant.action.resume.label", context.locale),
      description: t("assistant.action.resume.description", context.locale),
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
  return [...deduped.values()].slice(0, 4);
}

export function resolveAssistantActionHref(action: AssistantAction): string {
  return action.kind === "cross_app"
    ? crossAppHref(action.link)
    : buildAssistantNavigationHref(action);
}
