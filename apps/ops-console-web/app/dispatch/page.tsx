import type { DispatchJobRecord, OwnedOrderRecord } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
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
  searchParams?: Record<string, string | string[] | undefined>;
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
  const [orders, dispatchJobs] = await Promise.all([
    resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
    resolveOrFallback(
      () => client.listDispatchJobs(),
      [] as DispatchJobRecord[],
    ),
  ]);
  const focusOrderId = firstParam(searchParams?.orderId) ?? "";
  const insights = buildDispatchInsights(orders, dispatchJobs);

  return (
    <>
      <PageHeader
        title="Dispatch Console"
        subtitle="Queue triage, candidate selection, and redispatch handling"
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
          label="Queue Depth"
          value={formatCompactNumber(insights.queueDepth)}
          sub={
            insights.averageEtaMinutes
              ? `Avg ETA ${insights.averageEtaMinutes} min`
              : "ETA pending"
          }
          accent="#1d4ed8"
        />
        <StatCard
          label="Active Orders"
          value={formatCompactNumber(insights.activeOrders)}
          sub="Realtime and reservation in flight"
          accent="#7c3aed"
        />
        <StatCard
          label="Needs Redispatch"
          value={formatCompactNumber(insights.redispatchOrders)}
          sub={`${insights.exceptionOrders} exception hold`}
          accent="#dc2626"
        />
        <StatCard
          label="Queued Revenue"
          value={formatMinorCurrency(insights.queuedRevenueMinor)}
          sub="Still in dispatch flow"
          accent="#15803d"
        />
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
            <strong>Role boundary:</strong> OpCo performs assign / redispatch in
            Phase 1. ROC keeps a read-only monitoring posture. Host visibility
            is scoped to its own vehicles.
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
