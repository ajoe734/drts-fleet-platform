import {
  getReferralTripReceiptPdfServer,
  referralErrorResponse,
} from "../../../../../../lib/embed-booking-api";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;
    const document = await getReferralTripReceiptPdfServer(orderId);
    const bytes = Uint8Array.from(
      Buffer.from(document.contentBase64, "base64"),
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `attachment; filename="receipt-${orderId}.pdf"`,
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    return referralErrorResponse(error);
  }
}
