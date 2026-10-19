/* Socket-free transport fixture. SQL and every business decision come from
 * the actual repository/controller/service at the selected source revision.
 * This models returned wire rows and lost responses, not PostgreSQL isolation. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import cp from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);
const root = path.resolve(__dirname, "../../..");
const reference = process.env.COMPLAINT_SOURCE_REF;
const localRequire = createRequire(path.join(root, "package.json"));
const ts = localRequire("typescript");
let forbiddenNetworkOrListenAttempts = 0;
for (const [module, key] of [
  ["node:net", "connect"],
  ["node:http", "request"],
  ["node:https", "request"],
]) {
  nodeRequire(module)[key] = () => {
    forbiddenNetworkOrListenAttempts++;
    throw Error("Socket-free probe");
  };
}
nodeRequire("node:net").Server.prototype.listen = () => {
  forbiddenNetworkOrListenAttempts++;
  throw Error("Socket-free probe");
};
global.fetch = async () => {
  forbiddenNetworkOrListenAttempts++;
  throw Error("Socket-free probe");
};
const cache = new Map();
const sourceTextCache = new Map();
function source(relative) {
  if (sourceTextCache.has(relative)) return sourceTextCache.get(relative);
  let text = null;
  try {
    text = reference
      ? cp
          .execFileSync("git", ["show", `${reference}:${relative}`], {
            cwd: root,
            stdio: ["ignore", "pipe", "ignore"],
          })
          .toString()
      : fs.readFileSync(path.join(root, relative), "utf8");
  } catch {
    /* An absent extension candidate is cached along with real modules. */
  }
  sourceTextCache.set(relative, text);
  return text;
}
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const code = source(relative);
  if (code === null) throw Error(`No module ${relative}`);
  const module = { exports: {} };
  cache.set(relative, module);
  const requireSource = (name) => {
    if (name === "@drts/contracts")
      return load("packages/contracts/src/index.ts");
    if (name === "@drts/control-plane-auth")
      return load("packages/control-plane-auth/src/index.ts");
    if (name.startsWith(".")) {
      const stem = path.posix.normalize(
        path.posix.join(path.posix.dirname(relative), name),
      );
      for (const candidate of [
        stem + ".ts",
        stem + ".tsx",
        stem + "/index.ts",
        stem,
      ]) {
        if (source(candidate) !== null) return load(candidate);
      }
      throw Error(`Cannot resolve ${name} from ${relative}`);
    }
    return createRequire(path.join(root, relative))(name);
  };
  const javascript = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${javascript}\n})`, {
    filename: `${reference || "worktree"}:${relative}`,
  })(requireSource, module, module.exports);
  return module.exports;
}
const { ComplaintRepository } = load(
  "apps/api/src/modules/complaint/complaint.repository.ts",
);
const { ComplaintService } = load(
  "apps/api/src/modules/complaint/complaint.service.ts",
);
const { ComplaintController } = load(
  "apps/api/src/modules/complaint/complaint.controller.ts",
);
const { CallcenterService } = load(
  "apps/api/src/modules/callcenter/callcenter.service.ts",
);
const { CallcenterController } = load(
  "apps/api/src/modules/callcenter/callcenter.controller.ts",
);
const { AuditNotificationService } = load(
  "apps/api/src/modules/audit-notification/audit-notification.service.ts",
);
const { IncidentService } = load(
  "apps/api/src/modules/incident/incident.service.ts",
);
const { IdempotencyService } = load(
  "apps/api/src/common/idempotency/idempotency.service.ts",
);
const { IdempotencyRepository } = load(
  "apps/api/src/common/idempotency/idempotency.repository.ts",
);
const clone = (value) => JSON.parse(JSON.stringify(value));
class Wire {
  constructor() {
    this.cases = new Map();
    this.timelines = new Map();
    this.commands = new Map();
    this.trace = [];
    this.nextCommit = "ok";
    this.registrationFails = false;
    this.readFails = false;
    this.connectFails = false;
    this.identityReadFails = false;
    this.rowOrder = "forward";
  }
  isEnabled() {
    return true;
  }
  async connect() {
    if (this.connectFails)
      throw Error("Fixture: connect rejected before BEGIN");
    const cases = [],
      timelines = [],
      confirmations = [];
    const mode = this.nextCommit;
    this.nextCommit = "ok";
    return {
      release: () => {},
      query: async (sql, values = []) => {
        if (sql === "BEGIN" || sql === "ROLLBACK") {
          this.trace.push(sql);
          return { rows: [] };
        }
        if (
          sql.includes("FROM crm.phase1_complaint_pending_commits") &&
          sql.includes("FOR UPDATE")
        ) {
          const reserved = this.commands.get(values[0]);
          this.trace.push(`lock-${reserved?.status || "missing"}`);
          return { rows: reserved ? [clone(reserved)] : [] };
        }
        if (sql.includes("AS matches_prepared")) {
          const current = this.cases.get(values[0]);
          return {
            rows: current
              ? [
                  {
                    matches_prepared: isDeepStrictEqual(
                      current,
                      JSON.parse(values[1]),
                    ),
                  },
                ]
              : [],
          };
        }
        if (sql.includes("INSERT INTO crm.phase1_complaint_cases")) {
          cases.push(JSON.parse(values[5]));
          this.trace.push("case-write");
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO crm.phase1_complaint_timelines")) {
          timelines.push(JSON.parse(values[4]));
          this.trace.push("timeline-write");
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("UPDATE crm.phase1_complaint_pending_commits")) {
          confirmations.push(values[0]);
          this.trace.push("confirm-in-transaction");
          return { rows: [], rowCount: 1 };
        }
        if (sql === "COMMIT") {
          this.trace.push("COMMIT");
          if (mode !== "unknown-not-landed") {
            for (const row of cases) this.cases.set(row.caseNo, clone(row));
            for (const row of timelines)
              this.timelines.set(row.entryId, clone(row));
            for (const key of confirmations)
              this.commands.get(key).status = "confirmed";
          }
          if (mode.startsWith("unknown"))
            throw Error("Fixture: COMMIT response lost");
          return { rows: [] };
        }
        throw Error(`Unexpected transaction SQL: ${sql}`);
      },
    };
  }
  async query(sql, values = []) {
    if (sql.includes("INSERT INTO crm.phase1_complaint_pending_commits")) {
      this.trace.push("PREPARED");
      if (this.registrationFails)
        throw Error("Fixture: PREPARED registration rejected");
      if (
        !this.commands.has(values[0]) &&
        values[2] === "create_complaint_case" &&
        [...this.commands.values()].some(
          (row) =>
            row.action === "create_complaint_case" && row.case_no === values[1],
        )
      ) {
        const error = new Error(
          "Fixture: prepared create case number already reserved",
        );
        error.code = "23505";
        throw error;
      }
      if (!this.commands.has(values[0]))
        this.commands.set(values[0], {
          command_key: values[0],
          case_no: values[1],
          action: values[2],
          command_payload: JSON.parse(values[3]),
          case_snapshot: JSON.parse(values[4]),
          timeline_snapshot: JSON.parse(values[5]),
          previous_case_snapshot: values[6] ? JSON.parse(values[6]) : null,
          status: values[7],
        });
      return { rows: [clone(this.commands.get(values[0]))], rowCount: 1 };
    }
    if (sql.includes("DELETE FROM crm.phase1_complaint_pending_commits")) {
      this.commands.delete(values[0]);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM crm.phase1_complaint_pending_commits")) {
      if (this.identityReadFails)
        throw Error("Fixture: identity read rejected");
      let rows = [...this.commands.values()].map(clone);
      if (this.rowOrder === "reverse") rows.reverse();
      if (this.rowOrder === "rotate" && rows.length) rows.push(rows.shift());
      const gate = this.holdNextIdentityRead;
      this.holdNextIdentityRead = undefined;
      if (gate) {
        gate.reached();
        await gate.release;
      }
      return { rows };
    }
    if (sql.includes("WITH settlement_cases AS")) return { rows: [] };
    if (sql.includes("complaint_case_snapshot")) {
      if (this.readFails) throw Error("Fixture: canonical read rejected");
      const complaintCase = this.cases.get(values[0]);
      return {
        rows: [
          ...(complaintCase
            ? [{ kind: "case", record: clone(complaintCase) }]
            : []),
          ...[...this.timelines.values()]
            .filter((entry) => entry.caseNo === values[0])
            .map((entry) => ({ kind: "timeline", record: clone(entry) })),
        ],
      };
    }

    if (
      sql.includes("FROM crm.phase1_complaint_cases") &&
      sql.includes("WHERE case_no")
    ) {
      if (this.readFails) throw Error("Fixture: canonical read rejected");
      const row = this.cases.get(values[0]);
      return { rows: row ? [{ record: clone(row) }] : [] };
    }
    if (sql.includes("FROM crm.phase1_complaint_cases"))
      return {
        rows: [...this.cases.values()].map((row) => ({ record: clone(row) })),
      };
    if (sql.includes("FROM crm.phase1_complaint_timelines"))
      return {
        rows: [...this.timelines.values()]
          .filter((row) => !values[0] || row.caseNo === values[0])
          .map((row) => ({ record: clone(row) })),
      };
    throw Error(`Unexpected direct SQL: ${sql}`);
  }
}
function instance(wire) {
  const audit = new AuditNotificationService();
  const service = new ComplaintService(audit, new ComplaintRepository(wire));
  const calls = new CallcenterService(audit);
  const incidents = new IncidentService(audit);
  return {
    incidents,
    service,
    calls,
    phone: new CallcenterController(calls, service, undefined, undefined),
    ops: new ComplaintController(
      service,
      incidents,
      new IdempotencyService(new IdempotencyRepository()),
    ),
  };
}
function newCall(instance) {
  return instance.calls.openCallSession({
    callType: "inbound",
    callerPhone: "0912345678",
    agentIdentityAnnounced: false,
  });
}
const phonePayload = {
  category: "driver_service",
  severity: "normal",
  description: "One stable phone intent",
};
const opsPayload = { ...phonePayload, caseSource: "ops" };
async function outcome(operation) {
  try {
    return { ok: true, result: await operation() };
  } catch (error) {
    return {
      ok: false,
      name: error.name,
      code: error.code || null,
      message: error.message,
    };
  }
}
async function run() {
  const observations = {};
  {
    const wire = new Wire(),
      a = instance(wire),
      call = newCall(a);
    wire.registrationFails = true;
    const first = await outcome(() =>
      a.phone.transferCallToComplaint(call.callId, phonePayload, "request-A"),
    );
    observations.R1 = {
      first,
      businessCommits: wire.trace.filter((op) => op === "COMMIT").length,
      caseCount: wire.cases.size,
      trace: [...wire.trace],
    };
  }
  for (const commitMode of ["unknown-landed", "unknown-not-landed"]) {
    const wire = new Wire(),
      a = instance(wire),
      call = newCall(a);
    wire.nextCommit = commitMode;
    const first = await outcome(() =>
      a.phone.transferCallToComplaint(call.callId, phonePayload, "request-A"),
    );
    const original = clone([...wire.commands.values()][0]);
    const b = instance(wire);
    await b.service.onModuleInit();
    b.calls.callSessions = [clone(a.calls.getCallSession(call.callId))];
    if (commitMode === "unknown-not-landed") {
      wire.connectFails = true;
      observations.unknownThenFailed = await outcome(() =>
        b.phone.transferCallToComplaint(call.callId, phonePayload, "request-B"),
      );
      wire.connectFails = false;
    }
    const retry = await outcome(() =>
      b.phone.transferCallToComplaint(call.callId, phonePayload, "request-C"),
    );
    observations[commitMode] = {
      first,
      retry,
      originalCaseNo: original?.case_no,
      originalEntryIds: original?.timeline_snapshot.map(
        (entry) => entry.entryId,
      ),
      savedEntryIds: [...wire.timelines.keys()],
      caseNos: [...wire.cases.keys()],
      trace: wire.trace,
    };
  }
  {
    const wire = new Wire(),
      a = instance(wire);
    const created = a.service.createComplaintCase(opsPayload);
    await a.service.awaitSettlementPersistence(created.caseNo);
    const b = instance(wire);
    await b.service.onModuleInit();
    wire.nextCommit = "unknown-landed";
    await outcome(() =>
      a.service.assignComplaintCase(
        created.caseNo,
        { assigneeId: "ops-assignee-A" },
        undefined,
        { captureAudit: true },
      ),
    );
    await b.service.refreshSettlementCases();
    const afterRefresh = b.service.getComplaintCase(created.caseNo);
    const timelineAfterRefresh = b.service.getComplaintTimeline(created.caseNo);
    const note = await outcome(() =>
      b.service.addComplaintCaseNote(
        created.caseNo,
        { note: "A legitimate later note" },
        undefined,
        { captureAudit: true },
      ),
    );
    observations.R3 = {
      afterRefresh,
      timelineAfterRefresh,
      note,
      canonical: wire.cases.get(created.caseNo),
      savedTimeline: [...wire.timelines.values()],
    };
  }
  {
    const wire = new Wire(),
      a = instance(wire),
      response = { setHeader() {}, status() {} };
    wire.nextCommit = "unknown-landed";
    wire.readFails = true;
    const first = await outcome(() =>
      a.ops.createComplaintCase(opsPayload, response, "K1", "request-A"),
    );
    const firstCaseNo = [...wire.cases.keys()][0];
    const second = await outcome(() =>
      a.ops.createComplaintCase(opsPayload, response, "K2", "request-B"),
    );
    wire.readFails = false;
    const b = instance(wire);
    await b.service.onModuleInit();
    const replay = await outcome(() =>
      b.ops.createComplaintCase(opsPayload, response, "K1", "request-C"),
    );
    const conflict = await outcome(() =>
      b.ops.createComplaintCase(
        { ...opsPayload, description: "Different payload" },
        response,
        "K1",
        "request-D",
      ),
    );
    const replaySecond = await outcome(() =>
      b.ops.createComplaintCase(opsPayload, response, "K2", "request-E"),
    );
    const auditCountBeforeLocalReplay =
      b.service.auditNotificationService.getAuditLogsSnapshot().length;
    await b.ops.createComplaintCase(opsPayload, response, "K1", "request-F");
    const auditCountAfterLocalReplay =
      b.service.auditNotificationService.getAuditLogsSnapshot().length;
    observations.R5 = {
      first,
      second,
      replay,
      conflict,
      firstCaseNo,
      secondActionId: second.result?.meta.actionReceipt.actionId,
      replaySecondActionId: replaySecond.result?.meta.actionReceipt.actionId,
      auditCountBeforeLocalReplay,
      auditCountAfterLocalReplay,
      caseNos: [...wire.cases.keys()],
      entryIds: [...wire.timelines.keys()],
    };
  }
  {
    const wire = new Wire(),
      a = instance(wire),
      response = { setHeader() {}, status() {} };
    wire.identityReadFails = true;
    observations.identityReadFailure = {
      result: await outcome(() =>
        a.ops.createComplaintCase(opsPayload, response, "read-key", "request"),
      ),
      caseCount: wire.cases.size,
    };
  }
  {
    const wire = new Wire(),
      a = instance(wire),
      b = instance(wire);
    const identity = { scope: "crm:complaint:case_create", key: "race-key" };
    const attempts = await Promise.all([
      outcome(() =>
        a.service.createComplaintCase(opsPayload, "race-A", {
          captureAudit: true,
          commandIdentity: identity,
        }),
      ),
      outcome(() =>
        b.service.createComplaintCase(opsPayload, "race-B", {
          captureAudit: true,
          commandIdentity: identity,
        }),
      ),
    ]);
    const c = instance(wire);
    await c.service.onModuleInit();
    await c.service.refreshSettlementCases();
    const replay = await outcome(() =>
      c.service.createComplaintCase(opsPayload, "race-C", {
        captureAudit: true,
        commandIdentity: identity,
      }),
    );
    observations.sameKeyReservation = {
      attempts,
      replay,
      caseNos: [...wire.cases.keys()],
      commandCount: wire.commands.size,
      entryIds: [...wire.timelines.keys()],
    };
  }
  {
    const wire = new Wire(),
      a = instance(wire);
    const created = a.service.createComplaintCase(opsPayload);
    await a.service.awaitSettlementPersistence(created.caseNo);
    wire.nextCommit = "unknown-landed";
    const first = await outcome(() =>
      a.ops.addComplaintCaseNote(
        created.caseNo,
        { note: "Equal note" },
        "note-A",
        "N1",
      ),
    );
    const second = await outcome(() =>
      a.ops.addComplaintCaseNote(
        created.caseNo,
        { note: "Equal note" },
        "note-B",
        "N2",
      ),
    );
    const b = instance(wire);
    await b.service.onModuleInit();
    const replay = await outcome(() =>
      b.ops.addComplaintCaseNote(
        created.caseNo,
        { note: "Equal note" },
        "note-C",
        "N1",
      ),
    );
    const conflict = await outcome(() =>
      b.ops.addComplaintCaseNote(
        created.caseNo,
        { note: "Changed note" },
        "note-D",
        "N1",
      ),
    );
    observations.noteKeys = {
      first,
      second,
      replay,
      conflict,
      entries: [...wire.timelines.values()],
    };
  }
  for (const mode of ["unknown-landed", "unknown-not-landed"]) {
    const wire = new Wire(),
      a = instance(wire);
    const created = a.service.createComplaintCase({
      ...opsPayload,
      category: "safety_concern",
    });
    await a.service.awaitSettlementPersistence(created.caseNo);
    const command = {
      title: "One escalation",
      severity: "high",
      reason: "Original escalation reason",
    };
    wire.nextCommit = mode;
    const first = await outcome(() =>
      a.ops.escalateToIncident(created.caseNo, command, "escalate-A", "E1"),
    );
    const prepared = [...wire.commands.values()].find(
      (row) => row.action === "escalate_to_incident",
    );
    const b = instance(wire);
    await b.service.onModuleInit();
    const retry = await outcome(() =>
      b.ops.escalateToIncident(created.caseNo, command, "escalate-B", "E1"),
    );
    const replay = await outcome(() =>
      b.ops.escalateToIncident(created.caseNo, command, "escalate-C", "E1"),
    );
    const conflict = await outcome(() =>
      b.ops.escalateToIncident(
        created.caseNo,
        { ...command, title: "Changed title" },
        "escalate-D",
        "E1",
      ),
    );
    observations[`escalation-${mode}`] = {
      first,
      retry,
      replay,
      conflict,
      originalIncidentId: prepared?.case_snapshot.relatedIncidentId,
      originalEntryIds: prepared?.timeline_snapshot.map((row) => row.entryId),
      escalationEntries: [...wire.timelines.values()].filter(
        (row) => row.action === "escalated_to_incident",
      ),
      incidentIds: b.incidents.listIncidents().map((row) => row.incidentId),
    };
  }
  {
    const wire = new Wire(),
      a = instance(wire),
      b = instance(wire);
    const operations = [a, b].map((replica, index) =>
      outcome(() =>
        replica.service.createComplaintCase(opsPayload, `different-${index}`, {
          captureAudit: true,
          commandIdentity: {
            scope: "crm:complaint:case_create",
            key: `different-${index}`,
          },
        }),
      ),
    );
    const attempts = await Promise.all(operations);
    const loser = attempts.findIndex((result) => !result.ok);
    const c = instance(wire);
    await c.service.onModuleInit();
    await c.service.refreshSettlementCases();
    const retry = await outcome(() =>
      c.service.createComplaintCase(opsPayload, "different-retry", {
        captureAudit: true,
        commandIdentity: {
          scope: "crm:complaint:case_create",
          key: `different-${loser}`,
        },
      }),
    );
    observations.distinctKeyReservation = {
      attempts,
      retry,
      caseNos: [...wire.cases.keys()],
      entryIds: [...wire.timelines.keys()],
    };
  }
  {
    const wire = new Wire(),
      a = instance(wire);
    const created = a.service.createComplaintCase(opsPayload);
    await a.service.awaitSettlementPersistence(created.caseNo);
    wire.nextCommit = "unknown-not-landed";
    await outcome(() =>
      a.ops.assignComplaintCase(
        created.caseNo,
        { assigneeId: "unconfirmed-assignee" },
        "assign-A",
        "A1",
      ),
    );
    wire.readFails = true;
    const unavailable = {
      case: await outcome(() => a.ops.getComplaintCase(created.caseNo)),
      list: await outcome(() => a.ops.listComplaintCases()),
      timeline: await outcome(() => a.ops.getComplaintTimeline(created.caseNo)),
      export: await outcome(() =>
        a.ops.getComplaintExportView(created.caseNo, "export", "true"),
      ),
      unrelatedMutation: await outcome(() =>
        a.ops.addComplaintCaseNote(
          created.caseNo,
          { note: "Cannot reuse unavailable cache" },
          "note",
          "different-note",
        ),
      ),
    };
    wire.readFails = false;
    const readback = await outcome(() =>
      a.ops.getComplaintCase(created.caseNo),
    );
    const retry = await outcome(() =>
      a.ops.assignComplaintCase(
        created.caseNo,
        { assigneeId: "unconfirmed-assignee" },
        "assign-B",
        "A1",
      ),
    );
    observations.readbackFailure = {
      unavailable,
      readback,
      retry,
      canonical: wire.cases.get(created.caseNo),
    };
  }
  {
    const wire = new Wire(),
      a = instance(wire);
    wire.nextCommit = "unknown-landed";
    await outcome(() =>
      a.service.createComplaintCase(opsPayload, "create-A", {
        captureAudit: true,
        commandIdentity: {
          scope: "crm:complaint:case_create",
          key: "locked-create",
        },
      }),
    );
    const original = clone([...wire.commands.values()][0]);
    const b = instance(wire);
    await b.service.onModuleInit();
    await b.service.refreshSettlementCases();
    await b.service.assignComplaintCase(
      original.case_no,
      { assigneeId: "later-assignee" },
      "assign-B",
      { captureAudit: true },
    );
    const writesBefore = wire.trace.filter(
      (step) => step === "case-write",
    ).length;
    await new ComplaintRepository(wire).persistChanges({
      complaintCases: [original.case_snapshot],
      complaintTimelines: original.timeline_snapshot,
      commandKeys: [original.command_key],
    });
    observations.confirmedTransactionReplay = {
      canonical: wire.cases.get(original.case_no),
      caseWrites:
        wire.trace.filter((step) => step === "case-write").length -
        writesBefore,
      trace: wire.trace,
    };
  }
  return {
    source: reference || "working-tree",
    observations,
    forbiddenNetworkOrListenAttempts,
    scope:
      "Actual production methods with scripted external database wire rows only; no real PG, HTTP, browser, listener or hosted acceptance.",
  };
}
export {
  Wire,
  instance,
  opsPayload,
  outcome,
  forbiddenNetworkOrListenAttempts,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
    .then((result) => process.stdout.write(JSON.stringify(result) + "\n"))
    .catch((error) => {
      console.error(error.stack);
      process.exitCode = 1;
    });
}
