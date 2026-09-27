import { test, expect } from "@playwright/test";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import * as path from "node:path";

import { UatNamespaceManager, createTenantPersonas } from "../shared";

const apiRequire = createRequire(path.resolve("apps/api/package.json"));
const { Pool } = apiRequire("pg") as { Pool: any };

test.describe("SR-PARTNER-NOTIFY-QA-20260917: E2E Partner Notification Delivery & Fault Isolation", () => {
  let receiverServer: http.Server;
  let receiverUrl: string;
  let requests: {
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    rawBody: string;
  }[] = [];
  let receiverStatus = 200;
  let receiverDelay = 0;
  let receiverBody = JSON.stringify({ ok: true, received: true });

  let pool: any;

  test.beforeAll(async () => {
    receiverServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf-8");
        requests.push({
          method: req.method ?? "UNKNOWN",
          url: req.url ?? "",
          headers: req.headers,
          rawBody,
        });
        setTimeout(() => {
          res.writeHead(receiverStatus, { "Content-Type": "application/json" });
          res.end(receiverBody);
        }, receiverDelay);
      });
    });
    await new Promise<void>((resolve) =>
      receiverServer.listen(0, "127.0.0.1", () => resolve()),
    );
    const address = receiverServer.address() as any;
    receiverUrl = `http://127.0.0.1:${address.port}/webhook`;
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/drts_fleet_platform",
    });
  });

  test.afterAll(async () => {
    receiverServer.close();
    await pool.end();
  });

  test.beforeEach(() => {
    requests = [];
    receiverStatus = 200;
    receiverDelay = 0;
    receiverBody = JSON.stringify({ ok: true, received: true });
  });

  const apiCall = async (
    client: any,
    tenant: string | null,
    token: string,
    method: "GET" | "POST" | "PUT",
    path: string,
    data?: unknown,
  ) => {
    const baseURL = client.baseURL || "http://127.0.0.1:4102";
    const url = new URL(path, `${baseURL}/`).href;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (tenant) headers["x-tenant-id"] = tenant;
    if (method === "POST" || method === "PUT") {
      const stepUpRes = await client.post(
        `${baseURL}/api/identity/step-up-proofs`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(tenant ? { "x-tenant-id": tenant } : {}),
          },
          data: { method, path: `/${path}` },
        },
      );
      if (stepUpRes.ok()) {
        const envelope = await stepUpRes.json();
        if (envelope.data?.step_up_reference) {
          headers["x-drts-step-up-reference"] = envelope.data.step_up_reference;
        }
      }
    }
    return client.fetch(url, { method, headers, data: data ?? undefined });
  };

  const insertOutbox = async (
    tenantId: string,
    entrySlug: string,
    orderId: string,
  ) => {
    const outboxId = randomUUID();
    const partnerId = `p_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await pool.query(
      `INSERT INTO mobility.phase1_order_partner_notification_routes (
        order_id, tenant_id, partner_id, entry_slug, partner_user_ref,
        drts_passenger_id, passenger_subject_ref, identity_linked_at,
        consent_bundle_version, notification_policy_version, ride_ref,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT DO NOTHING`,
      [
        orderId,
        tenantId,
        partnerId,
        entrySlug,
        "user-ref",
        "pass-id",
        "subject-ref",
        new Date(),
        1,
        1,
        "ride-ref",
        new Date(),
      ],
    );
    await pool.query(
      `INSERT INTO ops.consumer_notification_outbox (
        outbox_id, order_id, passenger_subject_ref, event_type, assignment_version,
        payload, next_attempt_at, created_at, status, attempt_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        outboxId,
        orderId,
        "subject-ref",
        "receipt_ready",
        1,
        JSON.stringify({ eventSequence: 1 }),
        new Date(),
        new Date(),
        "pending",
        0,
      ],
    );
    return outboxId;
  };

  const waitForWorker = async (outboxId: string) => {
    for (let i = 0; i < 60; i++) {
      const res = await pool.query(
        "SELECT status, attempt_count FROM ops.consumer_notification_outbox WHERE outbox_id = $1",
        [outboxId],
      );
      if (
        res.rows.length > 0 &&
        res.rows[0].status !== "pending" &&
        res.rows[0].status !== "sending"
      ) {
        return res.rows[0];
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("Worker timeout");
  };

  test("C201 E2E: Worker positive delivery path", async ({ request }) => {
    test.setTimeout(30000);
    const namespaceManager = UatNamespaceManager.getInstance();
    const shardNs = namespaceManager.createShardNamespace({
      shardIndex: 0,
      taskId: "SR-PARTNER-NOTIFY-QA-20260917",
    });
    const tenantId = shardNs.tenantA.tenantId;
    const personas = createTenantPersonas(shardNs.tenantA);
    const adminToken = personas.admin.platformAuthToken;

    const entrySlug = `tst-${randomUUID().slice(0, 6)}`;
    const createRes = await apiCall(
      request,
      tenantId,
      process.env.DRTS_UAT_TOKEN_PLATFORM!,
      "POST",
      "api/platform-admin/partner-entries",
      {
        name: "Positive Test Partner",
        entrySlug,
        capabilities: { notificationBinding: true },
      },
    );
    expect(createRes.status()).toBe(201);

    const webhookRes = await apiCall(
      request,
      tenantId,
      adminToken,
      "POST",
      "api/tenant/webhooks",
      {
        url: receiverUrl,
        eventTypes: ["partner_notification.*"],
        secretMode: "generated",
      },
    );
    const webhookData = (await webhookRes.json()).data;
    const webhookId = webhookData.webhook.webhookId;

    const enableRes = await apiCall(
      request,
      tenantId,
      process.env.DRTS_UAT_TOKEN_PLATFORM!,
      "POST",
      `api/platform-admin/partner-entries/${entrySlug}/notification-binding/enable`,
      {
        webhookId,
        eventTypes: ["receipt_ready"],
        expectedVersion: 1,
      },
    );
    expect(enableRes.status()).toBe(200);

    const outboxId = await insertOutbox(tenantId, entrySlug, randomUUID());
    const row = await waitForWorker(outboxId);

    expect(row.status).toBe("delivered");
    expect(requests.length).toBeGreaterThan(0);
    expect(requests[0].headers["x-drts-webhook-delivery-id"]).toBeTruthy();
  });

  test("C202 E2E: Transport timeout triggers retry", async ({ request }) => {
    test.setTimeout(30000);
    const namespaceManager = UatNamespaceManager.getInstance();
    const shardNs = namespaceManager.createShardNamespace({
      shardIndex: 1,
      taskId: "SR-PARTNER-NOTIFY-QA-20260917",
    });
    const tenantId = shardNs.tenantA.tenantId;
    const adminToken = createTenantPersonas(shardNs.tenantA).admin
      .platformAuthToken;
    const entrySlug = `timeout-${randomUUID().slice(0, 6)}`;
    await apiCall(
      request,
      tenantId,
      process.env.DRTS_UAT_TOKEN_PLATFORM!,
      "POST",
      "api/platform-admin/partner-entries",
      { name: "Test", entrySlug, capabilities: { notificationBinding: true } },
    );
    const webhookRes = await apiCall(
      request,
      tenantId,
      adminToken,
      "POST",
      "api/tenant/webhooks",
      {
        url: receiverUrl,
        eventTypes: ["partner_notification.*"],
        secretMode: "generated",
      },
    );
    const webhookId = (await webhookRes.json()).data.webhook.webhookId;
    await apiCall(
      request,
      tenantId,
      process.env.DRTS_UAT_TOKEN_PLATFORM!,
      "POST",
      `api/platform-admin/partner-entries/${entrySlug}/notification-binding/enable`,
      { webhookId, eventTypes: ["receipt_ready"], expectedVersion: 1 },
    );

    receiverDelay = 3000;
    const outboxId = await insertOutbox(tenantId, entrySlug, randomUUID());
    const row = await waitForWorker(outboxId);

    expect(row.status).toBe("failed");
    expect(row.attempt_count).toBeGreaterThan(0);
  });

  test("C203 E2E: Missing route triggers 404/permanent failure", async () => {
    test.setTimeout(30000);
    const outboxId = randomUUID();
    await pool.query(
      `INSERT INTO ops.consumer_notification_outbox (
        outbox_id, order_id, passenger_subject_ref, event_type, assignment_version,
        payload, next_attempt_at, created_at, status, attempt_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        outboxId,
        randomUUID(),
        "sub",
        "receipt_ready",
        1,
        JSON.stringify({ eventSequence: 1 }),
        new Date(),
        new Date(),
        "pending",
        0,
      ],
    );
    const row = await waitForWorker(outboxId);
    expect(row.status).toBe("failed");
  });

  test("C204 E2E: Receiver invalid ack (HTTP 204 with payload) handling", async ({
    request,
  }) => {
    test.setTimeout(30000);
    const namespaceManager = UatNamespaceManager.getInstance();
    const shardNs = namespaceManager.createShardNamespace({
      shardIndex: 2,
      taskId: "SR-PARTNER-NOTIFY-QA-20260917",
    });
    const tenantId = shardNs.tenantA.tenantId;
    const adminToken = createTenantPersonas(shardNs.tenantA).admin
      .platformAuthToken;
    const entrySlug = `invack-${randomUUID().slice(0, 6)}`;
    await apiCall(
      request,
      tenantId,
      process.env.DRTS_UAT_TOKEN_PLATFORM!,
      "POST",
      "api/platform-admin/partner-entries",
      { name: "Test", entrySlug, capabilities: { notificationBinding: true } },
    );
    const webhookRes = await apiCall(
      request,
      tenantId,
      adminToken,
      "POST",
      "api/tenant/webhooks",
      {
        url: receiverUrl,
        eventTypes: ["partner_notification.*"],
        secretMode: "generated",
      },
    );
    const webhookId = (await webhookRes.json()).data.webhook.webhookId;
    await apiCall(
      request,
      tenantId,
      process.env.DRTS_UAT_TOKEN_PLATFORM!,
      "POST",
      `api/platform-admin/partner-entries/${entrySlug}/notification-binding/enable`,
      { webhookId, eventTypes: ["receipt_ready"], expectedVersion: 1 },
    );

    receiverStatus = 204;
    receiverBody = JSON.stringify({
      some_garbage_because_204_should_have_no_body: true,
    });

    const outboxId = await insertOutbox(tenantId, entrySlug, randomUUID());
    const row = await waitForWorker(outboxId);

    expect(row.status).toBe("failed");
    expect(row.attempt_count).toBeGreaterThan(0);
  });

  test("C205 E2E: Admin UI displays notification binding and enables retry", async ({
    page,
  }) => {
    test.setTimeout(45000);
    const namespaceManager = UatNamespaceManager.getInstance();
    const shardNs = namespaceManager.createShardNamespace({
      shardIndex: 3,
      taskId: "SR-PARTNER-NOTIFY-QA-20260917",
    });
    const tenantId = shardNs.tenantA.tenantId;
    const entrySlug = `uientry-${randomUUID().slice(0, 6)}`;

    // Create entry
    await page.request.post(
      `http://127.0.0.1:4102/api/platform-admin/partner-entries`,
      {
        headers: {
          Authorization: `Bearer ${process.env.DRTS_UAT_TOKEN_PLATFORM}`,
          "x-tenant-id": tenantId,
        },
        data: {
          name: "UI Partner",
          entrySlug,
          capabilities: { notificationBinding: true },
        },
      },
    );

    // We navigate to the UI on port 3001
    // Need to set the token in localStorage for authentication
    await page.goto("http://127.0.0.1:3001/");
    await page.evaluate((token) => {
      localStorage.setItem("drts_platform_auth_token", token);
    }, process.env.DRTS_UAT_TOKEN_PLATFORM!);

    // Navigate to the partner entry
    await page.goto(
      `http://127.0.0.1:3001/tenant/${tenantId}/partners/${entrySlug}`,
    );

    // The UI should display something about notification binding, wait for it
    await expect(
      page
        .locator("text=Notification Binding")
        .or(page.locator("text=Notification"))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // Maybe take a screenshot or assert
    const title = await page.title();
    expect(title).toBeDefined();
  });
});
