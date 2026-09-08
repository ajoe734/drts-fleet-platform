import { createHmac, randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerRepository } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { WebhookDispatchService } from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

const databases: DatabaseService[] = [];
const services: TenantPartnerService[] = [];
const servers: http.Server[] = [];

function createService() {
  // Only a disposable task database is allowed: init may bootstrap demo rows.
  const url = new URL(process.env.DATABASE_URL ?? "http://unconfigured");
  expect(url.pathname).toMatch(/^\/sr_qa_webhook_001_/);
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  const db = new DatabaseService();
  databases.push(db);
  const repository = new TenantPartnerRepository(db);
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    repository,
    new WebhookDispatchService(),
    [],
  );
  services.push(service);
  return { db, repository, service };
}

afterEach(async () => {
  for (const service of services.splice(0)) service.onModuleDestroy();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const db of databases.splice(0)) await db.onModuleDestroy();
});

it("C111: persisted key rotation and revocation survive new service initialization", async () => {
  const tenantId = `qa-webhook-${randomUUID()}`;
  const first = createService();
  const issued = await first.service.issueApiKey(tenantId, {
    keyName: "DB acceptance",
    scopes: ["tenant:webhooks:read"],
  });
  await expect
    .poll(async () =>
      (await first.repository.loadState()).apiKeys.some(
        (key) => key.apiKeyId === issued.apiKey.apiKeyId,
      ),
    )
    .toBe(true);
  const rotated = await first.service.rotateApiKey(
    tenantId,
    issued.apiKey.apiKeyId,
    {
      keyName: "DB rotated",
      overlapDays: 7,
    },
  );
  await expect
    .poll(
      async () =>
        (await first.repository.loadState()).apiKeys.filter(
          (key) => key.tenantId === tenantId,
        ).length,
    )
    .toBe(2);
  const rows = await first.db.query<{ record: Record<string, unknown> }>(
    "SELECT record FROM admin.phase1_tenant_api_keys WHERE tenant_id = $1",
    [tenantId],
  );
  expect(rows.rows).toHaveLength(2);
  expect(JSON.stringify(rows.rows)).not.toContain(issued.plaintextKey);
  expect(JSON.stringify(rows.rows)).not.toContain(rotated.plaintextKey);
  expect(
    rows.rows.find(({ record }) => record.apiKeyId === issued.apiKey.apiKeyId)
      ?.record.supersededByApiKeyId,
  ).toBe(rotated.apiKey.apiKeyId);
  first.service.onModuleDestroy();
  const second = createService();
  await second.service.onModuleInit();
  expect(
    second.service
      .listApiKeys(tenantId)
      .find((key) => key.apiKeyId === issued.apiKey.apiKeyId)?.status,
  ).toBe("overlap_active");
  await second.service.revokeApiKey(tenantId, rotated.apiKey.apiKeyId);
  await expect
    .poll(
      async () =>
        (await second.repository.loadState()).apiKeys.find(
          (key) => key.apiKeyId === rotated.apiKey.apiKeyId,
        )?.status,
    )
    .toBe("revoked");
  const third = createService();
  await third.service.onModuleInit();
  expect(
    third.service
      .listApiKeys(tenantId)
      .find((key) => key.apiKeyId === rotated.apiKey.apiKeyId)?.status,
  ).toBe("revoked");
  await expect(async () =>
    third.service.rotateApiKey(tenantId, rotated.apiKey.apiKeyId, {
      keyName: "forbidden",
    }),
  ).rejects.toThrow();
  console.log(
    "SR-QA-WEBHOOK-001 DB keys",
    JSON.stringify({
      tenantId,
      apiKeyId: issued.apiKey.apiKeyId,
      rotatedApiKeyId: rotated.apiKey.apiKeyId,
    }),
  );
});

it("C112: PostgreSQL queued delivery resumes automatically after service restart and deduplicates outbox", async () => {
  const tenantId = `qa-webhook-${randomUUID()}`;
  const secret = randomUUID();
  const requests: { body: string; signature: string }[] = [];
  let status = 200;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push({
        body,
        signature: String(req.headers["x-drts-webhook-signature"]),
      });
      res.writeHead(status).end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const first = createService();
  const endpoint = first.service.createWebhookEndpoint(tenantId, {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/receiver`,
    secret,
    events: ["dispatch.assigned"],
  });
  await first.service.sendTestWebhook(tenantId, {
    webhookId: endpoint.webhookId,
  });
  status = 503;
  const command = {
    eventType: "dispatch.assigned",
    data: { orderId: randomUUID() },
    outboxKey: randomUUID(),
  };
  const [queued] = await first.service.publishWebhookEvent(tenantId, command);
  expect(queued.status).toBe("queued");
  await expect
    .poll(async () => {
      const state = await first.repository.loadState();
      return state.webhookDeliveries.find(
        (delivery) => delivery.deliveryId === queued.deliveryId,
      )?.status;
    })
    .toBe("queued");
  first.service.onModuleDestroy();
  status = 200;
  const second = createService();
  await second.service.onModuleInit();
  // Real default backoff timer; no fake clock, SQL patch or manual retry call.
  await expect
    .poll(
      async () => {
        const state = await second.repository.loadState();
        return state.webhookDeliveries.find(
          (delivery) => delivery.deliveryId === queued.deliveryId,
        )?.status;
      },
      { timeout: 40_000, interval: 250 },
    )
    .toBe("delivered");
  expect(requests).toHaveLength(3);
  const delivered = (
    await second.repository.loadState()
  ).webhookDeliveries.find(
    (delivery) => delivery.deliveryId === queued.deliveryId,
  )!;
  expect(delivered.webhookId).toBe(endpoint.webhookId);
  expect(delivered.tenantId).toBe(tenantId);
  const received = requests[2];
  const match = /^v=1;t=([^;]+);sig=([0-9a-f]+)$/.exec(received.signature)!;
  expect(match).not.toBeNull();
  expect(
    createHmac("sha256", secret)
      .update(`${match[1]}.${received.body}`)
      .digest("hex"),
  ).toBe(match[2]);
  expect(
    createHmac("sha256", secret)
      .update(`${match[1]}.${received.body}tampered`)
      .digest("hex"),
  ).not.toBe(match[2]);
  const [duplicate] = await second.service.publishWebhookEvent(
    tenantId,
    command,
  );
  expect(duplicate.deliveryId).toBe(queued.deliveryId);
  expect(requests).toHaveLength(3);
  console.log(
    "SR-QA-WEBHOOK-001 DB delivery",
    JSON.stringify({
      tenantId,
      webhookId: endpoint.webhookId,
      deliveryId: queued.deliveryId,
      outboxKey: command.outboxKey,
      requests: requests.length,
    }),
  );
}, 45_000);
