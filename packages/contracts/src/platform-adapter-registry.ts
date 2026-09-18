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
}
