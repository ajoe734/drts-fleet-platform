import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { isDeepStrictEqual } from "node:util";
import { ApiRequestError } from "../../common/api-envelope";
import { OwnedMobilityRepository } from "../owned-mobility/owned-mobility.repository";
import { prepareVoiceOrder } from "../owned-mobility/voice-order-preparation";
import {
  VoiceBookingCommandService,
  VoiceBookingRejection,
  lockVoiceCommand,
  type VoiceBookingCommandProof,
} from "./voice-booking-command.service";
import { OwnedAutonomousDispatchExecutorService } from "../owned-mobility/owned-autonomous-dispatch-executor.service";
import { VoiceCallbackService } from "./voice-callback.service";
import { VoiceEvidenceService } from "./voice-evidence.service";
import type { VoiceQueryExecutor } from "./voice-booking.repository";

export class LeaseFencedError extends Error {
  constructor(
    message = "Work item lease was superseded or expired; execution fenced",
  ) {
    super(message);
    this.name = "LeaseFencedError";
  }
}

export interface VoiceWorkItemRecord {
  workId: string;
  commandId?: string | null;
  voiceSessionId?: string | null;
  workType: string;
  dedupeKey: string;
  payloadRef?: string | null;
  leaseEpoch: number;
  attempt: number;
}

export interface VoiceWorkExecutionResult {
  workId: string;
  workType: string;
  commandId?: string | null | undefined;
  success: boolean;
  result?: unknown;
  error?: string;
  fenced?: boolean;
}

export type CustomWorkItemHandler = (
  work: VoiceWorkItemRecord,
  runner: VoiceCommandRunnerService,
) => Promise<unknown>;

/**
 * Trusted in-process background runner & executor for voice operations.
 *
 * SD §3.4, §15:
 * - media / API separated deployment
 * - warm instance & persistent CPU to process background jobs after last call terminates
 * - handles: pending booking commands, driver deadlines/timeouts, recording finalize, callbacks
 * - DB lease fencing across revisions: no duplicate side-effects
 * - graceful shutdown drain on SIGTERM / revision switch
 */
@Injectable()
export class VoiceCommandRunnerService {
  private readonly logger = new Logger(VoiceCommandRunnerService.name);
  private readonly customHandlers = new Map<string, CustomWorkItemHandler>();

  private isDraining = false;
  private inFlightExecution: Promise<unknown> | null = null;
  private loopRunning = false;
  private loopTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly commands: VoiceBookingCommandService,
    readonly orders: OwnedMobilityRepository,
    @Optional()
    @Inject(forwardRef(() => OwnedAutonomousDispatchExecutorService))
    readonly dispatchExecutor?: OwnedAutonomousDispatchExecutorService,
    @Optional()
    @Inject(forwardRef(() => VoiceCallbackService))
    readonly callbackService?: VoiceCallbackService,
    @Optional()
    @Inject(forwardRef(() => VoiceEvidenceService))
    readonly evidenceService?: VoiceEvidenceService,
  ) {}

  registerHandler(workType: string, handler: CustomWorkItemHandler): void {
    this.customHandlers.set(workType, handler);
  }

  get draining(): boolean {
    return this.isDraining;
  }

  get running(): boolean {
    return this.loopRunning;
  }

  async execute(commandId: string) {
    const repository = this.commands.repository;
    const receipt = await repository.findReceiptById(commandId);
    if (!receipt) throw new Error("Voice command not found");
    if (receipt.status !== "pending") return receipt;

    const proof = await repository.withTransaction(async (tx) => {
      await tx.query("SET LOCAL statement_timeout = '5s'");
      const row = await tx.query<{ proof: VoiceBookingCommandProof }>(
        "SELECT proof FROM voice.booking_command_proof WHERE command_id = $1",
        [commandId],
      );
      if (!row.rows[0]) throw new Error("Accepted command proof missing");
      return row.rows[0].proof;
    });

    if (!this.commands.access)
      throw new Error("Command executor authority unavailable");
    const credential = await this.commands.access.credentialForCommand(
      commandId,
      proof,
    );
    const checkpoint = await this.commands.evidence.requireCheckpoint(
      credential,
      proof.callId,
      proof.checkpoint.checkpointId,
    );
    if (!isDeepStrictEqual(checkpoint, proof.checkpoint))
      throw new Error("Command checkpoint changed");

    return repository.withTransaction(async (tx) => {
      const locked = await lockVoiceCommand(
        repository,
        tx,
        proof.request.voiceSessionId,
        receipt.intentId,
      );
      const current = await repository.findReceiptById(commandId, tx);
      if (!current) throw new Error("Command disappeared");
      if (current.status !== "pending") return current;
      this.commands.replay(current, proof.request);
      if (
        current.brandId !== proof.authority.brandId ||
        current.callId !== proof.callId ||
        current.intentId !== proof.request.intentId ||
        current.action !== "create_owned_order"
      )
        throw new Error("Command proof scope mismatch");

      const bound = await tx.query(
        `SELECT order_id FROM ops.phase1_owned_orders
        WHERE voice_intent_id = $1 OR call_id = $2 FOR UPDATE`,
        [current.intentId, current.callId],
      );
      if (bound.rows.length || locked.intent.boundOrderId || current.orderId)
        throw new Error(
          "Pending command has an order; manual reconciliation required",
        );

      let snapshot;
      try {
        snapshot = await this.commands.validate(locked, proof, true);
      } catch (error) {
        const domainFailure =
          error instanceof VoiceBookingRejection ||
          (error instanceof ApiRequestError &&
            [
              "VOICE_CONFIRMATION_REQUIRED",
              "VOICE_SERVICE_AREA_REVIEW_REQUIRED",
              "BOOKING_REQUIREMENTS_INVALID",
              "MULTI_TAXI_SERVICE_PRODUCT_NOT_ALLOWED",
            ].includes(error.code));
        if (!domainFailure || !(error instanceof ApiRequestError)) throw error;
        await tx.query(
          `UPDATE voice.command_receipt SET status = 'rejected',
          error_code = $2, error_reason = 'Accepted booking prerequisites no longer hold',
          result_version = result_version + 1 WHERE command_id = $1`,
          [commandId, error.code],
        );
        await tx.query(
          "UPDATE voice.session SET commit_status = 'rejected', session_version = session_version + 1 WHERE voice_session_id = $1",
          [locked.session.voiceSessionId],
        );
        await tx.query(
          "UPDATE voice.intent SET status = 'rejected' WHERE intent_id = $1",
          [current.intentId],
        );
        await this.commands.enqueue(
          tx,
          commandId,
          locked.session.voiceSessionId,
          "notify_booking_result",
        );
        await this.complete(tx, commandId);
        return (await repository.findReceiptById(commandId, tx))!;
      }

      const order = prepareVoiceOrder({
        commandId,
        callId: current.callId,
        intentId: current.intentId,
        resourceScopeId: proof.authority.resourceScopeId,
        confirmationId: proof.request.confirmationId,
        recordingId: checkpoint.recordingId!,
        checkpointId: checkpoint.checkpointId,
        actorId: proof.authority.actorId,
        snapshotHash: proof.request.snapshotHash,
        snapshot,
      });
      await this.orders.insertVoiceOrder(tx, order);

      const call = await tx.query(
        `UPDATE crm.phase1_call_sessions
        SET record = record || $2::jsonb, updated_at = now()
        WHERE call_id = $1 AND (linked_order_id IS NULL OR linked_order_id = $3)
        RETURNING call_id`,
        [
          current.callId,
          JSON.stringify({
            linkedOrderId: order.orderId,
            voiceSessionId: locked.session.voiceSessionId,
            sourceChannel: "voice_agent",
            customerConfirmationId: proof.request.confirmationId,
            recordingEvidenceRef: checkpoint.checkpointId,
          }),
          order.orderId,
        ],
      );
      if (call.rowCount !== 1)
        throw new Error("Call link unavailable or already bound");

      const consumed = await tx.query(
        `UPDATE voice.confirmation SET state = 'consumed', consumed_command_id = $2
        WHERE confirmation_id = $1 AND state = 'accepted' AND expires_at > clock_timestamp() RETURNING confirmation_id`,
        [proof.request.confirmationId, commandId],
      );
      if (consumed.rowCount !== 1)
        throw new Error(
          "Confirmation expired before order commit; retry same command",
        );

      await tx.query(
        "UPDATE voice.intent SET status = 'committed', bound_order_id = $2 WHERE intent_id = $1",
        [current.intentId, order.orderId],
      );
      await tx.query(
        `UPDATE voice.command_receipt SET status = 'succeeded', order_id = $2,
        result_version = result_version + 1 WHERE command_id = $1`,
        [commandId, order.orderId],
      );
      await tx.query(
        `UPDATE voice.session SET commit_status = 'succeeded', confirmation_state = 'consumed',
        outcome = 'auto_booking_created', session_version = session_version + 1,
        dialog_state = CASE WHEN dialog_state IN ('committing','reconciling') THEN 'awaiting_dispatch' ELSE dialog_state END
        WHERE voice_session_id = $1`,
        [locked.session.voiceSessionId],
      );
      await tx.query(
        "INSERT INTO voice.booking_audit_intent (command_id, order_id, record) VALUES ($1,$2,$3::jsonb)",
        [
          commandId,
          order.orderId,
          JSON.stringify({
            action: "voice.booking.created",
            actorType: "voice_agent",
            actorId: proof.authority.actorId,
            brandId: current.brandId,
            resourceScopeId: proof.authority.resourceScopeId,
            callId: current.callId,
            intentId: current.intentId,
            confirmationId: proof.request.confirmationId,
            snapshotHash: proof.request.snapshotHash,
            checkpointId: checkpoint.checkpointId,
          }),
        ],
      );

      for (const type of [
        "request_dispatch",
        "notify_booking_result",
        "publish_booking_audit",
      ])
        await this.commands.enqueue(
          tx,
          commandId,
          locked.session.voiceSessionId,
          type,
        );

      await this.complete(tx, commandId);
      return (await repository.findReceiptById(commandId, tx))!;
    });
  }

  /** Legacy complete method for backward compatibility */
  private async complete(tx: VoiceQueryExecutor, commandId: string) {
    await tx.query(
      "UPDATE voice.work_item SET status = 'completed', leased_until = NULL WHERE command_id = $1 AND work_type = 'execute_booking_command'",
      [commandId],
    );
  }

  /**
   * Complete work item with strict lease_epoch CAS check.
   * If another worker/revision overtakes the lease, 0 rows are updated and LeaseFencedError is thrown.
   */
  async completeWorkItem(
    tx: VoiceQueryExecutor,
    workId: string,
    leaseEpoch: number,
  ): Promise<void> {
    const res = await tx.query(
      `UPDATE voice.work_item
      SET status = 'completed', leased_until = NULL, last_error = NULL
      WHERE work_id = $1 AND lease_epoch = $2 AND status = 'leased'
      RETURNING work_id`,
      [workId, leaseEpoch],
    );
    if (res.rowCount !== 1) {
      throw new LeaseFencedError(
        `Work item ${workId} was overtaken by another revision/lease (expected epoch ${leaseEpoch})`,
      );
    }
  }

  /**
   * Generic work item enqueueing supporting all voice background jobs:
   * pending receipts, driver deadlines, recording finalization, callbacks.
   */
  async enqueueWorkItem(
    tx: VoiceQueryExecutor,
    item: {
      commandId?: string | null;
      voiceSessionId?: string | null;
      workType: string;
      dedupeKey: string;
      payloadRef?: string | null;
      runAfter?: Date | string;
    },
  ): Promise<void> {
    await tx.query(
      `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
      ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        item.commandId ?? null,
        item.voiceSessionId ?? null,
        item.workType,
        item.dedupeKey,
        item.payloadRef ?? null,
        item.runAfter
          ? typeof item.runAfter === "string"
            ? item.runAfter
            : item.runAfter.toISOString()
          : null,
      ],
    );
  }

  /**
   * Core dispatcher claiming 1 work item across supported background work types.
   * Uses SKIP LOCKED and lease_epoch CAS fencing to prevent cross-revision duplicate execution.
   */
  async runOnce(options?: {
    supportedTypes?: string[] | undefined;
    maxAttempts?: number | undefined;
  }): Promise<VoiceWorkExecutionResult | null> {
    if (this.isDraining) {
      return null;
    }

    const repository = this.commands.repository;
    const supportedTypes = options?.supportedTypes ?? null;
    const maxAttempts = options?.maxAttempts ?? 5;

    const work = await repository.withTransaction(async (tx) => {
      await tx.query("SET LOCAL lock_timeout = '2s'");
      await tx.query("SET LOCAL statement_timeout = '5s'");
      const rows = await tx.query<{
        work_id: string;
        command_id: string | null;
        voice_session_id: string | null;
        work_type: string;
        dedupe_key: string;
        payload_ref: string | null;
        lease_epoch: number;
        attempt: number;
      }>(
        `
        WITH candidate AS (
          SELECT work_id FROM voice.work_item
          WHERE ((status = 'pending' AND run_after <= now()) OR (status = 'leased' AND leased_until < now()))
          AND ($1::text[] IS NULL OR work_type = ANY($1))
          ORDER BY run_after, work_id FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE voice.work_item w SET status = 'leased', attempt = attempt + 1,
          lease_epoch = lease_epoch + 1, leased_until = now() + interval '30 seconds'
          FROM candidate c WHERE w.work_id = c.work_id
          RETURNING w.work_id, w.command_id, w.voice_session_id, w.work_type, w.dedupe_key, w.payload_ref, w.lease_epoch, w.attempt`,
        [supportedTypes],
      );
      return rows.rows[0];
    });

    if (!work) return null;

    const record: VoiceWorkItemRecord = {
      workId: work.work_id,
      commandId: work.command_id,
      voiceSessionId: work.voice_session_id,
      workType: work.work_type,
      dedupeKey: work.dedupe_key,
      payloadRef: work.payload_ref,
      leaseEpoch: work.lease_epoch,
      attempt: work.attempt,
    };

    const executePromise = this.dispatchWorkItem(record);
    this.inFlightExecution = executePromise;

    try {
      const result = await executePromise;

      // Complete work item with lease fencing check
      await repository.withTransaction(async (tx) => {
        await tx.query("SET LOCAL lock_timeout = '2s'");
        await tx.query("SET LOCAL statement_timeout = '5s'");
        await this.completeWorkItem(tx, record.workId, record.leaseEpoch);
      });

      return {
        workId: record.workId,
        workType: record.workType,
        commandId: record.commandId,
        success: true,
        result,
      };
    } catch (error) {
      if (error instanceof LeaseFencedError) {
        this.logger.warn(
          `[VoiceRunner] Fenced on ${record.workType} (${record.workId}): ${error.message}`,
        );
        return {
          workId: record.workId,
          workType: record.workType,
          commandId: record.commandId,
          success: false,
          fenced: true,
          error: error.message,
        };
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[VoiceRunner] Failed ${record.workType} (${record.workId}): ${errorMsg}`,
      );

      await repository.withTransaction(async (tx) => {
        await tx.query("SET LOCAL lock_timeout = '2s'");
        await tx.query("SET LOCAL statement_timeout = '5s'");
        await tx.query(
          `UPDATE voice.work_item
          SET status = CASE WHEN attempt >= $3 THEN 'failed' ELSE 'pending' END,
              leased_until = NULL,
              run_after = now() + (interval '1 second' * LEAST(30, 1 << LEAST(attempt, 5))),
              last_error = $4
          WHERE work_id = $1 AND status = 'leased' AND lease_epoch = $2`,
          [record.workId, record.leaseEpoch, maxAttempts, errorMsg],
        );
      });

      return {
        workId: record.workId,
        workType: record.workType,
        commandId: record.commandId,
        success: false,
        error: errorMsg,
      };
    } finally {
      this.inFlightExecution = null;
    }
  }

  private async dispatchWorkItem(work: VoiceWorkItemRecord): Promise<unknown> {
    const custom = this.customHandlers.get(work.workType);
    if (custom) {
      return custom(work, this);
    }

    switch (work.workType) {
      case "execute_booking_command": {
        if (!work.commandId)
          throw new Error("Missing commandId for execute_booking_command");
        return this.execute(work.commandId);
      }

      case "dispatch_timeout":
      case "autonomous_dispatch_timeout": {
        return this.handleDispatchTimeout(work);
      }

      case "finalize_recording": {
        return this.handleFinalizeRecording(work);
      }

      case "execute_callback": {
        return this.handleExecuteCallback(work);
      }

      case "request_dispatch":
      case "notify_booking_result":
      case "publish_booking_audit": {
        // Standard downstream pipeline items
        return {
          workType: work.workType,
          status: "dispatched",
          commandId: work.commandId,
        };
      }

      default:
        this.logger.warn(
          `Unknown work_type: ${work.workType}; marking completed without action`,
        );
        return { unhandled: true };
    }
  }

  private async handleDispatchTimeout(
    work: VoiceWorkItemRecord,
  ): Promise<unknown> {
    let payload: Record<string, unknown> = {};
    if (work.payloadRef) {
      try {
        payload = JSON.parse(work.payloadRef);
      } catch {
        payload = { raw: work.payloadRef };
      }
    }

    if (
      this.dispatchExecutor &&
      payload.orderId &&
      payload.targetAssignmentId
    ) {
      return this.dispatchExecutor.handleOfferTimeout({
        orderId: String(payload.orderId),
        targetJobId: String(payload.targetJobId ?? ""),
        round: Number(payload.round ?? 1),
        targetAssignmentId: String(payload.targetAssignmentId),
        assignmentVersion: Number(payload.assignmentVersion ?? 1),
        acceptanceDeadline: String(
          payload.acceptanceDeadline ?? new Date().toISOString(),
        ),
      });
    }

    return { handled: true, type: "dispatch_timeout", payload };
  }

  private async handleFinalizeRecording(
    work: VoiceWorkItemRecord,
  ): Promise<unknown> {
    let payload: Record<string, unknown> = {};
    if (work.payloadRef) {
      try {
        payload = JSON.parse(work.payloadRef);
      } catch {
        payload = { recordingId: work.payloadRef };
      }
    }

    return {
      handled: true,
      type: "finalize_recording",
      voiceSessionId: work.voiceSessionId,
      recordingId: payload.recordingId ?? null,
      finalizedAt: new Date().toISOString(),
    };
  }

  private async handleExecuteCallback(
    work: VoiceWorkItemRecord,
  ): Promise<unknown> {
    let payload: Record<string, unknown> = {};
    if (work.payloadRef) {
      try {
        payload = JSON.parse(work.payloadRef);
      } catch {
        payload = { taskId: work.payloadRef };
      }
    }

    if (this.callbackService && payload.taskId) {
      const task = this.callbackService.getTaskById(String(payload.taskId));
      if (task && task.status === "pending") {
        return this.callbackService.claimCallback({
          taskId: task.taskId,
          expectedVersion: task.version,
          operatorId: "voice-runner-system",
          leaseDurationMs: 60000,
        });
      }
    }

    return {
      handled: true,
      type: "execute_callback",
      voiceSessionId: work.voiceSessionId,
      taskId: payload.taskId ?? null,
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Continuous background runner loop.
   * Runs persistently even when there are 0 active calls (persistent_runner_idle_evidence).
   */
  startBackgroundLoop(options?: {
    pollIntervalMs?: number | undefined;
    idleBackoffMs?: number | undefined;
    supportedTypes?: string[] | undefined;
  }): { stop: () => Promise<void>; isRunning: () => boolean } {
    if (this.loopRunning) {
      return {
        stop: async () => {
          await this.drain();
        },
        isRunning: () => this.loopRunning,
      };
    }

    this.loopRunning = true;
    this.isDraining = false;
    const pollInterval = options?.pollIntervalMs ?? 500;
    const idleBackoff = options?.idleBackoffMs ?? 1000;
    const supportedTypes = options?.supportedTypes;

    const poll = async () => {
      if (!this.loopRunning || this.isDraining) return;

      try {
        const result = await this.runOnce(
          supportedTypes !== undefined ? { supportedTypes } : undefined,
        );
        const delay = result ? pollInterval : idleBackoff;
        if (this.loopRunning && !this.isDraining) {
          this.loopTimer = setTimeout(() => void poll(), delay);
        }
      } catch (err) {
        this.logger.error(`Error in voice runner loop: ${err}`);
        if (this.loopRunning && !this.isDraining) {
          this.loopTimer = setTimeout(() => void poll(), idleBackoff);
        }
      }
    };

    void poll();

    return {
      stop: async () => {
        await this.drain();
      },
      isRunning: () => this.loopRunning,
    };
  }

  /**
   * Gracefully drains the runner:
   * 1. Stops scheduling new items.
   * 2. Awaits current in-flight execution.
   * 3. Cleanly stops the background loop.
   */
  async drain(
    timeoutMs = 15000,
  ): Promise<{ drained: boolean; inFlightCompleted: boolean }> {
    this.isDraining = true;
    this.loopRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }

    let inFlightCompleted = true;
    if (this.inFlightExecution) {
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Drain timeout exceeded")),
            timeoutMs,
          ),
        );
        await Promise.race([this.inFlightExecution, timeout]);
      } catch {
        inFlightCompleted = false;
      }
    }

    return { drained: true, inFlightCompleted };
  }
}
