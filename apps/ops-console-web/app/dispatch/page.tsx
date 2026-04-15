import type { DispatchJobRecord, OwnedOrderRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import {
  buildDispatchInsights,
  formatCompactNumber,
  formatMinorCurrency,
} from "@/lib/ops-analytics";
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
    <main className="app-grid">
      <AppShellCard
        title="Dispatch Console"
        description="Schedule dispatch, candidate selection, queue triage, and redispatch handling for Phase 1 OpCo operations."
      >
        <section className="summary-grid">
          {[
            {
              label: "Queue depth",
              value: insights.queueDepth,
              note: insights.averageEtaMinutes
                ? `Average ETA ${insights.averageEtaMinutes} min`
                : "ETA pending",
            },
            {
              label: "Active orders",
              value: insights.activeOrders,
              note: "Realtime and reservation orders in flight",
            },
            {
              label: "Needs redispatch",
              value: insights.redispatchOrders,
              note: `${insights.exceptionOrders} exception hold order(s)`,
            },
            {
              label: "Queued revenue",
              value: formatMinorCurrency(insights.queuedRevenueMinor),
              note: "Quoted value still sitting in dispatch flow",
            },
          ].map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>
                {typeof card.value === "number"
                  ? formatCompactNumber(card.value)
                  : card.value}
              </strong>
              <small>{card.note}</small>
            </div>
          ))}
        </section>

        <div className="dispatch-note">
          <strong>Role boundary:</strong> OpCo performs assign / redispatch in
          Phase 1. ROC keeps a read-only monitoring posture, and Host visibility
          stays scoped to vehicle-specific outcomes.
        </div>

        <DispatchWorkflow
          orders={orders}
          dispatchJobs={dispatchJobs}
          focusOrderId={focusOrderId}
        />

        <style jsx>{`
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            gap: 0.75rem;
            margin-bottom: 1rem;
          }
          .summary-card {
            padding: 0.9rem 1rem;
            border-radius: 0.9rem;
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            display: grid;
            gap: 0.35rem;
          }
          .summary-card strong {
            font-size: 1.3rem;
          }
          .dispatch-note {
            margin-bottom: 1rem;
            padding: 0.9rem 1rem;
            border-radius: 0.9rem;
            background: #eff6ff;
            color: #1d4ed8;
          }
        `}</style>
      </AppShellCard>
    </main>
  );
}
