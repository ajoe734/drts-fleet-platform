import { forwardReviewDriver } from "@drts/control-plane-auth/review-driver-web";
import { applyUpstreamAuth } from "../../../../lib/api-upstream";

export const dynamic = "force-dynamic";

async function forward(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return forwardReviewDriver(request, context, applyUpstreamAuth);
}
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
