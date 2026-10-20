import { NextResponse } from "next/server";
import { resolveReferralRequestUrl } from "../../../../lib/embed-request-origin";

import {
  consumeReferralEmbedHandoffArtifact,
  getPartnerEntry,
  issueReferralEmbedHandoffArtifact,
  isEmbedAuthorityError,
  recordReferralEmbedConsent,
} from "../../../../lib/embed-api";
import {
  buildReferralEmbedConsentCommand,
  getReferralEmbedSession,
  writeReferralEmbedSession,
  toPublicReferralEmbedSession,
  type ServerReferralEmbedSession,
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
  const requestUrl = resolveReferralRequestUrl(
    new URL(request.url),
    request.headers,
  );
  if (!requestUrl) {
    return jsonResponse(
      { ok: false, message: "Cross-origin session request is not allowed." },
      403,
    );
  }
  let targetUrl: URL;
  try {
    targetUrl = new URL(returnTo || "/", requestUrl);
  } catch {
    targetUrl = new URL("/", requestUrl);
  }

  if (targetUrl.origin !== requestUrl.origin) {
    targetUrl = new URL("/", requestUrl);
  }

  const response = NextResponse.redirect(targetUrl);
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
): Promise<ServerReferralEmbedSession> {
  const environment = process.env.DRTS_ENV?.trim().toLowerCase();
  if (
    process.env.REFERRAL_EMBED_DEMO !== "true" ||
    (environment !== "development" && environment !== "test")
  ) {
    throw Object.assign(new Error("DEMO_BOOTSTRAP_DISABLED"), {
      status: 403,
      code: "DEMO_BOOTSTRAP_DISABLED",
    });
  }
  const entry = await getPartnerEntry(entrySlug);
  if (!entry.entryHost || entryHost !== entry.entryHost)
    throw Object.assign(
      new Error("Entry host does not match the current entry."),
      { status: 403 },
    );
  const existing = await getReferralEmbedSession();
  if (existing) {
    if (
      existing.partnerEntrySlug !== entrySlug ||
      existing.entryHost !== entryHost
    )
      throw Object.assign(
        new Error("Existing referral session belongs to another entry."),
        { status: 403 },
      );
    return existing;
  }
  // Existing legal dev bootstrap goes through the normal single-use handoff.
  // Consent is not silently granted by an effect or a query parameter.
  const artifact = await issueReferralEmbedHandoffArtifact({
    entrySlug,
    entryHost,
    partnerUserRef: `referral-demo-${entrySlug}`,
    consentBundle: null,
  });
  return consumeReferralEmbedHandoffArtifact({
    artifact: artifact.artifact,
    entrySlug,
    entryHost,
  });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const requestUrl = resolveReferralRequestUrl(
      new URL(request.url),
      request.headers,
    );
    if (!requestUrl || (origin && origin !== requestUrl.origin))
      return jsonResponse(
        { ok: false, message: "Cross-origin session request is not allowed." },
        403,
      );
    const action = await parseAction(request);
    if (action.action === "demo-bootstrap") {
      const session = await buildDemoSession(
        action.entrySlug,
        action.entryHost,
      );
      await writeReferralEmbedSession(session);
      return jsonResponse({
        ok: true,
        session: toPublicReferralEmbedSession(session),
        ...(!session.identityActive
          ? {
              nextPath: `/embed/${encodeURIComponent(session.partnerEntrySlug)}?state=consent&entryHost=${encodeURIComponent(session.entryHost)}`,
            }
          : {}),
      });
    }

    if (action.action === "grant-consent") {
      const existingSession = await getReferralEmbedSession();
      if (!existingSession || existingSession.handoffId !== action.handoffId) {
        throw new Error("Missing or invalid session for consent grant.");
      }

      const session = await recordReferralEmbedConsent(
        buildReferralEmbedConsentCommand({
          handoffId: action.handoffId,
          entrySlug: action.entrySlug,
          entryHost: action.entryHost,
          currentDrtsPassengerId: existingSession.drtsPassengerId,
          currentPartnerEntrySlug: existingSession.partnerEntrySlug,
          actorIp: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        }),
      );
      await writeReferralEmbedSession(session);
      if (
        request.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("application/json")
      ) {
        return jsonResponse({
          ok: true,
          session: toPublicReferralEmbedSession(session),
          ...(!session.identityActive
            ? {
                nextPath: `/embed/${encodeURIComponent(session.partnerEntrySlug)}?state=consent&entryHost=${encodeURIComponent(session.entryHost)}`,
              }
            : {}),
        });
      }
      return redirectResponse(request, action.returnTo);
    }

    const existingSession = await getReferralEmbedSession();
    const session = await consumeReferralEmbedHandoffArtifact({
      artifact: action.artifact,
      entrySlug: action.entrySlug,
      entryHost: action.entryHost,
      ...(existingSession?.drtsPassengerId
        ? { currentDrtsPassengerId: existingSession.drtsPassengerId }
        : {}),
      ...(existingSession?.partnerEntrySlug
        ? { currentPartnerEntrySlug: existingSession.partnerEntrySlug }
        : {}),
    });
    await writeReferralEmbedSession(session);
    if (
      request.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("application/json")
    ) {
      return jsonResponse({
        ok: true,
        session: toPublicReferralEmbedSession(session),
        ...(!session.identityActive
          ? {
              nextPath: `/embed/${encodeURIComponent(session.partnerEntrySlug)}?state=consent&entryHost=${encodeURIComponent(session.entryHost)}`,
            }
          : {}),
      });
    }
    return redirectResponse(request, action.returnTo);
  } catch (error) {
    // A failed exchange/consent never clears the caller's existing session:
    // this endpoint is unauthenticated (reachable from any link), so treating
    // failure as a signal to log the current browser out would let an
    // attacker force a logout merely by presenting an invalid or mismatched
    // artifact/handoff, ahead of replaying a stale one for a different
    // identity. Reject the request and leave whatever session already exists
    // untouched; the mismatch check above (via current*) is what stops the
    // takeover, not clearing the cookie.
    const message =
      error instanceof Error
        ? error.message
        : "Referral session exchange failed.";
    const status = isEmbedAuthorityError(error)
      ? error.status
      : error instanceof Error &&
          "status" in error &&
          typeof error.status === "number"
        ? error.status
        : 400;
    return jsonResponse(
      {
        ok: false,
        message,
        ...(isEmbedAuthorityError(error) ? { code: error.code } : {}),
      },
      status,
    );
  }
}
