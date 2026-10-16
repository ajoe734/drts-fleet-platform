import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  IDENTITY_SESSION_CSRF_COOKIE,
  IDENTITY_SESSION_CSRF_HEADER,
} from "./identity-session-csrf";

// App-local equivalents of tenant-auth's random token, constant-time double
// submit and Origin/validated Referer fallback. MAC the host-only cookie with
// an existing server secret so an attacker-chosen cookie/header pair fails too.
function secret(): string {
  const value =
    process.env.BFF_STATE_SECRET?.trim() ||
    process.env.AUTH_COOKIE_SECRET?.trim() ||
    process.env.DRTS_INTERNAL_KEY?.trim() ||
    process.env.JWT_SECRET?.trim();
  if (!value) throw new Error("Session CSRF signing secret is unavailable.");
  return value;
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function signature(token: string, origin: string): string {
  return createHmac("sha256", secret())
    .update(JSON.stringify(["platform-session-revoke-csrf-v1", origin, token]))
    .digest("base64url");
}

export function verifyIdentitySessionOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")?.trim();
  const expected = new URL(request.url).origin;
  if (origin) return origin === expected;
  const referer = request.headers.get("referer")?.trim();
  if (!referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

function readCookie(request: NextRequest): string | null {
  // Reject ambiguous duplicates rather than let cookie parser ordering choose
  // between a legitimate cookie and an injected one.
  const cookies = (request.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${IDENTITY_SESSION_CSRF_COOKIE}=`));
  if (cookies.length !== 1) return null;
  const cookie = cookies[0]!.slice(IDENTITY_SESSION_CSRF_COOKIE.length + 1);
  const match = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(cookie);
  if (!match) return null;
  const token = match[1]!;
  return equal(match[2]!, signature(token, request.nextUrl.origin))
    ? token
    : null;
}

export function issueIdentitySessionCsrf(request: NextRequest): {
  token: string;
  cookie: string;
} {
  const token = readCookie(request) || randomBytes(32).toString("base64url");
  return {
    token,
    cookie: `${token}.${signature(token, request.nextUrl.origin)}`,
  };
}

export function verifyIdentitySessionCsrf(request: NextRequest): boolean {
  if (!verifyIdentitySessionOrigin(request)) return false;
  const token = readCookie(request);
  const header = request.headers.get(IDENTITY_SESSION_CSRF_HEADER)?.trim();
  return !!token && !!header && equal(token, header);
}
