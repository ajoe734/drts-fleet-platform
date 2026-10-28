import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  Evidence,
  JourneyFailure,
  persistPrivateJson,
} from "../../e2e/owned-referral-business-journey/protocol";
import {
  RunFinalizer,
  finalizeAfterRunner,
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
      { budgetMs: 40 },
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
      budgetMs: 40,
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
    expect(first.reason).toBe("failed");
    expect(h.planCalls).toEqual(["failed"]);
    expect(executed).toBe(1);
    expect(h.stopCalls).toBe(0);
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
    expect(h.cleanupErrors).toEqual([
      "supplemental-custody-persist",
      "journey-evidence-persist",
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
