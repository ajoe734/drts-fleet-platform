import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { UatNamespaceManager } from "../shared";
import { PartnerFixture } from "./partner-fixture";

test.describe("SR-PARTNER-NOTIFY-QA-20260917: E2E Partner Notification Delivery & Fault Isolation", () => {
  test.describe.configure({ mode: "default" });
  let fixture: PartnerFixture;
  let client: APIRequestContext;
  test.beforeAll(async ({ playwright }) => {
    test.setTimeout(90_000);
    // This private API context is not a browser tracing context: disposable
    // credential issuance and bearer exchanges must not enter uploaded traces.
    client = await playwright.request.newContext();
    fixture = new PartnerFixture(client);
    await fixture.start();
  });
  test.afterAll(async () => {
    await fixture?.close();
    await client?.dispose();
  });
  test.beforeEach(() => {
    fixture.fault = "none";
  });

  const received = (outboxId: string) =>
    fixture.requests.filter((r) => {
      const payload = JSON.parse(r.rawBody);
      return payload.data?.notification_id === outboxId;
    });
  const accepted = async (outboxId: string) => {
    const row = await fixture.settled(outboxId);
    expect(row).toMatchObject({
      status: "delivered",
      claim_state: "released",
      delivery_stage: "partner_accepted",
      retry_disposition: "none",
      failure_reason: null,
    });
    expect(row.payload.partnerNotification).toMatchObject({
      deliveryTarget: "partner_endpoint",
      deliveryStage: "partner_accepted",
      downstreamStatus: "unknown",
      receiptId: row.receipt_id,
    });
    const inbox = (await fixture.receiver.records()).filter(
      (r) => r.notificationId === outboxId,
    );
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      receiptId: row.receipt_id,
      payloadHash: row.wire_payload_hash,
      deliveryId: row.delivery_id,
      nativeDelivery: "pending",
    });
    const receipts = (
      await fixture.db.query(
        `SELECT provider_message_ref FROM ops.phase1_push_delivery_receipts
      WHERE outbox_id=$1 AND provider_ack_state='provider_acknowledged'`,
        [outboxId],
      )
    ).rows;
    expect(receipts).toEqual([{ provider_message_ref: row.receipt_id }]);
    return row;
  };

  test("C201 E2E: Worker positive delivery path", async () => {
    const testInfo = test.info();
    const entry = fixture.entries[0]!;
    const orderId = await fixture.createRide(entry);
    const outboxId = await fixture.enqueue(orderId);
    const row = await accepted(outboxId);
    expect(row.attempt_count).toBe(1);
    expect(received(outboxId)).toHaveLength(1);
    const wire = JSON.parse(received(outboxId)[0]!.rawBody);
    expect(wire).toMatchObject({
      tenant_id: entry.entry.tenantId,
      delivery_id: row.delivery_id,
      data: {
        notification_id: outboxId,
        partner_entry_slug: entry.entry.entrySlug,
        recipient: { partner_user_ref: entry.partnerUserRef },
        ride_ref: orderId,
        event_sequence: 1,
      },
    });
    await testInfo.attach("controlled-delivery", {
      contentType: "application/json",
      body: JSON.stringify({
        candidate_sha: process.env.CANDIDATE_SHA,
        outboxId,
        orderId,
        wire,
        receiptId: row.receipt_id,
        payloadHash: row.wire_payload_hash,
        boundary: "hosted controlled receiver; native delivery not executed",
      }),
    });
  });

  test("C202 E2E: Transport timeout triggers retry", async () => {
    test.setTimeout(70_000);
    const orderId = await fixture.createRide(fixture.entries[0]!);
    fixture.fault = "timeout";
    const outboxId = await fixture.enqueue(orderId);
    const failed = await fixture.settled(outboxId);
    expect(failed).toMatchObject({
      status: "failed",
      attempt_count: 1,
      claim_state: "released",
      failure_reason: "provider_transient_error",
      retry_disposition: "automatic",
      receipt_id: null,
    });
    expect(received(outboxId)).toHaveLength(1);
    const before = (await fixture.receiver.records()).find(
      (r) => r.notificationId === outboxId,
    )!;
    expect(before.nativeDelivery).toBe("pending");
    fixture.fault = "none";
    // Let the sole real worker reach its policy's nextAttemptAt. Do not alter
    // DB times, invoke send ourselves, or use a second retry scheduler.
    await expect
      .poll(async () => (await fixture.outcome(outboxId))?.status, {
        timeout: 45_000,
        intervals: [500],
      })
      .toBe("delivered");
    const row = await accepted(outboxId);
    expect(row.attempt_count).toBe(2);
    expect(row.receipt_id).toBe(before.receiptId);
    expect(received(outboxId)).toHaveLength(2);
    expect(received(outboxId)[0]!.rawBody).toBe(received(outboxId)[1]!.rawBody);
  });

  test("C203 E2E: Missing route triggers 404/permanent failure", async () => {
    const orderId = await fixture.createRide();
    const outboxId = await fixture.enqueue(orderId, "missing_route");
    const row = await fixture.settled(outboxId);
    expect(row).toMatchObject({
      status: "failed",
      attempt_count: 1,
      claim_state: "released",
      delivered_at: null,
      delivery_id: null,
      receipt_id: null,
    });
    expect(row.payload.partnerNotification).toMatchObject({
      failureReason: "route_missing",
      retryDisposition: "manual_only",
      deliveryStage: null,
      receiptId: null,
    });
    expect(received(outboxId)).toHaveLength(0);
    expect(
      (await fixture.receiver.records()).filter(
        (r) => r.notificationId === outboxId,
      ),
    ).toHaveLength(0);
    // Several actual scheduler polls must leave this refused record untouched.
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    expect((await fixture.outcome(outboxId))!.attempt_count).toBe(1);
    expect(received(outboxId)).toHaveLength(0);
  });

  test("C204 E2E: Receiver invalid ack (HTTP 204 with payload) handling", async () => {
    const orderId = await fixture.createRide(fixture.entries[0]!);
    fixture.fault = "invalid_ack";
    const outboxId = await fixture.enqueue(orderId);
    const row = await fixture.settled(outboxId);
    expect(row).toMatchObject({
      status: "failed",
      attempt_count: 1,
      claim_state: "released",
      failure_reason: "partner_ack_invalid",
      retry_disposition: "manual_only",
      receipt_id: null,
    });
    expect(received(outboxId)).toHaveLength(1);
    expect(
      (await fixture.receiver.records()).filter(
        (r) => r.notificationId === outboxId,
      ),
    ).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    expect((await fixture.outcome(outboxId))!.attempt_count).toBe(1);
    expect(received(outboxId)).toHaveLength(1);
  });

  test("C206 E2E: Same tenant entries deliver only to the original entry", async () => {
    const [first, second] = fixture.entries;
    expect(first!.entry.tenantId).toBe(second!.entry.tenantId);
    expect(first!.entry.entrySlug).not.toBe(second!.entry.entrySlug);
    for (const entry of [first!, second!]) {
      const outboxId = await fixture.enqueue(await fixture.createRide(entry));
      await accepted(outboxId);
      expect(received(outboxId)).toHaveLength(1);
      expect(
        JSON.parse(received(outboxId)[0]!.rawBody).data.partner_entry_slug,
      ).toBe(entry.entry.entrySlug);
    }
  });

  test("C207 E2E: Same URL across tenants preserves recipient isolation", async () => {
    const [first, , otherTenant] = fixture.entries;
    expect(first!.entry.tenantId).not.toBe(otherTenant!.entry.tenantId);
    expect(first!.webhookId).not.toBe(otherTenant!.webhookId);
    for (const entry of [first!, otherTenant!]) {
      const outboxId = await fixture.enqueue(await fixture.createRide(entry));
      await accepted(outboxId);
      expect(received(outboxId)).toHaveLength(1);
      expect(JSON.parse(received(outboxId)[0]!.rawBody)).toMatchObject({
        tenant_id: entry.entry.tenantId,
        data: {
          partner_entry_slug: entry.entry.entrySlug,
          recipient: { partner_user_ref: entry.partnerUserRef },
        },
      });
    }
  });

  // QA-R5 remains open: inherited UI case awaits its independent repair unit.
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
