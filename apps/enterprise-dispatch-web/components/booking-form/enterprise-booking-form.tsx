"use client";

import "./enterprise-booking-form-accessibility.css";
import Link from "next/link";
import type {
  TenantPassengerRecord,
  TenantAddressRecord,
  TenantCostCenterRecord,
} from "@drts/contracts";
import {
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  EBanner,
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  ERow,
  entBtnStyle,
} from "@/components/ent-kit";
import {
  formatDefaultPlacard,
  getEnterpriseBookingPreview,
  isEnterpriseDraftComplete,
  resolveCopyByLocale,
  serializeEnterpriseBookingDraft,
  validateReservationWindow,
  type EnterpriseAirportDirection,
  type EnterpriseBookingDraftForm,
  type EnterprisePassengerMode,
  type EnterpriseVehiclePreference,
} from "@/lib/enterprise-booking-draft";
import { tenantEnterpriseTheme as t } from "./theme";
import { useTranslation } from "@/lib/i18n";

type Option = { value: string; label: string; icon?: string | undefined };

export function enterpriseBookingFieldId(field: string): string {
  return `enterprise-booking-${field}`;
}

function inputShellStyle(invalid?: boolean, focused?: boolean): CSSProperties {
  const borderColor = invalid ? t.danger : focused ? t.primary : t.line;
  const focusRingBg = invalid ? t.dangerBg : t.primaryBg;
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "11px 13px",
    background: t.surface,
    border: "1px solid " + borderColor,
    borderRadius: t.radiusSm,
    boxShadow: focused ? "0 0 0 3px " + focusRingBg : "none",
    width: "100%",
    boxSizing: "border-box",
    transition: "border-color .15s, box-shadow .15s",
  };
}

function iconStyle(): CSSProperties {
  return { color: t.faint, display: "flex", flexShrink: 0 };
}

function textInputStyle(
  mono?: boolean,
  focused?: boolean,
  invalid?: boolean,
): CSSProperties {
  const ringColor = invalid ? t.danger : t.primary;
  return {
    flex: 1,
    minWidth: 0,
    width: "100%",
    fontSize: 14,
    color: t.ink,
    fontFamily: mono ? t.mono : t.sans,
    border: "none",
    ...(focused
      ? {
          outline: "2px solid " + ringColor,
          outlineStyle: "solid",
          outlineWidth: 2,
          outlineColor: ringColor,
          outlineOffset: 2,
        }
      : {
          outlineStyle: "auto",
          outlineWidth: 0,
        }),
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

function BookingField({
  fieldId,
  label,
  req,
  hint,
  hintId,
  error,
  errorId,
  full,
  children,
}: {
  fieldId: string;
  label: ReactNode;
  req?: boolean | undefined;
  hint?: ReactNode | undefined;
  hintId?: string | undefined;
  error?: ReactNode | undefined;
  errorId?: string | undefined;
  full?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 0, gridColumn: full ? "1 / -1" : undefined }}>
      <label
        id={`${fieldId}-label`}
        htmlFor={fieldId}
        style={{
          display: "block",
          fontSize: 12.5,
          fontWeight: 600,
          color: t.ink2,
          marginBottom: 6,
        }}
      >
        {label}
        {req ? (
          <span aria-hidden="true" style={{ color: t.danger }}>
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <div
          id={errorId ?? `${fieldId}-error`}
          style={{
            fontSize: 11.5,
            color: t.danger,
            marginTop: 5,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <EIcon name="alert" size={12} />
          {error}
        </div>
      ) : null}
      {hint && !error ? (
        <div
          id={hintId ?? `${fieldId}-hint`}
          style={{ fontSize: 11.5, color: t.muted, marginTop: 5 }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function BookingGroupField({
  labelId,
  label,
  full,
  children,
}: {
  labelId: string;
  label: ReactNode;
  full?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 0, gridColumn: full ? "1 / -1" : undefined }}>
      <div
        id={labelId}
        style={{
          display: "block",
          fontSize: 12.5,
          fontWeight: 600,
          color: t.ink2,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
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
  required,
  inputMode,
  id,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: (() => void) | undefined;
  icon?: string | undefined;
  type?: "text" | "date" | "time" | undefined;
  mono?: boolean | undefined;
  placeholder?: string | undefined;
  invalid?: boolean | undefined;
  required?: boolean | undefined;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"] | undefined;
  id?: string | undefined;
  "aria-describedby"?: string | undefined;
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div
      className="ent-booking-input-shell"
      data-focused={isFocused ? "true" : "false"}
      data-invalid={invalid ? "true" : "false"}
      style={inputShellStyle(invalid, isFocused)}
    >
      {icon ? (
        <span aria-hidden="true" style={iconStyle()}>
          <EIcon name={icon} size={16} />
        </span>
      ) : null}
      <input
        id={id}
        className="ent-booking-control"
        type={type}
        value={value}
        required={required}
        inputMode={inputMode}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={() => {
          setIsFocused(true);
          onFocus?.();
        }}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        data-focus-visible={isFocused ? "true" : "false"}
        aria-invalid={invalid ? "true" : undefined}
        aria-describedby={ariaDescribedBy}
        style={textInputStyle(mono, isFocused, invalid)}
      />
    </div>
  );
}

function TextAreaControl({
  id,
  value,
  onChange,
  placeholder,
  required,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  "aria-describedby"?: string | undefined;
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div
      className="ent-booking-input-shell"
      data-focused={isFocused ? "true" : "false"}
      data-invalid="false"
      style={{ ...inputShellStyle(false, isFocused), alignItems: "stretch" }}
    >
      <textarea
        id={id}
        className="ent-booking-control"
        value={value}
        required={required}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        rows={3}
        placeholder={placeholder}
        data-focus-visible={isFocused ? "true" : "false"}
        aria-describedby={ariaDescribedBy}
        style={{
          ...textInputStyle(false, isFocused, false),
          resize: "vertical",
          lineHeight: 1.5,
        }}
      />
    </div>
  );
}

function SegmentedControl<T extends string>({
  name,
  groupLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  value,
  onChange,
  options,
}: {
  name: string;
  groupLabel: string;
  ariaLabelledBy?: string | undefined;
  ariaDescribedBy?: string | undefined;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: string | undefined }[];
}) {
  const [focusedValue, setFocusedValue] = useState<T | null>(null);

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
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
        const isFocused = focusedValue === option.value;
        const optionId = enterpriseBookingFieldId(`${name}-${option.value}`);
        return (
          <label
            key={option.value}
            htmlFor={optionId}
            style={{
              flex: 1,
              position: "relative",
              cursor: "pointer",
              minWidth: 0,
            }}
          >
            <input
              id={optionId}
              className="ent-booking-radio-input"
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              onFocus={() => setFocusedValue(option.value)}
              onBlur={() =>
                setFocusedValue((current) =>
                  current === option.value ? null : current,
                )
              }
              style={{
                position: "absolute",
                opacity: 0,
                inset: 0,
                pointerEvents: "none",
              }}
            />
            <span
              className="ent-booking-radio-option"
              data-checked={checked ? "true" : "false"}
              data-focused={isFocused ? "true" : "false"}
              style={{
                display: "inline-flex",
                width: "100%",
                justifyContent: "center",
                alignItems: "center",
                gap: 6,
                background: checked || isFocused ? t.surface : "transparent",
                color: checked ? t.primary : isFocused ? t.ink : t.muted,
                border: "1px solid " + (isFocused ? t.primary : "transparent"),
                outline: isFocused ? "2px solid " + t.primary : "none",
                outlineOffset: isFocused ? 1 : undefined,
                fontWeight: 600,
                fontSize: 13,
                padding: "8px 14px",
                borderRadius: t.radiusSm - 3,
                boxShadow: isFocused
                  ? "0 0 0 3px " + t.primaryBg
                  : checked
                    ? t.shadowSm
                    : "none",
                whiteSpace: "nowrap",
                boxSizing: "border-box",
              }}
            >
              {option.icon ? (
                <span aria-hidden="true" style={{ display: "inline-flex" }}>
                  <EIcon name={option.icon} size={14} />
                </span>
              ) : null}
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function SelectControl({
  id,
  value,
  onChange,
  options,
  required,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  required?: boolean | undefined;
  "aria-describedby"?: string | undefined;
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div
      className="ent-booking-input-shell"
      data-focused={isFocused ? "true" : "false"}
      data-invalid="false"
      style={inputShellStyle(false, isFocused)}
    >
      <select
        id={id}
        className="ent-booking-control"
        value={value}
        required={required}
        onChange={(event) => onChange(event.currentTarget.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        data-focus-visible={isFocused ? "true" : "false"}
        aria-describedby={ariaDescribedBy}
        style={textInputStyle(false, isFocused, false)}
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
  passengers: Array<string | TenantPassengerRecord>;
  addresses: Array<string | TenantAddressRecord>;
  costCenters: Array<string | TenantCostCenterRecord>;
  bookingId?: string | undefined;
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
  const hasReservationWindowInput = Boolean(
    draft.reservationDate && draft.reservationTime,
  );
  const isReservationWindowInvalid =
    hasReservationWindowInput && !timeValidation.isValid;
  const canContinue =
    isEnterpriseDraftComplete(draft) && timeValidation.isValid;

  const passengerOptions = passengers
    .filter((row) => typeof row === "string" || row.activeFlag)
    .map((row) =>
      typeof row === "string"
        ? { key: row, label: row, name: row, passengerId: undefined }
        : {
            key: row.passengerId,
            label: [row.fullName, row.employeeNo || row.mobile]
              .filter(Boolean)
              .join(" · "),
            name: row.fullName,
            passengerId: row.passengerId,
          },
    );
  const addressOptions = addresses
    .filter((row) => typeof row === "string" || row.activeFlag)
    .map((row) =>
      typeof row === "string"
        ? { key: row, label: row, address: row, addressId: undefined }
        : {
            key: row.addressId,
            label: `${row.addressName} · ${row.addressText}`,
            address: row.addressText,
            addressId: row.addressId,
          },
    );
  const hasCostCenterOptions = costCenters.some(
    (row) => typeof row === "string" || row.activeFlag,
  );
  const costCenterOptions = costCenters
    .filter((row) => typeof row === "string" || row.activeFlag)
    .map((row) =>
      typeof row === "string"
        ? { value: row.split("·")[0]?.trim() ?? row, label: row }
        : { value: row.code, label: `${row.code} · ${row.name}` },
    );
  if (
    !costCenterOptions.some((option) => option.value === draft.costCenterCode)
  ) {
    costCenterOptions.unshift({
      value: draft.costCenterCode,
      label: draft.costCenterLabel || tr("new.costCenter.hint"),
    });
  }
  const vehicleOptions: {
    value: EnterpriseVehiclePreference;
    label: string;
    icon?: string | undefined;
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
      passengerId: undefined,
      ...(!isPlacardCustomized
        ? { placard: formatDefaultPlacard(nextPassenger) }
        : {}),
    });
  }

  function setPassengerName(newPassenger: string) {
    patch({
      passenger: newPassenger,
      passengerId: undefined,
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
      costCenterLabel: selected?.label ?? code,
    });
  }

  const effectivePlacard =
    draft.placard ??
    formatDefaultPlacard(
      draft.passengerMode === "self" ? draft.bookedBy : draft.passenger,
    );

  const passengerFieldId = enterpriseBookingFieldId("passenger");
  const passengerHintId = `${passengerFieldId}-hint`;
  const placardFieldId = enterpriseBookingFieldId("placard");
  const placardHintId = `${placardFieldId}-hint`;
  const pickupFieldId = enterpriseBookingFieldId("pickup");
  const dropoffFieldId = enterpriseBookingFieldId("dropoff");
  const dateFieldId = enterpriseBookingFieldId("date");
  const timeFieldId = enterpriseBookingFieldId("time");
  const windowErrorId = enterpriseBookingFieldId("window-error");
  const airportHintId = enterpriseBookingFieldId("airport-hint");
  const airportDirectionLabelId = enterpriseBookingFieldId(
    "airport-direction-label",
  );
  const terminalFieldId = enterpriseBookingFieldId("terminal");
  const flightFieldId = enterpriseBookingFieldId("flight");
  const luggageFieldId = enterpriseBookingFieldId("luggage");
  const costCenterFieldId = enterpriseBookingFieldId("cost-center");
  const costCenterHintId = `${costCenterFieldId}-hint`;
  const bookedByFieldId = enterpriseBookingFieldId("booked-by");
  const contactFieldId = enterpriseBookingFieldId("contact");
  const vehicleLabelId = enterpriseBookingFieldId("vehicle-preference-label");
  const notesFieldId = enterpriseBookingFieldId("notes");

  const windowErrorTitle = timeValidation.isPast
    ? resolveCopyByLocale(
        locale,
        "用車時間不能為過去時間",
        "Reservation Time In Past",
      )
    : resolveCopyByLocale(
        locale,
        "未達最短提前預約時間",
        "Advance Lead Time Not Met",
      );
  const windowErrorBody =
    timeValidation.errorMessage ??
    resolveCopyByLocale(
      locale,
      `最早可預約時間為 ${timeValidation.earliestAllowedDisplay}`,
      `Earliest allowed time is ${timeValidation.earliestAllowedDisplay}`,
    );

  const formThemeVars = {
    "--ent-focus-ring": t.primary,
    "--ent-focus-bg": t.primaryBg,
    "--ent-danger-ring": t.danger,
    "--ent-danger-bg": t.dangerBg,
  } as CSSProperties;

  return (
    <div className="ent-form-layout" style={formThemeVars}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Passenger Card */}
        <ECard
          t={t}
          title={tr("new.field.passenger")}
          sub={tr("card.sub.passenger")}
        >
          <SegmentedControl
            name="passenger-mode"
            groupLabel={tr("new.field.passenger")}
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
                  {resolveCopyByLocale(locale, "本人用車", "Self Booking")}
                </EPill>
              </div>
            </div>
          ) : (
            <>
              <div style={{ height: 14 }} />
              <BookingField
                fieldId={passengerFieldId}
                label={tr("new.passenger.choose")}
                req
                hint={tr("new.passenger.chooseHint")}
                hintId={passengerHintId}
              >
                <TextControl
                  id={passengerFieldId}
                  icon="search"
                  required
                  value={draft.passenger}
                  onChange={setPassengerName}
                  aria-describedby={passengerHintId}
                  placeholder={resolveCopyByLocale(
                    locale,
                    "輸入訪客或同事姓名",
                    "Enter guest or colleague name",
                  )}
                />
              </BookingField>
              <div
                style={{
                  display: "flex",
                  gap: 7,
                  flexWrap: "wrap",
                  marginTop: 12,
                }}
              >
                {passengerOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className="ent-booking-chip-btn"
                    onClick={() => {
                      patch({
                        passengerMode: "other",
                        passenger: option.name,
                        passengerId: option.passengerId,
                        ...(!isPlacardCustomized
                          ? { placard: formatDefaultPlacard(option.name) }
                          : {}),
                      });
                    }}
                    style={chipButtonStyle()}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Placard sync & explicit editing */}
          <div style={{ marginTop: 14 }}>
            <BookingField
              fieldId={placardFieldId}
              label={resolveCopyByLocale(
                locale,
                "舉牌姓名 placard",
                "Placard Welcome Name",
              )}
              hint={resolveCopyByLocale(
                locale,
                "司機接送時手持舉牌顯示的文字，預設與乘客姓名同步，亦可自行編輯",
                "Name displayed on the welcome placard. Synced with passenger name by default, can be edited directly.",
              )}
              hintId={placardHintId}
            >
              <TextControl
                id={placardFieldId}
                icon="user"
                value={effectivePlacard}
                onChange={handlePlacardChange}
                aria-describedby={placardHintId}
                placeholder={resolveCopyByLocale(
                  locale,
                  "例如：林宜君 様",
                  "e.g. Sato 様",
                )}
              />
            </BookingField>
          </div>
        </ECard>

        {/* Route and Schedule Card */}
        <ECard
          t={t}
          title={tr("new.card.booking")}
          sub={tr("card.sub.pickupDropoffWindow")}
        >
          <div className="ent-fields-two-cols">
            <BookingField
              fieldId={pickupFieldId}
              label={tr("new.field.pickup")}
              req
              full
            >
              <TextControl
                id={pickupFieldId}
                icon="pin"
                required
                value={draft.pickup}
                onChange={(pickup) =>
                  patch({ pickup, pickupAddressId: undefined })
                }
                onFocus={() => setAddressTarget("pickup")}
              />
            </BookingField>
            <BookingField
              fieldId={dropoffFieldId}
              label={tr("new.field.dropoff")}
              req
              full
            >
              <TextControl
                id={dropoffFieldId}
                icon="pin"
                required
                value={draft.dropoff}
                onChange={(dropoff) =>
                  patch({ dropoff, dropoffAddressId: undefined })
                }
                onFocus={() => setAddressTarget("dropoff")}
              />
            </BookingField>
            <BookingField
              fieldId={dateFieldId}
              label={tr("new.field.window")}
              req
            >
              <TextControl
                id={dateFieldId}
                icon="cal"
                type="date"
                required
                value={draft.reservationDate}
                onChange={(reservationDate) => patch({ reservationDate })}
                invalid={isReservationWindowInvalid}
                aria-describedby={
                  isReservationWindowInvalid ? windowErrorId : undefined
                }
                mono
              />
            </BookingField>
            <BookingField
              fieldId={timeFieldId}
              label={tr("new.field.time")}
              req
            >
              <TextControl
                id={timeFieldId}
                icon="clock"
                type="time"
                required
                value={draft.reservationTime}
                onChange={(reservationTime) => patch({ reservationTime })}
                invalid={isReservationWindowInvalid}
                aria-describedby={
                  isReservationWindowInvalid ? windowErrorId : undefined
                }
                mono
              />
            </BookingField>
          </div>

          {/* Real-time date & time error banner if invalid (single live alert) */}
          {isReservationWindowInvalid ? (
            <div
              id={windowErrorId}
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              style={{ marginTop: 12 }}
            >
              <EBanner
                t={t}
                tone="danger"
                icon="alert"
                title={windowErrorTitle}
                body={windowErrorBody}
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
            {addressOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className="ent-booking-chip-btn"
                onClick={() =>
                  patch(
                    addressTarget === "pickup"
                      ? {
                          pickup: option.address,
                          pickupAddressId: option.addressId,
                        }
                      : {
                          dropoff: option.address,
                          dropoffAddressId: option.addressId,
                        },
                  )
                }
                style={chipButtonStyle()}
              >
                {option.label}
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
          sub={<span id={airportHintId}>{tr("new.airport.hint")}</span>}
        >
          <div className="ent-fields-two-cols">
            <BookingGroupField
              labelId={airportDirectionLabelId}
              label={tr("new.airport.direction")}
            >
              <SegmentedControl<EnterpriseAirportDirection>
                name="airport-direction"
                groupLabel={tr("new.airport.direction")}
                ariaLabelledBy={airportDirectionLabelId}
                ariaDescribedBy={airportHintId}
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
            </BookingGroupField>
            <BookingField
              fieldId={terminalFieldId}
              label={tr("new.airport.terminal")}
            >
              <TextControl
                id={terminalFieldId}
                value={draft.terminal}
                onChange={(terminal) => patch({ terminal })}
                aria-describedby={airportHintId}
              />
            </BookingField>
            <BookingField
              fieldId={flightFieldId}
              label={tr("new.airport.flight")}
            >
              <TextControl
                id={flightFieldId}
                icon="flag"
                value={draft.flight}
                onChange={(flight) => patch({ flight })}
                aria-describedby={airportHintId}
                mono
              />
            </BookingField>
            <BookingField
              fieldId={luggageFieldId}
              label={tr("new.airport.luggage")}
            >
              <TextControl
                id={luggageFieldId}
                inputMode="numeric"
                value={draft.luggageCount}
                onChange={(luggageCount) => patch({ luggageCount })}
                aria-describedby={airportHintId}
              />
            </BookingField>
          </div>
        </ECard>

        {/* Policy, Cost Center and Contact Card */}
        <ECard
          t={t}
          title={tr("new.card.policy")}
          sub={tr("card.sub.costVehicleNotes")}
        >
          <div className="ent-fields-two-cols">
            <BookingField
              fieldId={costCenterFieldId}
              label={tr("new.field.costCenter")}
              req
              full
              hint={tr("new.costCenter.hint")}
              hintId={costCenterHintId}
            >
              {hasCostCenterOptions ? (
                <SelectControl
                  id={costCenterFieldId}
                  required
                  value={draft.costCenterCode}
                  onChange={setCostCenterCode}
                  options={costCenterOptions}
                  aria-describedby={costCenterHintId}
                />
              ) : (
                <TextControl
                  id={costCenterFieldId}
                  required
                  value={draft.costCenterCode}
                  onChange={setCostCenterCode}
                  aria-describedby={costCenterHintId}
                />
              )}
            </BookingField>
            <BookingField
              fieldId={bookedByFieldId}
              label={tr("new.field.bookedBy")}
            >
              <TextControl
                id={bookedByFieldId}
                icon="user"
                value={draft.bookedBy}
                onChange={(bookedBy) => {
                  patch({
                    bookedBy,
                    ...(draft.passengerMode === "self"
                      ? {
                          passenger: bookedBy,
                          passengerId: undefined,
                          ...(!isPlacardCustomized
                            ? { placard: formatDefaultPlacard(bookedBy) }
                            : {}),
                        }
                      : {}),
                  });
                }}
              />
            </BookingField>
            <BookingField
              fieldId={contactFieldId}
              label={tr("new.field.contact")}
              req
            >
              <TextControl
                id={contactFieldId}
                icon="phone"
                inputMode="tel"
                required
                value={draft.onsiteContactPhone}
                onChange={(onsiteContactPhone) => patch({ onsiteContactPhone })}
                mono
              />
            </BookingField>
            <BookingGroupField
              labelId={vehicleLabelId}
              label={tr("new.policy.vehicle")}
              full
            >
              <SegmentedControl<EnterpriseVehiclePreference>
                name="vehicle-preference"
                groupLabel={tr("new.policy.vehicle")}
                ariaLabelledBy={vehicleLabelId}
                value={draft.vehicle}
                onChange={(vehicle) => patch({ vehicle })}
                options={vehicleOptions}
              />
            </BookingGroupField>
            <BookingField
              fieldId={notesFieldId}
              label={tr("new.field.notes")}
              full
            >
              <TextAreaControl
                id={notesFieldId}
                value={draft.notes}
                onChange={(notes) => patch({ notes })}
              />
            </BookingField>
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

        {isReservationWindowInvalid ? (
          <div
            data-testid="enterprise-booking-aside-time-error"
            aria-hidden="true"
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
          aria-describedby={
            isReservationWindowInvalid ? windowErrorId : undefined
          }
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
