import { NextResponse } from "next/server";
import { getReferralTripReceiptServer } from "@/lib/embed-booking-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const receipt = await getReferralTripReceiptServer(orderId);

    const textContent = [
      "========================================",
      "DRTS MOBILITY TRIP RECEIPT / 收據",
      "========================================",
      `Order ID: ${receipt.orderId}`,
      `Order No: ${receipt.orderNo}`,
      `Status: ${receipt.status}`,
      `Date: ${receipt.completedAt ?? "N/A"}`,
      "",
      `Passenger: ${receipt.passengerNameMasked} (${receipt.passengerPhoneMasked})`,
      `Driver: ${receipt.driverName ?? "N/A"}`,
      `Plate Number: ${receipt.plateNumber ?? "N/A"}`,
      `Vehicle Type: ${receipt.vehicleType}`,
      "",
      `Pickup: ${receipt.pickupAddress}`,
      `Dropoff: ${receipt.dropoffAddress}`,
      "",
      "----------------------------------------",
      `Base Fare: NT$ ${receipt.fareBase}`,
      `Distance Fare: NT$ ${receipt.fareDistance}`,
      `Time Fare: NT$ ${receipt.fareTime}`,
      `TOTAL FARE: ${receipt.formattedTotal}`,
      `Payment Channel: ${receipt.paymentChannel}`,
      "========================================",
    ].join("\n");

    return new NextResponse(textContent, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="receipt-${orderId}.txt"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Receipt download failed";
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 400 },
    );
  }
}
