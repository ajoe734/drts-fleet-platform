"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  ActionReceipt,
  BusinessDispatchSubtype,
  CrossAppResourceLink,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  TenantAddressRecord,
  TenantApprovalEvaluationResult,
  TenantBookingQuotaImpactPreview,
  TenantCostCenterRecord,
  TenantPassengerRecord,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  DetailList,
  KpiCard,
  KpiRow,
  StatusChip,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  buildTenantBookingCreateCommand,
  getDefaultDateTimeLocalValue,
  getTenantBookingFieldErrors,
  isMissingRequiredBookingFields,
  isReadyForTenantBookingPolicyPreview,
  parseAmountMajor,
  type TenantBookingDraftValues,
  type TenantBookingFieldErrors,
} from "./tenant-booking-create-form-utils";

type BookingCreateActionMap = {
  submit: ResourceActionDescriptor;
  cancel: ResourceActionDescriptor;
  refresh: ResourceActionDescriptor;
  viewBookings: ResourceActionDescriptor;
  clearShortcuts: ResourceActionDescriptor;
  managePassengers: ResourceActionDescriptor;
  manageAddresses: ResourceActionDescriptor;
  manageCostCenters: ResourceActionDescriptor;
  reviewRules: ResourceActionDescriptor;
};

type BookingCreatePrefillModel = {
  businessDispatchSubtype: BusinessDispatchSubtype;
  direction: "" | "pickup" | "dropoff";
  selectedPassengerId: string;
  pickupAddressId: string;
  dropoffAddressId: string;
  badges: string[];
  sourceLabel: string | null;
};

export type TenantBookingCreatePageModel = {
  refreshTier: RefreshTier;
  refresh: UiRefreshMetadata;
  health: UiHealthEnvelope;
  emptyState: EmptyStateEnvelope | null;
  actions: BookingCreateActionMap;
  links: {
    bookings: string;
    clearShortcuts: string;
    passengers: string;
    addresses: string;
    costCenters: string;
    rules: string;
    audit: string;
  };
  prefill: BookingCreatePrefillModel;
  errors: string[];
};

type SubmitResponse = {
  error?: string;
  booking?: {
    bookingId: string;
    status?: string;
  };
  receipt?: ActionReceipt;
  auditHref?: string | null;
  crossAppLinks?: CrossAppResourceLink[];
};

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

const pageStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 18,
  background:
    "radial-gradient(circle at top left, rgba(20,184,166,0.18), transparent 32%), #07141a",
  color: th.text,
};
const twoColumnLayoutStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.95fr)",
  gap: 16,
  alignItems: "start",
};
const cardStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};
const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};
const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
};
const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: th.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
const hintStyle: CSSProperties = {
  fontSize: 12,
  color: th.textMuted,
  lineHeight: 1.5,
};
const errorStyle: CSSProperties = {
  fontSize: 12,
  color: "#fda4af",
  lineHeight: 1.5,
};
const inputBaseStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  borderRadius: 16,
  border: `1px solid ${th.borderStrong}`,
  background: "rgba(8, 18, 24, 0.78)",
  color: th.text,
  padding: "0 12px",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};
const textareaStyle: CSSProperties = {
  ...inputBaseStyle,
  minHeight: 96,
  padding: "12px",
  resize: "vertical",
};
const fullSpanStyle: CSSProperties = {
  gridColumn: "1 / -1",
};
const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};
const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};
const checkboxRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};
const checkboxChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  border: `1px solid ${th.borderStrong}`,
  background: "rgba(15, 23, 42, 0.56)",
  fontSize: 12.5,
  color: th.text,
};
const emptyStatePanelStyle: CSSProperties = {
  padding: "28px 20px",
  borderRadius: 24,
  border: `1px solid ${th.borderStrong}`,
  background: "rgba(8, 18, 24, 0.92)",
  display: "grid",
  gap: 14,
  boxShadow: th.shadow,
};
const receiptStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: "14px 16px",
  borderRadius: 18,
  border: "1px solid rgba(45, 212, 191, 0.35)",
  background: "rgba(13, 148, 136, 0.12)",
};
const inlineLinkStyle: CSSProperties = {
  color: th.accent,
  fontWeight: 700,
  textDecoration: "none",
};
const pageMetaCardStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 18,
  borderRadius: 22,
  border: `1px solid ${th.borderStrong}`,
  background: "rgba(9, 20, 28, 0.82)",
  boxShadow: th.shadow,
};
const pageMetaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};
const metaItemStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "12px 14px",
  borderRadius: 16,
  border: `1px solid ${th.borderStrong}`,
  background: "rgba(15, 23, 42, 0.48)",
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

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("zh-Hant", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatAge(generatedAt: string, nowMs: number) {
  const generatedAtMs = new Date(generatedAt).getTime();
  if (!Number.isFinite(generatedAtMs)) {
    return "unknown";
  }

  const deltaSeconds = Math.max(0, Math.floor((nowMs - generatedAtMs) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  return `${deltaHours}h ago`;
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
      return "Drop-off";
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

function firstError(errors: TenantBookingFieldErrors) {
  return Object.values(errors).find(Boolean) ?? null;
}

function toneForDecision(result: TenantApprovalEvaluationResult | null) {
  const decision = result?.outcome?.decision ?? "allow";
  switch (decision) {
    case "block":
      return "danger" as const;
    case "require_approval":
    case "warn":
      return "warning" as const;
    case "manual_review":
      return "info" as const;
    default:
      return "success" as const;
  }
}

function toneForRefreshTier(
  tier: RefreshTier,
): "neutral" | "info" | "success" | "warn" {
  switch (tier) {
    case "manual":
      return "info";
    case "urgent":
    case "fast":
    case "dispatch":
      return "success";
    default:
      return "neutral";
  }
}

function labelForRefreshTier(tier: RefreshTier) {
  switch (tier) {
    case "manual":
      return "Manual";
    case "urgent":
      return "Urgent";
    case "fast":
      return "Fast";
    case "dispatch":
      return "Dispatch";
    case "medium":
      return "Medium";
    case "medium_slow":
      return "Medium slow";
    case "slow":
      return "Slow";
    default:
      return tier;
  }
}

function actionSurfaceStyle(
  descriptor: ResourceActionDescriptor,
  options: { primary?: boolean | undefined } = {},
): CSSProperties {
  const isDanger = descriptor.riskLevel === "high";
  const isPrimary = options.primary ?? descriptor.riskLevel === "medium";
  const background = isDanger
    ? "#b91c1c"
    : isPrimary
      ? th.accent
      : "rgba(15, 23, 42, 0.5)";
  const borderColor = isDanger
    ? "#b91c1c"
    : isPrimary
      ? th.accent
      : th.borderStrong;

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    padding: "0 16px",
    borderRadius: 999,
    border: `1px solid ${borderColor}`,
    background,
    color: isPrimary || isDanger ? "#031317" : th.text,
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
    cursor: descriptor.enabled ? "pointer" : "not-allowed",
    opacity: descriptor.enabled ? 1 : 0.45,
    boxShadow: isPrimary || isDanger ? th.shadow : "none",
  };
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  const origins: Record<CrossAppResourceLink["targetApp"], string | undefined> =
    {
      "ops-console": process.env.NEXT_PUBLIC_OPS_CONSOLE_URL,
      "platform-admin": process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL,
      "tenant-console": process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL,
    };
  const baseUrl = origins[link.targetApp]?.replace(/\/$/, "");
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl}${link.route}`;
}

function FieldShell({
  label,
  hint,
  error,
  fullSpan = false,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | null | undefined;
  fullSpan?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      style={
        fullSpan ? { ...fieldStackStyle, ...fullSpanStyle } : fieldStackStyle
      }
    >
      <span style={labelStyle}>{label}</span>
      {children}
      {error ? (
        <span style={errorStyle}>{error}</span>
      ) : hint ? (
        <span style={hintStyle}>{hint}</span>
      ) : null}
    </label>
  );
}

function ActionLink({
  descriptor,
  href,
  label,
  newTab = false,
}: {
  descriptor: ResourceActionDescriptor;
  href: string;
  label: string;
  newTab?: boolean;
}) {
  if (!descriptor.enabled) {
    return (
      <span
        style={actionSurfaceStyle(descriptor)}
        title={descriptor.disabledReasonCode ?? "Action unavailable"}
      >
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      rel={newTab ? "noreferrer" : undefined}
      style={actionSurfaceStyle(descriptor)}
      target={newTab ? "_blank" : undefined}
    >
      {label}
    </Link>
  );
}

function ActionButton({
  descriptor,
  label,
  onClick,
  primary,
  type = "button",
  disabled = false,
}: {
  descriptor: ResourceActionDescriptor;
  label: string;
  onClick?: () => void;
  primary?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const effectiveDescriptor = {
    ...descriptor,
    enabled: descriptor.enabled && !disabled,
  };

  return (
    <button
      disabled={!effectiveDescriptor.enabled}
      onClick={onClick}
      style={actionSurfaceStyle(effectiveDescriptor, { primary })}
      title={descriptor.disabledReasonCode ?? undefined}
      type={type}
    >
      {label}
    </button>
  );
}

function EmptyStatePanel({
  emptyState,
  actions,
  links,
  onRefresh,
}: {
  emptyState: EmptyStateEnvelope;
  actions: BookingCreateActionMap;
  links: TenantBookingCreatePageModel["links"];
  onRefresh: () => void;
}) {
  const copy: Record<
    EmptyStateEnvelope["reason"],
    { title: string; description: string; tone: CSSProperties }
  > = {
    no_data: {
      title: "目前沒有可用的建立捷徑",
      description:
        "乘客與地址目錄都還沒有可用資料。先補齊 tenant directory，再回來建立訂單。",
      tone: {
        borderColor: "rgba(148, 163, 184, 0.28)",
        background: "rgba(15, 23, 42, 0.72)",
      },
    },
    not_provisioned: {
      title: "Cost center 尚未佈建",
      description:
        "這個路由需要 canonical cost-center 目錄，否則 booking command 不能送出。",
      tone: {
        borderColor: "rgba(34, 211, 238, 0.38)",
        background: "rgba(8, 47, 73, 0.5)",
      },
    },
    fetch_failed: {
      title: "建立訂單所需資料載入失敗",
      description:
        "至少一個必要目錄來源讀取失敗。請先 refresh，確認資料恢復後再送出。",
      tone: {
        borderColor: "rgba(253, 164, 175, 0.45)",
        background: "rgba(69, 10, 10, 0.48)",
      },
    },
    permission_denied: {
      title: "目前身分沒有建立訂單權限",
      description:
        "後端拒絕目前 actor 的 booking-create authority。請與 tenant admin 確認權限。",
      tone: {
        borderColor: "rgba(253, 224, 71, 0.45)",
        background: "rgba(113, 63, 18, 0.48)",
      },
    },
    external_unavailable: {
      title: "外部依賴暫時不可用",
      description:
        "booking command 依賴的上游服務暫時異常。等依賴恢復後 refresh 再重試。",
      tone: {
        borderColor: "rgba(251, 146, 60, 0.45)",
        background: "rgba(67, 20, 7, 0.48)",
      },
    },
    filtered_empty: {
      title: "預填捷徑已失效",
      description:
        "乘客或地址的預填連結已經過期。清除 shortcut context 後，從乾淨表單重新開始。",
      tone: {
        borderColor: "rgba(45, 212, 191, 0.34)",
        background: "rgba(17, 94, 89, 0.34)",
      },
    },
    driver_not_eligible: {
      title: "Driver eligibility 不適用這個頁面",
      description:
        "Tenant booking create route 不使用 driver eligibility 狀態。",
      tone: {
        borderColor: "rgba(148, 163, 184, 0.28)",
        background: "rgba(15, 23, 42, 0.72)",
      },
    },
  };
  const content = copy[emptyState.reason] ?? copy.no_data;

  return (
    <div style={{ ...emptyStatePanelStyle, ...content.tone }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <CanvasPill theme={th} tone="info" dot>
          EmptyReason
        </CanvasPill>
        <CanvasPill theme={th} tone="neutral">
          {emptyState.reason}
        </CanvasPill>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <strong style={{ fontSize: 22, color: th.text }}>
          {content.title}
        </strong>
        <p
          style={{
            margin: 0,
            maxWidth: 560,
            color: th.textMuted,
            lineHeight: 1.6,
          }}
        >
          {content.description}
        </p>
        <span style={{ fontSize: 12, color: th.textMuted }}>
          messageCode: {emptyState.messageCode}
        </span>
      </div>
      <div style={actionRowStyle}>
        {emptyState.nextAction?.action === actions.refresh.action ? (
          <ActionButton
            descriptor={actions.refresh}
            label="Refresh now"
            onClick={onRefresh}
            primary
          />
        ) : emptyState.nextAction?.action === actions.clearShortcuts.action ? (
          <ActionLink
            descriptor={actions.clearShortcuts}
            href={links.clearShortcuts}
            label="Clear shortcut context"
          />
        ) : emptyState.nextAction?.action ===
          actions.manageCostCenters.action ? (
          <ActionLink
            descriptor={actions.manageCostCenters}
            href={links.costCenters}
            label="Open cost centers"
          />
        ) : emptyState.nextAction?.action ===
          actions.managePassengers.action ? (
          <ActionLink
            descriptor={actions.managePassengers}
            href={links.passengers}
            label="Open passengers"
          />
        ) : null}
        <ActionLink
          descriptor={actions.viewBookings}
          href={links.bookings}
          label="Back to booking list"
        />
      </div>
    </div>
  );
}

export function TenantBookingCreateForm({
  passengers,
  addresses,
  costCenters,
  pageModel,
}: {
  passengers: TenantPassengerRecord[];
  addresses: TenantAddressRecord[];
  costCenters: TenantCostCenterRecord[];
  pageModel: TenantBookingCreatePageModel;
}) {
  const router = useRouter();
  const [navigationPending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [timingMode, setTimingMode] = useState<"scheduled" | "immediate">(
    "scheduled",
  );
  const [businessDispatchSubtype, setBusinessDispatchSubtype] =
    useState<BusinessDispatchSubtype>(
      pageModel.prefill.businessDispatchSubtype,
    );
  const [selectedPassengerId, setSelectedPassengerId] = useState(
    pageModel.prefill.selectedPassengerId,
  );
  const [pickupAddressId, setPickupAddressId] = useState(
    pageModel.prefill.pickupAddressId,
  );
  const [dropoffAddressId, setDropoffAddressId] = useState(
    pageModel.prefill.dropoffAddressId,
  );
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLat, setPickupLat] = useState("");
  const [pickupLng, setPickupLng] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffLat, setDropoffLat] = useState("");
  const [dropoffLng, setDropoffLng] = useState("");
  const [reservationWindowStart, setReservationWindowStart] = useState("");
  const [reservationWindowEnd, setReservationWindowEnd] = useState("");
  const [passengerName, setPassengerName] = useState("");
  const [passengerPhone, setPassengerPhone] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [benefitReference, setBenefitReference] = useState("");
  const [vehiclePreference, setVehiclePreference] = useState("");
  const [direction, setDirection] = useState(pageModel.prefill.direction);
  const [flightNo, setFlightNo] = useState("");
  const [terminal, setTerminal] = useState("");
  const [luggageCount, setLuggageCount] = useState("");
  const [notes, setNotes] = useState("");
  const [bookedByName, setBookedByName] = useState("");
  const [bookedByEmail, setBookedByEmail] = useState("");
  const [onsiteContactName, setOnsiteContactName] = useState("");
  const [onsiteContactPhone, setOnsiteContactPhone] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [signoffRequired, setSignoffRequired] = useState(false);
  const [expenseProofRequired, setExpenseProofRequired] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [policyRefreshing, setPolicyRefreshing] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quotaPreview, setQuotaPreview] =
    useState<TenantBookingQuotaImpactPreview | null>(null);
  const [approvalEvaluation, setApprovalEvaluation] =
    useState<TenantApprovalEvaluationResult | null>(null);
  const [submitReceipt, setSubmitReceipt] = useState<ActionReceipt | null>(
    null,
  );
  const [submitAuditHref, setSubmitAuditHref] = useState<string | null>(null);
  const [submitCrossAppLinks, setSubmitCrossAppLinks] = useState<
    CrossAppResourceLink[]
  >([]);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);
  const [redirectDelayMs, setRedirectDelayMs] = useState(0);

  const estimatedAmountMinor = parseAmountMajor(estimatedAmount);
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
    estimatedAmount,
    signoffRequired,
    expenseProofRequired,
  };

  const generatedAtMs = new Date(pageModel.refresh.generatedAt).getTime();
  const pageFreshness =
    pageModel.refresh.dataFreshness === "fresh" &&
    Number.isFinite(generatedAtMs) &&
    nowMs - generatedAtMs > pageModel.refresh.staleAfterMs
      ? "stale"
      : pageModel.refresh.dataFreshness;
  const activePassenger = passengers.find(
    (row) => row.passengerId === selectedPassengerId,
  );
  const passengerPhoneLocked =
    Boolean(activePassenger) && Boolean(activePassenger?.mobile?.trim());
  const policyPreviewReady =
    isReadyForTenantBookingPolicyPreview(draft) && Boolean(costCenter.trim());
  const formatErrors = getTenantBookingFieldErrors(draft, {
    requireCostCenter: costCenters.length > 0,
  });
  const visibleFieldErrors = getTenantBookingFieldErrors(draft, {
    includeRequired: submitAttempted,
    requireCostCenter: costCenters.length > 0,
  });
  const missingRequiredFields = isMissingRequiredBookingFields(
    draft,
    costCenters.length > 0,
  );
  const resolvedCrossAppLinks = submitCrossAppLinks
    .map((link) => ({ href: resolveCrossAppHref(link), link }))
    .filter(
      (entry): entry is { href: string; link: CrossAppResourceLink } =>
        entry.href != null,
    );
  const submitDisabled =
    submitting ||
    navigationPending ||
    policyRefreshing ||
    pageModel.emptyState != null ||
    pageModel.actions.submit.enabled === false ||
    approvalEvaluation?.outcome?.blocked === true ||
    missingRequiredFields ||
    Object.keys(formatErrors).length > 0;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const defaultStart = timingMode === "immediate" ? 0 : 30;
    const defaultEnd = timingMode === "immediate" ? 30 : 60;

    setReservationWindowStart(
      (value) => value || getDefaultDateTimeLocalValue(defaultStart),
    );
    setReservationWindowEnd(
      (value) => value || getDefaultDateTimeLocalValue(defaultEnd),
    );
  }, [timingMode]);

  useEffect(() => {
    if (!selectedPassengerId) {
      return;
    }

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
    if (!pickupAddressId) {
      return;
    }

    const address = addresses.find((row) => row.addressId === pickupAddressId);
    if (!address) {
      return;
    }

    setPickupAddress(address.addressText);
    setPickupLat(address.lat == null ? "" : String(address.lat));
    setPickupLng(address.lng == null ? "" : String(address.lng));
  }, [addresses, pickupAddressId]);

  useEffect(() => {
    if (!dropoffAddressId) {
      return;
    }

    const address = addresses.find((row) => row.addressId === dropoffAddressId);
    if (!address) {
      return;
    }

    setDropoffAddress(address.addressText);
    setDropoffLat(address.lat == null ? "" : String(address.lat));
    setDropoffLng(address.lng == null ? "" : String(address.lng));
  }, [addresses, dropoffAddressId]);

  useEffect(() => {
    if (!redirectTarget) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        router.push(redirectTarget);
        router.refresh();
      });
    }, redirectDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [redirectDelayMs, redirectTarget, router, startTransition]);

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
            passengerRole: activePassenger?.roles?.[0] ?? null,
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
    activePassenger,
    businessDispatchSubtype,
    costCenter,
    direction,
    estimatedAmountMinor,
    expenseProofRequired,
    flightNo,
    passengerName,
    passengerPhone,
    policyPreviewReady,
    reservationWindowEnd,
    reservationWindowStart,
    selectedPassengerId,
    signoffRequired,
    vehiclePreference,
  ]);

  function refreshPage() {
    startTransition(() => {
      router.refresh();
    });
  }

  function applyTimingMode(nextMode: "scheduled" | "immediate") {
    setTimingMode(nextMode);
    if (nextMode === "immediate") {
      setReservationWindowStart(getDefaultDateTimeLocalValue(0));
      setReservationWindowEnd(getDefaultDateTimeLocalValue(30));
      return;
    }

    setReservationWindowStart(getDefaultDateTimeLocalValue(30));
    setReservationWindowEnd(getDefaultDateTimeLocalValue(60));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);
    setSubmitReceipt(null);
    setSubmitAuditHref(null);
    setSubmitCrossAppLinks([]);
    setRedirectTarget(null);

    const blockingErrors = getTenantBookingFieldErrors(draft, {
      includeRequired: true,
      requireCostCenter: costCenters.length > 0,
    });
    const firstBlockingError = firstError(blockingErrors);
    if (firstBlockingError) {
      setSubmitError(firstBlockingError);
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
      const result = (await response.json()) as SubmitResponse;

      if (!response.ok || !result.booking?.bookingId) {
        throw new Error(
          result.error ?? `Create booking failed (HTTP ${response.status}).`,
        );
      }

      if (result.receipt) {
        setSubmitReceipt(result.receipt);
      }
      setSubmitAuditHref(result.auditHref ?? null);
      setSubmitCrossAppLinks(result.crossAppLinks ?? []);

      const nextHref = `/bookings/${result.booking.bookingId}`;
      if (result.receipt?.status === "accepted") {
        setRedirectDelayMs(1200);
        setRedirectTarget(nextHref);
        return;
      }

      setRedirectDelayMs(500);
      setRedirectTarget(nextHref);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unknown booking failure.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={pageStyle}>
      <CanvasPageHeader
        theme={th}
        title="建立叫車"
        subtitle="代訂或本人 · 預約 / 即時 · 同步 command 模式 (Q-TEN04)"
        actions={
          <>
            <ActionLink
              descriptor={pageModel.actions.viewBookings}
              href={pageModel.links.bookings}
              label="返回訂單列表"
            />
            <ActionButton
              descriptor={pageModel.actions.refresh}
              label={navigationPending ? "重新載入中..." : "Refresh"}
              onClick={refreshPage}
            />
          </>
        }
      />

      <div style={pageMetaCardStyle}>
        <div style={pageMetaGridStyle}>
          <div style={metaItemStyle}>
            <span style={labelStyle}>Command</span>
            <strong>POST /api/tenant/bookings/commands/create</strong>
          </div>
          <div style={metaItemStyle}>
            <span style={labelStyle}>Refresh Tier</span>
            <div style={chipRowStyle}>
              <CanvasPill
                theme={th}
                tone={toneForRefreshTier(pageModel.refreshTier)}
              >
                {labelForRefreshTier(pageModel.refreshTier)}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                {formatAge(pageModel.refresh.generatedAt, nowMs)}
              </CanvasPill>
            </div>
          </div>
          <div style={metaItemStyle}>
            <span style={labelStyle}>Directory Coverage</span>
            <div style={chipRowStyle}>
              <CanvasPill
                theme={th}
                tone={passengers.length > 0 ? "success" : "warn"}
              >
                passenger {passengers.length}
              </CanvasPill>
              <CanvasPill
                theme={th}
                tone={addresses.length > 0 ? "success" : "warn"}
              >
                address {addresses.length}
              </CanvasPill>
              <CanvasPill
                theme={th}
                tone={costCenters.length > 0 ? "success" : "warn"}
              >
                cost center {costCenters.length}
              </CanvasPill>
            </div>
          </div>
          <div style={metaItemStyle}>
            <span style={labelStyle}>Must-Support Actions</span>
            <div style={chipRowStyle}>
              <CanvasPill
                theme={th}
                tone={pageModel.actions.submit.enabled ? "info" : "neutral"}
              >
                submit_command
              </CanvasPill>
              <CanvasPill
                theme={th}
                tone={pageModel.actions.cancel.enabled ? "neutral" : "warn"}
              >
                cancel
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                draft unsupported
              </CanvasPill>
            </div>
          </div>
        </div>
      </div>

      {pageModel.prefill.sourceLabel ? (
        <div style={cardStackStyle}>
          <CanvasBanner
            theme={th}
            tone="info"
            icon="link"
            title="已套用 directory shortcut 預填"
            body={pageModel.prefill.sourceLabel}
          />
          <div style={chipRowStyle}>
            {pageModel.prefill.badges.map((badge) => (
              <CanvasPill key={badge} theme={th} tone="info">
                {badge}
              </CanvasPill>
            ))}
          </div>
        </div>
      ) : null}

      {pageModel.health.status !== "healthy" ? (
        <CanvasBanner
          theme={th}
          tone="warn"
          icon="warn"
          title="部分建立訂單依賴目前 degraded"
          body={pageModel.health.degradedServices
            .map((item) => item.impact)
            .join(" · ")}
        />
      ) : null}

      {pageFreshness !== "fresh" ? (
        <div style={cardStackStyle}>
          <CanvasBanner
            theme={th}
            icon={pageFreshness === "degraded" ? "warn" : "clock"}
            body={`Generated ${formatAge(pageModel.refresh.generatedAt, nowMs)} · ${formatDateTime(pageModel.refresh.generatedAt)} · refresh tier ${labelForRefreshTier(pageModel.refreshTier)}`}
            title={
              pageFreshness === "degraded"
                ? "Directory snapshot is degraded"
                : "Directory snapshot is stale"
            }
            tone={pageFreshness === "degraded" ? "warn" : "info"}
          />
          <div style={actionRowStyle}>
            <ActionButton
              descriptor={pageModel.actions.refresh}
              label="立即 refresh"
              onClick={refreshPage}
              primary
            />
          </div>
        </div>
      ) : null}

      {pageModel.emptyState ? (
        <EmptyStatePanel
          actions={pageModel.actions}
          emptyState={pageModel.emptyState}
          links={pageModel.links}
          onRefresh={refreshPage}
        />
      ) : (
        <form onSubmit={handleSubmit}>
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="spark"
            title="estimate 只用於 preview"
            body="費用、quota impact 與 approval posture 可先 preview，但 canonical quoted fare 仍由後端擁有。"
          />

          <div style={twoColumnLayoutStyle}>
            <div style={cardStackStyle}>
              <CanvasCard
                theme={th}
                title="行程"
                subtitle="服務類型、乘客、預約時間與地址簿捷徑都在同一張表單完成。"
              >
                <div style={fieldGridStyle}>
                  <FieldShell label="Service subtype">
                    <select
                      onChange={(event) =>
                        setBusinessDispatchSubtype(
                          event.target.value as BusinessDispatchSubtype,
                        )
                      }
                      style={inputBaseStyle}
                      value={businessDispatchSubtype}
                    >
                      {BUSINESS_SUBTYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FieldShell>

                  <FieldShell label="Timing mode">
                    <select
                      onChange={(event) =>
                        applyTimingMode(
                          event.target.value as "scheduled" | "immediate",
                        )
                      }
                      style={inputBaseStyle}
                      value={timingMode}
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="immediate">Immediate</option>
                    </select>
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.reservationWindowStart}
                    label="Reservation start"
                  >
                    <input
                      onChange={(event) =>
                        setReservationWindowStart(event.target.value)
                      }
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.reservationWindowStart
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="datetime-local"
                      value={reservationWindowStart}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.reservationWindowEnd}
                    label="Reservation end"
                  >
                    <input
                      onChange={(event) =>
                        setReservationWindowEnd(event.target.value)
                      }
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.reservationWindowEnd
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="datetime-local"
                      value={reservationWindowEnd}
                    />
                  </FieldShell>

                  <FieldShell
                    hint="Select a directory passenger for booking-on-behalf, or stay on manual entry."
                    label="Passenger"
                  >
                    <select
                      onChange={(event) =>
                        setSelectedPassengerId(event.target.value)
                      }
                      style={inputBaseStyle}
                      value={selectedPassengerId}
                    >
                      <option value="">Manual passenger entry</option>
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
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.passengerName}
                    label="Passenger name"
                  >
                    <input
                      disabled={Boolean(activePassenger)}
                      onChange={(event) => setPassengerName(event.target.value)}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.passengerName
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={passengerName}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.passengerPhone}
                    hint={
                      activePassenger
                        ? passengerPhoneLocked
                          ? "Passenger phone comes from the selected directory record."
                          : "This passenger has no phone on file; provide one here."
                        : "Manual passenger entry requires a direct contact number."
                    }
                    label="Passenger phone"
                  >
                    <input
                      disabled={passengerPhoneLocked}
                      onChange={(event) =>
                        setPassengerPhone(event.target.value)
                      }
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.passengerPhone
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="tel"
                      value={passengerPhone}
                    />
                  </FieldShell>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={th}
                title="Pickup / Drop-off"
                subtitle="先選地址簿，再視需要直接微調，不另外開 geocoding flow。"
              >
                <div style={fieldGridStyle}>
                  <FieldShell label="Saved pickup">
                    <select
                      onChange={(event) =>
                        setPickupAddressId(event.target.value)
                      }
                      style={inputBaseStyle}
                      value={pickupAddressId}
                    >
                      <option value="">Manual pickup</option>
                      {addresses.map((address) => (
                        <option
                          key={address.addressId}
                          value={address.addressId}
                        >
                          {address.addressName}
                        </option>
                      ))}
                    </select>
                  </FieldShell>

                  <FieldShell label="Saved drop-off">
                    <select
                      onChange={(event) =>
                        setDropoffAddressId(event.target.value)
                      }
                      style={inputBaseStyle}
                      value={dropoffAddressId}
                    >
                      <option value="">Manual drop-off</option>
                      {addresses.map((address) => (
                        <option
                          key={address.addressId}
                          value={address.addressId}
                        >
                          {address.addressName}
                        </option>
                      ))}
                    </select>
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.pickupAddress}
                    fullSpan
                    label="Pickup address"
                  >
                    <input
                      onChange={(event) => {
                        setPickupAddressId("");
                        setPickupAddress(event.target.value);
                      }}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.pickupAddress
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={pickupAddress}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.dropoffAddress}
                    fullSpan
                    label="Drop-off address"
                  >
                    <input
                      onChange={(event) => {
                        setDropoffAddressId("");
                        setDropoffAddress(event.target.value);
                      }}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.dropoffAddress
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={dropoffAddress}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.pickupLat}
                    label="Pickup lat"
                  >
                    <input
                      inputMode="decimal"
                      onChange={(event) => {
                        setPickupAddressId("");
                        setPickupLat(event.target.value);
                      }}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.pickupLat
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={pickupLat}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.pickupLng}
                    label="Pickup lng"
                  >
                    <input
                      inputMode="decimal"
                      onChange={(event) => {
                        setPickupAddressId("");
                        setPickupLng(event.target.value);
                      }}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.pickupLng
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={pickupLng}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.dropoffLat}
                    label="Drop-off lat"
                  >
                    <input
                      inputMode="decimal"
                      onChange={(event) => {
                        setDropoffAddressId("");
                        setDropoffLat(event.target.value);
                      }}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.dropoffLat
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={dropoffLat}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.dropoffLng}
                    label="Drop-off lng"
                  >
                    <input
                      inputMode="decimal"
                      onChange={(event) => {
                        setDropoffAddressId("");
                        setDropoffLng(event.target.value);
                      }}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.dropoffLng
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={dropoffLng}
                    />
                  </FieldShell>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={th}
                title="關聯與審批"
                subtitle="cost center、財務欄位與代訂 metadata 都隨 command 一起送出。"
              >
                <div style={fieldGridStyle}>
                  <FieldShell
                    error={visibleFieldErrors.costCenter}
                    label="Cost center"
                  >
                    <select
                      onChange={(event) => setCostCenter(event.target.value)}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.costCenter
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      value={costCenter}
                    >
                      <option value="">Select a cost center</option>
                      {costCenters.map((center) => (
                        <option key={center.code} value={center.code}>
                          {center.code} · {center.name}
                        </option>
                      ))}
                    </select>
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.estimatedAmount}
                    label={`Estimated spend (${CURRENCY})`}
                  >
                    <input
                      inputMode="decimal"
                      onChange={(event) =>
                        setEstimatedAmount(event.target.value)
                      }
                      placeholder="1580"
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.estimatedAmount
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={estimatedAmount}
                    />
                  </FieldShell>

                  <FieldShell label="Benefit reference">
                    <input
                      onChange={(event) =>
                        setBenefitReference(event.target.value)
                      }
                      style={inputBaseStyle}
                      type="text"
                      value={benefitReference}
                    />
                  </FieldShell>

                  <FieldShell label="Vehicle preference">
                    <input
                      onChange={(event) =>
                        setVehiclePreference(event.target.value)
                      }
                      style={inputBaseStyle}
                      type="text"
                      value={vehiclePreference}
                    />
                  </FieldShell>

                  <FieldShell label="Direction">
                    <select
                      onChange={(event) =>
                        setDirection(
                          event.target.value as "" | "pickup" | "dropoff",
                        )
                      }
                      style={inputBaseStyle}
                      value={direction}
                    >
                      <option value="">Not set</option>
                      <option value="pickup">Pickup</option>
                      <option value="dropoff">Drop-off</option>
                    </select>
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.flightNo}
                    label="Flight no."
                  >
                    <input
                      onChange={(event) => setFlightNo(event.target.value)}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.flightNo
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={flightNo}
                    />
                  </FieldShell>

                  <FieldShell label="Terminal">
                    <input
                      onChange={(event) => setTerminal(event.target.value)}
                      style={inputBaseStyle}
                      type="text"
                      value={terminal}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.luggageCount}
                    label="Luggage count"
                  >
                    <input
                      inputMode="numeric"
                      onChange={(event) => setLuggageCount(event.target.value)}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.luggageCount
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={luggageCount}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.bookedByName}
                    label="Booked by name"
                  >
                    <input
                      onChange={(event) => setBookedByName(event.target.value)}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.bookedByName
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={bookedByName}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.bookedByEmail}
                    label="Booked by email"
                  >
                    <input
                      onChange={(event) => setBookedByEmail(event.target.value)}
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.bookedByEmail
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="email"
                      value={bookedByEmail}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.onsiteContactName}
                    label="Onsite contact"
                  >
                    <input
                      onChange={(event) =>
                        setOnsiteContactName(event.target.value)
                      }
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.onsiteContactName
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="text"
                      value={onsiteContactName}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.onsiteContactPhone}
                    label="Onsite phone"
                  >
                    <input
                      onChange={(event) =>
                        setOnsiteContactPhone(event.target.value)
                      }
                      style={{
                        ...inputBaseStyle,
                        ...(visibleFieldErrors.onsiteContactPhone
                          ? { borderColor: "#ef4444" }
                          : {}),
                      }}
                      type="tel"
                      value={onsiteContactPhone}
                    />
                  </FieldShell>

                  <FieldShell fullSpan label="Notes">
                    <textarea
                      onChange={(event) => setNotes(event.target.value)}
                      rows={4}
                      style={textareaStyle}
                      value={notes}
                    />
                  </FieldShell>
                </div>

                <div style={checkboxRowStyle}>
                  <label style={checkboxChipStyle}>
                    <input
                      checked={signoffRequired}
                      onChange={(event) =>
                        setSignoffRequired(event.target.checked)
                      }
                      type="checkbox"
                    />
                    Signoff required
                  </label>
                  <label style={checkboxChipStyle}>
                    <input
                      checked={expenseProofRequired}
                      onChange={(event) =>
                        setExpenseProofRequired(event.target.checked)
                      }
                      type="checkbox"
                    />
                    Expense proof required
                  </label>
                </div>
              </CanvasCard>
            </div>

            <div style={cardStackStyle}>
              <CanvasCard
                theme={th}
                title="Directory context"
                subtitle="這些是 handoff packet 指定的 in-app entry / exit points。"
              >
                <KpiRow minWidth="150px">
                  <KpiCard
                    detail="Directory-backed"
                    label="Passengers"
                    tone={passengers.length > 0 ? "success" : "warning"}
                    value={passengers.length}
                  />
                  <KpiCard
                    detail="Saved pickup/drop-off"
                    label="Addresses"
                    tone={addresses.length > 0 ? "success" : "warning"}
                    value={addresses.length}
                  />
                  <KpiCard
                    detail="Canonical selector"
                    label="Cost centers"
                    tone={costCenters.length > 0 ? "success" : "warning"}
                    value={costCenters.length}
                  />
                </KpiRow>
                <div style={actionRowStyle}>
                  <ActionLink
                    descriptor={pageModel.actions.managePassengers}
                    href={pageModel.links.passengers}
                    label="Passengers"
                  />
                  <ActionLink
                    descriptor={pageModel.actions.manageAddresses}
                    href={pageModel.links.addresses}
                    label="Addresses"
                  />
                  <ActionLink
                    descriptor={pageModel.actions.manageCostCenters}
                    href={pageModel.links.costCenters}
                    label="Cost centers"
                  />
                  <ActionLink
                    descriptor={pageModel.actions.reviewRules}
                    href={pageModel.links.rules}
                    label="Approval rules"
                  />
                </div>
                {passengers.length === 0 ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title="Passenger directory 為空"
                    body="仍可手動輸入乘客，但 `/passengers` 才是 packet 指定的捷徑入口。"
                  />
                ) : null}
                {addresses.length === 0 ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title="Address book 為空"
                    body="仍可手動輸入地址，但 `/addresses` 才是這個 route 的 canonical shortcut source。"
                  />
                ) : null}
              </CanvasCard>

              <CanvasCard
                theme={th}
                title="Policy evaluation"
                subtitle="approval posture 與 quota impact 都直接來自後端 preview。"
              >
                <div style={chipRowStyle}>
                  <StatusChip
                    label={describeDecision(approvalEvaluation)}
                    tone={toneForDecision(approvalEvaluation)}
                  />
                  <StatusChip
                    label={policyRefreshing ? "Refreshing" : "Auto preview"}
                    tone={policyRefreshing ? "warning" : "info"}
                  />
                </div>
                <DetailList
                  items={[
                    {
                      id: "service",
                      label: "Service",
                      value: describeSubtype(businessDispatchSubtype) ?? "—",
                    },
                    {
                      id: "direction",
                      label: "Direction",
                      value: describeDirection(direction),
                    },
                    {
                      id: "passengerRole",
                      label: "Passenger role",
                      value: activePassenger?.roles?.[0] ?? "Not published",
                    },
                    {
                      id: "estimate",
                      label: "Estimated spend",
                      value: formatCurrency(estimatedAmountMinor),
                    },
                  ]}
                />
                {policyError ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title="Policy preview failed"
                    body={policyError}
                  />
                ) : null}
                {approvalEvaluation?.approvalPlan ? (
                  <>
                    <div style={chipRowStyle}>
                      <StatusChip
                        label={`Mode: ${approvalEvaluation.approvalPlan.approvalMode}`}
                        tone="info"
                      />
                      <StatusChip
                        label={`Timeout: ${approvalEvaluation.approvalPlan.timeoutHours}h`}
                        tone="info"
                      />
                      <StatusChip
                        label={`Fallback: ${approvalEvaluation.approvalPlan.fallbackPolicy}`}
                        tone="warning"
                      />
                    </div>
                    <DetailList
                      items={approvalEvaluation.approvalPlan.approvers.map(
                        (approver, index) => ({
                          id: `approver-${index}`,
                          label: `Approver ${index + 1}`,
                          value:
                            approver.displayName ??
                            approver.userId ??
                            approver.roleCode ??
                            approver.costCenterCode ??
                            approver.kind,
                        }),
                      )}
                    />
                  </>
                ) : null}
                {(approvalEvaluation?.warnings?.length ?? 0) > 0 ? (
                  <DetailList
                    items={(approvalEvaluation?.warnings ?? []).map(
                      (warning, index) => ({
                        id: `${warning.source}-${warning.code}-${index}`,
                        label: warning.source,
                        tone: warning.source === "quota" ? "warning" : "info",
                        value: warning.message,
                        hint: warning.code,
                      }),
                    )}
                  />
                ) : null}
              </CanvasCard>

              <CanvasCard
                theme={th}
                title="Quota impact"
                subtitle="沿用後端 preview vocabulary，不用本地預估字典取代。"
              >
                {quotaPreview?.impacts?.length ? (
                  <>
                    <div style={chipRowStyle}>
                      <StatusChip
                        label={`Period: ${quotaPreview.periodKey}`}
                        tone="info"
                      />
                      <StatusChip
                        label={`Trigger: ${quotaPreview.combinedTriggered}`}
                        tone={
                          quotaPreview.combinedTriggered === "block"
                            ? "danger"
                            : quotaPreview.combinedTriggered === "approval" ||
                                quotaPreview.combinedTriggered === "warn"
                              ? "warning"
                              : "success"
                        }
                      />
                    </div>
                    <DetailList
                      items={quotaPreview.impacts.map((impact, index) => ({
                        id: `${impact.scope}-${impact.costCenterCode ?? "tenant"}-${impact.dimension}-${index}`,
                        label: describeImpactLabel(
                          impact.scope,
                          impact.costCenterCode,
                        ),
                        value: `Before ${impact.remainingBefore ?? "n/a"} / ${impact.limitValue ?? "n/a"} · after ${impact.remainingAfter ?? "n/a"}`,
                        hint: `${impact.dimension} · ${formatPercent(
                          impact.remainingPercentAfter,
                        )} remaining · ${impact.triggered}`,
                        tone:
                          impact.triggered === "block"
                            ? "danger"
                            : impact.triggered === "approval" ||
                                impact.triggered === "warn"
                              ? "warning"
                              : "success",
                      }))}
                    />
                  </>
                ) : (
                  <CanvasBanner
                    theme={th}
                    tone="info"
                    icon="spark"
                    title="Preview 等待完整 booking context"
                    body="先選 cost center 並補齊核心欄位，才能計算 quota impact。"
                  />
                )}
              </CanvasCard>

              <CanvasCard
                theme={th}
                title="送出 command"
                subtitle="blocked outcome 在 client 端直接阻擋；approval-required 仍可送出，但 workflow 由後端擁有。"
              >
                {submitReceipt ? (
                  <div style={receiptStyle}>
                    <div style={chipRowStyle}>
                      <StatusChip
                        label={submitReceipt.status}
                        tone={
                          submitReceipt.status === "failed"
                            ? "danger"
                            : submitReceipt.status === "accepted"
                              ? "info"
                              : "success"
                        }
                      />
                      {redirectTarget ? (
                        <StatusChip label="Opening detail..." tone="info" />
                      ) : null}
                    </div>
                    <strong style={{ color: "#0f172a", fontSize: 15 }}>
                      {submitReceipt.message}
                    </strong>
                    <div style={{ color: "#475569", fontSize: 12.5 }}>
                      Resource: {submitReceipt.resourceType} ·{" "}
                      {submitReceipt.resourceId}
                    </div>
                    {submitAuditHref ? (
                      <Link href={submitAuditHref} style={inlineLinkStyle}>
                        View audit trail
                      </Link>
                    ) : null}
                    {resolvedCrossAppLinks.length > 0 ? (
                      <div style={actionRowStyle}>
                        {resolvedCrossAppLinks.map((entry) => (
                          <ActionLink
                            key={`${entry.link.targetApp}-${entry.link.resourceId}`}
                            descriptor={pageModel.actions.viewBookings}
                            href={entry.href}
                            label={entry.link.label}
                            newTab={entry.link.openMode === "new_tab"}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {submitError ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title="Booking create failed"
                    body={submitError}
                  />
                ) : submitAttempted && firstError(visibleFieldErrors) ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title="請先處理高亮欄位"
                    body={firstError(visibleFieldErrors) ?? ""}
                  />
                ) : null}

                <div style={chipRowStyle}>
                  <StatusChip
                    label={describeDecision(approvalEvaluation)}
                    tone={toneForDecision(approvalEvaluation)}
                  />
                  {costCenter ? (
                    <StatusChip label={costCenter} tone="tenant" />
                  ) : null}
                </div>

                <div style={actionRowStyle}>
                  <ActionLink
                    descriptor={pageModel.actions.cancel}
                    href={pageModel.links.bookings}
                    label="Cancel"
                  />
                  <div style={{ flex: 1 }} />
                  <span style={{ color: "#64748b", fontSize: 12.5 }}>
                    No draft action
                  </span>
                  <ActionButton
                    descriptor={pageModel.actions.submit}
                    disabled={submitDisabled}
                    label={
                      submitting || navigationPending
                        ? "Submitting..."
                        : approvalEvaluation?.outcome?.decision ===
                            "require_approval"
                          ? "Submit for approval"
                          : "Create booking"
                    }
                    primary
                    type="submit"
                  />
                </div>
              </CanvasCard>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
