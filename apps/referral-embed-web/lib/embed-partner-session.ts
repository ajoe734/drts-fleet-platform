// This module is a server boundary: next/headers and node crypto must never
// be imported by a client component. Public callers receive the explicit DTO.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type {
  RecordReferralEmbedConsentCommand,
  ReferralEmbedSession,
} from "@drts/contracts";
import { REFERRAL_EMBED_REQUIRED_CONSENT_SCOPES } from "@drts/contracts";
import { getGoogleWorkloadIdentityHeader } from "./embed-api";
import { getServerApiBaseUrl } from "./embed-runtime";

const REFERRAL_EMBED_SESSION_COOKIE = "drts_referral_embed_session";
const REFERRAL_EMBED_BEARER_COOKIE = "drts_referral_embed_bearer";
const REFERRAL_EMBED_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const REFERRAL_EMBED_CONSENT_BUNDLE_VERSION =
  "referral-embed-consent-v1-2026-08-01";

export type ServerReferralEmbedSession = ReferralEmbedSession & {
  accessToken?: string;
  tokenType?: "Bearer";
  expiresAt?: string;
  sessionId?: string;
};
export type PublicReferralEmbedSession = Pick<
  ReferralEmbedSession,
  | "handoffId"
  | "partnerEntrySlug"
  | "entryHost"
  | "identityActive"
  | "consent"
  | "navigationContext"
> & { recoveryScope: string };
export type PublicReferralSessionReadback = {
  ok: true;
  session: PublicReferralEmbedSession;
  data: {
    active: true;
    session: PublicReferralEmbedSession;
    identity: {
      actor_id: string;
      subject_alias: string;
      recovery_scope: string;
      actor_type: "referral_passenger";
      realm: "partner";
      roles: ["referral_passenger"];
      partner_entry_slug: string;
      entry_host: string;
      handoff_id: string;
      identity_active: true;
    };
  };
};
type SessionCookie = Omit<ServerReferralEmbedSession, "accessToken"> & {
  issuedAt: string;
  bearerDigest?: string;
};

function authError(message = "An active referral session is required.") {
  return Object.assign(new Error(message), {
    status: 401,
    code: "REFERRAL_SESSION_REQUIRED",
  });
}
function getSessionSecret() {
  const secret =
    process.env.REFERRAL_EMBED_SESSION_SECRET ?? process.env.DRTS_INTERNAL_KEY;
  if (!secret?.trim())
    throw new Error(
      "REFERRAL_EMBED_SESSION_SECRET or DRTS_INTERNAL_KEY is required for referral embed sessions.",
    );
  return secret;
}
function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function sign(body: string) {
  return createHmac("sha256", getSessionSecret())
    .update(body)
    .digest("base64url");
}
function decode(value: string | undefined): SessionCookie | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return null;
  try {
    const session = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionCookie;
    const age = Date.now() - Date.parse(session.issuedAt);
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      age > REFERRAL_EMBED_SESSION_MAX_AGE_SECONDS * 1000 ||
      !session.handoffId ||
      !session.partnerEntrySlug ||
      !session.entryHost ||
      !session.identity ||
      !session.consent
    )
      return null;
    return session;
  } catch {
    return null;
  }
}

/** Untrusted middleware hint only; never establishes authentication. */
export function decodeReferralEmbedSessionHint(
  value: string | undefined,
): { partnerEntrySlug: string; entryHost: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value.split(".")[0] ?? "", "base64url").toString("utf8"),
    ) as Partial<SessionCookie>;
    return typeof parsed.partnerEntrySlug === "string" &&
      typeof parsed.entryHost === "string"
      ? {
          partnerEntrySlug: parsed.partnerEntrySlug,
          entryHost: parsed.entryHost,
        }
      : null;
  } catch {
    return null;
  }
}

export function toPublicReferralEmbedSession(
  session: ServerReferralEmbedSession,
): PublicReferralEmbedSession {
  const owner = [
    session.identity.tenantId,
    session.identity.partnerId,
    session.identity.partnerProgramId,
    session.partnerEntrySlug,
    session.drtsPassengerId,
  ];
  const recoveryScope = createHmac("sha256", getSessionSecret())
    .update("referral-ui-recovery:v1:")
    .update(JSON.stringify(owner))
    .digest("hex");
  return {
    recoveryScope,
    handoffId: session.handoffId,
    partnerEntrySlug: session.partnerEntrySlug,
    entryHost: session.entryHost,
    identityActive: session.identityActive,
    consent: {
      requiredScopes: [...session.consent.requiredScopes],
      bundleVersion: session.consent.bundleVersion,
      grantedAt: session.consent.grantedAt,
    },
    ...(session.navigationContext
      ? {
          navigationContext: {
            orderId: session.navigationContext.orderId,
            screen: session.navigationContext.screen,
          },
        }
      : {}),
  };
}

export async function getReferralEmbedSession(): Promise<ServerReferralEmbedSession | null> {
  const jar = await cookies();
  const session = decode(jar.get(REFERRAL_EMBED_SESSION_COOKIE)?.value);
  if (!session) return null;
  if (!session.identityActive) return session;
  const token = jar.get(REFERRAL_EMBED_BEARER_COOKIE)?.value;
  if (
    !token ||
    !session.bearerDigest ||
    digest(token) !== session.bearerDigest ||
    !session.expiresAt ||
    Date.parse(session.expiresAt) <= Date.now() ||
    !Number.isFinite(Date.parse(session.expiresAt))
  )
    return null;
  return { ...session, accessToken: token };
}

export async function readActiveReferralSession(): Promise<ServerReferralEmbedSession> {
  const session = await getReferralEmbedSession();
  if (
    !session?.identityActive ||
    !session.accessToken ||
    session.tokenType !== "Bearer"
  )
    throw authError();
  return session;
}

async function verifyReferralBearerClaims(session: ServerReferralEmbedSession) {
  if (
    !session.identityActive ||
    !session.accessToken ||
    session.tokenType !== "Bearer" ||
    !session.expiresAt ||
    !Number.isFinite(Date.parse(session.expiresAt)) ||
    Date.parse(session.expiresAt) <= Date.now() ||
    typeof session.drtsPassengerId !== "string" ||
    !session.drtsPassengerId.trim() ||
    typeof session.partnerEntrySlug !== "string" ||
    !session.partnerEntrySlug.trim() ||
    typeof session.entryHost !== "string" ||
    !session.entryHost.trim() ||
    typeof session.handoffId !== "string" ||
    !session.handoffId.trim() ||
    !session.identity ||
    session.identity.actorType !== "referral_passenger" ||
    session.identity.realm !== "partner" ||
    session.identity.actorId !== session.drtsPassengerId ||
    session.identity.drtsPassengerId !== session.drtsPassengerId ||
    session.identity.partnerEntrySlug !== session.partnerEntrySlug ||
    typeof session.identity.tenantId !== "string" ||
    !session.identity.tenantId.trim() ||
    typeof session.identity.partnerId !== "string" ||
    !session.identity.partnerId.trim() ||
    typeof session.identity.partnerProgramId !== "string" ||
    !session.identity.partnerProgramId.trim() ||
    !Array.isArray(session.identity.scopes) ||
    !session.identity.scopes.includes("partner:book") ||
    !session.consent ||
    typeof session.consent.grantedAt !== "string" ||
    !session.consent.grantedAt.trim() ||
    !Array.isArray(session.consent.requiredScopes) ||
    !REFERRAL_EMBED_REQUIRED_CONSENT_SCOPES.every((scope) =>
      session.consent.requiredScopes.includes(scope),
    )
  ) {
    throw authError();
  }
  // The authority's existing GET /api/auth/session verifies the signed JWT,
  // durable session, revocation and entry tokenVersion. Never decode the bearer
  // locally as proof (Cloud Run uses a key ring, not necessarily JWT_SECRET).
  const response = await fetch(`${getServerApiBaseUrl()}/api/auth/session`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(await getGoogleWorkloadIdentityHeader()),
    },
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw authError();
  const envelope: unknown = await response.json().catch(() => null);
  const root = envelope as {
    data?: { active?: unknown; identity?: Record<string, unknown> };
  } | null;
  const identity = root?.data?.identity;
  if (
    root?.data?.active !== true ||
    !identity ||
    identity.auth_mode !== "jwt_bearer" ||
    identity.realm !== "partner" ||
    identity.actor_type !== "referral_passenger" ||
    identity.actor_id !== session.drtsPassengerId ||
    identity.subject !== session.drtsPassengerId ||
    identity.drts_passenger_id !== session.drtsPassengerId ||
    !Array.isArray(identity.roles) ||
    !identity.roles.includes("referral_passenger") ||
    identity.partner_entry_slug !== session.partnerEntrySlug ||
    identity.tenant_id !== session.identity.tenantId ||
    identity.partner_id !== session.identity.partnerId ||
    identity.partner_program_id !== session.identity.partnerProgramId ||
    typeof identity.session_id !== "string" ||
    identity.session_id !== session.sessionId ||
    !Array.isArray(identity.scopes) ||
    !identity.scopes.includes("partner:book") ||
    typeof identity.expires_at !== "string" ||
    !Number.isFinite(Date.parse(identity.expires_at)) ||
    Date.parse(identity.expires_at) <= Date.now()
  )
    throw authError();
}

export async function toPublicReferralEmbedSessionReadback(
  session: ServerReferralEmbedSession,
): Promise<PublicReferralSessionReadback> {
  await verifyReferralBearerClaims(session);
  const publicSession = toPublicReferralEmbedSession(session);
  return {
    ok: true,
    session: publicSession,
    data: {
      active: true,
      session: publicSession,
      identity: {
        actor_id: publicSession.recoveryScope,
        subject_alias: publicSession.recoveryScope,
        recovery_scope: publicSession.recoveryScope,
        actor_type: "referral_passenger",
        realm: "partner",
        roles: ["referral_passenger"],
        partner_entry_slug: publicSession.partnerEntrySlug,
        entry_host: publicSession.entryHost,
        handoff_id: publicSession.handoffId,
        identity_active: true,
      },
    },
  };
}

export async function readPublicReferralEmbedSessionReadback(): Promise<PublicReferralSessionReadback> {
  const session = await readActiveReferralSession();
  return toPublicReferralEmbedSessionReadback(session);
}

export async function getReferralIdentityHeaders(
  session: ServerReferralEmbedSession,
): Promise<Record<string, string>> {
  if (
    !session.identityActive ||
    !session.accessToken ||
    session.tokenType !== "Bearer" ||
    !session.expiresAt ||
    !Number.isFinite(Date.parse(session.expiresAt)) ||
    Date.parse(session.expiresAt) <= Date.now()
  )
    throw authError();
  // Workload proof is transport authentication only. API durable JWT validation
  // is performed for every business call; no identity bootstrap header exists.
  return {
    Authorization: `Bearer ${session.accessToken}`,
    ...(await getGoogleWorkloadIdentityHeader()),
  };
}

export async function writeReferralEmbedSession(
  session: ServerReferralEmbedSession,
) {
  if (
    session.identityActive &&
    (!session.accessToken ||
      session.tokenType !== "Bearer" ||
      !session.expiresAt ||
      !Number.isFinite(Date.parse(session.expiresAt)) ||
      Date.parse(session.expiresAt) <= Date.now())
  )
    throw authError("Canonical referral bearer is missing or expired.");
  const jar = await cookies();
  const { accessToken, ...metadata } = session;
  const payload: SessionCookie = {
    ...metadata,
    issuedAt: new Date().toISOString(),
    ...(accessToken ? { bearerDigest: digest(accessToken) } : {}),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const maxAge = session.identityActive
    ? Math.min(
        REFERRAL_EMBED_SESSION_MAX_AGE_SECONDS,
        Math.floor((Date.parse(session.expiresAt!) - Date.now()) / 1000),
      )
    : REFERRAL_EMBED_SESSION_MAX_AGE_SECONDS;
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
  jar.set(REFERRAL_EMBED_SESSION_COOKIE, `${body}.${sign(body)}`, options);
  if (accessToken) jar.set(REFERRAL_EMBED_BEARER_COOKIE, accessToken, options);
  else jar.delete(REFERRAL_EMBED_BEARER_COOKIE);
}

export async function clearReferralEmbedSession() {
  const jar = await cookies();
  jar.delete(REFERRAL_EMBED_SESSION_COOKIE);
  jar.delete(REFERRAL_EMBED_BEARER_COOKIE);
}

export function buildReferralEmbedConsentCommand(input: {
  handoffId: string;
  entrySlug: string;
  entryHost: string;
  currentDrtsPassengerId: string;
  currentPartnerEntrySlug: string;
  actorIp?: string | null;
  userAgent?: string | null;
}): RecordReferralEmbedConsentCommand {
  return {
    handoffId: input.handoffId,
    entrySlug: input.entrySlug,
    entryHost: input.entryHost,
    currentDrtsPassengerId: input.currentDrtsPassengerId,
    currentPartnerEntrySlug: input.currentPartnerEntrySlug,
    consentBundle: {
      bundleVersion: REFERRAL_EMBED_CONSENT_BUNDLE_VERSION,
      grantedScopes: [...REFERRAL_EMBED_REQUIRED_CONSENT_SCOPES],
      grantedAt: new Date().toISOString(),
      actorIp: input.actorIp ?? null,
      userAgent: input.userAgent ?? null,
    },
  };
}
