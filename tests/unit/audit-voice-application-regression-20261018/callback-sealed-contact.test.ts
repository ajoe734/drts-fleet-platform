import { VoiceBookingController as CurrentController } from "../../../apps/api/src/modules/voice-booking/voice-booking.controller";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { VoiceContactService } from "../../../apps/api/src/modules/voice-booking/voice-contact.service";
import { callbackTransport as transport } from "./callback-transport";
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

const Controller = process.env.VOICE_ORIGINAL_REF
  ? sourceModuleLoader({}, [
      "apps/api/src/modules/voice-booking/voice-booking.controller.ts",
    ])<{ VoiceBookingController: typeof CurrentController }>(
      resolve("apps/api/src/modules/voice-booking/voice-booking.controller.ts"),
    ).VoiceBookingController
  : CurrentController;

// SQL transport double only. All role encryption, revision resolution, create
// receipts, immutable binding and DTO projection run through production classes.
// Hosted formal-schema tests, not this harness, prove SQL transactions/races.
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

it("F4 getSession producer seeds immutable caller/contact roles from durable CRM ANI, then actual ops correction persists a distinct passenger", async () => {
  const { repo, contacts, revisions } = transport();
  const controller = new Controller(
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    { getSession: async () => ({ voiceSessionId: "session-1" }) } as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    contacts,
    repo,
  );
  await controller.getSession("session-1");
  expect(revisions).toHaveLength(5);
  await controller.writeContacts("session-1", {
    role: "passenger",
    name: "B",
    phone: "0922000222",
    reason: "A books for B",
  });
  const cold = await new VoiceContactService(repo).getEffectiveContactsDurable(
    "session-1",
  );
  expect(cold).toMatchObject({
    assertedCallerPhone: "0911000111",
    passengerContact: { name: "B", phone: "0922000222" },
    driverContact: { name: "B", phone: "0922000222" },
    callbackRecipient: { phone: "0911000111" },
  });
});
