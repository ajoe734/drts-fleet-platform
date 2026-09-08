import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VoiceCheckpointRepository } from "../../apps/api/src/modules/voice-booking/voice-checkpoint.repository";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { Pool } =
  require("pg") as typeof import("../../apps/api/node_modules/pg");
// Opt-in admin connection. Tests create and drop ONLY their own random database.
const connectionString = process.env.UV_RECORDER_TEST_DATABASE_URL;

describe.skipIf(!connectionString)(
  "UV-EXEC-010 PostgreSQL checkpoint journal",
  () => {
    const databaseName = `uv_recorder_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString });
    let pool: InstanceType<typeof Pool>;
    let created = false;
    const repository = new VoiceCheckpointRepository();
    const input = () => ({
      callId: "call",
      recordingId: "recording",
      manifestVersion: 1,
      manifest: { objectKey: "manifest", objectVersion: "v1" },
      manifestHash: "a".repeat(64),
      coverage: { startMs: 0, endMs: 1000 },
      policyVersion: "policy-1",
    });

    beforeAll(async () => {
      await admin.query(`CREATE DATABASE ${databaseName}`);
      created = true;
      const url = new URL(connectionString!);
      url.pathname = `/${databaseName}`;
      pool = new Pool({ connectionString: url.toString() });
      // Minimal FK prerequisite; use the real V0086 table/index/trigger SQL.
      await pool.query(`CREATE SCHEMA crm; CREATE SCHEMA voice;
      CREATE TABLE crm.phase1_call_sessions (call_id varchar(100) PRIMARY KEY);
      INSERT INTO crm.phase1_call_sessions VALUES ('call')`);
      const migration = readFileSync(
        new URL(
          "../../infra/migrations/V0086__voice_persistence_domain_schema.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await pool.query(
        migration.slice(
          migration.indexOf(
            "CREATE OR REPLACE FUNCTION voice.raise_append_only()",
          ),
          migration.indexOf("-- 1. voice_line_binding"),
        ),
      );
      await pool.query(
        migration.slice(
          migration.indexOf(
            "CREATE TABLE IF NOT EXISTS voice.recording_checkpoint",
          ),
          migration.indexOf("-- 10. voice_intent"),
        ),
      );
    });

    afterAll(async () => {
      await pool?.end();
      if (created) await admin.query(`DROP DATABASE ${databaseName}`);
      await admin.end();
    });

    it("concurrent retries converge on one immutable row across connections", async () => {
      const checkpoints = await Promise.all(
        Array.from({ length: 8 }, () =>
          repository.appendVerified(input(), pool),
        ),
      );
      expect(new Set(checkpoints.map((value) => value.checkpointId)).size).toBe(
        1,
      );
      expect(new Set(checkpoints.map((value) => value.verifiedAt)).size).toBe(
        1,
      );
      const reordered = input();
      reordered.manifest = { objectVersion: "v1", objectKey: "manifest" };
      expect(await repository.appendVerified(reordered, pool)).toEqual(
        checkpoints[0],
      );
    });

    it("conflicting evidence/policy cannot overwrite the established version", async () => {
      const request = { ...input(), manifestVersion: 2 };
      const original = await repository.appendVerified(request, pool);
      for (const patch of [
        { manifestHash: "b".repeat(64) },
        { manifest: { objectKey: "different", objectVersion: "v2" } },
        { coverage: { startMs: 0, endMs: 9000 } },
        { policyVersion: "policy-2" },
      ]) {
        await expect(
          repository.appendVerified({ ...request, ...patch }, pool),
        ).rejects.toThrow("version conflict");
      }
      expect(await repository.appendVerified(request, pool)).toEqual(original);
    });

    it("rollback leaves no checkpoint and allows a fresh verified append", async () => {
      const client = await pool.connect();
      const request = { ...input(), manifestVersion: 3 };
      try {
        await client.query("BEGIN");
        const rolledBack = await repository.appendVerified(request, client);
        await client.query("ROLLBACK");
        const committed = await repository.appendVerified(request, pool);
        expect(committed.checkpointId).not.toBe(rolledBack.checkpointId);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });

    it("database triggers reject update, delete and truncate", async () => {
      await repository.appendVerified({ ...input(), manifestVersion: 4 }, pool);
      for (const sql of [
        "UPDATE voice.recording_checkpoint SET verified_at = now()",
        "DELETE FROM voice.recording_checkpoint",
        "TRUNCATE voice.recording_checkpoint",
      ])
        await expect(pool.query(sql)).rejects.toThrow("append-only");
    });
  },
);
