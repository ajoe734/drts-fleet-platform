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
import {
  AuthorityBadge,
  Card,
  CardBody,
  managementSurfaceTone,
} from "@drts/ui-web";
import { DispatchWorkflow } from "./dispatch-workflow";
import {
  DISPATCH_VIEW_ORDER,
  getDispatchViewHref,
  getDispatchViewLabelKey,
  isGovernanceScopedOrder,
  isNoSupplyScopedOrder,
  resolveDispatchView,
  toOwnedDispatchBoardMode,
  type DispatchView,
} from "./dispatch-view-model";
import { ForwardedOrderBoard } from "./forwarded-order-board";

type DispatchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

function actionLinkStyle(view: DispatchView, active = false) {
  const tone =
    view === "forwarded"
      ? managementSurfaceTone("forwarded")
      : view === "owned"
        ? managementSurfaceTone("owned")
        : managementSurfaceTone("warning");

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    border: `1px solid ${active ? tone.border : "#d7dde8"}`,
    background: active ? tone.background : "#ffffff",
    color: active ? tone.text : "#334155",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 700,
    textDecoration: "none",
    whiteSpace: "nowrap" as const,
    boxShadow: active ? `inset 0 0 0 1px ${tone.border}` : "none",
  };
}

function summaryCardStyle(background: string, border: string, color: string) {
  return {
    border: `1px solid ${border}`,
    borderRadius: "16px",
    padding: "16px 18px",
    background,
    color,
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
  const view = resolveDispatchView(firstParam(resolvedSearchParams?.view));
  const focusOrderId = firstParam(resolvedSearchParams?.orderId) ?? "";
  const actions = (
    <>
      {DISPATCH_VIEW_ORDER.map((tabView) => (
        <Link
          key={tabView}
          href={getDispatchViewHref(tabView)}
          style={actionLinkStyle(tabView, view === tabView)}
        >
          {t(getDispatchViewLabelKey(tabView), locale)}
        </Link>
      ))}
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
  const ownedBoardMode = toOwnedDispatchBoardMode(view);
  const orderJobMap = dispatchJobs.reduce(
    (acc, job) => {
      acc[job.orderId] = job;
      return acc;
    },
    {} as Record<string, DispatchJobRecord>,
  );
  const governanceScopedCount = orders.filter((order) =>
    isGovernanceScopedOrder(order, orderJobMap[order.orderId]),
  ).length;
  const noSupplyScopedCount = orders.filter((order) =>
    isNoSupplyScopedOrder(order, orderJobMap[order.orderId]),
  ).length;
  const activeSummary =
    view === "governance"
      ? {
          category: "ops" as const,
          tone: "warning" as const,
          label: t("dispatch.page.governanceAuthority", locale),
          headline: t("dispatch.page.governanceHeadline", locale),
          summary: t("dispatch.page.governanceSummary", locale, {
            count: governanceScopedCount,
          }),
          palette: managementSurfaceTone("warning"),
        }
      : view === "no_supply"
        ? {
            category: "queue" as const,
            tone: "warning" as const,
            label: t("dispatch.page.noSupplyAuthority", locale),
            headline: t("dispatch.page.noSupplyHeadline", locale),
            summary: t("dispatch.page.noSupplySummary", locale, {
              count: noSupplyScopedCount,
            }),
            palette: managementSurfaceTone("warning"),
          }
        : {
            category: "owned" as const,
            tone: "info" as const,
            label: t("dispatch.page.ownedAuthority", locale),
            headline: t("dispatch.page.ownedHeadline", locale),
            summary: t("dispatch.page.ownedSummary", locale, {
              count: insights.exceptionOrders,
            }),
            palette: managementSurfaceTone("owned"),
          };
  const ownedPageSubtitle =
    view === "governance"
      ? t("dispatch.governance.subtitle", locale)
      : view === "no_supply"
        ? t("dispatch.noSupply.subtitle", locale)
        : t("dispatch.subtitle", locale);

  return (
    <>
      <PageHeader
        title={t("dispatch.title", locale)}
        subtitle={ownedPageSubtitle}
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
              ...summaryCardStyle(
                activeSummary.palette.background,
                activeSummary.palette.border,
                activeSummary.palette.text,
              ),
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                letterSpacing: "0.06em",
                marginBottom: "8px",
              }}
            >
              <AuthorityBadge
                category={activeSummary.category}
                label={activeSummary.label}
                tone={activeSummary.tone}
              />
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>
              {activeSummary.headline}
            </div>
            <div style={{ marginTop: "6px", fontSize: "13px", opacity: 0.9 }}>
              {activeSummary.summary}
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
              key={ownedBoardMode}
              orders={orders}
              dispatchJobs={dispatchJobs}
              focusOrderId={focusOrderId}
              mode={ownedBoardMode}
            />
          </div>
        </CardBody>
      </Card>
    </>
  );
}
