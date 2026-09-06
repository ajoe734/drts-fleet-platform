/**
 * Ops Assistant — audit deep-link resolution (SR-OPS-SHELL-001 / R18).
 *
 * `ActionReceipt.auditId` (packages/contracts/src/ui-runtime.ts §Q-X09/Q-X10)
 * is documented to resolve to a `CrossAppResourceLink` to the owning app's
 * `/audit?auditId=…` — ops-console-web ships no `/audit` route itself (it
 * lives in platform-admin-web), so a same-origin relative fallback 404s.
 * This mirrors the `_apps/platform-admin` convention already used by
 * `lib/ops-cross-app-links.ts` instead of inventing a second base-URL
 * resolution.
 */

import { crossAppHref } from "../../lib/ops-cross-app-links";

export function resolveAssistantAuditHref(
  explicitHref: string | null | undefined,
  auditId: string,
): string {
  if (explicitHref) {
    return explicitHref;
  }

  return crossAppHref({
    targetApp: "platform-admin",
    route: `/audit?auditId=${encodeURIComponent(auditId)}`,
    resourceType: "audit",
    resourceId: auditId,
    openMode: "new_tab",
    label: "View audit",
  });
}
