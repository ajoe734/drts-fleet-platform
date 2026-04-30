import type {
  DispatchJobRecord,
  ForwardedOrderRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
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

export default async function DispatchPage({
  searchParams,
}: DispatchPageProps) {
  const client = getOpsClient();
  const [
    orders,
    dispatchJobs,
    forwarderSyncErrors,
    locale,
    resolvedSearchParams,
  ] = await Promise.all([
    resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
    resolveOrFallback(
      () => client.listDispatchJobs(),
      [] as DispatchJobRecord[],
    ),
    resolveOrFallback(
      () => client.listForwarderSyncErrors(),
      [] as ForwardedOrderRecord[],
    ),
    getServerLocale(),
    (searchParams ??
      Promise.resolve(
        {} as Record<string, string | string[] | undefined>,
      )) as Promise<Record<string, string | string[] | undefined>>,
  ]);
  const focusOrderId = firstParam(resolvedSearchParams?.orderId) ?? "";
  const insights = buildDispatchInsights(orders, dispatchJobs);

  return (
    <>
      <PageHeader
        title={t("dispatch.title", locale)}
        subtitle={t("dispatch.subtitle", locale)}
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
