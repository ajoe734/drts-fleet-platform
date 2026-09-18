const PORTAL_ACTOR_TYPE = "partner_api_key";
const PORTAL_SCOPES = ["billing:read"] as const;
const DEFAULT_PARTNER_ID = "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118";
const DEFAULT_TENANT_ID = "tenant-demo-001";
const DEFAULT_PARTNER_PROGRAM_ID = "program-referral-community";
const DEFAULT_PARTNER_ENTRY_SLUG = "yuhe-residence";

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

export function buildReferralPortalBootstrapContext(): ReferralPortalBootstrapContext {
  const isDeployedDev =
    process.env.DRTS_ENV === "development" ||
    process.env.NODE_ENV === "production";

  const rawPartnerId = process.env.DRTS_PARTNER_ID?.trim();
  const rawTenantId = process.env.DRTS_TENANT_ID?.trim();
  const rawProgramId = process.env.DRTS_PARTNER_PROGRAM_ID?.trim();
  const rawEntrySlug = process.env.DRTS_PARTNER_ENTRY_SLUG?.trim();

  if (isDeployedDev) {
    if (!rawPartnerId || !rawTenantId || !rawProgramId || !rawEntrySlug) {
      throw new Error(
        "Missing formal channel partner configuration: DRTS_PARTNER_ID, DRTS_TENANT_ID, DRTS_PARTNER_PROGRAM_ID, and DRTS_PARTNER_ENTRY_SLUG environment variables are required in deployed Dev.",
      );
    }
    if (
      rawPartnerId === "partner-referral-demo-001" ||
      rawEntrySlug === "referral-demo-community"
    ) {
      throw new Error(
        "Invalid partner configuration: deployed Dev must not use demo partner identity.",
      );
    }
  }

  const scopes = [...PORTAL_SCOPES];
  const partnerId = rawPartnerId || DEFAULT_PARTNER_ID;
  const tenantId = rawTenantId || DEFAULT_TENANT_ID;
  const partnerProgramId = rawProgramId || DEFAULT_PARTNER_PROGRAM_ID;
  const partnerEntrySlug = rawEntrySlug || DEFAULT_PARTNER_ENTRY_SLUG;

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

