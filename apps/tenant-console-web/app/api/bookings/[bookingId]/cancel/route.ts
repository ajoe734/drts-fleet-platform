import { NextRequest, NextResponse } from "next/server";
import { getTenantClientForRouteHandler } from "@/lib/api-client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;

  try {
    const client = await getTenantClientForRouteHandler();
    if (!client) {
      return NextResponse.json(
        {
          error: "AUTHENTICATION_REQUIRED",
          message: "Active tenant session required.",
        },
        { status: 401 },
      );
    }

    const body = (await request.json()) as { reason?: string };
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
