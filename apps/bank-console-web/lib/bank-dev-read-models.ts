import "server-only";

import type {
  AuditLogRecord,
  IssuerContractStatusRecord,
  OwnedOrderRecord,
  TenantProgramUsageRecord,
  TenantServiceProgramRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";

import { bankApiGet, bankApiGetList } from "@/lib/server-bank-api";
import type {
  BookingDetailRecord,
  BookingDirection,
  BookingListItem,
  BookingProgram,
  BookingState,
  BookingTimelineEvent,
} from "@/lib/bookings";
import type { BankRole } from "@/lib/home-data";
import type { StatementStatus } from "@/lib/statements";
import type { BankConsoleRole } from "@/lib/session";

type SettlementStatementRecord = {
  statementId: string;
  tenantId: string;
  period: string;
  status: StatementStatus;
  lines: Array<{
    tripId: string;
    completedAt: string;
    fare: { amountMinor: number; currency: string };
    subsidisedAmount: { amountMinor: number; currency: string };
    paidAmount: { amountMinor: number; currency: string };
    benefitReference: string;
    issuerAuthorizationRef: string;
    cardholderRefMasked: string;
  }>;
  totals: {
    tripCount: number;
    fareTotal: { amountMinor: number; currency: string };
    subsidisedTotal: { amountMinor: number; currency: string };
    paidTotal: { amountMinor: number; currency: string };
    issuerPayable: { amountMinor: number; currency: string };
  };
  artifactRef: {
    artifactId: string;
    kind: "settlement_statement";
    manifestHash: string;
  };
  generatedAt: string;
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

function moneyToNumber(value?: { amountMinor: number } | null) {
  return (value?.amountMinor ?? 0) / 100;
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

function formatPeriodDate(period: string, end = false) {
  const [yearPart, monthPart] = period.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const date = new Date(Date.UTC(year, month - 1, end ? 28 : 1));
  if (end) {
    date.setUTCMonth(month);
    date.setUTCDate(0);
  }
  return date.toISOString();
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

  if (order.approvalState === "approved" || order.approvalState === "not_required") {
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
  if (record.moduleName.includes("tenant") || record.moduleName.includes("eligibility")) {
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
  const [programs, usage, orders, contracts, statements, users, audit] =
    await Promise.all([
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
      bankApiGetList<SettlementStatementRecord>(
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

  return {
    programs,
    usage,
    orders,
    contracts,
    statements,
    users: Array.isArray(users) ? users : users.items,
    audit,
  };
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
    const { programs, usage, orders } = await loadCoreBankData(tenantId, role);
    const programNameMap = buildProgramNameMap(programs, usage);
    const bookings = orders.map((order) => mapBookingListItem(order, programNameMap));
    const detailById = new Map(
      orders.map((order) => [
        order.orderId,
        mapBookingDetail(order, programNameMap),
      ]),
    );
    const periods = [
      ...new Set(
        orders.map((order) =>
          (order.reservationWindowStart ?? order.createdAt).slice(0, 7),
        ),
      ),
    ].sort((left, right) => right.localeCompare(left));

    return {
      data: {
        bookings,
        programs: mapBookingPrograms(programs),
        periods,
        detailById,
      },
      degradedMessage: null,
    };
  } catch (error) {
    return {
      data: { bookings: [], programs: [], periods: [], detailById: new Map() },
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
    const { contracts } = await loadCoreBankData(tenantId, role);
    return { data: { contracts }, degradedMessage: null };
  } catch (error) {
    return {
      data: { contracts: [] },
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
    const { statements, usage } = await loadCoreBankData(tenantId, role);
    const defaultProgramLabel =
      usage[0]?.programCode ?? "Airport transfer settlement";
    return {
      data: {
        statements: statements.map((statement) => ({
          period: statement.period,
          statementNo: statement.statementId,
          programLabel: defaultProgramLabel,
          issuedAt: statement.generatedAt,
          dueAt: formatPeriodDate(statement.period, true),
          status: statement.status,
          totalFareAmount: moneyToNumber(statement.totals.fareTotal),
          totalSubsidisedAmount: moneyToNumber(statement.totals.subsidisedTotal),
          totalPaidAmount: moneyToNumber(statement.totals.paidTotal),
          totalIssuerPayableAmount: moneyToNumber(statement.totals.issuerPayable),
          totalTrips: statement.totals.tripCount,
          artifactExpired: statement.status === "due",
          trips: statement.lines.map((line) => ({
            tripId: line.tripId,
            tripDate: line.completedAt,
            orderNo: line.tripId,
            routeLabel: "依 API trip readback",
            fareAmount: moneyToNumber(line.fare),
            subsidisedAmount: moneyToNumber(line.subsidisedAmount),
            paidAmount: moneyToNumber(line.paidAmount),
            benefitReferenceMasked: maskSegmented(line.benefitReference),
            cardholderReferenceMasked: maskCompact(line.cardholderRefMasked),
            cardReferenceMasked: "••••",
            disputed: false,
          })),
        })),
      },
      degradedMessage: null,
    };
  } catch (error) {
    return {
      data: { statements: [] },
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
    const { programs, usage, contracts } = await loadCoreBankData(tenantId, role);
    const exceptionCount = contracts.reduce(
      (sum, contract) => sum + contract.exceptions.filter((item) => item.status === "open").length,
      0,
    );
    const byId = new Map(programs.map((program) => [program.programId, program]));
    return {
      data: {
        programs: usage.map((record) => ({
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
      degradedMessage: null,
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
    const { users } = await loadCoreBankData(tenantId, role);
    return {
      data: {
        users: users.map((user) => ({
          name: user.displayName,
          email: user.email,
          role: mapUserRole(user.roleCode),
          status: user.status,
          lastActivity: formatLastActivity(user.updatedAt),
        })),
      },
      degradedMessage: null,
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
    const { audit } = await loadCoreBankData(tenantId, role);
    return {
      data: {
        records: audit.map((record) => ({
          id: record.auditId,
          timestamp: record.createdAt,
          period: record.createdAt.slice(0, 7),
          type: mapAuditType(record),
          actor: mapAuditActor(record),
          actorHandle: record.actorId ?? "system",
          subjectMasked: maskCompact(record.resourceId ?? record.requestId),
          reasonCode: mapAuditReason(record),
          summary: `${record.moduleName}.${record.actionName}`,
          relatedEntity: mapAuditEntity(record),
        })),
      },
      degradedMessage: null,
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
  try {
    const [{ data: bookingData }, { data: statementData }, { data: contractData }, core] =
      await Promise.all([
        loadBankBookingsData(tenantId, role),
        loadBankStatementsData(tenantId, role),
        loadBankContractsData(tenantId, role),
        loadCoreBankData(tenantId, role),
      ]);
    const now = new Date();
    return {
      data: {
        period: core.usage[0]?.period ?? now.toISOString().slice(0, 7),
        todayLabel: now.toISOString().slice(0, 10),
        orders: bookingData.bookings,
        tallies: core.orders.reduce<BankHomeOrderTallies>(
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
        ),
        usage: core.usage,
        contracts: contractData.contracts,
        statements: statementData.statements,
      },
      degradedMessage: null,
    };
  } catch (error) {
    const now = new Date();
    return {
      data: {
        period: now.toISOString().slice(0, 7),
        todayLabel: now.toISOString().slice(0, 10),
        orders: [],
        tallies: {
          total: 0,
          reserved: 0,
          live: 0,
          completed: 0,
          cancelled: 0,
        },
        usage: [],
        contracts: [],
        statements: [],
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
