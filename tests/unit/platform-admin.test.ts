import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { PlatformAdminController } from "../../apps/api/src/modules/platform-admin/platform-admin.controller";
import { PlatformAdminRepository } from "../../apps/api/src/modules/platform-admin/platform-admin.repository";
import { PlatformAdminService } from "../../apps/api/src/modules/platform-admin/platform-admin.service";

describe("platform admin service", () => {
  it("publishes a public info version with immutable audit evidence", () => {
    const auditService = new AuditNotificationService();
    const platformAdminService = new PlatformAdminService(auditService);

    const draftVersion = platformAdminService.createPublicInfoVersion(
      {
        title: "2026 Q3 公開資訊版",
        callPhone: "0800-123-456",
        complaintPhone: "0800-456-789",
      },
      "public-info-create-request",
    );
    const publishedVersion = platformAdminService.publishPublicInfoVersion(
      draftVersion.versionId,
      {
        publishedBy: "platform-admin-001",
        effectiveFrom: "2026-07-01T00:00:00Z",
      },
      "public-info-publish-request",
      "platform-admin-jwt-001",
    );

    expect(publishedVersion.status).toBe("published");
    expect(
      platformAdminService
        .listPublicInfoVersions()
        .filter((version) => version.status === "published"),
    ).toHaveLength(1);
    const auditLogsFirstCall = auditService.listAuditLogs();
    expect(auditLogsFirstCall[0]?.actionName).toBe(
      "publish_public_info_version",
    );
    expect(auditLogsFirstCall[0]?.newValuesSummary).toEqual(
      expect.objectContaining({
        newVersionId: draftVersion.versionId,
      }),
    );
  });

  it("prefers the verified publisher actorId over the request body when publishing", () => {
    const auditService = new AuditNotificationService();
    const platformAdminService = new PlatformAdminService(auditService);

    const draftVersion = platformAdminService.createPublicInfoVersion(
      {
        title: "2026 Q4 公開資訊版",
      },
      "public-info-create-request",
    );
    const publishedVersion = platformAdminService.publishPublicInfoVersion(
      draftVersion.versionId,
      {
        publishedBy: "forged-body-actor",
      },
      "public-info-publish-request",
      "platform-admin-jwt-007",
    );

    expect(publishedVersion.publishedBy).toBe("platform-admin-jwt-007");
    const auditLogsSnapshot = auditService.listAuditLogs();
    expect(auditLogsSnapshot[0]).toEqual(
      expect.objectContaining({
        actorId: "platform-admin-jwt-007",
      }),
    );
    expect(auditLogsSnapshot[0]?.newValuesSummary).toEqual(
      expect.objectContaining({
        newVersionId: draftVersion.versionId,
        publishedBy: "platform-admin-jwt-007",
      }),
    );
  });

  it("rejects public info publish when no verified identity actorId is provided", () => {
    const auditService = new AuditNotificationService();
    const platformAdminService = new PlatformAdminService(auditService);

    const draftVersion = platformAdminService.createPublicInfoVersion(
      {
        title: "2026 Q4 公開資訊版 B",
      },
      "public-info-create-request",
    );

    let thrown: unknown;
    try {
      platformAdminService.publishPublicInfoVersion(
        draftVersion.versionId,
        {
          publishedBy: "forged-body-actor",
        },
        "public-info-publish-request",
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect((thrown as ApiRequestError).getStatus()).toBe(401);
    expect(
      (thrown as ApiRequestError).getResponse() as {
        error: { code: string };
      },
    ).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "PLATFORM_ADMIN_IDENTITY_REQUIRED",
        }),
      }),
    );
    expect(
      auditService
        .listAuditLogs()
        .filter((entry) => entry.actionName === "publish_public_info_version"),
    ).toHaveLength(0);
    expect(
      auditService
        .listAuditLogs()
        .some((entry) => entry.actionName === "create_public_info_version"),
    ).toBe(true);
  });

  it("controller forwards the verified identity actorId to publish public info", () => {
    const service = {
      publishPublicInfoVersion: vi.fn(() => ({
        versionId: "public-info-001",
        status: "published",
      })),
    } as unknown as PlatformAdminService;
    const controller = new PlatformAdminController(service);
    const identity: BootstrapRequestIdentity = {
      authMode: "bootstrap_headers",
      actorType: "platform_admin",
      actorId: "platform-admin-jwt-001",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["platform_admin"],
      scopes: ["platform:write"],
      requestId: "req-123",
    };

    controller.publishPublicInfoVersion(
      "public-info-001",
      { publishedBy: "body-actor" },
      identity,
      "req-123",
    );

    expect(service.publishPublicInfoVersion).toHaveBeenCalledWith(
      "public-info-001",
      { publishedBy: "body-actor" },
      "req-123",
      "platform-admin-jwt-001",
    );
  });

  it("controller rejects public info publish when identity is missing", () => {
    const service = {
      publishPublicInfoVersion: vi.fn(),
    } as unknown as PlatformAdminService;
    const controller = new PlatformAdminController(service);

    let thrown: unknown;
    try {
      controller.publishPublicInfoVersion(
        "public-info-001",
        { publishedBy: "body-actor" },
        null,
        "req-123",
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect((thrown as ApiRequestError).getStatus()).toBe(401);
    expect(
      (thrown as ApiRequestError).getResponse() as {
        error: { code: string };
      },
    ).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "PLATFORM_ADMIN_IDENTITY_REQUIRED",
        }),
      }),
    );
    expect(service.publishPublicInfoVersion).not.toHaveBeenCalled();
  });

  it("controller forwards the verified identity actorId to delete draft public info", () => {
    const service = {
      deleteDraftPublicInfoVersion: vi.fn(() => ({
        versionId: "public-info-draft-001",
        status: "draft",
      })),
    } as unknown as PlatformAdminService;
    const controller = new PlatformAdminController(service);
    const identity: BootstrapRequestIdentity = {
      authMode: "bootstrap_headers",
      actorType: "platform_admin",
      actorId: "platform-admin-jwt-011",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["platform_admin"],
      scopes: ["platform:write"],
      requestId: "req-789",
    };

    controller.deleteDraftPublicInfoVersion(
      "public-info-draft-001",
      identity,
      "req-789",
    );

    expect(service.deleteDraftPublicInfoVersion).toHaveBeenCalledWith(
      "public-info-draft-001",
      "req-789",
      "platform-admin-jwt-011",
    );
  });

  it("controller forwards the verified identity actorId to publish placard", () => {
    const service = {
      publishPlacardVersion: vi.fn(() => ({
        placardVersionId: "placard-001",
        publishedAt: "2026-04-19T00:00:00Z",
      })),
    } as unknown as PlatformAdminService;
    const controller = new PlatformAdminController(service);
    const identity: BootstrapRequestIdentity = {
      authMode: "bootstrap_headers",
      actorType: "platform_admin",
      actorId: "platform-admin-jwt-021",
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["platform_admin"],
      scopes: ["platform:write"],
      requestId: "req-placard-publish",
    };

    controller.publishPlacardVersion(
      "placard-001",
      {},
      identity,
      "req-placard-publish",
    );

    expect(service.publishPlacardVersion).toHaveBeenCalledWith(
      "placard-001",
      {},
      "req-placard-publish",
      "platform-admin-jwt-021",
    );
  });

  it("rehydrates persisted platform-admin state and writes placard changes through the repository", async () => {
    const auditService = new AuditNotificationService();
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      loadState: vi.fn(async () => ({
        publicInfoVersions: [
          {
            versionId: "public-info-persisted-001",
            title: "Persisted Version",
            callPhone: "0800-000-001",
            complaintPhone: "0800-000-002",
            callRateText: "依表計費",
            fareText: "依公告",
            paymentMethodText: "現金",
            status: "published",
            effectiveFrom: "2026-04-01T00:00:00Z",
            effectiveTo: null,
            publishedBy: "platform-admin-001",
            publishedAt: "2026-04-01T00:00:00Z",
            createdAt: "2026-03-25T00:00:00Z",
            updatedAt: "2026-04-01T00:00:00Z",
          },
        ],
        placardVersions: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    } as unknown as PlatformAdminRepository;
    const platformAdminService = new PlatformAdminService(
      auditService,
      repository,
    );

    await platformAdminService.onModuleInit();

    const placard = platformAdminService.generatePlacardVersion(
      {
        versionCode: "placard-2026-q3",
        publicInfoVersionId: "public-info-persisted-001",
        templateName: "seatback-updated",
      },
      "placard-generate-request",
    );

    await Promise.resolve();

    expect(placard.publicInfoVersionId).toBe("public-info-persisted-001");
    expect(placard.publishedAt).toBe("2026-04-01T00:00:00Z");
    expect(placard.artifactManifestHash).toBeTruthy();
    expect(placard.artifactDownloadUrl).toContain("sig=");
    expect(placard.artifactExpiresAt).toBeTruthy();
    expect(placard.downloadMetadata?.kind).toBe("placard");
    expect(persistChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        placardVersions: [
          expect.objectContaining({
            versionCode: "placard-2026-q3",
            publicInfoVersionId: "public-info-persisted-001",
            artifactManifestHash: expect.any(String),
            artifactDownloadUrl: expect.stringContaining("sig="),
            artifactExpiresAt: expect.any(String),
          }),
        ],
      }),
    );
    expect(auditService.listAuditLogs()[0]?.actionName).toBe(
      "generate_placard_version",
    );
  });

  it("backfills signed placard artifact metadata for legacy persisted records", async () => {
    const auditService = new AuditNotificationService();
    const repository = {
      loadState: vi.fn(async () => ({
        publicInfoVersions: [
          {
            versionId: "public-info-persisted-002",
            title: "Legacy Published Version",
            callPhone: "0800-010-001",
            complaintPhone: "0800-010-002",
            callRateText: "依表計費",
            fareText: "依公告",
            paymentMethodText: "現金",
            status: "published",
            effectiveFrom: "2026-05-01T00:00:00Z",
            effectiveTo: null,
            publishedBy: "platform-admin-legacy",
            publishedAt: "2026-05-01T00:00:00Z",
            createdAt: "2026-04-20T00:00:00Z",
            updatedAt: "2026-05-01T00:00:00Z",
          },
        ],
        placardVersions: [
          {
            placardVersionId: "placard-legacy-001",
            versionCode: "placard-legacy-q2",
            publicInfoVersionId: "public-info-persisted-002",
            templateName: "seatback-legacy",
            artifactFileId: "artifact-legacy-001",
            publishedAt: "2026-05-01T00:00:00Z",
            createdAt: "2026-04-20T00:00:00Z",
            updatedAt: "2026-05-01T00:00:00Z",
          } as any,
        ],
      })),
      persistChanges: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    } as unknown as PlatformAdminRepository;
    const platformAdminService = new PlatformAdminService(
      auditService,
      repository,
    );

    await platformAdminService.onModuleInit();

    const placard = platformAdminService.listPlacardVersions()[0];

    expect(placard).toEqual(
      expect.objectContaining({
        placardVersionId: "placard-legacy-001",
        artifactManifestHash: expect.any(String),
        artifactDownloadUrl: expect.stringContaining("sig="),
        artifactExpiresAt: expect.any(String),
      }),
    );
    expect(placard?.downloadMetadata?.kind).toBe("placard");
    expect(placard?.downloadMetadata?.manifestHash).toBe(
      placard?.artifactManifestHash,
    );
  });

  it("persists durable platform users across restart and records actor reasons", async () => {
    const auditService = new AuditNotificationService();
    const identityRepository = new IdentityRepository();
    const firstService = new PlatformAdminService(
      auditService,
      undefined,
      identityRepository,
    );

    await firstService.onModuleInit();

    const created = await firstService.createPlatformAdminUser(
      {
        email: "durable-admin@platform.drts",
        displayName: "Durable Admin",
        roleCode: "admin",
        reason: "bootstrap durable platform invite",
      },
      "platform-user-create-request",
      "principal_platform_supervisor",
    );

    expect(created).toEqual(
      expect.objectContaining({
        email: "durable-admin@platform.drts",
        displayName: "Durable Admin",
        roleCode: "admin",
        status: "invited",
      }),
    );

    const createAudit = auditService
      .listAuditLogs()
      .find(
        (entry) =>
          entry.actionName === "create_platform_admin_user" &&
          entry.resourceId === created.userId,
      );
    expect(createAudit).toEqual(
      expect.objectContaining({
        actorId: "principal_platform_supervisor",
      }),
    );
    expect(createAudit?.newValuesSummary).toEqual(
      expect.objectContaining({
        roleCode: "admin",
        reason: "bootstrap durable platform invite",
      }),
    );
    const createdMembership = await identityRepository.findMembershipById(
      created.userId,
    );
    expect(createdMembership?.invitedByPrincipalId).toBe(
      "principal_platform_supervisor",
    );

    const reloadedService = new PlatformAdminService(
      new AuditNotificationService(),
      undefined,
      identityRepository,
    );
    await reloadedService.onModuleInit();

    const reloadedUsers = await reloadedService.listPlatformAdminUsers();
    expect(reloadedUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: created.userId,
          email: "durable-admin@platform.drts",
          roleCode: "admin",
          status: "invited",
        }),
      ]),
    );
  });

  it("revokes only the targeted membership sessions and audits before-after reason", async () => {
    const auditService = new AuditNotificationService();
    const identityRepository = new IdentityRepository();
    const service = new PlatformAdminService(
      auditService,
      undefined,
      identityRepository,
    );

    await service.onModuleInit();

    const platformUser = await service.createPlatformAdminUser(
      {
        email: "shared-operator@platform.drts",
        displayName: "Shared Operator",
        roleCode: "admin",
        reason: "platform realm invite",
      },
      "platform-user-create-platform",
      "principal_platform_supervisor",
    );
    const opsUser = await service.createPlatformAdminUser(
      {
        email: "shared-operator@platform.drts",
        displayName: "Shared Operator",
        roleCode: "operator",
        reason: "ops realm invite",
      },
      "platform-user-create-ops",
      "principal_platform_supervisor",
    );

    await service.updatePlatformAdminUserRole(
      platformUser.userId,
      {
        roleCode: "admin",
        status: "active",
        reason: "activate platform realm",
      },
      "platform-user-activate-platform",
      "principal_platform_supervisor",
    );
    await service.updatePlatformAdminUserRole(
      opsUser.userId,
      {
        roleCode: "operator",
        status: "active",
        reason: "activate ops realm",
      },
      "platform-user-activate-ops",
      "principal_platform_supervisor",
    );

    const [principal] = await identityRepository.findPrincipalsByEmail(
      "shared-operator@platform.drts",
    );
    expect(principal).toBeDefined();

    const platformSession = await identityRepository.createSession({
      sessionId: "platform_membership_session_001",
      sourceRef: "platform_membership_session_source_001",
      principalId: principal!.principalId,
      membershipId: platformUser.userId,
      realm: "platform",
      status: "active",
      authTime: "2026-08-02T11:00:00.000Z",
      authMethods: ["verified_iap_workforce"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: "2026-08-02T19:00:00.000Z",
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: "2026-08-02T11:00:00.000Z",
      updatedAt: "2026-08-02T11:00:00.000Z",
    });
    const opsSession = await identityRepository.createSession({
      sessionId: "ops_membership_session_001",
      sourceRef: "ops_membership_session_source_001",
      principalId: principal!.principalId,
      membershipId: opsUser.userId,
      realm: "ops",
      status: "active",
      authTime: "2026-08-02T11:05:00.000Z",
      authMethods: ["verified_iap_workforce"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: "2026-08-02T19:05:00.000Z",
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: "2026-08-02T11:05:00.000Z",
      updatedAt: "2026-08-02T11:05:00.000Z",
    });

    const updated = await service.updatePlatformAdminUserRole(
      platformUser.userId,
      {
        roleCode: "superadmin",
        status: "suspended",
        reason: "offboarding shared platform access",
      },
      "platform-user-suspend-platform",
      "principal_platform_supervisor",
    );

    expect(updated).toEqual(
      expect.objectContaining({
        userId: platformUser.userId,
        roleCode: "superadmin",
        status: "suspended",
      }),
    );

    const revokedPlatformSession = await identityRepository.getSession(
      platformSession.sessionId,
    );
    const survivingOpsSession = await identityRepository.getSession(
      opsSession.sessionId,
    );
    expect(revokedPlatformSession?.status).toBe("revoked");
    expect(revokedPlatformSession?.revokeReason).toBe(
      "offboarding shared platform access",
    );
    expect(survivingOpsSession?.status).toBe("active");

    const updateAudit = auditService
      .listAuditLogs()
      .find(
        (entry) =>
          entry.actionName === "update_platform_admin_user_role" &&
          entry.resourceId === platformUser.userId,
      );
    expect(updateAudit?.oldValuesSummary).toEqual(
      expect.objectContaining({
        roleCode: "admin",
        status: "active",
      }),
    );
    expect(updateAudit?.newValuesSummary).toEqual(
      expect.objectContaining({
        roleCode: "superadmin",
        status: "suspended",
        reason: "offboarding shared platform access",
        revokedSessionIds: [platformSession.sessionId],
      }),
    );
  });

  it("backfills missing seed memberships without skipping durable partial migrations", async () => {
    const identityRepository = new IdentityRepository();
    const existingNow = "2026-08-02T11:15:00.000Z";
    await identityRepository.upsertWorkforceIdentity(
      {
        principalId: "principal_existing_seed_ops",
        sourceRef: "iap_subject:seed_ops_existing",
        issuer: "google_iap",
        subject: "seed_ops_existing",
        principalType: "human",
        email: "ops@platform.drts",
        emailVerified: true,
        displayName: "Ops Operator",
        status: "active",
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: existingNow,
      },
      {
        membershipId: "membership_platform_user_7958fb382ce1a114494dbb92",
        sourceRef: "platform_admin_user:ops@platform.drts:ops:membership",
        principalId: "principal_existing_seed_ops",
        realm: "ops",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: existingNow,
      },
      [
        {
          roleBindingId: "role_binding_platform_user_7958fb382ce1a114494dbb92",
          sourceRef: "platform_admin_user:ops@platform.drts:ops:role_binding",
          membershipId: "membership_platform_user_7958fb382ce1a114494dbb92",
          roleCode: "ops_user",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: "2026-02-01T00:00:00.000Z",
          validTo: null,
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: existingNow,
        },
      ],
    );

    const service = new PlatformAdminService(
      new AuditNotificationService(),
      undefined,
      identityRepository,
    );
    await service.onModuleInit();

    const users = await service.listPlatformAdminUsers();
    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "admin@platform.drts",
          roleCode: "superadmin",
          status: "invited",
        }),
        expect.objectContaining({
          email: "ops@platform.drts",
          roleCode: "operator",
          status: "active",
        }),
      ]),
    );
    expect(
      users.filter((user) => user.email === "ops@platform.drts"),
    ).toHaveLength(1);
  });
});
