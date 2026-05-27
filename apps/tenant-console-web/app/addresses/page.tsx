import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantAddressDirectoryRecord,
  TenantAddressDirectoryResponse,
  TenantAddressExportViewRecord,
  TenantAddressQualityIssue,
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
import { changeAddressLifecycleAction, upsertAddressAction } from "./actions";

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

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.8fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const lowerGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.92fr)",
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
  gridTemplateColumns: "minmax(0, 1.4fr) repeat(3, minmax(120px, 0.58fr)) auto",
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
  minHeight: 34,
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  padding: "8px 11px",
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
  minHeight: 28,
  fontWeight: 500,
  background: th.surface,
  color: th.text,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  lineHeight: 1.25,
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

const externalLinkStyle: CSSProperties = {
  color: th.text,
  textDecoration: "none",
  borderBottom: `1px solid ${th.border}`,
  paddingBottom: 10,
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const fullWidthFieldStyle: CSSProperties = {
  ...fieldStackStyle,
  gridColumn: "1 / -1",
};

type AddressTabKey = "active" | "inactive" | "quality" | "export";
type AddressMode = "create" | "edit" | "deactivate" | "reactivate";
type AddressEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;
type FlashTone = "default" | "warning";
type AllowedAddressAction = "create" | "update" | "deactivate" | "reactivate";

type SearchParams = {
  q?: string;
  tab?: string;
  owner?: string;
  tag?: string;
  mode?: string;
  addressId?: string;
  notice?: string;
  tone?: string;
};

type AddressRow = TenantAddressDirectoryRecord &
  Record<string, unknown> & {
    ownerName: string;
    stateLabel: string;
    stateTone: CanvasTone;
    geocodeLabel: string;
    qualitySummary: string[];
    exportMaskedAddress: string;
  };

type AddressPageData = {
  directory: TenantAddressDirectoryResponse | null;
  passengers: TenantPassengerRecord[];
  errors: string[];
};

type EmptyStateConfig = {
  title: string;
  body: string;
  tone: Exclude<CanvasTone, "neutral">;
  ctaLabel: string;
};

type EmptyStateCta = {
  href: string | null;
  label: string;
  enabled: boolean;
  disabledReasonCode?: string;
};

type ActionConfig = {
  mode: AddressMode;
  title: string;
  body: string;
  submitLabel: string;
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
    ctaLabel: "建立地址",
  },
  not_provisioned: {
    title: "地址簿尚未完成租戶啟用",
    body: "目前 tenant 基礎設定尚未 provision 完成，地址資料與匯出遮罩檢視都不會對外開放。",
    tone: "warn",
    ctaLabel: "查看租戶設定",
  },
  fetch_failed: {
    title: "地址資料讀取失敗",
    body: "上一次從 `/api/tenant/addresses` 取數失敗，請重新整理；若持續失敗，請轉往稽核與 API health。",
    tone: "danger",
    ctaLabel: "重新整理",
  },
  permission_denied: {
    title: "目前角色不可查看地址簿",
    body: "後端未回傳可讀取本頁的 authority。CTA 應保留為 disabled，而不是直接消失。",
    tone: "warn",
    ctaLabel: "查看角色設定",
  },
  external_unavailable: {
    title: "外部地址校正依賴目前不可用",
    body: "地址簿仍保留最後快照，但 geocode 與品質校正暫時無法更新，請改走人工確認流程。",
    tone: "warn",
    ctaLabel: "查看整合就緒度",
  },
  filtered_empty: {
    title: "目前篩選條件沒有任何結果",
    body: "清空搜尋、切回已啟用頁籤，或改看匯出遮罩檢視；這是 distinct state，不等於租戶沒有資料。",
    tone: "info",
    ctaLabel: "清空篩選",
  },
};

const ACTION_CONFIG: Record<AddressMode, ActionConfig> = {
  create: {
    mode: "create",
    title: "建立地址",
    body: "Create address (medium) 直接走 `/api/tenant/addresses`，建立後可被 `/bookings/new` 預填重用。",
    submitLabel: "建立地址",
  },
  edit: {
    mode: "edit",
    title: "更新地址",
    body: "Update address (medium) 只能從 row `availableActions` 進入，不再本地推導權限。",
    submitLabel: "儲存變更",
  },
  deactivate: {
    mode: "deactivate",
    title: "停用地址",
    body: "Soft deactivate (high) 會保留既有歷史 booking snapshot，且必須輸入 reason。",
    submitLabel: "確認停用",
  },
  reactivate: {
    mode: "reactivate",
    title: "重新啟用地址",
    body: "Reactivate (medium) 會恢復此地址在建立新 booking 時的可選取狀態。",
    submitLabel: "重新啟用",
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

function getMode(rawMode: string | undefined): AddressMode | null {
  if (
    rawMode === "create" ||
    rawMode === "edit" ||
    rawMode === "deactivate" ||
    rawMode === "reactivate"
  ) {
    return rawMode;
  }
  return null;
}

function getQualityLabel(issue: TenantAddressQualityIssue) {
  if (issue === "duplicate_normalized_address") return "duplicate";
  return "missing_geocode";
}

function getGeocodeLabel(record: AddressRow | TenantAddressDirectoryRecord) {
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

function compareAddresses(
  left: TenantAddressDirectoryRecord,
  right: TenantAddressDirectoryRecord,
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
  const [directoryResult, passengersResult] = await Promise.allSettled([
    client.getAddressDirectory(),
    client.listPassengers() as Promise<TenantPassengerRecord[]>,
  ]);

  const directory =
    directoryResult.status === "fulfilled" ? directoryResult.value : null;
  const passengers =
    passengersResult.status === "fulfilled" ? passengersResult.value : [];

  if (directoryResult.status === "rejected") {
    errors.push(`地址簿: ${toErrorMessage(directoryResult.reason)}`);
  }
  if (passengersResult.status === "rejected") {
    errors.push(`乘客目錄: ${toErrorMessage(passengersResult.reason)}`);
  }

  return { directory, passengers, errors };
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

function buildScopedHref(
  query: string,
  selectedTab: AddressTabKey,
  owner: string,
  tag: string,
  overrides: Record<string, string | undefined | null>,
) {
  const params = new URLSearchParams();
  if (selectedTab !== "active") params.set("tab", selectedTab);
  if (query) params.set("q", query);
  if (owner) params.set("owner", owner);
  if (tag) params.set("tag", tag);

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      params.delete(key);
      continue;
    }
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }

  const result = params.toString();
  return result ? `/addresses?${result}` : "/addresses";
}

function buildTabLink(
  tab: AddressTabKey,
  query: string,
  owner: string,
  tag: string,
) {
  return buildScopedHref(query, tab, owner, tag, {
    mode: null,
    addressId: null,
    notice: null,
    tone: null,
  });
}

function renderActionChip(
  action: ResourceActionDescriptor,
  href: string | null,
  label: string,
) {
  if (!action.enabled || !href) {
    return (
      <span
        key={`${action.action}-${label}`}
        style={disabledActionStyle}
        title={action.disabledReasonCode}
      >
        {label}
      </span>
    );
  }
  return (
    <Link key={`${action.action}-${label}`} href={href} style={actionLinkStyle}>
      {label}
    </Link>
  );
}

function getActionLabel(action: ResourceActionDescriptor) {
  const actionLabelMap: Record<string, string> = {
    create: "create",
    export: "export",
    update: "update",
    deactivate: "deactivate",
    reactivate: "reactivate",
  };
  return `${actionLabelMap[action.action] ?? action.action} · ${action.riskLevel}`;
}

function buildPageActionHref(
  action: ResourceActionDescriptor,
  query: string,
  selectedTab: AddressTabKey,
  owner: string,
  tag: string,
) {
  if (action.action === "create") {
    return buildScopedHref(query, selectedTab, owner, tag, {
      mode: "create",
      addressId: null,
      notice: null,
      tone: null,
    });
  }
  if (action.action === "export") {
    return buildScopedHref(query, "export", owner, tag, {
      mode: null,
      addressId: null,
      notice: null,
      tone: null,
    });
  }
  return null;
}

function buildRowActionHref(
  action: ResourceActionDescriptor,
  row: AddressRow,
  query: string,
  selectedTab: AddressTabKey,
  owner: string,
  tag: string,
) {
  if (
    action.action !== "update" &&
    action.action !== "deactivate" &&
    action.action !== "reactivate"
  ) {
    return null;
  }

  return buildScopedHref(query, selectedTab, owner, tag, {
    mode: action.action === "update" ? "edit" : action.action,
    addressId: row.addressId,
    notice: null,
    tone: null,
  });
}

function toAddressRow(
  record: TenantAddressDirectoryRecord,
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
  };
}

function buildTabs(
  selectedTab: AddressTabKey,
  query: string,
  owner: string,
  tag: string,
) {
  const tabKeys: AddressTabKey[] = ["active", "inactive", "quality", "export"];
  const tabs = tabKeys.map((tab) => (
    <Link
      key={tab}
      href={buildTabLink(tab, query, owner, tag)}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      {TAB_LABELS[tab]}
    </Link>
  ));

  return {
    tabs,
    activeTab: tabs[tabKeys.indexOf(selectedTab)] ?? tabs[0],
  };
}

function getEmptyReasonForRows(
  rows: AddressRow[],
  query: string,
  owner: string,
  tag: string,
  backendReason: AddressEmptyReason | null,
  hasFetchError: boolean,
) {
  if (hasFetchError && rows.length === 0) return "fetch_failed" as const;
  if (rows.length > 0) return null;
  if (query || owner || tag) return "filtered_empty" as const;
  return backendReason;
}

function getRefreshTone(
  dataFreshness:
    | TenantAddressDirectoryResponse["refreshMetadata"]["dataFreshness"]
    | null,
  errors: string[],
): CanvasTone {
  if (errors.length > 0) return "warn";
  if (dataFreshness === "degraded" || dataFreshness === "stale") return "warn";
  if (dataFreshness === "fresh") return "success";
  return "neutral";
}

function getRefreshBannerBody(
  directory: TenantAddressDirectoryResponse | null,
  errors: string[],
) {
  if (!directory) {
    return `T5 Tenant slow · 無法取得 refresh metadata · tenant ${DEMO_TENANT_ID}`;
  }

  const { refreshMetadata } = directory;
  return `T5 Tenant slow · stale after ${Math.round(
    refreshMetadata.staleAfterMs / 1000,
  )}s · snapshot ${formatDateTime(refreshMetadata.generatedAt)} · freshness ${
    refreshMetadata.dataFreshness
  } · source ${refreshMetadata.source} · ${
    errors.length > 0
      ? "partial dependency failure"
      : `tenant ${directory.tenantId}`
  }`;
}

function getEmptyStateHref(
  reason: AddressEmptyReason,
  query: string,
  selectedTab: AddressTabKey,
  owner: string,
  tag: string,
) {
  if (reason === "filtered_empty" || reason === "fetch_failed") {
    return "/addresses";
  }
  if (reason === "not_provisioned") {
    return "/settings";
  }
  if (reason === "permission_denied") {
    return "/users";
  }
  if (reason === "external_unavailable") {
    return "/integration-governance";
  }
  return buildScopedHref(query, selectedTab, owner, tag, {
    mode: "create",
    addressId: null,
    notice: null,
    tone: null,
  });
}

function getEmptyStateCta(
  reason: AddressEmptyReason,
  query: string,
  selectedTab: AddressTabKey,
  owner: string,
  tag: string,
  nextAction?: ResourceActionDescriptor,
): EmptyStateCta {
  const href = getEmptyStateHref(reason, query, selectedTab, owner, tag);
  if (!nextAction) {
    return {
      href,
      label: EMPTY_STATE_CONFIG[reason].ctaLabel,
      enabled: true,
    };
  }

  const actionHref =
    buildPageActionHref(nextAction, query, selectedTab, owner, tag) ?? href;
  const enabled = nextAction.enabled && Boolean(actionHref);
  const label = getActionLabel(nextAction);

  if (nextAction.disabledReasonCode) {
    return {
      href: actionHref,
      label,
      enabled,
      disabledReasonCode: nextAction.disabledReasonCode,
    };
  }

  return {
    href: actionHref,
    label,
    enabled,
  };
}

function buildExternalHref(link: CrossAppResourceLink) {
  const baseUrl =
    link.targetApp === "platform-admin" ? PLATFORM_ADMIN_URL : OPS_CONSOLE_URL;
  return `${baseUrl}${link.route}`;
}

function getLinkTarget(link: CrossAppResourceLink) {
  return link.openMode === "same_tab" ? undefined : "_blank";
}

function getSelectedAddress(rows: AddressRow[], addressId: string | undefined) {
  if (!addressId) return null;
  return rows.find((row) => row.addressId === addressId) ?? null;
}

function findActionDescriptor(
  actions: ResourceActionDescriptor[] | undefined,
  action: AllowedAddressAction,
) {
  return actions?.find((descriptor) => descriptor.action === action) ?? null;
}

function getRequestedActionDescriptor(
  mode: AddressMode | null,
  directory: TenantAddressDirectoryResponse | null,
  selectedAddress: AddressRow | null,
) {
  if (!mode) return null;
  if (mode === "create") {
    return findActionDescriptor(directory?.availableActions, "create");
  }

  if (!selectedAddress) return null;
  const action = mode === "edit" ? "update" : mode;
  return findActionDescriptor(selectedAddress.availableActions, action);
}

function getFlashTone(rawTone: string | undefined): FlashTone {
  return rawTone === "warning" ? "warning" : "default";
}

function getFlashMessage(rawNotice: string | undefined) {
  return rawNotice?.trim() ? decodeURIComponent(rawNotice) : null;
}

function ActionFormCard({
  mode,
  selectedAddress,
  passengers,
  returnTo,
  requestedAction,
}: {
  mode: AddressMode | null;
  selectedAddress: AddressRow | null;
  passengers: TenantPassengerRecord[];
  returnTo: string;
  requestedAction: ResourceActionDescriptor | null;
}) {
  if (!mode) {
    return (
      <CanvasCard
        theme={th}
        title="Action center"
        subtitle="availableActions drives create / update / deactivate / reactivate"
      >
        <p style={emptyCopyStyle}>
          從頁首或 row CTA 進入實際操作。create/update 會送到
          `/api/tenant/addresses`；deactivate 會強制 reason；reactivate
          會恢復可預填狀態。
        </p>
      </CanvasCard>
    );
  }

  const config = ACTION_CONFIG[mode];
  if (mode !== "create" && !selectedAddress) {
    return (
      <CanvasCard
        theme={th}
        title={config.title}
        subtitle="Address selection required"
      >
        <p style={emptyCopyStyle}>
          找不到指定 addressId，請從 Directory rows 重新選取。
        </p>
      </CanvasCard>
    );
  }

  if (!requestedAction?.enabled) {
    return (
      <CanvasCard
        theme={th}
        title={config.title}
        subtitle="Action unavailable for current tenant role"
      >
        <p style={emptyCopyStyle}>
          這個 mode 只能由 backend `availableActions` 開啟。目前 request
          沒有對應可執行 action，原因：
          {requestedAction?.disabledReasonCode ?? "action_not_available"}。
        </p>
      </CanvasCard>
    );
  }

  if (mode === "deactivate" || mode === "reactivate") {
    return (
      <CanvasCard theme={th} title={config.title} subtitle={config.body}>
        <form action={changeAddressLifecycleAction} style={formStyle}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <input
            type="hidden"
            name="addressId"
            value={selectedAddress?.addressId ?? ""}
          />
          <input type="hidden" name="nextState" value={mode} />
          <CanvasDL
            theme={th}
            cols={1}
            items={[
              { k: "address", v: selectedAddress?.addressName ?? "—" },
              {
                k: "addressId",
                v: selectedAddress?.addressId ?? "—",
                mono: true,
              },
              { k: "state", v: selectedAddress?.stateLabel ?? "—" },
            ]}
          />
          {mode === "deactivate" ? (
            <label style={fieldStackStyle}>
              Reason note
              <textarea
                name="reasonNote"
                required
                rows={4}
                placeholder="輸入停用原因，會寫入 audit receipt"
                style={fieldInputStyle}
              />
            </label>
          ) : (
            <label style={fieldStackStyle}>
              Reason note
              <textarea
                name="reasonNote"
                rows={3}
                placeholder="可選：補充重新啟用原因"
                style={fieldInputStyle}
              />
            </label>
          )}
          <div style={actionRowStyle}>
            <button type="submit" style={primaryActionLinkStyle}>
              {config.submitLabel}
            </button>
            <Link href="/addresses" style={ghostActionLinkStyle}>
              取消
            </Link>
          </div>
        </form>
      </CanvasCard>
    );
  }

  const isCreate = mode === "create";
  const ownerOptions = [...passengers].sort((left, right) =>
    left.fullName.localeCompare(right.fullName, "zh-Hant"),
  );

  return (
    <CanvasCard theme={th} title={config.title} subtitle={config.body}>
      <form action={upsertAddressAction} style={formStyle}>
        <input type="hidden" name="returnTo" value={returnTo} />
        {!isCreate ? (
          <input
            type="hidden"
            name="addressId"
            value={selectedAddress?.addressId ?? ""}
          />
        ) : null}
        <div style={formGridStyle}>
          <label style={fieldStackStyle}>
            Address name
            <input
              name="addressName"
              required
              defaultValue={
                isCreate ? "" : (selectedAddress?.addressName ?? "")
              }
              style={fieldInputStyle}
            />
          </label>
          <label style={fieldStackStyle}>
            Owner passenger
            <select
              name="ownerPassengerId"
              defaultValue={
                isCreate ? "" : (selectedAddress?.ownerPassengerId ?? "")
              }
              style={fieldInputStyle}
            >
              <option value="">shared address</option>
              {ownerOptions.map((passenger) => (
                <option
                  key={passenger.passengerId}
                  value={passenger.passengerId}
                >
                  {passenger.fullName}
                </option>
              ))}
            </select>
          </label>
          <label style={fullWidthFieldStyle}>
            Address text
            <textarea
              name="addressText"
              required
              rows={4}
              defaultValue={
                isCreate ? "" : (selectedAddress?.addressText ?? "")
              }
              style={fieldInputStyle}
            />
          </label>
          <label style={fieldStackStyle}>
            Latitude
            <input
              name="lat"
              type="number"
              step="any"
              defaultValue={isCreate ? "" : (selectedAddress?.lat ?? "")}
              style={fieldInputStyle}
            />
          </label>
          <label style={fieldStackStyle}>
            Longitude
            <input
              name="lng"
              type="number"
              step="any"
              defaultValue={isCreate ? "" : (selectedAddress?.lng ?? "")}
              style={fieldInputStyle}
            />
          </label>
          <label style={fullWidthFieldStyle}>
            Tags
            <input
              name="tags"
              placeholder="office, vip, warehouse"
              defaultValue={
                isCreate ? "" : (selectedAddress?.tags.join(", ") ?? "")
              }
              style={fieldInputStyle}
            />
          </label>
          <label style={fieldStackStyle}>
            Geocode source
            <select
              name="geocodeSource"
              defaultValue={
                isCreate ? "none" : (selectedAddress?.geocodeSource ?? "none")
              }
              style={fieldInputStyle}
            >
              <option value="none">none</option>
              <option value="manual">manual</option>
              <option value="provider">provider</option>
            </select>
          </label>
          <label
            style={{
              ...fieldStackStyle,
              justifyContent: "end",
              minHeight: 76,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            <span style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>
              Flags
            </span>
            <label style={{ color: th.text, display: "flex", gap: 8 }}>
              <input
                type="checkbox"
                name="sensitiveFlag"
                defaultChecked={
                  isCreate ? false : Boolean(selectedAddress?.sensitiveFlag)
                }
              />
              Sensitive / export masked
            </label>
            <label style={{ color: th.text, display: "flex", gap: 8 }}>
              <input
                type="checkbox"
                name="activeFlag"
                defaultChecked={
                  isCreate ? true : (selectedAddress?.activeFlag ?? true)
                }
              />
              Active
            </label>
          </label>
        </div>
        <div style={actionRowStyle}>
          <button type="submit" style={primaryActionLinkStyle}>
            {config.submitLabel}
          </button>
          <Link href="/addresses" style={ghostActionLinkStyle}>
            取消
          </Link>
        </div>
      </form>
    </CanvasCard>
  );
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
  const mode = getMode(resolvedSearchParams.mode);
  const flashMessage = getFlashMessage(resolvedSearchParams.notice);
  const flashTone = getFlashTone(resolvedSearchParams.tone);

  const { directory, passengers, errors } = await loadAddressPageData();
  const addresses = [...(directory?.items ?? [])].sort(compareAddresses);
  const passengersById = new Map(
    passengers.map((row) => [row.passengerId, row]),
  );
  const exportRowsById = new Map(
    (directory?.exportItems ?? []).map((row) => [row.addressId, row]),
  );
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
  const refreshTone = getRefreshTone(
    directory?.refreshMetadata.dataFreshness ?? null,
    errors,
  );
  const emptyReason = getEmptyReasonForRows(
    rows,
    query,
    selectedOwner,
    selectedTag,
    (directory?.emptyState?.reason as AddressEmptyReason | null) ?? null,
    errors.length > 0,
  );
  const { tabs, activeTab } = buildTabs(
    selectedTab,
    query,
    selectedOwner,
    selectedTag,
  );
  const selectedAddress = getSelectedAddress(
    rows.length > 0
      ? rows
      : addresses.map((record) =>
          toAddressRow(record, passengersById, exportRowsById),
        ),
    resolvedSearchParams.addressId,
  );
  const requestedAction = getRequestedActionDescriptor(
    mode,
    directory,
    selectedAddress,
  );
  const returnTo = buildScopedHref(
    query,
    selectedTab,
    selectedOwner,
    selectedTag,
    {
      mode: null,
      addressId: null,
      notice: null,
      tone: null,
    },
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
            row.tags.map((tag) => (
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
            row.qualitySummary.map((item) => (
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
          {row.availableActions.map((action) =>
            renderActionChip(
              action,
              buildRowActionHref(
                action,
                row,
                query,
                selectedTab,
                selectedOwner,
                selectedTag,
              ),
              getActionLabel(action),
            ),
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
  const emptyStateCta =
    emptyReason && emptyStateConfig
      ? getEmptyStateCta(
          emptyReason,
          query,
          selectedTab,
          selectedOwner,
          selectedTag,
          directory?.emptyState?.reason === emptyReason
            ? directory.emptyState.nextAction
            : undefined,
        )
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
            {(directory?.availableActions ?? []).map((action) => {
              const href = buildPageActionHref(
                action,
                query,
                selectedTab,
                selectedOwner,
                selectedTag,
              );
              const label = getActionLabel(action);
              if (!action.enabled || !href) {
                return (
                  <span
                    key={action.action}
                    style={disabledActionStyle}
                    title={action.disabledReasonCode}
                  >
                    {label}
                  </span>
                );
              }
              return (
                <Link
                  key={action.action}
                  href={href}
                  style={
                    action.action === "create"
                      ? primaryActionLinkStyle
                      : actionLinkStyle
                  }
                >
                  {label}
                </Link>
              );
            })}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone={refreshTone === "success" ? "info" : "warn"}
          icon="clock"
          title="Refresh tier wired"
          body={getRefreshBannerBody(directory, errors)}
          actions={
            <Link href={returnTo} style={ghostActionLinkStyle}>
              refresh
            </Link>
          }
        />

        {flashMessage ? (
          <CanvasBanner
            theme={th}
            tone={flashTone === "warning" ? "warn" : "info"}
            icon={flashTone === "warning" ? "warn" : "clock"}
            title={
              flashTone === "warning"
                ? "Address action failed"
                : "Address action completed"
            }
            body={flashMessage}
          />
        ) : null}

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
                  {passengers.map((row) => (
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
              {(directory?.crossAppLinks ?? []).map((link) => (
                <a
                  key={`${link.targetApp}-${link.resourceId}`}
                  href={buildExternalHref(link)}
                  rel="noreferrer"
                  style={externalLinkStyle}
                  target={getLinkTarget(link)}
                >
                  <span style={primaryTextStyle}>{link.label}</span>
                  <span style={secondaryTextStyle}>
                    {link.targetApp} · {link.resourceType} ·{" "}
                    {link.openMode === "same_tab"
                      ? "opens in current tab"
                      : "opens in new tab"}
                  </span>
                </a>
              ))}
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
                    k: "directory source",
                    v: "GET /api/tenant/addresses returns items + exportItems + refreshMetadata",
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
                ? "Masked export view · owner reference · active flag · backend row availableActions"
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
                {emptyStateCta?.enabled && emptyStateCta.href ? (
                  <Link
                    href={emptyStateCta.href}
                    style={primaryActionLinkStyle}
                  >
                    {emptyStateCta.label}
                  </Link>
                ) : (
                  <span
                    style={disabledActionStyle}
                    title={emptyStateCta?.disabledReasonCode}
                  >
                    {emptyStateCta?.label ?? emptyStateConfig.ctaLabel}
                  </span>
                )}
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
            <ActionFormCard
              mode={mode}
              selectedAddress={selectedAddress}
              passengers={passengers}
              returnTo={returnTo}
              requestedAction={requestedAction}
            />

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
                          <Link href="/passengers" style={ghostActionLinkStyle}>
                            owner passenger
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={emptyCopyStyle}>
                  empty state 時只顯示可用 CTA，不假設 row exits 仍可用。
                </p>
              )}
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="EmptyReason library"
              subtitle="6 states rendered distinctly"
            >
              <div style={cardStackStyle}>
                {(Object.keys(EMPTY_STATE_CONFIG) as AddressEmptyReason[]).map(
                  (reason) => (
                    <div key={reason}>
                      <div style={pillWrapStyle}>
                        <CanvasPill
                          theme={th}
                          tone={EMPTY_STATE_CONFIG[reason].tone}
                        >
                          {reason}
                        </CanvasPill>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <div style={primaryTextStyle}>
                          {EMPTY_STATE_CONFIG[reason].title}
                        </div>
                        <div style={secondaryTextStyle}>
                          {EMPTY_STATE_CONFIG[reason].body}
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
