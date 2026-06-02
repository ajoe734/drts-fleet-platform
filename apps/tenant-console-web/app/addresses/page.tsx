import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  EmptyReason,
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

// Q-X02 / packet §3.2 + §5.6: /addresses is the T5 "Tenant slow" tier (30s).
// The tier is declared from the contract enum so the cadence is not a magic
// number, and the page renders an explicit refresh affordance per §3.2.
const ADDRESS_REFRESH_TIER: RefreshTier = "slow";
const REFRESH_TIER_CADENCE_MS: Partial<Record<RefreshTier, number>> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: 0,
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const cardStyle: CSSProperties = {
  overflow: "hidden",
};

const primaryCellStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const inactivePrimaryCellStyle: CSSProperties = {
  color: th.textMuted,
  fontWeight: 600,
};

const addressTextStyle: CSSProperties = {
  display: "inline-block",
  whiteSpace: "normal",
  lineHeight: 1.4,
  color: th.textMuted,
};

const tagWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
};

const actionsCellStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
};

const ownerLinkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
  fontFamily: th.monoFamily,
};

const tabLinkStyle: CSSProperties = {
  color: "inherit",
  textDecoration: "none",
};

const freshnessRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 12,
  color: th.textMuted,
};

const refreshLinkStyle: CSSProperties = {
  textDecoration: "none",
};

const filterChipRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 12,
  color: th.textMuted,
};

// ─────────────────────────────────────────────────────────────────────────────
// Filter model (packet §5.6: filter by tag / by owner passenger; search name/text)
// ─────────────────────────────────────────────────────────────────────────────

type AddressStateTab = "all" | "active" | "inactive";

type AddressFilters = {
  tab: AddressStateTab;
  tag: string | null;
  owner: string | null;
  query: string | null;
};

type AddressStateTabDefinition = {
  key: AddressStateTab;
  label: string;
};

const ADDRESS_STATE_TABS: AddressStateTabDefinition[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "啟用" },
  { key: "inactive", label: "停用" },
];

type AddressesPageData = {
  addresses: TenantAddressRecord[];
  passengerNamesById: Map<string, string>;
  loadError: { reason: EmptyReason; message: string } | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

// The tenant list endpoints surface failures as `Error("API error <status>: …")`.
// Map the HTTP class onto the EmptyReason taxonomy (packet §3.6) so the empty
// state stays honest instead of collapsing every failure into "no data".
function classifyLoadFailure(error: unknown): {
  reason: EmptyReason;
  message: string;
} {
  const message = toErrorMessage(error);
  const statusMatch = message.match(/API error (\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  if (status === 401 || status === 403) {
    return { reason: "permission_denied", message };
  }
  if (status === 404 || status === 501) {
    return { reason: "not_provisioned", message };
  }
  if (status !== null && status >= 502 && status <= 504) {
    return { reason: "external_unavailable", message };
  }
  return { reason: "fetch_failed", message };
}

function comparePassengerName(record: TenantPassengerRecord) {
  return record.fullName;
}

function compareAddresses(left: TenantAddressRecord, right: TenantAddressRecord) {
  if (left.activeFlag !== right.activeFlag) {
    return left.activeFlag ? -1 : 1;
  }
  return left.addressName.localeCompare(right.addressName, "zh-Hant");
}

async function loadAddressesData(): Promise<AddressesPageData> {
  const client = getTenantClient();
  const [addressesResult, passengersResult] = await Promise.allSettled([
    client.listAddresses() as Promise<TenantAddressRecord[]>,
    client.listPassengers() as Promise<TenantPassengerRecord[]>,
  ]);

  if (addressesResult.status === "rejected") {
    return {
      addresses: [],
      passengerNamesById: new Map(),
      loadError: classifyLoadFailure(addressesResult.reason),
    };
  }

  const addresses = [...addressesResult.value].sort(compareAddresses);

  // Owner passenger reference resolution is best-effort: a failed passenger
  // lookup degrades the OWNER column to the raw id, it does not fail the page.
  const passengerNamesById = new Map<string, string>();
  if (passengersResult.status === "fulfilled") {
    for (const passenger of passengersResult.value) {
      passengerNamesById.set(
        passenger.passengerId,
        comparePassengerName(passenger),
      );
    }
  }

  return { addresses, passengerNamesById, loadError: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// availableActions (Q-X13): CTAs are descriptor-driven, never hard-coded by role
// ─────────────────────────────────────────────────────────────────────────────

function buildAddressRowActions(
  address: TenantAddressRecord,
): ResourceActionDescriptor[] {
  const actions: ResourceActionDescriptor[] = [
    { action: "update", enabled: true, riskLevel: "medium" },
  ];

  if (address.activeFlag) {
    // Soft deactivate only (Q-TEN06) — high risk, reason required.
    actions.push({
      action: "deactivate",
      enabled: true,
      riskLevel: "high",
      requiresReason: true,
    });
  } else {
    actions.push({ action: "reactivate", enabled: true, riskLevel: "medium" });
  }

  return actions;
}

const HEADER_ACTIONS: ResourceActionDescriptor[] = [
  { action: "export_view", enabled: true, riskLevel: "low" },
  { action: "create", enabled: true, riskLevel: "medium" },
];

const ACTION_LABELS: Record<string, { zh: string; en: string }> = {
  create: { zh: "新增地址", en: "new" },
  update: { zh: "編輯", en: "edit" },
  deactivate: { zh: "軟停用", en: "deactivate" },
  reactivate: { zh: "重新啟用", en: "reactivate" },
  export_view: { zh: "匯出", en: "export" },
};

const DISABLED_REASON_LABELS: Record<string, string> = {
  already_deactivated: "已停用",
  permission_denied: "權限不足",
};

function findHeaderAction(action: string): ResourceActionDescriptor | undefined {
  return HEADER_ACTIONS.find((descriptor) => descriptor.action === action);
}

function describeAction(descriptor: ResourceActionDescriptor) {
  return ACTION_LABELS[descriptor.action] ?? { zh: descriptor.action, en: "" };
}

function actionVariant(
  descriptor: ResourceActionDescriptor,
): "primary" | "secondary" | "ghost" {
  if (descriptor.action === "create") return "primary";
  return "secondary";
}

function ActionButton({
  descriptor,
  size = "xs",
  icon,
}: {
  descriptor: ResourceActionDescriptor;
  size?: "xs" | "sm" | "md";
  icon?: "plus" | "ext" | "edit" | "x" | "check";
}) {
  const labels = describeAction(descriptor);
  const disabled = !descriptor.enabled;
  const reasonLabel = descriptor.disabledReasonCode
    ? (DISABLED_REASON_LABELS[descriptor.disabledReasonCode] ??
      descriptor.disabledReasonCode)
    : undefined;

  const button = (
    <CanvasBtn
      theme={th}
      size={size}
      variant={actionVariant(descriptor)}
      danger={descriptor.riskLevel === "high"}
      disabled={disabled}
      {...(icon ? { icon } : {})}
    >
      {labels.zh}
    </CanvasBtn>
  );

  // Disabled affordances stay visible with a tooltip explaining why (Q-X13),
  // and high-risk reason-required actions advertise that they collect a reason.
  const title =
    disabled && reasonLabel
      ? reasonLabel
      : descriptor.requiresReason
        ? "需填寫原因 (Q-TEN06)"
        : undefined;

  if (title) {
    return <span title={title}>{button}</span>;
  }
  return button;
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty / not-ready states (Q-X15) — all 6 tenant EmptyReason states distinctly
// ─────────────────────────────────────────────────────────────────────────────

type EmptyStatePresentation = {
  tone: CanvasTone;
  icon: "addresses" | "warn" | "x" | "filter" | "plus";
  title: string;
  body: string;
  cta?: { label: string; href: string; primary?: boolean };
};

const EMPTY_STATE_PRESENTATION: Record<EmptyReason, EmptyStatePresentation> = {
  no_data: {
    tone: "info",
    icon: "addresses",
    title: "尚無常用地址",
    body: "新增第一筆常用地點，加速後續訂單建立。",
    cta: { label: "新增地址", href: "/addresses?action=create", primary: true },
  },
  not_provisioned: {
    tone: "warn",
    icon: "warn",
    title: "地址簿尚未啟用",
    body: "此租戶的地址簿模組尚未開通，請聯絡平台管理員完成設定。",
  },
  fetch_failed: {
    tone: "danger",
    icon: "warn",
    title: "無法載入地址資料",
    body: "讀取地址清單時發生錯誤，請稍後重新整理再試一次。",
    cta: { label: "重新整理", href: "/addresses" },
  },
  permission_denied: {
    tone: "warn",
    icon: "x",
    title: "沒有檢視權限",
    body: "您目前的角色無法檢視此租戶的地址簿，請洽租戶管理員調整權限。",
  },
  external_unavailable: {
    tone: "warn",
    icon: "warn",
    title: "服務暫時無法使用",
    body: "後端地址服務暫時無法回應，這是暫時性狀況，稍後會自動恢復。",
    cta: { label: "重新整理", href: "/addresses" },
  },
  driver_not_eligible: {
    // Driver-app-only reason (Q-DRV01); never expected in tenant-console.
    tone: "neutral",
    icon: "x",
    title: "不適用",
    body: "此狀態不適用於租戶地址簿。",
  },
  filtered_empty: {
    tone: "neutral",
    icon: "filter",
    title: "沒有符合篩選條件的地址",
    body: "目前的標籤、擁有者或關鍵字篩選沒有命中任何地址，請調整或清除篩選。",
    cta: { label: "清除篩選", href: "/addresses" },
  },
};

function AddressEmptyState({ reason }: { reason: EmptyReason }) {
  const presentation = EMPTY_STATE_PRESENTATION[reason];
  return (
    <div
      style={{
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        textAlign: "center",
      }}
    >
      <CanvasPill theme={th} tone={presentation.tone} dot>
        {reason}
      </CanvasPill>
      <div style={{ color: th.text, fontWeight: 600, fontSize: 14 }}>
        {presentation.title}
      </div>
      <div style={{ color: th.textMuted, fontSize: 12.5, maxWidth: 420 }}>
        {presentation.body}
      </div>
      {presentation.cta ? (
        <Link href={presentation.cta.href} style={refreshLinkStyle}>
          <CanvasBtn
            theme={th}
            size="sm"
            variant={presentation.cta.primary ? "primary" : "secondary"}
          >
            {presentation.cta.label}
          </CanvasBtn>
        </Link>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter helpers
// ─────────────────────────────────────────────────────────────────────────────

function getStateTab(rawTab: string | undefined): AddressStateTab {
  const matched = ADDRESS_STATE_TABS.find((tab) => tab.key === rawTab);
  return matched?.key ?? "all";
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function hasActiveFilters(filters: AddressFilters) {
  return (
    filters.tab !== "all" ||
    filters.tag !== null ||
    filters.owner !== null ||
    filters.query !== null
  );
}

function matchesFilters(
  address: TenantAddressRecord,
  filters: AddressFilters,
): boolean {
  if (filters.tab === "active" && !address.activeFlag) return false;
  if (filters.tab === "inactive" && address.activeFlag) return false;
  if (filters.tag && !address.tags.includes(filters.tag)) return false;
  if (filters.owner && address.ownerPassengerId !== filters.owner) return false;
  if (filters.query) {
    const needle = filters.query.toLowerCase();
    const haystack =
      `${address.addressName} ${address.addressText}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function buildTabHref(tab: AddressStateTab, filters: AddressFilters): string {
  const params = new URLSearchParams();
  if (tab !== "all") params.set("tab", tab);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.query) params.set("q", filters.query);
  const queryString = params.toString();
  return queryString ? `/addresses?${queryString}` : "/addresses";
}

function buildTabNodes(filters: AddressFilters) {
  const tabs = ADDRESS_STATE_TABS.map((tab) => (
    <Link key={tab.key} href={buildTabHref(tab.key, filters)} style={tabLinkStyle}>
      {tab.label}
    </Link>
  ));
  const activeIndex = ADDRESS_STATE_TABS.findIndex(
    (tab) => tab.key === filters.tab,
  );
  return { tabs, activeTab: tabs[activeIndex] ?? tabs[0] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Row model
// ─────────────────────────────────────────────────────────────────────────────

type AddressRow = TenantAddressRecord &
  Record<string, unknown> & {
    ownerLabel: string | null;
    actions: ResourceActionDescriptor[];
  };

function toAddressRow(
  address: TenantAddressRecord,
  passengerNamesById: Map<string, string>,
): AddressRow {
  const ownerLabel = address.ownerPassengerId
    ? (passengerNamesById.get(address.ownerPassengerId) ??
      address.ownerPassengerId)
    : null;
  return {
    ...address,
    ownerLabel,
    actions: buildAddressRowActions(address),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function AddressesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const filters: AddressFilters = {
    tab: getStateTab(firstParam(resolvedSearchParams.tab)),
    tag: firstParam(resolvedSearchParams.tag),
    owner: firstParam(resolvedSearchParams.owner),
    query: firstParam(resolvedSearchParams.q),
  };

  const { addresses, passengerNamesById, loadError } =
    await loadAddressesData();

  const filtered = addresses.filter((address) =>
    matchesFilters(address, filters),
  );
  const rows = filtered.map((address) =>
    toAddressRow(address, passengerNamesById),
  );

  const { tabs, activeTab } = buildTabNodes(filters);

  // Resolve which EmptyReason (if any) governs the body.
  const emptyReason: EmptyReason | null = loadError
    ? loadError.reason
    : addresses.length === 0
      ? "no_data"
      : rows.length === 0
        ? "filtered_empty"
        : null;

  const cadenceMs = REFRESH_TIER_CADENCE_MS[ADDRESS_REFRESH_TIER] ?? 0;
  const cadenceLabel =
    cadenceMs > 0 ? `每 ${Math.round(cadenceMs / 1000)} 秒` : "手動";

  const createDescriptor = findHeaderAction("create");
  const exportDescriptor = findHeaderAction("export_view");

  const columns: CanvasTableColumn<AddressRow>[] = [
    {
      h: "NAME",
      k: "addressName",
      w: 170,
      r: (row) => (
        <span
          style={
            row.activeFlag ? primaryCellStyle : inactivePrimaryCellStyle
          }
        >
          {row.addressName}
        </span>
      ),
    },
    {
      h: "ADDRESS",
      r: (row) => <span style={addressTextStyle}>{row.addressText}</span>,
    },
    {
      h: "TAGS",
      w: 200,
      r: (row) =>
        row.tags.length > 0 ? (
          <div style={tagWrapStyle}>
            {row.tags.map((tag) => (
              <Link
                key={tag}
                href={buildTabHref(filters.tab, { ...filters, tag })}
                style={tabLinkStyle}
              >
                <CanvasPill theme={th} tone="info">
                  {tag}
                </CanvasPill>
              </Link>
            ))}
          </div>
        ) : (
          <span style={{ color: th.textDim }}>—</span>
        ),
    },
    {
      h: "GEO",
      w: 120,
      mono: true,
      r: (row) =>
        row.lat !== null && row.lng !== null ? (
          `${row.lat.toFixed(3)}, ${row.lng.toFixed(3)}`
        ) : (
          <span style={{ color: th.textDim }}>未定位</span>
        ),
    },
    {
      h: "OWNER",
      w: 120,
      mono: true,
      r: (row) =>
        row.ownerPassengerId ? (
          <Link
            href={`/passengers?owner=${encodeURIComponent(row.ownerPassengerId)}`}
            style={ownerLinkStyle}
          >
            {row.ownerLabel}
          </Link>
        ) : (
          <span style={{ color: th.textDim }}>–</span>
        ),
    },
    {
      h: "STATE",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={row.activeFlag ? "success" : "neutral"} dot>
          {row.activeFlag ? "active" : "deactivated"}
        </CanvasPill>
      ),
    },
    {
      h: "ACTIONS",
      w: 230,
      r: (row) => (
        <div style={actionsCellStyle}>
          {row.actions.map((descriptor) => (
            <ActionButton
              key={descriptor.action}
              descriptor={descriptor}
              icon={descriptor.action === "update" ? "edit" : undefined}
            />
          ))}
          {row.activeFlag ? (
            // Exit per packet §5.6 / §4.2: /addresses → /bookings/new pre-filled.
            <Link
              href={`/bookings/new?pickupAddressId=${encodeURIComponent(row.addressId)}`}
              style={refreshLinkStyle}
            >
              <CanvasBtn theme={th} size="xs" variant="ghost" icon="ext">
                建單
              </CanvasBtn>
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

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
            {exportDescriptor ? (
              <Link href="/addresses?view=export" style={refreshLinkStyle}>
                <ActionButton descriptor={exportDescriptor} size="sm" icon="ext" />
              </Link>
            ) : null}
            {createDescriptor ? (
              <Link href="/addresses?action=create" style={refreshLinkStyle}>
                <ActionButton
                  descriptor={createDescriptor}
                  size="sm"
                  icon="plus"
                />
              </Link>
            ) : null}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={freshnessRowStyle}>
          <CanvasPill theme={th} tone="neutral" dot>
            T5 · slow
          </CanvasPill>
          <span>自動更新 {cadenceLabel}</span>
          <Link href={buildTabHref(filters.tab, filters)} style={refreshLinkStyle}>
            <CanvasBtn theme={th} size="xs" variant="ghost" icon="ok">
              重新整理
            </CanvasBtn>
          </Link>
        </div>

        {hasActiveFilters(filters) ? (
          <div style={filterChipRowStyle}>
            <span>篩選：</span>
            {filters.tag ? (
              <CanvasPill theme={th} tone="info">
                tag: {filters.tag}
              </CanvasPill>
            ) : null}
            {filters.owner ? (
              <CanvasPill theme={th} tone="info">
                owner: {passengerNamesById.get(filters.owner) ?? filters.owner}
              </CanvasPill>
            ) : null}
            {filters.query ? (
              <CanvasPill theme={th} tone="info">
                關鍵字: {filters.query}
              </CanvasPill>
            ) : null}
            <Link href="/addresses" style={refreshLinkStyle}>
              <CanvasBtn theme={th} size="xs" variant="ghost" icon="x">
                清除
              </CanvasBtn>
            </Link>
          </div>
        ) : null}

        {loadError ? (
          <CanvasBanner
            theme={th}
            tone={loadError.reason === "fetch_failed" ? "danger" : "warn"}
            icon="warn"
            title="無法載入完整地址資料"
            body={loadError.message}
          />
        ) : null}

        <CanvasCard theme={th} padding={0} style={cardStyle}>
          {emptyReason ? (
            <AddressEmptyState reason={emptyReason} />
          ) : (
            <CanvasTable<AddressRow> theme={th} columns={columns} rows={rows} />
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
