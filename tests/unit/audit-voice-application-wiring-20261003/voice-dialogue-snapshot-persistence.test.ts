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
  type DialogueSnapshotPurgeReceiptCursor,
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
  // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention held-page
  // starvation (Codex reopen, canonical 2026-10-04T0X:XX:XXZ): in-memory
  // stand-in for `voice.dialogue_snapshot_purge_receipt_scan_cursor`,
  // mirroring the real repository's single durable row across invocations
  // of `purgeExpiredDialogueSnapshotPurgeReceipts` within one test.
  let scanCursor: DialogueSnapshotPurgeReceiptCursor | null = null;

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
      async (
        purgedBefore: string,
        limit = 200,
        cursor?: DialogueSnapshotPurgeReceiptCursor,
      ) => {
        const key = (r: DialogueSnapshotPurgeReceiptRow) =>
          `${r.purgedAt} ${r.voiceSessionId} ${String(r.sessionVersion).padStart(20, "0")}`;
        const cursorKey = cursor
          ? `${cursor.purgedAtCursor} ${cursor.voiceSessionId} ${String(cursor.sessionVersion).padStart(20, "0")}`
          : null;
        return purgeReceipts
          .filter(
            (r) =>
              new Date(r.purgedAt).getTime() <=
              new Date(purgedBefore).getTime(),
          )
          .filter((r) => cursorKey === null || key(r) > cursorKey)
          .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
          .slice(0, limit)
          // This fake's `purgedAt` is already a plain ISO string with no
          // sub-millisecond component to lose -- see
          // `tests/integration/unattended-voice-postgres.integration.test.ts`
          // for the real-Postgres-precision regression (F3) this cannot
          // exercise.
          .map((r) => ({ ...r, purgedAtCursor: r.purgedAt }));
      },
    ),
    getDialogueSnapshotPurgeReceiptScanCursor: vi.fn(async () => scanCursor),
    saveDialogueSnapshotPurgeReceiptScanCursor: vi.fn(
      async (next: DialogueSnapshotPurgeReceiptCursor | null) => {
        scanCursor = next;
      },
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

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention
   * history-unavailable write fence (Codex reopen, canonical
   * 2026-10-04T03:06:22Z, "history-unavailable write response falsely
   * becomes definitive non-acceptance"): a prior version of this test
   * asserted `VOICE_DIALOGUE_SNAPSHOT_VOIDED` here -- but this version was
   * never authoritatively voided by a later reconciliation (that is what
   * `dialogue_snapshot_fence_version`/the SIBLING "late-acceptance fence"
   * test above covers); it was genuinely ACCEPTED, and only the governed
   * metadata proof of that (the purge receipt) has since aged out. The
   * caller must get the dedicated, deliberately non-whitelisted
   * `VOICE_DIALOGUE_SNAPSHOT_HISTORY_UNAVAILABLE` code (see
   * `persistDialogueSnapshot`'s own doc) -- and `resolveDialogueSnapshotOutcome`
   * for the SAME identity must report `accepted: "unknown"`, never a
   * confirmed non-acceptance either.
   */
  it("rejects a write at a version whose purge receipt has since been governed-retired as history-unavailable (receipt gone, but the floor still blocks reuse) -- never as a confirmed void", async () => {
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
    ).rejects.toMatchObject({
      code: "VOICE_DIALOGUE_SNAPSHOT_HISTORY_UNAVAILABLE",
    });

    const outcome = await service.resolveDialogueSnapshotOutcome({
      voiceSessionId: VOICE_SESSION_ID,
      expectedSessionVersion: 5,
      expectedLeaseEpoch: 1,
      expectedResourceScopeId: RESOURCE_SCOPE_ID,
      expectedRouteProfileVersion: 1,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "some-other-unverified-turn",
    });
    expect(outcome).toMatchObject({ accepted: "unknown" });
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention (Codex reopen,
   * canonical 2026-10-04T0X:XX:XXZ, "another turn's version fence still
   * misclassifies retired accepted history as definitive rejection"): both
   * `dialogueSnapshotFenceVersion` and `dialogueSnapshotHistoryUnavailableFloor`
   * are raised per-VERSION, never per-identity, so they can legitimately
   * both reach the SAME version from two DIFFERENT turns -- turn A was
   * genuinely accepted here and its receipt later governed-retired
   * (raising the floor), while a SEPARATE, never-accepted turn B's own
   * `resolveDialogueSnapshotOutcome` call against the SAME version
   * independently raised the fence. A fence B caused is not proof turn A
   * (or any identity at this version) was never accepted; checking it
   * before the floor used to tell A's retry it was "authoritatively
   * voided" -- a confirmed rejection -- when A's own history is merely
   * unavailable, not disproven.
   */
  it("[F1 regression] a different turn's fence at the SAME version must never make THIS turn's genuinely-accepted-then-retired history report as a confirmed void", async () => {
    const { service, repository, snapshots } = buildHarness({
      appliedMediaEpoch: 2,
    });

    // Turn A is genuinely accepted and persisted at session_version 5.
    await service.persistDialogueSnapshot(
      validCommand({ turnId: "accepted-turn-A" }),
    );
    snapshots[0]!.retentionExpiresAt = new Date(
      Date.now() - 1000,
    ).toISOString();
    await repository.deleteDialogueSnapshot(VOICE_SESSION_ID, 5);

    // A DIFFERENT, never-accepted turn B adjudicates the SAME version --
    // this legitimately raises dialogueSnapshotFenceVersion to 5, but says
    // nothing about turn A's own acceptance.
    const bOutcome = await service.resolveDialogueSnapshotOutcome({
      voiceSessionId: VOICE_SESSION_ID,
      expectedSessionVersion: 5,
      expectedLeaseEpoch: 1,
      expectedResourceScopeId: RESOURCE_SCOPE_ID,
      expectedRouteProfileVersion: 1,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "rejected-turn-B",
    });
    expect(bOutcome).toMatchObject({ accepted: false, fenceVersion: 5 });

    // The governed purge-receipt lifecycle now retires A's own receipt,
    // raising the history-unavailable floor to the SAME version 5 -- both
    // watermarks now overlap at this exact version.
    await repository.retireDialogueSnapshotPurgeReceipt(VOICE_SESSION_ID, 5);

    // Resolving A again is genuinely ambiguous (its receipt is retired).
    const aResolve = await service.resolveDialogueSnapshotOutcome({
      voiceSessionId: VOICE_SESSION_ID,
      expectedSessionVersion: 5,
      expectedLeaseEpoch: 1,
      expectedResourceScopeId: RESOURCE_SCOPE_ID,
      expectedRouteProfileVersion: 1,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "accepted-turn-A",
    });
    expect(aResolve).toMatchObject({ accepted: "unknown" });

    // A retry of A's OWN persist must get the ambiguous
    // HISTORY_UNAVAILABLE code, never VOICE_DIALOGUE_SNAPSHOT_VOIDED --
    // the fence overlapping this version belongs to B, not A.
    await expect(
      service.persistDialogueSnapshot(
        validCommand({ turnId: "accepted-turn-A" }),
      ),
    ).rejects.toMatchObject({
      code: "VOICE_DIALOGUE_SNAPSHOT_HISTORY_UNAVAILABLE",
    });
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist overlapping
   * version-fence misclassification (Codex reopen, canonical
   * 2026-10-04T04:28:50Z, "the same previously accepted identity can be
   * reported accepted by resolve but treated as never accepted by
   * retry/recovery"): the SIBLING test above already covers the case where
   * A's own surviving proof (row AND receipt) is gone by the time its
   * fence-overlapping retry lands -- that one still correctly reports
   * HISTORY_UNAVAILABLE. This covers the narrower, previously-unfixed gap:
   * a fence some OTHER turn raised at the SAME version must never
   * disprove THIS identity's surviving acceptance proof while that proof
   * (a still-live row, an already-expired-but-not-yet-purged row, or an
   * intact purge receipt) still correlates. Walks the full
   * live -> expired -> purged -> receipt-retired lifecycle, asserting the
   * exact resolve/persist pairing at every step.
   */
  it("[R34-F1 regression] a different turn's fence at this version never disproves THIS turn's own still-surviving acceptance proof, through the live/expired/purged/retired lifecycle", async () => {
    const { service, repository, snapshots } = buildHarness({
      appliedMediaEpoch: 2,
    });
    const urgentContent = {
      ...validContent,
      handoff: { reason: "urgent_safety", intent: "emergency" },
    };
    const commandA = validCommand({
      turnId: "accepted-A",
      content: urgentContent,
    });

    // 1-2. Turn A is genuinely accepted; an exact retry BEFORE any fence
    // exists is the positive control (already-correct safe dedup).
    const firstA = await service.persistDialogueSnapshot(commandA);
    expect(firstA.deduped).toBe(false);
    const retryBeforeFence = await service.persistDialogueSnapshot(commandA);
    expect(retryBeforeFence.deduped).toBe(true);
    expect(retryBeforeFence.snapshot.content).toEqual(urgentContent);

    // 3. A DIFFERENT, never-accepted turn B adjudicates the SAME version --
    // this legitimately raises dialogueSnapshotFenceVersion to 5, but says
    // nothing about turn A's own acceptance.
    const bOutcome = await service.resolveDialogueSnapshotOutcome({
      voiceSessionId: VOICE_SESSION_ID,
      expectedSessionVersion: 5,
      expectedLeaseEpoch: 1,
      expectedResourceScopeId: RESOURCE_SCOPE_ID,
      expectedRouteProfileVersion: 1,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "different-B",
    });
    expect(bOutcome).toMatchObject({ accepted: false, fenceVersion: 5 });

    // 4. A's own resolve still reports its real, live, surviving content --
    // and a retry of A's OWN exact persist must succeed (safe dedup), never
    // VOICE_DIALOGUE_SNAPSHOT_VOIDED, despite the fence B just raised.
    const aResolveLive = await service.resolveDialogueSnapshotOutcome({
      voiceSessionId: VOICE_SESSION_ID,
      expectedSessionVersion: 5,
      expectedLeaseEpoch: 1,
      expectedResourceScopeId: RESOURCE_SCOPE_ID,
      expectedRouteProfileVersion: 1,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "accepted-A",
    });
    expect(aResolveLive).toMatchObject({ accepted: true });
    if (aResolveLive.accepted === true && "snapshot" in aResolveLive) {
      expect(aResolveLive.snapshot.content).toEqual(urgentContent);
    }
    const persistAfterLiveFence =
      await service.persistDialogueSnapshot(commandA);
    expect(persistAfterLiveFence.deduped).toBe(true);
    expect(persistAfterLiveFence.snapshot.content).toEqual(urgentContent);

    // 5. Advance past A's own content expiry (row still physically present,
    // not yet purged). Resolve reports accepted/expired with no content;
    // retry of A's own persist must still succeed as a safe dedup, never
    // VOIDED.
    const liveRow = snapshots.find(
      (s) => s.voiceSessionId === VOICE_SESSION_ID && s.sessionVersion === 5,
    )!;
    liveRow.retentionExpiresAt = new Date(Date.now() - 1000).toISOString();
    const aResolveExpired = await service.resolveDialogueSnapshotOutcome({
      voiceSessionId: VOICE_SESSION_ID,
      expectedSessionVersion: 5,
      expectedLeaseEpoch: 1,
      expectedResourceScopeId: RESOURCE_SCOPE_ID,
      expectedRouteProfileVersion: 1,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "accepted-A",
    });
    expect(aResolveExpired).toMatchObject({ accepted: true, expired: true });
    expect(aResolveExpired).not.toHaveProperty("snapshot");
    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R36-F1 expired-dedup
    // disclosure (Codex reopen, canonical 2026-10-04T05:03:45Z): a
    // surviving expired row proves historical acceptance only -- the dedup
    // retry must never decrypt/disclose its content, and must never be
    // misreported as VOICE_DIALOGUE_SNAPSHOT_VOIDED (expiry is not
    // rejection). It rejects with a dedicated, non-definitive code instead,
    // routing the caller to resolveDialogueSnapshotOutcome's own
    // already-correct accepted/expired-without-content fact.
    await expect(
      service.persistDialogueSnapshot(commandA),
    ).rejects.toMatchObject({ code: "VOICE_DIALOGUE_SNAPSHOT_EXPIRED" });

    // 6. The governed sweep purges the expired row, preserving a bounded
    // receipt. Resolve still reports accepted/expired from the receipt;
    // retry of A's own persist must now get the ambiguous
    // VOICE_DIALOGUE_SNAPSHOT_PURGED -- an honest "already accepted, key
    // immutable" conflict -- never the "authoritatively voided" VOIDED
    // code B's fence would otherwise imply.
    await service.purgeExpiredDialogueSnapshots("operator-1", false);
    expect(
      snapshots.some(
        (s) => s.voiceSessionId === VOICE_SESSION_ID && s.sessionVersion === 5,
      ),
    ).toBe(false);
    const aResolvePurged = await service.resolveDialogueSnapshotOutcome({
      voiceSessionId: VOICE_SESSION_ID,
      expectedSessionVersion: 5,
      expectedLeaseEpoch: 1,
      expectedResourceScopeId: RESOURCE_SCOPE_ID,
      expectedRouteProfileVersion: 1,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "accepted-A",
    });
    expect(aResolvePurged).toMatchObject({ accepted: true, expired: true });
    await expect(service.persistDialogueSnapshot(commandA)).rejects.toMatchObject(
      { code: "VOICE_DIALOGUE_SNAPSHOT_PURGED" },
    );

    // 7. Once the receipt itself is governed-retired (its own
    // voice_booking_evidence retention aged out), surviving proof is
    // genuinely gone -- this control remains correctly repaired from the
    // earlier R4-retention rounds: resolve is honestly "unknown" and
    // persist is the ambiguous HISTORY_UNAVAILABLE (never VOIDED either).
    const retiredReceipt = await repository.findDialogueSnapshotPurgeReceipt(
      VOICE_SESSION_ID,
      5,
    );
    expect(retiredReceipt).not.toBeNull();
    (
      await repository.findDialogueSnapshotPurgeReceipt(VOICE_SESSION_ID, 5)
    )!.purgedAt = new Date(
      Date.now() - 731 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await service.purgeExpiredDialogueSnapshotPurgeReceipts(
      "operator-1",
      false,
    );
    const aResolveRetired = await service.resolveDialogueSnapshotOutcome({
      voiceSessionId: VOICE_SESSION_ID,
      expectedSessionVersion: 5,
      expectedLeaseEpoch: 1,
      expectedResourceScopeId: RESOURCE_SCOPE_ID,
      expectedRouteProfileVersion: 1,
      inputEpoch: 3,
      mediaEpoch: 2,
      turnId: "accepted-A",
    });
    expect(aResolveRetired).toMatchObject({ accepted: "unknown" });
    await expect(service.persistDialogueSnapshot(commandA)).rejects.toMatchObject(
      { code: "VOICE_DIALOGUE_SNAPSHOT_HISTORY_UNAVAILABLE" },
    );
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R36-F1 expired-dedup disclosure
   * (Codex reopen, canonical 2026-10-04T05:03:45Z): "a surviving expired row
   * proves historical acceptance, but must not authorize
   * decryption/disclosure as an ordinary snapshot." On the SHA this reopen
   * identified, an exact retry after expiry (but before governed purge)
   * still reached the unconditional dedup decrypt and returned
   * `deduped: true` with live plaintext `content`, even though the row's
   * own `retentionExpiresAt` had already passed -- the same non-disclosure
   * boundary `resolveDialogueSnapshotOutcome` already enforces (never
   * decrypting an expired row) did not exist on this path. This minimal
   * reproduction: (1) persists real urgent_safety/emergency content as a
   * positive control -- an exact retry while still live must keep returning
   * it, never regressing R34-F1's fix; (2) advances the clock past the
   * row's own policy-derived `retentionExpiresAt` without altering it or
   * purging the row; (3) asserts the identical retry now rejects without
   * ever exposing `content` anywhere on the thrown error, and that the
   * underlying repository row itself still physically holds the original
   * ciphertext (proving the fix withholds disclosure rather than mutating/
   * erasing accepted history).
   */
  it("[R36-F1 regression] an exact retry of an already-accepted turn never decrypts/discloses content once the row has expired, though it still does so while live", async () => {
    const { service, snapshots } = buildHarness({ appliedMediaEpoch: 2 });
    const urgentContent = {
      ...validContent,
      handoff: { reason: "urgent_safety", intent: "emergency" },
    };
    const command = validCommand({
      turnId: "accepted-urgent",
      content: urgentContent,
    });

    const first = await service.persistDialogueSnapshot(command);
    expect(first.deduped).toBe(false);

    // Positive control: still live, the exact retry safely dedups WITH
    // content -- this must keep working; only the expired case changes.
    const liveRetry = await service.persistDialogueSnapshot(command);
    expect(liveRetry.deduped).toBe(true);
    expect(liveRetry.snapshot.content).toEqual(urgentContent);

    const row = snapshots.find(
      (s) => s.voiceSessionId === VOICE_SESSION_ID && s.sessionVersion === 5,
    )!;
    const originalCiphertext = Buffer.from(row.contentCiphertext);
    row.retentionExpiresAt = new Date(Date.now() - 1000).toISOString();

    let caught: unknown;
    try {
      await service.persistDialogueSnapshot(command);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught).toMatchObject({ code: "VOICE_DIALOGUE_SNAPSHOT_EXPIRED" });
    // The defect this guards against was disclosure through the success
    // response's `snapshot.content` -- assert no decrypted content leaked
    // anywhere onto the thrown error object either.
    expect(JSON.stringify(caught)).not.toContain("urgent_safety");
    expect(JSON.stringify(caught)).not.toContain("emergency");
    // The row itself is untouched (not purged, not re-keyed, not voided) --
    // this is a disclosure fix, not a retention/acceptance-classification
    // change.
    expect(row.contentCiphertext.equals(originalCiphertext)).toBe(true);
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

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention held-page
   * starvation (Codex reopen, canonical 2026-10-04T03:06:22Z): minimal
   * reproduction of the exact trigger -- a legally-held run exactly
   * filling the first page (oldest `purged_at`), with one unheld eligible
   * receipt strictly behind it. Against the OLD single-page scan this
   * receipt could never be reached (`totalExamined` would stop at 200,
   * `deletedCount` at 0) no matter how many times the sweep reran; the
   * paginated scan must advance past the held run WITHIN this one call.
   */
  it("pages past a held run so an eligible receipt behind it is still purged in the same sweep", async () => {
    const harness = buildHarness({ appliedMediaEpoch: 2 });
    const { service, repository, retentionService, purgeReceipts } = harness;
    const HELD_SESSION_ID = "33333333-3333-4333-8333-333333333333";
    retentionService.placeLegalHold({
      caseNumber: "CASE-HELD",
      evidenceFamily: "voice_booking_evidence",
      subjectRef: HELD_SESSION_ID,
      reasonCode: "regulatory_inquiry",
      placedBy: "ops-1",
    });
    // Fills the first page (limit 200) with receipts that are strictly
    // OLDER (by purged_at) than the single eligible receipt below, all
    // under the same active legal hold.
    for (let version = 1; version <= 200; version++) {
      purgeReceipts.push({
        voiceSessionId: HELD_SESSION_ID,
        sessionVersion: version,
        inputEpoch: 1,
        mediaEpoch: 1,
        turnId: `held-turn-${version}`,
        retentionExpiresAt: new Date(Date.now() + 1000).toISOString(),
        purgedAt: new Date(
          Date.now() - 731 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });
    }
    // One unheld, eligible receipt with a LATER purged_at than the held
    // page (so it sorts strictly after it) but still past the governed
    // voice_booking_evidence retention window.
    purgeReceipts.push({
      voiceSessionId: VOICE_SESSION_ID,
      sessionVersion: 1,
      inputEpoch: 1,
      mediaEpoch: 1,
      turnId: "eligible-turn",
      retentionExpiresAt: new Date(Date.now() + 1000).toISOString(),
      purgedAt: new Date(
        Date.now() - 730 * 24 * 60 * 60 * 1000 - 1000,
      ).toISOString(),
    });

    const { report, deletedCount } =
      await service.purgeExpiredDialogueSnapshotPurgeReceipts(
        "operator-1",
        false,
      );

    expect(report.totalExamined).toBe(201);
    expect(report.skippedHeldCount).toBe(200);
    expect(report.purgedCount).toBe(1);
    expect(deletedCount).toBe(1);
    expect(repository.retireDialogueSnapshotPurgeReceipt).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      1,
    );
    expect(repository.findExpiredDialogueSnapshotPurgeReceipts).toHaveBeenCalledTimes(2);
    expect(purgeReceipts).toHaveLength(200);
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

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention held-page
   * starvation (Codex reopen, canonical 2026-10-04T0X:XX:XXZ, "the 50-page
   * cap merely moves the held-prefix starvation point to 10,000
   * receipts"): a held run deeper than
   * `MAX_PURGE_RECEIPT_SCAN_PAGES * PURGE_RECEIPT_SCAN_PAGE_LIMIT` (200 *
   * 50 = 10,000) cannot be fully walked in one invocation -- that alone is
   * an acceptable, bounded safety limit. What must NOT happen is the next
   * invocation restarting at the SAME oldest held row: against the OLD
   * code (fresh `cursor = undefined` every call) this would re-examine the
   * identical 10,000 held receipts forever, never reaching the single
   * unheld one just behind them. The fix persists the stop position across
   * invocations.
   */
  it("persists the scan cursor across invocations so a held run deeper than one invocation's page bound does not starve an eligible receipt behind it forever", async () => {
    const harness = buildHarness({ appliedMediaEpoch: 2 });
    const { service, repository, retentionService, purgeReceipts } = harness;
    const HELD_SESSION_ID = "44444444-4444-4444-8444-444444444444";
    retentionService.placeLegalHold({
      caseNumber: "CASE-HELD-DEEP",
      evidenceFamily: "voice_booking_evidence",
      subjectRef: HELD_SESSION_ID,
      reasonCode: "regulatory_inquiry",
      placedBy: "ops-1",
    });
    const base = Date.now() - 800 * 24 * 60 * 60 * 1000;
    for (let version = 1; version <= 10_000; version++) {
      purgeReceipts.push({
        voiceSessionId: HELD_SESSION_ID,
        sessionVersion: version,
        inputEpoch: 1,
        mediaEpoch: 1,
        turnId: `held-turn-${version}`,
        retentionExpiresAt: new Date(Date.now() + 1000).toISOString(),
        purgedAt: new Date(base + version).toISOString(),
      });
    }
    // One unheld, eligible receipt sorting strictly AFTER the entire held
    // run (later purged_at), also past the governed retention window.
    purgeReceipts.push({
      voiceSessionId: VOICE_SESSION_ID,
      sessionVersion: 1,
      inputEpoch: 1,
      mediaEpoch: 1,
      turnId: "eligible-turn",
      retentionExpiresAt: new Date(Date.now() + 1000).toISOString(),
      purgedAt: new Date(base + 10_001).toISOString(),
    });

    const first = await service.purgeExpiredDialogueSnapshotPurgeReceipts(
      "operator-1",
      false,
    );
    expect(first.report.totalExamined).toBe(10_000);
    expect(first.report.skippedHeldCount).toBe(10_000);
    expect(first.report.purgedCount).toBe(0);
    expect(first.deletedCount).toBe(0);
    expect(
      repository.findExpiredDialogueSnapshotPurgeReceipts,
    ).toHaveBeenCalledTimes(50);
    // The cursor persisted after the first (bound-exhausted) invocation
    // must be defined -- NOT the fresh-every-call `undefined` the old code
    // always passed.
    const persistedCursor =
      await repository.getDialogueSnapshotPurgeReceiptScanCursor();
    expect(persistedCursor).toMatchObject({ sessionVersion: 10_000 });

    const second = await service.purgeExpiredDialogueSnapshotPurgeReceipts(
      "operator-1",
      false,
    );
    // The SECOND invocation's own first page call (call #51 overall) must
    // have been made WITH that persisted cursor, not a fresh `undefined`
    // that would re-examine the same 10,000 held receipts again.
    const secondInvocationFirstCall =
      repository.findExpiredDialogueSnapshotPurgeReceipts.mock.calls[50]!;
    expect(secondInvocationFirstCall[2]).toMatchObject({
      sessionVersion: 10_000,
    });
    expect(second.report.totalExamined).toBe(1);
    expect(second.report.purgedCount).toBe(1);
    expect(second.deletedCount).toBe(1);
    expect(repository.retireDialogueSnapshotPurgeReceipt).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      1,
    );
    // The scan has now genuinely caught up to the end of the backlog --
    // the cursor is cleared so a later invocation re-checks released
    // holds from the oldest row again.
    expect(
      await repository.getDialogueSnapshotPurgeReceiptScanCursor(),
    ).toBeNull();
  });

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention preview cursor
   * starvation (Codex reopen, canonical 2026-10-04T04:28:50Z, "preview
   * still consumes/reset apply cursor and starves eligible receipt"):
   * before this fix, a `dryRun=true` call read the SAME durable cursor
   * `apply` uses and, once ITS OWN bounded scan (resuming from apply's
   * progress) reached the backlog end, persisted `null` -- silently
   * discarding every page of real progress `apply` had already made.
   * Interleaving a dry-run preview between two `apply` calls must never
   * change what the SECOND `apply` call examines or purges, no matter how
   * many preview calls run in between.
   */
  it("[R34-F2 regression] a dry-run preview interleaved between apply calls never resets apply's own cursor or starves the eligible receipt behind a deep held run", async () => {
    const harness = buildHarness({ appliedMediaEpoch: 2 });
    const { service, repository, retentionService, purgeReceipts } = harness;
    const HELD_SESSION_ID = "55555555-5555-4555-8555-555555555555";
    retentionService.placeLegalHold({
      caseNumber: "CASE-HELD-PREVIEW",
      evidenceFamily: "voice_booking_evidence",
      subjectRef: HELD_SESSION_ID,
      reasonCode: "regulatory_inquiry",
      placedBy: "ops-1",
    });
    const base = Date.now() - 800 * 24 * 60 * 60 * 1000;
    for (let version = 1; version <= 10_000; version++) {
      purgeReceipts.push({
        voiceSessionId: HELD_SESSION_ID,
        sessionVersion: version,
        inputEpoch: 1,
        mediaEpoch: 1,
        turnId: `held-turn-${version}`,
        retentionExpiresAt: new Date(Date.now() + 1000).toISOString(),
        purgedAt: new Date(base + version).toISOString(),
      });
    }
    purgeReceipts.push({
      voiceSessionId: VOICE_SESSION_ID,
      sessionVersion: 1,
      inputEpoch: 1,
      mediaEpoch: 1,
      turnId: "eligible-turn",
      retentionExpiresAt: new Date(Date.now() + 1000).toISOString(),
      purgedAt: new Date(base + 10_001).toISOString(),
    });

    // Apply #1: bounded by MAX_PURGE_RECEIPT_SCAN_PAGES, lands entirely
    // inside the held run and persists its own stop position.
    const apply1 = await service.purgeExpiredDialogueSnapshotPurgeReceipts(
      "operator-1",
      false,
    );
    expect(apply1.report.totalExamined).toBe(10_000);
    expect(apply1.deletedCount).toBe(0);
    const cursorAfterApply1 =
      await repository.getDialogueSnapshotPurgeReceiptScanCursor();
    expect(cursorAfterApply1).toMatchObject({ sessionVersion: 10_000 });

    // A dry-run preview, repeated three times, must be purely observational
    // -- it may report on today's backlog, but it must never read or
    // perturb apply's own durable cursor.
    for (let i = 0; i < 3; i++) {
      const preview = await service.purgeExpiredDialogueSnapshotPurgeReceipts(
        "operator-1",
        true,
      );
      expect(preview.report.mode).toBe("dry-run");
      expect(preview.deletedCount).toBe(0);
      expect(repository.retireDialogueSnapshotPurgeReceipt).not.toHaveBeenCalled();
      expect(
        await repository.getDialogueSnapshotPurgeReceiptScanCursor(),
      ).toMatchObject({ sessionVersion: 10_000 });
    }

    // Apply #2 must resume from apply #1's own persisted position --
    // completely unaffected by the dry-run previews in between -- and
    // actually reach and purge the single eligible receipt.
    const apply2 = await service.purgeExpiredDialogueSnapshotPurgeReceipts(
      "operator-1",
      false,
    );
    expect(apply2.report.totalExamined).toBe(1);
    expect(apply2.report.purgedCount).toBe(1);
    expect(apply2.deletedCount).toBe(1);
    expect(repository.retireDialogueSnapshotPurgeReceipt).toHaveBeenCalledWith(
      VOICE_SESSION_ID,
      1,
    );
    expect(
      await repository.getDialogueSnapshotPurgeReceiptScanCursor(),
    ).toBeNull();
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
