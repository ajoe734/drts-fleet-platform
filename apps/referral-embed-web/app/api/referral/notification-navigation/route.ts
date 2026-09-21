import { NextResponse } from "next/server";
import {
  consumeReferralEmbedHandoffArtifact,
  getPartnerEntry,
} from "@/lib/embed-api";
import {
  getReferralEmbedSession,
  writeReferralEmbedSession,
} from "@/lib/embed-partner-session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const artifact = url.searchParams.get("artifact");
  const entrySlug = url.searchParams.get("entrySlug");
  if (!artifact || !entrySlug) {
    return NextResponse.json(
      { ok: false, message: "Missing required parameters." },
      { status: 400 },
    );
  }

  try {
    const partnerEntry = await getPartnerEntry(entrySlug);
    const entryHost = partnerEntry.entryHost;
    if (!entryHost) {
      throw new Error("Entry host not configured");
    }

    const existingSession = await getReferralEmbedSession();

    const session = await consumeReferralEmbedHandoffArtifact({
      artifact,
      entrySlug,
      entryHost,
      ...(existingSession?.drtsPassengerId
        ? { currentDrtsPassengerId: existingSession.drtsPassengerId }
        : {}),
      ...(existingSession?.partnerEntrySlug
        ? { currentPartnerEntrySlug: existingSession.partnerEntrySlug }
        : {}),
    });

    await writeReferralEmbedSession(session);

    const redirectUrl = new URL(`/embed/${entrySlug}`, request.url);
    if (session.navigationContext) {
      redirectUrl.searchParams.set("screen", session.navigationContext.screen);
      redirectUrl.searchParams.set(
        "orderId",
        session.navigationContext.orderId,
      );
    }

    const response = NextResponse.redirect(redirectUrl);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch {
    // Never clear the caller's existing session on a failed consume: this
    // endpoint is reachable from any unauthenticated link, so treating
    // failure as a logout signal would let an attacker evict a legitimate
    // session by presenting an invalid/mismatched artifact and then replay a
    // stale one for a different identity. See session/route.ts for the same
    // reasoning; the mismatch check (current*) is the actual boundary.
    return new Response("Notification link is invalid or expired.", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
