import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallSessionRecord } from "@drts/contracts";
import { createOpsClient } from "../../../packages/api-client/src/index";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import type { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterController } from "../../../apps/api/src/modules/callcenter/callcenter.controller";
import { CallcenterRepository } from "../../../apps/api/src/modules/callcenter/callcenter.repository";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { SandboxWebhookAdapter } from "../../../apps/api/src/modules/callcenter/sandbox-webhook.adapter";
import type { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import type { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";

type Sessions = Map<string, CallSessionRecord>;
const copy = (rows: Sessions): Sessions =>
  new Map([...rows].map(([id, session]) => [id, structuredClone(session)]));

// Only fetch routing and PostgreSQL IO are simulated. The normal SDK,
// Controller, ForWrite producer, transaction SQL and canonical reader run.
class SqlTransport {
  canonical: Sessions = new Map();
  query(sql: string, values: unknown[] = []) {
    return this.execute(sql, values, this.canonical);
  }
  isEnabled() {
    return true;
  }
  async connect() {
    let staged = copy(this.canonical);
    return {
      query: async (sql: string, values: unknown[] = []) => {
        if (sql === "BEGIN") {
          staged = copy(this.canonical);
          return { rows: [], rowCount: 0 };
        }
        if (sql === "COMMIT") {
          this.canonical = staged;
          return { rows: [], rowCount: 0 };
        }
        if (sql === "ROLLBACK") return { rows: [], rowCount: 0 };
        return this.execute(sql, values, staged);
      },
      release() {},
    };
  }
  private async execute(sql: string, values: unknown[], state: Sessions) {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q.startsWith("SET LOCAL") || q.includes("pg_advisory_xact_lock"))
      return { rows: [], rowCount: 0 };
    if (q.startsWith("INSERT INTO crm.phase1_call_sessions")) {
      const session = JSON.parse(String(values[4])) as CallSessionRecord;
      state.set(session.callId, session);
      return { rows: [], rowCount: 1 };
    }
    if (
      q.startsWith("SELECT record") &&
      q.includes("crm.phase1_call_sessions")
    ) {
      const all = [...state.values()];
      const selected = q.includes("record->'callbackTask'")
        ? all.filter((row) =>
            [row.callbackTask, ...(row.callbackTaskHistory ?? [])].some(
              (task) => task?.callbackTaskId === values[0],
            ),
          )
        : q.includes("WHERE call_id")
          ? all.filter((row) => row.callId === values[0])
          : all;
      return {
        rows: selected.map((record) => ({ record: structuredClone(record) })),
        rowCount: selected.length,
      };
    }
    throw new Error("Unexpected SIM SQL boundary: " + q);
  }
}
function harness() {
  const db = new SqlTransport();
  const audit = {
    recordAuditLog: (input: unknown) => input,
  } as AuditNotificationService;
  const controller = () => {
    const service = new CallcenterService(
      audit,
      new CallcenterRepository(db as unknown as DatabaseService),
    );
    return new CallcenterController(
      service,
      {} as ComplaintService,
      {} as IncidentService,
      new SandboxWebhookAdapter(service),
    );
  };
  const writer = controller();
  const reader = controller(); // Started before any task; normal GET reads SQL.
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      calls.push({ path, body });
      let response: unknown;
      if (init?.method === "GET" && path === "/api/callcenter/callbacks") {
        response = await reader.listCallbackTasks();
      } else if (
        init?.method === "POST" &&
        path === "/api/callcenter/sessions"
      ) {
        response = await writer.openCallSession(
          body as unknown as Parameters<typeof writer.openCallSession>[0],
        );
      } else {
        const create = path.match(
          /^\/api\/callcenter\/sessions\/([^/]+)\/callbacks$/,
        );
        const operation = path.match(
          /^\/api\/callcenter\/callbacks\/([^/]+)\/(claim|attempt)$/,
        );
        if (create) {
          response = await writer.createCallbackTask(
            decodeURIComponent(create[1]!),
            body as unknown as Parameters<typeof writer.createCallbackTask>[1],
          );
        } else if (operation?.[2] === "claim") {
          response = await writer.claimCallbackTask(
            decodeURIComponent(operation[1]!),
            body as unknown as Parameters<typeof writer.claimCallbackTask>[1],
          );
        } else if (operation?.[2] === "attempt") {
          response = await writer.recordCallbackAttempt(
            decodeURIComponent(operation[1]!),
            body as unknown as Parameters<
              typeof writer.recordCallbackAttempt
            >[1],
          );
        } else throw new Error("Unexpected SIM fetch route: " + path);
      }
      return Response.json(response);
    },
  );
  return {
    db,
    calls,
    client: createOpsClient("https://normal-callback.invalid", "operator-sim"),
  };
}

afterEach(() => vi.unstubAllGlobals());
describe("normal Ops callback contact outcome is understood by the actual producer", () => {
  it.each([
    ["connected", "in_progress"],
    ["answered", "in_progress"],
    ["succeeded", "in_progress"],
    ["busy", "pending"],
    ["no_answer", "pending"],
    ["rejected", "pending"],
  ] as const)(
    "normal %s attempt keeps one task/raw history and reads %s canonically",
    async (outcome, status) => {
      const h = harness();
      const call = await h.client.openCallSession({
        callType: "callback",
        callerPhone: "0900000000",
        agentId: "operator-sim",
      });
      const task = await h.client.createCallbackTask(call.callId, {
        dueAt: "2026-10-29T15:00:00.000Z",
        note: "Normal contact result SIM",
      });
      if (typeof task.version !== "number")
        throw new Error(
          "The original callback create did not return its version.",
        );
      const claimed = await h.client.claimCallbackTask(task.callbackTaskId, {
        operatorId: "operator-sim",
        expectedVersion: task.version,
      });
      expect(claimed.status).toBe("claimed");
      const attempted = await h.client.recordCallbackAttempt(
        task.callbackTaskId,
        {
          operatorId: "operator-sim",
          outcome,
          notes:
            "Contact reported by the existing ordinary UI; no real dial claimed.",
        },
      );
      expect(attempted).toMatchObject({
        callbackTaskId: task.callbackTaskId,
        callId: call.callId,
        status,
        attemptCount: 1,
        version: (claimed.version ?? 1) + 1,
        lastOutcome: outcome,
        assignedOperatorId: "operator-sim",
      });
      expect(attempted.attempts).toEqual([
        expect.objectContaining({
          outcome,
          operatorId: "operator-sim",
          hangupConfirmed: false,
        }),
      ]);
      expect(
        h.calls.find((request) => request.path.endsWith("/attempt"))?.body
          .outcome,
      ).toBe(outcome);
      const canonical = h.db.canonical.get(call.callId)?.callbackTask;
      expect(canonical).toMatchObject({
        callbackTaskId: task.callbackTaskId,
        status,
        lastOutcome: outcome,
        attemptCount: 1,
      });
      const reloaded = await h.client.listCallbackTasks();
      expect(reloaded).toHaveLength(1);
      expect(reloaded[0]).toEqual(attempted);
      expect(
        h.db.canonical.get(call.callId)?.callbackTaskHistory ?? [],
      ).toHaveLength(0);
    },
  );
});
