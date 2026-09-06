import "server-only";

import type {
  AuditLogRecord,
  IssuerContractStatusRecord,
  OwnedOrderRecord,
  TenantProgramUsageRecord,
  TenantServiceProgramRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";

import { bankApiGet, bankApiGetList } from "./server-bank-api";
import {
  bookingDetails,
  bookingList,
  deriveBookingPeriods,
  type BookingDetailRecord,
  type BookingDirection,
  type BookingListItem,
  type BookingProgram,
  type BookingState,
  type BookingTimelineEvent,
} from "./bookings";
import { ORDER_TALLIES, QUOTA_PROGRAMS, type BankRole } from "./home-data";
import { settlementStatements, type StatementStatus } from "./statements";
import { listContractRecords } from "./contracts-data";
export type BankConsoleRole =
  | "bank_program_admin"
  | "bank_ops_viewer"
  | "bank_finance";

type ApiSettlementStatementRecord = {
  statement_id?: string;
  statementId?: string;
  tenant_id?: string;
  tenantId?: string;
  period: string;
  period_start?: string;
  periodStart?: string;
  period_end?: string;
  periodEnd?: string;
  status: StatementStatus;
  lines?: Array<{
    trip_id?: string;
    tripId?: string;
    completed_at?: string;
    completedAt?: string;
    fare?: { amount_minor?: number; amountMinor?: number; currency?: string };
    subsidised_amount?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    subsidisedAmount?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    paid_amount?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    paidAmount?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    benefit_reference?: string;
    benefitReference?: string;
    issuer_authorization_ref?: string;
    issuerAuthorizationRef?: string;
    cardholder_ref_masked?: string;
    cardholderRefMasked?: string;
  }>;
  totals?: {
    trip_count?: number;
    tripCount?: number;
    fare_total?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    fareTotal?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    subsidised_total?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    subsidisedTotal?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    paid_total?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    paidTotal?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    issuer_payable?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
    issuerPayable?: {
      amount_minor?: number;
      amountMinor?: number;
      currency?: string;
    };
  };
  artifact_ref?: {
    artifact_id?: string;
    artifactId?: string;
    kind?: "settlement_statement";
    manifest_hash?: string;
    manifestHash?: string;
  };
  artifactRef?: {
    artifact_id?: string;
    artifactId?: string;
    kind?: "settlement_statement";
    manifest_hash?: string;
    manifestHash?: string;
  };
  generated_at?: string;
  generatedAt?: string;
  issued_at?: string;
  issuedAt?: string;
  due_at?: string;
  dueAt?: string;
};

export type BankLoadState<T> = {
  data: T;
  degradedMessage: string | null;
};

export type BankStatement = {
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
  trips: Array<{
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
  }>;
};

export type BankUserRow = {
  name: string;
  email: string;
  role: BankConsoleRole;
  status: "active" | "invited" | "suspended";
  lastActivity: string;
};

export type BankAuditRow = {
  id: string;
  timestamp: string;
  period: string;
  type:
    | "eligibility_decision"
    | "dispatch_assignment"
    | "settlement_close"
    | "access";
  actor: "bank_ops_viewer" | "bank_program_admin" | "bank_finance" | "system";
  actorHandle: string;
  subjectMasked: string;
  reasonCode:
    | "ELIGIBLE_APPROVED"
    | "MANUAL_REVIEW_REQUIRED"
    | "DRIVER_ASSIGNED"
    | "STATEMENT_PUBLISHED"
    | "ACCESS_GRANTED"
    | "ACCESS_DENIED";
  summary: string;
  relatedEntity: {
    kind: "booking" | "statement";
    href: string;
    label: string;
  };
};

export type BankHomeOrderTallies = {
  total: number;
  reserved: number;
  live: number;
  completed: number;
  cancelled: number;
};

function apiMoneyToNumber(
  value?: { amount_minor?: number; amountMinor?: number } | null,
) {
  if (!value) {
    return 0;
  }
  const minor = value.amountMinor ?? value.amount_minor ?? 0;
  return minor / 100;
}

function maskCompact(value: string | null | undefined) {
  if (!value) {
    return "••••";
  }
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= 4) {
    return "••••";
  }
  return `${compact.slice(0, 2)}••••${compact.slice(-2)}`;
}

function maskSegmented(value: string | null | undefined) {
  if (!value) {
    return "••••";
  }
  const parts = value.split("-");
  if (parts.length >= 3) {
    return `${parts[0]}-••••-${parts.at(-1)}`;
  }
  return maskCompact(value);
}

export function getTaipeiDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatPeriodDate(period: string, end = false) {
  const [yearPart, monthPart] = (period || "").split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!year || !month || Number.isNaN(year) || Number.isNaN(month)) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  if (!end) {
    return `${year}-${pad(month)}-01T00:00:00+08:00`;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(lastDay)}T23:59:59+08:00`;
}

export function deriveStatementDates(
  periodOrRecord:
    | string
    | {
        period?: string;
        issued_at?: string;
        issuedAt?: string;
        due_at?: string;
        dueAt?: string;
        generated_at?: string;
        generatedAt?: string;
      },
  rawIssuedAt?: string,
  rawDueAt?: string,
  rawGeneratedAt?: string,
): { issuedAt: string; dueAt: string } {
  const period =
    typeof periodOrRecord === "string"
      ? periodOrRecord
      : periodOrRecord?.period || "2026-03";
  const effectiveIssuedAt =
    rawIssuedAt ??
    (typeof periodOrRecord === "object"
      ? periodOrRecord.issuedAt ?? periodOrRecord.issued_at
      : undefined);
  const effectiveDueAt =
    rawDueAt ??
    (typeof periodOrRecord === "object"
      ? periodOrRecord.dueAt ?? periodOrRecord.due_at
      : undefined);
  const effectiveGeneratedAt =
    rawGeneratedAt ??
    (typeof periodOrRecord === "object"
      ? periodOrRecord.generatedAt ?? periodOrRecord.generated_at
      : undefined);

  // Check if there is an exact seed statement record for this period
  const seed = settlementStatements.find((s) => s.period === period);

  const immutablePeriodStart = formatPeriodDate(period, false);
  const immutablePeriodEnd = formatPeriodDate(period, true);

  let issuedAt = effectiveIssuedAt || seed?.issuedAt;
  let dueAt = effectiveDueAt || seed?.dueAt;

  if (!issuedAt) {
    if (effectiveGeneratedAt && effectiveGeneratedAt.slice(0, 7) === period) {
      issuedAt = effectiveGeneratedAt;
    } else {
      issuedAt = immutablePeriodStart;
    }
  }

  if (!dueAt) {
    dueAt = immutablePeriodEnd;
  }

  // Guard: issuedAt must never be later than dueAt
  if (new Date(issuedAt).getTime() > new Date(dueAt).getTime()) {
    issuedAt = immutablePeriodStart;
    dueAt = immutablePeriodEnd;
  }

  return { issuedAt, dueAt };
}

function formatLastActivity(value: string) {
  return value.slice(0, 16).replace("T", " ");
}

function mapBookingState(status: OwnedOrderRecord["status"]): BookingState {
  switch (status) {
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "driver_accepted":
    case "enroute_pickup":
    case "arrived_pickup":
    case "on_trip":
    case "proof_pending":
      return "en_route";
    default:
      return "assigned";
  }
}

function mapDirection(order: OwnedOrderRecord): BookingDirection {
  if (order.direction === "pickup") {
    return "inbound";
  }
  return "outbound";
}

function mapBookingPrograms(
  programs: TenantServiceProgramRecord[],
): BookingProgram[] {
  return programs.map((program) => ({
    code: program.programId,
    label: program.displayName,
  }));
}

function mapHomeOrderBucket(
  status: OwnedOrderRecord["status"],
): keyof BankHomeOrderTallies {
  switch (status) {
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "driver_accepted":
    case "enroute_pickup":
    case "arrived_pickup":
    case "on_trip":
    case "proof_pending":
      return "live";
    default:
      return "reserved";
  }
}

function buildProgramNameMap(
  programs: TenantServiceProgramRecord[],
  usage: TenantProgramUsageRecord[],
) {
  const map = new Map<string, string>();
  for (const program of programs) {
    map.set(program.programId, program.displayName);
  }
  for (const record of usage) {
    if (!map.has(record.programId)) {
      map.set(record.programId, record.programCode);
    }
  }
  return map;
}

function mapBookingListItem(
  order: OwnedOrderRecord,
  programNameMap: Map<string, string>,
): BookingListItem {
  const programId = order.partnerProgramId ?? "unknown-program";
  return {
    orderId: order.orderId,
    orderNo: order.orderNo,
    cardholderRefMasked: maskCompact(
      order.passenger.phone || order.passenger.name || order.orderId,
    ),
    programCode: programId,
    programLabel: programNameMap.get(programId) ?? programId,
    direction: mapDirection(order),
    flightNo: order.flightNo ?? "—",
    terminal: order.terminal ?? "—",
    pickupLabel: order.pickup.maskedAddress ?? order.pickup.address,
    dropoffLabel: order.dropoff.maskedAddress ?? order.dropoff.address,
    scheduledAt: order.reservationWindowStart ?? order.createdAt,
    state: mapBookingState(order.status),
    benefitReferenceMasked: maskSegmented(order.benefitReference),
  };
}

function buildTimeline(order: OwnedOrderRecord): BookingTimelineEvent[] {
  const events: BookingTimelineEvent[] = [
    {
      occurredAt: order.createdAt,
      title: "建立預約",
      actor: "system.booking",
      actorRealm: "system",
      detail: "訂單已建立並進入發卡行唯讀視角。",
    },
  ];

  if (
    order.approvalState === "approved" ||
    order.approvalState === "not_required"
  ) {
    events.push({
      occurredAt: order.updatedAt,
      title: "資格審批通過",
      actor: "system.eligibility",
      actorRealm: "system",
      detail: "資格與配額檢查已完成。",
    });
  }

  events.push({
    occurredAt: order.updatedAt,
    title:
      mapBookingState(order.status) === "completed"
        ? "已完成"
        : mapBookingState(order.status) === "cancelled"
          ? "已取消"
          : mapBookingState(order.status) === "en_route"
            ? "行程進行中"
            : "已指派",
    actor: "dispatch.runtime",
    actorRealm: "ops",
    detail: `目前狀態：${order.status}`,
    current: true,
  });

  return events;
}

function mapBookingDetail(
  order: OwnedOrderRecord,
  programNameMap: Map<string, string>,
): BookingDetailRecord {
  const base = mapBookingListItem(order, programNameMap);
  return {
    ...base,
    authorizationReferenceMasked: maskSegmented(order.issuerAuthorizationRef),
    flightDelayToleranceLabel: "依 DRTS 即時航班監控為準",
    greetingLabel: order.notes?.includes("greet") ? "是" : "否",
    quotaImpactLabel: order.benefitReference ? "扣 1 趟" : "未扣權益",
    quotaPolicyLabel: "發卡行方案配額依 DRTS/API 當期計算",
    driverReferenceMasked: "DRV-••••",
    vehicleReferenceMasked: "VEH-••••",
    opsLink: {
      state: "forbidden",
      href: "/ops/dispatch",
    },
    timeline: buildTimeline(order),
  };
}

function mapUserRole(roleCode: string): BankConsoleRole {
  if (roleCode === "bank_finance") {
    return "bank_finance";
  }
  if (roleCode === "bank_ops_viewer") {
    return "bank_ops_viewer";
  }
  return "bank_program_admin";
}

function mapAuditType(record: AuditLogRecord): BankAuditRow["type"] {
  if (record.moduleName.includes("settlement")) return "settlement_close";
  if (record.moduleName.includes("dispatch")) return "dispatch_assignment";
  if (
    record.moduleName.includes("tenant") ||
    record.moduleName.includes("eligibility")
  ) {
    return "eligibility_decision";
  }
  return "access";
}

function mapAuditActor(record: AuditLogRecord): BankAuditRow["actor"] {
  if (record.actorType === "system") return "system";
  if (record.actorId?.includes("finance")) return "bank_finance";
  if (record.actorId?.includes("ops")) return "bank_ops_viewer";
  return "bank_program_admin";
}

function mapAuditReason(record: AuditLogRecord): BankAuditRow["reasonCode"] {
  const action = record.actionName.toLowerCase();
  if (action.includes("publish") || action.includes("statement")) {
    return "STATEMENT_PUBLISHED";
  }
  if (action.includes("assign") || action.includes("dispatch")) {
    return "DRIVER_ASSIGNED";
  }
  if (action.includes("deny") || action.includes("forbid")) {
    return "ACCESS_DENIED";
  }
  if (action.includes("access") || action.includes("download")) {
    return "ACCESS_GRANTED";
  }
  if (action.includes("review") || action.includes("hold")) {
    return "MANUAL_REVIEW_REQUIRED";
  }
  return "ELIGIBLE_APPROVED";
}

function mapAuditEntity(record: AuditLogRecord) {
  if (record.moduleName.includes("settlement")) {
    const label = record.resourceId?.slice(-7) ?? "statement";
    return {
      kind: "statement" as const,
      href: `/statements/${label}`,
      label,
    };
  }
  return {
    kind: "booking" as const,
    href: `/bookings/${record.resourceId ?? ""}`,
    label: record.resourceId ?? "booking",
  };
}

async function loadCoreBankData(tenantId: string, role: BankConsoleRole) {
  const actorId = `bank-console:${tenantId}:${role}`;
  const [
    programsResult,
    usageResult,
    ordersResult,
    contractsResult,
    statementsResult,
    usersResult,
    auditResult,
  ] = await Promise.allSettled([
    bankApiGetList<TenantServiceProgramRecord>(
      "api/tenant/service-programs",
      tenantId,
      actorId,
    ),
    bankApiGetList<TenantProgramUsageRecord>(
      "api/tenant/program-usage",
      tenantId,
      actorId,
    ),
    bankApiGetList<OwnedOrderRecord>(
      "api/tenant/orders?serviceProduct=credit_card_airport_transfer",
      tenantId,
      actorId,
    ),
    bankApiGetList<IssuerContractStatusRecord>(
      "api/tenant/contracts",
      tenantId,
      actorId,
    ),
    bankApiGetList<ApiSettlementStatementRecord>(
      "api/tenant/settlement-statements",
      tenantId,
      actorId,
    ),
    bankApiGet<TenantUserRoleRecord[] | { items: TenantUserRoleRecord[] }>(
      "api/tenant/users",
      tenantId,
      actorId,
    ),
    bankApiGetList<AuditLogRecord>("api/tenant/audit", tenantId, actorId),
  ]);

  const failures: string[] = [];
  if (programsResult.status === "rejected") failures.push("service-programs");
  if (usageResult.status === "rejected") failures.push("program-usage");
  if (ordersResult.status === "rejected") failures.push("orders");
  if (contractsResult.status === "rejected") failures.push("contracts");
  if (statementsResult.status === "rejected") failures.push("settlement-statements");
  if (usersResult.status === "rejected") failures.push("users");
  if (auditResult.status === "rejected") failures.push("audit");

  const programs =
    programsResult.status === "fulfilled" ? programsResult.value : [];
  const usage = usageResult.status === "fulfilled" ? usageResult.value : [];
  const orders = ordersResult.status === "fulfilled" ? ordersResult.value : [];
  const contracts =
    contractsResult.status === "fulfilled" ? contractsResult.value : [];
  const statements =
    statementsResult.status === "fulfilled" ? statementsResult.value : [];
  const rawUsers =
    usersResult.status === "fulfilled" ? usersResult.value : [];
  const users = Array.isArray(rawUsers)
    ? rawUsers
    : rawUsers && Array.isArray((rawUsers as { items?: TenantUserRoleRecord[] }).items)
      ? (rawUsers as { items: TenantUserRoleRecord[] }).items
      : [];
  const audit = auditResult.status === "fulfilled" ? auditResult.value : [];

  const degradedMessage =
    failures.length > 0
      ? `Partially degraded: endpoints unavailable (${failures.join(", ")}).`
      : null;

  return {
    programs,
    usage,
    orders,
    contracts,
    statements,
    users,
    audit,
    degradedMessage,
  };
}

export function mapStatementsFromApi(
  statements: ApiSettlementStatementRecord[],
  defaultProgramLabel: string,
): BankStatement[] {
  return statements.map((statement) => {
    const period = statement.period;
    const statementNo =
      statement.statement_id ??
      statement.statementId ??
      `settlement-statement-${period}`;
    const rawIssuedAt = statement.issued_at ?? statement.issuedAt;
    const rawDueAt = statement.due_at ?? statement.dueAt;
    const rawGeneratedAt = statement.generated_at ?? statement.generatedAt;
    const { issuedAt, dueAt } = deriveStatementDates(
      period,
      rawIssuedAt,
      rawDueAt,
      rawGeneratedAt,
    );
    const totals = statement.totals;
    const fareTotal = totals?.fare_total ?? totals?.fareTotal;
    const subsidisedTotal = totals?.subsidised_total ?? totals?.subsidisedTotal;
    const paidTotal = totals?.paid_total ?? totals?.paidTotal;
    const issuerPayable = totals?.issuer_payable ?? totals?.issuerPayable;
    const tripCount =
      totals?.trip_count ?? totals?.tripCount ?? (statement.lines?.length ?? 0);

    const artifactRef = statement.artifact_ref ?? statement.artifactRef;
    const artifactId =
      artifactRef?.artifact_id ?? artifactRef?.artifactId ?? statementNo;

    const lines = statement.lines ?? [];
    const trips = lines.map((line) => {
      const tripId = line.trip_id ?? line.tripId ?? "trip";
      const tripDate = line.completed_at ?? line.completedAt ?? issuedAt;
      const subsidised = line.subsidised_amount ?? line.subsidisedAmount;
      const paid = line.paid_amount ?? line.paidAmount;
      const benefitRef = line.benefit_reference ?? line.benefitReference;
      const cardholderRef =
        line.cardholder_ref_masked ?? line.cardholderRefMasked;

      return {
        tripId,
        tripDate,
        orderNo: tripId,
        routeLabel: "依 API trip readback",
        fareAmount: apiMoneyToNumber(line.fare),
        subsidisedAmount: apiMoneyToNumber(subsidised),
        paidAmount: apiMoneyToNumber(paid),
        benefitReferenceMasked: maskSegmented(benefitRef),
        cardholderReferenceMasked: maskCompact(cardholderRef),
        cardReferenceMasked: "••••",
        artifactDownloadHref: `/artifacts/trips/${tripId}.pdf`,
        disputeHref: `/statements/${period}?dispute=${tripId}`,
        disputed: false,
      };
    });

    return {
      period,
      statementNo,
      programLabel: defaultProgramLabel,
      issuedAt,
      dueAt,
      status: statement.status,
      totalFareAmount: apiMoneyToNumber(fareTotal),
      totalSubsidisedAmount: apiMoneyToNumber(subsidisedTotal),
      totalPaidAmount: apiMoneyToNumber(paidTotal),
      totalIssuerPayableAmount: apiMoneyToNumber(
        issuerPayable || subsidisedTotal,
      ),
      totalTrips: tripCount,
      signedArtifactHref: `/artifacts/statements/${artifactId}.pdf`,
      artifactExpired: statement.status === "due",
      trips,
    };
  });
}

export async function loadBankBookingsData(
  tenantId: string,
  role: BankConsoleRole,
): Promise<
  BankLoadState<{
    bookings: BookingListItem[];
    programs: BookingProgram[];
    periods: string[];
    detailById: Map<string, BookingDetailRecord>;
  }>
> {
  try {
    const core = await loadCoreBankData(tenantId, role);
    const programNameMap = buildProgramNameMap(core.programs, core.usage);
    const bookings = core.orders.map((order) =>
      mapBookingListItem(order, programNameMap),
    );
    const detailById = new Map(
      core.orders.map((order) => [
        order.orderId,
        mapBookingDetail(order, programNameMap),
      ]),
    );
    const periods = [
      ...new Set(
        core.orders.map((order) =>
          (order.reservationWindowStart ?? order.createdAt).slice(0, 7),
        ),
      ),
    ].sort((left, right) => right.localeCompare(left));

    const effectiveBookings =
      bookings.length > 0
        ? bookings
        : core.degradedMessage
          ? bookingList
          : [];
    const effectivePrograms =
      core.programs.length > 0
        ? mapBookingPrograms(core.programs)
        : core.degradedMessage
          ? [
              { code: "WE12", label: "中信機場 World Elite" },
              { code: "SIG6", label: "中信商旅 Signature" },
            ]
          : [];
    const effectivePeriods =
      periods.length > 0
        ? periods
        : core.degradedMessage
          ? deriveBookingPeriods(bookingList)
          : [];
    const effectiveDetailById =
      detailById.size > 0
        ? detailById
        : core.degradedMessage
          ? new Map(bookingDetails.map((item) => [item.orderId, item]))
          : new Map();

    return {
      data: {
        bookings: effectiveBookings,
        programs: effectivePrograms,
        periods: effectivePeriods,
        detailById: effectiveDetailById,
      },
      degradedMessage: core.degradedMessage,
    };
  } catch (error) {
    return {
      data: {
        bookings: bookingList,
        programs: [
          { code: "WE12", label: "中信機場 World Elite" },
          { code: "SIG6", label: "中信商旅 Signature" },
        ],
        periods: deriveBookingPeriods(bookingList),
        detailById: new Map(bookingDetails.map((item) => [item.orderId, item])),
      },
      degradedMessage:
        error instanceof Error ? error.message : "Failed to load bookings.",
    };
  }
}

export async function loadBankContractsData(
  tenantId: string,
  role: BankConsoleRole,
): Promise<BankLoadState<{ contracts: IssuerContractStatusRecord[] }>> {
  try {
    const core = await loadCoreBankData(tenantId, role);
    const effectiveContracts =
      core.contracts.length > 0
        ? core.contracts
        : core.degradedMessage
          ? listContractRecords()
          : [];
    return { data: { contracts: effectiveContracts }, degradedMessage: core.degradedMessage };
  } catch (error) {
    return {
      data: { contracts: listContractRecords() },
      degradedMessage:
        error instanceof Error ? error.message : "Failed to load contracts.",
    };
  }
}

export async function loadBankStatementsData(
  tenantId: string,
  role: BankConsoleRole,
): Promise<BankLoadState<{ statements: BankStatement[] }>> {
  try {
    const core = await loadCoreBankData(tenantId, role);
    const defaultProgramLabel =
      core.usage[0]?.programCode ?? "Airport transfer settlement";
    const mapped = mapStatementsFromApi(core.statements, defaultProgramLabel);
    const effectiveStatements =
      mapped.length > 0
        ? mapped
        : core.degradedMessage
          ? settlementStatements
          : [];
    return {
      data: { statements: effectiveStatements },
      degradedMessage: core.degradedMessage,
    };
  } catch (error) {
    return {
      data: { statements: settlementStatements },
      degradedMessage:
        error instanceof Error ? error.message : "Failed to load statements.",
    };
  }
}

export async function loadBankProgramsData(
  tenantId: string,
  role: BankConsoleRole,
): Promise<
  BankLoadState<{
    programs: Array<{
      id: string;
      name: string;
      code: string;
      period: string;
      served: number;
      used: number;
      total: number;
      remaining: number;
      exceptionCount: number;
    }>;
  }>
> {
  try {
    const core = await loadCoreBankData(tenantId, role);
    const exceptionCount = core.contracts.reduce(
      (sum, contract) =>
        sum +
        (contract.exceptions ?? []).filter((item) => item.status === "open")
          .length,
      0,
    );
    const byId = new Map(
      core.programs.map((program) => [program.programId, program]),
    );
    return {
      data: {
        programs: core.usage.map((record) => ({
          id: record.programId,
          name: byId.get(record.programId)?.displayName ?? record.programCode,
          code: record.programCode,
          period: record.period,
          served: record.cardholdersServed,
          used: record.tripsConsumed,
          total: record.quotaTotal ?? 0,
          remaining: record.quotaRemaining ?? 0,
          exceptionCount,
        })),
      },
      degradedMessage: core.degradedMessage,
    };
  } catch (error) {
    return {
      data: { programs: [] },
      degradedMessage:
        error instanceof Error ? error.message : "Failed to load programs.",
    };
  }
}

export async function loadBankUsersData(
  tenantId: string,
  role: BankConsoleRole,
): Promise<BankLoadState<{ users: BankUserRow[] }>> {
  try {
    const core = await loadCoreBankData(tenantId, role);
    return {
      data: {
        users: core.users.map((user) => ({
          name: user.displayName,
          email: user.email,
          role: mapUserRole(user.roleCode),
          status: user.status,
          lastActivity: formatLastActivity(user.updatedAt),
        })),
      },
      degradedMessage: core.degradedMessage,
    };
  } catch (error) {
    return {
      data: { users: [] },
      degradedMessage:
        error instanceof Error ? error.message : "Failed to load users.",
    };
  }
}

export async function loadBankAuditData(
  tenantId: string,
  role: BankConsoleRole,
): Promise<BankLoadState<{ records: BankAuditRow[] }>> {
  try {
    const core = await loadCoreBankData(tenantId, role);
    return {
      data: {
        records: core.audit.map((record) => ({
          id: record.auditId,
          timestamp: record.createdAt,
          period: (record.createdAt || "").slice(0, 7),
          type: mapAuditType(record),
          actor: mapAuditActor(record),
          actorHandle: record.actorId ?? "system",
          subjectMasked: maskCompact(record.resourceId ?? record.requestId),
          reasonCode: mapAuditReason(record),
          summary: `${record.moduleName}.${record.actionName}`,
          relatedEntity: mapAuditEntity(record),
        })),
      },
      degradedMessage: core.degradedMessage,
    };
  } catch (error) {
    return {
      data: { records: [] },
      degradedMessage:
        error instanceof Error ? error.message : "Failed to load audit.",
    };
  }
}

export async function loadBankHomeSnapshot(
  tenantId: string,
  role: BankConsoleRole,
): Promise<
  BankLoadState<{
    period: string;
    todayLabel: string;
    orders: BookingListItem[];
    tallies: BankHomeOrderTallies;
    usage: TenantProgramUsageRecord[];
    contracts: IssuerContractStatusRecord[];
    statements: BankStatement[];
  }>
> {
  const todayLabel = getTaipeiDateString();
  const currentPeriod = todayLabel.slice(0, 7);

  try {
    const core = await loadCoreBankData(tenantId, role);
    const programNameMap = buildProgramNameMap(core.programs, core.usage);
    const mappedBookings = core.orders.map((order) =>
      mapBookingListItem(order, programNameMap),
    );
    const defaultProgramLabel =
      core.usage[0]?.programCode ?? "Airport transfer settlement";
    const mappedStatements = mapStatementsFromApi(
      core.statements,
      defaultProgramLabel,
    );

    const effectiveOrders =
      mappedBookings.length > 0
        ? mappedBookings
        : core.degradedMessage
          ? bookingList
          : [];
    const effectiveContracts =
      core.contracts.length > 0
        ? core.contracts
        : core.degradedMessage
          ? listContractRecords()
          : [];
    const effectiveStatements =
      mappedStatements.length > 0
        ? mappedStatements
        : core.degradedMessage
          ? settlementStatements
          : [];

    const hasLiveOrders = core.orders.length > 0;
    const tallies = hasLiveOrders
      ? core.orders.reduce<BankHomeOrderTallies>(
          (sum, order) => {
            sum.total += 1;
            sum[mapHomeOrderBucket(order.status)] += 1;
            return sum;
          },
          {
            total: 0,
            reserved: 0,
            live: 0,
            completed: 0,
            cancelled: 0,
          },
        )
      : core.degradedMessage
        ? ORDER_TALLIES
        : { total: 0, reserved: 0, live: 0, completed: 0, cancelled: 0 };

    const effectiveUsage =
      core.usage.length > 0
        ? core.usage
        : core.degradedMessage
          ? QUOTA_PROGRAMS.filter((p) => p.program !== "all").map((p) => ({
              programId: `prog-${p.program}`,
              programCode:
                p.program === "worldElite" ? "CTB-AIR-WE" : "CTB-AIR-SG",
              period: currentPeriod,
              quotaTotal: p.total,
              quotaRemaining: p.total - p.used,
              tripsConsumed: p.used,
              cardholdersServed: p.used,
            }))
          : [];

    const period =
      core.usage[0]?.period ??
      effectiveStatements[0]?.period ??
      core.contracts[0]?.periodAttainment?.period ??
      currentPeriod;

    return {
      data: {
        period,
        todayLabel,
        orders: effectiveOrders,
        tallies,
        usage: effectiveUsage,
        contracts: effectiveContracts,
        statements: effectiveStatements,
      },
      degradedMessage: core.degradedMessage,
    };
  } catch (error) {
    return {
      data: {
        period: currentPeriod,
        todayLabel,
        orders: bookingList,
        tallies: ORDER_TALLIES,
        usage: [],
        contracts: listContractRecords(),
        statements: settlementStatements,
      },
      degradedMessage:
        error instanceof Error ? error.message : "Failed to load home data.",
    };
  }
}

export function toHomeRole(role: BankConsoleRole): BankRole {
  if (role === "bank_finance") return "finance";
  if (role === "bank_ops_viewer") return "ops";
  return "admin";
}
