/**
 * POST /api/bookings/[orderId]/cancel
 *
 * Cancels a tenant booking by calling the backend API.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantClientForRouteHandler } from "@/lib/api-client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId: bookingId } = await params;
  const client = await getTenantClientForRouteHandler();

  if (!client) {
    return NextResponse.json(
      { error: "Tenant portal session required." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const reason = body?.reason;
    await client.cancelTenantBooking(bookingId, { reason });

    return NextResponse.json({ success: true, bookingId });
  } catch (error) {
    console.error("Failed to cancel order:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
