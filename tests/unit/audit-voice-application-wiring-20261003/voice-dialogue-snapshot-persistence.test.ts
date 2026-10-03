import { randomBytes } from "node:crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  decryptDialogueSnapshotContent,
  encryptDialogueSnapshotContent,
  resolveDialogueSnapshotEncryptionKey,
} from "../../../apps/api/src/modules/voice-booking/voice-dialogue-snapshot-crypto";
import {
  VoiceSessionService,
  type PersistDialogueSnapshotCommand,
} from "../../../apps/api/src/modules/voice-booking/voice-session.service";
import { VoiceRetentionService } from "../../../apps/api/src/modules/voice-booking/voice-retention.service";
import type { VoiceSessionRecord } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import type { DialogueSnapshotRow } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: the versioned, encrypted
 * dialogue-content snapshot persist/restore this domain was missing (see
 * `voice-session.service.ts#persistDialogueSnapshot`'s own doc and
 * `infra/migrations/V0106__voice_dialogue_snapshot.sql`). The repository
 * boundary is doubled (real Postgres coverage is
 * `tests/integration/unattended-voice-postgres.integration.test.ts`,
 * hosted-only); everything else -- CAS/scope/lease/route/input/media
 * fencing, schema validation, encryption, retention -- runs for real.
 */

const VOICE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_SCOPE_ID = "22222222-2222-4222-8222-222222222222";

function createSessionRecord(
  overrides: Partial<VoiceSessionRecord> = {},
): VoiceSessionRecord {
  return {
    voiceSessionId: VOICE_SESSION_ID,
    callId: "call-1",
    providerAccountId: "provider-1",
    providerCallId: "provider-call-1",
    resourceScopeId: RESOURCE_SCOPE_ID,
    lineBindingId: "line-binding-1",
    routeProfileId: "route-profile-1",
    routeProfileVersion: 1,
    dialogState: "collecting",
    mediaState: "active",
    controlOwner: "ai",
    leaseEpoch: 1,
    sessionVersion: 5,
    commitStatus: "none",
    recordingState: "capturing",
    confirmationState: "absent",
    outcome: null,
    inputEpoch: 3,
    pendingInput: false,
    lastResolvedInputEpoch: 3,
    lastAppliedControlSequence: 2,
    createdAt: "2026-07-24T09:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
    ...overrides,
  };
}

const validContent = {
  draftVersion: 1,
  confirmationId: null,
  slots: {
    pickup: {
      rawText: "台北車站",
      normalizedValue: null,
      candidate: "台北車站",
      sourceTurnIds: ["turn-1"],
      sourceSegmentIds: ["seg-1"],
      providerConfidence: 0.9,
      validationState: "unvalidated" as const,
      confirmedByCustomerAt: null,
    },
  },
  slotHistory: [],
  addressRepairs: { pickup: 0, dropoff: 0 },
  addressHistory: [],
  handoff: null,
};

function buildHarness(
  options: {
    sessionOverrides?: Partial<VoiceSessionRecord>;
    appliedMediaEpoch?: number | null;
    existingSnapshots?: DialogueSnapshotRow[];
  } = {},
) {
  const session = createSessionRecord(options.sessionOverrides);
  const snapshots: DialogueSnapshotRow[] = [...(options.existingSnapshots ?? [])];
  const appliedMediaEpoch = options.appliedMediaEpoch ?? null;

  const repository = {
    isEnabled: () => true,
    findSessionById: vi.fn(async (id: string) =>
      id === session.voiceSessionId ? { ...session } : null,
    ),
    findAppliedMediaEpoch: vi.fn(async () => appliedMediaEpoch),
    insertDialogueSnapshot: vi.fn(async (input: Record<string, unknown>) => {
      const existing = snapshots.find(
        (s) =>
          s.voiceSessionId === input.voiceSessionId &&
          s.sessionVersion === input.sessionVersion,
      );
      if (existing) {
        return { snapshot: existing, deduped: true };
      }
      const row: DialogueSnapshotRow = {
        snapshotId: `snapshot-${snapshots.length + 1}`,
        voiceSessionId: input.voiceSessionId as string,
        sessionVersion: input.sessionVersion as number,
        resourceScopeId: input.resourceScopeId as string,
        routeProfileVersion: input.routeProfileVersion as number,
        leaseEpoch: input.leaseEpoch as number,
        inputEpoch: input.inputEpoch as number,
        mediaEpoch: input.mediaEpoch as number,
        turnId: input.turnId as string,
        contentKeyVersion: input.contentKeyVersion as string,
        contentNonce: input.contentNonce as Buffer,
        contentCiphertext: input.contentCiphertext as Buffer,
        contentAuthTag: input.contentAuthTag as Buffer,
        retentionExpiresAt: input.retentionExpiresAt as string,
        createdAt: "2026-07-24T09:00:00.000Z",
      };
      snapshots.push(row);
      return { snapshot: row, deduped: false };
    }),
    findLatestDialogueSnapshot: vi.fn(async () => {
      const notExpired = snapshots.filter(
        (s) => new Date(s.retentionExpiresAt).getTime() > Date.now(),
      );
      const sorted = notExpired.sort(
        (a, b) => b.sessionVersion - a.sessionVersion,
      );
      return sorted[0] ?? null;
    }),
    findExpiredDialogueSnapshots: vi.fn(async () =>
      snapshots.filter(
        (s) => new Date(s.retentionExpiresAt).getTime() <= Date.now(),
      ),
    ),
    deleteDialogueSnapshot: vi.fn(async (id: string, version: number) => {
      const index = snapshots.findIndex(
        (s) => s.voiceSessionId === id && s.sessionVersion === version,
      );
      if (index === -1) return false;
      snapshots.splice(index, 1);
      return true;
    }),
  };

  const service = new VoiceSessionService(
    repository as never,
    undefined,
    undefined,
    new VoiceRetentionService(),
  );
  return { session, repository, service, snapshots };
}

function validCommand(
  overrides: Partial<PersistDialogueSnapshotCommand> = {},
): PersistDialogueSnapshotCommand {
  return {
    voiceSessionId: VOICE_SESSION_ID,
    expectedSessionVersion: 5,
    expectedLeaseEpoch: 1,
    expectedResourceScopeId: RESOURCE_SCOPE_ID,
    expectedRouteProfileVersion: 1,
    inputEpoch: 3,
    mediaEpoch: 2,
    turnId: "turn-xyz",
    content: validContent,
    ...overrides,
  };
}

describe("voice-dialogue-snapshot-crypto", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fails closed (returns null) when no key is configured", () => {
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
    expect(resolveDialogueSnapshotEncryptionKey()).toBeNull();
  });

  it("fails closed on a malformed (wrong-length) key", () => {
    process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
    process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY = Buffer.from(
      "too-short",
    ).toString("base64");
    expect(resolveDialogueSnapshotEncryptionKey()).toBeNull();
  });

  it("fails closed on a non-canonical base64 string even if it happens to decode to 32 bytes (strict round-trip check)", () => {
    process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
    const real = randomBytes(32).toString("base64");
    // Flip a padding/length property to make it non-canonical: append an
    // extra '=' (invalid padding) while keeping the alphabet valid.
    process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY = `${real}=`;
    expect(resolveDialogueSnapshotEncryptionKey()).toBeNull();
  });

  it("fails closed on a base64 string containing characters outside the standard alphabet", () => {
    process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
    process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
      "!!!not-base64-at-all-but-node-would-silently-strip-these-chars!!!";
    expect(resolveDialogueSnapshotEncryptionKey()).toBeNull();
  });

  it("accepts a real, canonical 32-byte base64 key", () => {
    process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
    process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
    const resolved = resolveDialogueSnapshotEncryptionKey();
    expect(resolved).not.toBeNull();
    expect(resolved!.key.length).toBe(32);
  });

  const aad = JSON.stringify(["test-context"]);

  it("round-trips real content through AES-256-GCM encrypt/decrypt", () => {
    const key = { version: "v1", key: randomBytes(32) };
    const encrypted = encryptDialogueSnapshotContent(validContent, key, aad);
    const decrypted = decryptDialogueSnapshotContent(
      encrypted,
      (version) => (version === key.version ? key.key : null),
      aad,
    );
    expect(decrypted).toEqual(validContent);
  });

  it("refuses to decrypt under an unrecognized key version instead of using the wrong key", () => {
    const key = { version: "v1", key: randomBytes(32) };
    const encrypted = encryptDialogueSnapshotContent(validContent, key, aad);
    expect(() =>
      decryptDialogueSnapshotContent(encrypted, () => null, aad),
    ).toThrow(/voice_dialogue_snapshot_key_unavailable/);
  });

  it("GCM auth-tag check rejects tampered ciphertext", () => {
    const key = { version: "v1", key: randomBytes(32) };
    const encrypted = encryptDialogueSnapshotContent(validContent, key, aad);
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.concat([
        encrypted.ciphertext.subarray(0, encrypted.ciphertext.length - 1),
        Buffer.from([encrypted.ciphertext[encrypted.ciphertext.length - 1]! ^ 0xff]),
      ]),
    };
    expect(() =>
      decryptDialogueSnapshotContent(
        tampered,
        (v) => (v === key.version ? key.key : null),
        aad,
      ),
    ).toThrow();
  });

  it("GCM auth-tag check rejects a ciphertext decrypted under a different associated-data context (row/context substitution)", () => {
    const key = { version: "v1", key: randomBytes(32) };
    const encrypted = encryptDialogueSnapshotContent(validContent, key, aad);
    expect(() =>
      decryptDialogueSnapshotContent(
        encrypted,
        (v) => (v === key.version ? key.key : null),
        JSON.stringify(["different-context"]),
      ),
    ).toThrow();
  });
});

describe("VoiceSessionService.persistDialogueSnapshot", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
    process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("persists a real encrypted row fenced by session/scope/lease/route/input/media, with a finite retention window", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });

    const result = await service.persistDialogueSnapshot(validCommand());

    expect(repository.insertDialogueSnapshot).toHaveBeenCalledTimes(1);
    const inserted = repository.insertDialogueSnapshot.mock.calls[0]![0] as {
      contentCiphertext: Buffer;
    };
    // Content must actually be encrypted, not stored in the clear.
    expect(Buffer.isBuffer(inserted.contentCiphertext)).toBe(true);
    expect(inserted.contentCiphertext.toString("utf8")).not.toContain(
      "台北車站",
    );
    expect(result.snapshot.content).toEqual(validContent);
    expect(result.deduped).toBe(false);
    expect(new Date(result.snapshot.retentionExpiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("is dedup-safe: a retried write for the same (session, version) returns the ACTUAL persisted content, not the caller's resubmitted one", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });

    const first = await service.persistDialogueSnapshot(validCommand());
    // Resubmit with the exact same turn/media/content (a legitimate retry,
    // e.g. after a dropped HTTP response) -- must be a safe no-op that
    // returns the real persisted row, never a second row.
    const second = await service.persistDialogueSnapshot(validCommand());

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.snapshot.snapshotId).toBe(first.snapshot.snapshotId);
    expect(second.snapshot.content).toEqual(validContent);
    expect(repository.insertDialogueSnapshot).toHaveBeenCalledTimes(2);
  });

  it("rejects a conflicting replay: a second call for the same (session, version) with DIFFERENT content is a real conflict, not a silent dedup success echoing the caller's own content", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 2 });

    await service.persistDialogueSnapshot(validCommand());

    await expect(
      service.persistDialogueSnapshot(
        validCommand({ content: { ...validContent, draftVersion: 99 } }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_ACTION_PAYLOAD_CONFLICT" });
  });

  it("rejects a conflicting replay with a different turnId for the same (session, version)", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 2 });

    await service.persistDialogueSnapshot(validCommand());

    await expect(
      service.persistDialogueSnapshot(
        validCommand({ turnId: "a-different-turn" }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_ACTION_PAYLOAD_CONFLICT" });
  });

  it("checks the session row FOR UPDATE inside the fence-check/insert transaction (or the plain fallback when unavailable), not an unguarded read-then-write", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });
    await service.persistDialogueSnapshot(validCommand());
    expect(repository.findSessionById).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      undefined,
      true,
    );
  });

  it("rejects a stale sessionVersion (CAS fence)", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 2 });
    await expect(
      service.persistDialogueSnapshot(
        validCommand({ expectedSessionVersion: 4 }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_DRAFT_STALE" });
  });

  it("rejects a mismatched leaseEpoch (ownership fence)", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 2 });
    await expect(
      service.persistDialogueSnapshot(
        validCommand({ expectedLeaseEpoch: 99 }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_SESSION_NOT_OWNER" });
  });

  it("rejects a mismatched resourceScopeId", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 2 });
    await expect(
      service.persistDialogueSnapshot(
        validCommand({ expectedResourceScopeId: "foreign-scope" }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_SESSION_NOT_OWNER" });
  });

  it("rejects a mismatched routeProfileVersion", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 2 });
    await expect(
      service.persistDialogueSnapshot(
        validCommand({ expectedRouteProfileVersion: 99 }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_DRAFT_STALE" });
  });

  it("rejects a stale inputEpoch (a newer speech-start already opened a different outstanding input)", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 2 });
    await expect(
      service.persistDialogueSnapshot(validCommand({ inputEpoch: 1 })),
    ).rejects.toMatchObject({ code: "VOICE_DRAFT_STALE" });
  });

  it("rejects a stale mediaEpoch once a control event has actually been applied", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 7 });
    await expect(
      service.persistDialogueSnapshot(validCommand({ mediaEpoch: 2 })),
    ).rejects.toMatchObject({ code: "VOICE_DRAFT_STALE" });
  });

  it("does not fence mediaEpoch before bootstrap (no control event applied yet)", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: null });
    await expect(
      service.persistDialogueSnapshot(validCommand({ mediaEpoch: 999 })),
    ).resolves.toBeDefined();
  });

  it("rejects content that fails real schema validation instead of storing arbitrary jsonb", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 2 });
    await expect(
      service.persistDialogueSnapshot(
        validCommand({ content: { not: "valid" } }),
      ),
    ).rejects.toThrow();
  });

  it("fails closed when no encryption key is configured -- never stores content unencrypted", async () => {
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
    delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });

    await expect(
      service.persistDialogueSnapshot(validCommand()),
    ).rejects.toMatchObject({
      code: "VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_UNCONFIGURED",
    });
    expect(repository.insertDialogueSnapshot).not.toHaveBeenCalled();
  });

  it("fails closed when the retention policy service is unavailable -- never persists with no finite retention window", async () => {
    const { session, repository } = buildHarness({ appliedMediaEpoch: 2 });
    const serviceWithoutRetention = new VoiceSessionService(
      repository as never,
    );
    void session;
    await expect(
      serviceWithoutRetention.persistDialogueSnapshot(validCommand()),
    ).rejects.toMatchObject({ code: "VOICE_RETENTION_POLICY_UNAVAILABLE" });
    expect(repository.insertDialogueSnapshot).not.toHaveBeenCalled();
  });
});

describe("VoiceSessionService.getDialogueSnapshotRestoration", () => {
  beforeEach(() => {
    process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
    process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
  });

  it("returns the authoritative session with a null snapshot when none has ever been persisted", async () => {
    const { service, session } = buildHarness({ appliedMediaEpoch: 2 });
    const restoration = await service.getDialogueSnapshotRestoration(
      session.voiceSessionId,
    );
    expect(restoration.session.sessionVersion).toBe(session.sessionVersion);
    expect(restoration.snapshot).toBeNull();
  });

  it("decrypts and returns the latest persisted snapshot's real content", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 2 });
    await service.persistDialogueSnapshot(validCommand());

    const restoration = await service.getDialogueSnapshotRestoration(
      VOICE_SESSION_ID,
    );
    expect(restoration.snapshot).not.toBeNull();
    expect(restoration.snapshot!.content).toEqual(validContent);
  });

  it("returns the latest of multiple snapshots, by sessionVersion", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });
    await service.persistDialogueSnapshot(validCommand());
    repository.findSessionById.mockResolvedValue({
      ...createSessionRecord(),
      sessionVersion: 6,
    });
    await service.persistDialogueSnapshot(
      validCommand({
        expectedSessionVersion: 6,
        content: { ...validContent, draftVersion: 2 },
      }),
    );

    const restoration = await service.getDialogueSnapshotRestoration(
      VOICE_SESSION_ID,
    );
    expect(restoration.snapshot!.sessionVersion).toBe(6);
    expect(restoration.snapshot!.content.draftVersion).toBe(2);
  });

  it("denies restoring a snapshot whose retention window has already expired, treating it as if no snapshot existed", async () => {
    const { service, snapshots } = buildHarness({ appliedMediaEpoch: 2 });
    await service.persistDialogueSnapshot(validCommand());
    // Force the just-written row into the past, as if its retention window
    // had already elapsed (the real schema/query filters on this exact
    // column -- see `findLatestDialogueSnapshot`'s own doc).
    snapshots[0]!.retentionExpiresAt = new Date(
      Date.now() - 1000,
    ).toISOString();

    const restoration = await service.getDialogueSnapshotRestoration(
      VOICE_SESSION_ID,
    );
    expect(restoration.snapshot).toBeNull();
  });
});

describe("VoiceSessionService.purgeExpiredDialogueSnapshots", () => {
  beforeEach(() => {
    process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
    process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
  });

  it("dry-run reports eligible-to-purge rows without deleting anything", async () => {
    const { service, repository, snapshots } = buildHarness({
      appliedMediaEpoch: 2,
    });
    await service.persistDialogueSnapshot(validCommand());
    snapshots[0]!.retentionExpiresAt = new Date(
      Date.now() - 1000,
    ).toISOString();

    const { report, deletedCount } =
      await service.purgeExpiredDialogueSnapshots("operator-1", true);

    expect(report.mode).toBe("dry-run");
    expect(report.results).toHaveLength(1);
    expect(report.results[0]!.action).toBe("eligible_to_purge");
    expect(deletedCount).toBe(0);
    expect(repository.deleteDialogueSnapshot).not.toHaveBeenCalled();
    expect(snapshots).toHaveLength(1);
  });

  it("a real (non-dry-run) purge actually deletes the expired row through the repository's privileged append-only bypass", async () => {
    const { service, repository, snapshots } = buildHarness({
      appliedMediaEpoch: 2,
    });
    await service.persistDialogueSnapshot(validCommand());
    snapshots[0]!.retentionExpiresAt = new Date(
      Date.now() - 1000,
    ).toISOString();

    const { report, deletedCount } =
      await service.purgeExpiredDialogueSnapshots("operator-1", false);

    expect(report.mode).toBe("apply");
    expect(report.purgedCount).toBe(1);
    expect(deletedCount).toBe(1);
    expect(repository.deleteDialogueSnapshot).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      5,
    );
    expect(snapshots).toHaveLength(0);
  });

  it("never purges a row not yet past its retention window", async () => {
    const { service, repository, snapshots } = buildHarness({
      appliedMediaEpoch: 2,
    });
    await service.persistDialogueSnapshot(validCommand());

    const { deletedCount } = await service.purgeExpiredDialogueSnapshots(
      "operator-1",
      false,
    );

    expect(deletedCount).toBe(0);
    expect(repository.deleteDialogueSnapshot).not.toHaveBeenCalled();
    expect(snapshots).toHaveLength(1);
  });

  it("fails closed when the retention policy service is unavailable -- never deletes without its legal-hold-aware decision", async () => {
    const { repository } = buildHarness({ appliedMediaEpoch: 2 });
    const serviceWithoutRetention = new VoiceSessionService(
      repository as never,
    );
    await expect(
      serviceWithoutRetention.purgeExpiredDialogueSnapshots("operator-1", false),
    ).rejects.toMatchObject({ code: "VOICE_RETENTION_POLICY_UNAVAILABLE" });
    expect(repository.deleteDialogueSnapshot).not.toHaveBeenCalled();
  });
});
