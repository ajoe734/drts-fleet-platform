import { describe, expect, it } from "vitest";
import type { ReconciliationIssueRecord } from "@drts/contracts";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";
import {
  databaseSocket,
  setup,
} from "../billing-monthly-batch-resumption-20261015/fixtures";

// Actual controllers/service/repository/INSERT serialization. Only the existing
// SQL socket is finite. No authored issue records or post-write reader startup
// is substituted for a genuinely already-warm instance in the first two cases.
const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "platform_admin",
  actorId: "shared-finance-operator",
  realm: "platform",
  tenantId: null,
  partnerId: null,
  roleFamilies: ["platform"],
  roles: ["platform_admin"],
  scopes: ["billing:read", "billing:write"],
  requestId: null,
};
const tenantIdentity: BootstrapRequestIdentity = {
  ...identity,
  actorType: "tenant_admin",
  actorId: "tenant-finance-operator",
  realm: "tenant",
  tenantId: "tenant-shared-lifecycle",
  roleFamilies: ["tenant"],
  roles: ["tenant_admin"],
};

function enhanceReconciliationSocket(
  socket: ReturnType<typeof databaseSocket>,
) {
  const baseQuery = socket.query.getMockImplementation()!;
  const advisoryLocks = new Map<string, Promise<void>>();
  const lockEvents: Array<{
    clientId: number;
    action: "lock" | "unlock" | "error_drop";
    key: string;
  }> = [];
  const destroyedSessions: Array<{ clientId: number; error: Error }> = [];
  let clientSeq = 0;
  let failNextLock: Error | null = null;
  let failNextUnlock: Error | null = null;
  let failNextIssueSelect: Error | null = null;
  let pendingIssueWriteHold: {
    issueId: string | null;
    entered: () => void;
    gate: Promise<void>;
  } | null = null;

  socket.query.mockImplementation(
    async (sql: string, values: readonly unknown[] = []) => {
      if (
        sql.includes("INSERT INTO billing.phase1_reconciliation_issues") &&
        pendingIssueWriteHold
      ) {
        const targetIssueId = String(values[0] ?? "");
        if (
          pendingIssueWriteHold.issueId === null ||
          pendingIssueWriteHold.issueId === targetIssueId
        ) {
          const currentHold = pendingIssueWriteHold;
          pendingIssueWriteHold = null;
          currentHold.entered();
          await currentHold.gate;
        }
      }

      const selected = /FROM\s+([\w.]+)/i.exec(sql)?.[1];
      if (selected === "billing.phase1_reconciliation_issues") {
        if (failNextIssueSelect) {
          const err = failNextIssueSelect;
          failNextIssueSelect = null;
          throw err;
        }
        const table = socket.tables.get("billing.phase1_reconciliation_issues");
        if (sql.includes("WHERE issue_id = $1")) {
          const record = table?.get(String(values[0] ?? ""));
          return {
            rows: record ? [{ record: structuredClone(record) }] : [],
            rowCount: record ? 1 : 0,
          };
        }
        if (sql.includes("mirrorOrderId")) {
          const mirrorOrderId = String(values[0] ?? "");
          const reconciliationJobId = String(values[1] ?? "");
          const matched = [...(table?.values() ?? [])]
            .filter(
              (row) =>
                row.source === "forwarder_auto" &&
                (row.mirrorOrderId === mirrorOrderId ||
                  row.linkedReconciliationJobId === reconciliationJobId),
            )
            .sort(
              (left, right) =>
                String(right.updatedAt ?? "").localeCompare(
                  String(left.updatedAt ?? ""),
                ) ||
                String(left.issueId ?? "").localeCompare(
                  String(right.issueId ?? ""),
                ),
            )[0];
          return {
            rows: matched ? [{ record: structuredClone(matched) }] : [],
            rowCount: matched ? 1 : 0,
          };
        }
        const ordered = [...(table?.values() ?? [])].sort(
          (left, right) =>
            String(right.updatedAt ?? "").localeCompare(
              String(left.updatedAt ?? ""),
            ) ||
            String(left.issueId ?? "").localeCompare(
              String(right.issueId ?? ""),
            ),
        );
        return {
          rows: ordered.map((record) => ({ record: structuredClone(record) })),
          rowCount: ordered.length,
        };
      }

      return baseQuery(sql, values);
    },
  );

  const multiLockConnect = async () => {
    const clientId = ++clientSeq;
    const held: Array<{ key: string; unlock: () => void }> = [];
    return {
      query: async (sql: string, values: readonly unknown[] = []) => {
        socket.clientCalls.push({ clientId, sql, values });
        if (sql.includes("pg_advisory_lock(")) {
          if (failNextLock) {
            const err = failNextLock;
            failNextLock = null;
            throw err;
          }
          const key = String(values[0] ?? "");
          const prior = advisoryLocks.get(key) ?? Promise.resolve();
          let release!: () => void;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          const next = prior.then(() => gate);
          advisoryLocks.set(key, next);
          await prior;
          held.push({
            key,
            unlock: () => {
              release();
              if (advisoryLocks.get(key) === next) {
                advisoryLocks.delete(key);
              }
            },
          });
          lockEvents.push({ clientId, action: "lock", key });
          return { rows: [{ pg_advisory_lock: "" }], rowCount: 1 };
        }
        if (sql.includes("pg_advisory_unlock(")) {
          if (failNextUnlock) {
            const err = failNextUnlock;
            failNextUnlock = null;
            throw err;
          }
          const key = String(values[0] ?? "");
          expect(held.at(-1)?.key).toBe(key);
          const entry = held.pop()!;
          entry.unlock();
          lockEvents.push({ clientId, action: "unlock", key });
          return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
        }
        return socket.query(sql, values);
      },
      release: (error?: Error) => {
        socket.releasedSessions.push(clientId);
        if (error) {
          destroyedSessions.push({ clientId, error });
          while (held.length > 0) {
            const entry = held.pop()!;
            entry.unlock();
            lockEvents.push({
              clientId,
              action: "error_drop",
              key: entry.key,
            });
          }
        }
      },
    };
  };

  Object.assign(socket, {
    connect: multiLockConnect,
    lockEvents,
    destroyedSessions,
    failLockOnce: (error = new Error("SIM advisory lock rejected")) => {
      failNextLock = error;
    },
    failUnlockOnce: (error = new Error("SIM advisory unlock rejected")) => {
      failNextUnlock = error;
    },
    failIssueSelectOnce: (
      error = new Error("SIM canonical issue read rejected"),
    ) => {
      failNextIssueSelect = error;
    },
    holdNextIssueWrite: (issueId: string | null = null) => {
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      pendingIssueWriteHold = { issueId, entered, gate };
      return { started, release };
    },
  });

  return socket as ReturnType<typeof databaseSocket> & {
    lockEvents: typeof lockEvents;
    destroyedSessions: typeof destroyedSessions;
    failLockOnce: (error?: Error) => void;
    failUnlockOnce: (error?: Error) => void;
    failIssueSelectOnce: (error?: Error) => void;
    holdNextIssueWrite: (issueId?: string | null) => {
      started: Promise<void>;
      release: () => void;
    };
  };
}

async function setupPodWithForwarder(
  socket: ReturnType<typeof enhanceReconciliationSocket>,
  forwarder: ForwarderService,
) {
  const audit = new AuditNotificationService();
  const repository = new BillingSettlementRepository({
    isEnabled: () => true,
    query: socket.query,
    connect: socket.connect,
  } as unknown as DatabaseService);
  const service = new BillingSettlementService(audit, repository, forwarder);
  await service.onModuleInit();
  const controller = new BillingSettlementController(service);
  return { audit, repository, service, controller };
}

async function fixture(readerBeforeCreate: boolean) {
  const socket = enhanceReconciliationSocket(databaseSocket());
  const a = await setup(socket);
  const before = readerBeforeCreate ? await setup(socket) : null;
  const created = (
    await a.controller.createReconciliationIssue(
      {
        issueType: "partner_sponsor_mismatch",
        summary: "Shared real issue lifecycle",
        openedBy: identity.actorId!,
        tenantId: tenantIdentity.tenantId!,
        partnerId: "partner-shared-lifecycle",
        orderId: "order-shared-lifecycle",
        comment: "Original opening note",
        artifactIds: ["artifact-open"],
      },
      identity,
      "create-shared-issue",
    )
  ).data;
  const b = before ?? (await setup(socket));
  return { socket, a, b, created };
}

async function read(
  f: Awaited<ReturnType<typeof fixture>>,
  status?: "open" | "assigned" | "resolved" | "reopened",
) {
  return (
    await f.b.controller.listReconciliationIssues(
      status,
      "partner_sponsor_mismatch",
      undefined,
      identity,
      "warm-reader-list",
    )
  ).data.items.find((issue) => issue.issueId === f.created.issueId);
}

async function assignA(f: Awaited<ReturnType<typeof fixture>>) {
  return (
    await f.a.controller.assignReconciliationIssue(
      f.created.issueId,
      {
        actorId: identity.actorId!,
        assigneeId: "assigned-finance-owner",
        note: "Writer A assignment note",
      },
      identity,
    )
  ).data;
}

async function resolveA(f: Awaited<ReturnType<typeof fixture>>) {
  return (
    await f.a.controller.resolveReconciliationIssue(
      f.created.issueId,
      {
        actorId: identity.actorId!,
        resolutionCode: "no_action_required",
        resolutionSummary: "Writer A resolution",
        artifactIds: ["artifact-resolution"],
      },
      identity,
    )
  ).data;
}

describe("Canonical reconciliation issue lifecycle across already-warm API instances", () => {
  it("ordinary warm B list reads the exact issue A already acknowledged and stored", async () => {
    const f = await fixture(true);
    expect(
      f.socket.tables
        .get("billing.phase1_reconciliation_issues")
        ?.get(f.created.issueId),
    ).toEqual(f.created);
    expect(await read(f)).toEqual(f.created);
  });

  it("warm B assigns an issue created after B startup through the normal controller", async () => {
    const f = await fixture(true);
    const result = (
      await f.b.controller.assignReconciliationIssue(
        f.created.issueId,
        {
          actorId: identity.actorId!,
          assigneeId: "next-finance-owner",
          note: "Warm B assignment",
        },
        identity,
      )
    ).data;
    expect(result.issueId).toBe(f.created.issueId);
    expect(result.ownerId).toBe("next-finance-owner");
    expect(result.comments.map((comment) => comment.message)).toEqual([
      "Original opening note",
      "Warm B assignment",
    ]);
    expect(await read(f)).toEqual(result);
    expect(
      f.socket.tables
        .get("billing.phase1_reconciliation_issues")
        ?.get(result.issueId),
    ).toEqual(result);
  });

  it("B comment starts from A's latest acknowledged owner, state, notes and artifacts", async () => {
    const f = await fixture(false);
    const assigned = await assignA(f);
    const result = (
      await f.b.controller.addReconciliationIssueComment(
        f.created.issueId,
        {
          actorId: identity.actorId!,
          message: "Warm B evidence note",
          artifactIds: ["artifact-comment"],
        },
        identity,
      )
    ).data;
    expect(result.ownerId).toBe(assigned.ownerId);
    expect(result.status).toBe("assigned");
    expect(result.comments.map((comment) => comment.message)).toEqual([
      "Original opening note",
      "Writer A assignment note",
      "Warm B evidence note",
    ]);
    expect(result.evidenceArtifactIds).toEqual(
      expect.arrayContaining(["artifact-open", "artifact-comment"]),
    );
    expect(
      f.socket.tables
        .get("billing.phase1_reconciliation_issues")
        ?.get(result.issueId),
    ).toEqual(result);
  });

  it("B resolution preserves A's latest acknowledged assignment and evidence", async () => {
    const f = await fixture(false);
    const assigned = await assignA(f);
    const result = (
      await f.b.controller.resolveReconciliationIssue(
        f.created.issueId,
        {
          actorId: identity.actorId!,
          resolutionCode: "no_action_required",
          resolutionSummary: "Warm B final resolution",
          artifactIds: ["artifact-resolution"],
        },
        identity,
      )
    ).data;
    expect(result.ownerId).toBe(assigned.ownerId);
    expect(result.status).toBe("resolved");
    expect(result.comments.map((comment) => comment.message)).toEqual([
      "Original opening note",
      "Writer A assignment note",
      "Warm B final resolution",
    ]);
    expect(
      f.socket.tables
        .get("billing.phase1_reconciliation_issues")
        ?.get(result.issueId),
    ).toEqual(result);
  });

  it("B reopens A's committed resolved issue and preserves its full canonical history", async () => {
    const f = await fixture(false);
    await assignA(f);
    const resolved = await resolveA(f);
    const result = (
      await f.b.controller.reopenReconciliationIssue(
        f.created.issueId,
        {
          actorId: identity.actorId!,
          reason: "Warm B legitimate reopen",
          artifactIds: ["artifact-reopen"],
        },
        identity,
      )
    ).data;
    expect(result.ownerId).toBe(resolved.ownerId);
    expect(result.status).toBe("reopened");
    expect(result.reopenCount).toBe(1);
    expect(result.resolutionCode).toBeNull();
    expect(result.resolvedAt).toBeNull();
    expect(result.comments.map((comment) => comment.message)).toEqual([
      ...resolved.comments.map((comment) => comment.message),
      "Warm B legitimate reopen",
    ]);
    expect(result.evidenceArtifactIds).toEqual(
      expect.arrayContaining([
        "artifact-open",
        "artifact-resolution",
        "artifact-reopen",
      ]),
    );
    expect(
      f.socket.tables
        .get("billing.phase1_reconciliation_issues")
        ?.get(result.issueId),
    ).toEqual(result);
  });

  it("the existing same-tenant visibility check uses the actual committed issue on warm B", async () => {
    const f = await fixture(true);
    const result = (
      await f.b.controller.addReconciliationIssueComment(
        f.created.issueId,
        {
          actorId: tenantIdentity.actorId!,
          message: "Existing tenant's legitimate follow-up",
        },
        tenantIdentity,
      )
    ).data;
    expect(result.tenantId).toBe(tenantIdentity.tenantId);
    expect(result.comments.at(-1)?.message).toBe(
      "Existing tenant's legitimate follow-up",
    );
    expect(
      f.socket.tables
        .get("billing.phase1_reconciliation_issues")
        ?.get(result.issueId),
    ).toEqual(result);
  });

  it("ordinary B status-filtered list reflects A's latest committed resolution", async () => {
    const f = await fixture(false);
    const resolved = await resolveA(f);
    expect(await read(f, "resolved")).toEqual(resolved);
    expect(await read(f, "open")).toBeUndefined();
  });

  it("two-pod overlapping concurrent comments on the same issue serialize via per-issue advisory lock and preserve both comments and artifacts", async () => {
    const f = await fixture(true);
    const assigned = await assignA(f);
    const holdA = f.socket.holdNextIssueWrite(f.created.issueId);

    const commentAPromise = f.a.controller.addReconciliationIssueComment(
      f.created.issueId,
      {
        actorId: "pod-a-specialist",
        message: "Pod A overlapping comment",
        artifactIds: ["artifact-pod-a"],
      },
      identity,
    );
    await holdA.started;

    let commentBSettled = false;
    const commentBPromise = f.b.controller
      .addReconciliationIssueComment(
        f.created.issueId,
        {
          actorId: "pod-b-specialist",
          message: "Pod B overlapping comment",
          artifactIds: ["artifact-pod-b"],
        },
        identity,
      )
      .then((res) => {
        commentBSettled = true;
        return res;
      });

    await new Promise<void>((done) => setImmediate(done));
    expect(commentBSettled).toBe(false);

    holdA.release();
    const [commentAResult, commentBResult] = await Promise.all([
      commentAPromise,
      commentBPromise,
    ]);

    expect(commentAResult.data.comments.map((c) => c.message)).toEqual([
      "Original opening note",
      "Writer A assignment note",
      "Pod A overlapping comment",
    ]);
    expect(commentBResult.data.ownerId).toBe(assigned.ownerId);
    expect(commentBResult.data.status).toBe("assigned");
    expect(commentBResult.data.comments.map((c) => c.message)).toEqual([
      "Original opening note",
      "Writer A assignment note",
      "Pod A overlapping comment",
      "Pod B overlapping comment",
    ]);
    expect(commentBResult.data.evidenceArtifactIds).toEqual(
      expect.arrayContaining([
        "artifact-open",
        "artifact-pod-a",
        "artifact-pod-b",
      ]),
    );
    expect(await read(f)).toEqual(commentBResult.data);
    expect(
      f.socket.tables
        .get("billing.phase1_reconciliation_issues")
        ?.get(f.created.issueId),
    ).toEqual(commentBResult.data);
  });

  it("an in-flight locked mutation on issue A on pod A does not block pod B from mutating an independent issue B", async () => {
    const f = await fixture(true);
    const secondIssue = (
      await f.a.controller.createReconciliationIssue(
        {
          issueType: "partner_sponsor_mismatch",
          summary: "Independent second issue on shared store",
          openedBy: identity.actorId!,
          tenantId: tenantIdentity.tenantId!,
          partnerId: "partner-independent-b",
          orderId: "order-independent-b",
          comment: "Second issue opening note",
          artifactIds: ["artifact-second-open"],
        },
        identity,
        "create-second-shared-issue",
      )
    ).data;

    const holdIssueA = f.socket.holdNextIssueWrite(f.created.issueId);
    const assignAPromise = f.a.controller.assignReconciliationIssue(
      f.created.issueId,
      {
        actorId: identity.actorId!,
        assigneeId: "owner-issue-a",
        note: "Held assignment on issue A",
      },
      identity,
    );
    await holdIssueA.started;

    const assignedB = (
      await f.b.controller.assignReconciliationIssue(
        secondIssue.issueId,
        {
          actorId: identity.actorId!,
          assigneeId: "owner-issue-b",
          note: "Unblocked assignment on issue B",
        },
        identity,
      )
    ).data;
    expect(assignedB.issueId).toBe(secondIssue.issueId);
    expect(assignedB.ownerId).toBe("owner-issue-b");
    expect(assignedB.comments.map((c) => c.message)).toEqual([
      "Second issue opening note",
      "Unblocked assignment on issue B",
    ]);

    holdIssueA.release();
    const assignedA = (await assignAPromise).data;
    expect(assignedA.issueId).toBe(f.created.issueId);
    expect(assignedA.ownerId).toBe("owner-issue-a");

    const listOnB = (
      await f.b.controller.listReconciliationIssues(
        undefined,
        "partner_sponsor_mismatch",
        undefined,
        identity,
      )
    ).data.items;
    expect(listOnB.find((item) => item.issueId === f.created.issueId)).toEqual(
      assignedA,
    );
    expect(
      listOnB.find((item) => item.issueId === secondIssue.issueId),
    ).toEqual(assignedB);
  });

  it("advisory lock failure, write rejection, and unlock failure release the session properly without stale fallback or phantom audit", async () => {
    const f = await fixture(true);
    const auditLogsBefore = f.b.logs.mock.calls.length;

    // 1. Canonical read failure on list and mutation does not fall back to stale cache
    f.socket.failIssueSelectOnce(new Error("SIM canonical list read failed"));
    await expect(
      f.b.controller.listReconciliationIssues(
        undefined,
        "partner_sponsor_mismatch",
        undefined,
        identity,
      ),
    ).rejects.toThrow("SIM canonical list read failed");

    // 2. Lock acquisition failure
    f.socket.failLockOnce(new Error("SIM pg_advisory_lock failed"));
    await expect(
      f.b.controller.assignReconciliationIssue(
        f.created.issueId,
        {
          actorId: identity.actorId!,
          assigneeId: "failed-lock-owner",
          note: "Should not persist",
        },
        identity,
      ),
    ).rejects.toThrow("SIM pg_advisory_lock failed");
    expect(f.b.logs.mock.calls).toHaveLength(auditLogsBefore);
    expect(await read(f)).toEqual(f.created);

    // 2. Canonical write failure inside held lock releases lock cleanly
    f.socket.reject(
      "billing.phase1_reconciliation_issues",
      new Error("SIM canonical issue write failed"),
    );
    await expect(
      f.b.controller.addReconciliationIssueComment(
        f.created.issueId,
        {
          actorId: identity.actorId!,
          message: "Rejected comment under lock",
        },
        identity,
      ),
    ).rejects.toThrow("SIM canonical issue write failed");
    f.socket.reject(null);
    expect(f.b.logs.mock.calls).toHaveLength(auditLogsBefore);
    expect(await read(f)).toEqual(f.created);

    // 3. Unlock failure destroys the session via release(error) and drops held lock
    const destroyedBefore = f.socket.destroyedSessions.length;
    f.socket.failUnlockOnce(new Error("SIM pg_advisory_unlock failed"));
    const assignedAfterUnlockError = (
      await f.b.controller.assignReconciliationIssue(
        f.created.issueId,
        {
          actorId: identity.actorId!,
          assigneeId: "owner-after-unlock-failure",
          note: "Committed before unlock error",
        },
        identity,
      )
    ).data;
    expect(assignedAfterUnlockError.ownerId).toBe("owner-after-unlock-failure");
    expect(f.socket.destroyedSessions).toHaveLength(destroyedBefore + 1);

    // Subsequent mutation on the same issue succeeds without deadlock
    const followUp = (
      await f.a.controller.addReconciliationIssueComment(
        f.created.issueId,
        {
          actorId: identity.actorId!,
          message: "Follow-up after session destroy",
        },
        identity,
      )
    ).data;
    expect(followUp.comments.map((c) => c.message)).toEqual([
      "Original opening note",
      "Committed before unlock error",
      "Follow-up after session destroy",
    ]);
  });

  it("derived Forwarder issue resolved on warm pod B stays resolved when pod A or pod B re-runs derived sync or receives a repeated failure", async () => {
    const socket = enhanceReconciliationSocket(databaseSocket());
    const sharedForwarder = new ForwarderService(
      undefined as never,
      new AuditNotificationService(),
    );
    const podA = await setupPodWithForwarder(socket, sharedForwarder);
    const podB = await setupPodWithForwarder(socket, sharedForwarder);

    const mirror = await sharedForwarder.ingestExternalOrder({
      platformCode: "grab_taiwan",
      externalOrderId: "ext-resolved-derived-guard-01",
    });
    await sharedForwarder.reportSyncFailure(mirror.mirrorOrderId, {
      errorCode: "FORWARDER_ACCEPT_RELAY_FAILED",
      errorMessage: "Initial relay failure",
      retryable: true,
    });

    const listedOnA = (
      await podA.controller.listReconciliationIssues(
        undefined,
        "forwarder_status_mismatch",
        undefined,
        identity,
      )
    ).data.items;
    const derived = listedOnA.find(
      (item) => item.mirrorOrderId === mirror.mirrorOrderId,
    )!;
    expect(derived).toBeDefined();
    expect(derived.status).toBe("open");

    const resolvedOnB = (
      await podB.controller.resolveReconciliationIssue(
        derived.issueId,
        {
          actorId: identity.actorId!,
          resolutionCode: "mirror_resynced",
          resolutionSummary: "Resolved on warm pod B",
          artifactIds: ["artifact-derived-resolved"],
        },
        identity,
      )
    ).data;
    expect(resolvedOnB.status).toBe("resolved");

    // Repeated failure on the same mirror generates a new reconciliationJobId
    await sharedForwarder.reportSyncFailure(mirror.mirrorOrderId, {
      errorCode: "FORWARDER_COMPLETE_SYNC_FAILED",
      errorMessage: "Subsequent sync failure after resolution",
      retryable: false,
    });

    const afterOnA = (
      await podA.controller.listReconciliationIssues(
        undefined,
        "forwarder_status_mismatch",
        undefined,
        identity,
      )
    ).data.items.filter((item) => item.mirrorOrderId === mirror.mirrorOrderId);
    const afterOnB = (
      await podB.controller.listReconciliationIssues(
        undefined,
        "forwarder_status_mismatch",
        undefined,
        identity,
      )
    ).data.items.filter((item) => item.mirrorOrderId === mirror.mirrorOrderId);

    expect(afterOnA).toHaveLength(1);
    expect(afterOnB).toHaveLength(1);
    expect(afterOnA[0]).toEqual(resolvedOnB);
    expect(afterOnB[0]).toEqual(resolvedOnB);
  });

  it("repeated Forwarder sync failure on the same mirrorOrderId with a new reconciliationJobId coordinates in mirror->issue lock order, preserves original issueId and manual edits, and rebases derived fields across warm pods", async () => {
    const socket = enhanceReconciliationSocket(databaseSocket());
    const sharedForwarder = new ForwarderService(
      undefined as never,
      new AuditNotificationService(),
    );
    const podA = await setupPodWithForwarder(socket, sharedForwarder);
    const podB = await setupPodWithForwarder(socket, sharedForwarder);

    const mirror = await sharedForwarder.ingestExternalOrder({
      platformCode: "uber",
      externalOrderId: "ext-same-mirror-changed-job-01",
    });
    const firstFailure = await sharedForwarder.reportSyncFailure(
      mirror.mirrorOrderId,
      {
        errorCode: "FORWARDER_ACCEPT_RELAY_FAILED",
        errorMessage: "First relay failure",
        retryable: true,
      },
    );
    const firstJobId = firstFailure.reconciliationJob!.reconciliationJobId;

    const initialDerived = (
      await podA.controller.listReconciliationIssues(
        undefined,
        "forwarder_status_mismatch",
        undefined,
        identity,
      )
    ).data.items.find((item) => item.mirrorOrderId === mirror.mirrorOrderId)!;
    expect(initialDerived.issueId).toBe(`recon-forwarder-${firstJobId}`);
    expect(initialDerived.linkedReconciliationJobId).toBe(firstJobId);

    // Warm pod B performs manual assignment, comment, resolve, and reopen
    await podB.controller.assignReconciliationIssue(
      initialDerived.issueId,
      {
        actorId: identity.actorId!,
        assigneeId: "cross-pod-forwarder-specialist",
        note: "Assigned on warm B",
      },
      identity,
    );
    await podB.controller.addReconciliationIssueComment(
      initialDerived.issueId,
      {
        actorId: "cross-pod-forwarder-specialist",
        message: "Investigating relay timeout",
        artifactIds: ["artifact-manual-trace"],
      },
      identity,
    );
    await podB.controller.resolveReconciliationIssue(
      initialDerived.issueId,
      {
        actorId: "cross-pod-forwarder-specialist",
        resolutionCode: "external_owner_confirmed",
        resolutionSummary: "Initial check complete",
      },
      identity,
    );
    const reopenedOnB = (
      await podB.controller.reopenReconciliationIssue(
        initialDerived.issueId,
        {
          actorId: identity.actorId!,
          reason: "Reopened for second sync check",
          artifactIds: ["artifact-reopen-trace"],
        },
        identity,
      )
    ).data;
    expect(reopenedOnB.status).toBe("reopened");
    expect(reopenedOnB.reopenCount).toBe(1);

    socket.lockEvents.length = 0;

    // Repeated sync failure creates a brand new reconciliationJobId for the same mirrorOrderId
    const secondFailure = await sharedForwarder.reportSyncFailure(
      mirror.mirrorOrderId,
      {
        errorCode: "FORWARDER_COMPLETE_SYNC_FAILED",
        errorMessage: "Second completion sync failure",
        retryable: false,
      },
    );
    const secondJobId = secondFailure.reconciliationJob!.reconciliationJobId;
    expect(secondJobId).not.toBe(firstJobId);

    const afterSecondFailureOnA = (
      await podA.controller.listReconciliationIssues(
        undefined,
        "forwarder_status_mismatch",
        undefined,
        identity,
      )
    ).data.items.filter((item) => item.mirrorOrderId === mirror.mirrorOrderId);
    const afterSecondFailureOnB = (
      await podB.controller.listReconciliationIssues(
        undefined,
        "forwarder_status_mismatch",
        undefined,
        identity,
      )
    ).data.items.filter((item) => item.mirrorOrderId === mirror.mirrorOrderId);

    expect(afterSecondFailureOnA).toHaveLength(1);
    expect(afterSecondFailureOnB).toHaveLength(1);

    const updated = afterSecondFailureOnB[0]!;
    expect(updated.issueId).toBe(initialDerived.issueId);
    expect(updated.linkedReconciliationJobId).toBe(secondJobId);
    expect(updated.ownerId).toBe("cross-pod-forwarder-specialist");
    expect(updated.status).toBe("reopened");
    expect(updated.reopenCount).toBe(1);
    expect(updated.createdAt).toBe(initialDerived.createdAt);
    expect(updated.summary).toContain("FORWARDER_COMPLETE_SYNC_FAILED");
    expect(updated.comments.map((c) => c.message)).toEqual(
      reopenedOnB.comments.map((c) => c.message),
    );
    expect(updated.evidenceArtifactIds).toEqual(
      expect.arrayContaining([
        mirror.mirrorOrderId,
        firstJobId,
        "artifact-manual-trace",
        "artifact-reopen-trace",
        secondJobId,
      ]),
    );
    expect(afterSecondFailureOnA[0]).toEqual(updated);

    // Verify mirror -> issue lock ordering and issue -> mirror unlock ordering
    const mirrorKey = `reconciliation-mirror:${mirror.mirrorOrderId}`;
    const issueKey = `reconciliation-issue:${initialDerived.issueId}`;
    const derivedClientEvents = socket.lockEvents.filter(
      (event) => event.key === mirrorKey || event.key === issueKey,
    );
    expect(
      derivedClientEvents.slice(0, 4).map((e) => `${e.action}:${e.key}`),
    ).toEqual([
      `lock:${mirrorKey}`,
      `lock:${issueKey}`,
      `unlock:${issueKey}`,
      `unlock:${mirrorKey}`,
    ]);
  });

  it("warm B enforces foreign-tenant and null-tenant visibility isolation against canonical issues", async () => {
    const f = await fixture(true);
    const foreignTenantIdentity: BootstrapRequestIdentity = {
      ...tenantIdentity,
      actorId: "foreign-tenant-operator",
      tenantId: "tenant-foreign-isolated",
    };

    const foreignList = (
      await f.b.controller.listReconciliationIssues(
        undefined,
        undefined,
        undefined,
        foreignTenantIdentity,
      )
    ).data.items;
    expect(
      foreignList.find((item) => item.issueId === f.created.issueId),
    ).toBeUndefined();

    await expect(
      f.b.controller.assignReconciliationIssue(
        f.created.issueId,
        {
          actorId: foreignTenantIdentity.actorId!,
          assigneeId: "foreign-assignee",
        },
        foreignTenantIdentity,
      ),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof ApiRequestError &&
        err.getStatus() === 404 &&
        err.code === "NOT_FOUND"
      );
    });

    const platformNullTenantIssue = (
      await f.a.controller.createReconciliationIssue(
        {
          issueType: "partner_sponsor_mismatch",
          summary: "Platform-only null-tenant issue",
          openedBy: identity.actorId!,
          tenantId: null,
        },
        identity,
      )
    ).data as ReconciliationIssueRecord;
    expect(platformNullTenantIssue.tenantId).toBeNull();

    await expect(
      f.b.controller.addReconciliationIssueComment(
        platformNullTenantIssue.issueId,
        {
          actorId: tenantIdentity.actorId!,
          message: "Tenant attempting comment on null-tenant issue",
        },
        tenantIdentity,
      ),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof ApiRequestError &&
        err.getStatus() === 404 &&
        err.code === "NOT_FOUND"
      );
    });
  });
});
