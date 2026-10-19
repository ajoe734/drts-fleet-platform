import {
  Wire,
  instance,
  opsPayload,
  outcome,
  forbiddenNetworkOrListenAttempts,
} from "./complaint-command-wire-probe.mjs";

const response = { setHeader() {}, status() {} };
const copy = (value) => JSON.parse(JSON.stringify(value));
const assign = (replica, caseNo, who, key) =>
  replica.ops.assignComplaintCase(
    caseNo,
    { assigneeId: who },
    `request-${who}`,
    key,
  );
async function fresh(wire) {
  const replica = instance(wire);
  await replica.service.onModuleInit();
  return replica;
}
async function create(wire) {
  const replica = await fresh(wire);
  const result = await replica.ops.createComplaintCase(
    opsPayload,
    response,
    "original-create",
    "request-create",
  );
  return { replica, caseNo: result.data.caseNo };
}
function holdIdentityRead(wire) {
  let reached, release;
  const read = new Promise((resolve) => (reached = resolve));
  const gate = new Promise((resolve) => (release = resolve));
  wire.holdNextIdentityRead = { reached, release: gate };
  return { read, release };
}

async function hiddenPending(order, keyed) {
  const wire = new Wire();
  const { replica: a, caseNo } = await create(wire);
  wire.rowOrder = order;
  wire.nextCommit = "unknown-not-landed";
  const key = keyed ? "original-A" : undefined;
  const first = await outcome(() => assign(a, caseNo, "A", key));
  const original = copy(
    [...wire.commands.values()].find(
      (row) => row.action === "assign_complaint_case",
    ),
  );
  const b = await fresh(wire);
  const unrelated = await outcome(() => assign(b, caseNo, "B", "later-B"));
  const c = await fresh(wire);
  const retry = await outcome(() => assign(c, caseNo, "A", key));
  const d = await fresh(wire);
  const afterConfirmation = await outcome(() =>
    assign(d, caseNo, "B", "later-B"),
  );
  const e = await fresh(wire);
  const replay = keyed
    ? await outcome(() => assign(e, caseNo, "A", key))
    : undefined;
  const readback = await outcome(() => e.ops.getComplaintCase(caseNo));
  return {
    first,
    unrelated,
    retry,
    afterConfirmation,
    replay,
    readback,
    original,
    finalCase: wire.cases.get(caseNo),
    entries: [...wire.timelines.values()],
  };
}

// The held identity query returns its actual earlier SQL observation. Both
// requests use real controllers; only external response timing/COMMIT ACKs
// are controlled. No service or durable case/command Map is edited here.
async function overlappingPrepared(wire, secondCommit) {
  const { replica: a, caseNo } = await create(wire);
  const b = await fresh(wire);
  const gate = holdIdentityRead(wire);
  const second = outcome(() => assign(b, caseNo, "B", "prepared-B"));
  await gate.read;
  wire.nextCommit = "unknown-not-landed";
  const first = await outcome(() => assign(a, caseNo, "A", "prepared-A"));
  wire.nextCommit = secondCommit;
  gate.release();
  return { a, caseNo, first, second: await second };
}

async function multiplePending(order) {
  const wire = new Wire();
  const { caseNo, first, second } = await overlappingPrepared(
    wire,
    "unknown-not-landed",
  );
  const pendingBefore = [...wire.commands.values()].filter(
    (row) => row.status === "pending",
  ).length;
  wire.rowOrder = order;
  const recovery = await fresh(wire);
  const retryA = await outcome(() =>
    assign(recovery, caseNo, "A", "prepared-A"),
  );
  const warmUnrelated = await outcome(() =>
    assign(recovery, caseNo, "C", "later-C"),
  );
  const newcomer = await fresh(wire);
  const freshUnrelated = await outcome(() =>
    assign(newcomer, caseNo, "D", "later-D"),
  );
  const writesBefore = wire.trace.filter(
    (step) => step === "case-write",
  ).length;
  const staleRetryB = await outcome(() =>
    assign(newcomer, caseNo, "B", "prepared-B"),
  );
  const staleRetryWrites =
    wire.trace.filter((step) => step === "case-write").length - writesBefore;
  const other = await newcomer.ops.createComplaintCase(
    { ...opsPayload, description: "An independent case remains available" },
    response,
    "independent-create",
    "independent-request",
  );
  const otherAssignment = await outcome(() =>
    assign(newcomer, other.data.caseNo, "independent", "independent-assign"),
  );
  return {
    first,
    second,
    pendingBefore,
    retryA,
    warmUnrelated,
    freshUnrelated,
    staleRetryB,
    staleRetryWrites,
    otherAssignment,
    finalCase: wire.cases.get(caseNo),
    unresolved: [...wire.commands.values()].filter(
      (row) => row.case_no === caseNo && row.status === "pending",
    ),
  };
}

async function acknowledgedSuccessor(warm) {
  const wire = new Wire();
  const { a, caseNo, first, second } = await overlappingPrepared(wire, "ok");
  const replica = warm ? a : await fresh(wire);
  const writesBefore = wire.trace.filter(
    (step) => step === "case-write",
  ).length;
  const retry = await outcome(() => assign(replica, caseNo, "A", "prepared-A"));
  const readback = await outcome(() => replica.ops.getComplaintCase(caseNo));
  return {
    first,
    second,
    retry,
    readback,
    writes:
      wire.trace.filter((step) => step === "case-write").length - writesBefore,
    auditCount: replica.service.auditNotificationService
      .getAuditLogsSnapshot()
      .filter((audit) => audit.actionName === "assign_complaint_case").length,
    finalCase: wire.cases.get(caseNo),
    entries: [...wire.timelines.values()],
    unresolved: [...wire.commands.values()].filter(
      (row) => row.status === "pending",
    ),
  };
}

async function legacySla() {
  const wire = new Wire();
  const { replica, caseNo } = await create(wire);
  wire.nextCommit = "unknown-not-landed";
  const first = await outcome(() =>
    replica.ops.markComplaintSlaBreach(caseNo, "sla-first"),
  );
  const original = copy(
    [...wire.commands.values()].find(
      (row) => row.action === "mark_complaint_sla_breach",
    ),
  );
  const recovery = await fresh(wire);
  const retry = await outcome(() =>
    recovery.ops.markComplaintSlaBreach(caseNo, "sla-retry"),
  );
  const note = await outcome(() =>
    recovery.ops.addComplaintCaseNote(
      caseNo,
      { note: "After confirmed SLA recovery" },
      "sla-note",
      "sla-note",
    ),
  );
  return {
    first,
    retry,
    note,
    original,
    entries: [...wire.timelines.values()].filter(
      (row) => row.action === "sla_breached",
    ),
    unresolved: [...wire.commands.values()].filter(
      (row) => row.status === "pending",
    ),
  };
}

async function canonicalLifecycle() {
  const wire = new Wire();
  const { replica, caseNo } = await create(wire);
  await assign(replica, caseNo, "lifecycle-owner", "lifecycle-assign");
  await replica.ops.addComplaintCaseNote(
    caseNo,
    { note: "Canonical note" },
    "lifecycle-note",
  );
  const resolution = {
    resolutionCode:
      replica.service.getValidResolutionCodes("driver_service")[0],
    closingNote: "Original valid resolution",
  };
  await replica.ops.resolveComplaintCase(
    caseNo,
    resolution,
    "lifecycle-resolve",
    "lifecycle-resolve",
  );
  const resolvedReopen = await outcome(() =>
    replica.ops.reopenComplaintCase(
      caseNo,
      { reason: "Still resolved" },
      "resolved-reopen",
    ),
  );
  await replica.ops.closeComplaintCase(
    caseNo,
    resolution,
    "lifecycle-close",
    "lifecycle-close",
  );
  const closedResolve = await outcome(() =>
    replica.ops.resolveComplaintCase(caseNo, resolution, "closed-resolve"),
  );
  await replica.ops.reopenComplaintCase(
    caseNo,
    { reason: "Original formal reopen reason" },
    "lifecycle-reopen",
    "lifecycle-reopen",
  );
  const reader = await fresh(wire);
  const readback = await reader.ops.getComplaintCase(caseNo);
  const timeline = await reader.ops.getComplaintTimeline(caseNo);
  return {
    caseNo,
    resolvedReopen,
    closedResolve,
    readback,
    entries: timeline.data.items,
  };
}

async function definitePredecessorFailure() {
  const wire = new Wire();
  const a = instance(wire);
  const created = a.service.createComplaintCase(opsPayload);
  await a.service.awaitSettlementPersistence(created.caseNo);
  const b = await fresh(wire);
  await assign(a, created.caseNo, "legacy-owner", undefined);
  const command = { note: "A legitimate note after canonical refresh" };
  const first = await outcome(() =>
    b.ops.addComplaintCaseNote(
      created.caseNo,
      command,
      "stale-note",
      "stable-note",
    ),
  );
  const retry = await outcome(() =>
    b.ops.addComplaintCaseNote(
      created.caseNo,
      command,
      "fresh-note",
      "stable-note",
    ),
  );
  return {
    first,
    retry,
    finalCase: wire.cases.get(created.caseNo),
    entries: [...wire.timelines.values()],
    unresolved: [...wire.commands.values()].filter(
      (row) => row.status === "pending",
    ),
  };
}

async function run() {
  const hidden = {};
  const multiple = {};
  for (const order of ["forward", "reverse", "rotate"]) {
    for (const keyed of [true, false]) {
      hidden[`${order}-${keyed ? "keyed" : "legacy"}`] = await hiddenPending(
        order,
        keyed,
      );
    }
    multiple[order] = await multiplePending(order);
  }
  return {
    source: process.env.COMPLAINT_SOURCE_REF || "working-tree",
    hidden,
    multiple,
    successor: {
      fresh: await acknowledgedSuccessor(false),
      warm: await acknowledgedSuccessor(true),
    },
    legacySla: await legacySla(),
    lifecycle: await canonicalLifecycle(),
    definitePredecessorFailure: await definitePredecessorFailure(),
    forbiddenNetworkOrListenAttempts,
    scope:
      "Actual controllers/services/repository and SQL; external SQL rows/response timing only. No real PG/isolation/HTTP/browser acceptance.",
  };
}
run()
  .then((result) => process.stdout.write(JSON.stringify(result) + "\n"))
  .catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  });
