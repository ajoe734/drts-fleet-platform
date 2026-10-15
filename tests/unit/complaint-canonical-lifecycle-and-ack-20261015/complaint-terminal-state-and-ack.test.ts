import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import type { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";

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
    const replay = complaintService.resolveComplaintCase(
      complaintCase.caseNo,
      {
        resolutionCode: "resolved_other",
        closingNote: "Retried resolve request",
      },
    );
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
      .addComplaintCaseNote(complaintCase.caseNo, { note: "Review in progress" })
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
      logsAfterFailure.some((log) => log.actionName === "assign_complaint_case"),
    ).toBe(false);

    const retry = await context.controller.assignComplaintCase(
      complaintCase.caseNo,
      { assigneeId: "AGENT-OPS-999" },
    );
    expect(retry.data.assigneeId).toBe("AGENT-OPS-999");
    const logsAfterSuccess = context.audit.listAuditLogs();
    expect(
      logsAfterSuccess.filter((log) => log.actionName === "assign_complaint_case"),
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
    const { ComplaintRepository } = await import(
      "../../../apps/api/src/modules/complaint/complaint.repository"
    );
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
