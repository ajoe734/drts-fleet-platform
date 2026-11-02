import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type {
  StageResult,
  runFourStageOwnedCancellations,
} from "./four-stage-cancellations";
import { JourneyFailure } from "./protocol";
import type { R08RunCustody } from "./r08-callcenter";

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
// job. The whole finalization is hard-capped at 240 s of cleanup plus four 15 s
// write slots (plan grace, two final artifacts, final facts) = 300 s, keeping
// about 3 min of the measured headroom. Every cleanup call keeps its own
// 15 s/30 s transport deadline; this budget only bounds the whole sequence.
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
export type ArtifactOutcome =
  | "written"
  | "failed"
  | "unknown-write-budget-exhausted";
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
  r08?: R08RunCustody | undefined;
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
  // Authoritative: a runner timeout/interruption/failure supersedes an earlier
  // body "completed"/"failed" report and is never overwritten by it.
  reason: FinalizationReason;
  supersededReasons: FinalizationReason[];
  startedAtMs: number;
  budgetMs: number;
  totalBudgetMs: number;
  steps: { stage: string; outcome: StepOutcome }[];
  planError?: string;
  // Whole-run result as of this write (earlier artifacts included); distinct
  // from any single order's completion fact.
  wholeRunPassed: boolean;
};
export type FinalizationResult = FinalizationSummary & {
  finishedAtMs: number;
  artifacts: { name: string; outcome: ArtifactOutcome }[];
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
      timer = setTimeout(resolve, Math.max(0, ms));
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

// Outbound authority of one finalizer scope. Closed when its step settles or
// its budget expires; a closed lease never sends a request again and never
// delivers a late response (headers or any body byte) to the abandoned action.
type Lease = { open: boolean; onClose: Set<() => void> };
type FactsStatus = "running" | "finalizing" | "finalized";
// One durable file. Writes run strictly one after another in real completion
// order and coalesce to the newest snapshot, so a write abandoned by its wait
// budget can never land after (and overwrite) a newer snapshot.
type WriteSlot = {
  generation: number;
  settled: number;
  durable: number;
  pending?: { generation: number; value: unknown } | undefined;
  flushingSinceMs?: number | undefined;
  flushing?: Promise<void> | undefined;
  waiters: Set<() => void>;
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

const ABANDONED_BY_RUNNER: readonly FinalizationReason[] = [
  "runner-timedOut",
  "runner-interrupted",
];

export class RunFinalizer {
  private readonly scope = new AsyncLocalStorage<Lease>();
  private readonly budgetMs: number;
  private readonly writeBudgetMs: number;
  private readonly totalBudgetMs: number;
  private readonly clock: FinalizationClock;
  private readonly phases: { phase: string; atMs: number }[] = [];
  private readonly slots = new Map<string, WriteSlot>();
  private readonly leases = new Set<Lease>();
  private readonly handoffs = new Set<CleanupHandoff>();
  private steps: FinalizationSummary["steps"] = [];
  private checkpointWriteFailures = 0;
  private reason: FinalizationReason | undefined;
  private readonly supersededReasons: FinalizationReason[] = [];
  private startedAtMs: number | undefined;
  private hardDeadlineMs: number | undefined;
  private finished: FinalizationResult | undefined;
  private running: Promise<FinalizationResult> | undefined;

  constructor(private readonly ports: FinalizationPorts) {
    this.budgetMs = ports.budgetMs ?? OWNED_FINALIZATION_BUDGET_MS;
    this.writeBudgetMs =
      ports.writeBudgetMs ?? OWNED_FINALIZATION_WRITE_BUDGET_MS;
    this.totalBudgetMs =
      this.budgetMs + this.writeBudgetMs * (ports.artifacts.length + 2);
    this.clock = ports.clock ?? realFinalizationClock;
    if (!/cancellations\/[^/]+-facts\.json$/.test(ports.checkpointFile))
      throw new JourneyFailure("finalization-checkpoint-outside-allowlist");
  }

  get started() {
    return this.running !== undefined;
  }

  // Body requests are refused once finalization begins; only an open lease of
  // the finalizer's own scope keeps the original transport.
  guardFetch(inner: typeof fetch): typeof fetch {
    return ((input, init) => {
      if (!this.started) return inner(input, init);
      const lease = this.scope.getStore();
      if (!lease?.open)
        return Promise.reject(
          new JourneyFailure("business-request-after-finalization-start"),
        );
      return inner(input, init).then((response) => {
        if (!lease.open)
          throw new JourneyFailure(
            "finalization-response-after-budget-exhausted",
          );
        return leasedResponse(response, lease);
      });
    }) as typeof fetch;
  }

  // Same-browser Playwright requests cannot use guardFetch. Keep the entire
  // request AND bounded response consumption under the original lease, so an
  // abandoned body/cleanup never sends another write or accepts late bytes.
  async guardOperation<T>(
    operation: (assertOpen: () => void) => Promise<T>,
  ): Promise<T> {
    const lease = this.scope.getStore();
    const assertOpen = () => {
      if (this.started && !lease?.open)
        throw new JourneyFailure("business-request-after-finalization-start");
    };
    assertOpen();
    const value = await operation(assertOpen);
    assertOpen();
    return value;
  }

  // Exact R08 custody is durable both in the body and within the finalizer's
  // own cleanup step. A closed/orphaned caller cannot update the journal.
  async checkpointOwned(phase: string) {
    if (!this.started) return this.checkpoint(phase);
    if (!this.scope.getStore()?.open)
      throw new JourneyFailure("business-phase-after-finalization-start");
    this.phases.push({ phase: safeStage(phase), atMs: this.clock.now() });
    if ((await this.writeFacts("finalizing")) !== "written")
      throw new JourneyFailure("business-checkpoint-not-durable");
  }

  // A per-case cleanup that the original helper runs in its own `finally`.
  handoff(inCleanupPhase: () => boolean) {
    const handoff = new CleanupHandoff(this, inCleanupPhase);
    this.handoffs.add(handoff);
    return handoff;
  }

  /** @internal */ callerLease() {
    return this.scope.getStore();
  }

  /** @internal */ withinLease<T>(lease: Lease, work: () => Promise<T>) {
    return this.scope.run(lease, work);
  }

  // Durable major-phase fact before potential irreversible outbound actions.
  // A body checkpoint fails closed: no outbound action without custody.
  async checkpoint(phase: string) {
    if (this.started)
      throw new JourneyFailure("business-phase-after-finalization-start");
    this.phases.push({ phase: safeStage(phase), atMs: this.clock.now() });
    if ((await this.writeFacts("running")) !== "written")
      throw new JourneyFailure("business-checkpoint-not-durable");
  }

  run(reason: FinalizationReason): Promise<FinalizationResult> {
    if (!this.running) {
      this.reason = reason;
      const root = this.openLease();
      this.running = this.scope.run(root, () => this.execute(root));
      return this.running;
    }
    // At most one plan; a later, more authoritative runner result only
    // re-persists the evidence with the corrected reason.
    if (this.supersede(reason) && this.finished) {
      const planError = this.finished.planError;
      this.running = this.running.then(() => this.writeEvidence(planError));
    }
    return this.running;
  }

  // Resolves once every queued durable write has settled (tests, diagnostics).
  async writesSettled() {
    for (;;) {
      const flushing = [...this.slots.values()]
        .map((slot) => slot.flushing)
        .filter(Boolean);
      if (!flushing.length) return;
      await Promise.all(flushing);
    }
  }

  private supersede(next: FinalizationReason) {
    const current = this.reason!;
    if (current === next) return false;
    const authoritative =
      (current === "completed" && next !== "completed") ||
      (ABANDONED_BY_RUNNER.includes(next) && !current.startsWith("runner-"));
    if (!authoritative) return false;
    this.supersededReasons.push(current);
    this.reason = next;
    return true;
  }

  private openLease(): Lease {
    const lease: Lease = { open: true, onClose: new Set() };
    this.leases.add(lease);
    return lease;
  }

  private closeLease(lease: Lease) {
    if (!lease.open) return;
    lease.open = false;
    this.leases.delete(lease);
    for (const close of [...lease.onClose]) close();
    lease.onClose.clear();
  }

  private async execute(root: Lease) {
    const startedAtMs = (this.startedAtMs = this.clock.now());
    const cleanupDeadline = startedAtMs + this.budgetMs;
    this.hardDeadlineMs = startedAtMs + this.totalBudgetMs;
    let exhausted = false;
    let planClosed = false;
    const writeStep = async (index: number, outcome: StepOutcome) => {
      this.steps = this.steps.map((step, i) =>
        i === index ? { ...step, outcome } : step,
      );
      await this.writeFacts("finalizing");
    };
    const notAttempted = async (stage: string, index: number) => {
      exhausted = true;
      this.ports.onFailed(
        stage,
        new JourneyFailure(
          `${safeStage(stage)}-not-attempted-budget-exhausted`,
        ),
      );
      await writeStep(index, "not-attempted-budget-exhausted");
    };
    const step: StepRunner = async (stage, action) => {
      // A plan abandoned at its budget records nothing and sends nothing.
      if (planClosed) return;
      const index =
        this.steps.push({ stage: safeStage(stage), outcome: "in-flight" }) - 1;
      if (exhausted || cleanupDeadline - this.clock.now() <= 0)
        return notAttempted(stage, index);
      await this.writeFacts("finalizing");
      // Remaining budget after the in-flight fact, never a stale figure.
      const remaining = cleanupDeadline - this.clock.now();
      if (planClosed) return;
      if (remaining <= 0) return notAttempted(stage, index);
      const lease = this.openLease();
      const timer = this.clock.after(remaining);
      // A synchronous throw is a failed step, never an aborted sequence.
      const attempt = Promise.resolve()
        .then(() => this.scope.run(lease, action))
        .then(
          () => (lease.open ? ("cleaned" as const) : ("abandoned" as const)),
          (error: unknown) => {
            if (!lease.open) return "abandoned" as const;
            this.ports.onFailed(stage, error);
            return "failed" as const;
          },
        );
      const outcome = await Promise.race([
        attempt,
        timer.promise.then(() => {
          this.closeLease(lease);
          return "unknown-budget-exhausted" as const;
        }),
      ]);
      timer.cancel();
      this.closeLease(lease);
      // Leases closed by the plan cutoff: the outcome stays as last recorded.
      if (outcome === "abandoned" || planClosed) return;
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
    const planTimer = this.clock.after(
      cleanupDeadline + this.writeBudgetMs - this.clock.now(),
    );
    try {
      const plan = (async () => {
        await this.writeFacts("finalizing");
        if (
          this.reason!.startsWith("runner-") &&
          this.ports.stopInterruptedBody
        )
          await step(
            "interrupted-business-body-stopped",
            this.ports.stopInterruptedBody,
          );
        await this.ports.plan(step, this.reason!);
      })();
      void plan.catch(() => undefined);
      const settled = await Promise.race([
        plan.then(() => "settled" as const),
        planTimer.promise.then(() => "budget-exhausted" as const),
      ]);
      if (settled === "budget-exhausted")
        throw new JourneyFailure("finalization-plan-budget-exhausted");
    } catch (error) {
      planError = errorStage(error);
      this.ports.onFailed("finalization-plan-aborted", error);
    } finally {
      planTimer.cancel();
      planClosed = true;
      this.closeLease(root);
      for (const lease of [...this.leases]) this.closeLease(lease);
      for (const handoff of this.handoffs) handoff.close();
    }
    return this.writeEvidence(planError);
  }

  // Final artifacts and the finalized facts. Repeated only while a more
  // authoritative runner result arrives during the write, bounded by the hard
  // deadline; callbacks fire once per artifact unless a rewrite fails.
  private async writeEvidence(planError: string | undefined) {
    let first = !this.finished;
    for (;;) {
      const reason = this.reason;
      const failuresAtBuild = this.checkpointWriteFailures;
      const artifacts: FinalizationResult["artifacts"] = [];
      for (const artifact of this.ports.artifacts) {
        let outcome: ArtifactOutcome = "failed";
        let error: unknown;
        try {
          outcome = await this.durable(
            artifact.path,
            artifact.build(this.summary(planError, artifacts)),
          );
          if (outcome === "unknown-write-budget-exhausted")
            error = new JourneyFailure(
              `${artifact.name}-write-budget-exhausted`,
            );
          else if (outcome === "failed")
            error = new JourneyFailure(`${artifact.name}-write-failed`);
        } catch (thrown) {
          outcome = "failed";
          error = thrown;
        }
        if (outcome === "written") {
          if (first) this.ports.onCleaned(artifact.name);
        } else this.ports.onFailed(artifact.name, error);
        artifacts.push({ name: artifact.name, outcome });
      }
      const result: FinalizationResult = {
        ...this.summary(planError, artifacts),
        finishedAtMs: this.clock.now(),
        artifacts,
        checkpointWriteFailures: this.checkpointWriteFailures,
        unresolved: [],
      };
      result.unresolved = unresolvedFacts(this.ports.custody(), result);
      this.finished = result;
      await this.writeFacts("finalized");
      // A failed final facts write is a real failure of this run, never a
      // pass already claimed by the artifacts written before it.
      result.checkpointWriteFailures = this.checkpointWriteFailures;
      result.unresolved = unresolvedFacts(this.ports.custody(), result);
      result.wholeRunPassed &&= result.unresolved.length === 0;
      // Artifacts built while the facts were still durable are re-persisted
      // once with the failure; a persistent disk error is not retried again.
      const factsFailedAfterBuild =
        failuresAtBuild === 0 && this.checkpointWriteFailures > 0;
      if (
        (this.reason === reason && !factsFailedAfterBuild) ||
        this.remainingHardMs() <= 0
      )
        return result;
      first = false;
    }
  }

  private summary(
    planError: string | undefined,
    artifacts: FinalizationResult["artifacts"],
  ): FinalizationSummary {
    const steps = this.steps.map((step) => ({ ...step }));
    const reason = this.reason!;
    return {
      reason,
      supersededReasons: [...this.supersededReasons],
      startedAtMs: this.startedAtMs!,
      budgetMs: this.budgetMs,
      totalBudgetMs: this.totalBudgetMs,
      steps,
      ...(planError ? { planError } : {}),
      wholeRunPassed:
        reason === "completed" &&
        unresolvedFacts(this.ports.custody(), {
          reason,
          steps,
          artifacts,
          planError,
          checkpointWriteFailures: this.checkpointWriteFailures,
        }).length === 0,
    };
  }

  private remainingHardMs() {
    return this.hardDeadlineMs === undefined
      ? this.writeBudgetMs
      : this.hardDeadlineMs - this.clock.now();
  }

  private slot(path: string) {
    let slot = this.slots.get(path);
    if (!slot) {
      slot = { generation: 0, settled: 0, durable: 0, waiters: new Set() };
      this.slots.set(path, slot);
    }
    return slot;
  }

  // Queue the newest snapshot and wait for it within the remaining budget. A
  // slot whose current write already exceeded the write budget is stalled: no
  // further time is spent waiting on it, but its newest snapshot stays queued.
  private durable(path: string, value: unknown): Promise<ArtifactOutcome> {
    const slot = this.slot(path);
    const generation = ++slot.generation;
    slot.pending = { generation, value };
    this.flush(path, slot);
    const stalled =
      slot.flushingSinceMs !== undefined &&
      this.clock.now() - slot.flushingSinceMs >= this.writeBudgetMs;
    const waitMs = stalled
      ? 0
      : Math.min(this.writeBudgetMs, this.remainingHardMs());
    const state = (): ArtifactOutcome | undefined =>
      slot.durable >= generation
        ? "written"
        : slot.settled >= generation
          ? "failed"
          : undefined;
    const now = state();
    if (now) return Promise.resolve(now);
    if (waitMs <= 0) return Promise.resolve("unknown-write-budget-exhausted");
    return new Promise((resolve) => {
      const timer = this.clock.after(waitMs);
      let done = false;
      const finish = (outcome: ArtifactOutcome) => {
        if (done) return;
        done = true;
        slot.waiters.delete(check);
        timer.cancel();
        resolve(outcome);
      };
      const check = () => {
        const outcome = state();
        if (outcome) finish(outcome);
      };
      slot.waiters.add(check);
      void timer.promise.then(() => finish("unknown-write-budget-exhausted"));
    });
  }

  private flush(path: string, slot: WriteSlot) {
    if (slot.flushing) return;
    slot.flushing = (async () => {
      while (slot.pending) {
        const { generation, value } = slot.pending;
        slot.pending = undefined;
        slot.flushingSinceMs = this.clock.now();
        try {
          await this.ports.persist(path, value);
          slot.durable = Math.max(slot.durable, generation);
        } catch {
          // Counted by the waiter as failed; the next snapshot still queues.
        }
        slot.settled = Math.max(slot.settled, generation);
        slot.flushingSinceMs = undefined;
        for (const waiter of [...slot.waiters]) waiter();
      }
      slot.flushing = undefined;
    })();
  }

  // Disk errors are counted and reported, never thrown from the finalizer, so
  // later steps still run; a body checkpoint fails closed on its own outcome.
  private async writeFacts(status: FactsStatus) {
    let snapshot: unknown;
    let snapshotFailed = false;
    try {
      snapshot = this.facts(status);
    } catch {
      snapshotFailed = true;
      snapshot = {
        definitionSha: this.ports.definitionSha,
        runtimeSha: this.ports.runtimeSha,
        status,
        custody: "unavailable-snapshot-failed",
      };
    }
    const persisted = await this.durable(this.ports.checkpointFile, snapshot);
    // A durable unavailable placeholder is not durable own command custody.
    const outcome = snapshotFailed ? ("failed" as const) : persisted;
    if (outcome !== "written" && status !== "running") {
      // Reported once while finalizing and once for the final snapshot.
      if (status === "finalized" || this.checkpointWriteFailures === 0)
        this.ports.onFailed(
          status === "finalized"
            ? "run-finalization-final-facts-persist"
            : "run-finalization-facts-persist",
          new JourneyFailure(
            `run-finalization-${status}-facts-${
              outcome === "failed" ? "write-failed" : "write-budget-exhausted"
            }`,
          ),
        );
      this.checkpointWriteFailures++;
    }
    return outcome;
  }

  private facts(status: FactsStatus) {
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
      // R08 contains only own IDs and controlled non-secret commands, never
      // auth headers/proof/session values. Fail closed instead of altering raw
      // command bytes if any caller accidentally supplies a secret.
      ...(custody.r08 ? { r08: privateR08Custody(custody.r08, secrets) } : {}),
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
            supersededReasons: this.supersededReasons,
            budgetMs: this.budgetMs,
            totalBudgetMs: this.totalBudgetMs,
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

// The body of a response received under a lease stays bound to that lease: every
// chunk and the end of stream are only delivered while it is open, and closing
// it rejects a read already waiting, so an abandoned action can never complete
// (or record custody) from bytes that arrive after its budget. The transport's
// own signal, byte limits and checks still apply to the delivered bytes.
function leasedResponse(response: Response, lease: Lease): Response {
  const source = response.body;
  if (!source) return response;
  const reader = source.getReader();
  const expired = () =>
    new JourneyFailure("finalization-response-body-after-lease-closed");
  let close: (() => void) | undefined;
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        close = () => {
          controller.error(expired());
          void reader.cancel().catch(() => undefined);
        };
        lease.onClose.add(close);
      },
      async pull(controller) {
        if (!lease.open) throw expired();
        const part = await reader.read();
        if (!lease.open) throw expired();
        if (part.done) {
          lease.onClose.delete(close!);
          controller.close();
        } else controller.enqueue(part.value);
      },
      cancel(reason) {
        lease.onClose.delete(close!);
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
  const read = () => new Response(body, { headers: response.headers });
  // Same status/headers/url; only the body consumers are rebound.
  return Object.defineProperties(response, {
    body: { value: body },
    arrayBuffer: { value: () => read().arrayBuffer() },
    blob: { value: () => read().blob() },
    bytes: { value: () => read().bytes() },
    json: { value: () => read().json() },
    text: { value: () => read().text() },
  });
}

// Lends one finalizer step's lease to cleanup that an original helper performs
// in its own `finally` (the C1–C4 case terminalization), so that cleanup still
// runs through the same ownership-bound calls after the runner abandoned the
// body. Its main-line requests stay refused; cleanup requests wait for the
// finalizer step and stop with that step's lease.
export class CleanupHandoff {
  private task: Promise<unknown> | undefined;
  private settled = true;
  private resolveOpened!: (lease: Lease | undefined) => void;
  private readonly opened = new Promise<Lease | undefined>((resolve) => {
    this.resolveOpened = resolve;
  });

  constructor(
    private readonly finalizer: RunFinalizer,
    private readonly inCleanupPhase: () => boolean,
  ) {}

  get pending() {
    return !this.settled;
  }

  track<T>(work: Promise<T>): Promise<T> {
    this.settled = false;
    this.task = work.finally(() => {
      this.settled = true;
    });
    void this.task.catch(() => undefined);
    return work;
  }

  port<A extends unknown[], R>(
    call: (...args: A) => Promise<R>,
  ): (...args: A) => Promise<R> {
    return async (...args) => {
      if (!this.finalizer.started) return call(...args);
      if (!this.inCleanupPhase())
        throw new JourneyFailure("business-request-after-finalization-start");
      const lease = await this.opened;
      if (!lease?.open)
        throw new JourneyFailure("own-case-cleanup-outside-finalizer-step");
      return this.finalizer.withinLease(lease, () => call(...args));
    };
  }

  // Finalizer step action only: lends the step lease, then waits for the
  // helper's own cleanup to settle (bounded by that step's budget).
  async complete() {
    const lease = this.finalizer.callerLease();
    if (!lease?.open)
      throw new JourneyFailure("own-case-cleanup-handoff-outside-step");
    this.resolveOpened(lease);
    await this.task?.catch(() => undefined);
  }

  close() {
    this.resolveOpened(undefined);
  }
}

const CANCELLATION_TERMINAL_RECOVERY: readonly string[] = [
  "already-terminal",
  "normal-passenger-cancel",
  "normal-driver-completion",
];

// The active case is the first without persisted facts; it is in its own
// `finally` cleanup once its result left "unexecuted".
export function cancellationCleanupPhase(results: readonly StageResult[]) {
  return () => {
    const active = results.find((result) => !result.factsFile);
    return Boolean(active && active.result !== "unexecuted");
  };
}

// The original helper with every call port it uses in its per-case cleanup
// routed through the handoff, and its run tracked by the finalizer step.
export function handoffOwnCancellations(
  handoff: CleanupHandoff,
  run: typeof runFourStageOwnedCancellations,
): typeof runFourStageOwnedCancellations {
  return (ports, results) =>
    handoff.track(
      run(
        {
          ...ports,
          referral: handoff.port(ports.referral),
          opsControl: handoff.port(ports.opsControl),
          adminControl: handoff.port(ports.adminControl),
          driver: handoff.port(ports.driver),
          heartbeat: handoff.port(ports.heartbeat),
        },
        results,
      ),
    );
}

// Finalizer step: the helper's original per-case terminalization completes
// under the step lease; any acknowledged case without an owner-recorded
// terminal readback is a failed step, never inferred clean.
export async function completeOwnCancellationCleanup(
  handoff: CleanupHandoff,
  results: readonly StageResult[],
) {
  await handoff.complete();
  const open = results.filter(
    (result) =>
      result.orderId &&
      !CANCELLATION_TERMINAL_RECOVERY.includes(String(result.recovery)),
  );
  if (open.length)
    throw new JourneyFailure(
      `own-cancellation-${open.map((result) => result.stage).join("+")}-retained-unresolved`,
    );
}

export function cancellationCleanupNeeded(
  handoff: CleanupHandoff,
  results: readonly StageResult[],
) {
  return (
    handoff.pending ||
    results.some(
      (result) =>
        result.orderId &&
        !CANCELLATION_TERMINAL_RECOVERY.includes(String(result.recovery)),
    )
  );
}

function privateR08Custody(custody: R08RunCustody, secrets: readonly string[]) {
  const bytes = JSON.stringify(custody);
  if (
    secrets.some((secret) => bytes.includes(secret)) ||
    /"(?:authorization|cookie|x-drts-authorization|x-serverless-authorization)"\s*:/i.test(
      bytes,
    )
  )
    throw new JourneyFailure("r08-secret-in-custody");
  return structuredClone(custody);
}

// Explicit unresolved facts; nothing is inferred terminal from a label.
export function unresolvedFacts(
  custody: RunCustodySnapshot,
  result: Pick<FinalizationResult, "steps" | "artifacts" | "reason"> & {
    planError?: string | undefined;
    checkpointWriteFailures?: number | undefined;
  },
) {
  const unresolved: string[] = [];
  if (result.reason !== "completed") unresolved.push(`run-${result.reason}`);
  if (result.planError) unresolved.push("finalization-plan-aborted");
  if (result.checkpointWriteFailures)
    unresolved.push("run-finalization-facts-not-durable");
  if (custody.r08) {
    const r08 = custody.r08;
    if (r08.result !== "verified" || r08.transfer?.replay !== "verified")
      unresolved.push("r08-required-original-ui-replay-unverified");
    if (r08.cleanup !== "verified")
      unresolved.push("r08-own-terminal-readback-unverified");
    for (const producer of r08.producers)
      if (producer.ack !== "acknowledged")
        unresolved.push(
          `r08-${safeStage(producer.step)}-ACK-unknown-original-command-retained`,
        );
    for (const fact of r08.transfer?.unresolved ?? [])
      unresolved.push(`r08-${safeStage(fact)}`);
  }
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
  // The plan runs at most once; a runner failure supersedes a body report.
  return finalizer.run(reason);
}
