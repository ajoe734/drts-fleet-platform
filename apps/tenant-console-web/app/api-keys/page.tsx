import type {
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
  UiHealthEnvelope,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { ApiKeyManager } from "./api-key-manager";
import {
  buildApiKeyRow,
  buildPageActions,
  buildPageCrossAppLinks,
  resolveServerEmptyReason,
  synthesizeRefreshMetadata,
  type ApiKeyEmptyReason,
  type ApiKeyRuntimeRecord,
  type ResolvedCrossAppLink,
} from "./runtime";

export const dynamic = "force-dynamic";

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

async function loadWithError<T>(
  loader: () => Promise<T>,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type ApiKeyManagerProps = {
  rows: ApiKeyRuntimeRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  pageActions: ReturnType<typeof buildPageActions>;
  crossAppLinks: ResolvedCrossAppLink[];
  refresh: ReturnType<typeof synthesizeRefreshMetadata>;
  health: UiHealthEnvelope | null;
  serverEmptyReason: ApiKeyEmptyReason | null;
  errors: string[];
};

function buildPageHealth(
  generatedAt: string,
  degradedServices: UiHealthEnvelope["degradedServices"],
): UiHealthEnvelope | null {
  if (degradedServices.length === 0) {
    return null;
  }

  const status = degradedServices.some(
    (service) => service.severity === "critical",
  )
    ? "down"
    : "degraded";

  return { status, degradedServices, lastCheckedAt: generatedAt };
}

async function loadApiKeyManagerProps(): Promise<ApiKeyManagerProps> {
  const client = getTenantClient();
  const generatedAt = new Date().toISOString();

  const [apiKeysResult, governanceResult] = await Promise.all([
    loadWithError(() => client.listApiKeys() as Promise<TenantApiKeyRecord[]>),
    loadWithError(
      () =>
        client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
    ),
  ]);

  const apiKeys = apiKeysResult.data ?? [];
  const governance = governanceResult.data;
  const nowMs = Date.parse(generatedAt);
  const rows = apiKeys.map((apiKey) => buildApiKeyRow(apiKey, nowMs));

  const errors: string[] = [];
  const degradedServices: UiHealthEnvelope["degradedServices"] = [];

  if (apiKeysResult.error) {
    errors.push(`API 金鑰清單：${apiKeysResult.error}`);
    degradedServices.push({
      service: "tenant_api_keys",
      impact: apiKeysResult.error,
      severity: "critical",
    });
  }

  if (governanceResult.error) {
    errors.push(`整合治理政策：${governanceResult.error}`);
    degradedServices.push({
      service: "integration_governance",
      impact: governanceResult.error,
      severity: "warning",
    });
  }

  const serverEmptyReason = resolveServerEmptyReason({
    apiKeysError: apiKeysResult.error,
    governanceError: governanceResult.error,
    governance,
    keyCount: rows.length,
  });

  const dataFreshness = apiKeysResult.error
    ? "degraded"
    : governanceResult.error
      ? "stale"
      : "fresh";

  return {
    rows,
    governance,
    pageActions: buildPageActions(governance),
    crossAppLinks: buildPageCrossAppLinks(governance),
    refresh: synthesizeRefreshMetadata(generatedAt, dataFreshness),
    health: buildPageHealth(generatedAt, degradedServices),
    serverEmptyReason,
    errors,
  };
}

export default async function ApiKeysPage() {
  const props = await loadApiKeyManagerProps();
  return <ApiKeyManager {...props} />;
}
