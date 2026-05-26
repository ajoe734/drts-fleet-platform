import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  EmptyReason,
  ResourceActionDescriptor,
  TenantAddressExportViewRecord,
  TenantAddressQualityIssue,
  TenantAddressRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "https://ops-console.local";
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "https://platform-admin.local";
const REFRESH_CADENCE_SECONDS = 30;

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.8fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const lowerGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const pillWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  whiteSpace: "normal",
};

const emptyBodyStyle: CSSProperties = {
  padding: "28px 24px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 10,
};

const emptyTitleStyle: CSSProperties = {
  margin: 0,
  color: th.text,
  fontSize: 17,
  fontWeight: 700,
};

const emptyCopyStyle: CSSProperties = {
  margin: 0,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
  maxWidth: 460,
};

const cardStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const primaryTextStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const secondaryTextStyle: CSSProperties = {
  display: "block",
  color: th.textMuted,
  fontSize: 11.5,
  marginTop: 2,
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(0, 1.4fr) repeat(3, minmax(120px, 0.58fr)) minmax(120px, 0.58fr) auto",
  gap: 12,
};

const fieldStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 11,
  color: th.textMuted,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const fieldInputStyle: CSSProperties = {
  height: 34,
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  padding: "0 11px",
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const filterActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "end",
  gap: 8,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const actionLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  fontSize: 12,
  height: 28,
  fontWeight: 500,
  background: th.surface,
  color: th.text,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  lineHeight: 1,
  textDecoration: "none",
  fontFamily: th.fontFamily,
};

const primaryActionLinkStyle: CSSProperties = {
  ...actionLinkStyle,
  background: th.accent,
  borderColor: th.accent,
  color: "#fff",
};

const ghostActionLinkStyle: CSSProperties = {
  ...actionLinkStyle,
  background: "transparent",
  color: th.textMuted,
};

const disabledActionStyle: CSSProperties = {
  ...actionLinkStyle,
  opacity: 0.55,
  cursor: "not-allowed",
};

const actionMetaStyle: CSSProperties = {
  fontSize: 10.5,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const externalLinkStyle: CSSProperties = {
  color: th.text,
  textDecoration: "none",
  borderBottom: `1px solid ${th.border}`,
  paddingBottom: 10,
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

type AddressTabKey = "active" | "inactive" | "quality" | "export";
type AddressEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type SearchParams = {
  q?: string;
  tab?: string;
  owner?: string;
  tag?: string;
  emptyReason?: string;
};

type AddressRow = TenantAddressRecord &
  Record<string, unknown> & {
    ownerName: string;
    stateLabel: string;
    stateTone: CanvasTone;
    geocodeLabel: string;
    qualitySummary: string[];
    exportMaskedAddress: string;
    availableActions: ResourceActionDescriptor[];
  };

type AddressPageData = {
  addresses: TenantAddressRecord[];
  exportRows: TenantAddressExportViewRecord[];
  passengers: TenantPassengerRecord[];
  errors: string[];
};

type EmptyStateConfig = {
  title: string;
  body: string;
  tone: Exclude<CanvasTone, "neutral">;
  icon: "warn" | "clock" | "ext" | "search" | "plus";
  ctaLabel: string;
  href: string;
};

const TAB_LABELS: Record<AddressTabKey, string> = {
  active: "已啟用",
  inactive: "停用中",
  quality: "待校正",
  export: "匯出遮罩檢視",
};

const EMPTY_STATE_CONFIG: Record<AddressEmptyReason, EmptyStateConfig> = {
  no_data: {
    title: "此租戶尚未建立地址簿",
    body: "建立第一筆上車或下車地址後，叫車表單與匯出檢視才會開始復用地址資料。",
    tone: "info",
    icon: "plus",
    ctaLabel: "建立地址",
    href: "/addresses",
  },
  not_provisioned: {
    title: "地址簿尚未完成租戶啟用",
    body: "目前 tenant 基礎設定尚未 provision 完成，地址資料與匯出遮罩檢視都不會對外開放。",
    tone: "warn",
    icon: "clock",
    ctaLabel: "查看租戶設定",
    href: "/settings",
  },
  fetch_failed: {
    title: "地址資料讀取失敗",
    body: "上一次從 `/api/tenant/addresses` 取數失敗，請重新整理；若持續失敗，請轉往稽核與 API health。",
    tone: "danger",
    icon: "warn",
    ctaLabel: "重新整理",
    href: "/addresses",
  },
  permission_denied: {
    title: "目前角色不可查看地址簿",
    body: "後端未回傳可讀取本頁的 authority。CTA 應保留為 disabled，而不是直接消失。",
    tone: "warn",
    icon: "warn",
    ctaLabel: "查看角色設定",
    href: "/users",
  },
  external_unavailable: {
    title: "外部地址校正依賴目前不可用",
    body: "地址簿仍保留最後快照，但 geocode 與品質校正暫時無法更新，請改走人工確認流程。",
    tone: "warn",
    icon: "ext",
    ctaLabel: "查看整合就緒度",
    href: "/settings",
  },
  filtered_empty: {
    title: "目前篩選條件沒有任何結果",
    body: "清空搜尋、切回已啟用頁籤，或改看匯出遮罩檢視；這是 distinct state，不等於租戶沒有資料。",
    tone: "info",
    icon: "search",
    ctaLabel: "清空篩選",
    href: "/addresses",
  },
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat("zh-Hant", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function getTab(rawTab: string | undefined): AddressTabKey {
  if (rawTab === "inactive" || rawTab === "quality" || rawTab === "export") {
    return rawTab;
  }
  return "active";
}

function getEmptyReason(
  rawValue: string | undefined,
): AddressEmptyReason | null {
  switch (rawValue) {
    case "no_data":
    case "not_provisioned":
    case "fetch_failed":
    case "permission_denied":
    case "external_unavailable":
    case "filtered_empty":
      return rawValue;
    default:
      return null;
  }
}

function getQualityLabel(issue: TenantAddressQualityIssue) {
  if (issue === "duplicate_normalized_address") return "duplicate";
  return "missing_geocode";
}

function getGeocodeLabel(record: TenantAddressRecord) {
  if (record.geocodeSource === "provider") return "provider";
  if (record.geocodeSource === "manual") return "manual";
  return "none";
}

function getStateTone(activeFlag: boolean): CanvasTone {
  return activeFlag ? "success" : "warn";
}

function getStateLabel(activeFlag: boolean) {
  return activeFlag ? "active" : "inactive";
}

function buildPageActions(): ResourceActionDescriptor[] {
  return [
    {
      action: "create",
      enabled: true,
      riskLevel: "medium",
    },
    {
      action: "export",
      enabled: true,
      riskLevel: "low",
    },
  ];
}

function buildRowActions(
  record: TenantAddressRecord,
): ResourceActionDescriptor[] {
  const actions: ResourceActionDescriptor[] = [
    {
      action: "edit",
      enabled: true,
      riskLevel: "medium",
    },
  ];

  if (record.activeFlag) {
    actions.push({
      action: "deactivate",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    });
    actions.push({
      action: "reactivate",
      enabled: false,
      disabledReasonCode: "already_active",
      riskLevel: "medium",
    });
    return actions;
  }

  actions.push({
    action: "deactivate",
    enabled: false,
    disabledReasonCode: "already_inactive",
    requiresReason: true,
    riskLevel: "high",
  });
  actions.push({
    action: "reactivate",
    enabled: true,
    riskLevel: "medium",
  });

  return actions;
}

function compareAddresses(
  left: TenantAddressRecord,
  right: TenantAddressRecord,
) {
  if (left.activeFlag !== right.activeFlag) {
    return left.activeFlag ? -1 : 1;
  }
  const leftUpdated = parseDate(left.updatedAt)?.getTime() ?? 0;
  const rightUpdated = parseDate(right.updatedAt)?.getTime() ?? 0;
  if (leftUpdated !== rightUpdated) {
    return rightUpdated - leftUpdated;
  }
  return left.addressName.localeCompare(right.addressName, "zh-Hant");
}

async function loadAddressPageData(): Promise<AddressPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  const [addressesResult, exportResult, passengersResult] =
    await Promise.allSettled([
      client.listAddresses() as Promise<TenantAddressRecord[]>,
      client.listAddressExportView() as Promise<
        TenantAddressExportViewRecord[]
      >,
      client.listPassengers() as Promise<TenantPassengerRecord[]>,
    ]);

  const addresses =
    addressesResult.status === "fulfilled"
      ? [...addressesResult.value].sort(compareAddresses)
      : [];
  const exportRows =
    exportResult.status === "fulfilled" ? exportResult.value : [];
  const passengers =
    passengersResult.status === "fulfilled" ? passengersResult.value : [];

  if (addressesResult.status === "rejected") {
    errors.push(`地址簿: ${toErrorMessage(addressesResult.reason)}`);
  }
  if (exportResult.status === "rejected") {
    errors.push(`匯出遮罩檢視: ${toErrorMessage(exportResult.reason)}`);
  }
  if (passengersResult.status === "rejected") {
    errors.push(`乘客目錄: ${toErrorMessage(passengersResult.reason)}`);
  }

  return { addresses, exportRows, passengers, errors };
}

function matchesQuery(row: AddressRow, query: string) {
  if (!query) return true;
  const value = query.toLowerCase();
  return [
    row.addressName,
    row.addressText,
    row.ownerName,
    row.addressId,
    row.tags.join(" "),
  ].some((field) => field.toLowerCase().includes(value));
}

function matchesTab(row: AddressRow, tab: AddressTabKey) {
  if (tab === "inactive") return !row.activeFlag;
  if (tab === "quality") return row.qualitySummary.length > 0;
  if (tab === "export") return true;
  return row.activeFlag;
}

function matchesTag(row: AddressRow, tag: string) {
  if (!tag) return true;
  return row.tags.includes(tag);
}

function renderActionChip(action: ResourceActionDescriptor, href: string) {
  const label = `${action.action} · ${action.riskLevel}`;
  if (!action.enabled) {
    return (
      <span
        key={label}
        style={disabledActionStyle}
        title={action.disabledReasonCode}
      >
        {label}
      </span>
    );
  }
  return (
    <Link key={label} href={href} style={actionLinkStyle}>
      {label}
    </Link>
  );
}

function buildActionHref(action: ResourceActionDescriptor, row: AddressRow) {
  if (action.action === "edit") {
    return `/addresses?q=${encodeURIComponent(row.addressId)}`;
  }
  if (action.action === "deactivate") {
    return `/addresses?tab=inactive&q=${encodeURIComponent(row.addressId)}`;
  }
  if (action.action === "reactivate") {
    return `/addresses?tab=active&q=${encodeURIComponent(row.addressId)}`;
  }
  return "/addresses";
}

function toAddressRow(
  record: TenantAddressRecord,
  passengersById: Map<string, TenantPassengerRecord>,
  exportRowsById: Map<string, TenantAddressExportViewRecord>,
): AddressRow {
  const owner = record.ownerPassengerId
    ? passengersById.get(record.ownerPassengerId)
    : null;
  const exportRow = exportRowsById.get(record.addressId);
  return {
    ...record,
    ownerName: owner?.fullName ?? "共享地址",
    stateLabel: getStateLabel(record.activeFlag),
    stateTone: getStateTone(record.activeFlag),
    geocodeLabel: getGeocodeLabel(record),
    qualitySummary: (record.qualityIssues ?? []).map(getQualityLabel),
    exportMaskedAddress: exportRow?.maskedAddressText ?? "—",
    availableActions: buildRowActions(record),
  };
}

function buildTabs(
  selectedTab: AddressTabKey,
  query: string,
  owner: string,
  tag: string,
) {
  const tabKeys: AddressTabKey[] = ["active", "inactive", "quality", "export"];
  const tabs = tabKeys.map((tab) => {
    const params = new URLSearchParams();
    if (tab !== "active") params.set("tab", tab);
    if (query) params.set("q", query);
    if (owner) params.set("owner", owner);
    if (tag) params.set("tag", tag);
    const href =
      params.size > 0 ? `/addresses?${params.toString()}` : "/addresses";
    return (
      <Link
        key={tab}
        href={href}
        style={{ color: "inherit", textDecoration: "none" }}
      >
        {TAB_LABELS[tab]}
      </Link>
    );
  });

  return {
    tabs,
    activeTab: tabs[tabKeys.indexOf(selectedTab)] ?? tabs[0],
  };
}

function getLatestSnapshot(
  addresses: TenantAddressRecord[],
  exportRows: TenantAddressExportViewRecord[],
) {
  const timestamps = [
    ...addresses.map((row) => parseDate(row.updatedAt)?.getTime() ?? 0),
    ...exportRows.map(
      (row) => parseDate(row.exportGeneratedAt)?.getTime() ?? 0,
    ),
  ];
  const latest = Math.max(...timestamps, 0);
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function getEmptyReasonForRows(
  rows: AddressRow[],
  query: string,
  owner: string,
  tag: string,
  explicitReason: AddressEmptyReason | null,
  totalRows: number,
) {
  if (explicitReason) return explicitReason;
  if (rows.length > 0) return null;
  if (query || owner || tag) return "filtered_empty" as const;
  if (totalRows === 0) return "no_data" as const;
  return "filtered_empty" as const;
}

function getRefreshTone(
  errors: string[],
  snapshotAt: string | null,
): CanvasTone {
  if (errors.length > 0) return "warn";
  if (!snapshotAt) return "neutral";
  const snapshotMs = parseDate(snapshotAt)?.getTime() ?? 0;
  return Date.now() - snapshotMs > REFRESH_CADENCE_SECONDS * 1000
    ? "warn"
    : "success";
}

export default async function AddressesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const query = resolvedSearchParams.q?.trim() ?? "";
  const selectedOwner = resolvedSearchParams.owner?.trim() ?? "";
  const selectedTag = resolvedSearchParams.tag?.trim() ?? "";
  const selectedTab = getTab(resolvedSearchParams.tab);
  const explicitEmptyReason = getEmptyReason(resolvedSearchParams.emptyReason);
  const { addresses, exportRows, passengers, errors } =
    await loadAddressPageData();
  const passengersById = new Map(
    passengers.map((row) => [row.passengerId, row]),
  );
  const exportRowsById = new Map(exportRows.map((row) => [row.addressId, row]));
  const rows = addresses
    .map((record) => toAddressRow(record, passengersById, exportRowsById))
    .filter((row) => matchesTab(row, selectedTab))
    .filter((row) => matchesQuery(row, query))
    .filter((row) => !selectedOwner || row.ownerPassengerId === selectedOwner)
    .filter((row) => matchesTag(row, selectedTag));
  const activeCount = addresses.filter((row) => row.activeFlag).length;
  const inactiveCount = addresses.length - activeCount;
  const qualityCount = addresses.filter(
    (row) => (row.qualityIssues?.length ?? 0) > 0,
  ).length;
  const sensitiveCount = addresses.filter((row) => row.sensitiveFlag).length;
  const allTags = [...new Set(addresses.flatMap((row) => row.tags))].sort(
    (left, right) => left.localeCompare(right, "zh-Hant"),
  );
  const latestSnapshot = getLatestSnapshot(addresses, exportRows);
  const refreshTone = getRefreshTone(errors, latestSnapshot);
  const pageActions = buildPageActions();
  const emptyReason = getEmptyReasonForRows(
    rows,
    query,
    selectedOwner,
    selectedTag,
    explicitEmptyReason,
    addresses.length,
  );
  const { tabs, activeTab } = buildTabs(
    selectedTab,
    query,
    selectedOwner,
    selectedTag,
  );

  const listColumns: CanvasTableColumn<AddressRow>[] = [
    {
      h: "ADDRESS",
      w: 190,
      r: (row) => (
        <div>
          <span style={primaryTextStyle}>{row.addressName}</span>
          <span style={secondaryTextStyle}>{row.addressId}</span>
        </div>
      ),
    },
    {
      h: "OWNER",
      w: 130,
      r: (row) => (
        <div>
          <span style={primaryTextStyle}>{row.ownerName}</span>
          <span style={secondaryTextStyle}>
            {row.ownerPassengerId ? "passenger-linked" : "shared"}
          </span>
        </div>
      ),
    },
    {
      h: "ADDRESS TEXT",
      w: 240,
      r: (row) => (
        <div>
          <span style={primaryTextStyle}>{row.addressText}</span>
          <span style={secondaryTextStyle}>
            masked: {row.exportMaskedAddress}
          </span>
        </div>
      ),
    },
    {
      h: "LAT/LNG",
      w: 150,
      mono: true,
      r: (row) => (
        <div>
          <span style={primaryTextStyle}>
            {row.lat != null && row.lng != null
              ? `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}`
              : "—"}
          </span>
          <span style={secondaryTextStyle}>geocode: {row.geocodeLabel}</span>
        </div>
      ),
    },
    {
      h: "TAGS",
      w: 180,
      r: (row) => (
        <div style={pillWrapStyle}>
          {row.tags.length > 0 ? (
            row.tags.map((tag: string) => (
              <CanvasPill key={tag} theme={th} tone="info">
                {tag}
              </CanvasPill>
            ))
          ) : (
            <CanvasPill theme={th} tone="neutral">
              no-tag
            </CanvasPill>
          )}
        </div>
      ),
    },
    {
      h: "QUALITY",
      w: 180,
      r: (row) => (
        <div style={pillWrapStyle}>
          {row.qualitySummary.length > 0 ? (
            row.qualitySummary.map((item: string) => (
              <CanvasPill key={item} theme={th} tone="warn">
                {item}
              </CanvasPill>
            ))
          ) : (
            <CanvasPill theme={th} tone="success">
              clean
            </CanvasPill>
          )}
        </div>
      ),
    },
    {
      h: "STATE",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={row.stateTone} dot>
          {row.stateLabel}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 310,
      r: (row) => (
        <div style={actionRowStyle}>
          {row.availableActions.map((action: ResourceActionDescriptor) =>
            renderActionChip(action, buildActionHref(action, row)),
          )}
        </div>
      ),
    },
  ];
  const exportColumns: CanvasTableColumn<AddressRow>[] = [
    listColumns[0]!,
    listColumns[1]!,
    {
      h: "MASKED EXPORT VIEW",
      w: 250,
      r: (row) => (
        <div>
          <span style={primaryTextStyle}>{row.exportMaskedAddress}</span>
          <span style={secondaryTextStyle}>
            {row.sensitiveFlag ? "sensitive masked export" : "same as source"}
          </span>
        </div>
      ),
    },
    listColumns[3]!,
    listColumns[4]!,
    listColumns[5]!,
    listColumns[6]!,
    listColumns[7]!,
  ];
  const columns = selectedTab === "export" ? exportColumns : listColumns;
  const emptyStateConfig = emptyReason ? EMPTY_STATE_CONFIG[emptyReason] : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="地址簿"
        subtitle="Address book · T5 tenant slow · availableActions 驅動 create / export / edit / deactivate / reactivate"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          <>
            {pageActions.map((action) => (
              <Link
                key={action.action}
                href={
                  action.action === "create"
                    ? "/addresses"
                    : "/addresses?tab=export"
                }
                style={
                  action.action === "create"
                    ? primaryActionLinkStyle
                    : actionLinkStyle
                }
              >
                {action.action} · {action.riskLevel}
              </Link>
            ))}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone={refreshTone === "success" ? "info" : "warn"}
          icon="clock"
          title="Refresh tier wired"
          body={`T5 Tenant slow · 每 ${REFRESH_CADENCE_SECONDS}s 更新一次 · 最近快照 ${formatDateTime(latestSnapshot)} · tenant ${DEMO_TENANT_ID}`}
          actions={
            <Link href="/addresses" style={ghostActionLinkStyle}>
              refresh
            </Link>
          }
        />

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分地址資料無法載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <div style={topGridStyle}>
          <CanvasCard theme={th}>
            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={th}
                label="Addresses"
                value={formatCount(addresses.length)}
                sub={`${formatCount(activeCount)} active`}
              />
              <CanvasKPI
                theme={th}
                label="Inactive"
                value={formatCount(inactiveCount)}
                sub="soft deactivated"
              />
              <CanvasKPI
                theme={th}
                label="Quality"
                value={formatCount(qualityCount)}
                sub="needs correction"
              />
              <CanvasKPI
                theme={th}
                label="Sensitive"
                value={formatCount(sensitiveCount)}
                sub="masked on export"
              />
            </div>

            <form action="/addresses" style={filterFormStyle}>
              <label style={fieldStackStyle}>
                Search
                <input
                  defaultValue={query}
                  name="q"
                  placeholder="address id / owner / text / tag"
                  style={fieldInputStyle}
                />
              </label>
              <label style={fieldStackStyle}>
                Tab
                <select
                  defaultValue={selectedTab}
                  name="tab"
                  style={fieldInputStyle}
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                  <option value="quality">quality</option>
                  <option value="export">export</option>
                </select>
              </label>
              <label style={fieldStackStyle}>
                Owner
                <select
                  defaultValue={selectedOwner}
                  name="owner"
                  style={fieldInputStyle}
                >
                  <option value="">all owners</option>
                  {passengers
                    .filter((row) => row.activeFlag)
                    .map((row) => (
                      <option key={row.passengerId} value={row.passengerId}>
                        {row.fullName}
                      </option>
                    ))}
                </select>
              </label>
              <label style={fieldStackStyle}>
                Tag
                <select
                  defaultValue={selectedTag}
                  name="tag"
                  style={fieldInputStyle}
                >
                  <option value="">all tags</option>
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>
              <div style={filterActionsStyle}>
                <button style={primaryActionLinkStyle} type="submit">
                  apply
                </button>
                <Link href="/addresses" style={ghostActionLinkStyle}>
                  reset
                </Link>
              </div>
            </form>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Cross-app deep links"
            subtitle="Q-X03 / Q-TEN13"
          >
            <div style={cardStackStyle}>
              <a
                href={`${OPS_CONSOLE_URL}/complaints/CMP-2081?tenantId=${encodeURIComponent(DEMO_TENANT_ID)}`}
                rel="noreferrer"
                style={externalLinkStyle}
                target="_blank"
              >
                <span style={primaryTextStyle}>ops-console complaint</span>
                <span style={secondaryTextStyle}>
                  complaint reference opens in new tab
                </span>
              </a>
              <a
                href={`${PLATFORM_ADMIN_URL}/audit?tenantId=${encodeURIComponent(DEMO_TENANT_ID)}&auditId=audit-address-reactivation`}
                rel="noreferrer"
                style={externalLinkStyle}
                target="_blank"
              >
                <span style={primaryTextStyle}>platform-admin audit</span>
                <span style={secondaryTextStyle}>
                  tenant audit rows can deep-link across actor realms
                </span>
              </a>
              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: "booking prefill",
                    v: "/bookings/new?pickupAddressId=... or dropoffAddressId=...",
                    mono: true,
                  },
                  {
                    k: "soft deactivate",
                    v: "high risk · requires reason · historical bookings keep snapshot",
                  },
                ]}
              />
            </div>
          </CanvasCard>
        </div>

        <div style={lowerGridStyle}>
          <CanvasCard
            theme={th}
            title="Directory rows"
            subtitle={
              selectedTab === "export"
                ? "Masked export view · owner reference · active flag · availableActions"
                : "Owner link · tags · lat/lng · geocode quality · row-level availableActions"
            }
            padding={0}
          >
            {emptyReason && emptyStateConfig ? (
              <div style={emptyBodyStyle}>
                <CanvasPill theme={th} tone={emptyStateConfig.tone}>
                  {emptyReason}
                </CanvasPill>
                <h2 style={emptyTitleStyle}>{emptyStateConfig.title}</h2>
                <p style={emptyCopyStyle}>{emptyStateConfig.body}</p>
                <Link
                  href={emptyStateConfig.href}
                  style={primaryActionLinkStyle}
                >
                  {emptyStateConfig.ctaLabel}
                </Link>
              </div>
            ) : (
              <CanvasTable<AddressRow>
                theme={th}
                columns={columns}
                dense={false}
                rows={rows}
              />
            )}
          </CanvasCard>

          <div style={cardStackStyle}>
            <CanvasCard
              theme={th}
              title="EmptyReason preview"
              subtitle="6 states rendered distinctly"
            >
              <div style={pillWrapStyle}>
                {Object.keys(EMPTY_STATE_CONFIG).map((reason) => (
                  <Link
                    key={reason}
                    href={`/addresses?emptyReason=${reason}`}
                    style={
                      reason === emptyReason
                        ? primaryActionLinkStyle
                        : actionLinkStyle
                    }
                  >
                    {reason}
                  </Link>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Row exits"
              subtitle="Address book → bookings / passengers"
            >
              {rows.length > 0 ? (
                <div style={cardStackStyle}>
                  {rows.slice(0, 3).map((row) => (
                    <div
                      key={row.addressId}
                      style={{
                        paddingBottom: 12,
                        borderBottom: `1px solid ${th.border}`,
                      }}
                    >
                      <div style={primaryTextStyle}>{row.addressName}</div>
                      <div style={secondaryTextStyle}>{row.addressText}</div>
                      <div style={{ ...actionRowStyle, marginTop: 8 }}>
                        <Link
                          href={`/bookings/new?pickupAddressId=${encodeURIComponent(row.addressId)}`}
                          style={actionLinkStyle}
                        >
                          pickup prefill
                        </Link>
                        <Link
                          href={`/bookings/new?dropoffAddressId=${encodeURIComponent(row.addressId)}`}
                          style={actionLinkStyle}
                        >
                          dropoff prefill
                        </Link>
                        {row.ownerPassengerId ? (
                          <Link
                            href={`/passengers?q=${encodeURIComponent(row.ownerPassengerId)}`}
                            style={ghostActionLinkStyle}
                          >
                            owner passenger
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={emptyCopyStyle}>
                  empty state 時仍保留 distinct CTA，不假設 row actions 可用。
                </p>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Disabled reason codes"
              subtitle="enabled=false affordances remain visible"
            >
              <div style={cardStackStyle}>
                <div>
                  <div style={actionRowStyle}>
                    <span style={disabledActionStyle}>reactivate · medium</span>
                    <span style={disabledActionStyle}>deactivate · high</span>
                  </div>
                </div>
                <div style={actionMetaStyle}>already_active</div>
                <div style={actionMetaStyle}>already_inactive</div>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
