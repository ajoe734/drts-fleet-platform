"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AddressPayload } from "@drts/contracts";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
import {
  AddressMapPicker,
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
  type AddressMapPickerChange,
  type AddressProviderState,
  type CanvasTheme,
  type ServiceAreaEvaluationResult,
} from "@drts/ui-web";
import {
  createDefaultPartnerBookingDraft,
  getPartnerBookingFieldErrors,
  getPartnerProgramCoverage,
  getPartnerProgramGate,
  getPartnerProgramLabel,
  isPartnerBookingDraftReady,
  type PartnerBookingDraftValues,
} from "@/lib/partner-booking-form";
import {
  getPartnerMapBookingBannerCode,
  getPartnerMapBookingGate,
  hasPartnerAddressCoordinates,
  isPartnerProviderOutage,
  PARTNER_MAP_SERVICE_PRODUCT_TYPE,
  type PartnerMapBookingBannerCode,
  type PartnerServiceabilityPreviewStatus,
} from "@/lib/partner-map-booking";
import {
  createConfiguredPartnerMapProvider,
  resolvePartnerMapProviderMode,
  type PartnerMapProviderMode,
} from "@/lib/partner-map-provider";
import { useTranslation } from "@/lib/i18n";

const baseTheme = buildCanvasTheme({
  surface: "partner",
  density: "compact",
});

const INITIAL_PROVIDER_STATE: AddressProviderState = {
  available: true,
  degraded: false,
  reasonCode: "available",
};

/**
 * Map a stable gate/banner code to customer-safe copy keys. Reason codes match
 * the concierge surface so assisted-entry copy stays consistent.
 */
function partnerMapBannerCopy(code: PartnerMapBookingBannerCode): {
  tone: "success" | "warn" | "info";
  titleKey: string;
  bodyKey: string;
} {
  switch (code) {
    case "serviceable":
      return {
        tone: "success",
        titleKey: "book.map.banner.serviceableTitle",
        bodyKey: "book.map.banner.serviceableBody",
      };
    case "manual_review":
      return {
        tone: "warn",
        titleKey: "book.map.banner.manualReviewTitle",
        bodyKey: "book.map.banner.manualReviewBody",
      };
    case "provider_outage_manual_review":
      return {
        tone: "warn",
        titleKey: "book.map.banner.providerOutageTitle",
        bodyKey: "book.map.banner.providerOutageBody",
      };
    case "serviceability_blocked":
      return {
        tone: "warn",
        titleKey: "book.map.banner.blockedTitle",
        bodyKey: "book.map.banner.blockedBody",
      };
    case "serviceability_preview_required":
      return {
        tone: "info",
        titleKey: "book.map.banner.previewPendingTitle",
        bodyKey: "book.map.banner.previewPendingBody",
      };
    case "serviceability_preview_unavailable":
      return {
        tone: "warn",
        titleKey: "book.map.banner.previewUnavailableTitle",
        bodyKey: "book.map.banner.previewUnavailableBody",
      };
    case "pickup_coordinates_required":
    case "pickup_provenance_required":
      return {
        tone: "info",
        titleKey: "book.map.banner.pickupPinTitle",
        bodyKey: "book.map.banner.pickupPinBody",
      };
    case "dropoff_coordinates_required":
    case "dropoff_provenance_required":
    default:
      return {
        tone: "info",
        titleKey: "book.map.banner.dropoffPinTitle",
        bodyKey: "book.map.banner.dropoffPinBody",
      };
  }
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const fullSpanStyle: CSSProperties = {
  gridColumn: "1 / -1",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const hintStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
};

const inputStyle = (theme: CanvasTheme): CSSProperties => ({
  width: "100%",
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 14,
  border: `1px solid ${theme.borderStrong}`,
  background: "#ffffff",
  color: theme.text,
  font: "inherit",
  boxSizing: "border-box",
});

const textareaStyle = (theme: CanvasTheme): CSSProperties => ({
  ...inputStyle(theme),
  minHeight: 92,
  padding: "12px",
  resize: "vertical",
});

const errorStyle: CSSProperties = {
  fontSize: 12,
  color: "#b91c1c",
  lineHeight: 1.5,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

const submitButtonStyle = (
  theme: CanvasTheme,
  disabled: boolean,
): CSSProperties => ({
  minHeight: 44,
  borderRadius: 14,
  border: `1px solid ${disabled ? theme.borderStrong : theme.accent}`,
  background: disabled ? "#e2e8f0" : theme.accent,
  color: disabled ? theme.textMuted : "#ffffff",
  padding: "0 18px",
  fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
});

function buildPartnerTheme(brand: PartnerBrandTemplate): CanvasTheme {
  return {
    ...baseTheme,
    bg: "transparent",
    bgRaised: brand.theme.panel,
    surface: brand.theme.panel,
    surfaceHi: "#FFFFFF",
    surfaceLo: "#F8FAFC",
    border: brand.theme.panelBorder,
    borderStrong: brand.surface.border,
    rowHover: "#F8FAFC",
    rowSelect: brand.surface.bg,
    text: brand.ink,
    textMuted: brand.theme.pageMuted,
    textDim: brand.theme.pageMuted,
    accent: brand.primary,
    accentHi: brand.primaryDark,
    accentBg: brand.theme.accentSoft,
    accentBorder: brand.surface.border,
    shadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
    shadowSm: "0 1px 2px rgba(15, 23, 42, 0.03)",
  };
}

function gateTone(
  state: ReturnType<typeof getPartnerProgramGate>["state"],
): "info" | "success" | "warn" | "danger" | "accent" {
  if (state === "ready") {
    return "success";
  }
  if (state === "blocked") {
    return "accent";
  }
  return "info";
}

export function PartnerBookingForm({
  brand,
  entry,
  eligibilityVerificationId,
  initialDraft,
  mapProviderState,
  referenceFallback = false,
}: {
  brand: PartnerBrandTemplate;
  entry: Pick<
    PartnerChannelEntryRecord,
    "businessDispatchSubtype" | "eligibilityMode" | "entrySlug" | "programCode"
  >;
  eligibilityVerificationId: string | null;
  initialDraft?: PartnerBookingDraftValues;
  /**
   * Forces the self-contained mock geo provider health for this funnel. Lets QA
   * drive the provider-outage manual-review path per-navigation; defaults to the
   * env-configured mode (healthy) when unset.
   */
  mapProviderState?: PartnerMapProviderMode;
  /**
   * Authority-outage reference funnel. The partner authority was unreachable, so
   * the tenant's real program is unknown: render program-neutral (no fabricated
   * program form, no program-specific gating), capture the trip location, and
   * route to manual review. Never claim a specific program we cannot verify.
   */
  referenceFallback?: boolean;
}) {
  const { locale, t } = useTranslation();
  const theme = useMemo(() => buildPartnerTheme(brand), [brand]);
  const [draft, setDraft] = useState<PartnerBookingDraftValues>(
    () => initialDraft ?? createDefaultPartnerBookingDraft(),
  );
  const [submitted, setSubmitted] = useState(false);
  const [pickupPin, setPickupPin] = useState<AddressPayload | null>(null);
  const [dropoffPin, setDropoffPin] = useState<AddressPayload | null>(null);
  const [pickupProviderState, setPickupProviderState] =
    useState<AddressProviderState>(INITIAL_PROVIDER_STATE);
  const [dropoffProviderState, setDropoffProviderState] =
    useState<AddressProviderState>(INITIAL_PROVIDER_STATE);
  const [serviceabilityPreview, setServiceabilityPreview] =
    useState<ServiceAreaEvaluationResult | null>(null);
  const [previewStatus, setPreviewStatus] =
    useState<PartnerServiceabilityPreviewStatus>("idle");

  const mapProvider = useMemo(
    () =>
      createConfiguredPartnerMapProvider(
        mapProviderState ??
          resolvePartnerMapProviderMode(
            process.env.NEXT_PUBLIC_ADDRESS_PICKER_PROVIDER_MODE,
          ),
      ),
    [mapProviderState],
  );

  const providerOutage = isPartnerProviderOutage(
    pickupProviderState,
    dropoffProviderState,
  );

  // Evaluate serviceability in-form (not inside the picker) once both stops
  // carry coordinates. A failed evaluation surfaces as `error`: the gate blocks
  // it as a backend serviceability failure (`serviceability_preview_unavailable`)
  // while the provider is healthy, or degrades to manual review only during a
  // genuine provider outage — never a silent dispatch. This mirrors the
  // concierge surface, so a healthy-provider preview failure is reachable rather
  // than stuck at `evaluating`.
  useEffect(() => {
    if (
      !hasPartnerAddressCoordinates(pickupPin) ||
      !hasPartnerAddressCoordinates(dropoffPin) ||
      !mapProvider.evaluateServiceArea
    ) {
      setServiceabilityPreview(null);
      setPreviewStatus("idle");
      return;
    }

    let cancelled = false;
    setPreviewStatus("evaluating");
    void mapProvider
      .evaluateServiceArea({
        serviceProductType: PARTNER_MAP_SERVICE_PRODUCT_TYPE,
        pickup: { lat: pickupPin.lat, lng: pickupPin.lng },
        dropoff: { lat: dropoffPin.lat, lng: dropoffPin.lng },
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setServiceabilityPreview(result);
        setPreviewStatus("ready");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setServiceabilityPreview(null);
        setPreviewStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    mapProvider,
    pickupPin?.lat,
    pickupPin?.lng,
    dropoffPin?.lat,
    dropoffPin?.lng,
  ]);

  const mapGate = getPartnerMapBookingGate({
    pickup: pickupPin,
    dropoff: dropoffPin,
    serviceability: serviceabilityPreview,
    previewStatus,
    providerOutage,
  });
  const mapBookingBannerCode = getPartnerMapBookingBannerCode(mapGate);
  const mapBookingBanner = partnerMapBannerCopy(mapBookingBannerCode);

  const errors = getPartnerBookingFieldErrors({
    draft,
    subtype: entry.businessDispatchSubtype,
    locale,
    referenceFallback,
  });
  const gate = getPartnerProgramGate({
    entry,
    draft,
    eligibilityVerificationId,
    locale,
    referenceFallback,
  });
  const ready =
    isPartnerBookingDraftReady({
      entry,
      draft,
      eligibilityVerificationId,
      locale,
      referenceFallback,
    }) && mapGate.canSubmit;

  function updateField(name: string, value: string) {
    setDraft((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handlePickupChange(change: AddressMapPickerChange) {
    setPickupPin(change.address);
    setPickupProviderState(change.providerState);
    // Only mirror a resolved address into the required text field. Never write
    // an empty string here: clearing the pin (e.g. when the operator hand-types
    // an address during a provider outage) re-fires this handler with a null
    // address and must not wipe what they just typed.
    if (change.address?.address) {
      updateField("pickupAddress", change.address.address);
    }
  }

  function handleDropoffChange(change: AddressMapPickerChange) {
    setDropoffPin(change.address);
    setDropoffProviderState(change.providerState);
    if (change.address?.address) {
      updateField("dropoffAddress", change.address.address);
    }
  }

  // Assisted-entry text address path. When the map provider is down the picker
  // disables search and only exposes raw lat/lng entry, so a typed address is
  // the only way an operator can reach the provider-outage manual-review flow
  // that the gate already allows. Typing clears the pin so a hand-edited
  // address is never falsely associated with stale coordinates.
  function handlePickupAddressText(value: string) {
    updateField("pickupAddress", value);
    setPickupPin(null);
  }

  function handleDropoffAddressText(value: string) {
    updateField("dropoffAddress", value);
    setDropoffPin(null);
  }

  function renderField(params: {
    name: keyof typeof draft;
    label: string;
    type?: string;
    placeholder?: string;
    hint?: string;
    options?: Array<{ value: string; label: string }>;
    textarea?: boolean;
    fullSpan?: boolean;
  }) {
    const error = errors[params.name];
    const commonStyle = params.fullSpan
      ? { ...fieldStyle, ...fullSpanStyle }
      : fieldStyle;

    return (
      <label key={params.name} style={commonStyle}>
        <span style={{ ...labelStyle, color: theme.text }}>{params.label}</span>
        {params.options ? (
          <select
            value={draft[params.name]}
            onChange={(event) => updateField(params.name, event.target.value)}
            style={inputStyle(theme)}
          >
            <option value="" />
            {params.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : params.textarea ? (
          <textarea
            value={draft[params.name]}
            onChange={(event) => updateField(params.name, event.target.value)}
            style={textareaStyle(theme)}
            placeholder={params.placeholder}
          />
        ) : (
          <input
            type={params.type ?? "text"}
            value={draft[params.name]}
            onChange={(event) => updateField(params.name, event.target.value)}
            style={inputStyle(theme)}
            placeholder={params.placeholder}
          />
        )}
        {params.hint ? (
          <span style={{ ...hintStyle, color: theme.textMuted }}>
            {params.hint}
          </span>
        ) : null}
        {error ? <span style={errorStyle}>{error}</span> : null}
      </label>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  // During an authority outage the tenant's program is unknown, so surface a
  // neutral reference label/coverage instead of a fabricated program name.
  const programLabel = referenceFallback
    ? t("book.program.reference")
    : getPartnerProgramLabel(entry.businessDispatchSubtype, locale);
  const coverage = referenceFallback
    ? t("book.coverage.reference")
    : getPartnerProgramCoverage(entry.businessDispatchSubtype, locale);
  const travelRosterPreview = draft.rosterPassengers
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
  const travelSeatCount = draft.groupSize || "—";
  const travelBatchPreview =
    entry.businessDispatchSubtype === "travel_agency_transfer"
      ? [
          {
            title: t("book.travel.batch.primary"),
            time: draft.reservationWindowStart || "—",
            vehicle:
              Number.parseInt(draft.groupSize, 10) > 8
                ? t("book.travel.vehicle.mediumBus", { count: 1 })
                : t("book.travel.vehicle.businessCar", { count: 2 }),
            seats: t("book.travel.seats.fraction", {
              used: travelSeatCount,
              total: travelSeatCount,
            }),
            stop: `${
              draft.meetingPoint ||
              draft.pickupAddress ||
              t("book.travel.stop.meetingPending")
            } → ${draft.dropoffAddress || t("book.travel.stop.dropoffPending")}`,
          },
          {
            title: t("book.travel.batch.secondary"),
            time: draft.reservationWindowEnd || "—",
            vehicle: draft.luggageCount
              ? t("book.travel.vehicle.businessCar", {
                  count: draft.luggageCount,
                })
              : t("book.travel.vehicle.businessCar", { count: 2 }),
            seats: t("book.travel.seats.total", { count: travelSeatCount }),
            stop: `${draft.dropoffAddress || t("book.travel.stop.hotelPending")} → ${
              draft.notes || t("book.travel.stop.followupShuttle")
            }`,
          },
        ]
      : [];

  return (
    <form style={pageStyle} onSubmit={handleSubmit}>
      <CanvasPageHeader
        theme={theme}
        title={t("book.title")}
        subtitle={t("book.subtitle")}
        sticky={false}
        style={{ padding: 0, background: "transparent" }}
      />

      {referenceFallback ? (
        <CanvasBanner
          theme={theme}
          tone="warn"
          title={t("book.reference.degradedTitle")}
          body={t("book.reference.degradedBody")}
        />
      ) : null}

      <CanvasCard theme={theme}>
        <div style={actionRowStyle}>
          <CanvasPill theme={theme} tone="accent">
            {t("book.program.badge")} · {programLabel}
          </CanvasPill>
          {!referenceFallback ? (
            <CanvasPill theme={theme} tone={gateTone(gate.state)}>
              {t("book.eligibility.badge")} ·{" "}
              {gate.state === "ready"
                ? t("book.eligibility.ready")
                : gate.state === "blocked"
                  ? t("book.eligibility.blocked")
                  : t("book.eligibility.inline")}
            </CanvasPill>
          ) : null}
          {!referenceFallback && eligibilityVerificationId ? (
            <CanvasPill theme={theme} tone="neutral">
              {t("book.eligibility.referenceId")} · {eligibilityVerificationId}
            </CanvasPill>
          ) : null}
        </div>
        <div style={{ ...gridStyle, marginTop: 14 }}>
          <div style={fieldStyle}>
            <span style={{ ...labelStyle, color: theme.textMuted }}>
              {t("book.summary.coverage")}
            </span>
            <strong style={{ color: theme.text }}>{coverage}</strong>
          </div>
          <div style={fieldStyle}>
            <span style={{ ...labelStyle, color: theme.textMuted }}>
              {t("book.summary.window")}
            </span>
            <strong style={{ color: theme.text }}>
              {draft.reservationWindowStart} → {draft.reservationWindowEnd}
            </strong>
          </div>
          {!referenceFallback &&
          entry.businessDispatchSubtype === "credit_card_airport_transfer" ? (
            <div style={fieldStyle}>
              <span style={{ ...labelStyle, color: theme.textMuted }}>
                {t("book.summary.direction")}
              </span>
              <strong style={{ color: theme.text }}>
                {draft.direction
                  ? t(
                      draft.direction === "pickup"
                        ? "field.direction.pickup"
                        : "field.direction.dropoff",
                    )
                  : "—"}
              </strong>
            </div>
          ) : null}
        </div>
      </CanvasCard>

      {!referenceFallback ? (
        <CanvasBanner
          theme={theme}
          tone={gateTone(gate.state)}
          title={t("book.eligibility.badge")}
          body={gate.message}
          actions={
            gate.actionHref ? (
              <Link
                href={gate.actionHref}
                style={{
                  color: theme.accent,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {t("book.eligibility.airport.action")}
              </Link>
            ) : null
          }
        />
      ) : null}

      {!referenceFallback &&
      entry.businessDispatchSubtype === "travel_agency_transfer" ? (
        <CanvasCard theme={theme} title={t("book.travel.cardTitle")}>
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gap: 10,
                padding: 14,
                borderRadius: 16,
                background: theme.accentBg,
                border: `1px solid ${theme.accentBorder}`,
              }}
            >
              <div style={actionRowStyle}>
                <CanvasPill theme={theme} tone="accent">
                  {t("book.travel.badge")}
                </CanvasPill>
                <strong style={{ color: theme.text }}>
                  {t("book.travel.seats.total", { count: travelSeatCount })}
                </strong>
              </div>
              <div style={fieldStyle}>
                <span style={{ ...labelStyle, color: theme.textMuted }}>
                  {t("book.travel.summary.groupCode")}
                </span>
                <strong style={{ color: theme.text }}>
                  {draft.groupCode || "—"}
                </strong>
              </div>
              <div style={fieldStyle}>
                <span style={{ ...labelStyle, color: theme.textMuted }}>
                  {t("book.travel.summary.itinerary")}
                </span>
                <strong style={{ color: theme.text }}>
                  {draft.itineraryLink || "—"}
                </strong>
              </div>
              <div style={fieldStyle}>
                <span style={{ ...labelStyle, color: theme.textMuted }}>
                  {t("book.travel.summary.transferLegs")}
                </span>
                <strong style={{ color: theme.text }}>
                  {t("book.travel.summary.transferLegsValue")}
                </strong>
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ color: theme.text }}>
                {t("book.travel.roster.title")}
              </strong>
              {travelRosterPreview.length > 0 ? (
                travelRosterPreview.map((item) => (
                  <div
                    key={item}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: `1px solid ${theme.border}`,
                      background: theme.surface,
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: theme.accentBg,
                        color: theme.accentHi,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {item.slice(0, 1)}
                    </div>
                    <span style={{ color: theme.text, flex: 1 }}>{item}</span>
                    <CanvasPill theme={theme} tone="neutral">
                      {t("book.travel.roster.tag")}
                    </CanvasPill>
                  </div>
                ))
              ) : (
                <span style={{ color: theme.textMuted }}>
                  {t("book.travel.roster.empty")}
                </span>
              )}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ color: theme.text }}>
                {t("book.travel.batch.title")}
              </strong>
              {travelBatchPreview.map((batch) => (
                <div
                  key={batch.title}
                  style={{
                    display: "grid",
                    gap: 6,
                    padding: "12px 14px",
                    borderRadius: 14,
                    border: `1px solid ${theme.border}`,
                    background: theme.surface,
                  }}
                >
                  <div style={actionRowStyle}>
                    <strong style={{ color: theme.text, flex: 1 }}>
                      {batch.title}
                    </strong>
                    <CanvasPill theme={theme} tone="accent">
                      {batch.time}
                    </CanvasPill>
                  </div>
                  <span style={{ color: theme.textMuted }}>
                    {t("book.travel.batch.vehicle")} · {batch.vehicle}
                  </span>
                  <span style={{ color: theme.textMuted }}>
                    {t("book.travel.batch.seats")} · {batch.seats}
                  </span>
                  <span style={{ color: theme.text }}>{batch.stop}</span>
                </div>
              ))}
            </div>
          </div>
        </CanvasCard>
      ) : null}

      <CanvasCard theme={theme} title={t("book.section.trip")}>
        <div style={{ display: "grid", gap: 14 }}>
          <label style={{ ...fieldStyle, ...fullSpanStyle }}>
            <span style={{ ...labelStyle, color: theme.text }}>
              {t("field.pickupAddress")}
            </span>
            <textarea
              name="pickupAddress"
              value={draft.pickupAddress}
              onChange={(event) => handlePickupAddressText(event.target.value)}
              style={textareaStyle(theme)}
            />
            <span style={{ ...hintStyle, color: theme.textMuted }}>
              {t("hint.assistedAddress")}
            </span>
            {errors.pickupAddress ? (
              <span style={errorStyle}>{errors.pickupAddress}</span>
            ) : null}
          </label>
          <div
            data-address-map-picker="partner-pickup-map"
            data-provider-status={pickupProviderState.reasonCode}
          >
            <AddressMapPicker
              id="partner-pickup-map"
              provider={mapProvider}
              surface="partner_booking"
              theme={theme}
              locale={locale === "zh" ? "zh-TW" : "en-US"}
              value={pickupPin}
              onChange={handlePickupChange}
              title={t("field.pickupAddress")}
            />
          </div>
          <label style={{ ...fieldStyle, ...fullSpanStyle }}>
            <span style={{ ...labelStyle, color: theme.text }}>
              {t("field.dropoffAddress")}
            </span>
            <textarea
              name="dropoffAddress"
              value={draft.dropoffAddress}
              onChange={(event) => handleDropoffAddressText(event.target.value)}
              style={textareaStyle(theme)}
            />
            <span style={{ ...hintStyle, color: theme.textMuted }}>
              {t("hint.assistedAddress")}
            </span>
            {errors.dropoffAddress ? (
              <span style={errorStyle}>{errors.dropoffAddress}</span>
            ) : null}
          </label>
          <div
            data-address-map-picker="partner-dropoff-map"
            data-provider-status={dropoffProviderState.reasonCode}
          >
            <AddressMapPicker
              id="partner-dropoff-map"
              provider={mapProvider}
              surface="partner_booking"
              theme={theme}
              locale={locale === "zh" ? "zh-TW" : "en-US"}
              value={dropoffPin}
              onChange={handleDropoffChange}
              title={t("field.dropoffAddress")}
            />
          </div>
          <div data-partner-map-booking-gate={mapBookingBannerCode}>
            <CanvasBanner
              theme={theme}
              tone={mapBookingBanner.tone}
              title={t(mapBookingBanner.titleKey)}
              body={t(mapBookingBanner.bodyKey)}
            />
          </div>
          <div style={gridStyle}>
            {renderField({
              name: "reservationWindowStart",
              label: t("field.reservationWindowStart"),
              type: "datetime-local",
              hint: t("hint.policyWindow"),
            })}
            {renderField({
              name: "reservationWindowEnd",
              label: t("field.reservationWindowEnd"),
              type: "datetime-local",
            })}
          </div>
        </div>
      </CanvasCard>

      <CanvasCard theme={theme} title={t("book.section.passenger")}>
        <div style={gridStyle}>
          {renderField({
            name: "passengerName",
            label: t("field.passengerName"),
          })}
          {renderField({
            name: "passengerPhone",
            label: t("field.passengerPhone"),
          })}
          {renderField({
            name: "notes",
            label: t("field.notes"),
            textarea: true,
            fullSpan: true,
          })}
        </div>
      </CanvasCard>

      {!referenceFallback ? (
        <CanvasCard theme={theme} title={t("book.section.program")}>
          <div style={gridStyle}>
            {entry.businessDispatchSubtype === "credit_card_airport_transfer" ? (
            <>
              {renderField({
                name: "cardTier",
                label: t("field.cardTier"),
              })}
              {renderField({
                name: "flightNo",
                label: t("field.flightNo"),
                hint: t("hint.flightNo"),
              })}
              {renderField({
                name: "terminal",
                label: t("field.terminal"),
              })}
              {renderField({
                name: "direction",
                label: t("field.direction"),
                options: [
                  {
                    value: "pickup",
                    label: t("field.direction.pickup"),
                  },
                  {
                    value: "dropoff",
                    label: t("field.direction.dropoff"),
                  },
                ],
              })}
            </>
          ) : null}

          {entry.businessDispatchSubtype === "insurance_replacement_vehicle" ? (
            <>
              {renderField({
                name: "claimNumber",
                label: t("field.claimNumber"),
              })}
              {renderField({
                name: "policyNumber",
                label: t("field.policyNumber"),
              })}
              {renderField({
                name: "claimReference",
                label: t("field.claimReference"),
              })}
              {renderField({
                name: "claimantName",
                label: t("field.claimantName"),
              })}
              {renderField({
                name: "replacementStart",
                label: t("field.replacementStart"),
                type: "datetime-local",
                hint: t("hint.replacementPeriod"),
              })}
              {renderField({
                name: "replacementEnd",
                label: t("field.replacementEnd"),
                type: "datetime-local",
              })}
              {renderField({
                name: "replacementVehicleClass",
                label: t("field.replacementVehicleClass"),
                fullSpan: true,
              })}
              {renderField({
                name: "caseHandler",
                label: t("field.caseHandler"),
                fullSpan: true,
              })}
            </>
          ) : null}

          {entry.businessDispatchSubtype === "travel_agency_transfer" ? (
            <>
              {renderField({
                name: "groupCode",
                label: t("field.groupCode"),
              })}
              {renderField({
                name: "groupSize",
                label: t("field.groupSize"),
                type: "number",
                hint: t("hint.groupSize"),
              })}
              {renderField({
                name: "itineraryLink",
                label: t("field.itineraryLink"),
                type: "url",
                hint: t("hint.itineraryLink"),
              })}
              {renderField({
                name: "luggageCount",
                label: t("field.luggageCount"),
                type: "number",
              })}
              {renderField({
                name: "meetingPoint",
                label: t("field.meetingPoint"),
                fullSpan: true,
              })}
              {renderField({
                name: "rosterPassengers",
                label: t("field.rosterPassengers"),
                hint: t("hint.rosterPassengers"),
                textarea: true,
                fullSpan: true,
              })}
            </>
            ) : null}
          </div>
        </CanvasCard>
      ) : null}

      <CanvasCard theme={theme} title={t("book.section.review")}>
        <div style={{ display: "grid", gap: 12 }}>
          <span style={{ color: theme.textMuted }}>
            {ready ? t("book.ready") : t("book.notReady")}
          </span>
          <div style={actionRowStyle}>
            <button
              type="submit"
              style={submitButtonStyle(theme, !ready)}
              disabled={!ready}
            >
              {t("book.submit")}
            </button>
            {entry.programCode ? (
              <span style={{ color: theme.textMuted }}>
                {t("book.program.badge")} · {entry.programCode}
              </span>
            ) : null}
          </div>
          {submitted && ready ? (
            <CanvasBanner
              theme={theme}
              tone="success"
              title={t("book.success")}
              body={t("book.success.detail")}
            />
          ) : null}
        </div>
      </CanvasCard>
    </form>
  );
}
