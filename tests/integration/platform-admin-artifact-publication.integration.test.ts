import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { PlacardVersionRecord } from "@drts/contracts";

import { DatabaseService } from "../../apps/api/src/common/db";
import { PlatformAdminRepository } from "../../apps/api/src/modules/platform-admin/platform-admin.repository";

/**
 * Real-PostgreSQL matrix for `PlatformAdminRepository`'s placard
 * claim/finalize/release/generic-writer guards (AUDIT-ARTIFACT-DURABILITY-
 * 20261002 R7-followthrough/R8/R9). Every prior round proved these guards'
 * SQL text and binding against a fake query transport that models the same
 * semantics in JS; none of that exercises real PostgreSQL JSONB `->>` text
 * comparison, real `NOW() - INTERVAL`, or two genuinely separate
 * connections racing the same `UPDATE`/`INSERT ... ON CONFLICT`. This file
 * runs the actual repository, actual SQL, against a real database -- in
 * the existing hosted `unit` CI job's PostgreSQL service, after
 * `pnpm db:migrate` has applied the real schema. It intentionally stays at
 * the repository layer (no `DocumentArtifactStore`/S3): the byte-ownership
 * fence Codex's reopen asked for is proven at the real S3 adapter/service
 * layer in `tests/unit/audit-artifact-durability-s3-20261003.test.ts` and
 * `tests/unit/audit-artifact-durability-20261002.test.ts`, with only the
 * DB claim transport mocked there (the inverse of what this file does);
 * neither a real S3 bucket nor a real Postgres+S3 combination is available
 * from this VM or this CI job. Real multi-replica Cloud Run acceptance,
 * combining both, remains `SR-LIVE-DOC-001`.
 */

const DATABASE_URL = process.env.DATABASE_URL;

function minimalPublicInfoVersionId() {
  return `public-info-${randomUUID()}`;
}

function basePlacard(
  placardVersionId: string,
  overrides: Partial<PlacardVersionRecord> = {},
): PlacardVersionRecord {
  const now = new Date().toISOString();
  return {
    placardVersionId,
    versionCode: "artifact-publication-pg-matrix",
    publicInfoVersionId: minimalPublicInfoVersionId(),
    templateName: "seatback",
    artifactFileId: null,
    artifactManifestHash: null,
    artifactDownloadUrl: null,
    artifactExpiresAt: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function withClaimToken(
  record: PlacardVersionRecord,
  token: string,
): PlacardVersionRecord & { __publishClaimToken: string } {
  return { ...record, __publishClaimToken: token };
}

// Mirrors the ONLY shape `PlatformAdminService.publishPlacardVersionExclusive`
// ever hands to `claimPlacardPublish` (platform-admin.service.ts:978-981):
// `publishedAt`/`updatedAt` are stamped to "now" on the staged record BEFORE
// the claim attempt, never left `null`. The repository's claim guard
// (`record->>'publishedAt' IS NULL OR (token present AND stale)`) depends on
// that: a claim attempt that still carries `publishedAt: null` looks
// indistinguishable from a brand-new, never-claimed row, so a second
// concurrent claim of the same placard -- or a too-young reclaim -- would
// wrongly be admitted by the first disjunct instead of being exercised
// through the token/staleness guard this suite means to test.
function stagedClaim(
  record: PlacardVersionRecord,
  token: string,
): PlacardVersionRecord & { __publishClaimToken: string } {
  const now = new Date().toISOString();
  return withClaimToken({ ...record, publishedAt: now, updatedAt: now }, token);
}

type RawRow = {
  record: PlacardVersionRecord & { __publishClaimToken?: string | null };
};

function claimTokenOf(
  record: PlacardVersionRecord | null | undefined,
): string | null | undefined {
  return (record as { __publishClaimToken?: string | null } | null | undefined)
    ?.__publishClaimToken;
}

// Opt-in real PostgreSQL only, matching this directory's established
// convention (see sr-partner-notify-nav-20260917.integration.test.ts):
// `pnpm run test:unit` sweeps every file under `tests/integration/**` by
// default, including on a developer machine with no database configured
// at all, so this suite must skip cleanly rather than hard-fail when
// `DATABASE_URL` is absent. The hosted `unit` CI job always provisions a
// real PostgreSQL service and runs `pnpm db:migrate` immediately before
// `pnpm run test:unit`, so there this suite actually runs, against the
// real migrated schema.
describe.skipIf(!DATABASE_URL)(
  "platform-admin placard publication real-PostgreSQL matrix",
  () => {
    const databases: DatabaseService[] = [];
    const placardIds = new Set<string>();

    afterEach(async () => {
      if (DATABASE_URL) {
        const cleanup = new DatabaseService();
        try {
          for (const placardVersionId of placardIds) {
            await cleanup.query(
              "DELETE FROM admin.phase1_placard_versions WHERE placard_version_id = $1",
              [placardVersionId],
            );
          }
        } finally {
          placardIds.clear();
          await cleanup.onModuleDestroy();
        }
      }

      for (const database of databases.splice(0)) {
        await database.onModuleDestroy();
      }
    });

    function newRepository() {
      const database = new DatabaseService();
      databases.push(database);
      return new PlatformAdminRepository(database);
    }

    async function readRow(
      placardVersionId: string,
    ): Promise<RawRow["record"] | null> {
      const database = new DatabaseService();
      try {
        const result = await database.query<RawRow>(
          "SELECT record FROM admin.phase1_placard_versions WHERE placard_version_id = $1",
          [placardVersionId],
        );
        return result.rows[0]?.record ?? null;
      } finally {
        await database.onModuleDestroy();
      }
    }

    it("claimPlacardPublish: exactly one of two concurrent real connections wins a fresh placard's claim", async () => {
      const placardVersionId = `pg-matrix-race-${randomUUID()}`;
      placardIds.add(placardVersionId);

      const repoA = newRepository();
      const repoB = newRepository();
      const base = basePlacard(placardVersionId);

      const [resultA, resultB] = await Promise.all([
        repoA.claimPlacardPublish(stagedClaim(base, `token-a-${randomUUID()}`)),
        repoB.claimPlacardPublish(stagedClaim(base, `token-b-${randomUUID()}`)),
      ]);

      const claimed = [resultA, resultB].filter((r) => r.claimed);
      const rejected = [resultA, resultB].filter((r) => !r.claimed);
      expect(claimed).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(claimTokenOf(rejected[0]!.currentRecord)).toBe(
        claimTokenOf(claimed[0]!.currentRecord),
      );

      const row = await readRow(placardVersionId);
      expect(row?.__publishClaimToken).toBeTruthy();
      expect(row?.publishedAt).toBeTruthy();
    });

    it("claimPlacardPublish: a pending claim younger than 2 minutes is not reclaimable", async () => {
      const placardVersionId = `pg-matrix-fresh-pending-${randomUUID()}`;
      placardIds.add(placardVersionId);

      const owner = newRepository();
      const originalToken = `token-owner-${randomUUID()}`;
      const claimed = await owner.claimPlacardPublish(
        stagedClaim(basePlacard(placardVersionId), originalToken),
      );
      expect(claimed.claimed).toBe(true);

      const challenger = newRepository();
      const reclaim = await challenger.claimPlacardPublish(
        stagedClaim(
          basePlacard(placardVersionId),
          `token-challenger-${randomUUID()}`,
        ),
      );

      expect(reclaim.claimed).toBe(false);
      const row = await readRow(placardVersionId);
      expect(row?.__publishClaimToken).toBe(originalToken);
    });

    it("claimPlacardPublish: a pending claim older than 2 minutes IS reclaimable, using real NOW() - INTERVAL", async () => {
      const placardVersionId = `pg-matrix-stale-pending-${randomUUID()}`;
      placardIds.add(placardVersionId);

      const staleUpdatedAt = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const abandonedToken = `token-abandoned-${randomUUID()}`;
      const direct = new DatabaseService();
      databases.push(direct);
      // `publishedAt` must already be set here too -- an abandoned claim is
      // always a row that passed through the same `publishedAt`-stamping
      // staged write as every other claim attempt (see `stagedClaim`).
      // Leaving it `null` would let this reclaim succeed via the guard's
      // first disjunct (`publishedAt IS NULL`) instead of actually
      // exercising the "token present AND stale" branch this test means to
      // cover.
      const abandoned = withClaimToken(
        basePlacard(placardVersionId, {
          publishedAt: staleUpdatedAt,
          updatedAt: staleUpdatedAt,
        }),
        abandonedToken,
      );
      await direct.query(
        `
        INSERT INTO admin.phase1_placard_versions (
          placard_version_id, public_info_version_id, version_code,
          created_at, updated_at, record
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
        [
          abandoned.placardVersionId,
          abandoned.publicInfoVersionId,
          abandoned.versionCode,
          abandoned.createdAt,
          abandoned.updatedAt,
          JSON.stringify(abandoned),
        ],
      );

      const reclaimer = newRepository();
      const newToken = `token-reclaimer-${randomUUID()}`;
      const reclaim = await reclaimer.claimPlacardPublish(
        stagedClaim(basePlacard(placardVersionId), newToken),
      );

      expect(reclaim.claimed).toBe(true);
      const row = await readRow(placardVersionId);
      expect(row?.__publishClaimToken).toBe(newToken);
    });

    it("finalizePlacardPublish: wrong claim token is a no-op; correct token finalizes and drops the token", async () => {
      const placardVersionId = `pg-matrix-finalize-${randomUUID()}`;
      placardIds.add(placardVersionId);

      const repo = newRepository();
      const claimToken = `token-finalize-${randomUUID()}`;
      const claim = await repo.claimPlacardPublish(
        stagedClaim(basePlacard(placardVersionId), claimToken),
      );
      expect(claim.claimed).toBe(true);
      const wonClaim = claim.currentRecord!;

      const wrongAttempt = await repo.finalizePlacardPublish(
        { ...wonClaim, artifactManifestHash: "wrong-attempt-hash" },
        `wrong-${randomUUID()}`,
      );
      expect(wrongAttempt).toBe(false);
      const rowAfterWrongAttempt = await readRow(placardVersionId);
      expect(rowAfterWrongAttempt?.artifactManifestHash).not.toBe(
        "wrong-attempt-hash",
      );
      expect(rowAfterWrongAttempt?.__publishClaimToken).toBe(claimToken);

      const finalized = await repo.finalizePlacardPublish(
        { ...wonClaim, artifactManifestHash: "real-finalized-hash" },
        claimToken,
      );
      expect(finalized).toBe(true);

      const row = await readRow(placardVersionId);
      expect(row?.artifactManifestHash).toBe("real-finalized-hash");
      expect(row?.__publishClaimToken).toBeUndefined();
      expect(row?.publishedAt).toBeTruthy();
    });

    it("releasePlacardPublishClaim: requires both the claimed publishedAt and the exact token; a superseded claim cannot be released by the loser", async () => {
      const placardVersionId = `pg-matrix-release-${randomUUID()}`;
      placardIds.add(placardVersionId);

      const repo = newRepository();
      const claimToken = `token-release-${randomUUID()}`;
      const claim = await repo.claimPlacardPublish(
        stagedClaim(basePlacard(placardVersionId), claimToken),
      );
      expect(claim.claimed).toBe(true);
      const wonClaim = claim.currentRecord!;

      const revertedRecord: PlacardVersionRecord = {
        ...wonClaim,
        publishedAt: null,
        updatedAt: new Date().toISOString(),
      };
      delete (revertedRecord as { __publishClaimToken?: string })
        .__publishClaimToken;

      const wrongTokenRelease = await repo.releasePlacardPublishClaim(
        placardVersionId,
        wonClaim.publishedAt!,
        revertedRecord,
        `wrong-${randomUUID()}`,
      );
      expect(wrongTokenRelease).toBe(false);
      expect((await readRow(placardVersionId))?.__publishClaimToken).toBe(
        claimToken,
      );

      const finalized = await repo.finalizePlacardPublish(
        {
          ...wonClaim,
          artifactManifestHash: "finalized-before-release-attempt",
        },
        claimToken,
      );
      expect(finalized).toBe(true);

      // The claim is gone (finalized, no token) -- releasing against the
      // now-stale claimed publishedAt + original token must still be a no-op,
      // never regressing a finalized row back to unpublished.
      const releaseAfterFinalize = await repo.releasePlacardPublishClaim(
        placardVersionId,
        wonClaim.publishedAt!,
        revertedRecord,
        claimToken,
      );
      expect(releaseAfterFinalize).toBe(false);
      const row = await readRow(placardVersionId);
      expect(row?.publishedAt).toBeTruthy();
      expect(row?.artifactManifestHash).toBe(
        "finalized-before-release-attempt",
      );
    });

    it("releasePlacardPublishClaim: matching publishedAt AND matching token actually reverts the claim back to an unpublished, retryable draft", async () => {
      const placardVersionId = `pg-matrix-release-success-${randomUUID()}`;
      placardIds.add(placardVersionId);

      const repo = newRepository();
      const claimToken = `token-release-success-${randomUUID()}`;
      const claim = await repo.claimPlacardPublish(
        stagedClaim(basePlacard(placardVersionId), claimToken),
      );
      expect(claim.claimed).toBe(true);
      const wonClaim = claim.currentRecord!;

      const revertedRecord: PlacardVersionRecord = {
        ...wonClaim,
        publishedAt: null,
        updatedAt: new Date().toISOString(),
      };
      delete (revertedRecord as { __publishClaimToken?: string })
        .__publishClaimToken;

      // Both predicates (`record->>'publishedAt' = $4` AND
      // `record->>'__publishClaimToken' = $5`) genuinely match this exact
      // still-pending claim -- this is the real revert path a failed
      // render/store write takes, distinct from the two no-op branches the
      // test above already covers (wrong token; already finalized).
      const released = await repo.releasePlacardPublishClaim(
        placardVersionId,
        wonClaim.publishedAt!,
        revertedRecord,
        claimToken,
      );
      expect(released).toBe(true);

      const row = await readRow(placardVersionId);
      expect(row?.publishedAt).toBeNull();
      expect(row?.__publishClaimToken).toBeUndefined();

      // The now-unpublished row is retryable: a fresh claim attempt is
      // admitted again through the guard's first disjunct.
      const retry = await repo.claimPlacardPublish(
        stagedClaim(basePlacard(placardVersionId), `token-retry-${randomUUID()}`),
      );
      expect(retry.claimed).toBe(true);
    });

    it("releasePlacardPublishClaim: the exact token but a stale claimedPublishedAt is a no-op, distinguishing the two SQL predicates", async () => {
      const placardVersionId = `pg-matrix-release-wrong-publishedat-${randomUUID()}`;
      placardIds.add(placardVersionId);

      const repo = newRepository();
      const claimToken = `token-release-wrong-publishedat-${randomUUID()}`;
      const claim = await repo.claimPlacardPublish(
        stagedClaim(basePlacard(placardVersionId), claimToken),
      );
      expect(claim.claimed).toBe(true);
      const wonClaim = claim.currentRecord!;

      const revertedRecord: PlacardVersionRecord = {
        ...wonClaim,
        publishedAt: null,
        updatedAt: new Date().toISOString(),
      };
      delete (revertedRecord as { __publishClaimToken?: string })
        .__publishClaimToken;

      // The token matches exactly, but `claimedPublishedAt` names a
      // different instant than the row's actual `publishedAt` -- e.g. a
      // caller that staged its own claim a second time and is releasing
      // against a stale cached value. Neither predicate alone is this
      // call's guard; both the previous test (right publishedAt, wrong
      // token) and this one (right token, wrong publishedAt) must fail
      // for the guard to actually be AND, not OR.
      const staleDifferentPublishedAt = new Date(
        Date.parse(wonClaim.publishedAt!) - 1000,
      ).toISOString();
      const wrongPublishedAtRelease = await repo.releasePlacardPublishClaim(
        placardVersionId,
        staleDifferentPublishedAt,
        revertedRecord,
        claimToken,
      );
      expect(wrongPublishedAtRelease).toBe(false);

      const row = await readRow(placardVersionId);
      expect(row?.publishedAt).toBe(wonClaim.publishedAt);
      expect(row?.__publishClaimToken).toBe(claimToken);
    });

    it("persistChanges generic-writer guard: real Postgres JSONB text comparison rejects a stale publishedAt:null writer against an already-finalized row, regardless of updated_at ordering", async () => {
      const placardVersionId = `pg-matrix-generic-writer-${randomUUID()}`;
      placardIds.add(placardVersionId);

      const repo = newRepository();
      const claimToken = `token-generic-writer-${randomUUID()}`;
      const claim = await repo.claimPlacardPublish(
        stagedClaim(basePlacard(placardVersionId), claimToken),
      );
      expect(claim.claimed).toBe(true);
      const wonClaim = claim.currentRecord!;

      const finalized = await repo.finalizePlacardPublish(
        { ...wonClaim, artifactManifestHash: "generic-writer-winner-hash" },
        claimToken,
      );
      expect(finalized).toBe(true);
      const finalizedRow = await readRow(placardVersionId);
      expect(finalizedRow?.publishedAt).toBeTruthy();

      // A stale reader's cached snapshot (publishedAt: null, taken before the
      // claim above) replayed through the generic writer with a NEWER
      // updated_at than the finalized row -- the exact R7-followthrough Codex
      // REOPEN shape: updated_at ordering alone would let this win and erase
      // the finalized publishedAt/hash.
      const staleSnapshotNewerClock: PlacardVersionRecord = {
        ...wonClaim,
        publishedAt: null,
        artifactManifestHash: null,
        updatedAt: new Date(Date.now() + 60_000).toISOString(),
      };
      delete (staleSnapshotNewerClock as { __publishClaimToken?: string })
        .__publishClaimToken;

      await repo.persistChanges({ placardVersions: [staleSnapshotNewerClock] });

      const rowAfterStaleWrite = await readRow(placardVersionId);
      expect(rowAfterStaleWrite?.publishedAt).toBeTruthy();
      expect(rowAfterStaleWrite?.artifactManifestHash).toBe(
        "generic-writer-winner-hash",
      );

      // A legitimate re-write of the SAME already-published value (e.g. the
      // owning instance's own post-publish source-drift migration) with a
      // newer clock must still be allowed through.
      const legitimateRewrite: PlacardVersionRecord = {
        ...wonClaim,
        artifactManifestHash: "generic-writer-winner-hash",
        publishedAt: finalizedRow!.publishedAt,
        updatedAt: new Date(Date.now() + 120_000).toISOString(),
        templateName: "seatback-rerendered",
      };
      delete (legitimateRewrite as { __publishClaimToken?: string })
        .__publishClaimToken;

      await repo.persistChanges({ placardVersions: [legitimateRewrite] });

      const rowAfterLegitimateRewrite = await readRow(placardVersionId);
      expect(rowAfterLegitimateRewrite?.templateName).toBe(
        "seatback-rerendered",
      );
      expect(rowAfterLegitimateRewrite?.publishedAt).toBe(
        finalizedRow!.publishedAt,
      );
    });

    it("persistChanges generic-writer guard: an older updated_at never applies, even when publishedAt would otherwise agree", async () => {
      const placardVersionId = `pg-matrix-generic-writer-order-${randomUUID()}`;
      placardIds.add(placardVersionId);

      const repo = newRepository();
      const first = basePlacard(placardVersionId, {
        templateName: "first-write",
        updatedAt: new Date(Date.now() - 1000).toISOString(),
      });
      await repo.persistChanges({ placardVersions: [first] });

      const olderWrite: PlacardVersionRecord = {
        ...first,
        templateName: "older-write-must-not-apply",
        updatedAt: new Date(Date.now() - 2000).toISOString(),
      };
      await repo.persistChanges({ placardVersions: [olderWrite] });

      const row = await readRow(placardVersionId);
      expect(row?.templateName).toBe("first-write");
    });
  },
);
