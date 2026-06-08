import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type {
  ActionReceipt,
  AuditLogRecord,
  CreateTenantBookingCommand,
  CrossAppResourceLink,
} from "@drts/contracts";
import { createTenantClient } from "@drts/api-client";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";

type TenantBookingCommandResponse = {
  bookingId: string;
  orderId: string;
  status: string;
  businessDispatchSubtype: string;
  dispatchSemantics: string;
  serviceBucket: string;
};

function buildCrossAppLinks(
  bookingId: string,
  requestId: string,
): CrossAppResourceLink[] {
  return [
    {
      targetApp: "ops-console",
      route: `/bookings?bookingId=${encodeURIComponent(bookingId)}`,
      resourceType: "booking",
      resourceId: bookingId,
      openMode: "new_tab",
      label: "Open ops booking board",
    },
    {
      targetApp: "platform-admin",
      route: `/audit?requestId=${encodeURIComponent(requestId)}`,
      resourceType: "audit_log",
      resourceId: requestId,
      openMode: "new_tab",
      label: "Open platform audit view",
    },
  ];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTenantBookingCommand;
    const client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
    const requestId = randomUUID();
    const booking = await client.post<TenantBookingCommandResponse>(
      "/api/tenant/bookings",
      {
        body,
        headers: {
          "X-Request-Id": requestId,
          "Idempotency-Key": randomUUID(),
        },
      },
    );

    if (!booking?.bookingId) {
      return NextResponse.json(
        { error: "Backend did not return a booking identifier." },
        { status: 502 },
      );
    }

    let auditEntry: AuditLogRecord | null = null;
    try {
      const auditResponse = await client.get<{ items: AuditLogRecord[] }>(
        "/api/tenant/audit",
        {
          headers: {
            "X-Request-Id": requestId,
          },
        },
      );
      auditEntry =
        auditResponse.items.find(
          (entry) =>
            entry.requestId === requestId &&
            entry.resourceType === "booking" &&
            entry.resourceId === booking.bookingId,
        ) ?? null;
    } catch {
      auditEntry = null;
    }

    const receiptStatus: ActionReceipt["status"] =
      booking.status === "accepted" ? "accepted" : "completed";
    const receipt: ActionReceipt = {
      actionId: requestId,
      auditId: auditEntry?.auditId ?? requestId,
      resourceType: "booking",
      resourceId: booking.bookingId,
      status: receiptStatus,
      message:
        receiptStatus === "accepted"
          ? "Booking command accepted. External confirmation is still pending."
          : "Booking created. Review approval and dispatch status on the detail page.",
    };

    return NextResponse.json({
      ok: true,
      booking: {
        bookingId: booking.bookingId,
        status: booking.status,
      },
      receipt,
      auditHref: auditEntry
        ? `/audit?auditId=${encodeURIComponent(auditEntry.auditId)}`
        : null,
      crossAppLinks: buildCrossAppLinks(booking.bookingId, requestId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Booking create rejected by backend.",
      },
      { status: 502 },
    );
  }
}
