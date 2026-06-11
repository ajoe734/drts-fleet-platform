import type {
  IssuerContractExceptionRecord,
  IssuerContractPeriodAttainment,
  IssuerContractSlaMetric,
  IssuerContractStatusRecord,
} from "@drts/contracts";

export type ContractHealth = "healthy" | "at_risk" | "breached";

export type ContractBookingDetail = {
  bookingId: string;
  contractId: string;
  cardholderRefMasked: string;
  cardMasked: string;
  benefitReferenceMasked: string;
  issuerAuthorizationRefMasked: string;
  programLabel: string;
  flightNumber: string;
  terminal: string;
  directionLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  scheduledAt: string;
  dispatchStateLabel: string;
  timeline: Array<{
    label: string;
    at: string;
    detail: string;
  }>;
};

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

const bookingDetails: Record<string, ContractBookingDetail> = {
  "BK-240611-0081": {
    bookingId: "BK-240611-0081",
    contractId: "ctr_ctbc_world_elite_2026",
    cardholderRefMasked: "CH-****-1842",
    cardMasked: "**** 4821",
    benefitReferenceMasked: "BEN-****-4821",
    issuerAuthorizationRefMasked: "AUTH-****-1288",
    programLabel: "中信鼎極卡機場接送",
    flightNumber: "JX 802",
    terminal: "T1",
    directionLabel: "去程",
    pickupLabel: "台北信義區",
    dropoffLabel: "松山機場",
    scheduledAt: "2026-06-08T01:20:00.000Z",
    dispatchStateLabel: "已完成",
    timeline: [
      {
        label: "建立訂單",
        at: "2026-06-07T15:08:00.000Z",
        detail: "卡友入口完成預約，benefit 與 issuer auth 均已遮罩回寫。",
      },
      {
        label: "派車完成",
        at: "2026-06-07T15:22:00.000Z",
        detail: "DRTS ops 指派機場接送車隊。",
      },
      {
        label: "接客稍晚",
        at: "2026-06-08T02:10:00.000Z",
        detail: "因道路壅塞晚到 11 分鐘，例外已結案。",
      },
      {
        label: "完乘結案",
        at: "2026-06-08T03:35:00.000Z",
        detail: "已依合約結算。",
      },
    ],
  },
  "BK-240611-0104": {
    bookingId: "BK-240611-0104",
    contractId: "ctr_ctbc_infinite_2026",
    cardholderRefMasked: "CH-****-6214",
    cardMasked: "**** 6214",
    benefitReferenceMasked: "BEN-****-6214",
    issuerAuthorizationRefMasked: "AUTH-****-4420",
    programLabel: "中信無限卡機場接送",
    flightNumber: "CI 101",
    terminal: "T2",
    directionLabel: "去程",
    pickupLabel: "新北新店區",
    dropoffLabel: "桃園機場 T2",
    scheduledAt: "2026-06-09T12:35:00.000Z",
    dispatchStateLabel: "已完成",
    timeline: [
      {
        label: "建立訂單",
        at: "2026-06-08T09:16:00.000Z",
        detail: "卡友訂單建立並鎖定本期 quota。",
      },
      {
        label: "派車完成",
        at: "2026-06-08T09:29:00.000Z",
        detail: "DRTS ops 派遣完成。",
      },
      {
        label: "司機晚到",
        at: "2026-06-09T13:25:00.000Z",
        detail: "車輛於約定時間後 17 分鐘抵達，例外待結案。",
      },
      {
        label: "完乘待覆核",
        at: "2026-06-09T14:58:00.000Z",
        detail: "SLA 例外仍開啟中。",
      },
    ],
  },
  "BK-240611-0112": {
    bookingId: "BK-240611-0112",
    contractId: "ctr_ctbc_infinite_2026",
    cardholderRefMasked: "CH-****-3509",
    cardMasked: "**** 3509",
    benefitReferenceMasked: "BEN-****-3509",
    issuerAuthorizationRefMasked: "AUTH-****-2197",
    programLabel: "中信無限卡機場接送",
    flightNumber: "BR 712",
    terminal: "T2",
    directionLabel: "回程",
    pickupLabel: "桃園機場 T2",
    dropoffLabel: "台北大直",
    scheduledAt: "2026-06-10T02:40:00.000Z",
    dispatchStateLabel: "已完成",
    timeline: [
      {
        label: "建立訂單",
        at: "2026-06-09T10:15:00.000Z",
        detail: "卡友完成回程預約。",
      },
      {
        label: "連續改派",
        at: "2026-06-10T04:05:00.000Z",
        detail: "兩次改派造成等待超時，列入合約例外。",
      },
      {
        label: "完乘",
        at: "2026-06-10T05:42:00.000Z",
        detail: "銀行端唯讀，可轉 ops 詳查。",
      },
    ],
  },
  "BK-240611-0127": {
    bookingId: "BK-240611-0127",
    contractId: "ctr_ctbc_legacy_prestige_2026",
    cardholderRefMasked: "CH-****-7712",
    cardMasked: "**** 7712",
    benefitReferenceMasked: "BEN-****-7712",
    issuerAuthorizationRefMasked: "AUTH-****-9021",
    programLabel: "中信尊榮卡機場接送",
    flightNumber: "IT 218",
    terminal: "T1",
    directionLabel: "去程",
    pickupLabel: "台北中山區",
    dropoffLabel: "松山機場",
    scheduledAt: "2026-06-07T22:50:00.000Z",
    dispatchStateLabel: "爭議中",
    timeline: [
      {
        label: "建立訂單",
        at: "2026-06-07T12:01:00.000Z",
        detail: "benefit reference 已建立。",
      },
      {
        label: "司機未到",
        at: "2026-06-07T23:30:00.000Z",
        detail: "原派遣司機 no-show，未在 SLA 內補派成功。",
      },
      {
        label: "客服補單",
        at: "2026-06-07T23:56:00.000Z",
        detail: "由客服人工改派，現列 breach 爭議趟次。",
      },
    ],
  },
  "BK-240611-0139": {
    bookingId: "BK-240611-0139",
    contractId: "ctr_ctbc_legacy_prestige_2026",
    cardholderRefMasked: "CH-****-1148",
    cardMasked: "**** 1148",
    benefitReferenceMasked: "BEN-****-1148",
    issuerAuthorizationRefMasked: "AUTH-****-5506",
    programLabel: "中信尊榮卡機場接送",
    flightNumber: "CX 531",
    terminal: "T1",
    directionLabel: "回程",
    pickupLabel: "桃園機場 T1",
    dropoffLabel: "桃園青埔",
    scheduledAt: "2026-06-10T14:40:00.000Z",
    dispatchStateLabel: "已取消",
    timeline: [
      {
        label: "建立訂單",
        at: "2026-06-09T18:40:00.000Z",
        detail: "回程接送建立。",
      },
      {
        label: "派遣後取消",
        at: "2026-06-10T15:55:00.000Z",
        detail: "派遣後取消且未及時補派，列為 disputed trip。",
      },
      {
        label: "待 ops 裁定",
        at: "2026-06-10T16:30:00.000Z",
        detail: "銀行端僅可讀取，權威仍在 ops /contracts。",
      },
    ],
  },
};

export function listContractRecords() {
  return contractRecords;
}

export function getContractRecord(contractId: string) {
  return (
    contractRecords.find((record) => record.contractId === contractId) ?? null
  );
}

export function getContractBookingDetail(bookingId: string) {
  return bookingDetails[bookingId] ?? null;
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
