import type { CSSProperties } from "react";
import type {
  TenantApprovalRuleCondition,
  TenantApprovalRuleRecord,
  TenantCostCenterCoverageReport,
  TenantCostCenterRecord,
  TenantCostCenterQuotaSummary,
} from "@drts/contracts";
import {
  CanvasDL,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { CalloutPanel } from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const pageGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const coverageGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
};

const inlineStackStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const codePrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const secondaryTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

const unresolvedListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  color: th.text,
  display: "grid",
  gap: 6,
  fontSize: 12,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat("en");

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return numberFormatter.format(value);
}

function getActiveTone(activeFlag: boolean): CanvasTone {
  return activeFlag ? "success" : "neutral";
}

function getActiveLabel(activeFlag: boolean) {
  return activeFlag ? "active" : "disabled";
}

function compareCostCenters(
  a: TenantCostCenterRecord,
  b: TenantCostCenterRecord,
) {
  if (a.activeFlag !== b.activeFlag) {
    return a.activeFlag ? -1 : 1;
  }
  return a.code.localeCompare(b.code);
}

type CostCentersPageData = {
  costCenters: TenantCostCenterRecord[];
  coverage: TenantCostCenterCoverageReport | null;
  approvalRules: TenantApprovalRuleRecord[];
  quotaByCode: Map<string, TenantCostCenterQuotaSummary>;
  errors: string[];
};

async function loadCostCentersData(): Promise<CostCentersPageData> {
  const client = getTenantClient();
  const [costCentersResult, coverageResult, approvalRulesResult] =
    await Promise.allSettled([
      client.listCostCenters() as Promise<TenantCostCenterRecord[]>,
      client.getTenantCostCenterCoverageReport() as Promise<TenantCostCenterCoverageReport>,
      client.listApprovalRules({ activeOnly: true }) as Promise<
        TenantApprovalRuleRecord[]
      >,
    ]);
  const errors: string[] = [];

  const costCenters =
    costCentersResult.status === "fulfilled"
      ? [...costCentersResult.value].sort(compareCostCenters)
      : [];
  const coverage =
    coverageResult.status === "fulfilled" ? coverageResult.value : null;
  const approvalRules =
    approvalRulesResult.status === "fulfilled" ? approvalRulesResult.value : [];

  if (costCentersResult.status === "rejected") {
    errors.push(`成本中心目錄: ${toErrorMessage(costCentersResult.reason)}`);
  }
  if (coverageResult.status === "rejected") {
    errors.push(`覆蓋率摘要: ${toErrorMessage(coverageResult.reason)}`);
  }
  if (approvalRulesResult.status === "rejected") {
    errors.push(`審批規則: ${toErrorMessage(approvalRulesResult.reason)}`);
  }

  const quotaByCode = new Map<string, TenantCostCenterQuotaSummary>();
  if (costCenters.length > 0) {
    const quotaResults = await Promise.allSettled(
      costCenters.map(async (costCenter) => ({
        code: costCenter.code,
        summary: await client.getTenantCostCenterQuota(costCenter.code),
      })),
    );

    quotaResults.forEach((result, index) => {
      const code = costCenters[index]?.code ?? "unknown";
      if (result.status === "fulfilled") {
        quotaByCode.set(result.value.code, result.value.summary);
        return;
      }
      errors.push(`配額摘要 ${code}: ${toErrorMessage(result.reason)}`);
    });
  }

  return { costCenters, coverage, approvalRules, quotaByCode, errors };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

type CostCenterRow = TenantCostCenterRecord & {
  quotaSummary: TenantCostCenterQuotaSummary | null;
  approvalSummary: ReturnType<typeof summarizeApprovalRulesForCostCenter>;
} & Record<string, unknown>;

function formatQuotaLimit(summary: TenantCostCenterQuotaSummary | null) {
  if (!summary) return "—";

  if (summary.limit.bookingCountLimit !== null) {
    return `${formatCount(summary.limit.bookingCountLimit)} 趟 / 月`;
  }

  if (summary.limit.amountMinorLimit !== null) {
    return `${summary.limit.currency} ${formatCount(summary.limit.amountMinorLimit / 100)} / 月`;
  }

  return "無上限";
}

function formatQuotaUsage(summary: TenantCostCenterQuotaSummary | null) {
  if (!summary) return "—";

  if (summary.limit.bookingCountLimit !== null) {
    const used =
      summary.usage.confirmedBookingCount + summary.usage.pendingReservedBookingCount;
    return `${formatCount(used)} 已用 · ${formatCount(summary.usage.bookingCountRemaining)} 剩餘`;
  }

  if (summary.limit.amountMinorLimit !== null) {
    const usedMinor =
      summary.usage.confirmedAmountMinor + summary.usage.pendingReservedAmountMinor;
    const remainingMinor =
      summary.usage.amountMinorRemaining === null
        ? null
        : summary.usage.amountMinorRemaining / 100;
    return `${summary.limit.currency} ${formatCount(usedMinor / 100)} 已用 · ${formatCount(remainingMinor)} 剩餘`;
  }

  return "無上限";
}

function getQuotaRemainingPercent(summary: TenantCostCenterQuotaSummary | null) {
  if (!summary || summary.usage.remainingPercent === null) return "—";
  return `${summary.usage.remainingPercent}% 剩餘`;
}

function getQuotaTone(summary: TenantCostCenterQuotaSummary | null): CanvasTone {
  if (!summary) return "neutral";

  if (
    summary.usage.bookingCountRemaining !== null &&
    summary.usage.bookingCountRemaining <= 0
  ) {
    return "warn";
  }

  if (
    summary.usage.amountMinorRemaining !== null &&
    summary.usage.amountMinorRemaining <= 0
  ) {
    return "warn";
  }

  if (
    summary.usage.remainingPercent !== null &&
    summary.usage.remainingPercent <= 20
  ) {
    return "accent";
  }

  return "info";
}

function conditionReferencesCostCenter(
  condition: TenantApprovalRuleCondition,
  code: string,
) {
  if (condition.field !== "cost_center.code") return false;

  const scalarValues = [
    condition.value,
    ...(condition.values ?? []),
  ].flatMap((value) => (Array.isArray(value) ? value : [value]));

  return scalarValues.some((value) => value === code);
}

function summarizeApprovalRulesForCostCenter(
  costCenterCode: string,
  rules: readonly TenantApprovalRuleRecord[],
) {
  const scopedRules = rules.filter((rule) => {
    if (!rule.activeFlag) return false;

    if (rule.conditions.some((condition) => conditionReferencesCostCenter(condition, costCenterCode))) {
      return true;
    }

    if (
      rule.approvers.some(
        (approver) =>
          approver.kind === "cost_center_owner" &&
          approver.costCenterCode === costCenterCode,
      )
    ) {
      return true;
    }

    return false;
  });

  const strictCount = scopedRules.filter(
    (rule) => rule.action === "require_approval" || rule.action === "block",
  ).length;
  const ownerApprovalCount = scopedRules.filter((rule) =>
    rule.approvers.some(
      (approver) =>
        approver.kind === "cost_center_owner" &&
        approver.costCenterCode === costCenterCode,
    ),
  ).length;

  return {
    totalCount: scopedRules.length,
    strictCount,
    ownerApprovalCount,
  };
}

function getApprovalTone(
  summary: ReturnType<typeof summarizeApprovalRulesForCostCenter>,
): CanvasTone {
  if (summary.strictCount > 0) return "warn";
  if (summary.totalCount > 0) return "info";
  return "neutral";
}

function getApprovalLabel(
  summary: ReturnType<typeof summarizeApprovalRulesForCostCenter>,
) {
  if (summary.totalCount === 0) return "tenant fallback";
  if (summary.strictCount > 0) {
    return `${summary.strictCount} require approval`;
  }
  return `${summary.totalCount} active rule`;
}

export default async function CostCentersPage() {
  const { costCenters, coverage, approvalRules, quotaByCode, errors } =
    await loadCostCentersData();

  const rows: CostCenterRow[] = costCenters.map((costCenter) => ({
    ...costCenter,
    quotaSummary: quotaByCode.get(costCenter.code) ?? null,
    approvalSummary: summarizeApprovalRulesForCostCenter(
      costCenter.code,
      approvalRules,
    ),
  }));

  const activeCount = costCenters.filter((costCenter) => costCenter.activeFlag).length;
  const disabledCount = costCenters.length - activeCount;
  const unresolvedCount = coverage?.unresolvedCount ?? 0;
  const strictRuleCount = approvalRules.filter(
    (rule) => rule.activeFlag && (rule.action === "require_approval" || rule.action === "block"),
  ).length;

  const columns: CanvasTableColumn<CostCenterRow>[] = [
    {
      h: "CODE",
      k: "code",
      w: 140,
      mono: true,
      r: (row) => <span style={codePrimaryStyle}>{row.code}</span>,
    },
    {
      h: "NAME",
      k: "name",
      w: 220,
      r: (row) => (
        <div style={inlineStackStyle}>
          <span style={codePrimaryStyle}>{row.name}</span>
          <span style={secondaryTextStyle}>
            {row.description ?? "配額分組與報表歸屬沿用 canonical directory record。"}
          </span>
        </div>
      ),
    },
    {
      h: "OWNER",
      w: 160,
      r: (row) => (
        <div style={inlineStackStyle}>
          <span>{row.ownerName ?? "—"}</span>
          <span style={secondaryTextStyle}>
            updated · {formatUpdated(row.updatedAt)}
          </span>
        </div>
      ),
    },
    {
      h: "QUOTA",
      w: 180,
      r: (row) => (
        <div style={inlineStackStyle}>
          <div style={pillRowStyle}>
            <CanvasPill theme={th} tone={getQuotaTone(row.quotaSummary)}>
              {row.quotaSummary?.limit.enforcementMode ?? "—"}
            </CanvasPill>
            {row.quotaSummary?.inheritedFromTenant ? (
              <CanvasPill theme={th} tone="neutral">
                inherited
              </CanvasPill>
            ) : null}
          </div>
          <span>{formatQuotaLimit(row.quotaSummary)}</span>
          <span style={secondaryTextStyle}>
            {getQuotaRemainingPercent(row.quotaSummary)}
          </span>
        </div>
      ),
    },
    {
      h: "USED",
      w: 180,
      r: (row) => (
        <div style={inlineStackStyle}>
          <span>{formatQuotaUsage(row.quotaSummary)}</span>
          <span style={secondaryTextStyle}>
            confirmed {formatCount(row.quotaSummary?.usage.confirmedBookingCount)}
            {" · "}pending{" "}
            {formatCount(row.quotaSummary?.usage.pendingReservedBookingCount)}
          </span>
        </div>
      ),
    },
    {
      h: "APPROVAL",
      w: 170,
      r: (row) => (
        <div style={inlineStackStyle}>
          <div style={pillRowStyle}>
            <CanvasPill
              theme={th}
              tone={getApprovalTone(row.approvalSummary)}
            >
              {getApprovalLabel(row.approvalSummary)}
            </CanvasPill>
          </div>
          <span style={secondaryTextStyle}>
            {row.approvalSummary.ownerApprovalCount > 0
              ? `${row.approvalSummary.ownerApprovalCount} owner-linked approver rule`
              : "No cost-center-owner approver binding"}
          </span>
        </div>
      ),
    },
    {
      h: "STATE",
      w: 110,
      r: (row) => (
        <div style={inlineStackStyle}>
          <CanvasPill theme={th} tone={getActiveTone(row.activeFlag)} dot>
            {getActiveLabel(row.activeFlag)}
          </CanvasPill>
          <span style={secondaryTextStyle}>
            {row.disabledReason ?? "目錄可用"}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="成本中心目錄"
        subtitle="read-only parity surface · 目錄、配額姿態、覆蓋率與審批規則一起檢視"
      />

      <div style={pageBodyStyle}>
        {errors.length > 0 ? (
          <CalloutPanel
            title="部分成本中心治理資料無法載入"
            description={errors.join(" · ")}
            tone="warning"
          />
        ) : null}

        <div style={pageGridStyle}>
          <CanvasCard
            theme={th}
            title="治理摘要"
            subtitle="目錄規模 · unresolved coverage · active approval posture"
          >
            <div style={summaryGridStyle}>
              <CanvasKPI
                theme={th}
                label="Active"
                value={formatCount(activeCount)}
                sub="可用成本中心"
              />
              <CanvasKPI
                theme={th}
                label="Disabled"
                value={formatCount(disabledCount)}
                sub="停用但仍保留歷史歸屬"
              />
              <CanvasKPI
                theme={th}
                label="Coverage"
                value={formatCount(unresolvedCount)}
                sub="unresolved booking samples"
              />
              <CanvasKPI
                theme={th}
                label="Approval"
                value={formatCount(strictRuleCount)}
                sub="require approval / block rules"
              />
            </div>
          </CanvasCard>

          <div style={coverageGridStyle}>
            <CanvasCard
              theme={th}
              title="配額與覆蓋率"
              subtitle="coverage helper 讓目錄缺口能在同一頁被看見"
            >
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    k: "Total bookings",
                    v: coverage ? formatCount(coverage.totalBookings) : "—",
                    mono: true,
                  },
                  {
                    k: "Resolved",
                    v: coverage ? formatCount(coverage.resolvedCount) : "—",
                    mono: true,
                  },
                  {
                    k: "Unresolved",
                    v: coverage ? formatCount(coverage.unresolvedCount) : "—",
                    mono: true,
                  },
                  {
                    k: "Disabled hits",
                    v: coverage ? formatCount(coverage.disabledHits) : "—",
                    mono: true,
                  },
                  {
                    k: "Generated",
                    v: coverage ? formatUpdated(coverage.generatedAt) : "—",
                    mono: true,
                  },
                  {
                    k: "Active rules",
                    v: formatCount(approvalRules.filter((rule) => rule.activeFlag).length),
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Unresolved booking samples"
              subtitle="read-only parity 只暴露缺口，不在此頁發明修復指令"
            >
              {coverage && coverage.unresolvedSamples.length > 0 ? (
                <ol style={unresolvedListStyle}>
                  {coverage.unresolvedSamples.slice(0, 5).map((sample) => (
                    <li key={sample.rawCostCenter}>
                      <div style={inlineStackStyle}>
                        <span style={codePrimaryStyle}>{sample.rawCostCenter}</span>
                        <span style={secondaryTextStyle}>
                          {formatCount(sample.occurrences)} booking hit
                          {sample.occurrences === 1 ? "" : "s"}
                          {sample.suggestion
                            ? ` · suggestion ${sample.suggestion}`
                            : ""}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div style={secondaryTextStyle}>
                  目前沒有 unresolved booking samples，目錄覆蓋率可接受。
                </div>
              )}
            </CanvasCard>
          </div>

          <CanvasCard
            theme={th}
            title="成本中心目錄"
            subtitle="Code · Name · Owner · Quota · Used · Approval · State"
            padding={0}
          >
            {rows.length > 0 ? (
              <CanvasTable<CostCenterRow>
                theme={th}
                columns={columns}
                rows={rows}
              />
            ) : (
              <div
                style={{
                  padding: 24,
                  color: th.textMuted,
                  fontSize: 12.5,
                  textAlign: "center",
                }}
              >
                尚無成本中心目錄資料。
              </div>
            )}
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
