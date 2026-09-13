/**
 * Platform Adapter Registry — SR-RECOVERY-CONTRACTS-20260911: Typed API Client Extension
 *
 * Provides typed re-exports and functional adapter wrappers for the
 * credential-expiry-warning read implemented directly on `ApiClient` in
 * ./index. list/get/update were already present prior to this task; only the
 * expiry-warning method and the credential-expiry/audit/revision types are
 * new here.
 *
 * Authority: docs/04-uat/system-remediation-20260906/SR-RECOVERY-CONTRACTS-20260911.md
 */

import type { AdapterCredentialExpiryWarning } from "@drts/contracts";
import type { ApiClient } from "./index";

export type {
  AdapterCredentialExpiry,
  AdapterCredentialExpiryWarning,
  CredentialExpiryWarningState,
  PlatformAdapter,
  PlatformAdapterAuditEvidence,
  UpdatePlatformAdapterCommand,
} from "@drts/contracts";

export { CREDENTIAL_EXPIRY_WARNING_STATES } from "@drts/contracts";

export interface PlatformAdapterRegistryClientInterface {
  getPlatformAdapterCredentialExpiryWarning(
    id: string,
  ): Promise<AdapterCredentialExpiryWarning>;
}

/**
 * Functional adapter allowing modular invocation over any ApiClient instance.
 * Rejects on request failure — an API failure is not a successful "ok" or
 * "unknown" expiry warning and callers must not swallow it into one.
 */
export async function getPlatformAdapterCredentialExpiryWarning(
  client: ApiClient,
  id: string,
): Promise<AdapterCredentialExpiryWarning> {
  return client.getPlatformAdapterCredentialExpiryWarning(id);
}
