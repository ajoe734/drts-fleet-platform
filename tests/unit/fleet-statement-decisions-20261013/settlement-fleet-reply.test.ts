import { describe, expect, it, vi } from "vitest";
import type {
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintTimelineEntry,
} from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ComplaintController } from "../../../apps/api/src/modules/complaint/complaint.controller";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { buildSettlementDisputeCase } from "../../../apps/api/src/modules/complaint/settlement-dispute";
import { FleetPartnerCaseService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";

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
    fleetPartnerId: "fleet-reply-test",
    statementId: "statement-reply-test",
    reason: "Trips absent from the statement",
    actorId: "fleet-manager",
    at: "2026-10-13T00:00:00.000Z",
  });
  state.complaintCases[0]!.status = status;
  if (status === "resolved" || status === "closed") {
    state.complaintCases[0]!.resolutionCode = "resolved_with_refund";
    state.complaintCases[0]!.closingNote = "Statement adjustment agreed";
  }
  return state;
}

/** Only the repository is simulated: a write becomes readable to another
 * service instance after its promise resolves, matching a committed DB write. */
function repositoryFixture(initial: ComplaintState) {
  const committed = structuredClone(initial);
  const writeGates: ReturnType<typeof deferred>[] = [];
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
  const loadSettlementState = vi.fn(async () => structuredClone(committed));
  const reportPersistenceFailure = vi.fn();
  const repository = {
    isEnabled: () => true,
    persistChanges,
    loadSettlementState,
    reportPersistenceFailure,
  } as unknown as ComplaintRepository;
  return {
    repository,
    persistChanges,
    reportPersistenceFailure,
    pauseNextWrite() {
      const gate = deferred();
      writeGates.push(gate);
      return gate;
    },
    readCommitted: () => structuredClone(committed),
  };
}

function services(repository?: ComplaintRepository) {
  const complaints = new ComplaintService(
    new AuditNotificationService(),
    repository,
  );
  const cases = new FleetPartnerCaseService(complaints);
  const fleet = new FleetPartnerController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    cases,
  );
  const ops = new ComplaintController(complaints, {} as never, {} as never);
  return { complaints, cases, fleet, ops };
}

function submit(
  controller: FleetPartnerController,
  caseId: string,
  content: string,
  idempotencyKey = "reply-request-1",
) {
  const identity = {
    realm: "partner",
    actorType: "partner_user",
    partnerId: "fleet-reply-test",
    actorId: "fleet-manager",
  } as BootstrapRequestIdentity;
  return controller.submitPortalCaseReply(
    "fleet-reply-test",
    "fleet-manager",
    caseId,
    { content, idempotencyKey },
    "request-fleet-reply",
    identity,
  );
}

describe("settlement Fleet replies commit before success", () => {
  it("keeps the actual POST pending until persistence and makes its reply visible to a fresh Ops and Fleet service", async () => {
    const state = settlement();
    const caseId = state.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(state);
    const first = services(fixture.repository);
    const gate = fixture.pauseNextWrite();
    let completed = false;
    const request = submit(first.fleet, caseId, "Two trips were corrected");
    void request.then(() => {
      completed = true;
    });

    await vi.waitFor(() => expect(fixture.persistChanges).toHaveBeenCalled());
    expect(completed).toBe(false);
    expect(fixture.readCommitted().complaintTimelines).toHaveLength(1);

    gate.resolve();
    const response = await request;
    expect(response.data).toMatchObject({
      caseId,
      content: "Two trips were corrected",
      deduplicated: false,
    });

    const fresh = services(fixture.repository);
    const opsTimeline = await fresh.ops.getComplaintTimeline(caseId);
    expect(opsTimeline.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "case_note_added",
          note: "[車行回覆 · fleet-reply-test] Two trips were corrected",
        }),
      ]),
    );
    const detail = await fresh.ops.getComplaintCase(caseId);
    expect(detail.data.status).toBe("under_investigation");
    const fleetTimeline = await fresh.cases.getCaseTimeline(
      "fleet-reply-test",
      caseId,
    );
    expect(fleetTimeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          t: "車行回覆",
          actorRealm: "tenant",
          body: "[車行回覆 · fleet-reply-test] Two trips were corrected",
        }),
      ]),
    );
  });

  it("propagates a failed write and persists a retry with the same key before publishing an idempotent receipt", async () => {
    const state = settlement();
    const caseId = state.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(state);
    const first = services(fixture.repository);
    const failure = new Error("settlement reply database write failed");
    const gate = fixture.pauseNextWrite();
    const request = submit(first.fleet, caseId, "First attempt failed");
    const outcome = request.then(
      (response) => ({ response, error: undefined }),
      (error: unknown) => ({ response: undefined, error }),
    );
    await vi.waitFor(() =>
      expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
    );
    gate.reject(failure);
    expect((await outcome).error).toEqual(failure);

    expect(fixture.readCommitted()).toEqual(state);
    const afterFailure = await first.cases.getCaseTimeline(
      "fleet-reply-test",
      caseId,
    );
    expect(afterFailure.filter((item) => item.t === "車行回覆")).toEqual([]);

    const retry = await submit(first.fleet, caseId, "First attempt failed");
    expect(fixture.persistChanges).toHaveBeenCalledTimes(2);
    expect(retry.data.deduplicated).toBe(false);
    const repeated = await submit(first.fleet, caseId, "First attempt failed");
    expect(repeated.data).toEqual({ ...retry.data, deduplicated: true });
    expect(fixture.persistChanges).toHaveBeenCalledTimes(2);

    const fresh = services(fixture.repository);
    const committedTimeline = await fresh.ops.getComplaintTimeline(caseId);
    expect(
      committedTimeline.data.items.filter(
        (entry) => entry.action === "case_note_added",
      ),
    ).toEqual([
      expect.objectContaining({
        note: "[車行回覆 · fleet-reply-test] First attempt failed",
      }),
    ]);
  });

  it("waits for an overlapping retry and commits one note and one receipt for the same key", async () => {
    const state = settlement();
    const caseId = state.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(state);
    const first = services(fixture.repository);
    const gate = fixture.pauseNextWrite();
    let firstCompleted = false;
    let retryCompleted = false;
    const request = submit(first.fleet, caseId, "Concurrent retry");
    void request.then(() => {
      firstCompleted = true;
    });
    await vi.waitFor(() =>
      expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
    );

    const retry = submit(first.fleet, caseId, "Concurrent retry");
    void retry.then(() => {
      retryCompleted = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(firstCompleted).toBe(false);
    expect(retryCompleted).toBe(false);
    expect(fixture.persistChanges).toHaveBeenCalledTimes(1);

    gate.resolve();
    const [response, repeated] = await Promise.all([request, retry]);
    expect(response.data.deduplicated).toBe(false);
    expect(repeated.data).toEqual({ ...response.data, deduplicated: true });
    expect(fixture.persistChanges).toHaveBeenCalledTimes(1);
    expect(
      fixture
        .readCommitted()
        .complaintTimelines.filter(
          (entry) => entry.action === "case_note_added",
        ),
    ).toHaveLength(1);
    const timeline = await first.cases.getCaseTimeline(
      "fleet-reply-test",
      caseId,
    );
    expect(timeline.filter((entry) => entry.t === "車行回覆")).toHaveLength(1);
  });

  it("acknowledges a committed reply independently of a later different-key write failure", async () => {
    const state = settlement();
    const caseId = state.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(state);
    const first = services(fixture.repository);
    const gateA = fixture.pauseNextWrite();
    const gateB = fixture.pauseNextWrite();
    const failure = new Error("The second reply failed to persist");
    let aCompleted = false;
    // Both requests start before their shared initial refresh resolves, so B
    // can queue behind A before A is acknowledged. Each acknowledgement must
    // follow its own persistence promise rather than the latest case write.
    const aOutcome = submit(first.fleet, caseId, "Reply A", "request-A").then(
      (response) => {
        aCompleted = true;
        return { response, error: undefined };
      },
      (error: unknown) => {
        aCompleted = true;
        return { response: undefined, error };
      },
    );
    const bOutcome = submit(first.fleet, caseId, "Reply B", "request-B").then(
      (response) => ({ response, error: undefined }),
      (error: unknown) => ({ response: undefined, error }),
    );
    try {
      await vi.waitFor(() =>
        expect(fixture.persistChanges).toHaveBeenCalledTimes(1),
      );
      gateA.resolve();
      await vi.waitFor(() =>
        expect(fixture.persistChanges).toHaveBeenCalledTimes(2),
      );
      await vi.waitFor(() => expect(aCompleted).toBe(true));
      const a = await aOutcome;
      expect(a.error).toBeUndefined();
      expect(a.response?.data).toMatchObject({
        content: "Reply A",
        deduplicated: false,
      });

      gateB.reject(failure);
      expect((await bOutcome).error).toEqual(failure);
      const replayA = await submit(first.fleet, caseId, "Reply A", "request-A");
      expect(replayA.data).toEqual({ ...a.response!.data, deduplicated: true });
      expect(fixture.persistChanges).toHaveBeenCalledTimes(2);
      const retryB = await submit(first.fleet, caseId, "Reply B", "request-B");
      expect(retryB.data.deduplicated).toBe(false);
      expect(fixture.persistChanges).toHaveBeenCalledTimes(3);
      const notes = fixture
        .readCommitted()
        .complaintTimelines.filter(
          (entry) => entry.action === "case_note_added",
        );
      expect(notes.map((entry) => entry.note)).toEqual([
        "[車行回覆 · fleet-reply-test] Reply A",
        "[車行回覆 · fleet-reply-test] Reply B",
      ]);
    } finally {
      gateA.resolve();
      gateB.resolve();
      await Promise.all([aOutcome, bOutcome]);
    }
  });

  it("persists a Fleet reply on a resolved settlement while retaining its resolution", async () => {
    const state = settlement("resolved");
    const caseId = state.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(state);
    const first = services(fixture.repository);
    const before = (await first.cases.listCases("fleet-reply-test")).find(
      (item) => item.id === caseId,
    );
    expect(before?.actionDescriptor.enabled).toBe(true);

    const response = await submit(
      first.fleet,
      caseId,
      "Acknowledged adjustment",
    );
    expect(response.data.content).toBe("Acknowledged adjustment");
    expect(fixture.persistChanges).toHaveBeenCalledTimes(1);

    const fresh = services(fixture.repository);
    const detail = await fresh.ops.getComplaintCase(caseId);
    expect(detail.data).toMatchObject({
      status: "resolved",
      resolutionCode: "resolved_with_refund",
      closingNote: "Statement adjustment agreed",
    });
    const timeline = await fresh.ops.getComplaintTimeline(caseId);
    expect(timeline.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "case_note_added",
          note: "[車行回覆 · fleet-reply-test] Acknowledged adjustment",
        }),
      ]),
    );
  });

  it("keeps a closed settlement read-only without publishing or persisting a reply", async () => {
    const state = settlement("closed");
    const caseId = state.complaintCases[0]!.caseNo;
    const fixture = repositoryFixture(state);
    const first = services(fixture.repository);
    const before = (await first.cases.listCases("fleet-reply-test")).find(
      (item) => item.id === caseId,
    );
    expect(before?.actionDescriptor.enabled).toBe(false);

    await expect(
      submit(first.fleet, caseId, "Reply after closure"),
    ).rejects.toMatchObject({
      code: "CASE_CLOSED_NO_REPLY",
    });
    expect(fixture.persistChanges).not.toHaveBeenCalled();
    expect(fixture.readCommitted()).toEqual(state);
  });

  it("retains ordinary in-memory Fleet reply and idempotency behavior without a database", async () => {
    const first = services();
    const ordinary = first.complaints.createComplaintCase({
      caseSource: "web",
      category: "driver_service",
      severity: "normal",
      description: "Ordinary Fleet complaint",
    });
    const receipt = await first.cases.submitReply(
      "METRO_FLEET",
      ordinary.caseNo,
      "fleet-manager",
      { content: "Driver follow-up completed", idempotencyKey: "ordinary-key" },
    );
    expect(receipt.deduplicated).toBe(false);
    expect(first.complaints.getComplaintCase(ordinary.caseNo).status).toBe(
      "under_investigation",
    );
    expect(first.complaints.getComplaintTimeline(ordinary.caseNo)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          note: "[車行回覆 · METRO_FLEET] Driver follow-up completed",
        }),
      ]),
    );
    const repeated = await first.cases.submitReply(
      "METRO_FLEET",
      ordinary.caseNo,
      "fleet-manager",
      { content: "Driver follow-up completed", idempotencyKey: "ordinary-key" },
    );
    expect(repeated).toEqual({ ...receipt, deduplicated: true });
    expect(
      first.complaints
        .getComplaintTimeline(ordinary.caseNo)
        .filter((entry) => entry.action === "case_note_added"),
    ).toHaveLength(1);
  });
});
