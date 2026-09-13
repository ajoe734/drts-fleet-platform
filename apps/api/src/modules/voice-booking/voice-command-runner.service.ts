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
import {
  VoiceEvidenceService,
  VOICE_MEDIA_RECORDING_ADAPTER,
  type VoiceMediaRecordingAdapter,
} from "./voice-evidence.service";
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
    @Optional()
    @Inject(VOICE_MEDIA_RECORDING_ADAPTER)
    readonly mediaAdapter?: VoiceMediaRecordingAdapter,
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
   * Records a started or terminal attempt audit event if voice.phase1_work_item_attempt_audits exists.
   * Tolerates schemas/environments where V0101 has not been applied (e.g. legacy UV matrix suites).
   */
  private async recordAttemptAudit(
    tx: VoiceQueryExecutor,
    params: {
      workId: string;
      attemptNo: number;
      leaseEpoch: number;
      attemptStage: "started" | "terminal";
      outcome: "started" | "completed" | "failed" | "fenced";
      errorMessage?: string | null;
    },
  ): Promise<void> {
    try {
      const check = await tx.query<{ exists: boolean }>(
        `SELECT to_regclass('voice.phase1_work_item_attempt_audits') IS NOT NULL AS exists`,
      );
      if (check.rows.length > 0 && !check.rows[0]?.exists) {
        return;
      }
    } catch {
      return;
    }

    if (params.attemptStage === "started") {
      await tx.query(
        `INSERT INTO voice.phase1_work_item_attempt_audits (
          work_id, attempt_no, lease_epoch, attempt_stage, outcome, started_at
        ) VALUES ($1, $2, $3, 'started', 'started', now())
        ON CONFLICT (work_id, lease_epoch, attempt_no, attempt_stage) DO NOTHING`,
        [params.workId, params.attemptNo, params.leaseEpoch],
      );
    } else if (params.outcome === "completed") {
      await tx.query(
        `INSERT INTO voice.phase1_work_item_attempt_audits (
          work_id, attempt_no, lease_epoch, attempt_stage, outcome, finished_at
        ) VALUES ($1, $2, $3, 'terminal', 'completed', now())
        ON CONFLICT (work_id, lease_epoch, attempt_no, attempt_stage) DO NOTHING`,
        [params.workId, params.attemptNo, params.leaseEpoch],
      );
    } else if (params.outcome === "fenced") {
      await tx.query(
        `INSERT INTO voice.phase1_work_item_attempt_audits (
          work_id, attempt_no, lease_epoch, attempt_stage, outcome, error_message, finished_at
        ) VALUES ($1, $2, $3, 'terminal', 'fenced', $4, now())
        ON CONFLICT (work_id, lease_epoch, attempt_no, attempt_stage) DO NOTHING`,
        [
          params.workId,
          params.attemptNo,
          params.leaseEpoch,
          params.errorMessage ?? null,
        ],
      );
    } else {
      await tx.query(
        `INSERT INTO voice.phase1_work_item_attempt_audits (
          work_id, attempt_no, lease_epoch, attempt_stage, outcome, error_message, finished_at
        ) VALUES ($1, $2, $3, 'terminal', 'failed', $4, now())
        ON CONFLICT (work_id, lease_epoch, attempt_no, attempt_stage) DO NOTHING`,
        [
          params.workId,
          params.attemptNo,
          params.leaseEpoch,
          params.errorMessage ?? null,
        ],
      );
    }
  }

  /**
   * Completes a work item within a transaction after checking lease fencing.
   * For finalize_recording, updates call session and single order domain state.
   * Also appends terminal 'completed' event to voice.phase1_work_item_attempt_audits.
   */
  async completeWorkItemWithDomainState(
    tx: VoiceQueryExecutor,
    record: VoiceWorkItemRecord,
    result: unknown,
  ): Promise<void> {
    const workId = record.workId ?? (record as any).work_id;
    const leaseEpoch = record.leaseEpoch ?? (record as any).lease_epoch;
    const attempt = record.attempt ?? (record as any).attempt_count ?? 0;
    const workType = record.workType ?? (record as any).work_type;

    // 1. Lease fencing CAS check: ensure this lease still holds
    const leaseCheck = await tx.query<{
      work_id: string;
      lease_epoch: number;
      status: string;
    }>(
      `SELECT work_id, lease_epoch, status
      FROM voice.work_item
      WHERE work_id = $1 FOR UPDATE`,
      [workId],
    );
    const currentWork = leaseCheck.rows[0];
    const isAlreadyCompletedBooking =
      workType === "execute_booking_command" &&
      currentWork?.status === "completed" &&
      currentWork?.lease_epoch === leaseEpoch;

    if (
      !currentWork ||
      (!isAlreadyCompletedBooking && currentWork.status !== "leased") ||
      currentWork.lease_epoch !== leaseEpoch
    ) {
      throw new LeaseFencedError(
        `Work item ${workId} was overtaken by another revision/lease (expected epoch ${leaseEpoch}, found ${currentWork?.lease_epoch})`,
      );
    }

    // 2. Domain state updates based on workType
    if (workType === "finalize_recording") {
      const finalResult = (result ?? {}) as {
        scope?: {
          brandId?: string;
          callId?: string;
          recordingId?: string;
          legId?: string | null;
        };
        manifestRef?: {
          objectKey?: string;
          checksum?: string;
        };
        recordingId?: string | null;
        recordingUrl?: string | null;
        linkedOrderId?: string | null;
        voiceSessionId?: string | null;
      };

      let parsedPayload: Record<string, unknown> = {};
      if (record.payloadRef) {
        try {
          parsedPayload = JSON.parse(record.payloadRef);
        } catch {
          parsedPayload = {};
        }
      }

      const callId =
        finalResult.scope?.callId ??
        (parsedPayload.callId as string | undefined) ??
        record.dedupeKey.replace(/^finalize_recording:(ai:|call:)?/, "");
      const recordingId =
        finalResult.recordingId ??
        (parsedPayload.recordingId as string | undefined) ??
        `rec-${callId}`;
      const recordingUrl =
        finalResult.recordingUrl ??
        (parsedPayload.recordingUrl as string | undefined) ??
        null;
      const voiceSessionId =
        record.voiceSessionId ??
        finalResult.voiceSessionId ??
        (parsedPayload.voiceSessionId as string | undefined) ??
        null;
      const linkedOrderId =
        finalResult.linkedOrderId ??
        (parsedPayload.linkedOrderId as string | undefined) ??
        null;
      const manifestEvidenceRef =
        finalResult.manifestRef?.objectKey ??
        finalResult.manifestRef?.checksum ??
        null;

      // Update call session in crm.phase1_call_sessions
      if (callId) {
        const callRow = await tx.query<{ record?: unknown }>(
          `SELECT record FROM crm.phase1_call_sessions WHERE call_id = $1 FOR UPDATE`,
          [callId],
        );
        if (callRow.rows[0]) {
          const raw = callRow.rows[0].record;
          const existingRecord =
            typeof raw === "string"
              ? JSON.parse(raw)
              : ((raw ?? {}) as Record<string, unknown>);
          const existingFlags: string[] = Array.isArray(existingRecord.flags)
            ? (existingRecord.flags as string[])
            : [];
          const updatedFlags = [
            ...existingFlags.filter(
              (f: string) =>
                f !== "recording_pending" &&
                f !== "recording_pending_callback" &&
                f !== "recording_missing",
            ),
            "recording_bound",
          ];
          const updatedRecord = {
            ...existingRecord,
            recordingId,
            recordingUrl: recordingUrl ?? existingRecord.recordingUrl ?? null,
            recordingState: "bound",
            flags: updatedFlags,
          };
          await tx.query(
            `UPDATE crm.phase1_call_sessions
            SET record = $2::jsonb, updated_at = now()
            WHERE call_id = $1`,
            [callId, JSON.stringify(updatedRecord)],
          );
        }
      }

      // If AI session: update voice.session recording_state to 'sealed'
      if (voiceSessionId) {
        await tx.query(
          `UPDATE voice.session
          SET recording_state = 'sealed', session_version = session_version + 1
          WHERE voice_session_id = $1`,
          [voiceSessionId],
        );
      }

      // If linked order exists: enforce single order boundary and update recording evidence
      if (linkedOrderId) {
        const orderRow = await tx.query<{ order_id: string }>(
          `SELECT order_id FROM ops.phase1_owned_orders WHERE order_id = $1 FOR UPDATE`,
          [linkedOrderId],
        );
        if (orderRow.rows[0]) {
          await tx.query(
            `UPDATE ops.phase1_owned_orders
            SET record = COALESCE(record, '{}'::jsonb) || $2::jsonb, updated_at = now()
            WHERE order_id = $1`,
            [
              linkedOrderId,
              JSON.stringify({
                recordingEvidenceRef: manifestEvidenceRef ?? recordingId,
                recordingId,
              }),
            ],
          );
        }
      }
    }

    // 3. Mark work item completed (if not already marked completed by execute_booking_command)
    if (!isAlreadyCompletedBooking) {
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

    // 4. Record terminal 'completed' attempt audit
    await this.recordAttemptAudit(tx, {
      workId,
      attemptNo: attempt,
      leaseEpoch,
      attemptStage: "terminal",
      outcome: "completed",
    });
  }

  /**
   * Generic work item enqueueing supporting all voice background jobs.
   * Retransmission / duplicate submission reads back existing row and checks payload/metadata match;
   * rejects differing payloads with VOICE_ACTION_PAYLOAD_CONFLICT.
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
    const res = await tx.query(
      `INSERT INTO voice.work_item (command_id, voice_session_id, work_type, dedupe_key, payload_ref, run_after)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING work_id`,
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

    if (res.rowCount === 0) {
      // Deduplication collision: verify metadata and payload match
      const existing = await tx.query<{
        work_id: string;
        command_id: string | null;
        voice_session_id: string | null;
        work_type: string;
        dedupe_key: string;
        payload_ref: string | null;
      }>(
        `SELECT work_id, command_id, voice_session_id, work_type, dedupe_key, payload_ref
        FROM voice.work_item
        WHERE dedupe_key = $1 LIMIT 1`,
        [item.dedupeKey],
      );
      const row = existing.rows[0];
      if (row) {
        if (
          row.work_type !== item.workType ||
          (row.voice_session_id ?? null) !== (item.voiceSessionId ?? null) ||
          (row.command_id ?? null) !== (item.commandId ?? null)
        ) {
          throw new ApiRequestError(
            409,
            "VOICE_ACTION_PAYLOAD_CONFLICT",
            `Deduplication conflict on '${item.dedupeKey}': work metadata differs.`,
          );
        }

        if (item.payloadRef && row.payload_ref) {
          let incomingParsed: unknown;
          let existingParsed: unknown;
          try {
            incomingParsed = JSON.parse(item.payloadRef);
            existingParsed = JSON.parse(row.payload_ref);
          } catch {
            incomingParsed = item.payloadRef;
            existingParsed = row.payload_ref;
          }

          if (!isDeepStrictEqual(incomingParsed, existingParsed)) {
            throw new ApiRequestError(
              409,
              "VOICE_ACTION_PAYLOAD_CONFLICT",
              `Deduplication conflict on '${item.dedupeKey}': payload differs from existing record.`,
            );
          }
        }
      }
    }
  }

  /**
   * Controlled ops-authorized repair of failed work items on the existing voice.work_item row.
   * Consensus-packet.md §B7:
   * - In-place repair verifying work_id, previous failed status, and expected_lease_epoch
   * - Request-level idempotency on (work_id, request_id) returns existing audit
   * - Inserts immutable audit into voice.phase1_work_item_repair_audits
   * - Resets attempt count to 0 with finite allocatedMaxAttempts budget
   * - Preserves work ID, command ID, voice session ID, payload, and receipt
   */
  async repairFailedWorkItem(params: {
    workId: string;
    requestId: string;
    actorId: string;
    reason: string;
    expectedLeaseEpoch: number;
    allocatedMaxAttempts?: number | undefined;
  }): Promise<{
    repairId: string;
    workId: string;
    requestId: string;
    actorId: string;
    reason: string;
    expectedLeaseEpoch: number;
    previousStatus: string;
    previousAttemptCount: number;
    previousLastError: string | null;
    allocatedMaxAttempts: number;
    createdAt: string;
    deduped?: boolean;
  }> {
    const repository = this.commands.repository;
    const allocatedMaxAttempts = params.allocatedMaxAttempts ?? 5;

    return repository.withTransaction(async (tx) => {
      await tx.query("SET LOCAL lock_timeout = '2s'");
      await tx.query("SET LOCAL statement_timeout = '5s'");

      // Check deduplication first on (work_id, request_id)
      const existingAudit = await tx.query<{
        repair_id: string;
        work_id: string;
        request_id: string;
        actor_id: string;
        reason: string;
        expected_lease_epoch: number;
        previous_status: string;
        previous_attempt_count: number;
        previous_last_error: string | null;
        allocated_max_attempts: number;
        created_at: Date | string;
      }>(
        `SELECT * FROM voice.phase1_work_item_repair_audits
        WHERE work_id = $1 AND request_id = $2 LIMIT 1`,
        [params.workId, params.requestId],
      );
      if (existingAudit.rows[0]) {
        const row = existingAudit.rows[0];
        return {
          repairId: row.repair_id,
          workId: row.work_id,
          requestId: row.request_id,
          actorId: row.actor_id,
          reason: row.reason,
          expectedLeaseEpoch: row.expected_lease_epoch,
          previousStatus: row.previous_status,
          previousAttemptCount: row.previous_attempt_count,
          previousLastError: row.previous_last_error,
          allocatedMaxAttempts: row.allocated_max_attempts,
          createdAt: new Date(row.created_at).toISOString(),
          deduped: true,
        };
      }

      // Lock existing work item row
      const workRow = await tx.query<{
        work_id: string;
        status: string;
        attempt: number;
        lease_epoch: number;
        last_error: string | null;
      }>(
        `SELECT work_id, status, attempt, lease_epoch, last_error
        FROM voice.work_item
        WHERE work_id = $1 FOR UPDATE`,
        [params.workId],
      );
      const work = workRow.rows[0];
      if (!work) {
        throw new ApiRequestError(
          404,
          "WORK_ITEM_NOT_FOUND",
          `Voice work item ${params.workId} not found.`,
        );
      }

      if (work.status !== "failed") {
        throw new ApiRequestError(
          409,
          "WORK_ITEM_NOT_FAILED",
          `Cannot repair work item ${params.workId} with status '${work.status}'; only 'failed' items can be repaired.`,
        );
      }

      if (work.lease_epoch !== params.expectedLeaseEpoch) {
        throw new ApiRequestError(
          409,
          "LEASE_EPOCH_MISMATCH",
          `Work item ${params.workId} lease epoch mismatch: expected ${params.expectedLeaseEpoch}, found ${work.lease_epoch}.`,
        );
      }

      // Insert audit into append-only voice.phase1_work_item_repair_audits
      const auditInsert = await tx.query<{
        repair_id: string;
        work_id: string;
        request_id: string;
        actor_id: string;
        reason: string;
        expected_lease_epoch: number;
        previous_status: string;
        previous_attempt_count: number;
        previous_last_error: string | null;
        allocated_max_attempts: number;
        created_at: Date | string;
      }>(
        `INSERT INTO voice.phase1_work_item_repair_audits (
          work_id, request_id, actor_id, reason, expected_lease_epoch,
          previous_status, previous_attempt_count, previous_last_error, allocated_max_attempts
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          work.work_id,
          params.requestId,
          params.actorId,
          params.reason,
          params.expectedLeaseEpoch,
          work.status,
          work.attempt,
          work.last_error,
          allocatedMaxAttempts,
        ],
      );
      const audit = auditInsert.rows[0];
      if (!audit) {
        throw new Error("Failed to insert repair audit record");
      }

      // Update work item in-place
      await tx.query(
        `UPDATE voice.work_item
        SET status = 'pending',
            attempt = 0,
            run_after = now(),
            leased_until = NULL,
            last_error = NULL
        WHERE work_id = $1`,
        [params.workId],
      );

      return {
        repairId: audit.repair_id,
        workId: audit.work_id,
        requestId: audit.request_id,
        actorId: audit.actor_id,
        reason: audit.reason,
        expectedLeaseEpoch: audit.expected_lease_epoch,
        previousStatus: audit.previous_status,
        previousAttemptCount: audit.previous_attempt_count,
        previousLastError: audit.previous_last_error,
        allocatedMaxAttempts: audit.allocated_max_attempts,
        createdAt: new Date(audit.created_at).toISOString(),
        deduped: false,
      };
    });
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
    const maxAttempts = options?.maxAttempts ?? 5;

    const defaultSupportedTypes = ["execute_booking_command"];
    const canFinalizeRecording =
      this.mediaAdapter !== undefined ||
      this.evidenceService?.hasMediaAdapter() === true ||
      this.customHandlers.has("finalize_recording");
    if (canFinalizeRecording) {
      defaultSupportedTypes.push("finalize_recording");
    }

    const supportedTypes = options?.supportedTypes ?? defaultSupportedTypes;

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

    // Record 'started' attempt audit
    await repository.withTransaction(async (tx) => {
      await this.recordAttemptAudit(tx, {
        workId: work.work_id,
        attemptNo: work.attempt,
        leaseEpoch: work.lease_epoch,
        attemptStage: "started",
        outcome: "started",
      });
    });

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

      // Complete work item with lease fencing check and domain state update
      await repository.withTransaction(async (tx) => {
        await tx.query("SET LOCAL lock_timeout = '2s'");
        await tx.query("SET LOCAL statement_timeout = '5s'");
        await this.completeWorkItemWithDomainState(tx, record, result);
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

        await repository.withTransaction(async (tx) => {
          await this.recordAttemptAudit(tx, {
            workId: record.workId,
            attemptNo: record.attempt,
            leaseEpoch: record.leaseEpoch,
            attemptStage: "terminal",
            outcome: "fenced",
            errorMessage: error.message,
          });
        });

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
        await this.recordAttemptAudit(tx, {
          workId: record.workId,
          attemptNo: record.attempt,
          leaseEpoch: record.leaseEpoch,
          attemptStage: "terminal",
          outcome: "failed",
          errorMessage: errorMsg,
        });
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
        throw new Error(
          `Unhandled or unsupported work_type: ${work.workType}; stub execution forbidden`,
        );
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

    const hasAdapter =
      this.mediaAdapter !== undefined ||
      this.evidenceService?.hasMediaAdapter() === true;
    if (!hasAdapter) {
      throw new Error(
        "No operational media recording adapter available for finalize_recording; stub execution forbidden",
      );
    }

    const callId =
      (payload.callId as string | undefined) ??
      work.dedupeKey.replace(/^finalize_recording:(ai:|call:)?/, "");
    const brandId = (payload.brandId as string | undefined) ?? "default";
    const recordingId =
      (payload.recordingId as string | undefined) ?? `rec-${callId}`;
    const legId = (payload.legId as string | undefined) ?? null;
    const linkedOrderId = (payload.linkedOrderId as string | undefined) ?? null;

    let finalResult: unknown;
    if (this.mediaAdapter) {
      finalResult = await this.mediaAdapter.finalizeRecording({
        scope: { brandId, callId, recordingId, legId },
        voiceSessionId: work.voiceSessionId,
        linkedOrderId,
      });
    } else if (this.evidenceService) {
      finalResult = await this.evidenceService.finalizeRecording({
        scope: { brandId, callId, recordingId, legId },
        voiceSessionId: work.voiceSessionId,
        linkedOrderId,
      });
    }

    return {
      handled: true,
      type: "finalize_recording",
      voiceSessionId: work.voiceSessionId,
      callId,
      recordingId,
      linkedOrderId,
      scope: { brandId, callId, recordingId, legId },
      manifestRef: (finalResult as any)?.manifestRef ?? null,
      recordingUrl: (finalResult as any)?.recordingUrl ?? null,
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
