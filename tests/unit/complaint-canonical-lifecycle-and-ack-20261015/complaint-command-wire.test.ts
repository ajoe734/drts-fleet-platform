import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

type Result = {
  ok: boolean;
  code?: string;
  result?: { data: { caseNo?: string; complaintCase?: { caseNo: string } } };
};
type Observations = {
  "escalation-unknown-landed": Escalation;
  "escalation-unknown-not-landed": Escalation;
  distinctKeyReservation: {
    attempts: Result[];
    retry: Result;
    caseNos: string[];
    entryIds: string[];
  };

  identityReadFailure: { result: Result; caseCount: number };
  sameKeyReservation: {
    attempts: Result[];
    replay: Result;
    caseNos: string[];
    commandCount: number;
    entryIds: string[];
  };
  noteKeys: {
    first: Result;
    second: Result;
    replay: Result;
    conflict: Result;
    entries: { action: string }[];
  };
  R1: {
    first: Result;
    businessCommits: number;
    caseCount: number;
    trace: string[];
  };
  "unknown-landed": Recovery;
  "unknown-not-landed": Recovery;
  unknownThenFailed: Result;
  R3: {
    afterRefresh: { assigneeId: string };
    timelineAfterRefresh: { action: string }[];
    canonical: { assigneeId: string };
    note: Result;
    savedTimeline: unknown[];
  };
  R5: {
    first: Result;
    second: Result;
    replay: Result;
    conflict: Result;
    firstCaseNo: string;
    secondActionId: string;
    replaySecondActionId: string;
    auditCountBeforeLocalReplay: number;
    auditCountAfterLocalReplay: number;
    caseNos: string[];
    entryIds: string[];
  };
};
type Recovery = {
  first: Result;
  retry: Result;
  originalCaseNo: string;
  originalEntryIds: string[];
  savedEntryIds: string[];
  caseNos: string[];
  trace: string[];
};

type Escalation = {
  first: Result;
  retry: Result;
  replay: Result;
  conflict: Result;
  originalIncidentId: string;
  originalEntryIds: string[];
  escalationEntries: { entryId: string }[];
  incidentIds: string[];
};

describe("R1/R2/R3/R5: actual caller and repository command recovery", () => {
  let observed: Observations;
  beforeAll(() => {
    const output = execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("./complaint-command-wire-probe.mjs", import.meta.url),
        ),
      ],
      { encoding: "utf8" },
    );
    const lines = output.trim().split("\n");
    const parsed = JSON.parse(lines.at(-1)!);
    expect(parsed.forbiddenNetworkOrListenAttempts).toBe(0);
    observed = parsed.observations;
  });

  it("R1 rejects a failed durable PREPARED reservation before any business COMMIT", () => {
    expect(observed.R1.first.ok).toBe(false);
    expect(observed.R1.businessCommits).toBe(0);
    expect(observed.R1.caseCount).toBe(0);
  });

  it("R1 prepares the original IDs before an ambiguous COMMIT and confirms in its transaction", () => {
    const trace = observed["unknown-landed"].trace;
    expect(trace.indexOf("PREPARED")).toBeLessThan(trace.indexOf("COMMIT"));
    expect(trace.indexOf("confirm-in-transaction")).toBeLessThan(
      trace.indexOf("COMMIT"),
    );
  });

  it("R2 replays the confirmed original same-call case and entry IDs after restart", () => {
    const row = observed["unknown-landed"];
    expect(row.first.ok).toBe(false);
    expect(row.retry.ok).toBe(true);
    expect(row.retry.result!.data.complaintCase!.caseNo).toBe(
      row.originalCaseNo,
    );
    expect(row.caseNos).toEqual([row.originalCaseNo]);
    expect(row.savedEntryIds).toEqual(row.originalEntryIds);
    expect(row.trace.filter((op) => op === "COMMIT")).toHaveLength(1);
  });

  it("R2 preserves an uncommitted prepared identity through a definitely failed retry", () => {
    const row = observed["unknown-not-landed"];
    expect(row.first.ok).toBe(false);
    expect(observed.unknownThenFailed.ok).toBe(false);
    expect(row.retry.ok).toBe(true);
    expect(row.retry.result!.data.complaintCase!.caseNo).toBe(
      row.originalCaseNo,
    );
    expect(row.caseNos).toEqual([row.originalCaseNo]);
    expect(row.savedEntryIds).toEqual(row.originalEntryIds);
  });

  it("R3 reconciles the canonical assignment and full timeline before a warm replica adds a note", () => {
    expect(observed.R3.afterRefresh.assigneeId).toBe("ops-assignee-A");
    expect(
      observed.R3.timelineAfterRefresh.map((entry) => entry.action),
    ).toEqual(["case_created", "case_assigned"]);
    expect(observed.R3.note.ok).toBe(true);
    expect(observed.R3.canonical.assigneeId).toBe("ops-assignee-A");
    expect(observed.R3.savedTimeline).toHaveLength(3);
  });

  it("R5 carries actual K1/K2 keys to the domain and preserves same-key payload conflict", () => {
    const row = observed.R5;
    expect(row.first.ok).toBe(false);
    expect(row.second.ok).toBe(true);
    expect(row.second.result!.data.caseNo).not.toBe(row.firstCaseNo);
    expect(row.replay.ok).toBe(true);
    expect(row.replay.result!.data.caseNo).toBe(row.firstCaseNo);
    expect(row.caseNos).toHaveLength(2);
    expect(row.entryIds).toHaveLength(2);
    expect(row.conflict).toMatchObject({
      ok: false,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
  });
  it("R1 propagates a failed identity lookup before a new keyed create", () => {
    expect(observed.identityReadFailure.result.ok).toBe(false);
    expect(observed.identityReadFailure.caseCount).toBe(0);
  });

  it("R1/R2 does not replace the winner of a concurrent same-key PREPARED reservation", () => {
    const row = observed.sameKeyReservation;
    expect(row.attempts.filter((attempt) => attempt.ok)).toHaveLength(1);
    expect(row.attempts.filter((attempt) => !attempt.ok)).toMatchObject([
      { code: "IDEMPOTENCY_IN_PROGRESS" },
    ]);
    expect(row.replay.ok).toBe(true);
    expect(row.caseNos).toHaveLength(1);
    expect(row.commandCount).toBe(1);
    expect(row.entryIds).toHaveLength(1);
    expect(row.replay.result!.data.caseNo).toBe(row.caseNos[0]);
  });

  it("R5 keeps the original key's action receipt when another key has the same payload", () => {
    expect(observed.R5.replaySecondActionId).toBe(observed.R5.secondActionId);
    expect(observed.R5.auditCountAfterLocalReplay).toBe(
      observed.R5.auditCountBeforeLocalReplay,
    );
  });

  it("R5 preserves distinct equal notes and replays the original note after restart without another entry", () => {
    const row = observed.noteKeys;
    expect(row.first.ok).toBe(false);
    expect(row.second.ok).toBe(true);
    expect(row.replay.ok).toBe(true);
    expect(row.conflict).toMatchObject({
      ok: false,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    expect(row.entries.map((entry) => entry.action)).toEqual([
      "case_created",
      "case_note_added",
      "case_note_added",
    ]);
  });
  it.each([
    "escalation-unknown-landed",
    "escalation-unknown-not-landed",
  ] as const)(
    "retains original escalation target/timeline through the actual controller (%s)",
    (key) => {
      const row = observed[key];
      expect(row.first.ok).toBe(false);
      expect(row.retry.ok).toBe(true);
      expect(row.replay.ok).toBe(true);
      expect(row.incidentIds).toEqual([row.originalIncidentId]);
      expect(row.escalationEntries.map((entry) => entry.entryId)).toEqual(
        row.originalEntryIds,
      );
      expect(row.conflict).toMatchObject({
        ok: false,
        code: "IDEMPOTENCY_KEY_REUSED",
      });
    },
  );

  it("R1/R5 prevents concurrent distinct keys from overwriting a reserved create case number", () => {
    const row = observed.distinctKeyReservation;
    expect(row.attempts.filter((attempt) => attempt.ok)).toHaveLength(1);
    expect(row.attempts.filter((attempt) => !attempt.ok)).toMatchObject([
      { code: "IDEMPOTENCY_IN_PROGRESS" },
    ]);
    expect(row.retry.ok).toBe(true);
    expect(new Set(row.caseNos).size).toBe(2);
    expect(row.entryIds).toHaveLength(2);
  });
});
