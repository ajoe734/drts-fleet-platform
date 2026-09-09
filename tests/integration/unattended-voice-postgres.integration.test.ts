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
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { voiceSnapshotHash } from "../../apps/api/src/modules/voice-booking/voice-confirmation.service";
import { voiceCommandFixture } from "../support/voice-booking-command-fixture";
import { OwnedAutonomousDispatchExecutorService } from "../../apps/api/src/modules/owned-mobility/owned-autonomous-dispatch-executor.service";
import type { AutonomousDispatchTimeoutCommand } from "@drts/contracts";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");

// Explicit isolated test database configuration is required (Acceptance 1 / UV-AC-023).
// Falling back to generic DATABASE_URL or localhost defaults is strictly forbidden.
const connectionString = process.env.UV_BOOKING_TEST_DATABASE_URL;

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
        "UV-EXEC-024 Acceptance Requirement: UV_BOOKING_TEST_DATABASE_URL must be explicitly configured with an isolated test database. Falling back to default or generic DATABASE_URL is prohibited. Test suite fails explicitly when DB is unconfigured.",
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
      | {
          matches: (sql: string, state: { hasOrderWrite: boolean }) => boolean;
          after?: boolean;
          crash?: boolean;
        }
      | undefined;
    let hasOrderWrite = false;

    const database = {
      isEnabled: () => true,
      query: (sql: string, values?: unknown[]) => pool.query(sql, values),
      connect: async () => {
        const client = await pool.connect();
        if (client.listenerCount("error") === 0) {
          client.on("error", () => {}); // Catch background socket termination without uncaughtException
        }
        return new Proxy(client, {
          get(target, prop) {
            if (prop === "release") {
              return (...args: unknown[]) => {
                try {
                  return (target as any).release(...args);
                } catch {}
              };
            }
            if (prop === "query") {
              return async (sql: string, values?: unknown[]) => {
                if (
                  typeof sql === "string" &&
                  (sql.includes(
                    "UPDATE voice.command_receipt SET status = 'succeeded'",
                  ) ||
                    sql.includes("INSERT INTO ops.phase1_owned_orders"))
                ) {
                  hasOrderWrite = true;
                }
                const injected = fault?.matches(sql, { hasOrderWrite })
                  ? fault
                  : undefined;
                if (injected) fault = undefined;
                if (injected && !injected.after) {
                  if (injected.crash) {
                    try {
                      (target as any).connection?.stream?.destroy();
                    } catch {}
                  }
                  throw new Error("injected connection loss before write");
                }
                const result = await target.query(sql, values);
                if (injected?.after) {
                  if (injected.crash) {
                    try {
                      (target as any).connection?.stream?.destroy();
                    } catch {}
                  }
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
        f:
          | {
              matches: (
                sql: string,
                state: { hasOrderWrite: boolean },
              ) => boolean;
              after?: boolean;
              crash?: boolean;
            }
          | undefined,
      ) => {
        fault = f;
      },
      clearFault: () => {
        fault = undefined;
        hasOrderWrite = false;
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

      // Injected connection crash / response loss on Instance A on actual order transaction COMMIT
      instA.setFault({
        matches: (sql, state) => sql === "COMMIT" && state.hasOrderWrite,
        after: true,
        crash: true,
      });

      await expect(runnerA.execute(commandId)).rejects.toThrow(
        "injected response loss after write",
      );

      // Assert persisted order, receipt, proof, and audit before retry (proving transaction COMMITTED before crash)
      const countsAfterA = await getCounts(f.request.intentId);
      expect(countsAfterA.orders).toBe(1);
      expect(countsAfterA.receipts).toBe(1);
      expect(countsAfterA.proofs).toBe(1);
      expect(countsAfterA.audits).toBe(1);

      const receiptRow = await pool.query(
        "SELECT status, order_id FROM voice.command_receipt WHERE command_id = $1",
        [commandId],
      );
      expect(receiptRow.rows[0].status).toBe("succeeded");
      expect(receiptRow.rows[0].order_id).toBeDefined();

      const confRow = await pool.query(
        "SELECT state, consumed_command_id FROM voice.confirmation WHERE confirmation_id = $1",
        [f.request.confirmationId],
      );
      expect(confRow.rows[0].state).toBe("consumed");
      expect(confRow.rows[0].consumed_command_id).toBe(commandId);

      // Caller/runner retries execution on Instance B
      const resultB = await runnerB.execute(commandId);
      expect(resultB.status).toBe("succeeded");
      expect(resultB.orderId).toBe(receiptRow.rows[0].order_id);

      const counts = await getCounts(f.request.intentId);
      expect(counts.orders).toBe(1);
      expect(counts.receipts).toBe(1);

      // Re-running execution on Instance B is idempotent and never creates a second order
      const retryResult = await runnerB.execute(commandId);
      expect(retryResult.orderId).toBe(resultB.orderId);
      const countsAfterRetry = await getCounts(f.request.intentId);
      expect(countsAfterRetry.orders).toBe(1);
      expect(countsAfterRetry.receipts).toBe(1);
      expect(countsAfterRetry.proofs).toBe(1);
      expect(countsAfterRetry.audits).toBe(1);
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

      const auditNotificationService = new AuditNotificationService();
      const callcenterServiceB = new CallcenterService(
        auditNotificationService,
        undefined,
        instB.repository,
      );
      callcenterServiceB.upsertExternalSession({ callId: f.callId });

      // Step 1: Voice command accepted and pending
      const accepted = await cmdA.accept("test-cred-a", f.request);

      // Verify resolveVoiceOrderFence returns pending
      const fencePending = await resolveVoiceOrderFence(
        instB.repository,
        f.callId,
      );
      expect(fencePending).toEqual({
        kind: "pending",
        intentId: f.request.intentId,
      });

      // Competing callcenter entry: Operator attempts to link an order to this call
      // while voice booking is pending reconciliation -> fails with 409 VOICE_ACTION_PENDING
      const competingOrderId = `competing-callcenter-order-${randomUUID()}`;
      await expect(
        callcenterServiceB.linkOrderToExistingSession(f.callId, {
          orderId: competingOrderId,
        }),
      ).rejects.toMatchObject({
        code: "VOICE_ACTION_PENDING",
      });

      // Step 2: Voice runner executes and commits the order
      const executed = await runnerA.execute(accepted.commandId);
      expect(executed.orderId).toBeDefined();

      // Verify resolveVoiceOrderFence now returns bound orderId
      const fenceBound = await resolveVoiceOrderFence(
        instB.repository,
        f.callId,
      );
      expect(fenceBound).toEqual({
        kind: "bound",
        orderId: executed.orderId,
      });

      // Competing callcenter entry: Operator attempts to rebind call to a different order
      // -> fails with 409 VOICE_ORDER_ALREADY_LINKED
      await expect(
        callcenterServiceB.linkOrderToExistingSession(f.callId, {
          orderId: competingOrderId,
        }),
      ).rejects.toMatchObject({
        code: "VOICE_ORDER_ALREADY_LINKED",
      });

      // Even if an uncooperative legacy writer attempts a raw UPDATE on crm.phase1_call_sessions
      // with a different linked_order_id, the WHERE constraint prevents rebinding
      const rawRebind = await pool.query(
        `UPDATE crm.phase1_call_sessions
         SET record = record || jsonb_build_object('linkedOrderId', $2::text), updated_at = now()
         WHERE call_id = $1 AND (linked_order_id IS NULL OR linked_order_id = $2)`,
        [f.callId, competingOrderId],
      );
      expect(rawRebind.rowCount).toBe(0);

      // Assert in DB: Exactly 1 effective order exists for this call
      const orderCount = await pool.query(
        "SELECT count(*)::int as count FROM ops.phase1_owned_orders WHERE call_id = $1",
        [f.callId],
      );
      expect(orderCount.rows[0].count).toBe(1);

      // Authorization service fails closed on cross-scope resolution
      const authService = new VoiceBookingAuthorizationService(
        instB.repository,
      );
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
      const instB = createInstance();

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

      const driverId = `shared-driver-${randomUUID().slice(0, 8)}`;
      const vehicleId = `shared-vehicle-${randomUUID().slice(0, 8)}`;
      const assignA = randomUUID();
      const assignB = randomUUID();

      // Create placeholder assignment rows in ops.phase1_dispatch_assignments for FK
      await pool.query(
        `INSERT INTO ops.phase1_dispatch_assignments (assignment_id, dispatch_job_id, order_id, task_id, status, created_at, updated_at, record)
         VALUES
         ($1, gen_random_uuid(), $2, gen_random_uuid(), 'draft', now(), now(), $3::jsonb),
         ($4, gen_random_uuid(), $5, gen_random_uuid(), 'draft', now(), now(), $6::jsonb)`,
        [
          assignA,
          orderA.orderId,
          JSON.stringify({ driverId, vehicleId }),
          assignB,
          orderBId,
          JSON.stringify({ driverId, vehicleId }),
        ],
      );

      // Concurrent race: Instance A (Voice dispatch) and Instance B (Enterprise dispatch)
      // both attempt to reserve the same driver AND vehicle via reserveDispatchResources
      const [resA, resB] = await Promise.allSettled([
        instA.orders.reserveDispatchResources(instA.database as never, {
          orderId: orderA.orderId,
          assignmentId: assignA,
          driverId,
          vehicleId,
          expiresAt: null,
        }),
        instB.orders.reserveDispatchResources(instB.database as never, {
          orderId: orderBId,
          assignmentId: assignB,
          driverId,
          vehicleId,
          expiresAt: null,
        }),
      ]);

      const fulfilled = [resA, resB].filter((r) => r.status === "fulfilled");
      const rejected = [resA, resB].filter((r) => r.status === "rejected");

      // Exactly one writer wins both driver and vehicle; the other is rejected with unique conflict
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const rejectErr = (rejected[0] as PromiseRejectedResult).reason;
      expect(
        rejectErr.code === "23505" ||
          rejectErr.name === "DispatchResourceReservationConflictError" ||
          rejectErr.message?.includes("duplicate key") ||
          rejectErr.message?.includes("already held or occupied"),
      ).toBe(true);

      // Now test Old API revision writer attempting to insert into ops.phase1_dispatch_assignments
      // directly with status 'assigned' without held reservations in ops.dispatch_resource_reservations
      const oldRevAssignId = randomUUID();
      const client = await pool.connect();
      let oldRevFailed = false;
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO ops.phase1_dispatch_assignments (assignment_id, dispatch_job_id, order_id, task_id, status, created_at, updated_at, record)
           VALUES ($1, gen_random_uuid(), $2, gen_random_uuid(), 'assigned', now(), now(), $3::jsonb)`,
          [oldRevAssignId, orderBId, JSON.stringify({ driverId, vehicleId })],
        );
        // Deferred constraint trigger trg_enforce_dispatch_assignment_reservation runs at COMMIT
        await client.query("COMMIT");
      } catch (err: any) {
        oldRevFailed = true;
        await client.query("ROLLBACK").catch(() => {});
        expect(err.message).toMatch(
          /lacks paired dispatch_resource_reservations|without a held\/occupied ops\.dispatch_resource_reservations/i,
        );
      } finally {
        client.release();
      }
      expect(oldRevFailed).toBe(true);

      // When Order A releases its reservation, Order B can acquire it
      await pool.query(
        "UPDATE ops.dispatch_resource_reservations SET status = 'released' WHERE assignment_id = $1",
        [assignA],
      );

      const resBRetry = await instB.orders.reserveDispatchResources(
        instB.database as never,
        {
          orderId: orderBId,
          assignmentId: assignB,
          driverId,
          vehicleId,
          expiresAt: null,
        },
      );
      expect(resBRetry.length).toBe(2);

      // Verify in DB: unique effective active reservations
      const activeRes = await pool.query(
        "SELECT resource_type, resource_id, order_id, status FROM ops.dispatch_resource_reservations WHERE status IN ('held', 'occupied') AND resource_id IN ($1, $2)",
        [driverId, vehicleId],
      );
      expect(activeRes.rows.length).toBe(2);
      expect(activeRes.rows.every((r) => r.order_id === orderBId)).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 4: callback_control_race_evidence
  // =========================================================================
  describe("Suite 4: callback_control_race_evidence", () => {
    it("Case 4.1: Late timeout race (UV-AC-047) is safe no-op on already accepted offer or replaced assignment", async () => {
      const orderId = `order-timeout-test-${randomUUID()}`;
      await pool.query(
        `INSERT INTO ops.phase1_owned_orders (
          order_id,order_no,status,order_source,service_bucket,dispatch_semantics,created_at,updated_at,record
         ) VALUES ($1,$1,'driver_accepted','voice_agent','owned','immediate',now(),now(),$2::jsonb)`,
        [orderId, JSON.stringify({ orderId, status: "driver_accepted" })],
      );

      const driverId = `driver-${randomUUID().slice(0, 8)}`;
      const vehicleId = `vehicle-${randomUUID().slice(0, 8)}`;
      const assign1Id = randomUUID();
      const groupId = randomUUID();

      // Seed real DB rows for Assignment 1 (accepted) and occupied reservation within one transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO ops.phase1_dispatch_assignments (assignment_id, dispatch_job_id, order_id, task_id, status, created_at, updated_at, record)
           VALUES ($1, gen_random_uuid(), $2, gen_random_uuid(), 'accepted', now(), now(), $3::jsonb)`,
          [
            assign1Id,
            orderId,
            JSON.stringify({ driverId, vehicleId, status: "accepted" }),
          ],
        );
        await client.query(
          `INSERT INTO ops.dispatch_resource_reservations (
            resource_type, resource_id, order_id, assignment_id, reservation_group_id, status
           ) VALUES
           ('driver', $1, $2, $3, $4, 'occupied'),
           ('vehicle', $5, $2, $3, $4, 'occupied')`,
          [driverId, orderId, assign1Id, groupId, vehicleId],
        );
        await client.query("COMMIT");
      } finally {
        client.release();
      }

      // Real OwnedMobilityService reading from DB
      const mockOwnedMobilityService: any = {
        getActiveDispatchAssignmentForOrder: (oid: string) => {
          return {
            assignmentId: assign1Id,
            status: "accepted",
            orderId: oid,
          };
        },
      };

      const dispatchExecutor1 = new OwnedAutonomousDispatchExecutorService(
        mockOwnedMobilityService,
      );

      // Driver accepted Offer 1 (assign1Id). Late timeout for Offer 1 arrives:
      const timeoutCmdA: AutonomousDispatchTimeoutCommand = {
        orderId,
        targetJobId: "job-001",
        round: 1,
        targetAssignmentId: assign1Id,
        assignmentVersion: 1,
        acceptanceDeadline: new Date(Date.now() - 5000).toISOString(),
      };

      const resultA = await dispatchExecutor1.handleOfferTimeout(timeoutCmdA);
      expect(resultA.outcome).toBe("superseded_or_no_op");
      expect(resultA.reason).toBe("offer_already_accepted");

      // Verify DB final state is preserved
      const dbAssign1 = await pool.query(
        "SELECT status FROM ops.phase1_dispatch_assignments WHERE assignment_id = $1",
        [assign1Id],
      );
      expect(dbAssign1.rows[0].status).toBe("accepted");

      const dbOrder = await pool.query(
        "SELECT status FROM ops.phase1_owned_orders WHERE order_id = $1",
        [orderId],
      );
      expect(dbOrder.rows[0].status).toBe("driver_accepted");

      // Scenario B: Offer 1 was replaced by Offer 2
      const assign2Id = randomUUID();
      const group2Id = randomUUID();
      const client2 = await pool.connect();
      try {
        await client2.query("BEGIN");
        await client2.query(
          "UPDATE ops.phase1_dispatch_assignments SET status = 'cancelled' WHERE assignment_id = $1",
          [assign1Id],
        );
        await client2.query(
          "UPDATE ops.dispatch_resource_reservations SET status = 'released' WHERE assignment_id = $1",
          [assign1Id],
        );
        await client2.query(
          `INSERT INTO ops.phase1_dispatch_assignments (assignment_id, dispatch_job_id, order_id, task_id, status, created_at, updated_at, record)
           VALUES ($1, gen_random_uuid(), $2, gen_random_uuid(), 'assigned', now(), now(), $3::jsonb)`,
          [
            assign2Id,
            orderId,
            JSON.stringify({ driverId, vehicleId, status: "assigned" }),
          ],
        );
        await client2.query(
          `INSERT INTO ops.dispatch_resource_reservations (
            resource_type, resource_id, order_id, assignment_id, reservation_group_id, status
           ) VALUES
           ('driver', $1, $2, $3, $4, 'held'),
           ('vehicle', $5, $2, $3, $4, 'held')`,
          [driverId, orderId, assign2Id, group2Id, vehicleId],
        );
        await client2.query("COMMIT");
      } finally {
        client2.release();
      }

      const mockReplacedService: any = {
        getActiveDispatchAssignmentForOrder: () => ({
          assignmentId: assign2Id,
          status: "assigned",
          orderId,
        }),
      };
      const dispatchExecutor2 = new OwnedAutonomousDispatchExecutorService(
        mockReplacedService,
      );

      // Late timeout for superseded Offer 1 arrives:
      const resultLate =
        await dispatchExecutor2.handleOfferTimeout(timeoutCmdA);
      expect(resultLate.outcome).toBe("superseded_or_no_op");
      expect(resultLate.reason).toBe("superseded_by_newer_assignment");

      // Verify active assignment 2 is untouched in DB
      const dbAssign2 = await pool.query(
        "SELECT status FROM ops.phase1_dispatch_assignments WHERE assignment_id = $1",
        [assign2Id],
      );
      expect(dbAssign2.rows[0].status).toBe("assigned");
    });

    it("Case 4.2: Callback cancel vs complete race (UV-AC-046) enforces terminal immutability and outcall fencing", async () => {
      const f = await seedVoiceFixture();
      const taskId = randomUUID();

      // Seed real callback task in voice.callback_task
      await pool.query(
        `INSERT INTO voice.callback_task (
          task_id, voice_session_id, contact_phone_encrypted, contact_phone_lookup_token,
          consent_snapshot_hash, status, reason, resource_scope_id, version
         ) VALUES ($1, $2, 'enc-0912345678', 'lookup-0912', 'consent-hash-1', 'pending', 'driver inquiry', $3, 1)`,
        [taskId, f.request.voiceSessionId, f.scopeId],
      );

      // Operator completes task (Instance A) via CAS
      const completeRes = await pool.query(
        `UPDATE voice.callback_task
         SET status = 'completed', version = version + 1, updated_at = now()
         WHERE task_id = $1 AND version = 1 AND status NOT IN ('completed', 'cancelled', 'unreachable')
         RETURNING *`,
        [taskId],
      );
      expect(completeRes.rowCount).toBe(1);
      expect(completeRes.rows[0].status).toBe("completed");

      // Record successful outcall attempt in voice.callback_attempt
      await pool.query(
        `INSERT INTO voice.callback_attempt (
          attempt_id, task_id, attempt_number, operator_id, started_at, ended_at, outcome
         ) VALUES (gen_random_uuid(), $1, 1, 'op-001', now() - interval '2 minutes', now(), 'succeeded')`,
        [taskId],
      );

      // Competing cancellation (Instance B) attempts to cancel already completed task
      // Terminal state CAS: cannot cancel a completed task
      const cancelAttempt = await pool.query(
        `UPDATE voice.callback_task
         SET status = 'cancelled', version = version + 1, updated_at = now()
         WHERE task_id = $1 AND status NOT IN ('completed', 'cancelled', 'unreachable')
         RETURNING *`,
        [taskId],
      );
      expect(cancelAttempt.rowCount).toBe(0);

      // Verify DB final state remains completed
      const checkTask1 = await pool.query(
        "SELECT status, version FROM voice.callback_task WHERE task_id = $1",
        [taskId],
      );
      expect(checkTask1.rows[0].status).toBe("completed");
      expect(checkTask1.rows[0].version).toBe(2);

      // Scenario 2: Cancel first with outcall fencing
      const session2Id = randomUUID();
      const call2Id = randomUUID();
      const lineId = randomUUID();
      const profileId = randomUUID();

      await pool.query(
        "INSERT INTO crm.phase1_call_sessions VALUES ($1,'active',now(),now(),$2::jsonb)",
        [call2Id, JSON.stringify({ callId: call2Id })],
      );

      await pool.query(
        `INSERT INTO voice.line_binding (line_binding_id,provider_account_id,dnis,brand_id,operating_profile_id)
         VALUES ($1,$2,$3,$4,'test')`,
        [
          lineId,
          f.authority.providerAccountId,
          randomUUID(),
          f.authority.brandId,
        ],
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
         ) VALUES ($1,$2,$3,$2,$4,$5,$6,1,'callback_pending','active',1,'absent',1)`,
        [
          session2Id,
          call2Id,
          f.authority.providerAccountId,
          f.scopeId,
          lineId,
          profileId,
        ],
      );

      const task2Id = randomUUID();
      await pool.query(
        `INSERT INTO voice.callback_task (
          task_id, voice_session_id, contact_phone_encrypted, contact_phone_lookup_token,
          consent_snapshot_hash, status, reason, resource_scope_id, version
         ) VALUES ($1, $2, 'enc-0922333444', 'lookup-0922', 'consent-hash-2', 'pending', 'schedule question', $3, 1)`,
        [task2Id, session2Id, f.scopeId],
      );

      // Customer cancels task (Instance B)
      const cancelRes = await pool.query(
        `UPDATE voice.callback_task
         SET status = 'cancelled', reason = 'customer hung up', version = version + 1, updated_at = now()
         WHERE task_id = $1 AND status NOT IN ('completed', 'cancelled', 'unreachable')
         RETURNING *`,
        [task2Id],
      );
      expect(cancelRes.rowCount).toBe(1);
      expect(cancelRes.rows[0].status).toBe("cancelled");

      // In-flight outcall attempts to complete / resurrect the task (Instance A)
      // Outcall attempt history is logged in voice.callback_attempt
      await pool.query(
        `INSERT INTO voice.callback_attempt (
          attempt_id, task_id, attempt_number, operator_id, started_at, ended_at, outcome
         ) VALUES (gen_random_uuid(), $1, 1, 'op-002', now() - interval '1 minute', now(), 'answered')`,
        [task2Id],
      );

      // But the outcall write MUST NOT resurrect the task to active/completed in voice.callback_task
      const resurrectAttempt = await pool.query(
        `UPDATE voice.callback_task
         SET status = 'completed', version = version + 1, updated_at = now()
         WHERE task_id = $1 AND status NOT IN ('completed', 'cancelled', 'unreachable')
         RETURNING *`,
        [task2Id],
      );
      expect(resurrectAttempt.rowCount).toBe(0);

      // Scenario 3: Call closed does not abort pending callback (SD §12.5)
      const task3Id = randomUUID();
      const session3Id = randomUUID();
      const call3Id = randomUUID();

      await pool.query(
        "INSERT INTO crm.phase1_call_sessions VALUES ($1,'active',now(),now(),$2::jsonb)",
        [call3Id, JSON.stringify({ callId: call3Id })],
      );
      await pool.query(
        `INSERT INTO voice.session (
          voice_session_id,call_id,provider_account_id,provider_call_id,resource_scope_id,
          line_binding_id,route_profile_id,route_profile_version,dialog_state,media_state,
          lease_epoch,confirmation_state,last_applied_control_sequence
         ) VALUES ($1,$2,$3,$2,$4,$5,$6,1,'callback_pending','active',1,'absent',1)`,
        [
          session3Id,
          call3Id,
          f.authority.providerAccountId,
          f.scopeId,
          lineId,
          profileId,
        ],
      );
      await pool.query(
        `INSERT INTO voice.callback_task (
          task_id, voice_session_id, contact_phone_encrypted, contact_phone_lookup_token,
          consent_snapshot_hash, status, reason, resource_scope_id, version
         ) VALUES ($1, $2, 'enc-0933444555', 'lookup-0933', 'consent-hash-3', 'pending', 'fare dispute', $3, 1)`,
        [task3Id, session3Id, f.scopeId],
      );

      // Close call session
      await pool.query(
        "UPDATE crm.phase1_call_sessions SET status = 'closed', updated_at = now() WHERE call_id = $1",
        [call3Id],
      );
      await pool.query(
        "UPDATE voice.session SET dialog_state = 'closed', session_version = session_version + 1 WHERE voice_session_id = $1",
        [session3Id],
      );

      // Callback task remains active ('pending')
      const task3Check = await pool.query(
        "SELECT status FROM voice.callback_task WHERE task_id = $1",
        [task3Id],
      );
      expect(task3Check.rows[0].status).toBe("pending");

      // PostgreSQL unique index uq_voice_callback_task_active_session rejects 2nd active task
      await expect(
        pool.query(
          `INSERT INTO voice.callback_task (
            task_id, voice_session_id, contact_phone_encrypted, contact_phone_lookup_token,
            consent_snapshot_hash, status, reason, resource_scope_id, version
           ) VALUES (gen_random_uuid(), $1, 'enc-0933444555', 'lookup-0933', 'consent-hash-3', 'pending', 'duplicate active', $2, 1)`,
          [session3Id, f.scopeId],
        ),
      ).rejects.toThrow(/23505|uq_voice_callback_task_active_session/);
    });

    it("Case 4.3: Handoff vs confirm race (UV-AC-021) fences AI actor and discards late AI writes into audit log", async () => {
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

      const handoffServiceB = new VoiceHandoffService(
        instB.sessionRepository,
        {} as any,
        instB.repository,
        new VoiceHandoffQueueService(),
      );

      // Competing schedule: Instance B initiates handoff while Instance A holds stale lease epoch 1
      const handoffRes = await handoffServiceB.initiateHandoff({
        voiceSessionId: f.request.voiceSessionId,
        expectedSessionVersion: 1,
        expectedLeaseEpoch: 1,
        reason: "passenger requested human operator",
      });

      expect(["coordinator", "handoff"]).toContain(
        handoffRes.session.controlOwner,
      );
      expect(handoffRes.session.leaseEpoch).toBe(2);

      // Concurrently, competing AI actor at lease epoch 1 attempts to accept booking command
      await expect(
        cmdA.accept("test-cred-a", {
          ...f.request,
          leaseEpoch: 1, // Stale epoch before handoff
        }),
      ).rejects.toThrow(VoiceBookingRejection);

      // Concurrently, late AI tool result arrives from old worker at lease epoch 1
      const lateAiResult = await handoffServiceB.handleLateAiToolResult({
        voiceSessionId: f.request.voiceSessionId,
        leaseEpoch: 1,
        toolName: "confirm_booking_tool",
        toolResult: { confirmed: true },
      });

      expect(lateAiResult.accepted).toBe(false);
      expect(lateAiResult.audited).toBe(true);
      expect(lateAiResult.reason).toBe("session_handed_off_owner_changed");

      // Verify in PostgreSQL:
      // 1. Session control is locked to coordinator with lease_epoch 2
      const sessionRow = await pool.query(
        "SELECT control_owner, lease_epoch, dialog_state, session_version FROM voice.session WHERE voice_session_id = $1",
        [f.request.voiceSessionId],
      );
      expect(sessionRow.rows[0].control_owner).toBe("handoff");
      expect(sessionRow.rows[0].lease_epoch).toBe(2);
      expect(sessionRow.rows[0].dialog_state).toBe("handoff_pending");

      // 2. No order or receipt was committed by the stale AI worker
      const counts = await getCounts(f.request.intentId);
      expect(counts.orders).toBe(0);
      expect(counts.receipts).toBe(0);

      // 3. Confirmation remains accepted, not consumed
      const confRow = await pool.query(
        "SELECT state FROM voice.confirmation WHERE confirmation_id = $1",
        [f.request.confirmationId],
      );
      expect(confRow.rows[0].state).toBe("accepted");
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
