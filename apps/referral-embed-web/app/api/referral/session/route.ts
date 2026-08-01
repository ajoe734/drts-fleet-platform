import { NextResponse } from "next/server";

import {
  consumeReferralEmbedHandoffArtifact,
  recordReferralEmbedConsent,
} from "@/lib/embed-api";
import {
  buildReferralEmbedConsentCommand,
  clearReferralEmbedSession,
  writeReferralEmbedSession,
} from "@/lib/embed-partner-session";

type SessionAction =
  | {
      action: "exchange";
      artifact: string;
      entrySlug: string;
      entryHost: string;
      returnTo?: string | undefined;
    }
  | {
      action: "grant-consent";
      handoffId: string;
      entrySlug: string;
      entryHost: string;
      returnTo?: string | undefined;
    };

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function redirectResponse(request: Request, returnTo: string | undefined) {
  const url = new URL(returnTo || "/", request.url);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

async function parseAction(request: Request): Promise<SessionAction> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as SessionAction;
  }

  const formData = await request.formData();
  const action = String(formData.get("action") || "");
  if (action === "grant-consent") {
    return {
      action,
      handoffId: String(formData.get("handoffId") || ""),
      entrySlug: String(formData.get("entrySlug") || ""),
      entryHost: String(formData.get("entryHost") || ""),
      returnTo: String(formData.get("returnTo") || "") || undefined,
    };
  }

  return {
    action: "exchange",
    artifact: String(formData.get("artifact") || ""),
    entrySlug: String(formData.get("entrySlug") || ""),
    entryHost: String(formData.get("entryHost") || ""),
    returnTo: String(formData.get("returnTo") || "") || undefined,
  };
}

export async function POST(request: Request) {
  try {
    const action = await parseAction(request);
    if (action.action === "grant-consent") {
      const session = await recordReferralEmbedConsent(
        buildReferralEmbedConsentCommand({
          handoffId: action.handoffId,
          entrySlug: action.entrySlug,
          entryHost: action.entryHost,
          actorIp: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        }),
      );
      await writeReferralEmbedSession(session);
      if (
        request.headers.get("content-type")?.toLowerCase().includes(
          "application/json",
        )
      ) {
        return jsonResponse({ ok: true, session });
      }
      return redirectResponse(request, action.returnTo);
    }

    const session = await consumeReferralEmbedHandoffArtifact({
      artifact: action.artifact,
      entrySlug: action.entrySlug,
      entryHost: action.entryHost,
    });
    await writeReferralEmbedSession(session);
    if (
      request.headers.get("content-type")?.toLowerCase().includes(
        "application/json",
      )
    ) {
      return jsonResponse({ ok: true, session });
    }
    return redirectResponse(request, action.returnTo);
  } catch (error) {
    await clearReferralEmbedSession();
    const message =
      error instanceof Error ? error.message : "Referral session exchange failed.";
    return jsonResponse({ ok: false, message }, 400);
  }
}
