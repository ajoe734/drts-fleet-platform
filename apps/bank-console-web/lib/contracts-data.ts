import type {
  IssuerContractExceptionRecord,
  IssuerContractPeriodAttainment,
  IssuerContractSlaMetric,
  IssuerContractStatusRecord,
} from "@drts/contracts";

export type ContractHealth = "healthy" | "at_risk" | "breached";

type ContractRecord = IssuerContractStatusRecord & {
  health: ContractHealth;
  attainmentSummary: string;
  bookingIds: string[];
};

const contractRecords: ContractRecord[] = [
  {
    contractId: "ctr_ctbc_world_elite_2026",
    tenantId: "tenant-ctbc-001",
    programId: "prog-ctbc-world-elite",
    programCode: "CTBC_WORLD_ELITE",
    displayName: "中信鼎極卡機場接送",
    term: {
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.000Z",
      billingCycle: "monthly",
      serviceProduct: "credit_card_airport_transfer",
      issuerTenantId: "tenant-ctbc-001",
    },
    slaTargets: [
      {
        metric: "pickup_punctuality",
        thresholdPercent: 96,
        comparator: "gte",
        window: "current_period",
      },
      {
        metric: "completion_rate",
        thresholdPercent: 98,
        comparator: "gte",
        window: "current_period",
      },
    ],
    periodAttainment: {
      period: "2026-06",
      evaluatedAt: "2026-06-11T08:45:00.000Z",
      completedTrips: 128,
      totalTrips: 129,
      pickupPunctualityPercent: 97.4,
      completionRatePercent: 99.2,
      breachedTargets: [],
    },
    exceptions: [
      {
        exceptionId: "exc-ctr-001",
        orderId: "BK-240611-0081",
        occurredAt: "2026-06-08T02:10:00.000Z",
        reasonCode: "pickup_delay",
        summary: "松山機場接客延誤 11 分鐘，仍於 SLA 緩衝內結案。",
        status: "resolved",
        benefitReferenceMasked: "BEN-****-4821",
        issuerAuthorizationRefMasked: "AUTH-****-1288",
      },
    ],
    status: "active",
    health: "healthy",
    attainmentSummary: "準點率與完成率皆高於目標，僅 1 筆已解決例外。",
    bookingIds: ["BK-240611-0081"],
  },
  {
    contractId: "ctr_ctbc_infinite_2026",
    tenantId: "tenant-ctbc-001",
    programId: "prog-ctbc-infinite",
    programCode: "CTBC_INFINITE",
    displayName: "中信無限卡機場接送",
    term: {
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.000Z",
      billingCycle: "monthly",
      serviceProduct: "credit_card_airport_transfer",
      issuerTenantId: "tenant-ctbc-001",
    },
    slaTargets: [
      {
        metric: "pickup_punctuality",
        thresholdPercent: 97,
        comparator: "gte",
        window: "current_period",
      },
      {
        metric: "completion_rate",
        thresholdPercent: 98,
        comparator: "gte",
        window: "current_period",
      },
    ],
    periodAttainment: {
      period: "2026-06",
      evaluatedAt: "2026-06-11T08:45:00.000Z",
      completedTrips: 84,
      totalTrips: 87,
      pickupPunctualityPercent: 95.8,
      completionRatePercent: 96.6,
      breachedTargets: ["pickup_punctuality", "completion_rate"],
    },
    exceptions: [
      {
        exceptionId: "exc-ctr-002",
        orderId: "BK-240611-0104",
        occurredAt: "2026-06-09T13:25:00.000Z",
        reasonCode: "driver_late_arrival",
        summary: "桃園 T2 指派車輛晚到 17 分鐘，卡友已完乘。",
        status: "open",
        benefitReferenceMasked: "BEN-****-6214",
        issuerAuthorizationRefMasked: "AUTH-****-4420",
      },
      {
        exceptionId: "exc-ctr-003",
        orderId: "BK-240611-0112",
        occurredAt: "2026-06-10T04:05:00.000Z",
        reasonCode: "dispatch_reassignment",
        summary: "回程派遣改派兩次，導致接送等待超時。",
        status: "open",
        benefitReferenceMasked: "BEN-****-3509",
        issuerAuthorizationRefMasked: "AUTH-****-2197",
      },
    ],
    status: "at_risk",
    health: "at_risk",
    attainmentSummary: "兩項指標均低於目標 1-2%，需追蹤連續 48 小時。",
    bookingIds: ["BK-240611-0104", "BK-240611-0112"],
  },
  {
    contractId: "ctr_ctbc_legacy_prestige_2026",
    tenantId: "tenant-ctbc-001",
    programId: "prog-ctbc-legacy-prestige",
    programCode: "CTBC_PRESTIGE",
    displayName: "中信尊榮卡機場接送",
    term: {
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-09-30T23:59:59.000Z",
      billingCycle: "monthly",
      serviceProduct: "credit_card_airport_transfer",
      issuerTenantId: "tenant-ctbc-001",
    },
    slaTargets: [
      {
        metric: "pickup_punctuality",
        thresholdPercent: 96,
        comparator: "gte",
        window: "current_period",
      },
      {
        metric: "completion_rate",
        thresholdPercent: 97,
        comparator: "gte",
        window: "current_period",
      },
    ],
    periodAttainment: {
      period: "2026-06",
      evaluatedAt: "2026-06-11T08:45:00.000Z",
      completedTrips: 46,
      totalTrips: 52,
      pickupPunctualityPercent: 91.3,
      completionRatePercent: 88.5,
      breachedTargets: ["pickup_punctuality", "completion_rate"],
    },
    exceptions: [
      {
        exceptionId: "exc-ctr-004",
        orderId: "BK-240611-0127",
        occurredAt: "2026-06-07T23:30:00.000Z",
        reasonCode: "no_show_driver",
        summary: "松山接送司機未到場，改派失敗後由客服補單。",
        status: "open",
        benefitReferenceMasked: "BEN-****-7712",
        issuerAuthorizationRefMasked: "AUTH-****-9021",
      },
      {
        exceptionId: "exc-ctr-005",
        orderId: "BK-240611-0139",
        occurredAt: "2026-06-10T15:55:00.000Z",
        reasonCode: "trip_cancelled_after_assignment",
        summary: "派遣後取消且未及時補派，列入爭議趟次。",
        status: "open",
        benefitReferenceMasked: "BEN-****-1148",
        issuerAuthorizationRefMasked: "AUTH-****-5506",
      },
    ],
    status: "breached",
    health: "breached",
    attainmentSummary: "兩項 SLA 均明顯失守，需依合約啟動 breach 處置。",
    bookingIds: ["BK-240611-0127", "BK-240611-0139"],
  },
];

export function listContractRecords() {
  return contractRecords;
}

export function getContractRecord(contractId: string) {
  return (
    contractRecords.find((record) => record.contractId === contractId) ?? null
  );
}

export function metricValue(
  attainment: IssuerContractPeriodAttainment,
  metric: IssuerContractSlaMetric,
) {
  return metric === "pickup_punctuality"
    ? attainment.pickupPunctualityPercent
    : attainment.completionRatePercent;
}

export function metricTarget(
  record: IssuerContractStatusRecord,
  metric: IssuerContractSlaMetric,
) {
  return (
    record.slaTargets.find((target) => target.metric === metric)
      ?.thresholdPercent ?? null
  );
}

export function metricDelta(
  record: IssuerContractStatusRecord,
  metric: IssuerContractSlaMetric,
) {
  const target = metricTarget(record, metric);
  const current = metricValue(record.periodAttainment, metric);

  if (target === null || current === null) {
    return null;
  }

  return Number((current - target).toFixed(1));
}

export function countOpenExceptions(
  exceptions: IssuerContractExceptionRecord[],
) {
  return exceptions.filter((exception) => exception.status === "open").length;
}

export function formatPeriod(period: string) {
  const [year, month] = period.split("-");
  return `${year} 年 ${month} 月`;
}

export function formatPercent(value: number | null) {
  if (value === null) {
    return "N/A";
  }

  return `${value.toFixed(1)}%`;
}

export function formatSignedPercent(value: number | null) {
  if (value === null) {
    return "N/A";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const zhDateTime = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatDateTime(value: string) {
  return zhDateTime.format(new Date(value));
}
