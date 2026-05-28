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
type DisplayContractStatus = VehicleContractRecord["status"] | "expiring";

type ContractRow = Record<string, unknown> & {
  contractId: string;
  counterparty: string;
  kind: ContractKind;
  vehicleId: string;
  serviceScope: string;
  termLabel: string;
  approvedLabel: string;
  revenueShare: string;
  displayStatus: DisplayContractStatus;
};

type ReviewRow = Record<string, unknown> & {
  eligibilityVerificationId: string;
  partnerEntrySlug: string;
  verificationReasonCode: string;
  verificationStatus: PartnerEligibilityReviewQueueItem["verificationStatus"];
  attemptLabel: string;
  requestedAtLabel: string;
  requestContextLabel: string;
  requestedByLabel: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const KIND_PRIORITY: Record<ContractKind, number> = {
  fleet_lease: 0,
  partner_program: 1,
  forwarder: 2,
};

const pageStackStyle = {
  minHeight: "100%",
  display: "flex",
  flexDirection: "column" as const,
};

const pageBodyStyle = {
  padding: 24,
};

const pageSectionStyle = {
  display: "grid",
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const fieldStackStyle = {
  display: "grid",
  gap: 14,
};

const pillWrapStyle = {
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

function contractStatusTone(status: DisplayContractStatus): CanvasTone {
  if (status === "active") return "success";
  if (status === "expiring") return "warn";
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

function formatTerm(startAt: string, endAt: string | null, locale: Locale) {
  const start = formatDate(startAt, locale);
  const end = endAt
    ? formatDate(endAt, locale)
    : locale === "zh"
      ? "持續中"
      : "ongoing";
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

function revenueShareLabel(kind: ContractKind) {
  if (kind === "forwarder") return "85/15";
  if (kind === "partner_program") return "sponsor settle";
  return "70/30";
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

function formatRequestedBy(requestedBy: string | null, locale: Locale): string {
  if (!requestedBy) {
    return t("contracts.reviewRequestedBy.none", locale);
  }

  if (requestedBy === "system:auto_fallback") {
    return t("contracts.reviewRequestedBy.system:auto_fallback", locale);
  }

  return requestedBy;
}

function formatRequestContext(
  item: PartnerEligibilityReviewQueueItem,
  locale: Locale,
): string {
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

  if (parts.length === 0) {
    parts.push(t("contracts.reviewContext.none", locale));
  }

  parts.push(formatRequestedBy(item.manualFallback.requestedBy, locale));
  return parts.join(" · ");
}

function reviewStatusTone(
  status: PartnerEligibilityReviewQueueItem["verificationStatus"],
): CanvasTone {
  return status === "ineligible" ? "danger" : "warn";
}

function buildContractRows(
  contracts: VehicleContractRecord[],
  partnerNameLookup: Map<string, string>,
  locale: Locale,
): ContractRow[] {
  const now = Date.now();

  return contracts
    .map<ContractRow>((contract) => {
      const kind = inferContractKind(contract);
      const endAt = Date.parse(contract.endAt);
      const expiringSoon =
        contract.status === "active" &&
        Number.isFinite(endAt) &&
        endAt >= now &&
        endAt - now <= 1000 * 60 * 60 * 24 * 45;
      const displayStatus = (
        expiringSoon ? "expiring" : contract.status
      ) as DisplayContractStatus;

      return {
        contractId: contract.contractId,
        counterparty:
          partnerNameLookup.get(contract.partnerId) ?? contract.partnerId,
        kind,
        vehicleId: contract.vehicleId,
        serviceScope: contract.serviceScope,
        termLabel: formatTerm(contract.startAt, contract.endAt, locale),
        approvedLabel: contract.approvedAt
          ? formatDateTime(contract.approvedAt, locale)
          : t("common.dash", locale),
        revenueShare: revenueShareLabel(kind),
        displayStatus,
      };
    })
    .sort((left, right) => {
      const kindOrder = KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind];
      if (kindOrder !== 0) return kindOrder;
      return left.contractId.localeCompare(right.contractId);
    });
}

function buildReviewRows(
  reviewQueue: PartnerEligibilityReviewQueueItem[],
  locale: Locale,
): ReviewRow[] {
  return [...reviewQueue]
    .sort(
      (left, right) =>
        Date.parse(right.verifiedAt) - Date.parse(left.verifiedAt),
    )
    .map((item) => ({
      eligibilityVerificationId: item.eligibilityVerificationId,
      partnerEntrySlug: item.partnerEntrySlug,
      verificationReasonCode: item.verificationReasonCode,
      verificationStatus: item.verificationStatus,
      attemptLabel:
        item.latestAttemptStatus && item.latestAttemptReasonCode
          ? `${item.attemptCount} · ${item.latestAttemptStatus} / ${item.latestAttemptReasonCode}`
          : `${item.attemptCount}`,
      requestedAtLabel: [
        formatDateTime(item.manualFallback.requestedAt, locale),
        formatDateTime(item.verifiedAt, locale),
      ].join(" → "),
      requestContextLabel: formatRequestContext(item, locale),
      requestedByLabel: formatRequestedBy(
        item.manualFallback.requestedBy,
        locale,
      ),
    }));
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

  const partnerNameLookup = new Map<string, string>();
  for (const entry of partnerEntries) {
    if (!partnerNameLookup.has(entry.partnerId)) {
      partnerNameLookup.set(entry.partnerId, entry.displayName);
    }
    if (!partnerNameLookup.has(entry.entrySlug)) {
      partnerNameLookup.set(entry.entrySlug, entry.displayName);
    }
  }

  const contractRows = buildContractRows(contracts, partnerNameLookup, locale);
  const reviewRows = buildReviewRows(reviewQueue, locale);
  const nav = buildShellNav(locale);
  const activeCount = contracts.filter(
    (contract) => contract.status === "active",
  ).length;
  const draftCount = contracts.filter(
    (contract) => contract.status === "draft",
  ).length;
  const expiringCount = contractRows.filter(
    (contract) => contract.displayStatus === "expiring",
  ).length;
  const manualReviewCount = reviewQueue.filter(
    (item) => item.verificationStatus === "manual_review",
  ).length;
  const kindCounts = {
    fleetLease: contractRows.filter((row) => row.kind === "fleet_lease").length,
    partnerProgram: contractRows.filter((row) => row.kind === "partner_program")
      .length,
    forwarder: contractRows.filter((row) => row.kind === "forwarder").length,
  };
  const registrySubtitle = t("contracts.registrySummary", locale, {
    active: activeCount,
    draft: draftCount,
    attention: reviewQueue.length,
  });

  const columns: CanvasTableColumn<ContractRow>[] = [
    {
      h: t("contracts.col.contractId", locale).toUpperCase(),
      k: "contractId",
      w: 132,
      mono: true,
    },
    {
      h: t("contracts.col.partner", locale).toUpperCase(),
      k: "counterparty",
      w: 220,
    },
    {
      h: t("contracts.col.type", locale).toUpperCase(),
      k: "kind",
      w: 144,
      mono: true,
      r: (row) => (
        <Pill theme={theme} tone={kindTone(row.kind)}>
          {row.kind}
        </Pill>
      ),
    },
    {
      h: t("contracts.col.vehicle", locale).toUpperCase(),
      k: "vehicleId",
      w: 128,
      mono: true,
    },
    {
      h: locale === "zh" ? "TERM / SCOPE" : "TERM / SCOPE",
      k: "termLabel",
      w: 250,
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
            {row.termLabel}
          </span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {row.serviceScope}
          </span>
        </div>
      ),
    },
    {
      h: locale === "zh" ? "APPROVED / SHARE" : "APPROVED / SHARE",
      k: "revenueShare",
      w: 182,
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
            {row.approvedLabel}
          </span>
          <span style={{ color: theme.textDim, fontSize: 11 }}>
            {row.revenueShare}
          </span>
        </div>
      ),
    },
    {
      h: t("contracts.col.status", locale).toUpperCase(),
      w: 110,
      r: (row) => (
        <Pill theme={theme} tone={contractStatusTone(row.displayStatus)} dot>
          {row.displayStatus}
        </Pill>
      ),
    },
  ];

  const reviewColumns: CanvasTableColumn<ReviewRow>[] = [
    {
      h: t("contracts.reviewCol.partnerEntry", locale).toUpperCase(),
      w: 160,
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ color: theme.accent, fontWeight: 700 }}>
            {row.partnerEntrySlug}
          </span>
          <span
            style={{
              color: theme.textDim,
              fontSize: 11,
              fontFamily: theme.monoFamily,
            }}
          >
            {row.eligibilityVerificationId}
          </span>
        </div>
      ),
    },
    {
      h: t("contracts.reviewCol.reason", locale).toUpperCase(),
      k: "verificationReasonCode",
      w: 168,
      mono: true,
    },
    {
      h: t("contracts.reviewCol.status", locale).toUpperCase(),
      w: 120,
      r: (row) => (
        <Pill theme={theme} tone={reviewStatusTone(row.verificationStatus)} dot>
          {t(
            `contracts.reviewStatus.${row.verificationStatus}` as never,
            locale,
          )}
        </Pill>
      ),
    },
    {
      h: t("contracts.reviewCol.attempts", locale).toUpperCase(),
      k: "attemptLabel",
      w: 188,
      mono: true,
    },
    {
      h: t("contracts.reviewCol.requestedAt", locale).toUpperCase(),
      k: "requestedAtLabel",
      w: 220,
      mono: true,
    },
    {
      h: t("contracts.reviewCol.requestContext", locale).toUpperCase(),
      k: "requestContextLabel",
      w: 320,
    },
  ];

  return (
    <Shell
      theme={theme}
      nav={nav}
      active="contracts"
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
      brandLabel={t("app.name", locale)}
      brandSubLabel={t("app.sub", locale)}
      env={t("app.env", locale)}
      versionLabel="OC"
      avatarLabel="OC"
    >
      <div style={pageStackStyle}>
        <PageHeader
          theme={theme}
          title={t("nav.contracts", locale)}
          subtitle={registrySubtitle}
          actions={
            <Btn theme={theme} variant="primary" icon="plus">
              {locale === "zh" ? "建立合約" : "Create contract"}
            </Btn>
          }
        />

        <div style={pageBodyStyle}>
          <div style={pageSectionStyle}>
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
                tone="warn"
                title={t("contracts.reviewTitle", locale)}
                body={t("contracts.reviewAlert", locale, {
                  count: reviewQueue.length,
                })}
                actions={
                  <Btn theme={theme} variant="secondary" icon="warn">
                    {locale === "zh"
                      ? "檢查 eligibility"
                      : "Inspect eligibility"}
                  </Btn>
                }
              />
            ) : null}

            <Card
              theme={theme}
              title={locale === "zh" ? "Registry posture" : "Registry posture"}
              subtitle={registrySubtitle}
            >
              <div style={pageSectionStyle}>
                <div style={kpiGridStyle}>
                  <KPI
                    theme={theme}
                    label={locale === "zh" ? "Contracts" : "Contracts"}
                    value={contracts.length}
                    sub={t("contracts.title", locale)}
                  />
                  <KPI
                    theme={theme}
                    label={locale === "zh" ? "Active" : "Active"}
                    value={activeCount}
                    delta={
                      expiringCount > 0
                        ? `${expiringCount} expiring`
                        : undefined
                    }
                    deltaTone={expiringCount > 0 ? "down" : "neutral"}
                    sub={
                      locale === "zh"
                        ? "生效中合約"
                        : "live operating contracts"
                    }
                  />
                  <KPI
                    theme={theme}
                    label={
                      locale === "zh" ? "Partner program" : "Partner program"
                    }
                    value={kindCounts.partnerProgram}
                    sub={
                      locale === "zh"
                        ? "福利 / 機場合作"
                        : "benefit and airport programs"
                    }
                  />
                  <KPI
                    theme={theme}
                    label={locale === "zh" ? "Review queue" : "Review queue"}
                    value={reviewQueue.length}
                    delta={
                      manualReviewCount > 0
                        ? `${manualReviewCount} manual_review`
                        : undefined
                    }
                    deltaTone={manualReviewCount > 0 ? "down" : "neutral"}
                    sub={t("contracts.reviewTitle", locale)}
                  />
                </div>

                <div style={summaryGridStyle}>
                  <DL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        k: locale === "zh" ? "目前頁面" : "Current page",
                        v: t("nav.contracts", locale),
                      },
                      {
                        k:
                          locale === "zh"
                            ? "Registry summary"
                            : "Registry summary",
                        v: registrySubtitle,
                      },
                      {
                        k: locale === "zh" ? "Kinds" : "Kinds",
                        v: `${kindCounts.fleetLease} fleet_lease · ${kindCounts.partnerProgram} partner_program · ${kindCounts.forwarder} forwarder`,
                        mono: true,
                      },
                      {
                        k:
                          locale === "zh"
                            ? "Eligibility queue"
                            : "Eligibility queue",
                        v: t("contracts.reviewRegistrySummary", locale, {
                          total: reviewQueue.length,
                          manual: manualReviewCount,
                        }),
                      },
                    ]}
                  />

                  <div style={fieldStackStyle}>
                    <Field
                      theme={theme}
                      label={locale === "zh" ? "Contract mix" : "Contract mix"}
                    >
                      <div style={pillWrapStyle}>
                        <Pill theme={theme} tone="neutral">
                          fleet_lease {kindCounts.fleetLease}
                        </Pill>
                        <Pill theme={theme} tone="info">
                          partner_program {kindCounts.partnerProgram}
                        </Pill>
                        <Pill theme={theme} tone="accent">
                          forwarder {kindCounts.forwarder}
                        </Pill>
                      </div>
                    </Field>
                    <Field
                      theme={theme}
                      label={
                        locale === "zh" ? "Ops attention" : "Ops attention"
                      }
                    >
                      <div style={pillWrapStyle}>
                        <Pill
                          theme={theme}
                          tone={expiringCount > 0 ? "warn" : "success"}
                          dot
                        >
                          {locale === "zh" ? "到期關注" : "expiring"}{" "}
                          {expiringCount}
                        </Pill>
                        <Pill
                          theme={theme}
                          tone={reviewQueue.length > 0 ? "warn" : "success"}
                          dot={reviewQueue.length > 0}
                        >
                          {locale === "zh"
                            ? "eligibility queue"
                            : "eligibility queue"}{" "}
                          {reviewQueue.length}
                        </Pill>
                      </div>
                    </Field>
                  </div>
                </div>
              </div>
            </Card>

            <Card
              theme={theme}
              title={t("contracts.title", locale)}
              subtitle={t("contracts.subtitle", locale, {
                count: contracts.length,
              })}
              padding={contractRows.length > 0 ? 0 : 24}
            >
              {contractRows.length > 0 ? (
                <Table theme={theme} columns={columns} rows={contractRows} />
              ) : (
                <p style={emptyStateStyle}>{t("contracts.empty", locale)}</p>
              )}
            </Card>

            <Card
              theme={theme}
              title={t("contracts.reviewTitle", locale)}
              subtitle={t("contracts.reviewSubtitle", locale, {
                count: reviewQueue.length,
              })}
            >
              <div style={pageSectionStyle}>
                <DL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: locale === "zh" ? "Queue summary" : "Queue summary",
                      v: t("contracts.reviewRegistrySummary", locale, {
                        total: reviewQueue.length,
                        manual: manualReviewCount,
                      }),
                    },
                    {
                      k: locale === "zh" ? "Pending source" : "Pending source",
                      v:
                        reviewRows[0]?.requestedByLabel ??
                        t("contracts.reviewRequestedBy.none", locale),
                    },
                  ]}
                />

                {reviewRows.length > 0 ? (
                  <Card theme={theme} padding={0}>
                    <Table
                      theme={theme}
                      columns={reviewColumns}
                      rows={reviewRows}
                    />
                  </Card>
                ) : (
                  <p style={emptyStateStyle}>
                    {t("contracts.reviewEmpty", locale)}
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  );
}
