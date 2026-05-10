"use client";

import Link from "next/link";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import type {
  AdapterHealthRecord,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  ForwardedOrderStatus,
} from "@drts/contracts";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { Badge, Card, CardBody, CardHeader } from "@drts/ui-web";
import {
  getForwardedRowStyle,
  needsForwardedAttention,
} from "./dispatch-view-model";

type ForwardedFilter =
  | "all"
  | "attention"
  | "broadcasted"
  | "accept_pending"
  | "sync_failed"
  | "terminal";
type ActionMode = "sync" | "fallback" | "error" | "reconcile";
type BadgeVariant = "green" | "red" | "yellow" | "blue" | "gray" | "orange";

type ForwardedOrderBoardProps = {
  initialOrders: ForwardedOrderRecord[];
  initialAdapterHealth: AdapterHealthRecord[];
  initialReconciliationIssues: ForwarderReconciliationIssue[];
  focusOrderId?: string;
};

type SyncDraft = {
  nativeStatus: string;
  payloadJson: string;
};

type ManualFallbackDraft = {
  reason: string;
  requestedBy: string;
  notes: string;
};

type SyncErrorDraft = {
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  nativeStatus: string;
  manualFallbackReason: string;
};

type ReconciliationDraft = {
  nativeStatus: string;
  mismatchCount: string;
  notes: string;
  payloadJson: string;
};

const FILTER_ORDER: ForwardedFilter[] = [
  "all",
  "attention",
  "broadcasted",
  "accept_pending",
  "sync_failed",
  "terminal",
];
const COMMON_NATIVE_STATUS_OPTIONS = [
  "offer_pending",
  "accept_pending",
  "on_trip",
  "taken",
  "cancelled",
];

function sortOrders(orders: ForwardedOrderRecord[]) {
  return [...orders].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function sortAdapterHealth(adapterHealth: AdapterHealthRecord[]) {
  return [...adapterHealth].sort((left, right) =>
    left.platformCode.localeCompare(right.platformCode),
  );
}

function sortReconciliationIssues(issues: ForwarderReconciliationIssue[]) {
  return [...issues].sort((left, right) =>
    right.reconciliationJob.createdAt.localeCompare(
      left.reconciliationJob.createdAt,
    ),
  );
}

function isTerminalStatus(status: ForwardedOrderStatus) {
  return (
    status === "confirmed_by_platform" ||
    status === "lost_race" ||
    status === "cancelled_by_platform"
  );
}

function pickInitialOrderId(
  orders: ForwardedOrderRecord[],
  preferredOrderId?: string,
) {
  if (
    preferredOrderId &&
    orders.some((order) => order.mirrorOrderId === preferredOrderId)
  ) {
    return preferredOrderId;
  }
  const attentionOrder = orders.find(needsForwardedAttention);
  return attentionOrder?.mirrorOrderId ?? orders[0]?.mirrorOrderId ?? null;
}

function parseJsonRecord(
  value: string,
): { ok: true; value?: Record<string, unknown> } | { ok: false } {
  if (!value.trim()) {
    return { ok: true };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { ok: false };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

function getPlatformDisplayName(platformCode: string) {
  return PLATFORM_CODE_REGISTRY[
    platformCode as keyof typeof PLATFORM_CODE_REGISTRY
  ]?.displayName;
}

function getPlatformShortCode(platformCode: string) {
  const compact = platformCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return compact.slice(0, 4) || platformCode.slice(0, 4).toUpperCase();
}

function getPlatformSwatch(platformCode: string): {
  background: string;
  color: string;
} {
  switch (platformCode) {
    case "grab_taiwan":
      return { background: "#dcfce7", color: "#15803d" };
    case "uber":
      return { background: "#e2e8f0", color: "#0f172a" };
    case "grab":
      return { background: "#ecfccb", color: "#3f6212" };
    case "line-taxi":
      return { background: "#dbeafe", color: "#1d4ed8" };
    default:
      return { background: "#f1f5f9", color: "#334155" };
  }
}

function getForwardedStatusVariant(status: ForwardedOrderStatus): BadgeVariant {
  switch (status) {
    case "received":
      return "gray";
    case "broadcasted":
      return "blue";
    case "accept_pending":
      return "yellow";
    case "confirmed_by_platform":
      return "green";
    case "lost_race":
      return "gray";
    case "cancelled_by_platform":
      return "gray";
    case "sync_failed":
      return "red";
  }
}

function getAdapterHealthVariant(
  status: AdapterHealthRecord["status"],
): BadgeVariant {
  switch (status) {
    case "healthy":
      return "green";
    case "degraded":
      return "yellow";
    case "down":
      return "red";
  }
}

function matchesFilter(order: ForwardedOrderRecord, filter: ForwardedFilter) {
  switch (filter) {
    case "all":
      return true;
    case "attention":
      return needsForwardedAttention(order);
    case "broadcasted":
      return order.status === "broadcasted";
    case "accept_pending":
      return order.status === "accept_pending";
    case "sync_failed":
      return order.status === "sync_failed";
    case "terminal":
      return isTerminalStatus(order.status);
  }
}

function formatRelativeTime(locale: "en" | "zh", iso: string | null) {
  if (!iso) {
    return locale === "zh" ? "未知" : "Unknown";
  }

  const millis = Date.parse(iso);
  if (!Number.isFinite(millis)) {
    return iso;
  }

  const diffSeconds = Math.round((millis - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(
    locale === "zh" ? "zh-TW" : "en-US",
    { numeric: "auto" },
  );

  if (absSeconds < 60) {
    return formatter.format(diffSeconds, "second");
  }
  if (absSeconds < 3600) {
    return formatter.format(Math.round(diffSeconds / 60), "minute");
  }
  if (absSeconds < 86400) {
    return formatter.format(Math.round(diffSeconds / 3600), "hour");
  }
  return formatter.format(Math.round(diffSeconds / 86400), "day");
}

function formatDateTime(locale: "en" | "zh", iso: string | null) {
  if (!iso) {
    return locale === "zh" ? " - " : "-";
  }

  return new Date(iso).toLocaleString(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function buildFilterCount(
  orders: ForwardedOrderRecord[],
  filter: ForwardedFilter,
) {
  return orders.filter((order) => matchesFilter(order, filter)).length;
}

function buttonStyle({
  primary = false,
  warning = false,
  danger = false,
  disabled = false,
  full = false,
}: {
  primary?: boolean;
  warning?: boolean;
  danger?: boolean;
  disabled?: boolean;
  full?: boolean;
}): CSSProperties {
  let background = "#ffffff";
  let border = "#cbd5e1";
  let color = "#334155";

  if (primary) {
    background = "#0f172a";
    border = "#0f172a";
    color = "#ffffff";
  } else if (warning) {
    background = "#fff7ed";
    border = "#fdba74";
    color = "#9a3412";
  } else if (danger) {
    background = "#fff1f2";
    border = "#fda4af";
    color = "#be123c";
  }

  if (disabled) {
    background = "#e2e8f0";
    border = "#e2e8f0";
    color = "#94a3b8";
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    width: full ? "100%" : undefined,
    borderRadius: "10px",
    border: `1px solid ${border}`,
    background,
    color,
    padding: "10px 12px",
    fontSize: "13px",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function fieldStyle(): CSSProperties {
  return {
    width: "100%",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    padding: "10px 12px",
    fontSize: "13px",
    color: "#0f172a",
    boxSizing: "border-box",
    background: "#ffffff",
  };
}

function PanelField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "grid",
        gap: "6px",
        fontSize: "12px",
        color: "#475569",
      }}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: "12px", color: "#64748b" }}>{subtitle}</div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        alignItems: "flex-start",
        fontSize: "12.5px",
      }}
    >
      <span style={{ color: "#64748b" }}>{label}</span>
      <span
        style={{
          color: accent ? "#1d4ed8" : "#0f172a",
          fontWeight: 600,
          textAlign: "right",
          lineHeight: 1.45,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function PlatformBadge({ platformCode }: { platformCode: string }) {
  const swatch = getPlatformSwatch(platformCode);
  const displayName = getPlatformDisplayName(platformCode) ?? platformCode;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: swatch.background,
          color: swatch.color,
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.06em",
        }}
      >
        {getPlatformShortCode(platformCode)}
      </div>
      <div style={{ display: "grid", gap: "2px" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
          {displayName}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "#64748b",
            fontFamily:
              "ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, monospace",
          }}
        >
          {platformCode}
        </span>
      </div>
    </div>
  );
}

export function ForwardedOrderBoard({
  initialOrders,
  initialAdapterHealth,
  initialReconciliationIssues,
  focusOrderId,
}: ForwardedOrderBoardProps) {
  const client = getOpsClient();
  const { locale, t } = useTranslation();
  const [orders, setOrders] = useState(() => sortOrders(initialOrders));
  const [adapterHealth, setAdapterHealth] = useState(() =>
    sortAdapterHealth(initialAdapterHealth),
  );
  const [reconciliationIssues, setReconciliationIssues] = useState(() =>
    sortReconciliationIssues(initialReconciliationIssues),
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() =>
    pickInitialOrderId(sortOrders(initialOrders), focusOrderId),
  );
  const [filter, setFilter] = useState<ForwardedFilter>("all");
  const [searchValue, setSearchValue] = useState("");
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [loadingAction, setLoadingAction] = useState<
    ActionMode | "refresh" | null
  >(null);
  const [syncDraft, setSyncDraft] = useState<SyncDraft>({
    nativeStatus: "",
    payloadJson: "",
  });
  const [manualFallbackDraft, setManualFallbackDraft] =
    useState<ManualFallbackDraft>({
      reason: "",
      requestedBy: "ops-console",
      notes: "",
    });
  const [syncErrorDraft, setSyncErrorDraft] = useState<SyncErrorDraft>({
    errorCode: "",
    errorMessage: "",
    retryable: true,
    nativeStatus: "",
    manualFallbackReason: "",
  });
  const [reconciliationDraft, setReconciliationDraft] =
    useState<ReconciliationDraft>({
      nativeStatus: "",
      mismatchCount: "0",
      notes: "",
      payloadJson: "",
    });

  const metrics = useMemo(() => {
    const active = orders.filter(
      (order) => !isTerminalStatus(order.status),
    ).length;
    const broadcasted = orders.filter(
      (order) => order.status === "broadcasted",
    ).length;
    const waitingPlatform = orders.filter(
      (order) => order.status === "accept_pending",
    ).length;
    const syncFailed = orders.filter(
      (order) => order.status === "sync_failed",
    ).length;
    const openReconciliation = reconciliationIssues.length;
    const manualFallback = orders.filter(
      (order) => order.manualFallback.required,
    ).length;
    return {
      active,
      broadcasted,
      waitingPlatform,
      syncFailed,
      openReconciliation,
      manualFallback,
    };
  }, [orders, reconciliationIssues]);

  const visibleOrders = useMemo(() => {
    return orders.filter((order) => {
      if (!matchesFilter(order, filter)) {
        return false;
      }

      if (!deferredSearch) {
        return true;
      }

      const haystack = [
        order.mirrorOrderId,
        order.externalOrderId,
        order.platformCode,
        getPlatformDisplayName(order.platformCode) ?? "",
        order.acceptedDriverId ?? "",
        order.lastNativeStatus ?? "",
        ...order.candidateDriverIds,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(deferredSearch);
    });
  }, [deferredSearch, filter, orders]);

  const selectedOrder = useMemo(
    () =>
      orders.find((order) => order.mirrorOrderId === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  useEffect(() => {
    if (selectedOrderId && selectedOrder) {
      return;
    }

    const nextOrderId = pickInitialOrderId(
      visibleOrders,
      selectedOrderId ?? undefined,
    );
    if (nextOrderId) {
      setSelectedOrderId(nextOrderId);
      return;
    }

    if (!visibleOrders.length) {
      setSelectedOrderId(pickInitialOrderId(orders));
    }
  }, [orders, selectedOrder, selectedOrderId, visibleOrders]);

  async function listAdapterHealth() {
    const response = await client.get<{ items: AdapterHealthRecord[] }>(
      "/api/forwarder/adapters/health",
    );
    return response.items ?? [];
  }

  async function refreshBoard(preferredOrderId?: string | null) {
    setLoadingAction("refresh");
    setError(null);

    try {
      const [nextOrders, nextAdapterHealth, nextReconciliationIssues] =
        await Promise.all([
          client.listForwarderOrders(),
          listAdapterHealth(),
          client.listForwarderReconciliationIssues(),
        ]);

      const sortedOrders = sortOrders(nextOrders);
      const sortedAdapterHealth = sortAdapterHealth(nextAdapterHealth);
      const sortedReconciliation = sortReconciliationIssues(
        nextReconciliationIssues,
      );

      startTransition(() => {
        setOrders(sortedOrders);
        setAdapterHealth(sortedAdapterHealth);
        setReconciliationIssues(sortedReconciliation);
        setSelectedOrderId((current) =>
          pickInitialOrderId(
            sortedOrders,
            preferredOrderId ?? current ?? undefined,
          ),
        );
      });
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : t("dispatch.forwarded.message.refreshFailed"),
      );
    } finally {
      setLoadingAction(null);
    }
  }

  function openAction(mode: ActionMode) {
    if (!selectedOrder) {
      return;
    }

    setError(null);
    setNotice(null);
    setActionMode(mode);

    if (mode === "sync") {
      setSyncDraft({
        nativeStatus: selectedOrder.lastNativeStatus ?? "",
        payloadJson: "",
      });
      return;
    }

    if (mode === "fallback") {
      setManualFallbackDraft({
        reason:
          selectedOrder.manualFallback.reason ??
          selectedOrder.lastSyncError?.message ??
          "",
        requestedBy:
          selectedOrder.manualFallback.requestedBy?.trim() || "ops-console",
        notes: selectedOrder.manualFallback.notes ?? "",
      });
      return;
    }

    if (mode === "error") {
      setSyncErrorDraft({
        errorCode: selectedOrder.lastSyncError?.code ?? "",
        errorMessage: selectedOrder.lastSyncError?.message ?? "",
        retryable: selectedOrder.lastSyncError?.retryable ?? true,
        nativeStatus: selectedOrder.lastSyncError?.nativeStatus ?? "",
        manualFallbackReason: selectedOrder.manualFallback.reason ?? "",
      });
      return;
    }

    setReconciliationDraft({
      nativeStatus: selectedOrder.lastNativeStatus ?? "",
      mismatchCount: String(
        selectedOrder.reconciliationJob?.mismatchCount ?? 0,
      ),
      notes:
        selectedOrder.reconciliationJob?.notes ??
        selectedOrder.manualFallback.notes ??
        "",
      payloadJson: "",
    });
  }

  async function handleSyncSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) {
      return;
    }

    const nativeStatus = syncDraft.nativeStatus.trim();
    if (!nativeStatus) {
      setError(t("dispatch.forwarded.form.nativeStatusRequired"));
      return;
    }

    const payload = parseJsonRecord(syncDraft.payloadJson);
    if (!payload.ok) {
      setError(t("dispatch.forwarded.form.jsonInvalid"));
      return;
    }

    setLoadingAction("sync");
    setError(null);
    setNotice(null);

    try {
      await client.post(
        `/api/forwarder/orders/${encodeURIComponent(selectedOrder.mirrorOrderId)}/sync-status`,
        {
          body: {
            nativeStatus,
            ...(payload.value ? { payload: payload.value } : {}),
          },
        },
      );
      setNotice(t("dispatch.forwarded.message.syncSuccess"));
      setActionMode(null);
      await refreshBoard(selectedOrder.mirrorOrderId);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("dispatch.forwarded.message.actionFailed"),
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleManualFallbackSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) {
      return;
    }

    const reason = manualFallbackDraft.reason.trim();
    if (!reason) {
      setError(t("dispatch.forwarded.form.reasonRequired"));
      return;
    }

    setLoadingAction("fallback");
    setError(null);
    setNotice(null);

    try {
      await client.post(
        `/api/forwarder/orders/${encodeURIComponent(selectedOrder.mirrorOrderId)}/manual-fallback`,
        {
          body: {
            reason,
            requestedBy: manualFallbackDraft.requestedBy.trim() || null,
            notes: manualFallbackDraft.notes.trim() || null,
          },
        },
      );
      setNotice(t("dispatch.forwarded.message.fallbackSuccess"));
      setActionMode(null);
      await refreshBoard(selectedOrder.mirrorOrderId);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("dispatch.forwarded.message.actionFailed"),
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleSyncFailedSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) {
      return;
    }

    const errorCode = syncErrorDraft.errorCode.trim();
    const errorMessage = syncErrorDraft.errorMessage.trim();
    if (!errorCode || !errorMessage) {
      setError(t("dispatch.forwarded.form.syncFailureRequired"));
      return;
    }

    setLoadingAction("error");
    setError(null);
    setNotice(null);

    try {
      await client.post(
        `/api/forwarder/orders/${encodeURIComponent(selectedOrder.mirrorOrderId)}/sync-failed`,
        {
          body: {
            errorCode,
            errorMessage,
            retryable: syncErrorDraft.retryable,
            nativeStatus: syncErrorDraft.nativeStatus.trim() || undefined,
            manualFallbackReason:
              syncErrorDraft.manualFallbackReason.trim() || undefined,
          },
        },
      );
      setNotice(t("dispatch.forwarded.message.syncFailedSuccess"));
      setActionMode(null);
      await refreshBoard(selectedOrder.mirrorOrderId);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("dispatch.forwarded.message.actionFailed"),
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleReconciliationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) {
      return;
    }

    const nativeStatus = reconciliationDraft.nativeStatus.trim();
    const mismatchCount = Number(reconciliationDraft.mismatchCount);
    if (!nativeStatus) {
      setError(t("dispatch.forwarded.form.nativeStatusRequired"));
      return;
    }
    if (!Number.isFinite(mismatchCount) || mismatchCount < 0) {
      setError(t("dispatch.forwarded.form.mismatchCountRequired"));
      return;
    }

    const payload = parseJsonRecord(reconciliationDraft.payloadJson);
    if (!payload.ok) {
      setError(t("dispatch.forwarded.form.jsonInvalid"));
      return;
    }

    setLoadingAction("reconcile");
    setError(null);
    setNotice(null);

    try {
      await client.post(
        `/api/forwarder/orders/${encodeURIComponent(selectedOrder.mirrorOrderId)}/reconciliation/complete`,
        {
          body: {
            nativeStatus,
            mismatchCount,
            notes: reconciliationDraft.notes.trim() || undefined,
            ...(payload.value ? { payload: payload.value } : {}),
          },
        },
      );
      setNotice(t("dispatch.forwarded.message.reconciliationSuccess"));
      setActionMode(null);
      await refreshBoard(selectedOrder.mirrorOrderId);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("dispatch.forwarded.message.actionFailed"),
      );
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <Link href="/dispatch" style={buttonStyle({ primary: true })}>
          {t("dispatch.view.forwarded")}
        </Link>
        <Link href="/dispatch?view=owned" style={buttonStyle({})}>
          {t("dispatch.view.owned")}
        </Link>
        <Link href="/revenue" style={buttonStyle({})}>
          {t("dispatch.view.revenue")}
        </Link>
        <Link href="/contracts" style={buttonStyle({})}>
          {t("dispatch.view.contracts")}
        </Link>
      </div>

      <div
        style={{
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: "12px",
          padding: "14px 16px",
          color: "#1d4ed8",
          fontSize: "13.5px",
        }}
      >
        <strong>{t("dispatch.roleBoundary")}:</strong>{" "}
        {t("dispatch.forwarded.roleBoundaryText")}
      </div>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "12px",
            padding: "12px 16px",
            color: "#b91c1c",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "12px",
            padding: "12px 16px",
            color: "#15803d",
            fontSize: "13px",
          }}
        >
          {notice}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "16px",
        }}
      >
        <MetricCard
          label={t("dispatch.forwarded.kpi.active")}
          value={String(metrics.active)}
          accent="#0f172a"
        />
        <MetricCard
          label={t("dispatch.forwarded.kpi.broadcasted")}
          value={String(metrics.broadcasted)}
          accent="#1d4ed8"
        />
        <MetricCard
          label={t("dispatch.forwarded.kpi.awaitingPlatform")}
          value={String(metrics.waitingPlatform)}
          accent="#b45309"
        />
        <MetricCard
          label={t("dispatch.forwarded.kpi.syncFailed")}
          value={String(metrics.syncFailed)}
          accent="#b91c1c"
        />
        <MetricCard
          label={t("dispatch.forwarded.kpi.reconciliation")}
          value={String(metrics.openReconciliation)}
          accent="#9333ea"
        />
        <MetricCard
          label={t("dispatch.forwarded.kpi.manualFallback")}
          value={String(metrics.manualFallback)}
          accent="#ea580c"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 380px)",
          gap: "16px",
          alignItems: "start",
        }}
      >
        <Card>
          <CardHeader
            style={{
              display: "grid",
              gap: "12px",
              background: "#fcfcfd",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <SectionTitle
                title={t("dispatch.forwarded.table.title")}
                subtitle={t("dispatch.forwarded.showing", {
                  visible: visibleOrders.length,
                  total: orders.length,
                })}
              />
              <button
                type="button"
                disabled={loadingAction === "refresh"}
                onClick={() => void refreshBoard(selectedOrderId)}
                style={buttonStyle({
                  primary: true,
                  disabled: loadingAction === "refresh",
                })}
              >
                {loadingAction === "refresh"
                  ? t("dispatch.forwarded.action.refreshing")
                  : t("dispatch.forwarded.action.refresh")}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              {FILTER_ORDER.map((value) => {
                const active = filter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    style={{
                      ...buttonStyle({ primary: active }),
                      padding: "8px 10px",
                    }}
                  >
                    {t(`dispatch.forwarded.filter.${value}`)}{" "}
                    <span style={{ opacity: 0.8 }}>
                      {buildFilterCount(orders, value)}
                    </span>
                  </button>
                );
              })}
            </div>

            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("dispatch.forwarded.search")}
              style={fieldStyle()}
            />
          </CardHeader>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12.5px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontSize: "10.5px",
                  }}
                >
                  {[
                    t("dispatch.forwarded.table.col.mirror"),
                    t("dispatch.forwarded.table.col.platform"),
                    t("dispatch.forwarded.table.col.external"),
                    t("dispatch.forwarded.table.col.status"),
                    t("dispatch.forwarded.table.col.nativeStatus"),
                    t("dispatch.forwarded.table.col.candidates"),
                    t("dispatch.forwarded.table.col.error"),
                    t("dispatch.forwarded.table.col.updated"),
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        borderBottom: "1px solid #e2e8f0",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleOrders.length > 0 ? (
                  visibleOrders.map((order) => {
                    const active = order.mirrorOrderId === selectedOrderId;
                    return (
                      <tr
                        key={order.mirrorOrderId}
                        onClick={() => setSelectedOrderId(order.mirrorOrderId)}
                        style={getForwardedRowStyle(order, active)}
                      >
                        <td
                          style={{
                            padding: "12px",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontWeight: 700,
                            color: "#0f172a",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {order.mirrorOrderId}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <PlatformBadge platformCode={order.platformCode} />
                        </td>
                        <td
                          style={{
                            padding: "12px",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                            color: "#475569",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {order.externalOrderId}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <Badge
                            variant={getForwardedStatusVariant(order.status)}
                          >
                            {t(`dispatch.forwarded.status.${order.status}`)}
                          </Badge>
                        </td>
                        <td
                          style={{
                            padding: "12px",
                            color: "#475569",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {order.lastNativeStatus
                            ? formatOpsCodeLabel(locale, order.lastNativeStatus)
                            : t("common.dash")}
                        </td>
                        <td style={{ padding: "12px", color: "#0f172a" }}>
                          <div style={{ display: "grid", gap: "4px" }}>
                            <span>
                              {t("dispatch.forwarded.table.candidateSummary", {
                                count: order.candidateDriverIds.length,
                              })}
                            </span>
                            <span
                              style={{
                                color: order.acceptedDriverId
                                  ? "#15803d"
                                  : "#64748b",
                                fontFamily:
                                  "ui-monospace, SFMono-Regular, Menlo, monospace",
                              }}
                            >
                              {order.acceptedDriverId ?? t("common.dash")}
                            </span>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "12px",
                            color: order.lastSyncError ? "#b91c1c" : "#94a3b8",
                          }}
                        >
                          {order.lastSyncError
                            ? `${order.lastSyncError.code}: ${order.lastSyncError.message}`
                            : t("common.dash")}
                        </td>
                        <td style={{ padding: "12px", color: "#475569" }}>
                          {formatRelativeTime(locale, order.updatedAt)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: "24px 16px",
                        textAlign: "center",
                        color: "#64748b",
                      }}
                    >
                      {t("dispatch.forwarded.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            style={{
              display: "grid",
              gap: "10px",
              background: "#fcfcfd",
            }}
          >
            {selectedOrder ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                  }}
                >
                  <PlatformBadge platformCode={selectedOrder.platformCode} />
                  <Badge
                    variant={getForwardedStatusVariant(selectedOrder.status)}
                  >
                    {t(`dispatch.forwarded.status.${selectedOrder.status}`)}
                  </Badge>
                </div>
                <div style={{ display: "grid", gap: "4px" }}>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: "#0f172a",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    {selectedOrder.mirrorOrderId}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>
                    {selectedOrder.externalOrderId} ·{" "}
                    {formatRelativeTime(locale, selectedOrder.updatedAt)}
                  </div>
                </div>
              </>
            ) : (
              <SectionTitle
                title={t("dispatch.forwarded.detail.title")}
                subtitle={t("dispatch.forwarded.detail.selectHint")}
              />
            )}
          </CardHeader>

          <CardBody style={{ display: "grid", gap: "16px" }}>
            {selectedOrder ? (
              <>
                {selectedOrder.manualFallback.required && (
                  <div
                    style={{
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                      borderRadius: "12px",
                      padding: "12px 14px",
                      color: "#9a3412",
                      display: "grid",
                      gap: "4px",
                      fontSize: "13px",
                    }}
                  >
                    <strong>
                      {t("dispatch.forwarded.detail.manualFallbackTitle")}
                    </strong>
                    <span>
                      {selectedOrder.manualFallback.reason ??
                        t("dispatch.forwarded.detail.manualFallbackRequested")}
                    </span>
                  </div>
                )}

                <div style={{ display: "grid", gap: "10px" }}>
                  <SectionTitle
                    title={t("dispatch.forwarded.detail.summary")}
                  />
                  <DetailRow
                    label={t("dispatch.forwarded.detail.localStatus")}
                    value={t(
                      `dispatch.forwarded.status.${selectedOrder.status}`,
                    )}
                  />
                  <DetailRow
                    label={t("dispatch.forwarded.detail.nativeStatus")}
                    value={
                      selectedOrder.lastNativeStatus
                        ? formatOpsCodeLabel(
                            locale,
                            selectedOrder.lastNativeStatus,
                          )
                        : t("common.dash")
                    }
                  />
                  <DetailRow
                    label={t("dispatch.forwarded.detail.candidates")}
                    value={
                      selectedOrder.candidateDriverIds.length > 0
                        ? selectedOrder.candidateDriverIds.join(", ")
                        : t("common.dash")
                    }
                    accent={selectedOrder.candidateDriverIds.length > 0}
                  />
                  <DetailRow
                    label={t("dispatch.forwarded.detail.acceptedDriver")}
                    value={selectedOrder.acceptedDriverId ?? t("common.dash")}
                    accent={Boolean(selectedOrder.acceptedDriverId)}
                  />
                  <DetailRow
                    label={t("dispatch.forwarded.detail.fareAuthority")}
                    value={t("dispatch.forwarded.detail.externalPlatform")}
                  />
                  <DetailRow
                    label={t("dispatch.forwarded.detail.settlementAuthority")}
                    value={t("dispatch.forwarded.detail.externalPlatform")}
                  />
                  <DetailRow
                    label={t("dispatch.forwarded.detail.ledgerMode")}
                    value={t("dispatch.forwarded.detail.shadowOnly")}
                  />
                  <DetailRow
                    label={t("dispatch.forwarded.detail.reconciliation")}
                    value={
                      selectedOrder.reconciliationJob
                        ? `${formatOpsCodeLabel(locale, selectedOrder.reconciliationJob.reason)} · ${formatOpsCodeLabel(locale, selectedOrder.reconciliationJob.status)}`
                        : t("dispatch.forwarded.detail.none")
                    }
                  />
                  <DetailRow
                    label={t("dispatch.forwarded.detail.updatedAt")}
                    value={formatDateTime(locale, selectedOrder.updatedAt)}
                  />
                </div>

                {selectedOrder.lastSyncError && (
                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      borderRadius: "12px",
                      padding: "12px 14px",
                    }}
                  >
                    <SectionTitle
                      title={t("dispatch.forwarded.detail.lastSyncError")}
                      subtitle={`${selectedOrder.lastSyncError.code} · ${formatDateTime(locale, selectedOrder.lastSyncError.failedAt)}`}
                    />
                    <div style={{ fontSize: "13px", color: "#881337" }}>
                      {selectedOrder.lastSyncError.message}
                    </div>
                    <div style={{ fontSize: "12px", color: "#9f1239" }}>
                      {selectedOrder.lastSyncError.retryable
                        ? t("dispatch.forwarded.detail.retryable")
                        : t("dispatch.forwarded.detail.notRetryable")}
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gap: "10px" }}>
                  <SectionTitle
                    title={t("dispatch.forwarded.action.title")}
                    subtitle={t("dispatch.forwarded.action.subtitle")}
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: "8px",
                    }}
                  >
                    <button
                      type="button"
                      disabled={Boolean(loadingAction)}
                      onClick={() => openAction("sync")}
                      style={buttonStyle({
                        primary: true,
                        disabled: Boolean(loadingAction),
                        full: true,
                      })}
                    >
                      {t("dispatch.forwarded.action.syncStatus")}
                    </button>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        disabled={Boolean(loadingAction)}
                        onClick={() => openAction("fallback")}
                        style={buttonStyle({
                          warning: true,
                          disabled: Boolean(loadingAction),
                          full: true,
                        })}
                      >
                        {t("dispatch.forwarded.action.manualFallback")}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(loadingAction)}
                        onClick={() => openAction("error")}
                        style={buttonStyle({
                          danger: true,
                          disabled: Boolean(loadingAction),
                          full: true,
                        })}
                      >
                        {t("dispatch.forwarded.action.markSyncFailed")}
                      </button>
                    </div>
                    {selectedOrder.reconciliationJob?.status === "queued" && (
                      <button
                        type="button"
                        disabled={Boolean(loadingAction)}
                        onClick={() => openAction("reconcile")}
                        style={buttonStyle({
                          disabled: Boolean(loadingAction),
                          full: true,
                        })}
                      >
                        {t("dispatch.forwarded.action.completeReconciliation")}
                      </button>
                    )}
                  </div>
                </div>

                {actionMode === "sync" && (
                  <form
                    onSubmit={handleSyncSubmit}
                    style={{ display: "grid", gap: "10px" }}
                  >
                    <SectionTitle
                      title={t("dispatch.forwarded.action.syncStatus")}
                    />
                    <PanelField
                      label={t("dispatch.forwarded.form.nativeStatus")}
                    >
                      <input
                        list="forwarded-native-status-options"
                        value={syncDraft.nativeStatus}
                        onChange={(event) =>
                          setSyncDraft((current) => ({
                            ...current,
                            nativeStatus: event.target.value,
                          }))
                        }
                        style={fieldStyle()}
                      />
                    </PanelField>
                    <PanelField
                      label={t("dispatch.forwarded.form.payloadJson")}
                    >
                      <textarea
                        value={syncDraft.payloadJson}
                        onChange={(event) =>
                          setSyncDraft((current) => ({
                            ...current,
                            payloadJson: event.target.value,
                          }))
                        }
                        style={{
                          ...fieldStyle(),
                          minHeight: "96px",
                          resize: "vertical",
                        }}
                      />
                    </PanelField>
                    <FormButtons
                      busy={loadingAction === "sync"}
                      busyLabel={t("dispatch.forwarded.action.submitting")}
                      submitLabel={t("dispatch.forwarded.form.submit")}
                      cancelLabel={t("dispatch.forwarded.form.cancel")}
                      onCancel={() => setActionMode(null)}
                    />
                  </form>
                )}

                {actionMode === "fallback" && (
                  <form
                    onSubmit={handleManualFallbackSubmit}
                    style={{ display: "grid", gap: "10px" }}
                  >
                    <SectionTitle
                      title={t("dispatch.forwarded.action.manualFallback")}
                    />
                    <PanelField label={t("dispatch.forwarded.form.reason")}>
                      <input
                        value={manualFallbackDraft.reason}
                        onChange={(event) =>
                          setManualFallbackDraft((current) => ({
                            ...current,
                            reason: event.target.value,
                          }))
                        }
                        style={fieldStyle()}
                      />
                    </PanelField>
                    <PanelField
                      label={t("dispatch.forwarded.form.requestedBy")}
                    >
                      <input
                        value={manualFallbackDraft.requestedBy}
                        onChange={(event) =>
                          setManualFallbackDraft((current) => ({
                            ...current,
                            requestedBy: event.target.value,
                          }))
                        }
                        style={fieldStyle()}
                      />
                    </PanelField>
                    <PanelField label={t("dispatch.forwarded.form.notes")}>
                      <textarea
                        value={manualFallbackDraft.notes}
                        onChange={(event) =>
                          setManualFallbackDraft((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        style={{
                          ...fieldStyle(),
                          minHeight: "96px",
                          resize: "vertical",
                        }}
                      />
                    </PanelField>
                    <FormButtons
                      busy={loadingAction === "fallback"}
                      busyLabel={t("dispatch.forwarded.action.submitting")}
                      submitLabel={t("dispatch.forwarded.form.submit")}
                      cancelLabel={t("dispatch.forwarded.form.cancel")}
                      onCancel={() => setActionMode(null)}
                    />
                  </form>
                )}

                {actionMode === "error" && (
                  <form
                    onSubmit={handleSyncFailedSubmit}
                    style={{ display: "grid", gap: "10px" }}
                  >
                    <SectionTitle
                      title={t("dispatch.forwarded.action.markSyncFailed")}
                    />
                    <PanelField label={t("dispatch.forwarded.form.errorCode")}>
                      <input
                        value={syncErrorDraft.errorCode}
                        onChange={(event) =>
                          setSyncErrorDraft((current) => ({
                            ...current,
                            errorCode: event.target.value,
                          }))
                        }
                        style={fieldStyle()}
                      />
                    </PanelField>
                    <PanelField
                      label={t("dispatch.forwarded.form.errorMessage")}
                    >
                      <textarea
                        value={syncErrorDraft.errorMessage}
                        onChange={(event) =>
                          setSyncErrorDraft((current) => ({
                            ...current,
                            errorMessage: event.target.value,
                          }))
                        }
                        style={{
                          ...fieldStyle(),
                          minHeight: "84px",
                          resize: "vertical",
                        }}
                      />
                    </PanelField>
                    <PanelField
                      label={t("dispatch.forwarded.form.nativeStatus")}
                    >
                      <input
                        list="forwarded-native-status-options"
                        value={syncErrorDraft.nativeStatus}
                        onChange={(event) =>
                          setSyncErrorDraft((current) => ({
                            ...current,
                            nativeStatus: event.target.value,
                          }))
                        }
                        style={fieldStyle()}
                      />
                    </PanelField>
                    <PanelField
                      label={t("dispatch.forwarded.form.manualFallbackReason")}
                    >
                      <input
                        value={syncErrorDraft.manualFallbackReason}
                        onChange={(event) =>
                          setSyncErrorDraft((current) => ({
                            ...current,
                            manualFallbackReason: event.target.value,
                          }))
                        }
                        style={fieldStyle()}
                      />
                    </PanelField>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "12px",
                        color: "#475569",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={syncErrorDraft.retryable}
                        onChange={(event) =>
                          setSyncErrorDraft((current) => ({
                            ...current,
                            retryable: event.target.checked,
                          }))
                        }
                      />
                      {t("dispatch.forwarded.form.retryable")}
                    </label>
                    <FormButtons
                      busy={loadingAction === "error"}
                      busyLabel={t("dispatch.forwarded.action.submitting")}
                      submitLabel={t("dispatch.forwarded.form.submit")}
                      cancelLabel={t("dispatch.forwarded.form.cancel")}
                      onCancel={() => setActionMode(null)}
                    />
                  </form>
                )}

                {actionMode === "reconcile" && (
                  <form
                    onSubmit={handleReconciliationSubmit}
                    style={{ display: "grid", gap: "10px" }}
                  >
                    <SectionTitle
                      title={t(
                        "dispatch.forwarded.action.completeReconciliation",
                      )}
                    />
                    <PanelField
                      label={t("dispatch.forwarded.form.nativeStatus")}
                    >
                      <input
                        list="forwarded-native-status-options"
                        value={reconciliationDraft.nativeStatus}
                        onChange={(event) =>
                          setReconciliationDraft((current) => ({
                            ...current,
                            nativeStatus: event.target.value,
                          }))
                        }
                        style={fieldStyle()}
                      />
                    </PanelField>
                    <PanelField
                      label={t("dispatch.forwarded.form.mismatchCount")}
                    >
                      <input
                        type="number"
                        min="0"
                        value={reconciliationDraft.mismatchCount}
                        onChange={(event) =>
                          setReconciliationDraft((current) => ({
                            ...current,
                            mismatchCount: event.target.value,
                          }))
                        }
                        style={fieldStyle()}
                      />
                    </PanelField>
                    <PanelField label={t("dispatch.forwarded.form.notes")}>
                      <textarea
                        value={reconciliationDraft.notes}
                        onChange={(event) =>
                          setReconciliationDraft((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        style={{
                          ...fieldStyle(),
                          minHeight: "84px",
                          resize: "vertical",
                        }}
                      />
                    </PanelField>
                    <PanelField
                      label={t("dispatch.forwarded.form.payloadJson")}
                    >
                      <textarea
                        value={reconciliationDraft.payloadJson}
                        onChange={(event) =>
                          setReconciliationDraft((current) => ({
                            ...current,
                            payloadJson: event.target.value,
                          }))
                        }
                        style={{
                          ...fieldStyle(),
                          minHeight: "96px",
                          resize: "vertical",
                        }}
                      />
                    </PanelField>
                    <FormButtons
                      busy={loadingAction === "reconcile"}
                      busyLabel={t("dispatch.forwarded.action.submitting")}
                      submitLabel={t("dispatch.forwarded.form.submit")}
                      cancelLabel={t("dispatch.forwarded.form.cancel")}
                      onCancel={() => setActionMode(null)}
                    />
                  </form>
                )}
              </>
            ) : (
              <div style={{ color: "#64748b", fontSize: "13px" }}>
                {t("dispatch.forwarded.detail.selectHint")}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "16px",
        }}
      >
        <Card>
          <CardHeader>
            <SectionTitle
              title={t("dispatch.forwarded.health.title")}
              subtitle={t("dispatch.forwarded.health.subtitle")}
            />
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12.5px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    color: "#64748b",
                    fontSize: "10.5px",
                    textTransform: "uppercase",
                  }}
                >
                  {[
                    t("dispatch.forwarded.health.col.platform"),
                    t("dispatch.forwarded.health.col.status"),
                    t("dispatch.forwarded.health.col.checkedAt"),
                    t("dispatch.forwarded.health.col.error"),
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {adapterHealth.length > 0 ? (
                  adapterHealth.map((item) => (
                    <tr
                      key={item.platformCode}
                      style={{ borderBottom: "1px solid #f1f5f9" }}
                    >
                      <td style={{ padding: "12px" }}>
                        <PlatformBadge platformCode={item.platformCode} />
                      </td>
                      <td style={{ padding: "12px" }}>
                        <Badge variant={getAdapterHealthVariant(item.status)}>
                          {t(`dispatch.forwarded.health.status.${item.status}`)}
                        </Badge>
                      </td>
                      <td style={{ padding: "12px", color: "#475569" }}>
                        {formatDateTime(locale, item.lastCheckedAt)}
                      </td>
                      <td style={{ padding: "12px", color: "#475569" }}>
                        {item.lastError ?? t("common.dash")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: "20px 16px",
                        textAlign: "center",
                        color: "#64748b",
                      }}
                    >
                      {t("dispatch.forwarded.health.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle
              title={t("dispatch.forwarded.reconciliation.title")}
              subtitle={t("dispatch.forwarded.reconciliation.subtitle")}
            />
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12.5px",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fafc",
                    color: "#64748b",
                    fontSize: "10.5px",
                    textTransform: "uppercase",
                  }}
                >
                  {[
                    t("dispatch.forwarded.reconciliation.col.mirror"),
                    t("dispatch.forwarded.reconciliation.col.reason"),
                    t("dispatch.forwarded.reconciliation.col.status"),
                    t("dispatch.forwarded.reconciliation.col.fallback"),
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reconciliationIssues.length > 0 ? (
                  reconciliationIssues.map((issue) => (
                    <tr
                      key={issue.reconciliationJob.reconciliationJobId}
                      style={{ borderBottom: "1px solid #f1f5f9" }}
                    >
                      <td
                        style={{
                          padding: "12px",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                          color: "#0f172a",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedOrderId(issue.mirrorOrderId)
                          }
                          style={{
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            color: "#1d4ed8",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          {issue.mirrorOrderId}
                        </button>
                      </td>
                      <td style={{ padding: "12px", color: "#475569" }}>
                        {formatOpsCodeLabel(
                          locale,
                          issue.reconciliationJob.reason,
                        )}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <Badge variant="yellow">
                          {formatOpsCodeLabel(
                            locale,
                            issue.reconciliationJob.status,
                          )}
                        </Badge>
                      </td>
                      <td style={{ padding: "12px", color: "#475569" }}>
                        {issue.manualFallback.reason ?? t("common.dash")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: "20px 16px",
                        textAlign: "center",
                        color: "#64748b",
                      }}
                    >
                      {t("dispatch.forwarded.reconciliation.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>

      <datalist id="forwarded-native-status-options">
        {COMMON_NATIVE_STATUS_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
        display: "grid",
        gap: "6px",
      }}
    >
      <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: "28px", color: accent, fontWeight: 800 }}>
        {value}
      </div>
    </div>
  );
}

function FormButtons({
  busy,
  busyLabel,
  submitLabel,
  cancelLabel,
  onCancel,
}: {
  busy: boolean;
  busyLabel: string;
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <button
        type="submit"
        disabled={busy}
        style={buttonStyle({ primary: true, disabled: busy, full: true })}
      >
        {busy ? busyLabel : submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={buttonStyle({ full: true })}
      >
        {cancelLabel}
      </button>
    </div>
  );
}
