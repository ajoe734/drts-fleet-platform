import type { CSSProperties, ReactNode } from "react";
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
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { DataCellStack, DataTable, PageHeader, StatusChip, Td, Tr } from "@drts/ui-web";

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
  contractKindLabel: string;
  typeLabel: string;
  counterparties: string;
  keyTerms: string;
  expiringSoon: boolean;
  availableActions: ResourceActionDescriptor[];
};

type PartnerRelationView = RuntimePartnerChannelEntryRecord & {
  linkedContracts: number;
  availableActions: ResourceActionDescriptor[];
  links: CrossAppResourceLink[];
};

type SectionEmptyState = {
  reason: ContractsEmptyReason;
  nextAction?: ResourceActionDescriptor;
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

const PAGE_SURFACE: CSSProperties = {
  display: "grid",
  gap: "16px",
};

const PANEL_SURFACE: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e7d7d1",
  borderRadius: "18px",
  boxShadow: "0 12px 32px rgba(71, 33, 24, 0.06)",
};

const PANEL_HEADER_LABEL: CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#9f1239",
};

const MONO_TEXT: CSSProperties = {
  fontFamily:
    '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
};

function copyText(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function humanizeAction(action: string) {
  return action
    .split("_")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
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
          boxShadow: disabled ? "none" : "0 10px 24px rgba(220, 38, 38, 0.18)",
        }
      : emphasis === "ghost"
        ? {
            border: "1px solid #ead8d1",
            background: disabled ? "#f8f4f2" : "#fffaf8",
            color: disabled ? "#94a3b8" : "#6b4f46",
            boxShadow: "none",
          }
        : {
            border: "1px solid #f8cfc1",
            background: disabled ? "#fff3ef" : "#fff7f3",
            color: disabled ? "#94a3b8" : "#9f1239",
            boxShadow: "none",
          };

  return {
    ...styles,
    borderRadius: "999px",
    padding: "7px 12px",
    fontSize: "12px",
    fontWeight: 700,
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
        background: "linear-gradient(180deg, #fff8ed 0%, #fff1de 100%)",
        border: "1px solid #fdba74",
        color: "#9a3412",
      };
    case "danger":
      return {
        background: "linear-gradient(180deg, #fff4f4 0%, #ffe7e7 100%)",
        border: "1px solid #fca5a5",
        color: "#b91c1c",
      };
    case "info":
      return {
        background: "linear-gradient(180deg, #f5fbff 0%, #edf6ff 100%)",
        border: "1px solid #93c5fd",
        color: "#1d4ed8",
      };
    default:
      return {
        background: "linear-gradient(180deg, #fffdfc 0%, #f7f2ef 100%)",
        border: "1px solid #e7d7d1",
        color: "#4b5563",
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

function metricTile({
  label,
  value,
  accent,
  detail,
}: {
  label: string;
  value: string | number;
  accent: string;
  detail: string;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "16px",
        background: "#fffaf8",
        border: `1px solid ${accent}22`,
        boxShadow: `inset 0 0 0 1px ${accent}10`,
        display: "grid",
        gap: "6px",
      }}
    >
      <span style={{ ...PANEL_HEADER_LABEL, color: accent }}>{label}</span>
      <strong style={{ fontSize: "28px", lineHeight: 1, color: "#1f2937" }}>
        {value}
      </strong>
      <span style={{ color: "#7c665f", fontSize: "12px", lineHeight: 1.5 }}>
        {detail}
      </span>
    </div>
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
  const label = labelMap[action.action] ?? humanizeAction(action.action);
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
        {target === "_blank" ? (
          <span style={{ marginLeft: "6px", fontSize: "11px", opacity: 0.8 }}>
            {copyText(locale, "new tab", "新分頁")}
          </span>
        ) : null}
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
  nextAction?: ResourceActionDescriptor | undefined;
}) {
  const config: Record<
    Exclude<EmptyReason, "driver_not_eligible">,
    {
      tone: "neutral" | "warn" | "danger" | "info";
      badge: string;
      title: string;
      body: string;
      action?: ReactNode;
    }
  > = {
    no_data: {
      tone: "neutral",
      badge: "NO DATA",
      title: copyText(locale, "No contracts yet", "目前沒有合約資料"),
      body: copyText(
        locale,
        "No contracts or partner relations are registered for the current scope.",
        "目前範圍內尚未建立任何合約或合作夥伴關聯。",
      ),
    },
    not_provisioned: {
      tone: "warn",
      badge: "PROVISION",
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
      badge: "RETRY",
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
      badge: "DENIED",
      title: copyText(locale, "Permission denied", "沒有檢視權限"),
      body: copyText(
        locale,
        "The current ops role can see the shell but cannot read contract records.",
        "目前 ops 角色可進入此頁，但沒有讀取合約記錄的權限。",
      ),
    },
    external_unavailable: {
      tone: "warn",
      badge: "DEPENDENCY",
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
      badge: "FILTERED",
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
        borderRadius: "18px",
        padding: "20px 22px",
        display: "grid",
        gap: "10px",
      }}
    >
      <span style={{ ...PANEL_HEADER_LABEL, color: toneStyle.color }}>
        {state.badge}
      </span>
      <strong style={{ fontSize: "18px", color: "#1f2937" }}>{state.title}</strong>
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
            ...MONO_TEXT,
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
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

function renderSectionNotice({
  title,
  body,
  tone,
  action,
}: {
  title: string;
  body: string;
  tone: "neutral" | "warn" | "danger" | "info";
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        ...cardSurfaceStyle(tone),
        borderRadius: "16px",
        padding: "16px",
        display: "grid",
        gap: "8px",
      }}
    >
      <strong style={{ fontSize: "14px", color: "#1f2937" }}>{title}</strong>
      <div style={{ fontSize: "13px", lineHeight: 1.55 }}>{body}</div>
      {action ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {action}
        </div>
      ) : null}
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
  const contractsError =
    contractsResult.status === "rejected"
      ? contractsResult.reason instanceof Error
        ? contractsResult.reason.message
        : t("common.unknown", locale)
      : null;
  const partnerEntriesError =
    partnerEntriesResult.status === "rejected"
      ? partnerEntriesResult.reason instanceof Error
        ? partnerEntriesResult.reason.message
        : t("common.unknown", locale)
      : null;

  const contracts =
    contractsResult.status === "fulfilled"
      ? (contractsResult.value as RuntimeVehicleContractRecord[])
      : [];
  const partnerEntries =
    partnerEntriesResult.status === "fulfilled"
      ? (partnerEntriesResult.value as RuntimePartnerChannelEntryRecord[])
      : [];

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
    const daysToExpiry = daysUntil(contract.endAt);
    const expiringSoon =
      contract.status === "active" && daysToExpiry <= 45 && daysToExpiry >= 0;

    return {
      ...contract,
      contractKindLabel: formatOpsCodeLabel(locale, contract.contractType),
      typeLabel: formatOpsCodeLabel(locale, contract.partnerType),
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
      contract.contractKindLabel,
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
    [
      ...contractViews.map((contract) => contract.updatedAt),
      ...partnerRelationViews.map((entry) => entry.updatedAt),
    ].sort((left, right) => right.localeCompare(left))[0] ?? null;
  const refreshMetadata = buildRefreshMetadata(effectiveUpdatedAt);
  if (contractsError || partnerEntriesError) {
    refreshMetadata.dataFreshness = "degraded";
  }

  const contractsSectionEmptyState: SectionEmptyState | null =
    contractsError ||
    (contracts.length === 0 && partnerRelationViews.length > 0)
      ? {
          reason: contractsError
            ? classifyLoadError(contractsError)
            : "no_data",
        }
      : query && filteredContracts.length === 0
        ? {
            reason: "filtered_empty",
            nextAction: {
              action: "clear_filters",
              enabled: true,
              riskLevel: "low",
            },
          }
        : null;
  const partnerRelationsSectionEmptyState: SectionEmptyState | null =
    partnerEntriesError ||
    (partnerRelationViews.length === 0 && contracts.length > 0)
      ? {
          reason: partnerEntriesError
            ? classifyLoadError(partnerEntriesError)
            : "no_data",
        }
      : query && filteredRelations.length === 0
        ? {
            reason: "filtered_empty",
            nextAction: {
              action: "clear_filters",
              enabled: true,
              riskLevel: "low",
            },
          }
        : null;
  const resolvedEmptyReason: ContractsEmptyReason | null =
    emptyReasonOverride ??
    (contractsError && partnerEntriesError
      ? classifyLoadError(contractsError)
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
          "Ops read-only registry for dispatch and billing contract context. Mutation stays in Platform Admin or Tenant Console.",
          "ops 唯讀合約 registry，用來確認派遣與結算上下文；所有 mutation 仍留在 Platform Admin 或 Tenant Console。",
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
                "Search contract, partner, tenant...",
                "查找合約、合作夥伴、tenant...",
              )}
              style={{
                minWidth: "280px",
                borderRadius: "999px",
                border: "1px solid #f1c9bb",
                background: "#fffaf7",
                color: "#1f2937",
                padding: "10px 14px",
                fontSize: "13px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
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

      <div style={PAGE_SURFACE}>
        <div
          style={{
            ...PANEL_SURFACE,
            padding: "18px",
            display: "grid",
            gap: "16px",
            background:
              "radial-gradient(circle at top right, rgba(252, 165, 165, 0.18), transparent 28%), #ffffff",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: "8px" }}>
              <span style={PANEL_HEADER_LABEL}>
                {copyText(locale, "Contracts Registry", "Contracts Registry")}
              </span>
              <strong
                style={{
                  fontSize: "20px",
                  lineHeight: 1.2,
                  color: "#111827",
                }}
              >
                {copyText(
                  locale,
                  "Contract + partner relationship context for ops decisions.",
                  "為營運判斷提供合約與合作關係上下文。",
                )}
              </strong>
              <span style={{ color: "#7c665f", fontSize: "13px", lineHeight: 1.6 }}>
                {copyText(
                  locale,
                  "Must-show fields follow packet §5.18: contract id, type, parties, status, effective term, key terms summary, plus partner relation slug / program / eligibility.",
                  "依 packet §5.18 顯示 contract id、type、parties、status、effective term、key terms summary，以及 partner relation slug / program / eligibility。",
                )}
              </span>
            </div>

            <div
              style={{
                ...cardSurfaceStyle(staleTone),
                borderRadius: "16px",
                padding: "16px",
                display: "grid",
                gap: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ ...PANEL_HEADER_LABEL, color: "#b91c1c" }}>
                  {copyText(locale, "Refresh Tier", "Refresh Tier")}
                </span>
                <span style={{ ...MONO_TEXT, fontSize: "12px" }}>
                  {REFRESH_TIER.toUpperCase()} / 15000ms
                </span>
              </div>
              <strong style={{ fontSize: "15px", color: "#1f2937" }}>
                {describeFreshness(refreshMetadata, locale)}
              </strong>
              <span style={{ color: "#7c665f", fontSize: "12px", lineHeight: 1.55 }}>
                {copyText(locale, "Generated at", "生成時間")}{" "}
                <span style={MONO_TEXT}>
                  {formatDateTime(refreshMetadata.generatedAt, locale)}
                </span>
              </span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            {metricTile({
              label: copyText(locale, "ACTIVE", "生效中"),
              value: activeContracts,
              accent: "#dc2626",
              detail: copyText(
                locale,
                "Current dispatch and billing baseline",
                "目前派遣與結算基準",
              ),
            })}
            {metricTile({
              label: copyText(locale, "EXPIRING", "即將到期"),
              value: expiringSoonCount,
              accent: "#ea580c",
              detail: copyText(locale, "Within 45 days", "45 天內到期"),
            })}
            {metricTile({
              label: copyText(locale, "RELATIONS", "合作關聯"),
              value: partnerRelationViews.length,
              accent: "#2563eb",
              detail: copyText(
                locale,
                "Partner slug and program visibility",
                "partner slug 與 program 視圖",
              ),
            })}
            {metricTile({
              label: copyText(locale, "VISIBLE", "目前可見"),
              value: filteredContracts.length,
              accent: "#9f1239",
              detail: copyText(
                locale,
                "After current search / filters",
                "套用目前搜尋與篩選後",
              ),
            })}
          </div>
        </div>

        {contractsError || partnerEntriesError ? (
          <div
            style={{
              ...cardSurfaceStyle("danger"),
              borderRadius: "16px",
              padding: "16px 18px",
              display: "grid",
              gap: "6px",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "#1f2937" }}>
              {copyText(
                locale,
                "Partial contract context is degraded",
                "部分合約上下文目前降級",
              )}
            </strong>
            {contractsError ? (
              <div>
                {copyText(locale, "Contracts source:", "合約來源：")}{" "}
                {contractsError}
              </div>
            ) : null}
            {partnerEntriesError ? (
              <div>
                {copyText(locale, "Partner relations source:", "合作關聯來源：")}{" "}
                {partnerEntriesError}
              </div>
            ) : null}
          </div>
        ) : null}

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
          <>
            <section style={{ ...PANEL_SURFACE, overflow: "hidden" }}>
              <div
                style={{
                  padding: "18px 18px 14px",
                  borderBottom: "1px solid #efe1db",
                  display: "grid",
                  gap: "6px",
                  background:
                    "linear-gradient(180deg, rgba(255, 248, 244, 0.92) 0%, rgba(255,255,255,0.95) 100%)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span style={PANEL_HEADER_LABEL}>
                      {copyText(locale, "Primary Table", "主要表格")}
                    </span>
                    <strong style={{ fontSize: "18px", color: "#111827" }}>
                      {copyText(locale, "Contracts", "合約")}
                    </strong>
                  </div>
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
                        ...buttonStyle({ emphasis: "ghost" }),
                        cursor: "default",
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
                </div>
                <div style={{ color: "#7c665f", fontSize: "12.5px", lineHeight: 1.55 }}>
                  {copyText(
                    locale,
                    `${filteredContracts.length} visible contract(s). Expiring contracts stay visually urgent; row CTAs follow availableActions.`,
                    `目前可見 ${filteredContracts.length} 份合約；即將到期維持明顯提醒，列動作依 availableActions 呈現。`,
                  )}
                </div>
              </div>

              <div style={{ padding: "0 8px 8px" }}>
                {contractsSectionEmptyState ? (
                  <div style={{ padding: "14px 10px 10px" }}>
                    {contractsSectionEmptyState.nextAction ? (
                      renderEmptyState({
                        reason: contractsSectionEmptyState.reason,
                        locale,
                        query,
                        nextAction: contractsSectionEmptyState.nextAction,
                      })
                    ) : (
                      renderEmptyState({
                        reason: contractsSectionEmptyState.reason,
                        locale,
                        query,
                      })
                    )}
                  </div>
                ) : (
                  <DataTable
                    density="compact"
                    tone="info"
                    columns={[
                      {
                        label: copyText(locale, "CONTRACT", "CONTRACT"),
                        width: "160px",
                      },
                      {
                        label: copyText(locale, "COUNTERPARTY", "COUNTERPARTY"),
                        width: "250px",
                      },
                      {
                        label: copyText(locale, "KIND", "KIND"),
                        width: "150px",
                      },
                      {
                        label: copyText(locale, "TERM", "TERM"),
                        width: "230px",
                      },
                      {
                        label: copyText(locale, "KEY TERMS", "KEY TERMS"),
                        width: "260px",
                      },
                      {
                        label: copyText(locale, "STATUS", "STATUS"),
                        width: "160px",
                      },
                      {
                        label: copyText(locale, "ACTIONS", "ACTIONS"),
                        width: "180px",
                      },
                    ]}
                    empty={copyText(locale, "No contracts found.", "查無合約。")}
                  >
                    {filteredContracts.map((contract) => {
                      const remainingDays =
                        contract.endAt && contract.expiringSoon
                          ? daysUntil(contract.endAt)
                          : null;

                      return (
                        <Tr key={contract.contractId}>
                          <Td density="compact">
                            <DataCellStack
                              primary={
                                <Link
                                  href={buildContractDetailHref(contract.contractId)}
                                  style={{
                                    ...MONO_TEXT,
                                    color: "#111827",
                                    fontWeight: 700,
                                    textDecoration: "none",
                                    fontSize: "12.5px",
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
                              secondary={contract.typeLabel}
                              tertiary={
                                contract.expiringSoon
                                  ? copyText(locale, "Visual urgency: expiring", "視覺提醒：即將到期")
                                  : undefined
                              }
                            />
                          </Td>
                          <Td density="compact">
                            <DataCellStack
                              primary={contract.contractKindLabel}
                              secondary={contract.typeLabel}
                              tertiary={formatOpsCodeLabel(
                                locale,
                                contract.lifecycleStatus,
                              )}
                            />
                          </Td>
                          <Td density="compact">
                            <DataCellStack
                              primary={`${formatDate(contract.startAt, locale)} -> ${formatDate(contract.endAt, locale)}`}
                              secondary={copyText(
                                locale,
                                `Updated ${formatDateTime(contract.updatedAt, locale)}`,
                                `更新於 ${formatDateTime(contract.updatedAt, locale)}`,
                              )}
                              tertiary={
                                contract.expiringSoon && remainingDays !== null
                                  ? copyText(
                                      locale,
                                      `${remainingDays} day(s) remaining`,
                                      `剩餘 ${remainingDays} 天`,
                                    )
                                  : undefined
                              }
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
                              <span style={{ fontSize: "12px", color: "#7c665f" }}>
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
                      );
                    })}
                  </DataTable>
                )}
              </div>
            </section>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "16px",
                alignItems: "start",
              }}
            >
              <section style={{ ...PANEL_SURFACE, overflow: "hidden" }}>
                <div
                  style={{
                    padding: "18px 18px 14px",
                    borderBottom: "1px solid #efe1db",
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  <span style={PANEL_HEADER_LABEL}>
                    {copyText(locale, "Partner Relation Panel", "合作關聯面板")}
                  </span>
                  <strong style={{ fontSize: "18px", color: "#111827" }}>
                    {copyText(
                      locale,
                      "Partner entries and owner-app links",
                      "合作夥伴 entry 與 owner-app 連結",
                    )}
                  </strong>
                  <span style={{ color: "#7c665f", fontSize: "12.5px", lineHeight: 1.55 }}>
                    {copyText(
                      locale,
                      "Shows entry slug, program id, relation status, eligibility mode, and cross-app deep links.",
                      "顯示 entry slug、program id、relation status、eligibility mode，以及 cross-app deep link。",
                    )}
                  </span>
                </div>

                <div style={{ padding: "0 8px 8px" }}>
                  {partnerRelationsSectionEmptyState ? (
                    <div style={{ padding: "14px 10px 10px" }}>
                      {partnerRelationsSectionEmptyState.nextAction ? (
                        renderEmptyState({
                          reason: partnerRelationsSectionEmptyState.reason,
                          locale,
                          query,
                          nextAction: partnerRelationsSectionEmptyState.nextAction,
                        })
                      ) : (
                        renderEmptyState({
                          reason: partnerRelationsSectionEmptyState.reason,
                          locale,
                          query,
                        })
                      )}
                    </div>
                  ) : (
                    <DataTable
                      density="compact"
                      tone="warning"
                      columns={[
                        { label: copyText(locale, "ENTRY", "ENTRY"), width: "220px" },
                        { label: copyText(locale, "PROGRAM", "PROGRAM"), width: "180px" },
                        { label: copyText(locale, "STATUS", "STATUS"), width: "170px" },
                        { label: copyText(locale, "LINKS", "LINKS") },
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
                              secondary={
                                <span style={MONO_TEXT}>{entry.entrySlug}</span>
                              }
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
                                authorityLabel={copyText(
                                  locale,
                                  "relation",
                                  "關聯",
                                )}
                                label={formatOpsCodeLabel(locale, entry.status)}
                              />
                              <span style={{ fontSize: "12px", color: "#7c665f" }}>
                                {formatOpsCodeLabel(locale, entry.eligibilityMode)}
                              </span>
                            </div>
                          </Td>
                          <Td density="compact">
                            <div style={{ display: "grid", gap: "8px" }}>
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
                  )}
                </div>
              </section>

              <div style={{ display: "grid", gap: "16px" }}>
                {renderSectionNotice({
                  title: copyText(
                    locale,
                    "Operational read scope",
                    "營運端可讀範圍",
                  ),
                  body: copyText(
                    locale,
                    "Contract mutation, version upgrades, and partner governance stay in Platform Admin or Tenant Console. Ops keeps read-only visibility for dispatch, billing, and compliance verification.",
                    "合約異動、版本升級、partner governance 仍在 Platform Admin 或 Tenant Console；ops 保留唯讀可視性來支援派遣、結算與合規確認。",
                  ),
                  tone: "neutral",
                  action: (
                    <>
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
                        <span
                          style={{
                            marginLeft: "6px",
                            fontSize: "11px",
                            opacity: 0.8,
                          }}
                        >
                          {copyText(locale, "new tab", "新分頁")}
                        </span>
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
                        <span
                          style={{
                            marginLeft: "6px",
                            fontSize: "11px",
                            opacity: 0.8,
                          }}
                        >
                          {copyText(locale, "new tab", "新分頁")}
                        </span>
                      </a>
                    </>
                  ),
                })}

                {renderSectionNotice({
                  title: copyText(
                    locale,
                    "Navigation behavior",
                    "導頁行為",
                  ),
                  body: copyText(
                    locale,
                    "Opening contract detail stays inside ops. Cross-app deep links open a new tab by default and keep authority with the owning app.",
                    "開啟合約詳情會留在 ops 內；跨 app deep link 預設新分頁，維持由 owner app 執行權限與異動。",
                  ),
                  tone: "info",
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
