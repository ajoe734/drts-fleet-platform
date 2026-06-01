import type {
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";

// Receipt-style flash surfaced after a tenant-user write (Q-X09 / Q-X10
// confirmation pattern). The backend `createTenantUser` / `updateTenantRole`
// commands return an untyped body, so we never read fields off the result —
// the flash is built from the action outcome only.
export type UsersFlashPayload = {
  tone: "success" | "warning";
  title: string;
  description: string;
};

// /users is T5 "tenant slow" (30s) per packet §3.2.
export const USERS_REFRESH_TIER: RefreshTier = "slow";
export const USERS_STALE_AFTER_MS = 30_000;

// The 6 tenant-relevant EmptyReason variants (packet §3.6 — the
// driver-only `driver_not_eligible` reason is excluded).
export const TENANT_EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

// Route-level capability templates. The canonical backend does not emit a
// per-resource `availableActions[]` for tenant users, so the descriptors are
// derived here from the published create/update contracts (packet §5.7
// contract note) and the per-row `enabled` flag is recomputed from status.
// CTAs are still routed through `ResourceActionDescriptor` instead of being
// hard-coded by role (packet §3.5).
export const USERS_ROUTE_ACTIONS: readonly ResourceActionDescriptor[] = [
  { action: "invite_user", enabled: true, riskLevel: "medium" },
  { action: "update_role", enabled: true, riskLevel: "medium" },
  {
    action: "suspend_user",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  },
  { action: "reactivate_user", enabled: true, riskLevel: "medium" },
] as const;
