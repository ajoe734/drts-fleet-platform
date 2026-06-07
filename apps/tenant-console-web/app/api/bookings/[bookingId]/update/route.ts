import { NextRequest, NextResponse } from "next/server";
import type { UpdateTenantBookingCommand } from "@drts/contracts";
import { createTenantClient } from "@drts/api-client";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";
import { formatTenantUiError, toTenantErrorMessage } from "@/lib/error-copy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;

  try {
    const body = (await request.json()) as UpdateTenantBookingCommand;
    const client = createTenantClient(API_URL, DEMO_TENANT_ID, DEMO_ACTOR_ID);
    const receipt = await client.updateTenantBooking(bookingId, body);
    return NextResponse.json(receipt ?? { ok: true, bookingId });
  } catch (error) {
    return NextResponse.json(
      {
        error: formatTenantUiError(
          toTenantErrorMessage(error, "更新叫車失敗。"),
          "更新叫車失敗",
        ),
      },
      { status: 500 },
    );
  }
}
