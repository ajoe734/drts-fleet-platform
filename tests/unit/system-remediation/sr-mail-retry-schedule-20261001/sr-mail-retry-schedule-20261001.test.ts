import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// apps/api's own dependencies (@nestjs/core) are not hoisted to the repo
// root, so a root-run `vitest run tests/**` cannot resolve a plain
// `import ... from "@nestjs/core"` from this file's location. Anchor
// resolution at apps/api/package.json instead, matching
// tests/unit/system-remediation/sr-mail-001/tenant-invitation-delivery.service.test.ts.
const apiRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = apiRequire("@nestjs/core");

import type {
  TenantBookingApprovalRequestRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import {
  BootstrapAuthGuard,
  JwtAuthService,
  type AuthenticatedRequestLike,
  type BootstrapRequestIdentity,
} from "../../../../apps/api/src/common/auth";
import { GOOGLE_WORKLOAD_IDENTITY_HEADER } from "../../../../apps/api/src/modules/auth/google-workload-identity.adapter";
import type { GoogleWorkloadIdentityAdapter } from "../../../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { AuditNotificationEmailAdapter } from "../../../../apps/api/src/modules/audit-notification/audit-notification.email-adapter";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type { ProviderAcknowledgement } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import type {
  TenantPartnerRepository,
  TenantPartnerState,
} from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// SR-MAIL-RETRY-SCHEDULE-20261001: root cause was "nothing ever calls
// drain()" and "the approval-timeout reminder only ticks an in-process
// setInterval, which never fires while Cloud Run is scaled to zero". These
// tests exercise the real new HTTP triggers end to end (not just the
// retry/backoff mechanics NotificationDeliveryService already covers in
// SR-NOTIFY-001) and the Google-workload-identity fallback that lets a Cloud
// Scheduler OIDC caller satisfy a "system"-only route.

function createExecutionContext(
  request: AuthenticatedRequestLike,
  handler: () => void = function handler() {},
  target: abstract new () => unknown = class GuardTarget {},
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => target,
  } as never;
}

function systemIdentity(
  scopes: string[] = [
    "notification-delivery:drain",
    "tenant-partner:approval-timeout-reminders:run",
  ],
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "system",
    actorId: "scheduler",
    realm: "system",
    tenantId: null,
    roleFamilies: [],
    roles: [],
    scopes,
    requestId: null,
  };
}

function nonSystemIdentity(): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "tenant_admin",
    actorId: "tenant-admin-001",
    realm: "tenant",
    tenantId: "tenant-demo-001",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["tenant:read"],
    requestId: null,
  };
}

describe("SR-MAIL-RETRY-SCHEDULE-20261001 BootstrapAuthGuard Google workload identity fallback", () => {
  function invalidJwtAuthService() {
    // No JWT_SECRET is configured, so JwtAuthService.verify() always resolves
    // null for any bearer token -- exactly what happens when Cloud
    // Scheduler's native OIDC auth presents a Google-signed token here (it
    // always lands in Authorization: Bearer, never a custom header, and a
    // Google token never verifies as this app's own JWT).
    return new JwtAuthService();
  }

  it("verifies a Google-signed bearer token against the workload identity adapter for a system-only route", async () => {
    const verifyServicePrincipal = vi.fn().mockResolvedValue({
      principalId: "principal-mail-scheduler",
      actorId: "mail-scheduler",
      email: "mail-scheduler@project.iam.gserviceaccount.com",
      subject: "subject-001",
      displayName: null,
      roles: [],
      scopes: ["notification-delivery:drain"],
      audience: "https://api.dev.drts.internal",
      authTime: "2026-10-01T00:00:00.000Z",
      ciTenantActorGrants: [],
    });
    const adapter = {
      verifyServicePrincipal,
    } as unknown as GoogleWorkloadIdentityAdapter;
    const guard = new BootstrapAuthGuard(
      new Reflector(),
      invalidJwtAuthService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      adapter,
    );
    const request: AuthenticatedRequestLike = {
      headers: { authorization: "Bearer not-a-drts-jwt.google-signed" },
      method: "POST",
      originalUrl: "/api/internal/scheduled-tasks/mail-outbox/drain",
    };

    expect(await guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(request.identity).toMatchObject({
      realm: "system",
      actorType: "system",
      scopes: ["notification-delivery:drain"],
    });
    expect(verifyServicePrincipal).toHaveBeenCalledWith(
      { [GOOGLE_WORKLOAD_IDENTITY_HEADER]: "not-a-drts-jwt.google-signed" },
      {
        requestPath: "/api/internal/scheduled-tasks/mail-outbox/drain",
        requestMethod: "POST",
      },
    );
  });

  it("never attempts the workload identity fallback on a route that allows more than the system realm", async () => {
    const verifyServicePrincipal = vi.fn().mockResolvedValue({
      principalId: "principal-mail-scheduler",
      actorId: "mail-scheduler",
      email: "mail-scheduler@project.iam.gserviceaccount.com",
      subject: "subject-001",
      displayName: null,
      roles: [],
      scopes: ["tenant:read"],
      audience: "https://api.dev.drts.internal",
      authTime: "2026-10-01T00:00:00.000Z",
      ciTenantActorGrants: [],
    });
    const adapter = {
      verifyServicePrincipal,
    } as unknown as GoogleWorkloadIdentityAdapter;
    const guard = new BootstrapAuthGuard(
      new Reflector(),
      invalidJwtAuthService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      adapter,
    );
    const request: AuthenticatedRequestLike = {
      headers: { authorization: "Bearer not-a-drts-jwt.google-signed" },
      method: "GET",
      originalUrl: "/api/tenant-partner/summary",
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toMatchObject({ code: "JWT_INVALID" });
    expect(verifyServicePrincipal).not.toHaveBeenCalled();
  });

  it("falls through to the original JWT_INVALID rejection when workload identity verification itself fails", async () => {
    const verifyServicePrincipal = vi
      .fn()
      .mockRejectedValue(
        new ApiRequestError(403, "WORKLOAD_AUDIENCE_MISMATCH", "nope"),
      );
    const adapter = {
      verifyServicePrincipal,
    } as unknown as GoogleWorkloadIdentityAdapter;
    const guard = new BootstrapAuthGuard(
      new Reflector(),
      invalidJwtAuthService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      adapter,
    );
    const request: AuthenticatedRequestLike = {
      headers: { authorization: "Bearer replayed-or-forged-token" },
      method: "POST",
      originalUrl: "/api/internal/scheduled-tasks/mail-outbox/drain",
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toMatchObject({ code: "JWT_INVALID" });
    expect(request.identity).toBeUndefined();
  });

  it("still enforces the route's required scopes on a verified workload identity", async () => {
    const verifyServicePrincipal = vi.fn().mockResolvedValue({
      principalId: "principal-mail-scheduler",
      actorId: "mail-scheduler",
      email: "mail-scheduler@project.iam.gserviceaccount.com",
      subject: "subject-001",
      displayName: null,
      roles: [],
      scopes: [], // missing notification-delivery:drain
      audience: "https://api.dev.drts.internal",
      authTime: "2026-10-01T00:00:00.000Z",
      ciTenantActorGrants: [],
    });
    const adapter = {
      verifyServicePrincipal,
    } as unknown as GoogleWorkloadIdentityAdapter;
    const guard = new BootstrapAuthGuard(
      new Reflector(),
      invalidJwtAuthService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      adapter,
    );
    const request: AuthenticatedRequestLike = {
      headers: { authorization: "Bearer not-a-drts-jwt.google-signed" },
      method: "POST",
      originalUrl: "/api/internal/scheduled-tasks/mail-outbox/drain",
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
  });
});

describe("SR-MAIL-RETRY-SCHEDULE-20261001 mail outbox drain trigger", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sr-mail-retry-schedule-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function acknowledgement(): ProviderAcknowledgement {
    return {
      provider: "test-provider",
      response: "250 Accepted",
      providerMessageId: "msg-001",
      acceptedAt: new Date().toISOString(),
    };
  }

  function buildController(
    notificationDeliveryService?: NotificationDeliveryService,
  ) {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    return new TenantPartnerController(
      tenantPartnerService,
      {} as never,
      {} as never,
      new JwtAuthService(),
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      notificationDeliveryService,
    );
  }

  it("rejects a non-system identity with 403", async () => {
    const controller = buildController(undefined);
    await expect(
      controller.drainMailOutbox(nonSystemIdentity()),
    ).rejects.toMatchObject({ code: "AUTHZ_SCOPE_DENIED" });
  });

  it("reports 503 when the notification delivery outbox is not configured", async () => {
    const controller = buildController(undefined);
    await expect(
      controller.drainMailOutbox(systemIdentity()),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("drains a real pending retryable mail through the trigger that previously had no caller", async () => {
    const send = vi.fn(async () => acknowledgement());
    const deliveryService = new NotificationDeliveryService(
      new FileMailOutbox(directory),
      { provider: "test-provider", send },
      { maxAttempts: 5, retryDelayMs: 1_000, leaseMs: 60_000 },
    );
    await deliveryService.enqueue({
      tenantId: "tenant-drain-001",
      idempotencyKey: "drain-trigger-001",
      recipientEmail: "ops@example.test",
      fromEmail: "notifications@example.test",
      subject: "Pending retryable mail",
      body: "Was never sent before this trigger existed.",
    });

    const controller = buildController(deliveryService);
    const result = (await controller.drainMailOutbox(systemIdentity())) as {
      data: { drained: number; sent: number; failed: number };
    };

    expect(result.data).toEqual({ drained: 1, sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not double-send when the trigger is called twice concurrently against the same warm instance", async () => {
    let resolveSend!: (value: ProviderAcknowledgement) => void;
    const send = vi.fn(
      () =>
        new Promise<ProviderAcknowledgement>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const deliveryService = new NotificationDeliveryService(
      new FileMailOutbox(directory),
      { provider: "test-provider", send },
      { maxAttempts: 5, retryDelayMs: 1_000, leaseMs: 60_000 },
    );
    await deliveryService.enqueue({
      tenantId: "tenant-drain-002",
      idempotencyKey: "drain-trigger-002",
      recipientEmail: "ops@example.test",
      fromEmail: "notifications@example.test",
      subject: "Concurrently triggered mail",
      body: "Two overlapping scheduler calls must still send this once.",
    });

    const controller = buildController(deliveryService);
    const first = controller.drainMailOutbox(systemIdentity());
    // Wait for the first call's dispatch to actually reach the transport
    // (claim the lease via the flock-serialized outbox transaction) before
    // the second trigger starts racing it. The FileMailOutbox lock acquires
    // a real subprocess, so this is not instantaneous.
    await vi.waitFor(
      () => {
        if (send.mock.calls.length === 0) {
          throw new Error("first call has not reached the transport yet");
        }
      },
      { timeout: 5_000, interval: 5 },
    );
    const second = controller.drainMailOutbox(systemIdentity());
    resolveSend(acknowledgement());

    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("SR-MAIL-RETRY-SCHEDULE-20261001 approval-timeout reminder trigger", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "sr-mail-retry-schedule-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function approvalRequestNearingTimeout(): TenantBookingApprovalRequestRecord {
    return {
      approvalRequestId: "approval-request-sweep-001",
      tenantId: "tenant-sweep-001",
      bookingId: "booking-sweep-001",
      orderId: "order-sweep-001",
      evaluationId: "eval-sweep-001",
      ruleIds: ["rule-001"],
      status: "pending",
      approvalMode: "any_one",
      approvers: [],
      resolvedApproverUserIds: ["user-sweep-001"],
      previousApprovers: [],
      decisions: [],
      // R1-01's repository-refresh path clones every fetched request through
      // the real `cloneApprovalRequest`/`cloneTenantApprovalEvaluationResult`,
      // which indexes into `matchedRules`; an empty `{}` snapshot (fine for
      // the older tests that assign `approvalRequests` directly, bypassing
      // cloning) throws there.
      evaluationSnapshot: { matchedRules: [] } as never,
      // 1h out, inside the 12h reminder lead window and not yet timed out.
      timeoutAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      escalatedAt: null,
      fallbackPolicy: "escalate",
      escalationTarget: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    } as unknown as TenantBookingApprovalRequestRecord;
  }

  function approverUserRole(): TenantUserRoleRecord {
    return {
      userId: "user-sweep-001",
      tenantId: "tenant-sweep-001",
      email: "approver@example.test",
      displayName: "Approver",
      roleCode: "tenant_admin",
      status: "active",
      approvalNotificationOptOut: false,
      invitedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function buildController(service: TenantPartnerService) {
    return new TenantPartnerController(
      service,
      {} as never,
      {} as never,
      new JwtAuthService(),
      {} as never,
    );
  }

  it("rejects a non-system identity with 403", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    const controller = buildController(service);
    await expect(
      controller.runApprovalTimeoutReminders(nonSystemIdentity()),
    ).rejects.toMatchObject({ code: "AUTHZ_SCOPE_DENIED" });
  });

  it("dispatches an approaching-timeout reminder through the trigger previously reachable only by a 60s in-process timer", async () => {
    const send = vi.fn(async () => acknowledgement());
    const deliveryService = new NotificationDeliveryService(
      new FileMailOutbox(directory),
      { provider: "test-provider", send },
      { maxAttempts: 5, retryDelayMs: 1_000, leaseMs: 60_000 },
    );
    const emailAdapter = new AuditNotificationEmailAdapter(deliveryService);
    const auditNotificationService = new AuditNotificationService(
      undefined,
      emailAdapter,
    );
    const service = new TenantPartnerService(auditNotificationService);
    (service as unknown as { approvalRequests: unknown[] }).approvalRequests = [
      approvalRequestNearingTimeout(),
    ];
    (service as unknown as { userRoles: unknown[] }).userRoles = [
      approverUserRole(),
    ];

    const controller = buildController(service);
    const result = (await controller.runApprovalTimeoutReminders(
      systemIdentity(),
    )) as { data: { evaluated: number; dispatched: number } };

    expect(result.data).toEqual({ evaluated: 1, dispatched: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  function acknowledgement(): ProviderAcknowledgement {
    return {
      provider: "test-provider",
      response: "250 Accepted",
      providerMessageId: "msg-sweep-001",
      acceptedAt: new Date().toISOString(),
    };
  }

  it("does not double-send the same reminder when two independent cold-started instances race on the same persisted state", async () => {
    const send = vi.fn(async () => acknowledgement());

    function buildRacingService() {
      const deliveryService = new NotificationDeliveryService(
        new FileMailOutbox(directory),
        { provider: "test-provider", send },
        { maxAttempts: 5, retryDelayMs: 1_000, leaseMs: 60_000 },
      );
      const emailAdapter = new AuditNotificationEmailAdapter(deliveryService);
      // No shared AuditLogRepository between the two instances: each one's
      // in-memory hasApprovalNotificationDispatch pre-check independently
      // believes "not yet dispatched", the worst-case race. Only the shared
      // Postgres-equivalent (flock-serialized FileMailOutbox) outbox lock on
      // the shared `directory` can prevent a duplicate send here.
      const auditNotificationService = new AuditNotificationService(
        undefined,
        emailAdapter,
      );
      const service = new TenantPartnerService(auditNotificationService);
      (service as unknown as { approvalRequests: unknown[] }).approvalRequests =
        [approvalRequestNearingTimeout()];
      (service as unknown as { userRoles: unknown[] }).userRoles = [
        approverUserRole(),
      ];
      return service;
    }

    const instanceA = buildRacingService();
    const instanceB = buildRacingService();

    await Promise.all([
      instanceA.runApprovalTimeoutNotificationSweep(),
      instanceB.runApprovalTimeoutNotificationSweep(),
    ]);

    expect(send).toHaveBeenCalledTimes(1);
  });

  function emptyRepositoryState(): TenantPartnerState {
    return {
      notificationPreferences: [],
      webhookEndpoints: [],
      webhookDeliveries: [],
      slaProfiles: [],
      partnerEntries: [],
      partnerIngressCredentials: [],
      partnerEligibilityVerifications: [],
      approvalRules: [],
      approvalRequests: [],
      approvalDecisions: [],
      passengers: [],
      addresses: [],
      costCenters: [],
      quotaPolicies: [],
      quotaLedger: [],
      quotaMonthlySnapshots: [],
      userRoles: [],
      apiKeys: [],
    };
  }

  // SR-MAIL-RETRY-SCHEDULE-20261001 R1-01 (Codex review, candidate
  // 90c6138ce8086e4f3659351b037171b00fc97c9e): the sweep used to read only
  // `this.approvalRequests`/`this.userRoles`, populated once at
  // `onModuleInit` and never refreshed. A warm instance that cold-started
  // before a sibling instance created a new approval request (or changed a
  // recipient's opt-out) would keep evaluating against that stale snapshot
  // forever. These two tests reproduce that race against a fake repository
  // and assert the sweep now reads the authoritative state fresh each run.
  it("R1-01: pulls approval requests and recipients from the repository each sweep instead of the stale onModuleInit snapshot", async () => {
    const send = vi.fn(async () => acknowledgement());
    const deliveryService = new NotificationDeliveryService(
      new FileMailOutbox(directory),
      { provider: "test-provider", send },
      { maxAttempts: 5, retryDelayMs: 1_000, leaseMs: 60_000 },
    );
    const emailAdapter = new AuditNotificationEmailAdapter(deliveryService);
    const auditNotificationService = new AuditNotificationService(
      undefined,
      emailAdapter,
    );

    // Instance B cold-starts against an authoritative store that has no
    // pending approvals yet.
    let persisted = emptyRepositoryState();
    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => persisted),
    } as unknown as TenantPartnerRepository;
    const service = new TenantPartnerService(
      auditNotificationService,
      repository,
    );
    await service.onModuleInit();

    const beforeCreate = await service.runApprovalTimeoutNotificationSweep();
    expect(beforeCreate).toEqual({ evaluated: 0, dispatched: 0 });
    expect(send).not.toHaveBeenCalled();

    // Instance A creates the approval request and its approver directly in
    // the authoritative store; instance B never re-runs onModuleInit.
    persisted = {
      ...emptyRepositoryState(),
      approvalRequests: [approvalRequestNearingTimeout()],
      userRoles: [approverUserRole()],
    };

    const afterCreate = await service.runApprovalTimeoutNotificationSweep();
    expect(afterCreate).toEqual({ evaluated: 1, dispatched: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("R1-01: stops notifying once a sibling instance resolves the request, without re-reading the whole module init bootstrap", async () => {
    const send = vi.fn(async () => acknowledgement());
    const deliveryService = new NotificationDeliveryService(
      new FileMailOutbox(directory),
      { provider: "test-provider", send },
      { maxAttempts: 5, retryDelayMs: 1_000, leaseMs: 60_000 },
    );
    const emailAdapter = new AuditNotificationEmailAdapter(deliveryService);
    const auditNotificationService = new AuditNotificationService(
      undefined,
      emailAdapter,
    );

    let persisted: TenantPartnerState = {
      ...emptyRepositoryState(),
      approvalRequests: [approvalRequestNearingTimeout()],
      userRoles: [approverUserRole()],
    };
    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => persisted),
    } as unknown as TenantPartnerRepository;
    const service = new TenantPartnerService(
      auditNotificationService,
      repository,
    );
    await service.onModuleInit();

    const firstSweep = await service.runApprovalTimeoutNotificationSweep();
    expect(firstSweep).toEqual({ evaluated: 1, dispatched: 1 });
    expect(send).toHaveBeenCalledTimes(1);

    // A sibling instance resolves the request after this sweep. Without a
    // fresh read, the stale in-memory copy (still "pending") would try to
    // notify it again on the next tick.
    persisted = {
      ...persisted,
      approvalRequests: [
        { ...approvalRequestNearingTimeout(), status: "approved" },
      ],
    };

    const secondSweep = await service.runApprovalTimeoutNotificationSweep();
    expect(secondSweep).toEqual({ evaluated: 0, dispatched: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  // SR-MAIL-RETRY-SCHEDULE-20261001 R1-02 (same review): the in-flight guard
  // returned a hardcoded `{evaluated:0,dispatched:0}` to any caller that
  // overlapped a sweep already running, instead of that sweep's real result.
  // A scheduler-triggered HTTP call landing during a concurrent interval
  // tick (or two overlapping scheduler calls) would get told "success, 0
  // dispatched" even while real dispatch work was still in flight.
  it("R1-02: a call that overlaps an in-flight sweep awaits and returns the real result instead of a stale zero", async () => {
    const send = vi.fn(async () => acknowledgement());
    const deliveryService = new NotificationDeliveryService(
      new FileMailOutbox(directory),
      { provider: "test-provider", send },
      { maxAttempts: 5, retryDelayMs: 1_000, leaseMs: 60_000 },
    );
    const emailAdapter = new AuditNotificationEmailAdapter(deliveryService);
    const auditNotificationService = new AuditNotificationService(
      undefined,
      emailAdapter,
    );

    let resolveLoadState!: (state: TenantPartnerState) => void;
    const loadState = vi.fn(
      () =>
        new Promise<TenantPartnerState>((resolve) => {
          resolveLoadState = resolve;
        }),
    );
    const repository = {
      isEnabled: () => true,
      loadState,
    } as unknown as TenantPartnerRepository;
    const service = new TenantPartnerService(
      auditNotificationService,
      repository,
    );

    const first = service.runApprovalTimeoutNotificationSweep();
    const second = service.runApprovalTimeoutNotificationSweep();

    resolveLoadState({
      ...emptyRepositoryState(),
      approvalRequests: [approvalRequestNearingTimeout()],
      userRoles: [approverUserRole()],
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual({ evaluated: 1, dispatched: 1 });
    expect(secondResult).toEqual({ evaluated: 1, dispatched: 1 });
    expect(loadState).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("R1-02: a repository failure during the sweep surfaces as a failure response, not a false-success zero result", async () => {
    const auditNotificationService = new AuditNotificationService();
    const repository = {
      isEnabled: () => true,
      loadState: vi.fn(async () => {
        throw new Error("simulated repository outage");
      }),
    } as unknown as TenantPartnerRepository;
    const service = new TenantPartnerService(
      auditNotificationService,
      repository,
    );
    const controller = buildController(service);

    await expect(
      controller.runApprovalTimeoutReminders(systemIdentity()),
    ).rejects.toMatchObject({ code: "APPROVAL_TIMEOUT_SWEEP_FAILED" });
  });
});
