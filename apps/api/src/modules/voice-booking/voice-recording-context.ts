import type { VoiceQueryExecutor } from "./voice-booking.repository";

export async function readVoiceRecordingContext(
  tx: VoiceQueryExecutor,
  voiceSessionId: string,
) {
  const result = await tx.query<{
    call_id: string;
    brand_id: string;
    bound_order_id: string | null;
  }>(
    `SELECT s.call_id, scope.brand_id, i.bound_order_id
     FROM voice.session s
     JOIN voice.resource_scope scope ON scope.scope_id = s.resource_scope_id
     LEFT JOIN voice.intent i ON i.voice_session_id = s.voice_session_id
       AND i.action = 'create_owned_order'
     WHERE s.voice_session_id = $1`,
    [voiceSessionId],
  );
  const row = result.rows[0];
  return row
    ? {
        callId: row.call_id,
        brandId: row.brand_id,
        linkedOrderId: row.bound_order_id,
      }
    : null;
}

export async function readFinalizedCallRecording(
  tx: VoiceQueryExecutor,
  callId: string,
) {
  const result = await tx.query<{ record: Record<string, unknown> }>(
    "SELECT record FROM crm.phase1_call_sessions WHERE call_id = $1",
    [callId],
  );
  const record = result.rows[0]?.record;
  return record?.recordingState === "bound" &&
    typeof record.recordingId === "string" &&
    typeof record.recordingEvidenceRef === "string"
    ? {
        recordingId: record.recordingId,
        recordingEvidenceRef: record.recordingEvidenceRef,
      }
    : null;
}
