import { NextResponse } from "next/server";
import type { ReferralEmbedSession } from "@drts/contracts";

import {
  consumeReferralEmbedHandoffArtifact,
  getPartnerEntry,
  isEmbedAuthorityError,
  recordReferralEmbedConsent,
} from "../../../../lib/embed-api";
import {
  buildReferralEmbedConsentCommand,
  clearReferralEmbedSession,
  writeReferralEmbedSession,
} from "../../../../lib/embed-partner-session";

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
    }
  | {
      action: "demo-bootstrap";
      entrySlug: string;
      entryHost: string;
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

  if (action === "demo-bootstrap") {
    return {
      action,
      entrySlug: String(formData.get("entrySlug") || ""),
      entryHost: String(formData.get("entryHost") || ""),
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

async function buildDemoSession(
  entrySlug: string,
  entryHost: string,
): Promise<ReferralEmbedSession> {
  if (process.env.REFERRAL_EMBED_DEMO !== "true") {
    throw new Error("DEMO_BOOTSTRAP_DISABLED");
  }

  const entry = await getPartnerEntry(entrySlug);
  const now = new Date().toISOString();
  const partnerId = entry.partnerId;
  const tenantId = entry.tenantId;
  const partnerProgramId = entry.programId;
  const drtsPassengerId = `referral-demo-${entrySlug}`;

  return {
    handoffId: `handoff-demo-${entrySlug}`,
    partnerEntrySlug: entry.entrySlug,
    entryHost,
    drtsPassengerId,
    identityActive: true,
    consent: {
      requiredScopes: ["trip.manage", "pii.trip", "identity.bind"],
      bundleVersion: "referral-embed-demo-consent-v1-2026-08-08",
      grantedAt: now,
    },
    identity: {
      actorType: "referral_passenger",
      actorId: drtsPassengerId,
      realm: "partner",
      authMode: "jwt_bearer",
      roleFamilies: ["partner"],
      roles: ["referral_passenger"],
      scopes: ["trip.manage", "pii.trip", "identity.bind"],
      tenantId,
      partnerId,
      partnerProgramId,
      partnerEntrySlug: entry.entrySlug,
      drtsPassengerId,
    },
  };
}

export async function POST(request: Request) {
  try {
    const action = await parseAction(request);
    if (action.action === "demo-bootstrap") {
      const session = await buildDemoSession(action.entrySlug, action.entryHost);
      await writeReferralEmbedSession(session);
      return jsonResponse({ ok: true, session });
    }

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "exchange";
  const artifact =
    url.searchParams.get("artifact") || url.searchParams.get("token") || "";
  const entrySlug = url.searchParams.get("entrySlug") || "";
  const entryHost = url.searchParams.get("entryHost") || "";
  const returnTo =
    url.searchParams.get("returnTo") ||
    (entrySlug ? `/embed/${encodeURIComponent(entrySlug)}` : "/");

  if (action === "exchange" && artifact && entrySlug) {
    try {
      const session = await consumeReferralEmbedHandoffArtifact({
        artifact,
        entrySlug,
        entryHost,
      });
      await writeReferralEmbedSession(session);

      const dest = new URL(returnTo, request.url);
      if (!session.identityActive) {
        dest.searchParams.set("state", "consent");
      } else {
        dest.searchParams.set("state", "handoff");
        if (!dest.searchParams.has("screen")) {
          dest.searchParams.set("screen", "book");
        }
      }
      return NextResponse.redirect(dest);
    } catch (error) {
      await clearReferralEmbedSession();
      const code = isEmbedAuthorityError(error) ? error.code : "";
      const dest = new URL(returnTo, request.url);
      if (code === "REFERRAL_HANDOFF_EXPIRED") {
        dest.searchParams.set("state", "reauth");
        dest.searchParams.set("issue", "expired");
      } else if (code === "REFERRAL_HANDOFF_REPLAYED") {
        dest.searchParams.set("state", "reauth");
        dest.searchParams.set("issue", "replayed");
      } else if (code === "REFERRAL_HANDOFF_HOST_MISMATCH") {
        dest.searchParams.set("state", "unsupported");
        dest.searchParams.set("issue", "wrong_host");
      } else {
        dest.searchParams.set("state", "fallback");
        dest.searchParams.set("issue", "invalid_artifact");
      }
      return NextResponse.redirect(dest);
    }
  }

  return NextResponse.redirect(new URL("/", request.url));
}
