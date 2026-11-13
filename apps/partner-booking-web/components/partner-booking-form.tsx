"use client";

import Link from "next/link";
import {
  startTransition,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createIdempotencyKey } from "@drts/api-client";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import {
  AddressMapPairPicker,
  AddressMapPicker,
  buildAddressPickerLabels,
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
  createConfiguredMockAddressProvider,
  type CanvasTheme,
  type AddressMapPairChange,
  type AddressProviderMode,
  type AddressProviderHealth,
  type AddressPayload,
} from "@drts/ui-web";
import {
  applyPartnerTravelPlanSelection,
  createPartnerTravelPlanExample,
  getPartnerTravelPlanSelection,
  createPartnerAirportMapProvider,
  type PartnerAirportMapAction,
  formatDateTimeLocalInputValue,
  partnerBookingReadHref,
  getPartnerBookingFieldErrors,
  getPartnerMapSubmitGate,
  getPartnerProgramCoverage,
  getPartnerProgramGate,
  getPartnerProgramLabel,
  isPartnerBookingDraftReady,
  type PartnerBookingDraftValues,
  type PartnerBookingActionResult,
  type PartnerBookingSubmission,
} from "@/lib/partner-booking-form";
import { useTranslation } from "@/lib/i18n";

const baseTheme = buildCanvasTheme({
  surface: "partner",
  density: "compact",
});

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
  submitBookingAction,
  partnerUserRef,
  readMapAction,
}: {
  brand: PartnerBrandTemplate;
  entry: Pick<
    PartnerChannelEntryRecord,
    "businessDispatchSubtype" | "eligibilityMode" | "entrySlug" | "programCode"
  >;
  eligibilityVerificationId: string | null;
  initialDraft: PartnerBookingDraftValues;
  partnerUserRef?: string | null;
  readMapAction?: PartnerAirportMapAction;
  submitBookingAction?: (
    submission: PartnerBookingSubmission,
  ) => Promise<PartnerBookingActionResult>;
}) {
  const { locale, t } = useTranslation();
  const fieldIdPrefix = useId();
  const theme = useMemo(() => buildPartnerTheme(brand), [brand]);
  const [draft, setDraft] = useState(initialDraft);
  const [travelPlanInput, setTravelPlanInput] = useState(
    initialDraft.travelPlanDocument,
  );
  const [travelPlanError, setTravelPlanError] = useState(false);
  const [travelPlanRevision, setTravelPlanRevision] = useState(0);
  const travelSelection =
    entry.businessDispatchSubtype === "travel_agency_transfer"
      ? getPartnerTravelPlanSelection(draft)
      : null;
  // The BFF sends offset-bearing defaults. Localize only those on hydration;
  // an already edited datetime-local value must retain the browser's local time.
  useEffect(() => {
    if (!submitBookingAction) return;
    const localInput = (value: string) =>
      /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
        ? formatDateTimeLocalInputValue(new Date(value))
        : value;
    setDraft((current) => ({
      ...current,
      reservationWindowStart: localInput(current.reservationWindowStart),
      reservationWindowEnd: localInput(current.reservationWindowEnd),
      replacementStart: localInput(current.replacementStart),
      replacementEnd: localInput(current.replacementEnd),
    }));
  }, [submitBookingAction]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] =
    useState<PartnerBookingActionResult | null>(null);
  const pendingSubmission = useRef<{
    signature: string;
    key: string;
    eligibilityVerificationId?: string;
  } | null>(null);
  const [mapSelection, setMapSelection] = useState<AddressMapPairChange>({
    pickup: null,
    dropoff: null,
    serviceability: null,
    providerState: {
      available: true,
      degraded: false,
      reasonCode: "available",
    },
    bothDispatchReady: false,
  });
  const [routeStops, setRouteStops] = useState<
    Array<{ id: number; address: AddressPayload | null }>
  >([]);
  const nextRouteStopId = useRef(0);
  const mapProviderMode =
    (process.env.NEXT_PUBLIC_ADDRESS_PICKER_PROVIDER_MODE as
      | AddressProviderMode
      | undefined) ?? "healthy";
  const canonicalAirportMap =
    entry.businessDispatchSubtype === "credit_card_airport_transfer" &&
    Boolean(submitBookingAction);
  const [airportMapHealth, setAirportMapHealth] =
    useState<AddressProviderHealth | null>(null);
  const mapProvider = useMemo(
    () =>
      canonicalAirportMap
        ? createPartnerAirportMapProvider(readMapAction, draft.direction)
        : createConfiguredMockAddressProvider(mapProviderMode),
    [canonicalAirportMap, readMapAction, draft.direction, mapProviderMode],
  );
  useEffect(() => {
    if (!canonicalAirportMap) return;
    let cancelled = false;
    mapProvider
      .getHealth?.()
      .then((health) => {
        if (!cancelled) setAirportMapHealth(health);
      })
      .catch(() => {
        if (!cancelled)
          setAirportMapHealth({
            mode: "disabled",
            status: "unhealthy",
            failClosed: true,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [canonicalAirportMap, mapProvider]);
  const mapLabels = useMemo(() => buildAddressPickerLabels(locale), [locale]);

  const errors = getPartnerBookingFieldErrors({
    draft,
    subtype: entry.businessDispatchSubtype,
    locale,
  });
  const gate = getPartnerProgramGate({
    entry,
    draft,
    eligibilityVerificationId,
    locale,
  });
  const ready = isPartnerBookingDraftReady({
    entry,
    draft,
    eligibilityVerificationId,
    locale,
  });
  const mapGate = getPartnerMapSubmitGate({
    draft,
    pickup: mapSelection.pickup,
    dropoff: mapSelection.dropoff,
    serviceability: mapSelection.serviceability,
    providerState: mapSelection.providerState,
    routeStops: routeStops.map((stop) => stop.address),
  });
  const airportPreviewPending =
    canonicalAirportMap &&
    mapSelection.bothDispatchReady &&
    mapSelection.providerState.available &&
    !mapSelection.serviceability;
  const pickupTextFallbackHint =
    !mapSelection.providerState.available &&
    mapGate.code === "dispatch_manual_review_required"
      ? t("book.map.textFallbackHint")
      : null;
  const dropoffTextFallbackHint =
    !mapSelection.providerState.available &&
    mapGate.code === "dispatch_manual_review_required"
      ? t("book.map.outageFallback")
      : null;

  function updateField(name: string, value: string) {
    setBookingResult(null);
    if (canonicalAirportMap && name === "direction")
      setMapSelection((current) => ({ ...current, serviceability: null }));
    setDraft((current) => ({
      ...current,
      [name]: value,
    }));
  }

  const sourceMappedFields = new Set([
    "groupCode",
    "groupSize",
    "itineraryLink",
    "guideName",
    "guidePhone",
    "meetingPoint",
    "rosterPassengers",
    "luggageCount",
    "viaStops",
    "signage",
  ]);
  function loadTravelPlan(
    document: string,
    selection?: {
      legId: string;
      batchId?: string;
      vehicleId?: string;
    },
  ) {
    const selectedDraft = applyPartnerTravelPlanSelection(
      draft,
      document,
      selection,
    );
    setTravelPlanError(!selectedDraft);
    if (!selectedDraft) return;
    setBookingResult(null);
    setDraft(selectedDraft);
    setRouteStops([]);
    setTravelPlanRevision((current) => current + 1);
    setMapSelection((current) => ({
      ...current,
      pickup: null,
      dropoff: null,
      serviceability: null,
      bothDispatchReady: false,
    }));
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
    const readOnly = !!travelSelection && sourceMappedFields.has(params.name);
    const error = errors[params.name];
    const fieldId = `${fieldIdPrefix}-${params.name}`;
    const labelId = `${fieldId}-label`;
    const hintId = `${fieldId}-hint`;
    const errorId = `${fieldId}-error`;
    const descriptionIds =
      [params.hint ? hintId : null, error ? errorId : null]
        .filter(Boolean)
        .join(" ") || undefined;
    const commonStyle = params.fullSpan
      ? { ...fieldStyle, ...fullSpanStyle }
      : fieldStyle;

    return (
      <label key={params.name} htmlFor={fieldId} style={commonStyle}>
        <span id={labelId} style={{ ...labelStyle, color: theme.text }}>
          {params.label}
        </span>
        {params.options ? (
          <select
            id={fieldId}
            aria-labelledby={labelId}
            aria-describedby={descriptionIds}
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
            readOnly={readOnly}
            id={fieldId}
            aria-labelledby={labelId}
            aria-describedby={descriptionIds}
            value={draft[params.name]}
            onChange={(event) => updateField(params.name, event.target.value)}
            style={textareaStyle(theme)}
            placeholder={params.placeholder}
          />
        ) : (
          <input
            id={fieldId}
            aria-labelledby={labelId}
            aria-describedby={descriptionIds}
            type={params.type ?? "text"}
            readOnly={readOnly}
            {...(travelSelection && params.type === "datetime-local"
              ? { step: "0.001" }
              : {})}
            value={draft[params.name]}
            onChange={(event) => updateField(params.name, event.target.value)}
            style={inputStyle(theme)}
            placeholder={params.placeholder}
          />
        )}
        {params.hint ? (
          <span id={hintId} style={{ ...hintStyle, color: theme.textMuted }}>
            {params.hint}
          </span>
        ) : null}
        {error ? (
          <span id={errorId} style={errorStyle}>
            {error}
          </span>
        ) : null}
      </label>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitBookingAction) {
      setSubmitted(true);
      return;
    }
    if (!ready || mapGate.blocking || airportPreviewPending || submitting)
      return;
    const payload = {
      draft: {
        ...draft,
        // datetime-local has no offset. Convert in the browser, not in a UTC BFF.
        reservationWindowStart: new Date(
          draft.reservationWindowStart,
        ).toISOString(),
        reservationWindowEnd: new Date(
          draft.reservationWindowEnd,
        ).toISOString(),
        ...(entry.businessDispatchSubtype === "insurance_replacement_vehicle"
          ? {
              replacementStart: new Date(draft.replacementStart).toISOString(),
              replacementEnd: new Date(draft.replacementEnd).toISOString(),
            }
          : {}),
      },
      pickup: mapSelection.pickup,
      dropoff: mapSelection.dropoff,
      ...(entry.businessDispatchSubtype === "travel_agency_transfer"
        ? { routeStops: routeStops.map((stop) => stop.address) }
        : {}),
      serviceability: mapSelection.serviceability,
      providerState: mapSelection.providerState,
    };
    // A service-area preview may finish after submission. Only command changes
    // should replace the key used to retry a booking whose readback failed.
    const signature = JSON.stringify({
      draft: payload.draft,
      pickup: payload.pickup,
      dropoff: payload.dropoff,
      routeStops: payload.routeStops,
      mapFallbackReview:
        mapGate.code === "dispatch_manual_review_required"
          ? {
              reasonCode: "dispatch_manual_review_required",
              providerAvailable: payload.providerState.available,
              providerDegraded: payload.providerState.degraded,
              providerReasonCode: payload.providerState.reasonCode,
            }
          : null,
    });
    const previous = pendingSubmission.current;
    const pending: NonNullable<typeof pendingSubmission.current> =
      previous && previous.signature === signature
        ? previous
        : { signature, key: createIdempotencyKey("partner-booking") };
    pendingSubmission.current = pending;
    const idempotencyKey = pending.key;
    setSubmitting(true);
    setBookingResult(null);
    startTransition(async () => {
      try {
        const result = await submitBookingAction({
          ...payload,
          idempotencyKey,
          ...(pending.eligibilityVerificationId
            ? { eligibilityVerificationId: pending.eligibilityVerificationId }
            : {}),
        });
        const verificationId = result.ok
          ? result.confirmation.eligibilityVerificationId
          : result.eligibilityVerificationId;
        if (verificationId) pending.eligibilityVerificationId = verificationId;
        setBookingResult(result);
      } catch {
        setBookingResult({
          ok: false,
          errorCode: "PARTNER_BOOKING_SUBMIT_FAILED",
          errorMessage: t("book.create.failed"),
        });
      } finally {
        setSubmitting(false);
      }
    });
  }

  const programLabel = getPartnerProgramLabel(
    entry.businessDispatchSubtype,
    locale,
  );
  const coverage = getPartnerProgramCoverage(
    entry.businessDispatchSubtype,
    locale,
  );
  const travelRosterPreview = draft.rosterPassengers
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const travelSeatCount = draft.groupSize || "—";

  return (
    <form style={pageStyle} onSubmit={handleSubmit}>
      <CanvasPageHeader
        theme={theme}
        title={t("book.title")}
        subtitle={t("book.subtitle")}
        sticky={false}
        style={{ padding: 0, background: "transparent" }}
      />

      <CanvasCard theme={theme}>
        <div style={actionRowStyle}>
          <CanvasPill theme={theme} tone="accent">
            {t("book.program.badge")} · {programLabel}
          </CanvasPill>
          <CanvasPill theme={theme} tone={gateTone(gate.state)}>
            {t("book.eligibility.badge")} ·{" "}
            {gate.state === "ready"
              ? t("book.eligibility.ready")
              : gate.state === "blocked"
                ? t("book.eligibility.blocked")
                : t("book.eligibility.inline")}
          </CanvasPill>
          {eligibilityVerificationId ? (
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
          {entry.businessDispatchSubtype === "credit_card_airport_transfer" ? (
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

      <CanvasBanner
        theme={theme}
        tone={gateTone(gate.state)}
        title={t("book.eligibility.badge")}
        body={gate.message}
        actions={
          gate.actionHref ? (
            <Link
              href={
                partnerUserRef
                  ? gate.actionHref +
                    "?" +
                    new URLSearchParams({ partnerUserRef }).toString()
                  : gate.actionHref
              }
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

      {entry.businessDispatchSubtype === "travel_agency_transfer" ? (
        <CanvasCard theme={theme} title={t("book.travel.cardTitle")}>
          <div style={{ display: "grid", gap: 12 }}>
            <p>{t("book.travel.plan.scope")}</p>
            <aside
              data-testid="partner-tour-fee-arrangement"
              aria-label={t("book.travel.fee.title")}
            >
              <strong>{t("book.travel.plan.included")}</strong>
              <p>{t("book.travel.fee.scope")}</p>
            </aside>
            <div style={actionRowStyle}>
              <button
                type="button"
                onClick={() => {
                  const document = createPartnerTravelPlanExample(draft);
                  setTravelPlanInput(document);
                  loadTravelPlan(document);
                }}
              >
                {t("book.travel.plan.example")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBookingResult(null);
                  setTravelPlanError(false);
                  setRouteStops([]);
                  setDraft((current) => ({
                    ...current,
                    travelPlanDocument: "",
                    travelPlanLegId: "",
                    travelPlanBatchId: "",
                    travelPlanVehicleId: "",
                  }));
                }}
              >
                {t("book.travel.plan.clear")}
              </button>
            </div>
            <details>
              <summary>{t("book.travel.plan.import")}</summary>
              <label style={fieldStyle}>
                <span style={labelStyle}>{t("book.travel.plan.document")}</span>
                <textarea
                  value={travelPlanInput}
                  onChange={(event) => setTravelPlanInput(event.target.value)}
                  style={textareaStyle(theme)}
                />
              </label>
              <button
                type="button"
                onClick={() => loadTravelPlan(travelPlanInput)}
              >
                {t("book.travel.plan.apply")}
              </button>
            </details>
            {travelPlanError ? (
              <p role="alert">{t("book.travel.plan.invalid")}</p>
            ) : null}
            {travelSelection ? (
              <section aria-label={t("book.travel.plan.selection")}>
                <strong>
                  {t(
                    "book.travel.plan.source." +
                      travelSelection.plan.source.kind,
                  )}
                </strong>
                <p>
                  {travelSelection.plan.source.label} ·{" "}
                  {travelSelection.plan.source.revision}
                </p>
                <div style={gridStyle}>
                  <label style={fieldStyle}>
                    <span>{t("book.travel.plan.leg")}</span>
                    <select
                      value={travelSelection.leg.id}
                      onChange={(event) =>
                        loadTravelPlan(draft.travelPlanDocument, {
                          legId: event.target.value,
                        })
                      }
                    >
                      {travelSelection.plan.legs.map((leg, index) => (
                        <option key={leg.id} value={leg.id}>
                          {index + 1} / {travelSelection.plan.legs.length} ·{" "}
                          {leg.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    <span>{t("book.travel.plan.batch")}</span>
                    <select
                      value={travelSelection.batch.id}
                      onChange={(event) =>
                        loadTravelPlan(draft.travelPlanDocument, {
                          legId: travelSelection.leg.id,
                          batchId: event.target.value,
                        })
                      }
                    >
                      {travelSelection.leg.batches.map((batch, index) => (
                        <option key={batch.id} value={batch.id}>
                          {index + 1} / {travelSelection.leg.batches.length} ·{" "}
                          {batch.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    <span>{t("book.travel.plan.vehicle")}</span>
                    <select
                      value={travelSelection.vehicle.id}
                      onChange={(event) =>
                        loadTravelPlan(draft.travelPlanDocument, {
                          legId: travelSelection.leg.id,
                          batchId: travelSelection.batch.id,
                          vehicleId: event.target.value,
                        })
                      }
                    >
                      {travelSelection.batch.vehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <dl>
                  <div>
                    <dt>{t("book.travel.summary.groupCode")}</dt>
                    <dd>{draft.groupCode}</dd>
                  </div>
                  <div>
                    <dt>{t("book.travel.summary.itinerary")}</dt>
                    <dd>{draft.itineraryLink}</dd>
                  </div>
                  <div>
                    <dt>{t("book.travel.plan.route")}</dt>
                    <dd>
                      {travelSelection.leg.pickupAddress} →{" "}
                      {travelSelection.leg.dropoffAddress}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("book.travel.plan.window")}</dt>
                    <dd>
                      {travelSelection.batch.windowStart} →{" "}
                      {travelSelection.batch.windowEnd}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("book.travel.plan.seats")}</dt>
                    <dd>
                      {travelSelection.vehicle.rosterPassengers.length} /{" "}
                      {travelSelection.vehicle.seats}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("book.travel.plan.vehicles")}</dt>
                    <dd>
                      {travelSelection.batch.vehicles
                        .map((vehicle) => vehicle.label)
                        .join(" · ")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("book.travel.plan.fare")}</dt>
                    <dd>{t("book.travel.plan.included")}</dd>
                  </div>
                </dl>
                <p>{t("book.travel.plan.singleOrder")}</p>
              </section>
            ) : (
              <p>{t("book.travel.plan.absent")}</p>
            )}
            <strong>
              {t("book.travel.roster.title")} ·{" "}
              {t("book.travel.seats.total", { count: travelSeatCount })}
            </strong>
            {travelRosterPreview.length ? (
              <ul>
                {travelRosterPreview.map((name, index) => (
                  <li key={index}>{name}</li>
                ))}
              </ul>
            ) : (
              <p>{t("book.travel.roster.empty")}</p>
            )}
          </div>
        </CanvasCard>
      ) : null}

      <CanvasCard theme={theme} title={t("book.section.trip")}>
        <div style={gridStyle}>
          <div style={{ ...fieldStyle, ...fullSpanStyle }}>
            <span style={{ ...labelStyle, color: theme.text }}>
              {t("book.map.label")}
            </span>
            {canonicalAirportMap && airportMapHealth?.mode === "mock" ? (
              <CanvasBanner
                theme={theme}
                tone="info"
                title={t("book.map.simulated")}
              />
            ) : null}
            <AddressMapPairPicker
              key={travelSelection ? `plan-${travelPlanRevision}` : "manual"}
              actorId={entry.entrySlug}
              requireCompleteRoute={canonicalAirportMap}
              {...(canonicalAirportMap
                ? { providerHealth: airportMapHealth }
                : {})}
              bounds={{
                minLat: 24.9,
                maxLat: 25.2,
                minLng: canonicalAirportMap ? 121.1 : 121.4,
                maxLng: 121.7,
              }}
              dropoffTitle={t("field.dropoffAddress")}
              onChange={(change) => {
                setBookingResult(null);
                setMapSelection(change);
                setDraft((current) => ({
                  ...current,
                  pickupAddress: change.pickup?.address ?? "",
                  dropoffAddress: change.dropoff?.address ?? "",
                }));
              }}
              pickupTitle={t("field.pickupAddress")}
              provider={mapProvider}
              {...(canonicalAirportMap && !draft.direction
                ? {}
                : { serviceProductType: entry.businessDispatchSubtype })}
              surface="partner_booking"
              theme={theme}
              {...(mapLabels ? { labels: mapLabels } : {})}
            />
            <span style={{ ...hintStyle, color: theme.textMuted }}>
              {mapSelection.providerState.available
                ? mapGate.code === "dispatch_manual_review_required"
                  ? t("book.map.manualReview")
                  : t("book.map.hint")
                : t("book.map.textFallbackHint")}
            </span>
            {!mapSelection.providerState.available ? (
              <CanvasBanner
                theme={theme}
                tone="warn"
                title={t("book.map.manualReviewTitle")}
                body={t("book.map.outageFallback")}
              />
            ) : null}
          </div>
          {renderField({
            name: "pickupAddress",
            label: t("field.pickupAddress"),
            fullSpan: true,
            ...(pickupTextFallbackHint ? { hint: pickupTextFallbackHint } : {}),
          })}
          {renderField({
            name: "dropoffAddress",
            label: t("field.dropoffAddress"),
            fullSpan: true,
            ...(dropoffTextFallbackHint
              ? { hint: dropoffTextFallbackHint }
              : {}),
          })}
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
                name: "luggageCount",
                label: t("field.luggageCount"),
                type: "number",
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
              {renderField({ name: "guideName", label: t("field.guideName") })}
              {renderField({
                name: "guidePhone",
                label: t("field.guidePhone"),
                type: "tel",
              })}
              {renderField({
                name: "viaStops",
                label: t("field.viaStops"),
                textarea: true,
                fullSpan: true,
                hint: t("book.travel.plan.stopsScope"),
              })}
              {renderField({
                name: "signage",
                label: t("field.signage"),
                fullSpan: true,
              })}
              <div style={{ ...fieldStyle, ...fullSpanStyle }}>
                <strong>{t("field.routeStops")}</strong>
                <p style={hintStyle}>{t("book.travel.stops.hint")}</p>
                {routeStops.map((stop, index) => (
                  <section
                    key={stop.id}
                    aria-label={`${t("field.routeStops")} ${index + 1}`}
                  >
                    <AddressMapPicker
                      provider={mapProvider}
                      surface="partner_booking"
                      theme={theme}
                      title={`${t("field.routeStops")} ${index + 1}`}
                      enableServiceabilityPreview={false}
                      {...(mapLabels ? { labels: mapLabels } : {})}
                      onChange={(change) => {
                        setBookingResult(null);
                        const address = change.dispatchReady
                          ? change.address
                          : null;
                        setRouteStops((current) =>
                          JSON.stringify(
                            current.find((item) => item.id === stop.id)
                              ?.address,
                          ) === JSON.stringify(address)
                            ? current
                            : current.map((item) =>
                                item.id === stop.id
                                  ? { ...item, address }
                                  : item,
                              ),
                        );
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`${t("book.travel.stops.remove")} ${index + 1}`}
                      onClick={() => {
                        setBookingResult(null);
                        setRouteStops((current) =>
                          current.filter((item) => item.id !== stop.id),
                        );
                      }}
                    >
                      {t("book.travel.stops.remove")}
                    </button>
                  </section>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const id = nextRouteStopId.current++;
                    setBookingResult(null);
                    setRouteStops((current) => [
                      ...current,
                      { id, address: null },
                    ]);
                  }}
                >
                  {t("book.travel.stops.add")}
                </button>
              </div>
              {renderField({
                name: "flightNo",
                label: t("field.flightNo"),
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

      <CanvasCard theme={theme} title={t("book.section.review")}>
        <div style={{ display: "grid", gap: 12 }}>
          <span
            data-testid="partner-booking-review-summary"
            style={{ color: theme.textMuted }}
          >
            {airportPreviewPending
              ? t("book.map.previewPending")
              : mapGate.code === "outside_service_area"
                ? t("book.map.outsideServiceArea")
                : mapGate.code === "coordinates_required"
                  ? t("book.map.coordinatesRequired")
                  : mapGate.code === "dispatch_manual_review_required"
                    ? t("book.map.manualReview")
                    : ready
                      ? t("book.ready")
                      : t("book.notReady")}
          </span>
          {mapGate.code === "dispatch_manual_review_required" ? (
            <CanvasBanner
              theme={theme}
              tone="warn"
              title={
                !mapSelection.providerState.available
                  ? t("book.map.outageReviewTitle")
                  : t("book.map.manualReviewTitle")
              }
              body={
                !mapSelection.providerState.available
                  ? t("book.map.outageReviewBody")
                  : t("book.map.manualReview")
              }
            />
          ) : null}
          <div style={actionRowStyle}>
            <button
              type="submit"
              style={submitButtonStyle(
                theme,
                !ready ||
                  mapGate.blocking ||
                  airportPreviewPending ||
                  submitting,
              )}
              disabled={
                !ready ||
                mapGate.blocking ||
                airportPreviewPending ||
                submitting
              }
            >
              {submitBookingAction
                ? t(
                    submitting
                      ? "book.create.submitting"
                      : "book.create.submit",
                  )
                : t("book.submit")}
            </button>
            {entry.programCode ? (
              <span style={{ color: theme.textMuted }}>
                {t("book.program.badge")} · {entry.programCode}
              </span>
            ) : null}
          </div>
          {bookingResult?.ok === false ? (
            <CanvasBanner
              theme={theme}
              tone="danger"
              title={t("book.create.failed")}
              body={
                bookingResult.errorMessage + " · " + bookingResult.errorCode
              }
            />
          ) : null}
          {bookingResult?.ok ? (
            <div
              role="status"
              data-testid="partner-booking-confirmation"
              style={fieldStyle}
            >
              <strong>{t("book.create.success")}</strong>
              {bookingResult.confirmation.partnerBookingDetails?.subtype ===
              "travel_agency_transfer" ? (
                <aside
                  data-testid="partner-confirmed-tour-fee"
                  aria-label={t("book.travel.fee.title")}
                >
                  <strong>{t("book.travel.plan.included")}</strong>
                  <p>{t("book.travel.fee.scope")}</p>
                </aside>
              ) : null}
              {bookingResult.confirmation.partnerBookingDetails?.subtype ===
                "travel_agency_transfer" &&
              bookingResult.confirmation.partnerBookingDetails
                .planSourceKind ? (
                <p>{t("book.travel.plan.recordScope")}</p>
              ) : null}
              {partnerUserRef ? (
                <nav aria-label={t("read.navigation")}>
                  <Link
                    href={partnerBookingReadHref(
                      entry.entrySlug,
                      "confirmed",
                      partnerUserRef,
                      bookingResult.confirmation,
                    )}
                    prefetch={false}
                  >
                    {t("read.confirmation")}
                  </Link>
                  {" · "}
                  <Link
                    href={partnerBookingReadHref(
                      entry.entrySlug,
                      "receipt",
                      partnerUserRef,
                      bookingResult.confirmation,
                    )}
                    prefetch={false}
                  >
                    {t("read.record")}
                  </Link>
                  {" · "}
                  <Link
                    href={partnerBookingReadHref(
                      entry.entrySlug,
                      "trips",
                      partnerUserRef,
                    )}
                    prefetch={false}
                  >
                    {t("read.history")}
                  </Link>
                </nav>
              ) : null}
              <dl>
                <dt>{t("book.create.bookingId")}</dt>
                <dd data-testid="partner-booking-id">
                  {bookingResult.confirmation.bookingId}
                </dd>
                <dt>{t("book.create.orderId")}</dt>
                <dd data-testid="partner-order-id">
                  {bookingResult.confirmation.orderId}
                </dd>
                <dt>{t("book.create.status")}</dt>
                <dd>{bookingResult.confirmation.orderStatus}</dd>
                {Object.entries(
                  bookingResult.confirmation.partnerBookingDetails ?? {},
                )
                  .filter(
                    ([field]) =>
                      field !== "subtype" &&
                      ![
                        "planSourceId",
                        "planLegId",
                        "planBatchId",
                        "planVehicleId",
                      ].includes(field),
                  )
                  .map(([field, value]) => (
                    <div key={field}>
                      <dt>{t("field." + field)}</dt>
                      <dd>
                        {field === "planSourceKind"
                          ? t("book.travel.plan.source." + value)
                          : field === "planFareBasis"
                            ? t("book.travel.plan.included")
                            : field === "routeStops" && Array.isArray(value)
                              ? value
                                  .map((stop) =>
                                    typeof stop === "object" && stop
                                      ? stop.address
                                      : "",
                                  )
                                  .join(" → ")
                              : Array.isArray(value)
                                ? value.join(" · ")
                                : String(value)}
                      </dd>
                    </div>
                  ))}
                {bookingResult.confirmation.partnerBookingDetails?.subtype ===
                  "travel_agency_transfer" &&
                bookingResult.confirmation.flightNo ? (
                  <>
                    <dt>{t("field.flightNo")}</dt>
                    <dd>{bookingResult.confirmation.flightNo}</dd>
                  </>
                ) : null}
                {bookingResult.confirmation.businessDispatchSubtype ===
                "credit_card_airport_transfer" ? (
                  <>
                    <dt>{t("field.flightNo")}</dt>
                    <dd>{bookingResult.confirmation.flightNo}</dd>
                    <dt>{t("field.terminal")}</dt>
                    <dd>{bookingResult.confirmation.terminal}</dd>
                    <dt>{t("field.direction")}</dt>
                    <dd>
                      {t(
                        "field.direction." +
                          bookingResult.confirmation.direction,
                      )}
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>
          ) : null}
          {submitted && !submitBookingAction && ready && !mapGate.blocking ? (
            <CanvasBanner
              theme={theme}
              tone={
                mapGate.code === "dispatch_manual_review_required"
                  ? "warn"
                  : "success"
              }
              title={
                mapGate.code === "dispatch_manual_review_required"
                  ? t("book.map.manualReviewTitle")
                  : t("book.success")
              }
              body={
                mapGate.code === "dispatch_manual_review_required"
                  ? t("book.map.manualReview")
                  : t("book.success.detail")
              }
            />
          ) : null}
        </div>
      </CanvasCard>
    </form>
  );
}
