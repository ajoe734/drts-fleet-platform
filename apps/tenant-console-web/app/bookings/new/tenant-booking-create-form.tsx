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
    label: "機場接送",
  },
  { value: "enterprise_dispatch", label: "企業派車" },
];

const CURRENCY = "TWD";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const layoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "flex-start",
};

const responsiveLayoutStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const columnStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  minWidth: 0,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const compactFieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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

const sectionCopyStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: 1.5,
  color: th.textMuted,
};

const summaryCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const summaryBlockStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const nativeButtonRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
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

const supportCopyStyle: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  color: th.textDim,
  lineHeight: 1.45,
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
      return "接機";
    case "dropoff":
      return "送機";
    default:
      return "未指定";
  }
}

function describeDecision(result: TenantApprovalEvaluationResult | null) {
  const decision = result?.outcome?.decision ?? "allow";
  switch (decision) {
    case "require_approval":
      return "需要審批";
    case "block":
      return "已阻擋";
    case "warn":
      return "警示";
    case "manual_review":
      return "人工審查";
    default:
      return "可送出";
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
): "accent" | "danger" | "info" | "neutral" | "success" | "warn" {
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
  const policyStateTone = policyRefreshing ? "info" : "accent";

  return (
    <form onSubmit={handleSubmit} style={responsiveLayoutStyle}>
      <div style={layoutStyle}>
        <div style={columnStyle}>
          <CanvasCard
            theme={th}
            title="行程"
            subtitle="服務類型、乘客與預約時窗維持在同一張卡片，對齊 TN_NewBooking 的主表單節奏。"
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
                <CanvasField
                  theme={th}
                  label="乘客"
                  hint="從通訊錄選擇，或切回手動輸入。"
                  required
                >
                  <select
                    onChange={(event) =>
                      setSelectedPassengerId(event.target.value)
                    }
                    style={nativeInputStyle}
                    value={selectedPassengerId}
                  >
                    <option value="">手動輸入乘客</option>
                    {passengers.map((passenger) => (
                      <option
                        key={passenger.passengerId}
                        value={passenger.passengerId}
                      >
                        {passenger.fullName}
                        {passenger.employeeNo
                          ? ` · ${passenger.employeeNo}`
                          : ""}
                      </option>
                    ))}
                  </select>
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
                <CanvasField
                  theme={th}
                  label="預約結束"
                  hint="保留 reservation window end 供後端審批與派發判斷。"
                  required
                >
                  <input
                    onChange={(event) =>
                      setReservationWindowEnd(event.target.value)
                    }
                    required
                    style={nativeInputStyle}
                    type="datetime-local"
                    value={reservationWindowEnd}
                  />
                </CanvasField>
              </div>

              <div>
                <CanvasField
                  theme={th}
                  label="乘客姓名"
                  hint={
                    activePassenger
                      ? "代訂時會鎖定已選通訊錄資料。"
                      : "未選通訊錄時可直接手動輸入。"
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
                  label="乘客電話"
                  hint={
                    activePassenger
                      ? passengerPhoneLocked
                        ? "電話沿用通訊錄紀錄。"
                        : "此通訊錄乘客未提供電話，請在此補上。"
                      : "手動輸入乘客時需提供聯絡電話。"
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
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="上車與下車"
            subtitle="先選常用地址，再直接微調文字與座標，不額外引入本地 geocoding 流程。"
          >
            <div style={fieldGridStyle}>
              <div>
                <CanvasField theme={th} label="Pickup 常用地址">
                  <select
                    onChange={(event) => setPickupAddressId(event.target.value)}
                    style={nativeInputStyle}
                    value={pickupAddressId}
                  >
                    <option value="">手動輸入 pickup</option>
                    {addresses.map((address) => (
                      <option key={address.addressId} value={address.addressId}>
                        {address.addressName}
                      </option>
                    ))}
                  </select>
                </CanvasField>
              </div>

              <div>
                <CanvasField theme={th} label="Drop 常用地址">
                  <select
                    onChange={(event) =>
                      setDropoffAddressId(event.target.value)
                    }
                    style={nativeInputStyle}
                    value={dropoffAddressId}
                  >
                    <option value="">手動輸入 drop</option>
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
                  label="Pickup 地址"
                  hint="從地址簿選或自由輸入。"
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
                <CanvasField theme={th} label="Drop-off 地址" required>
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
            </div>

            <div style={sectionLabelStyle}>Trip options</div>
            <p style={sectionCopyStyle}>
              方向、航班、航廈與行李資訊維持在主欄，對齊 TN 的補充行程區塊。
            </p>
            <div style={compactFieldGridStyle}>
              <div>
                <CanvasField theme={th} label="接機 / 送機">
                  <select
                    onChange={(event) =>
                      setDirection(
                        event.target.value as "" | "pickup" | "dropoff",
                      )
                    }
                    style={nativeInputStyle}
                    value={direction}
                  >
                    <option value="">未指定</option>
                    <option value="pickup">接機</option>
                    <option value="dropoff">送機</option>
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
                <CanvasField theme={th} label="行李">
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
                <CanvasField theme={th} label="特殊需求">
                  <input
                    onChange={(event) =>
                      setVehiclePreference(event.target.value)
                    }
                    style={nativeInputStyle}
                    type="text"
                    value={vehiclePreference}
                  />
                </CanvasField>
              </div>
            </div>

            <div style={sectionLabelStyle}>Map coordinates</div>
            <p style={sectionCopyStyle}>
              若地址簿未提供完整座標，仍可直接覆寫 pickup / drop 的定位資訊。
            </p>
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
            title="關聯與治理"
            subtitle="成本中心、專案碼、代訂資訊與備註留在已發布的 tenant booking command 範圍內。"
          >
            <div style={fieldGridStyle}>
              {costCenters.length > 0 ? (
                <div>
                  <CanvasField theme={th} label="Cost center" required>
                    <select
                      onChange={(event) => setCostCenter(event.target.value)}
                      required
                      style={nativeInputStyle}
                      value={costCenter}
                    >
                      <option value="">選擇 cost center</option>
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
                    hint="這個 tenant 目前沒有可用的成本中心目錄資料。"
                  >
                    <input
                      onChange={(event) => setCostCenter(event.target.value)}
                      placeholder="自由輸入 cost center"
                      style={nativeInputStyle}
                      type="text"
                      value={costCenter}
                    />
                  </CanvasField>
                </div>
              )}

              <div>
                <CanvasField theme={th} label={`預估費用 (${CURRENCY})`}>
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
                <CanvasField theme={th} label="專案碼">
                  <input
                    onChange={(event) =>
                      setBenefitReference(event.target.value)
                    }
                    style={nativeMonoInputStyle}
                    type="text"
                    value={benefitReference}
                  />
                </CanvasField>
              </div>

              <div>
                <CanvasField theme={th} label="代訂人">
                  <input
                    onChange={(event) => setBookedByName(event.target.value)}
                    style={nativeInputStyle}
                    type="text"
                    value={bookedByName}
                  />
                </CanvasField>
              </div>

              <div>
                <CanvasField theme={th} label="代訂 Email">
                  <input
                    onChange={(event) => setBookedByEmail(event.target.value)}
                    style={nativeInputStyle}
                    type="email"
                    value={bookedByEmail}
                  />
                </CanvasField>
              </div>

              <div>
                <CanvasField theme={th} label="現場聯絡人">
                  <input
                    onChange={(event) =>
                      setOnsiteContactName(event.target.value)
                    }
                    style={nativeInputStyle}
                    type="text"
                    value={onsiteContactName}
                  />
                </CanvasField>
              </div>

              <div>
                <CanvasField theme={th} label="現場電話">
                  <input
                    onChange={(event) =>
                      setOnsiteContactPhone(event.target.value)
                    }
                    style={nativeInputStyle}
                    type="tel"
                    value={onsiteContactPhone}
                  />
                </CanvasField>
              </div>

              <div style={spanAllStyle}>
                <CanvasField theme={th} label="批註">
                  <textarea
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    style={nativeTextareaStyle}
                    value={notes}
                  />
                </CanvasField>
              </div>
            </div>
          </CanvasCard>
        </div>

        <div style={columnStyle}>
          <CanvasCard
            theme={th}
            title="Policy evaluation"
            subtitle="approval posture 與自動刷新狀態直接取自既有 preview API。"
          >
            <div style={summaryCardStyle}>
              {policyError ? (
                <div role="alert" style={errorStyle}>
                  {policyError}
                </div>
              ) : null}

              <div style={pillRowStyle}>
                <CanvasPill
                  theme={th}
                  tone={getDecisionTone(approvalEvaluation)}
                >
                  {describeDecision(approvalEvaluation)}
                </CanvasPill>
                <CanvasPill theme={th} tone={policyStateTone}>
                  {policyRefreshing ? "自動更新中" : "自動刷新就緒"}
                </CanvasPill>
                {costCenter ? (
                  <CanvasPill theme={th} tone="info">
                    {costCenter}
                  </CanvasPill>
                ) : null}
              </div>

              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: "服務類型",
                    v: describeSubtype(businessDispatchSubtype) ?? "Not set",
                  },
                  {
                    k: "乘客角色",
                    v: activePassenger?.roles?.[0] ?? "Not published",
                  },
                  {
                    k: "預估費用",
                    v: formatCurrency(estimatedAmountMinor),
                    mono: true,
                  },
                ]}
              />

              {approvalEvaluation?.approvalPlan ? (
                <div style={summaryBlockStyle}>
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
                    {approvalEvaluation.approvalPlan.approvers.map(
                      (approver) => (
                        <li
                          key={`${approver.kind}-${approver.userId ?? approver.roleCode ?? approver.costCenterCode ?? "unknown"}`}
                        >
                          {approver.displayName ??
                            approver.userId ??
                            approver.roleCode ??
                            approver.costCenterCode ??
                            approver.kind}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ) : (
                <p style={mutedCopyStyle}>
                  核心欄位齊備後，這裡會顯示 approval plan。
                </p>
              )}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Quota impact"
            subtitle="保留後端 preview 詞彙，不用本地 forecast 取代 canonical quota 結果。"
          >
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
                填完核心欄位後，這裡會顯示配額影響預覽。
              </p>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Create the booking"
            subtitle="blocked 結果維持前端阻擋；需要審批的 booking 仍交由後端工作流接手。"
          >
            <div style={summaryCardStyle}>
              <div style={pillRowStyle}>
                <CanvasPill
                  theme={th}
                  tone={getDecisionTone(approvalEvaluation)}
                >
                  {describeDecision(approvalEvaluation)}
                </CanvasPill>
                {costCenter ? (
                  <CanvasPill theme={th} tone="accent">
                    {costCenter}
                  </CanvasPill>
                ) : null}
                <CanvasPill theme={th} tone="info">
                  {describeDirection(direction)}
                </CanvasPill>
              </div>

              {(approvalEvaluation?.warnings?.length ?? 0) > 0 ? (
                <div style={summaryBlockStyle}>
                  <div style={sectionLabelStyle}>Warnings</div>
                  <ul style={checklistStyle}>
                    {(approvalEvaluation?.warnings ?? []).map((warning) => (
                      <li key={`${warning.source}-${warning.code}`}>
                        {warning.message} ({warning.code})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div style={summaryBlockStyle}>
                <div style={sectionLabelStyle}>Extra controls</div>
                <div style={toggleGridStyle}>
                  <label style={toggleLabelStyle}>
                    <input
                      checked={signoffRequired}
                      onChange={(event) =>
                        setSignoffRequired(event.target.checked)
                      }
                      style={toggleInputStyle}
                      type="checkbox"
                    />
                    需要主管簽核
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
                    需要費用憑證
                  </label>
                </div>
              </div>

              {submitError ? (
                <div role="alert" style={errorStyle}>
                  {submitError}
                </div>
              ) : draftValidationErrors.length > 0 ? (
                <div role="alert" style={errorStyle}>
                  {draftValidationErrors[0]}
                </div>
              ) : null}

              <p style={supportCopyStyle}>
                這個頁面不提供本地草稿狀態；送出後直接建立 booking
                或進入審批流程。
              </p>

              <div style={actionRowStyle}>
                <div style={nativeButtonRowStyle}>
                  <CanvasBtn theme={th} disabled>
                    取消
                  </CanvasBtn>
                  <CanvasBtn theme={th} disabled>
                    不提供草稿
                  </CanvasBtn>
                </div>
                <div style={growStyle} />
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
                    ? "送出中…"
                    : decision === "require_approval"
                      ? "送出審批"
                      : "送出預約"}
                </button>
              </div>
            </div>
          </CanvasCard>
        </div>
      </div>
    </form>
  );
}
