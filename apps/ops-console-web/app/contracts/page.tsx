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
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
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
  revenueShare: string;
  revenueMeta: string;
  status: VehicleContractRecord["status"];
  statusLabel: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageStackStyle = {
  minHeight: "100%",
  display: "flex",
  flexDirection: "column" as const,
};

const pageBodyStyle = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const summaryCardGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.5fr) minmax(240px, 0.9fr)",
  gap: 16,
  alignItems: "start",
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

function buildShellNav(locale: Locale): CanvasShellNavItem[] {
  return [
    {
      divider: locale === "en" ? "Workspaces" : "工作面",
    },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: t("nav.dashboard", locale),
    },
    {
      divider: locale === "en" ? "Live Ops" : "即時派遣",
    },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: t("nav.dispatch", locale),
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: t("nav.callcenter", locale),
    },
    {
      divider: locale === "en" ? "Casework" : "案件處理",
    },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: t("nav.complaints", locale),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: t("nav.incidents", locale),
      matchPaths: ["/incidents"],
    },
    {
      divider: locale === "en" ? "Monitoring" : "營運監控",
    },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports", locale),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: t("nav.revenue", locale),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: t("nav.attendance", locale),
    },
    {
      divider: locale === "en" ? "Registry" : "主資料",
    },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet",
      label: t("nav.drivers", locale),
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: t("nav.vehicles", locale),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts",
      label: t("nav.contracts", locale),
      matchPaths: ["/contracts"],
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "flags",
      label: t("nav.featureFlags", locale),
    },
  ];
}

function contractStatusTone(
  status: VehicleContractRecord["status"],
): CanvasTone {
  if (status === "active") return "success";
  if (status === "terminated") return "danger";
  return "warn";
}

function kindTone(kind: ContractKind): CanvasTone {
  if (kind === "forwarder") return "accent";
  if (kind === "partner_program") return "info";
  return "neutral";
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) return t("common.dash", locale);
  return new Date(value).toLocaleDateString(
    locale === "zh" ? "zh-TW" : "en-US",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    },
  );
}

function formatTerm(startAt: string, endAt: string, locale: Locale) {
  const start = formatDate(startAt, locale);
  const end = endAt ? formatDate(endAt, locale) : "ongoing";
  return `${start} → ${end}`;
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
      revenueShare: revenueShareLabel(kind, locale),
      revenueMeta: revenueShareMeta(contract, locale, kind),
      status: contract.status,
      statusLabel: formatOpsCodeLabel(locale, contract.status),
    };
  });
}

function queueCountByStatus(
  reviewQueue: PartnerEligibilityReviewQueueItem[],
  status: PartnerEligibilityReviewQueueItem["verificationStatus"],
) {
  return reviewQueue.filter((item) => item.verificationStatus === status)
    .length;
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
  const nav = buildShellNav(locale);

  const columns: CanvasTableColumn<ContractRow>[] = [
    {
      h: locale === "zh" ? "合約" : "Contract",
      w: 128,
      r: (row) => (
        <span style={{ color: theme.text, fontFamily: theme.monoFamily }}>
          {row.contractLabel}
        </span>
      ),
    },
    {
      h: locale === "zh" ? "合作方" : "Counterparty",
      w: 220,
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
      w: 138,
      r: (row) => (
        <Pill theme={theme} tone={kindTone(row.kind)}>
          {row.kindLabel}
        </Pill>
      ),
    },
    {
      h: locale === "zh" ? "期間" : "Term",
      w: 228,
      r: (row) => (
        <span style={{ fontFamily: theme.monoFamily }}>{row.termLabel}</span>
      ),
    },
    {
      h: locale === "zh" ? "分潤" : "Revenue Share",
      w: 140,
      r: (row) => (
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span style={{ fontFamily: theme.monoFamily }}>
            {row.revenueShare}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {row.revenueMeta}
          </span>
        </div>
      ),
    },
    {
      h: t("contracts.col.status", locale),
      w: 116,
      r: (row) => (
        <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>
          <Pill theme={theme} tone={contractStatusTone(row.status)} dot>
            {row.statusLabel}
          </Pill>
        </div>
      ),
    },
  ];

  return (
    <Shell
      theme={theme}
      nav={nav}
      active="contracts"
      title={t("nav.contracts", locale)}
      currentPath="/contracts"
      searchPlaceholder={
        locale === "zh"
          ? "搜尋合約、合作方、審核單…"
          : "Search contracts, counterparties, reviews…"
      }
      breadcrumb={[
        locale === "zh" ? "主資料" : "Registry",
        t("nav.contracts", locale),
      ]}
      brandSubLabel="Ops Console"
      avatarLabel="OC"
    >
      <div style={pageStackStyle}>
        <PageHeader
          theme={theme}
          title={t("nav.contracts", locale)}
          subtitle={
            locale === "zh"
              ? "車隊合約 · partner relation · revenue share"
              : "vehicle contracts · partner relation · revenue share"
          }
          actions={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn theme={theme} variant="primary" icon="plus" disabled>
                {locale === "zh" ? "建立合約" : "Create contract"}
              </Btn>
            </div>
          }
        />

        <div style={pageBodyStyle}>
          {error ? (
            <Banner
              theme={theme}
              tone="danger"
              title={t("common.error", locale)}
              body={error}
            />
          ) : null}

          {!error && reviewQueue.length > 0 ? (
            <Banner
              theme={theme}
              tone={manualReviewCount > 0 ? "warn" : "info"}
              title={t("contracts.reviewTitle", locale)}
              body={t("contracts.reviewAlert", locale, {
                count: reviewQueue.length,
              })}
            />
          ) : null}

          <div style={kpiGridStyle}>
            <KPI
              theme={theme}
              label={locale === "zh" ? "Total contracts" : "Total contracts"}
              value={String(contracts.length)}
              sub={t("contracts.subtitle", locale, { count: contracts.length })}
              delta={`${activeContracts} active`}
            />
            <KPI
              theme={theme}
              label={locale === "zh" ? "Active contracts" : "Active contracts"}
              value={String(activeContracts)}
              sub={
                locale === "zh" ? "可直接支援 dispatch" : "ready for dispatch"
              }
              delta={`${draftContracts} draft`}
            />
            <KPI
              theme={theme}
              label={locale === "zh" ? "Review queue" : "Review queue"}
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

          <Card
            theme={theme}
            title={t("contracts.title", locale)}
            subtitle={t("contracts.registrySummary", locale, {
              active: activeContracts,
              draft: draftContracts,
              attention: reviewQueue.length,
            })}
          >
            <div style={summaryCardGridStyle}>
              <Field
                theme={theme}
                label={locale === "zh" ? "Registry mix" : "Registry mix"}
                hint={
                  locale === "zh"
                    ? "Contracts table 對齊 canvas handoff，聚焦 kind、term、revenue share 與 status。"
                    : "Contracts table aligned to the canvas handoff with kind, term, revenue share, and status."
                }
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
                    active {activeContracts}
                  </Pill>
                  {manualReviewCount > 0 ? (
                    <Pill theme={theme} tone="warn">
                      manual_review {manualReviewCount}
                    </Pill>
                  ) : null}
                  {deniedCount > 0 ? (
                    <Pill theme={theme} tone="danger">
                      denied {deniedCount}
                    </Pill>
                  ) : null}
                </div>
              </Field>

              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    label:
                      locale === "zh" ? "Partner entries" : "Partner entries",
                    value: String(partnerEntries.length),
                  },
                  {
                    label:
                      locale === "zh" ? "Draft contracts" : "Draft contracts",
                    value: String(draftContracts),
                  },
                  {
                    label: locale === "zh" ? "Manual review" : "Manual review",
                    value: String(manualReviewCount),
                  },
                  {
                    label:
                      locale === "zh"
                        ? "Denied eligibility"
                        : "Denied eligibility",
                    value: String(deniedCount),
                  },
                ]}
              />
            </div>
          </Card>

          <Card theme={theme} padding={contractRows.length > 0 ? 0 : 24}>
            {contractRows.length > 0 ? (
              <Table theme={theme} columns={columns} rows={contractRows} />
            ) : (
              <p style={helperTextStyle}>{t("contracts.empty", locale)}</p>
            )}
          </Card>
        </div>
      </div>
    </Shell>
  );
}
