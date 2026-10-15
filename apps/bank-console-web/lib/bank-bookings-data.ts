import "server-only";

import { OWNED_ORDER_STATUSES, type OwnedOrderRecord } from "@drts/contracts";
import {
  resolveTenantApiUrl,
  tenantAuthFetch,
} from "@drts/tenant-auth/api-fetch";
import {
  getBankUserIdentity,
  type BankUserIdentity,
} from "./bank-user-identity";
import { normalizeBankUserKeys } from "./users-data";
import {
  deriveBookingPeriods,
  type BookingDetailRecord,
  type BookingProgram,
  type BookingState,
} from "./bookings";

// Only this read projection crosses into the Bank UI. Raw orders, passenger
// identities and financial amounts are never returned to a mounted component.
type BankOrder = Pick<
  OwnedOrderRecord,
  | "orderId"
  | "orderNo"
  | "tenantId"
  | "partnerProgramId"
  | "status"
  | "direction"
  | "pickup"
  | "dropoff"
  | "passenger"
  | "createdAt"
  | "updatedAt"
  | "reservationWindowStart"
  | "flightNo"
  | "terminal"
  | "benefitReference"
  | "issuerAuthorizationRef"
  | "approvalState"
  | "notes"
>;
type Data = {
  bookings: BookingDetailRecord[];
  programs: BookingProgram[];
  periods: string[];
  detailById: Map<string, BookingDetailRecord>;
};
export type BankBookingsData = {
  status: "ready" | "denied" | "unavailable" | "invalid";
  data: Data;
  degradedMessage: string | null;
};
class ReadFailure extends Error {
  constructor(public kind: Exclude<BankBookingsData["status"], "ready">) {
    super(kind);
  }
}
function invalid(): never {
  throw new ReadFailure("invalid");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}
function text(value: unknown): string {
  const result = string(value);
  if (!result.trim()) invalid();
  return result;
}
function nullableText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") invalid();
  return value;
}
function date(value: unknown): string {
  const result = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    invalid();
  return result;
}
function address(value: unknown): BankOrder["pickup"] {
  const row = object(value);
  return {
    address: string(row.address),
    maskedAddress: nullableText(row.maskedAddress),
  };
}
function order(value: unknown, tenantId: string): BankOrder {
  const row = object(value);
  if (row.tenantId !== tenantId) throw new ReadFailure("denied");
  if (
    row.orderDomain !== "owned" ||
    row.serviceBucket !== "business_dispatch" ||
    row.businessDispatchSubtype !== "credit_card_airport_transfer"
  )
    invalid();
  if (!(OWNED_ORDER_STATUSES as readonly unknown[]).includes(row.status))
    invalid();
  if (
    row.direction != null &&
    row.direction !== "pickup" &&
    row.direction !== "dropoff"
  )
    invalid();
  if (
    ![
      "pending",
      "approved",
      "rejected",
      "not_required",
      "blocked",
      "cancelled_by_re_evaluation",
    ].includes(String(row.approvalState))
  )
    invalid();
  const passenger = object(row.passenger);
  return {
    orderId: text(row.orderId),
    orderNo: text(row.orderNo),
    tenantId,
    partnerProgramId: nullableText(row.partnerProgramId),
    status: row.status as BankOrder["status"],
    direction: (row.direction ?? null) as BankOrder["direction"],
    pickup: address(row.pickup),
    dropoff: address(row.dropoff),
    passenger: { name: string(passenger.name), phone: string(passenger.phone) },
    createdAt: date(row.createdAt),
    updatedAt: date(row.updatedAt),
    reservationWindowStart:
      row.reservationWindowStart == null
        ? null
        : date(row.reservationWindowStart),
    flightNo: nullableText(row.flightNo),
    terminal: nullableText(row.terminal),
    benefitReference: nullableText(row.benefitReference),
    issuerAuthorizationRef: nullableText(row.issuerAuthorizationRef),
    approvalState: row.approvalState as BankOrder["approvalState"],
    notes: nullableText(row.notes),
  };
}
async function items(
  identity: BankUserIdentity,
  path: string,
): Promise<unknown[]> {
  const response = await tenantAuthFetch(`${resolveTenantApiUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${identity.accessToken}`,
      "x-tenant-id": identity.tenantId,
    },
  });
  if (!response.ok)
    throw new ReadFailure(
      response.status === 401 || response.status === 403
        ? "denied"
        : "unavailable",
    );
  // Decode snake_case exactly once at the Bank boundary; no SDK/global wire change.
  const envelope = object(
    normalizeBankUserKeys(await response.json().catch(invalid)),
  );
  const data = object(envelope.data);
  if (!Array.isArray(data.items)) invalid();
  return data.items;
}
function mask(value: string | null) {
  const compact = value?.replace(/\s+/g, "") ?? "";
  return compact.length > 4
    ? `${compact.slice(0, 2)}••••${compact.slice(-2)}`
    : "••••";
}
function segmented(value: string | null) {
  const parts = value?.split("-") ?? [];
  return parts.length >= 3 ? `${parts[0]}-••••-${parts.at(-1)}` : mask(value);
}
function state(status: BankOrder["status"]): BookingState {
  if (status === "completed" || status === "cancelled") return status;
  return [
    "driver_accepted",
    "enroute_pickup",
    "arrived_pickup",
    "on_trip",
    "proof_pending",
  ].includes(status)
    ? "en_route"
    : "assigned";
}
function project(
  row: BankOrder,
  names: Map<string, string>,
): BookingDetailRecord {
  const program = row.partnerProgramId ?? "unknown-program";
  const current = state(row.status);
  return {
    orderId: row.orderId,
    orderNo: row.orderNo,
    cardholderRefMasked: mask(
      row.passenger.phone || row.passenger.name || row.orderId,
    ),
    programCode: program,
    programLabel: names.get(program) ?? program,
    direction: row.direction === "pickup" ? "inbound" : "outbound",
    flightNo: row.flightNo ?? "—",
    terminal: row.terminal ?? "—",
    // Preserve the existing owning read policy: prefer the formal masked
    // address, retaining permitted owning CRUD addresses when it is absent.
    pickupLabel: row.pickup.maskedAddress ?? row.pickup.address,
    dropoffLabel: row.dropoff.maskedAddress ?? row.dropoff.address,
    scheduledAt: row.reservationWindowStart ?? row.createdAt,
    state: current,
    benefitReferenceMasked: segmented(row.benefitReference),
    authorizationReferenceMasked: segmented(row.issuerAuthorizationRef),
    flightDelayToleranceLabel: "依 DRTS 即時航班監控為準",
    greetingLabel: row.notes?.includes("greet") ? "是" : "否",
    quotaImpactLabel: row.benefitReference ? "扣 1 趟" : "未扣權益",
    quotaPolicyLabel: "發卡行方案配額依 DRTS/API 當期計算",
    driverReferenceMasked: "DRV-••••",
    vehicleReferenceMasked: "VEH-••••",
    opsLink: { state: "forbidden", href: "/ops/dispatch" },
    timeline: [
      {
        occurredAt: row.createdAt,
        title: "建立預約",
        actor: "system.booking",
        actorRealm: "system",
        detail: "訂單已建立並進入發卡行唯讀視角。",
      },
      ...(["approved", "not_required"].includes(row.approvalState)
        ? [
            {
              occurredAt: row.updatedAt,
              title: "資格審批通過",
              actor: "system.eligibility",
              actorRealm: "system" as const,
              detail: "資格與配額檢查已完成。",
            },
          ]
        : []),
      {
        occurredAt: row.updatedAt,
        title:
          current === "completed"
            ? "已完成"
            : current === "cancelled"
              ? "已取消"
              : current === "en_route"
                ? "行程進行中"
                : "已指派",
        actor: "dispatch.runtime",
        actorRealm: "ops",
        detail: `目前狀態：${row.status}`,
        current: true,
      },
    ],
  };
}
export async function loadBankBookingsData(): Promise<BankBookingsData> {
  try {
    const identity = await getBankUserIdentity();
    if (!identity.scopes.includes("tenant:read"))
      throw new ReadFailure("denied");
    const [rawOrders, rawPrograms] = await Promise.all([
      items(
        identity,
        "/api/tenant/orders?serviceProduct=credit_card_airport_transfer",
      ),
      items(identity, "/api/tenant/service-programs"),
    ]);
    const programs = rawPrograms.map((value) => {
      const row = object(value);
      if (row.tenantId !== identity.tenantId) throw new ReadFailure("denied");
      return { code: text(row.programId), label: text(row.displayName) };
    });
    const names = new Map(
      programs.map((program) => [program.code, program.label]),
    );
    const bookings = rawOrders.map((value) =>
      project(order(value, identity.tenantId), names),
    );
    const detailById = new Map(
      bookings.map((booking) => [booking.orderId, booking]),
    );
    if (detailById.size !== bookings.length || names.size !== programs.length)
      invalid();
    return {
      status: "ready",
      data: {
        bookings,
        programs,
        periods: deriveBookingPeriods(bookings),
        detailById,
      },
      degradedMessage: null,
    };
  } catch (error) {
    const httpStatus =
      error && typeof error === "object" && "status" in error
        ? error.status
        : null;
    const status =
      error instanceof ReadFailure
        ? error.kind
        : httpStatus === 401 || httpStatus === 403
          ? "denied"
          : "unavailable";
    return {
      status,
      data: { bookings: [], programs: [], periods: [], detailById: new Map() },
      degradedMessage:
        status === "denied"
          ? "Booking access denied. / 無權讀取預約。"
          : status === "invalid"
            ? "Invalid booking response. / 預約資料格式錯誤。"
            : "Bookings unavailable. / 暫時無法讀取預約。",
    };
  }
}
