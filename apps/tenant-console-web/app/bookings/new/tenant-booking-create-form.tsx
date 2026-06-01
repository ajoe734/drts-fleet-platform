"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  BookingRecord,
  BusinessDispatchSubtype,
  ResourceActionDescriptor,
  TenantAddressRecord,
  TenantApprovalEvaluationResult,
  TenantBookingQuotaImpactPreview,
  TenantCostCenterRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPill,
  type CanvasTheme,
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

const th: CanvasTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const CURRENCY = "TWD";

const BUSINESS_SUBTYPE_OPTIONS: Array<{
  value: BusinessDispatchSubtype;
  label: string;
}> = [
  { value: "credit_card_airport_transfer", label: "信用卡機場接送" },
  { value: "enterprise_dispatch", label: "企業派遣" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Canvas-themed form primitives (real inputs; the ui-web canvas Input/Select are
// display-only). Styling mirrors the artboard: dark surfaces, teal focus accent.
// ─────────────────────────────────────────────────────────────────────────────

const gridTwoStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const controlStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "7px 10px",
  fontSize: 12.5,
  color: th.text,
  fontFamily: th.fontFamily,
  outline: "none",
};

const monoControlStyle: CSSProperties = {
  ...controlStyle,
  fontFamily: th.monoFamily,
};

const labelTextStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11.5,
  fontWeight: 600,
  color: th.text,
  marginBottom: 5,
};

const hintStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  marginTop: 4,
  lineHeight: 1.35,
};

function FormField({
  label,
  required,
  hint,
  span,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <label style={span ? { gridColumn: "1 / -1" } : undefined}>
      <span style={labelTextStyle}>
        {label}
        {required ? <span style={{ color: th.danger }}>*</span> : null}
      </span>
      {children}
      {hint ? <div style={hintStyle}>{hint}</div> : null}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// availableActions (Q-X13): the form CTAs are descriptor-driven. The backend
// would normally supply these; the create form owns its own command surface, so
// the descriptors are derived from policy outcome rather than hard-coded by role.
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  submit_command: "送出 command",
  submit_for_approval: "送出審批 command",
  cancel_form: "取消",
  save_draft: "另存草稿",
};

const DISABLED_REASON_LABELS: Record<string, string> = {
  drafts_not_supported: "後端未發布草稿端點 (Q-TEN04 同步 command)",
  blocked_by_policy: "目前被租戶審批 / 配額政策封鎖",
  missing_required_fields: "尚有必填欄位未完成",
  submitting: "送出中…",
};

function ActionButton({
  descriptor,
  children,
  icon,
  variant,
}: {
  descriptor: ResourceActionDescriptor;
  children: ReactNode;
  icon?: "check" | "x" | "ext";
  variant?: "primary" | "secondary" | "ghost";
}) {
  const disabled = !descriptor.enabled;
  const reason = descriptor.disabledReasonCode
    ? (DISABLED_REASON_LABELS[descriptor.disabledReasonCode] ??
      descriptor.disabledReasonCode)
    : undefined;

  const button = (
    <CanvasBtn
      theme={th}
      size="sm"
      variant={variant ?? "secondary"}
      danger={descriptor.riskLevel === "high"}
      disabled={disabled}
      {...(icon ? { icon } : {})}
    >
      {children}
    </CanvasBtn>
  );

  // Disabled affordances stay visible with a tooltip explaining why (Q-X13).
  if (disabled && reason) {
    return <span title={reason}>{button}</span>;
  }
  return button;
}

function describeDecisionTone(
  decision: string,
): { tone: CanvasTone; label: string } {
  switch (decision) {
    case "require_approval":
      return { tone: "warn", label: "需審批" };
    case "block":
      return { tone: "danger", label: "封鎖" };
    case "warn":
      return { tone: "warn", label: "警告" };
    case "manual_review":
      return { tone: "info", label: "人工複核" };
    default:
      return { tone: "success", label: "允許" };
  }
}

function describeDirection(value: "" | "pickup" | "dropoff") {
  if (value === "pickup") return "去程 · pickup";
  if (value === "dropoff") return "回程 · dropoff";
  return "未設定";
}

function formatCurrency(amountMinor: number | null | undefined) {
  if (amountMinor == null || Number.isNaN(amountMinor)) {
    return "未提供";
  }
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${value}%`;
}

function describeImpactLabel(scope: "tenant" | "cost_center", code: string | null) {
  if (scope === "cost_center") {
    return code ? `成本中心 ${code}` : "成本中心";
  }
  return "租戶";
}

// Resolve a CTA from the route's availableActions[] (Q-X13). Mirrors the shipped
// /rules route: the client renders only the actions the route published.
function findAction(
  actions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return actions.find((item) => item.action === action) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function TenantBookingCreateForm({
  passengers,
  addresses,
  costCenters,
  availableActions,
  initialPassengerId,
  initialPickupAddressId,
  initialDropoffAddressId,
}: {
  passengers: TenantPassengerRecord[];
  addresses: TenantAddressRecord[];
  costCenters: TenantCostCenterRecord[];
  availableActions: ResourceActionDescriptor[];
  initialPassengerId?: string | null;
  initialPickupAddressId?: string | null;
  initialDropoffAddressId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const resolvedInitialPickup =
    addresses.find((row) => row.addressId === initialPickupAddressId) ??
    addresses[0] ??
    null;
  const resolvedInitialDropoff =
    addresses.find((row) => row.addressId === initialDropoffAddressId) ??
    addresses[1] ??
    addresses[0] ??
    null;

  const [businessDispatchSubtype, setBusinessDispatchSubtype] =
    useState<BusinessDispatchSubtype>("credit_card_airport_transfer");
  const [selectedPassengerId, setSelectedPassengerId] = useState(
    initialPassengerId &&
      passengers.some((row) => row.passengerId === initialPassengerId)
      ? initialPassengerId
      : "",
  );
  const [pickupAddressId, setPickupAddressId] = useState(
    resolvedInitialPickup?.addressId ?? "",
  );
  const [dropoffAddressId, setDropoffAddressId] = useState(
    resolvedInitialDropoff?.addressId ?? "",
  );
  const [pickupAddress, setPickupAddress] = useState(
    resolvedInitialPickup?.addressText ?? "",
  );
  const [pickupLat, setPickupLat] = useState(
    resolvedInitialPickup?.lat == null ? "" : String(resolvedInitialPickup.lat),
  );
  const [pickupLng, setPickupLng] = useState(
    resolvedInitialPickup?.lng == null ? "" : String(resolvedInitialPickup.lng),
  );
  const [dropoffAddress, setDropoffAddress] = useState(
    resolvedInitialDropoff?.addressText ?? "",
  );
  const [dropoffLat, setDropoffLat] = useState(
    resolvedInitialDropoff?.lat == null
      ? ""
      : String(resolvedInitialDropoff.lat),
  );
  const [dropoffLng, setDropoffLng] = useState(
    resolvedInitialDropoff?.lng == null
      ? ""
      : String(resolvedInitialDropoff.lng),
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
  // Q-TEN04 accepted+pending: command was received but the created booking is
  // still awaiting external (approval) confirmation — stay on the form.
  const [acceptedPending, setAcceptedPending] = useState<BookingRecord | null>(
    null,
  );

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
    setReservationWindowEnd((value) => value || getDefaultDateTimeLocalValue(60));
  }, []);

  useEffect(() => {
    const passenger = passengers.find(
      (row) => row.passengerId === selectedPassengerId,
    );
    if (!passenger) return;
    setPassengerName(passenger.fullName);
    setPassengerPhone(passenger.mobile ?? "");
  }, [passengers, selectedPassengerId]);

  useEffect(() => {
    const pickup = addresses.find((row) => row.addressId === pickupAddressId);
    if (!pickup) return;
    setPickupAddress(pickup.addressText);
    setPickupLat(pickup.lat == null ? "" : String(pickup.lat));
    setPickupLng(pickup.lng == null ? "" : String(pickup.lng));
  }, [addresses, pickupAddressId]);

  useEffect(() => {
    const dropoff = addresses.find((row) => row.addressId === dropoffAddressId);
    if (!dropoff) return;
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
    estimatedAmountMinor,
    expenseProofRequired,
    flightNo,
    passengerName,
    passengerPhone,
    passengers,
    policyPreviewReady,
    reservationWindowEnd,
    reservationWindowStart,
    selectedPassengerId,
    signoffRequired,
    vehiclePreference,
  ]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setAcceptedPending(null);

    if (draftValidationErrors.length > 0) {
      setSubmitError(draftValidationErrors[0] ?? "Booking draft is invalid.");
      return;
    }

    if (approvalEvaluation?.outcome?.blocked) {
      setSubmitError("此訂單目前被租戶審批 / 配額政策封鎖，請調整後再送出。");
      return;
    }

    setSubmitting(true);
    try {
      const command = buildTenantBookingCreateCommand({ draft, passengers });
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
          result.error ?? `Create booking failed (HTTP ${response.status}).`,
        );
      }

      const booking = result.booking;
      // Q-TEN04 / §5.3: a pending-approval booking is the accepted+pending
      // moment — stay on the form and surface it; otherwise go to detail.
      if (booking.approvalState === "pending") {
        setAcceptedPending(booking);
        return;
      }

      startTransition(() => {
        router.push(`/bookings/${booking.bookingId}`);
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
  const decisionMeta = describeDecisionTone(decision);
  const blocked = approvalEvaluation?.outcome?.blocked === true;
  const submitInProgress = submitting || pending;
  const submitDisabled =
    submitInProgress || policyRefreshing || blocked || missingRequiredFields;

  // CTAs are resolved from the route's availableActions[] (Q-X13) via findAction,
  // then live runtime state is overlaid onto the base descriptor. The form never
  // hard-codes a CTA the route did not publish.
  const submitBase = findAction(availableActions, "submit_command");
  const cancelBase = findAction(availableActions, "cancel_form");
  const draftBase = findAction(availableActions, "save_draft");

  const submitDescriptor: ResourceActionDescriptor = useMemo(
    () => ({
      ...(submitBase ?? {
        action: "submit_command",
        enabled: true,
        riskLevel: "medium" as const,
      }),
      // A require_approval decision relabels the same published affordance
      // (Q-TEN04) — it does not introduce a new route action.
      action:
        decision === "require_approval"
          ? "submit_for_approval"
          : (submitBase?.action ?? "submit_command"),
      enabled: (submitBase?.enabled ?? true) && !submitDisabled,
      ...(blocked
        ? { disabledReasonCode: "blocked_by_policy" }
        : missingRequiredFields
          ? { disabledReasonCode: "missing_required_fields" }
          : submitInProgress
            ? { disabledReasonCode: "submitting" }
            : {}),
    }),
    [blocked, decision, missingRequiredFields, submitBase, submitDisabled, submitInProgress],
  );
  // cancel_form: published descriptor, disabled only while a submit is in flight.
  const cancelDescriptor: ResourceActionDescriptor = {
    ...(cancelBase ?? {
      action: "cancel_form",
      enabled: true,
      riskLevel: "low" as const,
    }),
    enabled: (cancelBase?.enabled ?? true) && !submitInProgress,
  };
  // save_draft: rendered straight from the route descriptor — disabled with the
  // drafts_not_supported reason (Q-TEN04 synchronous-command-only), never hidden.
  const draftDescriptor: ResourceActionDescriptor = draftBase ?? {
    action: "save_draft",
    enabled: false,
    disabledReasonCode: "drafts_not_supported",
    riskLevel: "low",
  };

  const submitLabel = submitInProgress
    ? "送出中…"
    : ACTION_LABELS[submitDescriptor.action];

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
        <CanvasCard theme={th} title="行程" subtitle="服務類型 · 時間 · 乘客（代訂或本人）">
          <div style={gridTwoStyle}>
            <FormField label="服務類型 · service subtype" required>
              <select
                style={controlStyle}
                value={businessDispatchSubtype}
                onChange={(event) =>
                  setBusinessDispatchSubtype(
                    event.target.value as BusinessDispatchSubtype,
                  )
                }
              >
                {BUSINESS_SUBTYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="乘客 · 從通訊錄"
              hint={
                activePassenger
                  ? "代訂模式：乘客姓名 / 電話鎖定為通訊錄資料。"
                  : "選擇通訊錄乘客以代訂，或維持手動輸入。"
              }
            >
              <select
                style={controlStyle}
                value={selectedPassengerId}
                onChange={(event) => setSelectedPassengerId(event.target.value)}
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
            </FormField>

            <FormField label="預約開始 · reservationWindowStart" required>
              <input
                style={monoControlStyle}
                type="datetime-local"
                required
                value={reservationWindowStart}
                onChange={(event) =>
                  setReservationWindowStart(event.target.value)
                }
              />
            </FormField>

            <FormField label="預約結束 · reservationWindowEnd" required>
              <input
                style={monoControlStyle}
                type="datetime-local"
                required
                value={reservationWindowEnd}
                onChange={(event) => setReservationWindowEnd(event.target.value)}
              />
            </FormField>

            <FormField label="乘客姓名 · passenger.name" required>
              <input
                style={controlStyle}
                type="text"
                required
                disabled={!!activePassenger}
                value={passengerName}
                onChange={(event) => setPassengerName(event.target.value)}
              />
            </FormField>

            <FormField
              label="乘客電話 · passenger.phone"
              required
              hint={
                activePassenger && !passengerPhoneLocked
                  ? "此通訊錄乘客未登記電話，請於此補上。"
                  : undefined
              }
            >
              <input
                style={controlStyle}
                type="tel"
                required
                disabled={passengerPhoneLocked}
                value={passengerPhone}
                onChange={(event) => setPassengerPhone(event.target.value)}
              />
            </FormField>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="上下車"
          subtitle="從地址簿選取後仍可微調，不另開地理編碼流程"
          actions={
            <Link
              href="/addresses"
              style={{ textDecoration: "none" }}
              target="_blank"
              rel="noreferrer"
            >
              <CanvasBtn theme={th} size="xs" variant="ghost" icon="ext">
                地址簿
              </CanvasBtn>
            </Link>
          }
        >
          <div style={gridTwoStyle}>
            <FormField label="常用上車地點">
              <select
                style={controlStyle}
                value={pickupAddressId}
                onChange={(event) => setPickupAddressId(event.target.value)}
              >
                <option value="">手動上車</option>
                {addresses.map((address) => (
                  <option key={address.addressId} value={address.addressId}>
                    {address.addressName}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="常用下車地點">
              <select
                style={controlStyle}
                value={dropoffAddressId}
                onChange={(event) => setDropoffAddressId(event.target.value)}
              >
                <option value="">手動下車</option>
                {addresses.map((address) => (
                  <option key={address.addressId} value={address.addressId}>
                    {address.addressName}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="pickup 地址" required span>
              <input
                style={controlStyle}
                type="text"
                required
                value={pickupAddress}
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupAddress(event.target.value);
                }}
              />
            </FormField>
            <FormField label="drop 地址" required span>
              <input
                style={controlStyle}
                type="text"
                required
                value={dropoffAddress}
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffAddress(event.target.value);
                }}
              />
            </FormField>
            <FormField label="pickup lat">
              <input
                style={monoControlStyle}
                inputMode="decimal"
                value={pickupLat}
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupLat(event.target.value);
                }}
              />
            </FormField>
            <FormField label="pickup lng">
              <input
                style={monoControlStyle}
                inputMode="decimal"
                value={pickupLng}
                onChange={(event) => {
                  setPickupAddressId("");
                  setPickupLng(event.target.value);
                }}
              />
            </FormField>
            <FormField label="drop lat">
              <input
                style={monoControlStyle}
                inputMode="decimal"
                value={dropoffLat}
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffLat(event.target.value);
                }}
              />
            </FormField>
            <FormField label="drop lng">
              <input
                style={monoControlStyle}
                inputMode="decimal"
                value={dropoffLng}
                onChange={(event) => {
                  setDropoffAddressId("");
                  setDropoffLng(event.target.value);
                }}
              />
            </FormField>
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="關聯與治理"
          subtitle="成本中心 · 財務參照 · 代訂與現場聯絡資訊（均在已發布的 booking command 內）"
        >
          <div style={gridTwoStyle}>
            <FormField
              label="成本中心 · cost center"
              required={costCenters.length > 0}
              hint={
                costCenters.length === 0
                  ? "此租戶尚無啟用的成本中心，沿用自由輸入。"
                  : undefined
              }
            >
              {costCenters.length > 0 ? (
                <select
                  style={controlStyle}
                  required
                  value={costCenter}
                  onChange={(event) => setCostCenter(event.target.value)}
                >
                  <option value="">選擇成本中心</option>
                  {costCenters.map((center: TenantCostCenterRecord) => (
                    <option key={center.code} value={center.code}>
                      {center.code} · {center.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  style={controlStyle}
                  type="text"
                  placeholder="自由輸入成本中心"
                  value={costCenter}
                  onChange={(event) => setCostCenter(event.target.value)}
                />
              )}
            </FormField>

            <FormField
              label={`預估費用 (${CURRENCY})`}
              hint="預覽用途；canonical quotedFare 仍由後端定價權威決定。"
            >
              <input
                style={monoControlStyle}
                inputMode="decimal"
                placeholder="1580"
                value={quotedFare}
                onChange={(event) => setQuotedFare(event.target.value)}
              />
            </FormField>

            <FormField label="專案碼 · benefit reference">
              <input
                style={monoControlStyle}
                type="text"
                value={benefitReference}
                onChange={(event) => setBenefitReference(event.target.value)}
              />
            </FormField>

            <FormField label="車輛偏好 · vehicle preference">
              <input
                style={controlStyle}
                type="text"
                value={vehiclePreference}
                onChange={(event) => setVehiclePreference(event.target.value)}
              />
            </FormField>

            <FormField label="方向 · direction">
              <select
                style={controlStyle}
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as "" | "pickup" | "dropoff")
                }
              >
                <option value="">未設定</option>
                <option value="pickup">去程 · pickup</option>
                <option value="dropoff">回程 · dropoff</option>
              </select>
            </FormField>

            <FormField
              label="航班 · flightNo"
              hint={
                businessDispatchSubtype === "credit_card_airport_transfer" &&
                direction === "pickup"
                  ? "機場接機需填航班號。"
                  : undefined
              }
            >
              <input
                style={monoControlStyle}
                type="text"
                value={flightNo}
                onChange={(event) => setFlightNo(event.target.value)}
              />
            </FormField>

            <FormField label="航廈 · terminal">
              <input
                style={controlStyle}
                type="text"
                value={terminal}
                onChange={(event) => setTerminal(event.target.value)}
              />
            </FormField>

            <FormField label="行李件數 · luggage">
              <input
                style={monoControlStyle}
                inputMode="numeric"
                value={luggageCount}
                onChange={(event) => setLuggageCount(event.target.value)}
              />
            </FormField>

            <FormField label="備註 · notes" span>
              <textarea
                style={{ ...controlStyle, minHeight: 72, resize: "vertical" }}
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </FormField>

            <FormField label="代訂人姓名 · bookedBy.name">
              <input
                style={controlStyle}
                type="text"
                value={bookedByName}
                onChange={(event) => setBookedByName(event.target.value)}
              />
            </FormField>

            <FormField label="代訂人 Email · bookedBy.email">
              <input
                style={controlStyle}
                type="email"
                value={bookedByEmail}
                onChange={(event) => setBookedByEmail(event.target.value)}
              />
            </FormField>

            <FormField label="現場聯絡人 · onsiteContact.name">
              <input
                style={controlStyle}
                type="text"
                value={onsiteContactName}
                onChange={(event) => setOnsiteContactName(event.target.value)}
              />
            </FormField>

            <FormField label="現場聯絡電話 · onsiteContact.phone">
              <input
                style={controlStyle}
                type="tel"
                value={onsiteContactPhone}
                onChange={(event) => setOnsiteContactPhone(event.target.value)}
              />
            </FormField>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: th.text,
              }}
            >
              <input
                type="checkbox"
                checked={signoffRequired}
                onChange={(event) => setSignoffRequired(event.target.checked)}
              />
              需主管簽核 · signoffRequired
            </label>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: th.text,
              }}
            >
              <input
                type="checkbox"
                checked={expenseProofRequired}
                onChange={(event) =>
                  setExpenseProofRequired(event.target.checked)
                }
              />
              需報帳憑證 · expenseProofRequired
            </label>
          </div>
        </CanvasCard>
      </div>

      <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
        <CanvasCard
          theme={th}
          title="審批與配額"
          subtitle="決策與配額影響直接來自後端 preview"
          actions={
            <CanvasPill theme={th} tone={policyRefreshing ? "info" : "neutral"} dot>
              {policyRefreshing ? "更新中" : "auto"}
            </CanvasPill>
          }
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <CanvasPill theme={th} tone={decisionMeta.tone} dot>
              {decisionMeta.label}
            </CanvasPill>
            <CanvasPill theme={th} tone="neutral">
              {BUSINESS_SUBTYPE_OPTIONS.find(
                (option) => option.value === businessDispatchSubtype,
              )?.label ?? businessDispatchSubtype}
            </CanvasPill>
            <CanvasPill theme={th} tone="neutral">
              {describeDirection(direction)}
            </CanvasPill>
          </div>

          {policyError ? (
            <CanvasBanner
              theme={th}
              tone="danger"
              icon="warn"
              title="政策預覽失敗"
              body={policyError}
            />
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "8px 16px",
              fontSize: 12.5,
              marginTop: policyError ? 12 : 0,
            }}
          >
            <DefRow k="預估費用 · estimate" v={formatCurrency(estimatedAmountMinor)} mono />
            <DefRow
              k="乘客角色 · role"
              v={activePassenger?.roles?.[0] ?? "未發布"}
            />
          </div>

          {approvalEvaluation?.approvalPlan ? (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <strong style={{ fontSize: 12, color: th.text }}>審批計畫</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <CanvasPill theme={th} tone="neutral">
                  mode: {approvalEvaluation.approvalPlan.approvalMode}
                </CanvasPill>
                <CanvasPill theme={th} tone="info">
                  timeout: {approvalEvaluation.approvalPlan.timeoutHours}h
                </CanvasPill>
                <CanvasPill theme={th} tone="warn">
                  fallback: {approvalEvaluation.approvalPlan.fallbackPolicy}
                </CanvasPill>
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  color: th.textMuted,
                  fontSize: 12,
                }}
              >
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
            </div>
          ) : null}

          {(approvalEvaluation?.warnings?.length ?? 0) > 0 ? (
            <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
              <strong style={{ fontSize: 12, color: th.text }}>提醒</strong>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  color: th.textMuted,
                  fontSize: 12,
                }}
              >
                {(approvalEvaluation?.warnings ?? []).map((warning) => (
                  <li key={`${warning.source}-${warning.code}`}>
                    {warning.message} ({warning.code})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div style={{ marginTop: 12, borderTop: `1px solid ${th.border}`, paddingTop: 12 }}>
            <strong style={{ fontSize: 12, color: th.text }}>配額影響</strong>
            {quotaPreview?.impacts?.length ? (
              <ul
                style={{
                  margin: "8px 0 0",
                  paddingLeft: 18,
                  color: th.textMuted,
                  fontSize: 12,
                }}
              >
                {quotaPreview.impacts.map((impact) => (
                  <li
                    key={`${impact.scope}-${impact.costCenterCode ?? "tenant"}-${impact.dimension}`}
                  >
                    {describeImpactLabel(impact.scope, impact.costCenterCode)} ·{" "}
                    {impact.dimension} · 前 {impact.remainingBefore ?? "n/a"} /{" "}
                    {impact.limitValue ?? "n/a"} · 後{" "}
                    {impact.remainingAfter ?? "n/a"} · 剩{" "}
                    {formatPercent(impact.remainingPercentAfter)}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: th.textDim }}>
                填妥核心欄位後即可取得配額影響回饋。
              </p>
            )}
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="送出"
          subtitle="封鎖維持 client-blocked；需審批仍可送出，審批流程由後端擁有"
        >
          {acceptedPending ? (
            <CanvasBanner
              theme={th}
              tone="info"
              icon="bookings"
              title="已受理 · 等待確認 (accepted+pending)"
              body={`command 已送出，訂單 ${acceptedPending.bookingId} 正等待審批確認。可前往訂單詳情追蹤。`}
              actions={
                <Link
                  href={`/bookings/${acceptedPending.bookingId}`}
                  style={{ textDecoration: "none" }}
                >
                  <CanvasBtn theme={th} size="xs" variant="primary" icon="ext">
                    查看訂單
                  </CanvasBtn>
                </Link>
              }
            />
          ) : null}

          {submitError ? (
            <CanvasBanner
              theme={th}
              tone="danger"
              icon="warn"
              title="無法建立訂單"
              body={submitError}
            />
          ) : draftValidationErrors.length > 0 ? (
            <CanvasBanner
              theme={th}
              tone="warn"
              icon="warn"
              title="尚有欄位需修正"
              body={draftValidationErrors[0] ?? ""}
            />
          ) : null}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0" }}>
            <CanvasPill theme={th} tone={decisionMeta.tone} dot>
              {decisionMeta.label}
            </CanvasPill>
            {costCenter ? (
              <CanvasPill theme={th} tone="neutral">
                {costCenter}
              </CanvasPill>
            ) : null}
          </div>

          {/* availableActions-driven CTAs (Q-X13) */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href="/bookings" style={{ textDecoration: "none" }}>
              <ActionButton descriptor={cancelDescriptor} variant="secondary" icon="x">
                {ACTION_LABELS.cancel_form}
              </ActionButton>
            </Link>
            <span style={{ flex: 1 }} />
            <ActionButton descriptor={draftDescriptor} variant="ghost">
              {ACTION_LABELS.save_draft}
            </ActionButton>
            <SubmitButton disabled={submitDisabled} label={submitLabel} descriptor={submitDescriptor} />
          </div>
        </CanvasCard>
      </div>
    </form>
  );
}

function DefRow({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: th.textMuted }}>{k}</span>
      <span
        style={{
          color: th.text,
          fontFamily: mono ? th.monoFamily : th.fontFamily,
        }}
      >
        {v}
      </span>
    </div>
  );
}

// Real submit button (CanvasBtn renders type="button"); we mirror its styling so
// the descriptor-disabled state and primary accent stay consistent.
function SubmitButton({
  disabled,
  label,
  descriptor,
}: {
  disabled: boolean;
  label: ReactNode;
  descriptor: ResourceActionDescriptor;
}) {
  const reason = descriptor.disabledReasonCode
    ? (DISABLED_REASON_LABELS[descriptor.disabledReasonCode] ??
      descriptor.disabledReasonCode)
    : undefined;
  const button = (
    <button
      type="submit"
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        height: 28,
        fontSize: 12,
        fontWeight: 600,
        background: th.accent,
        color: "#fff",
        border: `1px solid ${th.accent}`,
        borderRadius: 7,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontFamily: th.fontFamily,
      }}
    >
      {label}
    </button>
  );
  if (disabled && reason) {
    return <span title={reason}>{button}</span>;
  }
  return button;
}
