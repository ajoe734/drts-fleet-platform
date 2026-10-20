import { referralErrorResponse } from "../../../../../../lib/embed-booking-api";
import { NextResponse } from "next/server";
import { getReferralTripReceiptServer } from "../../../../../../lib/embed-booking-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const receipt = await getReferralTripReceiptServer(orderId);

    const textContent = [
      "========================================",
      "DRTS MOBILITY TRIP RECORD / 乘車紀錄（非正式稅務憑證）",
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
      receipt.fareBase === null
        ? "Base Fare: not provided by actual fare authority"
        : `Base Fare: NT$ ${receipt.fareBase}`,
      receipt.fareDistance === null
        ? "Distance Fare: not provided by actual fare authority"
        : `Distance Fare: NT$ ${receipt.fareDistance}`,
      receipt.fareTime === null
        ? "Time Fare: not provided by actual fare authority"
        : `Time Fare: NT$ ${receipt.fareTime}`,
      receipt.fareNight === null || receipt.fareNight === undefined
        ? "Night Fare: not provided by actual fare authority"
        : `Night Fare: NT$ ${receipt.fareNight}`,
      `TOTAL FARE: ${receipt.formattedTotal}`,
      `Payment Channel: ${receipt.paymentChannel}`,
      "客服：02-2944-0985；主管機關：1999",
      "========================================",
    ].join("\n");

    return new NextResponse(textContent, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `attachment; filename="receipt-${orderId}.txt"`,
      },
    });
  } catch (error) {
    return referralErrorResponse(error);
  }
}
