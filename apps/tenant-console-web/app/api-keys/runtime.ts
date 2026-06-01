import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantApiKeyRecord,
  TenantIntegrationGovernancePackage,
  UiRefreshMetadata,
} from "@drts/contracts";

// ---------------------------------------------------------------------------
// Operating context (design hand-off packet §3.2 / §3.5 / §3.6 / §3.10)
//
// `/api-keys` is a T5 "tenant slow" route (30s cadence). The backend list
// endpoint currently returns a plain `TenantApiKeyRecord[]` (see
// ApiClient.listApiKeys -> getList), so the availableActions / cross-app /
// refresh envelope is *synthesised* here rather than assumed on the wire — the
// same defensive pattern ops-console-web/app/vehicles/page.tsx uses. If the API
// later emits these fields we read them; until then we derive them without
// casting the client into a contract it does not honour.
// ---------------------------------------------------------------------------

export type ApiKeyState = "active" | "expiring" | "expired" | "revoked";

export type ResolvedCrossAppLink = CrossAppResourceLink & { href: string };

export type ApiKeyRuntimeRecord = TenantApiKeyRecord & {
  state: ApiKeyState;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: ResolvedCrossAppLink[];
  auditHref: string;
};

const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** T5 tenant-slow cadence — 30 seconds (packet §3.2). */
export const API_KEYS_STALE_AFTER_MS = 30_000;
export const API_KEYS_REFRESH_TIER_LABEL = "T5 · 30s";

export const API_KEY_EMPTY_REASONS = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies readonly EmptyReason[];

export type ApiKeyEmptyReason = (typeof API_KEY_EMPTY_REASONS)[number];

/** Stable message codes surfaced alongside each empty state for audit/QA. */
export const API_KEY_EMPTY_REASON_CODES: Record<ApiKeyEmptyReason, string> = {
  no_data: "api_keys_empty",
  not_provisioned: "api_keys_not_provisioned",
  fetch_failed: "api_keys_fetch_failed",
  permission_denied: "api_keys_permission_denied",
  external_unavailable: "api_keys_governance_unavailable",
  filtered_empty: "api_keys_filtered_empty",
};

export function resolveApiKeyState(
  apiKey: TenantApiKeyRecord,
  nowMs: number,
): ApiKeyState {
  if (apiKey.revokedAt) {
    return "revoked";
  }

  if (apiKey.expiresAt) {
    const expiresMs = new Date(apiKey.expiresAt).getTime();
    if (!Number.isNaN(expiresMs)) {
      if (expiresMs <= nowMs) {
        return "expired";
      }
      if (expiresMs - nowMs <= EXPIRING_WINDOW_MS) {
        return "expiring";
      }
    }
  }

  return "active";
}

// --- Cross-app deep links (packet §3.10 — open in new tab) -----------------

function resolveAppOrigin(
  targetApp: CrossAppResourceLink["targetApp"],
): string {
  const envCandidates =
    targetApp === "platform-admin"
      ? [
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
          process.env.PLATFORM_ADMIN_ORIGIN,
          process.env.DEV_PLATFORM_ADMIN_ORIGIN,
          process.env.STAGING_PLATFORM_ADMIN_ORIGIN,
          process.env.PROD_PLATFORM_ADMIN_ORIGIN,
        ]
      : targetApp === "ops-console"
        ? [
            process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
            process.env.OPS_CONSOLE_ORIGIN,
            process.env.DEV_OPS_CONSOLE_ORIGIN,
            process.env.STAGING_OPS_CONSOLE_ORIGIN,
            process.env.PROD_OPS_CONSOLE_ORIGIN,
          ]
        : [
            process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN,
            process.env.TENANT_CONSOLE_ORIGIN,
          ];

  const resolved = envCandidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (resolved) {
    return resolved.replace(/\/$/, "");
  }

  if (targetApp === "platform-admin") return "http://localhost:3002";
  if (targetApp === "ops-console") return "http://localhost:3003";
  return "http://localhost:3004";
}

export function buildCrossAppHref(link: CrossAppResourceLink): string {
  if (link.route.startsWith("http://") || link.route.startsWith("https://")) {
    return link.route;
  }

  const path = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return `${resolveAppOrigin(link.targetApp)}${path}`;
}

function resolveLink(link: CrossAppResourceLink): ResolvedCrossAppLink {
  return { ...link, href: buildCrossAppHref(link) };
}

/**
 * Page-level cross-app deep links. Tenant integration managers escalate
 * break-glass / governance posture into platform-admin (read-scoped, new tab
 * per Q-X03). These are derived from the published governance policy.
 */
export function buildPageCrossAppLinks(
  governance: TenantIntegrationGovernancePackage | null,
): ResolvedCrossAppLink[] {
  const links: CrossAppResourceLink[] = [
    {
      targetApp: "platform-admin",
      route: "/integration-governance?topic=api-keys",
      resourceType: "tenant_integration_governance",
      resourceId: governance?.tenantId ?? "unknown",
      openMode: "new_tab",
      label: "平台整合治理",
    },
  ];

  if (governance?.apiKeyPolicy.breakGlassRequiresPlatformApproval) {
    links.push({
      targetApp: "platform-admin",
      route: "/approvals?topic=api_key_break_glass",
      resourceType: "break_glass_approval",
      resourceId: governance.tenantId,
      openMode: "new_tab",
      label: "Break-glass 平台簽核",
    });
  }

  return links.map(resolveLink);
}

// --- availableActions synthesis (packet §3.5 — never hard-code by role) ----

function synthesizeApiKeyActions(
  state: ApiKeyState,
): ResourceActionDescriptor[] {
  const terminal = state === "revoked";
  const disabledReasonCode = terminal ? "already_revoked" : undefined;

  return [
    {
      action: "open_audit",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "rotate",
      enabled: !terminal,
      ...(disabledReasonCode ? { disabledReasonCode } : {}),
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "revoke",
      enabled: !terminal,
      ...(disabledReasonCode ? { disabledReasonCode } : {}),
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

/** Page header CTA. Issuing requires a published scope catalogue. */
export function buildPageActions(
  governance: TenantIntegrationGovernancePackage | null,
): ResourceActionDescriptor[] {
  const canIssue = (governance?.apiKeyPolicy.allowedScopes.length ?? 0) > 0;

  return [
    {
      action: "issue",
      enabled: canIssue,
      ...(canIssue ? {} : { disabledReasonCode: "governance_unavailable" }),
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

function buildAuditHref(apiKey: TenantApiKeyRecord): string {
  return `/audit?resourceType=api_key&resourceId=${encodeURIComponent(apiKey.apiKeyId)}`;
}

/**
 * Promote a raw API key record into a runtime row, honouring any
 * server-provided availableActions/crossAppLinks and synthesising the rest.
 */
export function buildApiKeyRow(
  apiKey: TenantApiKeyRecord,
  nowMs: number,
): ApiKeyRuntimeRecord {
  const state = resolveApiKeyState(apiKey, nowMs);
  const provided = apiKey as TenantApiKeyRecord & {
    availableActions?: ResourceActionDescriptor[];
    crossAppLinks?: CrossAppResourceLink[];
  };

  const availableActions =
    provided.availableActions && provided.availableActions.length > 0
      ? provided.availableActions
      : synthesizeApiKeyActions(state);

  const crossAppLinks =
    provided.crossAppLinks && provided.crossAppLinks.length > 0
      ? provided.crossAppLinks.map(resolveLink)
      : [];

  return {
    ...apiKey,
    state,
    availableActions,
    crossAppLinks,
    auditHref: buildAuditHref(apiKey),
  };
}

export function synthesizeRefreshMetadata(
  generatedAt: string,
  dataFreshness: UiRefreshMetadata["dataFreshness"] = "fresh",
): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs: API_KEYS_STALE_AFTER_MS,
    dataFreshness,
    source: "live",
  };
}

// --- Empty-state resolution (packet §3.6 — 6 distinct reasons) -------------

function looksLikePermissionError(message: string): boolean {
  return /\b(403|forbidden|permission|denied|unauthori[sz]ed|scope)\b/i.test(
    message,
  );
}

/**
 * Terminal (non-filter) empty reason for the keys list. `filtered_empty` is
 * resolved client-side once the active status/search filters are known.
 */
export function resolveServerEmptyReason(input: {
  apiKeysError: string | null;
  governanceError: string | null;
  governance: TenantIntegrationGovernancePackage | null;
  keyCount: number;
}): ApiKeyEmptyReason | null {
  const { apiKeysError, governanceError, governance, keyCount } = input;

  if (apiKeysError) {
    return looksLikePermissionError(apiKeysError)
      ? "permission_denied"
      : "fetch_failed";
  }

  if (keyCount > 0) {
    return null;
  }

  // No keys, list call succeeded — distinguish "not configured" from "down".
  if (!governance) {
    return "external_unavailable";
  }

  if (governance.apiKeyPolicy.allowedScopes.length === 0) {
    return "not_provisioned";
  }

  if (governanceError) {
    return "external_unavailable";
  }

  return "no_data";
}
