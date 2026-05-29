import type {
  CrossAppResourceLink,
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  TenantSlaProfile,
  UiRefreshMetadata,
} from "@drts/contracts";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { SlaProfileManager } from "./sla-profile-manager";
import {
  SLA_ACTION_UPDATE,
  SLA_EMPTY_REASON_META,
  SLA_REFRESH_TIER,
  type SlaEmptyReason,
  buildSlaAvailableActions,
} from "./constants";

export const dynamic = "force-dynamic";

// Q-X02 fixed cadence: the `slow` tier (T5) refreshes every 30s.
const SLA_STALE_AFTER_MS = 30_000;

const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3002";

export type SlaPageData = {
  profile: TenantSlaProfile | null;
  emptyState: EmptyStateEnvelope | null;
  refreshMetadata: UiRefreshMetadata;
  availableActions: ResourceActionDescriptor[];
  crossAppLink: CrossAppResourceLink;
  errors: string[];
};

/**
 * Classify a failed `getSlaProfile()` call into a distinct EmptyReason
 * (Q-X15) so the UI never collapses "could not load" into "not configured".
 * The api-client throws `Error("API error <status>: …")`; a thrown
 * `TypeError`/`AbortError` is a transport failure.
 */
function classifyFetchFailure(reason: unknown): SlaEmptyReason {
  if (reason instanceof Error) {
    const statusMatch = reason.message.match(/API error (\d{3})/);
    if (statusMatch) {
      const status = Number(statusMatch[1]);
      if (status === 401 || status === 403) {
        return "permission_denied";
      }
      if (status === 404) {
        return "not_provisioned";
      }
      if (status === 502 || status === 503 || status === 504) {
        return "external_unavailable";
      }
      return "fetch_failed";
    }

    if (reason.name === "AbortError" || reason.name === "TypeError") {
      return "external_unavailable";
    }
  }

  return "fetch_failed";
}

function isProvisioned(
  profile: TenantSlaProfile | null,
): profile is TenantSlaProfile {
  return (
    profile !== null &&
    typeof profile.waitThresholdMin === "number" &&
    typeof profile.arrivalThresholdMin === "number" &&
    typeof profile.completionThresholdMin === "number"
  );
}

function buildEmptyState(
  reason: SlaEmptyReason,
  nextAction?: ResourceActionDescriptor,
): EmptyStateEnvelope {
  return {
    reason,
    messageCode: SLA_EMPTY_REASON_META[reason].messageCode,
    ...(nextAction ? { nextAction } : {}),
  };
}

function buildCrossAppLink(tenantId: string): CrossAppResourceLink {
  // SLA breaches are monitored operationally in ops-console (Q-X03 cross-app
  // deep link, opened in a new tab so the tenant admin keeps this page open).
  return {
    targetApp: "ops-console",
    route: `${OPS_CONSOLE_URL}/complaints?tenantId=${encodeURIComponent(tenantId)}&slaBreached=true`,
    resourceType: "tenant_sla",
    resourceId: tenantId,
    openMode: "new_tab",
    label: "在 Ops Console 檢視 SLA 違規",
  };
}

async function loadSlaPageData(): Promise<SlaPageData> {
  const client = getTenantClient();
  const errors: string[] = [];

  const [profileResult] = await Promise.allSettled([
    client.getSlaProfile() as Promise<TenantSlaProfile | null>,
  ]);

  const refreshMetadata: UiRefreshMetadata = {
    generatedAt: new Date().toISOString(),
    staleAfterMs: SLA_STALE_AFTER_MS,
    dataFreshness: profileResult.status === "fulfilled" ? "fresh" : "unknown",
    source: "live",
  };

  const crossAppLink = buildCrossAppLink(DEMO_TENANT_ID);

  if (profileResult.status === "rejected") {
    const reason = classifyFetchFailure(profileResult.reason);
    errors.push(
      profileResult.reason instanceof Error
        ? profileResult.reason.message
        : "Unable to load tenant SLA profile.",
    );

    return {
      profile: null,
      emptyState: buildEmptyState(reason),
      refreshMetadata,
      availableActions: buildSlaAvailableActions(null),
      crossAppLink,
      errors,
    };
  }

  const profile = profileResult.value;

  if (!isProvisioned(profile)) {
    // First-time tenant: surface a "Configure SLA" CTA in the empty state.
    const [configureAction] = buildSlaAvailableActions(null).filter(
      (action) => action.action === SLA_ACTION_UPDATE,
    );

    return {
      profile: null,
      emptyState: buildEmptyState("not_provisioned", configureAction),
      refreshMetadata,
      availableActions: buildSlaAvailableActions(null),
      crossAppLink,
      errors,
    };
  }

  return {
    profile,
    emptyState: null,
    refreshMetadata,
    availableActions: buildSlaAvailableActions(profile),
    crossAppLink,
    errors,
  };
}

export default async function SlaPage() {
  const pageData = await loadSlaPageData();
  return <SlaProfileManager {...pageData} refreshTier={SLA_REFRESH_TIER} />;
}
