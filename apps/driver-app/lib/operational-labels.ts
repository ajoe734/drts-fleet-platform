import type {
  BusinessDispatchSubtype,
  DispatchSemantics,
  DriverPayoutStatus,
  DriverTaskStatus,
  Phase1ServiceBucket,
} from "@drts/contracts";

export type DriverLocale = "en" | "zh";

type LocalizedText = { en: string; zh: string };

const DRIVER_TASK_STATUS_LABELS: Record<DriverTaskStatus, LocalizedText> = {
  pending_acceptance: { en: "Pending Acceptance", zh: "待接受" },
  accepted: { en: "Accepted", zh: "已接受" },
  enroute_pickup: { en: "En Route to Pickup", zh: "前往接送點" },
  arrived_pickup: { en: "Arrived at Pickup", zh: "已抵達上車點" },
  on_trip: { en: "On Trip", zh: "行程中" },
  proof_pending: { en: "Proof Pending", zh: "待補憑證" },
  completed: { en: "Completed", zh: "已完成" },
  rejected: { en: "Rejected", zh: "已拒絕" },
  cancelled: { en: "Cancelled", zh: "已取消" },
};

const DRIVER_PAYOUT_STATUS_LABELS: Record<DriverPayoutStatus, LocalizedText> = {
  pending: { en: "Pending", zh: "待撥款" },
  paid: { en: "Paid", zh: "已撥款" },
};

const UNKNOWN_STATUS: LocalizedText = { en: "Unknown status", zh: "未知狀態" };

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatDriverTaskStatusLabel(
  status: DriverTaskStatus | string | null | undefined,
  locale: DriverLocale = "zh",
) {
  if (!status) {
    return UNKNOWN_STATUS[locale];
  }

  return (
    DRIVER_TASK_STATUS_LABELS[status as DriverTaskStatus]?.[locale] ??
    humanizeCode(status)
  );
}

export function formatDriverPayoutStatusLabel(
  status: DriverPayoutStatus | string | null | undefined,
  locale: DriverLocale = "zh",
) {
  if (!status) {
    return UNKNOWN_STATUS[locale];
  }

  return (
    DRIVER_PAYOUT_STATUS_LABELS[status as DriverPayoutStatus]?.[locale] ??
    humanizeCode(status)
  );
}

const TASK_TYPE_LABELS: Record<string, LocalizedText> = {
  enterprise_dispatch: { en: "Enterprise Dispatch", zh: "企業派遣" },
  credit_card_airport_transfer: { en: "Airport Transfer", zh: "機場接送" },
  forwarder_broadcast: { en: "Forwarded Order", zh: "來源平台派單" },
  standard_taxi: { en: "Platform Dispatch", zh: "平台派單" },
  business_dispatch: { en: "Enterprise Dispatch", zh: "企業派遣" },
};

export function formatDriverTaskTypeLabel(
  {
    serviceBucket,
    businessDispatchSubtype,
    dispatchSemantics,
  }: {
    serviceBucket: Phase1ServiceBucket | string | null;
    businessDispatchSubtype: BusinessDispatchSubtype | string | null;
    dispatchSemantics: DispatchSemantics | string | null;
  },
  locale: DriverLocale = "zh",
) {
  if (businessDispatchSubtype === "enterprise_dispatch") {
    return TASK_TYPE_LABELS.enterprise_dispatch[locale];
  }

  if (businessDispatchSubtype === "credit_card_airport_transfer") {
    return TASK_TYPE_LABELS.credit_card_airport_transfer[locale];
  }

  if (dispatchSemantics === "forwarder_broadcast") {
    return TASK_TYPE_LABELS.forwarder_broadcast[locale];
  }

  if (serviceBucket === "standard_taxi") {
    return TASK_TYPE_LABELS.standard_taxi[locale];
  }

  if (serviceBucket === "business_dispatch") {
    return TASK_TYPE_LABELS.business_dispatch[locale];
  }

  return TASK_TYPE_LABELS.standard_taxi[locale];
}
