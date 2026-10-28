import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { JourneyFailure } from "./protocol";

// Playwright 1.59.1 (installed worker/workerMain.js + timeoutManager.js): the
// test timeout only races the test function; the body keeps running orphaned
// while the runner moves to afterEach hooks (fresh slot of max(project, test)
// timeout), fixture teardown and worker shutdown. A body `finally` that has not
// finished by then is lost, as in FULL 40689200536. The finalizer therefore runs
// at most once from either the body or the afterEach backstop, with its own
// finite budget instead of a larger 20 min test timeout.
//
// Budget basis (job 122819370750 step times): pre-Playwright steps 72 s, the
// Playwright step 20 min 11 s, post steps 11 s, i.e. 21 min 34 s of the 30 min
// job. 240 s of cleanup plus three 15 s evidence writes (285 s) keeps more than
// 3 min of the measured headroom. Every cleanup call keeps its own 15 s/30 s
// transport deadline; this budget only bounds the whole sequence.
export const OWNED_FINALIZATION_BUDGET_MS = 240_000;
export const OWNED_FINALIZATION_WRITE_BUDGET_MS = 15_000;

export type FinalizationReason =
  | "completed"
  | "failed"
  | "runner-timedOut"
  | "runner-interrupted"
  | "runner-failed";
export type StepOutcome =
  | "in-flight"
  | "cleaned"
  | "failed"
  | "unknown-budget-exhausted"
  | "not-attempted-budget-exhausted";
export type OrderCustody = {
  slot: string;
  orderId?: string | undefined;
  journalState?: "ack_unknown" | "acknowledged" | undefined;
  bodySha256?: string | undefined;
  journalFile?: string | undefined;
  taskId?: string | undefined;
  assignmentId?: string | undefined;
  // Only what the owning code recorded after its own readback; never derived
  // from a stage label.
  ownerTerminal?: boolean | undefined;
  ownerRecovery?: string | undefined;
};
export type SessionCustody = { role: string; sessionId?: string | undefined };
export type RunCustodySnapshot = {
  orders: OrderCustody[];
  supply: {
    actor: string;
    driverId?: string | undefined;
    vehicleId?: string | undefined;
    deviceId?: string | undefined;
    bindingId?: string | undefined;
    invitationIssued?: boolean | undefined;
  }[];
  sessions: SessionCustody[];
};
export type FinalArtifact = {
  name: string;
  path: string;
  build: (summary: FinalizationSummary) => unknown;
};
export type FinalizationSummary = {
  reason: FinalizationReason;
  startedAtMs: number;
  budgetMs: number;
  steps: { stage: string; outcome: StepOutcome }[];
  planError?: string;
};
export type FinalizationResult = FinalizationSummary & {
  finishedAtMs: number;
  artifacts: { name: string; outcome: "written" | "failed" }[];
  checkpointWriteFailures: number;
  unresolved: string[];
};
export type FinalizationClock = {
  now: () => number;
  // Resolves after ms; cancel releases the timer.
  after: (ms: number) => { promise: Promise<void>; cancel: () => void };
};
export const realFinalizationClock: FinalizationClock = {
  now: () => Date.now(),
  after: (ms) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    return { promise, cancel: () => clearTimeout(timer) };
  },
};
export type StepRunner = (
  stage: string,
  action: () => Promise<unknown>,
) => Promise<void>;
export type FinalizationPorts = {
  definitionSha: string;
  runtimeSha: string;
  nonce: string;
  // Must match the existing `cancellations/*-facts.json` upload allowlist.
  checkpointFile: string;
  persist: (path: string, value: unknown) => Promise<void>;
  custody: () => RunCustodySnapshot;
  // Values that must never reach disk (tokens, invitation codes).
  secrets: () => readonly (string | undefined)[];
  // Existing evidence/cleanupErrors wiring of the original cleanup helper.
  onCleaned: (stage: string) => void;
  onFailed: (stage: string, error: unknown) => void;
  // Stops an orphaned body from issuing new UI actions (runner paths only).
  stopInterruptedBody?: () => Promise<void>;
  plan: (step: StepRunner, reason: FinalizationReason) => Promise<void>;
  artifacts: readonly FinalArtifact[];
  budgetMs?: number;
  writeBudgetMs?: number;
  clock?: FinalizationClock;
};

const SAFE_VALUE = /^[A-Za-z0-9_.:/-]{1,96}$/;
const JWT_LIKE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const fingerprint = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);

function safeStage(stage: string) {
  return stage.replace(/[^a-z0-9_.:-]/gi, "-").slice(0, 100);
}

function errorStage(error: unknown) {
  return error instanceof JourneyFailure
    ? safeStage(error.stage)
    : "unexpected-failure";
}

export class RunFinalizer {
  private readonly scope = new AsyncLocalStorage<true>();
  private readonly budgetMs: number;
  private readonly writeBudgetMs: number;
  private readonly clock: FinalizationClock;
  private readonly phases: { phase: string; atMs: number }[] = [];
  private steps: FinalizationSummary["steps"] = [];
  private checkpointWriteFailures = 0;
  private reason: FinalizationReason | undefined;
  private startedAtMs: number | undefined;
  private finished: FinalizationResult | undefined;
  private running: Promise<FinalizationResult> | undefined;
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly ports: FinalizationPorts) {
    this.budgetMs = ports.budgetMs ?? OWNED_FINALIZATION_BUDGET_MS;
    this.writeBudgetMs =
      ports.writeBudgetMs ?? OWNED_FINALIZATION_WRITE_BUDGET_MS;
    this.clock = ports.clock ?? realFinalizationClock;
    if (!/cancellations\/[^/]+-facts\.json$/.test(ports.checkpointFile))
      throw new JourneyFailure("finalization-checkpoint-outside-allowlist");
  }

  get started() {
    return this.running !== undefined;
  }

  // Body requests are refused once finalization begins; only the finalizer's
  // own async scope keeps the original transport.
  guardFetch(inner: typeof fetch): typeof fetch {
    return ((input, init) => {
      if (this.started && !this.scope.getStore())
        return Promise.reject(
          new JourneyFailure("business-request-after-finalization-start"),
        );
      return inner(input, init);
    }) as typeof fetch;
  }

  // Durable major-phase fact before potential irreversible outbound actions.
  // A body checkpoint fails closed: no outbound action without custody.
  async checkpoint(phase: string) {
    if (this.started)
      throw new JourneyFailure("business-phase-after-finalization-start");
    this.phases.push({ phase: safeStage(phase), atMs: this.clock.now() });
    await this.persistFacts("running");
  }

  run(reason: FinalizationReason): Promise<FinalizationResult> {
    this.running ??= this.scope.run(true, () => this.execute(reason));
    return this.running;
  }

  private async execute(reason: FinalizationReason) {
    this.reason = reason;
    const startedAtMs = (this.startedAtMs = this.clock.now());
    const deadline = startedAtMs + this.budgetMs;
    let exhausted = false;
    const writeStep = async (index: number, outcome: StepOutcome) => {
      this.steps = this.steps.map((step, i) =>
        i === index ? { ...step, outcome } : step,
      );
      await this.persistFacts("finalizing");
    };
    const step: StepRunner = async (stage, action) => {
      const index =
        this.steps.push({ stage: safeStage(stage), outcome: "in-flight" }) - 1;
      const remaining = deadline - this.clock.now();
      if (exhausted || remaining <= 0) {
        exhausted = true;
        this.ports.onFailed(
          stage,
          new JourneyFailure(
            `${safeStage(stage)}-not-attempted-budget-exhausted`,
          ),
        );
        await writeStep(index, "not-attempted-budget-exhausted");
        return;
      }
      await this.persistFacts("finalizing");
      const timer = this.clock.after(remaining);
      // A synchronous throw is a failed step, never an aborted sequence.
      const attempt = Promise.resolve()
        .then(action)
        .then(
          () => "cleaned" as const,
          (error: unknown) => {
            this.ports.onFailed(stage, error);
            return "failed" as const;
          },
        );
      const outcome = await Promise.race([
        attempt,
        timer.promise.then(() => "unknown-budget-exhausted" as const),
      ]);
      timer.cancel();
      if (outcome === "cleaned") this.ports.onCleaned(stage);
      if (outcome === "unknown-budget-exhausted") {
        exhausted = true;
        this.ports.onFailed(
          stage,
          new JourneyFailure(
            `${safeStage(stage)}-outcome-unknown-budget-exhausted`,
          ),
        );
      }
      await writeStep(index, outcome);
    };
    let planError: string | undefined;
    try {
      await this.persistFacts("finalizing");
      if (reason.startsWith("runner-") && this.ports.stopInterruptedBody)
        await step(
          "interrupted-business-body-stopped",
          this.ports.stopInterruptedBody,
        );
      await this.ports.plan(step, reason);
    } catch (error) {
      planError = errorStage(error);
      this.ports.onFailed("finalization-plan-aborted", error);
    }
    const artifacts: FinalizationResult["artifacts"] = [];
    for (const artifact of this.ports.artifacts) {
      const summary = this.summary(planError);
      let outcome: "written" | "failed" = "failed";
      try {
        outcome = (await this.bounded(
          this.ports.persist(artifact.path, artifact.build(summary)),
        ))
          ? "written"
          : "failed";
        if (outcome === "written") this.ports.onCleaned(artifact.name);
        else
          this.ports.onFailed(
            artifact.name,
            new JourneyFailure(`${artifact.name}-write-budget-exhausted`),
          );
      } catch (error) {
        this.ports.onFailed(artifact.name, error);
      }
      artifacts.push({ name: artifact.name, outcome });
    }
    const result: FinalizationResult = {
      ...this.summary(planError),
      finishedAtMs: this.clock.now(),
      artifacts,
      checkpointWriteFailures: this.checkpointWriteFailures,
      unresolved: [],
    };
    result.unresolved = unresolvedFacts(this.ports.custody(), result);
    this.finished = result;
    await this.persistFacts("finalized");
    result.checkpointWriteFailures = this.checkpointWriteFailures;
    return result;
  }

  private summary(planError?: string): FinalizationSummary {
    return {
      reason: this.reason!,
      startedAtMs: this.startedAtMs!,
      budgetMs: this.budgetMs,
      steps: this.steps.map((step) => ({ ...step })),
      ...(planError ? { planError } : {}),
    };
  }

  private async bounded(work: Promise<void>) {
    const timer = this.clock.after(this.writeBudgetMs);
    void work.catch(() => undefined);
    try {
      return await Promise.race([
        work.then(() => true),
        timer.promise.then(() => false),
      ]);
    } finally {
      timer.cancel();
    }
  }

  // Serialized so a late write never overwrites a newer state. Disk errors are
  // counted, never thrown from the finalizer, so later steps still run.
  private persistFacts(status: "running" | "finalizing" | "finalized") {
    let snapshot: unknown;
    try {
      snapshot = this.facts(status);
    } catch {
      snapshot = {
        definitionSha: this.ports.definitionSha,
        runtimeSha: this.ports.runtimeSha,
        status,
        custody: "unavailable-snapshot-failed",
      };
    }
    const write = this.writes.then(async () => {
      try {
        if (
          !(await this.bounded(
            this.ports.persist(this.ports.checkpointFile, snapshot),
          ))
        )
          this.checkpointWriteFailures++;
      } catch {
        this.checkpointWriteFailures++;
      }
    });
    this.writes = write;
    return status === "running"
      ? write.then(() => {
          if (this.checkpointWriteFailures)
            throw new JourneyFailure("business-checkpoint-not-durable");
        })
      : write;
  }

  private facts(status: "running" | "finalizing" | "finalized") {
    const secrets = this.ports
      .secrets()
      .filter(
        (value): value is string =>
          typeof value === "string" && value.length >= 8,
      );
    const safe = (value: string | undefined) => {
      if (value === undefined) return undefined;
      if (
        !SAFE_VALUE.test(value) ||
        JWT_LIKE.test(value) ||
        secrets.some((secret) => value.includes(secret))
      )
        return "redacted";
      return value;
    };
    const custody = this.ports.custody();
    return {
      definitionSha: this.ports.definitionSha,
      runtimeSha: this.ports.runtimeSha,
      nonce: safe(this.ports.nonce),
      status,
      phases: this.phases,
      orders: custody.orders.map((order) => ({
        slot: safeStage(order.slot),
        orderId: safe(order.orderId) ?? null,
        journalState: order.journalState ?? null,
        bodySha256: safe(order.bodySha256) ?? null,
        journalFile: safe(order.journalFile) ?? null,
        taskId: safe(order.taskId) ?? null,
        assignmentId: safe(order.assignmentId) ?? null,
        ownerTerminal: order.ownerTerminal ?? null,
        ownerRecovery: safe(order.ownerRecovery) ?? null,
      })),
      supply: custody.supply.map((actor) => ({
        actor: safeStage(actor.actor),
        driverId: safe(actor.driverId) ?? null,
        vehicleId: safe(actor.vehicleId) ?? null,
        deviceId: safe(actor.deviceId) ?? null,
        bindingId: safe(actor.bindingId) ?? null,
        invitationIssued: actor.invitationIssued === true,
      })),
      // Session IDs are masked in logs; only a fingerprint is retained.
      sessions: custody.sessions.map((session) => ({
        role: safeStage(session.role),
        known: Boolean(session.sessionId),
        fingerprint: session.sessionId ? fingerprint(session.sessionId) : null,
      })),
      finalization: this.reason
        ? {
            reason: this.reason,
            budgetMs: this.budgetMs,
            steps: this.steps,
            ...(this.finished
              ? {
                  artifacts: this.finished.artifacts,
                  unresolved: this.finished.unresolved,
                }
              : {}),
          }
        : null,
      wholeRunPassed:
        status === "finalized" && this.finished
          ? this.reason === "completed" && this.finished.unresolved.length === 0
          : false,
    };
  }
}

// Explicit unresolved facts; nothing is inferred terminal from a label.
export function unresolvedFacts(
  custody: RunCustodySnapshot,
  result: Pick<
    FinalizationResult,
    "steps" | "artifacts" | "planError" | "reason"
  >,
) {
  const unresolved: string[] = [];
  if (result.reason !== "completed") unresolved.push(`run-${result.reason}`);
  if (result.planError) unresolved.push("finalization-plan-aborted");
  for (const order of custody.orders) {
    if (order.journalState === "ack_unknown" && !order.orderId)
      unresolved.push(
        `${safeStage(order.slot)}-booking-ACK-unknown-original-journal-retained`,
      );
    else if (order.orderId && order.ownerTerminal !== true)
      unresolved.push(
        `${safeStage(order.slot)}-owned-order-terminal-not-observed`,
      );
  }
  for (const step of result.steps)
    if (step.outcome !== "cleaned")
      unresolved.push(`${step.stage}-${step.outcome}`);
  for (const artifact of result.artifacts)
    if (artifact.outcome !== "written")
      unresolved.push(`${safeStage(artifact.name)}-not-written`);
  return unresolved;
}

// afterEach backstop: Playwright still runs afterEach hooks after a test
// timeout, while an unfinished body finally would be dropped at worker exit.
export async function finalizeAfterRunner(
  finalizer: RunFinalizer | undefined,
  status: string,
) {
  if (!finalizer) return undefined;
  const reason: FinalizationReason =
    status === "timedOut"
      ? "runner-timedOut"
      : status === "interrupted"
        ? "runner-interrupted"
        : status === "passed"
          ? "completed"
          : "runner-failed";
  // Same promise when the body already started finalization (at most once).
  return finalizer.run(reason);
}
