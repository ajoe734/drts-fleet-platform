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
import {
  DialogueSnapshotPurgeReceiptConflictError,
  type DialogueSnapshotPurgeReceiptRow,
  type DialogueSnapshotRow,
} from "../../../apps/api/src/modules/voice-booking/voice-session.repository";

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
    dialogueSnapshotFenceVersion: 0,
    dialogueSnapshotHistoryUnavailableFloor: 0,
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
  const purgeReceipts: DialogueSnapshotPurgeReceiptRow[] = [];
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
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention purged
      // revision reuse (Codex reopen, canonical 2026-10-04T02:13:45Z):
      // mirrors the real repository's own `WHERE NOT EXISTS` guard --
      // once this exact (voiceSessionId, sessionVersion) key has a purge
      // receipt, no new row may ever be inserted there, identical retry
      // or genuinely different replacement alike.
      const receipt = purgeReceipts.find(
        (r) =>
          r.voiceSessionId === input.voiceSessionId &&
          r.sessionVersion === input.sessionVersion,
      );
      if (receipt) {
        throw new DialogueSnapshotPurgeReceiptConflictError(receipt);
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
    findDialogueSnapshotByVersion: vi.fn(
      async (id: string, version: number) =>
        snapshots.find(
          (s) => s.voiceSessionId === id && s.sessionVersion === version,
        ) ?? null,
    ),
    raiseDialogueSnapshotFence: vi.fn(async (id: string, version: number) => {
      if (id === session.voiceSessionId) {
        session.dialogueSnapshotFenceVersion = Math.max(
          session.dialogueSnapshotFenceVersion ?? 0,
          version,
        );
      }
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist incomplete
      // discriminated response validation (Codex reopen, canonical
      // 2026-10-04T01:25:05Z): the real repository method now returns the
      // resulting monotonic fence value via `RETURNING` so it can be
      // echoed in the `accepted: false` response's own correlation
      // fields.
      return session.dialogueSnapshotFenceVersion ?? version;
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
      const row = snapshots[index]!;
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-resolve governed purge
      // loses accepted-history distinction (Codex reopen, canonical
      // 2026-10-04T01:25:05Z): mirrors the real repository's own
      // `deleteDialogueSnapshot` -- a bounded, non-content receipt is
      // written in the SAME "transaction" as the deletion, from the
      // row's own identity/retention, before the row disappears.
      if (
        !purgeReceipts.some(
          (r) => r.voiceSessionId === id && r.sessionVersion === version,
        )
      ) {
        purgeReceipts.push({
          voiceSessionId: row.voiceSessionId,
          sessionVersion: row.sessionVersion,
          inputEpoch: row.inputEpoch,
          mediaEpoch: row.mediaEpoch,
          turnId: row.turnId,
          retentionExpiresAt: row.retentionExpiresAt,
          purgedAt: new Date().toISOString(),
        });
      }
      snapshots.splice(index, 1);
      return true;
    }),
    findDialogueSnapshotPurgeReceipt: vi.fn(
      async (id: string, version: number) =>
        purgeReceipts.find(
          (r) => r.voiceSessionId === id && r.sessionVersion === version,
        ) ?? null,
    ),
    raiseDialogueSnapshotHistoryUnavailableFloor: vi.fn(
      async (id: string, version: number) => {
        if (id === session.voiceSessionId) {
          session.dialogueSnapshotHistoryUnavailableFloor = Math.max(
            session.dialogueSnapshotHistoryUnavailableFloor ?? 0,
            version,
          );
        }
        return session.dialogueSnapshotHistoryUnavailableFloor ?? version;
      },
    ),
    findExpiredDialogueSnapshotPurgeReceipts: vi.fn(
      async (purgedBefore: string) =>
        purgeReceipts.filter(
          (r) => new Date(r.purgedAt).getTime() <= new Date(purgedBefore).getTime(),
        ),
    ),
    retireDialogueSnapshotPurgeReceipt: vi.fn(
      async (id: string, version: number) => {
        const index = purgeReceipts.findIndex(
          (r) => r.voiceSessionId === id && r.sessionVersion === version,
        );
        if (index === -1) return false;
        if (id === session.voiceSessionId) {
          session.dialogueSnapshotHistoryUnavailableFloor = Math.max(
            session.dialogueSnapshotHistoryUnavailableFloor ?? 0,
            version,
          );
        }
        purgeReceipts.splice(index, 1);
        return true;
      },
    ),
  };

  const retentionService = new VoiceRetentionService();
  const service = new VoiceSessionService(
    repository as never,
    undefined,
    undefined,
    retentionService,
  );
  return {
    session,
    repository,
    service,
    snapshots,
    purgeReceipts,
    retentionService,
  };
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

  it("[R4-persist late-acceptance fence, Codex reopen canonical 2026-10-03T23:31:57Z] rejects a write for a session_version the fence has already voided, even though every other check (scope/route/lease/epoch) still matches", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });
    await repository.raiseDialogueSnapshotFence(VOICE_SESSION_ID, 5);

    await expect(
      service.persistDialogueSnapshot(validCommand()),
    ).rejects.toMatchObject({ code: "VOICE_DIALOGUE_SNAPSHOT_VOIDED" });
    expect(repository.insertDialogueSnapshot).not.toHaveBeenCalled();
  });

  it("does not fence a version strictly ABOVE whatever was voided", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });
    await repository.raiseDialogueSnapshotFence(VOICE_SESSION_ID, 4);

    await expect(
      service.persistDialogueSnapshot(validCommand()),
    ).resolves.toBeDefined();
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention purged revision
   * reuse (Codex reopen, canonical 2026-10-04T02:13:45Z, "purged revision
   * remains writable, reintroducing content and losing acceptance
   * identity"). Before this fix, `insertDialogueSnapshot`'s `ON CONFLICT`
   * only protected a row that was STILL present -- once
   * `deleteDialogueSnapshot` governed-purged it, the exact same unique
   * index no longer blocked a brand new INSERT at the vacated key, so a
   * resubmit of the IDENTICAL original command silently stored a NEW row
   * with a freshly-renewed retention window.
   */
  it("never reinserts content (or renews retention) at an already governed-purged (voiceSessionId, sessionVersion): resubmitting the IDENTICAL original write is rejected, not silently re-accepted", async () => {
    const { service, repository, snapshots, purgeReceipts } = buildHarness({
      appliedMediaEpoch: 2,
    });

    await service.persistDialogueSnapshot(validCommand());
    const [row] = snapshots;
    row!.retentionExpiresAt = new Date(Date.now() - 1000).toISOString();
    await repository.deleteDialogueSnapshot(VOICE_SESSION_ID, 5);
    expect(snapshots).toHaveLength(0);
    expect(purgeReceipts).toHaveLength(1);
    const oldExpiry = purgeReceipts[0]!.retentionExpiresAt;

    await expect(
      service.persistDialogueSnapshot(validCommand()),
    ).rejects.toMatchObject({ code: "VOICE_DIALOGUE_SNAPSHOT_PURGED" });

    // Never reintroduced: no new content row, and the receipt's own
    // identity/expiry (the only surviving proof of the original accept)
    // is untouched -- never renewed by the rejected resubmit attempt.
    expect(snapshots).toHaveLength(0);
    expect(purgeReceipts).toHaveLength(1);
    expect(purgeReceipts[0]!.retentionExpiresAt).toBe(oldExpiry);
  });

  it("never reinserts content at an already governed-purged (voiceSessionId, sessionVersion) for a DIFFERENT replacement write either -- the key is immutable, not merely dedup-protected", async () => {
    const { service, repository, snapshots } = buildHarness({
      appliedMediaEpoch: 2,
    });

    await service.persistDialogueSnapshot(validCommand());
    snapshots[0]!.retentionExpiresAt = new Date(
      Date.now() - 1000,
    ).toISOString();
    await repository.deleteDialogueSnapshot(VOICE_SESSION_ID, 5);

    await expect(
      service.persistDialogueSnapshot(
        validCommand({ turnId: "turn-replacement", content: { ...validContent, slotHistory: [] } }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_DIALOGUE_SNAPSHOT_PURGED" });
    expect(snapshots).toHaveLength(0);

    // The original accepted history must remain resolvable afterward --
    // the rejected replacement attempt must never have corrupted or
    // masked it.
    const outcome = await service.resolveDialogueSnapshotOutcome({
      voiceSessionId: VOICE_SESSION_ID,
      expectedSessionVersion: 5,
      expectedLeaseEpoch: 1,
      expectedResourceScopeId: RESOURCE_SCOPE_ID,
      expectedRouteProfileVersion: 1,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "turn-xyz",
    });
    expect(outcome).toMatchObject({
      accepted: true,
      expired: true,
      turnId: "turn-xyz",
    });
  });

  it("rejects a write at a version whose purge receipt has since been governed-retired (receipt gone, but the history-unavailable floor still blocks reuse)", async () => {
    const { service, repository, snapshots } = buildHarness({
      appliedMediaEpoch: 2,
    });

    await service.persistDialogueSnapshot(validCommand());
    snapshots[0]!.retentionExpiresAt = new Date(
      Date.now() - 1000,
    ).toISOString();
    await repository.deleteDialogueSnapshot(VOICE_SESSION_ID, 5);
    await repository.retireDialogueSnapshotPurgeReceipt(VOICE_SESSION_ID, 5);

    await expect(
      service.persistDialogueSnapshot(validCommand()),
    ).rejects.toMatchObject({ code: "VOICE_DIALOGUE_SNAPSHOT_VOIDED" });
  });
});

describe("VoiceSessionService.resolveDialogueSnapshotOutcome", () => {
  beforeEach(() => {
    process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
    process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist late-acceptance
   * fence (Codex reopen, canonical 2026-10-03T23:31:57Z): the single
   * atomic adjudication `reconcileUnresolvedCommit` (worker side) falls
   * back to once its own bounded restoration-read polling exhausts with
   * nothing correlating found -- see that function's own doc.
   */

  function validResolveCommand(
    overrides: Partial<{
      voiceSessionId: string;
      expectedSessionVersion: number;
      expectedLeaseEpoch: number;
      expectedResourceScopeId: string;
      expectedRouteProfileVersion: number;
      inputEpoch: number;
      mediaEpoch: number;
      turnId: string;
    }> = {},
  ) {
    return {
      voiceSessionId: VOICE_SESSION_ID,
      expectedSessionVersion: 5,
      expectedLeaseEpoch: 1,
      expectedResourceScopeId: RESOURCE_SCOPE_ID,
      expectedRouteProfileVersion: 1,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "turn-xyz",
      ...overrides,
    };
  }

  it("reports accepted:true with the real decrypted content when the exact write already landed", async () => {
    const { service } = buildHarness({ appliedMediaEpoch: 2 });
    const persisted = await service.persistDialogueSnapshot(validCommand());

    const outcome = await service.resolveDialogueSnapshotOutcome(
      validResolveCommand(),
    );

    expect(outcome.accepted).toBe(true);
    if (outcome.accepted === true && !("expired" in outcome)) {
      expect(outcome.snapshot.snapshotId).toBe(persisted.snapshot.snapshotId);
      expect(outcome.snapshot.content).toEqual(validContent);
    }
  });

  it("reports accepted:false and durably fences this exact version when nothing ever landed -- a late arrival for the SAME version is then rejected", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });

    const outcome = await service.resolveDialogueSnapshotOutcome(
      validResolveCommand(),
    );

    expect(outcome.accepted).toBe(false);
    expect(repository.raiseDialogueSnapshotFence).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      5,
      undefined,
    );
    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist incomplete
    // discriminated response validation (Codex reopen, canonical
    // 2026-10-04T01:25:05Z): a bare `{accepted: false}` carries no
    // correlation field at all, so the worker's own validator
    // (`classifyResolveOutcome`, `dialogue-persist-port.ts`) could not
    // distinguish this exact adjudicated answer from a contradictory or
    // foreign one. The server now echoes the adjudicated identity plus
    // the fence value it just raised, under the same row lock.
    expect(outcome).toMatchObject({
      accepted: false,
      voiceSessionId: VOICE_SESSION_ID,
      sessionVersion: 5,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "turn-xyz",
      fenceVersion: 5,
    });

    // The exact write this adjudication just voided (same version/turn)
    // must never be allowed to land after the fact -- proving the fence
    // this call raised is the real, server-authoritative one
    // `persistDialogueSnapshot` itself consults, not a disconnected flag.
    await expect(
      service.persistDialogueSnapshot(validCommand()),
    ).rejects.toMatchObject({ code: "VOICE_DIALOGUE_SNAPSHOT_VOIDED" });
  });

  it("does not require sessionVersion to still be current -- that is exactly the case this call exists to adjudicate (authorized reconciliation of an older version)", async () => {
    const { service, session } = buildHarness({ appliedMediaEpoch: 2 });
    // Simulate the session having moved on well past the pending write's
    // own version, the way three successor turns would in the real
    // regression this closes.
    session.sessionVersion = 20;

    await expect(
      service.resolveDialogueSnapshotOutcome(validResolveCommand()),
    ).resolves.toMatchObject({ accepted: false });
  });

  it("treats a row at the right version but a DIFFERENT turnId/mediaEpoch as not correlating -- never confuses a different turn's content for this one", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });
    await service.persistDialogueSnapshot(
      validCommand({ turnId: "a-different-turn" }),
    );

    const outcome = await service.resolveDialogueSnapshotOutcome(
      validResolveCommand(),
    );

    expect(outcome.accepted).toBe(false);
    expect(repository.raiseDialogueSnapshotFence).toHaveBeenCalled();
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-resolve server mutation
   * authority and version bounds (Codex reopen, canonical
   * 2026-10-04T00:26:49Z): "old-version adjudication does not justify
   * fencing future writes." Before this fix, an `expectedSessionVersion`
   * the session has never reached was still durably fenced, permanently
   * blocking every later integer version once the session actually
   * advanced to it.
   */
  it("rejects a future/never-attempted session_version without ever raising the fence -- a later real write at the current version still succeeds", async () => {
    const { service, repository, session } = buildHarness({
      appliedMediaEpoch: 2,
    });
    expect(session.sessionVersion).toBe(5);

    await expect(
      service.resolveDialogueSnapshotOutcome(
        validResolveCommand({
          expectedSessionVersion: 2147483647,
          inputEpoch: 999,
          mediaEpoch: 999,
          turnId: "turn-never-attempted",
        }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_DIALOGUE_SNAPSHOT_FUTURE_VERSION" });
    expect(repository.raiseDialogueSnapshotFence).not.toHaveBeenCalled();

    // The fence must never have been raised for the future version -- a
    // genuine write at the session's own CURRENT version is unaffected.
    await expect(
      service.persistDialogueSnapshot(validCommand()),
    ).resolves.toMatchObject({ deduped: false });
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-resolve server mutation
   * authority and version bounds (Codex reopen, canonical
   * 2026-10-04T00:26:49Z): "No comparison is possible because the
   * controller did not pass the verified authority through." A capability
   * whose scope/route/lease has since moved on must never be allowed to
   * adjudicate, raise, or read this session's fence.
   */
  it("rejects adjudication under a stale capability authority (lease no longer matches the locked session) without raising the fence or disclosing content", async () => {
    const { service, repository, session } = buildHarness({
      appliedMediaEpoch: 2,
    });
    await service.persistDialogueSnapshot(validCommand());
    // Authority moved on underneath this capability (new lease/owner).
    session.leaseEpoch = 2;

    await expect(
      service.resolveDialogueSnapshotOutcome(validResolveCommand()),
    ).rejects.toMatchObject({ code: "VOICE_SESSION_NOT_OWNER" });
    expect(repository.raiseDialogueSnapshotFence).not.toHaveBeenCalled();
  });

  it("rejects adjudication under a stale capability resourceScopeId/routeProfileVersion the same way", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });

    await expect(
      service.resolveDialogueSnapshotOutcome(
        validResolveCommand({ expectedResourceScopeId: "foreign-scope" }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_SESSION_NOT_OWNER" });
    await expect(
      service.resolveDialogueSnapshotOutcome(
        validResolveCommand({ expectedRouteProfileVersion: 99 }),
      ),
    ).rejects.toMatchObject({ code: "VOICE_SESSION_NOT_OWNER" });
    expect(repository.raiseDialogueSnapshotFence).not.toHaveBeenCalled();
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-resolve expired-content
   * resurrection (Codex reopen, canonical 2026-10-04T00:26:49Z): "historical
   * acceptance metadata and permission to restore content are different
   * facts." An accepted write whose content has already passed retention
   * must report `accepted: true` (never falsely reported as voided) but
   * must never decrypt/return the content itself, and must never raise the
   * fence for a version that genuinely did land.
   */
  it("reports accepted:true, expired:true with no content when the exact write landed but has already passed retention -- never discloses expired content, never fences an accepted version", async () => {
    const { service, repository, snapshots } = buildHarness({
      appliedMediaEpoch: 2,
    });
    const persisted = await service.persistDialogueSnapshot(validCommand());
    const row = snapshots.find(
      (s) => s.snapshotId === persisted.snapshot.snapshotId,
    )!;
    row.retentionExpiresAt = "2020-01-01T00:00:00.000Z";

    const outcome = await service.resolveDialogueSnapshotOutcome(
      validResolveCommand(),
    );

    expect(outcome.accepted).toBe(true);
    expect(outcome).toMatchObject({
      accepted: true,
      expired: true,
      voiceSessionId: VOICE_SESSION_ID,
      sessionVersion: 5,
      turnId: "turn-xyz",
    });
    expect(outcome).not.toHaveProperty("snapshot");
    expect(repository.raiseDialogueSnapshotFence).not.toHaveBeenCalled();
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-resolve governed purge loses
   * accepted-history distinction (Codex reopen, canonical
   * 2026-10-04T01:25:05Z): a FULL persist -> expire -> hold -> release ->
   * purge -> resolve regression through the real service, retention
   * service and the repository's own `deleteDialogueSnapshot` (mocked at
   * the DB boundary only, but modelling its real
   * INSERT-receipt-then-DELETE contract -- see that mock's own doc).
   * Before this fix, `resolveDialogueSnapshotOutcome` could not
   * distinguish "this exact write was purged after being accepted" from
   * "this write never landed," and falsely returned `{accepted: false}`
   * for a request that WAS historically accepted -- and, worse, durably
   * fenced it, exactly as if the server had just rejected it for the
   * first time.
   */
  it("never relabels a governed-purged (but previously accepted) write as a confirmed non-acceptance -- it still reports accepted:true, expired:true from the bounded purge receipt, and never raises the fence", async () => {
    const { service, repository, snapshots, retentionService } =
      buildHarness({ appliedMediaEpoch: 2 });

    // 1. Persist: the write lands for real.
    const persisted = await service.persistDialogueSnapshot(validCommand());
    expect(persisted.deduped).toBe(false);

    // 2. Expire: push the row's own retention window into the past.
    const row = snapshots.find(
      (s) => s.snapshotId === persisted.snapshot.snapshotId,
    )!;
    row.retentionExpiresAt = new Date(Date.now() - 1000).toISOString();

    // Sanity: before any hold/purge, the expired-but-present row still
    // reports accepted:true, expired:true (the behavior Round-29 already
    // fixed and this test must not regress).
    await expect(
      service.resolveDialogueSnapshotOutcome(validResolveCommand()),
    ).resolves.toMatchObject({ accepted: true, expired: true });

    // 3. Hold: a real legal hold blocks purge, same as every other
    // evidence family's governed purge path.
    const hold = retentionService.placeLegalHold({
      caseNumber: "CASE-1",
      evidenceFamily: "voice_transcript",
      subjectRef: VOICE_SESSION_ID,
      reasonCode: "regulatory_inquiry",
      placedBy: "ops-1",
    });
    const heldPurge = await service.purgeExpiredDialogueSnapshots(
      "operator-1",
      false,
    );
    expect(heldPurge.report.skippedHeldCount).toBe(1);
    expect(repository.deleteDialogueSnapshot).not.toHaveBeenCalled();
    expect(snapshots).toHaveLength(1);

    // 4. Release: only platform_admin may release (SD §9.2 / Runbook §4).
    retentionService.releaseLegalHold({
      holdId: hold.holdId,
      releasedBy: "admin-1",
      releasedByRole: "platform_admin",
    });

    // 5. Purge: now permitted -- the content row is actually deleted.
    const { deletedCount } = await service.purgeExpiredDialogueSnapshots(
      "operator-1",
      false,
    );
    expect(deletedCount).toBe(1);
    expect(snapshots).toHaveLength(0);

    // 6. Resolve the SAME exact previously-accepted request. The content
    // row is gone, but the bounded, non-content purge receipt still
    // proves this exact write was accepted -- this must never be
    // reported as a confirmed non-acceptance, and must never raise the
    // fence (that would durably block a FUTURE write at this already-
    // historically-accepted version for no reason).
    const outcome = await service.resolveDialogueSnapshotOutcome(
      validResolveCommand(),
    );
    expect(outcome).toMatchObject({
      accepted: true,
      expired: true,
      voiceSessionId: VOICE_SESSION_ID,
      sessionVersion: 5,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "turn-xyz",
    });
    expect(outcome).not.toHaveProperty("snapshot");
    expect(repository.raiseDialogueSnapshotFence).not.toHaveBeenCalled();
  });

  it("a genuinely never-attempted version (no row, no purge receipt) is still reported as a confirmed non-acceptance with the fence raised -- the purge-receipt check never masks a real rejection", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });

    const outcome = await service.resolveDialogueSnapshotOutcome(
      validResolveCommand(),
    );

    expect(outcome).toMatchObject({ accepted: false });
    expect(repository.findDialogueSnapshotPurgeReceipt).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      5,
      undefined,
    );
    expect(repository.raiseDialogueSnapshotFence).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      5,
      undefined,
    );
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention purge-receipt
   * lifecycle (Codex reopen, canonical 2026-10-04T02:13:45Z, "new purge
   * receipts have no governed lifetime"): once a receipt's own governed
   * metadata retention ages it out and
   * `purgeExpiredDialogueSnapshotPurgeReceipts` retires it, the ONLY proof
   * this exact version was ever accepted is gone -- but that must never be
   * reported as the SAME confirmed non-acceptance as a version that
   * genuinely never landed (the previous test). This is a third, honestly
   * indeterminate outcome.
   */
  it("reports accepted: \"unknown\" (never a confirmed non-acceptance) once a version's own purge receipt has been governed-retired -- distinct from a genuinely never-attempted version", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });
    // Simulate: this version WAS accepted and later purged, and its
    // receipt has since also been governed-retired (receipt gone, floor
    // raised) -- never actually present at the version this test resolves.
    await repository.raiseDialogueSnapshotHistoryUnavailableFloor(
      VOICE_SESSION_ID,
      5,
    );

    const outcome = await service.resolveDialogueSnapshotOutcome(
      validResolveCommand(),
    );

    expect(outcome).toMatchObject({
      accepted: "unknown",
      voiceSessionId: VOICE_SESSION_ID,
      sessionVersion: 5,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "turn-xyz",
    });
    // Never a confirmed rejection: the regular write-blocking fence must
    // stay untouched by this honestly-indeterminate answer.
    expect(repository.raiseDialogueSnapshotFence).not.toHaveBeenCalled();
  });

  it("a version strictly ABOVE the history-unavailable floor is unaffected -- still a genuine confirmed non-acceptance", async () => {
    const { service, repository } = buildHarness({ appliedMediaEpoch: 2 });
    await repository.raiseDialogueSnapshotHistoryUnavailableFloor(
      VOICE_SESSION_ID,
      4,
    );

    const outcome = await service.resolveDialogueSnapshotOutcome(
      validResolveCommand(),
    );
    expect(outcome).toMatchObject({ accepted: false });
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

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention purge-receipt
 * lifecycle (Codex reopen, canonical 2026-10-04T02:13:45Z, "new purge
 * receipts have no governed lifetime"): `voice.dialogue_snapshot_purge_receipt`
 * accumulated forever with no policy-registered retention of its own.
 * This governs that receipt's OWN finite lifetime under the EXISTING
 * approved `voice_booking_evidence` family (730 days, legal-hold-aware),
 * never a newly-registered family.
 */
describe("VoiceSessionService.purgeExpiredDialogueSnapshotPurgeReceipts", () => {
  beforeEach(() => {
    process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "v1";
    process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
      randomBytes(32).toString("base64");
  });

  async function purgeAndRetentionAge(
    harness: ReturnType<typeof buildHarness>,
  ) {
    const { service, snapshots, purgeReceipts } = harness;
    await service.persistDialogueSnapshot(validCommand());
    snapshots[0]!.retentionExpiresAt = new Date(
      Date.now() - 1000,
    ).toISOString();
    await service.purgeExpiredDialogueSnapshots("operator-1", false);
    expect(purgeReceipts).toHaveLength(1);
    // Governed under voice_booking_evidence (730 hot days): push the
    // receipt's own purgedAt well past that window.
    purgeReceipts[0]!.purgedAt = new Date(
      Date.now() - 731 * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  it("dry-run reports an aged receipt as eligible-to-purge without retiring it", async () => {
    const harness = buildHarness({ appliedMediaEpoch: 2 });
    await purgeAndRetentionAge(harness);
    const { service, repository, purgeReceipts } = harness;

    const { report, deletedCount } =
      await service.purgeExpiredDialogueSnapshotPurgeReceipts(
        "operator-1",
        true,
      );

    expect(report.mode).toBe("dry-run");
    expect(report.family).toBe("voice_booking_evidence");
    expect(report.results).toHaveLength(1);
    expect(report.results[0]!.action).toBe("eligible_to_purge");
    expect(deletedCount).toBe(0);
    expect(repository.retireDialogueSnapshotPurgeReceipt).not.toHaveBeenCalled();
    expect(purgeReceipts).toHaveLength(1);
  });

  it("a real (non-dry-run) retirement deletes the receipt and raises the history-unavailable floor in the same step", async () => {
    const harness = buildHarness({ appliedMediaEpoch: 2 });
    await purgeAndRetentionAge(harness);
    const { service, repository, session, purgeReceipts } = harness;

    const { report, deletedCount } =
      await service.purgeExpiredDialogueSnapshotPurgeReceipts(
        "operator-1",
        false,
      );

    expect(report.mode).toBe("apply");
    expect(report.purgedCount).toBe(1);
    expect(deletedCount).toBe(1);
    expect(repository.retireDialogueSnapshotPurgeReceipt).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      5,
    );
    expect(purgeReceipts).toHaveLength(0);
    expect(session.dialogueSnapshotHistoryUnavailableFloor).toBe(5);
  });

  it("never retires a receipt not yet past the voice_booking_evidence retention window", async () => {
    const harness = buildHarness({ appliedMediaEpoch: 2 });
    const { service, repository, snapshots, purgeReceipts } = harness;
    await service.persistDialogueSnapshot(validCommand());
    snapshots[0]!.retentionExpiresAt = new Date(
      Date.now() - 1000,
    ).toISOString();
    await service.purgeExpiredDialogueSnapshots("operator-1", false);
    expect(purgeReceipts).toHaveLength(1);

    const { deletedCount } =
      await service.purgeExpiredDialogueSnapshotPurgeReceipts(
        "operator-1",
        false,
      );

    expect(deletedCount).toBe(0);
    expect(repository.retireDialogueSnapshotPurgeReceipt).not.toHaveBeenCalled();
    expect(purgeReceipts).toHaveLength(1);
  });

  it("skips a receipt under an active voice_booking_evidence legal hold", async () => {
    const harness = buildHarness({ appliedMediaEpoch: 2 });
    await purgeAndRetentionAge(harness);
    const { service, repository, retentionService, purgeReceipts } = harness;
    retentionService.placeLegalHold({
      caseNumber: "CASE-2",
      evidenceFamily: "voice_booking_evidence",
      subjectRef: VOICE_SESSION_ID,
      reasonCode: "regulatory_inquiry",
      placedBy: "ops-1",
    });

    const { report, deletedCount } =
      await service.purgeExpiredDialogueSnapshotPurgeReceipts(
        "operator-1",
        false,
      );

    expect(report.skippedHeldCount).toBe(1);
    expect(deletedCount).toBe(0);
    expect(repository.retireDialogueSnapshotPurgeReceipt).not.toHaveBeenCalled();
    expect(purgeReceipts).toHaveLength(1);
  });

  it("fails closed when the retention policy service is unavailable -- never retires without its legal-hold-aware decision", async () => {
    const { repository } = buildHarness({ appliedMediaEpoch: 2 });
    const serviceWithoutRetention = new VoiceSessionService(
      repository as never,
    );
    await expect(
      serviceWithoutRetention.purgeExpiredDialogueSnapshotPurgeReceipts(
        "operator-1",
        false,
      ),
    ).rejects.toMatchObject({ code: "VOICE_RETENTION_POLICY_UNAVAILABLE" });
    expect(repository.retireDialogueSnapshotPurgeReceipt).not.toHaveBeenCalled();
  });
});

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-entry (Codex reopen round
 * 15/16): the real `GET /sessions/{sessionId}` read (SD §10.1)
 * `MediaWorkerServer`'s admission path uses to resolve a
 * `VoiceSessionBinding` -- `issueCapability` already requires the caller
 * to supply resourceScopeId/routeProfileVersion/leaseEpoch, so it cannot
 * be how a worker first discovers them. Only the repository boundary is
 * doubled; `VoiceSessionService.getSession` runs for real.
 */
describe("VoiceSessionService.getSession (R4-entry)", () => {
  it("returns the real, current session record for an admitted id", async () => {
    const { service, session } = buildHarness();

    const result = await service.getSession(VOICE_SESSION_ID);

    expect(result).toEqual(session);
  });

  it("rejects, never fabricating a session, for an id with no durable row (e.g. the real SD §4.1 provider webhook never created one)", async () => {
    const { service } = buildHarness();

    await expect(service.getSession("no-such-session")).rejects.toMatchObject({
      code: "VOICE_SESSION_NOT_OWNER",
    });
  });
});
