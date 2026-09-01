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

/**
 * Fallback for a status code we have no label for. It must stay human copy:
 * an unmapped code used to be title-cased and rendered verbatim, so drivers
 * saw raw identifiers such as "Some Unknown Code" on the task and trip screens.
 */
const UNMAPPED_STATUS: LocalizedText = {
  en: "Pending confirmation",
  zh: "待確認",
};

export function formatDriverTaskStatusLabel(
  status: DriverTaskStatus | string | null | undefined,
  locale: DriverLocale = "zh",
) {
  if (!status) {
    return UNKNOWN_STATUS[locale];
  }

  return (
    DRIVER_TASK_STATUS_LABELS[status as DriverTaskStatus]?.[locale] ??
    UNMAPPED_STATUS[locale]
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
    UNMAPPED_STATUS[locale]
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

export function readDriverServiceProductCode(value: unknown) {
  if (!value || typeof value !== "object" || !("serviceProductCode" in value)) {
    return null;
  }

  if (typeof value.serviceProductCode !== "string") {
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
    return locale === "zh" ? "服務類型待確認" : "Service Product Pending";
  }

  return SERVICE_PRODUCT_LABELS[code][locale];
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

/**
 * 後端（平台介接層 / 派單服務）回傳的阻擋原因有時候是英文代碼
 * （例如 "token_expired"、"ADAPTER_TIMEOUT"）。這些字串以前被原封不動
 * 推進畫面，使用者就會看到內部代碼。
 *
 * 這張對照表把已知代碼翻成司機看得懂的中文；未知代碼一律改用中文
 * fallback，永遠不會把原始代碼渲染出去。若後端本來就送中文文案，
 * 則原樣保留。
 */
const BLOCKING_REASON_LABELS: Record<string, string> = {
  token_expired: "平台授權已過期，請重新授權",
  token_invalid: "平台授權失效，請重新授權",
  token_revoked: "平台授權已被取消，請重新授權",
  reauth_required: "需要重新授權平台帳號",
  account_suspended: "平台帳號已被停權",
  account_not_linked: "尚未綁定平台帳號",
  not_provisioned: "此裝置尚未完成啟用",
  adapter_timeout: "平台連線逾時",
  adapter_unavailable: "平台暫時無法連線",
  adapter_error: "平台連線異常",
  adapter_degraded: "平台連線不穩定",
  rate_limited: "平台要求過於頻繁，請稍後再試",
  maintenance: "平台維護中",
  offline: "平台目前為離線狀態",
  ineligible: "目前不符合接單資格",
  eligibility_pending: "接單資格審核中",
  document_expired: "證件已到期，請更新後再接單",
  document_missing: "尚未上傳必要證件",
  background_check_pending: "資格審查進行中",
  vehicle_mismatch: "車輛資料與平台登記不符",
  vehicle_unavailable: "車輛目前無法接單",
  shift_required: "請先開始班次",
  location_required: "請先開啟定位權限",
};

const HAN_CHARACTER = /[㐀-䶿一-鿿豈-﫿]/;

/**
 * 把後端阻擋原因轉成中文顯示文案。
 *
 * - 空值 → 中文 fallback
 * - 已知代碼 → 對照表中文
 * - 已經是中文的文案 → 原樣顯示
 * - 其他（未知英文代碼、內部識別名稱）→ 中文 fallback
 */
export function formatDriverBlockingReasonLabel(
  reason: string | null | undefined,
  fallback = "目前無法接單，請稍後再試或聯繫派車台。",
): string {
  const trimmed = reason?.trim() ?? "";
  if (!trimmed) {
    return fallback;
  }

  const normalized = trimmed.toLowerCase().replace(/[\s.-]+/g, "_");
  const mapped = BLOCKING_REASON_LABELS[normalized];
  if (mapped) {
    return mapped;
  }

  return HAN_CHARACTER.test(trimmed) ? trimmed : fallback;
}
