export type BookingDirection = "outbound" | "inbound";
export type BookingState = "assigned" | "en_route" | "completed" | "cancelled";
export type BookingActorRealm = "tenant" | "ops" | "system" | "driver";
export type BookingOpsLinkState =
  | "allowed"
  | "forbidden"
  | "unavailable"
  | "stale";

export interface BookingProgram {
  code: string;
  label: string;
}

export interface BookingListItem {
  orderId: string;
  orderNo: string;
  cardholderRefMasked: string;
  programCode: string;
  programLabel: string;
  direction: BookingDirection;
  flightNo: string;
  terminal: string;
  pickupLabel: string;
  dropoffLabel: string;
  scheduledAt: string;
  state: BookingState;
  benefitReferenceMasked: string;
}

export interface BookingFilters {
  programCode?: string;
  direction?: BookingDirection;
  state?: BookingState;
  period?: string;
  cardholder?: string;
}

export interface BookingTimelineEvent {
  occurredAt: string;
  title: string;
  actor: string;
  actorRealm: BookingActorRealm;
  detail: string;
  current?: boolean;
}

export interface BookingDetailRecord extends BookingListItem {
  authorizationReferenceMasked: string;
  flightDelayToleranceLabel: string;
  greetingLabel: string;
  quotaImpactLabel: string;
  quotaPolicyLabel: string;
  driverReferenceMasked: string;
  vehicleReferenceMasked: string;
  driverEligibilityNote?: string;
  opsLink: {
    state: BookingOpsLinkState;
    href: string;
  };
  timeline: readonly BookingTimelineEvent[];
}

interface RawBookingRecord {
  orderId: string;
  orderNo: string;
  cardholderRef: string;
  programCode: string;
  programLabel: string;
  direction: BookingDirection;
  flightNo: string;
  terminal: string;
  pickupLabel: string;
  dropoffLabel: string;
  scheduledAt: string;
  state: BookingState;
  benefitReference: string;
  authorizationReference: string;
  flightDelayToleranceLabel: string;
  greetingLabel: string;
  quotaImpactLabel: string;
  quotaPolicyLabel: string;
  driverReference: string;
  vehicleReference: string;
  driverEligibilityNote?: string;
  opsLink: {
    state: BookingOpsLinkState;
    href: string;
  };
  timeline: readonly BookingTimelineEvent[];
}

function maskRef(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= 4) {
    return "••••";
  }
  return `${compact.slice(0, 2)}••••${compact.slice(-2)}`;
}

function maskSegmentedRef(value: string) {
  const parts = value.split("-");
  if (parts.length >= 3) {
    return `${parts[0]}-••••-${parts.at(-1)}`;
  }
  return maskRef(value);
}

const RAW_BOOKINGS: readonly RawBookingRecord[] = [
  {
    orderId: "ord_ctbc_240611_01",
    orderNo: "BK-240611-018",
    cardholderRef: "CH-8842-1198",
    programCode: "WE12",
    programLabel: "中信機場 World Elite",
    direction: "outbound",
    flightNo: "BR198",
    terminal: "T2",
    pickupLabel: "台北市信義區松仁路 100 號",
    dropoffLabel: "桃園機場 第二航廈 出境大廳",
    scheduledAt: "2026-06-18T05:30:00+08:00",
    state: "assigned",
    benefitReference: "BEN-CTBC-202606-18842",
    authorizationReference: "AUTH-CTBC-7A1",
    flightDelayToleranceLabel: "60 分鐘免費等候",
    greetingLabel: "否",
    quotaImpactLabel: "扣 1 趟",
    quotaPolicyLabel: "世界卡年度 12 趟",
    driverReference: "DRV-8843-1209",
    vehicleReference: "TESLA-T7-2881",
    opsLink: {
      state: "allowed",
      href: "/ops/dispatch/d_8843",
    },
    timeline: [
      {
        occurredAt: "2026-06-11T09:12:00+08:00",
        title: "建立預約",
        actor: "cardholder.app",
        actorRealm: "tenant",
        detail: "卡友以 reference token 身分建立去程預約。",
      },
      {
        occurredAt: "2026-06-11T09:14:00+08:00",
        title: "資格審批通過",
        actor: "system.eligibility",
        actorRealm: "system",
        detail: "符合 World Elite 權益門檻，本趟預扣 1 趟。",
      },
      {
        occurredAt: "2026-06-11T09:16:00+08:00",
        title: "已指派司機",
        actor: "dispatch.engine",
        actorRealm: "ops",
        detail: "派遣單 d_8843 已建立，預估提前 12 分鐘抵達。",
        current: true,
      },
    ],
  },
  {
    orderId: "ord_ctbc_240611_02",
    orderNo: "BK-240611-012",
    cardholderRef: "CH-0271-7821",
    programCode: "SIG6",
    programLabel: "中信商旅 Signature",
    direction: "inbound",
    flightNo: "JX802",
    terminal: "T1",
    pickupLabel: "桃園機場 第一航廈 入境 7 號門",
    dropoffLabel: "新竹縣竹北市光明六路東一段 266 號",
    scheduledAt: "2026-06-14T22:10:00+08:00",
    state: "en_route",
    benefitReference: "BEN-CTBC-202606-10271",
    authorizationReference: "AUTH-CTBC-3C9",
    flightDelayToleranceLabel: "60 分鐘免費等候",
    greetingLabel: "是 · 第一航廈入境大廳",
    quotaImpactLabel: "扣 1 趟",
    quotaPolicyLabel: "Signature 年度 6 趟",
    driverReference: "DRV-8843-9981",
    vehicleReference: "LEXUS-WM-5207",
    opsLink: {
      state: "forbidden",
      href: "/ops/dispatch/d_8843",
    },
    timeline: [
      {
        occurredAt: "2026-06-11T14:20:00+08:00",
        title: "建立預約",
        actor: "cardholder.app",
        actorRealm: "tenant",
        detail: "卡友於網銀內嵌頁建立回程接送預約。",
      },
      {
        occurredAt: "2026-06-11T14:22:00+08:00",
        title: "資格審批通過",
        actor: "system.eligibility",
        actorRealm: "system",
        detail: "資格決策回覆 eligible，本趟扣抵 1 趟。",
      },
      {
        occurredAt: "2026-06-11T14:24:00+08:00",
        title: "已指派司機",
        actor: "dispatch.engine",
        actorRealm: "ops",
        detail: "派遣單 d_8843 建立，ETA 入境後 12 分鐘。",
      },
      {
        occurredAt: "2026-06-14T21:36:00+08:00",
        title: "航班動態更新",
        actor: "flight.tracker",
        actorRealm: "system",
        detail: "JX802 預計 22:18 落地，仍在等候容忍區間內。",
      },
      {
        occurredAt: "2026-06-14T22:06:00+08:00",
        title: "司機前往入境大廳",
        actor: "d_8843",
        actorRealm: "driver",
        detail: "司機已離開待命區，前往第一航廈 7 號門。",
        current: true,
      },
    ],
  },
  {
    orderId: "ord_ctbc_240611_03",
    orderNo: "BK-240610-087",
    cardholderRef: "CH-9001-4421",
    programCode: "WE12",
    programLabel: "中信機場 World Elite",
    direction: "outbound",
    flightNo: "CI220",
    terminal: "T1",
    pickupLabel: "台中市西屯區臺灣大道三段 99 號",
    dropoffLabel: "桃園機場 第一航廈 出境大廳",
    scheduledAt: "2026-06-12T06:00:00+08:00",
    state: "completed",
    benefitReference: "BEN-CTBC-202606-19001",
    authorizationReference: "AUTH-CTBC-4D2",
    flightDelayToleranceLabel: "45 分鐘免費等候",
    greetingLabel: "否",
    quotaImpactLabel: "扣 1 趟",
    quotaPolicyLabel: "世界卡年度 12 趟",
    driverReference: "DRV-6612-2300",
    vehicleReference: "BENZ-AQ-1738",
    opsLink: {
      state: "stale",
      href: "/ops/dispatch/d_6612",
    },
    timeline: [
      {
        occurredAt: "2026-06-10T18:00:00+08:00",
        title: "建立預約",
        actor: "cardholder.app",
        actorRealm: "tenant",
        detail: "卡友完成去程預約，等待資格審批。",
      },
      {
        occurredAt: "2026-06-10T18:04:00+08:00",
        title: "資格審批通過",
        actor: "system.eligibility",
        actorRealm: "system",
        detail: "符合年度權益，預留 1 趟次。",
      },
      {
        occurredAt: "2026-06-11T04:55:00+08:00",
        title: "已指派司機",
        actor: "dispatch.engine",
        actorRealm: "ops",
        detail: "車隊完成派遣，司機已前往接送點。",
      },
      {
        occurredAt: "2026-06-12T05:20:00+08:00",
        title: "途中",
        actor: "d_6612",
        actorRealm: "driver",
        detail: "卡友已上車，前往桃園機場第一航廈。",
      },
      {
        occurredAt: "2026-06-12T05:58:00+08:00",
        title: "完成",
        actor: "dispatch.engine",
        actorRealm: "ops",
        detail: "送達完成，權益扣抵確認入帳。",
        current: true,
      },
    ],
  },
  {
    orderId: "ord_ctbc_240611_04",
    orderNo: "BK-240609-044",
    cardholderRef: "CH-3188-7770",
    programCode: "PRE4",
    programLabel: "中信御璽 Premier",
    direction: "inbound",
    flightNo: "CX530",
    terminal: "T2",
    pickupLabel: "桃園機場 第二航廈 入境 21 號門",
    dropoffLabel: "台北市中山區樂群二路 199 號",
    scheduledAt: "2026-05-30T19:40:00+08:00",
    state: "cancelled",
    benefitReference: "BEN-CTBC-202605-13188",
    authorizationReference: "AUTH-CTBC-1B7",
    flightDelayToleranceLabel: "60 分鐘免費等候",
    greetingLabel: "是 · 第二航廈入境大廳",
    quotaImpactLabel: "回補 1 趟",
    quotaPolicyLabel: "Premier 年度 4 趟",
    driverReference: "DRV-1202-8801",
    vehicleReference: "TOYOTA-ZK-7019",
    driverEligibilityNote:
      "司機資格已失效，派遣單改由 Ops 另案補派並回補本趟權益。",
    opsLink: {
      state: "unavailable",
      href: "/ops/dispatch/d_1202",
    },
    timeline: [
      {
        occurredAt: "2026-05-29T10:12:00+08:00",
        title: "建立預約",
        actor: "cardholder.app",
        actorRealm: "tenant",
        detail: "卡友建立回程接送預約。",
      },
      {
        occurredAt: "2026-05-29T10:14:00+08:00",
        title: "資格審批通過",
        actor: "system.eligibility",
        actorRealm: "system",
        detail: "符合 Premier 權益，預扣 1 趟。",
      },
      {
        occurredAt: "2026-05-30T18:22:00+08:00",
        title: "已指派司機",
        actor: "dispatch.engine",
        actorRealm: "ops",
        detail: "司機與車輛完成配對。",
      },
      {
        occurredAt: "2026-05-30T18:54:00+08:00",
        title: "取消",
        actor: "dispatch.engine",
        actorRealm: "ops",
        detail: "原司機資格檢核失敗，派遣單取消並回補權益。",
        current: true,
      },
    ],
  },
  {
    orderId: "ord_ctbc_240611_05",
    orderNo: "BK-240608-031",
    cardholderRef: "CH-5510-3308",
    programCode: "SIG6",
    programLabel: "中信商旅 Signature",
    direction: "outbound",
    flightNo: "SQ879",
    terminal: "T2",
    pickupLabel: "台北市內湖區瑞光路 399 號",
    dropoffLabel: "桃園機場 第二航廈 出境大廳",
    scheduledAt: "2026-05-28T04:45:00+08:00",
    state: "completed",
    benefitReference: "BEN-CTBC-202605-15510",
    authorizationReference: "AUTH-CTBC-9Q4",
    flightDelayToleranceLabel: "45 分鐘免費等候",
    greetingLabel: "否",
    quotaImpactLabel: "扣 1 趟",
    quotaPolicyLabel: "Signature 年度 6 趟",
    driverReference: "DRV-2251-1900",
    vehicleReference: "AUDI-KL-2288",
    opsLink: {
      state: "allowed",
      href: "/ops/dispatch/d_2251",
    },
    timeline: [
      {
        occurredAt: "2026-05-27T15:04:00+08:00",
        title: "建立預約",
        actor: "cardholder.app",
        actorRealm: "tenant",
        detail: "卡友建立清晨出發的機場接送。",
      },
      {
        occurredAt: "2026-05-27T15:05:00+08:00",
        title: "資格審批通過",
        actor: "system.eligibility",
        actorRealm: "system",
        detail: "檢核通過並保留 1 趟次。",
      },
      {
        occurredAt: "2026-05-28T03:58:00+08:00",
        title: "完成",
        actor: "dispatch.engine",
        actorRealm: "ops",
        detail: "卡友已於第二航廈出境大廳下車。",
        current: true,
      },
    ],
  },
  {
    orderId: "ord_ctbc_240611_06",
    orderNo: "BK-240607-029",
    cardholderRef: "CH-6621-9904",
    programCode: "WE12",
    programLabel: "中信機場 World Elite",
    direction: "inbound",
    flightNo: "JL802",
    terminal: "T2",
    pickupLabel: "桃園機場 第二航廈 入境 5 號門",
    dropoffLabel: "台北市大安區敦化南路二段 39 號",
    scheduledAt: "2026-04-19T16:20:00+08:00",
    state: "assigned",
    benefitReference: "BEN-CTBC-202604-16621",
    authorizationReference: "AUTH-CTBC-8M2",
    flightDelayToleranceLabel: "60 分鐘免費等候",
    greetingLabel: "是 · 第二航廈入境大廳",
    quotaImpactLabel: "扣 1 趟",
    quotaPolicyLabel: "世界卡年度 12 趟",
    driverReference: "DRV-7721-0045",
    vehicleReference: "BMW-RA-1235",
    opsLink: {
      state: "allowed",
      href: "/ops/dispatch/d_7721",
    },
    timeline: [
      {
        occurredAt: "2026-04-19T10:05:00+08:00",
        title: "建立預約",
        actor: "cardholder.app",
        actorRealm: "tenant",
        detail: "卡友建立第二航廈回程預約。",
      },
      {
        occurredAt: "2026-04-19T10:07:00+08:00",
        title: "資格審批通過",
        actor: "system.eligibility",
        actorRealm: "system",
        detail: "世界卡權益可用，預扣 1 趟次。",
      },
      {
        occurredAt: "2026-04-19T15:41:00+08:00",
        title: "已指派司機",
        actor: "dispatch.engine",
        actorRealm: "ops",
        detail: "司機待命中，等待航班實際抵達。",
        current: true,
      },
    ],
  },
];

export const bookingPrograms: BookingProgram[] = Array.from(
  new Map(
    RAW_BOOKINGS.map((item) => [
      item.programCode,
      {
        code: item.programCode,
        label: item.programLabel,
      },
    ]),
  ).values(),
);

export const bookingList: BookingListItem[] = RAW_BOOKINGS.map((item) => ({
  orderId: item.orderId,
  orderNo: item.orderNo,
  cardholderRefMasked: maskRef(item.cardholderRef),
  programCode: item.programCode,
  programLabel: item.programLabel,
  direction: item.direction,
  flightNo: item.flightNo,
  terminal: item.terminal,
  pickupLabel: item.pickupLabel,
  dropoffLabel: item.dropoffLabel,
  scheduledAt: item.scheduledAt,
  state: item.state,
  benefitReferenceMasked: maskRef(item.benefitReference),
}));

function toBookingDetail(item: RawBookingRecord): BookingDetailRecord {
  const detail: BookingDetailRecord = {
    orderId: item.orderId,
    orderNo: item.orderNo,
    cardholderRefMasked: maskRef(item.cardholderRef),
    programCode: item.programCode,
    programLabel: item.programLabel,
    direction: item.direction,
    flightNo: item.flightNo,
    terminal: item.terminal,
    pickupLabel: item.pickupLabel,
    dropoffLabel: item.dropoffLabel,
    scheduledAt: item.scheduledAt,
    state: item.state,
    benefitReferenceMasked: maskRef(item.benefitReference),
    authorizationReferenceMasked: maskSegmentedRef(item.authorizationReference),
    flightDelayToleranceLabel: item.flightDelayToleranceLabel,
    greetingLabel: item.greetingLabel,
    quotaImpactLabel: item.quotaImpactLabel,
    quotaPolicyLabel: item.quotaPolicyLabel,
    driverReferenceMasked: maskRef(item.driverReference),
    vehicleReferenceMasked: maskRef(item.vehicleReference),
    opsLink: item.opsLink,
    timeline: item.timeline,
  };

  if (item.driverEligibilityNote) {
    detail.driverEligibilityNote = item.driverEligibilityNote;
  }

  return detail;
}

export const bookingDetails: BookingDetailRecord[] =
  RAW_BOOKINGS.map(toBookingDetail);

export function deriveBookingPeriods(bookings: readonly BookingListItem[]) {
  return Array.from(
    new Set(bookings.map((item) => item.scheduledAt.slice(0, 7))),
  ).sort((left, right) => right.localeCompare(left));
}

export const bookingPeriods = deriveBookingPeriods(bookingList);

export function filterBookingItems(
  bookings: readonly BookingListItem[],
  filters: BookingFilters,
) {
  const cardholderNeedle = filters.cardholder?.trim().toLowerCase();

  return bookings.filter((item) => {
    if (filters.programCode && item.programCode !== filters.programCode) {
      return false;
    }
    if (filters.direction && item.direction !== filters.direction) {
      return false;
    }
    if (filters.state && item.state !== filters.state) {
      return false;
    }
    if (filters.period && item.scheduledAt.slice(0, 7) !== filters.period) {
      return false;
    }
    if (
      cardholderNeedle &&
      !item.cardholderRefMasked.toLowerCase().includes(cardholderNeedle)
    ) {
      return false;
    }
    return true;
  });
}

export function filterBookings(filters: BookingFilters) {
  return filterBookingItems(bookingList, filters);
}

export function getBookingDetail(orderId: string) {
  return bookingDetails.find((item) => item.orderId === orderId);
}
