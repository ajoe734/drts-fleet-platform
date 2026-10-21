import type {
  SubmitReferralPassengerComplaintCommand,
  ReferralPassengerComplaintRecord,
} from "@drts/contracts";
import type {
  CancelReferralPassengerTripCommand,
  CreateReferralPassengerBookingCommand,
  OwnedOrderRecord,
  ReferralPassengerActiveTripResult,
  ReferralPassengerHistoryItem,
  ReferralPassengerReceipt,
  SubmitReferralPassengerRatingCommand,
  ReferralPassengerQuoteCommand,
  ReferralPassengerFareQuote,
  ReferralFeeStatus,
  ReferralOrderFeeConfirmation,
  AcknowledgeReferralFeesCommand,
  ReferralPassengerRatingResult,
} from "@drts/contracts";
import {
  readActiveReferralSession,
  getReferralIdentityHeaders,
} from "./embed-partner-session";
import { deepCamelize } from "./embed-api";
import { getServerApiBaseUrl } from "./embed-runtime";

export class ReferralBookingApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = "ReferralBookingApiError";
  }
}
export function referralErrorResponse(error: unknown) {
  const e = error as { status?: unknown; code?: unknown };
  const status =
    Number.isInteger(e?.status) &&
    Number(e.status) >= 400 &&
    Number(e.status) <= 599
      ? Number(e.status)
      : 503;
  const code =
    typeof e?.code === "string" && /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(e.code)
      ? e.code
      : "REFERRAL_UPSTREAM_UNAVAILABLE";
  return Response.json(
    {
      ok: false,
      error: { code, message: "無法完成這項操作，請重試或重新驗證。" },
    },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
export async function readReferralBody<T extends object>(
  request: Request,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ReferralBookingApiError(400, "VALIDATION_ERROR");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ReferralBookingApiError(400, "VALIDATION_ERROR");
  return body as T;
}
export function referralResult(data: unknown) {
  return Response.json(
    { ok: true, data },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
async function request<T>(
  path: string,
  method = "GET",
  command?: unknown,
  key?: string,
  allowNull = false,
): Promise<T> {
  const session = await readActiveReferralSession();
  const headers = await getReferralIdentityHeaders(session);
  let response: Response;
  try {
    response = await fetch(
      `${getServerApiBaseUrl()}/api/partner/referral/passenger/${path}`,
      {
        method,
        headers: {
          ...headers,
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(command === undefined ? {} : { body: JSON.stringify(command) }),
        cache: "no-store",
        redirect: "manual",
      },
    );
  } catch {
    throw new ReferralBookingApiError(503, "REFERRAL_UPSTREAM_UNAVAILABLE");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ReferralBookingApiError(
      response.status,
      typeof body?.error?.code === "string"
        ? body.error.code
        : "REFERRAL_UPSTREAM_REQUEST_FAILED",
    );
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !("data" in body) ||
    (body.data === null && !allowNull)
  )
    throw new ReferralBookingApiError(
      502,
      "REFERRAL_UPSTREAM_INVALID_RESPONSE",
    );
  return deepCamelize(body.data) as T;
}
export function submitReferralComplaintServer(
  orderId: string,
  command: SubmitReferralPassengerComplaintCommand,
) {
  return request<ReferralPassengerComplaintRecord>(
    `orders/${encodeURIComponent(orderId)}/complaints`,
    "POST",
    { ...command, orderId },
    command.idempotencyKey,
  );
}
export function listReferralComplaintsServer(orderId: string) {
  return request<{
    orderId: string;
    items: ReferralPassengerComplaintRecord[];
  }>(`orders/${encodeURIComponent(orderId)}/complaints`);
}
export function getReferralComplaintServer(orderId: string, caseNo: string) {
  return request<ReferralPassengerComplaintRecord>(
    `orders/${encodeURIComponent(orderId)}/complaints/${encodeURIComponent(caseNo)}`,
  );
}

export function quoteReferralFareServer(
  command: ReferralPassengerQuoteCommand,
) {
  return request<ReferralPassengerFareQuote>("quote", "POST", command);
}
export function createReferralBookingServer(
  command: CreateReferralPassengerBookingCommand,
) {
  return request<{
    orderId: string;
    bookingId?: string;
    status: string;
    replayed: boolean;
    quote: ReferralPassengerFareQuote;
    confirmedAt: string;
    feeConfirmation: ReferralOrderFeeConfirmation | null;
  }>("bookings", "POST", command, command.idempotencyKey);
}
export function getReferralActiveTripServer() {
  return request<ReferralPassengerActiveTripResult | null>(
    "active",
    "GET",
    undefined,
    undefined,
    true,
  );
}
export function getReferralTripHistoryServer() {
  return request<{ items: ReferralPassengerHistoryItem[] }>("history");
}
export function getReferralTripReceiptPdfServer(orderId: string) {
  return request<import("@drts/contracts").ReferralPassengerReceiptPdfDocument>(
    `orders/${encodeURIComponent(orderId)}/receipt/pdf`,
  );
}
export function getReferralTripReceiptServer(orderId: string) {
  return request<ReferralPassengerReceipt>(
    `orders/${encodeURIComponent(orderId)}/receipt`,
  );
}
export function cancelReferralTripServer(
  orderId: string,
  command: CancelReferralPassengerTripCommand,
) {
  return request<Pick<OwnedOrderRecord, "orderId" | "status" | "cancelledAt">>(
    `orders/${encodeURIComponent(orderId)}/cancel`,
    "POST",
    { ...command, orderId },
  );
}
export function submitReferralTripRatingServer(
  orderId: string,
  command: SubmitReferralPassengerRatingCommand,
) {
  return request<ReferralPassengerRatingResult>(
    `orders/${encodeURIComponent(orderId)}/rating`,
    "POST",
    { ...command, orderId },
  );
}

export function getReferralFeesServer() {
  return request<ReferralFeeStatus>("fees");
}
export function acknowledgeReferralFeesServer(
  command: AcknowledgeReferralFeesCommand,
) {
  return request<ReferralFeeStatus>("fees", "POST", command);
}
/** Dev demo only: advance an own trip with the synthetic business test driver. */
export function runReferralDemoTripServer(
  orderId: string,
  action: "assign" | "heartbeat" | "complete",
) {
  return request<{
    orderId: string;
    status: OwnedOrderRecord["status"];
    driverId: string | null;
    simulated: true;
  }>(`orders/${encodeURIComponent(orderId)}/demo-trip/${action}`, "POST", {});
}
