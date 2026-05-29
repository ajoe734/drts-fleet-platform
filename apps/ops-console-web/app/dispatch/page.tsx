import Link from "next/link";
import type { ReactNode } from "react";
import type {
  AdapterHealthRecord,
  DispatchCandidate,
  DispatchJobRecord,
  DriverTaskRecord,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  OwnedOrderRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import {
  buildDispatchInsights,
  formatCompactNumber,
  formatMinorCurrency,
} from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import { t } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type DispatchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type DispatchView = "forwarded" | "owned";
type DispatchBoard =
  | "ready_queue"
  | "assigned"
  | "exception_hold"
  | "no_eligible_supply"
  | "governance_blocked"
  | "forwarded_mirror";
type OwnedStateFilter =
  | "all"
  | "queued"
  | "broadcasting"
  | "assigned"
  | "no_supply"
  | "override_pending"
  | "exception_hold";
type ForwardedStateFilter =
  | "all"
  | "attention"
  | "broadcasted"
  | "accept_pending"
  | "sync_failed"
  | "manual_fallback"
  | "terminal";

type CanvasTone = "accent" | "danger" | "info" | "neutral" | "success" | "warn";

type OwnedQueueRow = Record<string, unknown> & {
  orderId: string;
  orderNo: string;
  orderCell: ReactNode;
  tenant: string;
  pickup: string;
  dropoff: string;
  routeCell: ReactNode;
  window: string;
  service: string;
  state: string;
  stateCell: ReactNode;
  driver: string;
  vehicle: string;
  driverCell: ReactNode;
  eta: string;
  candidates: string;
  gateLabel: string;
  gateTone: CanvasTone;
  gateCell: ReactNode;
  _selected?: boolean;
};

type ForwardedQueueRow = Record<string, unknown> & {
  mirrorOrderId: string;
  mirrorCell: ReactNode;
  source: string;
  externalOrderId: string;
  pickup: string;
  dropoff: string;
  routeCell: ReactNode;
  window: string;
  state: ForwardedOrderRecord["status"];
  stateCell: ReactNode;
  adapter: string;
  adapterTone: CanvasTone;
  adapterCell: ReactNode;
  mismatchLabel: string;
  mismatchTone: CanvasTone;
  mismatchCell: ReactNode;
  _selected?: boolean;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const DRIVER_TASK_PRIORITY: Record<string, number> = {
  on_trip: 0,
  proof_pending: 1,
  arrived_pickup: 2,
  enroute_pickup: 3,
  accepted: 4,
  pending_acceptance: 5,
  completed: 6,
  cancelled: 7,
  rejected: 8,
};

const OWNED_STATE_PRIORITY: Record<string, number> = {
  override_pending: 0,
  no_supply: 1,
  exception_hold: 2,
  broadcasting: 3,
  queued: 4,
  assigned: 5,
};

const FORWARDED_STATUS_PRIORITY: Record<string, number> = {
  sync_failed: 0,
  accept_pending: 1,
  broadcasted: 2,
  received: 3,
  confirmed_by_platform: 4,
  completed_synced: 5,
  lost_race: 6,
  cancelled_by_platform: 7,
};

const pageStackStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
};

const filterRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginBottom: 16,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)",
  gap: 16,
};

async function resolveOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveView(value: string | undefined): DispatchView {
  return value === "forwarded" ? "forwarded" : "owned";
}

function resolveOwnedFilter(value: string | undefined): OwnedStateFilter {
  switch (value) {
    case "queued":
    case "broadcasting":
    case "assigned":
    case "no_supply":
    case "override_pending":
    case "exception_hold":
      return value;
    default:
      return "all";
  }
}

function resolveForwardedFilter(
  value: string | undefined,
): ForwardedStateFilter {
  switch (value) {
    case "attention":
    case "broadcasted":
    case "accept_pending":
    case "sync_failed":
    case "manual_fallback":
    case "terminal":
      return value;
    default:
      return "all";
  }
}

function buildDispatchHref({
  orderId,
  board,
  state,
  view,
}: {
  view: DispatchView;
  board?: DispatchBoard;
  state?: string;
  orderId?: string;
}) {
  const params = new URLSearchParams();
  if (board) {
    params.set("board", board);
  }
  if (view === "forwarded") {
    params.set("view", "forwarded");
  }
  if (state && state !== "all") {
    params.set("state", state);
  }
  if (orderId) {
    params.set("orderId", orderId);
  }
  const query = params.toString();
  return query ? `/dispatch?${query}` : "/dispatch";
}

function resolveBoardConfig(board: string | undefined): {
  view?: DispatchView;
  state?: string;
  activeTabKey?: string;
} {
  switch (board) {
    case "forwarded_mirror":
      return {
        view: "forwarded",
        state: "attention",
        activeTabKey: "forwarded",
      };
    case "governance_blocked":
      return {
        view: "owned",
        state: "override_pending",
        activeTabKey: "override_pending",
      };
    case "no_eligible_supply":
      return {
        view: "owned",
        state: "no_supply",
        activeTabKey: "no_supply",
      };
    case "exception_hold":
      return {
        view: "owned",
        state: "exception_hold",
        activeTabKey: "owned",
      };
    case "assigned":
      return {
        view: "owned",
        state: "assigned",
        activeTabKey: "owned",
      };
    case "ready_queue":
      return {
        view: "owned",
        state: "queued",
        activeTabKey: "owned",
      };
    default:
      return {};
  }
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatEtaLabel(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) {
    return "—";
  }

  return `${minutes}m`;
}

function formatWindow(order: OwnedOrderRecord, locale: Locale) {
  if (!order.reservationWindowStart || !order.reservationWindowEnd) {
    return locale === "zh" ? "即時" : "realtime";
  }

  return `${formatDateTime(locale, order.reservationWindowStart)} → ${formatDateTime(locale, order.reservationWindowEnd)}`;
}

function getAddressLabel(
  address: OwnedOrderRecord["pickup"] | OwnedOrderRecord["dropoff"],
) {
  return address.addressName ?? address.address;
}

function getTenantLabel(order: OwnedOrderRecord) {
  return (
    order.tenantId ??
    order.partnerEntrySlug ??
    order.partnerId ??
    order.orderSource
  );
}

function getVisibleStateCode(order: OwnedOrderRecord, job?: DispatchJobRecord) {
  if (order.exceptionHold?.overrideRequest && !order.exceptionHold.resolution) {
    return "override_pending";
  }

  if (order.status === "no_supply" || order.status === "delayed_queue") {
    return "no_supply";
  }

  if (order.status === "exception_hold") {
    return "exception_hold";
  }

  if (job?.status === "assigned") {
    return "assigned";
  }

  if (job?.status === "matching") {
    return "broadcasting";
  }

  if (
    job?.status === "queued" ||
    job?.status === "redispatch_required" ||
    job?.status === "reserved"
  ) {
    return "queued";
  }

  if (
    order.status === "ready_for_dispatch" ||
    order.status === "preassigned" ||
    order.status === "recording_pending" ||
    order.status === "redispatch_required"
  ) {
    return "queued";
  }

  return order.status;
}

function getStateTone(stateCode: string): CanvasTone {
  if (stateCode === "assigned" || stateCode === "completed") {
    return "success";
  }

  if (stateCode === "no_supply") {
    return "danger";
  }

  if (
    stateCode === "dispatch_timeout" ||
    stateCode === "exception_hold" ||
    stateCode === "override_pending"
  ) {
    return "warn";
  }

  if (stateCode === "broadcasting" || stateCode === "queued") {
    return "info";
  }

  return "neutral";
}

function pickCurrentTask(tasks: DriverTaskRecord[]) {
  return (
    [...tasks].sort((left, right) => {
      const leftRank = DRIVER_TASK_PRIORITY[left.status] ?? 99;
      const rightRank = DRIVER_TASK_PRIORITY[right.status] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftTimestamp =
        left.completedAt ??
        left.startedAt ??
        left.arrivedPickupAt ??
        left.departedAt ??
        left.acceptedAt ??
        "";
      const rightTimestamp =
        right.completedAt ??
        right.startedAt ??
        right.arrivedPickupAt ??
        right.departedAt ??
        right.acceptedAt ??
        "";

      return rightTimestamp.localeCompare(leftTimestamp);
    })[0] ?? null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getNestedValue(
  record: Record<string, unknown>,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, record);
}

function readSummaryText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidates = [
    value.addressName,
    value.address,
    value.label,
    value.name,
    value.summary,
    value.title,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function readForwardedValue(
  order: ForwardedOrderRecord,
  keys: string[],
): string | null {
  const sources = [order.authoritativeSnapshot, order.payload];
  for (const source of sources) {
    if (!isRecord(source)) {
      continue;
    }

    for (const key of keys) {
      const direct = key.includes(".")
        ? getNestedValue(source, key)
        : source[key];
      const text = readSummaryText(direct);
      if (text) {
        return text;
      }
    }
  }

  return null;
}

function formatForwardedWindow(order: ForwardedOrderRecord, locale: Locale) {
  const start = readForwardedValue(order, [
    "reservationWindowStart",
    "scheduledPickupAt",
    "pickupAt",
    "windowStart",
  ]);
  const end = readForwardedValue(order, [
    "reservationWindowEnd",
    "scheduledDropoffAt",
    "windowEnd",
  ]);

  if (start && !Number.isNaN(Date.parse(start))) {
    if (end && !Number.isNaN(Date.parse(end))) {
      return `${formatDateTime(locale, start)} → ${formatDateTime(locale, end)}`;
    }
    return formatDateTime(locale, start);
  }

  return locale === "zh" ? "即時" : "realtime";
}

function getOwnedGateSummary(order: OwnedOrderRecord): {
  label: string;
  tone: CanvasTone;
} {
  if (order.exceptionHold?.overrideRequest && !order.exceptionHold.resolution) {
    return { label: "override_pending", tone: "warn" };
  }

  const activeGate = (order.complianceGates ?? []).find(
    (gate) => gate.blocking || gate.state !== "clear",
  );
  if (activeGate) {
    return {
      label: activeGate.title || activeGate.gateType,
      tone: activeGate.blocking ? "warn" : "info",
    };
  }

  if (order.noSupplyEscalation && !order.noSupplyEscalation.resolvedAt) {
    return {
      label: order.noSupplyEscalation.escalationAction,
      tone: "warn",
    };
  }

  if (order.dispatchTimeout) {
    return {
      label: order.dispatchTimeout.timeoutReasonCode,
      tone: "warn",
    };
  }

  return { label: "ok", tone: "success" };
}

function needsForwardedAttention(order: ForwardedOrderRecord) {
  return (
    order.status === "accept_pending" ||
    order.status === "sync_failed" ||
    order.manualFallback.required ||
    order.reconciliationJob?.status === "queued"
  );
}

function isForwardedTerminal(order: ForwardedOrderRecord) {
  return (
    order.status === "confirmed_by_platform" ||
    order.status === "completed_synced" ||
    order.status === "lost_race" ||
    order.status === "cancelled_by_platform"
  );
}

function getForwardedStateTone(
  status: ForwardedOrderRecord["status"],
): CanvasTone {
  switch (status) {
    case "sync_failed":
      return "danger";
    case "accept_pending":
      return "warn";
    case "broadcasted":
    case "received":
      return "info";
    case "confirmed_by_platform":
    case "completed_synced":
      return "success";
    case "lost_race":
    case "cancelled_by_platform":
    default:
      return "neutral";
  }
}

function getAdapterTone(status: AdapterHealthRecord["status"]): CanvasTone {
  switch (status) {
    case "down":
      return "danger";
    case "degraded":
      return "warn";
    case "healthy":
    default:
      return "success";
  }
}

function getMismatchSummary(
  order: ForwardedOrderRecord,
  issue: ForwarderReconciliationIssue | undefined,
): { label: string; tone: CanvasTone } {
  const mismatchCount =
    issue?.reconciliationJob.mismatchCount ??
    order.reconciliationJob?.mismatchCount ??
    0;
  if (mismatchCount > 0) {
    return { label: `${mismatchCount} mismatch`, tone: "warn" };
  }

  if (order.manualFallback.required) {
    return {
      label: order.manualFallback.reason ?? "manual_fallback",
      tone: "warn",
    };
  }

  if (order.lastSyncError) {
    return { label: order.lastSyncError.code, tone: "danger" };
  }

  if (order.reconciliationJob?.status === "queued") {
    return { label: "reconciliation", tone: "info" };
  }

  return { label: "ok", tone: "success" };
}

function ownedFilterTone(
  filter: OwnedStateFilter,
  active: OwnedStateFilter,
): CanvasTone {
  if (filter === active) {
    return "accent";
  }

  if (
    filter === "no_supply" ||
    filter === "override_pending" ||
    filter === "exception_hold"
  ) {
    return "warn";
  }

  if (filter === "assigned") {
    return "success";
  }

  if (filter === "queued" || filter === "broadcasting") {
    return "info";
  }

  return "neutral";
}

function forwardedFilterTone(
  filter: ForwardedStateFilter,
  active: ForwardedStateFilter,
): CanvasTone {
  if (filter === active) {
    return "accent";
  }

  if (filter === "sync_failed" || filter === "manual_fallback") {
    return "warn";
  }

  if (filter === "attention" || filter === "accept_pending") {
    return "info";
  }

  return "neutral";
}

function fieldBodyStyle(mono = false) {
  return {
    minHeight: 34,
    padding: "9px 10px",
    borderRadius: 8,
    background: theme.surfaceLo,
    border: `1px solid ${theme.border}`,
    color: theme.text,
    fontSize: mono ? 11.5 : 12.5,
    lineHeight: 1.45,
    fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  } as const;
}

function buildTabLinks(activeTab: string) {
  const items = [
    {
      key: "owned",
      href: buildDispatchHref({ view: "owned" }),
      label: "Owned 自營",
    },
    {
      key: "forwarded",
      href: buildDispatchHref({ view: "forwarded" }),
      label: "Forwarded 外部",
    },
    {
      key: "override_pending",
      href: buildDispatchHref({ view: "owned", state: "override_pending" }),
      label: "Override governance",
    },
    {
      key: "no_supply",
      href: buildDispatchHref({ view: "owned", state: "no_supply" }),
      label: "No-supply",
    },
  ];

  const tabs = items.map((item) => (
    <Link
      key={item.key}
      href={item.href}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {item.label}
    </Link>
  ));

  const activeIndex = items.findIndex((item) => item.key === activeTab);
  return {
    active: tabs[activeIndex] ?? tabs[0],
    tabs,
  };
}

export default async function DispatchPage({
  searchParams,
}: DispatchPageProps) {
  const [client, locale, resolvedSearchParams] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    (searchParams ??
      Promise.resolve(
        {} as Record<string, string | string[] | undefined>,
      )) as Promise<Record<string, string | string[] | undefined>>,
  ]);

  const boardParam = firstParam(resolvedSearchParams?.board);
  const boardConfig = resolveBoardConfig(boardParam);
  const view =
    boardConfig.view ?? resolveView(firstParam(resolvedSearchParams?.view));
  const focusOrderId = firstParam(resolvedSearchParams?.orderId) ?? "";
  const stateParam =
    boardConfig.state ?? firstParam(resolvedSearchParams?.state);

  const activeTabKey =
    boardConfig.activeTabKey ??
    (view === "forwarded"
      ? "forwarded"
      : stateParam === "override_pending"
        ? "override_pending"
        : stateParam === "no_supply"
          ? "no_supply"
          : "owned");
  const { active: activeTab, tabs } = buildTabLinks(activeTabKey);

  if (view === "forwarded") {
    const forwardedFilter = resolveForwardedFilter(stateParam);
    const [forwardedOrders, adapterHealthResponse, reconciliationIssues] =
      await Promise.all([
        resolveOrFallback(
          () => client.listForwarderOrders(),
          [] as ForwardedOrderRecord[],
        ),
        resolveOrFallback(
          () =>
            client.get<{ items: AdapterHealthRecord[] }>(
              "/api/forwarder/adapters/health",
            ),
          { items: [] as AdapterHealthRecord[] },
        ),
        resolveOrFallback(
          () => client.listForwarderReconciliationIssues(),
          [] as ForwarderReconciliationIssue[],
        ),
      ]);

    const adapterHealthByPlatform = new Map(
      (adapterHealthResponse.items ?? []).map((record) => [
        record.platformCode,
        record,
      ]),
    );
    const issueByMirrorId = new Map(
      reconciliationIssues.map((issue) => [issue.mirrorOrderId, issue]),
    );
    const sortedOrders = [...forwardedOrders].sort((left, right) => {
      const leftPriority = FORWARDED_STATUS_PRIORITY[left.status] ?? 99;
      const rightPriority = FORWARDED_STATUS_PRIORITY[right.status] ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });

    const attentionCount = sortedOrders.filter(needsForwardedAttention).length;
    const broadcastedCount = sortedOrders.filter(
      (order) => order.status === "broadcasted",
    ).length;
    const acceptPendingCount = sortedOrders.filter(
      (order) => order.status === "accept_pending",
    ).length;
    const syncFailedCount = sortedOrders.filter(
      (order) => order.status === "sync_failed",
    ).length;
    const manualFallbackCount = sortedOrders.filter(
      (order) => order.manualFallback.required,
    ).length;
    const terminalCount = sortedOrders.filter(isForwardedTerminal).length;
    const activeMirrorCount = sortedOrders.length - terminalCount;
    const degradedAdapters = (adapterHealthResponse.items ?? []).filter(
      (record) => record.status !== "healthy",
    );

    const filteredOrders = sortedOrders.filter((order) => {
      switch (forwardedFilter) {
        case "attention":
          return needsForwardedAttention(order);
        case "broadcasted":
          return order.status === "broadcasted";
        case "accept_pending":
          return order.status === "accept_pending";
        case "sync_failed":
          return order.status === "sync_failed";
        case "manual_fallback":
          return order.manualFallback.required;
        case "terminal":
          return isForwardedTerminal(order);
        case "all":
        default:
          return true;
      }
    });

    const rows: ForwardedQueueRow[] = filteredOrders.map((order) => {
      const issue = issueByMirrorId.get(order.mirrorOrderId);
      const adapterHealth = adapterHealthByPlatform.get(order.platformCode);
      const mismatch = getMismatchSummary(order, issue);

      return {
        mirrorOrderId: order.mirrorOrderId,
        mirrorCell: (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ color: theme.accent, fontWeight: 700 }}>
              {order.mirrorOrderId}
            </span>
            <span style={{ color: theme.textDim, fontSize: 11 }}>
              {order.status}
            </span>
          </div>
        ),
        source: formatOpsCodeLabel(locale, order.platformCode),
        externalOrderId: order.externalOrderId,
        pickup:
          readForwardedValue(order, [
            "pickupSummary",
            "pickupAddress",
            "pickup.addressName",
            "pickup.address",
            "pickup",
          ]) ?? "—",
        dropoff:
          readForwardedValue(order, [
            "dropoffSummary",
            "dropoffAddress",
            "dropoff.addressName",
            "dropoff.address",
            "dropoff",
          ]) ?? "—",
        window: formatForwardedWindow(order, locale),
        state: order.status,
        stateCell: (
          <Pill theme={theme} tone={getForwardedStateTone(order.status)} dot>
            {order.status}
          </Pill>
        ),
        adapter: adapterHealth
          ? `${order.platformCode} · ${adapterHealth.status}`
          : order.platformCode,
        adapterTone: adapterHealth
          ? getAdapterTone(adapterHealth.status)
          : "neutral",
        adapterCell: (
          <Pill
            theme={theme}
            tone={
              adapterHealth ? getAdapterTone(adapterHealth.status) : "neutral"
            }
          >
            {adapterHealth
              ? `${order.platformCode} · ${adapterHealth.status}`
              : order.platformCode}
          </Pill>
        ),
        mismatchLabel: mismatch.label,
        mismatchTone: mismatch.tone,
        mismatchCell: (
          <Pill
            theme={theme}
            tone={mismatch.tone}
            dot={mismatch.tone !== "success"}
          >
            {mismatch.label}
          </Pill>
        ),
        routeCell: (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              whiteSpace: "normal",
            }}
          >
            <span>
              {readForwardedValue(order, [
                "pickupSummary",
                "pickupAddress",
                "pickup.addressName",
                "pickup.address",
                "pickup",
              ]) ?? "—"}
            </span>
            <span style={{ color: theme.textDim, fontSize: 11 }}>
              ↓{" "}
              {readForwardedValue(order, [
                "dropoffSummary",
                "dropoffAddress",
                "dropoff.addressName",
                "dropoff.address",
                "dropoff",
              ]) ?? "—"}
            </span>
          </div>
        ),
        _selected: focusOrderId === order.mirrorOrderId,
      };
    });

    const forwardedColumns: CanvasTableColumn<ForwardedQueueRow>[] = [
      {
        h: "MIRROR ID",
        k: "mirrorCell",
        w: 132,
        mono: true,
      },
      { h: "SOURCE", k: "source", w: 144 },
      { h: "EXTERNAL", k: "externalOrderId", w: 156, mono: true },
      {
        h: "PICKUP → DROP",
        k: "routeCell",
        w: 380,
      },
      { h: "WIN", k: "window", w: 132, mono: true },
      {
        h: "STATE",
        k: "stateCell",
        w: 172,
      },
      {
        h: "ADAPTER",
        k: "adapterCell",
        w: 150,
      },
      {
        h: "MISMATCH",
        k: "mismatchCell",
        w: 170,
      },
    ];

    const bannerAdapter = degradedAdapters[0];
    const banner = bannerAdapter ? (
      <Banner
        theme={theme}
        tone={bannerAdapter.status === "down" ? "danger" : "warn"}
        icon="warn"
        title={`${formatOpsCodeLabel(locale, bannerAdapter.platformCode)} adapter ${bannerAdapter.status}`}
        body={
          bannerAdapter.lastError
            ? bannerAdapter.lastError
            : t("dispatch.forwarded.roleBoundaryText", locale)
        }
        actions={
          <Btn theme={theme} variant="secondary" icon="adapters">
            {locale === "zh" ? "查看 adapter" : "Inspect adapter"}
          </Btn>
        }
      />
    ) : attentionCount > 0 ? (
      <Banner
        theme={theme}
        tone="info"
        icon="warn"
        title={t("dispatch.page.forwardedHeadline", locale)}
        body={t("dispatch.page.forwardedSummary", locale, {
          count: syncFailedCount,
        })}
        actions={
          <Btn theme={theme} variant="secondary" icon="warn">
            {t("dispatch.forwarded.action.completeReconciliation", locale)}
          </Btn>
        }
      />
    ) : null;

    return (
      <>
        <PageHeader
          theme={theme}
          title={t("dispatch.title", locale)}
          subtitle={t("dispatch.forwarded.subtitle", locale)}
          tabs={tabs}
          activeTab={activeTab}
          actions={
            <>
              <Btn theme={theme} icon="filter">
                {locale === "zh" ? "來源" : "Source"}
              </Btn>
              <Btn theme={theme} variant="primary" icon="warn">
                {t("dispatch.forwarded.action.completeReconciliation", locale)}
              </Btn>
            </>
          }
        />
        <div style={pageStackStyle}>
          {banner}
          <div style={filterRowStyle}>
            {[
              {
                filter: "all" as const,
                label: `${t("dispatch.workflow.filterAll", locale)} ${sortedOrders.length}`,
              },
              {
                filter: "attention" as const,
                label: `attention ${attentionCount}`,
              },
              {
                filter: "broadcasted" as const,
                label: `broadcasted ${broadcastedCount}`,
              },
              {
                filter: "accept_pending" as const,
                label: `accept_pending ${acceptPendingCount}`,
              },
              {
                filter: "sync_failed" as const,
                label: `sync_failed ${syncFailedCount}`,
              },
              {
                filter: "manual_fallback" as const,
                label: `manual_fallback ${manualFallbackCount}`,
              },
              {
                filter: "terminal" as const,
                label: `terminal ${terminalCount}`,
              },
            ].map((item) => (
              <Link
                key={item.filter}
                href={buildDispatchHref({
                  view: "forwarded",
                  state: item.filter,
                })}
                style={{ textDecoration: "none" }}
              >
                <Pill
                  theme={theme}
                  tone={forwardedFilterTone(item.filter, forwardedFilter)}
                  dot={item.filter !== "all"}
                >
                  {item.label}
                </Pill>
              </Link>
            ))}
          </div>

          <div style={{ fontSize: 12, color: theme.textMuted }}>
            {t("dispatch.workflow.showing", locale, {
              visible: rows.length,
              total: sortedOrders.length,
            })}
          </div>

          <Card theme={theme} padding={0}>
            <Table theme={theme} columns={forwardedColumns} rows={rows} />
          </Card>

          <Card
            theme={theme}
            title={t("dispatch.forwarded.action.title", locale)}
            subtitle={t("dispatch.forwarded.action.subtitle", locale)}
          >
            <div style={kpiGridStyle}>
              <KPI
                theme={theme}
                label={t("dispatch.forwarded.kpi.active", locale)}
                value={formatCompactNumber(activeMirrorCount)}
                delta={`${formatCompactNumber(attentionCount)} attention`}
                deltaTone={attentionCount > 0 ? "down" : "neutral"}
                sub={t("dispatch.page.forwardedAuthority", locale)}
              />
              <KPI
                theme={theme}
                label={t("dispatch.forwarded.kpi.broadcasted", locale)}
                value={formatCompactNumber(broadcastedCount)}
                sub={locale === "zh" ? "offer 已送出" : "offers broadcasted"}
              />
              <KPI
                theme={theme}
                label={t("dispatch.forwarded.kpi.awaitingPlatform", locale)}
                value={formatCompactNumber(acceptPendingCount)}
                delta={
                  syncFailedCount > 0
                    ? `${syncFailedCount} sync_failed`
                    : undefined
                }
                deltaTone={syncFailedCount > 0 ? "down" : "neutral"}
                sub={t("dispatch.forwarded.roleBoundaryText", locale)}
              />
              <KPI
                theme={theme}
                label={t("dispatch.forwarded.kpi.reconciliation", locale)}
                value={formatCompactNumber(reconciliationIssues.length)}
                sub={t(
                  "dispatch.forwarded.action.completeReconciliation",
                  locale,
                )}
              />
            </div>

            <div style={summaryGridStyle}>
              <DL
                theme={theme}
                cols={2}
                items={[
                  {
                    k: locale === "zh" ? "目前檢視" : "Current view",
                    v: "Forwarded 外部",
                    mono: true,
                  },
                  {
                    k: locale === "zh" ? "可見鏡像" : "Visible mirrors",
                    v: `${rows.length} / ${sortedOrders.length}`,
                    mono: true,
                  },
                  {
                    k: locale === "zh" ? "adapter health" : "Adapter health",
                    v:
                      degradedAdapters.length > 0
                        ? `${degradedAdapters.length} degraded`
                        : locale === "zh"
                          ? "全部 healthy"
                          : "all healthy",
                    mono: true,
                  },
                  {
                    k: locale === "zh" ? "治理佇列" : "Governance queue",
                    v: `${manualFallbackCount} manual_fallback · ${reconciliationIssues.length} recon`,
                    mono: true,
                  },
                ]}
              />

              <div>
                <Field
                  theme={theme}
                  label={t("dispatch.roleBoundary", locale)}
                  hint={t("dispatch.page.forwardedAuthority", locale)}
                >
                  <div style={fieldBodyStyle()}>
                    {t("dispatch.forwarded.roleBoundaryText", locale)}
                  </div>
                </Field>

                <Field
                  theme={theme}
                  label={locale === "zh" ? "mismatch scope" : "Mismatch scope"}
                  hint={t("dispatch.page.forwardedSummary", locale, {
                    count: syncFailedCount,
                  })}
                >
                  <div style={fieldBodyStyle(true)}>
                    {degradedAdapters[0]
                      ? `${degradedAdapters[0].platformCode} · ${degradedAdapters[0].status}`
                      : locale === "zh"
                        ? "mirror + reconciliation only"
                        : "mirror + reconciliation only"}
                  </div>
                </Field>
              </div>
            </div>
          </Card>
        </div>
      </>
    );
  }

  const ownedFilter = resolveOwnedFilter(stateParam);
  const [orders, dispatchJobs, forwarderSyncErrors, driverTasks] =
    await Promise.all([
      resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
      resolveOrFallback(
        () => client.listDispatchJobs(),
        [] as DispatchJobRecord[],
      ),
      resolveOrFallback(
        () => client.listForwarderSyncErrors(),
        [] as ForwardedOrderRecord[],
      ),
      resolveOrFallback(
        () => client.listDriverTasks(),
        [] as DriverTaskRecord[],
      ),
    ]);

  const insights = buildDispatchInsights(orders, dispatchJobs);
  const jobByOrderId = new Map(dispatchJobs.map((job) => [job.orderId, job]));
  const tasksByOrderId = new Map<string, DriverTaskRecord[]>();
  for (const task of driverTasks) {
    const existing = tasksByOrderId.get(task.orderId);
    if (existing) {
      existing.push(task);
    } else {
      tasksByOrderId.set(task.orderId, [task]);
    }
  }

  const sortedOrders = [...orders].sort((left, right) => {
    const leftState = getVisibleStateCode(left, jobByOrderId.get(left.orderId));
    const rightState = getVisibleStateCode(
      right,
      jobByOrderId.get(right.orderId),
    );
    const leftPriority = OWNED_STATE_PRIORITY[leftState] ?? 99;
    const rightPriority = OWNED_STATE_PRIORITY[rightState] ?? 99;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });

  const ownedCounts = sortedOrders.reduce(
    (counts, order) => {
      const state = getVisibleStateCode(order, jobByOrderId.get(order.orderId));
      counts.all += 1;
      if (state in counts) {
        counts[state as keyof typeof counts] += 1;
      }
      return counts;
    },
    {
      all: 0,
      queued: 0,
      broadcasting: 0,
      assigned: 0,
      no_supply: 0,
      override_pending: 0,
      exception_hold: 0,
    },
  );

  const filteredOrders = sortedOrders.filter((order) => {
    if (ownedFilter === "all") {
      return true;
    }
    return (
      getVisibleStateCode(order, jobByOrderId.get(order.orderId)) ===
      ownedFilter
    );
  });

  const visibleDispatchJobIds = Array.from(
    new Set(
      filteredOrders
        .map((order) => jobByOrderId.get(order.orderId)?.dispatchJobId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const candidatesByJobId = new Map<string, DispatchCandidate[]>(
    await Promise.all(
      visibleDispatchJobIds.map(
        async (
          dispatchJobId,
        ): Promise<readonly [string, DispatchCandidate[]]> =>
          [
            dispatchJobId,
            await resolveOrFallback(
              () => client.listDispatchCandidates(dispatchJobId),
              [] as DispatchCandidate[],
            ),
          ] as const,
      ),
    ),
  );

  const rows: OwnedQueueRow[] = filteredOrders.map((order) => {
    const job = jobByOrderId.get(order.orderId);
    const state = getVisibleStateCode(order, job);
    const task = pickCurrentTask(tasksByOrderId.get(order.orderId) ?? []);
    const gate = getOwnedGateSummary(order);
    const candidates = job
      ? (candidatesByJobId.get(job.dispatchJobId) ?? [])
      : [];

    return {
      orderId: order.orderId,
      orderNo: order.orderNo,
      orderCell: (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={`/dispatch/${encodeURIComponent(order.orderId)}`}
            style={{
              color: theme.accent,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {order.orderNo}
          </Link>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {order.orderId}
          </span>
        </div>
      ),
      tenant: getTenantLabel(order),
      pickup: getAddressLabel(order.pickup),
      dropoff: getAddressLabel(order.dropoff),
      routeCell: (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            whiteSpace: "normal",
          }}
        >
          <span>{getAddressLabel(order.pickup)}</span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            ↓ {getAddressLabel(order.dropoff)}
          </span>
        </div>
      ),
      window: formatWindow(order, locale),
      service: order.serviceBucket,
      state,
      stateCell: (
        <Pill theme={theme} tone={getStateTone(state)} dot>
          {state}
        </Pill>
      ),
      driver: task?.driverId ?? "—",
      vehicle: task?.vehicleId ?? "—",
      driverCell: (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span>{task?.driverId ?? "—"}</span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {task?.vehicleId ?? "—"}
          </span>
        </div>
      ),
      eta: formatEtaLabel(
        job?.latestEtaMinutes ?? order.etaSnapshot?.etaMinutes,
      ),
      candidates: String(candidates.length),
      gateLabel: gate.label,
      gateTone: gate.tone,
      gateCell: (
        <Pill theme={theme} tone={gate.tone} dot={gate.tone !== "success"}>
          {gate.label}
        </Pill>
      ),
      _selected: focusOrderId === order.orderId,
    };
  });

  const ownedColumns: CanvasTableColumn<OwnedQueueRow>[] = [
    {
      h: "ORDER",
      k: "orderCell",
      w: 132,
      mono: true,
    },
    { h: "TENANT", k: "tenant", w: 148, mono: true },
    {
      h: "PICKUP → DROP",
      k: "routeCell",
      w: 380,
    },
    { h: "WIN", k: "window", w: 132, mono: true },
    { h: "SVC", k: "service", w: 124, mono: true },
    {
      h: "STATE",
      k: "stateCell",
      w: 160,
    },
    {
      h: "DRIVER",
      k: "driverCell",
      w: 126,
      mono: true,
    },
    { h: "ETA", k: "eta", w: 76, mono: true },
    { h: "CAND", k: "candidates", w: 64, mono: true, align: "right" },
    {
      h: "GATE",
      k: "gateCell",
      w: 176,
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={t("dispatch.title", locale)}
        subtitle={t("dispatch.subtitle", locale)}
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <>
            <Btn theme={theme} icon="filter">
              {locale === "zh" ? "服務 bucket" : "Service bucket"}
            </Btn>
            <Btn theme={theme} variant="secondary" icon="arrow">
              {t("common.refresh", locale)}
            </Btn>
          </>
        }
      />

      <div style={pageStackStyle}>
        <div style={filterRowStyle}>
          {[
            {
              filter: "all" as const,
              label: `${t("dispatch.workflow.filterAll", locale)} ${ownedCounts.all}`,
            },
            {
              filter: "queued" as const,
              label: `queued ${ownedCounts.queued}`,
            },
            {
              filter: "broadcasting" as const,
              label: `broadcasting ${ownedCounts.broadcasting}`,
            },
            {
              filter: "assigned" as const,
              label: `assigned ${ownedCounts.assigned}`,
            },
            {
              filter: "no_supply" as const,
              label: `no_supply ${ownedCounts.no_supply}`,
            },
            {
              filter: "override_pending" as const,
              label: `override_pending ${ownedCounts.override_pending}`,
            },
            {
              filter: "exception_hold" as const,
              label: `exception_hold ${ownedCounts.exception_hold}`,
            },
          ].map((item) => (
            <Link
              key={item.filter}
              href={buildDispatchHref({ view: "owned", state: item.filter })}
              style={{ textDecoration: "none" }}
            >
              <Pill
                theme={theme}
                tone={ownedFilterTone(item.filter, ownedFilter)}
                dot={item.filter !== "all"}
              >
                {item.label}
              </Pill>
            </Link>
          ))}
        </div>

        <div style={{ fontSize: 12, color: theme.textMuted }}>
          {t("dispatch.workflow.showing", locale, {
            visible: rows.length,
            total: sortedOrders.length,
          })}
        </div>

        <Card theme={theme} padding={0}>
          <Table theme={theme} columns={ownedColumns} rows={rows} />
        </Card>

        <Card
          theme={theme}
          title={t("dispatch.workflow.boardTitle", locale)}
          subtitle={t("dispatch.workflow.boardSubtitle", locale)}
        >
          <div style={kpiGridStyle}>
            <KPI
              theme={theme}
              label={t("dispatch.queueDepth", locale)}
              value={formatCompactNumber(insights.queueDepth)}
              delta={
                insights.averageEtaMinutes
                  ? `${insights.averageEtaMinutes}m`
                  : undefined
              }
              deltaTone="neutral"
              sub={
                insights.averageEtaMinutes
                  ? t("dispatch.queueDepthSub", locale, {
                      eta: insights.averageEtaMinutes,
                    })
                  : t("dispatch.queueDepthSubPending", locale)
              }
            />
            <KPI
              theme={theme}
              label={t("dispatch.activeOrders", locale)}
              value={formatCompactNumber(insights.activeOrders)}
              sub={t("dispatch.activeOrdersSub", locale)}
            />
            <KPI
              theme={theme}
              label={t("dispatch.needsRedispatch", locale)}
              value={formatCompactNumber(insights.redispatchOrders)}
              delta={`${insights.exceptionOrders} exception`}
              deltaTone={insights.exceptionOrders > 0 ? "down" : "neutral"}
              sub={t("dispatch.needsRedispatchSub", locale, {
                count: insights.exceptionOrders,
              })}
            />
            <KPI
              theme={theme}
              label={t("dispatch.queuedRevenue", locale)}
              value={formatMinorCurrency(insights.queuedRevenueMinor)}
              delta={
                forwarderSyncErrors.length > 0
                  ? `${forwarderSyncErrors.length} mirrored`
                  : undefined
              }
              deltaTone={forwarderSyncErrors.length > 0 ? "down" : "neutral"}
              sub={t("dispatch.queuedRevenueSub", locale)}
            />
          </div>

          <div style={summaryGridStyle}>
            <DL
              theme={theme}
              cols={2}
              items={[
                {
                  k: locale === "zh" ? "目前檢視" : "Current view",
                  v:
                    ownedFilter === "override_pending"
                      ? "Override governance"
                      : ownedFilter === "no_supply"
                        ? "No-supply"
                        : "Owned 自營",
                  mono: true,
                },
                {
                  k: locale === "zh" ? "可見訂單" : "Visible orders",
                  v: `${rows.length} / ${sortedOrders.length}`,
                  mono: true,
                },
                {
                  k: locale === "zh" ? "queue mix" : "Queue mix",
                  v: `${ownedCounts.queued} queued · ${ownedCounts.broadcasting} broadcasting`,
                  mono: true,
                },
                {
                  k: locale === "zh" ? "例外桌" : "Exception desk",
                  v: `${ownedCounts.no_supply} no_supply · ${ownedCounts.override_pending} override_pending`,
                  mono: true,
                },
              ]}
            />

            <div>
              <Field
                theme={theme}
                label={t("dispatch.roleBoundary", locale)}
                hint={t("dispatch.page.ownedAuthority", locale)}
              >
                <div style={fieldBodyStyle()}>
                  {t("dispatch.roleBoundaryText", locale)}
                </div>
              </Field>

              <Field
                theme={theme}
                label={locale === "zh" ? "queue focus" : "Queue focus"}
                hint={t("dispatch.page.ownedSummary", locale, {
                  count: ownedCounts.exception_hold + ownedCounts.no_supply,
                })}
              >
                <div style={fieldBodyStyle(true)}>
                  {focusOrderId ||
                    `${ownedFilter} · ${formatCompactNumber(rows.length)}`}
                </div>
              </Field>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
