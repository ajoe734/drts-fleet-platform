import { describe, expect, it } from "vitest";

import {
  getIamActorScopePreset,
  getIamScopeDefinition,
  getIamTenantRoleScopes,
  IAM_POLICY_CATALOG_VERSION,
  isKnownIamScope,
} from "@drts/contracts";
import { issueControlPlaneRequestAuth } from "../../packages/control-plane-auth/src";
import {
  getIamCapabilityHint,
  listIamCapabilityHints,
} from "../../packages/ui-web/src/iam-capability-hints";
import {
  AUTH_SCOPE_PRESETS,
  getTenantRoleScopes,
} from "../../apps/api/src/common/auth/auth.constants";

describe("IAM policy catalog", () => {
  it("drives the API and control-plane actor scope presets from one source", () => {
    expect(AUTH_SCOPE_PRESETS.platform_admin).toEqual(
      getIamActorScopePreset("platform_admin"),
    );
    expect(
      issueControlPlaneRequestAuth({ actorType: "platform_admin" }).identity
        .scopes,
    ).toEqual(getIamActorScopePreset("platform_admin"));
    expect(
      issueControlPlaneRequestAuth({ actorType: "ops_user" }).identity.scopes,
    ).toEqual(getIamActorScopePreset("ops_user"));
  });

  it("denies unknown scopes and unknown tenant role codes", () => {
    expect(isKnownIamScope("identity:users:delete")).toBe(false);
    expect(getIamScopeDefinition("identity:users:delete")).toBeNull();
    expect(getTenantRoleScopes("tenant_root")).toBeNull();
    expect(getIamTenantRoleScopes("tenant_root")).toBeNull();
  });

  it("keeps the identity:read migration alias least-privilege", () => {
    const identityRead = getIamScopeDefinition("identity:read");

    expect(identityRead?.impliedScopes).toEqual([
      "identity:users:read",
      "identity:roles:read",
      "identity:sessions:read",
    ]);
    expect(identityRead?.impliedScopes).not.toContain("identity:users:manage");
    expect(identityRead?.impliedScopes).not.toContain("security:audit:export");
  });

  it("represents tenant and object constraints in shared metadata", () => {
    expect(
      getIamScopeDefinition("tenant:webhooks:write")?.resourceConstraints.map(
        (constraint) => constraint.kind,
      ),
    ).toEqual(["tenant", "object"]);
    expect(
      getIamScopeDefinition("partner:book")?.resourceConstraints.map(
        (constraint) => constraint.kind,
      ),
    ).toEqual(["tenant", "partner", "partner_entry", "object"]);
  });

  it("publishes UI capability hints from the same shared scope definitions", () => {
    expect(getIamCapabilityHint("partner:book")).toMatchObject({
      scope: "partner:book",
      constraintKinds: ["tenant", "partner", "partner_entry", "object"],
    });
    expect(
      listIamCapabilityHints(["identity:read", "tenant:webhooks:write"]).map(
        (hint) => hint.scope,
      ),
    ).toEqual(["identity:read", "tenant:webhooks:write"]);
  });

  it("exposes a stable catalog version for drift checks", () => {
    expect(IAM_POLICY_CATALOG_VERSION).toBe("2026-08-01.rbac-001");
  });
});
