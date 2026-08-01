import type {
  CancelReferralPassengerTripCommand,
  CreateReferralPassengerBookingCommand,
  ReferralPassengerActiveTripResult,
  ReferralPassengerHistoryItem,
  ReferralPassengerReceipt,
  SubmitReferralPassengerRatingCommand,
} from "@drts/contracts";
import { getReferralEmbedSession } from "./embed-partner-session";
import { getServerApiBaseUrl } from "./embed-runtime";

const API_URL = getServerApiBaseUrl();

function buildIdentityHeaders(
  session: NonNullable<Awaited<ReturnType<typeof getReferralEmbedSession>>>,
) {
  const id = session.identity;
  return {
    "x-actor-type": id.actorType || "referral_passenger",
    "x-actor-id": id.drtsPassengerId || id.actorId,
    "x-realm": id.realm || "partner",
    "x-tenant-id": id.tenantId || "",
    "x-partner-id": id.partnerId || "",
    "x-partner-program-id": id.partnerProgramId || "",
    "x-partner-entry-slug": id.partnerEntrySlug || session.partnerEntrySlug,
    "x-drts-passenger-id": id.drtsPassengerId || session.drtsPassengerId,
    ...(process.env.DRTS_INTERNAL_KEY
      ? { "x-drts-internal-key": process.env.DRTS_INTERNAL_KEY }
      : {}),
  };
}

export async function createReferralBookingServer(
  command: CreateReferralPassengerBookingCommand,
) {
  const session = await getReferralEmbedSession();
  if (!session || !session.identityActive) {
    throw new Error("UNAUTHORIZED: Active referral session required");
  }

  const response = await fetch(
    `${API_URL}/partner/referral/passenger/bookings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildIdentityHeaders(session),
      },
      body: JSON.stringify(command),
      cache: "no-store",
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `Booking failed with ${response.status}`,
    );
  }
  return payload.data;
}

export async function getReferralActiveTripServer(): Promise<ReferralPassengerActiveTripResult> {
  const session = await getReferralEmbedSession();
  if (!session || !session.identityActive) {
    throw new Error("UNAUTHORIZED: Active referral session required");
  }

  const response = await fetch(`${API_URL}/partner/referral/passenger/active`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...buildIdentityHeaders(session),
    },
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Active trip lookup failed with ${response.status}`,
    );
  }
  return payload.data;
}

export async function getReferralTripHistoryServer(): Promise<{
  items: ReferralPassengerHistoryItem[];
}> {
  const session = await getReferralEmbedSession();
  if (!session || !session.identityActive) {
    throw new Error("UNAUTHORIZED: Active referral session required");
  }

  const response = await fetch(
    `${API_URL}/partner/referral/passenger/history`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...buildIdentityHeaders(session),
      },
      cache: "no-store",
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Trip history lookup failed with ${response.status}`,
    );
  }
  return payload.data;
}

export async function getReferralTripReceiptServer(
  orderId: string,
): Promise<ReferralPassengerReceipt> {
  const session = await getReferralEmbedSession();
  if (!session || !session.identityActive) {
    throw new Error("UNAUTHORIZED: Active referral session required");
  }

  const response = await fetch(
    `${API_URL}/partner/referral/passenger/orders/${encodeURIComponent(orderId)}/receipt`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...buildIdentityHeaders(session),
      },
      cache: "no-store",
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Receipt lookup failed with ${response.status}`,
    );
  }
  return payload.data;
}

export async function cancelReferralTripServer(
  orderId: string,
  command: CancelReferralPassengerTripCommand,
) {
  const session = await getReferralEmbedSession();
  if (!session || !session.identityActive) {
    throw new Error("UNAUTHORIZED: Active referral session required");
  }

  const response = await fetch(
    `${API_URL}/partner/referral/passenger/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildIdentityHeaders(session),
      },
      body: JSON.stringify(command),
      cache: "no-store",
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Trip cancellation failed with ${response.status}`,
    );
  }
  return payload.data;
}

export async function submitReferralTripRatingServer(
  orderId: string,
  command: SubmitReferralPassengerRatingCommand,
) {
  const session = await getReferralEmbedSession();
  if (!session || !session.identityActive) {
    throw new Error("UNAUTHORIZED: Active referral session required");
  }

  const response = await fetch(
    `${API_URL}/partner/referral/passenger/orders/${encodeURIComponent(orderId)}/rating`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildIdentityHeaders(session),
      },
      body: JSON.stringify(command),
      cache: "no-store",
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Rating submission failed with ${response.status}`,
    );
  }
  return payload.data;
}
