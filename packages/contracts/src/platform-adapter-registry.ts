// Define types for Adapter Configuration
export interface AdapterConfig {
  isEnabled: boolean;
  // Add other configuration specific to enablement if needed
}

// Define types for Rollout Status
export enum RolloutStatus {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

// Define types for Credential Status
export enum CredentialStatus {
  VALID = "VALID",
  INVALID = "INVALID",
  PENDING = "PENDING",
  EXPIRED = "EXPIRED",
  NOT_CONFIGURED = "NOT_CONFIGURED",
}

// Define types for Webhook Status
export interface WebhookStatus {
  url: string | null;
  isEnabled: boolean;
  lastEventTimestamp: string | null;
  lastStatus: "SUCCESS" | "FAILURE" | "UNKNOWN";
  lastStatusCode?: string | null;
}

export enum Environment {
  PRODUCTION = "PRODUCTION",
  STAGING = "STAGING",
  DEVELOPMENT = "DEVELOPMENT",
  SANDBOX = "SANDBOX",
}

export enum AdapterType {
  NATIVE = "NATIVE",
  INTERNAL = "INTERNAL",
  EXTERNAL_REST = "EXTERNAL_REST",
  EXTERNAL_WEBHOOK = "EXTERNAL_WEBHOOK",
  EXTERNAL_COMBINED = "EXTERNAL_COMBINED",
}

export enum FinanceAuthorityMode {
  OWNED = "OWNED",
  EXTERNAL = "EXTERNAL",
  SHADOW = "SHADOW",
}

// Define types for Policy
export interface Policy {
  serviceBuckets: string[];
  maxCandidates: number;
  acceptTimeoutSeconds: number;
  manualFallbackThresholdSeconds: number;
  manualFallbackThresholdCount?: number;
  financeAuthorityMode: FinanceAuthorityMode;
}

// Define types for Supported Actions
export interface SupportedAction {
  name: string;
  description: string;
  // Add parameters or configurations for the action
}

// SR-RECOVERY-CONTRACTS-20260911: credential expiry, mutation audit and
// optimistic-concurrency fields. Routed via
// support/unblock/SR-ADMIN-ADAPTER-001/SR-ADMIN-ADAPTER-001-UNBLOCK-PLANNING-DECISION.md
// (service contracts §3.7/§8.4, Q-ADM17): platform-admin configures and
// edits credentials, ops operates; secret material is never viewable after
// creation.

export const CREDENTIAL_EXPIRY_WARNING_STATES = [
  "unknown",
  "ok",
  "warning",
  "expired",
] as const;
export type CredentialExpiryWarningState =
  (typeof CREDENTIAL_EXPIRY_WARNING_STATES)[number];

/**
 * Non-secret pointer to the credential material actually installed (e.g. a
 * rotation/version id or KMS key reference) plus its expiry — never the
 * secret itself. The whole field is nullable: absent/unrecorded expiry data
 * is a distinct, valid state, not an error.
 */
export interface AdapterCredentialExpiry {
  reference: string;
  expiresAt: string | null;
}

/**
 * Server-computed from `AdapterCredentialExpiry` against a server-defined
 * warning window; clients cannot set or influence this state directly via
 * `UpdatePlatformAdapterCommand`. Missing or unparsable expiry data resolves
 * to "unknown" — never "ok" — and a failed evaluation (e.g. an API error
 * while computing it) must not be reported as this type at all; callers
 * distinguish "warning state is unknown" from "the check itself failed".
 */
export interface AdapterCredentialExpiryWarning {
  state: CredentialExpiryWarningState;
  warningWindowDays: number;
  evaluatedAt: string;
}

/** Server-generated evidence of one mutation; never client-constructed. */
export interface PlatformAdapterAuditEvidence {
  auditId: string;
  actorId: string | null;
  reason: string;
  previousRevision: number;
  newRevision: number;
  occurredAt: string;
}

// Main type for Platform Adapter Registry
export interface PlatformAdapter {
  id: string; // Unique identifier for the adapter
  platformCode: string;
  name: string;
  description: string;
  version: string;
  environment: Environment;
  rolloutStage: Environment;
  adapterType: AdapterType;
  isForwarded: boolean;
  config: AdapterConfig;
  rolloutStatus: RolloutStatus;
  credentialStatus: CredentialStatus;
  webhookStatus: WebhookStatus | null;
  healthStatus: {
    lastCheckTimestamp: string | null;
    status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
    message: string | null;
  };
  policies: Policy;
  featureFlags: Record<string, boolean>;
  supportedActions: SupportedAction[];
  warn?: boolean;
  draft?: boolean;
  /**
   * Optimistic-concurrency revision; incremented on every mutation. Optional
   * here (rather than on `AdapterConfig`-style required fields) only to
   * avoid forcing every existing `PlatformAdapter` producer in this
   * contracts-only candidate to migrate at once; a real persisted adapter
   * record is expected to always populate it.
   */
  revision?: number;
  credentialExpiry?: AdapterCredentialExpiry | null;
  credentialExpiryWarning?: AdapterCredentialExpiryWarning;
  lastMutationAudit?: PlatformAdapterAuditEvidence | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePlatformAdapterCommand {
  config?: Partial<AdapterConfig>;
  rolloutStatus?: RolloutStatus;
  rolloutStage?: Environment;
  policies?: Partial<Policy>;
  featureFlags?: Record<string, boolean>;
  webhookStatus?: Partial<WebhookStatus>; // Added this line
  /** Non-secret credential reference/expiry being recorded, or null to clear it. */
  credentialExpiry?: AdapterCredentialExpiry | null;
  /**
   * Becomes `PlatformAdapterAuditEvidence.reason` on the server-generated
   * audit record. Optional in this contracts-only candidate to avoid
   * breaking existing callers; a real mutation-authority implementation
   * should reject a request that omits it.
   */
  reason?: string;
  /**
   * For optimistic concurrency; must equal the adapter's current `revision`
   * when provided. Optional here for the same existing-caller reason as
   * `reason`; a real implementation should require it once `revision` is
   * populated on every record.
   */
  expectedRevision?: number;
}
