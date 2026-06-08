/**
 * Ops Assistant — server-side envelope seeds (design handoff §5).
 *
 * Resolves the identity slice and an initial health snapshot on the server so
 * the `OpsAssistantContextProvider` is seeded with the same values for SSR and
 * the first client render (no hydration drift). Identity comes from the live
 * `/api/identity/context` read; if that read fails the provider still mounts
 * with an honest bootstrap fallback rather than crashing the shell.
 */

import "server-only";
import { getServerOpsClient } from "@/lib/api-client.server";
import type { IdentityContext, UiHealthEnvelope } from "@drts/contracts";
import type { OpsAssistantIdentity } from "@/components/ops-assistant";

function resolveEnv(): string {
  return (
    process.env.DRTS_ENV ||
    process.env.NEXT_PUBLIC_DRTS_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

/**
 * Bootstrap identity matching the ops-console client bootstrap (`api-client.ts`
 * uses actorType `ops_user`, realm `ops`). Used when the identity read is
 * unavailable so the envelope is always populated.
 */
function bootstrapIdentity(): OpsAssistantIdentity {
  return {
    actorType: "ops_user",
    realm: "ops",
    env: resolveEnv(),
  };
}

/**
 * Resolve the §5 identity slice from the live identity context, falling back to
 * the bootstrap identity on any failure.
 */
export async function resolveOpsAssistantIdentity(): Promise<OpsAssistantIdentity> {
  const env = resolveEnv();
  try {
    const client = await getServerOpsClient();
    const identity = (await client.getIdentityContext()) as IdentityContext;
    return {
      actorType: identity.actorType,
      realm: identity.realm,
      ...(identity.tenantId ? { tenant: identity.tenantId } : {}),
      env,
    };
  } catch {
    return bootstrapIdentity();
  }
}

/**
 * Seed health for the envelope. The shell does not yet expose a single
 * `UiHealthEnvelope` read, so we seed a healthy snapshot with a stable
 * (server-rendered) timestamp; the shell/pages republish real health at runtime
 * via `setAssistantHealth`. The timestamp is generated on the server only so the
 * client render reuses the serialized value without hydration mismatch.
 */
export function seedOpsAssistantHealth(): UiHealthEnvelope {
  return {
    status: "healthy",
    degradedServices: [],
    lastCheckedAt: new Date().toISOString(),
  };
}
