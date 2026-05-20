import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityReviewQueueItem,
  VehicleContractRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
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
  type CanvasTone,
} from "@drts/ui-web";

type ContractKind = "fleet_lease" | "partner_program" | "forwarder";

type ContractRow = Record<string, unknown> & {
  contractId: string;
  contractLabel: string;
  counterparty: string;
  counterpartyMeta: string;
  kind: ContractKind;
  kindLabel: string;
  termLabel: string;
  termMeta: string;
  revenueShare: string;
  revenueMeta: string;
  status: VehicleContractRecord["status"];
  statusLabel: string;
  statusMeta: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageStackStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const contentGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.65fr) minmax(300px, 0.85fr)",
  gap: 14,
  alignItems: "start",
};

const panelStackStyle = {
  display: "grid",
  gap: 14,
};

const filterRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
};

const helperTextStyle = {
  margin: 0,
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.55,
};

const queueItemStyle = {
  display: "grid",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
};

function contractStatusTone(status: VehicleContractRecord["status"]): CanvasTone {
  if (status === "active") return "success";
  if (status === "terminated") return "danger";
  return "warn";
}

function kindTone(kind: ContractKind): CanvasTone {
  if (kind === "forwarder") return "accent";
  if (kind === "partner_program") return "info";
  return "neutral";
}

function eligibilityStatusTone(
  status: PartnerEligibilityReviewQueueItem["verificationStatus"],
): CanvasTone {
  if (status === "manual_review") return "warn";
  if (status === "ineligible") return "danger";
  return "neutral";
}

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return t("common.dash", locale);
  return new Date(value).toLocaleString(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatTerm(startAt: string, endAt: string, locale: Locale) {
  const start = formatDateTime(startAt, locale).replace(",", "");
  const end = formatDateTime(endAt, locale).replace(",", "");
  return `${start} -> ${end}`;
}

function formatRequestedBy(
  item: PartnerEligibilityReviewQueueItem,
  locale: Locale,
) {
  if (!item.manualFallback.required) {
    return t("contracts.reviewRequestedBy.none", locale);
  }

  if (item.manualFallback.requestedBy === "system:auto_fallback") {
    return t("contracts.reviewRequestedBy.system:auto_fallback", locale);
  }

  return item.manualFallback.requestedBy ?? t("common.dash", locale);
}

function formatContext(item: PartnerEligibilityReviewQueueItem, locale: Locale) {
  const parts: string[] = [];
  if (item.requestHints.cardLast4) {
    parts.push(
      t("contracts.reviewContext.cardLast4", locale, {
        value: item.requestHints.cardLast4,
      }),
    );
  }
  if (item.requestHints.flightNo) {
    parts.push(
      t("contracts.reviewContext.flightNo", locale, {
        value: item.requestHints.flightNo,
      }),
    );
  }
  return parts.join(" · ") || t("contracts.reviewContext.none", locale);
}

function inferContractKind(contract: VehicleContractRecord): ContractKind {
  const source = [
    contract.contractType,
    contract.partnerType,
    contract.partnerId,
    contract.serviceScope,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (source.includes("forwarder") || source.includes("external")) {
    return "forwarder";
  }
  if (
    source.includes("partner") ||
    source.includes("airport") ||
    source.includes("program")
  ) {
    return "partner_program";
  }
  return "fleet_lease";
}

function kindLabel(kind: ContractKind, locale: Locale) {
  if (locale === "zh") {
    if (kind === "forwarder") return "forwarder";
    if (kind === "partner_program") return "partner program";
    return "fleet lease";
  }
  return kind;
}

function revenueShareLabel(kind: ContractKind, locale: Locale) {
  if (locale === "zh") {
    if (kind === "forwarder") return "平台清分";
    if (kind === "partner_program") return "合作分潤";
    return "固定租賃";
  }
  if (kind === "forwarder") return "platform settled";
  if (kind === "partner_program") return "partner share";
  return "fixed lease";
}

function revenueShareMeta(
  contract: VehicleContractRecord,
  locale: Locale,
  kind: ContractKind,
) {
  if (kind === "forwarder") {
    return formatOpsCodeLabel(locale, contract.partnerType);
  }
  if (kind === "partner_program") {
    return formatOpsCodeLabel(locale, contract.serviceScope);
  }
  return contract.approvedBy ?? t("common.dash", locale);
}

function buildContractRows(
  contracts: VehicleContractRecord[],
  partnerNameBySlug: Map<string, string>,
  locale: Locale,
): ContractRow[] {
  return contracts.map((contract) => {
    const kind = inferContractKind(contract);
    return {
      contractId: contract.contractId,
      contractLabel: contract.contractId,
      counterparty:
        partnerNameBySlug.get(contract.partnerId) ?? contract.partnerId,
      counterpartyMeta: formatOpsCodeLabel(locale, contract.partnerType),
      kind,
      kindLabel: kindLabel(kind, locale),
      termLabel: formatTerm(contract.startAt, contract.endAt, locale),
      termMeta:
        contract.operatingAreaId ??
        formatOpsCodeLabel(locale, contract.serviceScope),
      revenueShare: revenueShareLabel(kind, locale),
      revenueMeta: revenueShareMeta(contract, locale, kind),
      status: contract.status,
      statusLabel: formatOpsCodeLabel(locale, contract.status),
      statusMeta: formatOpsCodeLabel(locale, contract.lifecycleStatus),
    };
  });
}

function queueCountByStatus(
  reviewQueue: PartnerEligibilityReviewQueueItem[],
  status: PartnerEligibilityReviewQueueItem["verificationStatus"],
) {
  return reviewQueue.filter((item) => item.verificationStatus === status).length;
}

export default async function ContractsPage() {
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  let contracts: VehicleContractRecord[] = [];
  let partnerEntries: PartnerChannelEntryRecord[] = [];
  let reviewQueue: PartnerEligibilityReviewQueueItem[] = [];
  let error: string | null = null;

  try {
    [contracts, partnerEntries, reviewQueue] = await Promise.all([
      client.listContracts(),
      client.listPartnerEntries(),
      client.listPartnerEligibilityReviewQueue(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : t("common.unknown", locale);
  }

  const partnerNameBySlug = new Map(
    partnerEntries.map((entry) => [entry.entrySlug, entry.displayName]),
  );
  const contractRows = buildContractRows(contracts, partnerNameBySlug, locale);
  const activeContracts = contracts.filter(
    (contract) => contract.status === "active",
  ).length;
  const draftContracts = contracts.filter(
    (contract) => contract.status === "draft",
  ).length;
  const manualReviewCount = queueCountByStatus(reviewQueue, "manual_review");
  const deniedCount = queueCountByStatus(reviewQueue, "ineligible");
  const kindCounts = contractRows.reduce<Record<ContractKind, number>>(
    (acc, row) => {
      acc[row.kind] += 1;
      return acc;
    },
    {
      fleet_lease: 0,
      partner_program: 0,
      forwarder: 0,
    },
  );
  const leadingContract = contractRows[0] ?? null;
  const leadingReview = reviewQueue[0] ?? null;

  const columns: CanvasTableColumn<ContractRow>[] = [
    {
      h: locale === "zh" ? "合約" : "Contract",
      w: 188,
      r: (row) => (
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <strong style={{ color: theme.text }}>{row.contractLabel}</strong>
          <span
            style={{
              color: theme.textMuted,
              fontFamily: theme.monoFamily,
              fontSize: 11.5,
            }}
          >
            {row.contractId}
          </span>
        </div>
      ),
    },
    {
      h: locale === "zh" ? "合作方" : "Counterparty",
      w: 180,
      r: (row) => (
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span>{row.counterparty}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {row.counterpartyMeta}
          </span>
        </div>
      ),
    },
    {
      h: locale === "zh" ? "類別" : "Kind",
      w: 132,
      r: (row) => (
        <Pill theme={theme} tone={kindTone(row.kind)}>
          {row.kindLabel}
        </Pill>
      ),
    },
    {
      h: locale === "zh" ? "期間" : "Term",
      w: 236,
      r: (row) => (
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span style={{ fontFamily: theme.monoFamily }}>{row.termLabel}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {row.termMeta}
          </span>
        </div>
      ),
    },
    {
      h: locale === "zh" ? "分潤" : "Revenue Share",
      w: 140,
      r: (row) => (
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span>{row.revenueShare}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {row.revenueMeta}
          </span>
        </div>
      ),
    },
    {
      h: t("contracts.col.status", locale),
      w: 128,
      r: (row) => (
        <div style={{ display: "grid", gap: 5, justifyItems: "start" }}>
          <Pill theme={theme} tone={contractStatusTone(row.status)} dot>
            {row.statusLabel}
          </Pill>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {row.statusMeta}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div style={pageStackStyle}>
      <PageHeader
        theme={theme}
        title={t("contracts.title", locale)}
        subtitle={t("contracts.subtitle", locale, { count: contracts.length })}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn theme={theme} variant="secondary" icon="export" disabled>
              {locale === "zh" ? "匯出 roster" : "Export roster"}
            </Btn>
            <Btn theme={theme} variant="primary" icon="plus" disabled>
              {locale === "zh" ? "新增合約" : "New contract"}
            </Btn>
          </div>
        }
      />

      {error ? (
        <Banner
          theme={theme}
          tone="danger"
          title={t("common.error", locale)}
          description={error}
        />
      ) : null}

      {!error && reviewQueue.length > 0 ? (
        <Banner
          theme={theme}
          tone={manualReviewCount > 0 ? "warn" : "info"}
          title={t("contracts.reviewTitle", locale)}
          description={t("contracts.reviewAlert", locale, {
            count: reviewQueue.length,
          })}
        />
      ) : null}

      <div style={kpiGridStyle}>
        <KPI
          theme={theme}
          label={locale === "zh" ? "Active contracts" : "Active contracts"}
          value={String(activeContracts)}
          sub={locale === "zh" ? "可直接支援 dispatch" : "ready for dispatch"}
          delta={`${contracts.length} total`}
        />
        <KPI
          theme={theme}
          label={locale === "zh" ? "Draft contracts" : "Draft contracts"}
          value={String(draftContracts)}
          sub={locale === "zh" ? "待核准或待生效" : "awaiting approval or start"}
          deltaTone={draftContracts > 0 ? "down" : "neutral"}
          delta={draftContracts > 0 ? "attention" : "clear"}
        />
        <KPI
          theme={theme}
          label={locale === "zh" ? "Eligibility queue" : "Eligibility queue"}
          value={String(reviewQueue.length)}
          sub={t("contracts.reviewRegistrySummary", locale, {
            total: reviewQueue.length,
            manual: manualReviewCount,
          })}
          deltaTone={manualReviewCount > 0 ? "down" : "neutral"}
          delta={`${manualReviewCount} manual`}
        />
        <KPI
          theme={theme}
          label={locale === "zh" ? "Kinds covered" : "Kinds covered"}
          value={String(
            Object.values(kindCounts).filter((count) => count > 0).length,
          )}
          sub="fleet_lease · partner_program · forwarder"
          delta={`${kindCounts.forwarder} forwarder`}
        />
      </div>

      <div style={contentGridStyle}>
        <Card
          theme={theme}
          title={t("contracts.title", locale)}
          subtitle={t("contracts.registrySummary", locale, {
            active: activeContracts,
            draft: draftContracts,
            attention: reviewQueue.length,
          })}
        >
          <div style={filterRowStyle}>
            <Pill theme={theme} tone="neutral">
              fleet_lease {kindCounts.fleet_lease}
            </Pill>
            <Pill theme={theme} tone="info">
              partner_program {kindCounts.partner_program}
            </Pill>
            <Pill theme={theme} tone="accent">
              forwarder {kindCounts.forwarder}
            </Pill>
            <Pill theme={theme} tone="success">
              {t("contracts.col.status", locale)} {activeContracts}
            </Pill>
          </div>

          <div style={{ height: 12 }} />

          {contractRows.length > 0 ? (
            <Table theme={theme} columns={columns} rows={contractRows} />
          ) : (
            <p style={helperTextStyle}>{t("contracts.empty", locale)}</p>
          )}
        </Card>

        <div style={panelStackStyle}>
          <Card
            theme={theme}
            title={locale === "zh" ? "Registry posture" : "Registry posture"}
            subtitle={
              locale === "zh"
                ? "把當前合約結構與審批節奏濃縮成側欄摘要。"
                : "Compact posture summary for current contract mix and approvals."
            }
          >
            <DL
              theme={theme}
              cols={1}
              items={[
                {
                  label: locale === "zh" ? "Partner entries" : "Partner entries",
                  value: String(partnerEntries.length),
                },
                {
                  label:
                    locale === "zh" ? "Denied eligibility" : "Denied eligibility",
                  value: String(deniedCount),
                },
                {
                  label:
                    locale === "zh" ? "Manual review" : "Manual review",
                  value: String(manualReviewCount),
                },
                {
                  label:
                    locale === "zh" ? "Primary focus" : "Primary focus",
                  value: leadingContract?.counterparty ?? t("common.dash", locale),
                },
              ]}
            />

            {leadingContract ? (
              <>
                <div style={{ height: 14 }} />
                <Field
                  theme={theme}
                  label={locale === "zh" ? "Contract focus" : "Contract focus"}
                  hint={
                    locale === "zh"
                      ? "read-only 摘要，對齊 canvas handoff 的 side card posture。"
                      : "Read-only focus card aligned to the canvas side panel."
                  }
                >
                  <DL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        label: locale === "zh" ? "Counterparty" : "Counterparty",
                        value: leadingContract.counterparty,
                      },
                      {
                        label: locale === "zh" ? "Kind" : "Kind",
                        value: leadingContract.kindLabel,
                      },
                      {
                        label: locale === "zh" ? "Term" : "Term",
                        value: leadingContract.termLabel,
                        mono: true,
                      },
                      {
                        label: locale === "zh" ? "Revenue" : "Revenue",
                        value: leadingContract.revenueShare,
                      },
                    ]}
                  />
                </Field>
              </>
            ) : null}
          </Card>

          <Card
            theme={theme}
            title={t("contracts.reviewTitle", locale)}
            subtitle={t("contracts.reviewSubtitle", locale, {
              count: reviewQueue.length,
            })}
          >
            {leadingReview ? (
              <div style={{ display: "grid", gap: 10 }}>
                {reviewQueue.slice(0, 3).map((item) => (
                  <div
                    key={item.eligibilityVerificationId}
                    style={queueItemStyle}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <strong style={{ color: theme.text }}>
                        {partnerNameBySlug.get(item.partnerEntrySlug) ??
                          item.partnerEntrySlug}
                      </strong>
                      <Pill
                        theme={theme}
                        tone={eligibilityStatusTone(item.verificationStatus)}
                        dot
                      >
                        {t(
                          `contracts.reviewStatus.${item.verificationStatus}`,
                          locale,
                        )}
                      </Pill>
                    </div>

                    <DL
                      theme={theme}
                      cols={1}
                      items={[
                        {
                          label: t("contracts.reviewCol.reason", locale),
                          value: formatOpsCodeLabel(
                            locale,
                            item.verificationReasonCode,
                          ),
                        },
                        {
                          label: t("contracts.reviewCol.requestedAt", locale),
                          value: formatDateTime(
                            item.manualFallback.requestedAt,
                            locale,
                          ),
                          mono: true,
                        },
                        {
                          label: locale === "zh" ? "Requested by" : "Requested by",
                          value: formatRequestedBy(item, locale),
                        },
                      ]}
                    />

                    <Field
                      theme={theme}
                      label={t("contracts.reviewCol.requestContext", locale)}
                    >
                      <div
                        style={{
                          color: theme.textMuted,
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                      >
                        {formatContext(item, locale)}
                      </div>
                    </Field>
                  </div>
                ))}
              </div>
            ) : (
              <p style={helperTextStyle}>{t("contracts.reviewEmpty", locale)}</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
