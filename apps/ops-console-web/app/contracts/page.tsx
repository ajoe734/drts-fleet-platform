import type {
  PartnerChannelEntryRecord,
  PartnerEligibilityReviewQueueItem,
  VehicleContractRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
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
  counterparty: string;
  kind: ContractKind;
  termLabel: string;
  revenueShare: string;
  status: VehicleContractRecord["status"];
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
  gridTemplateColumns: "minmax(0, 1.5fr) minmax(250px, 0.85fr)",
  gap: 16,
  alignItems: "start",
};

const summaryFieldGridStyle = {
  display: "grid",
  gap: 14,
};

const filterRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
};

const emptyStateStyle = {
  margin: 0,
  padding: 24,
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.55,
};

const fieldBodyStyle = {
  minHeight: 44,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  padding: 10,
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
  if (status === "draft") return "warn";
  return "neutral";
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

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return t("common.dash", locale);
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatTerm(startAt: string, endAt: string | null, locale: Locale) {
  const start = formatDate(startAt, locale);
  const end = endAt ? formatDate(endAt, locale) : "ongoing";
  return `${start} → ${end}`;
}

function getLatestUpdatedAt(
  values: Array<string | null | undefined>,
): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    if (!latest) return value;
    return value.localeCompare(latest) > 0 ? value : latest;
  }, null);
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

function revenueShareLabel(kind: ContractKind) {
  if (kind === "forwarder") return "85/15";
  if (kind === "partner_program") return "sponsor settle";
  return "70/30";
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
      counterparty:
        partnerNameBySlug.get(contract.partnerId) ?? contract.partnerId,
      kind,
      termLabel: formatTerm(contract.startAt, contract.endAt, locale),
      revenueShare: revenueShareLabel(kind),
      status: contract.status,
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
  const lastUpdatedAt = getLatestUpdatedAt([
    ...contracts.map((contract) => contract.updatedAt),
    ...partnerEntries.map((entry) => entry.updatedAt),
    ...reviewQueue.map((item) => item.updatedAt),
  ]);
  const nav = buildShellNav(locale);

  const columns: CanvasTableColumn<ContractRow>[] = [
    {
      h: "CONTRACT",
      k: "contractId",
      w: 110,
      mono: true,
    },
    {
      h: "COUNTERPARTY",
      k: "counterparty",
      w: 220,
    },
    {
      h: "KIND",
      k: "kind",
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={kindTone(row.kind)}>
          {row.kind}
        </Pill>
      ),
    },
    {
      h: "TERM",
      k: "termLabel",
      w: 200,
      mono: true,
    },
    {
      h: "REVENUE SHARE",
      k: "revenueShare",
      w: 140,
      mono: true,
    },
    {
      h: "STATUS",
      w: 110,
      r: (row) => (
        <Pill theme={theme} tone={contractStatusTone(row.status)} dot>
          {row.status}
        </Pill>
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
            <Btn theme={theme} variant="primary" icon="plus" disabled>
              {locale === "zh" ? "建立合約" : "Create contract"}
            </Btn>
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
              deltaTone={activeContracts > 0 ? "up" : "neutral"}
            />
            <KPI
              theme={theme}
              label={locale === "zh" ? "Active contracts" : "Active contracts"}
              value={String(activeContracts)}
              sub={
                locale === "zh" ? "可直接支援 dispatch" : "ready for dispatch"
              }
              delta={`${draftContracts} draft`}
              deltaTone={draftContracts > 0 ? "neutral" : "up"}
            />
            <KPI
              theme={theme}
              label={locale === "zh" ? "Review queue" : "Review queue"}
              value={String(reviewQueue.length)}
              sub={t("contracts.reviewRegistrySummary", locale, {
                total: reviewQueue.length,
                manual: manualReviewCount,
              })}
              delta={`${manualReviewCount} manual`}
              deltaTone={manualReviewCount > 0 ? "down" : "neutral"}
            />
            <KPI
              theme={theme}
              label={locale === "zh" ? "Kinds covered" : "Kinds covered"}
              value={String(
                Object.values(kindCounts).filter((count) => count > 0).length,
              )}
              sub="fleet_lease · partner_program · forwarder"
              delta={`${kindCounts.forwarder} forwarder`}
              deltaTone={kindCounts.forwarder > 0 ? "up" : "neutral"}
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
              <div style={summaryFieldGridStyle}>
                <Field
                  theme={theme}
                  label={locale === "zh" ? "Registry mix" : "Registry mix"}
                  hint={
                    locale === "zh"
                      ? "OC_Contracts 以 kind、term、revenue share 與 eligibility attention 做主要掃描面。"
                      : "OC_Contracts emphasizes kind, term, revenue share, and eligibility attention."
                  }
                >
                  <div style={fieldBodyStyle}>
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
                      {draftContracts > 0 ? (
                        <Pill theme={theme} tone="warn">
                          draft {draftContracts}
                        </Pill>
                      ) : null}
                    </div>
                  </div>
                </Field>

                <Field
                  theme={theme}
                  label={locale === "zh" ? "Revenue lanes" : "Revenue lanes"}
                  hint={
                    locale === "zh"
                      ? "以固定租賃、合作分潤、forwarder 清分三種結算節奏對齊 canvas。"
                      : "Settlements stay split across fixed lease, partner share, and forwarder clearing lanes."
                  }
                >
                  <div style={fieldBodyStyle}>
                    <div style={filterRowStyle}>
                      <Pill theme={theme} tone="neutral">
                        70/30 fleet_lease
                      </Pill>
                      <Pill theme={theme} tone="info">
                        sponsor settle
                      </Pill>
                      <Pill theme={theme} tone="accent">
                        85/15 forwarder
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
                  </div>
                </Field>
              </div>

              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: locale === "zh" ? "Partner entries" : "Partner entries",
                    v: String(partnerEntries.length),
                    mono: true,
                  },
                  {
                    k: locale === "zh" ? "Draft contracts" : "Draft contracts",
                    v: String(draftContracts),
                    mono: true,
                  },
                  {
                    k: locale === "zh" ? "Manual review" : "Manual review",
                    v: String(manualReviewCount),
                    mono: true,
                  },
                  {
                    k:
                      locale === "zh"
                        ? "Eligibility denied"
                        : "Eligibility denied",
                    v: String(deniedCount),
                    mono: true,
                  },
                  {
                    k: locale === "zh" ? "Last updated" : "Last updated",
                    v: formatDateTime(lastUpdatedAt, locale),
                    mono: true,
                  },
                ]}
              />
            </div>
          </Card>

          <Card theme={theme} padding={contractRows.length > 0 ? 0 : 24}>
            {contractRows.length > 0 ? (
              <Table theme={theme} columns={columns} rows={contractRows} />
            ) : (
              <p style={emptyStateStyle}>{t("contracts.empty", locale)}</p>
            )}
          </Card>
        </div>
      </div>
    </Shell>
  );
}
