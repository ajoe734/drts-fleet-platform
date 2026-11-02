import {
  PASSENGER_FEE_CONTENT_HASH,
  PASSENGER_FEE_DISCLOSURE_VERSION,
} from "@drts/contracts";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cancellationResults,
  runFourStageOwnedCancellations,
} from "../../e2e/owned-referral-business-journey/four-stage-cancellations";
import {
  Evidence,
  JourneyFailure,
  NativeTransport,
  object,
  persistPrivateJson,
  terminalizeOwnOrder,
  type CallOptions,
  type CallResult,
  type ObjectData,
} from "../../e2e/owned-referral-business-journey/protocol";
import {
  RunFinalizer,
  cancellationCleanupNeeded,
  cancellationCleanupPhase,
  completeOwnCancellationCleanup,
  finalizeAfterRunner,
  handoffOwnCancellations,
  type FinalizationPorts,
  type FinalizationReason,
  type OrderCustody,
  type RunCustodySnapshot,
  type StepRunner,
} from "../../e2e/owned-referral-business-journey/run-finalization";

const DEFINITION = "c".repeat(40);
const RUNTIME = "1".repeat(40);
const INVITATION = "INVITE-SECRET-0001";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lZCJ9.c2lnbmF0dXJlLXZhbHVl";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Harness = {
  dir: string;
  finalizer: RunFinalizer;
  custody: RunCustodySnapshot;
  evidence: Evidence;
  cleanupErrors: string[];
  planCalls: FinalizationReason[];
  stopCalls: number;
  facts: () => Promise<Record<string, unknown>>;
  artifact: (name: string) => Promise<Record<string, unknown>>;
};

async function harness(
  plan: (
    step: StepRunner,
    h: Harness,
    reason: FinalizationReason,
  ) => Promise<void>,
  overrides: Partial<FinalizationPorts> = {},
  orders: OrderCustody[] = [],
): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), "owned-finalization-"));
  const h = {
    dir,
    custody: {
      orders,
      supply: [
        {
          actor: "first",
          driverId: id(901),
          vehicleId: id(902),
          deviceId: id(903),
          bindingId: id(904),
          invitationIssued: true,
        },
        { actor: "second", invitationIssued: false },
      ],
      sessions: [
        { role: "admin", sessionId: id(801) },
        { role: "ops", sessionId: id(802) },
        { role: "referral", sessionId: undefined },
      ],
    },
    evidence: new Evidence(),
    cleanupErrors: [] as string[],
    planCalls: [] as FinalizationReason[],
    stopCalls: 0,
    facts: async () =>
      JSON.parse(
        await readFile(
          join(dir, "cancellations/run-finalization-facts.json"),
          "utf8",
        ),
      ),
    artifact: async (name: string) =>
      JSON.parse(await readFile(join(dir, name), "utf8")),
  } as Harness;
  h.finalizer = new RunFinalizer({
    definitionSha: DEFINITION,
    runtimeSha: RUNTIME,
    nonce: "owned-referral-40689200536-nonce",
    checkpointFile: join(dir, "cancellations/run-finalization-facts.json"),
    persist: persistPrivateJson,
    custody: () => h.custody,
    secrets: () => [TOKEN, INVITATION, undefined],
    onCleaned: (stage) => h.evidence.record({ stage, result: "cleaned" }),
    onFailed: (stage, error) => {
      h.cleanupErrors.push(stage);
      h.evidence.failure(error);
    },
    stopInterruptedBody: async () => {
      h.stopCalls++;
    },
    plan: async (step, reason) => {
      h.planCalls.push(reason);
      await plan(step, h, reason);
    },
    artifacts: [
      {
        name: "supplemental-custody-persist",
        path: join(dir, "TEN03-06-custody.json"),
        build: (summary) => ({
          definitionSha: DEFINITION,
          finalization: summary,
        }),
      },
      {
        name: "journey-evidence-persist",
        path: join(dir, "journey-evidence.json"),
        build: (summary) => ({
          definitionSha: DEFINITION,
          cleanupErrors: [...h.cleanupErrors],
          events: h.evidence.events,
          finalization: summary,
        }),
      },
    ],
    ...overrides,
  });
  return h;
}

// The seven acknowledged journals of FULL 40689200536: main + C1–C4 + two
// reservations; no redispatched journal existed.
function sevenAcknowledged(): OrderCustody[] {
  return [
    {
      slot: "main",
      orderId: id(1),
      journalState: "acknowledged",
      bodySha256: "a".repeat(64),
      journalFile: "booking-write-journal.json",
      ownerTerminal: true,
    },
    ...(
      [
        "unassigned",
        "assigned-not-arrived",
        "arrived-not-started",
        "on-trip",
      ] as const
    ).map(
      (slot, index): OrderCustody => ({
        slot,
        orderId: id(10 + index),
        journalState: "acknowledged",
        journalFile: `cancellations/${slot}-booking-write-journal.json`,
        taskId: index ? id(20 + index) : undefined,
        assignmentId: index ? id(30 + index) : undefined,
        ownerTerminal: true,
        ownerRecovery: index ? "normal-driver-completion" : "already-terminal",
      }),
    ),
    ...(["reservation-1", "reservation-2"] as const).map(
      (slot, index): OrderCustody => ({
        slot,
        orderId: id(40 + index),
        journalState: "acknowledged",
        bodySha256: String(index).repeat(64),
        journalFile: `TEN03-06/${slot}/booking-write-journal.json`,
        ownerTerminal: false,
      }),
    ),
  ];
}

const never = () => new Promise<never>(() => undefined);

describe("owned FULL run finalization custody", () => {
  it("(a) a real exhausted budget bounds the sequence and still writes evidence", async () => {
    const h = await harness(
      async (step) => {
        await step("own-order-normal-terminalization", never);
        await step("own-Admin-session-revoked", async () => undefined);
      },
      // Also covers the real fsync'd in-flight fact written before the step.
      { budgetMs: 300 },
    );
    const started = Date.now();
    const result = await h.finalizer.run("failed");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.steps).toEqual([
      {
        stage: "own-order-normal-terminalization",
        outcome: "unknown-budget-exhausted",
      },
      {
        stage: "own-Admin-session-revoked",
        outcome: "not-attempted-budget-exhausted",
      },
    ]);
    expect(h.cleanupErrors).toEqual([
      "own-order-normal-terminalization",
      "own-Admin-session-revoked",
    ]);
    expect(result.artifacts.map((a) => a.outcome)).toEqual([
      "written",
      "written",
    ]);
    const journey = await h.artifact("journey-evidence.json");
    expect(journey.finalization).toMatchObject({
      reason: "failed",
      budgetMs: 300,
    });
    const facts = await h.facts();
    expect(facts.status).toBe("finalized");
    expect(facts.wholeRunPassed).toBe(false);
  });

  it("(b) a runner timeout after seven ACKs finalizes from afterEach with full custody", async () => {
    const calls: string[] = [];
    const api = (path: string) => calls.push(path);
    const h = await harness(
      async (step, harnessState) => {
        for (const order of harnessState.custody.orders.filter(
          (o) => !o.ownerTerminal,
        ))
          await step(
            `supplemental-${order.slot}-normal-terminalization`,
            async () => {
              await guarded(
                `https://ops.invalid/orders/${order.orderId}/cancel`,
              );
              order.ownerTerminal = true;
            },
          );
      },
      {},
      sevenAcknowledged(),
    );
    const guarded = h.finalizer.guardFetch((async (input: unknown) => {
      api(String(input));
      return new Response("{}");
    }) as typeof fetch);
    await h.finalizer.checkpoint("low-rating-matrix");
    await h.finalizer.checkpoint("supplemental-reservation-2-original-booking");
    const running = await h.facts();
    expect(running.status).toBe("running");
    expect((running.orders as unknown[]).length).toBe(7);
    // The orphaned body continues after the runner moved on; afterEach runs.
    const result = await finalizeAfterRunner(h.finalizer, "timedOut");
    await expect(guarded("https://ops.invalid/booking")).rejects.toThrow(
      "business-request-after-finalization-start",
    );
    await expect(
      h.finalizer.checkpoint("redispatch-to-second"),
    ).rejects.toThrow("business-phase-after-finalization-start");
    expect(result?.reason).toBe("runner-timedOut");
    expect(h.stopCalls).toBe(1);
    expect(calls).toEqual([
      `https://ops.invalid/orders/${id(40)}/cancel`,
      `https://ops.invalid/orders/${id(41)}/cancel`,
    ]);
    expect(result?.unresolved).toEqual(["run-runner-timedOut"]);
    const facts = await h.facts();
    expect(facts.status).toBe("finalized");
    expect(facts.wholeRunPassed).toBe(false);
    expect((facts.phases as { phase: string }[]).map((p) => p.phase)).toEqual([
      "low-rating-matrix",
      "supplemental-reservation-2-original-booking",
    ]);
    const orders = facts.orders as Record<string, unknown>[];
    expect(orders.map((o) => o.slot)).toEqual([
      "main",
      "unassigned",
      "assigned-not-arrived",
      "arrived-not-started",
      "on-trip",
      "reservation-1",
      "reservation-2",
    ]);
    expect(
      orders.every(
        (o) => o.journalState === "acknowledged" && o.ownerTerminal === true,
      ),
    ).toBe(true);
    expect(await h.artifact("TEN03-06-custody.json")).toMatchObject({
      finalization: { reason: "runner-timedOut" },
    });
    expect(await h.artifact("journey-evidence.json")).toMatchObject({
      cleanupErrors: [],
      finalization: { reason: "runner-timedOut" },
    });
  });

  it("(c) a throw before the footer still writes TEN and journey evidence", async () => {
    const h = await harness(async (step) => {
      await step("own-synthetic-driver-offline", async () => undefined);
      throw new JourneyFailure("plan-invariant-broken");
    });
    const result = await h.finalizer.run("failed");
    expect(result.planError).toBe("plan-invariant-broken");
    expect(result.unresolved).toContain("finalization-plan-aborted");
    expect(h.cleanupErrors).toEqual(["finalization-plan-aborted"]);
    expect(result.artifacts).toEqual([
      { name: "supplemental-custody-persist", outcome: "written" },
      { name: "journey-evidence-persist", outcome: "written" },
    ]);
    expect(await h.artifact("journey-evidence.json")).toMatchObject({
      cleanupErrors: ["finalization-plan-aborted"],
      finalization: { planError: "plan-invariant-broken" },
    });
  });

  it("(d) one failed cleanup call does not stop later steps or evidence", async () => {
    const h = await harness(async (step) => {
      await step("own-synthetic-driver-offline", async () => undefined);
      await step("own-Driver-binding-revoked", () => {
        throw new JourneyFailure("own-binding-revoke", 503);
      });
      await step("own-Referral-session-self-revoked", async () => undefined);
    });
    const result = await h.finalizer.run("completed");
    expect(result.steps.map((s) => s.outcome)).toEqual([
      "cleaned",
      "failed",
      "cleaned",
    ]);
    expect(h.cleanupErrors).toEqual(["own-Driver-binding-revoked"]);
    expect(h.evidence.events).toContainEqual({
      stage: "own-binding-revoke",
      status: 503,
      result: "failed",
    });
    expect(result.unresolved).toEqual(["own-Driver-binding-revoked-failed"]);
    const facts = await h.facts();
    expect(facts.wholeRunPassed).toBe(false);
    expect((facts.finalization as { steps: unknown[] }).steps).toHaveLength(3);
  });

  it("(e) duplicate finalization executes the plan at most once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let executed = 0;
    const h = await harness(async (step) => {
      await step("own-Admin-session-revoked", async () => {
        executed++;
        await gate;
      });
    });
    const fromBody = h.finalizer.run("failed");
    const fromAfterEach = finalizeAfterRunner(h.finalizer, "timedOut");
    release();
    const [first, second] = await Promise.all([fromBody, fromAfterEach]);
    expect(second).toBe(first);
    expect(await h.finalizer.run("completed")).toBe(first);
    // The runner's abandon is authoritative over the body's own report.
    expect(first.reason).toBe("runner-timedOut");
    expect(first.supersededReasons).toEqual(["failed"]);
    // It arrived before the plan began, so the plan sees it and stops the body.
    expect(h.planCalls).toEqual(["runner-timedOut"]);
    expect(executed).toBe(1);
    expect(h.stopCalls).toBe(1);
    expect(await finalizeAfterRunner(undefined, "timedOut")).toBeUndefined();
  });

  it("(f) an unknown ACK is retained without retry or terminal assumption", async () => {
    const h = await harness(async () => undefined, {}, [
      {
        slot: "main",
        journalState: "ack_unknown",
        bodySha256: "b".repeat(64),
        journalFile: "booking-write-journal.json",
      },
      { slot: "reservation-1", orderId: id(40), journalState: "acknowledged" },
    ]);
    const result = await h.finalizer.run("failed");
    expect(result.steps).toEqual([]);
    expect(result.unresolved).toEqual([
      "run-failed",
      "main-booking-ACK-unknown-original-journal-retained",
      "reservation-1-owned-order-terminal-not-observed",
    ]);
    const orders = (await h.facts()).orders as Record<string, unknown>[];
    expect(orders[0]).toMatchObject({
      slot: "main",
      orderId: null,
      journalState: "ack_unknown",
      ownerTerminal: null,
    });
    expect(orders[1]).toMatchObject({ orderId: id(40), ownerTerminal: null });
  });

  it("(g) disk errors are recorded, body checkpoints fail closed and private values are redacted", async () => {
    const h = await harness(
      async (step) => {
        await step("own-Ops-session-self-revoked", async () => undefined);
      },
      {
        persist: async () => {
          throw Object.assign(new Error("disk"), { code: "ENOSPC" });
        },
      },
      [
        {
          slot: "main",
          orderId: TOKEN,
          journalState: "acknowledged",
          ownerRecovery: `x-${INVITATION}`,
        },
      ],
    );
    h.custody.supply[1] = {
      actor: "second",
      bindingId: INVITATION,
      deviceId: "has space",
    };
    await expect(
      h.finalizer.checkpoint("main-original-booking"),
    ).rejects.toThrow("business-checkpoint-not-durable");
    const result = await h.finalizer.run("failed");
    expect(result.checkpointWriteFailures).toBeGreaterThan(0);
    expect(result.steps).toEqual([
      { stage: "own-Ops-session-self-revoked", outcome: "cleaned" },
    ]);
    expect(result.artifacts.map((a) => a.outcome)).toEqual([
      "failed",
      "failed",
    ]);
    expect(result.unresolved).toEqual(
      expect.arrayContaining([
        "supplemental-custody-persist-not-written",
        "journey-evidence-persist-not-written",
      ]),
    );
    expect(result.unresolved).toContain("run-finalization-facts-not-durable");
    expect(result.wholeRunPassed).toBe(false);
    expect(h.cleanupErrors).toEqual([
      "run-finalization-facts-persist",
      "supplemental-custody-persist",
      "journey-evidence-persist",
      "run-finalization-final-facts-persist",
    ]);
    // The same private custody through a working disk never reaches the file.
    const clean = await harness(async () => undefined, {}, h.custody.orders);
    clean.custody.supply[1] = h.custody.supply[1]!;
    await clean.finalizer.checkpoint("main-original-booking");
    const raw = await readFile(
      join(clean.dir, "cancellations/run-finalization-facts.json"),
      "utf8",
    );
    expect(raw).not.toContain(TOKEN);
    expect(raw).not.toContain(INVITATION);
    expect(raw).not.toContain(id(801));
    const facts = JSON.parse(raw);
    expect(facts.orders[0]).toMatchObject({
      orderId: "redacted",
      ownerRecovery: "redacted",
    });
    expect(facts.supply[1]).toMatchObject({
      bindingId: "redacted",
      deviceId: "redacted",
    });
    expect(facts.sessions[0]).toMatchObject({ role: "admin", known: true });
    expect(facts.sessions[0].fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(facts.sessions[2]).toMatchObject({
      role: "referral",
      known: false,
      fingerprint: null,
    });
  });

  it("(h) a normal positive run keeps all eight owned orders, roles and states", async () => {
    const orders = [
      ...sevenAcknowledged(),
      {
        slot: "redispatched",
        orderId: id(50),
        journalState: "acknowledged",
        bodySha256: "e".repeat(64),
        journalFile: "TEN03-06/redispatched/booking-write-journal.json",
        ownerTerminal: true,
      } as OrderCustody,
    ];
    const h = await harness(
      async (step, state) => {
        for (const order of state.custody.orders.filter(
          (o) => !o.ownerTerminal,
        ))
          await step(
            `supplemental-${order.slot}-normal-terminalization`,
            async () => {
              order.ownerTerminal = true;
            },
          );
        await step("own-Admin-session-revoked", async () => undefined);
        await step("browser-context-closed", async () => undefined);
      },
      {},
      orders,
    );
    await h.finalizer.checkpoint("final-daily-report-readback");
    const result = await h.finalizer.run("completed");
    expect(h.stopCalls).toBe(0);
    expect(result.unresolved).toEqual([]);
    expect(h.cleanupErrors).toEqual([]);
    const facts = await h.facts();
    expect(facts.wholeRunPassed).toBe(true);
    expect(facts).toMatchObject({
      definitionSha: DEFINITION,
      runtimeSha: RUNTIME,
      nonce: "owned-referral-40689200536-nonce",
    });
    const written = facts.orders as Record<string, unknown>[];
    expect(written).toHaveLength(8);
    expect(
      written.map((o) => [o.slot, o.orderId, o.journalState, o.ownerTerminal]),
    ).toEqual(orders.map((o) => [o.slot, o.orderId, "acknowledged", true]));
    expect(written[2]).toMatchObject({
      taskId: id(21),
      assignmentId: id(31),
      ownerRecovery: "normal-driver-completion",
    });
    expect(facts.supply).toEqual([
      {
        actor: "first",
        driverId: id(901),
        vehicleId: id(902),
        deviceId: id(903),
        bindingId: id(904),
        invitationIssued: true,
      },
      {
        actor: "second",
        driverId: null,
        vehicleId: null,
        deviceId: null,
        bindingId: null,
        invitationIssued: false,
      },
    ]);
    expect(h.evidence.events.map((e) => e.stage)).toEqual([
      "supplemental-reservation-1-normal-terminalization",
      "supplemental-reservation-2-normal-terminalization",
      "own-Admin-session-revoked",
      "browser-context-closed",
      "supplemental-custody-persist",
      "journey-evidence-persist",
    ]);
  });

  it("rejects a checkpoint path outside the existing facts allowlist", () => {
    expect(
      () =>
        new RunFinalizer({
          definitionSha: DEFINITION,
          runtimeSha: RUNTIME,
          nonce: "n",
          checkpointFile: "/tmp/run-finalization.json",
          persist: async () => undefined,
          custody: () => ({ orders: [], supply: [], sessions: [] }),
          secrets: () => [],
          onCleaned: () => undefined,
          onFailed: () => undefined,
          plan: async () => undefined,
          artifacts: [],
        }),
    ).toThrow("finalization-checkpoint-outside-allowlist");
  });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("Codex round-1 finalization regressions", () => {
  it("(R1) a runner timeout during a started completed finalization is authoritative", async () => {
    const gate = deferred();
    const entered = deferred();
    const h = await harness(
      async (step) => {
        await step("own-Admin-session-revoked", () => {
          entered.resolve();
          return gate.promise;
        });
      },
      {},
      sevenAcknowledged().map((order) => ({ ...order, ownerTerminal: true })),
    );
    const fromBody = h.finalizer.run("completed");
    await entered.promise;
    const fromAfterEach = finalizeAfterRunner(h.finalizer, "timedOut");
    gate.resolve();
    const [body, runner] = await Promise.all([fromBody, fromAfterEach]);
    expect(runner).toBe(body);
    expect(body.reason).toBe("runner-timedOut");
    expect(body.supersededReasons).toEqual(["completed"]);
    expect(body.wholeRunPassed).toBe(false);
    expect(body.unresolved).toEqual(["run-runner-timedOut"]);
    expect(h.planCalls).toEqual(["completed"]);
    const facts = await h.facts();
    expect(facts).toMatchObject({ status: "finalized", wholeRunPassed: false });
    for (const name of ["journey-evidence.json", "TEN03-06-custody.json"])
      expect(await h.artifact(name)).toMatchObject({
        finalization: { reason: "runner-timedOut", wholeRunPassed: false },
      });
  });

  it("(R1) a runner timeout during the evidence write re-persists, never leaving a pass", async () => {
    const gate = deferred();
    let held = false;
    const h = await harness(async () => undefined, {
      persist: async (path, value) => {
        if (path.endsWith("journey-evidence.json") && !held) {
          held = true;
          await gate.promise;
        }
        await persistPrivateJson(path, value);
      },
    });
    const fromBody = h.finalizer.run("completed");
    while (!held) await sleep(5);
    const fromAfterEach = finalizeAfterRunner(h.finalizer, "interrupted");
    gate.resolve();
    const result = await fromBody;
    expect(await fromAfterEach).toBe(result);
    expect(result.reason).toBe("runner-interrupted");
    await h.finalizer.writesSettled();
    expect(await h.artifact("journey-evidence.json")).toMatchObject({
      finalization: { reason: "runner-interrupted", wholeRunPassed: false },
    });
    expect(await h.facts()).toMatchObject({ wholeRunPassed: false });
    expect(h.planCalls).toEqual(["completed"]);
  });

  it("(R1) a passed runner keeps the body result; runner-failed never relabels a body failure", async () => {
    const passed = await harness(async () => undefined);
    const ok = await passed.finalizer.run("completed");
    expect(await finalizeAfterRunner(passed.finalizer, "passed")).toBe(ok);
    expect(ok).toMatchObject({ reason: "completed", wholeRunPassed: true });
    const failed = await harness(async () => undefined);
    const body = await failed.finalizer.run("failed");
    expect(await finalizeAfterRunner(failed.finalizer, "failed")).toBe(body);
    expect(body.reason).toBe("failed");
  });

  it("(R2) an expired step lease stops later and late outbound calls of a multi-request terminalization", async () => {
    const gate = deferred();
    const firstResponse = deferred<Response>();
    const sent: string[] = [];
    let terminal = false;
    const h = await harness(
      async (step) => {
        await step(
          "supplemental-reservation-1-normal-terminalization",
          async () => {
            await gate.promise;
            await guarded("https://ops.invalid/hold", { method: "POST" });
            await guarded("https://ops.invalid/cancel", { method: "POST" });
            terminal = true;
          },
        );
        await step("own-order-normal-terminalization", async () => {
          await guarded("https://ops.invalid/second", { method: "POST" });
          await firstResponse.promise;
          await guarded("https://ops.invalid/second-readback");
        });
      },
      { budgetMs: 300 },
    );
    const guarded = h.finalizer.guardFetch((async (input: unknown) => {
      sent.push(String(input));
      if (String(input).endsWith("/second")) return firstResponse.promise;
      return new Response("{}");
    }) as typeof fetch);
    const result = await h.finalizer.run("failed");
    expect(result.steps.map((step) => step.outcome)).toEqual([
      "unknown-budget-exhausted",
      "not-attempted-budget-exhausted",
    ]);
    // Released after the deadline: nothing new leaves and nothing back-fills.
    gate.resolve();
    firstResponse.resolve(new Response("{}"));
    await sleep(30);
    expect(sent).toEqual([]);
    expect(terminal).toBe(false);
    const cleanupErrors = [...h.cleanupErrors];
    await sleep(10);
    expect(h.cleanupErrors).toEqual(cleanupErrors);
  });

  it("(R2) an in-flight call's late response is withheld from the abandoned action", async () => {
    const response = deferred<Response>();
    const sent: string[] = [];
    let delivered = false;
    const h = await harness(
      async (step) => {
        await step("own-Driver-binding-revoked", async () => {
          await guarded("https://driver.invalid/revoke", { method: "POST" });
          delivered = true;
          await guarded("https://driver.invalid/session");
        });
      },
      { budgetMs: 300 },
    );
    const guarded = h.finalizer.guardFetch((async (input: unknown) => {
      sent.push(String(input));
      return response.promise;
    }) as typeof fetch);
    const result = await h.finalizer.run("failed");
    expect(result.steps).toEqual([
      {
        stage: "own-Driver-binding-revoked",
        outcome: "unknown-budget-exhausted",
      },
    ]);
    response.resolve(new Response("{}"));
    await sleep(20);
    expect(sent).toEqual(["https://driver.invalid/revoke"]);
    expect(delivered).toBe(false);
    expect(result.unresolved).toContain(
      "own-Driver-binding-revoked-unknown-budget-exhausted",
    );
  });

  it("(R3) a timed-out old write that lands late never regresses a newer snapshot", async () => {
    const gate = deferred();
    const landed: string[] = [];
    let first = true;
    const h = await harness(
      async (step) => {
        await step("own-Admin-session-revoked", async () => undefined);
      },
      {
        writeBudgetMs: 300,
        persist: async (path, value) => {
          if (path.endsWith("-facts.json") && first) {
            first = false;
            await gate.promise;
          }
          await persistPrivateJson(path, value);
          if (path.endsWith("-facts.json"))
            landed.push(String((value as { status: string }).status));
        },
      },
    );
    const result = await h.finalizer.run("failed");
    expect(result.checkpointWriteFailures).toBeGreaterThan(0);
    expect(result.artifacts.map((a) => a.outcome)).toEqual([
      "written",
      "written",
    ]);
    gate.resolve();
    await h.finalizer.writesSettled();
    // One write at a time in completion order, coalesced to the newest.
    expect(landed).toEqual(["finalizing", "finalized"]);
    expect((await h.facts()).status).toBe("finalized");
    await sleep(20);
    expect((await h.facts()).status).toBe("finalized");
  });

  it("(R3) a stalled disk is waited on once; every step still runs under the hard total cap", async () => {
    let actions = 0;
    const h = await harness(
      async (step) => {
        for (let i = 0; i < 18; i++)
          await step(`own-step-${i}`, async () => void actions++);
      },
      {
        budgetMs: 400,
        writeBudgetMs: 20,
        persist: () => new Promise<void>(() => undefined),
      },
    );
    const started = Date.now();
    const result = await h.finalizer.run("failed");
    const elapsed = Date.now() - started;
    expect(actions).toBe(18);
    expect(result.steps.every((step) => step.outcome === "cleaned")).toBe(true);
    expect(result.totalBudgetMs).toBe(400 + 20 * 4);
    expect(elapsed).toBeLessThan(result.totalBudgetMs);
    expect(result.artifacts.map((a) => a.outcome)).toEqual([
      "unknown-write-budget-exhausted",
      "unknown-write-budget-exhausted",
    ]);
    expect(result.checkpointWriteFailures).toBe(18 + 18 + 2);
  });

  it("(R3) a plan hanging outside any step is cut at the hard cap with evidence", async () => {
    const h = await harness(
      async (step) => {
        await step("own-synthetic-driver-offline", async () => undefined);
        await never();
      },
      { budgetMs: 30, writeBudgetMs: 500 },
    );
    const started = Date.now();
    const result = await h.finalizer.run("failed");
    expect(Date.now() - started).toBeLessThan(result.totalBudgetMs);
    expect(result.planError).toBe("finalization-plan-budget-exhausted");
    expect(result.artifacts.map((a) => a.outcome)).toEqual([
      "written",
      "written",
    ]);
    expect(await h.artifact("journey-evidence.json")).toMatchObject({
      finalization: { planError: "finalization-plan-budget-exhausted" },
    });
  });
});

type Ports = Parameters<typeof runFourStageOwnedCancellations>[0];

// Stateful fake of the original Admin/Ops/Driver/Referral rails. Every call goes
// through the finalizer's guarded fetch; the real helper and journal run as-is.
async function cancellationCaller(options: { handoff: boolean }) {
  const dir = await mkdtemp(join(tmpdir(), "owned-c1-c4-"));
  const orders = new Map<string, ObjectData>();
  const tasks = new Map<string, ObjectData>();
  const log: string[] = [];
  const results = cancellationResults();
  const evidence = new Evidence();
  const cleanupErrors: string[] = [];
  let active: string | null = null;
  const driverId = "controlled-driver";
  const vehicleId = "controlled-vehicle";
  const passengerId = "controlled-passenger";
  const entrySlug = "controlled-entry";
  const route = (
    rail: string,
    method: string,
    path: string,
    body: ObjectData,
  ) => {
    if (rail === "admin") return { driverId, workState: body.workState };
    if (rail === "heartbeat") return { accepted: 1 };
    let match: RegExpExecArray | null;
    if (rail === "referral") {
      if (path === "/api/referral/fees")
        return {
          disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          contentHash: PASSENGER_FEE_CONTENT_HASH,
          acknowledgedAt: "2026-10-20T00:00:00.000Z",
        };
      if (path === "/api/referral/active")
        return active
          ? { active: true, trip: { ...orders.get(active) } }
          : { active: false, trip: null };
      if (path === "/api/referral/quote")
        return {
          quoteId: randomUUID(),
          feeDisclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          feeContentHash: PASSENGER_FEE_CONTENT_HASH,
          fixedPrice: false,
          isGuaranteed: false,
          timingMode: "immediate",
          requestedScheduledAt: null,
          pickupAddress: body.pickupAddress,
          dropoffAddress: body.dropoffAddress,
        };
      if (path === "/api/referral/booking") {
        const orderId = randomUUID();
        orders.set(orderId, {
          orderId,
          status: "created",
          partnerEntrySlug: entrySlug,
          passenger: { passengerId },
          createdAt: new Date().toISOString(),
          cancelableUntil: new Date(Date.now() - 60_000).toISOString(),
          dispatchSemantics: "reservation",
          serviceBucket: "business_dispatch",
          serviceProductCode: null,
          businessDispatchSubtype: "enterprise_dispatch",
          referralPassengerLifecycle: {
            quote: {
              quoteId: body.quoteId,
              serviceProductCode: "enterprise_dispatch",
              businessDispatchSubtype: "enterprise_dispatch",
            },
          },
          fixedPrice: false,
          proofRequirements: { minPhotoCount: 1 },
        });
        active = orderId;
        return {
          orderId,
          quote: { quoteId: body.quoteId },
          feeConfirmation: {
            orderId,
            quoteId: body.quoteId,
            disclosureVersion: body.feeDisclosureVersion,
            contentHash: PASSENGER_FEE_CONTENT_HASH,
            feeConfirmedAt: new Date().toISOString(),
          },
        };
      }
      if ((match = /^\/api\/referral\/cancel\/([^/]+)$/.exec(path))) {
        const order = orders.get(match[1]!)!;
        if (!["created", "cancelled"].includes(String(order.status)))
          throw new JourneyFailure("unit-policy-denial", 409);
        if (order.status !== "cancelled")
          Object.assign(order, {
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
          });
        if (active === order.orderId) active = null;
        return { ...order };
      }
      if ((match = /^\/api\/referral\/history\/([^/]+)$/.exec(path)))
        return { ...orders.get(match[1]!) };
      if (path === "/api/referral/history")
        return {
          items: [...orders.values()].filter((order) =>
            ["cancelled", "completed"].includes(String(order.status)),
          ),
        };
    }
    if (rail === "ops") {
      if ((match = /^\/orders\/([^/]+)$/.exec(path)))
        return { ...orders.get(match[1]!) };
      if ((match = /^\/orders\/([^/]+)\/dispatch$/.exec(path)))
        return { dispatchJobId: `dispatch-${match[1]}` };
      if (/^\/dispatch\/tasks\/[^/]+\/candidates/.test(path))
        return {
          items: [
            {
              driverId,
              vehicleId,
              serviceBuckets: ["business_dispatch"],
              eligibilityDecision: "eligible",
              hardReasonCodes: [],
              etaMinutes: 2,
            },
          ],
        };
      if (path === "/dispatch/assign") {
        const orderId = String(body.dispatchJobId).slice("dispatch-".length);
        orders.get(orderId)!.status = "assigned";
        const task = {
          taskId: `task-${orderId}`,
          orderId,
          driverId,
          vehicleId,
          assignmentId: `assignment-${orderId}`,
          dispatchJobId: body.dispatchJobId,
          status: "pending_acceptance",
        };
        tasks.set(task.taskId, task);
        return { ...task, status: "assigned" };
      }
    }
    if (rail === "driver") {
      if (path === "/api/auth/driver/device/revoke") return { revoked: true };
      if (path === "/api/driver/tasks")
        return { items: [...tasks.values()].map((task) => ({ ...task })) };
      match = /^\/api\/driver\/tasks\/([^/]+)(?:\/(\w+))?$/.exec(path);
      const task = match && tasks.get(match[1]!);
      if (task && !match![2]) return { ...task };
      const next: Record<string, [string, string, string]> = {
        accept: ["pending_acceptance", "accepted", "driver_accepted"],
        depart: ["accepted", "enroute_pickup", "enroute_pickup"],
        arrived_pickup: ["enroute_pickup", "arrived_pickup", "arrived_pickup"],
        start: ["arrived_pickup", "on_trip", "on_trip"],
        complete: ["on_trip", "completed", "completed"],
      };
      const transition = task && next[match![2]!];
      if (task && transition && task.status === transition[0]) {
        task.status = transition[1];
        const order = orders.get(String(task.orderId))!;
        order.status = transition[2];
        if (transition[2] === "completed" && active === order.orderId)
          active = null;
        return { ...task };
      }
    }
    throw new JourneyFailure(`unit-unexpected-${rail}-${method}-${path}`);
  };
  const inner = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const rail = url.hostname.split(".")[0]!;
    const method = init?.method ?? "GET";
    const path = `${url.pathname}${url.search}`;
    log.push(`${rail} ${method} ${path}`);
    const body = init?.body ? object(JSON.parse(String(init.body))) : {};
    return new Response(JSON.stringify(route(rail, method, path, body)));
  }) as typeof fetch;
  const rpc = async (rail: string, path: string, call: CallOptions = {}) => {
    const response = await finalizer.guardFetch(inner)(
      `https://${rail}.invalid${path}`,
      {
        method: call.method ?? "GET",
        ...(call.body ? { body: JSON.stringify(call.body) } : {}),
      },
    );
    return object(await response.json());
  };
  const callResult = (data: ObjectData): CallResult => ({
    status: 200,
    data,
    headers: new Headers(),
    bytes: Buffer.from(JSON.stringify(data)),
  });
  const interrupted = deferred();
  const reachedHang = deferred();
  let uiCancels = 0;
  const ports: Ports = {
    definitionSha: DEFINITION,
    runtimeSha: RUNTIME,
    directory: dir,
    nonce: `controlled-${randomUUID()}`,
    entrySlug,
    partnerUserRef: "controlled-subject",
    passengerId,
    completedMainOrderId: id(1),
    driverId,
    vehicleId,
    pickupAddress: "合成上車地址",
    dropoffAddress: "合成下車地址",
    pickup: { lat: 25, lng: 121 },
    passengerName: "合成測試乘客",
    passengerPhone: "0900000000",
    photoDataUrl: "data:image/png;base64,c3ludGhldGlj",
    evidence,
    referral: async (path, call) =>
      callResult(await rpc("referral", path, call)),
    adminControl: (path, call) => rpc("admin", path, call),
    opsControl: (path, call) => rpc("ops", path, call),
    driver: (path, call) => rpc("driver", path, call),
    heartbeat: async (taskId, workState) => {
      await rpc("heartbeat", `/batch/${taskId}/${workState}`, {
        method: "POST",
        body: { workState },
      });
    },
    cancelFromActualUI: async (orderId) => {
      uiCancels++;
      const command = { idempotencyKey: `controlled-cancel-${orderId}` };
      const data = await rpc("referral", `/api/referral/cancel/${orderId}`, {
        method: "POST",
        body: command,
      });
      return {
        ...callResult(data),
        command,
        requestSource: "actual-ui",
        uiDisabled: false,
      };
    },
    // The runner abandons C2 while its actual page waits on a screenshot.
    capture: async (name) => {
      if (name === "assigned-not-arrived-before") {
        reachedHang.resolve();
        await interrupted.promise;
        throw new JourneyFailure("browser-page-closed");
      }
      return { file: `${dir}/${name}.png`, bytes: 0, sha256: "0".repeat(64) };
    },
  };
  const custody: RunCustodySnapshot = { orders: [], supply: [], sessions: [] };
  const finalizer: RunFinalizer = new RunFinalizer({
    definitionSha: DEFINITION,
    runtimeSha: RUNTIME,
    nonce: "owned-referral-c1-c4-nonce",
    checkpointFile: join(dir, "cancellations/run-finalization-facts.json"),
    persist: persistPrivateJson,
    custody: () => ({
      ...custody,
      orders: results.map((stage) => ({
        slot: stage.stage,
        orderId: stage.orderId,
        journalState: stage.journalState,
        taskId: stage.taskId,
        assignmentId: stage.assignmentId,
        ownerTerminal: [
          "already-terminal",
          "normal-passenger-cancel",
          "normal-driver-completion",
        ].includes(String(stage.recovery)),
        ownerRecovery: stage.recovery,
      })),
    }),
    secrets: () => [],
    onCleaned: (stage) => evidence.record({ stage, result: "cleaned" }),
    onFailed: (stage, error) => {
      cleanupErrors.push(stage);
      evidence.failure(error);
    },
    stopInterruptedBody: async () => interrupted.resolve(),
    // Same order as the spec plan: C1–C4 before any binding revoke.
    plan: async (cleanup) => {
      if (options.handoff && cancellationCleanupNeeded(handoff, results))
        await cleanup("own-cancellation-cases-normal-terminalization", () =>
          completeOwnCancellationCleanup(handoff, results),
        );
      await cleanup("own-Driver-binding-revoked", () =>
        rpc("driver", "/api/auth/driver/device/revoke", { method: "POST" }),
      );
    },
    artifacts: [],
  });
  const handoff = finalizer.handoff(cancellationCleanupPhase(results));
  const run = options.handoff
    ? handoffOwnCancellations(handoff, runFourStageOwnedCancellations)
    : runFourStageOwnedCancellations;
  let bodyError: unknown;
  const body = run(ports, results).catch((error: unknown) => {
    bodyError = error;
  });
  return {
    finalizer,
    results,
    orders,
    log,
    cleanupErrors,
    reachedHang: reachedHang.promise,
    body: () => body.then(() => bodyError),
    uiCancels: () => uiCancels,
    facts: async (stage: string) =>
      JSON.parse(
        await readFile(join(dir, `cancellations/${stage}-facts.json`), "utf8"),
      ),
  };
}

describe("C1–C4 per-case cleanup through the real caller wiring", () => {
  it("(R4) an ACKed active case abandoned by the runner still terminalizes before revoke", async () => {
    const c = await cancellationCaller({ handoff: true });
    await c.reachedHang;
    const result = await finalizeAfterRunner(c.finalizer, "timedOut");
    expect(await c.body()).toBeInstanceOf(JourneyFailure);
    const [c1, c2, c3, c4] = c.results;
    expect(c1).toMatchObject({
      result: "observed",
      recovery: "already-terminal",
    });
    expect(c2).toMatchObject({
      result: "failed",
      recovery: "normal-driver-completion",
      journalState: "acknowledged",
    });
    expect(c2!.taskId).toBe(`task-${c2!.orderId}`);
    expect(c3).toMatchObject({ result: "unexecuted" });
    expect(c4).toMatchObject({ result: "unexecuted" });
    expect(c3!.orderId).toBeUndefined();
    expect(c.orders.get(c1!.orderId!)!.status).toBe("cancelled");
    expect(c.orders.get(c2!.orderId!)!.status).toBe("completed");
    // Only C1's actual UI cancel ran; C2's main line never resumed.
    expect(c.uiCancels()).toBe(1);
    expect(
      c.log.filter((l) => l.includes("/api/referral/booking")),
    ).toHaveLength(2);
    const complete = c.log.indexOf(
      `driver POST /api/driver/tasks/task-${c2!.orderId}/complete`,
    );
    const revoke = c.log.indexOf("driver POST /api/auth/driver/device/revoke");
    expect(complete).toBeGreaterThan(-1);
    expect(revoke).toBeGreaterThan(complete);
    expect(result?.steps).toEqual([
      { stage: "interrupted-business-body-stopped", outcome: "cleaned" },
      {
        stage: "own-cancellation-cases-normal-terminalization",
        outcome: "cleaned",
      },
      { stage: "own-Driver-binding-revoked", outcome: "cleaned" },
    ]);
    expect(result?.unresolved).toEqual(["run-runner-timedOut"]);
    expect((await c.facts("assigned-not-arrived")).result).toMatchObject({
      recovery: "normal-driver-completion",
    });
    // The finalizer's own facts carry both C1/C2 owned orders as terminal.
    const facts = JSON.parse(
      await readFile(
        join(
          (await c.facts("unassigned")).result.factsFile.replace(
            /unassigned-facts\.json$/,
            "",
          ),
          "run-finalization-facts.json",
        ),
        "utf8",
      ),
    );
    expect(
      (facts.orders as Record<string, unknown>[])
        .filter((o) => o.orderId)
        .map((o) => [o.slot, o.ownerTerminal]),
    ).toEqual([
      ["unassigned", true],
      ["assigned-not-arrived", true],
    ]);
  });

  it("(R4) without the handoff the same abandon leaves the ACKed case retained (the defect)", async () => {
    const c = await cancellationCaller({ handoff: false });
    await c.reachedHang;
    await finalizeAfterRunner(c.finalizer, "timedOut");
    await c.body();
    const c2 = c.results[1]!;
    expect(c2).toMatchObject({
      result: "failed",
      recovery: "retained-unresolved",
    });
    expect(c.orders.get(c2.orderId!)!.status).toBe("driver_accepted");
    expect(c.log.some((l) => l.endsWith("/complete"))).toBe(false);
  });

  it("(R4) after finalization starts a case's main line stays refused", async () => {
    const f = new RunFinalizer({
      definitionSha: DEFINITION,
      runtimeSha: RUNTIME,
      nonce: "n-handoff",
      checkpointFile: join(
        await mkdtemp(join(tmpdir(), "owned-handoff-")),
        "cancellations/run-finalization-facts.json",
      ),
      persist: persistPrivateJson,
      custody: () => ({ orders: [], supply: [], sessions: [] }),
      secrets: () => [],
      onCleaned: () => undefined,
      onFailed: () => undefined,
      plan: async () => undefined,
      artifacts: [],
    });
    const results = cancellationResults();
    const handoff = f.handoff(cancellationCleanupPhase(results));
    let calls = 0;
    const port = handoff.port(async () => void calls++);
    await port();
    await f.run("runner-timedOut");
    await expect(port()).rejects.toThrow(
      "business-request-after-finalization-start",
    );
    results[0]!.result = "failed";
    // Cleanup phase but the finalizer never lent a step: refused, not hung.
    await expect(port()).rejects.toThrow(
      "own-case-cleanup-outside-finalizer-step",
    );
    expect(calls).toBe(1);
    expect(cancellationCleanupNeeded(handoff, results)).toBe(false);
  });
});

// The actual main-order cleanup caller: NativeTransport over the finalizer's
// guarded fetch, terminalizeOwnOrder, then the owner-recorded terminal fact.
function terminalReadbackCaller(readback: () => ReadableStream<Uint8Array>) {
  const sent: string[] = [];
  const signals: (AbortSignal | null | undefined)[] = [];
  const envelope = (data: ObjectData, body?: ReadableStream<Uint8Array>) =>
    new Response(body ?? JSON.stringify({ data }), {
      headers: {
        "content-type": "application/json",
        "x-drts-candidate-sha": RUNTIME,
      },
    });
  let reads = 0;
  const inner = (async (input: unknown, init?: RequestInit) => {
    sent.push(`${init?.method ?? "GET"} ${new URL(String(input)).pathname}`);
    signals.push(init?.signal);
    if (init?.method === "POST")
      return envelope({ orderId: id(1), status: "cancelled" });
    return ++reads === 1
      ? envelope({ orderId: id(1), status: "created" })
      : envelope({}, readback());
  }) as typeof fetch;
  return { sent, signals, inner };
}

function gatedStream(chunks: string[]) {
  const gate = deferred();
  const stream = () =>
    new ReadableStream<Uint8Array>({
      async start(controller) {
        await gate.promise;
        for (const chunk of chunks)
          controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
  return { gate, stream };
}

const TERMINAL_READBACK = [
  '{"data":{"orderId":"',
  `${id(1)}","status":"cancelled"}}`,
];

async function mainCleanupHarness(
  readback: () => ReadableStream<Uint8Array>,
  budgetMs: number,
) {
  const caller = terminalReadbackCaller(readback);
  const order: OrderCustody = {
    slot: "main",
    orderId: id(1),
    journalState: "acknowledged",
    ownerTerminal: false,
  };
  const h = await harness(
    async (step) => {
      await step("own-order-normal-terminalization", async () => {
        await terminalizeOwnOrder(
          id(1),
          async () =>
            object((await tx.call("opsApi", `/api/orders/${id(1)}`)).data),
          () =>
            tx.call("opsApi", `/api/orders/${id(1)}/cancel`, {
              method: "POST",
              body: { reason: "Own synthetic consumer cleanup" },
            }),
        );
        order.ownerTerminal = true;
      });
    },
    { budgetMs },
    [order],
  );
  // Invoked only from the plan, after construction.
  const tx = new NativeTransport(
    {
      api: "https://api.example.test",
      admin: "https://admin.example.test",
      ops: "https://ops.example.test",
      fleet: "https://fleet.example.test",
      referral: "https://referral.example.test",
    },
    RUNTIME,
    {},
    h.finalizer.guardFetch(caller.inner),
  );
  return { ...caller, h, order };
}

describe("Codex round-2 finalization regressions", () => {
  it("(R2) a terminal readback whose body arrives after the lease never back-fills custody", async () => {
    const readback = gatedStream(TERMINAL_READBACK);
    const { h, order, sent, signals } = await mainCleanupHarness(
      readback.stream,
      300,
    );
    const result = await h.finalizer.run("failed");
    expect(result.steps).toEqual([
      {
        stage: "own-order-normal-terminalization",
        outcome: "unknown-budget-exhausted",
      },
    ]);
    // Headers resolved inside the lease; only the body is late.
    expect(sent).toEqual([
      `GET /api/orders/${id(1)}`,
      `POST /api/orders/${id(1)}/cancel`,
      `GET /api/orders/${id(1)}`,
    ]);
    readback.gate.resolve();
    await sleep(30);
    expect(order.ownerTerminal).toBe(false);
    expect(result.unresolved).toEqual(
      expect.arrayContaining([
        "main-owned-order-terminal-not-observed",
        "own-order-normal-terminalization-unknown-budget-exhausted",
      ]),
    );
    expect(result.wholeRunPassed).toBe(false);
    // The original per-request 15 s transport deadline is still applied.
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(h.cleanupErrors).toEqual(["own-order-normal-terminalization"]);
  });

  it("(R2) a normal chunked terminal readback inside the lease is adopted", async () => {
    const readback = gatedStream(TERMINAL_READBACK);
    readback.gate.resolve();
    const { h, order } = await mainCleanupHarness(readback.stream, 5_000);
    const result = await h.finalizer.run("completed");
    expect(result.steps).toEqual([
      { stage: "own-order-normal-terminalization", outcome: "cleaned" },
    ]);
    expect(order.ownerTerminal).toBe(true);
    expect(result.unresolved).toEqual([]);
    expect(result.wholeRunPassed).toBe(true);
  });

  it("(R2) a body read already waiting when the lease closes is rejected, not left to deliver", async () => {
    const readback = gatedStream(TERMINAL_READBACK);
    let rejected: unknown;
    const h = await harness(
      async (step) => {
        await step("own-Driver-binding-revoked", async () => {
          const response = await guarded("https://driver.invalid/revoke");
          await response.text().catch((error: unknown) => {
            rejected = error;
            throw error;
          });
        });
      },
      { budgetMs: 300 },
    );
    const guarded = h.finalizer.guardFetch(
      (async () => new Response(readback.stream())) as typeof fetch,
    );
    await h.finalizer.run("failed");
    await sleep(10);
    expect(rejected).toBeInstanceOf(JourneyFailure);
    expect((rejected as JourneyFailure).stage).toBe(
      "finalization-response-body-after-lease-closed",
    );
    readback.gate.resolve();
    await sleep(20);
  });

  it("(R5) failed custody facts writes are explicit failures and never a passed run", async () => {
    const h = await harness(
      async (step) => {
        await step("own-Ops-session-self-revoked", async () => undefined);
        await step("own-Admin-session-revoked", async () => undefined);
      },
      {
        persist: async (path, value) => {
          if (path.endsWith("run-finalization-facts.json"))
            throw Object.assign(new Error("disk"), { code: "EIO" });
          return persistPrivateJson(path, value);
        },
      },
      sevenAcknowledged().map((order) => ({ ...order, ownerTerminal: true })),
    );
    const result = await h.finalizer.run("completed");
    expect(result.checkpointWriteFailures).toBeGreaterThan(0);
    // Every later step and both artifacts still ran.
    expect(result.steps.map((step) => step.outcome)).toEqual([
      "cleaned",
      "cleaned",
    ]);
    expect(result.artifacts.map((artifact) => artifact.outcome)).toEqual([
      "written",
      "written",
    ]);
    expect(h.cleanupErrors).toContain("run-finalization-facts-persist");
    expect(result.unresolved).toContain("run-finalization-facts-not-durable");
    expect(result.wholeRunPassed).toBe(false);
    const journey = await h.artifact("journey-evidence.json");
    expect(journey.finalization).toMatchObject({ wholeRunPassed: false });
    expect(journey.cleanupErrors).toContain("run-finalization-facts-persist");
    const custody = await h.artifact("TEN03-06-custody.json");
    expect(custody.finalization).toMatchObject({ wholeRunPassed: false });
  });

  it("(R5) only the final facts write failing re-persists the artifacts as not passed", async () => {
    const h = await harness(
      async (step) => {
        await step("own-Ops-session-self-revoked", async () => undefined);
      },
      {
        persist: async (path, value) => {
          if (
            path.endsWith("run-finalization-facts.json") &&
            (value as { status?: string }).status === "finalized"
          )
            throw Object.assign(new Error("disk"), { code: "ENOSPC" });
          return persistPrivateJson(path, value);
        },
      },
      sevenAcknowledged().map((order) => ({ ...order, ownerTerminal: true })),
    );
    const result = await h.finalizer.run("completed");
    expect(result.steps).toEqual([
      { stage: "own-Ops-session-self-revoked", outcome: "cleaned" },
    ]);
    expect(result.checkpointWriteFailures).toBeGreaterThan(0);
    expect(h.cleanupErrors).toContain("run-finalization-final-facts-persist");
    expect(result.unresolved).toContain("run-finalization-facts-not-durable");
    expect(result.wholeRunPassed).toBe(false);
    const journey = await h.artifact("journey-evidence.json");
    expect(journey.finalization).toMatchObject({ wholeRunPassed: false });
    // The last durable facts are the earlier finalizing snapshot, never a pass.
    const facts = await h.facts();
    expect(facts.status).toBe("finalizing");
    expect(facts.wholeRunPassed).toBe(false);
    // Bounded: a persistent final-facts failure is not retried in a loop.
    expect(
      h.evidence.events.filter(
        (event) => event.stage === "journey-evidence-persist",
      ).length,
    ).toBe(1);
  });
});

describe("R08 original finalizer custody and Playwright request lease", () => {
  it("persists interrupted exact own raw request/IDs and refuses completed when required replay is unknown", async () => {
    const rawBody =
      '{ "description":"SIM index only", "category":"other", "severity":"normal", "relatedOrderId":"SIM-order" }';
    const h = await harness(async (step) => {
      await step("own-R08-callcenter-normal-terminalization", async () => {
        await h.finalizer.checkpointOwned("r08-own-call-custody");
      });
    });
    h.custody.r08 = {
      recording: "synthetic-index-only",
      orderId: "SIM-order",
      callId: "SIM-call",
      recordingId: "SIM-index",
      callbackTaskId: "SIM-callback",
      producers: [],
      result: "in-progress",
      cleanup: "unknown",
      transfer: {
        orderId: "SIM-order",
        callId: "SIM-call",
        recordingId: "SIM-index",
        callbackTaskId: "SIM-callback",
        transfer: "ack-unknown",
        replay: "not-attempted",
        cleanup: "not-attempted",
        unresolved: ["original-ui-transfer-unverified"],
        recording: "synthetic-index-only",
        finalizeRecording: {
          dedupeKey: "finalize_recording:call:SIM-call",
          status: "unobserved-retained",
        },
        command: {
          path: "/control-plane-proxy/callcenter/sessions/SIM-call/transfer-to-complaint",
          rawBody,
          bodySha256: "a".repeat(64),
          headers: { "Content-Type": "application/json" },
        },
      },
    };
    await h.finalizer.checkpoint("r08-before-UI-forward");
    expect(await h.facts()).toMatchObject({
      r08: {
        callId: "SIM-call",
        transfer: { command: { rawBody }, transfer: "ack-unknown" },
      },
    });
    const result = await h.finalizer.run("completed");
    expect(result.wholeRunPassed).toBe(false);
    expect(result.unresolved).toContain(
      "r08-required-original-ui-replay-unverified",
    );
    expect(result.unresolved).toContain("r08-own-terminal-readback-unverified");
    const interrupted = await finalizeAfterRunner(h.finalizer, "interrupted");
    expect(interrupted?.reason).toBe("runner-interrupted");
    expect(h.planCalls).toEqual(["completed"]);
    expect(await h.facts()).toMatchObject({
      r08: { transfer: { command: { rawBody } } },
      wholeRunPassed: false,
    });
  });

  it("same-browser request lease withholds late bytes/custody and blocks following writes after step expiry", async () => {
    const response = deferred<string>();
    const entered = deferred();
    const sent: string[] = [];
    let accepted = false;
    const h = await harness(
      async (step) => {
        await step("own-R08-callcenter-normal-terminalization", async () => {
          await h.finalizer.guardOperation(async (assertOpen) => {
            sent.push("cancel");
            entered.resolve();
            await response.promise;
            assertOpen(); // Required before any body-derived state/fulfill.
            accepted = true;
            await h.finalizer.checkpointOwned("r08-late-ACK");
          });
          await h.finalizer.guardOperation(async () => {
            sent.push("close");
          });
        });
      },
      { budgetMs: 150 },
    );
    const finishing = h.finalizer.run("failed");
    await entered.promise;
    const result = await finishing;
    expect(result.steps[0]?.outcome).toBe("unknown-budget-exhausted");
    response.resolve("SIM late body");
    await sleep(20);
    expect(accepted).toBe(false);
    expect(sent).toEqual(["cancel"]);
    await expect(
      h.finalizer.guardOperation(async () => {
        sent.push("orphan write");
      }),
    ).rejects.toThrow("business-request-after-finalization-start");
    await expect(h.finalizer.checkpointOwned("orphan-custody")).rejects.toThrow(
      "business-phase-after-finalization-start",
    );
    expect(sent).toEqual(["cancel"]);
  });

  it("fails closed when exact R08 custody contains a token instead of changing command bytes", async () => {
    const h = await harness(async () => undefined);
    h.custody.r08 = {
      recording: "synthetic-index-only",
      orderId: "SIM-order",
      recordingId: "SIM-index",
      result: "failed",
      cleanup: "unknown",
      producers: [
        {
          step: "sessions",
          ack: "ack-unknown",
          command: {
            path: "/control-plane-proxy/callcenter/sessions",
            rawBody: TOKEN,
            bodySha256: "a".repeat(64),
            headers: { "Content-Type": "application/json" },
          },
        },
      ],
    };
    await expect(h.finalizer.checkpointOwned("r08-secret")).rejects.toThrow(
      "business-checkpoint-not-durable",
    );
    expect(JSON.stringify(await h.facts())).not.toContain(TOKEN);
  });
});
