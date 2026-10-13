import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  OpsDispatchStreamEventEnvelope,
} from "@drts/contracts";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { buildSettlementDisputeCase } from "../../../apps/api/src/modules/complaint/settlement-dispute";
import { IncidentController } from "../../../apps/api/src/modules/incident/incident.controller";
import { IncidentRepository } from "../../../apps/api/src/modules/incident/incident.repository";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";

// Resolve the API's existing declared event-emitter dependency from its own
// package, since the root unit-test package does not declare that dependency.
const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { EventEmitter2 } = apiRequire("@nestjs/event-emitter") as {
  EventEmitter2: new () => ConstructorParameters<
    typeof OpsDispatchEventsService
  >[0];
};

type State = {
  complaintCases: ComplaintCaseRecord[];
  complaintTimelines: ComplaintTimelineEntry[];
};
type Changes = {
  complaintCases?: readonly ComplaintCaseRecord[];
  complaintTimelines?: readonly ComplaintTimelineEntry[];
};
type Endpoint = "incident" | "complaint";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function initialState(): State {
  const records = ["A"].map((suffix) =>
    buildSettlementDisputeCase({
      fleetPartnerId: "escalation-concurrency-fleet",
      statementId: `statement-${suffix}`,
      reason: `Statement ${suffix} dispute`,
      actorId: "fleet-manager",
      at: "2026-10-13T00:00:00.000Z",
    }),
  );
  return {
    complaintCases: records.flatMap((item) => item.complaintCases),
    complaintTimelines: records.flatMap((item) => item.complaintTimelines),
  };
}

/** All case and incident behavior is production code. This repository fixture
 * models only the point at which a case/timeline write becomes committed. */
function repositoryFixture(initial: State) {
  const committed = structuredClone(initial);
  const gates: ReturnType<typeof deferred>[] = [];
  const persistChanges = vi.fn(async (changes: Changes) => {
    const gate = gates.shift();
    if (gate) await gate.promise;
    for (const item of changes.complaintCases ?? []) {
      committed.complaintCases = [
        ...committed.complaintCases.filter((old) => old.caseNo !== item.caseNo),
        structuredClone(item),
      ];
    }
    for (const item of changes.complaintTimelines ?? []) {
      committed.complaintTimelines = [
        ...committed.complaintTimelines.filter(
          (old) => old.entryId !== item.entryId,
        ),
        structuredClone(item),
      ];
    }
  });
  const repository = {
    isEnabled: () => true,
    loadSettlementState: vi.fn(async () => structuredClone(committed)),
    persistChanges,
    reportPersistenceFailure: vi.fn(),
  } as unknown as ComplaintRepository;
  return {
    repository,
    persistChanges,
    pauseNextWrite() {
      const gate = deferred();
      gates.push(gate);
      return gate;
    },
    readCommitted: () => structuredClone(committed),
  };
}

const publicationSubscriptions: { unsubscribe(): void }[] = [];

afterEach(() => {
  for (const subscription of publicationSubscriptions.splice(0)) {
    subscription.unsubscribe();
  }
});

function services(
  repository?: ComplaintRepository,
  observePublication = false,
) {
  const audit = new AuditNotificationService();
  const complaints = new ComplaintService(audit, repository);
  const incidentPersistence = vi
    .fn<IncidentRepository["persistChanges"]>()
    .mockResolvedValue(undefined);
  const publicationEvents: OpsDispatchStreamEventEnvelope[] = [];
  const events = new OpsDispatchEventsService(new EventEmitter2());
  if (observePublication) {
    publicationSubscriptions.push(
      events.streamEvents().subscribe((event) => {
        publicationEvents.push(event.data as OpsDispatchStreamEventEnvelope);
      }),
    );
  }
  const incidents = new IncidentService(
    audit,
    observePublication
      ? ({
          persistChanges: incidentPersistence,
          reportPersistenceFailure: vi.fn(),
        } as unknown as IncidentRepository)
      : undefined,
    observePublication ? events : undefined,
  );
  return {
    complaints,
    incidents,
    incidentPersistence,
    publicationEvents,
    complaintController: new ComplaintController(
      complaints,
      incidents,
      {} as never,
    ),
    incidentController: new IncidentController(incidents, complaints),
  };
}

function createIncident(incidents: IncidentService) {
  return incidents.createIncident({
    title: "Statement investigation",
    description: "An existing incident awaiting its complaint link",
    category: "operational",
    severity: "medium",
    reportedBy: "ops-agent",
  });
}

function link(
  handlers: ReturnType<typeof services>,
  endpoint: Endpoint,
  caseNo: string,
  incidentId: string,
) {
  return endpoint === "incident"
    ? handlers.incidentController.linkComplaint(incidentId, {
        complaintCaseNo: caseNo,
      })
    : handlers.complaintController.linkIncident(caseNo, { incidentId });
}

async function freshCase(repository: ComplaintRepository, caseNo: string) {
  const fresh = services(repository);
  return {
    record: (await fresh.complaintController.getComplaintCase(caseNo)).data,
    timeline: (await fresh.complaintController.getComplaintTimeline(caseNo))
      .data.items,
  };
}

function escalate(handlers: ReturnType<typeof services>, caseNo: string) {
  return handlers.complaintController.escalateToIncident(caseNo, {
    title: "Escalated statement investigation",
    severity: "medium",
    reason: "Investigate this statement dispute",
  });
}

describe("complaint escalation coordinates before incident creation", () => {
  it("creates one reciprocal incident for simultaneous escalations of one complaint", async () => {
    const initial = initialState();
    const caseNo = initial.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(initial);
    const handlers = services(fixture.repository);
    const gate = fixture.pauseNextWrite();
    const outcomes = Promise.allSettled([
      escalate(handlers, caseNo),
      escalate(handlers, caseNo),
    ]);
    try {
      await vi.waitFor(() => expect(fixture.persistChanges).toHaveBeenCalled());
      await new Promise<void>((resolve) => setImmediate(resolve));
      gate.resolve();
      const results = await outcomes;
      expect(
        results.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(1);
      expect(results.filter((item) => item.status === "rejected")).toEqual([
        expect.objectContaining({
          reason: expect.objectContaining({
            code: "COMPLAINT_ALREADY_ESCALATED",
          }),
        }),
      ]);
      const incidents = handlers.incidents.listIncidents();
      expect(incidents).toHaveLength(1);
      expect(incidents[0]!.relatedComplaintCaseNo).toBe(caseNo);
      const committed = await freshCase(fixture.repository, caseNo);
      expect(committed.record.relatedIncidentId).toBe(incidents[0]!.incidentId);
      expect(committed.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
        "escalated_to_incident",
      ]);
      expect(fixture.persistChanges).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve();
      await outcomes;
    }
  });

  it.each(["incident", "complaint"] as const)(
    "keeps the existing first %s link and rejects a competing escalation before creating another incident",
    async (endpoint) => {
      const initial = initialState();
      const caseNo = initial.complaintCases[0]!.caseNo;
      const fixture = repositoryFixture(initial);
      const handlers = services(fixture.repository);
      const existing = createIncident(handlers.incidents);
      const gate = fixture.pauseNextWrite();
      const outcomes = Promise.allSettled([
        link(handlers, endpoint, caseNo, existing.incidentId),
        escalate(handlers, caseNo),
      ]);
      try {
        await vi.waitFor(() =>
          expect(fixture.persistChanges).toHaveBeenCalled(),
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        gate.resolve();
        const results = await outcomes;
        expect(results[0]!.status).toBe("fulfilled");
        expect(results[1]).toEqual(
          expect.objectContaining({
            status: "rejected",
            reason: expect.objectContaining({
              code: "COMPLAINT_ALREADY_ESCALATED",
            }),
          }),
        );
        expect(handlers.incidents.listIncidents()).toHaveLength(1);
        expect(
          handlers.incidents.getIncident(existing.incidentId)
            .relatedComplaintCaseNo,
        ).toBe(caseNo);
        const committed = await freshCase(fixture.repository, caseNo);
        expect(committed.record.relatedIncidentId).toBe(existing.incidentId);
        expect(committed.timeline.map((entry) => entry.action)).toEqual([
          "case_created",
          "incident_linked",
        ]);
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1);
      } finally {
        gate.resolve();
        await outcomes;
      }
    },
  );

  it.each(["incident", "complaint"] as const)(
    "rejects sequential escalation of an already-linked case through the %s entrance without changing its incident list",
    async (endpoint) => {
      const initial = initialState();
      const caseNo = initial.complaintCases[0]!.caseNo;
      const fixture = repositoryFixture(initial);
      const handlers = services(fixture.repository);
      const existing = createIncident(handlers.incidents);
      await link(handlers, endpoint, caseNo, existing.incidentId);
      const incidentsBefore = handlers.incidents.listIncidents();
      const committedBefore = fixture.readCommitted();

      await expect(escalate(handlers, caseNo)).rejects.toMatchObject({
        code: "COMPLAINT_ALREADY_ESCALATED",
      });
      expect(handlers.incidents.listIncidents()).toEqual(incidentsBefore);
      expect(fixture.readCommitted()).toEqual(committedBefore);
      expect(fixture.persistChanges).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["incident", "complaint"] as const)(
    "preserves the first escalation when a later %s link targets an existing incident",
    async (endpoint) => {
      const initial = initialState();
      const caseNo = initial.complaintCases[0]!.caseNo;
      const fixture = repositoryFixture(initial);
      const handlers = services(fixture.repository);
      const existing = createIncident(handlers.incidents);
      const gate = fixture.pauseNextWrite();
      const outcomes = Promise.allSettled([
        escalate(handlers, caseNo),
        link(handlers, endpoint, caseNo, existing.incidentId),
      ]);
      try {
        await vi.waitFor(() =>
          expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
        );
        gate.resolve();
        const results = await outcomes;
        expect(results[0]!.status).toBe("fulfilled");
        expect(results[1]).toEqual(
          expect.objectContaining({
            status: "rejected",
            reason: expect.objectContaining({
              code: "COMPLAINT_INCIDENT_LINK_CONFLICT",
            }),
          }),
        );
        const incidents = handlers.incidents.listIncidents();
        expect(incidents).toHaveLength(2);
        const created = incidents.find(
          (item) => item.incidentId !== existing.incidentId,
        )!;
        expect(created.relatedComplaintCaseNo).toBe(caseNo);
        expect(
          handlers.incidents.getIncident(existing.incidentId)
            .relatedComplaintCaseNo,
        ).toBeNull();
        const committed = await freshCase(fixture.repository, caseNo);
        expect(committed.record.relatedIncidentId).toBe(created.incidentId);
        expect(committed.timeline.map((entry) => entry.action)).toEqual([
          "case_created",
          "escalated_to_incident",
        ]);
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1);
      } finally {
        gate.resolve();
        await outcomes;
      }
    },
  );

  it("preserves ordinary complaint escalation and owner assignment without a database", async () => {
    const handlers = services();
    const ordinary = handlers.complaints.createComplaintCase({
      caseSource: "ops",
      category: "safety_concern",
      severity: "high",
      description: "An ordinary complaint requiring escalation",
    });
    handlers.complaints.assignComplaintCase(ordinary.caseNo, {
      assigneeId: "ops-specialist",
    });
    const response = await escalate(handlers, ordinary.caseNo);
    expect(response.data.incident).toMatchObject({
      relatedComplaintCaseNo: ordinary.caseNo,
      assignedTo: "ops-specialist",
      category: "safety",
    });
    expect(response.data.complaintCase.relatedIncidentId).toBe(
      response.data.incident.incidentId,
    );
    await expect(escalate(handlers, ordinary.caseNo)).rejects.toMatchObject({
      code: "COMPLAINT_ALREADY_ESCALATED",
    });
    expect(handlers.incidents.listIncidents()).toHaveLength(1);
    expect(
      handlers.complaints
        .getComplaintTimeline(ordinary.caseNo)
        .map((entry) => entry.action),
    ).toEqual(["case_created", "case_assigned", "escalated_to_incident"]);
  });

  it("releases a failed existing link so its real retry succeeds before a later escalation is rejected", async () => {
    const initial = initialState();
    const caseNo = initial.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(initial);
    const handlers = services(fixture.repository);
    const existing = createIncident(handlers.incidents);
    const gate = fixture.pauseNextWrite();
    const failure = new Error("First existing link failed to persist");
    const outcomes = Promise.allSettled([
      link(handlers, "incident", caseNo, existing.incidentId),
    ]);
    try {
      await vi.waitFor(() =>
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
      );
      gate.reject(failure);
      expect(await outcomes).toEqual([{ status: "rejected", reason: failure }]);
      expect(fixture.readCommitted()).toEqual(initial);
      expect(
        handlers.incidents.getIncident(existing.incidentId)
          .relatedComplaintCaseNo,
      ).toBeNull();

      await link(handlers, "complaint", caseNo, existing.incidentId);
      expect(fixture.persistChanges).toHaveBeenCalledTimes(2);
      await expect(escalate(handlers, caseNo)).rejects.toMatchObject({
        code: "COMPLAINT_ALREADY_ESCALATED",
      });
      expect(handlers.incidents.listIncidents()).toHaveLength(1);
      const committed = await freshCase(fixture.repository, caseNo);
      expect(committed.record.relatedIncidentId).toBe(existing.incidentId);
      expect(committed.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
        "incident_linked",
      ]);
    } finally {
      gate.resolve();
      await outcomes;
    }
  });

  it("allows a queued escalation after the first existing-link write fails without creating an incident while that first operation is pending", async () => {
    const initial = initialState();
    const caseNo = initial.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(initial);
    const handlers = services(fixture.repository);
    const existing = createIncident(handlers.incidents);
    const gate = fixture.pauseNextWrite();
    const failure = new Error("First link failed before the queued escalation");
    const outcomes = Promise.allSettled([
      link(handlers, "complaint", caseNo, existing.incidentId),
      escalate(handlers, caseNo),
    ]);
    try {
      await vi.waitFor(() =>
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(handlers.incidents.listIncidents()).toHaveLength(1);
      gate.reject(failure);
      const results = await outcomes;
      expect(results[0]).toEqual({ status: "rejected", reason: failure });
      expect(results[1]!.status).toBe("fulfilled");
      expect(fixture.persistChanges).toHaveBeenCalledTimes(2);
      const incidents = handlers.incidents.listIncidents();
      expect(incidents).toHaveLength(2);
      const created = incidents.find(
        (item) => item.incidentId !== existing.incidentId,
      )!;
      expect(created.relatedComplaintCaseNo).toBe(caseNo);
      expect(
        handlers.incidents.getIncident(existing.incidentId)
          .relatedComplaintCaseNo,
      ).toBeNull();
      const committed = await freshCase(fixture.repository, caseNo);
      expect(committed.record.relatedIncidentId).toBe(created.incidentId);
      expect(committed.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
        "escalated_to_incident",
      ]);
    } finally {
      gate.resolve();
      await outcomes;
    }
  });

  it("publishes no incident when escalation persistence fails and publishes one reciprocal incident on a real retry", async () => {
    const initial = initialState();
    const caseNo = initial.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(initial);
    const handlers = services(fixture.repository, true);
    const gate = fixture.pauseNextWrite();
    const failure = new Error("Escalation CRM write failed");
    const outcomes = Promise.allSettled([escalate(handlers, caseNo)]);
    try {
      await vi.waitFor(() =>
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
      );
      expect.soft(handlers.incidents.listIncidents()).toEqual([]);
      expect(handlers.incidentPersistence).not.toHaveBeenCalled();
      expect(handlers.publicationEvents).toEqual([]);
      gate.reject(failure);
      expect(await outcomes).toEqual([{ status: "rejected", reason: failure }]);
      expect(handlers.incidents.listIncidents()).toEqual([]);
      expect(handlers.incidentPersistence).not.toHaveBeenCalled();
      expect(handlers.publicationEvents).toEqual([]);
      expect(fixture.readCommitted()).toEqual(initial);
      const failed = await freshCase(fixture.repository, caseNo);
      expect(failed.record.relatedIncidentId).toBeNull();
      expect(failed.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
      ]);

      const retried = await escalate(handlers, caseNo);
      expect(handlers.incidents.listIncidents()).toEqual([
        retried.data.incident,
      ]);
      expect(retried.data.incident.relatedComplaintCaseNo).toBe(caseNo);
      const committed = await freshCase(fixture.repository, caseNo);
      expect(committed.record.relatedIncidentId).toBe(
        retried.data.incident.incidentId,
      );
      expect(committed.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
        "escalated_to_incident",
      ]);
      expect(fixture.persistChanges).toHaveBeenCalledTimes(2);
      expect(
        handlers.publicationEvents.filter(
          (event) => event.eventType === "incident_created",
        ),
      ).toEqual([
        expect.objectContaining({
          subjectId: retried.data.incident.incidentId,
        }),
      ]);
      expect(
        handlers.incidentPersistence.mock.calls.flatMap(([changes]) =>
          (changes.timelines ?? []).filter(
            (entry) => entry.action === "incident_created",
          ),
        ),
      ).toEqual([
        expect.objectContaining({
          incidentId: retried.data.incident.incidentId,
        }),
      ]);
      await expect(escalate(handlers, caseNo)).rejects.toMatchObject({
        code: "COMPLAINT_ALREADY_ESCALATED",
      });
      expect(handlers.incidents.listIncidents()).toHaveLength(1);
    } finally {
      gate.resolve();
      await outcomes;
    }
  });

  it("releases a failed escalation so a queued second escalation publishes the only incident", async () => {
    const initial = initialState();
    const caseNo = initial.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(initial);
    const handlers = services(fixture.repository, true);
    const gate = fixture.pauseNextWrite();
    const failure = new Error("First queued escalation failed to persist");
    const outcomes = Promise.allSettled([
      escalate(handlers, caseNo),
      escalate(handlers, caseNo),
    ]);
    try {
      await vi.waitFor(() =>
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect.soft(handlers.incidents.listIncidents()).toEqual([]);
      expect(handlers.incidentPersistence).not.toHaveBeenCalled();
      expect(handlers.publicationEvents).toEqual([]);
      gate.reject(failure);
      const results = await outcomes;
      expect(results[0]).toEqual({ status: "rejected", reason: failure });
      expect(results[1]!.status).toBe("fulfilled");
      const incidents = handlers.incidents.listIncidents();
      expect(incidents).toHaveLength(1);
      expect(incidents[0]!.relatedComplaintCaseNo).toBe(caseNo);
      const committed = await freshCase(fixture.repository, caseNo);
      expect(committed.record.relatedIncidentId).toBe(incidents[0]!.incidentId);
      expect(committed.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
        "escalated_to_incident",
      ]);
      expect(fixture.persistChanges).toHaveBeenCalledTimes(2);
      expect(
        handlers.publicationEvents.filter(
          (event) => event.eventType === "incident_created",
        ),
      ).toEqual([
        expect.objectContaining({ subjectId: incidents[0]!.incidentId }),
      ]);
      expect(
        handlers.incidentPersistence.mock.calls.flatMap(([changes]) =>
          (changes.timelines ?? []).filter(
            (entry) => entry.action === "incident_created",
          ),
        ),
      ).toEqual([
        expect.objectContaining({ incidentId: incidents[0]!.incidentId }),
      ]);
    } finally {
      gate.resolve();
      await outcomes;
    }
  });
});
