import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { PartnerUserIdentityLinkRepository } from "../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { resolveRouteAuthPolicy } from "../../apps/api/src/common/auth/auth.policy";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { FleetPartnerController } from "../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { FleetPartnerTrainingController } from "../../apps/api/src/modules/driver-academy/academy.controller";
import { getIamFleetRoleScopes } from "../../packages/contracts/src/iam-policy-catalog";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { FleetPartnerService } from "../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import type { CanonicalIdentityPrincipalRecord } from "../../packages/contracts/src";

const { Reflector } = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
)("@nestjs/core");
const ENTRY = "yuhe-residence";
const CODE = "partner_fleet_human_subject";
const SUB = `sub_oidc_${createHash("sha256").update(CODE).digest("hex").slice(0, 12)}`;

beforeEach(() => {
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("AUTH_MODE", "local");
  vi.stubEnv("OIDC_MOCK_MODE", "true");
  vi.stubEnv("JWT_SECRET", "test_jwt_secret_key_32_characters_long_min!");
});

describe("managed Fleet human source -> issuer -> durable verifier (in-memory port, no PG/IdP)", () => {
  async function setup() {
    const repository = new IdentityRepository();
    const link = new PartnerUserIdentityLinkRepository();
    const tenant = new TenantPartnerService(new AuditNotificationService());
    const entries = (
      tenant as unknown as {
        partnerEntries: Array<{
          entrySlug: string;
          partnerType: string;
          partnerId: string;
        }>;
      }
    ).partnerEntries;
    const entry = entries.find((row) => row.entrySlug === ENTRY)!;
    // Only the external Fleet-entry fixture is controlled; the issuer, IAM
    // repository, JWT verifier and route policy are the real implementations.
    entry.partnerType = "fleet_partner";
    entry.partnerId = "fleet-test-001";
    const linked = await link.resolveOrCreate({
      entrySlug: ENTRY,
      partnerUserRef: SUB,
    });
    const jwt = new JwtAuthService(
      repository,
      tenant,
      undefined,
      undefined,
      link,
    );
    const oidc = new OidcPkceService(
      jwt,
      tenant,
      undefined,
      link,
      undefined,
      repository,
    );
    async function login(entrySlug = ENTRY) {
      const state = oidc.generateLoginParameters("partner", {
        partnerId: entrySlug,
      });
      return oidc.exchangePartnerCallbackSession(
        {
          provider: "oidc",
          code: CODE,
          state: state.state,
          partnerId: entrySlug,
          callbackUrl: "http://localhost:3000/api/auth/callback",
        },
        { stateToken: state.stateToken },
      );
    }
    return { repository, link, tenant, jwt, login, linked };
  }

  it("does not turn an active Referral link into general Fleet access, then grants only the managed SA role's operations", async () => {
    const { repository, jwt, login, linked, tenant, link } = await setup();
    const unassigned = await login();
    expect(unassigned.identity.membershipId).toBeUndefined();
    expect(unassigned.identity.scopes).not.toContain("fleet:read");
    expect(unassigned.identity.scopes).not.toContain("billing:read");
    const now = new Date().toISOString();
    const membership = await repository.ensureMembershipRecord({
      membershipId: "fleet-test-membership",
      sourceRef: `fleet_member:${ENTRY}:${linked.drtsPassengerId}`,
      principalId: linked.drtsPassengerId,
      realm: "partner",
      scopeRef: `fleet:${ENTRY}`,
      tenantId: null,
      partnerId: "fleet-test-001",
      status: "active",
      invitedByPrincipalId: "manager",
      invitationId: null,
      createdAt: now,
      updatedAt: now,
    });
    const binding = await repository.ensureRoleBindingRecord({
      roleBindingId: "fleet-test-binding",
      sourceRef: `fleet_role:${ENTRY}:${linked.drtsPassengerId}`,
      membershipId: membership.membershipId,
      roleCode: "fleet_partner_ops",
      grantedByPrincipalId: "manager",
      approvalId: null,
      validFrom: now,
      validTo: null,
      createdAt: now,
      updatedAt: now,
    });
    const ops = await login();
    expect(ops.identity).toMatchObject({
      membershipId: membership.membershipId,
      partnerId: "fleet-test-001",
      partnerEntrySlug: ENTRY,
      roles: ["fleet_partner_ops"],
      scopes: ["fleet:read", "fleet:training:read", "fleet:supply:write"],
    });
    expect(await jwt.verifyAccessToken(ops.accessToken)).not.toBeNull();
    const guard = new BootstrapAuthGuard(new Reflector(), jwt);
    const operational = {
      method: "GET",
      url: "/api/fleet-partner/drivers",
      headers: { authorization: `Bearer ${ops.accessToken}` },
      identity: null as any,
    };
    expect(
      await guard.canActivate({
        switchToHttp: () => ({ getRequest: () => operational }),
        getHandler: () => FleetPartnerController.prototype.listPortalDrivers,
        getClass: () => FleetPartnerController,
      } as never),
    ).toBe(true);
    expect(operational.identity).toMatchObject({
      partnerId: "fleet-test-001",
      partnerEntrySlug: ENTRY,
      membershipId: membership.membershipId,
    });
    const crossFleet = {
      ...operational,
      headers: {
        ...operational.headers,
        "x-fleet-partner-id": "fleet-other",
      },
    };
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => crossFleet }),
        getHandler: () => FleetPartnerController.prototype.listPortalDrivers,
        getClass: () => FleetPartnerController,
      } as never),
    ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
    const authController = new AuthController(jwt, tenant, {} as never);
    expect(
      authController.getAuthSession(operational.identity).data,
    ).toMatchObject({
      active: true,
      identity: { roles: ["fleet_partner_ops"], partnerId: "fleet-test-001" },
    });
    expect(
      resolveRouteAuthPolicy("GET", "/api/fleet-partner/drivers")
        ?.requiredScopes,
    ).toEqual(["fleet:read"]);
    expect(
      resolveRouteAuthPolicy(
        "POST",
        "/api/fleet-partner/supply-submissions/drivers",
      )?.requiredScopes,
    ).toEqual(["fleet:supply:write"]);
    expect(
      resolveRouteAuthPolicy("GET", "/api/fleet-partner/statements")
        ?.requiredScopes,
    ).toEqual(["billing:read"]);
    expect(ops.identity.scopes).not.toContain("billing:read");
    await repository.ensureRoleBindingRecord({
      ...binding,
      roleCode: "fleet_partner_admin",
      updatedAt: new Date(Date.now() + 500).toISOString(),
    });
    expect(await jwt.verifyAccessToken(ops.accessToken)).toBeNull();
    const admin = await login();
    expect(admin.identity.roles).toEqual(["fleet_partner_admin"]);
    expect(admin.identity.scopes).toContain("fleet:supply:write");
    expect(admin.identity.scopes).toContain("billing:write");
    await repository.ensureRoleBindingRecord({
      ...binding,
      roleCode: "fleet_partner_finance",
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    });
    expect(await jwt.verifyAccessToken(admin.accessToken)).toBeNull();
    const finance = await login();
    expect(finance.identity.roles).toEqual(["fleet_partner_finance"]);
    expect(finance.identity.scopes).toContain("billing:read");
    expect(finance.identity.scopes).not.toContain("fleet:supply:write");
    const request = {
      method: "POST",
      url: "/api/fleet-partner/supply-submissions/drivers",
      headers: { authorization: `Bearer ${finance.accessToken}` },
    };
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () =>
          FleetPartnerController.prototype.createDriverSupplySubmission,
        getClass: () => FleetPartnerController,
      } as never),
    ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
    // Another entry for the very same OIDC subject receives a different
    // canonical link principal; entry-one membership cannot cross it.
    const entries = (
      tenant as unknown as {
        partnerEntries: Array<{
          entrySlug: string;
          partnerType: string;
          partnerId: string;
        }>;
      }
    ).partnerEntries;
    entries.push({
      ...entries.find((row) => row.entrySlug === ENTRY)!,
      entrySlug: "other-fleet-entry",
      partnerId: "other-fleet-id",
    });
    await link.resolveOrCreate({
      entrySlug: "other-fleet-entry",
      partnerUserRef: SUB,
    });
    const otherFleet = await login("other-fleet-entry");
    expect(otherFleet.identity.scopes).not.toContain("billing:read");
    expect(otherFleet.identity.membershipId).toBeUndefined();
    await repository.ensureMembershipRecord({
      ...membership,
      status: "disabled",
      updatedAt: new Date(Date.now() + 2000).toISOString(),
    });
    expect(await jwt.verifyAccessToken(finance.accessToken)).toBeNull();
    await repository.ensureMembershipRecord({
      ...membership,
      status: "active",
      updatedAt: new Date(Date.now() + 3000).toISOString(),
    });
    await repository.ensureRoleBindingRecord({
      ...binding,
      roleCode: "fleet_partner_finance",
      validTo: new Date(Date.now() + 5000).toISOString(),
      updatedAt: new Date(Date.now() + 3000).toISOString(),
    });
    const expiring = await login();
    expect(await jwt.verifyAccessToken(expiring.accessToken)).not.toBeNull();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.now() + 6000));
      expect(await jwt.verifyAccessToken(expiring.accessToken)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    await repository.ensureRoleBindingRecord({
      ...binding,
      roleCode: "fleet_partner_finance",
      validTo: null,
      updatedAt: new Date(Date.now() + 7000).toISOString(),
    });
    const linkedSession = await login();
    const failingRead = vi
      .spyOn(repository, "findMembershipById")
      .mockRejectedValueOnce(new Error("synthetic IAM read failure"));
    expect(await jwt.verifyAccessToken(linkedSession.accessToken)).toBeNull();
    failingRead.mockRestore();
    expect(
      await jwt.verifyAccessToken(linkedSession.accessToken),
    ).not.toBeNull();
    const fallbackLinks = (
      link as unknown as { fallbackLinks: Map<string, { status: string }> }
    ).fallbackLinks;
    const linkedEntry = [...fallbackLinks.values()].find(
      (candidate) =>
        (candidate as { drtsPassengerId?: string }).drtsPassengerId ===
        linked.drtsPassengerId,
    )!;
    linkedEntry.status = "disabled";
    expect(await jwt.verifyAccessToken(linkedSession.accessToken)).toBeNull();
  });
});

describe("existing scoped credential guard compatibility without Referral/Host promotion", () => {
  it("honors signed read/write scopes independently and rejects link-only or Host identity", async () => {
    const jwt = new JwtAuthService();
    const guard = new BootstrapAuthGuard(new Reflector(), jwt);
    const issue = async (
      actorType: "partner_user" | "partner_api_key",
      scopes: string[],
    ) =>
      (
        await jwt.issueSessionToken({
          authMode: "jwt_bearer",
          actorType,
          actorId: `signed-${actorType}`,
          realm: "partner",
          partnerId: "fleet-test-001",
          tenantId: null,
          roleFamilies: ["partner"],
          roles: [actorType],
          scopes,
        })
      ).token;
    const guarded = async (token: string, method: "GET" | "POST") => {
      const request = {
        method,
        url:
          method === "GET"
            ? "/api/fleet-partner/drivers"
            : "/api/fleet-partner/supply-submissions/drivers",
        headers: { authorization: `Bearer ${token}` },
      };
      return guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () =>
          method === "GET"
            ? FleetPartnerController.prototype.listPortalDrivers
            : FleetPartnerController.prototype.createDriverSupplySubmission,
        getClass: () => FleetPartnerController,
      } as never);
    };
    const scoped = await issue("partner_api_key", [
      "billing:read",
      "partner:read",
    ]);
    expect(await guarded(scoped, "GET")).toBe(true);
    await expect(guarded(scoped, "POST")).rejects.toMatchObject({
      code: "AUTH_SCOPE_DENIED",
    });
    const writable = await issue("partner_user", [
      "billing:read",
      "partner:read",
      "partner:write",
    ]);
    expect(await guarded(writable, "POST")).toBe(true);
    const referral = await issue("partner_user", [
      "partner:read",
      "partner:write",
    ]);
    await expect(guarded(referral, "GET")).rejects.toMatchObject({
      code: "AUTH_SCOPE_DENIED",
    });
    const host = await issue("partner_user", ["owned:read", "reports:read"]);
    await expect(guarded(host, "GET")).rejects.toMatchObject({
      code: "AUTH_SCOPE_DENIED",
    });
  });

  it("retains explicitly scoped non-strict partner API key bootstrap supply without finance-only write", async () => {
    const guard = new BootstrapAuthGuard(new Reflector());
    const request = (scopes: string, selector = "fleet-test-001") => ({
      method: "POST",
      url: "/api/fleet-partner/supply-submissions/drivers",
      headers: {
        "x-actor-type": "partner_api_key",
        "x-actor-id": "fleet-test-api-key",
        "x-partner-id": "fleet-test-001",
        "x-fleet-partner-id": selector,
        "x-scopes": scopes,
      },
    });
    const activate = async (req: ReturnType<typeof request>) =>
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () =>
          FleetPartnerController.prototype.createDriverSupplySubmission,
        getClass: () => FleetPartnerController,
      } as never);
    await expect(
      activate(request("billing:read partner:entries:read")),
    ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
    expect(
      await activate(
        request("billing:read partner:read partner:write partner:entries:read"),
      ),
    ).toBe(true);
    await expect(
      activate(
        request("billing:read partner:read partner:write", "another-fleet"),
      ),
    ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
    await expect(
      activate(request("partner:read partner:write")),
    ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
    const previousEnv = process.env.DRTS_ENV;
    process.env.DRTS_ENV = "staging";
    try {
      await expect(
        activate(request("billing:read partner:read partner:write")),
      ).rejects.toMatchObject({ code: "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN" });
    } finally {
      if (previousEnv === undefined) delete process.env.DRTS_ENV;
      else process.env.DRTS_ENV = previousEnv;
    }
  });
});

describe("managed Fleet ops training guard and own-partner boundary", () => {
  it("permits only bounded managed Ops training and retains legacy training decorators", async () => {
    const methods = [
      ["summary", "/api/fleet-partner/training/summary"],
      ["roster", "/api/fleet-partner/training/roster"],
      ["driverAttempt", "/api/fleet-partner/training/drivers/d/attempts/a"],
    ] as const;
    const makeIdentity = (role: string, partnerId = "fleet-1") => ({
      authMode: "jwt_bearer",
      actorType: "partner_user",
      actorId: "managed-human",
      realm: "partner",
      partnerId,
      principalId: "principal-1",
      membershipId: "membership-1" as string | null,
      roleFamilies: ["partner"],
      roles: [role],
      scopes: [...(getIamFleetRoleScopes(role) ?? [])],
    });
    const activate = async (
      identity: ReturnType<typeof makeIdentity>,
      handler: (typeof methods)[number],
      fleetPartnerId = "fleet-1",
    ) => {
      // JWT verifier is the only controlled boundary; the real policy,
      // Academy decorator metadata and whole guard execute unchanged.
      const jwtPort = {
        verifyAccessToken: async () => identity,
        toRequestIdentity: () => identity,
      };
      const guard = new BootstrapAuthGuard(new Reflector(), jwtPort as never);
      const request = {
        method: "GET",
        url: `${handler[1]}?fleetPartnerId=${encodeURIComponent(fleetPartnerId)}`,
        headers: { authorization: "Bearer controlled-fixture" },
        query: { fleetPartnerId },
      };
      return guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => FleetPartnerTrainingController.prototype[handler[0]],
        getClass: () => FleetPartnerTrainingController,
      } as never);
    };
    for (const handler of methods) {
      expect(await activate(makeIdentity("fleet_partner_ops"), handler)).toBe(
        true,
      );
      await expect(
        activate(makeIdentity("fleet_partner_ops"), handler, "other-fleet"),
      ).rejects.toMatchObject({ code: "ACADEMY_FORBIDDEN_FLEET_ACCESS" });
      await expect(
        activate(makeIdentity("fleet_partner_finance"), handler),
      ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
      await expect(
        activate(makeIdentity("fleet_partner_admin"), handler),
      ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
      const legacy = makeIdentity("partner_api_key");
      legacy.actorType = "partner_api_key";
      legacy.membershipId = null;
      legacy.scopes = ["billing:read", "reports:read"];
      expect(await activate(legacy, handler)).toBe(true);
      await expect(
        activate(legacy, handler, "other-fleet"),
      ).rejects.toMatchObject({
        code: "ACADEMY_FORBIDDEN_FLEET_ACCESS",
      });
    }
  });
});

describe("manager producer through production repository SQL (transactional fake PG port)", () => {
  it("persists bounded role mutation/readback and rolls back failed audit or write", async () => {
    const principalId = "passenger_existing_human";
    const principal: CanonicalIdentityPrincipalRecord = {
      principalId,
      sourceRef: `jwt_principal:partner:${principalId}`,
      issuer: "drts_partner",
      subject: principalId,
      principalType: "human",
      status: "active",
      email: null,
      emailVerified: false,
      displayName: null,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    };
    let members = new Map<string, Record<string, unknown>>();
    let bindings = new Map<string, Record<string, unknown>>();
    let snapshot: {
      members: Map<string, Record<string, unknown>>;
      bindings: Map<string, Record<string, unknown>>;
    } | null = null;
    let failWrite = false;
    let principalAvailable = true;
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql === "BEGIN") {
        snapshot = { members: new Map(members), bindings: new Map(bindings) };
        return { rows: [] };
      }
      if (sql === "ROLLBACK") {
        if (snapshot) {
          members = snapshot.members;
          bindings = snapshot.bindings;
        }
        snapshot = null;
        return { rows: [] };
      }
      if (sql === "COMMIT") {
        snapshot = null;
        return { rows: [] };
      }
      if (sql.startsWith("SAVEPOINT")) return { rows: [] };
      if (sql.includes("SELECT record FROM iam.identity_principals"))
        return {
          rows:
            principalAvailable && params[0] === principalId
              ? [{ record: principal }]
              : [],
        };
      if (sql.includes("SELECT record FROM iam.identity_memberships"))
        return {
          rows: members.has(String(params[0]))
            ? [{ record: members.get(String(params[0])) }]
            : [],
        };
      if (sql.includes("SELECT record FROM iam.identity_role_bindings"))
        return {
          rows: bindings.has(String(params[0]))
            ? [{ record: bindings.get(String(params[0])) }]
            : [],
        };
      if (sql.includes("INSERT INTO iam.identity_memberships")) {
        if (failWrite) throw new Error("synthetic PG write failure");
        const record = JSON.parse(String(params.at(-1))) as Record<
          string,
          unknown
        >;
        members.set(String(record.sourceRef), record);
        return { rows: [{ record }] };
      }
      if (sql.includes("INSERT INTO iam.identity_role_bindings")) {
        const record = JSON.parse(String(params.at(-1))) as Record<
          string,
          unknown
        >;
        bindings.set(String(record.sourceRef), record);
        return { rows: [{ record }] };
      }
      if (sql.includes("AS membership_record"))
        return {
          rows: [...members.values()]
            .map((membership) => ({
              membership_record: membership,
              binding_record: [...bindings.values()].find(
                (binding) => binding.membershipId === membership.membershipId,
              ),
            }))
            .filter(
              (row) =>
                row.binding_record &&
                row.membership_record.scopeRef === params[0],
            ),
        };
      if (sql.includes("UPDATE iam.identity_sessions")) return { rows: [] };
      throw new Error(`Unexpected PG port query: ${sql.slice(0, 80)}`);
    });
    const port = {
      isEnabled: () => true,
      connect: async () => ({ query, release: () => undefined }),
      query,
    };
    const repo = new IdentityRepository(port as never);
    const fleet = { fleetPartnerId: "fleet-test-001", active: true };
    const links = {
      isEnabled: () => true,
      find: async () => ({ status: "active", drtsPassengerId: principalId }),
    };
    const entries = {
      resolvePartnerEntries: async () => [
        {
          entrySlug: ENTRY,
          partnerType: "fleet_partner",
          partnerId: fleet.fleetPartnerId,
        },
      ],
    };
    let failAudit = false;
    const audit = {
      isEnabled: () => true,
      recordEventRequired: async () => {
        if (failAudit) throw new Error("synthetic audit failure");
      },
    };
    const service = new FleetPartnerService(
      undefined as never,
      undefined as never,
      undefined as never,
      {
        isEnabled: () => true,
        findActiveFleetPartnerById: async () => fleet,
      } as never,
      undefined,
      repo,
      entries as never,
      links as never,
      audit as never,
    );
    const manager = {
      realm: "platform",
      actorType: "platform_admin",
      actorId: "manager",
      principalId: "manager",
      scopes: ["foundation:write"],
      amr: [],
    } as never;
    const command = {
      entrySlug: ENTRY,
      partnerUserRef: SUB,
      roleCode: "fleet_partner_admin" as const,
      enabled: true,
    };
    await expect(
      service.manageFleetHumanRole(fleet.fleetPartnerId, command, {
        ...(manager as object),
        realm: "partner",
        actorType: "partner_user",
      } as never),
    ).rejects.toMatchObject({ code: "FLEET_ROLE_MANAGER_DENIED" });
    await expect(
      service.manageFleetHumanRole("fleet-other", command, manager),
    ).rejects.toMatchObject({ code: "FLEET_ENTRY_NOT_FOUND" });
    // An active Referral link alone cannot invent a Fleet staff principal.
    principalAvailable = false;
    await expect(
      service.manageFleetHumanRole(fleet.fleetPartnerId, command, manager),
    ).rejects.toThrow(
      "Target must have an existing active linked partner-human principal.",
    );
    expect(members.size).toBe(0);
    principalAvailable = true;
    const created = await service.manageFleetHumanRole(
      fleet.fleetPartnerId,
      command,
      manager,
    );
    expect(created.status).toBe("active");
    expect(
      (await service.listFleetHumanRoles(fleet.fleetPartnerId, ENTRY))[0],
    ).toMatchObject({
      membershipId: created.membershipId,
      roleCode: "fleet_partner_admin",
      status: "active",
    });
    const disabled = await service.manageFleetHumanRole(
      fleet.fleetPartnerId,
      { ...command, enabled: false },
      manager,
    );
    expect(disabled.status).toBe("disabled");
    failAudit = true;
    await expect(
      service.manageFleetHumanRole(fleet.fleetPartnerId, command, manager),
    ).rejects.toThrow("synthetic audit failure");
    expect(
      (await service.listFleetHumanRoles(fleet.fleetPartnerId, ENTRY))[0]
        ?.status,
    ).toBe("disabled");
    failAudit = false;
    failWrite = true;
    await expect(
      service.manageFleetHumanRole(fleet.fleetPartnerId, command, manager),
    ).rejects.toThrow("synthetic PG write failure");
    expect(
      (await service.listFleetHumanRoles(fleet.fleetPartnerId, ENTRY))[0]
        ?.status,
    ).toBe("disabled");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
});
