import type {
  AuditLogRecord,
  EmptyReason,
  ResourceActionDescriptor,
  TenantIntegrationGovernancePackage,
  TenantSlaProfile,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { SlaProfileManager } from "./sla-profile-manager";

export const dynamic = "force-dynamic";

const EMPTY_REASON_VALUES = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

const FRESHNESS_VALUES = ["fresh", "stale", "degraded", "unknown"] as const;

type SupportedEmptyReason = (typeof EMPTY_REASON_VALUES)[number];
type SupportedFreshness = (typeof FRESHNESS_VALUES)[number];

type SlaPageData = {
  profile: TenantSlaProfile | null;
  governance: TenantIntegrationGovernancePackage | null;
  latestAudit: AuditLogRecord | null;
  errors: string[];
};

function toErrorMessage(label: string, error: unknown) {
  return `${label}: ${error instanceof Error ? error.message : "未知錯誤"}`;
}

function isSupportedEmptyReason(value: string): value is SupportedEmptyReason {
  return EMPTY_REASON_VALUES.includes(value as SupportedEmptyReason);
}

function isSupportedFreshness(value: string): value is SupportedFreshness {
  return FRESHNESS_VALUES.includes(value as SupportedFreshness);
}

async function loadSlaPageData(): Promise<SlaPageData> {
  const client = getTenantClient();
  const [profileResult, governanceResult, auditResult] =
    await Promise.allSettled([
      client.getSlaProfile() as Promise<TenantSlaProfile>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.listTenantAuditLogs() as Promise<AuditLogRecord[]>,
    ]);

  const errors: string[] = [];

  if (profileResult.status === "rejected") {
    errors.push(toErrorMessage("SLA profile", profileResult.reason));
  }
  if (governanceResult.status === "rejected") {
    errors.push(toErrorMessage("Governance", governanceResult.reason));
  }
  if (auditResult.status === "rejected") {
    errors.push(toErrorMessage("Tenant audit", auditResult.reason));
  }

  const latestAudit =
    auditResult.status === "fulfilled"
      ? ([...auditResult.value]
          .filter(
            (entry) =>
              entry.resourceType === "tenant_sla" ||
              entry.actionName === "update_sla_profile",
          )
          .sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt),
          )[0] ?? null)
      : null;

  return {
    profile: profileResult.status === "fulfilled" ? profileResult.value : null,
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    latestAudit,
    errors,
  };
}

function buildRefreshSnapshot(
  profile: TenantSlaProfile | null,
  governance: TenantIntegrationGovernancePackage | null,
  latestAudit: AuditLogRecord | null,
  requestedFreshness: SupportedFreshness | null,
  errors: string[],
) {
  const generatedAt =
    profile?.updatedAt ??
    governance?.generatedAt ??
    latestAudit?.createdAt ??
    null;
  const staleAfterMs = 30_000;
  const freshness =
    requestedFreshness ??
    (() => {
      if (errors.length > 0) return "degraded";
      if (!generatedAt) return "unknown";
      const ageMs = Date.now() - new Date(generatedAt).getTime();
      return ageMs > staleAfterMs ? "stale" : "fresh";
    })();

  return {
    tierLabel: "T5 · 30s",
    freshness,
    generatedAt,
    sourceLabel: errors.length > 0 ? "cache/synthetic" : "live/synthetic",
    synthetic: true,
  } as const;
}

function buildAvailableActions(
  profile: TenantSlaProfile | null,
  requestedEmptyReason: SupportedEmptyReason | null,
  enableRecalculate: boolean,
): ResourceActionDescriptor[] {
  const noSnapshot = profile === null || requestedEmptyReason !== null;
  return [
    {
      action: "save",
      enabled: !noSnapshot,
      ...(noSnapshot ? { disabledReasonCode: "no_profile_snapshot" } : {}),
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "recalculate",
      enabled: !noSnapshot && enableRecalculate,
      disabledReasonCode: noSnapshot
        ? "no_profile_snapshot"
        : "command_not_available",
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

export default async function SlaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadSlaPageData();
  const resolvedSearchParams = await searchParams;
  const requestedEmptyReasonRaw = Array.isArray(resolvedSearchParams.empty)
    ? resolvedSearchParams.empty[0]
    : resolvedSearchParams.empty;
  const requestedFreshnessRaw = Array.isArray(resolvedSearchParams.freshness)
    ? resolvedSearchParams.freshness[0]
    : resolvedSearchParams.freshness;
  const requestedEmptyReason =
    requestedEmptyReasonRaw && isSupportedEmptyReason(requestedEmptyReasonRaw)
      ? (requestedEmptyReasonRaw as EmptyReason)
      : null;
  const requestedFreshness =
    requestedFreshnessRaw && isSupportedFreshness(requestedFreshnessRaw)
      ? requestedFreshnessRaw
      : null;
  const refresh = buildRefreshSnapshot(
    data.profile,
    data.governance,
    data.latestAudit,
    requestedFreshness,
    data.errors,
  );
  const availableActions = buildAvailableActions(
    data.profile,
    requestedEmptyReason as SupportedEmptyReason | null,
    resolvedSearchParams.recalculate === "enabled",
  );
  const opsConsoleUrl =
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
  const platformAdminUrl =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3004";

  return (
    <SlaProfileManager
      profile={data.profile}
      governance={data.governance}
      latestAudit={data.latestAudit}
      errors={data.errors}
      emptyReason={requestedEmptyReason}
      refresh={refresh}
      availableActions={availableActions}
      opsConsoleUrl={opsConsoleUrl}
      platformAdminUrl={platformAdminUrl}
    />
  );
}
