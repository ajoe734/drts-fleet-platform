import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

import { VoiceContactService as CurrentVoiceContactService } from "../../../apps/api/src/modules/voice-booking/voice-contact.service";
import type {
  ContactRoleRevisionRow,
  InsertContactRoleRevisionInput,
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

import { resolve } from "node:path";
import { sourceModuleLoader } from "./source-module-loader";
const VoiceContactService = process.env.VOICE_ORIGINAL_REF
  ? sourceModuleLoader({}, [
      "apps/api/src/modules/voice-booking/voice-contact.service.ts",
    ])<{
      VoiceContactService: typeof CurrentVoiceContactService;
    }>(resolve("apps/api/src/modules/voice-booking/voice-contact.service.ts"))
      .VoiceContactService
  : CurrentVoiceContactService;

const VOICE_SESSION_ID = "66666666-6666-4666-8666-666666666666";

function fakeContactRepository(createdAt = new Date().toISOString()) {
  const rows: ContactRoleRevisionRow[] = [];
  const invalidateUnconsumed = vi.fn(async () => null);
  const rebindCalls: Array<{
    voiceSessionId: string;
    revisionNumber: number;
    reason: string;
  }> = [];

  let pending = Promise.resolve();

  const repo: Pick<
    VoiceSessionRepository,
    | "isEnabled"
    | "withTransaction"
    | "findSessionById"
    | "insertContactRoleRevision"
    | "listContactRoleRevisions"
    | "invalidateUnconsumedConfirmationForContactChange"
  > = {
    isEnabled: () => true,
    withTransaction: async <T>(
      work: (
        tx: Parameters<
          Parameters<VoiceSessionRepository["withTransaction"]>[0]
        >[0],
      ) => Promise<T>,
    ): Promise<T> => {
      const previous = pending;
      let release!: () => void;
      pending = new Promise<void>((done) => {
        release = done;
      });
      await previous;
      const snapshot = rows.slice();
      try {
        return await work(
          {} as Parameters<
            Parameters<VoiceSessionRepository["withTransaction"]>[0]
          >[0],
        );
      } catch (error) {
        rows.splice(0, rows.length, ...snapshot);
        throw error;
      } finally {
        release();
      }
    },
    // A fake, but present, locked session row: `updateContactRoleDurable`
    // only checks this is non-null (the session exists) before reading
    // revisions under its lock -- the real column values are irrelevant to
    // this fixture's `rows`-backed revision ledger.
    findSessionById: vi.fn(async () => ({ createdAt }) as never),
    insertContactRoleRevision: vi.fn(
      async (
        input: InsertContactRoleRevisionInput,
      ): Promise<ContactRoleRevisionRow> => {
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
          roleSource: input.roleSource,
          replacedRevision: input.replacedRevision,
          retentionExpiresAt: input.retentionExpiresAt,
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

  return {
    repo: {
      ...repo,
      rebindOpenCallbackTaskContacts: vi.fn(async (...args: unknown[]) => {
        rebindCalls.push({
          voiceSessionId: String(args[0]),
          revisionNumber: Number(args[1]),
          reason: String(args[2]),
        });
      }),
    } as unknown as VoiceSessionRepository,
    rows,
    invalidateUnconsumed,
    rebindCalls,
  };
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
    expect(rows[3]?.roleSource).toBe("default_pointer");
    expect(rows[4]?.reason).toBe("default_role:booker");
    expect(rows[4]?.roleSource).toBe("default_pointer");
    expect(rows.slice(0, 3).map((r) => r.roleSource)).toEqual([
      "explicit",
      "explicit",
      "explicit",
    ]);
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
    const effective =
      await reader.getEffectiveContactsDurable(VOICE_SESSION_ID);

    expect(effective).not.toBeNull();
    expect(effective?.assertedCallerPhone).toBe("0911000111");
    expect(effective?.bookerContact).toEqual({
      name: "Alice",
      phone: "0911000111",
    });
    expect(effective?.passengerContact).toEqual({
      name: "Bob",
      phone: "0922000222",
    });
    expect(effective?.driverContactRole).toBe("passenger");
    expect(effective?.driverContact).toEqual({
      name: "Bob",
      phone: "0922000222",
    });
    expect(effective?.callbackRecipientRole).toBe("booker");
    expect(effective?.callbackRecipient).toEqual({
      name: "Alice",
      phone: "0911000111",
    });
  });

  it("returns null (not a thrown error) from the durable read when no contact state was ever recorded", async () => {
    const { repo } = fakeContactRepository();
    const service = new VoiceContactService(repo);
    await expect(
      service.getEffectiveContactsDurable(
        "77777777-7777-4777-8777-777777777777",
      ),
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

  it("review round 2 (F6): a warm reader sees another instance's committed revision on its NEXT durable read, instead of staying pinned to its first read", async () => {
    const { repo } = fakeContactRepository();
    const writer = await (async () => {
      const s = new VoiceContactService(repo);
      await s.initializeContacts({
        voiceSessionId: VOICE_SESSION_ID,
        callerPhone: "0911000111",
        bookerName: "Alice",
        passengerName: "Bob",
        passengerPhone: "0922000222",
        isSelfBooking: false,
      });
      return s;
    })();

    const reader = new VoiceContactService(repo);
    const first = await reader.getEffectiveContactsDurable(VOICE_SESSION_ID);
    expect(first?.passengerContact.phone).toBe("0922000222");

    await writer.updateContactRole({
      voiceSessionId: VOICE_SESSION_ID,
      role: "passenger",
      phone: "0933000333",
      name: "Bob corrected",
      reason: "phone correction",
      consentRef: "consent-bob-new",
    });

    // Same `reader` instance, same warm Map entry from the first call --
    // must still observe the committed correction, not the stale value.
    const second = await reader.getEffectiveContactsDurable(VOICE_SESSION_ID);
    expect(second?.passengerContact.phone).toBe("0933000333");
  });

  it("review round 2 (F7): a correction reason that happens to equal the internal default-pointer literal does not change recipient semantics after cold reconstruction", async () => {
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

    await writer.updateContactRole({
      voiceSessionId: VOICE_SESSION_ID,
      role: "callbackRecipient",
      phone: "0944000555",
      name: "Custom C",
      reason: "default_role:passenger",
      consentRef: "consent-c",
    });

    const cold = await new VoiceContactService(
      repo,
    ).getEffectiveContactsDurable(VOICE_SESSION_ID);
    expect(cold?.callbackRecipientRole).toBe("custom");
    expect(cold?.callbackRecipient).toEqual({
      name: "Custom C",
      phone: "0944000555",
    });
  });

  it("review round 2 (F6): the next revision number and replaced-revision pointer are computed from a fresh read, not a stale in-memory counter on a reconstructed instance", async () => {
    const { repo, rows } = fakeContactRepository();
    const first = new VoiceContactService(repo);
    await first.initializeContacts({
      voiceSessionId: VOICE_SESSION_ID,
      callerPhone: "0911000111",
      bookerName: "Alice",
      passengerName: "Bob",
      passengerPhone: "0922000222",
      isSelfBooking: false,
    });

    // `second` never saw the 5 seed revisions through its own warm Map --
    // only cold reconstruction on demand would reveal them.
    const second = new VoiceContactService(repo);
    const result = await second.updateContactRole({
      voiceSessionId: VOICE_SESSION_ID,
      role: "booker",
      phone: "0966000777",
      name: "Alice corrected",
      reason: "booker_phone_correction",
      consentRef: "consent-alice-new",
    });

    expect(result.newRevision.revision).toBe(6);
    expect(result.newRevision.replacedRevision).toBe(2);
    expect(rows).toHaveLength(6);
  });

  it("F5: a role edit never retargets an already sealed callback task", async () => {
    const { repo, rebindCalls } = fakeContactRepository();
    const service = new VoiceContactService(repo);
    await service.initializeContacts({
      voiceSessionId: VOICE_SESSION_ID,
      callerPhone: "0911000111",
      bookerName: "Alice",
      passengerName: "Bob",
      passengerPhone: "0922000222",
      isSelfBooking: false,
    });

    await service.updateContactRole({
      voiceSessionId: VOICE_SESSION_ID,
      role: "callbackRecipient",
      phone: "0977000888",
      name: "Replacement C",
      reason: "explicit later recipient change",
      consentRef: "consent-c",
    });

    expect(rebindCalls).toEqual([]);
  });

  it("review round 2 (F6): re-asserting the SAME caller phone on a reconstructed instance replays the existing revision without allocating a new one", async () => {
    const { repo, rows } = fakeContactRepository();
    const first = new VoiceContactService(repo);
    await first.initializeContacts({
      voiceSessionId: VOICE_SESSION_ID,
      callerPhone: "0911000111",
      bookerName: "Alice",
    });

    const second = new VoiceContactService(repo);
    const result = await second.updateContactRole({
      voiceSessionId: VOICE_SESSION_ID,
      role: "caller",
      phone: "0911000111",
      reason: "reassert",
    });

    expect(result.newRevision.revision).toBe(1);
    expect(rows).toHaveLength(5);

    await expect(
      second.updateContactRole({
        voiceSessionId: VOICE_SESSION_ID,
        role: "caller",
        phone: "0900000000",
        reason: "attempted overwrite",
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "ASSERTED_CALLER_PHONE_IMMUTABLE" }),
    );
  });
});

it("F6: concurrent production-service initialization serializes before allocating seed revisions", async () => {
  process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
  process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
  try {
    const { repo, rows } = fakeContactRepository();
    const a = new VoiceContactService(repo),
      b = new VoiceContactService(repo);
    const input = {
      voiceSessionId: VOICE_SESSION_ID,
      callerPhone: "0911000111",
      bookerName: "Alice",
    };
    await Promise.all([
      a.initializeContacts(input),
      b.initializeContacts(input),
    ]);
    expect(rows.map((row) => row.revisionNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(repo.findSessionById).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      expect.anything(),
      true,
    );
  } finally {
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
  }
});

it("F6: failed invalidation rolls back both revision and in-memory state; retry uses the original next revision", async () => {
  process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
  process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
  try {
    const { repo, rows, invalidateUnconsumed } = fakeContactRepository();
    const service = new VoiceContactService(repo);
    await service.initializeContacts({
      voiceSessionId: VOICE_SESSION_ID,
      callerPhone: "0911000111",
    });
    invalidateUnconsumed.mockRejectedValueOnce(
      new Error("SIM-transaction-refusal"),
    );
    const correction = {
      voiceSessionId: VOICE_SESSION_ID,
      role: "booker" as const,
      name: "A corrected",
      phone: "0922000222",
      reason: "correction",
    };
    await expect(service.updateContactRole(correction)).rejects.toThrow(
      "SIM-transaction-refusal",
    );
    expect(rows).toHaveLength(5);
    expect(
      service.getEffectiveContacts(VOICE_SESSION_ID).bookerContact.phone,
    ).toBe("0911000111");
    const retry = await service.updateContactRole(correction);
    expect(retry.newRevision.revision).toBe(6);
    expect(rows.map((row) => row.revisionNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]); // automatic driver pointer is its own immutable revision
  } finally {
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
  }
});

it("C retention: every revision keeps the original session expiry; expired durable/cached reads and reinitialization cannot renew or expose contact content", async () => {
  vi.useFakeTimers().setSystemTime(new Date("2026-10-19T00:00:00Z"));
  process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
  process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
  try {
    const { repo, rows } = fakeContactRepository();
    const service = new VoiceContactService(repo);
    const initial = {
      voiceSessionId: VOICE_SESSION_ID,
      callerPhone: "0911000111",
    };
    await service.initializeContacts(initial);
    const expiry = rows[0]!.retentionExpiresAt;
    expect(Number.isFinite(Date.parse(expiry))).toBe(true);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    await service.updateContactRole({
      ...initial,
      role: "booker",
      name: "A corrected",
      phone: "0922000222",
      reason: "correction",
    });
    expect(rows.every((row) => row.retentionExpiresAt === expiry)).toBe(true);
    vi.setSystemTime(new Date(Date.parse(expiry) + 1));
    expect(() => service.getEffectiveContacts(VOICE_SESSION_ID)).toThrowError(
      expect.objectContaining({ code: "VOICE_CONTACT_RETENTION_EXPIRED" }),
    );
    expect(
      await service.getEffectiveContactsDurable(VOICE_SESSION_ID),
    ).toBeNull();
    expect(
      await service.getContactRevisionByNumber(VOICE_SESSION_ID, 1),
    ).toBeNull();
    await expect(service.initializeContacts(initial)).rejects.toMatchObject({
      code: "VOICE_CONTACT_RETENTION_EXPIRED",
    });
    expect(rows.map((row) => row.revisionNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  } finally {
    vi.useRealTimers();
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
  }
});
