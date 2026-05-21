"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type {
  BusinessDispatchSubtype,
  TenantAddressRecord,
  TenantApprovalEvaluationResult,
  TenantApprovalWarning,
  TenantBookingQuotaImpactPreview,
  TenantBookingQuotaImpactResult,
  TenantCostCenterRecord,
  TenantPassengerRecord,
  TenantPrincipalRef,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasInput,
  CanvasKPI,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
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

const BUSINESS_SUBTYPE_OPTIONS: Array<{
  value: BusinessDispatchSubtype;
  label: string;
}> = [
  {
    value: "credit_card_airport_transfer",
    label: "機場接送",
  },
  {
    value: "enterprise_dispatch",
    label: "一般企業叫車",
  },
];

const RESERVATION_PRESET_OPTIONS = [
  { value: "scheduled", label: "預約" },
  { value: "instant", label: "即時" },
] as const;

type ReservationPreset = (typeof RESERVATION_PRESET_OPTIONS)[number]["value"];
type DirectionValue = "" | "pickup" | "dropoff";

type QuotaImpactRow = {
  scope: string;
  dimension: string;
  before: string;
  after: string;
  remaining: string;
  state: string;
  stateTone: CanvasTone;
};

const CURRENCY = "TWD";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const formLayoutStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: 16,
};

const mainColumnStyle: CSSProperties = {
  flex: "1.4 1 620px",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const sideColumnStyle: CSSProperties = {
  flex: "1 1 360px",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const compactFieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const fullSpanStyle: CSSProperties = {
  gridColumn: "1 / -1",
  minWidth: 0,
};

const sectionLabelStyle: CSSProperties = {
  margin: "6px 0 2px",
  paddingTop: 14,
  borderTop: `1px solid ${th.border}`,
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.45,
  textTransform: "uppercase",
  color: th.textMuted,
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

const nativeSelectStyle: CSSProperties = {
  ...nativeInputStyle,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
};

const nativeMonoInputStyle: CSSProperties = {
  ...nativeInputStyle,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const nativeTextareaStyle: CSSProperties = {
  ...nativeInputStyle,
  resize: "vertical",
  minHeight: 88,
};

const disabledInputStyle: CSSProperties = {
  background: th.surfaceLo,
  color: th.textMuted,
  cursor: "not-allowed",
  opacity: 0.8,
};

const pillRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 14,
};

const toggleRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const bannerStackStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 14,
};

const submitRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  marginTop: 14,
};

const primarySubmitButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "5px 12px",
  fontSize: 12,
  height: 28,
  fontWeight: 600,
  background: th.accent,
  color: "#fff",
  border: `1px solid ${th.accent}`,
  borderRadius: 7,
  cursor: "pointer",
  lineHeight: 1,
  fontFamily: th.fontFamily,
};

const helperTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.5,
};

const listStyle: CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: 18,
  color: th.text,
  fontSize: 12,
  lineHeight: 1.55,
};

const quotaTableEmptyStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 12,
  color: th.textMuted,
  lineHeight: 1.5,
};

const quotaColumns: CanvasTableColumn<QuotaImpactRow>[] = [
  { h: "範圍", k: "scope", w: 130 },
  { h: "維度", k: "dimension", w: 90 },
  { h: "剩餘前 / 上限", k: "before", mono: true, w: 180 },
  { h: "剩餘後", k: "after", mono: true, w: 140 },
  { h: "剩餘比", k: "remaining", mono: true, w: 96 },
  {
    h: "狀態",
    w: 96,
    r: (row) => (
      <CanvasPill theme={th} tone={row.stateTone}>
        {row.state}
      </CanvasPill>
    ),
  },
];

function formatCurrency(amountMinor: number | null | undefined) {
  if (amountMinor == null || Number.isNaN(amountMinor)) {
    return "—";
  }

  return new Intl.NumberFormat("zh-Hant-TW", {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatCount(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }

  return new Intl.NumberFormat("zh-Hant-TW").format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }

  return `${value}%`;
}

function formatImpactValue(
  dimension: "booking_count" | "amount_minor",
  value: number | null,
) {
  if (value == null) {
    return "—";
  }

  return dimension === "amount_minor"
    ? formatCurrency(value)
    : formatCount(value);
}

function describeSubtype(value: BusinessDispatchSubtype) {
  return (
    BUSINESS_SUBTYPE_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}

function describeDirection(value: DirectionValue) {
  switch (value) {
    case "pickup":
      return "接機";
    case "dropoff":
      return "送機";
    default:
      return "未設定";
  }
}

function describeDecision(result: TenantApprovalEvaluationResult | null) {
  const decision = result?.outcome?.decision ?? "allow";

  switch (decision) {
    case "require_approval":
      return "需要審批";
    case "block":
      return "目前封鎖";
    case "warn":
      return "允許送出，但有警示";
    case "manual_review":
      return "需人工複核";
    default:
      return "可直接送出";
  }
}

function describeDecisionBadge(result: TenantApprovalEvaluationResult | null) {
  const decision = result?.outcome?.decision ?? "allow";

  switch (decision) {
    case "require_approval":
      return "送審";
    case "block":
      return "封鎖";
    case "warn":
      return "警示";
    case "manual_review":
      return "人工複核";
    default:
      return "免簽";
  }
}

function getDecisionTone(
  result: TenantApprovalEvaluationResult | null,
): CanvasTone {
  const decision = result?.outcome?.decision ?? "allow";

  switch (decision) {
    case "require_approval":
      return "accent";
    case "block":
      return "danger";
    case "warn":
      return "warn";
    case "manual_review":
      return "info";
    default:
      return "success";
  }
}

function describeTrigger(triggered: "none" | "warn" | "approval" | "block") {
  switch (triggered) {
    case "warn":
      return "警示";
    case "approval":
      return "送審";
    case "block":
      return "封鎖";
    default:
      return "正常";
  }
}

function getTriggerTone(
  triggered: "none" | "warn" | "approval" | "block",
): CanvasTone {
  switch (triggered) {
    case "warn":
      return "warn";
    case "approval":
      return "accent";
    case "block":
      return "danger";
    default:
      return "success";
  }
}

function describeImpactScope(
  scope: "tenant" | "cost_center",
  code: string | null,
) {
  if (scope === "cost_center") {
    return code ? `CC ${code}` : "Cost center";
  }

  return "Tenant";
}

function describeImpactDimension(dimension: "booking_count" | "amount_minor") {
  return dimension === "amount_minor" ? "金額" : "趟次";
}

function describeApprover(approver: TenantPrincipalRef) {
  return (
    approver.displayName ??
    approver.userId ??
    approver.roleCode ??
    approver.costCenterCode ??
    approver.kind
  );
}

function getQuotaSummary(quotaPreview: TenantBookingQuotaImpactPreview | null) {
  if (!quotaPreview) {
    return "主要欄位填齊後自動試算";
  }

  const primaryImpact = quotaPreview.impacts[0];
  if (!primaryImpact) {
    return `${quotaPreview.periodKey} · ${describeTrigger(
      quotaPreview.combinedTriggered,
    )}`;
  }

  return `${quotaPreview.periodKey} · 剩餘 ${formatImpactValue(
    primaryImpact.dimension,
    primaryImpact.remainingAfter,
  )} / ${formatImpactValue(primaryImpact.dimension, primaryImpact.limitValue)}`;
}

function getApprovalSummary(result: TenantApprovalEvaluationResult | null) {
  if (!result?.approvalPlan) {
    return describeDecision(result);
  }

  return `${describeDecision(result)} · ${result.approvalPlan.approvalMode} · ${result.approvalPlan.timeoutHours}h`;
}

function getQuotaRows(
  quotaPreview: TenantBookingQuotaImpactPreview | null,
): QuotaImpactRow[] {
  return (
    quotaPreview?.impacts.map((impact: TenantBookingQuotaImpactResult) => ({
      scope: describeImpactScope(impact.scope, impact.costCenterCode),
      dimension: describeImpactDimension(impact.dimension),
      before: `${formatImpactValue(impact.dimension, impact.remainingBefore)} / ${formatImpactValue(
        impact.dimension,
        impact.limitValue,
      )}`,
      after: formatImpactValue(impact.dimension, impact.remainingAfter),
      remaining: formatPercent(impact.remainingPercentAfter),
      state: describeTrigger(impact.triggered),
      stateTone: getTriggerTone(impact.triggered),
    })) ?? []
  );
}

function getToggleChipStyle(selected: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${selected ? th.accent : th.border}`,
    background: selected ? th.accentBg : th.surfaceLo,
    color: selected ? th.text : th.textMuted,
    cursor: "pointer",
    fontSize: 11.5,
    fontWeight: 600,
  };
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

  const [reservationPreset, setReservationPreset] =
    useState<ReservationPreset>("scheduled");
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
  const [direction, setDirection] = useState<DirectionValue>("");
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
    const now = new Date();

    setReservationWindowStart(
      (value) => value || getDefaultDateTimeLocalValue(30, now),
    );
    setReservationWindowEnd(
      (value) => value || getDefaultDateTimeLocalValue(60, now),
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
            result.error ?? `審批 / 配額試算失敗 (HTTP ${response.status}).`,
          );
        }

        setQuotaPreview(result.quotaPreview ?? null);
        setApprovalEvaluation(result.approvalEvaluation ?? null);
      } catch (error) {
        setPolicyError(
          error instanceof Error ? error.message : "審批 / 配額試算失敗。",
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

  function applyReservationPreset(nextPreset: ReservationPreset) {
    const now = new Date();

    setReservationPreset(nextPreset);
    if (nextPreset === "instant") {
      setReservationWindowStart(getDefaultDateTimeLocalValue(5, now));
      setReservationWindowEnd(getDefaultDateTimeLocalValue(35, now));
      return;
    }

    setReservationWindowStart(getDefaultDateTimeLocalValue(30, now));
    setReservationWindowEnd(getDefaultDateTimeLocalValue(60, now));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (draftValidationErrors.length > 0) {
      setSubmitError(draftValidationErrors[0] ?? "Booking draft is invalid.");
      return;
    }

    if (approvalEvaluation?.outcome?.blocked) {
      setSubmitError("此筆叫車目前被租戶審批或配額規則封鎖。");
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
          result.error ?? `建立叫車失敗 (HTTP ${response.status}).`,
        );
      }

      startTransition(() => {
        router.push(`/bookings/${result.booking!.bookingId}`);
        router.refresh();
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "建立叫車失敗，請稍後再試。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const activePassenger = passengers.find(
    (row) => row.passengerId === selectedPassengerId,
  );
  const selectedCostCenter = costCenters.find((row) => row.code === costCenter);
  const passengerPhoneLocked =
    !!activePassenger && !!activePassenger.mobile?.trim();
  const decision = approvalEvaluation?.outcome?.decision ?? "allow";
  const decisionTone = getDecisionTone(approvalEvaluation);
  const submitDisabled =
    submitting ||
    pending ||
    policyRefreshing ||
    approvalEvaluation?.outcome?.blocked === true ||
    missingRequiredFields;
  const previewWarnings = approvalEvaluation?.outcome?.warnings.length
    ? approvalEvaluation.outcome.warnings
    : ((approvalEvaluation?.warnings ?? []) as TenantApprovalWarning[]);
  const quotaRows = getQuotaRows(quotaPreview);
  const primaryImpact = quotaPreview?.impacts[0] ?? null;

  return (
    <form onSubmit={handleSubmit} style={formLayoutStyle}>
      <section style={mainColumnStyle}>
        <CanvasCard theme={th} title="行程" subtitle="服務類型、路線與出發安排">
          <div style={fieldGridStyle}>
            <CanvasField
              theme={th}
              label="服務類型"
              required
              hint="沿用目前已發布的服務類型。"
            >
              <select
                onChange={(event) =>
                  setBusinessDispatchSubtype(
                    event.target.value as BusinessDispatchSubtype,
                  )
                }
                style={nativeSelectStyle}
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
              label="預約 / 即時"
              required
              hint="切換後會重設預設時間視窗，仍可再手動調整。"
            >
              <select
                onChange={(event) =>
                  applyReservationPreset(
                    event.target.value as ReservationPreset,
                  )
                }
                style={nativeSelectStyle}
                value={reservationPreset}
              >
                {RESERVATION_PRESET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </CanvasField>

            <CanvasField
              theme={th}
              label="pickup"
              required
              hint="可從地址簿帶入，也可自由輸入。"
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

            <CanvasField theme={th} label="drop" required>
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

            <CanvasField
              theme={th}
              label="出發時間"
              required
              hint={`送出時窗結束：${reservationWindowEnd || "—"}`}
            >
              <input
                onChange={(event) =>
                  setReservationWindowStart(event.target.value)
                }
                required
                style={nativeMonoInputStyle}
                type="datetime-local"
                value={reservationWindowStart}
              />
            </CanvasField>

            <CanvasField
              theme={th}
              label="passenger 數"
              required
              hint="目前此頁一次只支援 1 位乘客。"
            >
              <CanvasInput theme={th} mono value="1" />
            </CanvasField>

            <CanvasField theme={th} label="行李">
              <input
                inputMode="numeric"
                onChange={(event) => setLuggageCount(event.target.value)}
                placeholder="2"
                style={nativeInputStyle}
                type="text"
                value={luggageCount}
              />
            </CanvasField>

            <CanvasField theme={th} label="特殊需求">
              <input
                onChange={(event) => setVehiclePreference(event.target.value)}
                placeholder="例如兒童安全座椅"
                style={nativeInputStyle}
                type="text"
                value={vehiclePreference}
              />
            </CanvasField>
          </div>

          <div style={sectionLabelStyle}>地址簿 / 時窗 / 航班補充</div>

          <div style={compactFieldGridStyle}>
            <CanvasField theme={th} label="地址簿 pickup">
              <select
                onChange={(event) => setPickupAddressId(event.target.value)}
                style={nativeSelectStyle}
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

            <CanvasField theme={th} label="地址簿 drop">
              <select
                onChange={(event) => setDropoffAddressId(event.target.value)}
                style={nativeSelectStyle}
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

            <CanvasField theme={th} label="時窗結束" required>
              <input
                onChange={(event) =>
                  setReservationWindowEnd(event.target.value)
                }
                required
                style={nativeMonoInputStyle}
                type="datetime-local"
                value={reservationWindowEnd}
              />
            </CanvasField>

            <CanvasField
              theme={th}
              hint="機場接送才會用到接機 / 送機方向。"
              label="航班方向"
            >
              <select
                onChange={(event) =>
                  setDirection(event.target.value as DirectionValue)
                }
                style={nativeSelectStyle}
                value={direction}
              >
                <option value="">未設定</option>
                <option value="pickup">接機</option>
                <option value="dropoff">送機</option>
              </select>
            </CanvasField>

            <CanvasField
              theme={th}
              hint="接機時若需要審批試算，請一併提供。"
              label="航班編號"
            >
              <input
                onChange={(event) => setFlightNo(event.target.value)}
                style={nativeInputStyle}
                type="text"
                value={flightNo}
              />
            </CanvasField>

            <CanvasField theme={th} label="航廈">
              <input
                onChange={(event) => setTerminal(event.target.value)}
                style={nativeInputStyle}
                type="text"
                value={terminal}
              />
            </CanvasField>

            <CanvasField theme={th} label="pickup lat">
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupLat(event.target.value);
                }}
                spellCheck={false}
                style={nativeMonoInputStyle}
                type="text"
                value={pickupLat}
              />
            </CanvasField>

            <CanvasField theme={th} label="pickup lng">
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupLng(event.target.value);
                }}
                spellCheck={false}
                style={nativeMonoInputStyle}
                type="text"
                value={pickupLng}
              />
            </CanvasField>

            <CanvasField theme={th} label="drop lat">
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffLat(event.target.value);
                }}
                spellCheck={false}
                style={nativeMonoInputStyle}
                type="text"
                value={dropoffLat}
              />
            </CanvasField>

            <CanvasField theme={th} label="drop lng">
              <input
                inputMode="decimal"
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffLng(event.target.value);
                }}
                spellCheck={false}
                style={nativeMonoInputStyle}
                type="text"
                value={dropoffLng}
              />
            </CanvasField>
          </div>
        </CanvasCard>
      </section>

      <aside style={sideColumnStyle}>
        <CanvasCard
          theme={th}
          title="關聯與審批"
          subtitle="乘客、cost center 與審批試算"
        >
          <div style={pillRowStyle}>
            <CanvasPill theme={th} tone={decisionTone}>
              {describeDecisionBadge(approvalEvaluation)}
            </CanvasPill>
            <CanvasPill
              theme={th}
              tone={
                policyRefreshing
                  ? "info"
                  : policyPreviewReady
                    ? "accent"
                    : "neutral"
              }
            >
              {policyRefreshing
                ? "更新中"
                : policyPreviewReady
                  ? "自動預覽"
                  : "待欄位完成"}
            </CanvasPill>
            <CanvasPill theme={th} tone={activePassenger ? "info" : "neutral"}>
              {activePassenger?.roles?.[0] ?? "手動 passenger"}
            </CanvasPill>
            {selectedCostCenter ? (
              <CanvasPill theme={th} tone="accent">
                {selectedCostCenter.code}
              </CanvasPill>
            ) : null}
          </div>

          <div style={fieldGridStyle}>
            <div style={fullSpanStyle}>
              <CanvasField
                theme={th}
                label="passenger"
                required
                hint="可從通訊錄帶入，或保留手動填寫。"
              >
                <select
                  onChange={(event) =>
                    setSelectedPassengerId(event.target.value)
                  }
                  style={nativeSelectStyle}
                  value={selectedPassengerId}
                >
                  <option value="">手動填寫乘客資訊</option>
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

            <CanvasField
              theme={th}
              hint={
                activePassenger
                  ? "已鎖定至選定的乘客通訊錄資料。"
                  : "未選通訊錄時，請直接輸入乘客姓名。"
              }
              label="乘客姓名"
              required
            >
              <input
                disabled={!!activePassenger}
                onChange={(event) => setPassengerName(event.target.value)}
                required
                style={{
                  ...nativeInputStyle,
                  ...(activePassenger ? disabledInputStyle : {}),
                }}
                type="text"
                value={passengerName}
              />
            </CanvasField>

            <CanvasField
              theme={th}
              hint={
                activePassenger
                  ? passengerPhoneLocked
                    ? "手機來自通訊錄；如需更改請先解除選擇。"
                    : "此乘客通訊錄未發布手機，請在此補填。"
                  : "手動 passenger 需要直接聯絡手機。"
              }
              label="乘客手機"
              required
            >
              <input
                disabled={passengerPhoneLocked}
                onChange={(event) => setPassengerPhone(event.target.value)}
                required
                style={{
                  ...nativeInputStyle,
                  ...(passengerPhoneLocked ? disabledInputStyle : {}),
                }}
                type="tel"
                value={passengerPhone}
              />
            </CanvasField>

            {costCenters.length > 0 ? (
              <CanvasField
                theme={th}
                hint={
                  selectedCostCenter
                    ? `${selectedCostCenter.code} · ${selectedCostCenter.name}`
                    : "沿用啟用中的 cost center 目錄。"
                }
                label="cost center"
                required
              >
                <select
                  onChange={(event) => setCostCenter(event.target.value)}
                  required
                  style={nativeSelectStyle}
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
            ) : (
              <CanvasField
                theme={th}
                hint="此租戶目前沒有啟用中的 cost center 目錄，改為自由輸入。"
                label="cost center"
              >
                <input
                  onChange={(event) => setCostCenter(event.target.value)}
                  placeholder="自由輸入 cost center"
                  style={nativeInputStyle}
                  type="text"
                  value={costCenter}
                />
              </CanvasField>
            )}

            <CanvasField
              theme={th}
              hint="供審批與配額試算參考。"
              label={`預估費用 (${CURRENCY})`}
            >
              <input
                inputMode="decimal"
                onChange={(event) => setQuotedFare(event.target.value)}
                placeholder="1580"
                style={nativeMonoInputStyle}
                type="text"
                value={quotedFare}
              />
            </CanvasField>

            <CanvasField theme={th} label="專案碼">
              <input
                onChange={(event) => setBenefitReference(event.target.value)}
                spellCheck={false}
                style={nativeMonoInputStyle}
                type="text"
                value={benefitReference}
              />
            </CanvasField>

            <div style={fullSpanStyle}>
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

          <div style={sectionLabelStyle}>摘要</div>

          <div style={summaryGridStyle}>
            <CanvasKPI
              theme={th}
              hint={
                approvalEvaluation?.auditSummary?.ruleVersionSnapshot ??
                undefined
              }
              label="預估費用"
              sub={estimatedAmountMinor == null ? "可留空" : "送出前預覽值"}
              value={formatCurrency(estimatedAmountMinor)}
            />
            <CanvasKPI
              theme={th}
              label="審批"
              sub={
                approvalEvaluation?.approvalPlan
                  ? `${approvalEvaluation.approvalPlan.approvers.length} 位 approver`
                  : "依現行規則即時判斷"
              }
              value={describeDecisionBadge(approvalEvaluation)}
            />
            <CanvasKPI
              theme={th}
              label="配額影響"
              sub={
                quotaPreview
                  ? `${quotaPreview.periodKey} · ${describeTrigger(
                      quotaPreview.combinedTriggered,
                    )}`
                  : "主要欄位填齊後計算"
              }
              value={
                primaryImpact
                  ? `${formatImpactValue(
                      primaryImpact.dimension,
                      primaryImpact.remainingAfter,
                    )} / ${formatImpactValue(
                      primaryImpact.dimension,
                      primaryImpact.limitValue,
                    )}`
                  : "—"
              }
            />
          </div>

          <div style={{ marginTop: 14 }}>
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
                  v: getApprovalSummary(approvalEvaluation),
                },
                {
                  k: "配額影響",
                  v: getQuotaSummary(quotaPreview),
                },
              ]}
            />
          </div>

          {submitError || draftValidationErrors.length > 0 || policyError ? (
            <div style={bannerStackStyle}>
              {submitError ? (
                <CanvasBanner
                  body={submitError}
                  icon="warn"
                  theme={th}
                  title="送出失敗"
                  tone="danger"
                />
              ) : null}

              {!submitError && draftValidationErrors.length > 0 ? (
                <CanvasBanner
                  body={draftValidationErrors[0]}
                  icon="warn"
                  theme={th}
                  title="草稿仍需補齊"
                  tone="warn"
                />
              ) : null}

              {policyError ? (
                <CanvasBanner
                  body={policyError}
                  icon="warn"
                  theme={th}
                  title="審批 / 配額試算失敗"
                  tone="warn"
                />
              ) : null}
            </div>
          ) : null}

          {(approvalEvaluation?.approvalPlan || previewWarnings.length > 0) && (
            <>
              <div style={sectionLabelStyle}>審批判斷</div>

              {approvalEvaluation?.approvalPlan ? (
                <>
                  <div style={pillRowStyle}>
                    <CanvasPill theme={th} tone="accent">
                      模式 {approvalEvaluation.approvalPlan.approvalMode}
                    </CanvasPill>
                    <CanvasPill theme={th} tone="info">
                      時限 {approvalEvaluation.approvalPlan.timeoutHours}h
                    </CanvasPill>
                    <CanvasPill theme={th} tone="neutral">
                      {approvalEvaluation.approvalPlan.fallbackPolicy}
                    </CanvasPill>
                  </div>

                  <ul style={listStyle}>
                    {approvalEvaluation.approvalPlan.approvers.map(
                      (approver: TenantPrincipalRef) => (
                        <li
                          key={`${approver.kind}-${approver.userId ?? approver.roleCode ?? approver.costCenterCode ?? "unknown"}`}
                        >
                          {describeApprover(approver)}
                        </li>
                      ),
                    )}
                  </ul>
                </>
              ) : null}

              {previewWarnings.length > 0 ? (
                <ul style={listStyle}>
                  {previewWarnings.map((warning: TenantApprovalWarning) => (
                    <li key={`${warning.source}-${warning.code}`}>
                      {warning.message} ({warning.code})
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}

          <div style={sectionLabelStyle}>代訂 / 現場聯絡</div>

          <div style={fieldGridStyle}>
            <CanvasField
              theme={th}
              hint="若填寫姓名，email 必須一起提供。"
              label="代訂人姓名"
            >
              <input
                onChange={(event) => setBookedByName(event.target.value)}
                style={nativeInputStyle}
                type="text"
                value={bookedByName}
              />
            </CanvasField>

            <CanvasField theme={th} label="代訂人 email">
              <input
                onChange={(event) => setBookedByEmail(event.target.value)}
                style={nativeInputStyle}
                type="email"
                value={bookedByEmail}
              />
            </CanvasField>

            <CanvasField
              theme={th}
              hint="若填寫姓名，手機必須一起提供。"
              label="現場聯絡人"
            >
              <input
                onChange={(event) => setOnsiteContactName(event.target.value)}
                style={nativeInputStyle}
                type="text"
                value={onsiteContactName}
              />
            </CanvasField>

            <CanvasField theme={th} label="現場手機">
              <input
                onChange={(event) => setOnsiteContactPhone(event.target.value)}
                style={nativeInputStyle}
                type="tel"
                value={onsiteContactPhone}
              />
            </CanvasField>
          </div>

          <div style={sectionLabelStyle}>補充控管</div>

          <div style={fullSpanStyle}>
            <CanvasField
              theme={th}
              hint={`方向：${describeDirection(direction)}${costCenter ? ` · ${costCenter}` : ""}`}
              label="送出附帶旗標"
            >
              <div style={toggleRowStyle}>
                <label style={getToggleChipStyle(signoffRequired)}>
                  <input
                    checked={signoffRequired}
                    onChange={(event) =>
                      setSignoffRequired(event.target.checked)
                    }
                    style={{ display: "none" }}
                    type="checkbox"
                  />
                  <span>需主管簽核</span>
                </label>
                <label style={getToggleChipStyle(expenseProofRequired)}>
                  <input
                    checked={expenseProofRequired}
                    onChange={(event) =>
                      setExpenseProofRequired(event.target.checked)
                    }
                    style={{ display: "none" }}
                    type="checkbox"
                  />
                  <span>需附報銷證明</span>
                </label>
              </div>
            </CanvasField>
          </div>

          <div style={sectionLabelStyle}>配額明細</div>

          {quotaRows.length > 0 ? (
            <CanvasCard theme={th} padding={0}>
              <CanvasTable<QuotaImpactRow>
                theme={th}
                columns={quotaColumns}
                rows={quotaRows}
              />
            </CanvasCard>
          ) : (
            <p style={quotaTableEmptyStyle}>
              {policyPreviewReady
                ? "目前沒有可顯示的配額影響資料。"
                : "填寫 passenger、route、時間與 cost center 後，這裡會帶出配額影響。"}
            </p>
          )}

          <div style={submitRowStyle}>
            <CanvasBtn
              onClick={() => router.push("/bookings")}
              theme={th}
              variant="secondary"
            >
              取消
            </CanvasBtn>
            <CanvasBtn disabled theme={th} variant="secondary">
              另存草稿
            </CanvasBtn>
            <span style={{ flex: 1 }} />
            <button
              disabled={submitDisabled}
              style={{
                ...primarySubmitButtonStyle,
                cursor: submitDisabled ? "not-allowed" : "pointer",
                opacity: submitDisabled ? 0.55 : 1,
              }}
              type="submit"
            >
              {submitting || pending
                ? "送出中..."
                : decision === "require_approval"
                  ? "送出審批"
                  : "送出預約"}
            </button>
          </div>

          <p style={{ ...helperTextStyle, marginTop: 10 }}>
            目前服務類型為 {describeSubtype(businessDispatchSubtype)}
            ；若判定封鎖會停用送出，需審批時仍可建立叫車，由後端接手審批狀態。
          </p>
        </CanvasCard>
      </aside>
    </form>
  );
}
