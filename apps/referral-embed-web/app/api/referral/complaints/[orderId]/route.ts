import {
  readReferralBody,
  referralErrorResponse,
  referralResult,
  submitReferralComplaintServer,
  listReferralComplaintsServer,
} from "../../../../../lib/embed-booking-api";
import type { SubmitReferralPassengerComplaintCommand } from "@drts/contracts";
type RouteContext = { params: Promise<{ orderId: string }> };
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orderId } = await context.params;
    return referralResult(await listReferralComplaintsServer(orderId));
  } catch (error) {
    return referralErrorResponse(error);
  }
}
export async function POST(request: Request, context: RouteContext) {
  try {
    const { orderId } = await context.params;
    const body =
      await readReferralBody<SubmitReferralPassengerComplaintCommand>(request);
    if (body.orderId !== orderId)
      return Response.json(
        {
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "申訴行程不一致" },
        },
        { status: 400 },
      );
    return referralResult(await submitReferralComplaintServer(orderId, body));
  } catch (error) {
    return referralErrorResponse(error);
  }
}
