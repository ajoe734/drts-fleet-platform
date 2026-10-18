import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

import { VoiceContactService } from "../../../apps/api/src/modules/voice-booking/voice-contact.service";
import type {
  ContactRoleRevisionRow,
  InsertContactRoleRevisionInput,
  VoiceQueryExecutor,
  VoiceSessionRepository,
} from "../../../apps/api/src/modules/voice-booking/voice-session.repository";

/**
 * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 Package C: `VoiceContactService`
 * was a process-local, RAM-only `Map` with no mounted caller or durable
 * persistence (see this task's UAT doc). V0122__voice_contact_role_revision.sql
 * plus this service's new durable code path close that gap. These tests
 * double `VoiceSessionRepository` with an in-memory "table" standing in for
 * Postgres -- real hosted-Postgres coverage for the migration itself is a
 * separate, HOSTED-only lane (tests/integration/unattended-voice-postgres.integration.test.ts),
 * not re-run here.
 */

const VOICE_SESSION_ID = "66666666-6666-4666-8666-666666666666";

function fakeContactRepository() {
  const rows: ContactRoleRevisionRow[] = [];
  const invalidateUnconsumed = vi.fn(async () => null);

  const repo: Pick<
    VoiceSessionRepository,
    | "isEnabled"
    | "withTransaction"
    | "insertContactRoleRevision"
    | "listContactRoleRevisions"
    | "invalidateUnconsumedConfirmationForContactChange"
  > = {
    isEnabled: () => true,
    withTransaction: async (work: (tx: VoiceQueryExecutor) => Promise<unknown>) =>
      work({} as VoiceQueryExecutor),
    insertContactRoleRevision: vi.fn(
      async (input: InsertContactRoleRevisionInput): Promise<ContactRoleRevisionRow> => {
        const row: ContactRoleRevisionRow = {
          revisionId: `rev-${rows.length + 1}`,
          voiceSessionId: input.voiceSessionId,
          role: input.role,
          revisionNumber: input.revisionNumber,
          name: input.name,
          phoneKeyVersion: input.phoneKeyVersion,
          phoneNonce: input.phoneNonce,
          phoneCiphertext: input.phoneCiphertext,
          phoneAuthTag: input.phoneAuthTag,
          consentRef: input.consentRef,
          reason: input.reason,
          replacedRevision: input.replacedRevision,
          createdAt: new Date().toISOString(),
        };
        rows.push(row);
        return row;
      },
    ),
    listContactRoleRevisions: vi.fn(async (voiceSessionId: string) =>
      rows
        .filter((r) => r.voiceSessionId === voiceSessionId)
        .sort((a, b) => a.revisionNumber - b.revisionNumber),
    ),
    invalidateUnconsumedConfirmationForContactChange: invalidateUnconsumed,
  };

  return { repo: repo as unknown as VoiceSessionRepository, rows, invalidateUnconsumed };
}

describe("AUDIT-VOICE-APPLICATION-REGRESSION-20261018 Package C: durable VoiceContactService", () => {
  beforeEach(() => {
    process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
    process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
  });

  afterEach(() => {
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
  });

  it("fails closed when no encryption key is configured, rather than persisting plaintext", async () => {
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
    const { repo } = fakeContactRepository();
    const service = new VoiceContactService(repo);

    await expect(
      service.initializeContacts({
        voiceSessionId: VOICE_SESSION_ID,
        callerPhone: "0911000111",
        bookerName: "Alice",
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 503,
        code: "VOICE_CONTACT_REVISION_ENCRYPTION_UNCONFIGURED",
      }),
    );
  });

  it("persists encrypted, non-plaintext revisions for every role including the driverContact/callbackRecipient default pointers", async () => {
    const { repo, rows } = fakeContactRepository();
    const service = new VoiceContactService(repo);

    await service.initializeContacts({
      voiceSessionId: VOICE_SESSION_ID,
      callerPhone: "0911000111",
      bookerName: "Alice",
      passengerName: "Bob",
      passengerPhone: "0922000222",
      isSelfBooking: false,
    });

    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.role)).toEqual([
      "caller",
      "booker",
      "passenger",
      "driverContact",
      "callbackRecipient",
    ]);
    // The default pointers, not a custom override, since no override was requested.
    expect(rows[3]?.reason).toBe("default_role:passenger");
    expect(rows[4]?.reason).toBe("default_role:booker");
    for (const row of rows) {
      expect(row.phoneCiphertext.toString("utf8")).not.toContain("0911000111");
      expect(row.phoneCiphertext.toString("utf8")).not.toContain("0922000222");
    }
  });

  it("cold-reconstructs full state (including role-pointer resolution) from only the durable revisions after a process restart", async () => {
    const { repo } = fakeContactRepository();
    const writer = new VoiceContactService(repo);
    await writer.initializeContacts({
      voiceSessionId: VOICE_SESSION_ID,
      callerPhone: "0911000111",
      bookerName: "Alice",
      passengerName: "Bob",
      passengerPhone: "0922000222",
      isSelfBooking: false,
    });

    // A brand new instance == a fresh process; its RAM map is empty, forcing
    // the cold-reconstruction path to be the ONLY way this can succeed.
    const reader = new VoiceContactService(repo);
    const effective = await reader.getEffectiveContactsDurable(VOICE_SESSION_ID);

    expect(effective).not.toBeNull();
    expect(effective?.assertedCallerPhone).toBe("0911000111");
    expect(effective?.bookerContact).toEqual({ name: "Alice", phone: "0911000111" });
    expect(effective?.passengerContact).toEqual({ name: "Bob", phone: "0922000222" });
    expect(effective?.driverContactRole).toBe("passenger");
    expect(effective?.driverContact).toEqual({ name: "Bob", phone: "0922000222" });
    expect(effective?.callbackRecipientRole).toBe("booker");
    expect(effective?.callbackRecipient).toEqual({ name: "Alice", phone: "0911000111" });
  });

  it("returns null (not a thrown error) from the durable read when no contact state was ever recorded", async () => {
    const { repo } = fakeContactRepository();
    const service = new VoiceContactService(repo);
    await expect(
      service.getEffectiveContactsDurable("77777777-7777-4777-8777-777777777777"),
    ).resolves.toBeNull();
  });

  it("durably appends a role-correction revision and invalidates only unconsumed confirmations, preserving accepted pending proof, instead of the blanket session-wide invalidation", async () => {
    const { repo, rows, invalidateUnconsumed } = fakeContactRepository();
    const service = new VoiceContactService(repo);
    await service.initializeContacts({
      voiceSessionId: VOICE_SESSION_ID,
      callerPhone: "0911000111",
      bookerName: "Alice",
      passengerName: "Bob",
      passengerPhone: "0922000222",
      isSelfBooking: false,
    });

    const result = await service.updateContactRole({
      voiceSessionId: VOICE_SESSION_ID,
      role: "passenger",
      phone: "0933333444",
      name: "Bob (Updated)",
      reason: "passenger_phone_correction",
      consentRef: "consent-bob-phone-correction",
    });

    expect(result.newRevision.revision).toBe(6); // 5 seed revisions, this is the 6th
    expect(result.newRevision.replacedRevision).toBe(3);
    expect(rows).toHaveLength(6);
    expect(invalidateUnconsumed).toHaveBeenCalledTimes(1);
    expect(invalidateUnconsumed).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      expect.anything(),
    );

    const effective = service.getEffectiveContacts(VOICE_SESSION_ID);
    expect(effective.passengerContact).toEqual({
      name: "Bob (Updated)",
      phone: "0933333444",
    });
    // driverContact tracks the updated passenger phone (role pointer, not a custom override).
    expect(effective.driverContact).toEqual({
      name: "Bob (Updated)",
      phone: "0933333444",
    });
  });
});
