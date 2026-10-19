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
});
