import { NextRequest, NextResponse } from "next/server";
import type { VerifyPartnerEligibilityCommand } from "@drts/contracts";
import { buildPartnerClient, getPartnerSession } from "@/lib/partner-session";

type EligibilityPayload = {
  referenceToken?: unknown;
  cardLast4?: unknown;
  cardholderName?: unknown;
  benefitReference?: unknown;
  flightNo?: unknown;
};

function pickString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: NextRequest) {
  const session = await getPartnerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Partner session expired or missing." },
      { status: 401 },
    );
  }

  let body: EligibilityPayload;
  try {
    body = (await request.json()) as EligibilityPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const command: VerifyPartnerEligibilityCommand = {
    entrySlug: session.partnerEntry.entrySlug,
  };

  const referenceToken = pickString(body.referenceToken);
  const cardLast4 = pickString(body.cardLast4);
  const cardholderName = pickString(body.cardholderName);
  const benefitReference = pickString(body.benefitReference);
  const flightNo = pickString(body.flightNo);

  if (referenceToken) command.referenceToken = referenceToken;
  if (cardLast4) command.cardLast4 = cardLast4;
  if (cardholderName) command.cardholderName = cardholderName;
  if (benefitReference) command.benefitReference = benefitReference;
  if (flightNo) command.flightNo = flightNo;

  try {
    const client = buildPartnerClient(session);
    const verification = await client.verifyPartnerEligibility(command);
    return NextResponse.json({ ok: true, verification });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Eligibility verification failed.",
      },
      { status: 502 },
    );
  }
}
