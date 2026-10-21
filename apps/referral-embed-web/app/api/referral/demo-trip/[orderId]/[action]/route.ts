import {
  readReferralBody,
  referralErrorResponse,
  referralResult,
  runReferralDemoTripServer,
} from "../../../../../../lib/embed-booking-api";

const ACTIONS = new Set(["assign", "complete"]);

function demoTripEnabled() {
  return (
    process.env.REFERRAL_EMBED_DEMO === "true" &&
    ["development", "test"].includes(
      process.env.DRTS_ENV?.trim().toLowerCase() ?? "",
    )
  );
}

/** Dev demo: assign the synthetic test driver to, or complete, an own trip. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string; action: string }> },
) {
  const { orderId, action } = await params;
  if (!demoTripEnabled() || !ACTIONS.has(action))
    return Response.json(
      { ok: false, error: { code: "not_found", message: "Not found." } },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  try {
    await readReferralBody<Record<string, never>>(request);
    return referralResult(
      await runReferralDemoTripServer(orderId, action as "assign" | "complete"),
    );
  } catch (error) {
    return referralErrorResponse(error);
  }
}
