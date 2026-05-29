import { NextRequest, NextResponse } from "next/server";
import { createTenantClient } from "@drts/api-client";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;

  try {
    const body = (await request.json()) as { reason?: string };
    const client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
    const receipt = await client.cancelTenantBooking(
      bookingId,
      body.reason ? { reason: body.reason } : {},
    );
    return NextResponse.json(receipt ?? { ok: true, bookingId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
