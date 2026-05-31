"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useState,
  useTransition,
} from "react";
import type {
  BookingRecord,
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
  type CanvasTone,
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

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const BUSINESS_SUBTYPE_OPTIONS: Array<{
  value: BusinessDispatchSubtype;
  label: string;
}> = [
  {
    value: "credit_card_airport_transfer",
    label: "信用卡機場接送",
  },
  { value: "enterprise_dispatch", label: "企業派遣" },
];

const CURRENCY = "TWD";

const layoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr",
  gap: 16,
  alignItems: "start",
};

const columnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0 16px",
};

const spanTwoStyle: CSSProperties = {
  gridColumn: "1 / -1",
};

const controlStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "7px 10px",
  fontSize: 12.5,
  color: th.text,
  fontFamily: th.fontFamily,
  outline: "none",
  boxSizing: "border-box",
};

const monoControlStyle: CSSProperties = {
  ...controlStyle,
  fontFamily: th.monoFamily,
};

const textareaStyle: CSSProperties = {
  ...controlStyle,
  minHeight: 64,
  resize: "vertical",
  lineHeight: 1.45,
};

const toggleRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 4,
};

const toggleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11.5,
  color: th.textMuted,
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 999,
  padding: "5px 10px",
  cursor: "pointer",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 4,
};

const errorBoxStyle: CSSProperties = {
  background: th.dangerBg,
  border: `1px solid ${th.dangerBorder}`,
  color: th.danger,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
  marginBottom: 12,
};

const listStyle: CSSProperties = {
  margin: "8px 0 0",
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: th.text,
};

const subheadingStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: th.textMuted,
  marginTop: 14,
  marginBottom: 6,
};

const mutedCopyStyle: CSSProperties = {
  fontSize: 12,
  color: th.textMuted,
  lineHeight: 1.5,
};

const acceptedPendingStyle: CSSProperties = {
  background: th.warnBg,
  border: `1px solid ${th.warnBorder}`,
  borderRadius: 8,
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

function formatCurrency(amountMinor: number | null | undefined) {
  if (amountMinor == null || Number.isNaN(amountMinor)) {
    return "未提供";
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
      return "接機 (pickup)";
    case "dropoff":
      return "送機 (dropoff)";
    default:
      return "未設定";
  }
}

function describeDecision(result: TenantApprovalEvaluationResult | null) {
  const decision = result?.outcome?.decision ?? "allow";
  switch (decision) {
    case "require_approval":
      return "需審批";
    case "block":
      return "已阻擋";
    case "warn":
      return "警示";
    case "manual_review":
      return "人工審核";
    default:
      return "免審通過";
  }
}

function decisionTone(
  result: TenantApprovalEvaluationResult | null,
): CanvasTone {
  switch (result?.outcome?.decision ?? "allow") {
    case "block":
      return "danger";
    case "require_approval":
      return "info";
    case "warn":
    case "manual_review":
      return "warn";
    default:
      return "success";
  }
}

function describeImpactLabel(
  scope: "tenant" | "cost_center",
  code: string | null,
) {
  if (scope === "cost_center") {
    return code ? `成本中心 ${code}` : "成本中心";
  }
  return "租戶";
}

export function TenantBookingCreateForm({
  passengers,
  addresses,
  costCenters,
  approvalRuleCount = 0,
  initialPassengerId = "",
  initialPickupAddressId = "",
  initialDropoffAddressId = "",
}: {
  passengers: TenantPassengerRecord[];
  addresses: TenantAddressRecord[];
  costCenters: TenantCostCenterRecord[];
  approvalRuleCount?: number;
  initialPassengerId?: string;
  initialPickupAddressId?: string;
  initialDropoffAddressId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initialPickupAddress =
    addresses.find((row) => row.addressId === initialPickupAddressId) ??
    addresses[0] ??
    null;
  const initialDropoffAddress =
    addresses.find((row) => row.addressId === initialDropoffAddressId) ??
    addresses[1] ??
    addresses[0] ??
    null;

  const [businessDispatchSubtype, setBusinessDispatchSubtype] =
    useState<BusinessDispatchSubtype>("credit_card_airport_transfer");
  const [selectedPassengerId, setSelectedPassengerId] =
    useState(initialPassengerId);
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
  const [acceptedPendingBooking, setAcceptedPendingBooking] =
    useState<BookingRecord | null>(null);
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

  async function submitBooking() {
    setSubmitError(null);

    if (draftValidationErrors.length > 0) {
      setSubmitError(draftValidationErrors[0] ?? "預約草稿不完整。");
      return;
    }

    if (approvalEvaluation?.outcome?.blocked) {
      setSubmitError("此預約目前被租戶審批或配額政策阻擋。");
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
        booking?: BookingRecord;
      };

      if (!response.ok || !result.booking?.bookingId) {
        throw new Error(
          result.error ?? `建立預約失敗 (HTTP ${response.status})。`,
        );
      }

      const booking = result.booking;

      // Q-TEN04 synchronous command: an approval-pending result keeps the
      // operator on the form with an "accepted, awaiting confirmation" moment
      // instead of pretending the booking is already live. A clean/completed
      // result redirects straight to the booking detail.
      if (booking.approvalState === "pending") {
        setAcceptedPendingBooking(booking);
        setSubmitting(false);
        return;
      }

      startTransition(() => {
        router.push(`/bookings/${booking.bookingId}`);
        router.refresh();
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "建立預約失敗。");
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
    missingRequiredFields ||
    acceptedPendingBooking !== null;

  if (acceptedPendingBooking) {
    return (
      <CanvasCard theme={th} title="預約已受理 · 等待確認">
        <div style={acceptedPendingStyle}>
          <CanvasPill theme={th} tone="warn" dot>
            accepted · pending
          </CanvasPill>
          <p style={mutedCopyStyle}>
            預約 <strong style={{ color: th.text }}>
              {acceptedPendingBooking.bookingId}
            </strong>{" "}
            已透過同步 command 受理 (Q-TEN04)，目前等待審批或外部相依確認。後端持有審批狀態與請求編號，狀態確認後會反映在訂單詳情。
          </p>
          {acceptedPendingBooking.approvalRequestIds.length > 0 ? (
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                {
                  k: "APPROVAL REQUESTS",
                  v: acceptedPendingBooking.approvalRequestIds.join(", "),
                  mono: true,
                },
              ]}
            />
          ) : null}
          <div style={actionRowStyle}>
            <Link
              href={`/bookings/${acceptedPendingBooking.bookingId}`}
              style={{ textDecoration: "none" }}
            >
              <CanvasBtn theme={th} variant="primary" icon="arrowR" size="sm">
                前往訂單詳情
              </CanvasBtn>
            </Link>
            <Link href="/bookings" style={{ textDecoration: "none" }}>
              <CanvasBtn theme={th} size="sm">
                返回訂單清單
              </CanvasBtn>
            </Link>
          </div>
        </div>
      </CanvasCard>
    );
  }

  return (
    <form
      style={layoutStyle}
      onSubmit={(event) => {
        event.preventDefault();
        void submitBooking();
      }}
    >
      <div style={columnStyle}>
        <CanvasCard theme={th} title="行程" subtitle="服務類型 · 預約時段 · 乘客">
          <div style={fieldGridStyle}>
            <CanvasField theme={th} label="服務類型" required>
              <select
                style={controlStyle}
                onChange={(event) =>
                  setBusinessDispatchSubtype(
                    event.target.value as BusinessDispatchSubtype,
                  )
                }
                value={businessDispatchSubtype}
              >
                {BUSINESS_SUBTYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </CanvasField>

            <CanvasField
              theme={th}
              label="乘客"
              hint={
                activePassenger
                  ? "已鎖定通訊錄乘客 · 代訂模式"
                  : "從通訊錄選擇代訂乘客，或維持手動輸入"
              }
            >
              <select
                style={controlStyle}
                onChange={(event) => setSelectedPassengerId(event.target.value)}
                value={selectedPassengerId}
              >
                <option value="">手動輸入乘客</option>
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

            <CanvasField theme={th} label="預約開始" required>
              <input
                style={monoControlStyle}
                onChange={(event) =>
                  setReservationWindowStart(event.target.value)
                }
                type="datetime-local"
                value={reservationWindowStart}
              />
            </CanvasField>

            <CanvasField theme={th} label="預約結束" required>
              <input
                style={monoControlStyle}
                onChange={(event) => setReservationWindowEnd(event.target.value)}
                type="datetime-local"
                value={reservationWindowEnd}
              />
            </CanvasField>

            <CanvasField
              theme={th}
              label="乘客姓名"
              required
              hint={
                activePassenger
                  ? "鎖定於所選通訊錄乘客"
                  : "代訂他人時請改選通訊錄乘客"
              }
            >
              <input
                style={controlStyle}
                disabled={!!activePassenger}
                onChange={(event) => setPassengerName(event.target.value)}
                type="text"
                value={passengerName}
              />
            </CanvasField>

            <CanvasField
              theme={th}
              label="乘客電話"
              required
              hint={
                activePassenger
                  ? passengerPhoneLocked
                    ? "來自所選通訊錄乘客"
                    : "此乘客未登錄電話，請於此補上"
                  : "手動輸入乘客需提供直接聯絡電話"
              }
            >
              <input
                style={controlStyle}
                disabled={passengerPhoneLocked}
                onChange={(event) => setPassengerPhone(event.target.value)}
                type="tel"
                value={passengerPhone}
              />
            </CanvasField>

            <CanvasField theme={th} label="方向">
              <select
                style={controlStyle}
                onChange={(event) =>
                  setDirection(event.target.value as "" | "pickup" | "dropoff")
                }
                value={direction}
              >
                <option value="">未設定</option>
                <option value="pickup">接機 (pickup)</option>
                <option value="dropoff">送機 (dropoff)</option>
              </select>
            </CanvasField>

            <CanvasField theme={th} label="航班">
              <input
                style={controlStyle}
                onChange={(event) => setFlightNo(event.target.value)}
                type="text"
                value={flightNo}
              />
            </CanvasField>

            <CanvasField theme={th} label="航廈">
              <input
                style={controlStyle}
                onChange={(event) => setTerminal(event.target.value)}
                type="text"
                value={terminal}
              />
            </CanvasField>

            <CanvasField theme={th} label="行李件數">
              <input
                style={monoControlStyle}
                inputMode="numeric"
                onChange={(event) => setLuggageCount(event.target.value)}
                type="text"
                value={luggageCount}
              />
            </CanvasField>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="上下車地點"
          subtitle="地址簿輔助 · 可自由覆寫"
        >
          <div style={fieldGridStyle}>
            <CanvasField theme={th} label="pickup 地址簿">
              <select
                style={controlStyle}
                onChange={(event) => setPickupAddressId(event.target.value)}
                value={pickupAddressId}
              >
                <option value="">手動 pickup</option>
                {addresses.map((address) => (
                  <option key={address.addressId} value={address.addressId}>
                    {address.addressName}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField theme={th} label="drop 地址簿">
              <select
                style={controlStyle}
                onChange={(event) => setDropoffAddressId(event.target.value)}
                value={dropoffAddressId}
              >
                <option value="">手動 drop</option>
                {addresses.map((address) => (
                  <option key={address.addressId} value={address.addressId}>
                    {address.addressName}
                  </option>
                ))}
              </select>
            </CanvasField>
            <div style={spanTwoStyle}>
              <CanvasField theme={th} label="pickup 地址" required>
                <input
                  style={controlStyle}
                  onChange={(event) => {
                    setPickupAddressId("");
                    setPickupAddress(event.target.value);
                  }}
                  type="text"
                  value={pickupAddress}
                />
              </CanvasField>
            </div>
            <div style={spanTwoStyle}>
              <CanvasField theme={th} label="drop 地址" required>
                <input
                  style={controlStyle}
                  onChange={(event) => {
                    setDropoffAddressId("");
                    setDropoffAddress(event.target.value);
                  }}
                  type="text"
                  value={dropoffAddress}
                />
              </CanvasField>
            </div>
            <CanvasField theme={th} label="pickup lat">
              <input
                style={monoControlStyle}
                inputMode="decimal"
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupLat(event.target.value);
                }}
                type="text"
                value={pickupLat}
              />
            </CanvasField>
            <CanvasField theme={th} label="pickup lng">
              <input
                style={monoControlStyle}
                inputMode="decimal"
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupLng(event.target.value);
                }}
                type="text"
                value={pickupLng}
              />
            </CanvasField>
            <CanvasField theme={th} label="drop lat">
              <input
                style={monoControlStyle}
                inputMode="decimal"
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffLat(event.target.value);
                }}
                type="text"
                value={dropoffLat}
              />
            </CanvasField>
            <CanvasField theme={th} label="drop lng">
              <input
                style={monoControlStyle}
                inputMode="decimal"
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffLng(event.target.value);
                }}
                type="text"
                value={dropoffLng}
              />
            </CanvasField>
            <div style={spanTwoStyle}>
              <CanvasField theme={th} label="批註 / 特殊需求">
                <textarea
                  style={textareaStyle}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
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
          title="關聯與審批"
          subtitle={`成本中心 · 配額 · ${approvalRuleCount} 條審批規則`}
        >
          {costCenters.length > 0 ? (
            <CanvasField theme={th} label="成本中心" required>
              <select
                style={controlStyle}
                onChange={(event) => setCostCenter(event.target.value)}
                value={costCenter}
              >
                <option value="">選擇成本中心</option>
                {costCenters.map((center) => (
                  <option key={center.code} value={center.code}>
                    {center.code} · {center.name}
                  </option>
                ))}
              </select>
            </CanvasField>
          ) : (
            <CanvasField
              theme={th}
              label="成本中心"
              hint="此租戶尚未發布啟用中的成本中心目錄"
            >
              <input
                style={controlStyle}
                onChange={(event) => setCostCenter(event.target.value)}
                placeholder="自由輸入成本中心代碼"
                type="text"
                value={costCenter}
              />
            </CanvasField>
          )}

          <CanvasField theme={th} label={`預估費用 (${CURRENCY})`}>
            <input
              style={monoControlStyle}
              inputMode="decimal"
              onChange={(event) => setQuotedFare(event.target.value)}
              placeholder="1580"
              type="text"
              value={quotedFare}
            />
          </CanvasField>

          <div style={fieldGridStyle}>
            <CanvasField theme={th} label="專案 / 福利碼">
              <input
                style={controlStyle}
                onChange={(event) => setBenefitReference(event.target.value)}
                type="text"
                value={benefitReference}
              />
            </CanvasField>
            <CanvasField theme={th} label="車輛偏好">
              <input
                style={controlStyle}
                onChange={(event) => setVehiclePreference(event.target.value)}
                type="text"
                value={vehiclePreference}
              />
            </CanvasField>
            <CanvasField theme={th} label="現場聯絡人">
              <input
                style={controlStyle}
                onChange={(event) => setOnsiteContactName(event.target.value)}
                type="text"
                value={onsiteContactName}
              />
            </CanvasField>
            <CanvasField theme={th} label="現場電話">
              <input
                style={controlStyle}
                onChange={(event) => setOnsiteContactPhone(event.target.value)}
                type="tel"
                value={onsiteContactPhone}
              />
            </CanvasField>
            <CanvasField theme={th} label="代訂人姓名">
              <input
                style={controlStyle}
                onChange={(event) => setBookedByName(event.target.value)}
                type="text"
                value={bookedByName}
              />
            </CanvasField>
            <CanvasField theme={th} label="代訂人 Email">
              <input
                style={controlStyle}
                onChange={(event) => setBookedByEmail(event.target.value)}
                type="email"
                value={bookedByEmail}
              />
            </CanvasField>
          </div>

          <div style={toggleRowStyle}>
            <label style={toggleStyle}>
              <input
                checked={signoffRequired}
                onChange={(event) => setSignoffRequired(event.target.checked)}
                type="checkbox"
              />
              需簽核
            </label>
            <label style={toggleStyle}>
              <input
                checked={expenseProofRequired}
                onChange={(event) =>
                  setExpenseProofRequired(event.target.checked)
                }
                type="checkbox"
              />
              需報帳憑證
            </label>
          </div>

          <div style={subheadingStyle}>審批與配額預覽</div>
          <CanvasDL
            theme={th}
            cols={1}
            items={[
              {
                k: "審批決策",
                v: (
                  <CanvasPill theme={th} tone={decisionTone(approvalEvaluation)} dot>
                    {describeDecision(approvalEvaluation)}
                  </CanvasPill>
                ),
              },
              { k: "服務類型", v: describeSubtype(businessDispatchSubtype) },
              { k: "方向", v: describeDirection(direction) },
              {
                k: "預估費用",
                v: formatCurrency(estimatedAmountMinor),
                mono: true,
              },
              {
                k: "乘客身分",
                v: activePassenger?.roles?.[0] ?? "未發布",
              },
              { k: "預覽刷新", v: policyRefreshing ? "更新中…" : "依草稿自動" },
            ]}
          />

          {policyError ? (
            <div style={{ ...errorBoxStyle, marginTop: 12, marginBottom: 0 }} role="alert">
              {policyError}
            </div>
          ) : null}

          {approvalEvaluation?.approvalPlan ? (
            <>
              <div style={subheadingStyle}>審批計畫</div>
              <CanvasDL
                theme={th}
                cols={1}
                items={[
                  {
                    k: "模式",
                    v: approvalEvaluation.approvalPlan.approvalMode,
                  },
                  {
                    k: "逾時",
                    v: `${approvalEvaluation.approvalPlan.timeoutHours}h`,
                    mono: true,
                  },
                  {
                    k: "回退",
                    v: approvalEvaluation.approvalPlan.fallbackPolicy,
                  },
                ]}
              />
              <ul style={listStyle}>
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

          {(approvalEvaluation?.warnings?.length ?? 0) > 0 ? (
            <>
              <div style={subheadingStyle}>警示</div>
              <ul style={listStyle}>
                {(approvalEvaluation?.warnings ?? []).map((warning) => (
                  <li key={`${warning.source}-${warning.code}`}>
                    {warning.message} ({warning.code})
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div style={subheadingStyle}>配額影響</div>
          {quotaPreview?.impacts?.length ? (
            <ul style={listStyle}>
              {quotaPreview.impacts.map((impact) => (
                <li
                  key={`${impact.scope}-${impact.costCenterCode ?? "tenant"}-${impact.dimension}`}
                >
                  {describeImpactLabel(impact.scope, impact.costCenterCode)} ·{" "}
                  {impact.dimension} · 前 {impact.remainingBefore ?? "n/a"} /{" "}
                  {impact.limitValue ?? "n/a"} · 後{" "}
                  {impact.remainingAfter ?? "n/a"} · 剩餘{" "}
                  {formatPercent(impact.remainingPercentAfter)} ·{" "}
                  {impact.triggered}
                </li>
              ))}
            </ul>
          ) : (
            <p style={mutedCopyStyle}>填妥核心預約欄位後即顯示配額影響。</p>
          )}
        </CanvasCard>

        <CanvasCard theme={th} title="送出">
          {submitError ? (
            <div style={errorBoxStyle} role="alert">
              {submitError}
            </div>
          ) : draftValidationErrors.length > 0 ? (
            <div style={errorBoxStyle} role="alert">
              {draftValidationErrors[0]}
            </div>
          ) : null}

          <p style={mutedCopyStyle}>
            免審與需審批的結果都可送出；被阻擋的結果在草稿變更前維持鎖定。送出後若需審批，會停留在「accepted · pending」狀態 (Q-TEN04)。
          </p>

          <div style={actionRowStyle}>
            <Link href="/bookings" style={{ textDecoration: "none" }}>
              <CanvasBtn theme={th} size="sm">
                取消
              </CanvasBtn>
            </Link>
            <span style={{ flex: 1 }} />
            <CanvasBtn theme={th} size="sm" disabled>
              另存草稿
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="check"
              size="sm"
              disabled={submitDisabled}
              onClick={() => void submitBooking()}
            >
              {submitting || pending
                ? "送出中…"
                : decision === "require_approval"
                  ? "送出審批"
                  : "送出預約"}
            </CanvasBtn>
          </div>
        </CanvasCard>
      </div>
    </form>
  );
}
