import { afterEach, describe, expect, it, vi } from "vitest";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { createHmac } from "node:crypto";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";
import { persistenceHarness } from "./persistence-harness";

const tenantId = "tenant-durable-webhook";
const command = {
  url: "https://receiver.example.test/hook",
  secret: "original-webhook-secret",
  events: ["dispatch.assigned"],
};
const services: TenantPartnerService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.onModuleDestroy();
  vi.useRealTimers();
});

function serviceFor(
  repository?: ReturnType<typeof persistenceHarness>["repository"],
  fetcher = vi.fn(async () => ({ ok: true, status: 204 })),
) {
  const audit = new AuditNotificationService();
  const service = new TenantPartnerService(
    audit,
    repository,
    new WebhookDispatchService(fetcher),
    [],
  );
  services.push(service);
  return { service, audit, fetcher };
}

describe("C112 durable commands and first in-flight restart", () => {
  it.each([true, false])(
    "manual retry audit describes the committed delivery outcome (persistence=%s)",
    async (enabled) => {
      const p = persistenceHarness();
      const { service, audit, fetcher } = serviceFor(
        enabled ? p.repository : undefined,
      );
      const endpoint = await service.createWebhookEndpoint(tenantId, command);
      fetcher.mockResolvedValueOnce({ ok: false, status: 410 });
      const failed = await service.sendTestWebhook(tenantId, {
        webhookId: endpoint.webhookId,
      });
      const auditSpy = vi.spyOn(audit, "recordAuditLog");
      let releaseCommit!: () => void;
      if (enabled)
        p.holdCommit(
          () =>
            new Promise<void>((resolve) => {
              releaseCommit = resolve;
            }),
        );
      const retrying = service.retryWebhookDelivery(
        tenantId,
        endpoint.webhookId,
        failed.deliveryId,
        "req-manual-retry-audit",
        {
          actorId: "tenant-integration-manager",
          actorType: "tenant_admin",
          realm: "tenant",
          tenantId,
          roles: ["tc_integration_mgr"],
          scopes: ["tenant:webhooks:write"],
        },
      );
      if (enabled) {
        await new Promise((resolve) => setImmediate(resolve));
        try {
          expect(
            auditSpy.mock.calls.some(
              ([entry]) => entry.actionName === "retry_webhook_delivery",
            ),
          ).toBe(false);
        } finally {
          releaseCommit();
        }
      }
      const retried = await retrying;
      expect(retried).toMatchObject({
        status: "delivered",
        attempt: 2,
        httpStatus: 204,
        nextAttemptAt: null,
      });
      const retryAudit = auditSpy.mock.calls.find(
        ([entry]) => entry.actionName === "retry_webhook_delivery",
      )?.[0];
      expect(retryAudit?.newValuesSummary).toMatchObject({
        status: "delivered",
        attempt: 2,
        httpStatus: 204,
        nextAttemptAt: null,
      });
      if (enabled)
        expect(
          (await p.repository.loadState()).webhookDeliveries.find(
            (item) => item.deliveryId === failed.deliveryId,
          ),
        ).toMatchObject({ status: "delivered", attempt: 2, httpStatus: 204 });
    },
  );

  it.each(["test", "publish"] as const)(
    "%s preparation waits for the pending metadata ACK",
    async (kind) => {
      const p = persistenceHarness();
      const { service, fetcher } = serviceFor(p.repository);
      const endpoint = await service.createWebhookEndpoint(tenantId, command);
      await service.sendTestWebhook(tenantId, {
        webhookId: endpoint.webhookId,
      });
      let releaseCommit!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseCommit = resolve;
      });
      p.holdCommit(() => gate);
      const editing = service.updateWebhookEndpoint(
        tenantId,
        endpoint.webhookId,
        {
          url: command.url + "/pending-config",
        },
      );
      await new Promise((resolve) => setImmediate(resolve));
      const beginsBefore = p.query.mock.calls.filter(
        ([sql]) => sql === "BEGIN",
      ).length;
      const preparing =
        kind === "test"
          ? service.sendTestWebhook(tenantId, { webhookId: endpoint.webhookId })
          : service.publishWebhookEvent(tenantId, {
              eventType: "dispatch.assigned",
              data: { orderId: "pending-metadata" },
            });
      await new Promise((resolve) => setImmediate(resolve));
      const beginsAfter = p.query.mock.calls.filter(
        ([sql]) => sql === "BEGIN",
      ).length;
      releaseCommit();
      const results = await Promise.allSettled([editing, preparing]);
      p.holdCommit();
      expect(beginsAfter).toBe(beginsBefore);
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
      expect(service.listWebhookEndpoints(tenantId)[0]?.url).toBe(
        command.url + "/pending-config",
      );
      expect((await p.repository.loadState()).webhookEndpoints[0]?.url).toBe(
        command.url + "/pending-config",
      );
      if (kind === "test")
        expect((fetcher.mock.calls as unknown[][]).at(-1)?.[0]).toBe(
          command.url + "/pending-config",
        );
    },
  );

  it("a completed HTTP test waits for a pending configuration ACK before applying its outcome", async () => {
    const p = persistenceHarness();
    const { service, fetcher } = serviceFor(p.repository);
    const endpoint = await service.createWebhookEndpoint(tenantId, command);
    let resolveHttp!: (result: { ok: boolean; status: number }) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHttp = resolve;
        }),
    );
    const testing = service.sendTestWebhook(tenantId, {
      webhookId: endpoint.webhookId,
    });
    await new Promise((resolve) => setImmediate(resolve));
    let releaseCommit!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    p.holdCommit(() => gate);
    const editing = service.updateWebhookEndpoint(
      tenantId,
      endpoint.webhookId,
      {
        url: command.url + "/pending-config",
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    const beginsBeforeOutcome = p.query.mock.calls.filter(
      ([sql]) => sql === "BEGIN",
    ).length;
    resolveHttp({ ok: true, status: 204 });
    await new Promise((resolve) => setImmediate(resolve));
    const beginsAfterOutcome = p.query.mock.calls.filter(
      ([sql]) => sql === "BEGIN",
    ).length;
    // Drain both commands even on a regression: no background checks or promises.
    releaseCommit();
    const results = await Promise.allSettled([editing, testing]);
    p.holdCommit();
    expect(beginsAfterOutcome).toBe(beginsBeforeOutcome);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect(service.listWebhookEndpoints(tenantId)[0]).toMatchObject({
      url: command.url + "/pending-config",
      status: "test_pending",
    });
    expect((await p.repository.loadState()).webhookEndpoints[0]).toMatchObject({
      url: command.url + "/pending-config",
      status: "test_pending",
    });
  });

  it("an old successful test cannot activate or restore configuration edited while HTTP was in flight", async () => {
    const { service, fetcher } = serviceFor();
    const endpoint = await service.createWebhookEndpoint(tenantId, command);
    let resolveHttp!: (result: { ok: boolean; status: number }) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHttp = resolve;
        }),
    );
    const pending = service.sendTestWebhook(tenantId, {
      webhookId: endpoint.webhookId,
    });
    await new Promise((resolve) => setImmediate(resolve));
    await service.updateWebhookEndpoint(tenantId, endpoint.webhookId, {
      url: command.url + "/new-config",
    });
    resolveHttp({ ok: true, status: 204 });
    await pending;
    expect(service.listWebhookEndpoints(tenantId)[0]).toMatchObject({
      status: "test_pending",
      url: command.url + "/new-config",
    });
    await service.sendTestWebhook(tenantId, { webhookId: endpoint.webhookId });
    expect(service.listWebhookEndpoints(tenantId)[0]?.status).toBe("active");
  });

  it.each(["create", "edit", "disable", "rotate"] as const)(
    "%s SQL rejection restores canonical state without success audit",
    async (kind) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const p = persistenceHarness();
      const { service, audit } = serviceFor(p.repository);
      const created =
        kind === "create"
          ? undefined
          : await service.createWebhookEndpoint(tenantId, command);
      const before = service.listWebhookEndpoints(tenantId);
      const auditSpy = vi.spyOn(audit, "recordAuditLog");
      p.failInsert(1);
      const pending =
        kind === "create"
          ? service.createWebhookEndpoint(tenantId, command)
          : kind === "rotate"
            ? service.rotateWebhookSecret(tenantId, {
                webhookId: created!.webhookId,
                secret: "new-secret",
              })
            : service.updateWebhookEndpoint(
                tenantId,
                created!.webhookId,
                kind === "disable"
                  ? { status: "disabled", disableReason: "maintenance" }
                  : { url: command.url + "/edited" },
              );
      await expect(pending).rejects.toThrow("SQL rejected");
      expect(service.listWebhookEndpoints(tenantId)).toEqual(before);
      expect(auditSpy).not.toHaveBeenCalled();
    },
  );

  it("status-only activation cannot bypass successful current test, including rotation and disable", async () => {
    const { service } = serviceFor();
    const endpoint = await service.createWebhookEndpoint(tenantId, command);
    const activate = () =>
      service.updateWebhookEndpoint(tenantId, endpoint.webhookId, {
        status: "active",
      });
    await activate();
    expect(service.listWebhookEndpoints(tenantId)[0]?.status).toBe(
      "test_pending",
    );
    await service.sendTestWebhook(tenantId, { webhookId: endpoint.webhookId });
    expect(service.listWebhookEndpoints(tenantId)[0]?.status).toBe("active");
    await service.rotateWebhookSecret(tenantId, {
      webhookId: endpoint.webhookId,
      secret: "rotated-webhook-secret",
    });
    await activate();
    expect(service.listWebhookEndpoints(tenantId)[0]?.status).toBe(
      "test_pending",
    );
    await service.sendTestWebhook(tenantId, { webhookId: endpoint.webhookId });
    await service.updateWebhookEndpoint(tenantId, endpoint.webhookId, {
      status: "disabled",
      disableReason: "maintenance",
    });
    await activate();
    expect(service.listWebhookEndpoints(tenantId)[0]?.status).toBe(
      "test_pending",
    );
    await service.sendTestWebhook(tenantId, { webhookId: endpoint.webhookId });
    expect(service.listWebhookEndpoints(tenantId)[0]?.status).toBe("active");
  });

  it.each(["create", "edit", "disable", "rotate"] as const)(
    "%s holds cache and audit until the actual repository COMMIT",
    async (kind) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const persistence = persistenceHarness();
      const { service, audit } = serviceFor(persistence.repository);
      const created =
        kind === "create"
          ? undefined
          : await service.createWebhookEndpoint(tenantId, command);
      const before = service.listWebhookEndpoints(tenantId);
      const auditSpy = vi.spyOn(audit, "recordAuditLog");
      let release!: () => void;
      persistence.holdCommit(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const pending =
        kind === "create"
          ? service.createWebhookEndpoint(tenantId, command)
          : kind === "rotate"
            ? service.rotateWebhookSecret(tenantId, {
                webhookId: created!.webhookId,
                secret: "new-secret",
              })
            : service.updateWebhookEndpoint(
                tenantId,
                created!.webhookId,
                kind === "disable"
                  ? { status: "disabled", disableReason: "maintenance" }
                  : { url: command.url + "/edited" },
              );
      let settled = false;
      void Promise.resolve(pending).then(() => {
        settled = true;
      });
      await new Promise((resolve) => setImmediate(resolve));
      try {
        expect(settled).toBe(false);
        expect(service.listWebhookEndpoints(tenantId)).toEqual(before);
        expect(auditSpy).not.toHaveBeenCalled();
      } finally {
        release?.();
      }
      await pending;
      expect(auditSpy).toHaveBeenCalledOnce();
    },
  );

  it("recovers first HTTP interrupted after enqueue from persisted state only, with original payload/key/policy and completed dedupe", async () => {
    vi.useFakeTimers();
    const persistence = persistenceHarness();
    const first = serviceFor(persistence.repository);
    const endpoint = await first.service.createWebhookEndpoint(
      tenantId,
      command,
    );
    await first.service.sendTestWebhook(tenantId, {
      webhookId: endpoint.webhookId,
    });
    let releaseHttp!: (result: { ok: boolean; status: number }) => void;
    first.fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseHttp = resolve;
        }),
    );
    const event = {
      eventType: "dispatch.assigned",
      occurredAt: "2026-10-15T12:34:56.000Z",
      data: { orderId: "original-order", nested: { amount: 17 } },
      outboxKey: "original-outbox-key",
    };
    const interrupted = first.service.publishWebhookEvent(tenantId, event);
    await vi.advanceTimersByTimeAsync(0);
    const state = await persistence.repository.loadState();
    const queued = state.webhookDeliveries.find(
      (item) => item.eventType === event.eventType,
    )!;
    expect(queued.status).toBe("queued");
    expect(queued.attempt).toBe(0);
    expect(queued.rawBody).toEqual(
      deepToSnakeCase({
        event: event.eventType,
        tenantId,
        occurredAt: event.occurredAt,
        deliveryId: queued.deliveryId,
        data: event.data,
      }),
    );
    expect(queued.nextAttemptAt).toBeTruthy();
    first.service.onModuleDestroy();
    const second = serviceFor(persistence.repository);
    await second.service.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.fetcher).toHaveBeenCalledOnce();
    const [, request] = second.fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const payload = JSON.parse(request.body as string);
    expect(payload).toEqual(queued.rawBody);
    const headers = request.headers as Record<string, string>;
    const signature = headers["x-drts-webhook-signature"]!;
    const timestamp = /;t=([^;]+);/.exec(signature)![1];
    expect(signature).toContain(
      createHmac("sha256", command.secret)
        .update(`${timestamp}.${request.body as string}`)
        .digest("hex"),
    );
    const recovered = (
      await persistence.repository.loadState()
    ).webhookDeliveries.find((item) => item.deliveryId === queued.deliveryId)!;
    expect(recovered).toMatchObject({
      status: "delivered",
      secretVersion: queued.secretVersion,
      retryPolicySnapshot: queued.retryPolicySnapshot,
      attempt: 1,
    });
    const dedupe = await second.service.publishWebhookEvent(tenantId, {
      ...event,
      data: { orderId: "changed-retry-data", nested: { amount: 18 } },
    });
    expect(dedupe[0]?.deliveryId).toBe(queued.deliveryId);
    expect(second.fetcher).toHaveBeenCalledOnce();
    releaseHttp({ ok: true, status: 204 });
    await interrupted;
  });
});
