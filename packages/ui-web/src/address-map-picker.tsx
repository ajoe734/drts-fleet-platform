"use client";

import type {
  AddressPayload,
  EvaluateServiceAreaCommand,
  GeoCoordinateSource,
  GeoCoordinateProvenance,
  GeoGeocodeConfidence,
  GeoPoint,
  GeoResolutionSurface,
  GeocodeCandidate,
  ServiceAreaEvaluationDecision,
  ServiceAreaEvaluationResult,
  ServiceProductType,
} from "@drts/contracts";
import type { CSSProperties, ReactNode } from "react";
import {
  MANAGEMENT_RADIUS,
  MANAGEMENT_TYPOGRAPHY,
  managementColors,
  managementSurfaceTone,
  type ManagementDensity,
  type ManagementMode,
  type ManagementTone,
} from "./management-theme";

export type AddressMapPickerLocale = "zhTW" | "en";
export type AddressMapStopKind = "pickup" | "dropoff";
export type AddressMapProviderStatus =
  | "idle"
  | "ready"
  | "searching"
  | "provider_unavailable"
  | "no_match"
  | "manual";

export interface AddressMapSelectionContext {
  actorId?: string | null;
  selectedAt?: string;
  surface?: GeoResolutionSurface | null;
}

export interface ManualAddressPayloadInput extends AddressMapSelectionContext {
  address: string;
  lat: number;
  lng: number;
  manualOverrideReason: string;
  coordinateAccuracyM?: number | null;
}

export interface AddressMapPickerProps {
  id: string;
  label: string;
  stopKind: AddressMapStopKind;
  value?: AddressPayload | null;
  query?: string;
  candidates?: GeocodeCandidate[];
  providerStatus?: AddressMapProviderStatus;
  serviceability?: ServiceAreaEvaluationResult | null;
  helperText?: ReactNode;
  providerLabel?: string;
  manualFallbackReason?: string;
  disabled?: boolean;
  locale?: AddressMapPickerLocale;
  density?: ManagementDensity;
  mode?: ManagementMode;
  onQueryChange?: (query: string) => void;
  onSearch?: (query: string) => void;
  onCandidateSelect?: (candidate: GeocodeCandidate) => void;
  onManualCoordinateChange?: (
    field: "address" | "lat" | "lng" | "reason",
    value: string,
  ) => void;
  onPinNudge?: (direction: "north" | "south" | "east" | "west") => void;
}

export interface AddressMapPairPickerProps {
  id: string;
  pickup: Omit<AddressMapPickerProps, "stopKind">;
  dropoff: Omit<AddressMapPickerProps, "stopKind">;
  serviceProductType: ServiceProductType;
  serviceability?: ServiceAreaEvaluationResult | null;
  locale?: AddressMapPickerLocale;
  density?: ManagementDensity;
  mode?: ManagementMode;
  actions?: ReactNode;
}

export interface ServiceAreaPreviewCommandInput {
  pickup?: AddressPayload | null;
  dropoff?: AddressPayload | null;
  serviceProductType: ServiceProductType;
  requestedAt?: string;
}

const COPY = {
  zhTW: {
    searchPlaceholder: "搜尋地址、地標或門口",
    searchAction: "搜尋",
    candidates: "候選地址",
    noCandidates: "沒有候選結果，可改用人工座標。",
    provider_unavailable: "地圖/地址服務暫不可用",
    no_match: "找不到可靠地址",
    manual: "人工座標模式",
    searching: "搜尋中",
    ready: "Provider ready",
    idle: "等待搜尋",
    coordinate: "座標",
    confidence: "信心",
    provider: "Provider",
    mapPreview: "Map preview",
    mapPreviewNote: "Provider-neutral preview；正式底圖由 surface app 注入。",
    selectedPin: "已確認 pin",
    manualFallback: "人工 fallback",
    manualReason: "人工原因",
    lat: "緯度",
    lng: "經度",
    nudge: "鍵盤微調 pin",
    serviceability: "服務範圍預覽",
    serviceable: "可服務",
    manual_review: "需人工覆核",
    not_serviceable: "不可服務",
    evaluateReady: "pickup/dropoff 已具備座標，可送 service-area evaluate。",
    evaluateMissing: "需要 pickup 座標後才能預覽服務範圍。",
  },
  en: {
    searchPlaceholder: "Search address, landmark, or entrance",
    searchAction: "Search",
    candidates: "Candidates",
    noCandidates: "No reliable candidates. Use manual coordinates.",
    provider_unavailable: "Map/address provider unavailable",
    no_match: "No reliable address match",
    manual: "Manual coordinate mode",
    searching: "Searching",
    ready: "Provider ready",
    idle: "Waiting for search",
    coordinate: "Coordinate",
    confidence: "Confidence",
    provider: "Provider",
    mapPreview: "Map preview",
    mapPreviewNote:
      "Provider-neutral preview; base map is injected by the app.",
    selectedPin: "Confirmed pin",
    manualFallback: "Manual fallback",
    manualReason: "Manual reason",
    lat: "Latitude",
    lng: "Longitude",
    nudge: "Keyboard pin adjustment",
    serviceability: "Service-area preview",
    serviceable: "Serviceable",
    manual_review: "Manual review",
    not_serviceable: "Not serviceable",
    evaluateReady: "Pickup/dropoff coordinates are ready for evaluation.",
    evaluateMissing: "Pickup coordinates are required before preview.",
  },
} satisfies Record<AddressMapPickerLocale, Record<string, string>>;

const PROVIDER_STATUS_TONE: Record<AddressMapProviderStatus, ManagementTone> = {
  idle: "neutral",
  ready: "success",
  searching: "info",
  provider_unavailable: "danger",
  no_match: "warning",
  manual: "warning",
};

const SERVICEABILITY_TONE: Record<
  ServiceAreaEvaluationDecision,
  ManagementTone
> = {
  serviceable: "success",
  manual_review: "warning",
  not_serviceable: "danger",
};

function isFiniteCoordinate(value: number) {
  return Number.isFinite(value);
}

function isLatitude(value: number) {
  return isFiniteCoordinate(value) && value >= -90 && value <= 90;
}

function isLongitude(value: number) {
  return isFiniteCoordinate(value) && value >= -180 && value <= 180;
}

function formatCoordinate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(6)
    : "—";
}

function hasPoint(
  value: AddressPayload | null | undefined,
): value is
  | (AddressPayload & { lat: number; lng: number })
  | (AddressPayload & { lat: number; lng: number; address: string }) {
  return (
    typeof value?.lat === "number" &&
    typeof value.lng === "number" &&
    isLatitude(value.lat) &&
    isLongitude(value.lng)
  );
}

export function parseManualGeoPoint(
  latInput: string,
  lngInput: string,
): GeoPoint | null {
  const lat = Number(latInput);
  const lng = Number(lngInput);
  if (!isLatitude(lat) || !isLongitude(lng)) {
    return null;
  }
  return { lat, lng };
}

export function buildAddressPayloadFromCandidate(
  candidate: GeocodeCandidate,
  context: AddressMapSelectionContext = {},
): AddressPayload {
  const selectedAt = context.selectedAt ?? new Date().toISOString();
  const location = candidate.location ?? null;
  const coordinateSource: GeoCoordinateSource = "provider_candidate";
  const geocodeConfidence: GeoGeocodeConfidence = candidate.confidence;
  const address = candidate.address || candidate.displayName;
  const coordinateProvenance: GeoCoordinateProvenance = {
    coordinateSource,
    geocodeProvider: candidate.provider,
    geocodeConfidence,
    providerCandidateId:
      candidate.providerCandidateId ?? candidate.candidateId ?? null,
    coordinateAccuracyM: candidate.accuracyM ?? null,
    selectedByActorId: context.actorId ?? null,
    selectedAt,
    pinnedByActorId: context.actorId ?? null,
    pinnedAt: selectedAt,
    surface: context.surface ?? null,
  };
  const payload: AddressPayload = {
    address,
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
    geocodeProvider: candidate.provider,
    geocodeConfidence,
    coordinateSource,
    coordinateAccuracyM: candidate.accuracyM ?? null,
    providerCandidateId:
      candidate.providerCandidateId ?? candidate.candidateId ?? null,
    selectedByActorId: context.actorId ?? null,
    selectedAt,
    pinnedByActorId: context.actorId ?? null,
    pinnedAt: selectedAt,
    surface: context.surface ?? null,
    coordinateProvenance,
  };

  if (candidate.normalizedAddress !== undefined) {
    payload.normalizedAddress = candidate.normalizedAddress;
  }
  if (candidate.placeId !== undefined) {
    payload.placeId = candidate.placeId;
    coordinateProvenance.placeId = candidate.placeId;
  }

  return payload;
}

export function buildManualAddressPayload(
  input: ManualAddressPayloadInput,
): AddressPayload {
  if (!isLatitude(input.lat) || !isLongitude(input.lng)) {
    throw new Error("Manual address payload requires valid lat/lng.");
  }
  const pinnedAt = input.selectedAt ?? new Date().toISOString();
  const coordinateSource: GeoCoordinateSource = "manual_pin";
  const geocodeConfidence: GeoGeocodeConfidence = "manual";
  return {
    address: input.address.trim(),
    lat: input.lat,
    lng: input.lng,
    geocodeConfidence,
    coordinateSource,
    coordinateAccuracyM: input.coordinateAccuracyM ?? null,
    selectedByActorId: input.actorId ?? null,
    selectedAt: pinnedAt,
    pinnedByActorId: input.actorId ?? null,
    pinnedAt,
    manualOverrideReason: input.manualOverrideReason.trim(),
    surface: input.surface ?? null,
    coordinateProvenance: {
      coordinateSource,
      geocodeConfidence,
      selectedByActorId: input.actorId ?? null,
      selectedAt: pinnedAt,
      pinnedByActorId: input.actorId ?? null,
      pinnedAt,
      manualOverrideReason: input.manualOverrideReason.trim(),
      coordinateAccuracyM: input.coordinateAccuracyM ?? null,
      surface: input.surface ?? null,
    },
  };
}

export function buildServiceAreaPreviewCommand({
  pickup,
  dropoff,
  serviceProductType,
  requestedAt,
}: ServiceAreaPreviewCommandInput): EvaluateServiceAreaCommand | null {
  if (!hasPoint(pickup)) {
    return null;
  }

  const command: EvaluateServiceAreaCommand = {
    serviceProductType,
    pickup: { lat: pickup.lat, lng: pickup.lng },
  };
  if (hasPoint(dropoff)) {
    command.dropoff = { lat: dropoff.lat, lng: dropoff.lng };
  }
  if (requestedAt) {
    command.requestedAt = requestedAt;
  }
  return command;
}

export function serviceabilityTone(
  decision: ServiceAreaEvaluationDecision | null | undefined,
): ManagementTone {
  return decision ? (SERVICEABILITY_TONE[decision] ?? "neutral") : "neutral";
}

function serviceabilityLabel(
  copy: (typeof COPY)[AddressMapPickerLocale],
  decision: ServiceAreaEvaluationDecision,
) {
  switch (decision) {
    case "serviceable":
      return copy.serviceable;
    case "manual_review":
      return copy.manual_review;
    case "not_serviceable":
    default:
      return copy.not_serviceable;
  }
}

function chipStyle(tone: ManagementTone, mode: ManagementMode): CSSProperties {
  const toneStyles = managementSurfaceTone(tone, mode);
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    borderRadius: MANAGEMENT_RADIUS.pill,
    border: `1px solid ${toneStyles.border}`,
    background: toneStyles.background,
    color: toneStyles.text,
    fontSize: MANAGEMENT_TYPOGRAPHY.caption.comfortable,
    fontWeight: 700,
    padding: "4px 9px",
    whiteSpace: "nowrap",
  };
}

function toneBoxStyle(
  tone: ManagementTone,
  mode: ManagementMode,
): CSSProperties {
  const toneStyles = managementSurfaceTone(tone, mode);
  return {
    background: toneStyles.background,
    border: `1px solid ${toneStyles.border}`,
    color: toneStyles.text,
  };
}

function fieldStyle(mode: ManagementMode): CSSProperties {
  const colors = managementColors(mode);
  return {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: MANAGEMENT_RADIUS.inset,
    border: `1px solid ${managementSurfaceTone("neutral", mode).border}`,
    background: colors.surface,
    color: colors.text,
    padding: "10px 12px",
    fontSize: MANAGEMENT_TYPOGRAPHY.body.comfortable,
  };
}

function labelStyle(mode: ManagementMode): CSSProperties {
  return {
    display: "grid",
    gap: "6px",
    color: managementColors(mode).text,
    fontSize: MANAGEMENT_TYPOGRAPHY.caption.comfortable,
    fontWeight: 700,
  };
}

function candidateKey(candidate: GeocodeCandidate) {
  return (
    candidate.providerCandidateId ?? candidate.placeId ?? candidate.candidateId
  );
}

function AddressMapStatusChip({
  children,
  tone,
  mode,
}: {
  children: ReactNode;
  tone: ManagementTone;
  mode: ManagementMode;
}) {
  return <span style={chipStyle(tone, mode)}>{children}</span>;
}

export function AddressMapPicker({
  id,
  label,
  stopKind,
  value = null,
  query = "",
  candidates = [],
  providerStatus = "idle",
  serviceability = null,
  helperText,
  providerLabel,
  manualFallbackReason,
  disabled = false,
  locale = "zhTW",
  density = "comfortable",
  mode = "light",
  onQueryChange,
  onSearch,
  onCandidateSelect,
  onManualCoordinateChange,
  onPinNudge,
}: AddressMapPickerProps) {
  const copy = COPY[locale];
  const colors = managementColors(mode);
  const providerTone = PROVIDER_STATUS_TONE[providerStatus];
  const serviceTone = serviceabilityTone(serviceability?.decision);
  const selectedPoint = hasPoint(value)
    ? `${formatCoordinate(value.lat)}, ${formatCoordinate(value.lng)}`
    : "—";
  const inputId = `${id}-query`;
  const hasCandidates = candidates.length > 0;
  const showManualPanel =
    providerStatus === "provider_unavailable" ||
    providerStatus === "no_match" ||
    providerStatus === "manual";

  return (
    <section
      data-address-map-picker={id}
      data-stop-kind={stopKind}
      data-provider-status={providerStatus}
      style={{
        background: managementColors(mode).surface,
        color: colors.text,
        minWidth: 0,
        borderRadius: MANAGEMENT_RADIUS.surface,
        border: `1px solid ${managementSurfaceTone(providerTone, mode).border}`,
        padding: density === "compact" ? "14px" : "18px",
        display: "grid",
        gap: density === "compact" ? "12px" : "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <div style={{ display: "grid", gap: "6px", minWidth: 0 }}>
          <span
            style={{
              color: colors.textStrong,
              fontSize: MANAGEMENT_TYPOGRAPHY.sectionTitle[density],
              fontWeight: 800,
            }}
          >
            {label}
          </span>
          {helperText ? (
            <span
              style={{
                color: colors.textMuted,
                fontSize: MANAGEMENT_TYPOGRAPHY.body[density],
                lineHeight: 1.5,
              }}
            >
              {helperText}
            </span>
          ) : null}
        </div>
        <AddressMapStatusChip tone={providerTone} mode={mode}>
          {copy[providerStatus]}
        </AddressMapStatusChip>
      </div>

      <div style={{ display: "grid", gap: "8px" }}>
        <label htmlFor={inputId} style={labelStyle(mode)}>
          {copy.searchPlaceholder}
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: "8px",
          }}
        >
          <input
            id={inputId}
            value={query}
            placeholder={copy.searchPlaceholder}
            disabled={disabled}
            onChange={(event) => onQueryChange?.(event.currentTarget.value)}
            style={fieldStyle(mode)}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSearch?.(query)}
            style={{
              ...chipStyle("accent", mode),
              borderRadius: MANAGEMENT_RADIUS.inset,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {copy.searchAction}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: "10px",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
        }}
      >
        <div style={{ display: "grid", gap: "8px", minWidth: 0 }}>
          <strong
            style={{
              color: colors.textStrong,
              fontSize: MANAGEMENT_TYPOGRAPHY.body[density],
            }}
          >
            {copy.candidates}
          </strong>
          {hasCandidates ? (
            <div role="listbox" aria-label={copy.candidates}>
              {candidates.map((candidate) => (
                <button
                  key={candidateKey(candidate)}
                  type="button"
                  disabled={disabled}
                  data-candidate-id={candidate.candidateId}
                  onClick={() => onCandidateSelect?.(candidate)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: `1px solid ${managementSurfaceTone("neutral", mode).border}`,
                    background: colors.surface,
                    color: colors.text,
                    borderRadius: MANAGEMENT_RADIUS.inset,
                    padding: "10px 12px",
                    marginBottom: "8px",
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      color: colors.textStrong,
                      fontWeight: 800,
                    }}
                  >
                    {candidate.displayName}
                  </span>
                  <span style={{ display: "block", color: colors.textMuted }}>
                    {candidate.address}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      marginTop: "8px",
                    }}
                  >
                    <AddressMapStatusChip tone="info" mode={mode}>
                      {copy.confidence}: {candidate.confidence}
                    </AddressMapStatusChip>
                    <AddressMapStatusChip tone="neutral" mode={mode}>
                      {copy.coordinate}:{" "}
                      {candidate.location
                        ? `${formatCoordinate(candidate.location.lat)}, ${formatCoordinate(candidate.location.lng)}`
                        : "—"}
                    </AddressMapStatusChip>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div
              data-address-map-no-candidates
              style={{
                ...toneBoxStyle(
                  providerStatus === "no_match" ? "warning" : "neutral",
                  mode,
                ),
                borderRadius: MANAGEMENT_RADIUS.inset,
                border: `1px dashed ${
                  managementSurfaceTone(
                    providerStatus === "no_match" ? "warning" : "neutral",
                    mode,
                  ).border
                }`,
                padding: "12px",
                fontSize: MANAGEMENT_TYPOGRAPHY.body[density],
              }}
            >
              {copy.noCandidates}
            </div>
          )}
        </div>

        <div
          data-address-map-preview
          style={{
            borderRadius: MANAGEMENT_RADIUS.inset,
            border: `1px solid ${managementSurfaceTone("info", mode).border}`,
            background: managementSurfaceTone("info", mode).background,
            minHeight: "220px",
            padding: "14px",
            display: "grid",
            alignContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ display: "grid", gap: "6px" }}>
            <strong style={{ color: colors.textStrong }}>
              {copy.mapPreview}
            </strong>
            <span
              style={{
                color: colors.textMuted,
                fontSize: MANAGEMENT_TYPOGRAPHY.caption[density],
                lineHeight: 1.4,
              }}
            >
              {copy.mapPreviewNote}
            </span>
          </div>
          <div
            aria-label={copy.selectedPin}
            style={{
              borderRadius: MANAGEMENT_RADIUS.surface,
              border: `1px solid ${managementSurfaceTone("accent", mode).border}`,
              background: colors.surface,
              color: colors.textStrong,
              padding: "14px",
              display: "grid",
              gap: "8px",
              justifyItems: "center",
            }}
          >
            <span style={chipStyle("accent", mode)}>+ pin</span>
            <strong>{selectedPoint}</strong>
            <span style={{ color: colors.textMuted }}>
              {providerLabel ?? value?.geocodeProvider ?? copy.provider}
            </span>
          </div>
          <div
            aria-label={copy.nudge}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "6px",
            }}
          >
            {(["north", "south", "east", "west"] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                disabled={disabled || !hasPoint(value)}
                onClick={() => onPinNudge?.(direction)}
                style={{
                  ...chipStyle("neutral", mode),
                  justifyContent: "center",
                  cursor:
                    disabled || !hasPoint(value) ? "not-allowed" : "pointer",
                }}
              >
                {direction}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showManualPanel ? (
        <div
          data-address-map-manual-fallback
          style={{
            ...toneBoxStyle("warning", mode),
            borderRadius: MANAGEMENT_RADIUS.inset,
            padding: "12px",
            display: "grid",
            gap: "10px",
          }}
        >
          <strong>{copy.manualFallback}</strong>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "8px",
            }}
          >
            <label style={labelStyle(mode)}>
              {copy.searchPlaceholder}
              <input
                value={value?.address ?? ""}
                onChange={(event) =>
                  onManualCoordinateChange?.(
                    "address",
                    event.currentTarget.value,
                  )
                }
                style={fieldStyle(mode)}
              />
            </label>
            <label style={labelStyle(mode)}>
              {copy.lat}
              <input
                inputMode="decimal"
                value={formatCoordinate(value?.lat)}
                onChange={(event) =>
                  onManualCoordinateChange?.("lat", event.currentTarget.value)
                }
                style={fieldStyle(mode)}
              />
            </label>
            <label style={labelStyle(mode)}>
              {copy.lng}
              <input
                inputMode="decimal"
                value={formatCoordinate(value?.lng)}
                onChange={(event) =>
                  onManualCoordinateChange?.("lng", event.currentTarget.value)
                }
                style={fieldStyle(mode)}
              />
            </label>
          </div>
          <label style={labelStyle(mode)}>
            {copy.manualReason}
            <textarea
              value={manualFallbackReason ?? value?.manualOverrideReason ?? ""}
              onChange={(event) =>
                onManualCoordinateChange?.("reason", event.currentTarget.value)
              }
              style={{ ...fieldStyle(mode), minHeight: "72px" }}
            />
          </label>
        </div>
      ) : null}

      {serviceability ? (
        <div
          data-serviceability-decision={serviceability.decision}
          style={{
            ...toneBoxStyle(serviceTone, mode),
            borderRadius: MANAGEMENT_RADIUS.inset,
            padding: "12px",
            display: "grid",
            gap: "6px",
          }}
        >
          <strong>
            {copy.serviceability}:{" "}
            {serviceabilityLabel(copy, serviceability.decision)}
          </strong>
          {serviceability.reasonMessages.length > 0 ? (
            <span>{serviceability.reasonMessages.join(" / ")}</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function AddressMapPairPicker({
  id,
  pickup,
  dropoff,
  serviceProductType,
  serviceability = null,
  locale = "zhTW",
  density = "comfortable",
  mode = "light",
  actions,
}: AddressMapPairPickerProps) {
  const copy = COPY[locale];
  const previewInput: ServiceAreaPreviewCommandInput = { serviceProductType };
  if (pickup.value !== undefined) {
    previewInput.pickup = pickup.value;
  }
  if (dropoff.value !== undefined) {
    previewInput.dropoff = dropoff.value;
  }
  const previewCommand = buildServiceAreaPreviewCommand(previewInput);
  const canEvaluate = previewCommand !== null;

  return (
    <section
      data-address-map-pair-picker={id}
      data-service-product-type={serviceProductType}
      data-can-evaluate-service-area={String(canEvaluate)}
      style={{
        display: "grid",
        gap: density === "compact" ? "14px" : "18px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <AddressMapStatusChip
          tone={canEvaluate ? "success" : "warning"}
          mode={mode}
        >
          {canEvaluate ? copy.evaluateReady : copy.evaluateMissing}
        </AddressMapStatusChip>
        {actions}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: density === "compact" ? "12px" : "16px",
        }}
      >
        <AddressMapPicker
          {...pickup}
          stopKind="pickup"
          locale={locale}
          density={density}
          mode={mode}
          serviceability={serviceability}
        />
        <AddressMapPicker
          {...dropoff}
          stopKind="dropoff"
          locale={locale}
          density={density}
          mode={mode}
          serviceability={serviceability}
        />
      </div>
    </section>
  );
}
