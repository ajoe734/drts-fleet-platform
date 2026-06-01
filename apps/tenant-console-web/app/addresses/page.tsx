import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  EmptyReason,
  ResourceActionDescriptor,
  TenantAddressExportViewRecord,
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
import { formatDateTime } from "@/lib/formatters";
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

const secondaryTextStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: th.textMuted,
  fontSize: 11,
};

const cardStyle: CSSProperties = {
  overflow: "hidden",
};

const tabLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

// Navigating CTAs render as anchors (a <button> nested in next/link's <a> is
// invalid HTML), styled to match the canvas secondary button.
const navBtnStyle: CSSProperties = {
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
  textDecoration: "none",
  lineHeight: 1,
  boxSizing: "border-box",
};

const navBtnXsStyle: CSSProperties = {
  ...navBtnStyle,
  padding: "4px 8px",
  fontSize: 11.5,
  height: 24,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const filterLabelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const filterChipLinkStyle: CSSProperties = {
  textDecoration: "none",
};

const tagWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
};

const emptyStateStyle: CSSProperties = {
  padding: 32,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontSize: 13.5,
};

const emptyBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  maxWidth: 440,
  lineHeight: 1.5,
};

// §3.6 / Q-X15 — the six tenant-relevant empty reasons (driver_not_eligible is
// a driver-app-only reason and is intentionally excluded here).
const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

// Q-X13 — CTAs are descriptor-driven, never hard-coded by role. Risk levels
// follow the §3.4 confirmation table for the address book.
const ADDRESS_ROUTE_ACTIONS: readonly ResourceActionDescriptor[] = [
  { action: "create_address", enabled: true, riskLevel: "medium" },
  { action: "update_address", enabled: true, riskLevel: "medium" },
  {
    action: "deactivate_address",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  },
  { action: "reactivate_address", enabled: true, riskLevel: "medium" },
  { action: "export_view", enabled: true, riskLevel: "low" },
] as const;

type StatusTabKey = "all" | "active" | "inactive";
type AddressView = "list" | "export";

type StatusTabDefinition = {
  key: StatusTabKey;
  label: string;
};

const STATUS_TABS: StatusTabDefinition[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "啟用" },
  { key: "inactive", label: "停用" },
];

type AddressRow = Record<string, unknown> & {
  addressId: string;
  addressName: string;
  addressText: string;
  coordsLabel: string | null;
  tags: string[];
  ownerLabel: string;
  ownerPassengerId: string | null;
  qualityLabels: string[];
  sensitiveFlag: boolean;
  activeFlag: boolean;
  stateLabel: string;
  stateTone: CanvasTone;
};

type AddressesPageData = {
  view: AddressView;
  rows: AddressRow[];
  tags: string[];
  errors: string[];
  emptyReason: EmptyReason | null;
  generatedAt: string;
  refreshTier: "slow";
  availableActions: ResourceActionDescriptor[];
};

type AddressesPageProps = {
  searchParams?: Promise<{
    status?: string;
    tag?: string;
    q?: string;
    view?: string;
    emptyReason?: string;
  }>;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function parseStatusTab(value: string | undefined): StatusTabKey {
  return STATUS_TABS.find((tab) => tab.key === value)?.key ?? "all";
}

function parseView(value: string | undefined): AddressView {
  return value === "export" ? "export" : "list";
}

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) return null;
  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

function findAction(
  availableActions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return availableActions.find((item) => item.action === action) ?? null;
}

function getStateTone(activeFlag: boolean): CanvasTone {
  return activeFlag ? "success" : "neutral";
}

function getCellStyle(activeFlag: boolean) {
  return activeFlag ? primaryCellStyle : inactiveCellStyle;
}

function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function qualityIssueLabel(issue: string) {
  switch (issue) {
    case "missing_geocode":
      return "缺座標";
    case "duplicate_normalized_address":
      return "疑似重複";
    default:
      return issue;
  }
}

function buildOwnerLookup(passengers: TenantPassengerRecord[]) {
  const lookup = new Map<string, string>();
  for (const passenger of passengers) {
    lookup.set(passenger.passengerId, passenger.fullName);
  }
  return lookup;
}

function resolveOwnerLabel(
  ownerPassengerId: string | null,
  ownerLookup: Map<string, string>,
) {
  if (!ownerPassengerId) return "—";
  return ownerLookup.get(ownerPassengerId) ?? ownerPassengerId;
}

function compareAddressName(left: string, right: string) {
  return left.localeCompare(right, "zh-Hant");
}

function buildHref(
  base: { status: StatusTabKey; tag: string | null; q: string | null },
  overrides: Partial<{
    status: StatusTabKey;
    tag: string | null;
    q: string | null;
    view: AddressView;
  }>,
) {
  const params = new URLSearchParams();
  const status = overrides.status ?? base.status;
  if (status !== "all") {
    params.set("status", status);
  }
  const tag = overrides.tag === undefined ? base.tag : overrides.tag;
  if (tag) {
    params.set("tag", tag);
  }
  const q = overrides.q === undefined ? base.q : overrides.q;
  if (q) {
    params.set("q", q);
  }
  if (overrides.view === "export") {
    params.set("view", "export");
  }
  const query = params.toString();
  return query ? `/addresses?${query}` : "/addresses";
}

function getEmptyStateContent(reason: EmptyReason): {
  title: string;
  body: string;
  tone: CanvasTone;
} {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "地址簿尚未開通",
        body: "此租戶的常用地址維護模組尚未佈建，請先完成租戶設定後再維護地址。",
        tone: "info",
      };
    case "fetch_failed":
      return {
        title: "地址資料載入失敗",
        body: "路由仍可使用，但地址清單讀取失敗。後端依賴恢復後請重新整理。",
        tone: "warn",
      };
    case "permission_denied":
      return {
        title: "沒有檢視地址簿的權限",
        body: "此路由可見，但目前帳號沒有讀取或維護租戶地址的權限。",
        tone: "danger",
      };
    case "external_unavailable":
      return {
        title: "地理編碼服務暫時無法使用",
        body: "地址清單仍可顯示，但地理編碼 / 驗證服務暫時中斷，座標等欄位可能不完整。",
        tone: "warn",
      };
    case "filtered_empty":
      return {
        title: "沒有符合篩選條件的地址",
        body: "目前的標籤 / 狀態 / 搜尋條件沒有任何地址，請調整或清除篩選條件。",
        tone: "neutral",
      };
    case "no_data":
    default:
      return {
        title: "尚無常用地址",
        body: "新增第一筆常用地址，之後建立訂單時即可快速帶入上下車地點。",
        tone: "accent",
      };
  }
}

// Empty-reason taxonomy (§3.6 / Q-X15). `hasFilter` below counts the status
// tab (active/inactive) as a filter, so an active- or inactive-tab selection
// that matches no rows resolves to `filtered_empty`, not `no_data` — distinct
// from the brand-new-tenant `no_data` (totalCount === 0) case.
function inferEmptyReason(args: {
  totalCount: number;
  visibleCount: number;
  hasFilter: boolean;
  loadFailed: boolean;
}): EmptyReason | null {
  if (args.visibleCount > 0) {
    return null;
  }
  if (args.loadFailed) {
    return "fetch_failed";
  }
  if (args.totalCount === 0) {
    return "no_data";
  }
  if (args.hasFilter) {
    return "filtered_empty";
  }
  return "no_data";
}

function matchesStatus(activeFlag: boolean, status: StatusTabKey) {
  if (status === "active") return activeFlag;
  if (status === "inactive") return !activeFlag;
  return true;
}

function matchesQuery(haystack: string[], q: string | null) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return haystack.some((value) => value.toLowerCase().includes(needle));
}

function toListRow(
  address: TenantAddressRecord,
  ownerLookup: Map<string, string>,
): AddressRow {
  return {
    addressId: address.addressId,
    addressName: address.addressName,
    addressText: address.addressText,
    coordsLabel: formatCoords(address.lat, address.lng),
    tags: address.tags,
    ownerLabel: resolveOwnerLabel(address.ownerPassengerId, ownerLookup),
    ownerPassengerId: address.ownerPassengerId,
    qualityLabels: (address.qualityIssues ?? []).map(qualityIssueLabel),
    sensitiveFlag: Boolean(address.sensitiveFlag),
    activeFlag: address.activeFlag,
    stateLabel: address.activeFlag ? "active" : "disabled",
    stateTone: getStateTone(address.activeFlag),
  };
}

function toExportRow(
  record: TenantAddressExportViewRecord,
  ownerLookup: Map<string, string>,
): AddressRow {
  return {
    addressId: record.addressId,
    addressName: record.addressName,
    addressText: record.maskedAddressText ?? "—",
    coordsLabel: null,
    tags: record.tags,
    ownerLabel: resolveOwnerLabel(record.ownerPassengerId, ownerLookup),
    ownerPassengerId: record.ownerPassengerId,
    qualityLabels: record.qualityIssues.map(qualityIssueLabel),
    sensitiveFlag: record.sensitiveFlag,
    activeFlag: record.activeFlag,
    stateLabel: record.activeFlag ? "active" : "disabled",
    stateTone: getStateTone(record.activeFlag),
  };
}

async function loadAddressesData(args: {
  status: StatusTabKey;
  tag: string | null;
  q: string | null;
  view: AddressView;
  emptyReasonOverride: EmptyReason | null;
}): Promise<AddressesPageData> {
  const client = getTenantClient();
  const errors: string[] = [];

  // Contract note (review UI-FE-TEN-ADR): GET /api/tenant/addresses returns
  // the canonical paginated list envelope ({ items, pageInfo }); ApiClient
  // .getList unwraps it to TenantAddressRecord[]. There is no separate
  // "directory response" contract — both this page and /bookings/new consume
  // the bare TenantAddressRecord[] directly.
  const [recordsResult, passengersResult] = await Promise.allSettled([
    args.view === "export"
      ? (client.listAddressExportView() as Promise<
          TenantAddressExportViewRecord[]
        >)
      : (client.listAddresses() as Promise<TenantAddressRecord[]>),
    client.listPassengers() as Promise<TenantPassengerRecord[]>,
  ]);

  const passengers =
    passengersResult.status === "fulfilled" ? passengersResult.value : [];
  if (passengersResult.status === "rejected") {
    errors.push(`地址擁有者: ${toErrorMessage(passengersResult.reason)}`);
  }
  const ownerLookup = buildOwnerLookup(passengers);

  const loadFailed = recordsResult.status === "rejected";
  if (recordsResult.status === "rejected") {
    errors.push(`地址簿: ${toErrorMessage(recordsResult.reason)}`);
  }

  const allRows =
    recordsResult.status === "fulfilled"
      ? args.view === "export"
        ? (recordsResult.value as TenantAddressExportViewRecord[]).map(
            (record) => toExportRow(record, ownerLookup),
          )
        : (recordsResult.value as TenantAddressRecord[]).map((address) =>
            toListRow(address, ownerLookup),
          )
      : [];

  const tags = Array.from(new Set(allRows.flatMap((row) => row.tags))).sort(
    (left, right) => compareAddressName(left, right),
  );

  const hasFilter =
    args.status !== "all" || Boolean(args.tag) || Boolean(args.q);

  const visibleRows = allRows
    .filter((row) => matchesStatus(row.activeFlag, args.status))
    .filter((row) => (args.tag ? row.tags.includes(args.tag) : true))
    .filter((row) =>
      matchesQuery([row.addressName, row.addressText, row.ownerLabel], args.q),
    )
    .sort((left, right) => {
      if (left.activeFlag !== right.activeFlag) {
        return left.activeFlag ? -1 : 1;
      }
      return compareAddressName(left.addressName, right.addressName);
    });

  // listAddresses/export-view return bare lists (no UiRefreshMetadata envelope),
  // so the snapshot timestamp is stamped at fetch time for the T5 freshness hint.
  const generatedAt = new Date().toISOString();

  const inferredEmptyReason = inferEmptyReason({
    totalCount: allRows.length,
    visibleCount: visibleRows.length,
    hasFilter,
    loadFailed,
  });

  return {
    view: args.view,
    rows: visibleRows,
    tags,
    errors,
    emptyReason: args.emptyReasonOverride ?? inferredEmptyReason,
    generatedAt,
    refreshTier: "slow",
    availableActions: [...ADDRESS_ROUTE_ACTIONS],
  };
}

function renderTags(tags: string[]) {
  if (tags.length === 0) {
    return <span style={{ color: th.textMuted }}>—</span>;
  }
  return (
    <div style={tagWrapStyle}>
      {tags.map((tag) => (
        <CanvasPill key={tag} theme={th} tone="info">
          {tag}
        </CanvasPill>
      ))}
    </div>
  );
}

function buildColumns(view: AddressView): CanvasTableColumn<AddressRow>[] {
  const nameColumn: CanvasTableColumn<AddressRow> = {
    h: "NAME",
    k: "addressName",
    w: 160,
    r: (row) => (
      <span style={getCellStyle(row.activeFlag)}>{row.addressName}</span>
    ),
  };

  const tagsColumn: CanvasTableColumn<AddressRow> = {
    h: "TAGS",
    w: 200,
    r: (row) => renderTags(row.tags),
  };

  const ownerColumn: CanvasTableColumn<AddressRow> = {
    h: "OWNER",
    w: 120,
    mono: true,
    r: (row) =>
      row.ownerPassengerId ? (
        <Link
          href={`/passengers?q=${encodeURIComponent(row.ownerLabel)}`}
          style={tabLinkStyle}
        >
          {row.ownerLabel}
        </Link>
      ) : (
        "—"
      ),
  };

  const stateColumn: CanvasTableColumn<AddressRow> = {
    h: "STATE",
    w: 100,
    r: (row) => (
      <CanvasPill theme={th} tone={row.stateTone} dot>
        {row.stateLabel}
      </CanvasPill>
    ),
  };

  if (view === "export") {
    return [
      nameColumn,
      {
        h: "ADDRESS (MASKED)",
        r: (row) => (
          <span>
            {row.addressText}
            {row.sensitiveFlag ? (
              <span style={{ marginLeft: 8 }}>
                <CanvasPill theme={th} tone="warn">
                  敏感
                </CanvasPill>
              </span>
            ) : null}
          </span>
        ),
      },
      tagsColumn,
      {
        h: "QUALITY",
        w: 150,
        r: (row) =>
          row.qualityLabels.length > 0 ? (
            <div style={tagWrapStyle}>
              {row.qualityLabels.map((label) => (
                <CanvasPill key={label} theme={th} tone="warn">
                  {label}
                </CanvasPill>
              ))}
            </div>
          ) : (
            <CanvasPill theme={th} tone="success">
              ok
            </CanvasPill>
          ),
      },
      ownerColumn,
      stateColumn,
    ];
  }

  return [
    nameColumn,
    {
      h: "ADDRESS",
      r: (row) => (
        <span>
          {row.addressText}
          {row.coordsLabel ? (
            <span style={secondaryTextStyle}>{row.coordsLabel}</span>
          ) : null}
        </span>
      ),
    },
    tagsColumn,
    ownerColumn,
    stateColumn,
  ];
}

export default async function AddressesPage({
  searchParams,
}: AddressesPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const status = parseStatusTab(resolvedSearchParams.status);
  const tag = resolvedSearchParams.tag?.trim() || null;
  const q = resolvedSearchParams.q?.trim() || null;
  const view = parseView(resolvedSearchParams.view);
  const emptyReasonOverride = parseEmptyReason(
    resolvedSearchParams.emptyReason,
  );

  const data = await loadAddressesData({
    status,
    tag,
    q,
    view,
    emptyReasonOverride,
  });

  const hrefBase = { status, tag, q };

  const tabs = STATUS_TABS.map((tab) => (
    <Link
      key={tab.key}
      href={buildHref(hrefBase, {
        status: tab.key,
        view: view === "export" ? "export" : "list",
      })}
      style={tabLinkStyle}
    >
      {tab.label}
    </Link>
  ));
  const activeTabIndex = STATUS_TABS.findIndex((tab) => tab.key === status);
  const activeTab = tabs[activeTabIndex] ?? tabs[0];

  const createAction = findAction(data.availableActions, "create_address");
  const exportAction = findAction(data.availableActions, "export_view");

  const emptyContent = data.emptyReason
    ? getEmptyStateContent(data.emptyReason)
    : null;

  const refreshBody = `T5 租戶慢速節奏（30 秒）。快照載入於 ${formatDateTime(
    data.generatedAt,
  )}。`;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="地址簿"
        subtitle="常用地點 · tag · 啟用"
        tabs={tabs as ReactNode[]}
        activeTab={activeTab}
        actions={
          <>
            {exportAction ? (
              view === "export" ? (
                <Link
                  href={buildHref(hrefBase, { view: "list" })}
                  style={navBtnStyle}
                >
                  返回列表
                </Link>
              ) : exportAction.enabled ? (
                <Link
                  href={buildHref(hrefBase, { view: "export" })}
                  style={navBtnStyle}
                >
                  匯出檢視
                </Link>
              ) : (
                <CanvasBtn theme={th} icon="ext" size="sm" disabled>
                  匯出檢視
                </CanvasBtn>
              )
            ) : null}
            {createAction ? (
              <CanvasBtn
                theme={th}
                variant="primary"
                icon="plus"
                size="sm"
                disabled={!createAction.enabled}
              >
                新增地址
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分地址資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone="info"
          icon="clock"
          title="重新整理層級 T5：租戶慢速"
          body={refreshBody}
        />

        {view === "export" ? (
          <CanvasBanner
            theme={th}
            tone="accent"
            icon="ext"
            title="匯出檢視"
            body="地址文字依政策遮罩，並附上資料品質標記，供匯出 / 稽核用途（spec §9.6.4）。"
          />
        ) : null}

        {data.tags.length > 0 ? (
          <div style={filterRowStyle}>
            <span style={filterLabelStyle}>標籤</span>
            <Link
              href={buildHref(hrefBase, {
                tag: null,
                view: view === "export" ? "export" : "list",
              })}
              style={filterChipLinkStyle}
            >
              <CanvasPill theme={th} tone={tag ? "neutral" : "accent"} dot>
                全部
              </CanvasPill>
            </Link>
            {data.tags.map((tagOption) => (
              <Link
                key={tagOption}
                href={buildHref(hrefBase, {
                  tag: tag === tagOption ? null : tagOption,
                  view: view === "export" ? "export" : "list",
                })}
                style={filterChipLinkStyle}
              >
                <CanvasPill
                  theme={th}
                  tone={tag === tagOption ? "accent" : "info"}
                >
                  {tagOption}
                </CanvasPill>
              </Link>
            ))}
          </div>
        ) : null}

        {q ? (
          <div style={filterRowStyle}>
            <span style={filterLabelStyle}>搜尋</span>
            <CanvasPill theme={th} tone="info">
              {q}
            </CanvasPill>
            <Link
              href={buildHref(hrefBase, {
                q: null,
                view: view === "export" ? "export" : "list",
              })}
              style={navBtnXsStyle}
            >
              清除
            </Link>
          </div>
        ) : null}

        <CanvasCard theme={th} padding={0} style={cardStyle}>
          {data.rows.length > 0 ? (
            <CanvasTable<AddressRow>
              theme={th}
              columns={buildColumns(view)}
              rows={data.rows}
            />
          ) : emptyContent ? (
            <div style={emptyStateStyle}>
              <CanvasPill theme={th} tone={emptyContent.tone} dot>
                {data.emptyReason}
              </CanvasPill>
              <span style={emptyTitleStyle}>{emptyContent.title}</span>
              <span style={emptyBodyStyle}>{emptyContent.body}</span>
            </div>
          ) : null}
        </CanvasCard>
      </div>
    </div>
  );
}
