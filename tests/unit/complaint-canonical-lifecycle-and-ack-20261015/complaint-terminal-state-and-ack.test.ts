import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import {
  ComplaintCommitOutcomeUnknownError,
  type ComplaintRepository,
} from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import type { ComplaintCaseRecord } from "@drts/contracts";

function setupService() {
  const auditService = new AuditNotificationService();
  const complaintService = new ComplaintService(auditService);
  return { auditService, complaintService };
}

// COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015
// Regression coverage for the three C045 findings fixed by this task:
// F1 (UI reopen CTA mismatch), F2 (resolve bypassing the closed->reopen
// contract) and F3 (ordinary CRM writes silently acknowledged as success).
describe("C045-F2: closed complaint cases cannot be resolved back to resolved", () => {
  it("rejects resolve on a closed case with 409 COMPLAINT_ALREADY_CLOSED and does not mutate it", () => {
    const { complaintService } = setupService();

    const complaintCase = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Impolite driver conduct",
    });

    complaintService.resolveComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_driver_warning",
      closingNote: "Initial resolution",
    });
    const closed = complaintService.closeComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_driver_warning",
      closingNote: "Closed for now",
    });
    expect(closed.status).toBe("closed");

    expect(() =>
      complaintService.resolveComplaintCase(complaintCase.caseNo, {
        resolutionCode: "resolved_driver_warning",
        closingNote: "Stale resolve retry on a closed case",
      }),
    ).toThrowError(ApiRequestError);

    try {
      complaintService.resolveComplaintCase(complaintCase.caseNo, {
        resolutionCode: "resolved_driver_warning",
        closingNote: "Stale resolve retry on a closed case",
      });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiError = err as ApiRequestError;
      expect(apiError.getStatus()).toBe(409);
      expect(apiError.code).toBe("COMPLAINT_ALREADY_CLOSED");
    }

    // The case remains untouched by the rejected resolve attempt.
    expect(complaintService.getComplaintCase(complaintCase.caseNo).status).toBe(
      "closed",
    );
  });

  it("still honors the valid closed->reopen path (regression guard)", () => {
    const { complaintService } = setupService();

    const complaintCase = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "fare_dispute",
      severity: "normal",
      description: "Meter overcharge dispute",
    });
    complaintService.resolveComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_with_refund",
      closingNote: "Refund issued",
    });
    complaintService.closeComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_with_refund",
      closingNote: "Closed after refund",
    });

    const reopened = complaintService.reopenComplaintCase(
      complaintCase.caseNo,
      { reason: "Passenger produced a second overcharge receipt" },
    );
    expect(reopened.status).toBe("reopened");
    expect(reopened.reopenCount).toBe(1);
  });

  it("still allows the idempotent resolved->resolved replay (regression guard)", () => {
    const { complaintService } = setupService();

    const complaintCase = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "Idempotent resolve replay case",
    });
    const first = complaintService.resolveComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_other",
      closingNote: "First resolution",
    });
    const replay = complaintService.resolveComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_other",
      closingNote: "Retried resolve request",
    });
    expect(replay).toEqual(first);
    expect(replay.status).toBe("resolved");
  });

  it("C045-F1 backend contract: a resolved case still rejects reopen with 409 COMPLAINT_NOT_CLOSED (the UI reopen CTA must not be offered here)", () => {
    const { complaintService } = setupService();

    const complaintCase = complaintService.createComplaintCase({
      caseSource: "ops",
      category: "vehicle_condition",
      severity: "normal",
      description: "AC not cooling",
    });
    const resolved = complaintService.resolveComplaintCase(
      complaintCase.caseNo,
      {
        resolutionCode: "resolved_with_apology",
        closingNote: "Apology issued",
      },
    );
    expect(resolved.status).toBe("resolved");

    try {
      complaintService.reopenComplaintCase(complaintCase.caseNo, {
        reason: "Attempting to reopen a merely-resolved case",
      });
      throw new Error("expected reopen to throw");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiError = err as ApiRequestError;
      expect(apiError.getStatus()).toBe(409);
      expect(apiError.code).toBe("COMPLAINT_NOT_CLOSED");
    }
  });
});

describe("C045-F3: ordinary (non-settlement) complaint controller endpoints honestly acknowledge canonical persistence", () => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { promise, resolve, reject };
  }

  function fixtureWithGatedRepository() {
    const writeGates: ReturnType<typeof deferred>[] = [];
    const persistChanges = vi.fn(async () => {
      const gate = writeGates.shift();
      if (gate) await gate.promise;
    });
    const reportPersistenceFailure = vi.fn();
    const loadSettlementState = vi.fn(async () => ({
      complaintCases: [],
      complaintTimelines: [],
    }));
    const repository = {
      isEnabled: () => true,
      persistChanges,
      reportPersistenceFailure,
      loadSettlementState,
    } as unknown as ComplaintRepository;
    const audit = new AuditNotificationService();
    const complaintService = new ComplaintService(audit, repository);
    const incidentService = new IncidentService(audit);
    const controller = new ComplaintController(
      complaintService,
      incidentService,
      {} as never,
    );
    return {
      controller,
      complaintService,
      audit,
      persistChanges,
      reportPersistenceFailure,
      pauseWrite() {
        const gate = deferred();
        writeGates.push(gate);
        return gate;
      },
    };
  }

  it("propagates a failed ordinary note write as a rejected request instead of a success receipt", async () => {
    const context = fixtureWithGatedRepository();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Ordinary complaint for honest-ACK regression",
    });

    const gate = context.pauseWrite();
    const failure = new Error("canonical note write did not commit");
    const request = context.controller.addComplaintCaseNote(
      complaintCase.caseNo,
      { note: "Investigation note" },
    );
    const outcome = request.catch((error: unknown) => error);

    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    gate.reject(failure);

    expect(await outcome).toBe(failure);
    expect(context.reportPersistenceFailure).toHaveBeenCalledTimes(1);
  });

  it("keeps an ordinary note HTTP response pending until its canonical write actually commits", async () => {
    const context = fixtureWithGatedRepository();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "route_issue",
      severity: "normal",
      description: "Ordinary complaint for pending-ACK regression",
    });

    const gate = context.pauseWrite();
    let completed = false;
    const request = context.controller
      .addComplaintCaseNote(complaintCase.caseNo, {
        note: "Review in progress",
      })
      .then((result) => {
        completed = true;
        return result;
      });

    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    expect(completed).toBe(false);

    gate.resolve();
    const result = await request;
    expect(result.data.status).toBe("under_investigation");
    expect(completed).toBe(true);
  });

  it("rolls back a failed ordinary resolve so readback and retry see the real prior state, not the never-committed attempt", async () => {
    const context = fixtureWithGatedRepository();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Retry-after-failure regression",
    });
    // Let the create's own (ungated) write settle before gating the next
    // one; the per-case write queue would otherwise gate create's write
    // instead of the mutation under test.
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const failure = new Error("resolve write did not commit");
    const firstAttempt = context.controller
      .resolveComplaintCase(complaintCase.caseNo, {
        resolutionCode: "resolved_driver_warning",
        closingNote: "First attempt",
      })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);

    // Readback must show the real (never-committed) prior state, not the
    // failed attempt's optimistic "resolved" status.
    expect(
      context.complaintService.getComplaintCase(complaintCase.caseNo).status,
    ).toBe("new");

    // A genuine retry of the same mutation must actually re-attempt the
    // write (not silently no-op on a false "already resolved" readback).
    const retry = await context.controller.resolveComplaintCase(
      complaintCase.caseNo,
      {
        resolutionCode: "resolved_driver_warning",
        closingNote: "Retry after failure",
      },
    );
    expect(retry.data.status).toBe("resolved");
    expect(context.persistChanges).toHaveBeenCalledTimes(3);
  });

  it("rolls back a failed ordinary create so a never-committed case does not haunt reads as a phantom case", async () => {
    const context = fixtureWithGatedRepository();
    const gate = context.pauseWrite();
    const failure = new Error("create write did not commit");
    const created = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "Phantom-case regression",
    });
    const outcome = context.complaintService
      .awaitSettlementPersistence(created.caseNo)
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    gate.reject(failure);
    expect(await outcome).toBe(failure);

    expect(context.complaintService.listComplaintCases()).toHaveLength(0);
  });

  it("rolls back a failed ordinary reopen so a retried reopen on the real closed case succeeds instead of 409 COMPLAINT_NOT_CLOSED", async () => {
    const context = fixtureWithGatedRepository();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "route_issue",
      severity: "normal",
      description: "Reopen retry regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );
    context.complaintService.resolveComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_other",
      closingNote: "Resolved",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );
    context.complaintService.closeComplaintCase(complaintCase.caseNo, {
      resolutionCode: "resolved_other",
      closingNote: "Closed",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    const callsBeforeReopen = context.persistChanges.mock.calls.length;
    const gate = context.pauseWrite();
    const failure = new Error("reopen write did not commit");
    const firstAttempt = context.controller
      .reopenComplaintCase(complaintCase.caseNo, {
        reason: "First reopen attempt",
      })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(
        callsBeforeReopen + 1,
      ),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);
    expect(
      context.complaintService.getComplaintCase(complaintCase.caseNo).status,
    ).toBe("closed");

    const retry = await context.controller.reopenComplaintCase(
      complaintCase.caseNo,
      { reason: "Retry after failure" },
    );
    expect(retry.data.status).toBe("reopened");
    expect(retry.data.reopenCount).toBe(1);
  });

  it("does not record an audit entry for a failed ordinary write, but does for the eventual successful retry", async () => {
    const context = fixtureWithGatedRepository();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "lost_and_found",
      severity: "normal",
      description: "Audit-gating regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const failure = new Error("assign write did not commit");
    const firstAttempt = context.controller
      .assignComplaintCase(complaintCase.caseNo, {
        assigneeId: "AGENT-OPS-999",
      })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);

    const logsAfterFailure = context.audit.listAuditLogs();
    expect(
      logsAfterFailure.some(
        (log) => log.actionName === "assign_complaint_case",
      ),
    ).toBe(false);

    const retry = await context.controller.assignComplaintCase(
      complaintCase.caseNo,
      { assigneeId: "AGENT-OPS-999" },
    );
    expect(retry.data.assigneeId).toBe("AGENT-OPS-999");
    const logsAfterSuccess = context.audit.listAuditLogs();
    expect(
      logsAfterSuccess.filter(
        (log) => log.actionName === "assign_complaint_case",
      ),
    ).toHaveLength(1);
  });
});

describe("C045-F3: ordinary complaint case + timeline writes commit atomically", () => {
  it("rolls back the case insert when the timeline insert in the same ordinary write fails", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql.trim().split("\n")[0]!.trim());
        if (sql.includes("INSERT INTO crm.phase1_complaint_timelines")) {
          throw new Error("timeline insert failed");
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const databaseService = {
      isEnabled: () => true,
      connect: vi.fn(async () => client),
    };
    const { ComplaintRepository } =
      await import("../../../apps/api/src/modules/complaint/complaint.repository");
    const repository = new ComplaintRepository(databaseService as never);

    const now = new Date().toISOString();
    await expect(
      repository.persistChanges({
        complaintCases: [
          {
            caseNo: "C-TXN-TEST-1",
            caseSource: "ops",
            relatedOrderId: null,
            relatedCallId: null,
            relatedIncidentId: null,
            category: "other",
            severity: "normal",
            description: "Transaction atomicity regression",
            assigneeId: null,
            status: "new",
            slaDueAt: now,
            slaBreach: false,
            reopenCount: 0,
            resolutionCode: null,
            closingNote: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        complaintTimelines: [
          {
            entryId: "complaint-timeline-txn-test-1",
            caseNo: "C-TXN-TEST-1",
            action: "case_created",
            note: "created",
            createdAt: now,
          },
        ],
      }),
    ).rejects.toThrow();

    expect(queries).toContain("BEGIN");
    expect(queries).toContain("ROLLBACK");
    expect(queries).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe("C045-F3: ComplaintCommitOutcomeUnknownError retry resends instead of allocating a second case or no-opping", () => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { promise, resolve, reject };
  }

  function fixtureWithGatedRepository() {
    const writeGates: ReturnType<typeof deferred>[] = [];
    const persistChanges = vi.fn(async () => {
      const gate = writeGates.shift();
      if (gate) await gate.promise;
    });
    const reportPersistenceFailure = vi.fn();
    const loadSettlementState = vi.fn(async () => ({
      complaintCases: [],
      complaintTimelines: [],
    }));
    const repository = {
      isEnabled: () => true,
      persistChanges,
      reportPersistenceFailure,
      loadSettlementState,
    } as unknown as ComplaintRepository;
    const audit = new AuditNotificationService();
    const complaintService = new ComplaintService(audit, repository);
    return {
      complaintService,
      audit,
      persistChanges,
      pauseWrite() {
        const gate = deferred();
        writeGates.push(gate);
        return gate;
      },
    };
  }

  it("retries createComplaintCase with the same command after an uncertain-commit create, reusing the pending caseNo instead of inserting a second case", async () => {
    const context = fixtureWithGatedRepository();
    const command = {
      caseSource: "ops" as const,
      category: "driver_service" as const,
      severity: "normal" as const,
      description: "Uncertain-commit create retry regression",
    };

    const gate = context.pauseWrite();
    const firstAttempt = context.complaintService.createComplaintCase(command);
    const outcome = context.complaintService
      .awaitSettlementPersistence(firstAttempt.caseNo)
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("create COMMIT outcome unknown"),
    );
    gate.reject(failure);
    expect(await outcome).toBe(failure);

    // The uncertain case is not rolled back (its commit may have actually
    // landed), and a retry with the same command must reuse its caseNo
    // rather than minting a second one.
    expect(context.complaintService.listComplaintCases()).toHaveLength(1);

    const retryGate = context.pauseWrite();
    const retryAttempt = context.complaintService.createComplaintCase(command);
    expect(retryAttempt.caseNo).toBe(firstAttempt.caseNo);
    retryGate.resolve();
    await context.complaintService.awaitSettlementPersistence(
      retryAttempt.caseNo,
    );

    expect(context.persistChanges).toHaveBeenCalledTimes(2);
    expect(context.complaintService.listComplaintCases()).toHaveLength(1);
    expect(
      context.complaintService.getComplaintTimeline(retryAttempt.caseNo),
    ).toHaveLength(1);
  });

  it("retries resolveComplaintCase on an uncertain-commit case instead of no-opping on its optimistic 'resolved' readback", async () => {
    const context = fixtureWithGatedRepository();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Uncertain-commit resolve retry regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const firstAttempt = context.complaintService.resolveComplaintCase(
      complaintCase.caseNo,
      {
        resolutionCode: "resolved_driver_warning",
        closingNote: "First attempt",
      },
    );
    const outcome = context.complaintService
      .awaitSettlementPersistence(complaintCase.caseNo)
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("resolve COMMIT outcome unknown"),
    );
    gate.reject(failure);
    expect(await outcome).toBe(failure);

    // The optimistic "resolved" status is not rolled back for an unknown
    // commit outcome.
    expect(firstAttempt.status).toBe("resolved");
    expect(
      context.complaintService.getComplaintCase(complaintCase.caseNo).status,
    ).toBe("resolved");

    const retryGate = context.pauseWrite();
    const retry = context.complaintService.resolveComplaintCase(
      complaintCase.caseNo,
      {
        resolutionCode: "resolved_driver_warning",
        closingNote: "Retry after uncertain commit",
      },
    );
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(3),
    );
    retryGate.resolve();
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    expect(retry.status).toBe("resolved");
    const logs = context.audit.listAuditLogs();
    expect(
      logs.filter((log) => log.actionName === "resolve_complaint_case"),
    ).toHaveLength(1);
  });
});

// Root ca237 review follow-up (2026-10-18): the six unknown-COMMIT findings
// left unfixed by ca237ed9d, plus the captureAudit shape bug it introduced
// in every retryUncertainComplaintWrite call site.
describe("Root ca237 follow-up: readback reconciliation, link/SLA/escalation retry, failed-retry-preserves-uncertainty, note/assign dedup, captureAudit shape", () => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { promise, resolve, reject };
  }

  function fixture(repositoryOverrides: Record<string, unknown> = {}) {
    const writeGates: ReturnType<typeof deferred>[] = [];
    const persistChanges = vi.fn(async () => {
      const gate = writeGates.shift();
      if (gate) await gate.promise;
    });
    const loadCaseByCaseNo = vi.fn(
      async (): Promise<ComplaintCaseRecord | null> => null,
    );
    const repository = {
      isEnabled: () => true,
      persistChanges,
      reportPersistenceFailure: vi.fn(),
      loadSettlementState: vi.fn(async () => ({
        complaintCases: [],
        complaintTimelines: [],
      })),
      loadCaseByCaseNo,
      ...repositoryOverrides,
    } as unknown as ComplaintRepository;
    const audit = new AuditNotificationService();
    const complaintService = new ComplaintService(audit, repository);
    const incidentService = new IncidentService(audit);
    const controller = new ComplaintController(
      complaintService,
      incidentService,
      {} as never,
    );
    return {
      controller,
      complaintService,
      incidentService,
      audit,
      persistChanges,
      loadCaseByCaseNo,
      pauseWrite() {
        const gate = deferred();
        writeGates.push(gate);
        return gate;
      },
    };
  }

  it("C045-F3-20261018-READBACK: reconciles an unknown-commit close back to the real prior state once the durable store proves it never landed", async () => {
    const context = fixture();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Readback reconciliation regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );
    const priorDurable = context.complaintService.getComplaintCase(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("close COMMIT outcome unknown"),
    );
    const firstAttempt = context.controller
      .closeComplaintCase(complaintCase.caseNo, {
        resolutionCode: "resolved_driver_warning",
        closingNote: "Closed",
      })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);

    // Before reconciliation, a second raw readback still looks closed.
    expect(
      context.complaintService.getComplaintCase(complaintCase.caseNo).status,
    ).toBe("closed");

    // The durable store proves the close never landed.
    context.loadCaseByCaseNo.mockResolvedValue(priorDurable);
    await context.complaintService.refreshSettlementCases();

    expect(
      context.complaintService.getComplaintCase(complaintCase.caseNo).status,
    ).toBe("new");
    expect(
      context.complaintService.getComplaintExportView(complaintCase.caseNo)
        .readyForAudit,
    ).toBe(false);

    // A genuine retry now actually re-attempts the write instead of reading
    // a never-committed "closed" case as done.
    const retry = await context.controller.closeComplaintCase(
      complaintCase.caseNo,
      { resolutionCode: "resolved_driver_warning", closingNote: "Closed" },
    );
    expect(retry.data.status).toBe("closed");
  });

  it("C045-F3-20261018-READBACK: clears the pending marker without re-attempting the write once the durable store proves the close did land", async () => {
    const context = fixture();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Readback confirmed-commit regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("close COMMIT outcome unknown"),
    );
    const firstAttempt = context.controller
      .closeComplaintCase(complaintCase.caseNo, {
        resolutionCode: "resolved_driver_warning",
        closingNote: "Closed",
      })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);

    const closedSnapshot = context.complaintService.getComplaintCase(
      complaintCase.caseNo,
    );
    context.loadCaseByCaseNo.mockResolvedValue(closedSnapshot);
    await context.complaintService.refreshSettlementCases();

    const callsAfterReconcile = context.persistChanges.mock.calls.length;
    const ack = await context.controller.closeComplaintCase(
      complaintCase.caseNo,
      { resolutionCode: "resolved_driver_warning", closingNote: "Closed" },
    );
    expect(ack.data.status).toBe("closed");
    expect(context.persistChanges).toHaveBeenCalledTimes(callsAfterReconcile);
  });

  it("C045-F3-20261018-LINK-SLA-RETRY: a linkIncident retry actually re-attempts persistence after reconciliation, instead of a 0-write success replay", async () => {
    const context = fixture();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Link retry regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );
    const preLinkDurable = context.complaintService.getComplaintCase(
      complaintCase.caseNo,
    );
    const incident = context.incidentService.createIncident({
      title: "Existing incident",
      description: "Pre-existing incident to link",
      category: "operational",
      severity: "medium",
      reportedBy: "ops-1",
    });

    const gate = context.pauseWrite();
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("link COMMIT outcome unknown"),
    );
    const firstAttempt = context.controller
      .linkIncident(complaintCase.caseNo, { incidentId: incident.incidentId })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);

    // The durable store proves the link never landed.
    context.loadCaseByCaseNo.mockResolvedValue(preLinkDurable);

    const retry = await context.controller.linkIncident(complaintCase.caseNo, {
      incidentId: incident.incidentId,
    });
    expect(retry.data.relatedIncidentId).toBe(incident.incidentId);
    // The precheck's refreshSettlementCases() reconciled the case before the
    // retry decided anything, so this is a genuine third persistChanges call
    // (create, first link attempt, retried link), not a 0-write replay.
    expect(context.persistChanges).toHaveBeenCalledTimes(3);
  });

  it("C045-F3-20261018-LINK-SLA-RETRY: a markComplaintSlaBreach retry actually re-attempts persistence and the delayed notification after reconciliation", async () => {
    const context = fixture();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "SLA breach retry regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );
    const preBreachDurable = context.complaintService.getComplaintCase(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("sla-breach COMMIT outcome unknown"),
    );
    const firstAttempt = context.controller
      .markComplaintSlaBreach(complaintCase.caseNo)
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);

    context.loadCaseByCaseNo.mockResolvedValue(preBreachDurable);

    const retry = await context.controller.markComplaintSlaBreach(
      complaintCase.caseNo,
    );
    expect(retry.data.slaBreach).toBe(true);
    expect(context.persistChanges).toHaveBeenCalledTimes(3);
    const notices = context.audit
      .listNotifications()
      .filter((n) => n.title === "Complaint SLA breached");
    expect(notices).toHaveLength(1);
  });

  it("C045-F3-20261018-ESCALATION-CALLER: a controller-level escalation retry recovers after reconciliation instead of being blocked by its own optimistic precheck", async () => {
    const context = fixture();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "high",
      description: "Escalation retry regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );
    const preEscalateDurable = context.complaintService.getComplaintCase(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("escalate COMMIT outcome unknown"),
    );
    const firstAttempt = context.controller
      .escalateToIncident(complaintCase.caseNo, {
        title: "Safety escalation",
        severity: "high",
        reason: "Driver conduct requires investigation",
      })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);

    // The mounted precheck still sees the optimistic (never-confirmed) link
    // before reconciliation.
    expect(
      context.complaintService.getComplaintCase(complaintCase.caseNo)
        .relatedIncidentId,
    ).not.toBeNull();

    // The durable store proves the escalation never landed.
    context.loadCaseByCaseNo.mockResolvedValue(preEscalateDurable);

    const retry = await context.controller.escalateToIncident(
      complaintCase.caseNo,
      {
        title: "Safety escalation",
        severity: "high",
        reason: "Driver conduct requires investigation, retried",
      },
    );
    expect(retry.data.complaintCase.relatedIncidentId).toBe(
      retry.data.incident.incidentId,
    );
  });

  it("C045-F3-20261018-UNKNOWN-THEN-FAILED-RETRY: a failed retry does not erase the still-unknown original, so a third attempt recovers the same case instead of minting a duplicate", async () => {
    const context = fixture();
    const command = {
      caseSource: "ops" as const,
      category: "driver_service" as const,
      severity: "normal" as const,
      description: "Unknown-then-failed-retry regression",
    };

    const gate1 = context.pauseWrite();
    const firstAttempt = context.complaintService.createComplaintCase(command);
    const outcome1 = context.complaintService
      .awaitSettlementPersistence(firstAttempt.caseNo)
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    const unknownFailure = new ComplaintCommitOutcomeUnknownError(
      new Error("create COMMIT outcome unknown"),
    );
    gate1.reject(unknownFailure);
    expect(await outcome1).toBe(unknownFailure);

    // Retry #2 (same command) reuses the pending caseNo but fails with a
    // DEFINITE error this time; that failure must not prove the first
    // attempt rolled back.
    const gate2 = context.pauseWrite();
    const retry2 = context.complaintService.createComplaintCase(command);
    expect(retry2.caseNo).toBe(firstAttempt.caseNo);
    const outcome2 = context.complaintService
      .awaitSettlementPersistence(retry2.caseNo)
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    const definiteFailure = new Error("connection reset");
    gate2.reject(definiteFailure);
    expect(await outcome2).toBe(definiteFailure);

    // The case is NOT rolled back/removed by the second attempt's own
    // definite failure.
    expect(context.complaintService.listComplaintCases()).toHaveLength(1);
    expect(context.complaintService.listComplaintCases()[0]!.caseNo).toBe(
      firstAttempt.caseNo,
    );

    // Retry #3 (same command) still recognizes the original pending attempt
    // and reuses its caseNo instead of allocating a second case.
    const gate3 = context.pauseWrite();
    const retry3 = context.complaintService.createComplaintCase(command);
    expect(retry3.caseNo).toBe(firstAttempt.caseNo);
    gate3.resolve();
    await context.complaintService.awaitSettlementPersistence(retry3.caseNo);

    expect(context.complaintService.listComplaintCases()).toHaveLength(1);
    expect(
      context.complaintService.getComplaintTimeline(retry3.caseNo),
    ).toHaveLength(1);
  });

  it("C045-F3-20261018-NOTE-REPLAY: an unknown-commit note retry recovers the same timeline entry instead of minting a second one", async () => {
    const context = fixture();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Note replay regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("note COMMIT outcome unknown"),
    );
    const firstAttempt = context.controller
      .addComplaintCaseNote(complaintCase.caseNo, { note: "Called driver" })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);

    // A same-content retry (e.g. a Fleet idempotency-key resend) actually
    // re-attempts the write (recovering the same pending entry instead of
    // appending a second canonical row) and only acknowledges once that
    // retry itself commits.
    const retryGate = context.pauseWrite();
    const retryPromise = context.controller.addComplaintCaseNote(
      complaintCase.caseNo,
      { note: "Called driver" },
    );
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(3),
    );
    retryGate.resolve();
    const retry = await retryPromise;
    expect(retry.data.status).toBe("under_investigation");
    expect(
      context.complaintService.getComplaintTimeline(complaintCase.caseNo),
    ).toHaveLength(2); // case_created + the single note, not two notes

    // A genuinely different note is never swallowed as a duplicate retry.
    const distinctNote = await context.controller.addComplaintCaseNote(
      complaintCase.caseNo,
      { note: "Driver confirmed pickup location" },
    );
    expect(distinctNote.data.status).toBe("under_investigation");
    expect(
      context.complaintService.getComplaintTimeline(complaintCase.caseNo),
    ).toHaveLength(3);
  });

  it("C045-F3-20261018-NOTE-REPLAY: an unknown-commit assign retry recovers the same timeline entry instead of minting a second one", async () => {
    const context = fixture();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Assign replay regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("assign COMMIT outcome unknown"),
    );
    const firstAttempt = context.controller
      .assignComplaintCase(complaintCase.caseNo, {
        assigneeId: "AGENT-OPS-001",
      })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);

    // A same-content retry actually re-attempts the write (recovering the
    // same pending entry instead of appending a second canonical row) and
    // only acknowledges once that retry itself commits.
    const retryGate = context.pauseWrite();
    const retryPromise = context.controller.assignComplaintCase(
      complaintCase.caseNo,
      { assigneeId: "AGENT-OPS-001" },
    );
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(3),
    );
    retryGate.resolve();
    const retry = await retryPromise;
    expect(retry.data.assigneeId).toBe("AGENT-OPS-001");
    expect(
      context.complaintService.getComplaintTimeline(complaintCase.caseNo),
    ).toHaveLength(2); // case_created + the single assignment, not two
  });

  it("C045-F3-20261018-NOTE-FALSE-ACK: a note retry whose own commit is still unknown rejects instead of returning a fabricated success receipt", async () => {
    const context = fixture();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "Note false-ACK regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const failure = new ComplaintCommitOutcomeUnknownError(
      new Error("note COMMIT outcome unknown"),
    );
    const firstAttempt = context.controller
      .addComplaintCaseNote(complaintCase.caseNo, { note: "Called driver" })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    gate.reject(failure);
    expect(await firstAttempt).toBe(failure);

    // The durable read used to reconcile the pending marker also fails (e.g.
    // a connectivity blip), so the retry cannot prove either outcome.
    context.loadCaseByCaseNo.mockRejectedValueOnce(
      new Error("read failed during reconciliation"),
    );

    // An identical replay must not be acknowledged as a success while its
    // own commit is unresolved: before the ca237/root fix,
    // acknowledgePendingUncertainCommit returned the pending snapshot
    // synchronously (with a fresh audit entry) with no new write and no
    // confirmation the original commit ever landed.
    const retryGate = context.pauseWrite();
    const retryPromise = context.controller.addComplaintCaseNote(
      complaintCase.caseNo,
      { note: "Called driver" },
    );
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(3),
    );
    const retryFailure = new ComplaintCommitOutcomeUnknownError(
      new Error("note retry COMMIT outcome unknown"),
    );
    retryGate.reject(retryFailure);

    await expect(retryPromise).rejects.toBe(retryFailure);
    // No duplicate note/audit was minted for the still-unresolved retry.
    expect(
      context.complaintService.getComplaintTimeline(complaintCase.caseNo),
    ).toHaveLength(2); // case_created + the single pending note
  });

  it("TypeError regression (Root ca237 review): a controller-driven resolve retry after an unknown commit returns a real action receipt instead of crashing on an undefined auditLog", async () => {
    const context = fixture();
    const complaintCase = context.complaintService.createComplaintCase({
      caseSource: "ops",
      category: "driver_service",
      severity: "normal",
      description: "captureAudit shape regression",
    });
    await context.complaintService.awaitSettlementPersistence(
      complaintCase.caseNo,
    );

    const gate = context.pauseWrite();
    const unknownFailure = new ComplaintCommitOutcomeUnknownError(
      new Error("resolve COMMIT outcome unknown"),
    );
    const firstAttempt = context.controller
      .resolveComplaintCase(complaintCase.caseNo, {
        resolutionCode: "resolved_driver_warning",
        closingNote: "First attempt",
      })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(2),
    );
    gate.reject(unknownFailure);
    expect(await firstAttempt).toBe(unknownFailure);

    // Before ca237's fix, this retry's pending branch returned a bare
    // ComplaintCaseRecord cast to the captureAudit shape; the controller's
    // `updated.data` / `updated.auditLog` were then undefined, and
    // toActionReceipt({ auditLog: undefined, ... }) threw
    // "Cannot read properties of undefined (reading 'resourceType')" even
    // though the case was already durably resolved.
    const retryGate = context.pauseWrite();
    const retryPromise = context.controller.resolveComplaintCase(
      complaintCase.caseNo,
      {
        resolutionCode: "resolved_driver_warning",
        closingNote: "Retry after uncertain commit",
      },
    );
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(3),
    );
    retryGate.resolve();
    const retry = await retryPromise;

    expect(retry.data.status).toBe("resolved");
    expect(retry.meta.actionReceipt.resourceType).toBe("complaint_case");
    expect(retry.meta.actionReceipt.resourceId).toBe(complaintCase.caseNo);
    expect(retry.meta.actionReceipt.status).toBe("completed");
  });
});
