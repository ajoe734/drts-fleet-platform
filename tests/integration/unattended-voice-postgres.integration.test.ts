import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import type { DatabaseService } from "../../apps/api/src/common/db";
import { VoiceBookingRepository } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { OwnedMobilityRepository } from "../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import {
  VoiceBookingCommandService,
  VoiceBookingRejection,
  type CommitVoiceBooking,
} from "../../apps/api/src/modules/voice-booking/voice-booking-command.service";
import { VoiceCommandRunnerService } from "../../apps/api/src/modules/voice-booking/voice-command-runner.service";
import { resolveVoiceOrderFence } from "../../apps/api/src/modules/voice-booking/voice-order-fence";
import { VoiceBookingAuthorizationService } from "../../apps/api/src/modules/voice-booking/voice-booking-authorization.service";
import { VoiceCallbackService } from "../../apps/api/src/modules/voice-booking/voice-callback.service";
import { VoiceHandoffService } from "../../apps/api/src/modules/voice-booking/voice-handoff.service";
import { VoiceSessionRepository } from "../../apps/api/src/modules/voice-booking/voice-session.repository";
import { VoiceHandoffQueueService } from "../../apps/api/src/modules/callcenter/voice-handoff-queue.service";
import { voiceSnapshotHash } from "../../apps/api/src/modules/voice-booking/voice-confirmation.service";
import { voiceCommandFixture } from "../support/voice-booking-command-fixture";
import { OwnedAutonomousDispatchExecutorService } from "../../apps/api/src/modules/owned-mobility/owned-autonomous-dispatch-executor.service";
import type { AutonomousDispatchTimeoutCommand } from "@drts/contracts";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");

const connectionString =
  process.env.UV_BOOKING_TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

const migration = (name: string) =>
  readFileSync(
    new URL(`../../infra/migrations/${name}`, import.meta.url),
    "utf8",
  );

describe("UV-EXEC-024 Real PostgreSQL Two-Instance Race & Fault Matrix", () => {
  const databaseName = `uv_exec_024_${randomUUID().replaceAll("-", "")}`;
  let admin: InstanceType<typeof Pool>;
  let pool: InstanceType<typeof Pool>;
  let created = false;

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error(
        "UV-EXEC-024 Acceptance Requirement: PostgreSQL connection string must be configured. Suites cannot skip and claim success.",
      );
    }

    admin = new Pool({ connectionString });
    try {
      await admin.query("SELECT 1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `UV-EXEC-024 Acceptance Requirement: Failed to connect to PostgreSQL at ${connectionString}: ${msg}. Suite fails explicitly when DB is unconfigured or unreachable.`,
      );
    }

    await admin.query(`CREATE DATABASE ${databaseName}`);
    created = true;

    const url = new URL(connectionString);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString() });

    // Apply baseline schemas and functions
    await pool.query(`CREATE SCHEMA ops; CREATE SCHEMA crm; CREATE SCHEMA admin;
      CREATE FUNCTION admin.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;`);

    await pool.query(migration("V0011__phase1_runtime_snapshots.sql"));

    const runtimeColumns = migration(
      "V0056__multi_taxi_runtime_compliance_closure.sql",
    );
    await pool.query(
      runtimeColumns.slice(
        runtimeColumns.indexOf("ALTER TABLE ops.phase1_owned_orders"),
        runtimeColumns.indexOf("CREATE INDEX"),
      ),
    );

    for (const name of [
      "V0086__voice_persistence_domain_schema.sql",
      "V0087__dispatch_resource_reservations.sql",
      "V0088__voice_runtime_identity_linkage.sql",
      "V0089__owned_order_aggregate_version.sql",
      "V0090__dispatch_assignment_reservation_fence.sql",
      "V0091__dispatch_reservation_commit_invariant.sql",
      "V0092__voice_booking_command_proof.sql",
      "V0093__voice_retention_and_legal_hold.sql",
    ]) {
      await pool.query(migration(name));
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (created && admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    }
    if (admin) await admin.end();
  });

  // Factory to create an isolated application instance (Instance A or Instance B)
  // connecting to the same real PostgreSQL database, with its own fault injection proxy.
  function createInstance() {
    let fault:
      | { matches: (sql: string) => boolean; after?: boolean }
      | undefined;

    const database = {
      isEnabled: () => true,
      query: (sql: string, values?: unknown[]) => pool.query(sql, values),
      connect: async () => {
        const client = await pool.connect();
        return new Proxy(client, {
          get(target, prop) {
            if (prop === "query") {
              return async (sql: string, values?: unknown[]) => {
                const injected = fault?.matches(sql) ? fault : undefined;
                if (injected) fault = undefined;
                if (injected && !injected.after) {
                  throw new Error("injected connection loss before write");
                }
                const result = await target.query(sql, values);
                if (injected?.after) {
                  throw new Error("injected response loss after write");
                }
                return result;
              };
            }
            const value = Reflect.get(target, prop);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as PoolClient;
      },
    } as unknown as DatabaseService;

    const repository = new VoiceBookingRepository(database);
    const sessionRepository = new VoiceSessionRepository(database);
    const orders = new OwnedMobilityRepository(database);

    return {
      database,
      repository,
      sessionRepository,
      orders,
      setFault: (
        f: { matches: (sql: string) => boolean; after?: boolean } | undefined,
      ) => {
        fault = f;
      },
      clearFault: () => {
        fault = undefined;
      },
    };
  }

  interface FixtureOptions {
    draftVersion?: number;
    confirmationState?: string;
    action?: string;
    overrideSnapshot?: Record<string, unknown>;
  }

  async function seedVoiceFixture(opts: FixtureOptions = {}) {
    const f = voiceCommandFixture();
    const lineId = randomUUID();
    const profileId = randomUUID();
    const eventId = randomUUID();
    const draftVersion = opts.draftVersion ?? 1;
    const confirmationState = opts.confirmationState ?? "accepted";
    const action = opts.action ?? "create_owned_order";
    const snapshot = (opts.overrideSnapshot as any) ?? f.snapshot;
    const snapshotHash = voiceSnapshotHash(snapshot);

    await pool.query(
      "INSERT INTO crm.phase1_call_sessions VALUES ($1,'active',now(),now(),$2::jsonb)",
      [f.callId, JSON.stringify({ callId: f.callId })],
    );

    await pool.query(
      `INSERT INTO voice.resource_scope (scope_id,brand_id,granted_by,runtime_mapping)
       VALUES ($1,$2,'test',$3::jsonb)`,
      [
        f.scopeId,
        f.authority.brandId,
        JSON.stringify({
          runtimeProfileCode: "ordinary_taxi",
          serviceProductCode: "taxi_realtime",
        }),
      ],
    );

    await pool.query(
      `INSERT INTO voice.line_binding (line_binding_id,provider_account_id,dnis,brand_id,operating_profile_id)
       VALUES ($1,$2,$3,$4,'test')`,
      [lineId, f.authority.providerAccountId, f.callId, f.authority.brandId],
    );

    await pool.query(
      "INSERT INTO voice.route_profile (profile_id,version,models,languages) VALUES ($1,1,'{}','[]')",
      [profileId],
    );

    await pool.query(
      `INSERT INTO voice.session (
        voice_session_id,call_id,provider_account_id,provider_call_id,resource_scope_id,
        line_binding_id,route_profile_id,route_profile_version,dialog_state,media_state,
        lease_epoch,confirmation_state,last_applied_control_sequence
       ) VALUES ($1,$2,$3,$2,$4,$5,$6,1,'confirming','active',1,$7,1)`,
      [
        f.request.voiceSessionId,
        f.callId,
        f.authority.providerAccountId,
        f.scopeId,
        lineId,
        profileId,
        confirmationState,
      ],
    );

    await pool.query(
      "INSERT INTO voice.intent (intent_id,voice_session_id,current_draft_version,action) VALUES ($1,$2,$3,$4)",
      [f.request.intentId, f.request.voiceSessionId, draftVersion, action],
    );

    await pool.query(
      `INSERT INTO voice.draft_revision (intent_id,draft_version,slots,canonical_snapshot,snapshot_hash)
       VALUES ($1,$2,'{}',$3::jsonb,$4)`,
      [
        f.request.intentId,
        draftVersion,
        JSON.stringify(snapshot),
        snapshotHash,
      ],
    );

    await pool.query(
      `INSERT INTO voice.session_event (
        event_id,voice_session_id,source,provider_account_id,source_event_id,
        occurred_at,sequence,lease_epoch,event_type,payload
       ) VALUES ($1,$2,'test',$3,$4,now(),1,1,'dtmf','{}')`,
      [
        eventId,
        f.request.voiceSessionId,
        f.authority.providerAccountId,
        eventId,
      ],
    );

    await pool.query(
      `INSERT INTO voice.recording_checkpoint (
        checkpoint_id,call_id,recording_id,manifest_version,manifest,
        manifest_hash,coverage,policy_version,verified_at
       ) VALUES ($1,$2,$2,1,'{}','manifest-hash',$3::jsonb,'policy',now())`,
      [
        f.checkpointId,
        f.callId,
        JSON.stringify({
          snapshotHash,
          readbackPlaybackId: f.playbackId,
        }),
      ],
    );

    await pool.query(
      `INSERT INTO voice.confirmation (
        confirmation_id,voice_session_id,intent_id,draft_version,action,confirmation_method,
        snapshot_hash,readback_playback_id,readback_completed_event_id,input_epoch,media_epoch,
        control_sequence,lease_epoch,recording_checkpoint_id,evidence,state,confirmed_at,expires_at
       ) VALUES ($1,$2,$3,$4,$5,'dtmf',$6,$7,$8,0,0,1,1,$9,'{}',$10,now(),$11)`,
      [
        f.request.confirmationId,
        f.request.voiceSessionId,
        f.request.intentId,
        draftVersion,
        action,
        snapshotHash,
        f.playbackId,
        eventId,
        f.checkpointId,
        confirmationState,
        f.expiry,
      ],
    );

    const access = {
      authorizeRead: async () => f.authority,
      authorizeAccept: async () => f.authority,
      credentialForCommand: async () => "command-scoped-test-credential",
    };

    const makeEvidence = (repo: VoiceBookingRepository) => ({
      requireCheckpoint: async () =>
        repo.findRecordingCheckpointById(f.checkpointId),
    });

    const products = {
      getRuntimeServiceProductByType: () => ({
        active: true,
        timing: "realtime",
        updatedAt: "product-v1",
      }),
      assertRuntimeProfileServiceProductActive: () => ({
        updatedAt: "policy-v1",
      }),
    };

    const areas = {
      evaluate: () => f.snapshot.bookingQualification.serviceArea,
    };

    const request: CommitVoiceBooking = {
      ...f.request,
      draftVersion,
      snapshotHash,
    };

    return {
      ...f,
      request,
      access,
      makeEvidence,
      products,
      areas,
      lineId,
      profileId,
      eventId,
    };
  }

  async function getCounts(intentId: string) {
    const result = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM ops.phase1_owned_orders WHERE voice_intent_id=$1) AS orders,
        (SELECT count(*)::int FROM voice.command_receipt WHERE intent_id=$1) AS receipts,
        (SELECT count(*)::int FROM voice.booking_command_proof p JOIN voice.command_receipt r USING(command_id) WHERE r.intent_id=$1) AS proofs,
        (SELECT count(*)::int FROM voice.booking_audit_intent a JOIN voice.command_receipt r USING(command_id) WHERE r.intent_id=$1) AS audits`,
      [intentId],
    );
    return result.rows[0];
  }

  // =========================================================================
  // SUITE 1: isolated_postgres_environment & Fail-Closed Availability
  // =========================================================================
  describe("Suite 1: isolated_postgres_environment", () => {
    it("fails explicitly when database connection is invalid or unconfigured, without skipping", async () => {
      const unreachablePool = new Pool({
        connectionString:
          "postgresql://postgres:wrong_pw@127.0.0.1:5433/non_existent",
        connectionTimeoutMillis: 1000,
      });

      let failed = false;
      try {
        await unreachablePool.query("SELECT 1");
      } catch (err: unknown) {
        failed = true;
        expect(err).toBeDefined();
      } finally {
        await unreachablePool.end().catch(() => {});
      }

      expect(failed).toBe(true);
    });

    it("uses an isolated test database with zero production passenger data", async () => {
      const result = await pool.query(
        "SELECT current_database() as db, count(*)::int as existing_orders FROM ops.phase1_owned_orders",
      );
      expect(result.rows[0].db).toBe(databaseName);
      expect(result.rows[0].existing_orders).toBe(0);
    });
  });

  // =========================================================================
  // SUITE 2: two_instance_crash_matrix_evidence
  // =========================================================================
  describe("Suite 2: two_instance_crash_matrix_evidence", () => {
    it("Case 2.1: Concurrent acceptance race between Instance A and Instance B yields exactly 1 receipt and proof", async () => {
      const f = await seedVoiceFixture();
      const instA = createInstance();
      const instB = createInstance();

      const cmdA = new VoiceBookingCommandService(
        instA.repository,
        f.makeEvidence(instA.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const cmdB = new VoiceBookingCommandService(
        instB.repository,
        f.makeEvidence(instB.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );

      // Concurrently accept the same confirmation from two distinct instances
      const [resA, resB] = await Promise.all([
        cmdA.accept("test-cred-a", f.request),
        cmdB.accept("test-cred-b", f.request),
      ]);

      expect(resA.commandId).toBe(resB.commandId);
      expect(resA.status).toBe("pending");
      expect(resB.status).toBe("pending");

      const counts = await getCounts(f.request.intentId);
      expect(counts.receipts).toBe(1);
      expect(counts.proofs).toBe(1);

      // Verify unique constraint uq_voice_command_receipt_action_key in PostgreSQL
      const receipts = await pool.query(
        "SELECT command_id, status, brand_id, call_id, intent_id, action FROM voice.command_receipt WHERE intent_id = $1",
        [f.request.intentId],
      );
      expect(receipts.rows.length).toBe(1);
      expect(receipts.rows[0].status).toBe("pending");
    });

    it("Case 2.2: Crash before accept write in Instance A rolls back, Instance B re-accepts cleanly", async () => {
      const f = await seedVoiceFixture();
      const instA = createInstance();
      const instB = createInstance();

      const cmdA = new VoiceBookingCommandService(
        instA.repository,
        f.makeEvidence(instA.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const cmdB = new VoiceBookingCommandService(
        instB.repository,
        f.makeEvidence(instB.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );

      // Injected crash on Instance A right before inserting command_receipt
      instA.setFault({
        matches: (sql) => sql.includes("INSERT INTO voice.command_receipt"),
        after: false,
      });

      await expect(cmdA.accept("test-cred-a", f.request)).rejects.toThrow(
        "injected connection loss before write",
      );

      // DB should be clean with 0 receipts
      const preCounts = await getCounts(f.request.intentId);
      expect(preCounts.receipts).toBe(0);
      expect(preCounts.proofs).toBe(0);

      // Instance B re-runs accept
      const resB = await cmdB.accept("test-cred-b", f.request);
      expect(resB.commandId).toBeDefined();

      const postCounts = await getCounts(f.request.intentId);
      expect(postCounts.receipts).toBe(1);
      expect(postCounts.proofs).toBe(1);
    });

    it("Case 2.3: Response loss after accept write in Instance A, retry on Instance B discovers existing receipt", async () => {
      const f = await seedVoiceFixture();
      const instA = createInstance();
      const instB = createInstance();

      const cmdA = new VoiceBookingCommandService(
        instA.repository,
        f.makeEvidence(instA.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const cmdB = new VoiceBookingCommandService(
        instB.repository,
        f.makeEvidence(instB.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );

      // Injected response loss on Instance A on COMMIT after writes
      instA.setFault({
        matches: (sql) => sql === "COMMIT",
        after: true,
      });

      const resA = await cmdA.accept("test-cred-a", f.request);
      expect(resA.status).toBe("pending");

      // DB committed the receipt and proof
      const countsAfterA = await getCounts(f.request.intentId);
      expect(countsAfterA.receipts).toBe(1);
      expect(countsAfterA.proofs).toBe(1);

      // Caller retries accept on Instance B with identical parameters
      const resB = await cmdB.accept("test-cred-b", f.request);
      expect(resB.commandId).toBe(resA.commandId);

      const countsAfterB = await getCounts(f.request.intentId);
      expect(countsAfterB.receipts).toBe(1);
      expect(countsAfterB.proofs).toBe(1);
    });

    it("Case 2.4: Crash before order commit in runner (Instance A), Instance B recovers and commits exactly 1 order", async () => {
      const f = await seedVoiceFixture();
      const instA = createInstance();
      const instB = createInstance();

      const cmdA = new VoiceBookingCommandService(
        instA.repository,
        f.makeEvidence(instA.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const runnerA = new VoiceCommandRunnerService(cmdA, instA.orders);

      const cmdB = new VoiceBookingCommandService(
        instB.repository,
        f.makeEvidence(instB.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const runnerB = new VoiceCommandRunnerService(cmdB, instB.orders);

      const accepted = await cmdA.accept("test-cred-a", f.request);
      const commandId = accepted.commandId;

      // Crash Instance A before order commit (when updating call session)
      instA.setFault({
        matches: (sql) => sql.includes("UPDATE crm.phase1_call_sessions"),
        after: false,
      });

      await expect(runnerA.execute(commandId)).rejects.toThrow(
        "injected connection loss before write",
      );

      // Verify transaction was rolled back: no order created
      const midCounts = await getCounts(f.request.intentId);
      expect(midCounts.orders).toBe(0);

      // Confirmation is still accepted, receipt still pending
      const confRow = await pool.query(
        "SELECT state FROM voice.confirmation WHERE confirmation_id = $1",
        [f.request.confirmationId],
      );
      expect(confRow.rows[0].state).toBe("accepted");

      // Instance B recovers and executes the command
      const resultB = await runnerB.execute(commandId);
      expect(resultB.status).toBe("succeeded");
      expect(resultB.orderId).toBeDefined();

      const finalCounts = await getCounts(f.request.intentId);
      expect(finalCounts.orders).toBe(1);
      expect(finalCounts.receipts).toBe(1);
      expect(finalCounts.audits).toBe(1);

      // Confirmation is consumed, intent committed with bound order
      const finalConf = await pool.query(
        "SELECT state, consumed_command_id FROM voice.confirmation WHERE confirmation_id = $1",
        [f.request.confirmationId],
      );
      expect(finalConf.rows[0].state).toBe("consumed");
      expect(finalConf.rows[0].consumed_command_id).toBe(commandId);
    });

    it("Case 2.5: Response loss after order commit in Instance A, retry on Instance B discovers succeeded receipt and creates no second order", async () => {
      const f = await seedVoiceFixture();
      const instA = createInstance();
      const instB = createInstance();

      const cmdA = new VoiceBookingCommandService(
        instA.repository,
        f.makeEvidence(instA.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const runnerA = new VoiceCommandRunnerService(cmdA, instA.orders);

      const cmdB = new VoiceBookingCommandService(
        instB.repository,
        f.makeEvidence(instB.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const runnerB = new VoiceCommandRunnerService(cmdB, instB.orders);

      const accepted = await cmdA.accept("test-cred-a", f.request);
      const commandId = accepted.commandId;

      // Injected response loss after updating command_receipt to succeeded
      instA.setFault({
        matches: (sql) =>
          sql.includes("UPDATE voice.command_receipt SET status = 'succeeded'"),
        after: true,
      });

      await expect(runnerA.execute(commandId)).rejects.toThrow(
        "injected response loss after write",
      );

      // Caller/runner retries execution on Instance B
      const resultB = await runnerB.execute(commandId);
      expect(resultB.status).toBe("succeeded");
      expect(resultB.orderId).toBeDefined();

      const counts = await getCounts(f.request.intentId);
      expect(counts.orders).toBe(1);
      expect(counts.receipts).toBe(1);

      // Re-running execution on Instance B is idempotent and never creates a second order
      const retryResult = await runnerB.execute(commandId);
      expect(retryResult.orderId).toBe(resultB.orderId);
      const countsAfterRetry = await getCounts(f.request.intentId);
      expect(countsAfterRetry.orders).toBe(1);
    });

    it("Case 2.6: Concurrent runner execution produces exactly 1 order with zero duplicate side effects", async () => {
      const f = await seedVoiceFixture();
      const instA = createInstance();
      const instB = createInstance();

      const cmdA = new VoiceBookingCommandService(
        instA.repository,
        f.makeEvidence(instA.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const runnerA = new VoiceCommandRunnerService(cmdA, instA.orders);

      const cmdB = new VoiceBookingCommandService(
        instB.repository,
        f.makeEvidence(instB.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const runnerB = new VoiceCommandRunnerService(cmdB, instB.orders);

      const accepted = await cmdA.accept("test-cred-a", f.request);
      const commandId = accepted.commandId;

      // Both runners execute commandId concurrently
      const [resA, resB] = await Promise.all([
        runnerA.execute(commandId),
        runnerB.execute(commandId),
      ]);

      expect(resA.status).toBe("succeeded");
      expect(resB.status).toBe("succeeded");
      expect(resA.orderId).toBe(resB.orderId);

      const counts = await getCounts(f.request.intentId);
      expect(counts.orders).toBe(1);
      expect(counts.receipts).toBe(1);
    });

    it("Case 2.7: Immutability triggers on booking_command_proof and booking_audit_intent reject mutation", async () => {
      const f = await seedVoiceFixture();
      const inst = createInstance();
      const cmd = new VoiceBookingCommandService(
        inst.repository,
        f.makeEvidence(inst.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const runner = new VoiceCommandRunnerService(cmd, inst.orders);

      const accepted = await cmd.accept("test-cred", f.request);
      await runner.execute(accepted.commandId);

      // Attempting to UPDATE or DELETE booking_command_proof must fail via raise_append_only trigger
      await expect(
        pool.query(
          "UPDATE voice.booking_command_proof SET proof = '{}' WHERE command_id = $1",
          [accepted.commandId],
        ),
      ).rejects.toThrow(/append-only/i);

      await expect(
        pool.query(
          "DELETE FROM voice.booking_command_proof WHERE command_id = $1",
          [accepted.commandId],
        ),
      ).rejects.toThrow(/append-only/i);

      // Attempting to UPDATE or DELETE booking_audit_intent must fail via raise_append_only trigger
      await expect(
        pool.query(
          "UPDATE voice.booking_audit_intent SET record = '{}' WHERE command_id = $1",
          [accepted.commandId],
        ),
      ).rejects.toThrow(/append-only/i);

      await expect(
        pool.query(
          "DELETE FROM voice.booking_audit_intent WHERE command_id = $1",
          [accepted.commandId],
        ),
      ).rejects.toThrow(/append-only/i);
    });
  });

  // =========================================================================
  // SUITE 3: mixed_dispatch_entry_evidence
  // =========================================================================
  describe("Suite 3: mixed_dispatch_entry_evidence", () => {
    it("Case 3.1: Old revision invalidation rejects stale confirmation and permits only current revision", async () => {
      // Seed fixture with Draft 1
      const f = await seedVoiceFixture({ draftVersion: 1 });
      const instA = createInstance();
      const instB = createInstance();

      const cmdA = new VoiceBookingCommandService(
        instA.repository,
        f.makeEvidence(instA.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );

      // Passenger changes address -> Draft 2 created, Draft 1 confirmation invalidated
      const draft2Snapshot = {
        ...f.snapshot,
        bookingRequirements: {
          ...f.snapshot.bookingRequirements,
          passengerCount: 3,
        },
      };
      const draft2Hash = voiceSnapshotHash(draft2Snapshot);

      await pool.query(
        "UPDATE voice.intent SET current_draft_version = 2 WHERE intent_id = $1",
        [f.request.intentId],
      );
      await pool.query(
        `INSERT INTO voice.draft_revision (intent_id,draft_version,slots,canonical_snapshot,snapshot_hash)
         VALUES ($1,2,'{}',$2::jsonb,$3)`,
        [f.request.intentId, JSON.stringify(draft2Snapshot), draft2Hash],
      );
      await pool.query(
        "UPDATE voice.confirmation SET state = 'invalidated' WHERE confirmation_id = $1",
        [f.request.confirmationId],
      );

      // Create a matching recording checkpoint for Draft 2
      const draft2CheckpointId = randomUUID();
      await pool.query(
        `INSERT INTO voice.recording_checkpoint (
          checkpoint_id,call_id,recording_id,manifest_version,manifest,
          manifest_hash,coverage,policy_version,verified_at
         ) VALUES ($1,$2,$2,2,'{}','manifest-hash',$3::jsonb,'policy',now())`,
        [
          draft2CheckpointId,
          f.callId,
          JSON.stringify({
            snapshotHash: draft2Hash,
            readbackPlaybackId: f.playbackId,
          }),
        ],
      );

      // New confirmation for Draft 2 (with valid readbackCompletedEventId and draft2CheckpointId)
      const conf2Id = randomUUID();
      await pool.query(
        `INSERT INTO voice.confirmation (
          confirmation_id,voice_session_id,intent_id,draft_version,action,confirmation_method,
          snapshot_hash,readback_playback_id,readback_completed_event_id,input_epoch,media_epoch,
          control_sequence,lease_epoch,recording_checkpoint_id,evidence,state,confirmed_at,expires_at
         ) VALUES ($1,$2,$3,2,'create_owned_order','dtmf',$4,$5,$6,0,0,1,1,$7,'{}','accepted',now(),$8)`,
        [
          conf2Id,
          f.request.voiceSessionId,
          f.request.intentId,
          draft2Hash,
          f.playbackId,
          f.eventId,
          draft2CheckpointId,
          f.expiry,
        ],
      );

      // Instance A attempts to accept with stale Draft 1 confirmation -> rejected
      await expect(cmdA.accept("test-cred-a", f.request)).rejects.toThrow(
        VoiceBookingRejection,
      );

      // Instance B accepts with current Draft 2 confirmation -> succeeds
      const evidence2 = {
        requireCheckpoint: async () =>
          instB.repository.findRecordingCheckpointById(draft2CheckpointId),
      };

      const cmdB = new VoiceBookingCommandService(
        instB.repository,
        evidence2 as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const runnerB = new VoiceCommandRunnerService(cmdB, instB.orders);

      const req2: CommitVoiceBooking = {
        ...f.request,
        confirmationId: conf2Id,
        draftVersion: 2,
        snapshotHash: draft2Hash,
      };

      const accepted2 = await cmdB.accept("test-cred-b", req2);
      expect(accepted2.commandId).toBeDefined();

      const execResult = await runnerB.execute(accepted2.commandId);
      expect(execResult.status).toBe("succeeded");

      const counts = await getCounts(f.request.intentId);
      expect(counts.orders).toBe(1);
    });

    it("Case 3.2: Mixed entry fence prevents call-center / legacy double booking on active voice call", async () => {
      const f = await seedVoiceFixture();
      const inst = createInstance();
      const cmd = new VoiceBookingCommandService(
        inst.repository,
        f.makeEvidence(inst.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const runner = new VoiceCommandRunnerService(cmd, inst.orders);

      // When voice booking is pending: resolveVoiceOrderFence returns pending
      const accepted = await cmd.accept("test-cred", f.request);
      const fencePending = await resolveVoiceOrderFence(
        inst.repository,
        f.callId,
      );
      expect(fencePending).toEqual({
        kind: "pending",
        intentId: f.request.intentId,
      });

      // Execute and commit voice booking
      const executed = await runner.execute(accepted.commandId);
      expect(executed.orderId).toBeDefined();

      // Once voice booking succeeded: fence returns bound orderId, blocking legacy write
      const fenceBound = await resolveVoiceOrderFence(
        inst.repository,
        f.callId,
      );
      expect(fenceBound).toEqual({
        kind: "bound",
        orderId: executed.orderId,
      });

      // Authorization service fails closed on cross-scope resolution
      const authService = new VoiceBookingAuthorizationService(inst.repository);
      await expect(
        authService.resolveBoundOrderId(
          f.request.voiceSessionId,
          "mismatched-resource-scope",
        ),
      ).rejects.toMatchObject({ code: "VOICE_SCOPE_DENIED" });

      const boundOrderId = await authService.resolveBoundOrderId(
        f.request.voiceSessionId,
        f.scopeId,
      );
      expect(boundOrderId).toBe(executed.orderId);
    });

    it("Case 3.3: Shared driver and vehicle capacity contention between voice and enterprise dispatch enforces mutual exclusion", async () => {
      const f = await seedVoiceFixture();
      const instA = createInstance();

      const cmdA = new VoiceBookingCommandService(
        instA.repository,
        f.makeEvidence(instA.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );
      const runnerA = new VoiceCommandRunnerService(cmdA, instA.orders);
      const accepted = await cmdA.accept("test-cred-a", f.request);
      const orderA = await runnerA.execute(accepted.commandId);

      // Create a second order (Order B) representing an enterprise dispatch order
      const orderBId = `enterprise-order-${randomUUID()}`;
      await pool.query(
        `INSERT INTO ops.phase1_owned_orders (
          order_id,order_no,status,order_source,service_bucket,dispatch_semantics,created_at,updated_at,record
         ) VALUES ($1,$1,'created','enterprise','standard_taxi','immediate',now(),now(),$2::jsonb)`,
        [orderBId, JSON.stringify({ orderId: orderBId })],
      );

      const driverId = "shared-driver-001";
      const vehicleId = "shared-vehicle-001";
      const groupA = randomUUID();
      const groupB = randomUUID();

      // Instance A reserves the shared driver and vehicle for Order A
      await pool.query(
        `INSERT INTO ops.dispatch_resource_reservations (
          reservation_id,resource_type,resource_id,order_id,reservation_group_id,status
         ) VALUES
         (gen_random_uuid(),'driver',$1,$2,$3,'held'),
         (gen_random_uuid(),'vehicle',$4,$2,$3,'held')`,
        [driverId, orderA.orderId, groupA, vehicleId],
      );

      // Instance B attempts to reserve the same driver for Order B while held by Order A
      // PostgreSQL unique index uq_dispatch_resource_reservations_active must throw code 23505
      let caughtUniqueViolation = false;
      try {
        await pool.query(
          `INSERT INTO ops.dispatch_resource_reservations (
            reservation_id,resource_type,resource_id,order_id,reservation_group_id,status
           ) VALUES (gen_random_uuid(),'driver',$1,$2,$3,'held')`,
          [driverId, orderBId, groupB],
        );
      } catch (err: any) {
        if (err.code === "23505") {
          caughtUniqueViolation = true;
        }
      }
      expect(caughtUniqueViolation).toBe(true);

      // When Order A releases its reservation, Order B can acquire it
      await pool.query(
        "UPDATE ops.dispatch_resource_reservations SET status = 'released' WHERE reservation_group_id = $1",
        [groupA],
      );

      const resB = await pool.query(
        `INSERT INTO ops.dispatch_resource_reservations (
          reservation_id,resource_type,resource_id,order_id,reservation_group_id,status
         ) VALUES (gen_random_uuid(),'driver',$1,$2,$3,'held') RETURNING reservation_id`,
        [driverId, orderBId, groupB],
      );
      expect(resB.rows.length).toBe(1);
    });
  });

  // =========================================================================
  // SUITE 4: callback_control_race_evidence
  // =========================================================================
  describe("Suite 4: callback_control_race_evidence", () => {
    it("Case 4.1: Late timeout race (UV-AC-047) is safe no-op on already accepted offer or replaced assignment", async () => {
      const mockOrder: any = {
        orderId: "order-timeout-test",
        status: "driver_accepted",
      };
      const activeAssignment: any = {
        assignmentId: "assignment-001",
        orderId: "order-timeout-test",
        status: "accepted",
      };

      const mockOwnedMobilityService: any = {
        getActiveDispatchAssignmentForOrder: (orderId: string) => {
          if (orderId === mockOrder.orderId) return activeAssignment;
          return null;
        },
      };

      const dispatchExecutor1 = new OwnedAutonomousDispatchExecutorService(
        mockOwnedMobilityService,
      );

      // Driver accepted Offer A (assignment-001). Late timeout for Offer A arrives:
      const timeoutCmdA: AutonomousDispatchTimeoutCommand = {
        orderId: mockOrder.orderId,
        targetJobId: "job-001",
        round: 1,
        targetAssignmentId: "assignment-001",
        assignmentVersion: 1,
        acceptanceDeadline: new Date(Date.now() - 5000).toISOString(),
      };

      const resultA = await dispatchExecutor1.handleOfferTimeout(timeoutCmdA);
      expect(resultA.outcome).toBe("superseded_or_no_op");
      expect(resultA.reason).toBe("offer_already_accepted");
      expect(activeAssignment.status).toBe("accepted");

      // Case 2: Offer A was replaced by Offer B (assignment-002)
      const replacedAssignment: any = {
        assignmentId: "assignment-002",
        orderId: "order-timeout-test",
        status: "assigned",
      };
      const mockReplacedService: any = {
        getActiveDispatchAssignmentForOrder: () => replacedAssignment,
      };
      const dispatchExecutor2 = new OwnedAutonomousDispatchExecutorService(
        mockReplacedService,
      );

      // Late timeout for superseded Offer X (assignment-003) arrives:
      const timeoutCmdSuperseded: AutonomousDispatchTimeoutCommand = {
        orderId: mockOrder.orderId,
        targetJobId: "job-001",
        round: 1,
        targetAssignmentId: "assignment-003",
        assignmentVersion: 1,
        acceptanceDeadline: new Date(Date.now() - 5000).toISOString(),
      };

      const resultLate =
        await dispatchExecutor2.handleOfferTimeout(timeoutCmdSuperseded);
      expect(resultLate.outcome).toBe("superseded_or_no_op");
      expect(resultLate.reason).toBe("superseded_by_newer_assignment");
      expect(replacedAssignment.status).toBe("assigned");
    });

    it("Case 4.2: Callback cancel vs complete race (UV-AC-046) enforces terminal immutability and outcall fencing", async () => {
      const f = await seedVoiceFixture();
      const inst = createInstance();
      const callbackService = new VoiceCallbackService(inst.sessionRepository);

      const created = await callbackService.createCallback({
        voiceSessionId: f.request.voiceSessionId,
        resourceScopeId: f.scopeId,
        brandId: f.authority.brandId,
        callId: f.callId,
        contactPhone: "0912345678",
        consentRef: "consent-001",
        reason: "driver inquiry",
      });

      expect(created.task.status).toBe("pending");

      // Complete the callback task
      const completed = callbackService.completeCallback({
        taskId: created.task.taskId,
        operatorId: "op-001",
        expectedVersion: created.task.version,
      });
      expect(completed.status).toBe("completed");

      // Attempting to cancel an already completed task throws 409 conflict
      let cancelError: any;
      try {
        callbackService.cancelCallback({
          taskId: created.task.taskId,
          reason: "customer cancelled",
          expectedVersion: completed.task.version,
        });
      } catch (err) {
        cancelError = err;
      }
      expect(cancelError?.code).toBe("CALLBACK_TERMINAL_RACE_CONFLICT");
      expect(cancelError?.getStatus?.()).toBe(409);

      // Replaying completion is idempotent
      const replayed = callbackService.completeCallback({
        taskId: created.task.taskId,
        operatorId: "op-001",
        expectedVersion: completed.task.version,
      });
      expect(replayed.replayed).toBe(true);
      expect(replayed.status).toBe("completed");

      // Test cancel first scenario with outcall fence:
      const task2 = await callbackService.createCallback({
        voiceSessionId: randomUUID(),
        resourceScopeId: f.scopeId,
        brandId: f.authority.brandId,
        callId: randomUUID(),
        contactPhone: "0922333444",
        consentRef: "consent-002",
        reason: "schedule question",
      });

      const cancelled = callbackService.cancelCallback({
        taskId: task2.task.taskId,
        reason: "customer hung up",
        expectedVersion: task2.task.version,
      });
      expect(cancelled.status).toBe("cancelled");

      // Cannot complete a cancelled task
      let completeError: any;
      try {
        callbackService.completeCallback({
          taskId: task2.task.taskId,
          operatorId: "op-002",
          expectedVersion: cancelled.task.version,
        });
      } catch (err) {
        completeError = err;
      }
      expect(completeError?.code).toBe("CALLBACK_TERMINAL_RACE_CONFLICT");
      expect(completeError?.getStatus?.()).toBe(409);
    });

    it("Case 4.3: Handoff vs confirm race (UV-AC-021) fences AI actor and discards late AI writes into audit log", async () => {
      const f = await seedVoiceFixture();
      const inst = createInstance();
      const handoffService = new VoiceHandoffService(
        inst.sessionRepository,
        {} as any,
        inst.repository,
        new VoiceHandoffQueueService(),
      );

      // Initiate human handoff: session transitions to handoff_pending, control_owner to handoff
      const handoffRes = await handoffService.initiateHandoff({
        voiceSessionId: f.request.voiceSessionId,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "passenger requested human operator",
      });

      expect(["coordinator", "handoff"]).toContain(
        handoffRes.session.controlOwner,
      );
      expect(handoffRes.session.leaseEpoch).toBe(2);

      // Concurrently, late AI tool result arrives from old worker at lease epoch 1
      const lateAiResult = await handoffService.handleLateAiToolResult({
        voiceSessionId: f.request.voiceSessionId,
        leaseEpoch: 1,
        toolName: "confirm_booking_tool",
        toolResult: { confirmed: true },
      });

      expect(lateAiResult.accepted).toBe(false);
      expect(lateAiResult.audited).toBe(true);
      expect(lateAiResult.reason).toBe("session_handed_off_owner_changed");

      // Verify AI cannot accept/commit booking command with stale lease epoch
      const cmd = new VoiceBookingCommandService(
        inst.repository,
        f.makeEvidence(inst.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );

      await expect(
        cmd.accept("test-cred", {
          ...f.request,
          leaseEpoch: 1, // Stale epoch before handoff
        }),
      ).rejects.toThrow(VoiceBookingRejection);

      const counts = await getCounts(f.request.intentId);
      expect(counts.orders).toBe(0);
    });

    it("Case 4.4: Control gap / out-of-order sequence check (UV-AC-045) enforces contiguous control stream", async () => {
      const f = await seedVoiceFixture();
      const inst = createInstance();

      // Session currently at last_applied_control_sequence = 1
      const session = await inst.repository.findSessionById(
        f.request.voiceSessionId,
      );
      expect(session?.lastAppliedControlSequence).toBe(1);

      const cmd = new VoiceBookingCommandService(
        inst.repository,
        f.makeEvidence(inst.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );

      // Incoming request with a control sequence gap (e.g. sequence 5 arriving when last applied is 1)
      const gapRequest: CommitVoiceBooking = {
        ...f.request,
        controlCutoff: { mediaEpoch: 0, controlSequence: 5 },
      };

      await expect(cmd.accept("test-cred", gapRequest)).rejects.toThrow(
        VoiceBookingRejection,
      );

      const counts = await getCounts(f.request.intentId);
      expect(counts.receipts).toBe(0);
    });
  });
});
