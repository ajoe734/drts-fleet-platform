const PORTAL_ACTOR_TYPE = "partner_api_key";
const PORTAL_SCOPES = ["billing:read"] as const;
const DEFAULT_PARTNER_ID = "partner-referral-demo-001";
const DEFAULT_TENANT_ID = "tenant-demo-001";
const DEFAULT_PARTNER_PROGRAM_ID = "program-referral-community";
const DEFAULT_PARTNER_ENTRY_SLUG = "referral-demo-community";

export interface ReferralPortalRequestEvidence {
  actorType: string;
  partnerEntrySlug: string;
  scopes: string[];
}

export interface ReferralPortalBootstrapContext {
  defaultHeaders: Record<string, string>;
  partnerId: string;
  partnerEntrySlug: string;
  requestEvidence: ReferralPortalRequestEvidence;
}

function resolveEnvValue(envName: string, fallback?: string): string | null {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  return fallback ?? null;
}

export function buildReferralPortalBootstrapContext(): ReferralPortalBootstrapContext {
  const scopes = [...PORTAL_SCOPES];
  const partnerId =
    resolveEnvValue("DRTS_PARTNER_ID", DEFAULT_PARTNER_ID) ??
    DEFAULT_PARTNER_ID;
  const tenantId = resolveEnvValue("DRTS_TENANT_ID", DEFAULT_TENANT_ID);
  const partnerProgramId = resolveEnvValue(
    "DRTS_PARTNER_PROGRAM_ID",
    DEFAULT_PARTNER_PROGRAM_ID,
  );
  const partnerEntrySlug =
    resolveEnvValue("DRTS_PARTNER_ENTRY_SLUG", DEFAULT_PARTNER_ENTRY_SLUG) ??
    DEFAULT_PARTNER_ENTRY_SLUG;

  const defaultHeaders: Record<string, string> = {
    "x-actor-type": PORTAL_ACTOR_TYPE,
    "x-actor-id": partnerId,
    "x-partner-id": partnerId,
    "x-roles": "partner",
    "x-role-families": "partner",
    "x-scopes": scopes.join(","),
    "x-realm": "partner",
    "x-partner-entry-slug": partnerEntrySlug,
  };

  if (tenantId) {
    defaultHeaders["x-tenant-id"] = tenantId;
  }
  if (partnerProgramId) {
    defaultHeaders["x-partner-program-id"] = partnerProgramId;
  }

  return {
    defaultHeaders,
    partnerId,
    partnerEntrySlug,
    requestEvidence: {
      actorType: PORTAL_ACTOR_TYPE,
      partnerEntrySlug,
      scopes,
    },
  };
}
