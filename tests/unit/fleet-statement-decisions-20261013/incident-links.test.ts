import { describe, expect, it, vi } from "vitest";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
} from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { buildSettlementDisputeCase } from "../../../apps/api/src/modules/complaint/settlement-dispute";
import { IncidentController } from "../../../apps/api/src/modules/incident/incident.controller";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";

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
  const records = ["A", "B"].map((suffix) =>
    buildSettlementDisputeCase({
      fleetPartnerId: "incident-link-fleet",
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

function services(repository?: ComplaintRepository) {
  const audit = new AuditNotificationService();
  const complaints = new ComplaintService(audit, repository);
  const incidents = new IncidentService(audit);
  return {
    complaints,
    incidents,
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

describe("settlement complaint and incident links remain reciprocal", () => {
  it.each([
    ["incident", "incident"],
    ["complaint", "complaint"],
    ["incident", "complaint"],
  ] as const)(
    "commits one winner and leaves the losing case untouched for %s/%s endpoints",
    async (firstEndpoint, secondEndpoint) => {
      const initial = initialState();
      const [caseA, caseB] = initial.complaintCases;
      const fixture = repositoryFixture(initial);
      const handlers = services(fixture.repository);
      const incident = createIncident(handlers.incidents);
      const gateA = fixture.pauseNextWrite();
      const gateB = fixture.pauseNextWrite();
      const outcomes = Promise.allSettled([
        link(handlers, firstEndpoint, caseA!.caseNo, incident.incidentId),
        link(handlers, secondEndpoint, caseB!.caseNo, incident.incidentId),
      ]);
      try {
        await vi.waitFor(() =>
          expect(fixture.persistChanges).toHaveBeenCalled(),
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        gateA.resolve();
        gateB.resolve();
        const results = await outcomes;
        expect(
          results.filter((item) => item.status === "fulfilled"),
        ).toHaveLength(1);
        expect(results.filter((item) => item.status === "rejected")).toEqual([
          expect.objectContaining({
            reason: expect.objectContaining({
              code: "INCIDENT_COMPLAINT_LINK_CONFLICT",
            }),
          }),
        ]);
        const winner = results[0]!.status === "fulfilled" ? caseA! : caseB!;
        const loser = winner.caseNo === caseA!.caseNo ? caseB! : caseA!;
        expect(
          handlers.incidents.getIncident(incident.incidentId)
            .relatedComplaintCaseNo,
        ).toBe(winner.caseNo);
        const committedWinner = await freshCase(
          fixture.repository,
          winner.caseNo,
        );
        expect(committedWinner.record.relatedIncidentId).toBe(
          incident.incidentId,
        );
        expect(committedWinner.timeline.map((entry) => entry.action)).toEqual([
          "case_created",
          "incident_linked",
        ]);
        const committedLoser = await freshCase(
          fixture.repository,
          loser.caseNo,
        );
        expect(committedLoser.record.relatedIncidentId).toBeNull();
        expect(committedLoser.timeline).toEqual(
          initial.complaintTimelines.filter(
            (entry) => entry.caseNo === loser.caseNo,
          ),
        );
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1);
        expect(
          handlers.incidents
            .getTimeline(incident.incidentId)
            .filter((entry) => entry.action === "complaint_linked"),
        ).toHaveLength(1);
      } finally {
        gateA.resolve();
        gateB.resolve();
        await outcomes;
      }
    },
  );

  it.each([
    ["incident", "complaint"],
    ["complaint", "incident"],
  ] as const)(
    "replays the same pair across %s/%s endpoints without duplicate timelines",
    async (firstEndpoint, replayEndpoint) => {
      const initial = initialState();
      const caseNo = initial.complaintCases[0]!.caseNo;
      const fixture = repositoryFixture(initial);
      const handlers = services(fixture.repository);
      const incident = createIncident(handlers.incidents);
      const gate = fixture.pauseNextWrite();
      const outcomes = Promise.allSettled([
        link(handlers, firstEndpoint, caseNo, incident.incidentId),
        link(handlers, replayEndpoint, caseNo, incident.incidentId),
      ]);
      try {
        await vi.waitFor(() =>
          expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
        );
        gate.resolve();
        expect((await outcomes).map((item) => item.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        await link(handlers, firstEndpoint, caseNo, incident.incidentId);
        await link(handlers, replayEndpoint, caseNo, incident.incidentId);
        const committed = await freshCase(fixture.repository, caseNo);
        expect(committed.record.relatedIncidentId).toBe(incident.incidentId);
        expect(committed.timeline.map((entry) => entry.action)).toEqual([
          "case_created",
          "incident_linked",
        ]);
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1);
        expect(
          handlers.incidents
            .getTimeline(incident.incidentId)
            .filter((entry) => entry.action === "complaint_linked"),
        ).toHaveLength(1);
      } finally {
        gate.resolve();
        await outcomes;
      }
    },
  );

  it("does not publish a failed first CRM write and permits a real retry through the other endpoint", async () => {
    const initial = initialState();
    const caseNo = initial.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(initial);
    const handlers = services(fixture.repository);
    const incident = createIncident(handlers.incidents);
    const gate = fixture.pauseNextWrite();
    const failure = new Error("Incident link database write failed");
    const outcomes = Promise.allSettled([
      link(handlers, "incident", caseNo, incident.incidentId),
    ]);
    try {
      await vi.waitFor(() =>
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
      );
      gate.reject(failure);
      expect(await outcomes).toEqual([{ status: "rejected", reason: failure }]);
      expect(await freshCase(fixture.repository, caseNo)).toEqual({
        record: initial.complaintCases[0],
        timeline: initial.complaintTimelines.filter(
          (item) => item.caseNo === caseNo,
        ),
      });
      expect(
        handlers.incidents.getIncident(incident.incidentId)
          .relatedComplaintCaseNo,
      ).toBeNull();

      await link(handlers, "complaint", caseNo, incident.incidentId);
      expect(fixture.persistChanges).toHaveBeenCalledTimes(2);
      expect(
        handlers.incidents.getIncident(incident.incidentId)
          .relatedComplaintCaseNo,
      ).toBe(caseNo);
      const committed = await freshCase(fixture.repository, caseNo);
      expect(committed.record.relatedIncidentId).toBe(incident.incidentId);
      expect(committed.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
        "incident_linked",
      ]);
    } finally {
      gate.resolve();
      await outcomes;
    }
  });

  it("releases a failed first link so a queued competing case can commit without a dangling relation", async () => {
    const initial = initialState();
    const [caseA, caseB] = initial.complaintCases;
    const fixture = repositoryFixture(initial);
    const handlers = services(fixture.repository);
    const incident = createIncident(handlers.incidents);
    const gate = fixture.pauseNextWrite();
    const failure = new Error("First competing link failed to persist");
    const outcomes = Promise.allSettled([
      link(handlers, "incident", caseA!.caseNo, incident.incidentId),
      link(handlers, "complaint", caseB!.caseNo, incident.incidentId),
    ]);
    try {
      await vi.waitFor(() =>
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
      );
      gate.reject(failure);
      const results = await outcomes;
      expect(results[0]).toEqual({ status: "rejected", reason: failure });
      expect(results[1]!.status).toBe("fulfilled");
      expect(fixture.persistChanges).toHaveBeenCalledTimes(2);
      expect(
        handlers.incidents.getIncident(incident.incidentId)
          .relatedComplaintCaseNo,
      ).toBe(caseB!.caseNo);
      const failed = await freshCase(fixture.repository, caseA!.caseNo);
      expect(failed.record.relatedIncidentId).toBeNull();
      expect(failed.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
      ]);
      const winner = await freshCase(fixture.repository, caseB!.caseNo);
      expect(winner.record.relatedIncidentId).toBe(incident.incidentId);
      expect(winner.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
        "incident_linked",
      ]);
      await expect(
        link(handlers, "incident", caseA!.caseNo, incident.incidentId),
      ).rejects.toMatchObject({ code: "INCIDENT_COMPLAINT_LINK_CONFLICT" });
      expect(fixture.persistChanges).toHaveBeenCalledTimes(2);
    } finally {
      gate.resolve();
      await outcomes;
    }
  });

  it("preserves ordinary complaint links and synchronous direct incident links without a database", async () => {
    const handlers = services();
    const ordinary = handlers.complaints.createComplaintCase({
      caseSource: "ops",
      category: "other",
      severity: "normal",
      description: "An existing ordinary complaint",
    });
    const incident = createIncident(handlers.incidents);
    await link(handlers, "complaint", ordinary.caseNo, incident.incidentId);
    await link(handlers, "incident", ordinary.caseNo, incident.incidentId);
    expect(
      handlers.complaints.getComplaintCase(ordinary.caseNo).relatedIncidentId,
    ).toBe(incident.incidentId);
    const direct = handlers.incidents.linkComplaint(
      incident.incidentId,
      ordinary.caseNo,
    );
    expect(direct).not.toBeInstanceOf(Promise);
    expect(direct.relatedComplaintCaseNo).toBe(ordinary.caseNo);
    expect(
      handlers.complaints
        .getComplaintTimeline(ordinary.caseNo)
        .map((entry) => entry.action),
    ).toEqual(["case_created", "incident_linked"]);
    expect(
      handlers.incidents
        .getTimeline(incident.incidentId)
        .map((entry) => entry.action),
    ).toEqual(["incident_created", "complaint_linked"]);
  });

  it("keeps an escalation reciprocal while a second case targets its newly created incident", async () => {
    const initial = initialState();
    const [caseA, caseB] = initial.complaintCases;
    const fixture = repositoryFixture(initial);
    const handlers = services(fixture.repository);
    const gate = fixture.pauseNextWrite();
    const escalated = handlers.complaintController.escalateToIncident(
      caseA!.caseNo,
      {
        title: "Escalated statement investigation",
        severity: "medium",
        reason: "Investigate the statement dispute",
      },
    );
    const escalationOutcome = Promise.allSettled([escalated]);
    let competingOutcome: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await vi.waitFor(() =>
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
      );
      const incidentId = handlers.complaints.getComplaintCase(
        caseA!.caseNo,
      ).relatedIncidentId!;
      expect(incidentId).toBeTruthy();
      expect(handlers.incidents.listIncidents()).toEqual([]);
      competingOutcome = Promise.allSettled([
        link(handlers, "incident", caseB!.caseNo, incidentId),
      ]);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(fixture.persistChanges).toHaveBeenCalledTimes(1);
      gate.resolve();
      const response = await escalated;
      expect(response.data.incident.relatedComplaintCaseNo).toBe(caseA!.caseNo);
      expect(response.data.complaintCase.relatedIncidentId).toBe(incidentId);
      expect(await competingOutcome).toEqual([
        expect.objectContaining({
          status: "rejected",
          reason: expect.objectContaining({
            code: "INCIDENT_COMPLAINT_LINK_CONFLICT",
          }),
        }),
      ]);
      const winner = await freshCase(fixture.repository, caseA!.caseNo);
      expect(winner.record.relatedIncidentId).toBe(incidentId);
      expect(winner.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
        "escalated_to_incident",
      ]);
      const loser = await freshCase(fixture.repository, caseB!.caseNo);
      expect(loser.record.relatedIncidentId).toBeNull();
      expect(loser.timeline.map((entry) => entry.action)).toEqual([
        "case_created",
      ]);
      expect(fixture.persistChanges).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve();
      await escalationOutcome;
      await competingOutcome;
    }
  });
});
