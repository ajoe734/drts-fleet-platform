import { describe, expect, it, vi } from "vitest";
import type {
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintTimelineEntry,
} from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterController } from "../../../apps/api/src/modules/callcenter/callcenter.controller";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { buildSettlementDisputeCase } from "../../../apps/api/src/modules/complaint/settlement-dispute";
import { IncidentController } from "../../../apps/api/src/modules/incident/incident.controller";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";

type ComplaintState = {
  complaintCases: ComplaintCaseRecord[];
  complaintTimelines: ComplaintTimelineEntry[];
};
type ComplaintChanges = {
  complaintCases?: readonly ComplaintCaseRecord[];
  complaintTimelines?: readonly ComplaintTimelineEntry[];
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function settlement(status: ComplaintCaseStatus = "new"): ComplaintState {
  const state = buildSettlementDisputeCase({
    fleetPartnerId: "fleet-persistence-test",
    statementId: "statement-persistence-test",
    reason: "Missing trips",
    actorId: "fleet-manager",
    at: "2020-01-01T00:00:00.000Z",
  });
  state.complaintCases[0]!.status = status;
  if (status === "closed" || status === "resolved") {
    state.complaintCases[0]!.resolutionCode = "resolved_with_refund";
    state.complaintCases[0]!.closingNote = "Adjustment agreed";
  }
  return state;
}

function fixture(initial = settlement()) {
  const committed = structuredClone(initial);
  const writeGates: ReturnType<typeof deferred>[] = [];
  const readGates: ReturnType<typeof deferred>[] = [];
  const persistChanges = vi.fn(async (changes: ComplaintChanges) => {
    const gate = writeGates.shift();
    if (gate) await gate.promise;
    for (const item of changes.complaintCases ?? []) {
      committed.complaintCases = [
        ...committed.complaintCases.filter(
          (existing) => existing.caseNo !== item.caseNo,
        ),
        structuredClone(item),
      ];
    }
    for (const item of changes.complaintTimelines ?? []) {
      committed.complaintTimelines = [
        ...committed.complaintTimelines.filter(
          (existing) => existing.entryId !== item.entryId,
        ),
        structuredClone(item),
      ];
    }
  });
  const loadSettlementState = vi.fn(async () => {
    const snapshot = structuredClone(committed);
    const gate = readGates.shift();
    if (gate) await gate.promise;
    return snapshot;
  });
  const reportPersistenceFailure = vi.fn();
  const repository = {
    isEnabled: () => true,
    loadSettlementState,
    persistChanges,
    reportPersistenceFailure,
  } as unknown as ComplaintRepository;
  const audit = new AuditNotificationService();
  const service = new ComplaintService(audit, repository);
  const incidentService = new IncidentService(audit);
  const controller = new ComplaintController(
    service,
    incidentService,
    {} as never,
  );
  return {
    service,
    controller,
    incidentService,
    repository,
    persistChanges,
    loadSettlementState,
    reportPersistenceFailure,
    caseNo: initial.complaintCases[0]!.caseNo,
    committed: () => structuredClone(committed),
    pauseWrite() {
      const gate = deferred();
      writeGates.push(gate);
      return gate;
    },
    pauseRead() {
      const gate = deferred();
      readGates.push(gate);
      return gate;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;
const mutationCases: {
  name: string;
  status?: ComplaintCaseStatus;
  action: (context: Fixture) => Promise<unknown>;
  expected: Partial<ComplaintCaseRecord>;
  timelineAction: string;
}[] = [
  {
    name: "assign",
    action: ({ controller, caseNo }) =>
      controller.assignComplaintCase(caseNo, { assigneeId: "billing-ops" }),
    expected: { assigneeId: "billing-ops", status: "assigned" },
    timelineAction: "case_assigned",
  },
  {
    name: "note",
    action: ({ controller, caseNo }) =>
      controller.addComplaintCaseNote(caseNo, {
        note: "Trip receipts requested",
      }),
    expected: { status: "under_investigation" },
    timelineAction: "case_note_added",
  },
  {
    name: "resolve",
    action: ({ controller, caseNo }) =>
      controller.resolveComplaintCase(caseNo, {
        resolutionCode: "resolved_with_refund",
        closingNote: "Adjustment approved",
      }),
    expected: { status: "resolved", closingNote: "Adjustment approved" },
    timelineAction: "case_resolved",
  },
  {
    name: "close",
    action: ({ controller, caseNo }) =>
      controller.closeComplaintCase(caseNo, {
        resolutionCode: "resolved_with_refund",
        closingNote: "Adjustment completed",
      }),
    expected: { status: "closed", closingNote: "Adjustment completed" },
    timelineAction: "case_closed",
  },
  {
    name: "reopen",
    status: "closed",
    action: ({ controller, caseNo }) =>
      controller.reopenComplaintCase(caseNo, { reason: "New trip receipt" }),
    expected: { status: "reopened", reopenCount: 1 },
    timelineAction: "case_reopened",
  },
  {
    name: "mark SLA breach",
    action: ({ controller, caseNo }) =>
      controller.markComplaintSlaBreach(caseNo),
    expected: { slaBreach: true },
    timelineAction: "sla_breached",
  },
  {
    name: "evaluate overdue SLA",
    action: ({ controller }) => controller.evaluateAllSlaBreach(),
    expected: { slaBreach: true },
    timelineAction: "sla_breached",
  },
  {
    name: "escalate to incident",
    action: ({ controller, caseNo }) =>
      controller.escalateToIncident(caseNo, {
        title: "Settlement escalation",
        reason: "Requires supervisor",
        severity: "medium",
      }),
    expected: { relatedIncidentId: expect.any(String) },
    timelineAction: "escalated_to_incident",
  },
  {
    name: "link incident",
    action: ({ controller, caseNo, incidentService }) => {
      const incident = incidentService.createIncident({
        title: "Existing incident",
        description: "Review",
        severity: "medium",
        category: "operational",
        reportedBy: "ops",
      });
      return controller.linkIncident(caseNo, {
        incidentId: incident.incidentId,
      });
    },
    expected: { relatedIncidentId: expect.any(String) },
    timelineAction: "incident_linked",
  },
];

describe("settlement complaint commit and refresh boundaries", () => {
  it.each(mutationCases)(
    "keeps $name HTTP success pending until case and timeline are committed",
    async ({ action, status, expected, timelineAction }) => {
      const context = fixture(settlement(status));
      const gate = context.pauseWrite();
      let acknowledged = false;
      const request = action(context).then((response) => {
        acknowledged = true;
        return response;
      });
      await vi.waitFor(() =>
        expect(context.persistChanges).toHaveBeenCalledTimes(1),
      );
      expect(acknowledged).toBe(false);
      expect(context.committed().complaintTimelines).toHaveLength(1);
      gate.resolve();
      await request;
      const detail = await context.controller.getComplaintCase(context.caseNo);
      expect(detail.data).toMatchObject(expected);
      const timeline = await context.controller.getComplaintTimeline(
        context.caseNo,
      );
      expect(timeline.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: timelineAction }),
        ]),
      );
      const fresh = new ComplaintService(
        new AuditNotificationService(),
        context.repository,
      );
      await fresh.refreshSettlementCases();
      expect(fresh.getComplaintCase(context.caseNo)).toMatchObject(expected);
      expect(fresh.getComplaintTimeline(context.caseNo)).toEqual(
        timeline.data.items,
      );
    },
  );

  it("makes an overlapping GET wait for an in-flight note instead of restoring the old case", async () => {
    const context = fixture();
    const gate = context.pauseWrite();
    const request = context.controller.addComplaintCaseNote(context.caseNo, {
      note: "Receipt received",
    });
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    const readsBefore = context.loadSettlementState.mock.calls.length;
    let readCompleted = false;
    const reading = context.controller
      .getComplaintCase(context.caseNo)
      .then((result) => {
        readCompleted = true;
        return result;
      });
    await Promise.resolve();
    await Promise.resolve();
    expect(readCompleted).toBe(false);
    expect(context.loadSettlementState).toHaveBeenCalledTimes(readsBefore);
    expect(context.service.getComplaintCase(context.caseNo).status).toBe(
      "under_investigation",
    );
    gate.resolve();
    await request;
    expect((await reading).data.status).toBe("under_investigation");
    expect(
      (
        await context.controller.getComplaintTimeline(context.caseNo)
      ).data.items.at(-1)?.note,
    ).toBe("Receipt received");
  });

  it("rereads a stale snapshot when a shared caller mutates the case during its DB read", async () => {
    const context = fixture();
    await context.service.refreshSettlementCases();
    const readGate = context.pauseRead();
    const writeGate = context.pauseWrite();
    const refreshing = context.service.refreshSettlementCases();
    await vi.waitFor(() =>
      expect(context.loadSettlementState).toHaveBeenCalledTimes(2),
    );
    context.service.addComplaintCaseNote(context.caseNo, {
      note: "Note arriving during read",
    });
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    readGate.resolve();
    await Promise.resolve();
    expect(context.service.getComplaintCase(context.caseNo).status).toBe(
      "under_investigation",
    );
    expect(context.loadSettlementState).toHaveBeenCalledTimes(2);
    writeGate.resolve();
    await refreshing;
    expect(context.loadSettlementState).toHaveBeenCalledTimes(3);
    expect(
      context.service.getComplaintTimeline(context.caseNo).at(-1)?.note,
    ).toBe("Note arriving during read");
  });

  it("serializes overlapping mutations for the same settlement case", async () => {
    const context = fixture();
    await context.service.refreshSettlementCases();
    const firstGate = context.pauseWrite();
    context.service.assignComplaintCase(context.caseNo, {
      assigneeId: "billing-ops",
    });
    context.service.addComplaintCaseNote(context.caseNo, {
      note: "Evidence reviewed",
    });
    const committed = context.service.awaitSettlementPersistence(
      context.caseNo,
    );
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    firstGate.resolve();
    await committed;
    expect(context.persistChanges).toHaveBeenCalledTimes(2);
    await context.service.refreshSettlementCases();
    expect(context.service.getComplaintCase(context.caseNo)).toMatchObject({
      assigneeId: "billing-ops",
      status: "under_investigation",
    });
    expect(
      context.service
        .getComplaintTimeline(context.caseNo)
        .map((entry) => entry.action),
    ).toEqual(["case_created", "case_assigned", "case_note_added"]);
  });

  it("rejects failed persistence and reloads committed state before a real retry", async () => {
    const context = fixture();
    const gate = context.pauseWrite();
    const failure = new Error("settlement CRM write failed");
    const request = context.controller.addComplaintCaseNote(context.caseNo, {
      note: "Retry this note",
    });
    const outcome = request.catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    gate.reject(failure);
    expect(await outcome).toBe(failure);
    expect(context.reportPersistenceFailure).toHaveBeenCalledWith(
      failure,
      "add_complaint_case_note",
    );
    expect(
      (await context.controller.getComplaintCase(context.caseNo)).data.status,
    ).toBe("new");
    expect(
      (await context.controller.getComplaintTimeline(context.caseNo)).data
        .items,
    ).toHaveLength(1);
    await context.controller.addComplaintCaseNote(context.caseNo, {
      note: "Retry this note",
    });
    expect(context.persistChanges).toHaveBeenCalledTimes(2);
    expect(
      (
        await context.controller.getComplaintTimeline(context.caseNo)
      ).data.items.filter((entry) => entry.note === "Retry this note"),
    ).toHaveLength(1);
  });

  it("COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015 (C045-F3): preserves ordinary complaint synchronous mutation while honestly propagating and rolling back its persistence failure", async () => {
    const state = settlement();
    state.complaintCases[0]!.category = "other";
    const context = fixture(state);
    // Ordinary persisted state is hydrated through the existing initialization path.
    const loadState = vi.fn(async () => structuredClone(state));
    Object.assign(context.repository, { loadState });
    await context.service.onModuleInit();
    const gate = context.pauseWrite();
    const updated = context.service.addComplaintCaseNote(context.caseNo, {
      note: "Ordinary note",
    });
    // The in-memory mutation is still applied synchronously (no await needed
    // to read it back locally) ...
    expect(updated.status).toBe("under_investigation");
    expect(updated).not.toBeInstanceOf(Promise);
    expect(context.committed().complaintCases[0]!.status).toBe("new");

    // ... but, unlike the former best-effort/fire-and-forget behavior, the
    // existing awaitSettlementPersistence seam now also honestly observes an
    // ordinary case's canonical write outcome instead of resolving as if it
    // had already committed.
    const failure = new Error("ordinary persistence unavailable");
    const awaited = context.service.awaitSettlementPersistence(context.caseNo);
    gate.reject(failure);
    await expect(awaited).rejects.toThrow("ordinary persistence unavailable");
    expect(context.reportPersistenceFailure).toHaveBeenCalledTimes(1);
    // A known (not "unknown-outcome") failure rolls the optimistic mutation
    // back rather than leaving it applied in memory, so readback and a
    // retry both see the real, uncommitted state.
    expect(context.service.getComplaintCase(context.caseNo).status).toBe("new");
  });

  it("keeps a Callcenter settlement transfer and its session link pending until commit", async () => {
    const context = fixture();
    const linkCaseToCallSession = vi.fn(
      (callId: string, linkedCaseNo: string) => ({ callId, linkedCaseNo }),
    );
    const callcenter = {
      getCallSession: vi.fn(() => ({ linkedOrderId: null })),
      linkCaseToCallSession,
    };
    const controller = new CallcenterController(
      callcenter as never,
      context.service,
      context.incidentService,
      {} as never,
    );
    const gate = context.pauseWrite();
    let completed = false;
    const request = controller
      .transferCallToComplaint("call-settlement", {
        category: "settlement_dispute",
        severity: "normal",
        description: "Settlement question by phone",
      })
      .then((result) => {
        completed = true;
        return result;
      });
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    expect(completed).toBe(false);
    expect(linkCaseToCallSession).not.toHaveBeenCalled();
    gate.resolve();
    const result = await request;
    expect(linkCaseToCallSession).toHaveBeenCalledWith(
      "call-settlement",
      result.data.complaintCase.caseNo,
      undefined,
    );
    expect(context.committed().complaintCases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseNo: result.data.complaintCase.caseNo,
          relatedCallId: "call-settlement",
        }),
      ]),
    );
  });

  it("rejects a failed Callcenter settlement transfer before linking its session", async () => {
    const context = fixture();
    const linkCaseToCallSession = vi.fn();
    const controller = new CallcenterController(
      {
        getCallSession: () => ({ linkedOrderId: null }),
        linkCaseToCallSession,
      } as never,
      context.service,
      context.incidentService,
      {} as never,
    );
    const gate = context.pauseWrite();
    const failure = new Error("phone settlement write failed");
    const request = controller.transferCallToComplaint("call-settlement", {
      category: "settlement_dispute",
      severity: "normal",
      description: "Settlement question",
    });
    const outcome = request.catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    gate.reject(failure);
    expect(await outcome).toBe(failure);
    expect(linkCaseToCallSession).not.toHaveBeenCalled();
    expect(context.committed().complaintCases).toHaveLength(1);
  });

  it("COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015 (C045-F3): keeps an ordinary Callcenter transfer pending until its canonical write commits", async () => {
    const context = fixture();
    const linkCaseToCallSession = vi.fn(
      (callId: string, linkedCaseNo: string) => ({ callId, linkedCaseNo }),
    );
    const controller = new CallcenterController(
      {
        getCallSession: () => ({ linkedOrderId: null }),
        linkCaseToCallSession,
      } as never,
      context.service,
      context.incidentService,
      {} as never,
    );
    const gate = context.pauseWrite();
    let completed = false;
    const request = controller
      .transferCallToComplaint("call-ordinary", {
        category: "driver_service",
        severity: "normal",
        description: "Driver service question",
      })
      .then((result) => {
        completed = true;
        return result;
      });
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    // The former best-effort behavior reported this ordinary transfer as
    // committed before its canonical write settled. It must now stay
    // pending, exactly like the existing settlement-case transfer above.
    expect(completed).toBe(false);
    expect(linkCaseToCallSession).not.toHaveBeenCalled();
    gate.resolve();
    const result = await request;
    expect(result.data.complaintCase.category).toBe("driver_service");
    expect(linkCaseToCallSession).toHaveBeenCalledTimes(1);
    // The fixture's default settlement case plus the newly committed
    // ordinary case.
    expect(context.committed().complaintCases).toHaveLength(2);
  });

  it("COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015 (C045-F3): rejects a failed ordinary Callcenter transfer before linking its session", async () => {
    const context = fixture();
    const linkCaseToCallSession = vi.fn();
    const controller = new CallcenterController(
      {
        getCallSession: () => ({ linkedOrderId: null }),
        linkCaseToCallSession,
      } as never,
      context.service,
      context.incidentService,
      {} as never,
    );
    const gate = context.pauseWrite();
    const failure = new Error("ordinary phone complaint write failed");
    const request = controller.transferCallToComplaint("call-ordinary", {
      category: "driver_service",
      severity: "normal",
      description: "Driver service question",
    });
    const outcome = request.catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    gate.reject(failure);
    expect(await outcome).toBe(failure);
    expect(linkCaseToCallSession).not.toHaveBeenCalled();
    // Only the fixture's default settlement case; the failed ordinary write
    // never committed a second one.
    expect(context.committed().complaintCases).toHaveLength(1);
  });

  it("continues numeric case sequences after generic settlement hydration while ignoring Fleet UUID IDs", async () => {
    const state = settlement();
    const generic = {
      ...state.complaintCases[0]!,
      caseNo: `C-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-000041`,
    };
    const uuidCase = {
      ...state.complaintCases[0]!,
      caseNo: "C-20200101-FS-12345678-1234-1234-1234-999999999999",
    };
    const repository = {
      loadState: vi.fn(async () => ({
        complaintCases: [generic, uuidCase],
        complaintTimelines: [],
      })),
      persistChanges: vi.fn(async () => undefined),
      reportPersistenceFailure: vi.fn(),
    } as unknown as ComplaintRepository;
    const service = new ComplaintService(
      new AuditNotificationService(),
      repository,
    );
    await service.onModuleInit();
    const next = service.createComplaintCase({
      caseSource: "web",
      category: "other",
      severity: "normal",
      description: "New ordinary case after restart",
    });
    expect(next.caseNo).toMatch(/-000042$/);
    expect(next.caseNo).not.toBe(generic.caseNo);
    expect(service.listComplaintCases()).toHaveLength(3);
  });

  it("does not publish an incident-side link when its settlement CRM link fails", async () => {
    const context = fixture();
    const incident = context.incidentService.createIncident({
      title: "Incident link failure",
      description: "Failure fixture",
      category: "operational",
      severity: "medium",
      reportedBy: "ops",
    });
    const controller = new IncidentController(
      context.incidentService,
      context.service,
    );
    const gate = context.pauseWrite();
    const failure = new Error("incident-side settlement write failed");
    const outcome = controller
      .linkComplaint(incident.incidentId, { complaintCaseNo: context.caseNo })
      .catch((error: unknown) => error);
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    gate.reject(failure);
    expect(await outcome).toBe(failure);
    expect(
      context.incidentService.getIncident(incident.incidentId)
        .relatedComplaintCaseNo,
    ).toBeNull();
    expect(
      (await context.controller.getComplaintCase(context.caseNo)).data
        .relatedIncidentId,
    ).toBeNull();
  });

  it("loads a settlement through the alternate Incident link route and waits for its commit", async () => {
    const context = fixture();
    const incident = context.incidentService.createIncident({
      title: "Incident side",
      description: "Link from incident",
      category: "operational",
      severity: "medium",
      reportedBy: "ops",
    });
    const controller = new IncidentController(
      context.incidentService,
      context.service,
    );
    const gate = context.pauseWrite();
    let completed = false;
    const request = controller
      .linkComplaint(incident.incidentId, { complaintCaseNo: context.caseNo })
      .then((result) => {
        completed = true;
        return result;
      });
    await vi.waitFor(() =>
      expect(context.persistChanges).toHaveBeenCalledTimes(1),
    );
    expect(completed).toBe(false);
    gate.resolve();
    expect((await request).data.relatedComplaintCaseNo).toBe(context.caseNo);
    expect(
      (await context.controller.getComplaintCase(context.caseNo)).data
        .relatedIncidentId,
    ).toBe(incident.incidentId);
  });
});

describe("settlement repository atomic persistence", () => {
  it("loads cases and timelines together from the same repository snapshot", async () => {
    const state = settlement();
    const query = vi.fn(async () => ({
      rows: [
        ...state.complaintCases.map((record) => ({ kind: "case", record })),
        ...state.complaintTimelines.map((record) => ({
          kind: "timeline",
          record,
        })),
      ],
    }));
    const repository = new ComplaintRepository({
      isEnabled: () => true,
      query,
    } as unknown as DatabaseService);
    expect(await repository.loadSettlementState()).toEqual(state);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rolls back both case and timeline changes when a timeline write fails", async () => {
    const changes = settlement();
    const failure = new Error("timeline insert failed");
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO crm.phase1_complaint_timelines"))
        throw failure;
      return { rows: [], rowCount: 1 };
    });
    const release = vi.fn();
    const connect = vi.fn(async () => ({ query, release }));
    const database = {
      isEnabled: () => true,
      connect,
    } as unknown as DatabaseService;
    const repository = new ComplaintRepository(database);
    await expect(repository.persistChanges(changes)).rejects.toBe(failure);
    expect(query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0])).toEqual(
      ["BEGIN", "INSERT", "INSERT", "ROLLBACK"],
    );
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("commits only after both case and timeline queries finish and releases its client", async () => {
    const gate = deferred();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO crm.phase1_complaint_timelines"))
        await gate.promise;
      return { rows: [], rowCount: 1 };
    });
    const release = vi.fn();
    const database = {
      isEnabled: () => true,
      connect: vi.fn(async () => ({ query, release })),
    } as unknown as DatabaseService;
    const request = new ComplaintRepository(database).persistChanges(
      settlement(),
    );
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(3));
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(release).not.toHaveBeenCalled();
    gate.resolve();
    await request;
    expect(query).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
