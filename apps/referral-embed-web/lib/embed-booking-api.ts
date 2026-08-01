import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  BookingRecord,
  CancelOwnedOrderCommand,
  CreateTenantBookingCommand,
  PassengerTripRatingRecord,
  ReferralPassengerBookingAuthorityView,
  ReferralPassengerBookingCreateResult,
  ReferralPassengerBookingHistoryView,
  ReferralPassengerReceiptView,
  ReferralEmbedSession,
  SubmitPassengerTripRatingCommand,
} from "@drts/contracts";

import { getServerApiBaseUrl } from "./embed-runtime";

const API_URL = getServerApiBaseUrl();

function snakeToCamelKey(key: string) {
  return key.replace(/_([a-z0-9])/g, (_match, ch: string) => ch.toUpperCase());
}

function deepCamelize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepCamelize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        snakeToCamelKey(key),
        deepCamelize(val),
      ]),
    );
  }
  return value;
}

export type EmbedBookingAuthorityError = Error & {
  status: number;
  code: string;
  details: Record<string, unknown> | undefined;
  retryable: boolean | undefined;
};

function buildEmbedBookingAuthorityError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  retryable = false,
) {
  const error = new Error(message) as EmbedBookingAuthorityError;
  error.name = "EmbedBookingAuthorityError";
  error.status = status;
  error.code = code;
  error.details = details;
  error.retryable = retryable;
  return error;
}

export function isEmbedBookingAuthorityError(
  error: unknown,
): error is EmbedBookingAuthorityError {
  return (
    error instanceof Error &&
    "status" in error &&
    "code" in error &&
    typeof (error as EmbedBookingAuthorityError).status === "number" &&
    typeof (error as EmbedBookingAuthorityError).code === "string"
  );
}

function buildReferralAuthorityHeaders(
  session: ReferralEmbedSession,
  initHeaders?: HeadersInit,
) {
  const headers = new Headers(initHeaders);
  headers.set("Content-Type", "application/json");
  if (process.env.DRTS_INTERNAL_KEY) {
    headers.set("x-drts-internal-key", process.env.DRTS_INTERNAL_KEY);
  }
  headers.set("x-actor-type", session.identity.actorType);
  headers.set("x-actor-id", session.identity.actorId);
  headers.set("x-realm", session.identity.realm);
  headers.set("x-auth-mode", session.identity.authMode);
  headers.set("x-role-families", session.identity.roleFamilies.join(","));
  headers.set("x-roles", session.identity.roles.join(","));
  headers.set("x-scopes", session.identity.scopes.join(","));
  if (session.identity.tenantId) {
    headers.set("x-tenant-id", session.identity.tenantId);
  }
  if (session.identity.partnerId) {
    headers.set("x-partner-id", session.identity.partnerId);
  }
  if (session.identity.partnerProgramId) {
    headers.set("x-partner-program-id", session.identity.partnerProgramId);
  }
  headers.set("x-partner-entry-slug", session.identity.partnerEntrySlug);
  return headers;
}

async function requestReferralBookingAuthority<T>(
  session: ReferralEmbedSession,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: buildReferralAuthorityHeaders(session, init?.headers),
    });
  } catch (error) {
    throw buildEmbedBookingAuthorityError(
      503,
      "EMBED_BOOKING_AUTHORITY_UNAVAILABLE",
      error instanceof Error
        ? error.message
        : "Referral booking authority is unavailable.",
      undefined,
      true,
    );
  }

  let payload: ApiSuccessEnvelope<T> | ApiErrorEnvelope | null = null;
  try {
    payload = (await response.json()) as
      | ApiSuccessEnvelope<T>
      | ApiErrorEnvelope;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const envelope = payload as ApiErrorEnvelope | null;
    throw buildEmbedBookingAuthorityError(
      response.status,
      envelope?.error?.code ?? "EMBED_BOOKING_AUTHORITY_REQUEST_FAILED",
      envelope?.error?.message ??
        `Referral booking authority request failed with ${response.status}.`,
      envelope?.error?.details,
      envelope?.error?.retryable ?? false,
    );
  }

  const envelope = payload as ApiSuccessEnvelope<T> | null;
  if (!envelope?.data) {
    throw buildEmbedBookingAuthorityError(
      502,
      "EMBED_BOOKING_AUTHORITY_EMPTY_RESPONSE",
      "Referral booking authority returned an empty response.",
    );
  }

  return deepCamelize(envelope.data) as T;
}

export async function createReferralPassengerBooking(
  session: ReferralEmbedSession,
  command: CreateTenantBookingCommand,
  options?: { idempotencyKey?: string | null },
) {
  return requestReferralBookingAuthority<ReferralPassengerBookingCreateResult>(
    session,
    "/api/partner/bookings",
    {
      method: "POST",
      body: JSON.stringify(command),
      ...(options?.idempotencyKey && options.idempotencyKey.trim()
        ? {
            headers: {
              "Idempotency-Key": options.idempotencyKey.trim(),
            },
          }
        : {}),
    },
  );
}

export async function getReferralPassengerActiveBooking(
  session: ReferralEmbedSession,
) {
  return requestReferralBookingAuthority<ReferralPassengerBookingAuthorityView | null>(
    session,
    "/api/partner/bookings/active",
  );
}

export async function listReferralPassengerBookingHistory(
  session: ReferralEmbedSession,
) {
  return requestReferralBookingAuthority<ReferralPassengerBookingHistoryView>(
    session,
    "/api/partner/bookings/history",
  );
}

export async function getReferralPassengerBooking(
  session: ReferralEmbedSession,
  bookingId: string,
) {
  return requestReferralBookingAuthority<BookingRecord>(
    session,
    `/api/partner/bookings/${encodeURIComponent(bookingId)}`,
  );
}

export async function getReferralPassengerReceipt(
  session: ReferralEmbedSession,
  bookingId: string,
) {
  return requestReferralBookingAuthority<ReferralPassengerReceiptView>(
    session,
    `/api/partner/bookings/${encodeURIComponent(bookingId)}/receipt`,
  );
}

export async function cancelReferralPassengerBooking(
  session: ReferralEmbedSession,
  bookingId: string,
  command: CancelOwnedOrderCommand,
) {
  return requestReferralBookingAuthority<ReferralPassengerBookingAuthorityView>(
    session,
    `/api/partner/bookings/${encodeURIComponent(bookingId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify(command),
    },
  );
}

export async function submitReferralPassengerRating(
  session: ReferralEmbedSession,
  bookingId: string,
  command: SubmitPassengerTripRatingCommand,
) {
  return requestReferralBookingAuthority<PassengerTripRatingRecord>(
    session,
    `/api/partner/bookings/${encodeURIComponent(bookingId)}/rating`,
    {
      method: "POST",
      body: JSON.stringify(command),
    },
  );
}
