import { NextRequest, NextResponse } from "next/server";
import {
  clearPartnerSession,
  createPartnerSession,
} from "@/lib/partner-session";

type LoginPayload = {
  entrySlug?: unknown;
  apiKey?: unknown;
};

export async function POST(request: NextRequest) {
  let body: LoginPayload;
  try {
    body = (await request.json()) as LoginPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const entrySlug =
    typeof body.entrySlug === "string" ? body.entrySlug.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!entrySlug || !apiKey) {
    return NextResponse.json(
      { error: "Both entrySlug and apiKey are required." },
      { status: 400 },
    );
  }

  try {
    const session = await createPartnerSession({ entrySlug, apiKey });
    return NextResponse.json({
      ok: true,
      partnerEntry: session.partnerEntry,
      identity: session.identity,
      expiresIn: session.expiresIn,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Partner bootstrap rejected.",
      },
      { status: 401 },
    );
  }
}

export async function DELETE() {
  await clearPartnerSession();
  return NextResponse.json({ ok: true });
}
