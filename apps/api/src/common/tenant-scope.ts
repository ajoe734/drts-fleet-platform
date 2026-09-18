import { HttpStatus } from "@nestjs/common";

import { ApiRequestError } from "./api-envelope";

export interface TenantScopedIdentity {
  realm?: string | null;
  tenantId?: string | null;
}

export type TenantVisibility =
  | { scope: "all" }
  | { scope: "tenant"; tenantId: string };

/**
 * What a caller is allowed to see, decided once instead of per handler.
 *
 * Five places wrote this by hand, all in the same shape:
 *
 *   identity?.realm === "tenant" && identity.tenantId ? scoped : everything
 *
 * The condition narrows, and its `else` is the whole table. So a tenant-realm
 * identity carrying no `tenantId` falls through to every tenant's data --
 * invoices, reconciliation issues, audit logs, security events. Whether that
 * identity can exist depends on a chain nobody had asserted anywhere: bootstrap
 * headers are refused in production and staging, a real tenant token takes its
 * `tenantId` from the signed payload, and the OIDC login accepts `tenant_id` as
 * an optional query parameter. Proving the chain holds is worth less than not
 * needing it to.
 *
 * This fails closed instead. A tenant or partner caller with no tenant is an
 * error, not a superuser.
 */
export function resolveTenantVisibility(
  identity: TenantScopedIdentity | null | undefined,
): TenantVisibility {
  const realm = identity?.realm ?? null;

  if (realm === "tenant" || realm === "partner") {
    const tenantId = identity?.tenantId?.trim();
    if (!tenantId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "TENANT_SCOPE_REQUIRED",
        "This caller is scoped to a tenant but no tenant could be resolved for the request.",
        { realm },
      );
    }
    return { scope: "tenant", tenantId };
  }

  return { scope: "all" };
}

/**
 * Filters records to what the caller may see.
 *
 * A record with no tenant is platform-level and stays out of a tenant's view.
 * The hand-written filters treated `record.tenantId && record.tenantId !== mine`
 * as the test, which let a tenant read -- and in the reconciliation case
 * resolve and reopen -- any record whose tenant was null.
 */
export function filterToTenantVisibility<
  T extends { tenantId?: string | null },
>(items: readonly T[], visibility: TenantVisibility): T[] {
  if (visibility.scope === "all") {
    return [...items];
  }
  return items.filter((item) => item.tenantId === visibility.tenantId);
}

/** Throws unless the caller may act on this record. */
export function assertTenantVisibility(
  recordTenantId: string | null | undefined,
  visibility: TenantVisibility,
  context: Record<string, unknown> = {},
): void {
  if (visibility.scope === "all") {
    return;
  }
  if (recordTenantId !== visibility.tenantId) {
    throw new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "NOT_FOUND",
      "No such record for this tenant.",
      context,
    );
  }
}
