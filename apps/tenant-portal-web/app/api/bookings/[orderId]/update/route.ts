/**
 * PATCH /api/bookings/[orderId]/update
 *
 * Updates a tenant booking by calling the backend API.
 */

import { NextRequest, NextResponse } from "next/server";
import type { UpdateTenantBookingCommand } from "@drts/contracts";
import { createTenantClient } from "@drts/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const DEMO_TENANT_ID = "tenant-demo-001";
const DEMO_ACTOR_ID = "demo-tenant-user";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId: bookingId } = await params;

  try {
    const body = await request.json();
    const updateCommand: UpdateTenantBookingCommand = body;

    const client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
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
