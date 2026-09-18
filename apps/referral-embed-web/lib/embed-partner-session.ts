import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import type {
  RecordReferralEmbedConsentCommand,
  ReferralEmbedSession,
} from "@drts/contracts";
import { REFERRAL_EMBED_REQUIRED_CONSENT_SCOPES } from "@drts/contracts";

const REFERRAL_EMBED_SESSION_COOKIE = "drts_referral_embed_session";
const REFERRAL_EMBED_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const REFERRAL_EMBED_CONSENT_BUNDLE_VERSION =
  "referral-embed-consent-v1-2026-08-01";

type ReferralEmbedSessionCookie = ReferralEmbedSession & {
  issuedAt: string;
};

function getSessionSecret() {
  const secret =
    process.env.REFERRAL_EMBED_SESSION_SECRET ?? process.env.DRTS_INTERNAL_KEY;
  if (!secret?.trim()) {
    throw new Error(
      "REFERRAL_EMBED_SESSION_SECRET or DRTS_INTERNAL_KEY is required for referral embed sessions.",
    );
  }
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function encode(payload: ReferralEmbedSessionCookie) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(value: string | undefined): ReferralEmbedSessionCookie | null {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null;
  }
  try {
    return JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as ReferralEmbedSessionCookie;
  } catch {
    return null;
  }
}

export function decodeReferralEmbedSessionHint(value: string | undefined): {
  partnerEntrySlug: string;
  entryHost: string;
} | null {
  if (!value) return null;
  const [body] = value.split(".");
  if (!body) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<ReferralEmbedSessionCookie>;
    if (
      typeof parsed.partnerEntrySlug !== "string" ||
      typeof parsed.entryHost !== "string"
    ) {
      return null;
    }
    return {
      partnerEntrySlug: parsed.partnerEntrySlug,
      entryHost: parsed.entryHost,
    };
  } catch {
    return null;
  }
}

export async function getReferralEmbedSession() {
  const cookieStore = await cookies();
  return decode(cookieStore.get(REFERRAL_EMBED_SESSION_COOKIE)?.value);
}

export async function writeReferralEmbedSession(session: ReferralEmbedSession) {
  const cookieStore = await cookies();
  const payload: ReferralEmbedSessionCookie = {
    ...session,
    issuedAt: new Date().toISOString(),
  };
  cookieStore.set(REFERRAL_EMBED_SESSION_COOKIE, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFERRAL_EMBED_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearReferralEmbedSession() {
  const cookieStore = await cookies();
  cookieStore.delete(REFERRAL_EMBED_SESSION_COOKIE);
}

export function buildReferralEmbedConsentCommand(input: {
  handoffId: string;
  entrySlug: string;
  entryHost: string;
  actorIp?: string | null;
  userAgent?: string | null;
}): RecordReferralEmbedConsentCommand {
  return {
    handoffId: input.handoffId,
    entrySlug: input.entrySlug,
    entryHost: input.entryHost,
    consentBundle: {
      bundleVersion: REFERRAL_EMBED_CONSENT_BUNDLE_VERSION,
      grantedScopes: [...REFERRAL_EMBED_REQUIRED_CONSENT_SCOPES],
      grantedAt: new Date().toISOString(),
      actorIp: input.actorIp ?? null,
      userAgent: input.userAgent ?? null,
    },
  };
}
