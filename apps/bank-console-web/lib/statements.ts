export type StatementStatus = "published" | "paid" | "due";

export interface StatementTripLine {
  tripId: string;
  tripDate: string;
  orderNo: string;
  routeLabel: string;
  fareAmount: number;
  subsidisedAmount: number;
  paidAmount: number;
  benefitReferenceMasked: string;
  cardholderReferenceMasked: string;
  cardReferenceMasked: string;
  artifactDownloadHref: string;
  disputeHref: string;
  disputed: boolean;
}

export interface SettlementStatement {
  period: string;
  statementNo: string;
  programLabel: string;
  issuedAt: string;
  dueAt: string;
  status: StatementStatus;
  totalFareAmount: number;
  totalSubsidisedAmount: number;
  totalPaidAmount: number;
  totalIssuerPayableAmount: number;
  totalTrips: number;
  signedArtifactHref: string;
  artifactExpired: boolean;
  trips: StatementTripLine[];
}

export interface StatementFilters {
  status?: StatementStatus;
}

const RAW_STATEMENTS = [
  {
    period: "2026-06",
    statementNo: "STM-CTBC-202606",
    programLabel: "中信機場 World Elite",
    issuedAt: "2026-06-04T10:00:00+08:00",
    dueAt: "2026-06-15T23:59:00+08:00",
    status: "published",
    signedArtifactHref: "/artifacts/statements/STM-CTBC-202606.pdf",
    trips: [
      {
        tripId: "trip_ctbc_260601_001",
        tripDate: "2026-06-01T05:30:00+08:00",
        orderNo: "BK-240611-018",
        routeLabel: "台北信義 → 桃機 T2",
        fareAmount: 1450,
        subsidisedAmount: 1200,
        paidAmount: 250,
        benefitReference: "BEN-CTBC-202606-18842",
        cardholderReference: "CH-8842-1198",
        cardReference: "5422-18XX-XXXX-4821",
        artifactDownloadHref: "/artifacts/trips/trip_ctbc_260601_001.pdf",
        disputeHref: "/statements/2026-06?dispute=trip_ctbc_260601_001",
        disputed: false,
      },
      {
        tripId: "trip_ctbc_260603_002",
        tripDate: "2026-06-03T22:10:00+08:00",
        orderNo: "BK-240611-012",
        routeLabel: "桃機 T1 → 新竹竹北",
        fareAmount: 1680,
        subsidisedAmount: 1200,
        paidAmount: 480,
        benefitReference: "BEN-CTBC-202606-10271",
        cardholderReference: "CH-0271-7821",
        cardReference: "5422-77XX-XXXX-1904",
        artifactDownloadHref: "/artifacts/trips/trip_ctbc_260603_002.pdf",
        disputeHref: "/statements/2026-06?dispute=trip_ctbc_260603_002",
        disputed: true,
      },
      {
        tripId: "trip_ctbc_260305_003",
        tripDate: "2026-06-05T04:45:00+08:00",
        orderNo: "BK-240608-031",
        routeLabel: "內湖瑞光路 → 桃機 T2",
        fareAmount: 1520,
        subsidisedAmount: 1200,
        paidAmount: 320,
        benefitReference: "BEN-CTBC-202606-15510",
        cardholderReference: "CH-5510-3308",
        cardReference: "5422-65XX-XXXX-3308",
        artifactDownloadHref: "/artifacts/trips/trip_ctbc_260305_003.pdf",
        disputeHref: "/statements/2026-06?dispute=trip_ctbc_260305_003",
        disputed: false,
      },
    ],
  },
  {
    period: "2026-05",
    statementNo: "STM-CTBC-202605",
    programLabel: "中信商旅 Signature",
    issuedAt: "2026-05-03T11:40:00+08:00",
    dueAt: "2026-05-12T23:59:00+08:00",
    status: "paid",
    signedArtifactHref: "/artifacts/statements/STM-CTBC-202605.pdf",
    trips: [
      {
        tripId: "trip_ctbc_250519_011",
        tripDate: "2026-05-19T06:00:00+08:00",
        orderNo: "BK-240610-087",
        routeLabel: "台中西屯 → 桃機 T1",
        fareAmount: 2140,
        subsidisedAmount: 1800,
        paidAmount: 340,
        benefitReference: "BEN-CTBC-202605-19001",
        cardholderReference: "CH-9001-4421",
        cardReference: "5422-90XX-XXXX-4421",
        artifactDownloadHref: "/artifacts/trips/trip_ctbc_250519_011.pdf",
        disputeHref: "/statements/2026-05?dispute=trip_ctbc_250519_011",
        disputed: false,
      },
      {
        tripId: "trip_ctbc_250528_014",
        tripDate: "2026-05-28T19:40:00+08:00",
        orderNo: "BK-240609-044",
        routeLabel: "桃機 T2 → 台北中山",
        fareAmount: 1380,
        subsidisedAmount: 1100,
        paidAmount: 280,
        benefitReference: "BEN-CTBC-202605-13188",
        cardholderReference: "CH-3188-7770",
        cardReference: "5422-44XX-XXXX-7770",
        artifactDownloadHref: "/artifacts/trips/trip_ctbc_250528_014.pdf",
        disputeHref: "/statements/2026-05?dispute=trip_ctbc_250528_014",
        disputed: false,
      },
    ],
  },
  {
    period: "2026-04",
    statementNo: "STM-CTBC-202604",
    programLabel: "中信機場 World Elite",
    issuedAt: "2026-04-02T09:20:00+08:00",
    dueAt: "2026-04-10T23:59:00+08:00",
    status: "due",
    signedArtifactHref: "/artifacts/statements/STM-CTBC-202604.pdf",
    trips: [
      {
        tripId: "trip_ctbc_240419_020",
        tripDate: "2026-04-19T16:20:00+08:00",
        orderNo: "BK-240607-029",
        routeLabel: "桃機 T2 → 台北大安",
        fareAmount: 1260,
        subsidisedAmount: 980,
        paidAmount: 280,
        benefitReference: "BEN-CTBC-202604-16621",
        cardholderReference: "CH-6621-9904",
        cardReference: "5422-11XX-XXXX-9904",
        artifactDownloadHref: "/artifacts/trips/trip_ctbc_240419_020.pdf",
        disputeHref: "/statements/2026-04?dispute=trip_ctbc_240419_020",
        disputed: false,
      },
      {
        tripId: "trip_ctbc_240423_021",
        tripDate: "2026-04-23T05:10:00+08:00",
        orderNo: "BK-240423-021",
        routeLabel: "板橋文化路 → 桃機 T1",
        fareAmount: 1490,
        subsidisedAmount: 1200,
        paidAmount: 290,
        benefitReference: "BEN-CTBC-202604-18803",
        cardholderReference: "CH-8803-5501",
        cardReference: "5422-03XX-XXXX-5501",
        artifactDownloadHref: "/artifacts/trips/trip_ctbc_240423_021.pdf",
        disputeHref: "/statements/2026-04?dispute=trip_ctbc_240423_021",
        disputed: false,
      },
    ],
  },
] as const;

function maskReference(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= 4) {
    return "••••";
  }

  return `${compact.slice(0, 2)}••••${compact.slice(-2)}`;
}

export const settlementStatements: SettlementStatement[] = RAW_STATEMENTS.map(
  (statement) => {
    const trips = statement.trips.map((trip) => ({
      tripId: trip.tripId,
      tripDate: trip.tripDate,
      orderNo: trip.orderNo,
      routeLabel: trip.routeLabel,
      fareAmount: trip.fareAmount,
      subsidisedAmount: trip.subsidisedAmount,
      paidAmount: trip.paidAmount,
      benefitReferenceMasked: maskReference(trip.benefitReference),
      cardholderReferenceMasked: maskReference(trip.cardholderReference),
      cardReferenceMasked: maskReference(trip.cardReference),
      artifactDownloadHref: trip.artifactDownloadHref,
      disputeHref: trip.disputeHref,
      disputed: trip.disputed,
    }));

    const totalFareAmount = trips.reduce(
      (sum, item) => sum + item.fareAmount,
      0,
    );
    const totalSubsidisedAmount = trips.reduce(
      (sum, item) => sum + item.subsidisedAmount,
      0,
    );
    const totalPaidAmount = trips.reduce(
      (sum, item) => sum + item.paidAmount,
      0,
    );

    return {
      period: statement.period,
      statementNo: statement.statementNo,
      programLabel: statement.programLabel,
      issuedAt: statement.issuedAt,
      dueAt: statement.dueAt,
      status: statement.status,
      totalFareAmount,
      totalSubsidisedAmount,
      totalPaidAmount,
      totalIssuerPayableAmount: totalSubsidisedAmount,
      totalTrips: trips.length,
      signedArtifactHref: statement.signedArtifactHref,
      artifactExpired: statement.status === "due",
      trips,
    };
  },
);

export const statementPeriods = settlementStatements.map(
  (statement) => statement.period,
);

export function filterStatements(filters: StatementFilters = {}) {
  return settlementStatements.filter((statement) => {
    if (filters.status && statement.status !== filters.status) {
      return false;
    }

    return true;
  });
}

export function getStatementByPeriod(period: string) {
  return settlementStatements.find((statement) => statement.period === period);
}
