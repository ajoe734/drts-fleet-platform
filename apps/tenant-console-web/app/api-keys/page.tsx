import type {
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
};

async function loadApiKeyPageData(): Promise<ApiKeyPageData> {
  const client = getTenantClient();
  const errors: string[] = [];

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

  return { apiKeys, governance, errors };
}

export default async function ApiKeysPage() {
  const pageData = await loadApiKeyPageData();
  return <ApiKeyManager {...pageData} />;
}
