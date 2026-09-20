import { NextResponse } from "next/server";
import { consumeReferralEmbedHandoffArtifact, getPartnerEntry } from "@/lib/embed-api";
import {
  clearReferralEmbedSession,
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
    });

    if (existingSession && existingSession.drtsPassengerId !== session.drtsPassengerId) {
      throw new Error("Session mismatch");
    }

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
    await clearReferralEmbedSession();
    // 錯 entry、其他住戶、撤銷 identity、logout/account switch、expired/replayed handoff、非法 returnTo/open redirect 都 fail closed，回一致不可用避免枚舉；失敗不得建新單。
    return new Response("Notification link is invalid or expired.", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
