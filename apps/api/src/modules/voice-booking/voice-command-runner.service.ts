import { Injectable } from "@nestjs/common";
import { isDeepStrictEqual } from "node:util";
import { ApiRequestError } from "../../common/api-envelope";
import { OwnedMobilityRepository } from "../owned-mobility/owned-mobility.repository";
import { prepareVoiceOrder } from "../owned-mobility/voice-order-preparation";
import {
  VoiceBookingCommandService, VoiceBookingRejection, lockVoiceCommand,
  type VoiceBookingCommandProof,
} from "./voice-booking-command.service";

/** Trusted in-process executor; never expose execute(commandId) as an
 * unauthenticated controller. Scheduling is at-least-once; receipt locks and
 * order uniqueness arbitrate even if a worker outlives its scheduling lease. */
@Injectable()
export class VoiceCommandRunnerService {
  constructor(
    private readonly commands: VoiceBookingCommandService,
    private readonly orders: OwnedMobilityRepository,
  ) {}

  async execute(commandId: string) {
    const repository = this.commands.repository;
    const receipt = await repository.findReceiptById(commandId);
    if (!receipt) throw new Error("Voice command not found");
    if (receipt.status !== "pending") return receipt;
    // Immutable proof loads do not require session liveness. No expired worker
    // token is persisted or reused after hangup, handoff or a process restart.
    const proof = await repository.withTransaction(async tx => {
      await tx.query("SET LOCAL statement_timeout = '5s'");
      const row = await tx.query<{ proof: VoiceBookingCommandProof }>(
        "SELECT proof FROM voice.booking_command_proof WHERE command_id = $1", [commandId]);
      if (!row.rows[0]) throw new Error("Accepted command proof missing");
      return row.rows[0].proof;
    });
    if (!this.commands.access) throw new Error("Command executor authority unavailable");
    const credential = await this.commands.access.credentialForCommand(commandId, proof);
    const checkpoint = await this.commands.evidence.requireCheckpoint(credential, proof.callId, proof.checkpoint.checkpointId);
    if (!isDeepStrictEqual(checkpoint, proof.checkpoint)) throw new Error("Command checkpoint changed");

    return repository.withTransaction(async tx => {
      const locked = await lockVoiceCommand(repository, tx, proof.request.voiceSessionId, receipt.intentId);
      const current = await repository.findReceiptById(commandId, tx);
      if (!current) throw new Error("Command disappeared");
      if (current.status !== "pending") return current;
      this.commands.replay(current, proof.request);
      if (current.brandId !== proof.authority.brandId || current.callId !== proof.callId ||
        current.intentId !== proof.request.intentId || current.action !== "create_owned_order")
        throw new Error("Command proof scope mismatch");
      // An inconsistent pre-existing order is unknown, never evidence of a
      // definite business rejection. Do not create, overwrite or delete it.
      const bound = await tx.query(`SELECT order_id FROM ops.phase1_owned_orders
        WHERE voice_intent_id = $1 OR call_id = $2 FOR UPDATE`, [current.intentId, current.callId]);
      if (bound.rows.length || locked.intent.boundOrderId || current.orderId)
        throw new Error("Pending command has an order; manual reconciliation required");
      let snapshot;
      try {
        snapshot = await this.commands.validate(locked, proof, true);
      } catch (error) {
        // Only known domain failures, after verifying absence of an order.
        // DB errors, provider failures and unresolved input leave pending.
        const domainFailure = error instanceof VoiceBookingRejection ||
          (error instanceof ApiRequestError && [
            "VOICE_CONFIRMATION_REQUIRED", "VOICE_SERVICE_AREA_REVIEW_REQUIRED",
            "BOOKING_REQUIREMENTS_INVALID", "RUNTIME_PROFILE_SERVICE_PRODUCT_INACTIVE",
          ].includes(error.code));
        if (!domainFailure || !(error instanceof ApiRequestError)) throw error;
        await tx.query(`UPDATE voice.command_receipt SET status = 'rejected',
          error_code = $2, error_reason = 'Accepted booking prerequisites no longer hold',
          result_version = result_version + 1 WHERE command_id = $1`, [commandId, error.code]);
        await tx.query("UPDATE voice.session SET commit_status = 'rejected', session_version = session_version + 1 WHERE voice_session_id = $1", [locked.session.voiceSessionId]);
        await tx.query("UPDATE voice.intent SET status = 'rejected' WHERE intent_id = $1", [current.intentId]);
        await this.commands.enqueue(tx, commandId, locked.session.voiceSessionId, "notify_booking_result");
        await this.complete(tx, commandId);
        return (await repository.findReceiptById(commandId, tx))!;
      }
      const order = prepareVoiceOrder({
        commandId, callId: current.callId, intentId: current.intentId,
        resourceScopeId: proof.authority.resourceScopeId,
        confirmationId: proof.request.confirmationId,
        recordingId: checkpoint.recordingId!, checkpointId: checkpoint.checkpointId,
        actorId: proof.authority.actorId, snapshotHash: proof.request.snapshotHash, snapshot,
      });
      await this.orders.insertVoiceOrder(tx, order);
      // Patch the DB's current JSON; never replace it from a shared cache.
      const call = await tx.query(`UPDATE crm.phase1_call_sessions
        SET record = record || $2::jsonb, updated_at = now()
        WHERE call_id = $1 AND (linked_order_id IS NULL OR linked_order_id = $3)
        RETURNING call_id`, [current.callId, JSON.stringify({
          linkedOrderId: order.orderId, voiceSessionId: locked.session.voiceSessionId,
          sourceChannel: "voice_agent", customerConfirmationId: proof.request.confirmationId,
          recordingEvidenceRef: checkpoint.checkpointId,
        }), order.orderId]);
      if (call.rowCount !== 1) throw new Error("Call link unavailable or already bound");
      await tx.query("UPDATE voice.confirmation SET state = 'consumed', consumed_command_id = $2 WHERE confirmation_id = $1", [proof.request.confirmationId, commandId]);
      await tx.query("UPDATE voice.intent SET status = 'committed', bound_order_id = $2 WHERE intent_id = $1", [current.intentId, order.orderId]);
      await tx.query(`UPDATE voice.command_receipt SET status = 'succeeded', order_id = $2,
        result_version = result_version + 1 WHERE command_id = $1`, [commandId, order.orderId]);
      await tx.query(`UPDATE voice.session SET commit_status = 'succeeded', confirmation_state = 'consumed',
        outcome = 'auto_booking_created', session_version = session_version + 1,
        dialog_state = CASE WHEN dialog_state IN ('committing','reconciling') THEN 'awaiting_dispatch' ELSE dialog_state END
        WHERE voice_session_id = $1`, [locked.session.voiceSessionId]);
      await tx.query("INSERT INTO voice.booking_audit_intent (command_id, order_id, record) VALUES ($1,$2,$3::jsonb)",
        [commandId, order.orderId, JSON.stringify({ action: "voice.booking.created", actorType: "voice_agent",
          actorId: proof.authority.actorId, brandId: current.brandId, resourceScopeId: proof.authority.resourceScopeId,
          callId: current.callId, intentId: current.intentId, confirmationId: proof.request.confirmationId,
          snapshotHash: proof.request.snapshotHash, checkpointId: checkpoint.checkpointId })]);
      for (const type of ["dispatch_owned_order", "notify_booking_result", "publish_booking_audit"])
        await this.commands.enqueue(tx, commandId, locked.session.voiceSessionId, type);
      await this.complete(tx, commandId);
      return (await repository.findReceiptById(commandId, tx))!;
    });
  }

  private async complete(tx: import("./voice-booking.repository").VoiceQueryExecutor, commandId: string) {
    await tx.query("UPDATE voice.work_item SET status = 'completed', leased_until = NULL WHERE command_id = $1 AND work_type = 'execute_booking_command'", [commandId]);
  }

  /** Call from the durable API worker loop. A crash before/after COMMIT or a
   * lost response is recovered using this same command, including closed calls. */
  async runOnce() {
    const repository = this.commands.repository;
    const work = await repository.withTransaction(async tx => {
      await tx.query("SET LOCAL lock_timeout = '2s'");
      await tx.query("SET LOCAL statement_timeout = '5s'");
      const rows = await tx.query<{ work_id: string; command_id: string; lease_epoch: number }>(`
        WITH candidate AS (
          SELECT work_id FROM voice.work_item WHERE work_type = 'execute_booking_command'
          AND ((status = 'pending' AND run_after <= now()) OR (status = 'leased' AND leased_until < now()))
          ORDER BY run_after, work_id FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE voice.work_item w SET status = 'leased', attempt = attempt + 1,
          lease_epoch = lease_epoch + 1, leased_until = now() + interval '30 seconds'
          FROM candidate c WHERE w.work_id = c.work_id RETURNING w.work_id, w.command_id, w.lease_epoch`);
      return rows.rows[0];
    });
    if (!work) return null;
    try {
      return await this.execute(work.command_id);
    } catch (error) {
      await repository.withTransaction(async tx => {
        await tx.query("SET LOCAL lock_timeout = '2s'");
        await tx.query("SET LOCAL statement_timeout = '5s'");
        await tx.query(`UPDATE voice.work_item SET status = 'pending', leased_until = NULL,
          run_after = now() + interval '1 second', last_error = 'command requires retry or reconciliation'
          WHERE work_id = $1 AND status = 'leased' AND lease_epoch = $2`, [work.work_id, work.lease_epoch]);
      });
      throw error;
    }
  }
}
