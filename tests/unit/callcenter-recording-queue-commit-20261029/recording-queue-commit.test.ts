import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { CallSessionRecord, OwnedOrderRecord } from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import type { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterController } from "../../../apps/api/src/modules/callcenter/callcenter.controller";
import { CallcenterRepository } from "../../../apps/api/src/modules/callcenter/callcenter.repository";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { SandboxWebhookAdapter } from "../../../apps/api/src/modules/callcenter/sandbox-webhook.adapter";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import type { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import type { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";

// Only PostgreSQL transport is simulated. Controller, adapter, service, queue
// SQL, transaction and publication implementations are the actual source.
const CALL = "recording-queue-normal-call";
const ENDED = "2026-10-29T12:00:00.000Z";
type Work = { work_id: string; payload_ref: string; status: string };
type State = {
  session: CallSessionRecord;
  works: Map<string, Work>;
  order: OwnedOrderRecord | null;
  traces: unknown[];
};
function initial(): CallSessionRecord {
  return {
    callId: CALL,
    callType: "booking",
    callerPhone: "0900000000",
    agentId: "operator-sim",
    agentIdentityAnnounced: true,
    agentIdentityAnnouncedAt: "2026-10-29T11:00:00.000Z",
    status: "active",
    startedAt: "2026-10-29T11:00:00.000Z",
    endedAt: null,
    recordingId: null,
    providerRecordingRef: null,
    recordingUrl: null,
    linkedOrderId: "same-order-preserved",
    linkedCaseNo: "same-complaint-preserved",
    lastEtaQuotedMinutes: 8,
    lastEtaQuotedAt: "2026-10-29T11:01:00.000Z",
    callbackTask: null,
    recordingState: "pending",
    flags: ["recording_pending"],
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
function clone(state: State): State {
  return {
    session: structuredClone(state.session),
    works: new Map(state.works),
    order: structuredClone(state.order),
    traces: structuredClone(state.traces),
  };
}
class SqlTransport {
  canonical: State = {
    session: initial(),
    works: new Map(),
    order: null,
    traces: [],
  };
  events: string[] = [];
  queueGate: {
    started: ReturnType<typeof deferred>;
    release: ReturnType<typeof deferred>;
  } | null = null;
  rejectNextQueue = false;
  isEnabled() {
    return true;
  }
  query(sql: string, values: unknown[] = []) {
    return this.execute(sql, values, this.canonical, "pool");
  }
  async connect() {
    let staged = clone(this.canonical);
    return {
      query: async (sql: string, values: unknown[] = []) => {
        const q = sql.trim();
        if (q === "BEGIN") {
          staged = clone(this.canonical);
          this.events.push("BEGIN");
          return { rows: [], rowCount: 0 };
        }
        if (q === "COMMIT") {
          this.events.push("COMMIT");
          this.canonical = staged;
          return { rows: [], rowCount: 0 };
        }
        if (q === "ROLLBACK") {
          this.events.push("ROLLBACK");
          return { rows: [], rowCount: 0 };
        }
        return this.execute(sql, values, staged, "transaction");
      },
      release: () => this.events.push("RELEASE"),
    };
  }
  private async execute(
    sql: string,
    values: unknown[],
    state: State,
    scope: string,
  ) {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q.startsWith("SET LOCAL") || q.includes("pg_advisory_xact_lock"))
      return { rows: [], rowCount: 0 };
    if (q.includes("SELECT record") && q.includes("crm.phase1_call_sessions"))
      return {
        rows: [{ record: structuredClone(state.session) }],
        rowCount: 1,
      };
    if (q.startsWith("INSERT INTO crm.phase1_call_sessions")) {
      this.events.push("session:" + scope);
      state.session = JSON.parse(String(values[4])) as CallSessionRecord;
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("SELECT record") && q.includes("ops.phase1_owned_orders"))
      return {
        rows: state.order
          ? [{ record: structuredClone(state.order), aggregate_version: 1 }]
          : [],
        rowCount: state.order ? 1 : 0,
      };
    if (q.startsWith("INSERT INTO ops.phase1_owned_orders")) {
      this.events.push("order:" + scope);
      state.order = JSON.parse(String(values[14])) as OwnedOrderRecord;
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith("INSERT INTO ops.phase1_dispatch_trace_logs")) {
      this.events.push("trace:" + scope);
      state.traces.push([...values]);
      return { rows: [], rowCount: 1 };
    }
    if (
      q.startsWith("SELECT work_id, payload_ref, status FROM voice.work_item")
    ) {
      const work = state.works.get(String(values[0]));
      return { rows: work ? [{ ...work }] : [], rowCount: work ? 1 : 0 };
    }
    if (q.startsWith("INSERT INTO voice.work_item")) {
      this.events.push("enqueue:" + scope);
      if (this.queueGate) {
        this.queueGate.started.resolve();
        await this.queueGate.release.promise;
      }
      if (this.rejectNextQueue) {
        this.rejectNextQueue = false;
        throw new Error("SIM queue IO rejected");
      }
      const key = String(values[0]);
      if (state.works.has(key)) return { rows: [], rowCount: 0 };
      const row = {
        work_id: "sim-work-1",
        payload_ref: String(values[1]),
        status: "pending",
      };
      state.works.set(key, row);
      return { rows: [{ work_id: row.work_id }], rowCount: 1 };
    }
    throw new Error("Unexpected SQL transport boundary: " + q);
  }
}
async function harness(db = new SqlTransport()) {
  const audit: Array<Record<string, unknown>> = [];
  const auditPort = {
    recordAuditLog: (input: Record<string, unknown>) => {
      audit.push(input);
      return input;
    },
  } as unknown as AuditNotificationService;
  const events = new OpsDispatchEventsService(new EventEmitter() as never);
  const registry = new RegulatoryRegistryService(
    events,
    auditPort,
    new DriverProfileService(auditPort),
  );
  const tasks = new OwnedMobilityTaskEventsService(new EventEmitter() as never);
  // Seed the SQL boundary with a complete order produced by the original public
  // phone booking command, then wire a separate normal durable reader/writer.
  const seedCalls = new CallcenterService(auditPort);
  const seedOwned = new OwnedMobilityService(
    registry,
    auditPort,
    seedCalls,
    tasks,
  );
  const order = await seedOwned.createCallCenterOrder({
    callId: CALL,
    agentId: "operator-sim",
    passenger: { name: "Passenger SIM", phone: "0900000000" },
    pickup: { address: "Banqiao Station" },
    dropoff: { address: "Taipei Station" },
  });
  db.canonical.order = order;
  db.canonical.session.linkedOrderId = order.orderId;
  const repository = new CallcenterRepository(db as unknown as DatabaseService);
  const service = new CallcenterService(auditPort, repository);
  const ownedRepository = new OwnedMobilityRepository(
    db as unknown as DatabaseService,
  );
  const owned = new OwnedMobilityService(
    registry,
    auditPort,
    service,
    tasks,
    events,
    ownedRepository,
  );
  owned.registerCallRecordingListeners();
  await service.onModuleInit();
  audit.length = 0;
  const adapter = new SandboxWebhookAdapter(service);
  const controller = new CallcenterController(
    service,
    {} as ComplaintService,
    {} as IncidentService,
    adapter,
  );
  return {
    db,
    audit,
    repository,
    service,
    adapter,
    controller,
    owned,
    orderId: order.orderId,
  };
}
type Operation = "recording.pending" | "close";
function invoke(h: Awaited<ReturnType<typeof harness>>, kind: Operation) {
  return kind === "close"
    ? h.controller.closeCallSession(
        CALL,
        { endedAt: ENDED },
        "sim-close-request",
      )
    : h.controller.ingestSandboxWebhook(
        { event_type: kind, provider_call_id: CALL, ended_at: ENDED },
        "sim-pending-request",
      );
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("normal call recording finalization queue commits with the caller's session", () => {
  it.each(["recording.pending", "close"] as const)(
    "%s holds ACK, domain publication and canonical update until queue IO commits",
    async (kind) => {
      const h = await harness();
      h.db.queueGate = { started: deferred(), release: deferred() };
      let settled = false;
      const request = invoke(h, kind).finally(() => {
        settled = true;
      });
      await h.db.queueGate.started.promise;
      await turn();
      try {
        expect(settled).toBe(false);
        // Sandbox ingest has an earlier committed external-session upsert.
        // Only this pending/close mutation and its queue are one transaction.
        expect(h.db.canonical.session.status).toBe(
          kind === "close" ? "active" : "closed",
        );
        expect(h.db.canonical.session.flags).not.toContain(
          "recording_pending_callback",
        );
        expect(
          h.audit.some(
            (a) =>
              a.actionName ===
              (kind === "close"
                ? "close_call_session"
                : "mark_recording_pending"),
          ),
        ).toBe(false);
      } finally {
        h.db.queueGate.release.resolve();
        await request;
      }
      expect(h.db.canonical.session.status).toBe("closed");
      expect(h.db.canonical.works.size).toBe(1);
      expect(h.db.events).toContain("order:transaction");
      expect(h.db.events).toContain("trace:transaction");
      expect(h.db.events).toContain("enqueue:transaction");
      expect(h.db.events.lastIndexOf("COMMIT")).toBeGreaterThan(
        h.db.events.indexOf("enqueue:transaction"),
      );
      expect(
        h.audit.some(
          (a) =>
            a.actionName ===
            (kind === "close"
              ? "close_call_session"
              : "mark_recording_pending"),
        ),
      ).toBe(true);
    },
  );
  it.each(["recording.pending", "close"] as const)(
    "%s queue rejection is an error without false publication and its original data can retry",
    async (kind) => {
      const h = await harness();
      h.db.rejectNextQueue = true;
      const outcome = await invoke(h, kind).then(
        () => ({ error: null }),
        (error: unknown) => ({ error }),
      );
      await turn();
      expect(outcome.error).toMatchObject({ message: "SIM queue IO rejected" });
      expect(h.db.canonical.session.status).toBe(
        kind === "close" ? "active" : "closed",
      );
      expect(h.db.canonical.session.flags).not.toContain(
        "recording_pending_callback",
      );
      expect(h.db.canonical.session.linkedOrderId).toBe(h.orderId);
      expect(h.db.canonical.works.size).toBe(0);
      expect(h.db.events).toContain("ROLLBACK");
      expect(
        h.audit.some(
          (a) =>
            a.actionName ===
            (kind === "close"
              ? "close_call_session"
              : "mark_recording_pending"),
        ),
      ).toBe(false);
      await invoke(h, kind);
      expect(h.db.canonical.works.size).toBe(1);
      expect(h.db.canonical.session.status).toBe("closed");
      expect(h.db.canonical.session.linkedCaseNo).toBe(
        "same-complaint-preserved",
      );
    },
  );
  it("normal duplicate pending/close preserves one original work item and order/case lineage", async () => {
    const h = await harness();
    await invoke(h, "recording.pending");
    const first = [...h.db.canonical.works.values()][0];
    await invoke(h, "recording.pending");
    await invoke(h, "close");
    expect(h.db.canonical.works.size).toBe(1);
    expect([...h.db.canonical.works.values()][0]).toEqual(first);
    expect(JSON.parse(first!.payload_ref)).toMatchObject({
      callId: CALL,
      linkedOrderId: h.orderId,
    });
    expect(h.db.canonical.session.linkedCaseNo).toBe(
      "same-complaint-preserved",
    );
  });
  it("original conflicting recording identity rejects close without replacing work or publishing closed", async () => {
    const db = new SqlTransport();
    db.canonical.session.recordingId = "recording-current";
    db.canonical.works.set(`finalize_recording:call:${CALL}`, {
      work_id: "original-work",
      payload_ref: JSON.stringify({ recordingId: "other-recording" }),
      status: "pending",
    });
    const h = await harness(db);
    const outcome = await invoke(h, "close").then(
      () => ({ error: null }),
      (error: unknown) => ({ error }),
    );
    await turn();
    expect(outcome.error).toMatchObject({
      code: "VOICE_ACTION_PAYLOAD_CONFLICT",
    });
    expect(db.canonical.session.status).toBe("active");
    expect(
      db.canonical.works.get(`finalize_recording:call:${CALL}`)?.work_id,
    ).toBe("original-work");
    expect(h.audit.some((a) => a.actionName === "close_call_session")).toBe(
      false,
    );
  });
  it("normal ready and failed callbacks retain their actual state semantics without enqueuing new finalization", async () => {
    const h = await harness();
    await h.controller.ingestSandboxWebhook({
      event_type: "recording.ready",
      provider_call_id: CALL,
      recording_id: "sim-ready-recording",
      provider_recording_ref: "sim-provider-ref",
    });
    expect(h.db.canonical.session.recordingId).toBe("sim-ready-recording");
    expect(h.db.canonical.session.flags).toContain("recording_bound");
    await h.controller.ingestSandboxWebhook({
      event_type: "recording.failed",
      provider_call_id: CALL,
      ended_at: ENDED,
    });
    expect(h.db.canonical.session.recordingId).toBeNull();
    expect(h.db.canonical.session.flags).toContain("recording_missing");
    expect(h.db.canonical.works.size).toBe(0);
  });
  it("without database the existing synchronous pending and close producer remains synchronous", () => {
    const service = new CallcenterService({
      recordAuditLog: (input: unknown) => input,
    } as AuditNotificationService);
    const session = service.openCallSession({
      callType: "booking",
      callerPhone: "0900000000",
    });
    const pending = service.markRecordingPendingForWrite(session.callId);
    expect(pending).not.toBeInstanceOf(Promise);
    const closed = service.closeCallSessionForWrite(session.callId, {
      endedAt: ENDED,
    });
    expect(closed).not.toBeInstanceOf(Promise);
    expect(closed).toMatchObject({ status: "closed", endedAt: ENDED });
  });
});
