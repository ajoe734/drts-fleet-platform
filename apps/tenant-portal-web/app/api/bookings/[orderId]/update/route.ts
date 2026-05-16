/**
 * PATCH /api/bookings/[orderId]/update
 *
 * Updates a tenant booking by calling the backend API.
 */

import { NextRequest, NextResponse } from "next/server";
import type { UpdateTenantBookingCommand } from "@drts/contracts";
import { getTenantClientForRouteHandler } from "@/lib/api-client";

export async function PATCH(
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
    const updateCommand: UpdateTenantBookingCommand = body;
    await client.updateTenantBooking(bookingId, updateCommand);

    return NextResponse.json({ success: true, bookingId });
  } catch (error) {
    console.error("Failed to update order:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
