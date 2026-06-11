export type BookingDirection = "outbound" | "inbound";
export type BookingState = "assigned" | "en_route" | "completed" | "cancelled";

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

function maskRef(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= 4) {
    return "••••";
  }
  return `${compact.slice(0, 2)}••••${compact.slice(-2)}`;
}

const RAW_BOOKINGS = [
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
  },
] as const;

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

export const bookingPeriods = Array.from(
  new Set(bookingList.map((item) => item.scheduledAt.slice(0, 7))),
).sort((left, right) => right.localeCompare(left));

export function filterBookings(filters: BookingFilters) {
  const cardholderNeedle = filters.cardholder?.trim().toLowerCase();

  return bookingList.filter((item) => {
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
