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

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}
function domainNote(replica, caseNo, note, key) {
  return replica.service.addComplaintCaseNote(caseNo, { note }, key, {
    captureAudit: true,
    commandIdentity: {
      scope: `crm:complaint:${caseNo}:addComplaintCaseNote`,
      key,
    },
  });
}

// A real SELECT captures the doomed new preparation before DELETE, but its
// response arrives after DELETE ACK. Both warm and other-replica caches must
// converge on the later successful durable identity observation.
async function delayedDeletedIdentity(otherReplica) {
  const wire = new Wire();
  const a = instance(wire);
  const created = a.service.createComplaintCase(opsPayload);
  const caseNo = created.caseNo;
  await a.service.awaitSettlementPersistence(caseNo);
  const b = await fresh(wire);
  const reader = otherReplica ? await fresh(wire) : b;
  await assign(a, caseNo, "delayed-owner", undefined);
  const originalQuery = wire.query.bind(wire);
  const captured = deferred(),
    release = deferred();
  let armDelete = true,
    holdRead = false,
    background;
  wire.query = async (sql, values = []) => {
    if (
      armDelete &&
      (sql.includes("DELETE FROM crm.phase1_complaint_pending_commits") ||
        (sql.includes("UPDATE crm.phase1_complaint_pending_commits") &&
          sql.includes("status = 'failed'")))
    ) {
      armDelete = false;
      holdRead = true;
      background = outcome(() => reader.ops.getComplaintCase(caseNo));
      await captured.promise;
      return originalQuery(sql, values);
    }
    if (
      holdRead &&
      sql.includes("FROM crm.phase1_complaint_pending_commits") &&
      !sql.includes("FOR UPDATE")
    ) {
      holdRead = false;
      const result = await originalQuery(sql, values);
      captured.resolve();
      await release.promise;
      return result;
    }
    return originalQuery(sql, values);
  };
  const command = { note: "Note after delayed deleted identity" };
  const first = await outcome(() =>
    b.ops.addComplaintCaseNote(
      caseNo,
      command,
      "first-delayed",
      "delayed-note",
    ),
  );
  const rowsAfterCleanup = copy([...wire.commands.values()]);
  release.resolve();
  const delayedRead = await background;
  const retry = await outcome(() =>
    reader.ops.addComplaintCaseNote(
      caseNo,
      command,
      "retry-delayed",
      "delayed-note",
    ),
  );
  return {
    first,
    rowsAfterCleanup,
    delayedRead,
    retry,
    finalCase: wire.cases.get(caseNo),
    entries: [...wire.timelines.values()],
    unresolved: [...wire.commands.values()].filter(
      (row) => row.status === "pending",
    ),
  };
}

// A public domain command begins while an actual controller's identity SELECT
// is in flight. Its PREPARED / ambiguous result must survive that older reply.
async function localCommandDuringRead(holdCommit) {
  const wire = new Wire();
  const { replica, caseNo } = await create(wire);
  const gate = holdIdentityRead(wire);
  const read = outcome(() => replica.ops.getComplaintCase(caseNo));
  await gate.read;
  const committed = deferred(),
    release = deferred();
  if (holdCommit) {
    const connect = wire.connect.bind(wire);
    wire.connect = async () => {
      const client = await connect();
      const query = client.query.bind(client);
      client.query = async (sql, values = []) => {
        if (sql === "COMMIT") {
          committed.resolve();
          await release.promise;
        }
        return query(sql, values);
      };
      return client;
    };
  }
  wire.nextCommit = "unknown-not-landed";
  const firstPromise = outcome(() =>
    replica.service.assignComplaintCase(
      caseNo,
      { assigneeId: "local-A" },
      "local-A",
      {
        captureAudit: true,
        commandIdentity: {
          scope: `crm:complaint:${caseNo}:assignComplaintCase`,
          key: "local-during-read",
        },
      },
    ),
  );
  if (holdCommit) await committed.promise;
  else await firstPromise;
  const original = copy(
    [...wire.commands.values()].find(
      (row) => row.action === "assign_complaint_case",
    ),
  );
  gate.release();
  await read;
  release.resolve();
  const first = await firstPromise;
  const unrelated = await outcome(() =>
    assign(replica, caseNo, "unrelated-B", "unrelated-during-read"),
  );
  const retry = await outcome(() =>
    assign(replica, caseNo, "local-A", "local-during-read"),
  );
  return {
    first,
    unrelated,
    retry,
    original,
    finalCase: wire.cases.get(caseNo),
    entries: [...wire.timelines.values()],
  };
}

// B never reaches its own PREPARED: Promise.all(previous) propagates A's typed
// rejection. A third replica has meanwhile actually reserved B's same key.
// Cleanup may delete A only, never B's independently allocated identity.
async function queuedTypedRejection(kind = "typed") {
  const wire = new Wire();
  const a = instance(wire);
  const created = a.service.createComplaintCase(opsPayload);
  const caseNo = created.caseNo;
  await a.service.awaitSettlementPersistence(caseNo);
  const b = await fresh(wire);
  await assign(a, caseNo, "queue-owner", undefined);
  const c = await fresh(wire);
  const locked = deferred(),
    release = deferred();
  const connect = wire.connect.bind(wire);
  let armLock = true;
  wire.connect = async () => {
    const client = await connect();
    const query = client.query.bind(client);
    client.query = async (sql, values = []) => {
      if (armLock && sql.includes("AS matches_prepared")) {
        armLock = false;
        locked.resolve();
        await release.promise;
        if (kind === "generic")
          throw Error(
            "Fixture: predecessor query failed before business writes",
          );
      }
      return query(sql, values);
    };
    return client;
  };
  const firstPromise = outcome(() =>
    domainNote(b, caseNo, "stale-first", "queue-first"),
  );
  await locked.promise;
  const queuedPromise = outcome(() =>
    domainNote(b, caseNo, "reserved elsewhere", "queue-second"),
  );
  wire.nextCommit = "unknown-not-landed";
  const foreign = await outcome(() =>
    domainNote(c, caseNo, "reserved elsewhere", "queue-second"),
  );
  const original = copy(
    [...wire.commands.values()].find(
      (row) =>
        row.command_payload?.complaintCommandIdentity?.key === "queue-second",
    ),
  );
  release.resolve();
  const first = await firstPromise;
  const queued = await queuedPromise;
  const remaining = copy(
    [...wire.commands.values()].filter((row) => row.status === "pending"),
  );
  const reader = await fresh(wire);
  const retry = await outcome(() =>
    reader.ops.addComplaintCaseNote(
      caseNo,
      { note: "reserved elsewhere" },
      "queue-retry",
      "queue-second",
    ),
  );
  return {
    first,
    queued,
    foreign,
    original,
    remaining,
    retry,
    finalCase: wire.cases.get(caseNo),
    entries: [...wire.timelines.values()],
  };
}

// DELETE can reject before execution or lose only its ACK. Once storage
// recovers, the same proven-new failed command must refresh and retry. A
// replacement reserved elsewhere after a lost ACK must keep its own IDs.
async function definiteCleanupFailure(mode) {
  const wire = new Wire();
  const a = instance(wire);
  const created = a.service.createComplaintCase(opsPayload);
  const caseNo = created.caseNo;
  await a.service.awaitSettlementPersistence(caseNo);
  const b = await fresh(wire);
  await assign(a, caseNo, "cleanup-owner", undefined);
  const query = wire.query.bind(wire);
  let armed = true;
  wire.query = async (sql, values = []) => {
    if (
      armed &&
      sql.includes("DELETE FROM crm.phase1_complaint_pending_commits")
    ) {
      armed = false;
      if (mode !== "before" && mode !== "fresh-before")
        await query(sql, values);
      throw Error("Fixture: definite cleanup DELETE response unavailable");
    }
    return query(sql, values);
  };
  const command = { note: "Recover after cleanup failure" };
  const first = await outcome(() =>
    b.ops.addComplaintCaseNote(
      caseNo,
      command,
      "cleanup-first",
      "cleanup-note",
    ),
  );
  const remainingAfterFailure = copy([...wire.commands.values()]);
  let replacement, original;
  if (mode === "replacement") {
    const c = await fresh(wire);
    wire.nextCommit = "unknown-not-landed";
    replacement = await outcome(() =>
      c.ops.addComplaintCaseNote(
        caseNo,
        command,
        "cleanup-replacement",
        "cleanup-note",
      ),
    );
    original = copy(
      [...wire.commands.values()].find(
        (row) =>
          row.command_payload?.complaintCommandIdentity?.key === "cleanup-note",
      ),
    );
  }
  const retryReplica = mode === "fresh-before" ? await fresh(wire) : b;
  const retry = await outcome(() =>
    retryReplica.ops.addComplaintCaseNote(
      caseNo,
      command,
      "cleanup-retry",
      "cleanup-note",
    ),
  );
  return {
    first,
    remainingAfterFailure,
    replacement,
    original,
    retry,
    finalCase: wire.cases.get(caseNo),
    entries: [...wire.timelines.values()],
    unresolved: [...wire.commands.values()].filter(
      (row) => row.status === "pending",
    ),
  };
}

// A duplicate already waiting at the transaction boundary must not treat a
// later allocation under the same key as its own pending/confirmed result.
async function replacedInFlight(landed) {
  const wire = new Wire();
  const a = instance(wire);
  const created = a.service.createComplaintCase(opsPayload);
  const caseNo = created.caseNo;
  await a.service.awaitSettlementPersistence(caseNo);
  const b = await fresh(wire);
  await assign(a, caseNo, "replacement-owner", undefined);
  const firstReached = deferred(),
    releaseFirst = deferred();
  const oldReached = deferred(),
    releaseOld = deferred();
  const connect = wire.connect.bind(wire);
  let connection = 0;
  wire.connect = async () => {
    const client = await connect();
    const number = ++connection,
      query = client.query.bind(client);
    client.query = async (sql, values = []) => {
      if (number === 1 && sql.includes("AS matches_prepared")) {
        firstReached.resolve();
        await releaseFirst.promise;
      }
      if (
        number === 2 &&
        sql.includes("FROM crm.phase1_complaint_pending_commits") &&
        sql.includes("FOR UPDATE")
      ) {
        oldReached.resolve();
        await releaseOld.promise;
      }
      return query(sql, values);
    };
    return client;
  };
  const query = wire.query.bind(wire);
  let failDelete = true;
  wire.query = async (sql, values = []) => {
    if (
      failDelete &&
      sql.includes("DELETE FROM crm.phase1_complaint_pending_commits")
    ) {
      failDelete = false;
      throw Error("Fixture: DELETE pre-execution failure");
    }
    return query(sql, values);
  };
  const command = { note: "Replacement identity note" };
  const firstPromise = outcome(() =>
    b.ops.addComplaintCaseNote(
      caseNo,
      command,
      "replacement-first",
      "replace-inflight",
    ),
  );
  await firstReached.promise;
  const original = copy([...wire.commands.values()][0]);
  const old = await fresh(wire);
  const oldPromise = outcome(() =>
    old.ops.addComplaintCaseNote(
      caseNo,
      command,
      "replacement-old",
      "replace-inflight",
    ),
  );
  await oldReached.promise;
  releaseFirst.resolve();
  const first = await firstPromise;
  const current = await fresh(wire);
  wire.nextCommit = landed ? "ok" : "unknown-not-landed";
  const replacement = await outcome(() =>
    current.ops.addComplaintCaseNote(
      caseNo,
      command,
      "replacement-current",
      "replace-inflight",
    ),
  );
  const winner = copy(
    [...wire.commands.values()].find(
      (row) =>
        row.command_payload?.complaintCommandIdentity?.key ===
        "replace-inflight",
    ),
  );
  const writesBefore = wire.trace.filter(
    (item) => item === "case-write",
  ).length;
  releaseOld.resolve();
  const oldRetry = await oldPromise;
  const oldWrites =
    wire.trace.filter((item) => item === "case-write").length - writesBefore;
  const finalRetry = await outcome(() =>
    current.ops.addComplaintCaseNote(
      caseNo,
      command,
      "replacement-final",
      "replace-inflight",
    ),
  );
  return {
    first,
    original,
    replacement,
    winner,
    oldRetry,
    oldWrites,
    oldAudits: old.service.auditNotificationService
      .getAuditLogsSnapshot()
      .filter((entry) => entry.actionName === "add_complaint_case_note").length,
    finalRetry,
    finalCase: wire.cases.get(caseNo),
    entries: [...wire.timelines.values()],
  };
}

// If the definite-failure classification itself never reached storage and
// that process disappears, another process cannot invent a release proof.
// Keep the honest 409/original identity; the surviving original process can
// finish the exact classification/cleanup once storage is available again.
async function classificationFailure() {
  const wire = new Wire();
  const a = instance(wire);
  const created = a.service.createComplaintCase(opsPayload);
  const caseNo = created.caseNo;
  await a.service.awaitSettlementPersistence(caseNo);
  const b = await fresh(wire);
  await assign(a, caseNo, "classification-owner", undefined);
  const query = wire.query.bind(wire);
  let fail = true;
  wire.query = async (sql, values = []) => {
    if (
      fail &&
      sql.includes("UPDATE crm.phase1_complaint_pending_commits") &&
      sql.includes("status = 'failed'")
    ) {
      fail = false;
      throw Error("Fixture: classification did not reach storage");
    }
    return query(sql, values);
  };
  const command = { note: "Note whose classification failed" };
  const first = await outcome(() =>
    b.ops.addComplaintCaseNote(
      caseNo,
      command,
      "classification-first",
      "classify-failure",
    ),
  );
  const original = copy([...wire.commands.values()]);
  const c = await fresh(wire);
  const withoutProof = await outcome(() =>
    c.ops.addComplaintCaseNote(
      caseNo,
      command,
      "classification-fresh",
      "classify-failure",
    ),
  );
  const retained = copy([...wire.commands.values()]);
  await b.ops.getComplaintCase(caseNo);
  const recovered = await outcome(() =>
    c.ops.addComplaintCaseNote(
      caseNo,
      command,
      "classification-recovered",
      "classify-failure",
    ),
  );
  return {
    first,
    original,
    withoutProof,
    retained,
    recovered,
    finalCase: wire.cases.get(caseNo),
    entries: [...wire.timelines.values()],
  };
}

// Two legitimate legacy cleanups of confirmed T1 straddle a new same-key
// T2 reservation. Only external DELETE delivery is delayed; D2 must leave T2.
async function delayedLegacyCleanup() {
  const wire = new Wire();
  const a = instance(wire);
  const created = a.service.createComplaintCase(opsPayload);
  const caseNo = created.caseNo;
  await a.service.awaitSettlementPersistence(caseNo);
  const b = await fresh(wire);
  const query = wire.query.bind(wire);
  const reached = [deferred(), deferred()],
    release = [deferred(), deferred()],
    done = [deferred(), deferred()];
  let deletes = 0;
  wire.query = async (sql, values = []) => {
    if (
      sql.includes("DELETE FROM crm.phase1_complaint_pending_commits") &&
      deletes < 2
    ) {
      const index = deletes++;
      reached[index].resolve();
      await release[index].promise;
      const result = await query(sql, values);
      done[index].resolve();
      return result;
    }
    return query(sql, values);
  };
  const command = { note: "Repeated legitimate legacy note" };
  const first = await outcome(() =>
    a.ops.addComplaintCaseNote(caseNo, command, "legacy-first"),
  );
  await reached[0].promise;
  const read = outcome(() => b.ops.getComplaintCase(caseNo));
  await reached[1].promise;
  const confirmedRead = await read;
  release[0].resolve();
  await done[0].promise;
  const c = await fresh(wire);
  wire.nextCommit = "unknown-not-landed";
  const second = await outcome(() =>
    c.ops.addComplaintCaseNote(caseNo, command, "legacy-second"),
  );
  const original = copy(
    [...wire.commands.values()].find(
      (row) => row.action === "add_complaint_case_note",
    ),
  );
  release[1].resolve();
  await done[1].promise;
  const retained = copy(
    [...wire.commands.values()].filter((row) => row.status === "pending"),
  );
  const d = await fresh(wire);
  const retry = await outcome(() =>
    d.ops.addComplaintCaseNote(caseNo, command, "legacy-second-retry"),
  );
  return {
    first,
    confirmedRead,
    second,
    original,
    retained,
    retry,
    entries: [...wire.timelines.values()],
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
    delayedDeletedIdentity: {
      same: await delayedDeletedIdentity(false),
      other: await delayedDeletedIdentity(true),
    },
    localDuringRead: {
      unknown: await localCommandDuringRead(false),
      inflight: await localCommandDuringRead(true),
    },
    queuedTypedRejection: await queuedTypedRejection(),
    queuedDefiniteFailure: await queuedTypedRejection("generic"),
    cleanupFailure: {
      before: await definiteCleanupFailure("before"),
      "fresh-before": await definiteCleanupFailure("fresh-before"),
      ack: await definiteCleanupFailure("ack"),
      replacement: await definiteCleanupFailure("replacement"),
    },
    replacedInFlight: {
      pending: await replacedInFlight(false),
      confirmed: await replacedInFlight(true),
    },
    classificationFailure: await classificationFailure(),
    delayedLegacyCleanup: await delayedLegacyCleanup(),
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
