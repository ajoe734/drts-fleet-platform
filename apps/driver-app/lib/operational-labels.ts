import type {
  BusinessDispatchSubtype,
  DispatchSemantics,
  DriverPayoutStatus,
  DriverTaskStatus,
  Phase1ServiceBucket,
} from "@drts/contracts";

const DRIVER_TASK_STATUS_LABELS: Record<DriverTaskStatus, string> = {
  pending_acceptance: "待接受",
  accepted: "已接受",
  enroute_pickup: "前往接送點",
  arrived_pickup: "已抵達上車點",
  on_trip: "行程中",
  proof_pending: "待補憑證",
  completed: "已完成",
  rejected: "已拒絕",
  cancelled: "已取消",
};

const DRIVER_PAYOUT_STATUS_LABELS: Record<DriverPayoutStatus, string> = {
  pending: "待撥款",
  paid: "已撥款",
};

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatDriverTaskStatusLabel(
  status: DriverTaskStatus | string | null | undefined,
) {
  if (!status) {
    return "未知狀態";
  }

  return (
    DRIVER_TASK_STATUS_LABELS[status as DriverTaskStatus] ??
    humanizeCode(status)
  );
}

export function formatDriverPayoutStatusLabel(
  status: DriverPayoutStatus | string | null | undefined,
) {
  if (!status) {
    return "未知狀態";
  }

  return (
    DRIVER_PAYOUT_STATUS_LABELS[status as DriverPayoutStatus] ??
    humanizeCode(status)
  );
}

export function formatDriverTaskTypeLabel({
  serviceBucket,
  businessDispatchSubtype,
  dispatchSemantics,
}: {
  serviceBucket: Phase1ServiceBucket | string | null;
  businessDispatchSubtype: BusinessDispatchSubtype | string | null;
  dispatchSemantics: DispatchSemantics | string | null;
}) {
  if (businessDispatchSubtype === "enterprise_dispatch") {
    return "企業派遣";
  }

  if (businessDispatchSubtype === "credit_card_airport_transfer") {
    return "機場接送";
  }

  if (dispatchSemantics === "forwarder_broadcast") {
    return "來源平台派單";
  }

  if (serviceBucket === "standard_taxi") {
    return "平台派單";
  }

  if (serviceBucket === "business_dispatch") {
    return "企業派遣";
  }

  return "平台派單";
}
