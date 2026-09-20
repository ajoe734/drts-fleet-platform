import re
with open("apps/api/src/modules/multi-taxi/multi-taxi.repository.ts", "r") as f:
    content = f.read()

old_block = """  async listPartnerNotificationDeliveries(entrySlug: string, query: any) {
    const countResult = await this.databaseService!.query(`
      SELECT COUNT(*) as cnt
      FROM mobility.phase1_partner_notification_delivery_contexts ctx
      WHERE ctx.entry_slug = $1
    `, [entrySlug]);

    const result = await this.databaseService!.query(`
      SELECT 
        ctx.outbox_id as "outboxId",
        ctx.order_id as "orderId",
        ctx.entry_slug as "entrySlug",
        ctx.tenant_id as "tenantId",
        ctx.partner_id as "partnerId",
        ctx.binding_id as "bindingId",
        ctx.binding_version as "bindingVersion",
        ctx.webhook_id as "webhookId",
        ctx.endpoint_fingerprint as "endpointFingerprint",
        ctx.wire_payload as "wirePayload",
        ctx.wire_payload_hash as "wirePayloadHash",
        ctx.event_sequence as "eventSequence",
        ctx.expires_at as "expiresAt",
        ctx.delivery_target as "deliveryTarget",
        ctx.delivery_stage as "deliveryStage",
        ctx.retry_disposition as "retryDisposition",
        ctx.failure_reason as "failureReason",
        ctx.receipt_id as "receiptId",
        ctx.downstream_status as "downstreamStatus",
        ctx.created_at as "createdAt",
        ctx.delivered_at as "deliveredAt",
        o.status,
        o.result,
        o.attempts,
        o.max_attempts as "maxAttempts",
        o.next_attempt_at as "nextAttemptAt"
      FROM mobility.phase1_partner_notification_delivery_contexts ctx
      JOIN mobility.phase1_passenger_notification_outbox o ON ctx.outbox_id = o.id
      WHERE ctx.entry_slug = $1
      ORDER BY ctx.created_at DESC
      LIMIT $2 OFFSET $3
    `, [entrySlug, pageSize, offset]);

    return { rows: result.rows, total: parseInt(countResult.rows[0]?.cnt || "0", 10) };
  }

  async retryPartnerNotificationDelivery(entrySlug: string, outboxId: string) {
    if (!this.isEnabled()) return { success: false };
    const result = await this.databaseService!.query(`
      UPDATE mobility.phase1_passenger_notification_outbox
      SET 
        status = 'pending',
        next_attempt_at = NOW(),
        claim_id = NULL,
        claim_expires_at = NULL
      FROM mobility.phase1_partner_notification_delivery_contexts ctx
      WHERE mobility.phase1_passenger_notification_outbox.id = $1 
        AND ctx.outbox_id = mobility.phase1_passenger_notification_outbox.id
        AND ctx.entry_slug = $2
        AND mobility.phase1_passenger_notification_outbox.status = 'failed'
        AND ctx.retry_disposition IN ('manual_only', 'automatic', 'configuration_blocked')
        AND ctx.expires_at > NOW()
        AND ctx.failure_reason NOT IN ('notification_superseded', 'notification_expired', 'notification_obsolete', 'recipient_revoked')
      RETURNING mobility.phase1_passenger_notification_outbox.id
    `, [outboxId, entrySlug]);

    if (result.rows.length === 0) {
      throw new Error("Cannot retry this notification.");
    }
    return { success: true };
  }"""

new_block = """  async listPartnerNotificationDeliveries(entrySlug: string, query: any) {
    const countResult = await this.databaseService!.query(`
      SELECT COUNT(*) as cnt
      FROM ops.consumer_notification_outbox o
      LEFT JOIN mobility.phase1_partner_notification_delivery_contexts ctx ON ctx.outbox_id = o.outbox_id
      WHERE (ctx.entry_slug = $1 OR o.payload->'partnerNotification'->>'entrySlug' = $1)
    `, [entrySlug]);

    const result = await this.databaseService!.query(`
      SELECT 
        o.outbox_id as "outboxId",
        COALESCE(ctx.order_id, o.payload->'partnerNotification'->>'orderId') as "orderId",
        $1 as "entrySlug",
        COALESCE(ctx.tenant_id, o.payload->'partnerNotification'->>'tenantId') as "tenantId",
        COALESCE(ctx.partner_id, o.payload->'partnerNotification'->>'partnerId') as "partnerId",
        COALESCE(ctx.binding_id, o.payload->'partnerNotification'->>'bindingId') as "bindingId",
        COALESCE(ctx.binding_version, (o.payload->'partnerNotification'->>'bindingVersion')::int) as "bindingVersion",
        COALESCE(ctx.webhook_id, o.payload->'partnerNotification'->>'webhookId') as "webhookId",
        COALESCE(ctx.endpoint_fingerprint, o.payload->'partnerNotification'->>'endpointFingerprint') as "endpointFingerprint",
        COALESCE(ctx.wire_payload, (o.payload->'partnerNotification'->>'wirePayload')::jsonb) as "wirePayload",
        COALESCE(ctx.wire_payload_hash, o.payload->'partnerNotification'->>'wirePayloadHash') as "wirePayloadHash",
        COALESCE(ctx.event_sequence, (o.payload->'partnerNotification'->>'eventSequence')::int) as "eventSequence",
        COALESCE(ctx.expires_at, (o.payload->'partnerNotification'->>'expiresAt')::timestamptz) as "expiresAt",
        COALESCE(ctx.delivery_target, o.payload->'partnerNotification'->>'deliveryTarget') as "deliveryTarget",
        COALESCE(ctx.delivery_stage, o.payload->'partnerNotification'->>'deliveryStage') as "deliveryStage",
        COALESCE(ctx.retry_disposition, o.payload->'partnerNotification'->>'retryDisposition') as "retryDisposition",
        COALESCE(ctx.failure_reason, o.payload->'partnerNotification'->>'failureReason') as "failureReason",
        COALESCE(ctx.receipt_id, o.payload->'partnerNotification'->>'receiptId') as "receiptId",
        COALESCE(ctx.downstream_status, o.payload->'partnerNotification'->>'downstreamStatus') as "downstreamStatus",
        o.created_at as "createdAt",
        ctx.delivered_at as "deliveredAt",
        o.status,
        NULL as result,
        o.attempt_count as attempts,
        COALESCE((ctx.retry_policy_snapshot->>'maxAttempts')::int, 3) as "maxAttempts",
        o.next_attempt_at as "nextAttemptAt"
      FROM ops.consumer_notification_outbox o
      LEFT JOIN mobility.phase1_partner_notification_delivery_contexts ctx ON ctx.outbox_id = o.outbox_id
      WHERE (ctx.entry_slug = $1 OR o.payload->'partnerNotification'->>'entrySlug' = $1)
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `, [entrySlug, query.pageSize || 50, ((query.page || 1) - 1) * (query.pageSize || 50)]);

    return { rows: result.rows, total: parseInt(countResult.rows[0]?.cnt || "0", 10) };
  }

  async retryPartnerNotificationDelivery(entrySlug: string, outboxId: string) {
    if (!this.isEnabled()) return { kind: "failed", failure: { failureReason: "endpoint_unavailable", retryDisposition: "terminal" } };
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      const outboxRows = await client.query(
        "SELECT status, next_attempt_at, payload, attempt_count FROM ops.consumer_notification_outbox WHERE outbox_id = $1 FOR UPDATE",
        [outboxId]
      );
      if (outboxRows.rows.length === 0) {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: "route_missing", retryDisposition: "none" } };
      }
      const outbox = outboxRows.rows[0];

      const ctxRows = await client.query(
        "SELECT entry_slug, expires_at, failure_reason, binding_id, retry_disposition, order_id, event_sequence FROM mobility.phase1_partner_notification_delivery_contexts WHERE outbox_id = $1 FOR UPDATE",
        [outboxId]
      );
      const ctx = ctxRows.rows[0] || null;

      const actualEntrySlug = ctx ? ctx.entry_slug : outbox.payload?.partnerNotification?.entrySlug;
      if (actualEntrySlug !== entrySlug) {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: "route_missing", retryDisposition: "none" } };
      }
      
      const retryDisp = ctx ? ctx.retry_disposition : outbox.payload?.partnerNotification?.retryDisposition;
      if (!retryDisp || !['manual_only', 'automatic', 'configuration_blocked'].includes(retryDisp)) {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: "notification_obsolete", retryDisposition: "terminal" } };
      }

      if (outbox.status === 'delivered') {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: "notification_superseded", retryDisposition: "terminal" } };
      }

      const expiresAt = ctx ? new Date(ctx.expires_at) : (outbox.payload?.partnerNotification?.expiresAt ? new Date(outbox.payload.partnerNotification.expiresAt) : null);
      if (expiresAt && expiresAt < new Date()) {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: "notification_expired", retryDisposition: "terminal" } };
      }

      const failureReason = ctx ? ctx.failure_reason : outbox.payload?.partnerNotification?.failureReason;
      if (failureReason && ['notification_superseded', 'notification_expired', 'notification_obsolete', 'recipient_revoked'].includes(failureReason)) {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: failureReason, retryDisposition: "terminal" } };
      }

      const claimRows = await client.query(
        "SELECT 1 FROM ops.phase1_push_delivery_claims WHERE outbox_id = $1 AND claim_state = 'claimed' AND lease_expires_at > now()",
        [outboxId]
      );
      if (claimRows.rows.length > 0) {
        await client.query("ROLLBACK");
        return { kind: "failed", failure: { failureReason: "provider_transient_error", retryDisposition: "automatic" } };
      }

      if (ctx) {
        const newerCtxRows = await client.query(
          "SELECT 1 FROM mobility.phase1_partner_notification_delivery_contexts WHERE order_id = $1 AND event_sequence > $2",
          [ctx.order_id, ctx.event_sequence]
        );
        if (newerCtxRows.rows.length > 0) {
          await client.query("ROLLBACK");
          return { kind: "failed", failure: { failureReason: "notification_superseded", retryDisposition: "terminal" } };
        }
      }

      if (ctx && ctx.binding_id) {
        const bindingRes = await client.query(
          "SELECT state FROM admin.phase1_partner_notification_bindings WHERE binding_id = $1",
          [ctx.binding_id]
        );
        if (bindingRes.rows.length === 0 || bindingRes.rows[0].state !== 'ready') {
          await client.query("ROLLBACK");
          return { kind: "failed", failure: { failureReason: "endpoint_disabled", retryDisposition: "configuration_blocked" } };
        }
      }

      await client.query(
        "UPDATE ops.consumer_notification_outbox SET status = 'pending', next_attempt_at = NOW() WHERE outbox_id = $1",
        [outboxId]
      );

      if (ctx) {
        await client.query(
          "UPDATE mobility.phase1_partner_notification_delivery_contexts SET retry_disposition = 'automatic' WHERE outbox_id = $1",
          [outboxId]
        );
      } else {
        await client.query(
          "UPDATE ops.consumer_notification_outbox SET payload = jsonb_set(payload, '{partnerNotification,retryDisposition}', '\"automatic\"'::jsonb) WHERE outbox_id = $1",
          [outboxId]
        );
      }

      await client.query("COMMIT");
      return { kind: "accepted" };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }"""

idx1 = content.find("  async listPartnerNotificationDeliveries")
idx2 = content.find("}", content.find("  async retryPartnerNotificationDelivery")) + 1

if idx1 != -1 and idx2 != -1:
    content = content[:idx1] + new_block + content[idx2:]
    with open("apps/api/src/modules/multi-taxi/multi-taxi.repository.ts", "w") as f:
        f.write(content)
    print("Replaced successfully!")
else:
    print("Could not find blocks to replace!")
