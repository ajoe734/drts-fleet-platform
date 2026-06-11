"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
import type { PartnerBrandTemplate } from "@drts/ui-tokens";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
  type CanvasTheme,
} from "@drts/ui-web";
import {
  createDefaultPartnerBookingDraft,
  getPartnerBookingFieldErrors,
  getPartnerProgramCoverage,
  getPartnerProgramGate,
  getPartnerProgramLabel,
  isPartnerBookingDraftReady,
} from "@/lib/partner-booking-form";
import { t } from "@/lib/translations";

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
}: {
  brand: PartnerBrandTemplate;
  entry: Pick<
    PartnerChannelEntryRecord,
    "businessDispatchSubtype" | "eligibilityMode" | "entrySlug" | "programCode"
  >;
  eligibilityVerificationId: string | null;
}) {
  const theme = useMemo(() => buildPartnerTheme(brand), [brand]);
  const [draft, setDraft] = useState(createDefaultPartnerBookingDraft);
  const [submitted, setSubmitted] = useState(false);

  const errors = getPartnerBookingFieldErrors({
    draft,
    subtype: entry.businessDispatchSubtype,
  });
  const gate = getPartnerProgramGate({
    entry,
    draft,
    eligibilityVerificationId,
  });
  const ready = isPartnerBookingDraftReady({
    entry,
    draft,
    eligibilityVerificationId,
  });

  function updateField(name: string, value: string) {
    setDraft((current) => ({
      ...current,
      [name]: value,
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

  const programLabel = getPartnerProgramLabel(entry.businessDispatchSubtype);
  const coverage = getPartnerProgramCoverage(entry.businessDispatchSubtype);
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
                ? "中型巴士 ×1"
                : "商務車 ×2",
            seats: `${travelSeatCount} / ${travelSeatCount} 席`,
            stop: `${draft.meetingPoint || draft.pickupAddress || "集合點待補"} → ${
              draft.dropoffAddress || "下車點待補"
            }`,
          },
          {
            title: t("book.travel.batch.secondary"),
            time: draft.reservationWindowEnd || "—",
            vehicle: draft.luggageCount
              ? `商務車 ×${draft.luggageCount}`
              : "商務車 ×2",
            seats: `${travelSeatCount} 席`,
            stop: `${draft.dropoffAddress || "飯店待補"} → ${draft.notes || "後續行程接駁"}`,
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

      {entry.businessDispatchSubtype === "travel_agency_transfer" ? (
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
                  {travelSeatCount} 席
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
        <div style={gridStyle}>
          {renderField({
            name: "pickupAddress",
            label: t("field.pickupAddress"),
          })}
          {renderField({
            name: "dropoffAddress",
            label: t("field.dropoffAddress"),
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
