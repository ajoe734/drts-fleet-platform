import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { VoiceContactService } from "../../../apps/api/src/modules/voice-booking/voice-contact.service";
import { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import { VoiceCallbackService as CurrentCallbacks } from "../../../apps/api/src/modules/voice-booking/voice-callback.service";
import { sourceModuleLoader } from "./source-module-loader";
import { resolve } from "node:path";
const Callbacks = process.env.VOICE_ORIGINAL_REF
  ? sourceModuleLoader({}, [
      "apps/api/src/modules/voice-booking/voice-callback.service.ts",
    ])<{ VoiceCallbackService: typeof CurrentCallbacks }>(
      resolve("apps/api/src/modules/voice-booking/voice-callback.service.ts"),
    ).VoiceCallbackService
  : CurrentCallbacks;

// SQL transport double only. All role encryption, revision resolution, create
// receipts, immutable binding and DTO projection run through production classes.
// Hosted formal-schema tests, not this harness, prove SQL transactions/races.
function transport() {
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
          task_id: `task-${tasks.length + 1}`,
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
beforeEach(() => {
  process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
  process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
});
afterEach(() => {
  delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
  delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
});
const input = {
  voiceSessionId: "session-1",
  actionKey: "create-1",
  resourceScopeId: "scope-1",
  contactPhoneEncrypted: "untrusted-body-cipher",
  contactPhoneLookupToken: "body-token",
  consentSnapshotHash: "body-hash",
  contactRevisionNumber: 2,
  consentRef: "consent-A",
};
it("F5/F8: create binds server phone/consent; old task and receipt stay on A after correction and cold restart", async () => {
  const { db, repo, contacts, tasks } = transport();
  await contacts.initializeContacts({
    voiceSessionId: "session-1",
    callerPhone: "0911000111",
    bookerName: "A",
    consentRef: "consent-A",
  });
  const service = new Callbacks(repo, db as never, contacts);
  const created = await service.createCallbackDurable(input);
  expect(created.task).toMatchObject({
    contactPhone: "0911000111",
    contactRole: "booker",
    contactName: "A",
    consentRef: "consent-A",
    contactRevisionNumber: 2,
  });
  expect(tasks[0]?.contact_phone_encrypted).not.toBe(
    input.contactPhoneEncrypted,
  );
  expect(tasks[0]?.consent_snapshot_hash).not.toBe(input.consentSnapshotHash);
  await contacts.updateContactRole({
    voiceSessionId: "session-1",
    role: "callbackRecipient",
    phone: "0933000333",
    name: "C",
    consentRef: "consent-C",
    reason: "recipient correction",
  });
  const cold = new Callbacks(repo, db as never, new VoiceContactService(repo));
  const replay = await cold.createCallbackDurable(input);
  expect(replay.replayed).toBe(true);
  expect(replay.receipt).toEqual(created.receipt);
  expect(replay.task).toMatchObject({
    contactName: "A",
    contactPhone: "0911000111",
    consentRef: "consent-A",
    contactRevisionNumber: 2,
  });
});
it("F5: a stale selected revision cannot create a callback using a current recipient's different consent", async () => {
  const { db, repo, contacts } = transport();
  await contacts.initializeContacts({
    voiceSessionId: "session-1",
    callerPhone: "0911000111",
    consentRef: "consent-A",
  });
  await contacts.updateContactRole({
    voiceSessionId: "session-1",
    role: "callbackRecipient",
    phone: "0933000333",
    consentRef: "consent-C",
    reason: "changed",
  });
  await expect(
    new Callbacks(repo, db as never, contacts).createCallbackDurable(input),
  ).rejects.toMatchObject({ code: "CALLBACK_CONTACT_REVISION_CHANGED" });
});

it("F5: only a cancelled original and fresh consent can create a related replacement, while original receipt stays immutable", async () => {
  const { db, repo, contacts, tasks } = transport();
  await contacts.initializeContacts({
    voiceSessionId: "session-1",
    callerPhone: "0911000111",
    bookerName: "A",
    consentRef: "consent-A",
  });
  const service = new Callbacks(repo, db as never, contacts);
  const original = await service.createCallbackDurable(input);
  await contacts.updateContactRole({
    voiceSessionId: "session-1",
    role: "callbackRecipient",
    phone: "0933000333",
    name: "C",
    consentRef: "consent-C",
    reason: "replacement requested",
  });
  const replacement = {
    ...input,
    actionKey: "replacement-2",
    contactRevisionNumber: 6,
    consentRef: "consent-C",
    replacesTaskId: original.task.taskId,
  };
  await expect(
    service.createCallbackDurable(replacement),
  ).rejects.toMatchObject({
    code: "CALLBACK_REPLACEMENT_REQUIRES_NEW_CONSENT",
  });
  // Only the transport's observed original CAS result is modeled here; existing
  // action/terminal suites separately test the actual cancellation machinery.
  tasks[0]!.status = "cancelled";
  const created = await service.createCallbackDurable(replacement);
  expect(created.task).toMatchObject({
    contactName: "C",
    contactPhone: "0933000333",
    consentRef: "consent-C",
    replacesTaskId: original.task.taskId,
  });
  const replay = await service.getReceiptByActionKeyForRead(input.actionKey);
  expect(replay.receipt).toEqual(original.receipt);
  expect(replay.task).toMatchObject({
    contactName: "A",
    contactPhone: "0911000111",
    consentRef: "consent-A",
    replacementTaskId: created.task.taskId,
  });
  expect(replay.task?.contactHistory).toHaveLength(2);
});
