import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  EmptyReason,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  TenantAddressRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
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

const primaryCellStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const inactiveCellStyle: CSSProperties = {
  color: th.textMuted,
  fontWeight: 600,
};

const tagListStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
};

const addressTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.4,
};

const ownerLinkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
};

const ownerNeutralStyle: CSSProperties = {
  color: th.textMuted,
};

const rowActionsStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  flexWrap: "wrap",
};

const inlineActionWrapperStyle: CSSProperties = {
  display: "inline-flex",
};

const tabLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  color: th.textMuted,
  fontSize: 12,
  flexWrap: "wrap",
};

const metaPillRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const emptyStateCardStyle: CSSProperties = {
  padding: 48,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  color: th.text,
  fontSize: 15,
  fontWeight: 600,
};

const emptyBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
  maxWidth: 480,
};

const PAGE_REFRESH_TIER: RefreshTier = "slow";

const REFRESH_TIER_LABEL: Record<RefreshTier, string> = {
  urgent: "T1 即時 · 推播 + 5s 補抽",
  fast: "T2 快速 · 3s",
  dispatch: "T3 派遣 · 5s",
  medium: "T4 中速 · 15s",
  medium_slow: "T4.5 中慢 · 30s",
  slow: "T5 慢速 · 30s",
  manual: "手動更新",
};

type AddressTabKey = "all" | "active" | "inactive";

const ADDRESS_TABS: { key: AddressTabKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "啟用中" },
  { key: "inactive", label: "已停用" },
];

// Per-app empty-reason set from packet §3.6. The contract's seventh value
// `driver_not_eligible` is driver-app-specific; tenant-console renders six.
const TENANT_EMPTY_REASONS = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies readonly EmptyReason[];

type TenantEmptyReason = (typeof TENANT_EMPTY_REASONS)[number];

type EmptyStateCopy = {
  title: string;
  body: string;
  tone: CanvasTone;
  nextAction?: ResourceActionDescriptor;
};

const EMPTY_STATE_COPY: Record<TenantEmptyReason, EmptyStateCopy> = {
  no_data: {
    title: "尚無地址資料",
    body: "建立第一個常用地址，以便在叫車時快速帶入。",
    tone: "neutral",
    nextAction: {
      action: "create",
      enabled: true,
      riskLevel: "medium",
    },
  },
  not_provisioned: {
    title: "地址簿尚未啟用",
    body: "你的租戶尚未啟用地址簿模組。請聯絡租戶管理員或前往整合就緒度頁面確認模組狀態。",
    tone: "warn",
  },
  fetch_failed: {
    title: "無法載入地址資料",
    body: "後端讀取失敗。請稍候再試；若狀況持續，請至稽核 / 整合就緒度頁面查看相關事件。",
    tone: "danger",
  },
  permission_denied: {
    title: "你沒有權限檢視地址簿",
    body: "此頁僅開放 tc_operator 或 tc_admin 角色檢視。請聯絡租戶管理員調整角色設定。",
    tone: "warn",
  },
  external_unavailable: {
    title: "地圖 / 地理編碼服務目前無法使用",
    body: "依賴的外部地圖服務暫時無法回應，部分地址資訊可能無法呈現。請稍候再試。",
    tone: "warn",
  },
  filtered_empty: {
    title: "沒有符合篩選條件的地址",
    body: "請調整目前的搜尋字串、標籤或啟用狀態篩選。",
    tone: "neutral",
  },
};

function isEmptyReasonOverride(
  value: string | undefined,
): value is TenantEmptyReason {
  return (
    typeof value === "string" &&
    (TENANT_EMPTY_REASONS as readonly string[]).includes(value)
  );
}

function isAddressTabKey(value: string | undefined): value is AddressTabKey {
  return ADDRESS_TABS.some((tab) => tab.key === value);
}

function getSelectedTab(rawTab: string | undefined): AddressTabKey {
  return isAddressTabKey(rawTab) ? rawTab : "all";
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

type AddressPageData = {
  addresses: TenantAddressRecord[];
  passengersById: Map<string, TenantPassengerRecord>;
  errors: string[];
  fetchFailed: boolean;
};

function comparePassengers(
  left: TenantAddressRecord,
  right: TenantAddressRecord,
) {
  if (left.activeFlag !== right.activeFlag) {
    return left.activeFlag ? -1 : 1;
  }
  return left.addressName.localeCompare(right.addressName, "zh-Hant");
}

async function loadAddressesData(): Promise<AddressPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  const [addressesResult, passengersResult] = await Promise.allSettled([
    client.listAddresses() as Promise<TenantAddressRecord[]>,
    client.listPassengers() as Promise<TenantPassengerRecord[]>,
  ]);

  const addresses =
    addressesResult.status === "fulfilled"
      ? [...addressesResult.value].sort(comparePassengers)
      : [];

  const passengersById = new Map<string, TenantPassengerRecord>();
  if (passengersResult.status === "fulfilled") {
    for (const passenger of passengersResult.value) {
      passengersById.set(passenger.passengerId, passenger);
    }
  } else {
    errors.push(`乘客索引: ${toErrorMessage(passengersResult.reason)}`);
  }

  if (addressesResult.status === "rejected") {
    errors.push(`地址目錄: ${toErrorMessage(addressesResult.reason)}`);
  }

  return {
    addresses,
    passengersById,
    errors,
    fetchFailed: addressesResult.status === "rejected",
  };
}

function matchesTab(address: TenantAddressRecord, tab: AddressTabKey) {
  if (tab === "all") return true;
  if (tab === "active") return address.activeFlag;
  return !address.activeFlag;
}

function matchesTag(address: TenantAddressRecord, tag: string | undefined) {
  if (!tag) return true;
  return address.tags.includes(tag);
}

function matchesSearch(
  address: TenantAddressRecord,
  search: string | undefined,
) {
  if (!search) return true;
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  if (address.addressName.toLowerCase().includes(needle)) return true;
  if (address.addressText.toLowerCase().includes(needle)) return true;
  if (
    address.normalizedAddressText &&
    address.normalizedAddressText.toLowerCase().includes(needle)
  )
    return true;
  return false;
}

function buildPageAvailableActions(): ResourceActionDescriptor[] {
  return [
    { action: "create", enabled: true, riskLevel: "medium" },
    { action: "export_view", enabled: true, riskLevel: "low" },
  ];
}

function buildRowAvailableActions(
  address: TenantAddressRecord,
): ResourceActionDescriptor[] {
  const deactivate: ResourceActionDescriptor = {
    action: "deactivate",
    enabled: address.activeFlag,
    requiresReason: true,
    riskLevel: "high",
  };
  if (!address.activeFlag) {
    deactivate.disabledReasonCode = "already_deactivated";
  }

  const reactivate: ResourceActionDescriptor = {
    action: "reactivate",
    enabled: !address.activeFlag,
    riskLevel: "medium",
  };
  if (address.activeFlag) {
    reactivate.disabledReasonCode = "already_active";
  }

  return [
    { action: "edit", enabled: true, riskLevel: "medium" },
    deactivate,
    reactivate,
  ];
}

function findAction(
  actions: ResourceActionDescriptor[],
  name: string,
): ResourceActionDescriptor | undefined {
  return actions.find((descriptor) => descriptor.action === name);
}

const ACTION_LABELS: Record<string, string> = {
  edit: "編輯",
  deactivate: "軟停用",
  reactivate: "恢復啟用",
  create: "新增地址",
  export_view: "匯出檢視",
};

const DISABLED_REASON_LABELS: Record<string, string> = {
  already_deactivated: "已停用",
  already_active: "已啟用",
};

function renderRowAction(descriptor: ResourceActionDescriptor) {
  const label = ACTION_LABELS[descriptor.action] ?? descriptor.action;
  const reasonLabel = descriptor.disabledReasonCode
    ? (DISABLED_REASON_LABELS[descriptor.disabledReasonCode] ??
      descriptor.disabledReasonCode)
    : null;
  const title = !descriptor.enabled
    ? `${label} 已停用${reasonLabel ? `（${reasonLabel}）` : ""}`
    : descriptor.requiresReason
      ? `${label} · 需填寫原因 (Q-TEN06)`
      : label;
  const danger = descriptor.riskLevel === "high" && descriptor.enabled;
  return (
    <span
      key={descriptor.action}
      title={title}
      data-action={descriptor.action}
      data-risk={descriptor.riskLevel}
      style={inlineActionWrapperStyle}
    >
      <CanvasBtn
        theme={th}
        size="xs"
        variant="ghost"
        danger={danger}
        disabled={!descriptor.enabled}
      >
        {label}
      </CanvasBtn>
    </span>
  );
}

function buildTabNodes(selectedTab: AddressTabKey, baseHref: string) {
  const tabs = ADDRESS_TABS.map((tab) => (
    <Link
      key={tab.key}
      href={tab.key === "all" ? baseHref : `${baseHref}?tab=${tab.key}`}
      style={tabLinkStyle}
      prefetch={false}
    >
      {tab.label}
    </Link>
  ));
  const activeIndex = ADDRESS_TABS.findIndex((tab) => tab.key === selectedTab);
  return {
    tabs,
    activeTab: tabs[activeIndex] ?? tabs[0],
  };
}

type AddressRow = TenantAddressRecord &
  Record<string, unknown> & {
    rowActions: ResourceActionDescriptor[];
    ownerDisplay: ReactNode;
    deepLink: string;
  };

function describeOwner(
  address: TenantAddressRecord,
  passengersById: Map<string, TenantPassengerRecord>,
): ReactNode {
  if (!address.ownerPassengerId) {
    return <span style={ownerNeutralStyle}>—</span>;
  }
  const passenger = passengersById.get(address.ownerPassengerId);
  const label = passenger?.fullName ?? address.ownerPassengerId;
  return (
    <Link
      href={`/passengers?focus=${encodeURIComponent(address.ownerPassengerId)}`}
      style={ownerLinkStyle}
      prefetch={false}
    >
      {label}
    </Link>
  );
}

function toAddressRow(
  address: TenantAddressRecord,
  passengersById: Map<string, TenantPassengerRecord>,
): AddressRow {
  return {
    ...address,
    rowActions: buildRowAvailableActions(address),
    ownerDisplay: describeOwner(address, passengersById),
    deepLink: `/bookings/new?addressId=${encodeURIComponent(address.addressId)}`,
  };
}

function buildColumns(): CanvasTableColumn<AddressRow>[] {
  return [
    {
      h: "NAME",
      k: "addressName",
      w: 180,
      r: (row) => (
        <div>
          <div style={row.activeFlag ? primaryCellStyle : inactiveCellStyle}>
            {row.addressName}
          </div>
          {row.sensitiveFlag ? (
            <CanvasPill theme={th} tone="warn">
              敏感
            </CanvasPill>
          ) : null}
        </div>
      ),
    },
    {
      h: "ADDRESS",
      r: (row) => {
        const display = row.maskedAddressText ?? row.addressText;
        return <div style={addressTextStyle}>{display}</div>;
      },
    },
    {
      h: "TAGS",
      w: 220,
      r: (row) =>
        row.tags.length > 0 ? (
          <div style={tagListStyle}>
            {row.tags.map((tag) => (
              <CanvasPill key={tag} theme={th} tone="info">
                {tag}
              </CanvasPill>
            ))}
          </div>
        ) : (
          <span style={ownerNeutralStyle}>—</span>
        ),
    },
    {
      h: "OWNER",
      w: 140,
      r: (row) => row.ownerDisplay,
    },
    {
      h: "STATE",
      w: 120,
      r: (row) => (
        <CanvasPill
          theme={th}
          tone={row.activeFlag ? "success" : "neutral"}
          dot
        >
          {row.activeFlag ? "active" : "deactivated"}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 260,
      r: (row) => (
        <div style={rowActionsStyle}>
          {row.rowActions.map((descriptor) => renderRowAction(descriptor))}
          <Link
            href={row.deepLink}
            style={ownerLinkStyle}
            prefetch={false}
            title="以此地址開新叫車"
          >
            建立叫車 ↗
          </Link>
        </div>
      ),
    },
  ];
}

function buildEmptyStateEnvelope(
  reason: TenantEmptyReason,
  pageActions: ResourceActionDescriptor[],
): EmptyStateEnvelope {
  const copy = EMPTY_STATE_COPY[reason];
  const fallbackAction =
    reason === "no_data" ? findAction(pageActions, "create") : undefined;
  const nextAction = copy.nextAction ?? fallbackAction;
  const envelope: EmptyStateEnvelope = {
    reason,
    messageCode: `tenant.addresses.${reason}`,
  };
  if (nextAction) {
    envelope.nextAction = nextAction;
  }
  return envelope;
}

function renderEmptyState(envelope: EmptyStateEnvelope) {
  const copy =
    EMPTY_STATE_COPY[envelope.reason as keyof typeof EMPTY_STATE_COPY];
  const tone = copy?.tone ?? "neutral";
  return (
    <div style={emptyStateCardStyle} data-empty-reason={envelope.reason}>
      <CanvasPill theme={th} tone={tone} dot>
        {envelope.reason}
      </CanvasPill>
      <div style={emptyTitleStyle}>{copy?.title ?? "目前沒有資料"}</div>
      <div style={emptyBodyStyle}>{copy?.body ?? envelope.messageCode}</div>
      {envelope.nextAction ? (
        <CanvasBtn
          theme={th}
          variant="primary"
          icon={envelope.nextAction.action === "create" ? "plus" : undefined}
          disabled={!envelope.nextAction.enabled}
          size="sm"
        >
          {ACTION_LABELS[envelope.nextAction.action] ??
            envelope.nextAction.action}
        </CanvasBtn>
      ) : null}
    </div>
  );
}

function deriveEmptyReason(
  override: TenantEmptyReason | undefined,
  fetchFailed: boolean,
  totalCount: number,
  filteredCount: number,
  hasFilter: boolean,
): TenantEmptyReason | null {
  if (override) return override;
  if (fetchFailed) return "fetch_failed";
  if (filteredCount > 0) return null;
  if (totalCount === 0) return "no_data";
  if (hasFilter) return "filtered_empty";
  return "no_data";
}

export default async function AddressesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    tab?: string;
    tag?: string;
    q?: string;
    state?: string;
  }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedTab = getSelectedTab(resolvedSearchParams.tab);
  const tagFilter = resolvedSearchParams.tag;
  const searchTerm = resolvedSearchParams.q;
  const stateOverride = isEmptyReasonOverride(resolvedSearchParams.state)
    ? resolvedSearchParams.state
    : undefined;

  const { addresses, passengersById, errors, fetchFailed } =
    await loadAddressesData();

  const filteredAddresses = addresses.filter(
    (address) =>
      matchesTab(address, selectedTab) &&
      matchesTag(address, tagFilter) &&
      matchesSearch(address, searchTerm),
  );

  const hasFilter = Boolean(
    tagFilter ||
    searchTerm ||
    selectedTab !== "all" ||
    stateOverride === "filtered_empty",
  );

  const emptyReason = deriveEmptyReason(
    stateOverride,
    fetchFailed,
    addresses.length,
    filteredAddresses.length,
    hasFilter,
  );

  const pageActions = buildPageAvailableActions();
  const exportAction = findAction(pageActions, "export_view");
  const createAction = findAction(pageActions, "create");

  const rows = filteredAddresses.map((address) =>
    toAddressRow(address, passengersById),
  );

  const allTags = Array.from(
    new Set(addresses.flatMap((address) => address.tags)),
  ).sort((left, right) => left.localeCompare(right, "zh-Hant"));

  const { tabs, activeTab } = buildTabNodes(selectedTab, "/addresses");
  const columns = buildColumns();
  const emptyEnvelope = emptyReason
    ? buildEmptyStateEnvelope(emptyReason, pageActions)
    : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="地址簿"
        subtitle="常用地點 · tag · 啟用狀態 · 軟停用 only (Q-TEN06)"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          <>
            {exportAction ? (
              <CanvasBtn
                theme={th}
                icon="ext"
                size="sm"
                disabled={!exportAction.enabled}
              >
                {ACTION_LABELS[exportAction.action]}
              </CanvasBtn>
            ) : null}
            {createAction ? (
              <CanvasBtn
                theme={th}
                variant="primary"
                icon="plus"
                size="sm"
                disabled={!createAction.enabled}
              >
                {ACTION_LABELS[createAction.action]}
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={metaRowStyle}>
          <span style={metaPillRowStyle}>
            <CanvasPill theme={th} tone="info" dot>
              refresh tier
            </CanvasPill>
            {REFRESH_TIER_LABEL[PAGE_REFRESH_TIER]}
          </span>
          <span>
            共 {addresses.length} 筆 · 顯示 {rows.length} 筆
          </span>
          {allTags.length > 0 ? (
            <span style={metaPillRowStyle}>
              標籤：
              <Link
                href="/addresses"
                style={
                  tagFilter
                    ? ownerLinkStyle
                    : { ...ownerLinkStyle, opacity: 0.7 }
                }
                prefetch={false}
              >
                全部
              </Link>
              {allTags.map((tag) => (
                <Link
                  key={tag}
                  href={`/addresses?tag=${encodeURIComponent(tag)}`}
                  style={tagFilter === tag ? ownerLinkStyle : ownerNeutralStyle}
                  prefetch={false}
                >
                  <CanvasPill
                    theme={th}
                    tone={tagFilter === tag ? "accent" : "neutral"}
                  >
                    {tag}
                  </CanvasPill>
                </Link>
              ))}
            </span>
          ) : null}
        </div>

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分地址相關資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {emptyEnvelope ? (
            renderEmptyState(emptyEnvelope)
          ) : (
            <CanvasTable<AddressRow> theme={th} columns={columns} rows={rows} />
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
