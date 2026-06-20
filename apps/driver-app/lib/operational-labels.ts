import type {
  BusinessDispatchSubtype,
  DispatchSemantics,
  DriverPayoutStatus,
  DriverTaskStatus,
  Phase1ServiceBucket,
  ServiceProductType,
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

const SERVICE_PRODUCT_LABELS: Record<ServiceProductType, LocalizedText> = {
  taxi_realtime: { en: "Taxi Realtime", zh: "計程車即時叫車" },
  taxi_reservation: { en: "Taxi Reservation", zh: "計程車預約" },
  enterprise_dispatch: { en: "Enterprise Dispatch", zh: "企業派遣" },
  credit_card_airport_transfer: {
    en: "Airport Transfer",
    zh: "機場接送",
  },
  insurance_replacement_vehicle: {
    en: "Insurance Replacement Vehicle",
    zh: "保險代步",
  },
  travel_agency_transfer: {
    en: "Travel Agency Transfer",
    zh: "旅行社接送",
  },
  third_party_forwarded_order: {
    en: "Third-party Forwarded Order",
    zh: "第三方平台轉派單",
  },
};

type ServiceProductContext = {
  serviceProductCode?: ServiceProductType | string | null;
  serviceBucket: Phase1ServiceBucket | string | null;
  businessDispatchSubtype: BusinessDispatchSubtype | string | null;
  dispatchSemantics: DispatchSemantics | string | null;
};

export function readDriverServiceProductCode(
  value: { serviceProductCode?: unknown } | null | undefined,
) {
  if (typeof value?.serviceProductCode !== "string") {
    return null;
  }

  return value.serviceProductCode.trim() ? value.serviceProductCode : null;
}

export function resolveDriverServiceProductCode({
  serviceProductCode,
  serviceBucket,
  businessDispatchSubtype,
  dispatchSemantics,
}: ServiceProductContext): ServiceProductType | null {
  if (
    serviceProductCode &&
    serviceProductCode in SERVICE_PRODUCT_LABELS
  ) {
    return serviceProductCode as ServiceProductType;
  }

  if (dispatchSemantics === "forwarder_broadcast") {
    return "third_party_forwarded_order";
  }

  if (
    businessDispatchSubtype &&
    businessDispatchSubtype in SERVICE_PRODUCT_LABELS
  ) {
    return businessDispatchSubtype as ServiceProductType;
  }

  if (serviceBucket === "standard_taxi") {
    return dispatchSemantics === "reservation"
      ? "taxi_reservation"
      : "taxi_realtime";
  }

  return null;
}

export function formatDriverServiceProductLabel(
  context: ServiceProductContext,
  locale: DriverLocale = "zh",
) {
  const code = resolveDriverServiceProductCode(context);
  if (!code) {
    return locale === "zh" ? "產品待同步" : "Service Product Pending";
  }

  return `${SERVICE_PRODUCT_LABELS[code][locale]} · ${code}`;
}

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
