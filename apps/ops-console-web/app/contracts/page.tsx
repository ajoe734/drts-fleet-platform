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
  termLabel: string;
  revenueShare: string;
  displayStatus: DisplayContractStatus;
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

function revenueShareLabel(kind: ContractKind) {
  if (kind === "forwarder") return "85/15";
  if (kind === "partner_program") return "sponsor settle";
  return "70/30";
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
        termLabel: formatTerm(contract.startAt, contract.endAt, locale),
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
      mono: true,
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
        <Pill theme={theme} tone={contractStatusTone(row.displayStatus)} dot>
          {row.displayStatus}
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
          title={t("contracts.title", locale)}
          subtitle={t("contracts.subtitle", locale, {
            count: contracts.length,
          })}
          actions={
            <Btn theme={theme} variant="primary" icon="plus">
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
            <div style={{ marginBottom: 16 }}>
              <Banner
                theme={theme}
                tone="warn"
                title={t("contracts.reviewTitle", locale)}
                body={t("contracts.reviewAlert", locale, {
                  count: reviewQueue.length,
                })}
              />
            </div>
          ) : null}

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
