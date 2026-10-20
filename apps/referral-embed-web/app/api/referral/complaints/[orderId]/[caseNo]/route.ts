import {
  referralErrorResponse,
  referralResult,
  getReferralComplaintServer,
} from "../../../../../../lib/embed-booking-api";
export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string; caseNo: string }> },
) {
  try {
    const { orderId, caseNo } = await context.params;
    return referralResult(await getReferralComplaintServer(orderId, caseNo));
  } catch (error) {
    return referralErrorResponse(error);
  }
}
