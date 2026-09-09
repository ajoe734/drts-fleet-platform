import { describe, expect, it } from "vitest";
import type { IdentityContext } from "@drts/contracts";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";

describe("SR-QA-WEBHOOK-001-FIX-TENANT-BINDING: C111 API key tenant header binding repair (unit)", () => {
  const TENANT_A = "qa-tenant-victim-aaa";
  const TENANT_B = "qa-tenant-attacker-bbb";

  const tenantAIdentity: IdentityContext = {
    actorType: "tenant_admin",
    actorId: "usr-tenant-a-admin",
    principalId: "usr-tenant-a-admin",
    realm: "tenant",
    tenantId: TENANT_A,
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["tenant:read", "tenant:write"],
    requestId: "req-init-a",
  };

  const tenantBIdentity: IdentityContext = {
    actorType: "tenant_admin",
    actorId: "usr-tenant-b-admin",
    principalId: "usr-tenant-b-admin",
    realm: "tenant",
    tenantId: TENANT_B,
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["tenant:read", "tenant:write"],
    requestId: "req-init-b",
  };

  const platformAdminIdentity: IdentityContext = {
    actorType: "platform_admin",
    actorId: "usr-platform-super",
    principalId: "usr-platform-super",
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["platform_admin"],
    scopes: ["tenant:read", "tenant:write"],
    requestId: "req-platform",
  };

  const systemIdentity: IdentityContext = {
    actorType: "system",
    actorId: "sys-internal-daemon",
    principalId: "sys-internal-daemon",
    realm: "system",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["system"],
    scopes: [],
    requestId: "req-system",
  };

  function createHarness() {
    const auditService = new AuditNotificationService();
    const service = new TenantPartnerService(auditService);
    const controller = new TenantPartnerController(
      service,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    return { service, controller };
  }

  it("cross-tenant GET: Tenant B cannot list Tenant A keys (403 TENANT_SCOPE_MISMATCH & no leakage)", async () => {
    const { service, controller } = createHarness();

    // Seed key for Tenant A
    const issuedA = await service.issueApiKey(TENANT_A, {
      keyName: "Victim Key A",
      scopes: ["tenant:read"],
    });
    expect(issuedA.apiKey.apiKeyId).toBeDefined();

    // Seed key for Tenant B
    const issuedB = await service.issueApiKey(TENANT_B, {
      keyName: "Attacker Key B",
      scopes: ["tenant:read"],
    });
    expect(issuedB.apiKey.apiKeyId).toBeDefined();

    // 1. Controller invocation with Tenant B identity requesting Tenant A keys must fail with 403
    let controllerThrew = false;
    try {
      controller.listApiKeys(TENANT_A, "req-cross-read", tenantBIdentity);
    } catch (err: unknown) {
      controllerThrew = true;
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.code).toBe("TENANT_SCOPE_MISMATCH");
      const resp = apiErr.getResponse() as { error: { message: string; details?: unknown } };
      expect(resp.error.message).toContain("Cross-tenant identity access is forbidden");
      expect(resp.error.details).toMatchObject({
        targetTenantId: TENANT_A,
        principalTenantId: TENANT_B,
      });
    }
    expect(controllerThrew).toBe(true);

    // 2. Direct service invocation with Tenant B identity requesting Tenant A keys must also fail
    let serviceThrew = false;
    try {
      service.listApiKeys(TENANT_A, tenantBIdentity);
    } catch (err: unknown) {
      serviceThrew = true;
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.code).toBe("TENANT_SCOPE_MISMATCH");
    }
    expect(serviceThrew).toBe(true);

    // 3. Verify Tenant B own query returns ONLY Tenant B key, no Tenant A key
    const listB = controller.listApiKeys(TENANT_B, "req-self-read", tenantBIdentity);
    const itemIdsB = listB.data.items.map((k) => k.apiKeyId);
    expect(itemIdsB).toContain(issuedB.apiKey.apiKeyId);
    expect(itemIdsB).not.toContain(issuedA.apiKey.apiKeyId);
  });

  it("cross-tenant mutations: issue/rotate/revoke are rejected with 403/404 and state remains unchanged", async () => {
    const { service, controller } = createHarness();

    const victimKey = await service.issueApiKey(TENANT_A, {
      keyName: "Initial Victim Key",
      scopes: ["tenant:read"],
    });
    const victimKeyId = victimKey.apiKey.apiKeyId;
    const initialKeysA = service.listApiKeys(TENANT_A);
    expect(initialKeysA).toHaveLength(1);

    // --- ISSUE REJECTION ---
    let issueThrew = false;
    try {
      await controller.issueApiKey(
        { keyName: "Malicious Key", scopes: ["tenant:read"] },
        tenantBIdentity,
        TENANT_A,
        "req-cross-issue",
      );
    } catch (err: unknown) {
      issueThrew = true;
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.code).toBe("TENANT_SCOPE_MISMATCH");
    }
    expect(issueThrew).toBe(true);
    // Verify Tenant A keys unchanged
    expect(service.listApiKeys(TENANT_A)).toHaveLength(1);

    // --- ROTATE REJECTION ---
    // Case 1: Attacker B passes header x-tenant-id = Tenant A
    let rotateHeaderThrew = false;
    try {
      await controller.rotateApiKey(
        victimKeyId,
        { overlapDays: 7 },
        tenantBIdentity,
        TENANT_A,
        "req-cross-rotate-header",
      );
    } catch (err: unknown) {
      rotateHeaderThrew = true;
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.code).toBe("TENANT_SCOPE_MISMATCH");
    }
    expect(rotateHeaderThrew).toBe(true);

    // Case 2: Attacker B passes header x-tenant-id = Tenant B, but tries to rotate victim keyId
    let rotateKeyThrew = false;
    try {
      await controller.rotateApiKey(
        victimKeyId,
        { overlapDays: 7 },
        tenantBIdentity,
        TENANT_B,
        "req-cross-rotate-own-header",
      );
    } catch (err: unknown) {
      rotateKeyThrew = true;
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe("API_KEY_NOT_FOUND");
    }
    expect(rotateKeyThrew).toBe(true);

    // Verify victim key remains active and unrotated
    const keyAfterRotateAttempts = service.listApiKeys(TENANT_A)[0];
    expect(keyAfterRotateAttempts?.apiKeyId).toBe(victimKeyId);
    expect(keyAfterRotateAttempts?.status).toBe("active");
    expect(keyAfterRotateAttempts?.supersededByApiKeyId).toBeNull();

    // --- REVOKE REJECTION ---
    // Case 1: Attacker B passes header x-tenant-id = Tenant A
    let revokeHeaderThrew = false;
    try {
      await controller.revokeApiKey(
        victimKeyId,
        tenantBIdentity,
        TENANT_A,
        "req-cross-revoke-header",
      );
    } catch (err: unknown) {
      revokeHeaderThrew = true;
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.code).toBe("TENANT_SCOPE_MISMATCH");
    }
    expect(revokeHeaderThrew).toBe(true);

    // Case 2: Attacker B passes header x-tenant-id = Tenant B, but tries to revoke victim keyId
    let revokeKeyThrew = false;
    try {
      await controller.revokeApiKey(
        victimKeyId,
        tenantBIdentity,
        TENANT_B,
        "req-cross-revoke-own-header",
      );
    } catch (err: unknown) {
      revokeKeyThrew = true;
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe("API_KEY_NOT_FOUND");
    }
    expect(revokeKeyThrew).toBe(true);

    // Verify victim key is still active (not revoked)
    const keyAfterRevokeAttempts = service.listApiKeys(TENANT_A)[0];
    expect(keyAfterRevokeAttempts?.apiKeyId).toBe(victimKeyId);
    expect(keyAfterRevokeAttempts?.status).toBe("active");
    expect(keyAfterRevokeAttempts?.revokedAt).toBeNull();
  });

  it("same-tenant lifecycle: issue, list, rotate, and revoke succeed under authentic tenant identity", async () => {
    const { controller } = createHarness();

    // 1. Issue
    const issueRes = await controller.issueApiKey(
      { keyName: "Legit Key 1", scopes: ["tenant:read"] },
      tenantAIdentity,
      TENANT_A,
      "req-same-issue",
    );
    expect(issueRes.data).toBeDefined();
    const originalKeyId = issueRes.data.apiKey.apiKeyId;
    expect(issueRes.data.plaintextKey).toMatch(/^tk_[a-z0-9_]+/);

    // 2. List
    const listRes = controller.listApiKeys(TENANT_A, "req-same-list", tenantAIdentity);
    expect(listRes.data).toBeDefined();
    const listedKeys = listRes.data.items;
    expect(listedKeys.some((k) => k.apiKeyId === originalKeyId)).toBe(true);

    // 3. Rotate
    const rotateRes = await controller.rotateApiKey(
      originalKeyId,
      { overlapDays: 3 },
      tenantAIdentity,
      TENANT_A,
      "req-same-rotate",
    );
    expect(rotateRes.data).toBeDefined();
    const rotatedKeyId = rotateRes.data.apiKey.apiKeyId;
    expect(rotatedKeyId).not.toBe(originalKeyId);

    // Check list after rotation: old key is in overlap_active, new key is active
    const listAfterRotate = controller.listApiKeys(TENANT_A, "req-same-list-2", tenantAIdentity);
    const oldKey = listAfterRotate.data.items.find((k) => k.apiKeyId === originalKeyId);
    const newKey = listAfterRotate.data.items.find((k) => k.apiKeyId === rotatedKeyId);
    expect(oldKey?.status).toBe("overlap_active");
    expect(newKey?.status).toBe("active");

    // 4. Revoke
    const revokeRes = await controller.revokeApiKey(
      rotatedKeyId,
      tenantAIdentity,
      TENANT_A,
      "req-same-revoke",
    );
    expect(revokeRes.data).toBeDefined();

    const listAfterRevoke = controller.listApiKeys(TENANT_A, "req-same-list-3", tenantAIdentity);
    const revokedKey = listAfterRevoke.data.items.find((k) => k.apiKeyId === rotatedKeyId);
    expect(revokedKey?.status).toBe("revoked");
    expect(revokedKey?.revokedAt).toBeDefined();
  });

  it("platform & system identities: can read and manage tenant API keys across tenants", async () => {
    const { service, controller } = createHarness();

    const seeded = await service.issueApiKey(TENANT_A, {
      keyName: "Tenant A Managed Key",
      scopes: ["tenant:read"],
    });

    // Platform admin reads Tenant A keys
    const platformList = controller.listApiKeys(
      TENANT_A,
      "req-plat-read",
      platformAdminIdentity,
    );
    expect(platformList.data.items.some((k) => k.apiKeyId === seeded.apiKey.apiKeyId)).toBe(true);

    // System identity reads Tenant A keys
    const systemList = controller.listApiKeys(
      TENANT_A,
      "req-sys-read",
      systemIdentity,
    );
    expect(systemList.data.items.some((k) => k.apiKeyId === seeded.apiKey.apiKeyId)).toBe(true);
  });

  it("backward compatibility: listApiKeys works when identity is not provided (internal/unauthenticated harness)", () => {
    const { service, controller } = createHarness();

    // Call service.listApiKeys without identity
    const keys = service.listApiKeys(TENANT_A);
    expect(Array.isArray(keys)).toBe(true);

    // Call controller.listApiKeys without identity
    const envelope = controller.listApiKeys(TENANT_A, "req-legacy");
    expect(envelope.data).toBeDefined();
    expect(Array.isArray(envelope.data.items)).toBe(true);
  });
});
