import { describe, expect, it } from "vitest";

import {
  IAM_ACTOR_TYPES,
  getIamActorPolicy,
  getIamActorScopePresets,
  getIamScopeDefinition,
} from "../../../../packages/contracts/src/iam-policy-catalog";

// SR-WIRE-001: Host role mapping.
//
// apps/fleet-partner-portal-web/app/host/lib/host-auth.server.ts already
// mints `x-actor-type: partner_user` requests for Host (individual owner)
// sessions, and apps/api/src/common/auth/auth.types.ts's AUTH_ACTOR_TYPES
// already lists "partner_user" as a request-time actor type. But
// AUTH_SCOPE_PRESETS (apps/api/src/common/auth/auth.constants.ts) is built
// by casting this catalog's `getIamActorScopePresets()` -- a
// Record<IamActorType, ...> -- straight to Record<AuthActorType, ...>
// without "partner_user" ever being a member of IamActorType. That leaves
// AUTH_SCOPE_PRESETS.partner_user `undefined` at runtime: any Host request
// that omits an explicit `x-scopes` header hits
// `[...AUTH_SCOPE_PRESETS[actorType]]` in auth.extractor.ts's
// `deriveScopes` and throws (spreading `undefined`). Registering the
// "partner_user" actor policy here is the fix -- this test would have
// caught the crash-by-omission before host-auth.server.ts's defensive
// "always send explicit x-scopes" workaround was needed.
describe("SR-WIRE-001: Host (partner_user) IAM role mapping", () => {
  it("registers partner_user as a known IAM actor type", () => {
    expect(IAM_ACTOR_TYPES).toContain("partner_user");
  });

  it("defines a partner_user actor policy matching Host's own HOST_SCOPES", () => {
    const policy = getIamActorPolicy("partner_user");
    expect(policy.realm).toBe("partner");
    expect(policy.roleFamilies).toEqual(["partner"]);
    expect(policy.scopes).toEqual(
      expect.arrayContaining(["owned:read", "reports:read", "maintenance:read"]),
    );
  });

  it("produces a non-undefined scope preset for partner_user (regression guard for the AUTH_SCOPE_PRESETS cast)", () => {
    const presets = getIamActorScopePresets();
    expect(presets.partner_user).toBeDefined();
    expect([...presets.partner_user]).toEqual(
      expect.arrayContaining(["owned:read", "reports:read", "maintenance:read"]),
    );
  });

  it.each(["owned:read", "reports:read", "maintenance:read"] as const)(
    "allows the partner realm for %s (Host's realm)",
    (scope) => {
      const definition = getIamScopeDefinition(scope);
      expect(definition?.allowedRealms).toContain("partner");
    },
  );
});
