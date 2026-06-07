import type {
  EmptyReason,
  IdentityContext,
  ResourceActionDescriptor,
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import {
  formatTenantErrorSummary,
  toTenantErrorMessage,
} from "@/lib/error-copy";
import { ApiKeyManager } from "./api-key-manager";

export const dynamic = "force-dynamic";

type ApiKeyPageData = {
  apiKeys: TenantApiKeyRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  identity: IdentityContext | null;
  availableActions: ResourceActionDescriptor[];
  initialEmptyReason: EmptyReason | null;
  loadedAt: string;
  errors: string[];
};

function canManageApiKeys(identity: IdentityContext | null) {
  if (!identity) return false;
  if (identity.actorType === "tenant_admin") return true;
  return identity.roles.some((role: string) =>
    ["tenant_admin", "tc_admin", "tc_integration_mgr"].includes(role),
  );
}

function canViewApiKeys(identity: IdentityContext | null) {
  if (!identity) return true;
  if (identity.realm !== "tenant") return false;
  if (canManageApiKeys(identity)) return true;
  return identity.roles.some((role: string) =>
    ["tenant_viewer", "tenant_ops_admin", "tenant_finance_admin"].includes(
      role,
    ),
  );
}

function buildAvailableActions(
  identity: IdentityContext | null,
  governance: TenantIntegrationGovernancePackage | null,
  apiKeys: TenantApiKeyRecord[],
): ResourceActionDescriptor[] {
  const canManage = canManageApiKeys(identity);
  const issueDisabledReasonCode = !identity
    ? "identity_unavailable"
    : !canManage
      ? "permission_denied"
      : !governance
        ? "governance_unavailable"
        : governance.apiKeyPolicy.allowedScopes.length === 0
          ? "not_provisioned"
          : undefined;
  const hasExistingKeys = apiKeys.length > 0;
  const rotateDisabledReasonCode =
    issueDisabledReasonCode ?? (!hasExistingKeys ? "no_data" : undefined);
  const revokeDisabledReasonCode = !canManage
    ? "permission_denied"
    : !hasExistingKeys
      ? "no_data"
      : undefined;

  return [
    {
      action: "issue",
      enabled: !issueDisabledReasonCode,
      ...(issueDisabledReasonCode
        ? { disabledReasonCode: issueDisabledReasonCode }
        : {}),
      riskLevel: "high",
    },
    {
      action: "rotate",
      enabled: !rotateDisabledReasonCode,
      ...(rotateDisabledReasonCode
        ? { disabledReasonCode: rotateDisabledReasonCode }
        : {}),
      riskLevel: "high",
    },
    {
      action: "revoke",
      enabled: !revokeDisabledReasonCode,
      ...(revokeDisabledReasonCode
        ? { disabledReasonCode: revokeDisabledReasonCode }
        : {}),
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

function deriveInitialEmptyReason(input: {
  apiKeys: TenantApiKeyRecord[];
  apiKeysFailed: boolean;
  governance: TenantIntegrationGovernancePackage | null;
  governanceFailed: boolean;
  identity: IdentityContext | null;
}): EmptyReason | null {
  const { apiKeys, apiKeysFailed, governance, governanceFailed, identity } =
    input;

  if (!canViewApiKeys(identity)) {
    return "permission_denied";
  }

  if (apiKeysFailed) {
    return "fetch_failed";
  }

  if (apiKeys.length > 0) {
    return null;
  }

  if (governanceFailed) {
    return "external_unavailable";
  }

  const checklistSuggestsProvisioning =
    governance?.onboardingChecklist.some((item: string) =>
      item.toLowerCase().includes("api key"),
    ) ?? false;
  const hasPublishedScopes =
    (governance?.apiKeyPolicy.allowedScopes.length ?? 0) > 0;

  if (checklistSuggestsProvisioning || !hasPublishedScopes) {
    return "not_provisioned";
  }

  return "no_data";
}

async function loadApiKeyPageData(): Promise<ApiKeyPageData> {
  const client = getTenantClient();
  const errors: string[] = [];

  const [apiKeysResult, governanceResult, identityResult] =
    await Promise.allSettled([
      client.listApiKeys() as Promise<TenantApiKeyRecord[]>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.getIdentityContext() as Promise<IdentityContext>,
    ]);

  const apiKeys =
    apiKeysResult.status === "fulfilled" ? apiKeysResult.value : [];
  const governance =
    governanceResult.status === "fulfilled" ? governanceResult.value : null;
  const identity =
    identityResult.status === "fulfilled" ? identityResult.value : null;

  if (apiKeysResult.status === "rejected") {
    errors.push(
      formatTenantErrorSummary(
        "API 金鑰",
        toTenantErrorMessage(apiKeysResult.reason, "租戶 API 金鑰讀取失敗"),
      ),
    );
  }

  if (governanceResult.status === "rejected") {
    errors.push(
      formatTenantErrorSummary(
        "整合治理策略",
        toTenantErrorMessage(governanceResult.reason, "整合治理策略讀取失敗"),
      ),
    );
  }

  if (identityResult.status === "rejected") {
    errors.push(
      formatTenantErrorSummary(
        "租戶身分脈絡",
        toTenantErrorMessage(identityResult.reason, "租戶身分脈絡讀取失敗"),
      ),
    );
  }

  return {
    apiKeys,
    governance,
    identity,
    availableActions: buildAvailableActions(identity, governance, apiKeys),
    initialEmptyReason: deriveInitialEmptyReason({
      apiKeys,
      apiKeysFailed: apiKeysResult.status === "rejected",
      governance,
      governanceFailed: governanceResult.status === "rejected",
      identity,
    }),
    loadedAt: new Date().toISOString(),
    errors,
  };
}

export default async function ApiKeysPage() {
  const pageData = await loadApiKeyPageData();
  return <ApiKeyManager {...pageData} />;
}
