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

function copy(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function selectionKindLabel(
  locale: "en" | "zh",
  kind: AssistantSelection["kind"],
) {
  switch (kind) {
    case "order":
      return copy(locale, "order", "訂單");
    case "driver":
      return copy(locale, "driver", "司機");
    case "vehicle":
      return copy(locale, "vehicle", "車輛");
    case "complaint":
      return copy(locale, "complaint", "客訴");
    case "incident":
      return copy(locale, "incident", "事故");
    case "contract":
      return copy(locale, "contract", "合約");
    default:
      return kind;
  }
}

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
  locale: "en" | "zh",
  selection: AssistantSelection | undefined,
): AssistantNavigationAction | null {
  if (!selection) {
    return null;
  }

  const href = buildSelectedEntityHref(selection);
  if (!href) {
    return null;
  }

  const selectionLabel = selectionKindLabel(locale, selection.kind);

  return {
    kind: "navigate",
    label: copy(locale, `Open ${selection.kind}`, `開啟${selectionLabel}明細`),
    description: copy(
      locale,
      `Jump to the selected ${selection.kind} detail view.`,
      `前往目前選取的${selectionLabel}明細頁。`,
    ),
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
          label: copy(locale, "Open no-supply board", "開啟無供給看板"),
          description: copy(
            locale,
            "Switch to the dispatch board filtered to no-supply.",
            "切換到已篩選無供給案件的派遣看板。",
          ),
          route: "/dispatch",
          board: "no_supply",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "navigate",
          label: copy(locale, "Open assigned board", "開啟已指派看板"),
          description: copy(
            locale,
            "Review active driver assignments without leaving ops.",
            "不離開營運後台即可檢視目前進行中的司機指派。",
          ),
          route: "/dispatch",
          board: "assigned",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "cross_app",
          label: copy(locale, "Open adapter registry", "開啟介接器名冊"),
          description: copy(
            locale,
            "Investigate forwarded-order adapter ownership in Platform Admin.",
            "前往平台管理後台，查看轉派訂單介接器的歸屬資訊。",
          ),
          link: {
            targetApp: "platform-admin",
            route: "/adapter-registry",
            resourceType: "adapter_registry",
            resourceId: "",
            openMode: "new_tab",
            label: copy(locale, "Adapter registry", "介接器名冊"),
          },
        },
      ];
    case "/drivers":
      return [
        {
          kind: "navigate",
          label: copy(locale, "Show suppressed drivers", "顯示受抑制司機"),
          description: copy(
            locale,
            "Prefill the drivers list to the suppression view.",
            "直接切到司機清單的派遣抑制檢視。",
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
          label: copy(locale, "Open offboarding tab", "開啟退場分頁"),
          description: copy(
            locale,
            "Prefill the vehicles page to the offboarding queue.",
            "直接切到車輛頁面的退場佇列。",
          ),
          route: "/vehicles",
          activeTab: "offboarding",
          ...(context.visibleFilters
            ? { filters: context.visibleFilters }
            : {}),
        },
        {
          kind: "cross_app",
          label: copy(locale, "Open fleet governance", "開啟車隊治理"),
          description: copy(
            locale,
            "Continue vehicle lifecycle actions in Platform Admin.",
            "前往平台管理後台，繼續處理車輛生命週期動作。",
          ),
          link: {
            targetApp: "platform-admin",
            route: "/fleet?tab=offboarding",
            resourceType: "fleet_offboarding",
            resourceId: "",
            openMode: "new_tab",
            label: copy(locale, "Fleet governance", "車隊治理"),
          },
        },
      ];
    case "/revenue":
      return [
        {
          kind: "cross_app",
          label: copy(locale, "Open payments queue", "開啟付款佇列"),
          description: copy(
            locale,
            "Continue reconciliation in Platform Admin payments.",
            "前往平台管理後台帳務頁，繼續處理對帳。",
          ),
          link: platformAdminPaymentsLink(
            copy(locale, "Payments queue", "付款佇列"),
          ),
        },
      ];
    case "/contracts":
      return [
        {
          kind: "cross_app",
          label: copy(locale, "Open partner governance", "開啟夥伴治理"),
          description: copy(
            locale,
            "Continue contract ownership review in Platform Admin.",
            "前往平台管理後台，繼續處理合約歸屬審查。",
          ),
          link: {
            targetApp: "platform-admin",
            route: "/partners",
            resourceType: "partner_registry",
            resourceId: "",
            openMode: "new_tab",
            label: copy(locale, "Partner governance", "夥伴治理"),
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

  const locale = context.locale;

  const actions: AssistantAction[] = [
    {
      kind: "navigate",
      label: copy(locale, "Resume current view", "回到目前檢視"),
      description: copy(
        locale,
        "Re-open this route with the current board, tab, and filters.",
        "以目前的看板、分頁與篩選條件重新開啟此路由。",
      ),
      route: context.route,
      ...(context.board ? { board: context.board } : {}),
      ...(context.activeTab ? { activeTab: context.activeTab } : {}),
      ...(context.visibleFilters ? { filters: context.visibleFilters } : {}),
    },
    ...buildRouteSpecificActions(context),
  ];

  const selectionAction = buildSelectionAction(locale, context.selectedEntity);
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
