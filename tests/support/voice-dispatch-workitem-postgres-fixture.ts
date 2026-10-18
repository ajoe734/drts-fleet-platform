import { randomUUID } from "node:crypto";
import type {
  VoiceBookingRepository,
  VoiceQueryExecutor,
} from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import type { CommitVoiceBooking } from "../../apps/api/src/modules/voice-booking/voice-booking-command.service";
import { voiceSnapshotHash } from "../../apps/api/src/modules/voice-booking/voice-confirmation.service";
import { voiceCommandFixture } from "./voice-booking-command-fixture";

// Retain the original voice transaction fixture, on the hosted full-schema
// harness. Only provider/evidence/access prerequisite ports are synthetic.
// Booking acceptance, order commit, queue, dispatch and tasks stay real.
interface FixtureOptions {
  existingCallId?: string;
  draftVersion?: number;
  confirmationState?: string;
  action?: string;
  overrideSnapshot?: Record<string, unknown>;
}

export async function seedVoiceDispatchWorkFixture(
  pool: VoiceQueryExecutor,
  opts: FixtureOptions = {},
) {
  const original = voiceCommandFixture();
  const f = { ...original, callId: opts.existingCallId ?? original.callId };
  const lineId = randomUUID();
  const profileId = randomUUID();
  const eventId = randomUUID();
  const draftVersion = opts.draftVersion ?? 1;
  const confirmationState = opts.confirmationState ?? "accepted";
  const action = opts.action ?? "create_owned_order";
  const snapshot = (opts.overrideSnapshot as any) ?? f.snapshot;
  const snapshotHash = voiceSnapshotHash(snapshot);

  if (opts.existingCallId) {
    const existing = await pool.query(
      "SELECT call_id FROM crm.phase1_call_sessions WHERE call_id=$1",
      [f.callId],
    );
    if (existing.rows.length !== 1)
      throw new Error("The original API-created call must exist.");
  } else {
    await pool.query(
      "INSERT INTO crm.phase1_call_sessions (call_id,status,started_at,updated_at,record) VALUES ($1,'active',now(),now(),$2::jsonb)",
      [f.callId, JSON.stringify({ callId: f.callId })],
    );
  }

  await pool.query(
    `INSERT INTO voice.resource_scope (scope_id,brand_id,granted_by,runtime_mapping)
       VALUES ($1,$2,'test',$3::jsonb)`,
    [
      f.scopeId,
      f.authority.brandId,
      JSON.stringify({
        runtimeProfileCode: "ordinary_taxi",
        serviceProductCode: "taxi_realtime",
      }),
    ],
  );

  await pool.query(
    `INSERT INTO voice.line_binding (line_binding_id,provider_account_id,dnis,brand_id,operating_profile_id)
       VALUES ($1,$2,$3,$4,'test')`,
    [lineId, f.authority.providerAccountId, f.callId, f.authority.brandId],
  );

  await pool.query(
    "INSERT INTO voice.route_profile (profile_id,version,models,languages) VALUES ($1,1,'{}','[]')",
    [profileId],
  );

  await pool.query(
    `INSERT INTO voice.session (
        voice_session_id,call_id,provider_account_id,provider_call_id,resource_scope_id,
        line_binding_id,route_profile_id,route_profile_version,dialog_state,media_state,
        lease_epoch,confirmation_state,last_applied_control_sequence
       ) VALUES ($1,$2,$3,$2,$4,$5,$6,1,'confirming','active',1,$7,1)`,
    [
      f.request.voiceSessionId,
      f.callId,
      f.authority.providerAccountId,
      f.scopeId,
      lineId,
      profileId,
      confirmationState,
    ],
  );

  await pool.query(
    "INSERT INTO voice.intent (intent_id,voice_session_id,current_draft_version,action) VALUES ($1,$2,$3,$4)",
    [f.request.intentId, f.request.voiceSessionId, draftVersion, action],
  );

  await pool.query(
    `INSERT INTO voice.draft_revision (intent_id,draft_version,slots,canonical_snapshot,snapshot_hash)
       VALUES ($1,$2,'{}',$3::jsonb,$4)`,
    [f.request.intentId, draftVersion, JSON.stringify(snapshot), snapshotHash],
  );

  await pool.query(
    `INSERT INTO voice.session_event (
        event_id,voice_session_id,source,provider_account_id,source_event_id,
        occurred_at,sequence,lease_epoch,event_type,payload
       ) VALUES ($1,$2,'test',$3,$4,now(),1,1,'dtmf','{}')`,
    [eventId, f.request.voiceSessionId, f.authority.providerAccountId, eventId],
  );

  await pool.query(
    `INSERT INTO voice.recording_checkpoint (
        checkpoint_id,call_id,recording_id,manifest_version,manifest,
        manifest_hash,coverage,policy_version,verified_at
       ) VALUES ($1,$2,$2,1,'{}','manifest-hash',$3::jsonb,'policy',now())`,
    [
      f.checkpointId,
      f.callId,
      JSON.stringify({
        snapshotHash,
        readbackPlaybackId: f.playbackId,
      }),
    ],
  );

  await pool.query(
    `INSERT INTO voice.confirmation (
        confirmation_id,voice_session_id,intent_id,draft_version,action,confirmation_method,
        snapshot_hash,readback_playback_id,readback_completed_event_id,input_epoch,media_epoch,
        control_sequence,lease_epoch,recording_checkpoint_id,evidence,state,confirmed_at,expires_at
       ) VALUES ($1,$2,$3,$4,$5,'dtmf',$6,$7,$8,0,0,1,1,$9,'{}',$10,now(),$11)`,
    [
      f.request.confirmationId,
      f.request.voiceSessionId,
      f.request.intentId,
      draftVersion,
      action,
      snapshotHash,
      f.playbackId,
      eventId,
      f.checkpointId,
      confirmationState,
      f.expiry,
    ],
  );

  const access = {
    authorizeRead: async () => f.authority,
    authorizeAccept: async () => f.authority,
    credentialForCommand: async () => "command-scoped-test-credential",
  };

  const makeEvidence = (repo: VoiceBookingRepository) => ({
    requireCheckpoint: async () =>
      repo.findRecordingCheckpointById(f.checkpointId),
  });

  const products = {
    getRuntimeServiceProductByType: () => ({
      active: true,
      timing: "realtime",
      updatedAt: "product-v1",
    }),
    assertRuntimeProfileServiceProductActive: () => ({
      updatedAt: "policy-v1",
    }),
  };

  const areas = {
    evaluate: () => f.snapshot.bookingQualification.serviceArea,
  };

  const request: CommitVoiceBooking = {
    ...f.request,
    draftVersion,
    snapshotHash,
  };

  return {
    ...f,
    request,
    access,
    makeEvidence,
    products,
    areas,
    lineId,
    profileId,
    eventId,
  };
}
