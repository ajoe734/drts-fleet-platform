import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  ComplaintCommitOutcomeUnknownError,
  ComplaintRepository,
  type ComplaintPendingCommitRecord,
  type ComplaintRepository as ComplaintRepositoryType,
} from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";

// COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015, UAT §10.4/§10.5:
// restart/replica durable command identity for an ordinary complaint
// mutation whose COMMIT outcome was left unknown. Section 10.4/10.5 were
// documented but had no dedicated regression of their own; these cover the
// new crm.phase1_complaint_pending_commits read/write SQL (ComplaintRepository)
// and the actual cross-process recovery behavior (ComplaintService) that the
// rest of this task's suite does not exercise.

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("ComplaintRepository: crm.phase1_complaint_pending_commits read/write", () => {
  const sampleRecord: ComplaintPendingCommitRecord = {
    commandKey: "abc123",
    caseNo: "C-000123",
    action: "assign_complaint_case",
    commandPayload: { assigneeId: "ops-1" },
    caseSnapshot: {
      caseNo: "C-000123",
      caseSource: "ops",
      relatedOrderId: null,
      relatedCallId: null,
      relatedIncidentId: null,
      category: "driver_service",
      severity: "normal",
      description: "desc",
      assigneeId: "ops-1",
      status: "assigned",
      slaDueAt: "2026-10-20T00:00:00.000Z",
      slaBreach: false,
      reopenCount: 0,
      resolutionCode: null,
      closingNote: null,
      createdAt: "2026-10-19T00:00:00.000Z",
      updatedAt: "2026-10-19T00:05:00.000Z",
    } as never,
    timelineSnapshot: [
      {
        entryId: "entry-1",
        caseNo: "C-000123",
        action: "assigned",
        note: "Assigned to ops-1.",
        createdAt: "2026-10-19T00:05:00.000Z",
      } as never,
    ],
    previousCaseSnapshot: null,
    status: "pending",
  };

  it("recordPendingCommit upserts by command_key with JSON-encoded snapshots", async () => {
    const query = vi.fn<
      (
        text: string,
        values?: readonly unknown[],
      ) => Promise<{
        rows: unknown[];
        rowCount: number;
      }>
    >(async () => ({
      rows: [],
      rowCount: 1,
    }));
    const repository = new ComplaintRepository({
      isEnabled: () => true,
      query,
    } as unknown as DatabaseService);

    await repository.recordPendingCommit(sampleRecord);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO crm.phase1_complaint_pending_commits");
    expect(sql).toContain("ON CONFLICT (command_key) DO UPDATE");
    expect(params).toEqual([
      "abc123",
      "C-000123",
      "assign_complaint_case",
      JSON.stringify({ assigneeId: "ops-1" }),
      JSON.stringify(sampleRecord.caseSnapshot),
      JSON.stringify(sampleRecord.timelineSnapshot),
      null,
      "pending",
    ]);
  });

  it("recordPendingCommit is a no-op when canonical DB is disabled", async () => {
    const query = vi.fn();
    const repository = new ComplaintRepository({
      isEnabled: () => false,
      query,
    } as unknown as DatabaseService);

    await repository.recordPendingCommit(sampleRecord);

    expect(query).not.toHaveBeenCalled();
  });

  it("loadPendingCommits selects prepared and confirmed rows and parses snapshots back into camelCase records", async () => {
    const query = vi.fn<
      (
        text: string,
        values?: readonly unknown[],
      ) => Promise<{
        rows: unknown[];
      }>
    >(async () => ({
      rows: [
        {
          command_key: "abc123",
          case_no: "C-000123",
          action: "assign_complaint_case",
          command_payload: { assigneeId: "ops-1" },
          case_snapshot: sampleRecord.caseSnapshot,
          timeline_snapshot: sampleRecord.timelineSnapshot,
          previous_case_snapshot: null,
          status: "pending",
        },
      ],
    }));
    const repository = new ComplaintRepository({
      isEnabled: () => true,
      query,
    } as unknown as DatabaseService);

    const rows = await repository.loadPendingCommits();

    expect(query.mock.calls[0]![0]).toContain("WHERE status = 'pending'");
    expect(query.mock.calls[0]![0]).toContain("OR status = 'confirmed'");
    expect(rows).toEqual([
      {
        commandKey: "abc123",
        caseNo: "C-000123",
        action: "assign_complaint_case",
        commandPayload: { assigneeId: "ops-1" },
        caseSnapshot: sampleRecord.caseSnapshot,
        timelineSnapshot: sampleRecord.timelineSnapshot,
        previousCaseSnapshot: null,
        status: "pending",
      },
    ]);
  });

  it("loadPendingCommits returns an empty array without querying when canonical DB is disabled", async () => {
    const query = vi.fn();
    const repository = new ComplaintRepository({
      isEnabled: () => false,
      query,
    } as unknown as DatabaseService);

    expect(await repository.loadPendingCommits()).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("clearPendingCommit deletes by command_key and tolerates a 0-row delete", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const repository = new ComplaintRepository({
      isEnabled: () => true,
      query,
    } as unknown as DatabaseService);

    await repository.clearPendingCommit("abc123");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "DELETE FROM crm.phase1_complaint_pending_commits WHERE command_key = $1",
      ),
      ["abc123"],
    );
  });

  it("clearPendingCommit is a no-op when canonical DB is disabled", async () => {
    const query = vi.fn();
    const repository = new ComplaintRepository({
      isEnabled: () => false,
      query,
    } as unknown as DatabaseService);

    await repository.clearPendingCommit("abc123");

    expect(query).not.toHaveBeenCalled();
  });
});

describe("ComplaintService: a same-command retry is recognized across a process restart / different replica, not only within the originating process's Map", () => {
  function fixtureWithGatedRepository(
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    const writeGates: ReturnType<typeof deferred>[] = [];
    const persistChanges = vi.fn(async () => {
      const gate = writeGates.shift();
      if (gate) await gate.promise;
    });
    const repository = {
      isEnabled: () => true,
      persistChanges,
      reportPersistenceFailure: vi.fn(),
      loadSettlementState: vi.fn(async () => ({
        complaintCases: [],
        complaintTimelines: [],
      })),
      recordPendingCommit: vi.fn(async () => {}),
      loadPendingCommits: vi.fn(async () => []),
      clearPendingCommit: vi.fn(async () => {}),
      ...overrides,
    } as unknown as ComplaintRepositoryType;
    const audit = new AuditNotificationService();
    const complaintService = new ComplaintService(audit, repository);
    return {
      complaintService,
      repository,
      persistChanges,
      pauseWrite() {
        const gate = deferred();
        writeGates.push(gate);
        return gate;
      },
    };
  }

  it("a replica with an empty in-memory Map recovers a durably-pending assign and reuses the same caseNo/entryId, instead of minting a new attempt or rejecting the retry", async () => {
    // --- Process A: the original attempt, whose COMMIT outcome is left unknown ---
    const processA = fixtureWithGatedRepository();
    const complaintCase = processA.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Restart/replica recovery regression",
    });
    // Let the create's own write settle before gating the next one.
    await processA.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );
    const durableCreateTimeline =
      processA.complaintService.getComplaintTimeline(complaintCase.caseNo);

    // PREPARED registration now also protects the successful initial create.
    // This test's existing single-call assertions concern the assign attempt.
    vi.mocked(processA.repository.recordPendingCommit).mockClear();
    const assignCommand = { assigneeId: "ops-1", note: "Taking this case" };
    const gate = processA.pauseWrite();
    processA.complaintService.assignComplaintCase(
      complaintCase.caseNo,
      assignCommand,
    );
    const outcomeA = processA.complaintService
      .awaitSettlementPersistence(complaintCase.caseNo)
      .catch((error: unknown) => error);

    await vi.waitFor(() =>
      expect(processA.persistChanges).toHaveBeenCalledTimes(2),
    );
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("connection reset after COMMIT"),
    );
    gate.reject(failure);
    expect(await outcomeA).toBe(failure);

    // The durable registration this task adds in complaint.service.ts
    // (recordDurablePendingCommit) must have captured exactly this attempt.
    expect(processA.repository.recordPendingCommit).toHaveBeenCalledTimes(1);
    const durableRow = (
      processA.repository.recordPendingCommit as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0] as ComplaintPendingCommitRecord;
    expect(durableRow.caseNo).toBe(complaintCase.caseNo);
    expect(durableRow.action).toBe("assign_complaint_case");
    expect(durableRow.status).toBe("pending");
    expect(durableRow.commandPayload).toEqual(assignCommand);

    // --- Process B: a different replica (or this same process after a
    // restart) that never saw process A's attempt in memory. Its only
    // knowledge of the durably-committed truth (the case is still "new",
    // since the assign never actually landed) comes from loadState/
    // loadPendingCommits, not a shared in-memory Map. ---
    const persistChangesB = vi.fn<(changes: unknown) => Promise<void>>(
      async () => {},
    );
    const clearPendingCommitB = vi.fn(async () => {});
    const repositoryB = {
      isEnabled: () => true,
      persistChanges: persistChangesB,
      reportPersistenceFailure: vi.fn(),
      loadState: vi.fn(async () => ({
        complaintCases: [complaintCase],
        complaintTimelines: durableCreateTimeline,
      })),
      loadSettlementState: vi.fn(async () => ({
        complaintCases: [],
        complaintTimelines: [],
      })),
      loadPendingCommits: vi.fn(async () => [durableRow]),
      recordPendingCommit: vi.fn(async () => {}),
      clearPendingCommit: clearPendingCommitB,
    } as unknown as ComplaintRepositoryType;
    const auditB = new AuditNotificationService();
    const complaintServiceB = new ComplaintService(auditB, repositoryB);
    await complaintServiceB.onModuleInit();

    // Readback on the fresh replica must show the real durable state: the
    // uncertain assign never landed, so the case is still "new".
    expect(
      complaintServiceB.getComplaintCase(complaintCase.caseNo).status,
    ).toBe("new");

    // Every controller endpoint calls refreshSettlementCases() first; this
    // is where hydratePendingCommitsFromDurableStore rehydrates the durable
    // pending row into this process's in-memory Map.
    await complaintServiceB.refreshSettlementCases();

    // The real caller resends the exact same command (e.g. the Ops Console
    // user re-pressing the same "Assign" button after a timeout).
    const retried = complaintServiceB.assignComplaintCase(
      complaintCase.caseNo,
      assignCommand,
    );
    expect(retried.assigneeId).toBe("ops-1");
    expect(retried.status).toBe("assigned");

    await complaintServiceB.awaitSettlementPersistence(complaintCase.caseNo);

    expect(persistChangesB).toHaveBeenCalledTimes(1);
    const resentPayload = persistChangesB.mock.calls[0]![0] as {
      complaintCases: Array<{ caseNo: string }>;
      complaintTimelines: Array<{ entryId: string }>;
    };
    // Reuses the exact caseNo/entryId from the original (process A) attempt,
    // which is what lets the repository's ON CONFLICT DO UPDATE upsert
    // idempotently instead of a retry allocating a second row.
    expect(resentPayload.complaintCases[0]!.caseNo).toBe(complaintCase.caseNo);
    expect(resentPayload.complaintTimelines.map((e) => e.entryId)).toEqual(
      durableRow.timelineSnapshot.map(
        (entry) => (entry as { entryId: string }).entryId,
      ),
    );

    // Once this retry actually commits, the durable marker must be cleared
    // by the same commandKey it was recorded under.
    expect(clearPendingCommitB).toHaveBeenCalledWith(durableRow.commandKey);
  });
});
