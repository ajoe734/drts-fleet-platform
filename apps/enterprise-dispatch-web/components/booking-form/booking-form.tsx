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
  derivePlacard,
  getEnterpriseBookingPreview,
  isEnterpriseDraftComplete,
  serializeEnterpriseBookingDraft,
  validateReservationWindow,
  type EnterpriseAirportDirection,
  type EnterpriseBookingDraftForm,
  type EnterprisePassengerMode,
  type EnterpriseVehiclePreference,
} from "@/lib/enterprise-booking-draft";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import { useTranslation } from "@/lib/i18n";

type Option = { value: string; label: string; icon?: string };

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
    width: "100%",
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
  onFocus,
  icon,
  type = "text",
  mono,
  placeholder,
  invalid,
  ariaDescribedBy,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  icon?: string;
  type?: "text" | "date" | "time";
  mono?: boolean;
  placeholder?: string;
  invalid?: boolean;
  ariaDescribedBy?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={`form-input-shell${invalid ? " is-invalid" : ""}`}>
      {icon ? (
        <span style={iconStyle()}>
          <EIcon name={icon} size={16} />
        </span>
      ) : null}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        aria-invalid={invalid ? "true" : "false"}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        style={textInputStyle(mono)}
      />
    </div>
  );
}

function TextAreaControl({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div
      className="form-input-shell"
      style={{ alignItems: "stretch", padding: "8px 12px" }}
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        rows={3}
        placeholder={placeholder}
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
                transition: "all 0.15s ease",
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
    <div className="form-input-shell">
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
  bookingId,
}: {
  initialDraft: EnterpriseBookingDraftForm;
  passengers: string[];
  addresses: string[];
  costCenters: string[];
  bookingId?: string;
}) {
  const { locale, t: tr } = useTranslation();
  const [draft, setDraft] = useState(initialDraft);
  const [addressTarget, setAddressTarget] = useState<"pickup" | "dropoff">(
    "pickup",
  );
  const [customPlacardEdited, setCustomPlacardEdited] = useState(
    Boolean(initialDraft.placard && initialDraft.placard !== derivePlacard(initialDraft.passenger)),
  );

  const preview = getEnterpriseBookingPreview(draft, locale);
  const timeValidation = validateReservationWindow(
    draft.reservationDate,
    draft.reservationTime,
  );
  const canContinue = isEnterpriseDraftComplete(draft);

  const reviewParams = serializeEnterpriseBookingDraft(draft);
  if (bookingId) {
    reviewParams.set("bookingId", bookingId);
  }
  const reviewHref = `/bookings/review?${reviewParams.toString()}`;

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
    if (mode === "self") {
      patch({
        passengerMode: "self",
        passenger: draft.bookedBy,
        placard: draft.bookedBy,
      });
      setCustomPlacardEdited(false);
    } else {
      const nextPassenger =
        draft.passenger === draft.bookedBy ? "" : draft.passenger;
      const nextPlacard = derivePlacard(nextPassenger);
      patch({
        passengerMode: "other",
        passenger: nextPassenger,
        placard: nextPlacard,
      });
      setCustomPlacardEdited(false);
    }
  }

  function handlePassengerChange(newPassenger: string) {
    if (!customPlacardEdited) {
      patch({
        passenger: newPassenger,
        placard: derivePlacard(newPassenger),
      });
    } else {
      patch({ passenger: newPassenger });
    }
  }

  function handlePlacardChange(newPlacard: string) {
    setCustomPlacardEdited(true);
    patch({ placard: newPlacard });
  }

  function setCostCenterCode(code: string) {
    const selected = costCenterOptions.find((option) => option.value === code);
    patch({
      costCenterCode: code,
      costCenterLabel: selected?.label ?? draft.costCenterLabel,
    });
  }

  return (
    <div className="booking-form-grid">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Passenger Card */}
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
                  placeholder={locale === "zh" ? "輸入乘客姓名" : "Enter passenger name"}
                  onChange={handlePassengerChange}
                  ariaLabel={tr("new.passenger.choose")}
                />
              </EField>
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
                    onClick={() => {
                      patch({
                        passengerMode: "other",
                        passenger,
                        placard: derivePlacard(passenger),
                      });
                      setCustomPlacardEdited(false);
                    }}
                    style={chipButtonStyle()}
                  >
                    {passenger}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: t.surfaceLo,
                border: "1px solid " + t.line,
                borderRadius: t.radiusSm,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ color: t.primary }}>
                <EIcon name="user" size={16} />
              </span>
              <div style={{ fontSize: 13, color: t.ink }}>
                {locale === "zh"
                  ? `為本人預約：${draft.bookedBy}（預約人即乘客）`
                  : `Booking for self: ${draft.bookedBy} (requester is passenger)`}
              </div>
            </div>
          )}
        </ECard>

        {/* Route & Reservation Window Card */}
        <ECard
          t={t}
          title={tr("new.card.booking")}
          sub={tr("card.sub.pickupDropoffWindow")}
        >
          <div className="booking-form-inner-grid">
            <EField t={t} label={tr("new.field.pickup")} req full>
              <TextControl
                icon="pin"
                value={draft.pickup}
                onChange={(pickup) => patch({ pickup })}
                onFocus={() => setAddressTarget("pickup")}
                ariaLabel={tr("new.field.pickup")}
              />
            </EField>
            <EField t={t} label={tr("new.field.dropoff")} req full>
              <TextControl
                icon="pin"
                value={draft.dropoff}
                onChange={(dropoff) => patch({ dropoff })}
                onFocus={() => setAddressTarget("dropoff")}
                ariaLabel={tr("new.field.dropoff")}
              />
            </EField>
            <EField t={t} label={tr("new.field.window")} req>
              <TextControl
                icon="cal"
                type="date"
                value={draft.reservationDate}
                onChange={(reservationDate) => patch({ reservationDate })}
                invalid={!timeValidation.valid}
                ariaDescribedBy="reservation-time-error"
                ariaLabel={tr("new.field.window")}
                mono
              />
            </EField>
            <EField t={t} label={tr("new.field.time")} req>
              <TextControl
                icon="clock"
                type="time"
                value={draft.reservationTime}
                onChange={(reservationTime) => patch({ reservationTime })}
                invalid={!timeValidation.valid}
                ariaDescribedBy="reservation-time-error"
                ariaLabel={tr("new.field.time")}
                mono
              />
            </EField>
          </div>

          {!timeValidation.valid && timeValidation.reason ? (
            <div
              id="reservation-time-error"
              role="alert"
              className="form-field-error"
            >
              <EIcon name="alert" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{timeValidation.reason}</div>
            </div>
          ) : null}

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
                onClick={() =>
                  patch(
                    addressTarget === "pickup"
                      ? { pickup: address }
                      : { dropoff: address },
                  )
                }
                style={chipButtonStyle()}
              >
                {address}
              </button>
            ))}
          </div>
        </ECard>

        {/* Airport Context Card */}
        <ECard
          t={t}
          title={
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {tr("new.field.airport")}
              <EPill t={t} tone="neutral">
                {tr("new.airport.optional")}
              </EPill>
            </span>
          }
          sub={tr("new.airport.hint")}
        >
          <div className="booking-form-inner-grid">
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
                placeholder={locale === "zh" ? "例：T1 · 第一航廈" : "e.g. T1"}
                onChange={(terminal) => patch({ terminal })}
              />
            </EField>
            <EField t={t} label={tr("new.airport.flight")}>
              <TextControl
                icon="flag"
                value={draft.flight}
                placeholder={locale === "zh" ? "例：JL809" : "e.g. JL809"}
                onChange={(flight) => patch({ flight })}
                mono
              />
            </EField>
            <EField t={t} label={tr("new.airport.luggage")}>
              <TextControl
                value={draft.luggageCount}
                placeholder={locale === "zh" ? "件數" : "Count"}
                onChange={(luggageCount) => patch({ luggageCount })}
              />
            </EField>
            <EField
              t={t}
              label={tr("review.summary.placard")}
              full
              hint={
                locale === "zh"
                  ? "司機接機時舉牌姓名（預設隨乘客自動同步，亦可自訂）"
                  : "Driver welcome placard (syncs with passenger by default, or customize)"
              }
            >
              <TextControl
                value={draft.placard}
                placeholder={derivePlacard(draft.passenger) || draft.bookedBy}
                onChange={handlePlacardChange}
                ariaLabel={tr("review.summary.placard")}
              />
            </EField>
          </div>
        </ECard>

        {/* Policy & Onsite Contact Card */}
        <ECard
          t={t}
          title={tr("new.card.policy")}
          sub={tr("card.sub.costVehicleNotes")}
        >
          <div className="booking-form-inner-grid">
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
                      ? {
                          passenger: bookedBy,
                          placard: customPlacardEdited ? draft.placard : bookedBy,
                        }
                      : {}),
                  })
                }
              />
            </EField>
            <EField t={t} label={tr("new.field.contact")} req>
              <TextControl
                icon="phone"
                value={draft.onsiteContactPhone}
                onChange={(onsiteContactPhone) => patch({ onsiteContactPhone })}
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
                placeholder={
                  locale === "zh"
                    ? "其他乘車備註事項"
                    : "Additional notes or instructions"
                }
                onChange={(notes) => patch({ notes })}
              />
            </EField>
          </div>
        </ECard>
      </div>

      {/* Helper Reads / CTA Column */}
      <div className="booking-form-sticky-panel">
        <ECard
          t={t}
          title={tr("new.check.title")}
          sub={tr("card.sub.helperReads")}
        >
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
            k={tr("new.field.window")}
            v={
              <EPill
                t={t}
                tone={timeValidation.valid ? "success" : "danger"}
                dot
              >
                {timeValidation.valid
                  ? tr("new.check.valid")
                  : timeValidation.code === "PAST_DATE"
                    ? locale === "zh"
                      ? "時間過期"
                      : "Expired"
                    : locale === "zh"
                      ? "需提前預約"
                      : "Too soon"}
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
          <ERow t={t} k={tr("new.check.impact")} v={preview.quotaImpactLabel} />
          <ERow
            t={t}
            k={tr("new.policy.approval")}
            v={
              <EPill
                t={t}
                tone={preview.approvalRequired ? "warn" : "success"}
                dot
              >
                {preview.approvalLabel}
              </EPill>
            }
            last
          />
          <div style={{ marginTop: 12 }}>
            {!timeValidation.valid ? (
              <EBanner
                t={t}
                tone="danger"
                icon="alert"
                body={
                  timeValidation.reason ??
                  (locale === "zh"
                    ? "預約時間無效，不能進入確認頁。"
                    : "Invalid reservation time.")
                }
              />
            ) : (
              <EBanner
                t={t}
                tone={preview.bannerTone}
                icon={preview.approvalRequired ? "shield" : "check"}
                body={preview.bannerBody}
              />
            )}
          </div>
        </ECard>

        <div className="booking-cta-bar">
          <Link
            href={reviewHref}
            data-drt-intent="enterprise-review"
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
          <Link
            href="/"
            style={entBtnStyle(t, { variant: "ghost", block: true })}
          >
            <EBtnContent>{tr("new.next.cancel")}</EBtnContent>
          </Link>
        </div>
      </div>
    </div>
  );
}
