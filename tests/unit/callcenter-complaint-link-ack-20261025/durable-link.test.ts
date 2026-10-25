import { EventEmitter } from "node:events";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it, vi } from "vitest";
import type {
  CallSessionRecord,
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
} from "@drts/contracts";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterController } from "../../../apps/api/src/modules/callcenter/callcenter.controller";
import { CallcenterRepository } from "../../../apps/api/src/modules/callcenter/callcenter.repository";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { SandboxWebhookAdapter } from "../../../apps/api/src/modules/callcenter/sandbox-webhook.adapter";
import {
  ComplaintRepository,
  type ComplaintPendingCommitStatus,
} from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

type StoredPendingCommitRow = {
  command_key: string;
  case_no: string;
  action: string;
  command_payload: unknown;
  case_snapshot: ComplaintCaseRecord;
  timeline_snapshot: ComplaintTimelineEntry[];
  previous_case_snapshot: ComplaintCaseRecord | null;
  status: ComplaintPendingCommitStatus;
};

/**
 * Only the external SQL executor boundary (`DatabaseService.query` / `connect`)
 * is simulated here. All controllers, services, repositories, command identity
 * reservation/reconciliation, and transaction/lock orchestration are production.
 */
function createDurableHarness() {
  const tables = new Map<string, unknown>();
  const pendingCommits = new Map<string, StoredPendingCommitRow>();
  let lockChain = Promise.resolve();

  let holdPredicate: ((sql: string, txContext: string) => boolean) | null =
    null;
  let holdGate: ReturnType<typeof deferred> | null = null;
  let holdEntered: ReturnType<typeof deferred> | null = null;

  let failPredicate: ((sql: string, txContext: string) => Error | null) | null =
    null;
  let commitLandedBeforeFailure = false;

  const executeQuery = async (
    sql: string,
    values: readonly unknown[] = [],
    staged?: Map<string, unknown>,
    stagedConfirmations?: string[],
    txInfo?: { context: string },
  ) => {
    let effectiveContext = txInfo?.context ?? "direct";
    if (sql.includes("crm.phase1_call_sessions")) {
      effectiveContext = "callcenter";
      if (txInfo) {
        txInfo.context = "callcenter";
      }
    } else if (
      sql.includes("crm.phase1_complaint_") ||
      sql.includes("SELECT status, case_no")
    ) {
      effectiveContext = "complaint";
      if (txInfo) {
        txInfo.context = "complaint";
      }
    }

    if (holdPredicate && holdPredicate(sql, effectiveContext)) {
      const activeGate = holdGate;
      const activeEntered = holdEntered;
      holdPredicate = null;
      holdGate = null;
      holdEntered = null;
      activeEntered?.resolve();
      if (activeGate) {
        await activeGate.promise;
      }
    }

    if (failPredicate) {
      const err = failPredicate(sql, effectiveContext);
      if (err) {
        const shouldLandFirst = commitLandedBeforeFailure && sql === "COMMIT";
        failPredicate = null;
        commitLandedBeforeFailure = false;
        if (shouldLandFirst && staged) {
          for (const [k, v] of staged) tables.set(k, structuredClone(v));
          for (const key of stagedConfirmations ?? []) {
            const row = pendingCommits.get(key);
            if (row) row.status = "confirmed";
          }
        }
        throw err;
      }
    }

    const writeTarget = staged ?? tables;
    const readTarget = staged ? new Map([...tables, ...staged]) : tables;

    // Complaint pending commits (prepared outside business transaction, confirmed inside)
    if (sql.includes("INSERT INTO crm.phase1_complaint_pending_commits")) {
      const commandKey = String(values[0]);
      const caseNo = String(values[1]);
      const action = String(values[2]);
      if (
        !pendingCommits.has(commandKey) &&
        action === "create_complaint_case" &&
        [...pendingCommits.values()].some(
          (row) =>
            row.action === "create_complaint_case" && row.case_no === caseNo,
        )
      ) {
        const dup = new Error(
          "duplicate key value violates unique constraint",
        ) as Error & { code: string };
        dup.code = "23505";
        throw dup;
      }
      if (!pendingCommits.has(commandKey)) {
        pendingCommits.set(commandKey, {
          command_key: commandKey,
          case_no: caseNo,
          action,
          command_payload: JSON.parse(String(values[3])),
          case_snapshot: JSON.parse(String(values[4])) as ComplaintCaseRecord,
          timeline_snapshot: JSON.parse(
            String(values[5]),
          ) as ComplaintTimelineEntry[],
          previous_case_snapshot: values[6]
            ? (JSON.parse(String(values[6])) as ComplaintCaseRecord)
            : null,
          status: String(values[7]) as ComplaintPendingCommitStatus,
        });
      }
      return {
        rows: [structuredClone(pendingCommits.get(commandKey)!)],
        rowCount: 1,
      };
    }

    if (
      sql.includes("FROM crm.phase1_complaint_pending_commits") &&
      sql.includes("FOR UPDATE")
    ) {
      const row = pendingCommits.get(String(values[0]));
      return {
        rows: row ? [structuredClone(row)] : [],
        rowCount: row ? 1 : 0,
      };
    }

    if (
      sql.includes("UPDATE crm.phase1_complaint_pending_commits") &&
      sql.includes("status = 'confirmed'")
    ) {
      const commandKey = String(values[0]);
      if (stagedConfirmations) {
        stagedConfirmations.push(commandKey);
      } else {
        const row = pendingCommits.get(commandKey);
        if (row) row.status = "confirmed";
      }
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes("UPDATE crm.phase1_complaint_pending_commits") &&
      sql.includes("status = 'failed'")
    ) {
      const row = pendingCommits.get(String(values[0]));
      if (
        row?.status === "pending" &&
        isDeepStrictEqual(
          row.timeline_snapshot,
          JSON.parse(String(values[1])),
        )
      ) {
        row.status = "failed";
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes("DELETE FROM crm.phase1_complaint_pending_commits")) {
      const commandKey = String(values[0]);
      const row = pendingCommits.get(commandKey);
      if (
        !values[1] ||
        (row &&
          (values[2]
            ? row.status === values[2]
            : sql.includes("status = 'failed'")
              ? row.status === "failed"
              : true) &&
          isDeepStrictEqual(
            row.timeline_snapshot,
            JSON.parse(String(values[1])),
          ))
      ) {
        pendingCommits.delete(commandKey);
      }
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes("FROM crm.phase1_complaint_pending_commits")) {
      const rows = [...pendingCommits.values()]
        .filter((row) => row.status === "pending" || row.status === "confirmed")
        .map((row) => structuredClone(row));
      return { rows, rowCount: rows.length };
    }

    if (sql.includes("AS matches_prepared")) {
      const current = readTarget.get(
        `crm.phase1_complaint_cases:${String(values[0])}`,
      );
      return {
        rows: current
          ? [
              {
                matches_prepared: values[1]
                  ? isDeepStrictEqual(current, JSON.parse(String(values[1])))
                  : false,
              },
            ]
          : [],
        rowCount: current ? 1 : 0,
      };
    }

    if (sql.includes("WITH settlement_cases AS")) {
      const settlementCases = [...readTarget.entries()]
        .filter(([key]) => key.startsWith("crm.phase1_complaint_cases:"))
        .map(([, val]) => structuredClone(val) as ComplaintCaseRecord)
        .filter((c) => c.category === "settlement_dispute");
      const caseNos = new Set(settlementCases.map((c) => c.caseNo));
      const timelines = [...readTarget.entries()]
        .filter(([key]) => key.startsWith("crm.phase1_complaint_timelines:"))
        .map(([, val]) => structuredClone(val) as ComplaintTimelineEntry)
        .filter((t) => caseNos.has(t.caseNo));
      const rows = [
        ...settlementCases.map((record) => ({ kind: "case", record })),
        ...timelines.map((record) => ({ kind: "timeline", record })),
      ];
      return { rows, rowCount: rows.length };
    }

    if (sql.includes("complaint_case_snapshot")) {
      const caseNo = String(values[0]);
      const complaintCase = readTarget.get(
        `crm.phase1_complaint_cases:${caseNo}`,
      );
      const timelines = [...readTarget.entries()]
        .filter(([key]) => key.startsWith("crm.phase1_complaint_timelines:"))
        .map(([, val]) => structuredClone(val) as ComplaintTimelineEntry)
        .filter((t) => t.caseNo === caseNo);
      const rows = [
        ...(complaintCase
          ? [{ kind: "case", record: structuredClone(complaintCase) }]
          : []),
        ...timelines.map((record) => ({ kind: "timeline", record })),
      ];
      return { rows, rowCount: rows.length };
    }

    const table = /(?:INSERT INTO|FROM)\s+((?:ops|crm)\.phase1_\w+)/.exec(
      sql,
    )?.[1];
    if (table && /INSERT INTO/.test(sql)) {
      writeTarget.set(
        `${table}:${String(values[0])}`,
        JSON.parse(String(values.at(-1))),
      );
      return { rows: [], rowCount: 1 };
    }

    if (table && /SELECT record/.test(sql)) {
      if (sql.includes("WHERE record->'callbackTask'")) {
        const records = [...readTarget.entries()]
          .filter(([key]) => key.startsWith(`${table}:`))
          .map(([, value]) => value as CallSessionRecord)
          .filter((record) =>
            [record.callbackTask, ...(record.callbackTaskHistory ?? [])].some(
              (task) => task?.callbackTaskId === values[0],
            ),
          );
        return {
          rows: records.map((record) => ({ record: structuredClone(record) })),
          rowCount: records.length,
        };
      }
      if (values.length === 0) {
        const rows = [...readTarget.entries()]
          .filter(([key]) => key.startsWith(`${table}:`))
          .map(([, record]) => ({ record: structuredClone(record) }));
        return { rows, rowCount: rows.length };
      }
      const record = readTarget.get(`${table}:${String(values[0])}`);
      return {
        rows: record ? [{ record: structuredClone(record) }] : [],
        rowCount: record ? 1 : 0,
      };
    }

    return { rows: [], rowCount: 1 };
  };

  const database: Pick<DatabaseService, "isEnabled" | "query" | "connect"> = {
    isEnabled: () => true,
    query: (sql: string, values?: readonly unknown[]) =>
      executeQuery(sql, values) as never,
    connect: async () => {
      let staged = new Map<string, unknown>();
      let stagedConfirmations: string[] = [];
      const txInfo = { context: "unknown" };
      let releaseLock: (() => void) | null = null;
      return {
        query: async (sql: string, values?: readonly unknown[]) => {
          if (sql === "BEGIN") {
            staged = new Map<string, unknown>();
            stagedConfirmations = [];
            return { rows: [], rowCount: 1 } as never;
          }
          if (sql.includes("pg_advisory_xact_lock")) {
            txInfo.context = "callcenter";
            const previousLock = lockChain;
            const currentLock = deferred();
            lockChain = previousLock.then(() => currentLock.promise);
            releaseLock = () => currentLock.resolve();
            await previousLock;
            return executeQuery(
              sql,
              values,
              staged,
              stagedConfirmations,
              txInfo,
            ) as never;
          }
          if (sql === "COMMIT") {
            try {
              const res = await executeQuery(
                sql,
                values,
                staged,
                stagedConfirmations,
                txInfo,
              );
              for (const [k, v] of staged) tables.set(k, structuredClone(v));
              for (const key of stagedConfirmations) {
                const row = pendingCommits.get(key);
                if (row) row.status = "confirmed";
              }
              return res as never;
            } finally {
              if (releaseLock) {
                releaseLock();
                releaseLock = null;
              }
            }
          }
          if (sql === "ROLLBACK") {
            try {
              return (await executeQuery(
                sql,
                values,
                staged,
                stagedConfirmations,
                txInfo,
              )) as never;
            } finally {
              if (releaseLock) {
                releaseLock();
                releaseLock = null;
              }
            }
          }
          return executeQuery(
            sql,
            values,
            staged,
            stagedConfirmations,
            txInfo,
          ) as never;
        },
        release() {
          if (releaseLock) {
            releaseLock();
            releaseLock = null;
          }
        },
      } as never;
    },
  };

  function createInstance() {
    const audit = new AuditNotificationService();
    const auditWrite = vi.spyOn(audit, "recordAuditLog");
    const callcenterRepository = new CallcenterRepository(
      database as DatabaseService,
    );
    const calls = new CallcenterService(audit, callcenterRepository);
    const complaintRepository = new ComplaintRepository(
      database as DatabaseService,
    );
    const complaints = new ComplaintService(audit, complaintRepository);
    const incidents = new IncidentService(audit);
    const events = new OpsDispatchEventsService(new EventEmitter() as never);
    const ownedRepository = new OwnedMobilityRepository(
      database as DatabaseService,
    );
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
      audit,
      auditWrite,
      calls,
      complaints,
      incidents,
      owned,
      controller,
    };
  }

  return {
    database,
    tables,
    pendingCommits,
    createInstance,
    holdCallSessionWrite(fragment = "INSERT INTO crm.phase1_call_sessions") {
      const gate = deferred();
      const entered = deferred();
      holdGate = gate;
      holdEntered = entered;
      holdPredicate = (sql, ctx) =>
        ctx === "callcenter" && sql.includes(fragment);
      return {
        entered: entered.promise,
        release: () => gate.resolve(),
        reject: (err: Error) => gate.reject(err),
      };
    },
    holdComplaintWrite(fragment = "INSERT INTO crm.phase1_complaint_cases") {
      const gate = deferred();
      const entered = deferred();
      holdGate = gate;
      holdEntered = entered;
      holdPredicate = (sql, ctx) =>
        ctx === "complaint" && sql.includes(fragment);
      return {
        entered: entered.promise,
        release: () => gate.resolve(),
        reject: (err: Error) => gate.reject(err),
      };
    },
    failNextCallSessionWrite(
      fragment = "INSERT INTO crm.phase1_call_sessions",
      error = new Error("synthetic call session persistence failure"),
      landBeforeThrow = false,
    ) {
      commitLandedBeforeFailure = landBeforeThrow;
      failPredicate = (sql, ctx) =>
        ctx === "callcenter" && sql.includes(fragment) ? error : null;
    },
    savedCases(): ComplaintCaseRecord[] {
      return [...tables.entries()]
        .filter(([key]) => key.startsWith("crm.phase1_complaint_cases:"))
        .map(([, val]) => structuredClone(val) as ComplaintCaseRecord);
    },
    savedSession(callId: string): CallSessionRecord | null {
      const row = tables.get(`crm.phase1_call_sessions:${callId}`);
      return row ? (structuredClone(row) as CallSessionRecord) : null;
    },
  };
}

describe("BUREAU-R08 call-to-complaint link durable source & ACK", () => {
  it("R08-LINK-CACHE: cold peer reads committed call session for transfer precondition and rejects missing call with 404 before complaint creation", async () => {
    const h = createDurableHarness();
    const writer = h.createInstance();
    const peer = h.createInstance();

    const opened = await writer.controller.openCallSession(
      {
        callType: "booking",
        callerPhone: "+886911000111",
        agentId: "ops-agent-r08",
        agentIdentityAnnounced: true,
      },
      "req-open-r08-cache",
    );
    const callId = opened.data.callId;
    const order = await writer.owned.createCallCenterOrder(
      {
        callId,
        agentId: "ops-agent-r08",
        passenger: { name: "Wang Passenger", phone: "+886911000111" },
        pickup: { address: "Taipei Main Station" },
        dropoff: { address: "Nangang Exhibition Center" },
      },
      "req-create-order-r08-cache",
    );
    await writer.controller.createCallbackTask(
      callId,
      {
        dueAt: "2026-10-26T10:00:00.000Z",
        note: "Follow up on passenger complaint",
      },
      "req-cb-r08-cache",
    );

    // Peer process cache has never seen this call.
    expect(peer.calls.listCallSessions()).toEqual([]);

    // Missing call on cold peer must reject with 404 before creating any complaint.
    await expect(
      peer.controller.transferCallToComplaint(
        "CALL-NON-EXISTENT-R08",
        {
          category: "driver_service",
          severity: "normal",
          description: "Should fail precondition before complaint creation",
        },
        "req-missing-call-404",
      ),
    ).rejects.toMatchObject({
      code: "CALL_SESSION_NOT_FOUND",
    });
    expect(h.savedCases()).toEqual([]);
    expect(h.pendingCommits.size).toBe(0);

    // Existing committed call on cold peer succeeds and links both session and callback task.
    const transferred = await peer.controller.transferCallToComplaint(
      callId,
      {
        category: "driver_service",
        severity: "normal",
        description: "Driver took an unauthorized detour",
      },
      "req-transfer-cold-peer",
    );

    const caseNo = transferred.data.complaintCase.caseNo;
    expect(transferred.data.complaintCase).toMatchObject({
      caseNo,
      caseSource: "phone",
      relatedCallId: callId,
      relatedOrderId: order.orderId,
      category: "driver_service",
    });
    expect(transferred.data.session).toMatchObject({
      callId,
      linkedOrderId: order.orderId,
      linkedCaseNo: caseNo,
      callbackTask: expect.objectContaining({
        linkedOrderId: order.orderId,
        linkedCaseNo: caseNo,
      }),
    });

    // Both writer and a third cold reader observe the committed link in DB.
    const thirdReader = h.createInstance();
    expect(await writer.calls.getCallSessionForRead(callId)).toMatchObject({
      callId,
      linkedOrderId: order.orderId,
      linkedCaseNo: caseNo,
      callbackTask: expect.objectContaining({
        linkedCaseNo: caseNo,
      }),
    });
    expect(await thirdReader.calls.getCallSessionForRead(callId)).toMatchObject(
      {
        callId,
        linkedOrderId: order.orderId,
        linkedCaseNo: caseNo,
      },
    );
    expect(await thirdReader.calls.listCallbackTasksForRead()).toEqual([
      expect.objectContaining({
        callId,
        linkedOrderId: order.orderId,
        linkedCaseNo: caseNo,
      }),
    ]);
  });

  it("R08-LINK-FALSE-ACK: transferCallToComplaint waits for call-session link COMMIT before acknowledging, mutating memory, or emitting link_call_case audit", async () => {
    const h = createDurableHarness();
    const app = h.createInstance();
    const peer = h.createInstance();

    const opened = await app.controller.openCallSession({
      callType: "general_inquiry",
      callerPhone: "+886922000222",
      agentId: "ops-agent-await",
    });
    const callId = opened.data.callId;
    await app.controller.createCallbackTask(callId, {
      dueAt: "2026-10-26T12:00:00.000Z",
      note: "Callback pending case link",
    });

    const beforeSession = app.calls.getCallSession(callId);
    app.auditWrite.mockClear();

    const insertGate = h.holdCallSessionWrite(
      "INSERT INTO crm.phase1_call_sessions",
    );
    let commitGate: ReturnType<typeof h.holdCallSessionWrite> | null = null;
    let settled = false;
    const pendingTransfer = app.controller
      .transferCallToComplaint(
        callId,
        {
          category: "late_arrival",
          severity: "high",
          description: "Vehicle arrived 35 minutes late",
        },
        "req-await-commit",
      )
      .then((res) => {
        settled = true;
        return res;
      });

    try {
      await insertGate.entered;
      // Complaint case is already committed, but call-session link DB write is held.
      expect(h.savedCases()).toHaveLength(1);
      const committedCaseNo = h.savedCases()[0]!.caseNo;
      expect(settled).toBe(false);
      // Memory, DB, and audit must not publish link success before COMMIT.
      expect(app.calls.getCallSession(callId)).toEqual(beforeSession);
      expect(app.calls.getCallSession(callId).linkedCaseNo).toBeNull();
      expect(
        app.calls.getCallSession(callId).callbackTask?.linkedCaseNo,
      ).toBeNull();
      expect(h.savedSession(callId)?.linkedCaseNo).toBeNull();
      expect(
        app.auditWrite.mock.calls.filter(
          ([entry]) => entry.actionName === "link_call_case",
        ),
      ).toEqual([]);

      commitGate = h.holdCallSessionWrite("COMMIT");
      insertGate.release();
      await commitGate.entered;

      // Even after INSERT statement executes inside the transaction, before COMMIT completes:
      expect(settled).toBe(false);
      expect(app.calls.getCallSession(callId).linkedCaseNo).toBeNull();
      expect(h.savedSession(callId)?.linkedCaseNo).toBeNull();
      expect(
        app.auditWrite.mock.calls.filter(
          ([entry]) => entry.actionName === "link_call_case",
        ),
      ).toEqual([]);

      commitGate.release();
      const completed = await pendingTransfer;
      expect(settled).toBe(true);
      expect(completed.data.complaintCase.caseNo).toBe(committedCaseNo);
      expect(completed.data.session.linkedCaseNo).toBe(committedCaseNo);
      expect(completed.data.session.callbackTask?.linkedCaseNo).toBe(
        committedCaseNo,
      );
      expect(app.calls.getCallSession(callId).linkedCaseNo).toBe(
        committedCaseNo,
      );
      expect(await peer.calls.getCallSessionForRead(callId)).toMatchObject({
        callId,
        linkedCaseNo: committedCaseNo,
        callbackTask: expect.objectContaining({
          linkedCaseNo: committedCaseNo,
        }),
      });
      expect(
        app.auditWrite.mock.calls.filter(
          ([entry]) => entry.actionName === "link_call_case",
        ),
      ).toHaveLength(1);
    } finally {
      insertGate.release();
      commitGate?.release();
      await pendingTransfer.catch(() => undefined);
    }
  });

  it("R08-LINK-FALSE-ACK: failed call-session link write rejects without false ACK or memory/audit pollution, and same-intent retry recovers the link on the original case without duplicating a complaint", async () => {
    const h = createDurableHarness();
    const writer = h.createInstance();

    const opened = await writer.controller.openCallSession({
      callType: "booking",
      callerPhone: "+886933000333",
      agentId: "ops-agent-retry",
    });
    const callId = opened.data.callId;
    const order = await writer.owned.createCallCenterOrder(
      {
        callId,
        agentId: "ops-agent-retry",
        passenger: { name: "Retry Passenger", phone: "+886933000333" },
        pickup: { address: "Banqiao Station" },
        dropoff: { address: "Ximen Station" },
      },
      "req-create-order-r08-retry",
    );
    await writer.controller.createCallbackTask(callId, {
      dueAt: "2026-10-26T15:00:00.000Z",
      note: "Callback for retry verification",
    });

    writer.auditWrite.mockClear();
    h.failNextCallSessionWrite(
      "INSERT INTO crm.phase1_call_sessions",
      new Error("call session link write rejected"),
    );

    const command = {
      category: "fare_dispute" as const,
      severity: "normal" as const,
      description: "Meter fare differed from quoted route estimate",
    };

    await expect(
      writer.controller.transferCallToComplaint(
        callId,
        command,
        "req-link-fail-1",
      ),
    ).rejects.toThrow("call session link write rejected");

    // Complaint case committed once, but the call link failed.
    expect(h.savedCases()).toHaveLength(1);
    const originalCaseNo = h.savedCases()[0]!.caseNo;

    // Neither memory nor DB nor audit may claim the call session is linked.
    expect(writer.calls.getCallSession(callId).linkedCaseNo).toBeNull();
    expect(
      writer.calls.getCallSession(callId).callbackTask?.linkedCaseNo,
    ).toBeNull();
    expect(h.savedSession(callId)?.linkedCaseNo).toBeNull();
    expect(
      writer.auditWrite.mock.calls.filter(
        ([entry]) => entry.actionName === "link_call_case",
      ),
    ).toEqual([]);

    // Retry the same transfer intent on a fresh replica (simulating restart or second instance).
    const peer = h.createInstance();
    await peer.complaints.onModuleInit();
    const retried = await peer.controller.transferCallToComplaint(
      callId,
      command,
      "req-link-retry-2",
    );

    expect(retried.data.complaintCase.caseNo).toBe(originalCaseNo);
    expect(h.savedCases()).toHaveLength(1);
    expect(retried.data.session).toMatchObject({
      callId,
      linkedOrderId: order.orderId,
      linkedCaseNo: originalCaseNo,
      callbackTask: expect.objectContaining({
        linkedOrderId: order.orderId,
        linkedCaseNo: originalCaseNo,
      }),
    });
    expect(await writer.calls.getCallSessionForRead(callId)).toMatchObject({
      callId,
      linkedOrderId: order.orderId,
      linkedCaseNo: originalCaseNo,
      callbackTask: expect.objectContaining({
        linkedCaseNo: originalCaseNo,
      }),
    });
    expect(
      peer.auditWrite.mock.calls.filter(
        ([entry]) => entry.actionName === "link_call_case",
      ),
    ).toHaveLength(1);

    // A legitimate distinct complaint intent on the same call is not blocked.
    const distinct = await peer.controller.transferCallToComplaint(
      callId,
      {
        category: "safety_concern",
        severity: "urgent",
        description: "Distinct safety report on the same call",
      },
      "req-distinct-intent",
      "distinct-intent-key-2",
    );
    expect(distinct.data.complaintCase.caseNo).not.toBe(originalCaseNo);
    expect(h.savedCases()).toHaveLength(2);
    expect(distinct.data.session.linkedCaseNo).toBe(
      distinct.data.complaintCase.caseNo,
    );
  });

  it("preserves concurrent recording and phone-order fields when linking a complaint case across instances", async () => {
    const h = createDurableHarness();
    const instanceA = h.createInstance();
    const instanceB = h.createInstance();

    const callId = "CALL-20261025-900001";
    const order = await instanceA.owned.createCallCenterOrder({
      callId,
      agentId: "ops-agent-concurrent",
      passenger: { name: "Chen Passenger", phone: "+886944000444" },
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Songshan Airport" },
    });

    // Hold complaint persistence on instance A after it reads the initial call precondition.
    const complaintGate = h.holdComplaintWrite(
      "INSERT INTO crm.phase1_complaint_cases",
    );
    const pendingTransfer = instanceA.controller.transferCallToComplaint(
      callId,
      {
        category: "route_issue",
        severity: "normal",
        description: "Route inquiry transferred to complaint",
      },
      "req-concurrent-transfer",
    );

    await complaintGate.entered;

    // While complaint creation is in flight on instance A, instance B attaches
    // the recording callback and creates a callback task in DB.
    await instanceB.controller.attachRecordingCallback(
      callId,
      {
        recordingId: "REC-R08-CONCURRENT-001",
        providerRecordingRef: "PROV-REF-001",
        recordingUrl: "https://recordings.example.com/REC-R08-CONCURRENT-001",
        agentId: "ops-agent-concurrent",
      },
      "req-concurrent-recording",
    );
    const callbackCreated = await instanceB.controller.createCallbackTask(
      callId,
      {
        dueAt: "2026-10-26T18:00:00.000Z",
        note: "Concurrent callback task",
      },
      "req-concurrent-callback",
    );

    // Instance A's local memory cache still has recordingId: null and callbackTask: null.
    expect(instanceA.calls.getCallSession(callId).recordingId).toBeNull();
    expect(instanceA.calls.getCallSession(callId).callbackTask).toBeNull();

    // Release complaint write; linkCaseToCallSession must lock and read the
    // authoritative row from DB rather than overwriting with instance A's stale memory.
    complaintGate.release();
    const transferred = await pendingTransfer;
    const caseNo = transferred.data.complaintCase.caseNo;

    expect(transferred.data.session).toMatchObject({
      callId,
      callerPhone: "+886944000444",
      linkedOrderId: order.orderId,
      linkedCaseNo: caseNo,
      recordingId: "REC-R08-CONCURRENT-001",
      providerRecordingRef: "PROV-REF-001",
      recordingUrl: "https://recordings.example.com/REC-R08-CONCURRENT-001",
      recordingState: "ready",
      callbackTask: expect.objectContaining({
        callbackTaskId: callbackCreated.data.callbackTaskId,
        linkedOrderId: order.orderId,
        linkedCaseNo: caseNo,
      }),
    });
    expect(transferred.data.session.flags).toEqual(
      expect.arrayContaining(["recording_bound", "callback_pending"]),
    );

    const readback = await instanceB.calls.getCallSessionForRead(callId);
    expect(readback).toMatchObject({
      callId,
      callerPhone: "+886944000444",
      linkedOrderId: order.orderId,
      linkedCaseNo: caseNo,
      recordingId: "REC-R08-CONCURRENT-001",
      providerRecordingRef: "PROV-REF-001",
      recordingUrl: "https://recordings.example.com/REC-R08-CONCURRENT-001",
      recordingState: "ready",
      callbackTask: expect.objectContaining({
        callbackTaskId: callbackCreated.data.callbackTaskId,
        linkedOrderId: order.orderId,
        linkedCaseNo: caseNo,
      }),
    });
  });

  it("preserves synchronous validation and no-DB sandbox behavior", () => {
    const audit = new AuditNotificationService();
    const noDbCalls = new CallcenterService(audit);
    const session = noDbCalls.openCallSession({
      callType: "general_inquiry",
      callerPhone: "+886955000555",
      agentId: "ops-no-db",
    });

    expect(() => noDbCalls.linkCaseToCallSession(session.callId, "   ")).toThrow(
      ApiRequestError,
    );
    expect(() =>
      noDbCalls.linkCaseToCallSession("CALL-MISSING-NO-DB", "C-20261025-000001"),
    ).toThrow(ApiRequestError);

    const linked = noDbCalls.linkCaseToCallSession(
      session.callId,
      "C-20261025-000001",
      "req-no-db-link",
    );
    expect(linked).not.toBeInstanceOf(Promise);
    expect((linked as CallSessionRecord).linkedCaseNo).toBe(
      "C-20261025-000001",
    );

    // Even when DB is enabled, blank caseNo validation remains synchronous.
    const h = createDurableHarness();
    const dbApp = h.createInstance();
    expect(() =>
      dbApp.calls.linkCaseToCallSession(session.callId, "  "),
    ).toThrow(ApiRequestError);
  });
});
