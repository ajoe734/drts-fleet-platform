import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerRepository } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

it("isolated OS process recovery worker (invoked by postgres.test.ts)", async () => {
  const url = new URL(process.env.DATABASE_URL!);
  expect(url.pathname).toMatch(/^\/sr_qa_webhook_001_/);
  expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
  const contextPath = process.env.DRTS_WEBHOOK_PROCESS_CONTEXT!;
  expect(contextPath).toBeTruthy();
  const db = new DatabaseService();
  const repository = new TenantPartnerRepository(db);
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    repository,
    new WebhookDispatchService(),
    [],
  );
  try {
    await service.onModuleInit();
    if (process.env.DRTS_WEBHOOK_PROCESS_PHASE === "write") {
      const tenantId = `qa-webhook-${randomUUID()}`;
      const endpoint = service.createWebhookEndpoint(tenantId, {
        url: process.env.DRTS_WEBHOOK_PROCESS_RECEIVER!,
        secret: process.env.DRTS_WEBHOOK_PROCESS_SECRET!,
        events: ["dispatch.assigned"],
      });
      await service.sendTestWebhook(tenantId, {
        webhookId: endpoint.webhookId,
      });
      const command = {
        eventType: "dispatch.assigned",
        data: { orderId: randomUUID() },
        outboxKey: randomUUID(),
      };
      const [queued] = await service.publishWebhookEvent(tenantId, command);
      expect(queued.status).toBe("queued");
      await expect
        .poll(
          async () =>
            (await repository.loadState()).webhookDeliveries.find(
              (row) => row.deliveryId === queued.deliveryId,
            )?.status,
        )
        .toBe("queued");
      writeFileSync(
        contextPath,
        JSON.stringify({
          tenantId,
          webhookId: endpoint.webhookId,
          deliveryId: queued.deliveryId,
          command,
          writerPid: process.pid,
        }),
      );
      // Parent SIGKILLs this process group after observing the durable queue row.
      await new Promise(() => {});
    } else {
      expect(process.env.DRTS_WEBHOOK_PROCESS_PHASE).toBe("recover");
      const context = JSON.parse(readFileSync(contextPath, "utf8"));
      expect(process.pid).not.toBe(context.writerPid);
      await expect
        .poll(
          async () =>
            (await repository.loadState()).webhookDeliveries.find(
              (row) => row.deliveryId === context.deliveryId,
            )?.status,
          { timeout: 40_000, interval: 250 },
        )
        .toBe("delivered");
      const [duplicate] = await service.publishWebhookEvent(
        context.tenantId,
        context.command,
      );
      expect(duplicate.deliveryId).toBe(context.deliveryId);
      const rows = (await repository.loadState()).webhookDeliveries.filter(
        (row) => row.deliveryId === context.deliveryId,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].tenantId).toBe(context.tenantId);
      expect(rows[0].webhookId).toBe(context.webhookId);
      writeFileSync(
        `${contextPath}.recovered`,
        JSON.stringify({
          ...context,
          recoveryPid: process.pid,
          status: rows[0].status,
        }),
      );
    }
  } finally {
    service.onModuleDestroy();
    await db.onModuleDestroy();
  }
}, 55_000);
