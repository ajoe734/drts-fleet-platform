import { describe, expect, it } from "vitest";

import {
  AGENCY_PORTAL_EXPORT_SCOPES,
  AGENCY_PORTAL_READ_SCOPES,
  IAM_ACTOR_POLICY_DEFINITIONS,
  IAM_ACTOR_TYPES,
  IAM_AGENCY_ROLE_POLICY_DEFINITIONS,
  IAM_REALMS,
  IAM_ROLE_FAMILIES,
  getIamActorPolicy,
  getIamActorScopePresets,
  getIamAgencyRoleScopes,
  getIamScopeDefinition,
} from "../../../packages/contracts/src/iam-policy-catalog";
import {
  AGENCY_WRITE_ROUTE_ALLOWLIST,
  AUTH_ROLE_FAMILY_FROM_ACTOR_TYPE,
  AUTH_SCOPE_PRESETS,
  getAgencyRoleScopes,
} from "../../../apps/api/src/common/auth/auth.constants";
import { extractBootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.extractor";
import { AUTH_REALM_PATH_MATRIX } from "../../../apps/api/src/common/auth/auth.matrix";
import {
  AUTH_ACTOR_TYPES,
  AUTH_REALMS,
  AUTH_ROLE_FAMILIES,
} from "../../../apps/api/src/common/auth/auth.types";
import { resolveRouteStepUpPolicy } from "../../../apps/api/src/common/auth/step-up.policy";
import {
  assertEvidenceAccess,
  getEvidenceRetentionPolicy,
} from "../../../apps/api/src/common/evidence-governance";

// BUREAU-R13 §2.1-2.2: the agency realm, actor, role family and scopes exist
// in the shared catalog, presets are never undefined (SR-WIRE-001 lesson) and
// the four agency data scopes never leak into an existing actor policy.
const AGENCY_DATA_SCOPES = [
  "agency:trip_records:read",
  "agency:trip_records:export",
  "agency:reports:read",
  "agency:qualifications:read",
];
const AGENCY_ADMIN_SCOPES = [
  "agency:directory:read",
  "agency:directory:write",
  "agency:access_audit:read",
];

describe("BUREAU-R13 agency IAM catalog", () => {
  it("registers the agency realm, agency_user actor and agency role family in both catalogs", () => {
    expect(IAM_ACTOR_TYPES).toContain("agency_user");
    expect(IAM_REALMS).toContain("agency");
    expect(IAM_ROLE_FAMILIES).toContain("agency");
    expect(AUTH_ACTOR_TYPES).toContain("agency_user");
    expect(AUTH_REALMS).toContain("agency");
    expect(AUTH_ROLE_FAMILIES).toContain("agency");
    expect(AUTH_ROLE_FAMILY_FROM_ACTOR_TYPE.agency_user).toEqual(["agency"]);
  });

  it("defines a least-privileged agency_user actor policy whose preset is never undefined", () => {
    const policy = getIamActorPolicy("agency_user");
    expect(policy.realm).toBe("agency");
    expect(policy.roleFamilies).toEqual(["agency"]);
    expect(policy.defaultRoles).toEqual(["agency_viewer"]);
    expect([...policy.scopes].sort()).toEqual(
      [...AGENCY_PORTAL_READ_SCOPES].sort(),
    );
    expect(getIamActorScopePresets().agency_user).toBeDefined();
    expect(AUTH_SCOPE_PRESETS.agency_user).toBeDefined();
    expect(AUTH_SCOPE_PRESETS.agency_user).not.toContain(
      "agency:trip_records:export",
    );
  });

  it("supports both agency_viewer and agency_exporter role policies (D3)", () => {
    expect(
      IAM_AGENCY_ROLE_POLICY_DEFINITIONS.map(
        (definition) => definition.roleCode,
      ),
    ).toEqual(["agency_viewer", "agency_exporter"]);
    expect([...(getIamAgencyRoleScopes("agency_viewer") ?? [])].sort()).toEqual(
      [...AGENCY_PORTAL_READ_SCOPES].sort(),
    );
    expect([...(getAgencyRoleScopes("agency_exporter") ?? [])].sort()).toEqual(
      [...AGENCY_PORTAL_READ_SCOPES, ...AGENCY_PORTAL_EXPORT_SCOPES].sort(),
    );
    expect(getAgencyRoleScopes("tenant_admin")).toBeNull();
    expect(getAgencyRoleScopes("agency_admin")).toBeNull();
  });

  it("scopes agency data to the agency realm with an agencyId constraint and admin scopes to the platform realm", () => {
    for (const scope of AGENCY_DATA_SCOPES) {
      const definition = getIamScopeDefinition(scope);
      expect(definition?.allowedRealms).toEqual(["system", "agency"]);
      expect(
        definition?.resourceConstraints.find(
          (constraint) => constraint.kind === "agency",
        )?.claimKey,
      ).toBe("agencyId");
    }
    for (const scope of AGENCY_ADMIN_SCOPES) {
      expect(getIamScopeDefinition(scope)?.allowedRealms).toEqual([
        "system",
        "platform",
      ]);
    }
  });

  it("never adds an agency data scope to an existing (non-agency) actor policy", () => {
    for (const definition of IAM_ACTOR_POLICY_DEFINITIONS) {
      if (definition.actorType === "agency_user") continue;
      for (const scope of AGENCY_DATA_SCOPES) {
        expect(definition.scopes).not.toContain(scope);
      }
    }
  });

  it("grants agency administration and access-log review only to platform_admin and system", () => {
    for (const definition of IAM_ACTOR_POLICY_DEFINITIONS) {
      const holdsAdmin = AGENCY_ADMIN_SCOPES.some((scope) =>
        definition.scopes.includes(scope),
      );
      expect(holdsAdmin).toBe(
        definition.actorType === "platform_admin" ||
          definition.actorType === "system",
      );
    }
    expect(AUTH_SCOPE_PRESETS.platform_admin).toEqual(
      expect.arrayContaining(AGENCY_ADMIN_SCOPES),
    );
    expect(AUTH_SCOPE_PRESETS.ops_user).not.toEqual(
      expect.arrayContaining(["agency:directory:read"]),
    );
  });

  it("maps a bootstrap agency_user without explicit scopes to the viewer preset (no undefined spread)", () => {
    const identity = extractBootstrapRequestIdentity(
      {
        "x-actor-type": "agency_user",
        "x-actor-id": "principal_agency_1",
        "x-agency-id": "agency_1",
        "x-membership-id": "membership_1",
      },
      { allowAnonymous: false },
    );
    expect(identity).toMatchObject({
      actorType: "agency_user",
      realm: "agency",
      agencyId: "agency_1",
      membershipId: "membership_1",
      principalId: "principal_agency_1",
      roleFamilies: ["agency"],
    });
    expect([...(identity?.scopes ?? [])].sort()).toEqual(
      [...AGENCY_PORTAL_READ_SCOPES].sort(),
    );

    const tenant = extractBootstrapRequestIdentity(
      { "x-actor-type": "tenant_admin", "x-agency-id": "agency_1" },
      { allowAnonymous: false },
    );
    expect(tenant?.realm).toBe("tenant");
    expect(tenant).not.toHaveProperty("agencyId");
  });

  it("publishes the agency realm as a public, non-IAP business-plane OIDC bearer path", () => {
    const agencyPath = AUTH_REALM_PATH_MATRIX.find(
      (record) => record.realm === "agency",
    );
    expect(agencyPath).toMatchObject({
      plane: "business_plane",
      primaryPath: "agency_oidc_bearer",
      bearerHeader: "authorization",
      defaultIapProtected: false,
      tokenIssuancePath: "/api/auth/agency/callback-session",
    });
  });

  it("keeps the agency write allowlist to export creation/preview and logout only", () => {
    expect([...AGENCY_WRITE_ROUTE_ALLOWLIST].sort()).toEqual(
      [
        "POST agency/trip-records/export-jobs/preview",
        "POST agency/trip-records/export-jobs",
        "POST auth/logout",
        "POST auth/logout-all",
      ].sort(),
    );
  });

  it("step-up gates platform invitation, deactivation and access-period changes", () => {
    expect(
      resolveRouteStepUpPolicy(
        "POST",
        "/api/platform-admin/agencies/agency_1/invitations",
        "platform",
      )?.actionId,
    ).toBe("platform:users:create");
    expect(
      resolveRouteStepUpPolicy(
        "POST",
        "/api/platform-admin/agencies/agency_1/members/m1/deactivate",
        "platform",
      )?.actionId,
    ).toBe("platform:users:role:update");
    expect(
      resolveRouteStepUpPolicy(
        "POST",
        "/api/platform-admin/agencies/agency_1/members/m1/access-period",
        "platform",
      )?.actionId,
    ).toBe("platform:users:role:update");
    // The pre-existing first rule for each reused action id is unchanged.
    expect(
      resolveRouteStepUpPolicy("POST", "/api/platform-admin/users", "platform")
        ?.description,
    ).toBe("Platform user invitation and privileged user creation");
  });

  it("lets only an agency exporter reach report_artifact evidence on the agency path", () => {
    const rule = getEvidenceRetentionPolicy("report_artifact").accessRules.find(
      (candidate) => candidate.realms.includes("agency"),
    );
    expect(rule).toEqual({
      realms: ["agency"],
      actorTypes: ["agency_user"],
      requiredScopes: ["agency:trip_records:export"],
      tenantScoped: false,
    });
    const viewer = {
      actorType: "agency_user" as const,
      actorId: "principal_agency_1",
      realm: "agency" as const,
      scopes: [...AGENCY_PORTAL_READ_SCOPES],
      tenantId: null,
      agencyId: "agency_1",
    };
    expect(() =>
      assertEvidenceAccess({ family: "report_artifact", identity: viewer }),
    ).toThrow();
    // An agency session with no scopes is not the bootstrap-admin shortcut.
    expect(() =>
      assertEvidenceAccess({
        family: "report_artifact",
        identity: { ...viewer, scopes: [] },
      }),
    ).toThrow();
    expect(
      assertEvidenceAccess({
        family: "report_artifact",
        identity: { ...viewer, scopes: ["agency:trip_records:export"] },
      }).family,
    ).toBe("report_artifact");
  });
});
