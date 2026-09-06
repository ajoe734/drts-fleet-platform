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
  formatDefaultPlacard,
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

function inputShellStyle(invalid?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "11px 13px",
    background: t.surface,
    border: "1px solid " + (invalid ? t.danger : t.line),
    borderRadius: t.radiusSm,
    width: "100%",
    boxSizing: "border-box",
  };
}

function iconStyle(): CSSProperties {
  return { color: t.faint, display: "flex", flexShrink: 0 };
}

function textInputStyle(mono?: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    width: "100%",
    fontSize: 14,
    color: t.ink,
    fontFamily: mono ? t.mono : t.sans,
    border: "none",
    outline: "none",
    background: "transparent",
    boxSizing: "border-box",
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
    wordBreak: "break-word",
    maxWidth: "100%",
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
  id,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  icon?: string;
  type?: "text" | "date" | "time";
  mono?: boolean;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <div style={inputShellStyle(invalid)}>
      {icon ? (
        <span style={iconStyle()}>
          <EIcon name={icon} size={16} />
        </span>
      ) : null}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        aria-invalid={invalid ? "true" : undefined}
        aria-describedby={ariaDescribedBy}
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
    <div style={{ ...inputShellStyle(), alignItems: "stretch" }}>
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
        boxSizing: "border-box",
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
              minWidth: 0,
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
                whiteSpace: "nowrap",
                boxSizing: "border-box",
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
  const [isPlacardCustomized, setIsPlacardCustomized] = useState(
    Boolean(
      initialDraft.placard &&
        initialDraft.placard !==
          formatDefaultPlacard(
            initialDraft.passengerMode === "self"
              ? initialDraft.bookedBy
              : initialDraft.passenger,
          ),
    ),
  );
  const [addressTarget, setAddressTarget] = useState<"pickup" | "dropoff">(
    "pickup",
  );

  const preview = getEnterpriseBookingPreview(draft, locale);
  const reviewParams = serializeEnterpriseBookingDraft(draft);
  if (bookingId) {
    reviewParams.set("bookingId", bookingId);
  }
  const reviewHref = `/bookings/review?${reviewParams.toString()}`;

  const timeValidation = validateReservationWindow(
    draft.reservationDate,
    draft.reservationTime,
    undefined,
    locale,
  );
  const canContinue =
    isEnterpriseDraftComplete(draft) && timeValidation.isValid;

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
    const nextPassenger = mode === "self" ? draft.bookedBy : draft.passenger;
    patch({
      passengerMode: mode,
      passenger: nextPassenger,
      ...(!isPlacardCustomized
        ? { placard: formatDefaultPlacard(nextPassenger) }
        : {}),
    });
  }

  function setPassengerName(newPassenger: string) {
    patch({
      passenger: newPassenger,
      ...(!isPlacardCustomized
        ? { placard: formatDefaultPlacard(newPassenger) }
        : {}),
    });
  }

  function handlePlacardChange(newPlacard: string) {
    setIsPlacardCustomized(true);
    patch({ placard: newPlacard });
  }

  function setCostCenterCode(code: string) {
    const selected = costCenterOptions.find((option) => option.value === code);
    patch({
      costCenterCode: code,
      costCenterLabel: selected?.label ?? draft.costCenterLabel,
    });
  }

  const effectivePlacard =
    draft.placard ??
    formatDefaultPlacard(
      draft.passengerMode === "self" ? draft.bookedBy : draft.passenger,
    );

  return (
    <div className="ent-form-layout">
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

          {draft.passengerMode === "self" ? (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: t.surfaceLo,
                  border: "1px solid " + t.line,
                  borderRadius: t.radiusSm,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <EIcon name="user" size={16} style={{ color: t.primary }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {draft.bookedBy}
                  </span>
                </div>
                <EPill t={t} tone="primary" dot>
                  {locale === "zh" ? "本人用車" : "Self Booking"}
                </EPill>
              </div>
            </div>
          ) : (
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
                  onChange={setPassengerName}
                  placeholder={
                    locale === "zh"
                      ? "輸入訪客或同事姓名"
                      : "Enter guest or colleague name"
                  }
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
                        ...(!isPlacardCustomized
                          ? { placard: formatDefaultPlacard(passenger) }
                          : {}),
                      });
                    }}
                    style={chipButtonStyle()}
                  >
                    {passenger}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Placard sync & explicit editing */}
          <div style={{ marginTop: 14 }}>
            <EField
              t={t}
              label={
                locale === "zh"
                  ? "舉牌姓名 placard"
                  : "Placard Welcome Name"
              }
              hint={
                locale === "zh"
                  ? "司機接送時手持舉牌顯示的文字，預設與乘客姓名同步，亦可自行編輯"
                  : "Name displayed on the welcome placard. Synced with passenger name by default, can be edited directly."
              }
            >
              <TextControl
                icon="user"
                value={effectivePlacard}
                onChange={handlePlacardChange}
                placeholder={
                  locale === "zh" ? "例如：林宜君 様" : "e.g. Sato 様"
                }
              />
            </EField>
          </div>
        </ECard>

        {/* Route and Schedule Card */}
        <ECard
          t={t}
          title={tr("new.card.booking")}
          sub={tr("card.sub.pickupDropoffWindow")}
        >
          <div className="ent-fields-two-cols">
            <EField t={t} label={tr("new.field.pickup")} req full>
              <TextControl
                icon="pin"
                value={draft.pickup}
                onChange={(pickup) => patch({ pickup })}
                onFocus={() => setAddressTarget("pickup")}
              />
            </EField>
            <EField t={t} label={tr("new.field.dropoff")} req full>
              <TextControl
                icon="pin"
                value={draft.dropoff}
                onChange={(dropoff) => patch({ dropoff })}
                onFocus={() => setAddressTarget("dropoff")}
              />
            </EField>
            <EField t={t} label={tr("new.field.window")} req>
              <TextControl
                icon="cal"
                type="date"
                value={draft.reservationDate}
                onChange={(reservationDate) => patch({ reservationDate })}
                invalid={
                  Boolean(draft.reservationDate && draft.reservationTime) &&
                  !timeValidation.isValid
                }
                mono
              />
            </EField>
            <EField t={t} label={tr("new.field.time")} req>
              <TextControl
                icon="clock"
                type="time"
                value={draft.reservationTime}
                onChange={(reservationTime) => patch({ reservationTime })}
                invalid={
                  Boolean(draft.reservationDate && draft.reservationTime) &&
                  !timeValidation.isValid
                }
                mono
              />
            </EField>
          </div>

          {/* Real-time date & time error banner if invalid */}
          {!timeValidation.isValid &&
          draft.reservationDate &&
          draft.reservationTime ? (
            <div style={{ marginTop: 12 }}>
              <EBanner
                t={t}
                tone="danger"
                icon="alert"
                title={
                  timeValidation.isPast
                    ? locale === "zh"
                      ? "用車時間不能為過去時間"
                      : "Reservation Time In Past"
                    : locale === "zh"
                      ? "未達最短提前預約時間"
                      : "Advance Lead Time Not Met"
                }
                body={
                  timeValidation.errorMessage ??
                  (locale === "zh"
                    ? `最早可預約時間為 ${timeValidation.earliestAllowedDisplay}`
                    : `Earliest allowed time is ${timeValidation.earliestAllowedDisplay}`)
                }
              />
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

        {/* Airport Card */}
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
          <div className="ent-fields-two-cols">
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

        {/* Policy, Cost Center and Contact Card */}
        <ECard
          t={t}
          title={tr("new.card.policy")}
          sub={tr("card.sub.costVehicleNotes")}
        >
          <div className="ent-fields-two-cols">
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
                onChange={(bookedBy) => {
                  patch({
                    bookedBy,
                    ...(draft.passengerMode === "self"
                      ? {
                          passenger: bookedBy,
                          ...(!isPlacardCustomized
                            ? { placard: formatDefaultPlacard(bookedBy) }
                            : {}),
                        }
                      : {}),
                  });
                }}
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
                onChange={(notes) => patch({ notes })}
              />
            </EField>
          </div>
        </ECard>
      </div>

      {/* Sticky Helper Reads & CTA panel */}
      <div className="ent-sticky-aside">
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
            <EBanner
              t={t}
              tone={preview.bannerTone}
              icon={preview.approvalRequired ? "shield" : "check"}
              body={preview.bannerBody}
            />
          </div>
        </ECard>

        {!timeValidation.isValid &&
        draft.reservationDate &&
        draft.reservationTime ? (
          <div
            style={{
              padding: "10px 12px",
              background: t.dangerBg,
              border: "1px solid " + t.dangerBd,
              borderRadius: t.radiusSm,
              fontSize: 12.5,
              color: t.danger,
              lineHeight: 1.4,
            }}
          >
            {timeValidation.errorMessage}
          </div>
        ) : null}

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
  );
}
