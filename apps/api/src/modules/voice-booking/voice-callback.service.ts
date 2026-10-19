import { randomUUID, createHash } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import { ApiRequestError } from "../../common/api-envelope";
import { DatabaseService } from "../../common/db";
import { VoiceContactService, type ContactRole } from "./voice-contact.service";
import { VoiceSessionRepository } from "./voice-session.repository";
import type { VoiceQueryExecutor } from "./voice-booking.repository";
import { readVoiceRecordingContext } from "./voice-recording-context";
import { computePayloadHash } from "../../common/idempotency/canonical-json";

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
  linkedOrderId?: string | null;
  /**
   * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 review round 2 (F5/F8): the
   * `voice.contact_role_revision.revision_number` this task's `contactName`/
   * `consentRef` are sealed to (`voice.callback_task_contact_binding`), and
   * when that binding was written. `null` when no contact state has ever
   * been bound for this task (an honest gap, not a fabricated pointer) --
   * only present for DB-backed reads.
   */
  contactRevisionNumber?: number | null;
  contactRevisionBoundAt?: string | null;
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

export interface CreateVoiceCallbackDurableInput {
  actionKey?: string | undefined;
  voiceSessionId: string;
  contactPhoneEncrypted: string;
  contactPhoneLookupToken: string;
  consentSnapshotHash: string;
  reason?: string | undefined;
  resourceScopeId?: string | null | undefined;
  priority?: CallbackPriority | undefined;
  scheduledAt?: string | null | undefined;
  dueAt?: string | null | undefined;
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

export interface VoiceCallbackOperationInput {
  taskId: string;
  action: "claim" | "attempt" | "complete" | "cancel" | "transfer";
  operatorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  leaseDurationMs?: number | undefined;
  outcome?: CallbackOutcome | undefined;
  dialOperationKey?: string | undefined;
  dialStatus?: "dialing" | "bridged" | "hung_up" | undefined;
  hangupConfirmed?: boolean | undefined;
  notes?: string | undefined;
  reason?: string | undefined;
  toOperatorId?: string | undefined;
}

export interface VoiceCallbackOperationResult {
  task: VoiceCallbackTaskRecord;
  attempt?: VoiceCallbackAttemptRecord | undefined;
  actualPhoneHungUp?: boolean | undefined;
  dialReconcileRequired?: boolean | undefined;
  transfer?:
    | {
        fromOperatorId: string | null;
        toOperatorId: string;
        reason: string;
      }
    | undefined;
  receipt: {
    commandId: string;
    taskId: string;
    action: VoiceCallbackOperationInput["action"];
    operatorId: string;
    createdAt: string;
  };
  replayed: boolean;
  operatorNotes: string | null;
}

interface CallbackDbTaskRow {
  create_command_id?: string | null;
  create_action_key?: string | null;
  create_payload_hash?: string | null;
  contact_phone_lookup_token: string;
  task_id: string;
  voice_session_id: string;
  contact_phone_encrypted: string;
  consent_snapshot_hash: string;
  status: CallbackTaskStatus;
  scheduled_at: Date | string | null;
  due_at: Date | string | null;
  priority: string | null;
  reason: string | null;
  resource_scope_id: string | null;
  owner_claim_lease: string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
  attempt_count?: number;
  last_outcome?: CallbackOutcome | null;
  unresolved_attempt?: boolean;
  cancellation_reason?: string | null;
}

interface CallbackDbAttemptRow {
  attempt_id: string;
  task_id: string;
  attempt_number: number;
  operator_id: string | null;
  started_at: Date | string;
  ended_at: Date | string | null;
  outcome: CallbackOutcome;
  next_action: string | null;
  created_at: Date | string;
  dial_operation_key?: string | null;
  dial_status?: DialStatus;
  hangup_confirmed?: boolean;
  notes?: string | null;
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
    // The runtime entry points below use PostgreSQL when configured. Legacy
    // synchronous methods remain available to memory-only component callers.
    @Optional() private readonly databaseService?: DatabaseService,
    // AUDIT-VOICE-APPLICATION-REGRESSION-20261018 Package C/D: resolves the
    // durable, sealed callbackRecipient contact/consent for DB-backed task
    // projection (`loadDbTask`). Optional so every pre-existing in-memory
    // test construction of this service (`new VoiceCallbackService()`)
    // keeps working unchanged -- those paths never call `loadDbTask`.
    @Optional() private readonly contactService?: VoiceContactService,
  ) {}

  /**
   * Helper to compute SHA-256 digest
   */
  private sha256(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private isDbBacked(): boolean {
    return this.databaseService?.isEnabled() ?? false;
  }

  /**
   * Creates a consented callback task and an atomic command receipt.
   * SD §12.5: "沒有同意不能補造"; "同意與 callback command 同交易".
   */
  async createCallback(input: CreateVoiceCallbackInput): Promise<{
    receipt: CallbackCommandReceipt;
    task: VoiceCallbackTaskRecord;
    replayed: boolean;
  }> {
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
    const task = receipt.taskId
      ? (this.tasks.get(receipt.taskId) ?? null)
      : null;
    return {
      receipt: { ...receipt },
      task: task ? this.cloneTask(task) : null,
    };
  }

  async getReceiptByActionKeyForRead(actionKey: string): Promise<{
    receipt: CallbackCommandReceipt | null;
    task: VoiceCallbackTaskRecord | null;
  }> {
    if (!this.isDbBacked()) return this.getReceiptByActionKey(actionKey);
    const result = await this.databaseService!.query<CallbackDbTaskRow>(
      "SELECT * FROM voice.callback_task WHERE create_action_key = $1",
      [actionKey.trim()],
    );
    const row = result.rows[0];
    if (!row) return { receipt: null, task: null };
    const task = await this.loadDbTask(row.task_id);
    return { receipt: this.mapDbCreateReceipt(row, task), task };
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

  async getTaskForRead(
    taskId: string,
  ): Promise<VoiceCallbackTaskRecord | null> {
    if (!this.isDbBacked()) return this.getTaskById(taskId);
    try {
      return await this.loadDbTask(taskId);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.code === "CALLBACK_TASK_NOT_FOUND"
      )
        return null;
      throw error;
    }
  }

  async listTaskScopesForRead() {
    if (!this.isDbBacked()) {
      return [
        ...new Map(
          [...this.tasks.values()].map((task) => [
            task.resourceScopeId,
            { resourceScopeId: task.resourceScopeId, brandId: task.brandId },
          ]),
        ).values(),
      ];
    }
    const result = await this.databaseService!.query<{
      resource_scope_id: string;
      brand_id: string;
    }>(
      `SELECT DISTINCT scope.scope_id AS resource_scope_id, scope.brand_id
       FROM voice.callback_task t
       JOIN voice.session s ON s.voice_session_id = t.voice_session_id
       JOIN voice.resource_scope scope ON scope.scope_id = COALESCE(t.resource_scope_id, s.resource_scope_id)
       ORDER BY scope.brand_id, scope.scope_id`,
    );
    return result.rows.map((row) => ({
      resourceScopeId: row.resource_scope_id,
      brandId: row.brand_id,
    }));
  }

  async listTasksForRead(input: {
    resourceScopeId: string;
    voiceSessionId?: string | undefined;
    status?: CallbackTaskStatus | undefined;
  }): Promise<VoiceCallbackTaskRecord[]> {
    if (!this.isDbBacked()) {
      return [...this.tasks.values()]
        .filter(
          (task) =>
            task.resourceScopeId === input.resourceScopeId &&
            (!input.voiceSessionId ||
              task.voiceSessionId === input.voiceSessionId) &&
            (!input.status || task.status === input.status),
        )
        .map((task) => this.cloneTask(task));
    }
    const result = await this.databaseService!.query<{ task_id: string }>(
      `SELECT t.task_id FROM voice.callback_task t
       JOIN voice.session s ON s.voice_session_id = t.voice_session_id
       WHERE COALESCE(t.resource_scope_id, s.resource_scope_id) = $1::uuid
         AND ($2::text IS NULL OR t.status = $2::text)
         AND ($3::uuid IS NULL OR t.voice_session_id = $3::uuid)
       ORDER BY CASE t.priority WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
                t.due_at NULLS LAST, t.created_at, t.task_id`,
      [
        input.resourceScopeId,
        input.status ?? null,
        input.voiceSessionId ?? null,
      ],
    );
    const tasks: VoiceCallbackTaskRecord[] = [];
    for (const row of result.rows)
      tasks.push(await this.loadDbTask(row.task_id));
    return tasks;
  }

  async getTaskCommandHistoryForRead(
    taskId: string,
  ): Promise<VoiceCallbackOperationResult[]> {
    if (!this.isDbBacked()) return [];
    const result = await this.databaseService!.query<{
      response_body: VoiceCallbackOperationResult;
    }>(
      "SELECT response_body FROM ops.idempotency_records WHERE scope = ANY($1::varchar[]) AND status = 'completed' ORDER BY created_at, record_id",
      [
        ["claim", "attempt", "complete", "cancel", "transfer"].map(
          (action) => `voice_callback:${taskId}:${action}`,
        ),
      ],
    );
    return result.rows.map((row) => row.response_body);
  }

  /** A task change, attempt and its replayable response commit together.
   * Reuses the existing shared idempotency table; a lost HTTP response cannot
   * turn a successful contact attempt into a second attempt on a cold peer. */
  async executeTaskCommandForWrite(
    input: VoiceCallbackOperationInput,
  ): Promise<VoiceCallbackOperationResult> {
    const key = input.idempotencyKey?.trim();
    if (!key)
      throw new ApiRequestError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key is required.",
      );
    if (key.length > 255)
      throw new ApiRequestError(
        400,
        "IDEMPOTENCY_KEY_TOO_LONG",
        "Idempotency-Key exceeds the existing maximum length.",
      );
    const payloadHash = computePayloadHash({
      ...input,
      idempotencyKey: undefined,
    });
    const scope = `voice_callback:${input.taskId}:${input.action}`;
    return this.withLockedDbTask(input.taskId, async (task, tx) => {
      const prior = await tx.query<{
        payload_hash: string;
        status: string;
        response_body: VoiceCallbackOperationResult;
      }>(
        "SELECT payload_hash, status, response_body FROM ops.idempotency_records WHERE scope = $1 AND idempotency_key = $2",
        [scope, key],
      );
      const saved = prior.rows[0];
      if (saved) {
        if (saved.payload_hash !== payloadHash)
          throw new ApiRequestError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "This callback action key already has a different payload.",
          );
        if (saved.status !== "completed")
          throw new ApiRequestError(
            409,
            "IDEMPOTENCY_IN_PROGRESS",
            "The original callback action is still processing.",
          );
        return { ...saved.response_body, replayed: true };
      }
      let changed = task;
      let attempt: VoiceCallbackAttemptRecord | undefined;
      let transfer: VoiceCallbackOperationResult["transfer"];
      let actualPhoneHungUp: boolean | undefined;
      let dialReconcileRequired: boolean | undefined;
      if (input.action === "claim") {
        changed = await this.claimDbTask(
          {
            taskId: input.taskId,
            operatorId: input.operatorId,
            expectedVersion: input.expectedVersion,
            ...(input.leaseDurationMs === undefined
              ? {}
              : { leaseDurationMs: input.leaseDurationMs }),
          },
          task,
          tx,
        );
      } else if (input.action === "attempt") {
        if (!input.outcome)
          throw new ApiRequestError(
            400,
            "CALLBACK_OUTCOME_REQUIRED",
            "Contact outcome is required.",
          );
        const recorded = await this.recordDbAttempt(
          { ...input, outcome: input.outcome },
          task,
          tx,
        );
        changed = recorded.task;
        attempt = recorded.attempt;
      } else if (input.action === "transfer") {
        this.assertMutableDbTask(task, input.expectedVersion);
        const toOperatorId = input.toOperatorId?.trim();
        const reason = input.reason?.trim();
        if (!toOperatorId || !reason)
          throw new ApiRequestError(
            400,
            "CALLBACK_TRANSFER_DETAILS_REQUIRED",
            "Recipient and transfer reason are required.",
          );
        const expiresAt = new Date(
          Date.now() + (input.leaseDurationMs ?? 300000),
        ).toISOString();
        await tx.query(
          "UPDATE voice.callback_task SET owner_claim_lease = $2, status = 'claimed', version = version + 1, updated_at = now() WHERE task_id = $1",
          [task.taskId, `${toOperatorId}:${expiresAt}`],
        );
        changed = await this.loadDbTask(task.taskId, tx);
        transfer = {
          fromOperatorId: task.assignedOperatorId,
          toOperatorId,
          reason,
        };
      } else {
        const desired = input.action === "complete" ? "completed" : "cancelled";
        if (task.status !== desired) {
          if (this.isTerminalStatus(task.status))
            throw new ApiRequestError(
              409,
              "CALLBACK_TERMINAL_RACE_CONFLICT",
              `Task is already ${task.status}.`,
            );
          this.assertMutableDbTask(task, input.expectedVersion);
          if (desired === "cancelled" && !input.reason?.trim())
            throw new ApiRequestError(
              400,
              "CALLBACK_CANCEL_REASON_REQUIRED",
              "Cancellation reason is required.",
            );
          await tx.query(
            `UPDATE voice.callback_task SET status = $2::varchar(20), cancellation_reason = CASE WHEN $2::varchar(20) = 'cancelled' THEN $3 ELSE cancellation_reason END, owner_claim_lease = NULL, version = version + 1, updated_at = now() WHERE task_id = $1`,
            [task.taskId, desired, input.reason ?? null],
          );
          changed = await this.loadDbTask(task.taskId, tx);
        }
        if (desired === "cancelled") {
          const inFlight = await this.findUnresolvedAttemptDb(task.taskId, tx);
          actualPhoneHungUp = !inFlight;
          dialReconcileRequired = !!inFlight;
        }
      }
      const commandId = randomUUID();
      const createdAt = new Date().toISOString();
      const result: VoiceCallbackOperationResult = {
        task: changed,
        attempt,
        transfer,
        actualPhoneHungUp,
        dialReconcileRequired,
        receipt: {
          commandId,
          taskId: task.taskId,
          action: input.action,
          operatorId: input.operatorId,
          createdAt,
        },
        replayed: false,
        operatorNotes: input.notes ?? input.reason ?? null,
      };
      await tx.query(
        `INSERT INTO ops.idempotency_records (record_id,scope,idempotency_key,actor_id,request_path,payload_hash,status,status_code,response_body,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,'completed',201,$7::jsonb,$8,$8)`,
        [
          commandId,
          scope,
          key,
          input.operatorId,
          `/api/voice/callbacks/${task.taskId}/${input.action === "attempt" ? "attempts" : input.action}`,
          payloadHash,
          JSON.stringify(result),
          createdAt,
        ],
      );
      return result;
    });
  }

  async claimCallbackForWrite(input: ClaimVoiceCallbackInput) {
    return this.isDbBacked()
      ? this.claimCallbackDurable(input)
      : this.claimCallback(input);
  }

  async recordAttemptForWrite(input: RecordCallbackAttemptInput) {
    return this.isDbBacked()
      ? this.recordAttemptDurable(input)
      : this.recordAttempt(input);
  }

  async getAttemptsForRead(
    taskId: string,
  ): Promise<VoiceCallbackAttemptRecord[]> {
    if (!this.isDbBacked())
      return (this.attempts.get(taskId) ?? []).map((attempt) => ({
        ...attempt,
      }));
    const result = await this.databaseService!.query<CallbackDbAttemptRow>(
      "SELECT * FROM voice.callback_attempt WHERE task_id = $1 ORDER BY attempt_number",
      [taskId],
    );
    return result.rows.map((row) => this.mapDbAttemptRow(row));
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
    const claimExpiresAt = new Date(
      now.getTime() + leaseDurationMs,
    ).toISOString();

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
  recordAttempt(input: RecordCallbackAttemptInput): {
    task: VoiceCallbackTaskRecord;
    attempt: VoiceCallbackAttemptRecord;
  } {
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
    const dialStatus: DialStatus =
      input.dialStatus ?? (hangupConfirmed ? "hung_up" : "dialing");

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
  completeCallback(input: CompleteVoiceCallbackInput): {
    task: VoiceCallbackTaskRecord;
    status: "completed";
    replayed: boolean;
  } {
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
      const dialReconcileRequired = inFlightAttempt
        ? true
        : !!task.dialReconcileRequired;
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
    hangupEvent: {
      hungUpAt: string;
      dialOutcome: CallbackOutcome;
      operatorNote?: string;
    },
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
  private getUnresolvedDialAttempt(
    taskId: string,
  ): VoiceCallbackAttemptRecord | undefined {
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
    if (task.status === "completed" || task.status === "cancelled")
      return false;
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
    return (
      status === "completed" ||
      status === "cancelled" ||
      status === "unreachable"
    );
  }

  private cloneTask(task: VoiceCallbackTaskRecord): VoiceCallbackTaskRecord {
    return { ...task };
  }

  // Durable task state and attempt details come from PostgreSQL. Call, brand
  // and original-order linkage use the existing canonical session context;
  // contact display names and raw consent references are not reconstructed.

  private async withLockedDbTask<T>(
    taskId: string,
    mutate: (
      task: VoiceCallbackTaskRecord,
      tx: VoiceQueryExecutor,
    ) => Promise<T>,
  ): Promise<T> {
    if (!this.isDbBacked())
      throw new Error("Durable callback operations require PostgreSQL.");
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT task_id FROM voice.callback_task WHERE task_id = $1 FOR UPDATE",
        [taskId],
      );
      const task = await this.loadDbTask(taskId, client);
      const result = await mutate(task, client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private assertMutableDbTask(
    task: VoiceCallbackTaskRecord,
    expectedVersion: number,
  ) {
    if (this.isTerminalStatus(task.status)) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_TERMINAL",
        `Task is already ${task.status}.`,
      );
    }
    if (task.version !== expectedVersion) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_VERSION_MISMATCH",
        `Task version mismatch: expected ${expectedVersion}, actual ${task.version}.`,
      );
    }
  }

  async claimCallbackDurable(
    input: ClaimVoiceCallbackInput,
  ): Promise<VoiceCallbackTaskRecord> {
    return this.withLockedDbTask(input.taskId, (task, tx) =>
      this.claimDbTask(input, task, tx),
    );
  }

  private async claimDbTask(
    input: ClaimVoiceCallbackInput,
    task: VoiceCallbackTaskRecord,
    tx: VoiceQueryExecutor,
  ): Promise<VoiceCallbackTaskRecord> {
    this.assertMutableDbTask(task, input.expectedVersion);
    const now = new Date();
    if (
      task.assignedOperatorId &&
      task.assignedOperatorId !== input.operatorId &&
      task.claimExpiresAt &&
      Date.parse(task.claimExpiresAt) > now.getTime()
    ) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_ALREADY_CLAIMED",
        `Task is currently claimed by operator '${task.assignedOperatorId}'.`,
      );
    }
    const expiresAt = new Date(
      now.getTime() + (input.leaseDurationMs ?? 300000),
    ).toISOString();
    await tx.query(
      "UPDATE voice.callback_task SET status = 'claimed', owner_claim_lease = $2, version = version + 1, updated_at = now() WHERE task_id = $1",
      [input.taskId, `${input.operatorId}:${expiresAt}`],
    );
    return this.loadDbTask(input.taskId, tx);
  }

  async recordAttemptDurable(input: RecordCallbackAttemptInput): Promise<{
    task: VoiceCallbackTaskRecord;
    attempt: VoiceCallbackAttemptRecord;
  }> {
    return this.withLockedDbTask(input.taskId, (task, tx) =>
      this.recordDbAttempt(input, task, tx),
    );
  }

  private async recordDbAttempt(
    input: RecordCallbackAttemptInput,
    task: VoiceCallbackTaskRecord,
    tx: VoiceQueryExecutor,
  ): Promise<{
    task: VoiceCallbackTaskRecord;
    attempt: VoiceCallbackAttemptRecord;
  }> {
    this.assertMutableDbTask(task, input.expectedVersion);
    const numbers = await tx.query<{ next_number: number }>(
      "SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_number FROM voice.callback_attempt WHERE task_id = $1",
      [input.taskId],
    );
    const nextNumber = Number(numbers.rows[0]!.next_number);
    const answered =
      input.outcome === "answered" || input.outcome === "succeeded";
    const exhausted = task.attemptCount + 1 >= task.maxAttempts;
    const nextAction = answered
      ? "complete_task"
      : exhausted
        ? "mark_unreachable"
        : "retry_later";
    const hangupConfirmed = input.hangupConfirmed ?? false;
    const attempt = await tx.query<CallbackDbAttemptRow>(
      `INSERT INTO voice.callback_attempt (
        task_id, attempt_number, operator_id, started_at, ended_at, outcome, next_action,
        dial_operation_key, dial_status, hangup_confirmed, notes
      ) VALUES ($1,$2,$3,now(),CASE WHEN $8::boolean THEN now() ELSE NULL END,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        input.taskId,
        nextNumber,
        input.operatorId,
        input.outcome,
        nextAction,
        input.dialOperationKey ?? `dial-${input.taskId}-${nextNumber}`,
        input.dialStatus ?? (hangupConfirmed ? "hung_up" : "dialing"),
        hangupConfirmed,
        input.notes ?? null,
      ],
    );
    const status = answered
      ? "in_progress"
      : exhausted
        ? "unreachable"
        : "pending";
    await tx.query(
      `UPDATE voice.callback_task SET status = $2::varchar(20),
        owner_claim_lease = CASE WHEN $2::varchar(20) = 'in_progress' THEN owner_claim_lease ELSE NULL END,
        version = version + 1, updated_at = now() WHERE task_id = $1`,
      [input.taskId, status],
    );
    return {
      task: await this.loadDbTask(input.taskId, tx),
      attempt: this.mapDbAttemptRow(attempt.rows[0]!),
    };
  }

  private mapDbAttemptRow(
    row: CallbackDbAttemptRow,
  ): VoiceCallbackAttemptRecord {
    const iso = (value: Date | string) => new Date(value).toISOString();
    return {
      attemptId: row.attempt_id,
      taskId: row.task_id,
      attemptNumber: row.attempt_number,
      operatorId: row.operator_id ?? "",
      startedAt: iso(row.started_at),
      endedAt: row.ended_at === null ? null : iso(row.ended_at),
      outcome: row.outcome,
      nextAction: row.next_action,
      dialOperationKey:
        row.dial_operation_key ?? `dial-${row.task_id}-${row.attempt_number}`,
      dialStatus: row.dial_status ?? (row.ended_at ? "hung_up" : "dialing"),
      hangupConfirmed: row.hangup_confirmed ?? row.ended_at !== null,
      notes: row.notes ?? null,
      createdAt: iso(row.created_at),
    };
  }

  private mapDbTaskRow(row: CallbackDbTaskRow): VoiceCallbackTaskRecord {
    const toIso = (value: Date | string | null): string | null =>
      value === null ? null : new Date(value).toISOString();
    const lease = row.owner_claim_lease
      ? /^(.*):(\d{4}-\d{2}-\d{2}T.*Z)$/.exec(row.owner_claim_lease)
      : null;
    return {
      taskId: row.task_id,
      voiceSessionId: row.voice_session_id,
      resourceScopeId: row.resource_scope_id ?? "",
      brandId: "",
      callId: "",
      contactRole: "callbackRecipient",
      // AUDIT-VOICE-APPLICATION-REGRESSION-20261018 Package C/D: honest
      // defaults, overridden by `loadDbTask` with the durable, sealed
      // VoiceContactService projection when one exists for this session.
      // `contact_phone_encrypted` is caller-supplied ciphertext in a format
      // apps/api does not control or decrypt (unlike
      // voice.contact_role_revision's own envelope) -- it is NOT the real
      // phone number, and this field name staying `contactPhone` while
      // holding ciphertext is a pre-existing, precisely-identified
      // remaining boundary (see this task's UAT doc), not something this
      // change resolves.
      contactName: "",
      contactPhone: row.contact_phone_encrypted,
      consentRef: "",
      consentSnapshotHash: row.consent_snapshot_hash,
      reason: row.reason ?? "",
      priority: (row.priority as CallbackPriority | null) ?? "normal",
      dueAt: toIso(row.due_at) ?? new Date(0).toISOString(),
      scheduledAt: toIso(row.scheduled_at),
      status: row.status,
      ownerClaimLease: row.owner_claim_lease,
      assignedOperatorId: lease?.[1] ?? null,
      claimExpiresAt: lease?.[2] ?? null,
      version: row.version,
      attemptCount: Number(row.attempt_count ?? 0),
      maxAttempts: 3,
      lastOutcome: row.last_outcome ?? null,
      actionKey: row.create_action_key ?? "",
      createdAt: toIso(row.created_at)!,
      updatedAt: toIso(row.updated_at)!,
      closedAt: this.isTerminalStatus(row.status)
        ? toIso(row.updated_at)
        : null,
      cancellationReason: row.cancellation_reason ?? null,
      dialReconcileRequired:
        row.status === "cancelled" && row.unresolved_attempt === true,
    };
  }

  private async loadDbTask(
    taskId: string,
    tx: VoiceQueryExecutor = this.databaseService!,
  ): Promise<VoiceCallbackTaskRecord> {
    const result = await tx.query<CallbackDbTaskRow>(
      `SELECT t.*,
        COALESCE(t.resource_scope_id, (SELECT s.resource_scope_id FROM voice.session s WHERE s.voice_session_id = t.voice_session_id)) AS resource_scope_id,
        (SELECT COUNT(*)::integer FROM voice.callback_attempt a WHERE a.task_id = t.task_id) AS attempt_count,
        (SELECT a.outcome FROM voice.callback_attempt a WHERE a.task_id = t.task_id ORDER BY a.attempt_number DESC LIMIT 1) AS last_outcome,
        EXISTS (SELECT 1 FROM voice.callback_attempt a WHERE a.task_id = t.task_id AND a.ended_at IS NULL) AS unresolved_attempt
       FROM voice.callback_task t WHERE t.task_id = $1`,
      [taskId],
    );
    const row = result.rows[0];
    if (!row)
      throw new ApiRequestError(
        404,
        "CALLBACK_TASK_NOT_FOUND",
        `Callback task '${taskId}' not found.`,
      );
    const context = await readVoiceRecordingContext(tx, row.voice_session_id);
    if (!context)
      throw new ApiRequestError(
        404,
        "VOICE_SESSION_NOT_FOUND",
        "Callback voice session was not found.",
      );
    // AUDIT-VOICE-APPLICATION-REGRESSION-20261018 review round 2 (F5): read
    // the contact/consent PINNED to this task at the moment it was bound
    // (`voice.callback_task_contact_binding`, written once by
    // `createCallbackDurable` and re-pointed only by an AUTHORIZED
    // `VoiceContactService.updateContactRole` correction), never "whatever
    // is currently effective for the session" -- that mixed a later
    // recipient's name/consent into an older task's read while its own
    // sealed `contact_phone_encrypted`/`consent_snapshot_hash` columns (see
    // `mapDbTaskRow`) stayed on the original contact, silently combining
    // two different identities in one record. Honestly falls back to the ""
    // defaults (not a fabricated value, and NOT a live-session lookup) when
    // no binding has ever been written for this task -- true for every
    // callback created before this fix shipped, or for any session where
    // nothing has called `VoiceContactService.initializeContacts` yet (see
    // this task's UAT doc).
    const binding = await this.sessionRepository?.getLatestCallbackTaskContactBinding(
      row.task_id,
      tx,
    );
    const boundContact = binding
      ? await this.contactService?.getContactRevisionByNumber(
          row.voice_session_id,
          binding.revisionNumber,
        )
      : null;

    return {
      ...this.mapDbTaskRow(row),
      brandId: context.brandId,
      callId: context.callId,
      linkedOrderId: context.linkedOrderId,
      contactName: boundContact?.name ?? "",
      consentRef: boundContact?.consentRef ?? "",
      contactRevisionNumber: binding?.revisionNumber ?? null,
      contactRevisionBoundAt: binding?.boundAt ?? null,
    };
  }

  private async findUnresolvedAttemptDb(
    taskId: string,
    tx: VoiceQueryExecutor = this.databaseService!,
  ): Promise<{ attempt_id: string } | null> {
    const result = await tx.query<{ attempt_id: string }>(
      `SELECT attempt_id FROM voice.callback_attempt
       WHERE task_id = $1 AND ended_at IS NULL
       ORDER BY attempt_number DESC LIMIT 1`,
      [taskId],
    );
    return result.rows[0] ?? null;
  }

  private callbackCreatePayloadHash(
    input: CreateVoiceCallbackDurableInput,
  ): string {
    const time = (value: string | null | undefined) =>
      value == null ? null : new Date(value).toISOString();
    return this.sha256(
      JSON.stringify({
        voiceSessionId: input.voiceSessionId,
        contactPhoneEncrypted: input.contactPhoneEncrypted.trim(),
        contactPhoneLookupToken: input.contactPhoneLookupToken,
        consentSnapshotHash: input.consentSnapshotHash.trim(),
        reason: input.reason ?? null,
        resourceScopeId: input.resourceScopeId ?? null,
        priority: input.priority ?? "normal",
        scheduledAt: time(input.scheduledAt),
        dueAt: time(input.dueAt),
      }),
    );
  }

  private mapDbCreateReceipt(
    row: CallbackDbTaskRow,
    task: VoiceCallbackTaskRecord,
  ): CallbackCommandReceipt | null {
    if (
      !row.create_command_id ||
      !row.create_action_key ||
      !row.create_payload_hash
    )
      return null;
    return {
      commandId: row.create_command_id,
      brandId: task.brandId,
      callId: task.callId,
      actionKey: row.create_action_key,
      payloadHash: row.create_payload_hash,
      status: "succeeded",
      taskId: task.taskId,
      errorReason: null,
      createdAt: task.createdAt,
      updatedAt: task.createdAt,
    };
  }

  private async replayDbCallbackCreate(actionKey: string, payloadHash: string) {
    const saved = await this.getReceiptByActionKeyForRead(actionKey);
    if (!saved.task) return null;
    if (!saved.receipt)
      throw new Error("Persisted callback create receipt is incomplete.");
    if (saved.receipt.payloadHash !== payloadHash) {
      throw new ApiRequestError(
        409,
        "VOICE_ACTION_PAYLOAD_CONFLICT",
        "Callback action was already accepted with different contact, consent or scheduling details.",
      );
    }
    return { task: saved.task, receipt: saved.receipt, replayed: true };
  }

  /** Consent snapshot, task and accepted-create receipt share the same INSERT.
   * Retrying the same action returns its saved task even after call closure or
   * a terminal callback. A genuinely new callback uses a new action key.
   * Legacy rows without a saved command retain their task identity; no command
   * receipt or missing consent is fabricated for them.
   */
  async createCallbackDurable(input: CreateVoiceCallbackDurableInput): Promise<{
    task: VoiceCallbackTaskRecord;
    receipt: CallbackCommandReceipt | null;
    replayed: boolean;
  }> {
    if (!this.isDbBacked()) {
      throw new Error(
        "createCallbackDurable requires a DB-enabled databaseService.",
      );
    }
    const consentSnapshotHash = input.consentSnapshotHash?.trim();
    if (!consentSnapshotHash) {
      throw new ApiRequestError(
        400,
        "CALLBACK_CONSENT_REQUIRED",
        "Callback requires explicit customer consent; cannot fabricate without consent.",
      );
    }
    const contactPhoneEncrypted = input.contactPhoneEncrypted?.trim();
    if (!contactPhoneEncrypted) {
      throw new ApiRequestError(
        400,
        "INVALID_CONTACT_PHONE",
        "Contact phone is required for callback.",
      );
    }
    const actionKey =
      input.actionKey?.trim() || `${input.voiceSessionId}:create_callback`;
    const payloadHash = this.callbackCreatePayloadHash(input);
    const previous = await this.replayDbCallbackCreate(actionKey, payloadHash);
    if (previous) return previous;

    // AUDIT-VOICE-APPLICATION-REGRESSION-20261018 review round 2 (F5):
    // resolve the CURRENT effective `callbackRecipient` revision for this
    // session BEFORE creating the task, so the new task can be pinned to it
    // (`voice.callback_task_contact_binding`) in the same transaction as its
    // INSERT. Honestly `null` (no binding written, the pre-existing ""
    // fallback in `loadDbTask` applies) when `contactService` is unavailable
    // or `VoiceContactService.initializeContacts` has never been called for
    // this session -- never a fabricated revision.
    const effective = await this.contactService?.getEffectiveContactsDurable(
      input.voiceSessionId,
    );
    const bindRevisionNumber = effective?.callbackRecipientRevisionNumber ?? null;

    const db = this.databaseService!;
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<CallbackDbTaskRow>(
        `INSERT INTO voice.callback_task (
          voice_session_id, contact_phone_encrypted, contact_phone_lookup_token,
          consent_snapshot_hash, reason, resource_scope_id, priority, scheduled_at, due_at,
          create_command_id, create_action_key, create_payload_hash
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          input.voiceSessionId,
          contactPhoneEncrypted,
          input.contactPhoneLookupToken,
          consentSnapshotHash,
          input.reason ?? null,
          input.resourceScopeId ?? null,
          input.priority ?? null,
          input.scheduledAt ?? null,
          input.dueAt ?? null,
          randomUUID(),
          actionKey,
          payloadHash,
        ],
      );
      const row = inserted.rows[0]!;
      if (bindRevisionNumber != null) {
        await this.sessionRepository!.insertCallbackTaskContactBinding(
          row.task_id,
          input.voiceSessionId,
          bindRevisionNumber,
          "created_with_effective_contact",
          client,
        );
      }
      const task = await this.loadDbTask(row.task_id, client);
      await client.query("COMMIT");
      return {
        task,
        receipt: this.mapDbCreateReceipt(row, task),
        replayed: false,
      };
    } catch (error: unknown) {
      await client.query("ROLLBACK").catch(() => {});
      if ((error as { code?: string }).code !== "23505") throw error;
      const replay = await this.replayDbCallbackCreate(actionKey, payloadHash);
      if (replay) return replay;

      const active = await db.query<CallbackDbTaskRow>(
        `SELECT * FROM voice.callback_task WHERE voice_session_id = $1
          AND status NOT IN ('completed','cancelled','unreachable')`,
        [input.voiceSessionId],
      );
      const row = active.rows[0];
      if (!row) throw error;
      if (row.create_action_key || input.actionKey?.trim()) {
        throw new ApiRequestError(
          409,
          "CALLBACK_TASK_ALREADY_ACTIVE",
          "This call already has a different active callback action.",
        );
      }
      const time = (value: Date | string | null) =>
        value === null ? null : new Date(value).toISOString();
      const legacyHash = this.callbackCreatePayloadHash({
        voiceSessionId: row.voice_session_id,
        contactPhoneEncrypted: row.contact_phone_encrypted,
        contactPhoneLookupToken: row.contact_phone_lookup_token,
        consentSnapshotHash: row.consent_snapshot_hash,
        reason: row.reason ?? undefined,
        resourceScopeId: row.resource_scope_id,
        priority: (row.priority as CallbackPriority | null) ?? "normal",
        scheduledAt: time(row.scheduled_at),
        dueAt: time(row.due_at),
      });
      if (legacyHash !== payloadHash) {
        throw new ApiRequestError(
          409,
          "VOICE_ACTION_PAYLOAD_CONFLICT",
          "The existing callback has different contact, consent or scheduling details.",
        );
      }
      return {
        task: await this.loadDbTask(row.task_id),
        receipt: null,
        replayed: true,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Durable, real-PostgreSQL CAS variant of `completeCallback` (UV-EXEC-024
   * Case 4.2): fences the terminal-state transition against
   * `voice.callback_task` itself, so two independent instances racing this
   * call genuinely serialize through Postgres, not through this process's
   * in-memory `Map`. Requires a DB-enabled `databaseService` -- unlike
   * `completeCallback`, this method does not fall back to in-memory state,
   * since a caller reaching for cross-instance durability that silently
   * degraded to per-process memory would be worse than an explicit error.
   */
  async completeCallbackDurable(input: CompleteVoiceCallbackInput): Promise<{
    task: VoiceCallbackTaskRecord;
    status: "completed";
    replayed: boolean;
  }> {
    if (!this.isDbBacked()) {
      throw new Error(
        "completeCallbackDurable requires a DB-enabled databaseService.",
      );
    }
    const db = this.databaseService!;
    const current = await db.query<{ status: CallbackTaskStatus }>(
      `SELECT status FROM voice.callback_task WHERE task_id = $1`,
      [input.taskId],
    );
    const currentRow = current.rows[0];
    if (!currentRow) {
      throw new ApiRequestError(
        404,
        "CALLBACK_TASK_NOT_FOUND",
        `Callback task '${input.taskId}' not found.`,
      );
    }
    if (currentRow.status === "completed") {
      return {
        task: await this.loadDbTask(input.taskId),
        status: "completed",
        replayed: true,
      };
    }
    if (
      currentRow.status === "cancelled" ||
      currentRow.status === "unreachable"
    ) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TERMINAL_RACE_CONFLICT",
        `Task is already ${currentRow.status}; terminal states cannot be resurrected or overwritten.`,
      );
    }

    const result = await db.query(
      `UPDATE voice.callback_task
       SET status = 'completed', owner_claim_lease = NULL, version = version + 1, updated_at = now()
       WHERE task_id = $1 AND version = $2 AND status NOT IN ('completed', 'cancelled', 'unreachable')
       RETURNING task_id`,
      [input.taskId, input.expectedVersion],
    );

    if ((result.rowCount ?? 0) === 0) {
      // Lost a concurrent race (or stale version) since the SELECT above --
      // re-verify the authoritative row instead of trusting our own read.
      const recheck = await db.query<{ status: CallbackTaskStatus }>(
        `SELECT status FROM voice.callback_task WHERE task_id = $1`,
        [input.taskId],
      );
      const finalStatus = recheck.rows[0]?.status;
      if (finalStatus === "completed") {
        return {
          task: await this.loadDbTask(input.taskId),
          status: "completed",
          replayed: true,
        };
      }
      if (finalStatus === "cancelled" || finalStatus === "unreachable") {
        throw new ApiRequestError(
          409,
          "CALLBACK_TERMINAL_RACE_CONFLICT",
          `Task is already ${finalStatus}; terminal states cannot be resurrected or overwritten.`,
        );
      }
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_VERSION_MISMATCH",
        `Task version mismatch: expected ${input.expectedVersion}, task changed concurrently.`,
      );
    }

    return {
      task: await this.loadDbTask(input.taskId),
      status: "completed",
      replayed: false,
    };
  }

  /**
   * Durable, real-PostgreSQL CAS variant of `cancelCallback` (UV-EXEC-024
   * Case 4.2) -- see `completeCallbackDurable` for why this is a separate
   * method rather than a mode switch inside `cancelCallback`.
   */
  async cancelCallbackDurable(
    input: CancelVoiceCallbackInput,
  ): Promise<CancelVoiceCallbackResult> {
    if (!this.isDbBacked()) {
      throw new Error(
        "cancelCallbackDurable requires a DB-enabled databaseService.",
      );
    }
    const db = this.databaseService!;
    const current = await db.query<{ status: CallbackTaskStatus }>(
      `SELECT status FROM voice.callback_task WHERE task_id = $1`,
      [input.taskId],
    );
    const currentRow = current.rows[0];
    if (!currentRow) {
      throw new ApiRequestError(
        404,
        "CALLBACK_TASK_NOT_FOUND",
        `Callback task '${input.taskId}' not found.`,
      );
    }

    if (currentRow.status === "cancelled") {
      const inFlight = await this.findUnresolvedAttemptDb(input.taskId);
      return {
        task: await this.loadDbTask(input.taskId),
        status: "cancelled",
        replayed: true,
        actualPhoneHungUp: !inFlight,
        dialReconcileRequired: !!inFlight,
        inFlightAttemptId: inFlight?.attempt_id,
      };
    }
    if (
      currentRow.status === "completed" ||
      currentRow.status === "unreachable"
    ) {
      throw new ApiRequestError(
        409,
        "CALLBACK_TERMINAL_RACE_CONFLICT",
        `Task is already ${currentRow.status}; cannot cancel.`,
      );
    }

    const result = await db.query(
      `UPDATE voice.callback_task
       SET status = 'cancelled', cancellation_reason = $3, owner_claim_lease = NULL, version = version + 1, updated_at = now()
       WHERE task_id = $1 AND version = $2 AND status NOT IN ('completed', 'cancelled', 'unreachable')
       RETURNING task_id`,
      [input.taskId, input.expectedVersion, input.reason],
    );

    if ((result.rowCount ?? 0) === 0) {
      const recheck = await db.query<{ status: CallbackTaskStatus }>(
        `SELECT status FROM voice.callback_task WHERE task_id = $1`,
        [input.taskId],
      );
      const finalStatus = recheck.rows[0]?.status;
      if (finalStatus === "cancelled") {
        const inFlight = await this.findUnresolvedAttemptDb(input.taskId);
        return {
          task: await this.loadDbTask(input.taskId),
          status: "cancelled",
          replayed: true,
          actualPhoneHungUp: !inFlight,
          dialReconcileRequired: !!inFlight,
          inFlightAttemptId: inFlight?.attempt_id,
        };
      }
      if (finalStatus === "completed" || finalStatus === "unreachable") {
        throw new ApiRequestError(
          409,
          "CALLBACK_TERMINAL_RACE_CONFLICT",
          `Task is already ${finalStatus}; cannot cancel.`,
        );
      }
      throw new ApiRequestError(
        409,
        "CALLBACK_TASK_VERSION_MISMATCH",
        `Task version mismatch: expected ${input.expectedVersion}, task changed concurrently.`,
      );
    }

    const inFlight = await this.findUnresolvedAttemptDb(input.taskId);

    return {
      task: await this.loadDbTask(input.taskId),
      status: "cancelled",
      replayed: false,
      actualPhoneHungUp: !inFlight,
      dialReconcileRequired: !!inFlight,
      inFlightAttemptId: inFlight?.attempt_id,
    };
  }
}
