import { test, expect } from "@playwright/test";
import { PartnerFixture } from "./partner-fixture";

test.describe("SR-PARTNER-NOTIFY-QA-20260917: E2E Partner Notification Delivery & Fault Isolation", () => {
  test.describe.configure({ mode: "default" });
  let fixture: PartnerFixture;
  test.beforeAll(async () => {
    test.setTimeout(90_000);
    fixture = new PartnerFixture();
    await fixture.start();
  });
  test.afterAll(async () => {
    await fixture?.close();
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
    expect(
      row,
      JSON.stringify({ outboxId, outcome: row.payload.partnerNotification }),
    ).toMatchObject({
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
    const entry = fixture.entries[0]!;
    const orderId = await fixture.createRide(entry);
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
    fixture.fault = "none";
    const endpoint = await fixture.revalidateEndpoint(entry);
    await test.info().attach("endpoint-revalidation", {
      contentType: "application/json",
      body: JSON.stringify({
        candidate_sha: process.env.CANDIDATE_SHA,
        outboxId,
        endpoint,
      }),
    });
    // Endpoint recovery must not requeue the manually blocked passenger record.
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

  test("C205 E2E: Admin UI displays notification binding and enables retry", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const entry = fixture.entries[1]!;
    const orderId = await fixture.createRide(entry);
    fixture.fault = "invalid_ack";
    const outboxId = await fixture.enqueue(orderId);
    const refused = await fixture.settled(outboxId);
    expect(refused.failure_reason).toBe("partner_ack_invalid");
    expect(refused.retry_disposition).toBe("manual_only");
    fixture.fault = "none";
    await fixture.revalidateEndpoint(entry);
    // The real server authority/control-plane proxy provides the hosted test
    // identity. No localStorage bearer, mocked route, or fake browser response.
    const document = await page.goto(
      `http://127.0.0.1:3001/partners/${entry.entry.entrySlug}`,
    );
    expect(document!.headers()["x-drts-candidate-sha"]).toBe(
      process.env.CANDIDATE_SHA,
    );
    await page
      .getByRole("button", { name: "Notifications", exact: true })
      .click();
    const row = page.getByRole("row").filter({ hasText: outboxId });
    await expect(row).toContainText("partner_ack_invalid");
    const retry = row.getByRole("button", { name: /重送/ });
    await expect(retry).toBeEnabled();
    const retryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response
          .url()
          .includes(
            `/partner-entries/${entry.entry.entrySlug}/notification-deliveries/${outboxId}/retry`,
          ),
    );
    await retry.click();
    expect((await retryResponse).status()).toBe(201);
    await expect
      .poll(async () => (await fixture.outcome(outboxId))?.status, {
        timeout: 20_000,
      })
      .toBe("delivered");
    const delivered = await accepted(outboxId);
    expect(delivered.attempt_count).toBe(2);
    expect(received(outboxId)).toHaveLength(2);
    expect(received(outboxId)[0]!.rawBody).toBe(received(outboxId)[1]!.rawBody);
    await page
      .getByRole("button", { name: /^(重新整理|Refresh)$/ })
      .last()
      .click();
    await expect(row).toContainText(/端點已接受，裝置未知|Endpoint accepted/);
    await expect(row.getByRole("button", { name: /重送/ })).toHaveCount(0);
    await test.info().attach("admin-retry-readback", {
      contentType: "image/png",
      body: await page.screenshot({ fullPage: true }),
    });
  });
});
