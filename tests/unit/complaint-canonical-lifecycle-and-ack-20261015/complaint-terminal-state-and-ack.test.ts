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
});
