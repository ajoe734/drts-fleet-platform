import type {
  TenantApprovalRuleCondition,
  TenantApprovalRuleRecord,
  TenantCostCenterCoverageReport,
  TenantCostCenterQuotaSummary,
  TenantCostCenterRecord,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

type CostCenterData = {
  costCenters: TenantCostCenterRecord[];
  coverage: TenantCostCenterCoverageReport | null;
  quotaByCode: Record<string, TenantCostCenterQuotaSummary>;
  rules: TenantApprovalRuleRecord[];
  errors: string[];
};

type ApprovalSummary = {
  title: string;
  detail: string;
  tone: "default" | "warning";
};

async function loadCostCenterData(): Promise<CostCenterData> {
  const client = getTenantClient();
  const [costCentersResult, coverageResult, rulesResult] =
    await Promise.allSettled([
      client.listCostCenters() as Promise<TenantCostCenterRecord[]>,
      client.getTenantCostCenterCoverageReport() as Promise<TenantCostCenterCoverageReport>,
      client.listApprovalRules({ activeOnly: true }) as Promise<
        TenantApprovalRuleRecord[]
      >,
    ] as const);

  const errors: string[] = [];

  if (costCentersResult.status === "rejected") {
    errors.push(`Cost centers: ${toErrorMessage(costCentersResult.reason)}`);
  }
  if (coverageResult.status === "rejected") {
    errors.push(`Coverage report: ${toErrorMessage(coverageResult.reason)}`);
  }
  if (rulesResult.status === "rejected") {
    errors.push(`Approval rules: ${toErrorMessage(rulesResult.reason)}`);
  }

  const costCenters =
    costCentersResult.status === "fulfilled"
      ? [...costCentersResult.value].sort(compareCostCenters)
      : [];
  const quotaByCode: Record<string, TenantCostCenterQuotaSummary> = {};

  if (costCenters.length > 0) {
    const quotaResults = await Promise.allSettled(
      costCenters.map(async (costCenter) => ({
        code: costCenter.code,
        summary: (await client.getTenantCostCenterQuota(
          costCenter.code,
        )) as TenantCostCenterQuotaSummary,
      })),
    );

    for (const result of quotaResults) {
      if (result.status === "fulfilled") {
        quotaByCode[result.value.code] = result.value.summary;
        continue;
      }

      errors.push(`Quota summary: ${toErrorMessage(result.reason)}`);
    }
  }

  return {
    costCenters,
    coverage:
      coverageResult.status === "fulfilled" ? coverageResult.value : null,
    quotaByCode,
    rules: rulesResult.status === "fulfilled" ? rulesResult.value : [],
    errors,
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function compareCostCenters(
  left: TenantCostCenterRecord,
  right: TenantCostCenterRecord,
) {
  if (left.activeFlag !== right.activeFlag) {
    return left.activeFlag ? -1 : 1;
  }
  return left.code.localeCompare(right.code);
}

function getRuleName(rule: TenantApprovalRuleRecord) {
  return rule.ruleName ?? rule.name ?? rule.ruleId;
}

function getConditionValues(condition: TenantApprovalRuleCondition) {
  const values = Array.isArray(condition.values)
    ? condition.values
    : Array.isArray(condition.value)
      ? condition.value
      : condition.value === undefined || condition.value === null
        ? []
        : [condition.value];

  return values.map((value) => String(value).trim().toLowerCase());
}

function matchesExplicitCostCenter(
  rule: TenantApprovalRuleRecord,
  costCenterCode: string,
) {
  const normalizedCode = costCenterCode.trim().toLowerCase();
  return rule.conditions.some(
    (condition) =>
      condition.field === "cost_center.code" &&
      getConditionValues(condition).includes(normalizedCode),
  );
}

function usesCostCenterOwner(rule: TenantApprovalRuleRecord) {
  return rule.approvers.some(
    (approver) => approver.kind === "cost_center_owner",
  );
}

function usesSharedCostCenterSignal(rule: TenantApprovalRuleRecord) {
  return rule.conditions.some((condition) =>
    condition.field.startsWith("cost_center."),
  );
}

function describeEnforcementMode(
  mode: TenantCostCenterQuotaSummary["limit"]["enforcementMode"],
) {
  switch (mode) {
    case "hard_block":
      return "Hard block";
    case "require_approval":
      return "Needs approval";
    case "warn_only":
    default:
      return "Warn only";
  }
}

function formatCurrencyMinor(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "No % limit";
  }
  return `${Math.round(value)}%`;
}

function formatQuotaLimit(summary: TenantCostCenterQuotaSummary) {
  const parts: string[] = [];
  if (summary.limit.bookingCountLimit !== null) {
    parts.push(`${formatCount(summary.limit.bookingCountLimit)} rides`);
  }
  if (summary.limit.amountMinorLimit !== null) {
    parts.push(
      formatCurrencyMinor(
        summary.limit.amountMinorLimit,
        summary.limit.currency,
      ),
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "No hard limit";
}

function formatQuotaUsage(summary: TenantCostCenterQuotaSummary) {
  const totalBookings =
    summary.usage.pendingReservedBookingCount +
    summary.usage.confirmedBookingCount;
  const totalAmount =
    summary.usage.pendingReservedAmountMinor +
    summary.usage.confirmedAmountMinor;

  return {
    primary: `${formatCount(totalBookings)} rides · ${formatCurrencyMinor(
      totalAmount,
      summary.limit.currency,
    )}`,
    secondary: [
      summary.usage.bookingCountRemaining !== null
        ? `${formatCount(summary.usage.bookingCountRemaining)} rides left`
        : null,
      summary.usage.amountMinorRemaining !== null
        ? `${formatCurrencyMinor(
            summary.usage.amountMinorRemaining,
            summary.limit.currency,
          )} left`
        : null,
      `${formatPercent(summary.usage.remainingPercent)} remaining`,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" · "),
  };
}

function buildApprovalSummary(
  costCenter: TenantCostCenterRecord,
  rules: TenantApprovalRuleRecord[],
): ApprovalSummary {
  const explicitRules = rules.filter((rule) =>
    matchesExplicitCostCenter(rule, costCenter.code),
  );
  if (explicitRules.length > 0) {
    const topRules = explicitRules
      .slice(0, 2)
      .map((rule) => getRuleName(rule))
      .join(" · ");
    return {
      title: `${formatCount(explicitRules.length)} code-targeted rule(s)`,
      detail: topRules,
      tone: "default",
    };
  }

  const ownerRules = rules.filter((rule) => usesCostCenterOwner(rule));
  if (ownerRules.length > 0) {
    return {
      title: "Shared owner-based rules",
      detail: costCenter.ownerUserId
        ? "At least one active rule can resolve approvers through this directory owner."
        : "Owner-driven rules exist, but this cost center has no owner user assigned yet.",
      tone: costCenter.ownerUserId ? "default" : "warning",
    };
  }

  const sharedCostCenterRules = rules.filter((rule) =>
    usesSharedCostCenterSignal(rule),
  );
  if (sharedCostCenterRules.length > 0) {
    return {
      title: `${formatCount(sharedCostCenterRules.length)} shared governance rule(s)`,
      detail:
        "Active rules inspect cost-center fields, but none target this code directly.",
      tone: "default",
    };
  }

  return {
    title: "No cost-center rule linkage",
    detail:
      "This directory row has no active approval-rule signal in the published rule list yet.",
    tone: "warning",
  };
}

export default async function CostCentersPage() {
  const data = await loadCostCenterData();
  const activeCount = data.costCenters.filter((row) => row.activeFlag).length;
  const assignedOwnerCount = data.costCenters.filter(
    (row) => row.ownerUserId || row.ownerName,
  ).length;
  const directQuotaCount = data.costCenters.filter((row) => {
    const summary = data.quotaByCode[row.code];
    return summary ? !summary.inheritedFromTenant : false;
  }).length;
  const ownerRuleCount = data.rules.filter((rule) =>
    usesCostCenterOwner(rule),
  ).length;
  const explicitRuleCount = data.rules.filter((rule) =>
    rule.conditions.some((condition) => condition.field === "cost_center.code"),
  ).length;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Cost centers"
        title="Tenant cost centers now read from the published directory, quota, and coverage contracts."
        description="This route composes `/api/tenant/cost-centers`, per-code quota summaries, the coverage report, and active approval-rule metadata without inventing an unpublished editor or a hidden policy model."
      />

      {data.errors.length > 0 ? (
        <CalloutPanel
          title="Some governance data could not be loaded"
          description="The route keeps whatever the published tenant contract returned and surfaces missing slices explicitly instead of backfilling UI-local truth."
          tone="warning"
        >
          <ul className="panel-list">
            {data.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutPanel>
      ) : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Cost centers</span>
          <strong>{formatCount(data.costCenters.length)}</strong>
          <p>Directory rows currently published for the tenant scope.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Active</span>
          <strong>{formatCount(activeCount)}</strong>
          <p>Cost centers still eligible for new booking usage.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Owners assigned</span>
          <strong>{formatCount(assignedOwnerCount)}</strong>
          <p>Rows with an owner reference available to rules and operators.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Coverage unresolved</span>
          <strong>{formatCount(data.coverage?.unresolvedCount ?? 0)}</strong>
          <p>
            Legacy booking values still missing a canonical directory match.
          </p>
        </article>
      </section>

      <SurfaceCard
        kicker="Directory"
        title="Cost-center roster"
        description="Quota cells come from `GET /api/tenant/cost-centers/:code/quota`. Approval cells summarize only active rules that explicitly target the code or resolve via the cost-center owner."
      >
        <div className="chip-row">
          <span className="status-chip is-active">
            All · {formatCount(data.costCenters.length)}
          </span>
          <span className="status-chip">
            Active · {formatCount(activeCount)}
          </span>
          <span className="status-chip">
            Direct quota policies · {formatCount(directQuotaCount)}
          </span>
          <span className="status-chip">
            Owner-based rules · {formatCount(ownerRuleCount)}
          </span>
        </div>

        {data.costCenters.length > 0 ? (
          <div className="table-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Quota</th>
                  <th>Used now</th>
                  <th>Approval</th>
                  <th>State</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.costCenters.map((costCenter) => {
                  const quotaSummary = data.quotaByCode[costCenter.code];
                  const usage = quotaSummary
                    ? formatQuotaUsage(quotaSummary)
                    : null;
                  const approval = buildApprovalSummary(costCenter, data.rules);

                  return (
                    <tr key={costCenter.code}>
                      <td>
                        <div className="table-primary">
                          {costCenter.code}
                          <span className="table-secondary">
                            {costCenter.activeFlag ? "Active" : "Disabled"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          {costCenter.name}
                          <span className="table-secondary">
                            {costCenter.description ??
                              "No description published"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-primary">
                          {costCenter.ownerName ?? "Unassigned"}
                          <span className="table-secondary">
                            {costCenter.ownerUserId ?? "No owner user id"}
                          </span>
                        </div>
                      </td>
                      <td>
                        {quotaSummary ? (
                          <div className="table-primary">
                            {formatQuotaLimit(quotaSummary)}
                            <span className="table-secondary">
                              {quotaSummary.inheritedFromTenant
                                ? "Inherited from tenant"
                                : "Cost-center override"}{" "}
                              ·{" "}
                              {describeEnforcementMode(
                                quotaSummary.limit.enforcementMode,
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="muted-copy">Unavailable</span>
                        )}
                      </td>
                      <td>
                        {usage ? (
                          <div className="table-primary">
                            {usage.primary}
                            <span className="table-secondary">
                              {usage.secondary}
                            </span>
                          </div>
                        ) : (
                          <span className="muted-copy">Unavailable</span>
                        )}
                      </td>
                      <td>
                        <div className="table-primary">
                          {approval.title}
                          <span className="table-secondary">
                            {approval.detail}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            costCenter.activeFlag
                              ? "status-chip is-active"
                              : approval.tone === "warning"
                                ? "status-chip is-warning"
                                : "status-chip"
                          }
                        >
                          {costCenter.activeFlag ? "active" : "disabled"}
                        </span>
                      </td>
                      <td>{formatDateTime(costCenter.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-panel">
            No tenant cost-center rows are currently visible from the published
            directory contract.
          </div>
        )}
      </SurfaceCard>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Coverage"
          title="Legacy booking coverage report"
          description="The report stays read-only and surfaces where historical booking values still need a canonical directory match."
        >
          {data.coverage ? (
            <>
              <dl className="definition-grid">
                <div>
                  <dt>Total bookings</dt>
                  <dd>{formatCount(data.coverage.totalBookings)}</dd>
                </div>
                <div>
                  <dt>Resolved</dt>
                  <dd>{formatCount(data.coverage.resolvedCount)}</dd>
                </div>
                <div>
                  <dt>Unresolved</dt>
                  <dd>{formatCount(data.coverage.unresolvedCount)}</dd>
                </div>
                <div>
                  <dt>Disabled hits</dt>
                  <dd>{formatCount(data.coverage.disabledHits)}</dd>
                </div>
              </dl>

              {data.coverage.unresolvedSamples.length > 0 ? (
                <div className="panel-stack">
                  {data.coverage.unresolvedSamples.slice(0, 5).map((sample) => (
                    <div key={sample.rawCostCenter} className="timeline-item">
                      <strong>{sample.rawCostCenter}</strong>
                      <p>
                        {formatCount(sample.occurrences)} booking(s) ·
                        suggestion {sample.suggestion ?? "not available"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-panel">
                  No unresolved legacy values are currently reported.
                </div>
              )}
            </>
          ) : (
            <div className="empty-panel">
              Coverage data is not currently available for this tenant.
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard
          kicker="Approval posture"
          title="Cross-slice rule signal"
          description="Approval remains governed by the dedicated approval-rule contract. This page only summarizes active rule linkage that can be proven from published rule conditions and approver descriptors."
        >
          <dl className="definition-grid">
            <div>
              <dt>Active rules</dt>
              <dd>{formatCount(data.rules.length)}</dd>
            </div>
            <div>
              <dt>Code-targeted rules</dt>
              <dd>{formatCount(explicitRuleCount)}</dd>
            </div>
            <div>
              <dt>Owner-based rules</dt>
              <dd>{formatCount(ownerRuleCount)}</dd>
            </div>
            <div>
              <dt>Quota overrides</dt>
              <dd>{formatCount(directQuotaCount)}</dd>
            </div>
          </dl>

          {data.rules.length > 0 ? (
            <div className="panel-stack">
              {data.rules.slice(0, 4).map((rule) => (
                <div key={rule.ruleId} className="timeline-item">
                  <strong>{getRuleName(rule)}</strong>
                  <p>
                    Priority {formatCount(rule.priority)} · action {rule.action}{" "}
                    ·{" "}
                    {rule.approvers.length > 0
                      ? `${formatCount(rule.approvers.length)} approver descriptor(s)`
                      : "no approver descriptors"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-panel">
              No active approval rules are currently published for this tenant.
            </div>
          )}
        </SurfaceCard>
      </section>

      <CalloutPanel
        title="Command boundary"
        description="`UpsertTenantCostCenterCommand` and `DisableTenantCostCenterCommand` are published, but this parity route remains read-only. The route visualizes the now-canonical directory and governance read models without inventing inline mutations or an unpublished rule editor."
      />
    </div>
  );
}
