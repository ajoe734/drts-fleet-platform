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

    return (
      <>
        <PageHeader
          title={t("dispatch.forwarded.title", locale)}
          subtitle={t("dispatch.forwarded.subtitle", locale)}
          actions={actions}
        />
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
