import { randomUUID, createHash } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import { ApiRequestError } from "../../common/api-envelope";
import { type ContactRole } from "./voice-contact.service";
import { VoiceSessionRepository } from "./voice-session.repository";

export type CallbackTaskStatus =
  | "pending"
  | "claimed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "unreachable";

export type CallbackPriority = "normal" | "urgent" | "emergency";

export type CallbackOutcome =
  | "answered"
  | "no_answer"
  | "busy"
  | "failed"
  | "succeeded";

export type DialStatus =
  | "dialing"
  | "bridged"
  | "hung_up"
  | "reconcile_required";

export interface VoiceCallbackTaskRecord {
  taskId: string;
  voiceSessionId: string;
  resourceScopeId: string;
  brandId: string;
  callId: string;
  contactRole: ContactRole;
  contactName: string;
  contactPhone: string;
  consentRef: string;
  consentSnapshotHash: string;
  reason: string;
  priority: CallbackPriority;
  dueAt: string;
  scheduledAt: string | null;
  status: CallbackTaskStatus;
  ownerClaimLease: string | null;
  assignedOperatorId: string | null;
  claimExpiresAt: string | null;
  version: number;
  attemptCount: number;
  maxAttempts: number;
  lastOutcome: CallbackOutcome | null;
  actionKey: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  cancellationReason?: string | null;
  dialReconcileRequired?: boolean;
}

export interface VoiceCallbackAttemptRecord {
  attemptId: string;
  taskId: string;
  attemptNumber: number;
  operatorId: string;
  startedAt: string;
  endedAt: string | null;
  outcome: CallbackOutcome;
  nextAction: string | null;
  dialOperationKey: string | null;
  dialStatus: DialStatus;
  hangupConfirmed: boolean;
  notes: string | null;
  createdAt: string;
}

export interface CallbackCommandReceipt {
  commandId: string;
  brandId: string;
  callId: string;
  actionKey: string;
  payloadHash: string;
  status: "pending" | "succeeded" | "rejected";
  taskId: string | null;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVoiceCallbackInput {
  voiceSessionId: string;
  resourceScopeId: string;
  brandId: string;
  callId: string;
  contactPhone: string;
  consentRef: string;
  contactName?: string;
  contactRole?: ContactRole;
  reason: string;
  priority?: CallbackPriority;
  slaMinutes?: number;
  scheduledAt?: string | null;
  actionSuffix?: string;
  maxAttempts?: number;
}

export interface ClaimVoiceCallbackInput {
  taskId: string;
  operatorId: string;
  expectedVersion: number;
  leaseDurationMs?: number;
}

export interface RecordCallbackAttemptInput {
  taskId: string;
  operatorId: string;
  expectedVersion: number;
  outcome: CallbackOutcome;
  dialOperationKey?: string | undefined;
  dialStatus?: ("dialing" | "bridged" | "hung_up") | undefined;
  hangupConfirmed?: boolean | undefined;
  notes?: string | undefined;
}

export interface CompleteVoiceCallbackInput {
  taskId: string;
  operatorId: string;
  expectedVersion: number;
  resolutionNotes?: string | undefined;
}

export interface CancelVoiceCallbackInput {
  taskId: string;
  reason: string;
  expectedVersion: number;
  operatorId?: string | undefined;
}

export interface CancelVoiceCallbackResult {
  task: VoiceCallbackTaskRecord;
  status: "cancelled";
  replayed: boolean;
  actualPhoneHungUp: boolean;
  dialReconcileRequired: boolean;
  inFlightAttemptId?: string | undefined;
}

/**
 * SD §12.5: Consented Voice Callback Service & Terminal CAS State Machine.
 *
 * Requirements:
 * 1. Consent & Callback Command Atomicity:
 *    - Consent is strictly mandatory; missing consent fails with CALLBACK_CONSENT_REQUIRED.
 *    - Cannot fabricate callback tasks without explicit consent evidence.
 *    - Callback command receipts enforce idempotency via actionKey and payloadHash.
 *    - If response is lost and call.ended arrives first, the task is recovered by querying receipt.
 *    - "call closed 不等於工作已結案": Call closure does NOT abort the callback task.
 * 2. Claim, Attempt, & SLA:
 *    - Claiming uses expectedVersion CAS and leases task to an operator with expiration.
 *    - Attempts record detailed contact outcome. Failed attempts return task to pending
 *      until maxAttempts is reached, at which point status becomes unreachable (terminal).
 * 3. Terminal State CAS & Dial Fencing:
 *    - "取消/完成/重送互斥且 terminal 不復活":
 *      - Completed and cancelled states are terminal.
 *      - Attempting to cancel an already completed task or complete a cancelled task throws 409 conflict.
 *      - Repeated terminal commands replay the saved terminal state.
 *      - Terminal states cannot be resurrected by attempts, claims, or recreate.
 *    - "task cancel 不假報實際電話已掛斷":
 *      - If cancelled while a dial attempt is in-flight, returns actualPhoneHungUp = false
 *        and marks dialReconcileRequired = true.
 *      - Subsequent dial reconciliation confirms actual physical hangup without reviving the cancelled task.
 */
@Injectable()
export class VoiceCallbackService {
  private readonly tasks = new Map<string, VoiceCallbackTaskRecord>();
  private readonly attempts = new Map<string, VoiceCallbackAttemptRecord[]>();
  private readonly receipts = new Map<string, CallbackCommandReceipt>();

  constructor(
    @Optional() private readonly sessionRepository?: VoiceSessionRepository,
  ) {}

  /**
   * Helper to compute SHA-256 digest
   */
  private sha256(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Creates a consented callback task and an atomic command receipt.
   * SD §12.5: "沒有同意不能補造"; "同意與 callback command 同交易".
   */
  async createCallback(
    input: CreateVoiceCallbackInput,
  ): Promise<{ receipt: CallbackCommandReceipt; task: VoiceCallbackTaskRecord; replayed: boolean }> {
    // 1. Consent verification: consentRef is strictly required
    const consentRef = input.consentRef?.trim();
    if (!consentRef) {
      throw new ApiRequestError(
        400,
        "CALLBACK_CONSENT_REQUIRED",
        "Callback requires explicit customer consent; cannot fabricate without consent.",
      );
    }

    const contactPhone = input.contactPhone?.trim();
    if (!contactPhone) {
      throw new ApiRequestError(
        400,
        "INVALID_CONTACT_PHONE",
        "Contact phone is required for callback.",
      );
    }

    // 2. Compute action key and payload hash (SD §7.2)
    const actionKey = `${input.brandId}:${input.callId}:${input.actionSuffix ?? "default"}:create_callback`;
    const payloadHash = this.sha256(
      JSON.stringify({
        voiceSessionId: input.voiceSessionId,
        contactPhone,
        consentRef,
        reason: input.reason,
        resourceScopeId: input.resourceScopeId,
      }),
    );

    // 3. Receipt deduplication / replay
    const existingReceipt = this.receipts.get(actionKey);
    if (existingReceipt) {
      if (existingReceipt.payloadHash === payloadHash) {
        // Idempotent replay: return existing receipt and task
        const existingTask = existingReceipt.taskId
          ? this.tasks.get(existingReceipt.taskId)
          : null;
        if (existingTask) {
          return {
            receipt: { ...existingReceipt },
            task: this.cloneTask(existingTask),
            replayed: true,
          };
        }
      } else {
        // Payload conflict for the same action key
        throw new ApiRequestError(
          409,
          "VOICE_ACTION_PAYLOAD_CONFLICT",
          `Action key '${actionKey}' was already submitted with a different payload hash.`,
        );
      }
    }

    const now = new Date().toISOString();
    const taskId = randomUUID();
    const commandId = randomUUID();
    const slaMinutes = input.slaMinutes ?? 30;
    const dueAt = new Date(Date.now() + slaMinutes * 60 * 1000).toISOString();

    const consentSnapshotHash = this.sha256(consentRef);

    const task: VoiceCallbackTaskRecord = {
      taskId,
      voiceSessionId: input.voiceSessionId,
      resourceScopeId: input.resourceScopeId,
      brandId: input.brandId,
      callId: input.callId,
      contactRole: input.contactRole ?? "callbackRecipient",
      contactName: input.contactName?.trim() || "Customer",
      contactPhone,
      consentRef,
      consentSnapshotHash,
      reason: input.reason,
      priority: input.priority ?? "normal",
      dueAt,
      scheduledAt: input.scheduledAt ?? null,
      status: "pending",
      ownerClaimLease: null,
      assignedOperatorId: null,
      claimExpiresAt: null,
      version: 1,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      lastOutcome: null,
      actionKey,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      dialReconcileRequired: false,
    };

    const receipt: CallbackCommandReceipt = {
      commandId,
      brandId: input.brandId,
      callId: input.callId,
      actionKey,
      payloadHash,
      status: "succeeded",
      taskId,
      errorReason: null,
      createdAt: now,
      updatedAt: now,
    };

    // Atomically store both
    this.tasks.set(taskId, task);
    this.receipts.set(actionKey, receipt);
    this.attempts.set(taskId, []);

    return {
      receipt: { ...receipt },
      task: this.cloneTask(task),
      replayed: false,
    };
  }

  /**
   * Recovers a callback command receipt by actionKey.
   * Useful when client lost response and recovers state after call.ended.
   */
  getReceiptByActionKey(actionKey: string): {
    receipt: CallbackCommandReceipt | null;
    task: VoiceCallbackTaskRecord | null;
  } {
    const receipt = this.receipts.get(actionKey);
    if (!receipt) {
      return { receipt: null, task: null };
    }
    const task = receipt.taskId ? this.tasks.get(receipt.taskId) ?? null : null;
    return {
      receipt: { ...receipt },
      task: task ? this.cloneTask(task) : null,
    };
  }

  /**
   * Retrieves active callback task by session ID.
   * Call closure does NOT remove or invalidate the task.
   */
  getTaskBySessionId(voiceSessionId: string): VoiceCallbackTaskRecord | null {
    for (const task of this.tasks.values()) {
      if (task.voiceSessionId === voiceSessionId) {
        return this.cloneTask(task);
      }
    }
    return null;
  }

  /**
   * Retrieves task by taskId.
   */
  getTaskById(taskId: string): VoiceCallbackTaskRecord | null {
    const task = this.tasks.get(taskId);
    return task ? this.cloneTask(task) : null;
  }

  /**
   * Claims a callback task with version CAS and operator lease.
   */
  claimCallback(input: ClaimVoiceCallbackInput): VoiceCallbackTaskRecord {
    const task = this.tasks.get(input.taskId);
    if (!task) {
      throw new ApiRequestError(
        404,
        "CALLBACK_TASK_NOT_FOUND",
        `Callback task '${input.taskId}' not found.`,
      );
    }

    // Terminal tasks cannot be claimed
    if (this.isTerminalStatus(task.status)) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_TERMINAL",
        `Cannot claim task in terminal status '${task.status}'.`,
      );
    }

    // Version CAS check
    if (task.version !== input.expectedVersion) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_VERSION_MISMATCH",
        `Task version mismatch: expected ${input.expectedVersion}, actual ${task.version}.`,
      );
    }

    const now = new Date();
    // Lease check: if already claimed by another operator and lease is active
    if (
      task.assignedOperatorId &&
      task.assignedOperatorId !== input.operatorId &&
      task.claimExpiresAt &&
      new Date(task.claimExpiresAt).getTime() > now.getTime()
    ) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_ALREADY_CLAIMED",
        `Task '${input.taskId}' is currently claimed by operator '${task.assignedOperatorId}'.`,
      );
    }

    const leaseDurationMs = input.leaseDurationMs ?? 300000; // 5 mins
    const claimExpiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();

    task.status = "claimed";
    task.assignedOperatorId = input.operatorId;
    task.claimExpiresAt = claimExpiresAt;
    task.ownerClaimLease = `${input.operatorId}:${claimExpiresAt}`;
    task.version += 1;
    task.updatedAt = now.toISOString();

    return this.cloneTask(task);
  }

  /**
   * Records a callback attempt with detailed outcome, version CAS, and SLA retry logic.
   */
  recordAttempt(
    input: RecordCallbackAttemptInput,
  ): { task: VoiceCallbackTaskRecord; attempt: VoiceCallbackAttemptRecord } {
    const task = this.tasks.get(input.taskId);
    if (!task) {
      throw new ApiRequestError(
        404,
        "CALLBACK_TASK_NOT_FOUND",
        `Callback task '${input.taskId}' not found.`,
      );
    }

    if (this.isTerminalStatus(task.status)) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_TERMINAL",
        `Cannot record attempt for task in terminal status '${task.status}'.`,
      );
    }

    if (task.version !== input.expectedVersion) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_VERSION_MISMATCH",
        `Task version mismatch: expected ${input.expectedVersion}, actual ${task.version}.`,
      );
    }

    const now = new Date().toISOString();
    const nextAttemptNumber = task.attemptCount + 1;
    const hangupConfirmed = input.hangupConfirmed ?? false;
    const dialStatus: DialStatus = input.dialStatus ?? (hangupConfirmed ? "hung_up" : "dialing");

    const attempt: VoiceCallbackAttemptRecord = {
      attemptId: randomUUID(),
      taskId: task.taskId,
      attemptNumber: nextAttemptNumber,
      operatorId: input.operatorId,
      startedAt: now,
      endedAt: hangupConfirmed ? now : null,
      outcome: input.outcome,
      nextAction:
        input.outcome === "succeeded" || input.outcome === "answered"
          ? "complete_task"
          : nextAttemptNumber >= task.maxAttempts
            ? "mark_unreachable"
            : "retry_later",
      dialOperationKey:
        input.dialOperationKey ?? `dial-${task.taskId}-${nextAttemptNumber}`,
      dialStatus,
      hangupConfirmed,
      notes: input.notes ?? null,
      createdAt: now,
    };

    const taskAttempts = this.attempts.get(task.taskId) ?? [];
    taskAttempts.push(attempt);
    this.attempts.set(task.taskId, taskAttempts);

    task.attemptCount = nextAttemptNumber;
    task.lastOutcome = input.outcome;

    if (input.outcome === "succeeded" || input.outcome === "answered") {
      task.status = "in_progress";
    } else {
      // Failed attempt
      if (nextAttemptNumber >= task.maxAttempts) {
        // Terminal: unreachable
        task.status = "unreachable";
        task.closedAt = now;
        task.ownerClaimLease = null;
        task.assignedOperatorId = null;
        task.claimExpiresAt = null;
      } else {
        // Return to pending queue according to retry policy
        task.status = "pending";
        task.ownerClaimLease = null;
        task.assignedOperatorId = null;
        task.claimExpiresAt = null;
      }
    }

    task.version += 1;
    task.updatedAt = now;

    return {
      task: this.cloneTask(task),
      attempt: { ...attempt },
    };
  }

  /**
   * Completes a callback task.
   * SD §12.5: "取消/完成/重送互斥且 terminal 不復活".
   * - If already completed: replay terminal completed state.
   * - If already cancelled or unreachable: throw 409 conflict ("terminal 不復活").
   */
  completeCallback(
    input: CompleteVoiceCallbackInput,
  ): { task: VoiceCallbackTaskRecord; status: "completed"; replayed: boolean } {
    const task = this.tasks.get(input.taskId);
    if (!task) {
      throw new ApiRequestError(
        404,
        "CALLBACK_TASK_NOT_FOUND",
        `Callback task '${input.taskId}' not found.`,
      );
    }

    // Terminal CAS checks
    if (task.status === "completed") {
      // Replay existing completed state idempotently
      return {
        task: this.cloneTask(task),
        status: "completed",
        replayed: true,
      };
    }

    if (task.status === "cancelled") {
      throw new ApiRequestError(
        409,
        "CALLBACK_TERMINAL_RACE_CONFLICT",
        "Task is already cancelled; terminal states cannot be resurrected or overwritten.",
      );
    }

    if (task.status === "unreachable") {
      throw new ApiRequestError(
        409,
        "CALLBACK_TERMINAL_RACE_CONFLICT",
        "Task is in unreachable terminal state; cannot complete.",
      );
    }

    if (task.version !== input.expectedVersion) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_VERSION_MISMATCH",
        `Task version mismatch: expected ${input.expectedVersion}, actual ${task.version}.`,
      );
    }

    const now = new Date().toISOString();
    task.status = "completed";
    task.closedAt = now;
    task.version += 1;
    task.updatedAt = now;
    task.ownerClaimLease = null;
    task.assignedOperatorId = null;
    task.claimExpiresAt = null;

    return {
      task: this.cloneTask(task),
      status: "completed",
      replayed: false,
    };
  }

  /**
   * Cancels a callback task.
   * SD §12.5:
   * - "取消/完成/重送互斥且 terminal 不復活":
   *   - If already cancelled: replay cancelled state idempotently.
   *   - If already completed: throw 409 conflict.
   * - "task cancel 不假報實際電話已掛斷":
   *   - If an outcall attempt is in-flight, mark dialReconcileRequired = true and actualPhoneHungUp = false!
   */
  cancelCallback(input: CancelVoiceCallbackInput): CancelVoiceCallbackResult {
    const task = this.tasks.get(input.taskId);
    if (!task) {
      throw new ApiRequestError(
        404,
        "CALLBACK_TASK_NOT_FOUND",
        `Callback task '${input.taskId}' not found.`,
      );
    }

    // Terminal CAS checks
    if (task.status === "cancelled") {
      const inFlightAttempt = this.getUnresolvedDialAttempt(task.taskId);
      const dialReconcileRequired = inFlightAttempt ? true : !!task.dialReconcileRequired;
      const actualPhoneHungUp = !inFlightAttempt && !task.dialReconcileRequired;

      return {
        task: this.cloneTask(task),
        status: "cancelled",
        replayed: true,
        actualPhoneHungUp,
        dialReconcileRequired,
        inFlightAttemptId: inFlightAttempt?.attemptId,
      };
    }

    if (task.status === "completed") {
      throw new ApiRequestError(
        409,
        "CALLBACK_TERMINAL_RACE_CONFLICT",
        "Task is already completed; cannot cancel an already completed task.",
      );
    }

    if (task.status === "unreachable") {
      throw new ApiRequestError(
        409,
        "CALLBACK_TERMINAL_RACE_CONFLICT",
        "Task is in unreachable terminal state; cannot cancel.",
      );
    }

    if (task.version !== input.expectedVersion) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_VERSION_MISMATCH",
        `Task version mismatch: expected ${input.expectedVersion}, actual ${task.version}.`,
      );
    }

    const now = new Date().toISOString();

    // Check for in-flight dial attempts
    const inFlightAttempt = this.getUnresolvedDialAttempt(task.taskId);

    let actualPhoneHungUp = true;
    let dialReconcileRequired = false;
    let inFlightAttemptId: string | undefined;

    if (inFlightAttempt) {
      // Outcall fencing: task is cancelled, but physical phone dial is NOT yet hung up!
      // "task cancel 不假報實際電話已掛斷"
      actualPhoneHungUp = false;
      dialReconcileRequired = true;
      inFlightAttemptId = inFlightAttempt.attemptId;
      inFlightAttempt.dialStatus = "reconcile_required";
    }

    task.status = "cancelled";
    task.cancellationReason = input.reason;
    task.dialReconcileRequired = dialReconcileRequired;
    task.closedAt = now;
    task.version += 1;
    task.updatedAt = now;
    task.ownerClaimLease = null;
    task.assignedOperatorId = null;
    task.claimExpiresAt = null;

    return {
      task: this.cloneTask(task),
      status: "cancelled",
      replayed: false,
      actualPhoneHungUp,
      dialReconcileRequired,
      inFlightAttemptId,
    };
  }

  /**
   * Reconciles an in-flight dial event after cancellation or drop.
   * Confirms the physical phone call ended without reviving the cancelled task.
   */
  reconcileInFlightDial(
    taskId: string,
    attemptId: string,
    hangupEvent: { hungUpAt: string; dialOutcome: CallbackOutcome; operatorNote?: string },
  ): { task: VoiceCallbackTaskRecord; attempt: VoiceCallbackAttemptRecord } {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new ApiRequestError(
        404,
        "CALLBACK_TASK_NOT_FOUND",
        `Callback task '${taskId}' not found.`,
      );
    }

    const attempts = this.attempts.get(taskId) ?? [];
    const attempt = attempts.find((a) => a.attemptId === attemptId);
    if (!attempt) {
      throw new ApiRequestError(
        404,
        "CALLBACK_ATTEMPT_NOT_FOUND",
        `Attempt '${attemptId}' not found.`,
      );
    }

    attempt.dialStatus = "hung_up";
    attempt.hangupConfirmed = true;
    attempt.endedAt = hangupEvent.hungUpAt;
    attempt.outcome = hangupEvent.dialOutcome;
    if (hangupEvent.operatorNote) {
      attempt.notes = `${attempt.notes ? attempt.notes + "; " : ""}${hangupEvent.operatorNote}`;
    }

    const remainingUnresolved = this.getUnresolvedDialAttempt(taskId);
    task.dialReconcileRequired = !!remainingUnresolved;

    // Terminal task status remains unchanged ("terminal 不復活")!
    task.updatedAt = new Date().toISOString();

    return {
      task: this.cloneTask(task),
      attempt: { ...attempt },
    };
  }

  /**
   * Helper to retrieve any in-flight / unresolved dial attempt for a task.
   */
  private getUnresolvedDialAttempt(taskId: string): VoiceCallbackAttemptRecord | undefined {
    const attempts = this.attempts.get(taskId) ?? [];
    return [...attempts]
      .reverse()
      .find(
        (a) =>
          !a.hangupConfirmed &&
          (a.dialStatus === "dialing" ||
            a.dialStatus === "bridged" ||
            a.dialStatus === "reconcile_required"),
      );
  }

  /**
   * Checks if SLA is breached for a task.
   */
  isSlaBreached(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status === "completed" || task.status === "cancelled") return false;
    return new Date().getTime() > new Date(task.dueAt).getTime();
  }

  /**
   * Returns attempts for a task.
   */
  getAttempts(taskId: string): VoiceCallbackAttemptRecord[] {
    const attempts = this.attempts.get(taskId) ?? [];
    return attempts.map((a) => ({ ...a }));
  }

  private isTerminalStatus(status: CallbackTaskStatus): boolean {
    return status === "completed" || status === "cancelled" || status === "unreachable";
  }

  private cloneTask(task: VoiceCallbackTaskRecord): VoiceCallbackTaskRecord {
    return { ...task };
  }
}
