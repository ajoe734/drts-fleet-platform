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
  type TenantBookingValidationMessages,
} from "./tenant-booking-create-form-utils";
import { useTranslation } from "@/lib/i18n";

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

type Translator = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function getBusinessSubtypeOptions(t: Translator): Array<{
  value: BusinessDispatchSubtype;
  label: string;
}> {
  return [
    {
      value: "credit_card_airport_transfer",
      label: t("newBooking.program.creditCard"),
    },
    {
      value: "enterprise_dispatch",
      label: t("newBooking.program.enterprise"),
    },
  ];
}

function getValidationMessages(t: Translator): TenantBookingValidationMessages {
  return {
    reservationWindowStartRequired: t(
      "newBooking.validation.reservationWindowStartRequired",
    ),
    reservationWindowEndRequired: t(
      "newBooking.validation.reservationWindowEndRequired",
    ),
    passengerNameRequired: t("newBooking.validation.passengerNameRequired"),
    passengerPhoneRequired: t("newBooking.validation.passengerPhoneRequired"),
    pickupAddressRequired: t("newBooking.validation.pickupAddressRequired"),
    dropoffAddressRequired: t("newBooking.validation.dropoffAddressRequired"),
    costCenterRequired: t("newBooking.validation.costCenterRequired"),
    reservationWindowInvalid: t(
      "newBooking.validation.reservationWindowInvalid",
    ),
    reservationWindowOrder: t("newBooking.validation.reservationWindowOrder"),
    flightNoRequired: t("newBooking.validation.flightNoRequired"),
    bookedByPairRequired: t("newBooking.validation.bookedByPairRequired"),
    onsiteContactPairRequired: t(
      "newBooking.validation.onsiteContactPairRequired",
    ),
    estimatedAmountInvalid: t("newBooking.validation.estimatedAmountInvalid"),
    luggageCountInvalid: t("newBooking.validation.luggageCountInvalid"),
    pickupLatInvalid: t("newBooking.validation.pickupLatInvalid"),
    pickupLngInvalid: t("newBooking.validation.pickupLngInvalid"),
    dropoffLatInvalid: t("newBooking.validation.dropoffLatInvalid"),
    dropoffLngInvalid: t("newBooking.validation.dropoffLngInvalid"),
  };
}

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

function toIntlLocale(locale: string) {
  return locale === "zh" ? "zh-Hant" : "en-US";
}

function formatCurrency(
  amountMinor: number | null | undefined,
  locale: string,
  t: Translator,
) {
  if (amountMinor == null || Number.isNaN(amountMinor)) {
    return t("newBooking.format.currencyMissing");
  }

  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatPercent(value: number | null | undefined, t: Translator) {
  if (value == null || Number.isNaN(value)) {
    return t("newBooking.format.percentMissing");
  }

  return `${value}%`;
}

function formatDateTime(value: string, locale: string, t: Translator) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return t("newBooking.format.datetimeUnknown");
  }

  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(parsed)
    .replace(/[\u00a0\u202f\u2009]/g, " ");
}

function formatAge(generatedAt: string, nowMs: number, t: Translator) {
  const generatedAtMs = new Date(generatedAt).getTime();
  if (!Number.isFinite(generatedAtMs)) {
    return t("newBooking.format.ageUnknown");
  }

  const deltaSeconds = Math.max(0, Math.floor((nowMs - generatedAtMs) / 1000));
  if (deltaSeconds < 60) {
    return deltaSeconds === 0
      ? t("newBooking.format.justNow")
      : t("newBooking.format.secondsAgo", { count: deltaSeconds });
  }
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return t("newBooking.format.minutesAgo", { count: deltaMinutes });
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  return t("newBooking.format.hoursAgo", { count: deltaHours });
}

function describeSubtype(value: BusinessDispatchSubtype, t: Translator) {
  return getBusinessSubtypeOptions(t).find((option) => option.value === value)
    ?.label;
}

function describeDirection(value: "" | "pickup" | "dropoff", t: Translator) {
  switch (value) {
    case "pickup":
      return t("newBooking.direction.pickup");
    case "dropoff":
      return t("newBooking.direction.dropoff");
    default:
      return t("newBooking.direction.unset");
  }
}

function describeDecision(
  result: TenantApprovalEvaluationResult | null,
  t: Translator,
) {
  const decision = result?.outcome?.decision ?? "allow";
  switch (decision) {
    case "require_approval":
      return t("newBooking.decision.requireApproval");
    case "block":
      return t("newBooking.decision.block");
    case "warn":
      return t("newBooking.decision.warn");
    case "manual_review":
      return t("newBooking.decision.manualReview");
    default:
      return t("newBooking.decision.allow");
  }
}

function describeImpactLabel(
  scope: "tenant" | "cost_center",
  code: string | null,
  t: Translator,
) {
  if (scope === "cost_center") {
    return code
      ? t("newBooking.impact.costCenterCode", { code })
      : t("newBooking.impact.costCenter");
  }
  return t("newBooking.impact.tenant");
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

function labelForRefreshTier(tier: RefreshTier, t: Translator) {
  switch (tier) {
    case "manual":
      return t("newBooking.refreshTier.manual");
    case "urgent":
      return t("newBooking.refreshTier.urgent");
    case "fast":
      return t("newBooking.refreshTier.fast");
    case "dispatch":
      return t("newBooking.refreshTier.dispatch");
    case "medium":
      return t("newBooking.refreshTier.medium");
    case "medium_slow":
      return t("newBooking.refreshTier.mediumSlow");
    case "slow":
      return t("newBooking.refreshTier.slow");
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
      "fleet-partner-portal": process.env.NEXT_PUBLIC_FLEET_PARTNER_PORTAL_URL,
      "bank-console": process.env.NEXT_PUBLIC_BANK_CONSOLE_URL,
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
  disabledTitle,
  href,
  label,
  newTab = false,
}: {
  descriptor: ResourceActionDescriptor;
  disabledTitle?: string;
  href: string;
  label: string;
  newTab?: boolean;
}) {
  if (!descriptor.enabled) {
    return (
      <span
        style={actionSurfaceStyle(descriptor)}
        title={descriptor.disabledReasonCode ?? disabledTitle}
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
  const { t } = useTranslation();
  const copy: Record<
    EmptyStateEnvelope["reason"],
    { title: string; description: string; tone: CSSProperties }
  > = {
    no_data: {
      title: t("newBooking.empty.noData.title"),
      description: t("newBooking.empty.noData.body"),
      tone: {
        borderColor: "rgba(148, 163, 184, 0.28)",
        background: "rgba(15, 23, 42, 0.72)",
      },
    },
    not_provisioned: {
      title: t("newBooking.empty.notProvisioned.title"),
      description: t("newBooking.empty.notProvisioned.body"),
      tone: {
        borderColor: "rgba(34, 211, 238, 0.38)",
        background: "rgba(8, 47, 73, 0.5)",
      },
    },
    fetch_failed: {
      title: t("newBooking.empty.fetchFailed.title"),
      description: t("newBooking.empty.fetchFailed.body"),
      tone: {
        borderColor: "rgba(253, 164, 175, 0.45)",
        background: "rgba(69, 10, 10, 0.48)",
      },
    },
    permission_denied: {
      title: t("newBooking.empty.permissionDenied.title"),
      description: t("newBooking.empty.permissionDenied.body"),
      tone: {
        borderColor: "rgba(253, 224, 71, 0.45)",
        background: "rgba(113, 63, 18, 0.48)",
      },
    },
    external_unavailable: {
      title: t("newBooking.empty.externalUnavailable.title"),
      description: t("newBooking.empty.externalUnavailable.body"),
      tone: {
        borderColor: "rgba(251, 146, 60, 0.45)",
        background: "rgba(67, 20, 7, 0.48)",
      },
    },
    filtered_empty: {
      title: t("newBooking.empty.filteredEmpty.title"),
      description: t("newBooking.empty.filteredEmpty.body"),
      tone: {
        borderColor: "rgba(45, 212, 191, 0.34)",
        background: "rgba(17, 94, 89, 0.34)",
      },
    },
    driver_not_eligible: {
      title: t("newBooking.empty.driverNotEligible.title"),
      description: t("newBooking.empty.driverNotEligible.body"),
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
          {t("newBooking.empty.reason")}
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
          {t("newBooking.empty.messageCode", {
            code: emptyState.messageCode,
          })}
        </span>
      </div>
      <div style={actionRowStyle}>
        {emptyState.nextAction?.action === actions.refresh.action ? (
          <ActionButton
            descriptor={actions.refresh}
            label={t("newBooking.action.refreshNow")}
            onClick={onRefresh}
            primary
          />
        ) : emptyState.nextAction?.action === actions.clearShortcuts.action ? (
          <ActionLink
            descriptor={actions.clearShortcuts}
            disabledTitle={t("newBooking.action.unavailable")}
            href={links.clearShortcuts}
            label={t("newBooking.action.clearShortcuts")}
          />
        ) : emptyState.nextAction?.action ===
          actions.manageCostCenters.action ? (
          <ActionLink
            descriptor={actions.manageCostCenters}
            disabledTitle={t("newBooking.action.unavailable")}
            href={links.costCenters}
            label={t("newBooking.action.openCostCenters")}
          />
        ) : emptyState.nextAction?.action ===
          actions.managePassengers.action ? (
          <ActionLink
            descriptor={actions.managePassengers}
            disabledTitle={t("newBooking.action.unavailable")}
            href={links.passengers}
            label={t("newBooking.action.openPassengers")}
          />
        ) : null}
        <ActionLink
          descriptor={actions.viewBookings}
          disabledTitle={t("newBooking.action.unavailable")}
          href={links.bookings}
          label={t("newBooking.action.backBookings")}
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
  const { locale, t } = useTranslation();
  const [navigationPending, startTransition] = useTransition();
  const [nowMs, setNowMs] = useState(() => {
    const generatedAtMs = new Date(pageModel.refresh.generatedAt).getTime();
    return Number.isFinite(generatedAtMs) ? generatedAtMs : 0;
  });
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
  const businessSubtypeOptions = getBusinessSubtypeOptions(t);
  const validationMessages = getValidationMessages(t);
  const formatErrors = getTenantBookingFieldErrors(draft, {
    messages: validationMessages,
    requireCostCenter: costCenters.length > 0,
  });
  const visibleFieldErrors = getTenantBookingFieldErrors(draft, {
    includeRequired: submitAttempted,
    messages: validationMessages,
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
            result.error ??
              t("newBooking.error.policyPreviewHttp", {
                status: response.status,
              }),
          );
        }

        setQuotaPreview(result.quotaPreview ?? null);
        setApprovalEvaluation(result.approvalEvaluation ?? null);
      } catch (error) {
        setPolicyError(
          error instanceof Error
            ? error.message
            : t("newBooking.error.policyPreviewUnknown"),
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
    t,
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
      messages: validationMessages,
      requireCostCenter: costCenters.length > 0,
    });
    const firstBlockingError = firstError(blockingErrors);
    if (firstBlockingError) {
      setSubmitError(firstBlockingError);
      return;
    }

    if (approvalEvaluation?.outcome?.blocked) {
      setSubmitError(t("newBooking.error.submitBlocked"));
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
          result.error ??
            t("newBooking.error.createHttp", { status: response.status }),
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
        error instanceof Error
          ? error.message
          : t("newBooking.error.createUnknown"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={pageStyle}>
      <CanvasPageHeader
        theme={th}
        title={t("newBooking.header.title")}
        subtitle={t("newBooking.header.subtitle")}
        actions={
          <>
            <ActionLink
              descriptor={pageModel.actions.viewBookings}
              disabledTitle={t("newBooking.action.unavailable")}
              href={pageModel.links.bookings}
              label={t("newBooking.action.backList")}
            />
            <ActionButton
              descriptor={pageModel.actions.refresh}
              label={
                navigationPending
                  ? t("newBooking.action.reloading")
                  : t("newBooking.action.refresh")
              }
              onClick={refreshPage}
            />
          </>
        }
      />

      <div style={pageMetaCardStyle}>
        <div style={pageMetaGridStyle}>
          <div style={metaItemStyle}>
            <span style={labelStyle}>{t("newBooking.meta.command")}</span>
            <strong>{t("newBooking.meta.commandEndpoint")}</strong>
          </div>
          <div style={metaItemStyle}>
            <span style={labelStyle}>{t("newBooking.meta.updateTier")}</span>
            <div style={chipRowStyle}>
              <CanvasPill
                theme={th}
                tone={toneForRefreshTier(pageModel.refreshTier)}
              >
                {labelForRefreshTier(pageModel.refreshTier, t)}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                {formatAge(pageModel.refresh.generatedAt, nowMs, t)}
              </CanvasPill>
            </div>
          </div>
          <div style={metaItemStyle}>
            <span style={labelStyle}>
              {t("newBooking.meta.directoryCoverage")}
            </span>
            <div style={chipRowStyle}>
              <CanvasPill
                theme={th}
                tone={passengers.length > 0 ? "success" : "warn"}
              >
                {t("newBooking.meta.passengers", {
                  count: passengers.length,
                })}
              </CanvasPill>
              <CanvasPill
                theme={th}
                tone={addresses.length > 0 ? "success" : "warn"}
              >
                {t("newBooking.meta.addresses", { count: addresses.length })}
              </CanvasPill>
              <CanvasPill
                theme={th}
                tone={costCenters.length > 0 ? "success" : "warn"}
              >
                {t("newBooking.meta.costCenters", {
                  count: costCenters.length,
                })}
              </CanvasPill>
            </div>
          </div>
          <div style={metaItemStyle}>
            <span style={labelStyle}>
              {t("newBooking.meta.requiredActions")}
            </span>
            <div style={chipRowStyle}>
              <CanvasPill
                theme={th}
                tone={pageModel.actions.submit.enabled ? "info" : "neutral"}
              >
                {t("newBooking.action.submitCommand")}
              </CanvasPill>
              <CanvasPill
                theme={th}
                tone={pageModel.actions.cancel.enabled ? "neutral" : "warn"}
              >
                {t("newBooking.action.cancel")}
              </CanvasPill>
              <CanvasPill theme={th} tone="neutral">
                {t("newBooking.meta.noDraft")}
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
            title={t("newBooking.prefill.appliedTitle")}
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
          title={t("newBooking.health.degradedTitle")}
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
            body={t("newBooking.freshness.body", {
              age: formatAge(pageModel.refresh.generatedAt, nowMs, t),
              timestamp: formatDateTime(
                pageModel.refresh.generatedAt,
                locale,
                t,
              ),
              tier: labelForRefreshTier(pageModel.refreshTier, t),
            })}
            title={
              pageFreshness === "degraded"
                ? t("newBooking.freshness.degradedTitle")
                : t("newBooking.freshness.staleTitle")
            }
            tone={pageFreshness === "degraded" ? "warn" : "info"}
          />
          <div style={actionRowStyle}>
            <ActionButton
              descriptor={pageModel.actions.refresh}
              label={t("newBooking.action.refreshNow")}
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
            title={t("newBooking.info.estimateTitle")}
            body={t("newBooking.info.estimateBody")}
          />

          <div style={twoColumnLayoutStyle}>
            <div style={cardStackStyle}>
              <CanvasCard
                theme={th}
                title={t("newBooking.card.trip.title")}
                subtitle={t("newBooking.card.trip.subtitle")}
              >
                <div style={fieldGridStyle}>
                  <FieldShell label={t("newBooking.field.serviceSubtype")}>
                    <select
                      onChange={(event) =>
                        setBusinessDispatchSubtype(
                          event.target.value as BusinessDispatchSubtype,
                        )
                      }
                      style={inputBaseStyle}
                      value={businessDispatchSubtype}
                    >
                      {businessSubtypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FieldShell>

                  <FieldShell label={t("newBooking.field.timingMode")}>
                    <select
                      onChange={(event) =>
                        applyTimingMode(
                          event.target.value as "scheduled" | "immediate",
                        )
                      }
                      style={inputBaseStyle}
                      value={timingMode}
                    >
                      <option value="scheduled">
                        {t("newBooking.option.scheduled")}
                      </option>
                      <option value="immediate">
                        {t("newBooking.option.immediate")}
                      </option>
                    </select>
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.reservationWindowStart}
                    label={t("newBooking.field.reservationStart")}
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
                    label={t("newBooking.field.reservationEnd")}
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
                    hint={t("newBooking.hint.passengerSelect")}
                    label={t("newBooking.field.passenger")}
                  >
                    <select
                      onChange={(event) =>
                        setSelectedPassengerId(event.target.value)
                      }
                      style={inputBaseStyle}
                      value={selectedPassengerId}
                    >
                      <option value="">
                        {t("newBooking.option.manualPassenger")}
                      </option>
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
                    label={t("newBooking.field.passengerName")}
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
                          ? t("newBooking.hint.phoneFromDirectory")
                          : t("newBooking.hint.phoneMissing")
                        : t("newBooking.hint.phoneManual")
                    }
                    label={t("newBooking.field.passengerPhone")}
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
                title={t("newBooking.card.pickupDropoff.title")}
                subtitle={t("newBooking.card.pickupDropoff.subtitle")}
              >
                <div style={fieldGridStyle}>
                  <FieldShell label={t("newBooking.field.savedPickup")}>
                    <select
                      onChange={(event) =>
                        setPickupAddressId(event.target.value)
                      }
                      style={inputBaseStyle}
                      value={pickupAddressId}
                    >
                      <option value="">
                        {t("newBooking.option.manualPickup")}
                      </option>
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

                  <FieldShell label={t("newBooking.field.savedDropoff")}>
                    <select
                      onChange={(event) =>
                        setDropoffAddressId(event.target.value)
                      }
                      style={inputBaseStyle}
                      value={dropoffAddressId}
                    >
                      <option value="">
                        {t("newBooking.option.manualDropoff")}
                      </option>
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
                    label={t("newBooking.field.pickupAddress")}
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
                    label={t("newBooking.field.dropoffAddress")}
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
                    label={t("newBooking.field.pickupLat")}
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
                    label={t("newBooking.field.pickupLng")}
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
                    label={t("newBooking.field.dropoffLat")}
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
                    label={t("newBooking.field.dropoffLng")}
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
                title={t("newBooking.card.approval.title")}
                subtitle={t("newBooking.card.approval.subtitle")}
              >
                <CanvasBanner
                  theme={th}
                  tone="info"
                  icon="spark"
                  title={t("newBooking.programSection.title")}
                  body={
                    businessDispatchSubtype === "credit_card_airport_transfer"
                      ? t("newBooking.programHint.creditCard")
                      : t("newBooking.programHint.enterprise")
                  }
                />
                <div style={fieldGridStyle}>
                  <FieldShell
                    error={visibleFieldErrors.costCenter}
                    label={t("newBooking.programField.costCenter")}
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
                      <option value="">
                        {t("newBooking.option.selectCostCenter")}
                      </option>
                      {costCenters.map((center) => (
                        <option key={center.code} value={center.code}>
                          {center.code} · {center.name}
                        </option>
                      ))}
                    </select>
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.estimatedAmount}
                    label={t("newBooking.field.estimatedSpend", {
                      currency: CURRENCY,
                    })}
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

                  <FieldShell
                    label={t("newBooking.programField.benefitReference")}
                  >
                    <input
                      onChange={(event) =>
                        setBenefitReference(event.target.value)
                      }
                      style={inputBaseStyle}
                      type="text"
                      value={benefitReference}
                    />
                  </FieldShell>

                  <FieldShell
                    label={t("newBooking.programField.vehiclePreference")}
                  >
                    <input
                      onChange={(event) =>
                        setVehiclePreference(event.target.value)
                      }
                      style={inputBaseStyle}
                      type="text"
                      value={vehiclePreference}
                    />
                  </FieldShell>

                  <FieldShell label={t("newBooking.programField.direction")}>
                    <select
                      onChange={(event) =>
                        setDirection(
                          event.target.value as "" | "pickup" | "dropoff",
                        )
                      }
                      style={inputBaseStyle}
                      value={direction}
                    >
                      <option value="">{t("newBooking.option.notSet")}</option>
                      <option value="pickup">
                        {t("newBooking.option.pickup")}
                      </option>
                      <option value="dropoff">
                        {t("newBooking.option.dropoff")}
                      </option>
                    </select>
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.flightNo}
                    label={t("newBooking.programField.flightNo")}
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

                  <FieldShell label={t("newBooking.programField.terminal")}>
                    <input
                      onChange={(event) => setTerminal(event.target.value)}
                      style={inputBaseStyle}
                      type="text"
                      value={terminal}
                    />
                  </FieldShell>

                  <FieldShell
                    error={visibleFieldErrors.luggageCount}
                    label={t("newBooking.programField.luggageCount")}
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
                    label={t("newBooking.programField.bookedByName")}
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
                    label={t("newBooking.programField.bookedByEmail")}
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
                    label={t("newBooking.programField.onsiteContact")}
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
                    label={t("newBooking.programField.onsitePhone")}
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

                  <FieldShell fullSpan label={t("newBooking.field.notes")}>
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
                    {t("newBooking.check.signoffRequired")}
                  </label>
                  <label style={checkboxChipStyle}>
                    <input
                      checked={expenseProofRequired}
                      onChange={(event) =>
                        setExpenseProofRequired(event.target.checked)
                      }
                      type="checkbox"
                    />
                    {t("newBooking.check.expenseProofRequired")}
                  </label>
                </div>
              </CanvasCard>
            </div>

            <div style={cardStackStyle}>
              <CanvasCard
                theme={th}
                title={t("newBooking.card.directory.title")}
                subtitle={t("newBooking.card.directory.subtitle")}
              >
                <KpiRow minWidth="150px">
                  <KpiCard
                    detail={t("newBooking.kpi.directoryBacked")}
                    label={t("newBooking.field.passenger")}
                    tone={passengers.length > 0 ? "success" : "warning"}
                    value={passengers.length}
                  />
                  <KpiCard
                    detail={t("newBooking.kpi.savedPickupDropoff")}
                    label={t("nav.addresses")}
                    tone={addresses.length > 0 ? "success" : "warning"}
                    value={addresses.length}
                  />
                  <KpiCard
                    detail={t("newBooking.kpi.canonicalSelector")}
                    label={t("newBooking.programField.costCenter")}
                    tone={costCenters.length > 0 ? "success" : "warning"}
                    value={costCenters.length}
                  />
                </KpiRow>
                <div style={actionRowStyle}>
                  <ActionLink
                    descriptor={pageModel.actions.managePassengers}
                    disabledTitle={t("newBooking.action.unavailable")}
                    href={pageModel.links.passengers}
                    label={t("newBooking.field.passenger")}
                  />
                  <ActionLink
                    descriptor={pageModel.actions.manageAddresses}
                    disabledTitle={t("newBooking.action.unavailable")}
                    href={pageModel.links.addresses}
                    label={t("nav.addresses")}
                  />
                  <ActionLink
                    descriptor={pageModel.actions.manageCostCenters}
                    disabledTitle={t("newBooking.action.unavailable")}
                    href={pageModel.links.costCenters}
                    label={t("newBooking.programField.costCenter")}
                  />
                  <ActionLink
                    descriptor={pageModel.actions.reviewRules}
                    disabledTitle={t("newBooking.action.unavailable")}
                    href={pageModel.links.rules}
                    label={t("nav.rules")}
                  />
                </div>
                {passengers.length === 0 ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title={t("newBooking.banner.passengerEmptyTitle")}
                    body={t("newBooking.banner.passengerEmptyBody")}
                  />
                ) : null}
                {addresses.length === 0 ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title={t("newBooking.banner.addressEmptyTitle")}
                    body={t("newBooking.banner.addressEmptyBody")}
                  />
                ) : null}
              </CanvasCard>

              <CanvasCard
                theme={th}
                title={t("newBooking.card.policy.title")}
                subtitle={t("newBooking.card.policy.subtitle")}
              >
                <div style={chipRowStyle}>
                  <StatusChip
                    label={describeDecision(approvalEvaluation, t)}
                    tone={toneForDecision(approvalEvaluation)}
                  />
                  <StatusChip
                    label={
                      policyRefreshing
                        ? t("newBooking.policy.refreshing")
                        : t("newBooking.policy.autoPreview")
                    }
                    tone={policyRefreshing ? "warning" : "info"}
                  />
                </div>
                <DetailList
                  items={[
                    {
                      id: "service",
                      label: t("newBooking.policy.service"),
                      value: describeSubtype(businessDispatchSubtype, t) ?? "—",
                    },
                    {
                      id: "direction",
                      label: t("newBooking.policy.direction"),
                      value: describeDirection(direction, t),
                    },
                    {
                      id: "passengerRole",
                      label: t("newBooking.policy.passengerRole"),
                      value:
                        activePassenger?.roles?.[0] ??
                        t("newBooking.policy.notPublished"),
                    },
                    {
                      id: "estimate",
                      label: t("newBooking.policy.estimatedSpend"),
                      value: formatCurrency(estimatedAmountMinor, locale, t),
                    },
                  ]}
                />
                {policyError ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title={t("newBooking.policy.failedTitle")}
                    body={policyError}
                  />
                ) : null}
                {approvalEvaluation?.approvalPlan ? (
                  <>
                    <div style={chipRowStyle}>
                      <StatusChip
                        label={t("newBooking.policy.mode", {
                          value: approvalEvaluation.approvalPlan.approvalMode,
                        })}
                        tone="info"
                      />
                      <StatusChip
                        label={t("newBooking.policy.timeout", {
                          value: approvalEvaluation.approvalPlan.timeoutHours,
                        })}
                        tone="info"
                      />
                      <StatusChip
                        label={t("newBooking.policy.fallback", {
                          value: approvalEvaluation.approvalPlan.fallbackPolicy,
                        })}
                        tone="warning"
                      />
                    </div>
                    <DetailList
                      items={approvalEvaluation.approvalPlan.approvers.map(
                        (approver, index) => ({
                          id: `approver-${index}`,
                          label: t("newBooking.policy.approver", {
                            index: index + 1,
                          }),
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
                title={t("newBooking.card.quota.title")}
                subtitle={t("newBooking.card.quota.subtitle")}
              >
                {quotaPreview?.impacts?.length ? (
                  <>
                    <div style={chipRowStyle}>
                      <StatusChip
                        label={t("newBooking.quota.period", {
                          value: quotaPreview.periodKey,
                        })}
                        tone="info"
                      />
                      <StatusChip
                        label={t("newBooking.quota.trigger", {
                          value: quotaPreview.combinedTriggered,
                        })}
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
                          t,
                        ),
                        value: t("newBooking.quota.value", {
                          before: impact.remainingBefore ?? "n/a",
                          limit: impact.limitValue ?? "n/a",
                          after: impact.remainingAfter ?? "n/a",
                        }),
                        hint: t("newBooking.quota.hint", {
                          dimension: impact.dimension,
                          percent: formatPercent(
                            impact.remainingPercentAfter,
                            t,
                          ),
                          triggered: impact.triggered,
                        }),
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
                    title={t("newBooking.quota.waitingTitle")}
                    body={t("newBooking.quota.waitingBody")}
                  />
                )}
              </CanvasCard>

              <CanvasCard
                theme={th}
                title={t("newBooking.card.submit.title")}
                subtitle={t("newBooking.card.submit.subtitle")}
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
                        <StatusChip
                          label={t("newBooking.submit.openingDetail")}
                          tone="info"
                        />
                      ) : null}
                    </div>
                    <strong style={{ color: "#0f172a", fontSize: 15 }}>
                      {submitReceipt.message}
                    </strong>
                    <div style={{ color: "#475569", fontSize: 12.5 }}>
                      {t("newBooking.submit.resource", {
                        type: submitReceipt.resourceType,
                        id: submitReceipt.resourceId,
                      })}
                    </div>
                    {submitAuditHref ? (
                      <Link href={submitAuditHref} style={inlineLinkStyle}>
                        {t("newBooking.submit.viewAudit")}
                      </Link>
                    ) : null}
                    {resolvedCrossAppLinks.length > 0 ? (
                      <div style={actionRowStyle}>
                        {resolvedCrossAppLinks.map((entry) => (
                          <ActionLink
                            key={`${entry.link.targetApp}-${entry.link.resourceId}`}
                            descriptor={pageModel.actions.viewBookings}
                            disabledTitle={t("newBooking.action.unavailable")}
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
                    title={t("newBooking.submit.failedTitle")}
                    body={submitError}
                  />
                ) : submitAttempted && firstError(visibleFieldErrors) ? (
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    icon="warn"
                    title={t("newBooking.submit.fixHighlightedTitle")}
                    body={firstError(visibleFieldErrors) ?? ""}
                  />
                ) : null}

                <div style={chipRowStyle}>
                  <StatusChip
                    label={describeDecision(approvalEvaluation, t)}
                    tone={toneForDecision(approvalEvaluation)}
                  />
                  {costCenter ? (
                    <StatusChip label={costCenter} tone="tenant" />
                  ) : null}
                </div>

                <div style={actionRowStyle}>
                  <ActionLink
                    descriptor={pageModel.actions.cancel}
                    disabledTitle={t("newBooking.action.unavailable")}
                    href={pageModel.links.bookings}
                    label={t("newBooking.action.cancel")}
                  />
                  <div style={{ flex: 1 }} />
                  <span style={{ color: "#64748b", fontSize: 12.5 }}>
                    {t("newBooking.action.noDraft")}
                  </span>
                  <ActionButton
                    descriptor={pageModel.actions.submit}
                    disabled={submitDisabled}
                    label={
                      submitting || navigationPending
                        ? t("newBooking.submit.submitting")
                        : approvalEvaluation?.outcome?.decision ===
                            "require_approval"
                          ? t("newBooking.submit.forApproval")
                          : t("newBooking.submit.create")
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
