import { expect, it } from "vitest";
import type { ReconciliationIssueRecord } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";

// Only the actual DatabaseService socket boundary is controlled. Production
// repository SQL/JSON serialization, mutators/queue/clone, Controller/list and
// actual Forwarder ingest/report/list/derived synchronization are not mocked.
class SqlBoundary {
  rows = new Map<string, ReconciliationIssueRecord>();
  writes: Array<{ sql: string; parameters: unknown[] }> = [];
  next:
    | {
        id: string | null;
        entered: () => void;
        gate: Promise<void>;
        reject: boolean;
      }
    | undefined;
  isEnabled() {
    return true;
  }
  hold(id: string | null, reject = false) {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const started = new Promise<void>((done) => {
      entered = done;
    });
    this.next = { id, entered, gate, reject };
    return { release, started };
  }
  async query(sql: string, parameters: unknown[] = []) {
    if (sql.includes("INSERT INTO billing.phase1_reconciliation_issues")) {
      this.writes.push({ sql, parameters: structuredClone(parameters) });
      const issue = JSON.parse(
        parameters[7] as string,
      ) as ReconciliationIssueRecord;
      if (
        this.next &&
        (this.next.id === null || this.next.id === issue.issueId)
      ) {
        const hold = this.next;
        this.next = undefined;
        hold.entered();
        await hold.gate;
        if (hold.reject) throw new Error("controlled actual SQL rejection");
      }
      this.rows.set(issue.issueId, structuredClone(issue));
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM billing.phase1_reconciliation_issues"))
      return {
        rows: [...this.rows.values()].map((record) => ({
          record: structuredClone(record),
        })),
      };
    return { rows: [] };
  }
}
const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "platform_admin",
  actorId: "fin-probe",
  realm: "platform",
  tenantId: null,
  partnerId: null,
  roles: ["platform_admin"],
  roleFamilies: ["platform"],
  scopes: ["billing:read", "billing:write"],
  requestId: null,
};
function fixture(withForwarder = false) {
  const sql = new SqlBoundary();
  const audit = new AuditNotificationService();
  const repo = new BillingSettlementRepository(sql as never);
  const forwarder = new ForwarderService(undefined as never, audit);
  const service = new BillingSettlementService(
    audit,
    repo,
    withForwarder ? forwarder : undefined,
  );
  const controller = new BillingSettlementController(service);
  const read = (id: string) =>
    controller
      .listReconciliationIssues(undefined, undefined, undefined, identity)
      .data.items.find((issue) => issue.issueId === id);
  return { sql, audit, repo, forwarder, service, controller, read };
}
const command = {
  issueType: "partner_sponsor_mismatch" as const,
  summary: "original canonical issue probe",
  openedBy: "fin-probe",
  tenantId: "tenant-probe",
  partnerId: "partner-probe",
  orderId: "order-probe",
  sponsorReference: "sponsor-probe",
  artifactIds: ["artifact-original"],
};
function update(f: ReturnType<typeof fixture>, kind: string, id: string) {
  if (kind === "assign")
    return f.controller.assignReconciliationIssue(
      id,
      {
        actorId: "fin-probe",
        assigneeId: "ack-assignee",
        note: "ack-assign-note",
      },
      identity,
    );
  if (kind === "comment")
    return f.controller.addReconciliationIssueComment(
      id,
      {
        actorId: "fin-probe",
        message: "ack-comment",
        artifactIds: ["artifact-ack"],
      },
      identity,
    );
  if (kind === "resolve")
    return f.controller.resolveReconciliationIssue(
      id,
      {
        actorId: "fin-probe",
        resolutionCode: "no_action_required",
        resolutionSummary: "ack-resolution",
        artifactIds: ["artifact-ack"],
      },
      identity,
    );
  return f.controller.reopenReconciliationIssue(
    id,
    {
      actorId: "fin-probe",
      reason: "ack-reopen",
      artifactIds: ["artifact-ack"],
    },
    identity,
  );
}
async function seed(f: ReturnType<typeof fixture>, kind: string) {
  const created = (
    await f.controller.createReconciliationIssue({ ...command }, identity)
  ).data;
  if (kind === "reopen")
    await f.controller.resolveReconciliationIssue(
      created.issueId,
      {
        actorId: "fin-probe",
        resolutionCode: "no_action_required",
        resolutionSummary: "original closed issue",
      },
      identity,
    );
  return created.issueId;
}
it.each(["create", "assign", "comment", "resolve", "reopen"])(
  "real repository %s pending/rejection leaves full old row/list/audit; healthy retry and fresh supported reload agree",
  async (kind) => {
    const f = fixture();
    const id = kind === "create" ? null : await seed(f, kind);
    const old = id
      ? structuredClone(f.read(id))
      : f.service.listReconciliationIssues();
    const durableOld = id
      ? structuredClone(f.sql.rows.get(id))
      : [...f.sql.rows.values()];
    const auditOld = f.audit.getAuditLogsSnapshot().length;
    const hold = f.sql.hold(id, true);
    const work =
      kind === "create"
        ? f.controller.createReconciliationIssue({ ...command }, identity)
        : update(f, kind, id!);
    const caught = work.then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error: error.message }),
    );
    await hold.started;
    expect(id ? f.read(id) : f.service.listReconciliationIssues()).toEqual(old);
    expect(id ? f.sql.rows.get(id) : [...f.sql.rows.values()]).toEqual(
      durableOld,
    );
    expect(f.audit.getAuditLogsSnapshot()).toHaveLength(auditOld);
    hold.release();
    const rejected = await caught;
    expect(rejected.error).toBe("controlled actual SQL rejection");
    expect(id ? f.read(id) : f.service.listReconciliationIssues()).toEqual(old);
    expect(id ? f.sql.rows.get(id) : [...f.sql.rows.values()]).toEqual(
      durableOld,
    );
    expect(f.audit.getAuditLogsSnapshot()).toHaveLength(auditOld);
    const accepted = (
      await (kind === "create"
        ? f.controller.createReconciliationIssue({ ...command }, identity)
        : update(f, kind, id!))
    ).data;
    expect(f.read(accepted.issueId)).toEqual(accepted);
    expect(f.sql.rows.get(accepted.issueId)).toEqual(accepted);
    const fresh = new BillingSettlementService(
      new AuditNotificationService(),
      f.repo,
    );
    await fresh.onModuleInit();
    expect(
      fresh
        .listReconciliationIssues()
        .find((issue) => issue.issueId === accepted.issueId),
    ).toEqual(accepted);
    const external = f.read(accepted.issueId)!;
    external.evidenceArtifactIds.push("external-mutation");
    if (external.comments[0])
      external.comments[0].artifactIds.push("external-nested-mutation");
    expect(f.read(accepted.issueId)).toEqual(accepted);
  },
);
it.each(["assign", "comment", "resolve", "reopen"])(
  "%s ACK remains visible after an independent real Forwarder arrival causes list-derived cache refresh",
  async (kind) => {
    const f = fixture(true);
    const id = await seed(f, kind);
    const before = structuredClone(f.read(id));
    const hold = f.sql.hold(id);
    const pending = update(f, kind, id);
    await hold.started;
    expect(f.read(id)).toEqual(before);
    const mirror = await f.forwarder.ingestExternalOrder({
      platformCode: "grab_taiwan",
      externalOrderId: `external-probe-${kind}`,
    });
    await f.forwarder.reportSyncFailure(mirror.mirrorOrderId, {
      errorCode: "FORWARDER_ACCEPT_RELAY_FAILED",
      errorMessage: "original controlled external sync failure",
      retryable: true,
    });
    const pendingList = f.controller.listReconciliationIssues(
      undefined,
      undefined,
      undefined,
      identity,
    ).data.items;
    expect(
      pendingList.some(
        (issue) =>
          issue.source === "forwarder_auto" &&
          issue.mirrorOrderId === mirror.mirrorOrderId,
      ),
    ).toBe(true);
    hold.release();
    const acknowledged = (await pending).data;
    const after = f.read(id);
    const durable = f.sql.rows.get(id);
    const fresh = new BillingSettlementService(
      new AuditNotificationService(),
      f.repo,
    );
    await fresh.onModuleInit();
    const reloaded = fresh
      .listReconciliationIssues()
      .find((issue) => issue.issueId === id);
    expect(after).toEqual(acknowledged);
    expect(durable).toEqual(acknowledged);
    expect(reloaded).toEqual(acknowledged);
  },
);

it("a delayed derived issue SQL write uses the same issue queue and cannot arrive after a legitimate command ACK", async () => {
  const f = fixture(true);
  const mirror = await f.forwarder.ingestExternalOrder({
    platformCode: "grab_taiwan",
    externalOrderId: "derived-pending-original",
  });
  await f.forwarder.reportSyncFailure(mirror.mirrorOrderId, {
    errorCode: "FORWARDER_ACCEPT_RELAY_FAILED",
    errorMessage: "original controlled sync failure",
    retryable: true,
  });
  const hold = f.sql.hold(null);
  const derived = f.controller
    .listReconciliationIssues(undefined, undefined, undefined, identity)
    .data.items.find((issue) => issue.mirrorOrderId === mirror.mirrorOrderId)!;
  await hold.started;
  let commandSettled = false;
  const command = f.controller
    .assignReconciliationIssue(
      derived.issueId,
      {
        actorId: "fin-probe",
        assigneeId: "explicit-assignee",
        note: "explicit command note",
      },
      identity,
    )
    .then((value) => {
      commandSettled = true;
      return value;
    });
  await new Promise<void>((done) => setImmediate(done));
  const settledBeforeDerivedAck = commandSettled;
  hold.release();
  const acknowledged = (await command).data;
  await new Promise<void>((done) => setImmediate(done));
  expect(settledBeforeDerivedAck).toBe(false);
  expect(acknowledged.ownerId).toBe("explicit-assignee");
  expect(acknowledged.comments.at(-1)?.message).toBe("explicit command note");
  expect(f.read(derived.issueId)).toEqual(acknowledged);
  expect(f.sql.rows.get(derived.issueId)).toEqual(acknowledged);
  const fresh = new BillingSettlementService(
    new AuditNotificationService(),
    f.repo,
  );
  await fresh.onModuleInit();
  expect(
    fresh
      .listReconciliationIssues()
      .find((issue) => issue.issueId === derived.issueId),
  ).toEqual(acknowledged);
});
