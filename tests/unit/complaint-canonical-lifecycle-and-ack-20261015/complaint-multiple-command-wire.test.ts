import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

type Outcome = {
  ok: boolean;
  code?: string;
  result?: { data: { assigneeId: string } };
};
type Entry = { entryId: string; action: string; note: string };
type Command = {
  timeline_snapshot: Entry[];
  command_payload: { complaintCommandIdentity?: { key: string } };
};
type Hidden = {
  first: Outcome;
  unrelated: Outcome;
  retry: Outcome;
  afterConfirmation: Outcome;
  replay?: Outcome;
  readback: Outcome;
  original: Command;
  finalCase: { assigneeId: string };
  entries: Entry[];
};
type Multiple = {
  first: Outcome;
  second: Outcome;
  pendingBefore: number;
  retryA: Outcome;
  warmUnrelated: Outcome;
  freshUnrelated: Outcome;
  staleRetryB: Outcome;
  staleRetryWrites: number;
  otherAssignment: Outcome;
  finalCase: { assigneeId: string };
  unresolved: Command[];
};
type Successor = {
  first: Outcome;
  second: Outcome;
  retry: Outcome;
  readback: Outcome;
  writes: number;
  auditCount: number;
  finalCase: { assigneeId: string };
  entries: Entry[];
  unresolved: Command[];
};

describe("original R3: all same-case prepared identities survive reconciliation", () => {
  let observed: {
    hidden: Record<string, Hidden>;
    multiple: Record<string, Multiple>;
    successor: Record<string, Successor>;
    legacySla: {
      first: Outcome;
      retry: Outcome;
      note: Outcome;
      original: Command;
      entries: Entry[];
      unresolved: Command[];
    };
    lifecycle: {
      caseNo: string;
      resolvedReopen: Outcome;
      closedResolve: Outcome;
      readback: {
        data: {
          caseNo: string;
          status: string;
          reopenCount: number;
          assigneeId: string;
        };
      };
      entries: Entry[];
    };
    delayedDeletedIdentity: Record<
      string,
      {
        first: Outcome;
        rowsAfterCleanup: Command[];
        delayedRead: Outcome;
        retry: Outcome;
        finalCase: { assigneeId: string };
        entries: Entry[];
        unresolved: Command[];
      }
    >;
    localDuringRead: Record<
      string,
      {
        first: Outcome;
        unrelated: Outcome;
        retry: Outcome;
        original: Command;
        finalCase: { assigneeId: string };
        entries: Entry[];
      }
    >;
    queuedTypedRejection: {
      first: Outcome;
      queued: Outcome;
      foreign: Outcome;
      original: Command;
      remaining: Command[];
      retry: Outcome;
      finalCase: { assigneeId: string };
      entries: Entry[];
    };
    queuedDefiniteFailure: {
      first: Outcome;
      queued: Outcome;
      foreign: Outcome;
      original: Command;
      remaining: Command[];
      retry: Outcome;
      finalCase: { assigneeId: string };
      entries: Entry[];
    };
    cleanupFailure: Record<
      string,
      {
        first: Outcome;
        remainingAfterFailure: Command[];
        replacement?: Outcome;
        original?: Command;
        retry: Outcome;
        finalCase: { assigneeId: string };
        entries: Entry[];
        unresolved: Command[];
      }
    >;
    replacedInFlight: Record<
      string,
      {
        first: Outcome;
        original: Command;
        replacement: Outcome;
        winner: Command;
        oldRetry: Outcome;
        oldWrites: number;
        oldAudits: number;
        finalRetry: Outcome;
        finalCase: { assigneeId: string };
        entries: Entry[];
      }
    >;
    classificationFailure: {
      first: Outcome;
      original: Command[];
      withoutProof: Outcome;
      retained: Command[];
      recovered: Outcome;
      finalCase: { assigneeId: string };
      entries: Entry[];
    };
    delayedLegacyCleanup: {
      first: Outcome;
      confirmedRead: Outcome;
      second: Outcome;
      original: Command;
      retained: Command[];
      retry: Outcome;
      entries: Entry[];
    };
    definitePredecessorFailure: {
      first: Outcome;
      retry: Outcome;
      finalCase: { assigneeId: string };
      entries: Entry[];
      unresolved: Command[];
    };
  };
  beforeAll(() => {
    const output = execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            "./complaint-multiple-command-wire-probe.mjs",
            import.meta.url,
          ),
        ),
      ],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(output.trim().split("\n").at(-1)!);
    expect(parsed.forbiddenNetworkOrListenAttempts).toBe(0);
    observed = parsed;
  });

  it.each([
    "forward-keyed",
    "reverse-keyed",
    "rotate-keyed",
    "forward-legacy",
    "reverse-legacy",
    "rotate-legacy",
  ])(
    "confirmed history cannot hide pending identity, and original IDs replay (%s)",
    (key) => {
      const row = observed.hidden[key]!;
      expect(row.first.ok).toBe(false);
      expect(row.unrelated).toMatchObject({
        ok: false,
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
      expect(row.retry.ok).toBe(true);
      expect(row.afterConfirmation.ok).toBe(true);
      if (row.replay) expect(row.replay.ok).toBe(true);
      expect(row.finalCase.assigneeId).toBe("B");
      expect(row.readback.result!.data.assigneeId).toBe("B");
      expect(
        row.entries
          .filter((entry) => entry.note === "Assigned to A.")
          .map((entry) => entry.entryId),
      ).toEqual(row.original.timeline_snapshot.map((entry) => entry.entryId));
      expect(
        row.entries.filter((entry) => entry.action === "case_assigned"),
      ).toHaveLength(2);
    },
  );

  it.each(["forward", "reverse", "rotate"])(
    "confirming one command preserves every other pending command (%s)",
    (order) => {
      const row = observed.multiple[order]!;
      expect(row.first.ok).toBe(false);
      expect(row.second.ok).toBe(false);
      expect(row.pendingBefore).toBe(2);
      expect(row.retryA.ok).toBe(true);
      expect(row.warmUnrelated).toMatchObject({
        ok: false,
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
      expect(row.freshUnrelated).toMatchObject({
        ok: false,
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
      expect(row.staleRetryB).toMatchObject({
        ok: false,
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
      expect(row.staleRetryWrites).toBe(0);
      expect(row.finalCase.assigneeId).toBe("A");
      expect(row.unresolved).toHaveLength(1);
      expect(
        row.unresolved[0]!.command_payload.complaintCommandIdentity!.key,
      ).toBe("prepared-B");
      expect(row.otherAssignment.ok).toBe(true);
    },
  );

  it.each(["fresh", "warm"])(
    "an old pending retry cannot overwrite an acknowledged successor (%s)",
    (kind) => {
      const row = observed.successor[kind]!;
      expect(row.first.ok).toBe(false);
      expect(row.second.ok).toBe(true);
      expect(row.retry).toMatchObject({
        ok: false,
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
      expect(row.writes).toBe(0);
      expect(row.auditCount).toBe(0);
      expect(row.finalCase.assigneeId).toBe("B");
      expect(row.readback.result!.data.assigneeId).toBe("B");
      expect(
        row.entries.filter((entry) => entry.note === "Assigned to A."),
      ).toHaveLength(0);
      expect(row.unresolved).toHaveLength(1);
    },
  );

  it("preserves the exact legacy SLA identity stored with a null payload across restart", () => {
    const row = observed.legacySla;
    expect(row.first.ok).toBe(false);
    expect(row.retry.ok).toBe(true);
    expect(row.entries.map((entry) => entry.entryId)).toEqual(
      row.original.timeline_snapshot.map((entry) => entry.entryId),
    );
    expect(row.unresolved).toHaveLength(0);
    expect(row.note.ok).toBe(true);
  });

  it("preserves actual canonical create/assign/note/resolve/close/reopen and terminal denials", () => {
    const row = observed.lifecycle;
    expect(row.resolvedReopen).toMatchObject({
      ok: false,
      code: "COMPLAINT_NOT_CLOSED",
    });
    expect(row.closedResolve).toMatchObject({
      ok: false,
      code: "COMPLAINT_ALREADY_CLOSED",
    });
    expect(row.readback.data).toMatchObject({
      caseNo: row.caseNo,
      status: "reopened",
      reopenCount: 1,
      assigneeId: "lifecycle-owner",
    });
    expect(row.entries.map((entry) => entry.action)).toEqual([
      "case_created",
      "case_assigned",
      "case_note_added",
      "case_resolved",
      "case_closed",
      "case_reopened",
      "sla_recalculated",
    ]);
    expect(new Set(row.entries.map((entry) => entry.entryId)).size).toBe(7);
  });

  it("refreshes and retries a new command definitely rejected before COMMIT", () => {
    const row = observed.definitePredecessorFailure;
    expect(row.first).toMatchObject({
      ok: false,
      code: "IDEMPOTENCY_IN_PROGRESS",
    });
    expect(row.retry.ok).toBe(true);
    expect(row.finalCase.assigneeId).toBe("legacy-owner");
    expect(row.entries.map((entry) => entry.action)).toEqual([
      "case_created",
      "case_assigned",
      "case_note_added",
    ]);
    expect(row.unresolved).toHaveLength(0);
  });

  it.each(["same", "other"])(
    "a late deleted identity converges before same-key retry (%s replica)",
    (kind) => {
      const row = observed.delayedDeletedIdentity[kind]!;
      expect(row.first).toMatchObject({
        ok: false,
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
      expect(row.rowsAfterCleanup).toHaveLength(0);
      expect(row.delayedRead.ok).toBe(true);
      expect(row.retry.ok).toBe(true);
      expect(row.finalCase.assigneeId).toBe("delayed-owner");
      expect(row.entries.map((entry) => entry.action)).toEqual([
        "case_created",
        "case_assigned",
        "case_note_added",
      ]);
      expect(row.unresolved).toHaveLength(0);
    },
  );

  it.each(["unknown", "inflight"])(
    "an earlier identity reply preserves a newer local command (%s)",
    (kind) => {
      const row = observed.localDuringRead[kind]!;
      expect(row.first.ok).toBe(false);
      expect(row.unrelated).toMatchObject({
        ok: false,
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
      expect(row.retry.ok).toBe(true);
      expect(row.finalCase.assigneeId).toBe("local-A");
      expect(
        row.entries
          .filter((entry) => entry.action === "case_assigned")
          .map((entry) => entry.entryId),
      ).toEqual(row.original.timeline_snapshot.map((entry) => entry.entryId));
    },
  );

  it.each(["typed", "generic"])(
    "a queued inherited failure cannot clear another replica's reservation (%s)",
    (kind) => {
      const row =
        kind === "typed"
          ? observed.queuedTypedRejection
          : observed.queuedDefiniteFailure;
      expect(row.first.ok).toBe(false);
      expect(row.queued.ok).toBe(false);
      if (kind === "typed") {
        expect(row.first.code).toBe("IDEMPOTENCY_IN_PROGRESS");
        expect(row.queued.code).toBe("IDEMPOTENCY_IN_PROGRESS");
      }
      expect(row.foreign.ok).toBe(false);
      expect(row.remaining).toHaveLength(1);
      expect(row.remaining[0]!.timeline_snapshot).toEqual(
        row.original.timeline_snapshot,
      );
      expect(row.retry.ok).toBe(true);
      expect(row.finalCase.assigneeId).toBe("queue-owner");
      expect(
        row.entries
          .filter((entry) => entry.action === "case_note_added")
          .map((entry) => entry.entryId),
      ).toEqual(row.original.timeline_snapshot.map((entry) => entry.entryId));
    },
  );

  it.each(["before", "fresh-before", "ack", "replacement"])(
    "a definitely rejected new command recovers after DELETE failure (%s)",
    (mode) => {
      const row = observed.cleanupFailure[mode]!;
      expect(row.first.ok).toBe(false);
      expect(row.remainingAfterFailure).toHaveLength(
        ["before", "fresh-before"].includes(mode) ? 1 : 0,
      );
      if (row.replacement) expect(row.replacement.ok).toBe(false);
      expect(row.retry.ok).toBe(true);
      expect(row.finalCase.assigneeId).toBe("cleanup-owner");
      expect(row.entries.map((entry) => entry.action)).toEqual([
        "case_created",
        "case_assigned",
        "case_note_added",
      ]);
      expect(row.unresolved).toHaveLength(0);
      if (row.original)
        expect(
          row.entries
            .filter((entry) => entry.action === "case_note_added")
            .map((entry) => entry.entryId),
        ).toEqual(row.original.timeline_snapshot.map((entry) => entry.entryId));
    },
  );

  it.each(["pending", "confirmed"])(
    "an old in-flight snapshot cannot claim a replacement reservation (%s)",
    (status) => {
      const row = observed.replacedInFlight[status]!;
      expect(row.first.ok).toBe(false);
      expect(row.replacement.ok).toBe(status === "confirmed");
      expect(row.winner.timeline_snapshot).not.toEqual(
        row.original.timeline_snapshot,
      );
      expect(row.oldRetry).toMatchObject({
        ok: false,
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
      expect(row.oldWrites).toBe(0);
      expect(row.oldAudits).toBe(0);
      expect(row.finalRetry.ok).toBe(true);
      expect(row.finalCase.assigneeId).toBe("replacement-owner");
      expect(
        row.entries
          .filter((entry) => entry.action === "case_note_added")
          .map((entry) => entry.entryId),
      ).toEqual(row.winner.timeline_snapshot.map((entry) => entry.entryId));
    },
  );

  it("preserves identity without durable rejection proof and recovers when its owner completes classification", () => {
    const row = observed.classificationFailure;
    expect(row.first.ok).toBe(false);
    expect(row.original).toHaveLength(1);
    expect(row.withoutProof).toMatchObject({
      ok: false,
      code: "IDEMPOTENCY_IN_PROGRESS",
    });
    expect(row.retained).toEqual(row.original);
    expect(row.recovered.ok).toBe(true);
    expect(row.finalCase.assigneeId).toBe("classification-owner");
    expect(row.entries.map((entry) => entry.action)).toEqual([
      "case_created",
      "case_assigned",
      "case_note_added",
    ]);
  });

  it("a delayed duplicate legacy cleanup preserves the next unknown same-key identity", () => {
    const row = observed.delayedLegacyCleanup;
    expect(row.first.ok).toBe(true);
    expect(row.confirmedRead.ok).toBe(true);
    expect(row.second.ok).toBe(false);
    expect(row.retained).toHaveLength(1);
    expect(row.retained[0]!.timeline_snapshot).toEqual(
      row.original.timeline_snapshot,
    );
    expect(row.retry.ok).toBe(true);
    const notes = row.entries.filter(
      (entry) => entry.action === "case_note_added",
    );
    expect(notes).toHaveLength(2);
    expect(notes.at(-1)!.entryId).toBe(
      row.original.timeline_snapshot[0]!.entryId,
    );
  });
});
