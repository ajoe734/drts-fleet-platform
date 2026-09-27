import { test, expect } from "@playwright/test";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
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

  const noAcknowledgedReceipt = async (outboxId: string) => {
    const receipts = await fixture.db.query(
      `SELECT provider_message_ref FROM ops.phase1_push_delivery_receipts
       WHERE outbox_id=$1 AND provider_ack_state='provider_acknowledged'`,
      [outboxId],
    );
    expect(receipts.rows).toHaveLength(0);
  };

  const refusedWithoutSending = async (
    outboxId: string,
    failureReason: string,
    retryDisposition: string,
  ) => {
    const row = await fixture.settled(outboxId);
    expect(row).toMatchObject({
      status: "failed",
      attempt_count: 1,
      claim_state: "released",
      delivered_at: null,
      receipt_id: null,
    });
    expect(row.payload.partnerNotification).toMatchObject({
      failureReason,
      retryDisposition,
      deliveryStage: null,
      receiptId: null,
      downstreamStatus: "unknown",
    });
    expect(received(outboxId)).toHaveLength(0);
    expect(
      (await fixture.receiver.records()).filter(
        (r) => r.notificationId === outboxId,
      ),
    ).toHaveLength(0);
    await noAcknowledgedReceipt(outboxId);
    // Observe multiple real worker polls, including durable attempt count.
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    expect((await fixture.outcome(outboxId))!.attempt_count).toBe(1);
    expect(received(outboxId)).toHaveLength(0);
    await test.info().attach(`no-send-${failureReason}`, {
      contentType: "application/json",
      body: JSON.stringify({
        candidate_sha: process.env.CANDIDATE_SHA,
        outboxId,
        status: row.status,
        metadata: row.payload.partnerNotification,
        receiverRequests: 0,
      }),
    });
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

  test("C209 E2E: Entry ownership change refuses historical delivery without sending", async () => {
    const entry = fixture.entries[0]!;
    const tenantB = fixture.entries[2]!.entry.tenantId;
    const platform = process.env.DRTS_UAT_TOKEN_PLATFORM!;
    const orderId = await fixture.createRide(entry);
    const due = Date.now() + 10_000;
    // Queue while the original owner is still authoritative. Scheduling is
    // part of the synthetic event; no claim/route/context SQL is rewritten.
    const outboxId = await fixture.enqueue(orderId, "partner", {
      nextAttemptAt: new Date(due).toISOString(),
    });
    expect(await fixture.outcome(outboxId)).toMatchObject({
      status: "pending",
      attempt_count: 0,
    });
    try {
      const moved = await fixture.call<PartnerChannelEntryRecord>(
        `platform-admin/partner-entries/${entry.entry.entrySlug}`,
        platform,
        "POST",
        { tenantId: tenantB },
      );
      expect(moved.tenantId).toBe(tenantB);
      expect(
        Date.now(),
        "ownership change completed before the event became due",
      ).toBeLessThan(due);
      await refusedWithoutSending(outboxId, "owner_changed", "manual_only");
      const route = (
        await fixture.db.query(
          "SELECT tenant_id, partner_id, entry_slug FROM mobility.phase1_order_partner_notification_routes WHERE order_id=$1",
          [orderId],
        )
      ).rows[0];
      expect(route).toEqual({
        tenant_id: entry.entry.tenantId,
        partner_id: entry.entry.partnerId,
        entry_slug: entry.entry.entrySlug,
      });
    } finally {
      const restored = await fixture.call<PartnerChannelEntryRecord>(
        `platform-admin/partner-entries/${entry.entry.entrySlug}`,
        platform,
        "POST",
        { tenantId: entry.entry.tenantId },
      );
      expect(restored.tenantId).toBe(entry.entry.tenantId);
    }
    // Restoring configuration must not silently release the held old event.
    await accepted(await fixture.enqueue(await fixture.createRide(entry)));
    expect((await fixture.outcome(outboxId))!.attempt_count).toBe(1);
    expect(received(outboxId)).toHaveLength(0);
  });

  test("C208 E2E: The same resident in two apps cannot cross entry or subject", async () => {
    const entries = [fixture.entries[0]!, fixture.entries[1]!];
    expect(entries[0]!.partnerUserRef).toBe(entries[1]!.partnerUserRef);
    const rides: string[] = [];
    const passengers: string[] = [];
    for (const entry of entries) {
      const orderId = await fixture.createRide(entry);
      rides.push(orderId);
      const route = (
        await fixture.db.query(
          "SELECT drts_passenger_id FROM mobility.phase1_order_partner_notification_routes WHERE order_id=$1",
          [orderId],
        )
      ).rows[0]!;
      passengers.push(route.drts_passenger_id);
      const outboxId = await fixture.enqueue(orderId);
      await accepted(outboxId);
      expect(received(outboxId)).toHaveLength(1);
      expect(JSON.parse(received(outboxId)[0]!.rawBody).data).toMatchObject({
        partner_entry_slug: entry.entry.entrySlug,
        recipient: { partner_user_ref: entry.partnerUserRef },
        navigation: { type: "ride", ride_ref: orderId },
      });
      const own = await fixture.resolveNavigation(entry, orderId);
      expect(own.status).toBe(201);
      // Check only shape so a failing assertion cannot expose a handoff token.
      expect(typeof own.envelope.data?.handoffArtifact?.artifact).toBe(
        "string",
      );
    }
    expect(passengers[0]).not.toBe(passengers[1]);
    for (const [index, entry] of entries.entries()) {
      const other = entries[1 - index]!;
      for (const denied of [
        await fixture.resolveNavigation(entry, rides[1 - index]!),
        await fixture.resolveNavigation(
          entry,
          rides[index]!,
          "different-resident",
        ),
        await fixture.resolveNavigation(
          entry,
          rides[index]!,
          entry.partnerUserRef,
          other.apiKey,
        ),
      ]) {
        expect(denied.status).toBe(403);
        expect(denied.envelope.error?.code).toBe("FORBIDDEN");
        expect(denied.envelope.data).toBeUndefined();
      }
    }
    await test.info().attach("entry-subject-isolation", {
      contentType: "application/json",
      body: JSON.stringify({
        candidate_sha: process.env.CANDIDATE_SHA,
        entries: entries.map((e) => e.entry.entrySlug),
        rides,
        separatePassengerIdentities: true,
        ownResolves: 2,
        refusedResolves: 6,
      }),
    });
  });

  test("C210 E2E: Revoked recipient link stops delivery without sending", async () => {
    const entry = fixture.entries[0]!;
    const unaffected = fixture.entries[1]!;
    const orderId = await fixture.createRide(entry);
    const original = (
      await fixture.db.query(
        `SELECT status, record FROM admin.phase1_partner_user_identity_links
       WHERE entry_slug=$1 AND partner_user_ref=$2`,
        [entry.entry.entrySlug, entry.partnerUserRef],
      )
    ).rows[0]!;
    expect(original.status).toBe("active");
    expect(original.record.status).toBe("active");
    const due = Date.now() + 10_000;
    const outboxId = await fixture.enqueue(orderId, "partner", {
      nextAttemptAt: new Date(due).toISOString(),
    });
    try {
      // Fault injection only: the repository exposes no revoke writer/API.
      // Change the existing fixture link in the V0030 schema, both projections;
      // the real repository, route gate, worker and outcome transaction run unchanged.
      const revoked = await fixture.db.query(
        `UPDATE admin.phase1_partner_user_identity_links
         SET status='revoked', record=jsonb_set(record, '{status}', '"revoked"'::jsonb)
         WHERE entry_slug=$1 AND partner_user_ref=$2 AND status='active'
         RETURNING status, record`,
        [entry.entry.entrySlug, entry.partnerUserRef],
      );
      expect(revoked.rows).toHaveLength(1);
      expect(revoked.rows[0]!.record.status).toBe("revoked");
      expect(
        Date.now(),
        "revocation fault installed before delivery is due",
      ).toBeLessThan(due);
      await refusedWithoutSending(outboxId, "recipient_revoked", "terminal");
      const navigation = await fixture.resolveNavigation(entry, orderId);
      expect(navigation.status).toBe(403);
      expect(navigation.envelope.error?.code).toBe("FORBIDDEN");
      // The same external resident reference in the other app remains valid.
      await accepted(
        await fixture.enqueue(await fixture.createRide(unaffected)),
      );
    } finally {
      const restored = await fixture.db.query(
        `UPDATE admin.phase1_partner_user_identity_links
         SET status=$3::text, record=jsonb_set(record, '{status}', to_jsonb($3::text))
         WHERE entry_slug=$1 AND partner_user_ref=$2 RETURNING status, record`,
        [entry.entry.entrySlug, entry.partnerUserRef, original.status],
      );
      expect(restored.rows).toHaveLength(1);
      expect(restored.rows[0]!.status).toBe(original.status);
      expect(restored.rows[0]!.record.status).toBe(original.record.status);
    }
    await accepted(await fixture.enqueue(await fixture.createRide(entry)));
    expect((await fixture.outcome(outboxId))!.attempt_count).toBe(1);
    expect(received(outboxId)).toHaveLength(0);
  });

  test("C211 E2E: Disabled endpoint and secret rotation require retest", async () => {
    test.setTimeout(90_000);
    const entry = fixture.entries[0]!;
    const orderId = await fixture.createRide(entry);
    const held: string[] = [];
    const refuse = async (reason: string) => {
      const outboxId = await fixture.enqueue(orderId);
      held.push(outboxId);
      await refusedWithoutSending(outboxId, reason, "configuration_blocked");
    };
    const updateEndpoint = (status: string) =>
      fixture.call<{ status: string }>(
        `tenant/webhooks/${entry.webhookId}`,
        entry.token,
        "POST",
        { status, disableReason: "Controlled QA disable" },
        entry.entry.tenantId,
      );
    try {
      expect((await updateEndpoint("disabled")).status).toBe("disabled");
      await refuse("endpoint_disabled");
      expect((await updateEndpoint("active")).status).toBe("test_pending");
      await refuse("configuration_blocked");
      await fixture.revalidateEndpoint(entry);
      await accepted(await fixture.enqueue(orderId));

      const oldBinding = await fixture.binding(entry);
      const secretVersion = await fixture.rotateReceiverSecret(entry);
      await refuse("configuration_blocked");
      await fixture.revalidateEndpoint(entry);
      // A successful status-only webhook test is insufficient: partner binding
      // validation is still pinned to the old secret fingerprint.
      expect((await fixture.binding(entry)).validatedEndpointFingerprint).toBe(
        oldBinding.validatedEndpointFingerprint,
      );
      await refuse("configuration_blocked");
      const updated = await fixture.revalidateBinding(entry);
      expect(updated.validatedEndpointFingerprint).not.toBe(
        oldBinding.validatedEndpointFingerprint,
      );
      const delivered = await fixture.enqueue(orderId);
      await accepted(delivered);
      expect(received(delivered)).toHaveLength(1);
      expect(received(delivered)[0]!.secretVersion).toBe(secretVersion);
      for (const outboxId of held) {
        expect((await fixture.outcome(outboxId))!.attempt_count).toBe(1);
        expect(received(outboxId)).toHaveLength(0);
      }
      await test.info().attach("rotation-retest", {
        contentType: "application/json",
        body: JSON.stringify({
          candidate_sha: process.env.CANDIDATE_SHA,
          held,
          delivered,
          secretVersion,
          partnerRetested: true,
        }),
      });
    } finally {
      // All entries sharing this endpoint need a fresh partner validation after
      // rotation; restore via governance for later cases, never SQL statuses.
      await fixture.revalidateEndpoint(entry);
      for (const affected of fixture.entries.filter(
        (e) => e.webhookId === entry.webhookId,
      )) {
        await fixture.revalidateBinding(affected);
      }
    }
  });

  test("C212 E2E: HTML 200 and mismatched receipt remain manual only", async () => {
    test.setTimeout(60_000);
    const entry = fixture.entries[0]!;
    const evidence = [];
    for (const fault of [
      "html_ack",
      "wrong_notification",
      "wrong_delivery",
      "wrong_entry",
      "missing_receipt",
    ] as const) {
      const orderId = await fixture.createRide(entry);
      fixture.fault = fault;
      const outboxId = await fixture.enqueue(orderId);
      const row = await fixture.settled(outboxId);
      expect(row, fault).toMatchObject({
        status: "failed",
        attempt_count: 1,
        claim_state: "released",
        delivered_at: null,
        failure_reason: "partner_ack_invalid",
        retry_disposition: "manual_only",
        receipt_id: null,
      });
      expect(row.payload.partnerNotification).toMatchObject({
        deliveryStage: null,
        downstreamStatus: "unknown",
        receiptId: null,
      });
      const requests = received(outboxId);
      expect(requests).toHaveLength(1);
      expect(requests[0]!.status).toBe(fault === "html_ack" ? 200 : 202);
      const inbox = (await fixture.receiver.records()).filter(
        (r) => r.notificationId === outboxId,
      );
      expect(inbox).toHaveLength(1);
      expect(inbox[0]!.nativeDelivery).toBe("pending");
      await noAcknowledgedReceipt(outboxId);
      fixture.fault = "none";
      await fixture.revalidateEndpoint(entry);
      await new Promise((resolve) => setTimeout(resolve, 2_200));
      expect((await fixture.outcome(outboxId))!.attempt_count).toBe(1);
      expect(received(outboxId)).toHaveLength(1);
      evidence.push({
        fault,
        outboxId,
        responseStatus: requests[0]!.status,
        responseBody: requests[0]!.responseBody,
        metadata: row.payload.partnerNotification,
      });
    }
    await accepted(await fixture.enqueue(await fixture.createRide(entry)));
    await test.info().attach("invalid-ack-matrix", {
      contentType: "application/json",
      body: JSON.stringify({
        candidate_sha: process.env.CANDIDATE_SHA,
        evidence,
      }),
    });
  });

  test("C217 E2E: Expired notifications stop without sending", async () => {
    const entry = fixture.entries[0]!;
    const orderId = await fixture.createRide(entry);
    const expired = await fixture.enqueue(orderId, "partner", {
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await refusedWithoutSending(expired, "notification_expired", "terminal");
    // The same authoritative ride still accepts a fresh event; expiry must
    // not block the trip or its independent receipt notifications.
    const fresh = await fixture.enqueue(orderId);
    await accepted(fresh);
    expect(JSON.parse(received(fresh)[0]!.rawBody).data.event_sequence).toBe(2);
  });

  test("C219 E2E: Payload excludes private driver and passenger information", async () => {
    const entry = fixture.entries[0]!;
    const sensitive = {
      driverId: "private-driver-canary",
      driverName: "private-name-canary",
      driver: {
        licenseNumber: "private-license-canary",
        plate: "private-plate-canary",
      },
      passengerName: "private-passenger-canary",
      phone: "private-phone-canary",
      address: "private-address-canary",
      room: "private-room-canary",
      gps: { lat: 23.123456, lng: 121.123456 },
      paymentToken: "private-payment-canary",
      accessToken: "private-token-canary",
      handoff: "private-handoff-canary",
      cookie: "private-cookie-canary",
      secret: "private-secret-canary",
      eta: { minutes: 4, asOf: new Date().toISOString() },
    };
    for (const payload of [sensitive, { driver: null }]) {
      const outboxId = await fixture.enqueue(
        await fixture.createRide(entry),
        "partner",
        { payload },
      );
      await accepted(outboxId);
      const row = await fixture.outcome(outboxId);
      expect(row!.payload).toMatchObject(payload);
      const raw = received(outboxId)[0]!.rawBody;
      const wire = JSON.parse(raw);
      expect(Object.keys(wire).sort()).toEqual([
        "data",
        "delivery_id",
        "event",
        "occurred_at",
        "tenant_id",
      ]);
      expect(Object.keys(wire.data).sort()).toEqual([
        "assignment_version",
        "event_sequence",
        "expires_at",
        "message",
        "navigation",
        "notification_id",
        "partner_entry_slug",
        "recipient",
        "ride_ref",
        "schema_version",
      ]);
      expect(wire.data.recipient).toEqual({
        partner_user_ref: entry.partnerUserRef,
      });
      expect(wire.data.navigation).toEqual({
        type: "ride",
        ride_ref: wire.data.ride_ref,
      });
      for (const forbidden of [
        "private-",
        "QA Fixture",
        "0900000000",
        "Controlled pickup",
        "Controlled dropoff",
        "23.123456",
        "121.123456",
      ])
        expect(raw).not.toContain(forbidden);
      await test.info().attach(`wire-allowlist-${outboxId}`, {
        contentType: "application/json",
        body: JSON.stringify({
          candidate_sha: process.env.CANDIDATE_SHA,
          wire,
        }),
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
