/**
 * POST /api/bookings/[orderId]/cancel
 *
 * Cancels a tenant booking by calling the backend API.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantClientForRouteHandler } from "@/lib/api-client";
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId: bookingId } = await params;
  const client = await getTenantClientForRouteHandler();

  if (!client) {
    return NextResponse.json(
      { error: "需要先登入租戶入口。" },
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
      {
        error: formatPortalUiError(
          toPortalErrorMessage(error, "取消訂單失敗。"),
          "無法取消訂單",
        ),
      },
      { status: 500 },
    );
  }
}
