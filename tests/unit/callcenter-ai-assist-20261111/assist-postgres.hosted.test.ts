import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseService } from "../../../apps/api/src/common/db";
import { VoiceHandoffQueueRepository } from "../../../apps/api/src/modules/callcenter/voice-handoff-queue.repository";
import { VoiceHandoffQueueService } from "../../../apps/api/src/modules/callcenter/voice-handoff-queue.service";
import { CallcenterAssistRepository } from "../../../apps/api/src/modules/callcenter-assist/callcenter-assist.repository";
import { CallcenterAssistService } from "../../../apps/api/src/modules/callcenter-assist/callcenter-assist.service";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";

// CALLCENTER-AI-ASSIST-20261111 on the full production migration ledger
// (V0136 included). The harness refuses to open sockets on the worker VM;
// these cases run on GitHub-hosted CI only.

function services(database: DatabaseService) {
  const queue = new VoiceHandoffQueueService(
    new VoiceHandoffQueueRepository(database),
  );
  const repository = new CallcenterAssistRepository(database);
  return {
    queue,
    repository,
    assist: new CallcenterAssistService(repository, undefined, queue),
  };
}

async function seedVoiceSession(database: DatabaseService, callId: string) {
  const scopeId = randomUUID();
  const lineId = randomUUID();
  const profileId = randomUUID();
  const voiceSessionId = randomUUID();
  await database.query(
    "INSERT INTO crm.phase1_call_sessions (call_id,status,started_at,updated_at,record) VALUES ($1,'active',now(),now(),$2::jsonb)",
    [callId, JSON.stringify({ callId })],
  );
  await database.query(
    `INSERT INTO voice.resource_scope (scope_id,brand_id,granted_by,runtime_mapping)
     VALUES ($1,'brand-assist','test',$2::jsonb)`,
    [
      scopeId,
      JSON.stringify({
        runtimeProfileCode: "ordinary_taxi",
        serviceProductCode: "taxi_realtime",
      }),
    ],
  );
  await database.query(
    `INSERT INTO voice.line_binding (line_binding_id,provider_account_id,dnis,brand_id,operating_profile_id)
     VALUES ($1,'provider-assist',$2,'brand-assist','test')`,
    [lineId, callId],
  );
  await database.query(
    "INSERT INTO voice.route_profile (profile_id,version,models,languages) VALUES ($1,1,'{}','[]')",
    [profileId],
  );
  await database.query(
    `INSERT INTO voice.session (
       voice_session_id,call_id,provider_account_id,provider_call_id,resource_scope_id,
       line_binding_id,route_profile_id,route_profile_version,dialog_state,media_state,
       lease_epoch,confirmation_state,last_applied_control_sequence
     ) VALUES ($1,$2,'provider-assist',$2,$3,$4,$5,1,'collecting','active',1,'absent',1)`,
    [voiceSessionId, callId, scopeId, lineId, profileId],
  );
  return { voiceSessionId, scopeId };
}

describe.skipIf(!hostedPaymentEnabled)(
  "callcenter AI assist on formal migrated PG",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterAll(() => h.close(), 30000);

    it("stores the transcript draft and serializes concurrent batches across instances", async () => {
      const writer = services(h.database);
      const peer = services(h.peerDatabase());
      const callId = `assist-${randomUUID()}`;
      await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          (index % 2 ? peer : writer).assist.ingestTranscript(callId, {
            segments: [
              {
                segmentId: `s${index}`,
                speaker: "caller",
                text: index === 5 ? "我要去台北車站" : `第${index}句`,
              },
            ],
          }),
        ),
      );
      const draft = await peer.assist.getDraft(callId);
      expect(draft?.transcript).toHaveLength(6);
      expect(draft?.draftVersion).toBe(6);
      expect(draft?.fields.dropoff?.value).toBe("台北車站");
      expect(draft?.source).toBe("agent_assist");
      expect(Date.parse(draft!.expiresAt)).toBeGreaterThan(Date.now());
    });

    it("records outcomes idempotently, aggregates them and marks the draft submitted", async () => {
      const { assist } = services(h.database);
      const callId = `assist-${randomUUID()}`;
      await assist.ingestTranscript(callId, {
        segments: [
          {
            segmentId: "a",
            speaker: "caller",
            text: "我在台大醫院，要去台北車站，電話0912345678",
          },
        ],
      });
      const body = {
        orderId: "order-assist-1",
        agentId: "OPS-1",
        fields: [
          {
            field: "pickup",
            aiApplied: true,
            agentEdited: false,
            finalPresent: true,
          },
          {
            field: "dropoff",
            aiApplied: true,
            agentEdited: true,
            finalPresent: true,
          },
          {
            field: "passengerName",
            aiApplied: false,
            agentEdited: true,
            finalPresent: true,
          },
        ],
      };
      expect((await assist.recordOutcomes(callId, body)).recorded).toBe(3);
      expect((await assist.recordOutcomes(callId, body)).recorded).toBe(0);
      const report = await assist.getAccuracy({});
      expect(report.totals).toMatchObject({
        accepted: 1,
        corrected: 1,
        aiMissing: 1,
      });
      const stored = await h.database.query(
        "SELECT field, outcome, ai_status FROM crm.callcenter_assist_field_outcomes WHERE call_id = $1 ORDER BY field",
        [callId],
      );
      expect(stored.rows).toEqual([
        { field: "dropoff", outcome: "corrected", ai_status: "filled" },
        { field: "passengerName", outcome: "ai_missing", ai_status: null },
        { field: "pickup", outcome: "accepted", ai_status: "filled" },
      ]);
      expect((await assist.getDraft(callId))?.submittedOrderId).toBe(
        "order-assist-1",
      );
    });

    it("hides and purges expired drafts", async () => {
      const { assist, repository } = services(h.database);
      const callId = `assist-${randomUUID()}`;
      await assist.ingestTranscript(callId, {
        segments: [
          { segmentId: "a", speaker: "caller", text: "我要去台北車站" },
        ],
      });
      await h.database.query(
        "UPDATE crm.callcenter_assist_drafts SET created_at = now() - interval '9 days', expires_at = now() - interval '1 day' WHERE call_id = $1",
        [callId],
      );
      expect(await assist.getDraft(callId)).toBeNull();
      expect(await repository.purgeExpired()).toBe(1);
      const left = await h.database.query(
        "SELECT 1 FROM crm.callcenter_assist_drafts WHERE call_id = $1",
        [callId],
      );
      expect(left.rows).toEqual([]);
    });

    it("keeps the handoff queue in voice.handoff, shared by every instance", async () => {
      const callId = `assist-call-${randomUUID()}`;
      const { voiceSessionId, scopeId } = await seedVoiceSession(
        h.database,
        callId,
      );
      const voiceSide = services(h.database);
      const consoleSide = services(h.peerDatabase());

      const queued = await voiceSide.queue.enqueue({
        voiceSessionId,
        callId,
        resourceScopeId: scopeId,
        reason: "location_unresolved",
        priority: "urgent",
        summary: { draft: { slots: { dropoff: { value: "台北車站" } } } },
      });
      expect(
        (await consoleSide.queue.listQueuedItems()).map((i) => i.handoffId),
      ).toEqual([queued.handoffId]);
      expect(
        (await consoleSide.queue.findActiveForSession(voiceSessionId))?.summary,
      ).toEqual({
        draft: { slots: { dropoff: { value: "台北車站" } } },
      });

      const claimed = await consoleSide.queue.claimSession({
        callId,
        operatorId: "OPS-7",
      });
      expect(claimed).toMatchObject({
        status: "assigned",
        assignedAgentId: "OPS-7",
      });
      await voiceSide.queue.confirmBridge(queued.handoffId);
      await voiceSide.queue.handleCallDrop(
        queued.handoffId,
        "callee_hangup",
        true,
      );
      await consoleSide.queue.redispatch(queued.handoffId);
      const row = await h.database.query(
        "SELECT state, queue_status, redispatch_count, agent_id FROM voice.handoff WHERE handoff_id = $1",
        [queued.handoffId],
      );
      expect(row.rows[0]).toEqual({
        state: "queued",
        queue_status: "queued",
        redispatch_count: 1,
        agent_id: null,
      });

      // V0086: at most one active handoff per voice session.
      await expect(
        voiceSide.queue.enqueue({
          voiceSessionId,
          callId,
          resourceScopeId: scopeId,
          reason: "customer_requested",
        }),
      ).rejects.toThrow();

      await consoleSide.queue.complete(queued.handoffId);
      expect(await consoleSide.queue.listQueuedItems()).toEqual([]);
      const done = await h.database.query(
        "SELECT state FROM voice.handoff WHERE handoff_id = $1",
        [queued.handoffId],
      );
      expect(done.rows[0]).toEqual({ state: "completed" });
    });

    it("finds a phone number's dispatched pickups across stored spellings", async () => {
      const { repository } = services(h.database);
      const insert = async (
        orderId: string,
        status: string,
        phone: string,
        lat: number,
        createdAt: string,
        contactPath: "passenger" | "bookingRequirements" = "passenger",
      ) => {
        const record =
          contactPath === "passenger"
            ? {
                passenger: { name: "王先生", phone },
                pickup: { address: `p-${orderId}`, lat, lng: 121.52 },
              }
            : {
                passenger: { name: "", phone: "0200000000" },
                bookingRequirements: { passengerContact: { name: "", phone } },
                pickup: { address: `p-${orderId}`, lat, lng: 121.52 },
              };
        await h.database.query(
          `INSERT INTO ops.phase1_owned_orders
             (order_id, order_no, status, order_source, service_bucket,
              dispatch_semantics, created_at, updated_at, record)
           VALUES ($1, $1, $2, 'phone', 'standard', 'realtime', $3, $3, $4::jsonb)`,
          [orderId, status, createdAt, JSON.stringify(record)],
        );
      };
      const suffix = randomUUID().slice(0, 8);
      await insert(
        `fp-a-${suffix}`,
        "completed",
        "0912345678",
        25.05,
        "2026-11-01T00:00:00Z",
      );
      await insert(
        `fp-b-${suffix}`,
        "completed",
        "+886912345678",
        25.06,
        "2026-11-02T00:00:00Z",
        "bookingRequirements",
      );
      await insert(
        `fp-c-${suffix}`,
        "cancelled",
        "0912345678",
        25.07,
        "2026-11-03T00:00:00Z",
      );
      await insert(
        `fp-d-${suffix}`,
        "completed",
        "0911111111",
        25.08,
        "2026-11-04T00:00:00Z",
      );
      await insert(
        `fp-e-${suffix}`,
        "completed",
        "0912345678",
        25.09,
        "2024-01-01T00:00:00Z",
      );
      const rows = await repository.findRecentPickupsByPhone(
        ["0912345678", "+886912345678"],
        ["completed"],
        new Date("2025-11-11T00:00:00Z"),
      );
      expect(
        rows.map((row) => (row.pickup as { address: string }).address),
      ).toEqual([`p-fp-b-${suffix}`, `p-fp-a-${suffix}`]);
    });

    it("rejects values outside the V0136 constraints", async () => {
      await expect(
        h.database.query(
          `INSERT INTO crm.callcenter_assist_field_outcomes
             (call_id, order_id, field, source, outcome, ai_status)
           VALUES ('c', 'o', 'pickup', 'agent_assist', 'accepted', NULL)`,
        ),
      ).rejects.toThrow();
      await expect(
        h.database.query(
          `INSERT INTO crm.callcenter_assist_drafts (call_id, source, expires_at)
           VALUES ('c', 'agent_assist', now() - interval '1 day')`,
        ),
      ).rejects.toThrow();
    });
  },
);
