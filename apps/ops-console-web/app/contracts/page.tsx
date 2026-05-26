import type { ReactNode } from "react";
import Link from "next/link";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  PartnerChannelEntryRecord,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
  VehicleContractRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t } from "@/lib/translations";
import {
  DataCellStack,
  DataTable,
  DataViewCard,
  PageHeader,
  StatCard,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";

type ContractsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RuntimeVehicleContractRecord = VehicleContractRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type RuntimePartnerChannelEntryRecord = PartnerChannelEntryRecord & {
  availableActions?: ResourceActionDescriptor[];
  ownerLinks?: CrossAppResourceLink[];
};

type ContractListView = RuntimeVehicleContractRecord & {
  keyTerms: string;
  kindLabel: string;
  counterparties: string;
  expiringSoon: boolean;
  availableActions: ResourceActionDescriptor[];
};

type PartnerRelationView = RuntimePartnerChannelEntryRecord & {
  linkedContracts: number;
  availableActions: ResourceActionDescriptor[];
  links: CrossAppResourceLink[];
};

type ActionRenderTarget = {
  href?: string;
  target?: "_blank";
};

type ContractsEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;
type ContractsEmptyStateEnvelope = Omit<EmptyStateEnvelope, "reason"> & {
  reason: ContractsEmptyReason;
};

const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_TIER_MS = 15_000;
const EMPTY_REASON_VALUES = new Set<ContractsEmptyReason>([
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
]);

function copyText(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buttonStyle({
  disabled = false,
  emphasis = "secondary",
}: {
  disabled?: boolean;
  emphasis?: "primary" | "secondary" | "ghost";
}) {
  const styles =
    emphasis === "primary"
      ? {
          border: "1px solid #dc2626",
          background: disabled ? "#fecaca" : "#dc2626",
          color: "#ffffff",
        }
      : emphasis === "ghost"
        ? {
            border: "1px solid transparent",
            background: "transparent",
            color: disabled ? "#94a3b8" : "#475569",
          }
        : {
            border: "1px solid #fecaca",
            background: disabled ? "#fff1f2" : "#fff7f7",
            color: disabled ? "#94a3b8" : "#b91c1c",
          };

  return {
    ...styles,
    borderRadius: "999px",
    padding: "7px 12px",
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: 1.2,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap" as const,
    opacity: disabled ? 0.75 : 1,
  };
}

function cardSurfaceStyle(tone: "neutral" | "warn" | "danger" | "info") {
  switch (tone) {
    case "warn":
      return {
        background: "#fff7ed",
        border: "1px solid #fdba74",
        color: "#9a3412",
      };
    case "danger":
      return {
        background: "#fef2f2",
        border: "1px solid #fca5a5",
        color: "#b91c1c",
      };
    case "info":
      return {
        background: "#eff6ff",
        border: "1px solid #93c5fd",
        color: "#1d4ed8",
      };
    default:
      return {
        background: "#f8fafc",
        border: "1px solid #cbd5e1",
        color: "#334155",
      };
  }
}

function contractStatusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "terminated") return "danger" as const;
  if (status === "draft") return "warning" as const;
  return "neutral" as const;
}

function formatDate(value: string | null, locale: "en" | "zh") {
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

function formatDateTime(value: string | null, locale: "en" | "zh") {
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

function daysUntil(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function classifyLoadError(message: string): ContractsEmptyReason {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("403") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission")
  ) {
    return "permission_denied";
  }
  if (
    normalized.includes("404") ||
    normalized.includes("not provisioned") ||
    normalized.includes("not enabled")
  ) {
    return "not_provisioned";
  }
  if (
    normalized.includes("adapter") ||
    normalized.includes("upstream") ||
    normalized.includes("external")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function parseEmptyReason(
  value: string | undefined,
): ContractsEmptyReason | null {
  return value && EMPTY_REASON_VALUES.has(value as ContractsEmptyReason)
    ? (value as ContractsEmptyReason)
    : null;
}

function buildCrossAppUrl(link: CrossAppResourceLink) {
  const baseByApp = {
    "platform-admin":
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3001",
    "tenant-console":
      process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3002",
    "ops-console":
      process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003",
  } as const;

  const appKey = link.targetApp as keyof typeof baseByApp;
  return `${baseByApp[appKey]}${link.route}`;
}

function buildRefreshMetadata(updatedAt: string | null): UiRefreshMetadata {
  const generatedAt = updatedAt ?? new Date().toISOString();
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  return {
    generatedAt,
    staleAfterMs: REFRESH_TIER_MS,
    dataFreshness: updatedAt
      ? ageMs > REFRESH_TIER_MS
        ? "stale"
        : "fresh"
      : "unknown",
    source: "live",
  };
}

function describeFreshness(metadata: UiRefreshMetadata, locale: "en" | "zh") {
  if (metadata.dataFreshness === "fresh") {
    return copyText(
      locale,
      "Live snapshot within T3 cadence (15s).",
      "目前為 T3（15 秒）即時快照。",
    );
  }
  if (metadata.dataFreshness === "stale") {
    return copyText(
      locale,
      "Snapshot is stale. Refresh before making dispatch or billing decisions.",
      "資料已過舊，請先重新整理再做派遣或結算判斷。",
    );
  }
  if (metadata.dataFreshness === "degraded") {
    return copyText(
      locale,
      "Source is degraded. Cross-check with platform-admin before acting.",
      "來源已降級，操作前請先到 Platform Admin 交叉確認。",
    );
  }
  return copyText(
    locale,
    "Freshness could not be confirmed.",
    "無法確認這份資料的新鮮度。",
  );
}

function renderActionDescriptor(
  action: ResourceActionDescriptor,
  locale: "en" | "zh",
  href?: string,
  target?: "_blank",
) {
  const labelMap: Record<string, string> = {
    search: copyText(locale, "Search", "查找"),
    clear_filters: copyText(locale, "Clear filters", "清除篩選"),
    open_contract_detail: copyText(locale, "Open detail", "開啟詳情"),
    open_platform_admin: copyText(locale, "Platform Admin", "Platform Admin"),
    open_tenant_console: copyText(locale, "Tenant Console", "Tenant Console"),
  };
  const label = labelMap[action.action] ?? action.action;
  const title =
    action.enabled || !action.disabledReasonCode
      ? undefined
      : formatOpsCodeLabel(locale, action.disabledReasonCode);

  if (href && action.enabled) {
    return (
      <a
        href={href}
        target={target}
        rel={target === "_blank" ? "noreferrer" : undefined}
        style={buttonStyle({
          emphasis: action.action === "search" ? "primary" : "secondary",
        })}
        title={title}
      >
        {label}
      </a>
    );
  }

  return (
    <span
      style={buttonStyle({
        disabled: !action.enabled,
        emphasis: action.action === "search" ? "primary" : "secondary",
      })}
      title={title}
    >
      {label}
    </span>
  );
}

function buildContractDetailHref(contractId: string) {
  return `/contracts/${encodeURIComponent(contractId)}`;
}

function buildActionRenderTarget(
  link: CrossAppResourceLink,
): ActionRenderTarget {
  return link.openMode === "new_tab"
    ? { href: buildCrossAppUrl(link), target: "_blank" }
    : { href: buildCrossAppUrl(link) };
}

function resolveContractActionTarget(
  action: ResourceActionDescriptor,
  contract: ContractListView,
): ActionRenderTarget {
  if (action.action === "open_contract_detail") {
    return { href: buildContractDetailHref(contract.contractId) };
  }

  return {};
}

function resolveRelationActionTarget(
  action: ResourceActionDescriptor,
  entry: PartnerRelationView,
): ActionRenderTarget {
  if (action.action === "open_platform_admin") {
    const link =
      entry.links.find(
        (current: CrossAppResourceLink) =>
          current.targetApp === "platform-admin",
      ) ?? entry.links[0];
    return link ? buildActionRenderTarget(link) : {};
  }

  if (action.action === "open_tenant_console") {
    const link = entry.links.find(
      (current: CrossAppResourceLink) => current.targetApp === "tenant-console",
    );
    return link ? buildActionRenderTarget(link) : {};
  }

  return {};
}

function renderActionList<T>({
  actions,
  locale,
  resolveTarget,
  fallback,
  keyPrefix,
}: {
  actions: ResourceActionDescriptor[];
  locale: "en" | "zh";
  resolveTarget: (
    action: ResourceActionDescriptor,
    record: T,
  ) => ActionRenderTarget;
  fallback: T;
  keyPrefix: string;
}) {
  return actions.map((action) => {
    const { href, target } = resolveTarget(action, fallback);
    return (
      <div key={`${keyPrefix}-${action.action}`}>
        {renderActionDescriptor(action, locale, href, target)}
      </div>
    );
  });
}

function renderEmptyState({
  reason,
  locale,
  query,
  nextAction,
}: {
  reason: ContractsEmptyReason;
  locale: "en" | "zh";
  query: string;
  nextAction?: ResourceActionDescriptor;
}) {
  const config: Record<
    Exclude<EmptyReason, "driver_not_eligible">,
    {
      tone: "neutral" | "warn" | "danger" | "info";
      title: string;
      body: string;
      action?: ReactNode;
    }
  > = {
    no_data: {
      tone: "neutral",
      title: copyText(locale, "No contracts yet", "目前沒有合約資料"),
      body: copyText(
        locale,
        "No contracts or partner relations are registered for the current scope.",
        "目前範圍內尚未建立任何合約或合作夥伴關聯。",
      ),
    },
    not_provisioned: {
      tone: "warn",
      title: copyText(
        locale,
        "Contracts module not provisioned",
        "合約模組尚未開通",
      ),
      body: copyText(
        locale,
        "This tenant or partner stack is not provisioned for contract visibility in ops.",
        "此 tenant 或 partner 堆疊尚未開通 ops 合約檢視。",
      ),
      action: (
        <a
          href={buildCrossAppUrl({
            targetApp: "platform-admin",
            route: "/partners",
            resourceType: "partner_entry",
            resourceId: "contracts",
            openMode: "new_tab",
            label: "Platform Admin",
          })}
          target="_blank"
          rel="noreferrer"
          style={buttonStyle({ emphasis: "secondary" })}
        >
          {copyText(locale, "Open Platform Admin", "到 Platform Admin 查看")}
        </a>
      ),
    },
    fetch_failed: {
      tone: "danger",
      title: copyText(locale, "Contracts load failed", "合約資料載入失敗"),
      body: copyText(
        locale,
        "The registry endpoint did not return a usable payload. Retry before relying on this workspace.",
        "合約註冊表端點沒有回傳可用資料，請先重試再依賴此工作面。",
      ),
      action: (
        <a href="/contracts" style={buttonStyle({ emphasis: "primary" })}>
          {copyText(locale, "Refresh", "重新整理")}
        </a>
      ),
    },
    permission_denied: {
      tone: "danger",
      title: copyText(locale, "Permission denied", "沒有檢視權限"),
      body: copyText(
        locale,
        "The current ops role can see the shell but cannot read contract records.",
        "目前 ops 角色可進入此頁，但沒有讀取合約記錄的權限。",
      ),
    },
    external_unavailable: {
      tone: "warn",
      title: copyText(
        locale,
        "Partner dependency unavailable",
        "合作夥伴依賴目前不可用",
      ),
      body: copyText(
        locale,
        "An external partner or adapter dependency is down, so relation details may be incomplete.",
        "外部合作夥伴或 adapter 依賴異常，關聯資訊可能不完整。",
      ),
      action: (
        <a
          href={buildCrossAppUrl({
            targetApp: "platform-admin",
            route: "/adapter-registry",
            resourceType: "adapter",
            resourceId: "partner-dependency",
            openMode: "new_tab",
            label: "Adapter Registry",
          })}
          target="_blank"
          rel="noreferrer"
          style={buttonStyle({ emphasis: "secondary" })}
        >
          {copyText(locale, "Open adapter registry", "查看 adapter registry")}
        </a>
      ),
    },
    filtered_empty: {
      tone: "info",
      title: copyText(
        locale,
        "No match for current filters",
        "目前條件查不到合約",
      ),
      body: query
        ? copyText(
            locale,
            `No contract or partner relation matched “${query}”.`,
            `沒有任何合約或合作夥伴關聯符合「${query}」。`,
          )
        : copyText(
            locale,
            "Current filters removed every result.",
            "目前篩選條件把所有結果都排除了。",
          ),
      action:
        nextAction?.action === "clear_filters" ? (
          renderActionDescriptor(nextAction, locale, "/contracts")
        ) : (
          <a href="/contracts" style={buttonStyle({ emphasis: "secondary" })}>
            {copyText(locale, "Clear filters", "清除篩選")}
          </a>
        ),
    },
  };

  const state = config[reason]!;
  const toneStyle = cardSurfaceStyle(state.tone);

  return (
    <div
      style={{
        ...toneStyle,
        borderRadius: "16px",
        padding: "20px",
        display: "grid",
        gap: "10px",
      }}
    >
      <strong style={{ fontSize: "16px" }}>{state.title}</strong>
      <div style={{ fontSize: "13px", lineHeight: 1.6 }}>{state.body}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            opacity: 0.75,
          }}
        >
          {reason}
        </span>
        {state.action}
      </div>
    </div>
  );
}

export default async function ContractsPage({
  searchParams,
}: ContractsPageProps) {
  const resolvedSearchParams = await (searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>));
  const query = firstParam(resolvedSearchParams.q)?.trim() ?? "";
  const emptyReasonOverride = parseEmptyReason(
    firstParam(resolvedSearchParams.emptyReason),
  );
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  const [contractsResult, partnerEntriesResult] = await Promise.allSettled([
    client.listContracts(),
    client.listPartnerEntries(),
  ] as const);

  const contracts =
    contractsResult.status === "fulfilled"
      ? (contractsResult.value as RuntimeVehicleContractRecord[])
      : [];
  const partnerEntries =
    partnerEntriesResult.status === "fulfilled"
      ? (partnerEntriesResult.value as RuntimePartnerChannelEntryRecord[])
      : [];

  const errors = [contractsResult, partnerEntriesResult].flatMap((result) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? result.reason.message
            : t("common.unknown", locale),
        ]
      : [],
  );
  const primaryError = errors[0] ?? null;

  const partnerEntriesByPartnerId = new Map<
    string,
    RuntimePartnerChannelEntryRecord[]
  >();
  for (const entry of partnerEntries) {
    const bucket = partnerEntriesByPartnerId.get(entry.partnerId) ?? [];
    bucket.push(entry);
    partnerEntriesByPartnerId.set(entry.partnerId, bucket);
  }

  const contractViews: ContractListView[] = contracts.map((contract) => {
    const linkedEntries =
      partnerEntriesByPartnerId.get(contract.partnerId) ?? [];
    const linkedEntry = linkedEntries[0];
    const expiringSoon =
      contract.status === "active" &&
      daysUntil(contract.endAt) <= 45 &&
      daysUntil(contract.endAt) >= 0;
    return {
      ...contract,
      kindLabel: formatOpsCodeLabel(locale, contract.contractType),
      counterparties: linkedEntry
        ? `${contract.partnerId} · ${linkedEntry.displayName}`
        : contract.partnerId,
      keyTerms: [
        contract.serviceScope,
        linkedEntry
          ? `${linkedEntry.programId} · ${formatOpsCodeLabel(
              locale,
              linkedEntry.eligibilityMode,
            )}`
          : formatOpsCodeLabel(locale, contract.partnerType),
      ].join(" · "),
      expiringSoon,
      availableActions:
        contract.availableActions && contract.availableActions.length > 0
          ? contract.availableActions
          : [
              {
                action: "open_contract_detail",
                enabled: true,
                riskLevel: "low",
              },
            ],
    };
  });

  const partnerRelationViews: PartnerRelationView[] = partnerEntries.map(
    (entry) => {
      const linkedContracts = contractViews.filter(
        (contract) => contract.partnerId === entry.partnerId,
      ).length;
      const platformLink: CrossAppResourceLink = {
        targetApp: "platform-admin",
        route: `/partners/${encodeURIComponent(entry.entrySlug)}`,
        resourceType: "partner_entry",
        resourceId: entry.entrySlug,
        openMode: "new_tab",
        label: copyText(locale, "Partner relation", "合作夥伴關聯"),
      };
      const tenantLink: CrossAppResourceLink = {
        targetApp: "tenant-console",
        route: `/tenants/${encodeURIComponent(entry.tenantId)}`,
        resourceType: "tenant",
        resourceId: entry.tenantId,
        openMode: "new_tab",
        label: copyText(locale, "Tenant SLA", "Tenant SLA"),
      };
      const fallbackActions: ResourceActionDescriptor[] = [
        {
          action: "open_platform_admin",
          enabled: true,
          riskLevel: "low",
        },
        ...(entry.tenantId
          ? [
              {
                action: "open_tenant_console",
                enabled: true,
                riskLevel: "low",
              } satisfies ResourceActionDescriptor,
            ]
          : [
              {
                action: "open_tenant_console",
                enabled: false,
                disabledReasonCode: "tenant_missing",
                riskLevel: "low",
              } satisfies ResourceActionDescriptor,
            ]),
      ];

      return {
        ...entry,
        linkedContracts,
        availableActions:
          entry.availableActions && entry.availableActions.length > 0
            ? entry.availableActions
            : fallbackActions,
        links:
          entry.ownerLinks && entry.ownerLinks.length > 0
            ? entry.ownerLinks
            : [platformLink, tenantLink],
      };
    },
  );

  const normalizedQuery = query.toLowerCase();
  const filteredContracts = contractViews.filter((contract) => {
    if (!normalizedQuery) return true;
    return [
      contract.contractId,
      contract.vehicleId,
      contract.partnerId,
      contract.serviceScope,
      contract.counterparties,
      contract.kindLabel,
      contract.keyTerms,
      contract.operatingAreaId ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const filteredRelations = partnerRelationViews.filter((entry) => {
    if (!normalizedQuery) return true;
    return [
      entry.entrySlug,
      entry.displayName,
      entry.programId,
      entry.tenantId,
      entry.partnerId,
      entry.status,
      entry.eligibilityMode,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  const effectiveUpdatedAt =
    contractViews
      .map((contract) => contract.updatedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const refreshMetadata = buildRefreshMetadata(effectiveUpdatedAt);
  if (primaryError) {
    refreshMetadata.dataFreshness = "degraded";
  }
  const resolvedEmptyReason: ContractsEmptyReason | null =
    emptyReasonOverride ??
    (primaryError
      ? classifyLoadError(primaryError)
      : filteredContracts.length === 0 && filteredRelations.length === 0
        ? query
          ? "filtered_empty"
          : "no_data"
        : null);
  const emptyState: ContractsEmptyStateEnvelope | null = resolvedEmptyReason
    ? resolvedEmptyReason === "filtered_empty"
      ? {
          reason: resolvedEmptyReason,
          messageCode: `contracts.${resolvedEmptyReason}`,
          nextAction: {
            action: "clear_filters",
            enabled: true,
            riskLevel: "low",
          },
        }
      : {
          reason: resolvedEmptyReason,
          messageCode: `contracts.${resolvedEmptyReason}`,
        }
    : null;

  const searchAction: ResourceActionDescriptor = {
    action: "search",
    enabled: true,
    riskLevel: "low",
  };
  const expiringSoonCount = contractViews.filter(
    (contract) => contract.expiringSoon,
  ).length;
  const activeContracts = contractViews.filter(
    (contract) => contract.status === "active",
  ).length;

  const staleTone =
    refreshMetadata.dataFreshness === "degraded"
      ? "danger"
      : refreshMetadata.dataFreshness === "stale"
        ? "warn"
        : "info";

  return (
    <>
      <PageHeader
        eyebrow={copyText(locale, "Registry", "主資料")}
        title={copyText(locale, "Contracts", "合約")}
        subtitle={copyText(
          locale,
          "Ops read-only workspace for dispatch and billing contract context.",
          "ops 唯讀工作面，用來確認派遣與結算的合約上下文。",
        )}
        actions={
          <form
            action="/contracts"
            method="get"
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder={copyText(
                locale,
                "Search contract, partner, tenant…",
                "查找合約、合作夥伴、tenant…",
              )}
              style={{
                minWidth: "260px",
                borderRadius: "999px",
                border: "1px solid #fda4af",
                background: "#ffffff",
                padding: "9px 14px",
                fontSize: "13px",
              }}
            />
            <button type="submit" style={buttonStyle({ emphasis: "primary" })}>
              {copyText(locale, "Search", "查找")}
            </button>
            {query ? (
              <a href="/contracts" style={buttonStyle({ emphasis: "ghost" })}>
                {copyText(locale, "Clear", "清除")}
              </a>
            ) : null}
          </form>
        }
      />

      <div
        style={{
          ...cardSurfaceStyle(staleTone),
          borderRadius: "16px",
          padding: "16px 18px",
          marginBottom: "18px",
          display: "grid",
          gap: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <strong>
            {copyText(
              locale,
              `Refresh tier ${REFRESH_TIER.toUpperCase()} · 15s`,
              `Refresh tier ${REFRESH_TIER.toUpperCase()} · 15 秒`,
            )}
          </strong>
          <div style={{ fontSize: "12.5px" }}>
            {copyText(locale, "Generated at", "生成時間")}{" "}
            {formatDateTime(refreshMetadata.generatedAt, locale)}
          </div>
        </div>
        <div style={{ fontSize: "13px", lineHeight: 1.55 }}>
          {describeFreshness(refreshMetadata, locale)}
        </div>
      </div>

      {primaryError ? (
        <div
          style={{
            ...cardSurfaceStyle("danger"),
            borderRadius: "14px",
            padding: "14px 16px",
            marginBottom: "18px",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        >
          {primaryError}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        <StatCard
          label={copyText(locale, "Active contracts", "生效中合約")}
          value={activeContracts}
          sub={copyText(
            locale,
            "Current billing/dispatch baseline",
            "目前派遣與結算基準",
          )}
          accent="#dc2626"
        />
        <StatCard
          label={copyText(locale, "Expiring soon", "即將到期")}
          value={expiringSoonCount}
          sub={copyText(locale, "Within 45 days", "45 天內到期")}
          accent="#ea580c"
        />
        <StatCard
          label={copyText(locale, "Partner relations", "合作關聯")}
          value={partnerRelationViews.length}
          sub={copyText(
            locale,
            "Entry slug + program visibility",
            "含 entry slug 與 program 視圖",
          )}
          accent="#2563eb"
        />
        <StatCard
          label={copyText(locale, "Contracts visible", "可見合約")}
          value={filteredContracts.length}
          sub={copyText(
            locale,
            "After current search and filters",
            "套用目前搜尋與篩選後",
          )}
          accent="#b45309"
        />
      </div>

      {emptyState ? (
        renderEmptyState(
          emptyState.nextAction
            ? {
                reason: emptyState.reason,
                locale,
                query,
                nextAction: emptyState.nextAction,
              }
            : {
                reason: emptyState.reason,
                locale,
                query,
              },
        )
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.65fr) minmax(320px, 0.95fr)",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <DataViewCard
            title={copyText(locale, "Contracts registry", "合約清單")}
            subtitle={copyText(
              locale,
              `${filteredContracts.length} visible contract(s) · list view follows availableActions and T3 refresh.`,
              `目前可見 ${filteredContracts.length} 份合約 · 以 availableActions 與 T3 refresh 為準。`,
            )}
            tone="info"
            density="compact"
            summary={copyText(
              locale,
              "Must-show: id, parties, effective window, status, key terms summary. Expiring contracts stay visually urgent.",
              "必備欄位：id、雙方、效期、狀態、關鍵條款摘要；即將到期要保留明顯提醒。",
            )}
            actions={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    borderRadius: "999px",
                    border: "1px solid #fecaca",
                    background: "#fff7f7",
                    color: "#b91c1c",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    padding: "6px 10px",
                    textTransform: "uppercase",
                  }}
                >
                  {copyText(locale, "ops read-only", "ops 唯讀")}
                </span>
                {renderActionDescriptor(
                  searchAction,
                  locale,
                  query
                    ? `/contracts?q=${encodeURIComponent(query)}`
                    : "/contracts",
                )}
              </div>
            }
            footer={copyText(
              locale,
              "Opening a contract detail stays in ops. Any mutation continues in Platform Admin or tenant governance via cross-app new-tab links.",
              "開啟合約詳情仍留在 ops；所有 mutation 都要改走 Platform Admin 或 tenant governance 的新分頁 deep link。",
            )}
          >
            <DataTable
              density="compact"
              tone="info"
              columns={[
                { label: copyText(locale, "Contract", "合約"), width: "160px" },
                {
                  label: copyText(locale, "Counterparty", "合作對象"),
                  width: "260px",
                },
                { label: copyText(locale, "Kind", "類型"), width: "150px" },
                {
                  label: copyText(locale, "Term", "效期"),
                  width: "210px",
                },
                {
                  label: copyText(locale, "Key terms", "關鍵條款"),
                  width: "260px",
                },
                { label: copyText(locale, "Status", "狀態"), width: "150px" },
                { label: copyText(locale, "Actions", "動作"), width: "152px" },
              ]}
              empty={copyText(locale, "No contracts found.", "查無合約。")}
            >
              {filteredContracts.map((contract) => (
                <Tr key={contract.contractId}>
                  <Td density="compact">
                    <DataCellStack
                      primary={
                        <Link
                          href={buildContractDetailHref(contract.contractId)}
                          style={{
                            color: "#0f172a",
                            fontWeight: 700,
                            textDecoration: "none",
                          }}
                        >
                          {contract.contractId}
                        </Link>
                      }
                      secondary={contract.vehicleId}
                      tertiary={
                        contract.operatingAreaId ?? t("common.dash", locale)
                      }
                    />
                  </Td>
                  <Td density="compact">
                    <DataCellStack
                      primary={contract.counterparties}
                      secondary={formatOpsCodeLabel(
                        locale,
                        contract.partnerType,
                      )}
                      tertiary={
                        contract.expiringSoon
                          ? copyText(locale, "Expiring soon", "即將到期")
                          : undefined
                      }
                    />
                  </Td>
                  <Td density="compact">
                    <DataCellStack
                      primary={contract.kindLabel}
                      secondary={formatOpsCodeLabel(
                        locale,
                        contract.lifecycleStatus,
                      )}
                    />
                  </Td>
                  <Td density="compact">
                    <DataCellStack
                      primary={`${formatDate(contract.startAt, locale)} → ${formatDate(contract.endAt, locale)}`}
                      secondary={copyText(
                        locale,
                        `Updated ${formatDateTime(contract.updatedAt, locale)}`,
                        `更新於 ${formatDateTime(contract.updatedAt, locale)}`,
                      )}
                    />
                  </Td>
                  <Td density="compact" muted>
                    {contract.keyTerms}
                  </Td>
                  <Td density="compact">
                    <div style={{ display: "grid", gap: "6px" }}>
                      <StatusChip
                        tone={
                          contract.expiringSoon
                            ? "warning"
                            : contractStatusTone(contract.status)
                        }
                        authorityLabel={copyText(locale, "state", "狀態")}
                        label={
                          contract.expiringSoon
                            ? copyText(locale, "expiring soon", "即將到期")
                            : formatOpsCodeLabel(locale, contract.status)
                        }
                      />
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {formatOpsCodeLabel(locale, contract.status)}
                      </span>
                    </div>
                  </Td>
                  <Td density="compact">
                    <div style={{ display: "grid", gap: "8px" }}>
                      {renderActionList({
                        actions: contract.availableActions,
                        locale,
                        resolveTarget: resolveContractActionTarget,
                        fallback: contract,
                        keyPrefix: contract.contractId,
                      })}
                    </div>
                  </Td>
                </Tr>
              ))}
            </DataTable>
          </DataViewCard>

          <div style={{ display: "grid", gap: "18px" }}>
            <DataViewCard
              title={copyText(
                locale,
                "Partner relations panel",
                "合作夥伴關聯面板",
              )}
              subtitle={copyText(
                locale,
                "Partner entry slug, program, relation status, and owner-app deep links.",
                "顯示 partner entry slug、program、關聯狀態，以及 owner app deep link。",
              )}
              tone="warning"
              density="compact"
              summary={copyText(
                locale,
                "Cross-app navigation opens a new tab by default. Mutation remains outside ops.",
                "跨 app 導航預設開新分頁；mutation 不在 ops 內進行。",
              )}
            >
              <DataTable
                density="compact"
                tone="warning"
                columns={[
                  { label: copyText(locale, "Entry", "入口"), width: "200px" },
                  {
                    label: copyText(locale, "Program", "方案"),
                    width: "180px",
                  },
                  { label: copyText(locale, "Status", "狀態"), width: "150px" },
                  { label: copyText(locale, "Links", "連結") },
                ]}
                empty={copyText(
                  locale,
                  "No partner relations found.",
                  "查無合作夥伴關聯。",
                )}
              >
                {filteredRelations.map((entry) => (
                  <Tr key={entry.entrySlug}>
                    <Td density="compact">
                      <DataCellStack
                        primary={<strong>{entry.displayName}</strong>}
                        secondary={entry.entrySlug}
                        tertiary={`${entry.partnerId} · ${entry.tenantId}`}
                      />
                    </Td>
                    <Td density="compact">
                      <DataCellStack
                        primary={entry.programId}
                        secondary={formatOpsCodeLabel(
                          locale,
                          entry.businessDispatchSubtype,
                        )}
                        tertiary={`${copyText(locale, "Linked contracts", "關聯合約")} · ${entry.linkedContracts}`}
                      />
                    </Td>
                    <Td density="compact">
                      <div style={{ display: "grid", gap: "6px" }}>
                        <StatusChip
                          tone={entry.activeFlag ? "success" : "warning"}
                          authorityLabel={copyText(locale, "relation", "關聯")}
                          label={formatOpsCodeLabel(locale, entry.status)}
                        />
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          {formatOpsCodeLabel(locale, entry.eligibilityMode)}
                        </span>
                      </div>
                    </Td>
                    <Td density="compact">
                      <div
                        style={{
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        {renderActionList({
                          actions: entry.availableActions,
                          locale,
                          resolveTarget: resolveRelationActionTarget,
                          fallback: entry,
                          keyPrefix: entry.entrySlug,
                        })}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>

            <div
              style={{
                ...cardSurfaceStyle("neutral"),
                borderRadius: "16px",
                padding: "18px",
                display: "grid",
                gap: "12px",
              }}
            >
              <strong style={{ fontSize: "14px", color: "#0f172a" }}>
                {copyText(locale, "Operational read scope", "營運端可讀範圍")}
              </strong>
              <div style={{ fontSize: "13px", lineHeight: 1.6 }}>
                {copyText(
                  locale,
                  "This workspace is for dispatch and billing confirmation only. Contract mutation, version upgrades, and partner governance stay in Platform Admin or Tenant Console.",
                  "這個工作面只用來確認派遣與結算上下文。合約異動、版本升級、partner governance 仍在 Platform Admin 或 Tenant Console 執行。",
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <a
                  href={buildCrossAppUrl({
                    targetApp: "platform-admin",
                    route: "/partners",
                    resourceType: "partner_entry",
                    resourceId: "contracts",
                    openMode: "new_tab",
                    label: "Platform Admin",
                  })}
                  target="_blank"
                  rel="noreferrer"
                  style={buttonStyle({ emphasis: "secondary" })}
                >
                  {copyText(
                    locale,
                    "Open Platform Admin",
                    "前往 Platform Admin",
                  )}
                </a>
                <a
                  href={buildCrossAppUrl({
                    targetApp: "tenant-console",
                    route: "/slas",
                    resourceType: "tenant",
                    resourceId: "contract-ops-scope",
                    openMode: "new_tab",
                    label: "Tenant Console",
                  })}
                  target="_blank"
                  rel="noreferrer"
                  style={buttonStyle({ emphasis: "ghost" })}
                >
                  {copyText(
                    locale,
                    "Open Tenant Console",
                    "前往 Tenant Console",
                  )}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
