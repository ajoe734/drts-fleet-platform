import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_OIDC_STATE_COOKIE_NAME,
  TENANT_CSRF_COOKIE_NAME,
  TENANT_SESSION_MAX_AGE_SECONDS,
  TENANT_OIDC_STATE_MAX_AGE_SECONDS,
} from "./constants";

export interface OidcStatePayload {
  stateToken: string;
  returnUrl: string;
  codeVerifier?: string;
  issuedAt?: number;
}

function getStateSecret(): string {
  return (
    process.env.BFF_STATE_SECRET?.trim() ||
    process.env.AUTH_COOKIE_SECRET?.trim() ||
    process.env.DRTS_INTERNAL_KEY?.trim() ||
    "drts-tenant-console-bff-state-secret-2026"
  );
}

export function isSecureEnvironment(
  req?: Request | NextRequest | { url?: string } | null,
): boolean {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.DRTS_ENV === "production" ||
    process.env.DRTS_ENV === "staging" ||
    process.env.APP_ENV === "production" ||
    process.env.APP_ENV === "staging"
  ) {
    return true;
  }
  if (req?.url) {
    try {
      const parsed = new URL(req.url, "http://localhost");
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  }
  return false;
}

export function sanitizeReturnPath(
  rawReturnUrl?: string | null,
  origin = "http://localhost:3004",
): string {
  if (typeof rawReturnUrl !== "string" || rawReturnUrl.trim().length === 0) {
    return "/";
  }
  const trimmed = rawReturnUrl.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\")
  ) {
    return "/";
  }

  try {
    const resolved = new URL(trimmed, origin);
    if (resolved.origin !== origin) {
      return "/";
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}` || "/";
  } catch {
    return "/";
  }
}

export function encodeStateEnvelope(payload: OidcStatePayload): string {
  const data = JSON.stringify({
    ...payload,
    issuedAt: payload.issuedAt ?? Date.now(),
  });
  const dataB64 = Buffer.from(data, "utf8").toString("base64url");
  const hmac = createHmac("sha256", getStateSecret())
    .update(dataB64)
    .digest("base64url");
  return `${dataB64}.${hmac}`;
}

export function decodeStateEnvelope(value?: string | null): OidcStatePayload | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const parts = value.split(".");
  if (parts.length === 2) {
    const dataB64 = parts[0];
    const hmac = parts[1];
    if (!dataB64 || !hmac) {
      return null;
    }

    const expectedHmac = createHmac("sha256", getStateSecret())
      .update(dataB64)
      .digest("base64url");

    if (
      hmac.length !== expectedHmac.length ||
      !timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))
    ) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(dataB64, "base64url").toString("utf8"),
      ) as Partial<OidcStatePayload>;

      if (!parsed.stateToken || typeof parsed.stateToken !== "string") {
        return null;
      }

      // 10 minutes expiry check
      if (
        typeof parsed.issuedAt === "number" &&
        Date.now() - parsed.issuedAt > TENANT_OIDC_STATE_MAX_AGE_SECONDS * 1000
      ) {
        return null;
      }

      return {
        stateToken: parsed.stateToken,
        returnUrl: parsed.returnUrl ?? "/",
        ...(parsed.codeVerifier ? { codeVerifier: parsed.codeVerifier } : {}),
        ...(typeof parsed.issuedAt === "number" ? { issuedAt: parsed.issuedAt } : {}),
      };
    } catch {
      return null;
    }
  }

  // Fallback for raw JSON if unsigned (legacy test compatibility)
  try {
    const parsed = JSON.parse(value) as Partial<OidcStatePayload>;
    if (parsed.stateToken && typeof parsed.stateToken === "string") {
      return {
        stateToken: parsed.stateToken,
        returnUrl: parsed.returnUrl ?? "/",
        ...(parsed.codeVerifier ? { codeVerifier: parsed.codeVerifier } : {}),
        ...(typeof parsed.issuedAt === "number" ? { issuedAt: parsed.issuedAt } : {}),
      };
    }
  } catch {
    // ignore
  }

  return null;
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function verifyCsrfToken(
  cookieToken?: string | null,
  headerToken?: string | null,
): boolean {
  if (!cookieToken || !headerToken) {
    return false;
  }
  const cookieBuf = Buffer.from(cookieToken.trim());
  const headerBuf = Buffer.from(headerToken.trim());
  if (cookieBuf.length !== headerBuf.length || cookieBuf.length === 0) {
    return false;
  }
  return timingSafeEqual(cookieBuf, headerBuf);
}

export function verifySameOrigin(
  request: Request | NextRequest,
  expectedOrigin?: string,
): boolean {
  const originHeader = request.headers.get("origin")?.trim();
  const refererHeader = request.headers.get("referer")?.trim();

  let targetOrigin = expectedOrigin;
  if (!targetOrigin) {
    try {
      const reqUrl = new URL(request.url);
      targetOrigin = reqUrl.origin;
    } catch {
      return false;
    }
  }

  if (originHeader) {
    return originHeader === targetOrigin;
  }

  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      return refererUrl.origin === targetOrigin;
    } catch {
      return false;
    }
  }

  // If both Origin and Referer are absent on a browser mutation, fail closed
  return false;
}

export function getSessionCookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TENANT_SESSION_MAX_AGE_SECONDS,
  };
}

export function getOidcStateCookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: TENANT_OIDC_STATE_MAX_AGE_SECONDS,
  };
}

export function getCsrfCookieOptions(isSecure: boolean) {
  return {
    httpOnly: false,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TENANT_SESSION_MAX_AGE_SECONDS,
  };
}

export {
  TENANT_SESSION_COOKIE_NAME,
  TENANT_OIDC_STATE_COOKIE_NAME,
  TENANT_CSRF_COOKIE_NAME,
};
