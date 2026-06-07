import Link from "next/link";
import { revalidatePath } from "next/cache";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  RefreshTier,
  TenantAddressExportViewRecord,
  TenantAddressQualityIssue,
  TenantAddressRecord,
  TenantPassengerRecord,
  UiRefreshMetadata,
  UpsertTenantAddressCommand,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  ServerCanvasTable,
  type ServerCanvasTableColumn,
} from "@/components/server-canvas-table";
import {
  API_URL,
  DEMO_ACTOR_ID,
  DEMO_TENANT_ID,
  getTenantClient,
} from "@/lib/api-client";
import {
  formatTenantErrorSummary,
  toTenantErrorMessage,
} from "@/lib/error-copy";
import { formatTenantCodeLabel } from "@/lib/localized-labels";

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

const rowActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const stackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const statCardStyle: CSSProperties = {
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minHeight: 108,
};

const statLabelStyle: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: th.textMuted,
  fontWeight: 600,
};

const statValueStyle: CSSProperties = {
  fontSize: 28,
  lineHeight: 1,
  fontWeight: 700,
  color: th.text,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: th.text,
};

const sectionSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: th.textMuted,
  lineHeight: 1.5,
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
};

const detailLabelStyle: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: 0.45,
  textTransform: "uppercase",
  color: th.textDim,
  fontWeight: 600,
};

const detailValueStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  color: th.text,
  lineHeight: 1.5,
};

const linkListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const linkItemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  textDecoration: "none",
};

const refreshMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const monoMetaStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11,
};

const emptyCardStyle: CSSProperties = {
  padding: 28,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 12,
};

const textAreaStyle: CSSProperties = {
  width: "100%",
  minHeight: 84,
  resize: "vertical",
  padding: "10px 12px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 13,
  fontFamily: th.fontFamily,
  boxSizing: "border-box",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.fontFamily,
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: "none",
};

type SearchParams = {
  q?: string;
  tag?: string;
  owner?: string;
  state?: string;
  compose?: string;
  addressId?: string;
  emptyReason?: string;
};

type AddressRow = TenantAddressRecord &
  Record<string, unknown> & {
    _selected?: boolean;
    addressLabel: string;
    addressLine: string;
    ownerLabel: string;
    coordinatesLabel: string;
    stateLabel: string;
    stateTone: CanvasTone;
    qualityTone: CanvasTone;
    qualityLabel: string;
    availableActions: ResourceActionDescriptor[];
  };

type AddressListRecord = TenantAddressRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type AddressListEnvelope = {
  items: AddressListRecord[];
  refreshMetadata?: UiRefreshMetadata;
  emptyState?: {
    reason: EmptyReason;
    nextAction?: ResourceActionDescriptor;
  };
};

type AddressesPageData = {
  addresses: AddressListRecord[];
  passengers: TenantPassengerRecord[];
  exportRows: TenantAddressExportViewRecord[];
  errors: string[];
  refreshMetadata: UiRefreshMetadata;
  emptyReason: EmptyReason | null;
  emptyNextAction?: ResourceActionDescriptor;
};

type EmptyStateDefinition = {
  title: string;
  message: string;
  tone: CanvasTone;
};

const EMPTY_STATE_DEFINITIONS: Record<EmptyReason, EmptyStateDefinition> = {
  no_data: {
    title: "地址簿尚未建立任何常用地點",
    message: "建立第一筆地址後，建立叫車單時即可直接重用上車 / 下車地點。",
    tone: "neutral",
  },
  not_provisioned: {
    title: "地址模組尚未完成建置",
    message: "目前租戶尚未啟用地址目錄或匯出能力，需由管理員先完成設定。",
    tone: "accent",
  },
  fetch_failed: {
    title: "地址資料讀取失敗",
    message: "後端沒有回傳可用列表，請先查看 API 健康狀態與請求錯誤。",
    tone: "danger",
  },
  permission_denied: {
    title: "目前角色無法查看地址簿",
    message: "此空狀態應與單純沒資料區分，避免把權限問題誤判成空目錄。",
    tone: "warn",
  },
  external_unavailable: {
    title: "外部依賴暫時不可用",
    message: "例如地理編碼或匯出服務降級，頁面可瀏覽，但部分功能需稍後再試。",
    tone: "warn",
  },
  driver_not_eligible: {
    title: "司機專用狀態不適用於此頁",
    message:
      "這個空狀態類型仍需保留獨立處理方式，但地址頁不會實際使用司機專用情境。",
    tone: "neutral",
  },
  filtered_empty: {
    title: "目前篩選條件沒有符合結果",
    message: "放寬標籤 / 擁有者 / 關鍵字條件，或改成顯示停用紀錄。",
    tone: "neutral",
  },
};

const ADDRESS_REFRESH_TIER: RefreshTier = "slow";

const REFRESH_TIER_CONFIG: Record<
  RefreshTier,
  { badge: string; cadenceLabel: string; staleAfterMs: number }
> = {
  urgent: { badge: "T1", cadenceLabel: "5 秒", staleAfterMs: 5_000 },
  fast: { badge: "T2", cadenceLabel: "3 秒", staleAfterMs: 3_000 },
  dispatch: { badge: "T3", cadenceLabel: "5 秒", staleAfterMs: 5_000 },
  medium: { badge: "T4", cadenceLabel: "15 秒", staleAfterMs: 15_000 },
  medium_slow: { badge: "T5", cadenceLabel: "30 秒", staleAfterMs: 30_000 },
  slow: { badge: "T5", cadenceLabel: "30 秒", staleAfterMs: 30_000 },
  manual: { badge: "T6", cadenceLabel: "手動", staleAfterMs: 0 },
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return "—";
  return parsed.toISOString().replace("T", " ").slice(0, 16);
}

function formatCoordinates(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(5) : "—";
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

async function loadAddressesPageData(): Promise<AddressesPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  const generatedAt = new Date().toISOString();
  const refreshConfig = REFRESH_TIER_CONFIG[ADDRESS_REFRESH_TIER];

  const [addressesResult, passengersResult, exportResult] =
    await Promise.allSettled([
      fetchTenantAddressEnvelope(),
      client.listPassengers() as Promise<TenantPassengerRecord[]>,
      client.listAddressExportView() as Promise<
        TenantAddressExportViewRecord[]
      >,
    ]);

  const addresses =
    addressesResult.status === "fulfilled"
      ? [...addressesResult.value.items].sort(compareAddresses)
      : [];
  const passengers =
    passengersResult.status === "fulfilled" ? passengersResult.value : [];
  const exportRows =
    exportResult.status === "fulfilled" ? exportResult.value : [];

  if (addressesResult.status === "rejected") {
    errors.push(
      formatTenantErrorSummary(
        "地址清單",
        toTenantErrorMessage(addressesResult.reason, "地址清單讀取失敗"),
      ),
    );
  }
  if (passengersResult.status === "rejected") {
    errors.push(
      formatTenantErrorSummary(
        "乘客目錄",
        toTenantErrorMessage(passengersResult.reason, "乘客目錄讀取失敗"),
      ),
    );
  }
  if (exportResult.status === "rejected") {
    errors.push(
      formatTenantErrorSummary(
        "匯出檢視",
        toTenantErrorMessage(exportResult.reason, "匯出檢視讀取失敗"),
      ),
    );
  }

  return {
    addresses,
    passengers,
    exportRows,
    errors,
    refreshMetadata:
      addressesResult.status === "fulfilled"
        ? (addressesResult.value.refreshMetadata ?? {
            generatedAt,
            staleAfterMs: refreshConfig.staleAfterMs,
            dataFreshness: errors.length > 0 ? "degraded" : "fresh",
            source: "live",
          })
        : {
            generatedAt,
            staleAfterMs: refreshConfig.staleAfterMs,
            dataFreshness: errors.length > 0 ? "degraded" : "fresh",
            source: "live",
          },
    emptyReason:
      addressesResult.status === "fulfilled"
        ? (addressesResult.value.emptyState?.reason ?? null)
        : null,
    ...(addressesResult.status === "fulfilled" &&
    addressesResult.value.emptyState?.nextAction
      ? { emptyNextAction: addressesResult.value.emptyState.nextAction }
      : {}),
  };
}

async function fetchTenantAddressEnvelope(): Promise<AddressListEnvelope> {
  const response = await fetch(`${API_URL}/api/tenant/addresses`, {
    headers: {
      "X-Tenant-Id": DEMO_TENANT_ID,
      "X-Actor-Id": DEMO_ACTOR_ID,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`讀取租戶地址時回傳 HTTP ${response.status}`);
  }

  const payload = (await response.json()) as
    | { data?: Partial<AddressListEnvelope> & { items?: AddressListRecord[] } }
    | { items?: AddressListRecord[] };

  const data = (
    "data" in payload && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload
  ) as Partial<AddressListEnvelope> & { items?: AddressListRecord[] };

  const refreshMetadata =
    data.refreshMetadata && typeof data.refreshMetadata === "object"
      ? data.refreshMetadata
      : undefined;
  const emptyState =
    data.emptyState && typeof data.emptyState === "object"
      ? data.emptyState
      : undefined;

  return {
    items: Array.isArray(data.items) ? data.items : [],
    ...(refreshMetadata ? { refreshMetadata } : {}),
    ...(emptyState ? { emptyState } : {}),
  };
}

function getOwnerLabel(
  address: TenantAddressRecord,
  passengerMap: Map<string, TenantPassengerRecord>,
) {
  if (!address.ownerPassengerId) return "共用";
  const owner = passengerMap.get(address.ownerPassengerId);
  return owner ? owner.fullName : address.ownerPassengerId;
}

function getQualityLabel(issues: TenantAddressQualityIssue[] | undefined) {
  if (!issues || issues.length === 0) return "就緒";
  if (issues.includes("duplicate_normalized_address")) return "地址重複";
  return "需要補定位";
}

function getQualityTone(
  issues: TenantAddressQualityIssue[] | undefined,
): CanvasTone {
  if (!issues || issues.length === 0) return "success";
  if (issues.includes("duplicate_normalized_address")) return "warn";
  return "accent";
}

function buildRowActions(
  address: TenantAddressRecord,
): ResourceActionDescriptor[] {
  const actions: ResourceActionDescriptor[] = [
    { action: "update", enabled: true, riskLevel: "medium" },
  ];

  if (address.activeFlag) {
    actions.push({
      action: "soft_deactivate",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    });
  } else {
    actions.push({
      action: "reactivate",
      enabled: true,
      riskLevel: "medium",
    });
  }

  return actions;
}

function resolveAddressActions(address: AddressListRecord) {
  return address.availableActions && address.availableActions.length > 0
    ? address.availableActions
    : buildRowActions(address);
}

function toAddressRow(
  address: AddressListRecord,
  passengerMap: Map<string, TenantPassengerRecord>,
  selectedId: string | null,
): AddressRow {
  return {
    ...address,
    _selected: address.addressId === selectedId,
    addressLabel: address.addressName,
    addressLine: address.sensitiveFlag
      ? (address.maskedAddressText ?? address.addressText)
      : address.addressText,
    ownerLabel: getOwnerLabel(address, passengerMap),
    coordinatesLabel: `${formatCoordinates(address.lat)} / ${formatCoordinates(address.lng)}`,
    stateLabel: address.activeFlag ? "啟用中" : "已停用",
    stateTone: address.activeFlag ? "success" : "neutral",
    qualityTone: getQualityTone(address.qualityIssues),
    qualityLabel: getQualityLabel(address.qualityIssues),
    availableActions: resolveAddressActions(address),
  };
}

function isEmptyReason(value: string | undefined): value is EmptyReason {
  return Boolean(value && value in EMPTY_STATE_DEFINITIONS);
}

function deriveEmptyReason(
  requested: string | undefined,
  errors: string[],
  allCount: number,
  filteredCount: number,
  hasFilters: boolean,
): EmptyReason | null {
  if (isEmptyReason(requested)) return requested;
  if (filteredCount > 0) return null;
  if (errors.length > 0) return "fetch_failed";
  if (hasFilters) return "filtered_empty";
  if (allCount === 0) return "no_data";
  return null;
}

function getRefreshTierTone(
  freshness: UiRefreshMetadata["dataFreshness"],
): CanvasTone {
  if (freshness === "fresh") return "success";
  if (freshness === "stale") return "warn";
  if (freshness === "degraded") return "danger";
  return "neutral";
}

function descriptorVariant(descriptor: ResourceActionDescriptor) {
  if (descriptor.riskLevel === "high") return "danger";
  if (descriptor.riskLevel === "medium") return "primary";
  return "secondary";
}

function actionLabel(action: string) {
  switch (action) {
    case "create":
      return "新增地址";
    case "update":
      return "編輯";
    case "soft_deactivate":
      return "軟停用";
    case "reactivate":
      return "重新啟用";
    case "export":
      return "匯出";
    default:
      return action;
  }
}

function actionTooltip(descriptor: ResourceActionDescriptor) {
  if (descriptor.enabled) {
    return descriptor.requiresReason ? "高風險操作必須填寫原因" : undefined;
  }
  return formatTenantCodeLabel(descriptor.disabledReasonCode, "目前不可執行");
}

function buildQueryHref(
  searchParams: SearchParams,
  updates: Record<string, string | null>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (!value) continue;
    params.set(key, value);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `/addresses?${query}` : "/addresses";
}

function buildCrossAppLinks(
  address: TenantAddressRecord,
): CrossAppResourceLink[] {
  return [
    {
      targetApp: "tenant-console",
      route: `/bookings/new?prefillAddressId=${encodeURIComponent(address.addressId)}`,
      resourceType: "tenant_booking_create",
      resourceId: address.addressId,
      openMode: "same_tab",
      label: "前往建立叫車並預填地址",
    },
    {
      targetApp: "tenant-console",
      route: `/audit?resourceType=address&resourceId=${encodeURIComponent(address.addressId)}`,
      resourceType: "tenant_address",
      resourceId: address.addressId,
      openMode: "same_tab",
      label: "查看此地址的稽核軌跡",
    },
  ];
}

function EmptyStatePanel({
  reason,
  nextAction,
}: {
  reason: EmptyReason;
  nextAction?: ResourceActionDescriptor;
}) {
  const definition = EMPTY_STATE_DEFINITIONS[reason];
  return (
    <CanvasCard theme={th} style={emptyCardStyle}>
      <CanvasPill theme={th} tone={definition.tone}>
        空狀態類型 · {formatTenantCodeLabel(reason, reason)}
      </CanvasPill>
      <h3 style={{ margin: 0, fontSize: 18, color: th.text }}>
        {definition.title}
      </h3>
      <p
        style={{
          margin: 0,
          maxWidth: 520,
          color: th.textMuted,
          lineHeight: 1.6,
        }}
      >
        {definition.message}
      </p>
      {nextAction ? (
        <span title={actionTooltip(nextAction)}>
          <CanvasBtn
            theme={th}
            variant={
              descriptorVariant(nextAction) === "primary"
                ? "primary"
                : "secondary"
            }
            danger={descriptorVariant(nextAction) === "danger"}
            disabled={!nextAction.enabled}
            icon={reason === "filtered_empty" ? "search" : "plus"}
          >
            {actionLabel(nextAction.action)}
          </CanvasBtn>
        </span>
      ) : null}
    </CanvasCard>
  );
}

function ActionLink({
  href,
  descriptor,
  children,
}: {
  href: string;
  descriptor: ResourceActionDescriptor;
  children: ReactNode;
}) {
  const variant = descriptorVariant(descriptor);
  const danger = variant === "danger";
  const background = danger
    ? th.danger
    : variant === "primary"
      ? th.accent
      : th.surface;
  const borderColor = danger
    ? th.danger
    : variant === "primary"
      ? th.accent
      : th.border;
  const color = danger || variant === "primary" ? "#fff" : th.text;

  return descriptor.enabled ? (
    <Link
      href={href}
      title={actionTooltip(descriptor)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 24,
        padding: "4px 8px",
        borderRadius: 7,
        border: `1px solid ${borderColor}`,
        background,
        color,
        textDecoration: "none",
        fontSize: 11.5,
        fontWeight: 500,
      }}
    >
      {children}
    </Link>
  ) : (
    <span
      title={actionTooltip(descriptor)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "4px 8px",
        borderRadius: 7,
        border: `1px solid ${th.border}`,
        color: th.textMuted,
        opacity: 0.5,
        fontSize: 11.5,
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function SubmitButton({
  children,
  variant = "secondary",
  danger = false,
  disabled = false,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  danger?: boolean;
  disabled?: boolean;
}) {
  const background = danger
    ? th.danger
    : variant === "primary"
      ? th.accent
      : th.surface;
  const borderColor = danger
    ? th.danger
    : variant === "primary"
      ? th.accent
      : th.border;
  const color = danger || variant === "primary" ? "#fff" : th.text;

  return (
    <button
      type="submit"
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 28,
        padding: "5px 10px",
        borderRadius: 7,
        border: `1px solid ${borderColor}`,
        background,
        color,
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontFamily: th.fontFamily,
      }}
    >
      {children}
    </button>
  );
}

export default async function AddressesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const pageData = await loadAddressesPageData();
  const passengerMap = new Map(
    pageData.passengers.map((passenger) => [passenger.passengerId, passenger]),
  );

  const stateFilter = resolvedSearchParams.state ?? "active";
  const keyword = resolvedSearchParams.q?.trim().toLowerCase() ?? "";
  const tagFilter = resolvedSearchParams.tag ?? "";
  const ownerFilter = resolvedSearchParams.owner ?? "";
  const hasFilters = Boolean(
    keyword || tagFilter || ownerFilter || stateFilter !== "active",
  );

  const filteredAddresses = pageData.addresses.filter((address) => {
    if (stateFilter === "active" && !address.activeFlag) return false;
    if (stateFilter === "inactive" && address.activeFlag) return false;
    if (tagFilter && !address.tags.includes(tagFilter)) return false;
    if (ownerFilter && (address.ownerPassengerId ?? "") !== ownerFilter)
      return false;
    if (!keyword) return true;
    const haystacks = [
      address.addressName,
      address.addressText,
      address.normalizedAddressText ?? "",
      address.tags.join(" "),
    ];
    return haystacks.some((value) => value.toLowerCase().includes(keyword));
  });

  const emptyReason = deriveEmptyReason(
    resolvedSearchParams.emptyReason ?? pageData.emptyReason ?? undefined,
    pageData.errors,
    pageData.addresses.length,
    filteredAddresses.length,
    hasFilters,
  );

  const selectedId =
    resolvedSearchParams.addressId ??
    filteredAddresses[0]?.addressId ??
    pageData.addresses[0]?.addressId ??
    null;
  const selectedAddress =
    pageData.addresses.find((address) => address.addressId === selectedId) ??
    null;

  const composeMode =
    resolvedSearchParams.compose === "edit" ||
    resolvedSearchParams.compose === "lifecycle"
      ? resolvedSearchParams.compose
      : "create";

  const rows = emptyReason
    ? []
    : filteredAddresses.map((address) =>
        toAddressRow(address, passengerMap, selectedId),
      );

  const uniqueTags = Array.from(
    new Set(pageData.addresses.flatMap((address) => address.tags)),
  ).sort((left, right) => left.localeCompare(right, "zh-Hant"));
  const owners = pageData.passengers
    .filter((passenger) =>
      pageData.addresses.some(
        (address) => address.ownerPassengerId === passenger.passengerId,
      ),
    )
    .sort((left, right) =>
      left.fullName.localeCompare(right.fullName, "zh-Hant"),
    );

  const activeCount = pageData.addresses.filter(
    (address) => address.activeFlag,
  ).length;
  const inactiveCount = pageData.addresses.length - activeCount;
  const geocodedCount = pageData.addresses.filter(
    (address) =>
      typeof address.lat === "number" && typeof address.lng === "number",
  ).length;
  const exportDescriptor: ResourceActionDescriptor = {
    action: "export",
    enabled: pageData.exportRows.length > 0,
    riskLevel: "low",
    ...(pageData.exportRows.length > 0
      ? {}
      : { disabledReasonCode: "no_export_rows" }),
  };
  const createDescriptor: ResourceActionDescriptor = {
    action: "create",
    enabled: true,
    riskLevel: "medium",
  };

  const columns: ServerCanvasTableColumn<AddressRow>[] = [
    {
      h: "名稱",
      k: "addressLabel",
      w: 180,
      r: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: th.text, fontWeight: 700 }}>
            {row.addressName}
          </span>
          <span
            style={{ color: th.textMuted, fontSize: 11.5, ...monoMetaStyle }}
          >
            {row.addressId}
          </span>
        </div>
      ),
    },
    {
      h: "地址",
      k: "addressLine",
      r: (row) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            whiteSpace: "normal",
          }}
        >
          <span>{row.addressLine}</span>
          {row.sensitiveFlag ? (
            <CanvasPill theme={th} tone="accent">
              已遮罩
            </CanvasPill>
          ) : null}
        </div>
      ),
    },
    {
      h: "標籤",
      w: 190,
      r: (row) =>
        row.tags.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              whiteSpace: "normal",
            }}
          >
            {row.tags.map((tag) => (
              <CanvasPill key={tag} theme={th} tone="info">
                {tag}
              </CanvasPill>
            ))}
          </div>
        ) : (
          "—"
        ),
    },
    {
      h: "擁有者",
      w: 140,
      r: (row) => row.ownerLabel,
    },
    {
      h: "緯度 / 經度",
      w: 150,
      mono: true,
      r: (row) => row.coordinatesLabel,
    },
    {
      h: "狀態",
      w: 110,
      r: (row) => (
        <CanvasPill theme={th} tone={row.stateTone} dot>
          {row.stateLabel}
        </CanvasPill>
      ),
    },
    {
      h: "品質",
      w: 120,
      r: (row) => (
        <CanvasPill theme={th} tone={row.qualityTone}>
          {row.qualityLabel}
        </CanvasPill>
      ),
    },
    {
      h: "操作",
      w: 200,
      r: (row) => (
        <div style={rowActionsStyle}>
          {row.availableActions.map((descriptor) => {
            if (descriptor.action === "update") {
              return (
                <ActionLink
                  key={descriptor.action}
                  href={buildQueryHref(resolvedSearchParams, {
                    compose: "edit",
                    addressId: row.addressId,
                  })}
                  descriptor={descriptor}
                >
                  {actionLabel(descriptor.action)}
                </ActionLink>
              );
            }

            return (
              <ActionLink
                key={descriptor.action}
                href={buildQueryHref(resolvedSearchParams, {
                  compose: "lifecycle",
                  addressId: row.addressId,
                })}
                descriptor={descriptor}
              >
                {actionLabel(descriptor.action)}
              </ActionLink>
            );
          })}
        </div>
      ),
    },
  ];

  const selectedLinks = selectedAddress
    ? buildCrossAppLinks(selectedAddress)
    : [];
  const selectedActions = selectedAddress
    ? resolveAddressActions(selectedAddress)
    : [];
  const lifecycleAction =
    selectedActions.find(
      (action) =>
        action.action ===
        (selectedAddress?.activeFlag ? "soft_deactivate" : "reactivate"),
    ) ?? null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="地址簿"
        subtitle="常用地點 · 標籤 · 啟用狀態 · 僅支援軟停用"
        actions={
          <>
            {exportDescriptor.enabled ? (
              <a
                href={`${API_URL}/api/tenant/addresses/export-view`}
                style={{ textDecoration: "none" }}
                target="_blank"
                rel="noreferrer"
                title={actionTooltip(exportDescriptor)}
              >
                <CanvasBtn theme={th} icon="ext">
                  匯出檢視
                </CanvasBtn>
              </a>
            ) : (
              <span title={actionTooltip(exportDescriptor)}>
                <CanvasBtn theme={th} icon="ext" disabled>
                  匯出檢視
                </CanvasBtn>
              </span>
            )}
            <Link
              href={buildQueryHref(resolvedSearchParams, {
                compose: "create",
                addressId: null,
              })}
              style={{ textDecoration: "none" }}
            >
              <CanvasBtn theme={th} variant="primary" icon="plus">
                {actionLabel(createDescriptor.action)}
              </CanvasBtn>
            </Link>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={refreshMetaStyle}>
          <CanvasPill
            theme={th}
            tone={getRefreshTierTone(pageData.refreshMetadata.dataFreshness)}
            dot
          >
            {REFRESH_TIER_CONFIG[ADDRESS_REFRESH_TIER].badge} ·{" "}
            {REFRESH_TIER_CONFIG[ADDRESS_REFRESH_TIER].cadenceLabel} ·{" "}
            {formatTenantCodeLabel(pageData.refreshMetadata.dataFreshness)}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            產生於 {formatDateTime(pageData.refreshMetadata.generatedAt)}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            資料來源已記錄
          </CanvasPill>
        </div>

        {pageData.refreshMetadata.dataFreshness !== "fresh" ? (
          <CanvasBanner
            theme={th}
            tone={
              pageData.refreshMetadata.dataFreshness === "degraded"
                ? "danger"
                : "warn"
            }
            icon="clock"
            title="資料新鮮度未達即時狀態"
            body={`產生時間 ${formatDateTime(pageData.refreshMetadata.generatedAt)} · 過舊時限 ${pageData.refreshMetadata.staleAfterMs} 毫秒`}
          />
        ) : null}

        {pageData.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分讀取模型載入失敗"
            body={pageData.errors.join(" · ")}
          />
        ) : null}

        <div style={statsGridStyle}>
          <CanvasCard theme={th} style={statCardStyle}>
            <span style={statLabelStyle}>啟用中</span>
            <span style={statValueStyle}>{activeCount}</span>
            <span style={sectionSubtitleStyle}>
              叫車選擇器預設只呈現啟用中的地址。
            </span>
          </CanvasCard>
          <CanvasCard theme={th} style={statCardStyle}>
            <span style={statLabelStyle}>已停用</span>
            <span style={statValueStyle}>{inactiveCount}</span>
            <span style={sectionSubtitleStyle}>
              已停用資料仍保留歷史參照，但不可當作預設可用地址。
            </span>
          </CanvasCard>
          <CanvasCard theme={th} style={statCardStyle}>
            <span style={statLabelStyle}>已定位</span>
            <span style={statValueStyle}>{geocodedCount}</span>
            <span style={sectionSubtitleStyle}>
              缺少座標會標記品質問題，避免建立叫車單時猜測地理位置。
            </span>
          </CanvasCard>
          <CanvasCard theme={th} style={statCardStyle}>
            <span style={statLabelStyle}>匯出檢視</span>
            <span style={statValueStyle}>{pageData.exportRows.length}</span>
            <span style={sectionSubtitleStyle}>匯出檢視會以遮罩地址輸出。</span>
          </CanvasCard>
        </div>

        <CanvasCard theme={th} style={{ padding: 16 }}>
          <form action="/addresses" style={filterGridStyle}>
            <CanvasField theme={th} label="搜尋">
              <input
                name="q"
                placeholder="名稱 / 地址 / 標籤"
                defaultValue={resolvedSearchParams.q ?? ""}
                style={inputStyle}
              />
            </CanvasField>
            <CanvasField theme={th} label="標籤">
              <select name="tag" defaultValue={tagFilter} style={selectStyle}>
                <option value="">全部標籤</option>
                {uniqueTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField theme={th} label="擁有者">
              <select
                name="owner"
                defaultValue={ownerFilter}
                style={selectStyle}
              >
                <option value="">全部擁有者</option>
                {owners.map((owner) => (
                  <option key={owner.passengerId} value={owner.passengerId}>
                    {owner.fullName}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField theme={th} label="狀態">
              <select
                name="state"
                defaultValue={stateFilter}
                style={selectStyle}
              >
                <option value="active">僅啟用</option>
                <option value="all">啟用與停用</option>
                <option value="inactive">僅停用</option>
              </select>
            </CanvasField>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="hidden"
                name="compose"
                value={resolvedSearchParams.compose ?? ""}
              />
              <input
                type="hidden"
                name="addressId"
                value={resolvedSearchParams.addressId ?? ""}
              />
              <SubmitButton variant="primary">套用</SubmitButton>
              <Link href="/addresses" style={{ textDecoration: "none" }}>
                <CanvasBtn theme={th}>清除</CanvasBtn>
              </Link>
            </div>
          </form>
        </CanvasCard>

        <div style={twoColumnStyle}>
          <div style={stackStyle}>
            <CanvasCard theme={th} style={{ padding: 0, overflow: "hidden" }}>
              {emptyReason ? (
                <EmptyStatePanel
                  reason={emptyReason}
                  {...(() => {
                    const nextAction =
                      pageData.emptyNextAction ??
                      (emptyReason === "no_data" ||
                      emptyReason === "not_provisioned"
                        ? createDescriptor
                        : emptyReason === "filtered_empty"
                          ? {
                              action: "create",
                              enabled: true,
                              riskLevel: "low",
                            }
                          : undefined);
                    return nextAction ? { nextAction } : {};
                  })()}
                />
              ) : (
                <ServerCanvasTable theme={th} columns={columns} rows={rows} />
              )}
            </CanvasCard>

            <CanvasCard theme={th} style={{ padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <div>
                  <h2 style={sectionTitleStyle}>契約覆蓋範圍</h2>
                  <p style={sectionSubtitleStyle}>
                    這個頁面會串接可用操作、刷新中繼資料、跨應用資源連結與共用空狀態，不再退回舊版入口網站的基本表單頁。
                  </p>
                </div>
                <CanvasPill theme={th} tone="accent">
                  治理規範
                </CanvasPill>
              </div>
            </CanvasCard>
          </div>

          <div style={stackStyle}>
            <CanvasCard theme={th} style={{ padding: 16 }}>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div>
                  <h2 style={sectionTitleStyle}>
                    {composeMode === "edit" ? "編輯地址" : "新增地址"}
                  </h2>
                  <p style={sectionSubtitleStyle}>
                    可用操作會決定編輯面板目前是新增、更新，還是生命週期檢視模式。
                  </p>
                </div>

                <form
                  action={upsertAddressAction}
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <input
                    type="hidden"
                    name="addressId"
                    value={
                      composeMode === "edit"
                        ? (selectedAddress?.addressId ?? "")
                        : ""
                    }
                  />
                  <CanvasField theme={th} label="地址名稱">
                    <input
                      name="addressName"
                      defaultValue={
                        composeMode === "edit"
                          ? (selectedAddress?.addressName ?? "")
                          : ""
                      }
                      placeholder="總部大樓"
                      required
                      style={inputStyle}
                    />
                  </CanvasField>
                  <CanvasField theme={th} label="地址內容">
                    <textarea
                      name="addressText"
                      defaultValue={
                        composeMode === "edit"
                          ? (selectedAddress?.addressText ?? "")
                          : ""
                      }
                      placeholder="台北市信義區市府路 1 號"
                      required
                      style={textAreaStyle}
                    />
                  </CanvasField>
                  <div style={detailGridStyle}>
                    <CanvasField theme={th} label="緯度">
                      <input
                        name="lat"
                        defaultValue={
                          composeMode === "edit" &&
                          typeof selectedAddress?.lat === "number"
                            ? String(selectedAddress.lat)
                            : ""
                        }
                        placeholder="25.03750"
                        style={inputStyle}
                      />
                    </CanvasField>
                    <CanvasField theme={th} label="經度">
                      <input
                        name="lng"
                        defaultValue={
                          composeMode === "edit" &&
                          typeof selectedAddress?.lng === "number"
                            ? String(selectedAddress.lng)
                            : ""
                        }
                        placeholder="121.56370"
                        style={inputStyle}
                      />
                    </CanvasField>
                  </div>
                  <div style={detailGridStyle}>
                    <CanvasField theme={th} label="標籤">
                      <input
                        name="tags"
                        defaultValue={
                          composeMode === "edit"
                            ? (selectedAddress?.tags.join(", ") ?? "")
                            : ""
                        }
                        placeholder="辦公室, 貴賓, 倉儲"
                        style={inputStyle}
                      />
                    </CanvasField>
                    <CanvasField theme={th} label="乘客擁有者">
                      <select
                        name="ownerPassengerId"
                        defaultValue={
                          composeMode === "edit"
                            ? (selectedAddress?.ownerPassengerId ?? "")
                            : ""
                        }
                        style={selectStyle}
                      >
                        <option value="">共用</option>
                        {pageData.passengers.map((passenger) => (
                          <option
                            key={passenger.passengerId}
                            value={passenger.passengerId}
                          >
                            {passenger.fullName}
                          </option>
                        ))}
                      </select>
                    </CanvasField>
                  </div>
                  <div
                    style={{ display: "flex", gap: 16, alignItems: "center" }}
                  >
                    <label
                      style={{
                        display: "inline-flex",
                        gap: 8,
                        alignItems: "center",
                        color: th.text,
                      }}
                    >
                      <input
                        type="checkbox"
                        name="activeFlag"
                        defaultChecked={
                          composeMode === "edit"
                            ? (selectedAddress?.activeFlag ?? true)
                            : true
                        }
                      />
                      啟用狀態
                    </label>
                    <label
                      style={{
                        display: "inline-flex",
                        gap: 8,
                        alignItems: "center",
                        color: th.text,
                      }}
                    >
                      <input
                        type="checkbox"
                        name="sensitiveFlag"
                        defaultChecked={
                          composeMode === "edit"
                            ? (selectedAddress?.sensitiveFlag ?? false)
                            : false
                        }
                      />
                      敏感資料 / 遮罩
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <SubmitButton variant="primary">
                      {composeMode === "edit" ? "儲存更新" : "建立地址"}
                    </SubmitButton>
                    {composeMode === "edit" ? (
                      <Link
                        href="/addresses"
                        style={{ textDecoration: "none" }}
                      >
                        <CanvasBtn theme={th}>取消</CanvasBtn>
                      </Link>
                    ) : null}
                  </div>
                </form>
              </div>
            </CanvasCard>

            <CanvasCard theme={th} style={{ padding: 16 }}>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div>
                  <h2 style={sectionTitleStyle}>已選地址</h2>
                  <p style={sectionSubtitleStyle}>
                    側欄顯示跨應用連結、匯出遮罩視圖與生命週期操作脈絡。
                  </p>
                </div>

                {selectedAddress ? (
                  <>
                    <div style={detailGridStyle}>
                      <div>
                        <div style={detailLabelStyle}>地址</div>
                        <div style={detailValueStyle}>
                          {selectedAddress.addressName}
                        </div>
                      </div>
                      <div>
                        <div style={detailLabelStyle}>擁有者</div>
                        <div style={detailValueStyle}>
                          {getOwnerLabel(selectedAddress, passengerMap)}
                        </div>
                      </div>
                      <div>
                        <div style={detailLabelStyle}>座標</div>
                        <div style={detailValueStyle}>
                          {formatCoordinates(selectedAddress.lat)} /{" "}
                          {formatCoordinates(selectedAddress.lng)}
                        </div>
                      </div>
                      <div>
                        <div style={detailLabelStyle}>更新時間</div>
                        <div style={detailValueStyle}>
                          {formatDateTime(selectedAddress.updatedAt)}
                        </div>
                      </div>
                    </div>

                    <div style={linkListStyle}>
                      {selectedLinks.map((item) => (
                        <Link
                          key={item.label}
                          href={item.route}
                          style={linkItemStyle}
                        >
                          <span>{item.label}</span>
                          <span
                            style={{ color: th.textMuted, ...monoMetaStyle }}
                          >
                            {item.openMode === "same_tab"
                              ? "同分頁開啟"
                              : "新分頁開啟"}
                          </span>
                        </Link>
                      ))}
                    </div>

                    {composeMode === "lifecycle" && lifecycleAction ? (
                      <form
                        action={changeAddressLifecycleAction}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        <input
                          type="hidden"
                          name="addressId"
                          value={selectedAddress.addressId}
                        />
                        <input
                          type="hidden"
                          name="addressName"
                          value={selectedAddress.addressName}
                        />
                        <input
                          type="hidden"
                          name="addressText"
                          value={selectedAddress.addressText}
                        />
                        <input
                          type="hidden"
                          name="lat"
                          value={selectedAddress.lat ?? ""}
                        />
                        <input
                          type="hidden"
                          name="lng"
                          value={selectedAddress.lng ?? ""}
                        />
                        <input
                          type="hidden"
                          name="tags"
                          value={selectedAddress.tags.join(",")}
                        />
                        <input
                          type="hidden"
                          name="ownerPassengerId"
                          value={selectedAddress.ownerPassengerId ?? ""}
                        />
                        <input
                          type="hidden"
                          name="sensitiveFlag"
                          value={selectedAddress.sensitiveFlag ? "true" : ""}
                        />
                        <input
                          type="hidden"
                          name="nextActiveFlag"
                          value={selectedAddress.activeFlag ? "" : "true"}
                        />
                        <CanvasBanner
                          theme={th}
                          tone={selectedAddress.activeFlag ? "warn" : "accent"}
                          icon={selectedAddress.activeFlag ? "warn" : "check"}
                          title={
                            selectedAddress.activeFlag
                              ? "高風險生命週期操作"
                              : "生命週期重新啟用"
                          }
                          body={
                            selectedAddress.activeFlag
                              ? "軟停用會保留歷史叫車單，但會把這個地址從預設選擇器中移除。"
                              : "重新啟用會讓這個地址回到可選清單，不會建立新的資源。"
                          }
                        />
                        {selectedAddress.activeFlag ? (
                          <CanvasField
                            theme={th}
                            label="原因"
                            hint="依治理規範，介面仍會收集原因，即使目前 API 只是切換啟用狀態。"
                          >
                            <textarea
                              name="reason"
                              required
                              placeholder="請說明為何要停用這個地址。"
                              style={textAreaStyle}
                            />
                          </CanvasField>
                        ) : null}
                        <div style={{ display: "flex", gap: 8 }}>
                          <SubmitButton
                            variant={
                              selectedAddress.activeFlag
                                ? "secondary"
                                : "primary"
                            }
                            danger={selectedAddress.activeFlag}
                          >
                            {selectedAddress.activeFlag
                              ? "確認軟停用"
                              : "確認重新啟用"}
                          </SubmitButton>
                          <Link
                            href={buildQueryHref(resolvedSearchParams, {
                              compose: null,
                            })}
                            style={{ textDecoration: "none" }}
                          >
                            <CanvasBtn theme={th}>返回</CanvasBtn>
                          </Link>
                        </div>
                      </form>
                    ) : (
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        {selectedActions.map((descriptor) => (
                          <ActionLink
                            key={descriptor.action}
                            href={buildQueryHref(resolvedSearchParams, {
                              compose:
                                descriptor.action === "update"
                                  ? "edit"
                                  : "lifecycle",
                              addressId: selectedAddress.addressId,
                            })}
                            descriptor={descriptor}
                          >
                            {actionLabel(descriptor.action)}
                          </ActionLink>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p
                    style={{ margin: 0, color: th.textMuted, lineHeight: 1.6 }}
                  >
                    選一筆地址後，這裡會顯示詳細資料、跨應用連結與生命週期操作。
                  </p>
                )}
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}

async function upsertAddressAction(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const command = buildAddressCommand(formData);
  await client.upsertAddress(command);
  revalidatePath("/addresses");
}

async function changeAddressLifecycleAction(formData: FormData) {
  "use server";

  const client = getTenantClient();
  const command = buildAddressCommand(formData);
  command.activeFlag = formData.get("nextActiveFlag") === "true";
  await client.upsertAddress(command);
  revalidatePath("/addresses");
}

function buildAddressCommand(formData: FormData): UpsertTenantAddressCommand {
  const tagsRaw = String(formData.get("tags") ?? "");
  const latRaw = String(formData.get("lat") ?? "");
  const lngRaw = String(formData.get("lng") ?? "");
  const addressId = String(formData.get("addressId") ?? "").trim();
  const lat = latRaw ? Number.parseFloat(latRaw) : null;
  const lng = lngRaw ? Number.parseFloat(lngRaw) : null;
  const sensitiveFlag = parseCheckboxValue(formData.get("sensitiveFlag"));

  return {
    addressName: String(formData.get("addressName") ?? "").trim(),
    addressText: String(formData.get("addressText") ?? "").trim(),
    ownerPassengerId:
      String(formData.get("ownerPassengerId") ?? "").trim() || null,
    sensitiveFlag,
    lat: typeof lat === "number" && Number.isFinite(lat) ? lat : null,
    lng: typeof lng === "number" && Number.isFinite(lng) ? lng : null,
    tags: tagsRaw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    activeFlag:
      parseCheckboxValue(formData.get("activeFlag")) ||
      formData.get("nextActiveFlag") === "true",
    ...(addressId ? { addressId } : {}),
  };
}

function parseCheckboxValue(value: FormDataEntryValue | null) {
  return value !== null && value !== "" && value !== "false";
}
