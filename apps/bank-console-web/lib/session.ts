import { createHmac, timingSafeEqual } from "crypto";
import {
  verifyIapJwtAssertion,
  type IapJwtPayload,
} from "@drts/control-plane-auth";
import type { BankRole as HomeRole } from "@/lib/home-data";
import {
  BANK_DEMO_TENANTS,
  type BankDemoTenant,
  type BankDemoTenantCode,
} from "@/lib/demo-tenants";
import { t, type Locale, type TranslationKey } from "@/lib/translations";

export type BankConsoleRole =
  | "bank_program_admin"
  | "bank_ops_viewer"
  | "bank_finance";

export const BANK_CONSOLE_ROLE_COOKIE = "drts_bank_console_role";
export const BANK_CONSOLE_SESSION_COOKIE = "drts_bank_console_session";

export const TRUSTED_PROXY_HEADER = "x-trusted-proxy-secret";
export const DEFAULT_TEST_PROXY_SECRET = "drts_bank_trusted_proxy_secret_2026";

function getSessionSecret(): string {
  const envSecret =
    process.env.BANK_SESSION_SECRET || process.env.SESSION_SECRET;
  if (envSecret) {
    return envSecret;
  }
  if (process.env.NODE_ENV !== "production") {
    return "drts_bank_console_test_session_secret_2026_key";
  }

  // Per-instance keys invalidate valid cookies as soon as Cloud Run routes a
  // request to another instance, so production must always use a stable secret.
  throw new Error(
    "BANK_SESSION_SECRET or SESSION_SECRET must be configured in production",
  );
}

export function signSessionRole(
  role: BankConsoleRole,
  bankCode: string = "ctbc",
): string {
  const payload = `${role}:${bankCode}`;
  const hmac = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${hmac}`;
}

export function verifySessionRole(
  token: string | null | undefined,
): { role: BankConsoleRole; bankCode: string } | null {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }
  const lastDotIndex = token.lastIndexOf(".");
  const payload = token.slice(0, lastDotIndex);
  const signature = token.slice(lastDotIndex + 1);

  if (!signature || signature.length !== 64) {
    return null;
  }

  const expectedHmac = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("hex");

  try {
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expectedHmac, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  const [roleStr, bankCode] = payload.split(":");
  const role = resolveBankConsoleRole(roleStr);
  if (!role) {
    return null;
  }
  return { role, bankCode: bankCode || "ctbc" };
}

type ActorProfile = {
  emailLocal: string;
  nameKeys: Record<BankDemoTenantCode, TranslationKey>;
};

const DEFAULT_ROLE: BankConsoleRole = "bank_ops_viewer";

const ROLE_ALIASES: Record<string, BankConsoleRole> = {
  admin: "bank_program_admin",
  bank_program_admin: "bank_program_admin",
  finance: "bank_finance",
  bank_finance: "bank_finance",
  ops: "bank_ops_viewer",
  viewer: "bank_ops_viewer",
  bank_ops_viewer: "bank_ops_viewer",
};

const ACTOR_PROFILES: Record<BankConsoleRole, ActorProfile> = {
  bank_program_admin: {
    emailLocal: "program-admin",
    nameKeys: {
      ctbc: "session.actor.bank_program_admin.ctbc",
      cathay: "session.actor.bank_program_admin.cathay",
      taishin: "session.actor.bank_program_admin.taishin",
      dbs: "session.actor.bank_program_admin.dbs",
      fubon: "session.actor.bank_program_admin.fubon",
    },
  },
  bank_ops_viewer: {
    emailLocal: "ops-viewer",
    nameKeys: {
      ctbc: "session.actor.bank_ops_viewer.ctbc",
      cathay: "session.actor.bank_ops_viewer.cathay",
      taishin: "session.actor.bank_ops_viewer.taishin",
      dbs: "session.actor.bank_ops_viewer.dbs",
      fubon: "session.actor.bank_ops_viewer.fubon",
    },
  },
  bank_finance: {
    emailLocal: "finance",
    nameKeys: {
      ctbc: "session.actor.bank_finance.ctbc",
      cathay: "session.actor.bank_finance.cathay",
      taishin: "session.actor.bank_finance.taishin",
      dbs: "session.actor.bank_finance.dbs",
      fubon: "session.actor.bank_finance.fubon",
    },
  },
};

export function resolveBankConsoleRole(
  value: string | string[] | null | undefined,
): BankConsoleRole | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return null;
  }

  return ROLE_ALIASES[raw] ?? null;
}

export function resolveServerSessionRole(
  cookieRoleValue: string | null | undefined,
  queryRoleValue: string | null | undefined,
): {
  role: BankConsoleRole;
  bankCode?: string | undefined;
  isTampered: boolean;
  isAuthorizedForExport: boolean;
  isForged: boolean;
  isAuthenticated: boolean;
} {
  const verifiedSession = verifySessionRole(cookieRoleValue);
  const isForged = Boolean(cookieRoleValue && !verifiedSession);
  const isAuthenticated = Boolean(verifiedSession);

  const cookieRole = verifiedSession ? verifiedSession.role : null;
  const sessionBankCode = verifiedSession
    ? verifiedSession.bankCode
    : undefined;
  const queryRole = queryRoleValue
    ? resolveBankConsoleRole(queryRoleValue)
    : null;

  let isTampered = false;
  if (queryRoleValue) {
    if (
      !queryRole ||
      (cookieRole && cookieRole !== queryRoleValue && cookieRole !== queryRole)
    ) {
      isTampered = true;
    }
  }

  const role = cookieRole ?? queryRole ?? DEFAULT_ROLE;
  const hasAuthorizedCookie =
    cookieRole === "bank_finance" || cookieRole === "bank_program_admin";
  const isAuthorizedForExport =
    isAuthenticated && !isForged && !isTampered && hasAuthorizedCookie;

  return {
    role,
    bankCode: sessionBankCode,
    isTampered,
    isAuthorizedForExport,
    isForged,
    isAuthenticated,
  };
}

export function toHomeRole(role: BankConsoleRole): HomeRole {
  if (role === "bank_finance") {
    return "finance";
  }
  if (role === "bank_ops_viewer") {
    return "ops";
  }
  return "admin";
}

/** Resolve protected page identity from the signed cookie, never URL defaults. */
export function resolveBankPageSession(
  cookieValue: string | null | undefined,
  requestedBank: string | string[] | null | undefined,
  requestedRole: string | string[] | null | undefined,
): {
  bank: BankDemoTenant;
  role: BankConsoleRole;
  canReadStatements: boolean;
} | null {
  const bankCode = Array.isArray(requestedBank)
    ? requestedBank[0]
    : requestedBank;
  const role = Array.isArray(requestedRole) ? requestedRole[0] : requestedRole;
  const session = resolveServerSessionRole(cookieValue, role);
  if (
    !session.isAuthenticated ||
    session.isForged ||
    session.isTampered ||
    !session.bankCode ||
    !Object.hasOwn(BANK_DEMO_TENANTS, session.bankCode) ||
    (bankCode != null && bankCode !== session.bankCode)
  ) {
    return null;
  }
  return {
    bank: BANK_DEMO_TENANTS[session.bankCode as BankDemoTenantCode],
    role: session.role,
    // HTML uses the same policy already applied to CSV and signed downloads.
    canReadStatements: session.isAuthorizedForExport,
  };
}

export function getBankConsoleSession(
  bank: BankDemoTenant,
  locale: Locale,
  rawRole: string | string[] | null | undefined,
) {
  const role = resolveBankConsoleRole(rawRole) ?? "bank_ops_viewer";
  const profile = ACTOR_PROFILES[role];
  const emailDomain =
    bank.code === "ctbc"
      ? "ctbcbank.com"
      : `${bank.issuerCode.toLowerCase()}.demo`;

  return {
    actorEmail: `${profile.emailLocal}@${emailDomain}`,
    actorName: t(profile.nameKeys[bank.code], locale),
    role,
    roleCode: t(`users.roleCode.${role}`, locale),
    roleLabel: t(`users.role.${role}`, locale),
  };
}

export function deriveBankCodeFromIdentity(
  headerTenant?: string | null,
  email?: string | null,
): BankDemoTenantCode | null {
  if (headerTenant?.trim()) {
    const rawTenant = headerTenant.trim().toLowerCase();
    for (const code of Object.keys(BANK_DEMO_TENANTS) as BankDemoTenantCode[]) {
      if (rawTenant === code || rawTenant.includes(code)) {
        return code;
      }
    }
  }

  if (email?.trim()) {
    const rawEmail = email.trim().toLowerCase();
    if (rawEmail.includes("ctbc")) return "ctbc";
    if (rawEmail.includes("cathay")) return "cathay";
    if (rawEmail.includes("taishin")) return "taishin";
    if (rawEmail.includes("dbs")) return "dbs";
    if (rawEmail.includes("fubon")) return "fubon";
  }

  return null;
}

export function getVerifiedIapPayload(headers: Headers): IapJwtPayload | null {
  const iapAssertion =
    headers.get("x-goog-iap-jwt-assertion") ||
    headers.get("x-iap-jwt-assertion");

  if (!iapAssertion || iapAssertion.trim().length === 0) {
    return null;
  }

  const iapSecretKey =
    process.env.IAP_JWT_SECRET ||
    process.env.BANK_IAP_JWT_SECRET ||
    (process.env.NODE_ENV === "production"
      ? null
      : "drts_bank_test_iap_jwt_secret_key_2026");

  if (!iapSecretKey) {
    return null;
  }

  try {
    const payload = verifyIapJwtAssertion(iapAssertion, {
      jwtSecretOrPublicKey: iapSecretKey,
      expectedAudience:
        process.env.IAP_AUDIENCE || process.env.BANK_IAP_AUDIENCE || undefined,
      expectedIssuer:
        process.env.IAP_ISSUER ||
        process.env.BANK_IAP_ISSUER ||
        "https://cloud.google.com/iap",
    });
    if (payload && payload.sub) {
      return payload;
    }
  } catch {
    return null;
  }

  return null;
}

export function extractIapIdentity(payload: IapJwtPayload): {
  email: string | null;
  bank: BankDemoTenantCode | null;
  role: BankConsoleRole | null;
  hasUnrecognizedRole: boolean;
} {
  const emailCandidate =
    (typeof payload.email === "string" && payload.email) ||
    (typeof payload.authenticated_user_email === "string" &&
      payload.authenticated_user_email) ||
    (typeof payload.sub === "string" && payload.sub.includes("@")
      ? payload.sub
      : null);

  const tenantCandidate =
    (typeof payload.tenant === "string" && payload.tenant) ||
    (typeof payload.bank === "string" && payload.bank) ||
    (typeof payload.gcp_ia_tenant === "string" && payload.gcp_ia_tenant) ||
    null;

  const bank = deriveBankCodeFromIdentity(
    tenantCandidate,
    emailCandidate || payload.sub,
  );

  const rawRoleCandidates: string[] = [];
  const addCandidate = (val: unknown) => {
    if (typeof val === "string" && val.trim()) {
      rawRoleCandidates.push(val.trim());
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string" && item.trim()) {
          rawRoleCandidates.push(item.trim());
        }
      }
    }
  };

  addCandidate(payload.role);
  addCandidate(payload.roles);
  addCandidate(payload.user_role);
  addCandidate(payload.userRoles);
  addCandidate(payload.gcp_ia_role);
  addCandidate(payload.gcp_ia_roles);
  addCandidate(payload.role_claim);
  addCandidate(payload["x-authenticated-role"]);

  let hasUnrecognizedRole = false;
  let role: BankConsoleRole | null = null;

  if (rawRoleCandidates.length > 0) {
    for (const candidate of rawRoleCandidates) {
      const resolved = resolveBankConsoleRole(candidate);
      if (resolved) {
        if (!role) {
          role = resolved;
        }
      } else {
        hasUnrecognizedRole = true;
      }
    }
  }

  if (!role && !hasUnrecognizedRole && emailCandidate) {
    const claimLower = emailCandidate.toLowerCase();
    if (claimLower.includes("finance") || claimLower.includes("bank_finance")) {
      role = "bank_finance";
    } else if (
      claimLower.includes("admin") ||
      claimLower.includes("program-admin") ||
      claimLower.includes("bank_program_admin") ||
      claimLower.includes("programadmin")
    ) {
      role = "bank_program_admin";
    } else if (
      claimLower.includes("ops") ||
      claimLower.includes("viewer") ||
      claimLower.includes("ops-viewer") ||
      claimLower.includes("opsviewer")
    ) {
      role = "bank_ops_viewer";
    }
  }

  return { email: emailCandidate, bank, role, hasUnrecognizedRole };
}

export function isTrustedProxyRequest(headers: Headers): boolean {
  const trustedSecret =
    process.env.TRUSTED_PROXY_SECRET ||
    process.env.BANK_TRUSTED_PROXY_SECRET ||
    (process.env.NODE_ENV === "production" ? null : DEFAULT_TEST_PROXY_SECRET);

  const headerSecret = headers.get(TRUSTED_PROXY_HEADER);
  if (trustedSecret && headerSecret && headerSecret === trustedSecret) {
    return true;
  }

  return getVerifiedIapPayload(headers) !== null;
}

export function verifyAuthenticatedIdentityAndRole(
  requestHeaders: Headers,
  requestedRole: BankConsoleRole,
  requestedBank: string,
): { allowed: boolean; role: BankConsoleRole; bank: string; reason?: string } {
  const iapAssertionHeader =
    requestHeaders.get("x-goog-iap-jwt-assertion") ||
    requestHeaders.get("x-iap-jwt-assertion");

  const iapPayload = iapAssertionHeader
    ? getVerifiedIapPayload(requestHeaders)
    : null;

  const trustedSecret =
    process.env.TRUSTED_PROXY_SECRET ||
    process.env.BANK_TRUSTED_PROXY_SECRET ||
    (process.env.NODE_ENV === "production" ? null : DEFAULT_TEST_PROXY_SECRET);
  const headerSecret = requestHeaders.get(TRUSTED_PROXY_HEADER);
  const isTrustedSecretValid = Boolean(
    trustedSecret && headerSecret && headerSecret === trustedSecret,
  );

  if (iapAssertionHeader && !iapPayload && !isTrustedSecretValid) {
    return {
      allowed: false,
      role: "bank_ops_viewer",
      bank: requestedBank,
      reason:
        "Authentication rejected: invalid or unverified IAP JWT assertion.",
    };
  }

  const isTrusted = isTrustedSecretValid || Boolean(iapPayload);

  const rawSpoofed =
    requestHeaders.get("x-goog-authenticated-user-email") ||
    requestHeaders.get("x-authenticated-user-email") ||
    requestHeaders.get("x-authenticated-user") ||
    requestHeaders.get("x-authenticated-role") ||
    requestHeaders.get("x-authenticated-tenant") ||
    requestHeaders.get("x-authenticated-bank");

  if (!isTrusted) {
    if (rawSpoofed) {
      return {
        allowed: false,
        role: "bank_ops_viewer",
        bank: requestedBank,
        reason:
          "Authentication rejected: spoofed authenticated identity header without trusted proxy or IAP boundary.",
      };
    }

    if (
      requestedRole === "bank_finance" ||
      requestedRole === "bank_program_admin"
    ) {
      return {
        allowed: false,
        role: "bank_ops_viewer",
        bank: requestedBank,
        reason:
          "Authentication rejected: missing trusted proxy or IAP boundary for privileged role session.",
      };
    }

    return { allowed: true, role: "bank_ops_viewer", bank: requestedBank };
  }

  const headerEmail =
    requestHeaders.get("x-goog-authenticated-user-email") ||
    requestHeaders.get("x-authenticated-user-email") ||
    requestHeaders.get("x-authenticated-user");
  const authRoleHeader = requestHeaders.get("x-authenticated-role");
  const authTenantHeader =
    requestHeaders.get("x-authenticated-tenant") ||
    requestHeaders.get("x-authenticated-bank");

  if (authRoleHeader) {
    const headerRole = resolveBankConsoleRole(authRoleHeader);
    if (!headerRole) {
      return {
        allowed: false,
        role: "bank_ops_viewer",
        bank: requestedBank,
        reason: `Authentication rejected: unrecognized role in x-authenticated-role header (${authRoleHeader}).`,
      };
    }
  }

  if (iapPayload) {
    const {
      email: verifiedEmail,
      bank: verifiedBank,
      role: verifiedRole,
      hasUnrecognizedRole,
    } = extractIapIdentity(iapPayload);

    if (hasUnrecognizedRole) {
      return {
        allowed: false,
        role: "bank_ops_viewer",
        bank: requestedBank,
        reason: `Authentication rejected: unrecognized role claim in verified IAP JWT assertion.`,
      };
    }

    if (headerEmail) {
      const trimmedHeaderEmail = headerEmail.trim().toLowerCase();
      const expectedEmail = verifiedEmail
        ? verifiedEmail.trim().toLowerCase()
        : iapPayload.sub.trim().toLowerCase();
      if (trimmedHeaderEmail !== expectedEmail) {
        return {
          allowed: false,
          role: "bank_ops_viewer",
          bank: requestedBank,
          reason: `Authentication rejected: header mismatch between x-authenticated-user-email (${headerEmail}) and verified IAP JWT assertion claim (${verifiedEmail || iapPayload.sub}).`,
        };
      }
    }

    if (authTenantHeader) {
      const headerBank = deriveBankCodeFromIdentity(
        authTenantHeader,
        headerEmail,
      );
      if (
        verifiedBank &&
        headerBank &&
        headerBank.toLowerCase() !== verifiedBank.toLowerCase()
      ) {
        return {
          allowed: false,
          role: "bank_ops_viewer",
          bank: requestedBank,
          reason: `Authentication rejected: header mismatch between x-authenticated-tenant (${authTenantHeader}) and verified IAP JWT assertion tenant (${verifiedBank}).`,
        };
      }
    }

    if (authRoleHeader) {
      const headerRole = resolveBankConsoleRole(authRoleHeader);
      if (!headerRole) {
        return {
          allowed: false,
          role: "bank_ops_viewer",
          bank: requestedBank,
          reason: `Authentication rejected: unrecognized role in x-authenticated-role header (${authRoleHeader}).`,
        };
      }
      if (verifiedRole && headerRole !== verifiedRole) {
        return {
          allowed: false,
          role: "bank_ops_viewer",
          bank: requestedBank,
          reason: `Authentication rejected: header mismatch between x-authenticated-role (${authRoleHeader}) and verified IAP JWT assertion role (${verifiedRole}).`,
        };
      }
    }

    const effectiveBank =
      verifiedBank ||
      deriveBankCodeFromIdentity(authTenantHeader, headerEmail) ||
      requestedBank;
    if (
      effectiveBank &&
      requestedBank &&
      effectiveBank.toLowerCase() !== requestedBank.toLowerCase()
    ) {
      return {
        allowed: false,
        role: requestedRole,
        bank: effectiveBank,
        reason: `Cross-bank tenant claim rejected: authenticated identity bank (${effectiveBank}) does not match requested bank (${requestedBank}).`,
      };
    }

    const effectiveRole =
      verifiedRole ||
      (authRoleHeader ? resolveBankConsoleRole(authRoleHeader) : null);
    if (effectiveRole) {
      if (requestedRole !== effectiveRole) {
        return {
          allowed: false,
          role: effectiveRole,
          bank: effectiveBank,
          reason: `Role escalation rejected: identity claim (${verifiedEmail || iapPayload.sub}) authorizes role ${effectiveRole}, not ${requestedRole}.`,
        };
      }
      return { allowed: true, role: effectiveRole, bank: effectiveBank };
    }

    if (
      requestedRole === "bank_finance" ||
      requestedRole === "bank_program_admin"
    ) {
      return {
        allowed: false,
        role: "bank_ops_viewer",
        bank: effectiveBank,
        reason: `Unauthorised role escalation rejected: self-selected signing for ${requestedRole} requires trusted authenticated identity or claim.`,
      };
    }

    return { allowed: true, role: "bank_ops_viewer", bank: effectiveBank };
  }

  if (!headerEmail && !authRoleHeader && !authTenantHeader) {
    if (isTrustedSecretValid) {
      return { allowed: true, role: requestedRole, bank: requestedBank };
    }
    if (
      requestedRole === "bank_finance" ||
      requestedRole === "bank_program_admin"
    ) {
      return {
        allowed: false,
        role: "bank_ops_viewer",
        bank: requestedBank,
        reason:
          "Authentication rejected: missing trusted IAP or reverse-proxy identity source.",
      };
    }
    return { allowed: true, role: "bank_ops_viewer", bank: requestedBank };
  }

  const derivedBank = deriveBankCodeFromIdentity(authTenantHeader, headerEmail);

  if (
    derivedBank &&
    requestedBank &&
    derivedBank.toLowerCase() !== requestedBank.toLowerCase()
  ) {
    return {
      allowed: false,
      role: requestedRole,
      bank: derivedBank,
      reason: `Cross-bank tenant claim rejected: authenticated identity bank (${derivedBank}) does not match requested bank (${requestedBank}).`,
    };
  }

  const effectiveBank = derivedBank || requestedBank;

  if (authRoleHeader) {
    const resolvedAuthRole = resolveBankConsoleRole(authRoleHeader);
    if (!resolvedAuthRole) {
      return {
        allowed: false,
        role: "bank_ops_viewer",
        bank: effectiveBank,
        reason: `Authentication rejected: unrecognized role in x-authenticated-role header (${authRoleHeader}).`,
      };
    }
    if (requestedRole !== resolvedAuthRole) {
      return {
        allowed: false,
        role: resolvedAuthRole,
        bank: effectiveBank,
        reason: `Role escalation rejected: authenticated role header (${authRoleHeader}) does not permit requested role (${requestedRole}).`,
      };
    }
    return { allowed: true, role: resolvedAuthRole, bank: effectiveBank };
  }

  if (headerEmail) {
    const claimLower = headerEmail.toLowerCase();
    let allowedRoleForClaim: BankConsoleRole | null = null;
    if (claimLower.includes("finance") || claimLower.includes("bank_finance")) {
      allowedRoleForClaim = "bank_finance";
    } else if (
      claimLower.includes("admin") ||
      claimLower.includes("program-admin") ||
      claimLower.includes("bank_program_admin") ||
      claimLower.includes("programadmin")
    ) {
      allowedRoleForClaim = "bank_program_admin";
    } else if (
      claimLower.includes("ops") ||
      claimLower.includes("viewer") ||
      claimLower.includes("ops-viewer") ||
      claimLower.includes("opsviewer")
    ) {
      allowedRoleForClaim = "bank_ops_viewer";
    }

    if (allowedRoleForClaim) {
      if (requestedRole !== allowedRoleForClaim) {
        return {
          allowed: false,
          role: allowedRoleForClaim,
          bank: effectiveBank,
          reason: `Role escalation rejected: identity claim (${headerEmail}) authorizes role ${allowedRoleForClaim}, not ${requestedRole}.`,
        };
      }
      return { allowed: true, role: requestedRole, bank: effectiveBank };
    }
  }

  if (
    requestedRole === "bank_finance" ||
    requestedRole === "bank_program_admin"
  ) {
    return {
      allowed: false,
      role: "bank_ops_viewer",
      bank: effectiveBank,
      reason: `Unauthorised role escalation rejected: self-selected signing for ${requestedRole} requires trusted authenticated identity or claim.`,
    };
  }

  return { allowed: true, role: "bank_ops_viewer", bank: effectiveBank };
}

export function bankConsoleQuery(
  bank: BankDemoTenant,
  locale: Locale,
  role: BankConsoleRole,
  extra?: Record<string, string | undefined>,
) {
  const params = new URLSearchParams({ bank: bank.code, locale, role });

  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }

  return params;
}

export function bankConsoleHref(
  path: string,
  bank: BankDemoTenant,
  locale: Locale,
  role: BankConsoleRole,
  extra?: Record<string, string | undefined>,
) {
  const query = bankConsoleQuery(bank, locale, role, extra).toString();
  return `${path}?${query}`;
}
