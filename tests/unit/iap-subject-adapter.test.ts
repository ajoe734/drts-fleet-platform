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
    expect(result.effectiveScopes).toContain("forwarder:read");
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
    expect(caught?.getStatus()).toBe(403);
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
    expect(caught?.getStatus()).toBe(403);
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
    expect(caught?.getStatus()).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
    const resp = caught?.getResponse() as any;
    expect(resp?.error?.message).toContain(
      "Unmapped workforce user subject has no valid group membership.",
    );
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
    expect(caught?.getStatus()).toBe(403);
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
    expect(caught?.getStatus()).toBe(403);
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
        membershipId: "membership_drift_platform_001",
        sourceRef: "iap_membership:drift_user_sub_platform",
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
          membershipId: "membership_drift_platform_001",
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
        membershipId: "membership_drift_ops_001",
        sourceRef: "iap_membership:drift_user_sub_ops",
        principalId: "principal_drift_001",
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
      [
        {
          roleBindingId: "rb_drift_002",
          sourceRef: "rb_drift_002",
          membershipId: "membership_drift_ops_001",
          roleCode: "ops_user",
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
    expect(result.membership.membershipId).toBe("membership_drift_ops_001");
    expect(result.membership.realm).toBe("ops");
    expect(result.driftDetails?.missingGroups).toContain(
      "platform-admins@platform.drts",
    );

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
    expect(caught?.getStatus()).toBe(401);
    expect(caught?.code).toBe("IAP_ASSERTION_INVALID");
    expect(caught?.getResponse() as any).toMatchObject({
      error: {
        message: "IAP assertion missing email claim in strict IAP mode.",
      },
    });

    const deniedEvents = await securityEventsService.listEvents(null, {
      eventType: "iap_subject.denied",
    });
    expect(
      deniedEvents.some((e) => e.reasonCode === "missing_email_in_strict_mode"),
    ).toBe(true);
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
    expect(caught?.getStatus()).toBe(403);
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
        membershipId: "membership_stale_ops_001",
        sourceRef: "iap_membership:stale_ops_sub",
        principalId: "principal_stale_platform_001",
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
      [
        {
          roleBindingId: "rb_stale_ops_001",
          sourceRef: "rb_stale_ops_001",
          membershipId: "membership_stale_ops_001",
          roleCode: "ops_user",
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
    expect(res.membership.membershipId).toBe("membership_stale_ops_001");
    expect(res.membership.realm).toBe("ops");
  });

  it("fails closed with 403 IAP_WORKFORCE_USER_INACTIVE when active control-plane membership has zero durable role bindings", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_no_roles_001",
        sourceRef: "iap_subject:no_roles_sub",
        issuer: "google_iap",
        subject: "no_roles_sub",
        principalType: "human",
        email: "noroles@platform.drts",
        emailVerified: true,
        displayName: "No Roles User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_no_roles_001",
        sourceRef: "iap_membership:no_roles_sub",
        principalId: "principal_no_roles_001",
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
      [],
    );

    const token = signTestIapToken({
      sub: "no_roles_sub",
      email: "noroles@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": token },
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
    expect(caught?.getStatus()).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
  });

  it("ignores expired (validTo in past) and future (validFrom in future) role bindings during subject resolution", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const nowMs = Date.now();
    const pastTime = new Date(nowMs - 3600 * 1000).toISOString();
    const futureTime = new Date(nowMs + 3600 * 1000).toISOString();
    const farPastTime = new Date(nowMs - 7200 * 1000).toISOString();

    // User with expired and future bindings only
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_expired_bindings_001",
        sourceRef: "iap_subject:expired_sub_001",
        issuer: "google_iap",
        subject: "expired_sub_001",
        principalType: "human",
        email: "expired-bindings@platform.drts",
        emailVerified: true,
        displayName: "Expired Bindings User",
        status: "active",
        createdAt: pastTime,
        updatedAt: pastTime,
      },
      {
        membershipId: "membership_expired_001",
        sourceRef: "iap_membership:expired_sub_001",
        principalId: "principal_expired_bindings_001",
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: pastTime,
        updatedAt: pastTime,
      },
      [
        {
          roleBindingId: "rb_expired_001",
          sourceRef: "rb_expired_001",
          membershipId: "membership_expired_001",
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: farPastTime,
          validTo: pastTime, // Expired!
          createdAt: farPastTime,
          updatedAt: farPastTime,
        },
        {
          roleBindingId: "rb_future_001",
          sourceRef: "rb_future_001",
          membershipId: "membership_expired_001",
          roleCode: "platform_admin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: futureTime, // Future!
          validTo: null,
          createdAt: pastTime,
          updatedAt: pastTime,
        },
      ],
    );

    const token = signTestIapToken({
      sub: "expired_sub_001",
      email: "expired-bindings@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": token },
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
    expect(caught?.getStatus()).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
  });

  it("correctly classifies security events as actorType=ops_user and realm=ops for ops users", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const token = signTestIapToken({
      sub: "ops_subject_sec_001",
      email: "operator1@platform.drts",
      gcp_ia_groups: ["ops-users@platform.drts"],
    });

    const result = await adapter.resolveSubject(
      { "x-goog-iap-jwt-assertion": token },
      {
        expectedAudience: EXPECTED_AUDIENCE,
        jwtSecretOrPublicKey: TEST_SECRET,
        autoProvision: true,
      },
    );

    expect(result.membership.realm).toBe("ops");
    expect(result.effectiveRoles).toContain("operator");

    const resolvedEvents = await securityEventsService.listEvents(null, {
      eventType: "iap_subject.resolved",
    });
    const opsResolvedEvent = resolvedEvents.find(
      (e) => e.actorId === result.principal.principalId,
    );
    expect(opsResolvedEvent).toBeDefined();
    expect(opsResolvedEvent?.actorType).toBe("ops_user");
    expect(opsResolvedEvent?.realm).toBe("ops");
  });

  it("fails closed with 403 when principal has platform superadmin binding plus ops membership with zero role bindings and requests ops realm", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_platform_admin_zero_ops_001",
        sourceRef: "iap_subject:admin_zero_ops_sub",
        issuer: "google_iap",
        subject: "admin_zero_ops_sub",
        principalType: "human",
        email: "admin-zero-ops@platform.drts",
        emailVerified: true,
        displayName: "Admin Zero Ops User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_platform_admin_001",
        sourceRef: "iap_membership:admin_zero_ops_sub_platform",
        principalId: "principal_platform_admin_zero_ops_001",
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
          roleBindingId: "rb_platform_superadmin_001",
          sourceRef: "rb_platform_superadmin_001",
          membershipId: "membership_platform_admin_001",
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

    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_platform_admin_zero_ops_001",
        sourceRef: "iap_subject:admin_zero_ops_sub",
        issuer: "google_iap",
        subject: "admin_zero_ops_sub",
        principalType: "human",
        email: "admin-zero-ops@platform.drts",
        emailVerified: true,
        displayName: "Admin Zero Ops User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_zero_ops_001",
        sourceRef: "iap_membership:admin_zero_ops_sub_ops",
        principalId: "principal_platform_admin_zero_ops_001",
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
      sub: "admin_zero_ops_sub",
      email: "admin-zero-ops@platform.drts",
      gcp_ia_groups: [
        "platform-admins@platform.drts",
        "ops-users@platform.drts",
      ],
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": token },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
          requestedRealm: "ops",
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    expect(caught?.getStatus()).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
  });

  it("resolves requested ops membership for principal with platform superadmin binding without falsely triggering group drift for missing platform admin group", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_dual_req_ops_001",
        sourceRef: "iap_subject:dual_req_ops_sub",
        issuer: "google_iap",
        subject: "dual_req_ops_sub",
        principalType: "human",
        email: "dual-req-ops@platform.drts",
        emailVerified: true,
        displayName: "Dual Req Ops User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_platform_superadmin_001",
        sourceRef: "iap_membership:dual_req_ops_platform",
        principalId: "principal_dual_req_ops_001",
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
          roleBindingId: "rb_platform_sa_001",
          sourceRef: "rb_platform_sa_001",
          membershipId: "membership_platform_superadmin_001",
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

    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_dual_req_ops_001",
        sourceRef: "iap_subject:dual_req_ops_sub",
        issuer: "google_iap",
        subject: "dual_req_ops_sub",
        principalType: "human",
        email: "dual-req-ops@platform.drts",
        emailVerified: true,
        displayName: "Dual Req Ops User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_ops_user_001",
        sourceRef: "iap_membership:dual_req_ops_ops",
        principalId: "principal_dual_req_ops_001",
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
      [
        {
          roleBindingId: "rb_ops_user_001",
          sourceRef: "rb_ops_user_001",
          membershipId: "membership_ops_user_001",
          roleCode: "ops_user",
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
      sub: "dual_req_ops_sub",
      email: "dual-req-ops@platform.drts",
      gcp_ia_groups: ["ops-users@platform.drts"],
    });

    const result = await adapter.resolveSubject(
      { "x-goog-iap-jwt-assertion": token },
      {
        expectedAudience: EXPECTED_AUDIENCE,
        jwtSecretOrPublicKey: TEST_SECRET,
        requestedRealm: "ops",
      },
    );

    expect(result.membership.realm).toBe("ops");
    expect(result.membership.membershipId).toBe("membership_ops_user_001");
    expect(result.effectiveRoles).toEqual(["ops_user"]);
    expect(result.driftDetected).toBe(false);
    expect(result.driftDetails).toBeUndefined();
  });

  it("resolves to platform membership for dual-group admin when requestedRealm is omitted, even when ops membership is created first", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();

    // Upsert ops membership first
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_dual_no_req_001",
        sourceRef: "iap_subject:dual_no_req_sub",
        issuer: "google_iap",
        subject: "dual_no_req_sub",
        principalType: "human",
        email: "dual-admin@platform.drts",
        emailVerified: true,
        displayName: "Dual Admin User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_ops_first_001",
        sourceRef: "iap_membership:dual_no_req_ops",
        principalId: "principal_dual_no_req_001",
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
      [
        {
          roleBindingId: "rb_ops_first_001",
          sourceRef: "rb_ops_first_001",
          membershipId: "membership_ops_first_001",
          roleCode: "ops_user",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: now,
          validTo: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    );

    // Upsert platform membership second
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_dual_no_req_001",
        sourceRef: "iap_subject:dual_no_req_sub",
        issuer: "google_iap",
        subject: "dual_no_req_sub",
        principalType: "human",
        email: "dual-admin@platform.drts",
        emailVerified: true,
        displayName: "Dual Admin User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_platform_second_001",
        sourceRef: "iap_membership:dual_no_req_platform",
        principalId: "principal_dual_no_req_001",
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
          roleBindingId: "rb_platform_second_001",
          sourceRef: "rb_platform_second_001",
          membershipId: "membership_platform_second_001",
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
      sub: "dual_no_req_sub",
      email: "dual-admin@platform.drts",
      gcp_ia_groups: [
        "platform-admins@platform.drts",
        "ops-users@platform.drts",
      ],
    });

    const result = await adapter.resolveSubject(
      { "x-goog-iap-jwt-assertion": token },
      {
        expectedAudience: EXPECTED_AUDIENCE,
        jwtSecretOrPublicKey: TEST_SECRET,
        // requestedRealm is omitted (as bootstrap-auth.guard & auth.controller do)
      },
    );

    expect(result.membership.realm).toBe("platform");
    expect(result.membership.membershipId).toBe(
      "membership_platform_second_001",
    );
    expect(result.effectiveRoles).toEqual(["superadmin"]);
    expect(result.driftDetected).toBe(false);
  });

  it("fails closed when platform realm is requested but platform membership only possesses ops-only durable role bindings", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();

    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_cross_platform_001",
        sourceRef: "iap_subject:cross_platform_sub",
        issuer: "google_iap",
        subject: "cross_platform_sub",
        principalType: "human",
        email: "cross-platform@platform.drts",
        emailVerified: true,
        displayName: "Cross Platform User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_cross_platform_001",
        sourceRef: "iap_membership:cross_platform",
        principalId: "principal_cross_platform_001",
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
          roleBindingId: "rb_ops_on_platform_001",
          sourceRef: "rb_ops_on_platform_001",
          membershipId: "membership_cross_platform_001",
          roleCode: "operator", // Ops-only role assigned to platform membership
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
      sub: "cross_platform_sub",
      email: "cross-platform@platform.drts",
      gcp_ia_groups: [
        "ops-users@platform.drts",
        "platform-admins@platform.drts",
      ],
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": token },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
          requestedRealm: "platform",
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    expect(caught?.getStatus()).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
    const resp = caught?.getResponse() as any;
    expect(resp?.error?.message).toBe(
      "Workforce user has no active durable role bindings.",
    );
  });

  it("fails closed when ops realm is requested but ops membership only possesses platform-only durable role bindings", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();

    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_cross_ops_001",
        sourceRef: "iap_subject:cross_ops_sub",
        issuer: "google_iap",
        subject: "cross_ops_sub",
        principalType: "human",
        email: "cross-ops@platform.drts",
        emailVerified: true,
        displayName: "Cross Ops User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_cross_ops_001",
        sourceRef: "iap_membership:cross_ops",
        principalId: "principal_cross_ops_001",
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
      [
        {
          roleBindingId: "rb_platform_on_ops_001",
          sourceRef: "rb_platform_on_ops_001",
          membershipId: "membership_cross_ops_001",
          roleCode: "superadmin", // Platform-only role assigned to ops membership
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
      sub: "cross_ops_sub",
      email: "cross-ops@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    let caught: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": token },
        {
          expectedAudience: EXPECTED_AUDIENCE,
          jwtSecretOrPublicKey: TEST_SECRET,
          requestedRealm: "ops",
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    expect(caught?.getStatus()).toBe(403);
    expect(caught?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
    const resp = caught?.getResponse() as any;
    expect(resp?.error?.message).toBe(
      "Workforce user has no active durable role bindings.",
    );
  });
});
