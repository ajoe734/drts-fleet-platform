import type {
  EmptyReason,
  RefreshTier,
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { ApiKeyManager } from "./api-key-manager";

export const dynamic = "force-dynamic";

type ApiKeyPageData = {
  apiKeys: TenantApiKeyRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  errors: string[];
  refreshTier: RefreshTier;
  snapshotAt: string;
};

async function loadApiKeyPageData(): Promise<ApiKeyPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  const snapshotAt = new Date().toISOString();

  const [apiKeysResult, governanceResult] = await Promise.allSettled([
    client.listApiKeys() as Promise<TenantApiKeyRecord[]>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
  ]);

  const apiKeys =
    apiKeysResult.status === "fulfilled" ? apiKeysResult.value : [];
  const governance =
    governanceResult.status === "fulfilled" ? governanceResult.value : null;

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

  return {
    apiKeys,
    governance,
    errors,
    refreshTier: "slow",
    snapshotAt,
  };
}

function readEmptyReasonOverride(
  value: string | string[] | undefined,
): EmptyReason | null {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (!normalized) return null;
  const allowed: EmptyReason[] = [
    "no_data",
    "not_provisioned",
    "fetch_failed",
    "permission_denied",
    "external_unavailable",
    "filtered_empty",
  ];
  return allowed.includes(normalized as EmptyReason)
    ? (normalized as EmptyReason)
    : null;
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams?: Promise<{
    emptyReason?: string | string[];
  }>;
}) {
  const pageData = await loadApiKeyPageData();
  const resolvedSearchParams = (await searchParams) ?? {};

  return (
    <ApiKeyManager
      {...pageData}
      emptyReasonOverride={readEmptyReasonOverride(
        resolvedSearchParams.emptyReason,
      )}
    />
  );
}
