import { HttpStatus } from "@nestjs/common";

import type {
  EvidenceAccessAction,
  EvidenceDownloadControlRecord,
  EvidenceLegalHoldPolicyRecord,
  EvidenceMaskingRuleRecord,
  EvidenceGovernanceCatalog,
  EvidenceRetentionFamily,
  EvidenceRetentionPolicyRecord,
  IdentityContext,
} from "@drts/contracts";

import { ApiRequestError } from "./api-envelope";

export const EVIDENCE_GOVERNANCE_VERSION = "phase1-2026-04-29";

export type EvidenceAccessIdentity = Pick<
  IdentityContext,
  "actorType" | "actorId" | "realm" | "scopes" | "tenantId"
> &
  Partial<
    Pick<IdentityContext, "partnerId" | "partnerProgramId" | "partnerEntrySlug">
  >;

const DEFAULT_LEGAL_HOLD_NOTES = [
  "Legal hold may be placed for complaint escalation, regulatory inquiry, settlement dispute, or internal investigation.",
  "Deletion and archive-compaction jobs must skip any evidence record that is under hold until release is audited.",
];

const DEFAULT_LEGAL_HOLD_POLICY: EvidenceLegalHoldPolicyRecord = {
  supported: true,
  placementActors: ["platform_admin", "ops_user"],
  releaseActors: ["platform_admin"],
  deletionSuppressed: true,
  notes: DEFAULT_LEGAL_HOLD_NOTES,
};

const CONTROLLED_DOWNLOAD_15_MINUTES: EvidenceDownloadControlRecord = {
  mode: "signed_url",
  ttlMinutes: 15,
  reissueRequired: true,
  requiresAuditOnIssue: true,
  notes: [
    "Signed artifact URLs expire after 15 minutes and must be re-issued through an authorized API call.",
  ],
};

const NO_DOWNLOAD_CONTROL: EvidenceDownloadControlRecord | null = null;

function cloneMaskingRules(rules: EvidenceMaskingRuleRecord[]) {
  return rules.map((rule) => ({ ...rule }));
}

const EVIDENCE_POLICIES: readonly EvidenceRetentionPolicyRecord[] = [
  {
    family: "call_recording",
    authorityModule: "callcenter",
    description:
      "Phone-order call sessions, recording identifiers, and provider recording references.",
    hotRetentionDays: 30,
    archiveAfterDays: 30,
    archiveRetentionDays: 365,
    archiveTier: "warm_archive",
    accessRules: [
      {
        realms: ["system"],
        actorTypes: ["system"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["platform"],
        actorTypes: ["platform_admin"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["ops"],
        actorTypes: ["ops_user"],
        requiredScopes: [],
        tenantScoped: false,
      },
    ],
    maskingRules: [
      {
        surface: "api_view",
        rule: "Secondary evidence views expose callId and recordingId as masked prefix...suffix previews.",
      },
      {
        surface: "audit_log",
        rule: "Audit entries record evidence actions and status metadata, not raw provider recording references.",
      },
      {
        surface: "storage",
        rule: "Binary call media remains in CTI/provider storage; the repo-local authority keeps only metadata and masked references.",
      },
    ],
    downloadControl: NO_DOWNLOAD_CONTROL,
    legalHold: DEFAULT_LEGAL_HOLD_POLICY,
    deletionException:
      "Call-recording evidence stays in archive while the linked complaint, legal hold, or regulator request remains open.",
    auditAction: "view_call_recording_evidence",
    notes: [
      "Callcenter remains the authority for recording metadata; binary media continues to live in CTI/provider storage.",
      "Tenant self-service access is intentionally excluded until tenant-scoped recording authority exists.",
    ],
  },
  {
    family: "report_artifact",
    authorityModule: "reporting-filing",
    description:
      "Generated report artifacts, dispatch recording index exports, and revenue summary downloads.",
    hotRetentionDays: 30,
    archiveAfterDays: 30,
    archiveRetentionDays: 365,
    archiveTier: "warm_archive",
    accessRules: [
      {
        realms: ["system"],
        actorTypes: ["system"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["platform"],
        actorTypes: ["platform_admin"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["ops"],
        actorTypes: ["ops_user"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["tenant"],
        actorTypes: ["tenant_admin"],
        requiredScopes: ["reports:read"],
        tenantScoped: true,
      },
    ],
    maskingRules: [
      {
        surface: "api_view",
        rule: "Dispatch recording index responses mask callId and recordingId previews before they leave reporting-filing.",
      },
      {
        surface: "download",
        rule: "Revenue-summary evidence exposes issuerAuthorizationRef and benefitReference only as masked prefix...suffix previews.",
      },
      {
        surface: "audit_log",
        rule: "Artifact issuance audits log manifest hash, expiry, and actor context without raw partner references or contact PII.",
      },
    ],
    downloadControl: CONTROLLED_DOWNLOAD_15_MINUTES,
    legalHold: DEFAULT_LEGAL_HOLD_POLICY,
    deletionException:
      "Generated report artifacts remain recoverable from archive while any dependent filing, dispute, or legal hold references the same manifest hash.",
    auditAction: "issue_report_artifact_download",
    notes: [
      "Tenant-scoped report access requires the job to be created or resolved under the same tenant ID.",
    ],
  },
  {
    family: "filing_package",
    authorityModule: "reporting-filing",
    description:
      "Immutable filing packages, manifests, and packaged audit-request bundles.",
    hotRetentionDays: 90,
    archiveAfterDays: 90,
    archiveRetentionDays: 2555,
    archiveTier: "cold_archive",
    accessRules: [
      {
        realms: ["system"],
        actorTypes: ["system"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["platform"],
        actorTypes: ["platform_admin"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["ops"],
        actorTypes: ["ops_user"],
        requiredScopes: [],
        tenantScoped: false,
      },
    ],
    maskingRules: [
      {
        surface: "api_view",
        rule: "Filing package views expose manifest hash and signed-download metadata only; package items inherit masked report-artifact previews.",
      },
      {
        surface: "audit_log",
        rule: "Download issuance audits record packageId, manifest hash, and expiry metadata without raw package contents.",
      },
    ],
    downloadControl: CONTROLLED_DOWNLOAD_15_MINUTES,
    legalHold: DEFAULT_LEGAL_HOLD_POLICY,
    deletionException:
      "Filing packages skip deletion whenever they are referenced by an audit request, regulator handoff, or active legal hold.",
    auditAction: "issue_filing_package_download",
    notes: [
      "Cold-archive retention is longer because filing packages are the packaged evidence surface for external requests.",
    ],
  },
  {
    family: "audit_log",
    authorityModule: "audit-notification",
    description:
      "Immutable audit-log records and tenant/platform audit evidence derived from them.",
    hotRetentionDays: 180,
    archiveAfterDays: 180,
    archiveRetentionDays: 2555,
    archiveTier: "cold_archive",
    accessRules: [
      {
        realms: ["system"],
        actorTypes: ["system"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["platform"],
        actorTypes: ["platform_admin"],
        requiredScopes: ["audit:read"],
        tenantScoped: false,
      },
      {
        realms: ["ops"],
        actorTypes: ["ops_user"],
        requiredScopes: ["audit:read"],
        tenantScoped: false,
      },
      {
        realms: ["tenant"],
        actorTypes: ["tenant_admin"],
        requiredScopes: ["audit:read"],
        tenantScoped: true,
      },
    ],
    maskingRules: [
      {
        surface: "api_view",
        rule: "Audit feeds expose masked old/new summaries rather than raw secrets, raw partner references, or plaintext key material.",
      },
      {
        surface: "audit_log",
        rule: "Evidence-access audit entries carry policy metadata and subject identifiers while preserving OPX-ID-003 masking rules.",
      },
    ],
    downloadControl: NO_DOWNLOAD_CONTROL,
    legalHold: DEFAULT_LEGAL_HOLD_POLICY,
    deletionException:
      "Audit evidence is never hard-deleted while linked incident, complaint, or regulator references remain unresolved.",
    auditAction: "view_audit_log_evidence",
    notes: [
      "Tenant callers only receive tenant-filtered audit rows even when the shared audit table contains global evidence.",
    ],
  },
  {
    family: "webhook_delivery",
    authorityModule: "tenant-partner",
    description:
      "Tenant webhook delivery history, status attempts, signature previews, and retry metadata.",
    hotRetentionDays: 30,
    archiveAfterDays: 30,
    archiveRetentionDays: 365,
    archiveTier: "warm_archive",
    accessRules: [
      {
        realms: ["system"],
        actorTypes: ["system"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["platform"],
        actorTypes: ["platform_admin"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["ops"],
        actorTypes: ["ops_user"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["tenant"],
        actorTypes: ["tenant_admin"],
        requiredScopes: ["tenant:webhooks:read"],
        tenantScoped: true,
      },
    ],
    maskingRules: [
      {
        surface: "api_view",
        rule: "Webhook delivery views expose signature preview and secret version metadata only; raw secret and raw body stay internal.",
      },
      {
        surface: "audit_log",
        rule: "Delivery-history audits capture retry/status metadata without raw payload bodies or webhook secrets.",
      },
    ],
    downloadControl: NO_DOWNLOAD_CONTROL,
    legalHold: DEFAULT_LEGAL_HOLD_POLICY,
    deletionException:
      "Webhook delivery evidence is retained whenever a disable event, customer dispute, or legal hold references the affected endpoint.",
    auditAction: "view_webhook_delivery_evidence",
    notes: [
      "Only preview-safe signature metadata is exposed through the tenant-partner read path.",
    ],
  },
  {
    family: "eligibility_verification",
    authorityModule: "tenant-partner",
    description:
      "Partner eligibility verification decisions, contract snapshots, and hashed issuer-reference evidence.",
    hotRetentionDays: 90,
    archiveAfterDays: 90,
    archiveRetentionDays: 730,
    archiveTier: "warm_archive",
    accessRules: [
      {
        realms: ["system"],
        actorTypes: ["system"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["platform"],
        actorTypes: ["platform_admin"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["ops"],
        actorTypes: ["ops_user"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["tenant"],
        actorTypes: ["tenant_admin"],
        requiredScopes: ["tenant:read"],
        tenantScoped: true,
      },
      {
        realms: ["partner"],
        actorTypes: ["partner_api_key"],
        requiredScopes: [],
        tenantScoped: true,
      },
    ],
    maskingRules: [
      {
        surface: "api_view",
        rule: "Eligibility evidence surfaces expose masked issuerAuthorizationRef and benefitReference previews plus hash-only referenceToken material.",
      },
      {
        surface: "storage",
        rule: "Raw referenceToken material is not persisted once hash-based evidence fields are materialized.",
      },
    ],
    downloadControl: NO_DOWNLOAD_CONTROL,
    legalHold: DEFAULT_LEGAL_HOLD_POLICY,
    deletionException:
      "Eligibility evidence stays preserved while refunds, fare disputes, or regulatory inspections depend on the original decision trace.",
    auditAction: "view_partner_eligibility_evidence",
    notes: [
      "Raw reference tokens remain excluded; the evidence surface is hash-only plus masked references established by OPX-ID-003.",
    ],
  },
  {
    family: "proof_bundle",
    authorityModule: "owned-mobility",
    description:
      "Completion proof bundles, expense proof attachments, and signoff references tied to trip closeout.",
    hotRetentionDays: 90,
    archiveAfterDays: 90,
    archiveRetentionDays: 730,
    archiveTier: "warm_archive",
    accessRules: [
      {
        realms: ["system"],
        actorTypes: ["system"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["platform"],
        actorTypes: ["platform_admin"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["ops"],
        actorTypes: ["ops_user"],
        requiredScopes: [],
        tenantScoped: false,
      },
      {
        realms: ["tenant"],
        actorTypes: ["tenant_admin"],
        requiredScopes: ["reports:read"],
        tenantScoped: true,
      },
    ],
    maskingRules: [
      {
        surface: "api_view",
        rule: "Proof retrieval surfaces expose metadata and signoff references only; raw contact PII and unsecured attachments remain out of secondary evidence views.",
      },
      {
        surface: "audit_log",
        rule: "Proof evidence audits record subject identifiers and access context without reopening proof-capture payload semantics.",
      },
    ],
    downloadControl: NO_DOWNLOAD_CONTROL,
    legalHold: DEFAULT_LEGAL_HOLD_POLICY,
    deletionException:
      "Proof bundles remain undeletable while settlement review, complaint handling, or legal hold references the completed trip.",
    auditAction: "view_proof_bundle_evidence",
    notes: [
      "This slice defines the retention and access policy but does not reopen proof-capture runtime owned by OPX-CM-001 surfaces.",
    ],
  },
] as const;

const LEGAL_HOLD_WORKFLOW = [
  "Platform admin or ops places the hold with a case number, evidence family, subject reference, and reason code.",
  "Archive and deletion workers must skip held evidence until an audited release is recorded by platform admin.",
  "Tenant-visible surfaces may note that evidence is under hold, but they cannot release or delete held evidence directly.",
];

type AssertEvidenceAccessInput = {
  family: EvidenceRetentionFamily;
  identity?: EvidenceAccessIdentity | null | undefined;
  tenantId?: string | null | undefined;
};

function cloneAccessRules(rules: EvidenceRetentionPolicyRecord["accessRules"]) {
  return rules.map((rule) => ({
    realms: [...rule.realms],
    actorTypes: [...rule.actorTypes],
    requiredScopes: [...rule.requiredScopes],
    tenantScoped: rule.tenantScoped,
  }));
}

function clonePolicy(
  policy: EvidenceRetentionPolicyRecord,
): EvidenceRetentionPolicyRecord {
  return {
    ...policy,
    accessRules: cloneAccessRules(policy.accessRules),
    maskingRules: cloneMaskingRules(policy.maskingRules),
    downloadControl: policy.downloadControl
      ? {
          ...policy.downloadControl,
          notes: [...policy.downloadControl.notes],
        }
      : null,
    legalHold: {
      ...policy.legalHold,
      placementActors: [...policy.legalHold.placementActors],
      releaseActors: [...policy.legalHold.releaseActors],
      notes: [...policy.legalHold.notes],
    },
    notes: [...policy.notes],
  };
}

function matchesRule(
  rule: EvidenceRetentionPolicyRecord["accessRules"][number],
  identity: EvidenceAccessIdentity,
  tenantId?: string | null,
) {
  if (!rule.realms.includes(identity.realm)) {
    return false;
  }
  if (!rule.actorTypes.includes(identity.actorType)) {
    return false;
  }
  if (rule.tenantScoped && tenantId && identity.tenantId !== tenantId) {
    return false;
  }
  if (rule.requiredScopes.length === 0) {
    return true;
  }

  // Bootstrap-header admin sessions may not carry scopes, but they still map to
  // an authenticated administrative realm for Phase 1 internal tooling.
  if (
    identity.scopes.length === 0 &&
    identity.actorType !== "partner_api_key"
  ) {
    return true;
  }

  return rule.requiredScopes.some((scope) => identity.scopes.includes(scope));
}

export function listEvidenceRetentionPolicies() {
  return EVIDENCE_POLICIES.map((policy) => clonePolicy(policy));
}

export function getEvidenceRetentionPolicy(family: EvidenceRetentionFamily) {
  const policy = EVIDENCE_POLICIES.find((entry) => entry.family === family);
  if (!policy) {
    throw new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "EVIDENCE_POLICY_NOT_FOUND",
      "The requested evidence-governance policy could not be found.",
      {
        family,
      },
    );
  }
  return clonePolicy(policy);
}

export function getEvidenceGovernanceCatalog(): EvidenceGovernanceCatalog {
  return {
    version: EVIDENCE_GOVERNANCE_VERSION,
    generatedAt: new Date().toISOString(),
    policies: listEvidenceRetentionPolicies(),
    legalHoldWorkflow: [...LEGAL_HOLD_WORKFLOW],
  };
}

export function assertEvidenceAccess({
  family,
  identity,
  tenantId,
}: AssertEvidenceAccessInput) {
  const policy = getEvidenceRetentionPolicy(family);

  if (!identity || identity.realm === "system") {
    return policy;
  }

  const allowed = policy.accessRules.some((rule) =>
    matchesRule(rule, identity, tenantId),
  );
  if (allowed) {
    return policy;
  }

  throw new ApiRequestError(
    HttpStatus.FORBIDDEN,
    "EVIDENCE_ACCESS_FORBIDDEN",
    `Identity cannot access ${family} evidence.`,
    {
      family,
      actorType: identity.actorType,
      realm: identity.realm,
      tenantId: identity.tenantId,
      requiredTenantId: tenantId ?? null,
    },
  );
}

export function buildEvidenceAccessAuditSummary(
  policy: EvidenceRetentionPolicyRecord,
  action: EvidenceAccessAction,
  extra: Record<string, unknown> = {},
) {
  return {
    evidenceFamily: policy.family,
    policyVersion: EVIDENCE_GOVERNANCE_VERSION,
    accessAction: action,
    hotRetentionDays: policy.hotRetentionDays,
    archiveAfterDays: policy.archiveAfterDays,
    archiveRetentionDays: policy.archiveRetentionDays,
    archiveTier: policy.archiveTier,
    legalHoldSupported: policy.legalHold.supported,
    deletionSuppressedOnHold: policy.legalHold.deletionSuppressed,
    ...extra,
  };
}
