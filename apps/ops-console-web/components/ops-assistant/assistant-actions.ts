import type { CrossAppResourceLink } from "@drts/contracts";
import {
  crossAppHref,
  platformAdminPaymentsLink,
} from "@/lib/ops-cross-app-links";
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
    label: `Open ${selection.kind}`,
    description: `Jump to the selected ${selection.kind} detail view.`,
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
          label: "Open no-supply board",
          description: "Switch to the dispatch board filtered to no-supply.",
          route: "/dispatch",
          board: "no_supply",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "navigate",
          label: "Open assigned board",
          description: "Review active driver assignments without leaving ops.",
          route: "/dispatch",
          board: "assigned",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "cross_app",
          label: "Open adapter registry",
          description:
            "Investigate forwarded-order adapter ownership in Platform Admin.",
          link: {
            targetApp: "platform-admin",
            route: "/adapter-registry",
            resourceType: "adapter_registry",
            resourceId: "",
            openMode: "new_tab",
            label: "Adapter registry",
          },
        },
      ];
    case "/drivers":
      return [
        {
          kind: "navigate",
          label: "Show suppressed drivers",
          description: "Prefill the drivers list to the suppression view.",
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
          label: "Open offboarding tab",
          description: "Prefill the vehicles page to the offboarding queue.",
          route: "/vehicles",
          activeTab: "offboarding",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "cross_app",
          label: "Open fleet governance",
          description: "Continue vehicle lifecycle actions in Platform Admin.",
          link: {
            targetApp: "platform-admin",
            route: "/fleet?tab=offboarding",
            resourceType: "fleet_offboarding",
            resourceId: "",
            openMode: "new_tab",
            label: "Fleet governance",
          },
        },
      ];
    case "/revenue":
      return [
        {
          kind: "cross_app",
          label: "Open payments queue",
          description: "Continue reconciliation in Platform Admin payments.",
          link: platformAdminPaymentsLink("Payments queue"),
        },
      ];
    case "/contracts":
      return [
        {
          kind: "cross_app",
          label: "Open partner governance",
          description: "Continue contract ownership review in Platform Admin.",
          link: {
            targetApp: "platform-admin",
            route: "/partners",
            resourceType: "partner_registry",
            resourceId: "",
            openMode: "new_tab",
            label: "Partner governance",
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
      label: "Resume current view",
      description:
        "Re-open this route with the current board, tab, and filters.",
      route: context.route,
      ...(context.board ? { board: context.board } : {}),
      ...(context.activeTab ? { activeTab: context.activeTab } : {}),
      ...(context.visibleFilters ? { filters: context.visibleFilters } : {}),
    },
    ...buildRouteSpecificActions(context),
  ];

  const selectionAction = buildSelectionAction(context.selectedEntity);
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
