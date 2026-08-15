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
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";

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
  titleKey: string;
  messageKey: string;
  tone: CanvasTone;
};

const EMPTY_STATE_DEFINITIONS: Record<EmptyReason, EmptyStateDefinition> = {
  no_data: {
    titleKey: "addresses.empty.noData.title",
    messageKey: "addresses.empty.noData.message",
    tone: "neutral",
  },
  not_provisioned: {
    titleKey: "addresses.empty.notProvisioned.title",
    messageKey: "addresses.empty.notProvisioned.message",
    tone: "accent",
  },
  fetch_failed: {
    titleKey: "addresses.empty.fetchFailed.title",
    messageKey: "addresses.empty.fetchFailed.message",
    tone: "danger",
  },
  permission_denied: {
    titleKey: "addresses.empty.permissionDenied.title",
    messageKey: "addresses.empty.permissionDenied.message",
    tone: "warn",
  },
  external_unavailable: {
    titleKey: "addresses.empty.externalUnavailable.title",
    messageKey: "addresses.empty.externalUnavailable.message",
    tone: "warn",
  },
  driver_not_eligible: {
    titleKey: "addresses.empty.driverNotEligible.title",
    messageKey: "addresses.empty.driverNotEligible.message",
    tone: "neutral",
  },
  filtered_empty: {
    titleKey: "addresses.empty.filteredEmpty.title",
    messageKey: "addresses.empty.filteredEmpty.message",
    tone: "neutral",
  },
};

const ADDRESS_REFRESH_TIER: RefreshTier = "slow";

const REFRESH_TIER_CONFIG: Record<
  RefreshTier,
  { badge: string; cadenceLabel: string; staleAfterMs: number }
> = {
  urgent: { badge: "T1", cadenceLabel: "5s", staleAfterMs: 5_000 },
  fast: { badge: "T2", cadenceLabel: "3s", staleAfterMs: 3_000 },
  dispatch: { badge: "T3", cadenceLabel: "5s", staleAfterMs: 5_000 },
  medium: { badge: "T4", cadenceLabel: "15s", staleAfterMs: 15_000 },
  medium_slow: { badge: "T5", cadenceLabel: "30s", staleAfterMs: 30_000 },
  slow: { badge: "T5", cadenceLabel: "30s", staleAfterMs: 30_000 },
  manual: { badge: "T6", cadenceLabel: "manual", staleAfterMs: 0 },
};

function toErrorMessage(error: unknown, locale: Locale) {
  return error instanceof Error ? error.message : t("addresses.error.unknown", locale);
}

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

async function loadAddressesPageData(locale: Locale): Promise<AddressesPageData> {
  const client = await getTenantClient();
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
      t("addresses.error.addressList", locale, {
        message: toErrorMessage(addressesResult.reason, locale),
      }),
    );
  }
  if (passengersResult.status === "rejected") {
    errors.push(
      t("addresses.error.passengerDirectory", locale, {
        message: toErrorMessage(passengersResult.reason, locale),
      }),
    );
  }
  if (exportResult.status === "rejected") {
    errors.push(
      t("addresses.error.exportView", locale, {
        message: toErrorMessage(exportResult.reason, locale),
      }),
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
  const client = await getTenantClient();
  const payload = (await client.get<
    | { data?: Partial<AddressListEnvelope> & { items?: AddressListRecord[] } }
    | { items?: AddressListRecord[] }
  >("/api/tenant/addresses")) as
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
  locale: Locale,
) {
  if (!address.ownerPassengerId) return t("addresses.owner.shared", locale);
  const owner = passengerMap.get(address.ownerPassengerId);
  return owner ? owner.fullName : address.ownerPassengerId;
}

function getQualityLabel(
  issues: TenantAddressQualityIssue[] | undefined,
  locale: Locale,
) {
  if (!issues || issues.length === 0) return t("addresses.quality.ready", locale);
  if (issues.includes("duplicate_normalized_address")) {
    return t("addresses.quality.duplicate", locale);
  }
  return t("addresses.quality.needsGeocode", locale);
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
  locale: Locale,
): AddressRow {
  return {
    ...address,
    _selected: address.addressId === selectedId,
    addressLabel: address.addressName,
    addressLine: address.sensitiveFlag
      ? (address.maskedAddressText ?? address.addressText)
      : address.addressText,
    ownerLabel: getOwnerLabel(address, passengerMap, locale),
    coordinatesLabel: `${formatCoordinates(address.lat)} / ${formatCoordinates(address.lng)}`,
    stateLabel: t(
      address.activeFlag ? "addresses.state.active" : "addresses.state.deactivated",
      locale,
    ),
    stateTone: address.activeFlag ? "success" : "neutral",
    qualityTone: getQualityTone(address.qualityIssues),
    qualityLabel: getQualityLabel(address.qualityIssues, locale),
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

function actionLabel(action: string, locale: Locale) {
  switch (action) {
    case "create":
      return t("addresses.action.create", locale);
    case "update":
      return t("addresses.action.update", locale);
    case "soft_deactivate":
      return t("addresses.action.softDeactivate", locale);
    case "reactivate":
      return t("addresses.action.reactivate", locale);
    case "export":
      return t("addresses.action.export", locale);
    default:
      return action;
  }
}

function actionTooltip(descriptor: ResourceActionDescriptor, locale: Locale) {
  if (descriptor.enabled) {
    return descriptor.requiresReason
      ? t("addresses.actionTooltip.requiresReason", locale)
      : undefined;
  }
  return descriptor.disabledReasonCode
    ? t("addresses.actionTooltip.code", locale, {
        code: descriptor.disabledReasonCode,
      })
    : t("addresses.actionTooltip.unavailable", locale);
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
      label: "addresses.crossApp.newBooking",
    },
    {
      targetApp: "tenant-console",
      route: `/audit?resourceType=address&resourceId=${encodeURIComponent(address.addressId)}`,
      resourceType: "tenant_address",
      resourceId: address.addressId,
      openMode: "same_tab",
      label: "addresses.crossApp.audit",
    },
  ];
}

function EmptyStatePanel({
  reason,
  nextAction,
  locale,
}: {
  reason: EmptyReason;
  nextAction?: ResourceActionDescriptor;
  locale: Locale;
}) {
  const definition = EMPTY_STATE_DEFINITIONS[reason];
  return (
    <CanvasCard theme={th} style={emptyCardStyle}>
      <CanvasPill theme={th} tone={definition.tone}>
        {t("addresses.empty.reasonBadge", locale, { reason })}
      </CanvasPill>
      <h3 style={{ margin: 0, fontSize: 18, color: th.text }}>
        {t(definition.titleKey, locale)}
      </h3>
      <p
        style={{
          margin: 0,
          maxWidth: 520,
          color: th.textMuted,
          lineHeight: 1.6,
        }}
      >
        {t(definition.messageKey, locale)}
      </p>
      {nextAction ? (
        <span title={actionTooltip(nextAction, locale)}>
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
            {actionLabel(nextAction.action, locale)}
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
  locale,
}: {
  href: string;
  descriptor: ResourceActionDescriptor;
  children: ReactNode;
  locale: Locale;
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
      title={actionTooltip(descriptor, locale)}
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
      title={actionTooltip(descriptor, locale)}
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
  const locale = await getServerLocale();
  const resolvedSearchParams = (await searchParams) ?? {};
  const pageData = await loadAddressesPageData(locale);
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
        toAddressRow(address, passengerMap, selectedId, locale),
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

  const columns: CanvasTableColumn<AddressRow>[] = [
    {
      h: t("addresses.column.name", locale),
      k: "addressLabel",
      w: 180,
      r: (row: AddressRow) => (
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
      h: t("addresses.column.address", locale),
      k: "addressLine",
      r: (row: AddressRow) => (
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
              {t("addresses.value.masked", locale)}
            </CanvasPill>
          ) : null}
        </div>
      ),
    },
    {
      h: t("addresses.column.tags", locale),
      w: 190,
      r: (row: AddressRow) =>
        row.tags.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              whiteSpace: "normal",
            }}
          >
            {row.tags.map((tag: string) => (
              <CanvasPill key={tag} theme={th} tone="info">
                {tag}
              </CanvasPill>
            ))}
          </div>
        ) : (
          t("addresses.value.empty", locale)
        ),
    },
    {
      h: t("addresses.column.owner", locale),
      w: 140,
      r: (row: AddressRow) => row.ownerLabel,
    },
    {
      h: t("addresses.column.coordinates", locale),
      w: 150,
      mono: true,
      r: (row: AddressRow) => row.coordinatesLabel,
    },
    {
      h: t("addresses.column.state", locale),
      w: 110,
      r: (row: AddressRow) => (
        <CanvasPill theme={th} tone={row.stateTone} dot>
          {row.stateLabel}
        </CanvasPill>
      ),
    },
    {
      h: t("addresses.column.quality", locale),
      w: 120,
      r: (row: AddressRow) => (
        <CanvasPill theme={th} tone={row.qualityTone}>
          {row.qualityLabel}
        </CanvasPill>
      ),
    },
    {
      h: t("addresses.column.actions", locale),
      w: 200,
      r: (row: AddressRow) => (
        <div style={rowActionsStyle}>
          {row.availableActions.map((descriptor: ResourceActionDescriptor) => {
            if (descriptor.action === "update") {
              return (
                <ActionLink
                  key={descriptor.action}
                  href={buildQueryHref(resolvedSearchParams, {
                    compose: "edit",
                    addressId: row.addressId,
                  })}
                  descriptor={descriptor}
                  locale={locale}
                >
                  {actionLabel(descriptor.action, locale)}
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
                  locale={locale}
                >
                  {actionLabel(descriptor.action, locale)}
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
        title={t("addresses.header.title", locale)}
        subtitle={t("addresses.header.subtitle", locale)}
        actions={
          <>
            {exportDescriptor.enabled ? (
              <a
                href="/control-plane-proxy/tenant/addresses/export-view"
                style={{ textDecoration: "none" }}
                target="_blank"
                rel="noreferrer"
                title={actionTooltip(exportDescriptor, locale)}
              >
                <CanvasBtn theme={th} icon="ext">
                  {t("addresses.action.exportView", locale)}
                </CanvasBtn>
              </a>
            ) : (
              <span title={actionTooltip(exportDescriptor, locale)}>
                <CanvasBtn theme={th} icon="ext" disabled>
                  {t("addresses.action.exportView", locale)}
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
                {actionLabel(createDescriptor.action, locale)}
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
            {t(
              `addresses.refresh.freshness.${pageData.refreshMetadata.dataFreshness}`,
              locale,
            )}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            {t("addresses.refresh.generated", locale, {
              time: formatDateTime(pageData.refreshMetadata.generatedAt),
            })}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            {t("addresses.refresh.source", locale, {
              source: t(
                `addresses.refresh.sourceValue.${pageData.refreshMetadata.source}`,
                locale,
              ),
            })}
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
            title={t("addresses.banner.refresh.title", locale)}
            body={t("addresses.banner.refresh.body", locale, {
              generatedAt: formatDateTime(pageData.refreshMetadata.generatedAt),
              staleAfterMs: pageData.refreshMetadata.staleAfterMs,
            })}
          />
        ) : null}

        {pageData.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("addresses.banner.errors.title", locale)}
            body={pageData.errors.join(" · ")}
          />
        ) : null}

        <div style={statsGridStyle}>
          <CanvasCard theme={th} style={statCardStyle}>
            <span style={statLabelStyle}>{t("addresses.kpi.active.label", locale)}</span>
            <span style={statValueStyle}>{activeCount}</span>
            <span style={sectionSubtitleStyle}>
              {t("addresses.kpi.active.sub", locale)}
            </span>
          </CanvasCard>
          <CanvasCard theme={th} style={statCardStyle}>
            <span style={statLabelStyle}>{t("addresses.kpi.inactive.label", locale)}</span>
            <span style={statValueStyle}>{inactiveCount}</span>
            <span style={sectionSubtitleStyle}>
              {t("addresses.kpi.inactive.sub", locale)}
            </span>
          </CanvasCard>
          <CanvasCard theme={th} style={statCardStyle}>
            <span style={statLabelStyle}>{t("addresses.kpi.geocoded.label", locale)}</span>
            <span style={statValueStyle}>{geocodedCount}</span>
            <span style={sectionSubtitleStyle}>
              {t("addresses.kpi.geocoded.sub", locale)}
            </span>
          </CanvasCard>
          <CanvasCard theme={th} style={statCardStyle}>
            <span style={statLabelStyle}>{t("addresses.kpi.export.label", locale)}</span>
            <span style={statValueStyle}>{pageData.exportRows.length}</span>
            <span style={sectionSubtitleStyle}>
              {t("addresses.kpi.export.sub", locale)}
            </span>
          </CanvasCard>
        </div>

        <CanvasCard theme={th} style={{ padding: 16 }}>
          <form action="/addresses" style={filterGridStyle}>
            <CanvasField theme={th} label={t("addresses.filters.search", locale)}>
              <input
                name="q"
                placeholder={t("addresses.filters.searchPlaceholder", locale)}
                defaultValue={resolvedSearchParams.q ?? ""}
                style={inputStyle}
              />
            </CanvasField>
            <CanvasField theme={th} label={t("addresses.filters.tag", locale)}>
              <select name="tag" defaultValue={tagFilter} style={selectStyle}>
                <option value="">{t("addresses.filters.tagAll", locale)}</option>
                {uniqueTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField theme={th} label={t("addresses.filters.owner", locale)}>
              <select
                name="owner"
                defaultValue={ownerFilter}
                style={selectStyle}
              >
                <option value="">{t("addresses.filters.ownerAll", locale)}</option>
                {owners.map((owner) => (
                  <option key={owner.passengerId} value={owner.passengerId}>
                    {owner.fullName}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField theme={th} label={t("addresses.filters.state", locale)}>
              <select
                name="state"
                defaultValue={stateFilter}
                style={selectStyle}
              >
                <option value="active">{t("addresses.filters.stateActive", locale)}</option>
                <option value="all">{t("addresses.filters.stateAll", locale)}</option>
                <option value="inactive">{t("addresses.filters.stateInactive", locale)}</option>
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
              <SubmitButton variant="primary">
                {t("addresses.action.apply", locale)}
              </SubmitButton>
              <Link href="/addresses" style={{ textDecoration: "none" }}>
                <CanvasBtn theme={th}>{t("addresses.action.clear", locale)}</CanvasBtn>
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
                  locale={locale}
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
                <CanvasTable theme={th} columns={columns} rows={rows} />
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
                  <h2 style={sectionTitleStyle}>
                    {t("addresses.contractCoverage.title", locale)}
                  </h2>
                  <p style={sectionSubtitleStyle}>
                    {t("addresses.contractCoverage.body", locale)}
                  </p>
                </div>
                <CanvasPill theme={th} tone="accent">
                  Q-TEN02 / Q-TEN06
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
                    {composeMode === "edit"
                      ? t("addresses.compose.editTitle", locale)
                      : t("addresses.compose.createTitle", locale)}
                  </h2>
                  <p style={sectionSubtitleStyle}>
                    {t("addresses.compose.subtitle", locale)}
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
                  <CanvasField theme={th} label={t("addresses.form.addressName", locale)}>
                    <input
                      name="addressName"
                      defaultValue={
                        composeMode === "edit"
                          ? (selectedAddress?.addressName ?? "")
                          : ""
                      }
                      placeholder={t("addresses.form.addressNamePlaceholder", locale)}
                      required
                      style={inputStyle}
                    />
                  </CanvasField>
                  <CanvasField theme={th} label={t("addresses.form.addressText", locale)}>
                    <textarea
                      name="addressText"
                      defaultValue={
                        composeMode === "edit"
                          ? (selectedAddress?.addressText ?? "")
                          : ""
                      }
                      placeholder={t("addresses.form.addressTextPlaceholder", locale)}
                      required
                      style={textAreaStyle}
                    />
                  </CanvasField>
                  <div style={detailGridStyle}>
                    <CanvasField theme={th} label={t("addresses.form.lat", locale)}>
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
                    <CanvasField theme={th} label={t("addresses.form.lng", locale)}>
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
                    <CanvasField theme={th} label={t("addresses.form.tags", locale)}>
                      <input
                        name="tags"
                        defaultValue={
                          composeMode === "edit"
                            ? (selectedAddress?.tags.join(", ") ?? "")
                            : ""
                        }
                        placeholder={t("addresses.form.tagsPlaceholder", locale)}
                        style={inputStyle}
                      />
                    </CanvasField>
                    <CanvasField theme={th} label={t("addresses.form.ownerPassenger", locale)}>
                      <select
                        name="ownerPassengerId"
                        defaultValue={
                          composeMode === "edit"
                            ? (selectedAddress?.ownerPassengerId ?? "")
                            : ""
                        }
                        style={selectStyle}
                      >
                        <option value="">{t("addresses.owner.shared", locale)}</option>
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
                      {t("addresses.form.activeFlag", locale)}
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
                      {t("addresses.form.sensitiveFlag", locale)}
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <SubmitButton variant="primary">
                      {composeMode === "edit"
                        ? t("addresses.action.saveUpdate", locale)
                        : t("addresses.action.createAddress", locale)}
                    </SubmitButton>
                    {composeMode === "edit" ? (
                      <Link
                        href="/addresses"
                        style={{ textDecoration: "none" }}
                      >
                        <CanvasBtn theme={th}>{t("addresses.action.cancel", locale)}</CanvasBtn>
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
                  <h2 style={sectionTitleStyle}>{t("addresses.detail.title", locale)}</h2>
                  <p style={sectionSubtitleStyle}>
                    {t("addresses.detail.subtitle", locale)}
                  </p>
                </div>

                {selectedAddress ? (
                  <>
                    <div style={detailGridStyle}>
                      <div>
                        <div style={detailLabelStyle}>{t("addresses.detail.address", locale)}</div>
                        <div style={detailValueStyle}>
                          {selectedAddress.addressName}
                        </div>
                      </div>
                      <div>
                        <div style={detailLabelStyle}>{t("addresses.detail.owner", locale)}</div>
                        <div style={detailValueStyle}>
                          {getOwnerLabel(selectedAddress, passengerMap, locale)}
                        </div>
                      </div>
                      <div>
                        <div style={detailLabelStyle}>{t("addresses.detail.coordinates", locale)}</div>
                        <div style={detailValueStyle}>
                          {formatCoordinates(selectedAddress.lat)} /{" "}
                          {formatCoordinates(selectedAddress.lng)}
                        </div>
                      </div>
                      <div>
                        <div style={detailLabelStyle}>{t("addresses.detail.updatedAt", locale)}</div>
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
                          <span>{t(item.label, locale)}</span>
                          <span
                            style={{ color: th.textMuted, ...monoMetaStyle }}
                          >
                            {t(`addresses.openMode.${item.openMode}`, locale)}
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
                              ? t("addresses.lifecycle.banner.deactivateTitle", locale)
                              : t("addresses.lifecycle.banner.reactivateTitle", locale)
                          }
                          body={
                            selectedAddress.activeFlag
                              ? t("addresses.lifecycle.banner.deactivateBody", locale)
                              : t("addresses.lifecycle.banner.reactivateBody", locale)
                          }
                        />
                        {selectedAddress.activeFlag ? (
                          <CanvasField
                            theme={th}
                            label={t("addresses.lifecycle.reason", locale)}
                            hint={t("addresses.lifecycle.reasonHint", locale)}
                          >
                            <textarea
                              name="reason"
                              required
                              placeholder={t("addresses.lifecycle.reasonPlaceholder", locale)}
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
                              ? t("addresses.action.confirmSoftDeactivate", locale)
                              : t("addresses.action.confirmReactivate", locale)}
                          </SubmitButton>
                          <Link
                            href={buildQueryHref(resolvedSearchParams, {
                              compose: null,
                            })}
                            style={{ textDecoration: "none" }}
                          >
                            <CanvasBtn theme={th}>{t("addresses.action.back", locale)}</CanvasBtn>
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
                            locale={locale}
                          >
                            {actionLabel(descriptor.action, locale)}
                          </ActionLink>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p
                    style={{ margin: 0, color: th.textMuted, lineHeight: 1.6 }}
                  >
                    {t("addresses.detail.emptySelection", locale)}
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

  const client = await getTenantClient();
  const command = buildAddressCommand(formData);
  await client.upsertAddress(command);
  revalidatePath("/addresses");
}

async function changeAddressLifecycleAction(formData: FormData) {
  "use server";

  const client = await getTenantClient();
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
