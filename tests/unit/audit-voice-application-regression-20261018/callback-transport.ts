import { VoiceContactService } from "../../../apps/api/src/modules/voice-booking/voice-contact.service";
import { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
export function callbackTransport() {
  const revisions: Record<string, unknown>[] = [],
    bindings: Record<string, unknown>[] = [],
    tasks: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  const db = {
    isEnabled: () => true,
    connect: async () => ({ query: db.query, release() {} }),
    query: async (
      sql: string,
      args: readonly unknown[] = [],
    ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
      let rows: Record<string, unknown>[] = [];
      if (sql.includes("SELECT c.record FROM crm.phase1_call_sessions"))
        return {
          rows: [{ record: { callerPhone: "0911000111" } }],
          rowCount: 1,
        };
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows, rowCount: 0 };
      if (sql.includes("INSERT INTO voice.contact_role_revision")) {
        const keys = [
          "voice_session_id",
          "role",
          "revision_number",
          "name",
          "phone_key_version",
          "phone_nonce",
          "phone_ciphertext",
          "phone_auth_tag",
          "consent_ref",
          "reason",
          "role_source",
          "replaced_revision",
          "retention_expires_at",
        ];
        const row = Object.fromEntries(keys.map((key, i) => [key, args[i]]));
        revisions.push({
          ...row,
          revision_id: `rev-${revisions.length}`,
          created_at: now,
        });
        rows = [revisions.at(-1)!];
      } else if (sql.includes("SELECT * FROM voice.contact_role_revision"))
        rows = revisions.filter((row) => row.voice_session_id === args[0]);
      else if (
        sql.includes("INSERT INTO voice.callback_task_contact_binding")
      ) {
        bindings.push({
          task_id: args[0],
          voice_session_id: args[1],
          revision_number: args[2],
          bind_reason: args[3],
          replaces_task_id: args[4] ?? null,
          bound_at: now,
        });
      } else if (sql.includes("FROM voice.callback_task_contact_binding")) {
        rows = sql.includes("WHERE task_id")
          ? bindings.filter((row) => row.task_id === args[0]).slice(-1)
          : bindings.filter((row) => row.voice_session_id === args[0]);
      } else if (sql.includes("INSERT INTO voice.callback_task")) {
        const keys = [
          "voice_session_id",
          "contact_phone_encrypted",
          "contact_phone_lookup_token",
          "consent_snapshot_hash",
          "reason",
          "resource_scope_id",
          "priority",
          "scheduled_at",
          "due_at",
          "create_command_id",
          "create_action_key",
          "create_payload_hash",
        ];
        tasks.push({
          ...Object.fromEntries(keys.map((key, i) => [key, args[i]])),
          task_id: `00000000-0000-4000-8000-${String(tasks.length + 1).padStart(12, "0")}`,
          status: "pending",
          version: 1,
          created_at: now,
          updated_at: now,
          owner_claim_lease: null,
        });
        rows = [tasks.at(-1)!];
      } else if (sql.includes("FROM voice.callback_task"))
        rows = tasks.filter((row) =>
          sql.includes("create_action_key =")
            ? row.create_action_key === args[0]
            : row.task_id === args[0],
        );
      else if (sql.includes("scope.brand_id"))
        rows = [
          { call_id: "call-1", brand_id: "brand-1", bound_order_id: null },
        ];
      else if (sql.includes("FROM voice.session WHERE"))
        rows = [
          { voice_session_id: args[0], created_at: now, updated_at: now },
        ];
      return { rows, rowCount: rows.length };
    },
  };
  const repo = new VoiceSessionRepository(db as never);
  const contacts = new VoiceContactService(repo);
  return { db, repo, contacts, revisions, tasks };
}
