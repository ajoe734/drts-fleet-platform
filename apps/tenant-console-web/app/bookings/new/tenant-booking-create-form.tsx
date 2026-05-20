"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useState, useTransition } from "react";
import type {
  BusinessDispatchSubtype,
  TenantAddressRecord,
  TenantApprovalEvaluationResult,
  TenantBookingQuotaImpactPreview,
  TenantCostCenterRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  buildTenantBookingCreateCommand,
  getDefaultDateTimeLocalValue,
  getBlockingTenantBookingDraftErrors,
  isMissingRequiredBookingFields,
  isReadyForTenantBookingPolicyPreview,
  parseAmountMajor,
  type TenantBookingDraftValues,
} from "./tenant-booking-create-form-utils";

const BUSINESS_SUBTYPE_OPTIONS: Array<{
  value: BusinessDispatchSubtype;
  label: string;
}> = [
  {
    value: "credit_card_airport_transfer",
    label: "Credit-card airport transfer",
  },
  { value: "enterprise_dispatch", label: "Enterprise dispatch" },
];

const CURRENCY = "TWD";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const layoutStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
};

const mainCardStyle: CSSProperties = {
  flex: "1.4 1 520px",
  minWidth: 0,
};

const sideCardStyle: CSSProperties = {
  flex: "1 1 340px",
  minWidth: 0,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const compactFieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const spanAllStyle: CSSProperties = {
  gridColumn: "1 / -1",
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  fontFamily: th.fontFamily,
  boxSizing: "border-box",
};

const nativeMonoInputStyle: CSSProperties = {
  ...nativeInputStyle,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const nativeTextareaStyle: CSSProperties = {
  ...nativeInputStyle,
  minHeight: 92,
  resize: "vertical",
};

const sectionLabelStyle: CSSProperties = {
  margin: "16px 0 10px",
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const checklistStyle: CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: 18,
  color: th.text,
  fontSize: 12,
  lineHeight: 1.5,
};

const toggleGridStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const toggleLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: th.text,
};

const toggleInputStyle: CSSProperties = {
  accentColor: th.accent,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 12,
  flexWrap: "wrap",
};

const growStyle: CSSProperties = {
  flex: 1,
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "5px 10px",
  fontSize: 12,
  height: 28,
  fontWeight: 500,
  background: th.accent,
  color: "#fff",
  border: `1px solid ${th.accent}`,
  borderRadius: 7,
  lineHeight: 1,
  fontFamily: th.fontFamily,
};

const errorStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 7,
  border: `1px solid ${th.dangerBorder}`,
  background: th.dangerBg,
  color: th.danger,
  fontSize: 12,
};

const mutedCopyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: th.textMuted,
  lineHeight: 1.5,
};

function formatCurrency(amountMinor: number | null | undefined) {
  if (amountMinor == null || Number.isNaN(amountMinor)) {
    return "Not provided";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  return `${value}%`;
}

function describeSubtype(value: BusinessDispatchSubtype) {
  return BUSINESS_SUBTYPE_OPTIONS.find((option) => option.value === value)
    ?.label;
}

function describeDirection(value: "" | "pickup" | "dropoff") {
  switch (value) {
    case "pickup":
      return "Pickup";
    case "dropoff":
      return "Dropoff";
    default:
      return "Not set";
  }
}

function describeDecision(result: TenantApprovalEvaluationResult | null) {
  const decision = result?.outcome?.decision ?? "allow";
  switch (decision) {
    case "require_approval":
      return "Approval required";
    case "block":
      return "Blocked";
    case "warn":
      return "Warning";
    case "manual_review":
      return "Manual review";
    default:
      return "Allowed";
  }
}

function describeImpactLabel(
  scope: "tenant" | "cost_center",
  code: string | null,
) {
  if (scope === "cost_center") {
    return code ? `Cost center ${code}` : "Cost center";
  }
  return "Tenant";
}

function getDecisionTone(
  result: TenantApprovalEvaluationResult | null,
):
  | "accent"
  | "danger"
  | "info"
  | "neutral"
  | "success"
  | "warn" {
  switch (result?.outcome?.decision) {
    case "block":
      return "danger";
    case "require_approval":
      return "warn";
    case "manual_review":
      return "info";
    case "warn":
      return "warn";
    default:
      return "accent";
  }
}

export function TenantBookingCreateForm({
  passengers,
  addresses,
  costCenters,
}: {
  passengers: TenantPassengerRecord[];
  addresses: TenantAddressRecord[];
  costCenters: TenantCostCenterRecord[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initialPickupAddress = addresses[0] ?? null;
  const initialDropoffAddress = addresses[1] ?? addresses[0] ?? null;

  const [businessDispatchSubtype, setBusinessDispatchSubtype] =
    useState<BusinessDispatchSubtype>("credit_card_airport_transfer");
  const [selectedPassengerId, setSelectedPassengerId] = useState("");
  const [pickupAddressId, setPickupAddressId] = useState(
    initialPickupAddress?.addressId ?? "",
  );
  const [dropoffAddressId, setDropoffAddressId] = useState(
    initialDropoffAddress?.addressId ?? "",
  );
  const [pickupAddress, setPickupAddress] = useState(
    initialPickupAddress?.addressText ?? "",
  );
  const [pickupLat, setPickupLat] = useState(
    initialPickupAddress?.lat == null ? "" : String(initialPickupAddress.lat),
  );
  const [pickupLng, setPickupLng] = useState(
    initialPickupAddress?.lng == null ? "" : String(initialPickupAddress.lng),
  );
  const [dropoffAddress, setDropoffAddress] = useState(
    initialDropoffAddress?.addressText ?? "",
  );
  const [dropoffLat, setDropoffLat] = useState(
    initialDropoffAddress?.lat == null ? "" : String(initialDropoffAddress.lat),
  );
  const [dropoffLng, setDropoffLng] = useState(
    initialDropoffAddress?.lng == null ? "" : String(initialDropoffAddress.lng),
  );
  const [reservationWindowStart, setReservationWindowStart] = useState("");
  const [reservationWindowEnd, setReservationWindowEnd] = useState("");
  const [passengerName, setPassengerName] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [benefitReference, setBenefitReference] = useState("");
  const [vehiclePreference, setVehiclePreference] = useState("");
  const [direction, setDirection] = useState<"" | "pickup" | "dropoff">("");
  const [flightNo, setFlightNo] = useState("");
  const [terminal, setTerminal] = useState("");
  const [luggageCount, setLuggageCount] = useState("");
  const [notes, setNotes] = useState("");
  const [bookedByName, setBookedByName] = useState("");
  const [bookedByEmail, setBookedByEmail] = useState("");
  const [onsiteContactName, setOnsiteContactName] = useState("");
  const [onsiteContactPhone, setOnsiteContactPhone] = useState("");
  const [quotedFare, setQuotedFare] = useState("");
  const [signoffRequired, setSignoffRequired] = useState(false);
  const [expenseProofRequired, setExpenseProofRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [policyRefreshing, setPolicyRefreshing] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quotaPreview, setQuotaPreview] =
    useState<TenantBookingQuotaImpactPreview | null>(null);
  const [approvalEvaluation, setApprovalEvaluation] =
    useState<TenantApprovalEvaluationResult | null>(null);

  const estimatedAmountMinor = parseAmountMajor(quotedFare);
  const draft: TenantBookingDraftValues = {
    businessDispatchSubtype,
    selectedPassengerId,
    pickupAddressId,
    dropoffAddressId,
    pickupAddress,
    pickupLat,
    pickupLng,
    dropoffAddress,
    dropoffLat,
    dropoffLng,
    reservationWindowStart,
    reservationWindowEnd,
    passengerName,
    passengerPhone,
    costCenter,
    benefitReference,
    vehiclePreference,
    direction,
    flightNo,
    terminal,
    luggageCount,
    notes,
    bookedByName,
    bookedByEmail,
    onsiteContactName,
    onsiteContactPhone,
    estimatedAmount: quotedFare,
    signoffRequired,
    expenseProofRequired,
  };
  const draftValidationErrors = getBlockingTenantBookingDraftErrors(draft);
  const missingRequiredFields = isMissingRequiredBookingFields(
    draft,
    costCenters.length > 0,
  );
  const policyPreviewReady = isReadyForTenantBookingPolicyPreview(draft);

  useEffect(() => {
    setReservationWindowStart(
      (value) => value || getDefaultDateTimeLocalValue(30),
    );
    setReservationWindowEnd(
      (value) => value || getDefaultDateTimeLocalValue(60),
    );
  }, []);

  useEffect(() => {
    const passenger = passengers.find(
      (row) => row.passengerId === selectedPassengerId,
    );
    if (!passenger) {
      return;
    }

    setPassengerName(passenger.fullName);
    setPassengerPhone(passenger.mobile ?? "");
  }, [passengers, selectedPassengerId]);

  useEffect(() => {
    const pickup = addresses.find((row) => row.addressId === pickupAddressId);
    if (!pickup) {
      return;
    }

    setPickupAddress(pickup.addressText);
    setPickupLat(pickup.lat == null ? "" : String(pickup.lat));
    setPickupLng(pickup.lng == null ? "" : String(pickup.lng));
  }, [addresses, pickupAddressId]);

  useEffect(() => {
    const dropoff = addresses.find((row) => row.addressId === dropoffAddressId);
    if (!dropoff) {
      return;
    }

    setDropoffAddress(dropoff.addressText);
    setDropoffLat(dropoff.lat == null ? "" : String(dropoff.lat));
    setDropoffLng(dropoff.lng == null ? "" : String(dropoff.lng));
  }, [addresses, dropoffAddressId]);

  useEffect(() => {
    if (!policyPreviewReady) {
      setQuotaPreview(null);
      setApprovalEvaluation(null);
      setPolicyError(null);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setPolicyRefreshing(true);
      setPolicyError(null);
      try {
        const response = await fetch("/api/bookings/policy-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessDispatchSubtype,
            selectedPassengerId: selectedPassengerId || null,
            passengerName,
            passengerPhone,
            passengerRole:
              passengers.find((row) => row.passengerId === selectedPassengerId)
                ?.roles?.[0] ?? null,
            reservationWindowStart: new Date(
              reservationWindowStart,
            ).toISOString(),
            reservationWindowEnd: new Date(reservationWindowEnd).toISOString(),
            costCenter: costCenter.trim() || null,
            estimatedAmountMinor,
            vehiclePreference: vehiclePreference.trim() || null,
            direction: direction || null,
            flightNo: flightNo.trim() || null,
            signoffRequired,
            expenseProofRequired,
          }),
        });
        const result = (await response.json()) as {
          error?: string;
          quotaPreview?: TenantBookingQuotaImpactPreview;
          approvalEvaluation?: TenantApprovalEvaluationResult;
        };

        if (!response.ok) {
          throw new Error(
            result.error ?? `Policy preview failed (HTTP ${response.status}).`,
          );
        }

        setQuotaPreview(result.quotaPreview ?? null);
        setApprovalEvaluation(result.approvalEvaluation ?? null);
      } catch (error) {
        setPolicyError(
          error instanceof Error
            ? error.message
            : "Unknown policy preview failure.",
        );
      } finally {
        setPolicyRefreshing(false);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [
    businessDispatchSubtype,
    costCenter,
    direction,
    dropoffAddress,
    estimatedAmountMinor,
    expenseProofRequired,
    flightNo,
    passengerName,
    passengerPhone,
    passengers,
    policyPreviewReady,
    pickupAddress,
    reservationWindowEnd,
    reservationWindowStart,
    selectedPassengerId,
    signoffRequired,
    vehiclePreference,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (draftValidationErrors.length > 0) {
      setSubmitError(draftValidationErrors[0] ?? "Booking draft is invalid.");
      return;
    }

    if (approvalEvaluation?.outcome?.blocked) {
      setSubmitError(
        "This booking is currently blocked by tenant approval or quota policy.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const command = buildTenantBookingCreateCommand({
        draft,
        passengers,
      });

      const response = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = (await response.json()) as {
        error?: string;
        booking?: { bookingId: string };
      };

      if (!response.ok || !result.booking?.bookingId) {
        throw new Error(
          result.error ?? `Create booking failed (HTTP ${response.status}).`,
        );
      }

      startTransition(() => {
        router.push(`/bookings/${result.booking!.bookingId}`);
        router.refresh();
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unknown booking failure.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const activePassenger = passengers.find(
    (row) => row.passengerId === selectedPassengerId,
  );
  const passengerPhoneLocked =
    !!activePassenger && !!activePassenger.mobile?.trim();
  const decision = approvalEvaluation?.outcome?.decision ?? "allow";
  const submitDisabled =
    submitting ||
    pending ||
    policyRefreshing ||
    approvalEvaluation?.outcome?.blocked === true ||
    missingRequiredFields;

  return (
    <form onSubmit={handleSubmit} style={layoutStyle}>
      <CanvasCard
        theme={th}
        style={mainCardStyle}
        title="行程"
        subtitle="核心行程資訊維持在左欄；地址簿可先帶入，再直接微調文字。"
      >
        <div style={fieldGridStyle}>
          <div>
            <CanvasField theme={th} label="服務類型" required>
              <select
                onChange={(event) =>
                  setBusinessDispatchSubtype(
                    event.target.value as BusinessDispatchSubtype,
                  )
                }
                style={nativeInputStyle}
                value={businessDispatchSubtype}
              >
                {BUSINESS_SUBTYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Saved pickup">
              <select
                onChange={(event) => setPickupAddressId(event.target.value)}
                style={nativeInputStyle}
                value={pickupAddressId}
              >
                <option value="">Manual pickup</option>
                {addresses.map((address) => (
                  <option key={address.addressId} value={address.addressId}>
                    {address.addressName}
                  </option>
                ))}
              </select>
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Saved drop-off">
              <select
                onChange={(event) => setDropoffAddressId(event.target.value)}
                style={nativeInputStyle}
                value={dropoffAddressId}
              >
                <option value="">Manual drop-off</option>
                {addresses.map((address) => (
                  <option key={address.addressId} value={address.addressId}>
                    {address.addressName}
                  </option>
                ))}
              </select>
            </CanvasField>
          </div>

          <div style={spanAllStyle}>
            <CanvasField
              theme={th}
              label="Pickup address"
              hint="可先從地址簿選取，再視需要直接調整文字。"
              required
            >
              <input
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupAddress(event.target.value);
                }}
                required
                style={nativeInputStyle}
                type="text"
                value={pickupAddress}
              />
            </CanvasField>
          </div>

          <div style={spanAllStyle}>
            <CanvasField theme={th} label="Drop-off address" required>
              <input
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffAddress(event.target.value);
                }}
                required
                style={nativeInputStyle}
                type="text"
                value={dropoffAddress}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="出發時間" required>
              <input
                onChange={(event) =>
                  setReservationWindowStart(event.target.value)
                }
                required
                style={nativeInputStyle}
                type="datetime-local"
                value={reservationWindowStart}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="結束時間" required>
              <input
                onChange={(event) => setReservationWindowEnd(event.target.value)}
                required
                style={nativeInputStyle}
                type="datetime-local"
                value={reservationWindowEnd}
              />
            </CanvasField>
          </div>

        </div>

        <div style={sectionLabelStyle}>Trip options</div>
        <div style={compactFieldGridStyle}>
          <div>
            <CanvasField theme={th} label="Direction">
              <select
                onChange={(event) =>
                  setDirection(event.target.value as "" | "pickup" | "dropoff")
                }
                style={nativeInputStyle}
                value={direction}
              >
                <option value="">Not set</option>
                <option value="pickup">Pickup</option>
                <option value="dropoff">Dropoff</option>
              </select>
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Flight no.">
              <input
                onChange={(event) => setFlightNo(event.target.value)}
                style={nativeInputStyle}
                type="text"
                value={flightNo}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Terminal">
              <input
                onChange={(event) => setTerminal(event.target.value)}
                style={nativeInputStyle}
                type="text"
                value={terminal}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Luggage count">
              <input
                inputMode="numeric"
                onChange={(event) => setLuggageCount(event.target.value)}
                style={nativeInputStyle}
                type="text"
                value={luggageCount}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Vehicle preference">
              <input
                onChange={(event) => setVehiclePreference(event.target.value)}
                style={nativeInputStyle}
                type="text"
                value={vehiclePreference}
              />
            </CanvasField>
          </div>
        </div>

        <div style={sectionLabelStyle}>Map coordinates</div>
        <div style={compactFieldGridStyle}>
          <div>
            <CanvasField theme={th} label="Pickup lat">
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupLat(event.target.value);
                }}
                style={nativeMonoInputStyle}
                type="text"
                value={pickupLat}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Pickup lng">
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupLng(event.target.value);
                }}
                style={nativeMonoInputStyle}
                type="text"
                value={pickupLng}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Drop-off lat">
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffLat(event.target.value);
                }}
                style={nativeMonoInputStyle}
                type="text"
                value={dropoffLat}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Drop-off lng">
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffLng(event.target.value);
                }}
                style={nativeMonoInputStyle}
                type="text"
                value={dropoffLng}
              />
            </CanvasField>
          </div>
        </div>
      </CanvasCard>

      <CanvasCard
        theme={th}
        style={sideCardStyle}
        title="關聯與審批"
        subtitle="乘客、成本中心與審批結果集中在右欄，保持送出前可讀。"
      >
        <div style={fieldGridStyle}>
          <div>
            <CanvasField
              theme={th}
              label="乘客"
              hint="可從通訊錄代訂，或切回手動輸入。"
              required
            >
              <select
                onChange={(event) => setSelectedPassengerId(event.target.value)}
                style={nativeInputStyle}
                value={selectedPassengerId}
              >
                <option value="">Manual passenger entry</option>
                {passengers.map((passenger) => (
                  <option
                    key={passenger.passengerId}
                    value={passenger.passengerId}
                  >
                    {passenger.fullName}
                    {passenger.employeeNo ? ` · ${passenger.employeeNo}` : ""}
                  </option>
                ))}
              </select>
            </CanvasField>
          </div>

          <div>
            <CanvasField
              theme={th}
              label="Passenger name"
              hint={
                activePassenger
                  ? "Passenger name stays locked to the selected directory record."
                  : "Manual passenger entry remains available."
              }
              required
            >
              <input
                disabled={!!activePassenger}
                onChange={(event) => setPassengerName(event.target.value)}
                required
                style={nativeInputStyle}
                type="text"
                value={passengerName}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField
              theme={th}
              label="Passenger phone"
              hint={
                activePassenger
                  ? passengerPhoneLocked
                    ? "Passenger phone comes from the selected directory record."
                    : "This directory passenger has no published phone number; provide one here."
                  : "Manual passenger entry requires a direct contact phone."
              }
              required
            >
              <input
                disabled={passengerPhoneLocked}
                onChange={(event) => setPassengerPhone(event.target.value)}
                required
                style={nativeInputStyle}
                type="tel"
                value={passengerPhone}
              />
            </CanvasField>
          </div>

          {costCenters.length > 0 ? (
            <div>
              <CanvasField theme={th} label="Cost center" required>
                <select
                  onChange={(event) => setCostCenter(event.target.value)}
                  required
                  style={nativeInputStyle}
                  value={costCenter}
                >
                  <option value="">Select a cost center</option>
                  {costCenters.map((center) => (
                    <option key={center.code} value={center.code}>
                      {center.code} · {center.name}
                    </option>
                  ))}
                </select>
              </CanvasField>
            </div>
          ) : (
            <div>
              <CanvasField
                theme={th}
                label="Cost center"
                hint="No active directory rows are published for this tenant."
              >
                <input
                  onChange={(event) => setCostCenter(event.target.value)}
                  placeholder="Legacy free-text cost center"
                  style={nativeInputStyle}
                  type="text"
                  value={costCenter}
                />
              </CanvasField>
            </div>
          )}

          <div>
            <CanvasField theme={th} label={`Estimated spend (${CURRENCY})`}>
              <input
                inputMode="decimal"
                onChange={(event) => setQuotedFare(event.target.value)}
                placeholder="1580"
                style={nativeInputStyle}
                type="text"
                value={quotedFare}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Benefit reference">
              <input
                onChange={(event) => setBenefitReference(event.target.value)}
                style={nativeMonoInputStyle}
                type="text"
                value={benefitReference}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Booked by name">
              <input
                onChange={(event) => setBookedByName(event.target.value)}
                style={nativeInputStyle}
                type="text"
                value={bookedByName}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Booked by email">
              <input
                onChange={(event) => setBookedByEmail(event.target.value)}
                style={nativeInputStyle}
                type="email"
                value={bookedByEmail}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Onsite contact">
              <input
                onChange={(event) => setOnsiteContactName(event.target.value)}
                style={nativeInputStyle}
                type="text"
                value={onsiteContactName}
              />
            </CanvasField>
          </div>

          <div>
            <CanvasField theme={th} label="Onsite phone">
              <input
                onChange={(event) => setOnsiteContactPhone(event.target.value)}
                style={nativeInputStyle}
                type="tel"
                value={onsiteContactPhone}
              />
            </CanvasField>
          </div>

          <div style={spanAllStyle}>
            <CanvasField theme={th} label="Notes">
              <textarea
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                style={nativeTextareaStyle}
                value={notes}
              />
            </CanvasField>
          </div>
        </div>

        <div style={sectionLabelStyle}>Policy evaluation</div>

        {policyError ? (
          <div role="alert" style={errorStyle}>
            {policyError}
          </div>
        ) : null}

        <div style={pillRowStyle}>
          <CanvasPill theme={th} tone={getDecisionTone(approvalEvaluation)}>
            {describeDecision(approvalEvaluation)}
          </CanvasPill>
          <CanvasPill theme={th} tone="accent">
            {policyRefreshing ? "Auto refresh" : "Ready"}
          </CanvasPill>
          {costCenter ? (
            <CanvasPill theme={th} tone="info">
              {costCenter}
            </CanvasPill>
          ) : null}
        </div>

        <div style={{ height: 12 }} />

        <CanvasDL
          theme={th}
          cols={1}
          items={[
            {
              k: "預估費用",
              v: formatCurrency(estimatedAmountMinor),
              mono: true,
            },
            {
              k: "審批",
              v: describeDecision(approvalEvaluation),
            },
            {
              k: "服務類型",
              v: describeSubtype(businessDispatchSubtype) ?? "Not set",
            },
            {
              k: "方向",
              v: describeDirection(direction),
            },
            {
              k: "Passenger role",
              v: activePassenger?.roles?.[0] ?? "Not published",
            },
          ]}
        />

        {approvalEvaluation?.approvalPlan ? (
          <>
            <div style={sectionLabelStyle}>Approval plan</div>
            <div style={pillRowStyle}>
              <CanvasPill theme={th} tone="accent">
                Mode: {approvalEvaluation.approvalPlan.approvalMode}
              </CanvasPill>
              <CanvasPill theme={th} tone="info">
                Timeout: {approvalEvaluation.approvalPlan.timeoutHours}h
              </CanvasPill>
              <CanvasPill theme={th} tone="warn">
                Fallback: {approvalEvaluation.approvalPlan.fallbackPolicy}
              </CanvasPill>
            </div>
            <ul style={checklistStyle}>
              {approvalEvaluation.approvalPlan.approvers.map((approver) => (
                <li
                  key={`${approver.kind}-${approver.userId ?? approver.roleCode ?? approver.costCenterCode ?? "unknown"}`}
                >
                  {approver.displayName ??
                    approver.userId ??
                    approver.roleCode ??
                    approver.costCenterCode ??
                    approver.kind}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div style={sectionLabelStyle}>Quota impact</div>

        {quotaPreview?.impacts?.length ? (
          <CanvasDL
            theme={th}
            cols={1}
            items={quotaPreview.impacts.map((impact) => ({
              k: `${describeImpactLabel(impact.scope, impact.costCenterCode)} · ${impact.dimension}`,
              v: `before ${impact.remainingBefore ?? "n/a"} / ${impact.limitValue ?? "n/a"} · after ${impact.remainingAfter ?? "n/a"} · remaining ${formatPercent(impact.remainingPercentAfter)} · ${impact.triggered}`,
              mono: true,
            }))}
          />
        ) : (
          <p style={mutedCopyStyle}>
            Fill the core booking fields to get quota impact feedback.
          </p>
        )}

        {(approvalEvaluation?.warnings?.length ?? 0) > 0 ? (
          <>
            <div style={sectionLabelStyle}>Warnings</div>
            <ul style={checklistStyle}>
              {(approvalEvaluation?.warnings ?? []).map((warning) => (
                <li key={`${warning.source}-${warning.code}`}>
                  {warning.message} ({warning.code})
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div style={sectionLabelStyle}>Extra controls</div>
        <div style={toggleGridStyle}>
          <label style={toggleLabelStyle}>
            <input
              checked={signoffRequired}
              onChange={(event) => setSignoffRequired(event.target.checked)}
              style={toggleInputStyle}
              type="checkbox"
            />
            Signoff required
          </label>
          <label style={toggleLabelStyle}>
            <input
              checked={expenseProofRequired}
              onChange={(event) =>
                setExpenseProofRequired(event.target.checked)
              }
              style={toggleInputStyle}
              type="checkbox"
            />
            Expense proof required
          </label>
        </div>

        {submitError ? (
          <div role="alert" style={{ ...errorStyle, marginTop: 12 }}>
            {submitError}
          </div>
        ) : draftValidationErrors.length > 0 ? (
          <div role="alert" style={{ ...errorStyle, marginTop: 12 }}>
            {draftValidationErrors[0]}
          </div>
        ) : null}

        <div style={actionRowStyle}>
          <CanvasBtn theme={th} disabled>
            取消
          </CanvasBtn>
          <div style={growStyle} />
          <CanvasBtn theme={th} disabled>
            另存草稿
          </CanvasBtn>
          <button
            disabled={submitDisabled}
            style={{
              ...primaryButtonStyle,
              cursor: submitDisabled ? "not-allowed" : "pointer",
              opacity: submitDisabled ? 0.55 : 1,
            }}
            type="submit"
          >
            {submitting || pending
              ? "Submitting…"
              : decision === "require_approval"
                ? "Submit for approval"
                : "送出預約"}
          </button>
        </div>
      </CanvasCard>
    </form>
  );
}
