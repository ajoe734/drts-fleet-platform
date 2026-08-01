import { describe, expect, it } from "vitest";

import { signTestIapJwtAssertion } from "@drts/control-plane-auth";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { IAPSubjectAdapter } from "../../apps/api/src/modules/auth/iap-subject.adapter";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";

const TEST_SECRET = "iap_test_secret_key_32chars_long_min!";
const EXPECTED_AUDIENCE = "/projects/9876543210/apps/drts-fleet-prod";

function signTestIapToken(payload: Record<string, any>): string {
  return signTestIapJwtAssertion(
    {
      iss: "https://cloud.google.com/iap",
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: EXPECTED_AUDIENCE,
      ...payload,
    },
    TEST_SECRET,
  );
}

describe("IAPSubjectAdapter", () => {
  it("resolves a verified IAP subject to durable membership", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const token = signTestIapToken({
      sub: "accounts.google.com:1001",
      email: "admin@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    const result = await adapter.resolveSubject(
      {
        "x-goog-iap-jwt-assertion": token,
      },
      {
        expectedAudience: EXPECTED_AUDIENCE,
        jwtSecretOrPublicKey: TEST_SECRET,
        autoProvision: true,
      },
    );

    expect(result.principal.subject).toBe("accounts.google.com:1001");
    expect(result.principal.email).toBe("admin@platform.drts");
    expect(result.effectiveRoles).toContain("superadmin");
    expect(result.effectiveScopes).toContain("foundation:write");
    expect(result.effectiveScopes).toContain("tenant:webhooks:write");
    expect(result.effectiveScopes).toContain("tenant:sla:write");
    expect(result.effectiveScopes).toContain("reports:write");
    expect(result.effectiveScopes).toContain("forwarder:write");
    expect(result.effectiveScopes).toContain("multi_taxi_ratings:read");
    expect(result.driftDetected).toBe(false);

    const recentEvents = await securityEventsService.listEvents(null, {
      eventType: "iap_subject.resolved",
    });
    expect(recentEvents.length).toBeGreaterThan(0);
  });

  it("fails closed when unmapped subject attempts login without autoProvision", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const unmappedToken = signTestIapToken({
      sub: "unmapped_sub_9999",
      email: "unknown-user@platform.drts",
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": unmappedToken },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    expect(caught?.status).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
  });

  it("ignores spoofed email and role headers without valid assertion token", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    await expect(
      adapter.resolveSubject(
        {
          "x-goog-authenticated-user-email": "spoofed@platform.drts",
          "x-roles": "superadmin",
          "x-scopes": "all:access",
        },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
          strictIapMode: true,
        },
      ),
    ).rejects.toThrowError(ApiRequestError);

    const deniedEvents = await securityEventsService.listEvents(null, {
      eventType: "iap_subject.denied",
    });
    expect(deniedEvents.length).toBeGreaterThan(0);
  });

  it("fails closed when IAP assertion audience is wrong", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const wrongAudToken = signTestIapToken({
      sub: "accounts.google.com:1002",
      email: "ops@platform.drts",
      aud: "/projects/00000/wrong-audience",
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        {
          "x-goog-iap-jwt-assertion": wrongAudToken,
        },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    expect(caught?.status).toBe(403);
    expect(caught?.code).toBe("IAP_AUDIENCE_MISMATCH");
  });

  it("fails closed when unmapped subject attempts autoProvision without valid workforce group", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const token = signTestIapToken({
      sub: "unmapped_sub_99",
      email: "guest@external.com",
      gcp_ia_groups: ["unmapped-group@external.com"],
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": token },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
          autoProvision: true,
        },
      );
    } catch (err) {
      if (err instanceof ApiRequestError) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    expect(caught?.status).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
    const resp = caught?.getResponse() as any;
    expect(resp?.error?.message).toContain("Unmapped workforce user subject has no valid group membership.");
  });

  it("fails closed when workforce user or membership is inactive/suspended/disabled", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_suspended_001",
        sourceRef: "iap_subject:suspended_user_sub",
        issuer: "google_iap",
        subject: "suspended_user_sub",
        principalType: "human",
        email: "suspended@platform.drts",
        emailVerified: true,
        displayName: "Suspended User",
        status: "suspended",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_suspended_001",
        sourceRef: "iap_membership:suspended_user_sub",
        principalId: "principal_suspended_001",
        realm: "ops",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "suspended",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [],
    );

    const token = signTestIapToken({
      sub: "suspended_user_sub",
      email: "suspended@platform.drts",
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        {
          "x-goog-iap-jwt-assertion": token,
        },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    expect(caught?.status).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
  });

  it("fails closed when workforce user status is disabled", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_disabled_001",
        sourceRef: "iap_subject:disabled_user_sub",
        issuer: "google_iap",
        subject: "disabled_user_sub",
        principalType: "human",
        email: "disabled@platform.drts",
        emailVerified: true,
        displayName: "Disabled User",
        status: "disabled",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_disabled_001",
        sourceRef: "iap_membership:disabled_user_sub",
        principalId: "principal_disabled_001",
        realm: "ops",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [],
    );

    const token = signTestIapToken({
      sub: "disabled_user_sub",
      email: "disabled@platform.drts",
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        {
          "x-goog-iap-jwt-assertion": token,
        },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    expect(caught?.status).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
  });

  it("detects group drift, applies least privilege downgrade, and emits alert event", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_drift_001",
        sourceRef: "iap_subject:drift_user_sub",
        issuer: "google_iap",
        subject: "drift_user_sub",
        principalType: "human",
        email: "drifted@platform.drts",
        emailVerified: true,
        displayName: "Drifted User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_drift_001",
        sourceRef: "iap_membership:drift_user_sub",
        principalId: "principal_drift_001",
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [
        {
          roleBindingId: "rb_drift_001",
          sourceRef: "rb_drift_001",
          membershipId: "membership_drift_001",
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: now,
          validTo: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    );

    const token = signTestIapToken({
      sub: "drift_user_sub",
      email: "drifted@platform.drts",
      gcp_ia_groups: ["ops-users@platform.drts"],
    });

    const result = await adapter.resolveSubject(
      {
        "x-goog-iap-jwt-assertion": token,
      },
      {
        expectedAudience: EXPECTED_AUDIENCE,
        jwtSecretOrPublicKey: TEST_SECRET,
      },
    );

    expect(result.driftDetected).toBe(true);
    expect(result.effectiveRoles).not.toContain("superadmin");
    expect(result.effectiveRoles).toContain("ops_user");
    expect(result.driftDetails?.missingGroups).toContain("platform-admins@platform.drts");

    const driftEvents = await securityEventsService.listEvents(null, {
      eventType: "iap_group_drift.detected",
    });
    expect(driftEvents.length).toBeGreaterThan(0);
    expect(driftEvents[0]?.actorId).toBe("principal_drift_001");
  });

  it("fails closed when IAP assertion lacks email in strict IAP mode", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const tokenNoEmail = signTestIapToken({
      sub: "subject_no_email_123",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": tokenNoEmail },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
          strictIapMode: true,
        },
      );
    } catch (err) {
      if (err instanceof ApiRequestError) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    expect(caught?.status).toBe(401);
    expect(caught?.code).toBe("IAP_ASSERTION_INVALID");
    expect(caught?.getResponse() as any).toMatchObject({
      error: { message: "IAP assertion missing email claim in strict IAP mode." },
    });

    const deniedEvents = await securityEventsService.listEvents(null, {
      eventType: "iap_subject.denied",
    });
    expect(deniedEvents.some((e) => e.reasonCode === "missing_email_in_strict_mode")).toBe(true);
  });

  it("does NOT allow a different IAP subject with the same email to inherit existing durable membership", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    // First, resolve user A (sub_A)
    const tokenA = signTestIapToken({
      sub: "accounts.google.com:sub_A",
      email: "shared-email@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    const resA = await adapter.resolveSubject(
      { "x-goog-iap-jwt-assertion": tokenA },
      {
        expectedAudience: EXPECTED_AUDIENCE,
        jwtSecretOrPublicKey: TEST_SECRET,
        autoProvision: true,
      },
    );

    expect(resA.principal.subject).toBe("accounts.google.com:sub_A");

    // Second, attempt resolve for user B (sub_B) with same email but autoProvision: false
    const tokenB = signTestIapToken({
      sub: "accounts.google.com:sub_B",
      email: "shared-email@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": tokenB },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
          autoProvision: false,
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        caught = err;
      }
    }

    // Must fail closed because sub_B identity is not provisioned (it cannot inherit sub_A's identity)
    expect(caught).not.toBeNull();
    expect(caught?.status).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
  });

  it("deterministically selects active platform/ops control-plane membership for multi-membership principal", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    // Provision principal with both tenant (first) and platform (second) memberships
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_multi_mem_001",
        sourceRef: "iap_subject:multi_mem_sub",
        issuer: "google_iap",
        subject: "multi_mem_sub",
        principalType: "human",
        email: "multi@platform.drts",
        emailVerified: true,
        displayName: "Multi Membership User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_tenant_001",
        sourceRef: "tenant_membership:multi_mem_sub",
        principalId: "principal_multi_mem_001",
        realm: "tenant",
        scopeRef: "tenant:t1",
        tenantId: "t1",
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [],
    );

    // Add a platform control plane membership
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_multi_mem_001",
        sourceRef: "iap_subject:multi_mem_sub",
        issuer: "google_iap",
        subject: "multi_mem_sub",
        principalType: "human",
        email: "multi@platform.drts",
        emailVerified: true,
        displayName: "Multi Membership User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_platform_001",
        sourceRef: "iap_membership:multi_mem_sub",
        principalId: "principal_multi_mem_001",
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [
        {
          roleBindingId: "rb_platform_001",
          sourceRef: "rb_platform_001",
          membershipId: "membership_platform_001",
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: now,
          validTo: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    );

    const token = signTestIapToken({
      sub: "multi_mem_sub",
      email: "multi@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    const res = await adapter.resolveSubject(
      { "x-goog-iap-jwt-assertion": token },
      {
        expectedAudience: EXPECTED_AUDIENCE,
        jwtSecretOrPublicKey: TEST_SECRET,
      },
    );

    expect(res.membership.realm).toBe("platform");
    expect(res.membership.membershipId).toBe("membership_platform_001");
    expect(res.effectiveRoles).toContain("superadmin");
  });

  it("switches membership realm from platform to ops when assertion loses platform-admins group", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_stale_platform_001",
        sourceRef: "iap_subject:stale_platform_sub",
        issuer: "google_iap",
        subject: "stale_platform_sub",
        principalType: "human",
        email: "stale-platform@platform.drts",
        emailVerified: true,
        displayName: "Stale Platform User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_stale_platform_001",
        sourceRef: "iap_membership:stale_platform_sub",
        principalId: "principal_stale_platform_001",
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [
        {
          roleBindingId: "rb_stale_platform_001",
          sourceRef: "rb_stale_platform_001",
          membershipId: "membership_stale_platform_001",
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: now,
          validTo: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    );

    const token = signTestIapToken({
      sub: "stale_platform_sub",
      email: "stale-platform@platform.drts",
      gcp_ia_groups: ["ops-users@platform.drts"],
    });

    const res = await adapter.resolveSubject(
      { "x-goog-iap-jwt-assertion": token },
      {
        expectedAudience: EXPECTED_AUDIENCE,
        jwtSecretOrPublicKey: TEST_SECRET,
      },
    );

    expect(res.driftDetected).toBe(true);
    expect(res.effectiveRoles).toEqual(["ops_user"]);
    expect(res.membership.realm).toBe("ops");
  });
});



