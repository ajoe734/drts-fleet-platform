import Link from "next/link";
import type {
  AdapterHealthRecord,
  DispatchJobRecord,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  OwnedOrderRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  buildDispatchInsights,
  formatCompactNumber,
  formatMinorCurrency,
} from "@/lib/ops-analytics";
import { PageHeader } from "@drts/ui-web";
import { StatCard } from "@drts/ui-web";
import { Card, CardBody } from "@drts/ui-web";
import { DispatchWorkflow } from "./dispatch-workflow";
import { ForwardedOrderBoard } from "./forwarded-order-board";

type DispatchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type DispatchView = "forwarded" | "owned";

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
  return value === "owned" ? "owned" : "forwarded";
}

function actionLinkStyle(active = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    border: `1px solid ${active ? "#0f172a" : "#cbd5e1"}`,
    background: active ? "#0f172a" : "#ffffff",
    color: active ? "#ffffff" : "#334155",
    padding: "10px 12px",
    fontSize: "13px",
    fontWeight: 600,
    textDecoration: "none",
    whiteSpace: "nowrap" as const,
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
  const view = resolveView(firstParam(resolvedSearchParams?.view));
  const focusOrderId = firstParam(resolvedSearchParams?.orderId) ?? "";
  const actions = (
    <>
      <Link href="/dispatch" style={actionLinkStyle(view === "forwarded")}>
        {t("dispatch.view.forwarded", locale)}
      </Link>
      <Link
        href="/dispatch?view=owned"
        style={actionLinkStyle(view === "owned")}
      >
        {t("dispatch.view.owned", locale)}
      </Link>
      <Link href="/revenue" style={actionLinkStyle()}>
        {t("dispatch.view.revenue", locale)}
      </Link>
      <Link href="/contracts" style={actionLinkStyle()}>
        {t("dispatch.view.contracts", locale)}
      </Link>
    </>
  );

  if (view === "forwarded") {
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
    const manualFallbackCount = forwardedOrders.filter(
      (order) => order.manualFallback.required,
    ).length;
    const acceptPendingCount = forwardedOrders.filter(
      (order) => order.status === "accept_pending",
    ).length;
    const syncFailedCount = forwardedOrders.filter(
      (order) => order.status === "sync_failed",
    ).length;

    return (
      <>
        <PageHeader
          title={t("dispatch.forwarded.title", locale)}
          subtitle={t("dispatch.forwarded.subtitle", locale)}
          actions={actions}
        />
        <Card style={{ marginBottom: "20px" }}>
          <CardBody>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "16px",
              }}
            >
              <StatCard
                label={t("dispatch.forwarded.kpi.awaitingPlatform", locale)}
                value={formatCompactNumber(acceptPendingCount)}
                sub={t("dispatch.forwarded.roleBoundaryText", locale)}
                accent="#b45309"
              />
              <StatCard
                label={t("dispatch.forwarded.kpi.syncFailed", locale)}
                value={formatCompactNumber(syncFailedCount)}
                sub={t("dispatch.forwarded.action.markSyncFailed", locale)}
                accent="#dc2626"
              />
              <StatCard
                label={t("dispatch.forwarded.kpi.manualFallback", locale)}
                value={formatCompactNumber(manualFallbackCount)}
                sub={t("dispatch.forwarded.action.manualFallback", locale)}
                accent="#ea580c"
              />
              <StatCard
                label={t("dispatch.forwarded.kpi.reconciliation", locale)}
                value={formatCompactNumber(reconciliationIssues.length)}
                sub={t(
                  "dispatch.forwarded.action.completeReconciliation",
                  locale,
                )}
                accent="#7c3aed"
              />
            </div>
          </CardBody>
        </Card>
        <ForwardedOrderBoard
          initialOrders={forwardedOrders}
          initialAdapterHealth={adapterHealthResponse.items ?? []}
          initialReconciliationIssues={reconciliationIssues}
          focusOrderId={focusOrderId}
        />
      </>
    );
  }

  const [orders, dispatchJobs, forwarderSyncErrors] = await Promise.all([
    resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
    resolveOrFallback(
      () => client.listDispatchJobs(),
      [] as DispatchJobRecord[],
    ),
    resolveOrFallback(
      () => client.listForwarderSyncErrors(),
      [] as ForwardedOrderRecord[],
    ),
  ]);
  const insights = buildDispatchInsights(orders, dispatchJobs);

  return (
    <>
      <PageHeader
        title={t("dispatch.title", locale)}
        subtitle={t("dispatch.subtitle", locale)}
        actions={actions}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <StatCard
          label={t("dispatch.queueDepth", locale)}
          value={formatCompactNumber(insights.queueDepth)}
          sub={
            insights.averageEtaMinutes
              ? t("dispatch.queueDepthSub", locale, {
                  eta: insights.averageEtaMinutes,
                })
              : t("dispatch.queueDepthSubPending", locale)
          }
          accent="#1d4ed8"
        />
        <StatCard
          label={t("dispatch.activeOrders", locale)}
          value={formatCompactNumber(insights.activeOrders)}
          sub={t("dispatch.activeOrdersSub", locale)}
          accent="#7c3aed"
        />
        <StatCard
          label={t("dispatch.needsRedispatch", locale)}
          value={formatCompactNumber(insights.redispatchOrders)}
          sub={t("dispatch.needsRedispatchSub", locale, {
            count: insights.exceptionOrders,
          })}
          accent="#dc2626"
        />
        <StatCard
          label={t("dispatch.queuedRevenue", locale)}
          value={formatMinorCurrency(insights.queuedRevenueMinor)}
          sub={t("dispatch.queuedRevenueSub", locale)}
          accent="#15803d"
        />
        {forwarderSyncErrors.length > 0 && (
          <StatCard
            label={t("dispatch.forwarderSyncFailed", locale)}
            value={formatCompactNumber(forwarderSyncErrors.length)}
            sub={t("dispatch.forwarderSyncFailedSub", locale)}
            accent="#ea580c"
          />
        )}
      </div>

      <Card style={{ marginBottom: "20px" }}>
        <CardBody>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                border: "1px solid #dbeafe",
                borderRadius: "12px",
                padding: "14px 16px",
                background: "#f8fbff",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#64748b",
                  marginBottom: "6px",
                }}
              >
                {t("dispatch.view.owned", locale)}
              </div>
              <div
                style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}
              >
                {t("dispatch.page.ownedHeadline", locale)}
              </div>
              <div
                style={{ marginTop: "6px", fontSize: "13px", color: "#475569" }}
              >
                {t("dispatch.page.ownedSummary", locale, {
                  count: insights.exceptionOrders,
                })}
              </div>
            </div>
            <div
              style={{
                border: "1px solid #fde68a",
                borderRadius: "12px",
                padding: "14px 16px",
                background: "#fffbeb",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#92400e",
                  marginBottom: "6px",
                }}
              >
                {t("dispatch.view.forwarded", locale)}
              </div>
              <div
                style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}
              >
                {t("dispatch.page.forwardedHeadline", locale)}
              </div>
              <div
                style={{ marginTop: "6px", fontSize: "13px", color: "#78350f" }}
              >
                {t("dispatch.page.forwardedSummary", locale, {
                  count: forwarderSyncErrors.length,
                })}
              </div>
            </div>
          </div>
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "#1d4ed8",
              fontSize: "13.5px",
            }}
          >
            <strong>{t("dispatch.roleBoundary", locale)}:</strong>{" "}
            {t("dispatch.roleBoundaryText", locale)}
          </div>
          <div style={{ marginTop: "16px" }}>
            <DispatchWorkflow
              orders={orders}
              dispatchJobs={dispatchJobs}
              focusOrderId={focusOrderId}
            />
          </div>
        </CardBody>
      </Card>
    </>
  );
}
