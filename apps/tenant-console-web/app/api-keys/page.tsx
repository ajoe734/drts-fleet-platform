import type {
  EmptyReason,
  IdentityContext,
  ResourceActionDescriptor,
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { ApiKeyManager } from "./api-key-manager";

export const dynamic = "force-dynamic";

type ApiKeyPageData = {
  apiKeys: TenantApiKeyRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  identity: IdentityContext | null;
  availableActions: ResourceActionDescriptor[];
  initialEmptyReason: EmptyReason | null;
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
): ResourceActionDescriptor[] {
  const canManage = canManageApiKeys(identity);
  const disabledReasonCode = !identity
    ? "identity_unavailable"
    : !canManage
      ? "permission_denied"
      : !governance
        ? "governance_unavailable"
        : governance.apiKeyPolicy.allowedScopes.length === 0
          ? "not_provisioned"
          : undefined;

  return [
    {
      action: "issue",
      enabled: !disabledReasonCode,
      disabledReasonCode,
      riskLevel: "high",
    },
    {
      action: "rotate",
      enabled: !disabledReasonCode,
      disabledReasonCode,
      riskLevel: "high",
    },
    {
      action: "revoke",
      enabled: canManage,
      disabledReasonCode: canManage ? undefined : "permission_denied",
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
      apiKeysResult.reason instanceof Error
        ? apiKeysResult.reason.message
        : "Unable to load tenant API keys.",
    );
  }

  if (governanceResult.status === "rejected") {
    errors.push(
      governanceResult.reason instanceof Error
        ? governanceResult.reason.message
        : "Unable to load integration governance policy.",
    );
  }

  if (identityResult.status === "rejected") {
    errors.push(
      identityResult.reason instanceof Error
        ? identityResult.reason.message
        : "Unable to load tenant identity context.",
    );
  }

  return {
    apiKeys,
    governance,
    identity,
    availableActions: buildAvailableActions(identity, governance),
    initialEmptyReason: deriveInitialEmptyReason({
      apiKeys,
      apiKeysFailed: apiKeysResult.status === "rejected",
      governance,
      governanceFailed: governanceResult.status === "rejected",
      identity,
    }),
    errors,
  };
}

export default async function ApiKeysPage() {
  const pageData = await loadApiKeyPageData();
  return <ApiKeyManager {...pageData} />;
}
