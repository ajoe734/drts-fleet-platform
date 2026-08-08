"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import {
  EBanner,
  EBtnContent,
  ECard,
  EField,
  EIcon,
  EPill,
  ERow,
  entBtnStyle,
} from "@/components/ent-kit";
import {
  getEnterpriseBookingPreview,
  getVehicleLabelFromDraft,
  isEnterpriseDraftComplete,
  serializeEnterpriseBookingDraft,
  type EnterpriseAirportDirection,
  type EnterpriseBookingDraftForm,
  type EnterprisePassengerMode,
  type EnterpriseVehiclePreference,
} from "@/lib/enterprise-booking-draft";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

type Option = { value: string; label: string; icon?: string };

function inputShellStyle(invalid?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "11px 13px",
    background: t.surface,
    border: "1px solid " + (invalid ? t.danger : t.line),
    borderRadius: t.radiusSm,
  };
}

function iconStyle(): CSSProperties {
  return { color: t.faint, display: "flex", flexShrink: 0 };
}

function textInputStyle(mono?: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: t.ink,
    fontFamily: mono ? t.mono : t.sans,
    border: "none",
    outline: "none",
    background: "transparent",
  };
}

function chipButtonStyle(): CSSProperties {
  return {
    fontSize: 11.5,
    color: t.muted,
    background: t.surfaceLo,
    border: "1px solid " + t.line,
    padding: "4px 9px",
    borderRadius: 999,
    cursor: "pointer",
  };
}

function TextControl({
  value,
  onChange,
  icon,
  type = "text",
  mono,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  icon?: string;
  type?: "text" | "date" | "time";
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div style={inputShellStyle()}>
      {icon ? (
        <span style={iconStyle()}>
          <EIcon name={icon} size={16} />
        </span>
      ) : null}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        style={textInputStyle(mono)}
      />
    </div>
  );
}

function TextAreaControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ ...inputShellStyle(), alignItems: "stretch" }}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        rows={3}
        style={{
          ...textInputStyle(),
          resize: "vertical",
          lineHeight: 1.5,
        }}
      />
    </div>
  );
}

function SegmentedControl<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: string }[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      style={{
        display: "inline-flex",
        background: t.surfaceLo,
        border: "1px solid " + t.line,
        borderRadius: t.radiusSm,
        padding: 3,
        gap: 2,
        width: "100%",
      }}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            style={{
              flex: 1,
              position: "relative",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              style={{
                position: "absolute",
                opacity: 0,
                inset: 0,
                pointerEvents: "none",
              }}
            />
            <span
              style={{
                display: "inline-flex",
                width: "100%",
                justifyContent: "center",
                alignItems: "center",
                gap: 6,
                background: checked ? t.surface : "transparent",
                color: checked ? t.primary : t.muted,
                fontWeight: 600,
                fontSize: 13,
                padding: "8px 14px",
                borderRadius: t.radiusSm - 3,
                boxShadow: checked ? t.shadowSm : "none",
              }}
            >
              {option.icon ? <EIcon name={option.icon} size={14} /> : null}
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function SelectControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
}) {
  return (
    <div style={inputShellStyle()}>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={textInputStyle()}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function EnterpriseBookingForm({
  initialDraft,
  passengers,
  addresses,
  costCenters,
}: {
  initialDraft: EnterpriseBookingDraftForm;
  passengers: string[];
  addresses: string[];
  costCenters: string[];
}) {
  const { locale, t: tr } = useTranslation();
  const [draft, setDraft] = useState(initialDraft);
  const preview = getEnterpriseBookingPreview(draft, locale);
  const reviewHref = `/bookings/review?${serializeEnterpriseBookingDraft(
    draft,
  ).toString()}`;
  const canContinue = isEnterpriseDraftComplete(draft);

  const costCenterOptions = costCenters.map((label) => ({
    value: label.split("·")[0]?.trim() ?? label,
    label,
  }));
  const vehicleOptions: {
    value: EnterpriseVehiclePreference;
    label: string;
    icon?: string;
  }[] = [
    { value: "sedan", label: tr("fixture.vehicle.standard") },
    { value: "business", label: tr("fixture.vehicle.business") },
    { value: "van", label: tr("fixture.vehicle.van") },
  ];

  function patch(next: Partial<EnterpriseBookingDraftForm>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function setPassengerMode(mode: EnterprisePassengerMode) {
    patch({
      passengerMode: mode,
      ...(mode === "self" ? { passenger: draft.bookedBy } : {}),
    });
  }

  function setCostCenterCode(code: string) {
    const selected = costCenterOptions.find((option) => option.value === code);
    patch({
      costCenterCode: code,
      costCenterLabel: selected?.label ?? draft.costCenterLabel,
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.55fr 1fr",
        gap: 18,
        alignItems: "start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ECard
          t={t}
          title={tr("new.field.passenger")}
          sub={tr("card.sub.passenger")}
        >
          <SegmentedControl
            name="passenger-mode"
            value={draft.passengerMode}
            onChange={setPassengerMode}
            options={[
              {
                value: "self",
                label: tr("new.passenger.self"),
                icon: "user",
              },
              {
                value: "other",
                label: tr("new.passenger.other"),
                icon: "users",
              },
            ]}
          />
          {draft.passengerMode === "other" ? (
            <>
              <div style={{ height: 14 }} />
              <EField
                t={t}
                label={tr("new.passenger.choose")}
                req
                hint={tr("new.passenger.chooseHint")}
              >
                <TextControl
                  icon="search"
                  value={draft.passenger}
                  onChange={(passenger) => patch({ passenger })}
                />
              </EField>
            </>
          ) : null}
          <div
            style={{
              display: "flex",
              gap: 7,
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            {passengers.map((passenger) => (
              <button
                key={passenger}
                type="button"
                onClick={() =>
                  patch({ passengerMode: "other", passenger: passenger })
                }
                style={chipButtonStyle()}
              >
                {passenger}
              </button>
            ))}
          </div>
        </ECard>

        <ECard
          t={t}
          title={tr("new.card.booking")}
          sub={tr("card.sub.pickupDropoffWindow")}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <EField t={t} label={tr("new.field.pickup")} req full>
              <TextControl
                icon="pin"
                value={draft.pickup}
                onChange={(pickup) => patch({ pickup })}
              />
            </EField>
            <EField t={t} label={tr("new.field.dropoff")} req full>
              <TextControl
                icon="pin"
                value={draft.dropoff}
                onChange={(dropoff) => patch({ dropoff })}
              />
            </EField>
            <EField t={t} label={tr("new.field.window")} req>
              <TextControl
                icon="cal"
                type="date"
                value={draft.reservationDate}
                onChange={(reservationDate) => patch({ reservationDate })}
                mono
              />
            </EField>
            <EField t={t} label={tr("new.field.time")} req>
              <TextControl
                icon="clock"
                type="time"
                value={draft.reservationTime}
                onChange={(reservationTime) => patch({ reservationTime })}
                mono
              />
            </EField>
          </div>
          <div
            style={{
              display: "flex",
              gap: 7,
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            {addresses.map((address) => (
              <button
                key={address}
                type="button"
                onClick={() => {
                  if (draft.pickup === initialDraft.pickup) {
                    patch({ dropoff: address });
                    return;
                  }
                  patch({ pickup: address });
                }}
                style={chipButtonStyle()}
              >
                {address}
              </button>
            ))}
          </div>
        </ECard>

        <ECard
          t={t}
          title={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {tr("new.field.airport")}
              <EPill t={t} tone="neutral">
                {tr("new.airport.optional")}
              </EPill>
            </span>
          }
          sub={tr("new.airport.hint")}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <EField t={t} label={tr("new.airport.direction")}>
              <SegmentedControl<EnterpriseAirportDirection>
                name="airport-direction"
                value={draft.airportDirection}
                onChange={(airportDirection) => patch({ airportDirection })}
                options={[
                  {
                    value: "dropoff",
                    label: tr("new.airport.outbound"),
                  },
                  {
                    value: "pickup",
                    label: tr("new.airport.inbound"),
                  },
                ]}
              />
            </EField>
            <EField t={t} label={tr("new.airport.terminal")}>
              <TextControl
                value={draft.terminal}
                onChange={(terminal) => patch({ terminal })}
              />
            </EField>
            <EField t={t} label={tr("new.airport.flight")}>
              <TextControl
                icon="flag"
                value={draft.flight}
                onChange={(flight) => patch({ flight })}
                mono
              />
            </EField>
            <EField t={t} label={tr("new.airport.luggage")}>
              <TextControl
                value={draft.luggageCount}
                onChange={(luggageCount) => patch({ luggageCount })}
              />
            </EField>
          </div>
        </ECard>

        <ECard
          t={t}
          title={tr("new.card.policy")}
          sub={tr("card.sub.costVehicleNotes")}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <EField
              t={t}
              label={tr("new.field.costCenter")}
              req
              full
              hint={tr("new.costCenter.hint")}
            >
              <SelectControl
                value={draft.costCenterCode}
                onChange={setCostCenterCode}
                options={costCenterOptions}
              />
            </EField>
            <EField t={t} label={tr("new.field.bookedBy")}>
              <TextControl
                icon="user"
                value={draft.bookedBy}
                onChange={(bookedBy) =>
                  patch({
                    bookedBy,
                    ...(draft.passengerMode === "self"
                      ? { passenger: bookedBy }
                      : {}),
                  })
                }
              />
            </EField>
            <EField t={t} label={tr("new.field.contact")} req>
              <TextControl
                icon="phone"
                value={draft.onsiteContact}
                onChange={(onsiteContact) => patch({ onsiteContact })}
                mono
              />
            </EField>
            <EField t={t} label={tr("new.policy.vehicle")} full>
              <SegmentedControl<EnterpriseVehiclePreference>
                name="vehicle-preference"
                value={draft.vehicle}
                onChange={(vehicle) => patch({ vehicle })}
                options={vehicleOptions}
              />
            </EField>
            <EField t={t} label={tr("new.field.notes")} full>
              <TextAreaControl
                value={draft.notes}
                onChange={(notes) => patch({ notes })}
              />
            </EField>
          </div>
        </ECard>
      </div>

      <div
        style={{
          position: "sticky",
          top: 76,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <ECard t={t} title={tr("new.check.title")} sub={tr("card.sub.helperReads")}>
          <ERow
            t={t}
            k={tr("new.field.costCenter")}
            v={
              <EPill t={t} tone="success" dot>
                {tr("new.check.valid")}
              </EPill>
            }
          />
          <ERow
            t={t}
            k={tr("new.check.quota")}
            v={preview.remainingBudgetLabel}
            mono
          />
          <ERow
            t={t}
            k={tr("new.check.fare")}
            v={preview.estimatedFareLabel}
            mono
          />
          <ERow
            t={t}
            k={tr("new.check.impact")}
            v={preview.quotaImpactLabel}
          />
          <ERow
            t={t}
            k={tr("new.policy.approval")}
            v={
              <EPill t={t} tone={preview.approvalRequired ? "warn" : "success"} dot>
                {preview.approvalLabel}
              </EPill>
            }
          />
          <ERow
            t={t}
            k={tr("new.policy.vehicle")}
            v={getVehicleLabelFromDraft(draft, locale)}
            last
          />
          <div style={{ marginTop: 12 }}>
            <EBanner
              t={t}
              tone={preview.bannerTone}
              icon={preview.approvalRequired ? "shield" : "check"}
              body={preview.bannerBody}
            />
          </div>
        </ECard>
        <div
          style={{
            background: t.surface,
            border: "1px solid " + t.line,
            borderRadius: t.radius,
            boxShadow: t.shadowSm,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 12.5, color: t.muted, marginBottom: 8 }}>
            {tr("review.card.submit")}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>
            {draft.passengerMode === "self" ? draft.bookedBy : draft.passenger}
          </div>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>
            {preview.reservationWindowLabel} · {draft.costCenterCode}
          </div>
        </div>
        <Link
          href={reviewHref}
          aria-disabled={!canContinue}
          style={entBtnStyle(t, {
            variant: "primary",
            size: "lg",
            block: true,
            disabled: !canContinue,
          })}
          onClick={(event) => {
            if (!canContinue) {
              event.preventDefault();
            }
          }}
        >
          <EBtnContent iconR="arrow" size="lg">
            {tr("new.next.review")}
          </EBtnContent>
        </Link>
        <Link href="/" style={entBtnStyle(t, { variant: "ghost", block: true })}>
          <EBtnContent>{tr("new.next.cancel")}</EBtnContent>
        </Link>
      </div>
    </div>
  );
}
