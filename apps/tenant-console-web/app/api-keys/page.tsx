import type {
  ApiListData,
  ApiSuccessEnvelope,
  EmptyReason,
  RefreshTier,
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
} from "@drts/contracts";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";
import { ApiKeyManager } from "./api-key-manager";

export const dynamic = "force-dynamic";

const API_KEYS_REFRESH_TIER: RefreshTier = "slow";

type ApiKeyPageData = {
  apiKeys: TenantApiKeyRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  errors: string[];
  refreshTier: RefreshTier;
  snapshotAt: string;
  tenantId: string;
};

type ApiEnvelopeResult<T> = {
  data: T;
  timestamp: string;
};

async function fetchTenantEnvelope<T>(
  path: string,
): Promise<ApiEnvelopeResult<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "x-actor-type": "tenant_admin",
      "x-actor-id": DEMO_ACTOR_ID,
      "x-realm": "tenant",
      "x-tenant-id": DEMO_TENANT_ID,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
    } | null;
    throw new Error(
      body?.error?.message ??
        body?.error?.code ??
        `Request failed: ${response.status}`,
    );
  }

  const envelope = (await response.json()) as ApiSuccessEnvelope<T>;
  return {
    data: envelope.data,
    timestamp: envelope.meta.timestamp,
  };
}

async function loadApiKeyPageData(): Promise<ApiKeyPageData> {
  const errors: string[] = [];

  const [apiKeysResult, governanceResult] = await Promise.allSettled([
    fetchTenantEnvelope<ApiListData<TenantApiKeyRecord>>(
      "/api/tenant/api-keys",
    ),
    fetchTenantEnvelope<TenantIntegrationGovernancePackage>(
      "/api/tenant/integration-governance",
    ),
  ]);

  const apiKeys =
    apiKeysResult.status === "fulfilled" ? apiKeysResult.value.data.items : [];
  const governance =
    governanceResult.status === "fulfilled"
      ? governanceResult.value.data
      : null;

  const snapshotAtCandidates = [
    apiKeysResult.status === "fulfilled" ? apiKeysResult.value.timestamp : null,
    governanceResult.status === "fulfilled"
      ? governanceResult.value.timestamp
      : null,
  ].filter((value): value is string => Boolean(value));

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
    refreshTier: API_KEYS_REFRESH_TIER,
    snapshotAt: snapshotAtCandidates.sort().at(-1) ?? new Date().toISOString(),
    tenantId: governance?.tenantId ?? apiKeys[0]?.tenantId ?? DEMO_TENANT_ID,
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
