import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CallSessionRecord, ComplaintCaseRecord } from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterController } from "../../src/modules/callcenter/callcenter.controller";
import { CallcenterRepository } from "../../src/modules/callcenter/callcenter.repository";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { SandboxWebhookAdapter } from "../../src/modules/callcenter/sandbox-webhook.adapter";
import { ComplaintRepository } from "../../src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../src/modules/complaint/complaint.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { IncidentService } from "../../src/modules/incident/incident.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityRepository } from "../../src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

const DATABASE_URL = process.env.DATABASE_URL;

describe("BUREAU-R08 call-to-complaint durable link against migrated PostgreSQL", () => {
  const databases: DatabaseService[] = [];
  const callIds = new Set<string>();
  const orderIds = new Set<string>();
  const caseNos = new Set<string>();

  function createDatabase() {
    const db = new DatabaseService();
    databases.push(db);
    return db;
  }

  function createServiceInstance(db = createDatabase()) {
    const audit = new AuditNotificationService();
    const auditWrite = vi.spyOn(audit, "recordAuditLog");
    const callcenterRepository = new CallcenterRepository(db);
    const calls = new CallcenterService(audit, callcenterRepository);
    const complaintRepository = new ComplaintRepository(db);
    const complaints = new ComplaintService(audit, complaintRepository);
    const incidents = new IncidentService(audit);
    const events = new OpsDispatchEventsService(new EventEmitter() as never);
    const ownedRepository = new OwnedMobilityRepository(db);
    const owned = new OwnedMobilityService(
      new RegulatoryRegistryService(
        events,
        audit,
        new DriverProfileService(audit),
      ),
      audit,
      calls,
      new OwnedMobilityTaskEventsService(new EventEmitter() as never),
      events,
      ownedRepository,
    );
    owned.registerCallRecordingListeners();
    const controller = new CallcenterController(
      calls,
      complaints,
      incidents,
      new SandboxWebhookAdapter(calls),
    );
    return {
      db,
      audit,
      auditWrite,
      calls,
      complaints,
      incidents,
      owned,
      controller,
    };
  }

  beforeEach(() => {
    expect(
      DATABASE_URL,
      "Hosted PostgreSQL is required for this suite",
    ).toBeTruthy();
  });

  afterEach(async () => {
    try {
      if (DATABASE_URL) {
        const cleanup = createDatabase();
        await cleanup.query(
          "DROP TRIGGER IF EXISTS r08_case_link_test_reject ON crm.phase1_call_sessions",
        );
        await cleanup.query(
          "DROP FUNCTION IF EXISTS crm.r08_case_link_test_reject()",
        );

        if (callIds.size > 0) {
          const calls = [...callIds];
          const existingCases = await cleanup.query<{ case_no: string }>(
            `SELECT case_no FROM crm.phase1_complaint_cases
             WHERE record->>'relatedCallId' = ANY($1::text[])`,
            [calls],
          );
          for (const row of existingCases.rows) {
            caseNos.add(row.case_no);
          }
          await cleanup.query(
            `DELETE FROM crm.phase1_complaint_pending_commits
             WHERE case_snapshot->>'relatedCallId' = ANY($1::text[])`,
            [calls],
          );
          await cleanup.query(
            "DELETE FROM voice.work_item WHERE dedupe_key = ANY($1::text[])",
            [calls.map((c) => `finalize_recording:call:${c}`)],
          );
          await cleanup.query(
            "DELETE FROM crm.phase1_call_sessions WHERE call_id = ANY($1::text[])",
            [calls],
          );
        }

        if (caseNos.size > 0) {
          const cases = [...caseNos];
          await cleanup.query(
            "DELETE FROM crm.phase1_complaint_pending_commits WHERE case_no = ANY($1::text[])",
            [cases],
          );
          await cleanup.query(
            "DELETE FROM crm.phase1_complaint_timelines WHERE case_no = ANY($1::text[])",
            [cases],
          );
          await cleanup.query(
            "DELETE FROM crm.phase1_complaint_cases WHERE case_no = ANY($1::text[])",
            [cases],
          );
        }

        if (orderIds.size > 0) {
          const orders = [...orderIds];
          await cleanup.query(
            "DELETE FROM ops.phase1_dispatch_trace_logs WHERE record->>'orderId' = ANY($1::text[])",
            [orders],
          );
          await cleanup.query(
            "DELETE FROM ops.phase1_owned_orders WHERE order_id = ANY($1::text[])",
            [orders],
          );
        }
      }
    } finally {
      callIds.clear();
      orderIds.clear();
      caseNos.clear();
      await Promise.all(databases.splice(0).map((db) => db.onModuleDestroy()));
    }
  });

  it("reads committed call session on a second instance, rejects missing call with 404 before complaint creation, and commits session and callback case links", async () => {
    const writer = createServiceInstance();
    const peer = createServiceInstance();

    const suffix = randomUUID().slice(0, 8);
    const callId = `CALL-R08-PG-PEER-${suffix}`;
    callIds.add(callId);

    const createdOrder = await writer.owned.createCallCenterOrder(
      {
        callId,
        agentId: "ops-r08-pg-peer",
        passenger: { name: "PG Peer Passenger", phone: "+886911000111" },
        pickup: { address: "Taipei Main Station" },
        dropoff: { address: "Nangang Station" },
      },
      "req-pg-create-order-1",
    );
    orderIds.add(createdOrder.orderId);
    const callbackTask = await writer.controller.createCallbackTask(
      callId,
      {
        dueAt: "2026-10-26T10:00:00.000Z",
        note: "PG callback task before complaint transfer",
      },
      "req-pg-cb-1",
    );

    // Peer cache is cold.
    expect(peer.calls.listCallSessions()).toEqual([]);

    // Non-existent call on cold peer must reject with 404 before creating any complaint.
    const missingCallId = `CALL-R08-PG-MISSING-${suffix}`;
    callIds.add(missingCallId);
    await expect(
      peer.controller.transferCallToComplaint(
        missingCallId,
        {
          category: "driver_service",
          severity: "normal",
          description: "Should fail 404 before creating complaint",
        },
        "req-pg-missing-404",
      ),
    ).rejects.toMatchObject({
      code: "CALL_SESSION_NOT_FOUND",
    });

    const missingCases = await writer.db.query(
      "SELECT case_no FROM crm.phase1_complaint_cases WHERE record->>'relatedCallId' = $1",
      [missingCallId],
    );
    expect(missingCases.rows).toEqual([]);

    // Transfer on cold peer reads committed call, creates complaint, and commits link.
    const transferred = await peer.controller.transferCallToComplaint(
      callId,
      {
        category: "driver_service",
        severity: "normal",
        description: "Driver route deviation reported by phone",
      },
      "req-pg-transfer-1",
    );
    const caseNo = transferred.data.complaintCase.caseNo;
    caseNos.add(caseNo);

    expect(transferred.data.complaintCase).toMatchObject({
      caseNo,
      caseSource: "phone",
      relatedCallId: callId,
      relatedOrderId: createdOrder.orderId,
      category: "driver_service",
    });
    expect(transferred.data.session).toMatchObject({
      callId,
      linkedOrderId: createdOrder.orderId,
      linkedCaseNo: caseNo,
      callbackTask: expect.objectContaining({
        callbackTaskId: callbackTask.data.callbackTaskId,
        linkedOrderId: createdOrder.orderId,
        linkedCaseNo: caseNo,
      }),
    });

    const coldReader = createServiceInstance();
    expect(await writer.calls.getCallSessionForRead(callId)).toMatchObject({
      callId,
      linkedOrderId: createdOrder.orderId,
      linkedCaseNo: caseNo,
      callbackTask: expect.objectContaining({
        linkedCaseNo: caseNo,
      }),
    });
    expect(await coldReader.calls.getCallSessionForRead(callId)).toMatchObject({
      callId,
      linkedOrderId: createdOrder.orderId,
      linkedCaseNo: caseNo,
    });
    expect(await coldReader.calls.listCallbackTasksForRead()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          callbackTaskId: callbackTask.data.callbackTaskId,
          callId,
          linkedOrderId: createdOrder.orderId,
          linkedCaseNo: caseNo,
        }),
      ]),
    );
  });

  it("waits for call-session transaction lock and COMMIT before acknowledging transfer or publishing memory/audit", async () => {
    const writer = createServiceInstance();
    const peer = createServiceInstance();

    const suffix = randomUUID().slice(0, 8);
    const callId = `CALL-R08-PG-LOCK-${suffix}`;
    callIds.add(callId);

    await writer.calls.upsertExternalSessionForWrite({
      callId,
      callType: "general_inquiry",
      callerPhone: "+886922000222",
      agentId: "ops-r08-pg-lock",
    });

    const lockClient = await createDatabase().connect();
    let pendingTransfer:
      | Promise<
          Awaited<ReturnType<CallcenterController["transferCallToComplaint"]>>
        >
      | undefined;
    try {
      await lockClient.query("BEGIN");
      await lockClient.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`phone-call:${callId}`],
      );

      writer.auditWrite.mockClear();
      let settled = false;
      pendingTransfer = writer.controller
        .transferCallToComplaint(
          callId,
          {
            category: "late_arrival",
            severity: "high",
            description: "Delayed pickup reported over phone",
          },
          "req-pg-lock-await",
        )
        .then((res) => {
          settled = true;
          return res;
        });

      // Wait until the complaint row is committed in crm.phase1_complaint_cases
      // and the callcenter transaction is blocked on the advisory lock.
      const deadline = Date.now() + 5_000;
      let committedCaseNo: string | null = null;
      while (Date.now() < deadline) {
        const res = await peer.db.query<{ case_no: string }>(
          "SELECT case_no FROM crm.phase1_complaint_cases WHERE record->>'relatedCallId' = $1",
          [callId],
        );
        if (res.rows[0]) {
          committedCaseNo = res.rows[0].case_no;
          caseNos.add(committedCaseNo);
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(committedCaseNo).toBeTruthy();
      expect(settled).toBe(false);
      expect(writer.calls.getCallSession(callId).linkedCaseNo).toBeNull();
      expect(
        writer.auditWrite.mock.calls.filter(
          ([entry]) => entry.actionName === "link_call_case",
        ),
      ).toEqual([]);

      await lockClient.query("COMMIT");
      const completed = await pendingTransfer;
      expect(settled).toBe(true);
      expect(completed.data.complaintCase.caseNo).toBe(committedCaseNo);
      expect(completed.data.session.linkedCaseNo).toBe(committedCaseNo);
      expect(await peer.calls.getCallSessionForRead(callId)).toMatchObject({
        callId,
        linkedCaseNo: committedCaseNo,
      });
    } finally {
      try {
        await lockClient.query("ROLLBACK");
      } finally {
        lockClient.release();
      }
      await pendingTransfer?.catch(() => undefined);
    }
  });

  it("rejects transfer when call-session link write fails in PG, then recovers the same caseNo and link on retry across instances without duplicating the complaint", async () => {
    const writer = createServiceInstance();

    const suffix = randomUUID().slice(0, 8);
    const callId = `CALL-R08-PG-RETRY-${suffix}`;
    callIds.add(callId);

    const createdOrder = await writer.owned.createCallCenterOrder(
      {
        callId,
        agentId: "ops-r08-pg-retry",
        passenger: { name: "PG Retry Passenger", phone: "+886933000333" },
        pickup: { address: "Banqiao Station" },
        dropoff: { address: "Ximen Station" },
      },
      "req-pg-create-order-retry",
    );
    orderIds.add(createdOrder.orderId);
    await writer.controller.createCallbackTask(callId, {
      dueAt: "2026-10-26T14:00:00.000Z",
      note: "PG retry callback",
    });

    await writer.db.query(
      `CREATE OR REPLACE FUNCTION crm.r08_case_link_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.call_id = '${callId}' AND NEW.record->>'linkedCaseNo' IS NOT NULL THEN
           RAISE EXCEPTION 'synthetic r08 call case link rejection';
         END IF;
         RETURN NEW;
       END $$`,
    );
    await writer.db.query(
      `CREATE TRIGGER r08_case_link_test_reject
       BEFORE INSERT OR UPDATE ON crm.phase1_call_sessions
       FOR EACH ROW EXECUTE FUNCTION crm.r08_case_link_test_reject()`,
    );

    const command = {
      category: "fare_dispute" as const,
      severity: "normal" as const,
      description: "Phone fare dispute requiring durable link",
    };

    writer.auditWrite.mockClear();
    await expect(
      writer.controller.transferCallToComplaint(
        callId,
        command,
        "req-pg-fail-attempt-1",
      ),
    ).rejects.toThrow("synthetic r08 call case link rejection");

    // Complaint case committed in PG, but session link rolled back and was not published.
    const casesAfterFail = await writer.db.query<{
      case_no: string;
      record: ComplaintCaseRecord;
    }>(
      "SELECT case_no, record FROM crm.phase1_complaint_cases WHERE record->>'relatedCallId' = $1",
      [callId],
    );
    expect(casesAfterFail.rows).toHaveLength(1);
    const originalCaseNo = casesAfterFail.rows[0]!.case_no;
    caseNos.add(originalCaseNo);

    expect(writer.calls.getCallSession(callId).linkedCaseNo).toBeNull();
    expect(
      writer.calls.getCallSession(callId).callbackTask?.linkedCaseNo,
    ).toBeNull();
    expect(await writer.calls.getCallSessionForRead(callId)).toMatchObject({
      callId,
      linkedCaseNo: null,
      callbackTask: expect.objectContaining({
        linkedCaseNo: null,
      }),
    });
    expect(
      writer.auditWrite.mock.calls.filter(
        ([entry]) => entry.actionName === "link_call_case",
      ),
    ).toEqual([]);

    // Remove the failure injection trigger and retry the same intent on a second instance.
    await writer.db.query(
      "DROP TRIGGER r08_case_link_test_reject ON crm.phase1_call_sessions",
    );
    await writer.db.query("DROP FUNCTION crm.r08_case_link_test_reject()");

    const peer = createServiceInstance();
    await peer.complaints.onModuleInit();

    const retried = await peer.controller.transferCallToComplaint(
      callId,
      command,
      "req-pg-retry-attempt-2",
    );
    expect(retried.data.complaintCase.caseNo).toBe(originalCaseNo);
    expect(retried.data.session).toMatchObject({
      callId,
      linkedOrderId: createdOrder.orderId,
      linkedCaseNo: originalCaseNo,
      callbackTask: expect.objectContaining({
        linkedOrderId: createdOrder.orderId,
        linkedCaseNo: originalCaseNo,
      }),
    });

    const casesAfterRetry = await writer.db.query<{ case_no: string }>(
      "SELECT case_no FROM crm.phase1_complaint_cases WHERE record->>'relatedCallId' = $1",
      [callId],
    );
    expect(casesAfterRetry.rows).toEqual([{ case_no: originalCaseNo }]);

    expect(await writer.calls.getCallSessionForRead(callId)).toMatchObject({
      callId,
      linkedOrderId: createdOrder.orderId,
      linkedCaseNo: originalCaseNo,
      callbackTask: expect.objectContaining({
        linkedCaseNo: originalCaseNo,
      }),
    });
  });

  it("preserves concurrent recording and phone-order fields when linking a complaint case across two PG instances", async () => {
    const instanceA = createServiceInstance();
    const instanceB = createServiceInstance();

    const suffix = randomUUID().slice(0, 8);
    const callId = `CALL-R08-PG-CONC-${suffix}`;
    callIds.add(callId);

    const createdOrder = await instanceA.owned.createCallCenterOrder({
      callId,
      agentId: "ops-r08-pg-conc",
      passenger: { name: "Lin Passenger", phone: "+886944000444" },
      pickup: { address: "Banqiao Station" },
      dropoff: { address: "Taipei 101" },
    });
    orderIds.add(createdOrder.orderId);

    // Instance B attaches recording and callback task in PG, leaving instance A's memory stale.
    await instanceB.controller.attachRecordingCallback(
      callId,
      {
        recordingId: `REC-R08-PG-${suffix}`,
        providerRecordingRef: `PROV-R08-PG-${suffix}`,
        recordingUrl: `https://recordings.example.com/REC-R08-PG-${suffix}`,
        agentId: "ops-r08-pg-conc",
      },
      "req-pg-conc-rec",
    );
    const cb = await instanceB.controller.createCallbackTask(
      callId,
      {
        dueAt: "2026-10-26T16:00:00.000Z",
        note: "PG concurrent callback",
      },
      "req-pg-conc-cb",
    );

    expect(instanceA.calls.getCallSession(callId).recordingId).toBeNull();
    expect(instanceA.calls.getCallSession(callId).callbackTask).toBeNull();

    // Instance A executes transferCallToComplaint; runPhoneSessionWrite must read
    // the authoritative PG row under lock and preserve all recording/order/callback fields.
    const transferred = await instanceA.controller.transferCallToComplaint(
      callId,
      {
        category: "route_issue",
        severity: "normal",
        description: "Concurrent field preservation verification",
      },
      "req-pg-conc-transfer",
    );
    const caseNo = transferred.data.complaintCase.caseNo;
    caseNos.add(caseNo);

    const expectedSession: Partial<CallSessionRecord> = {
      callId,
      callerPhone: "+886944000444",
      linkedOrderId: createdOrder.orderId,
      linkedCaseNo: caseNo,
      recordingId: `REC-R08-PG-${suffix}`,
      providerRecordingRef: `PROV-R08-PG-${suffix}`,
      recordingUrl: `https://recordings.example.com/REC-R08-PG-${suffix}`,
      recordingState: "ready",
      callbackTask: expect.objectContaining({
        callbackTaskId: cb.data.callbackTaskId,
        linkedOrderId: createdOrder.orderId,
        linkedCaseNo: caseNo,
      }),
    };

    expect(transferred.data.session).toMatchObject(expectedSession);
    expect(await instanceB.calls.getCallSessionForRead(callId)).toMatchObject(
      expectedSession,
    );
    expect(
      await instanceB.owned.getOrderForRead(createdOrder.orderId),
    ).toMatchObject({
      orderId: createdOrder.orderId,
      callId,
      recordingId: `REC-R08-PG-${suffix}`,
      status: "ready_for_dispatch",
    });
  });
});
