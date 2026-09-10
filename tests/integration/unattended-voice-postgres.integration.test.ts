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
import { AuditLogRepository } from "../../apps/api/src/modules/audit-notification/audit-log.repository";
import { voiceSnapshotHash } from "../../apps/api/src/modules/voice-booking/voice-confirmation.service";
import { voiceCommandFixture } from "../support/voice-booking-command-fixture";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import type { AutonomousDispatchTimeoutCommand } from "@drts/contracts";

// `tests/` is not under apps/api's package.json, so bare npm specifiers for
// apps/api-only deps (only resolvable relative to apps/api/node_modules)
// must go through a require() scoped there, same as `pg` below -- a plain
// `import` would resolve against this file's own (root) node_modules instead.
const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");
const { EventEmitter2 } = require("@nestjs/event-emitter") as typeof import("@nestjs/event-emitter");

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
    await pool.query(`CREATE SCHEMA ops; CREATE SCHEMA crm; CREATE SCHEMA admin; CREATE SCHEMA core;
      CREATE FUNCTION admin.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
      CREATE TABLE core.tenants (tenant_id uuid PRIMARY KEY);`);

    // Case 4.3 exercises AuditLogRepository (admin.audit_logs) for real
    // persisted audit evidence; its tenant_id column FKs to core.tenants
    // (created above as a minimal stub -- this suite has no tenant lifecycle
    // of its own).
    const auditLogsSchema = migration(
      "V0009__admin_reporting_audit_and_integrations.sql",
    );
    await pool.query(
      auditLogsSchema.slice(
        auditLogsSchema.indexOf("CREATE TABLE IF NOT EXISTS admin.audit_logs"),
        auditLogsSchema.indexOf(
          "CREATE TABLE IF NOT EXISTS admin.webhook_endpoints",
        ),
      ),
    );

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

    // Case 4.1 hydrates a real OwnedMobilityService via
    // OwnedMobilityRepository.loadState(), which also reads these two
    // tables; without them onModuleInit()'s try/catch would silently no-op
    // and leave the service's in-memory cache empty.
    await pool.query(
      runtimeColumns.slice(
        runtimeColumns.indexOf(
          "CREATE TABLE IF NOT EXISTS ops.passenger_dispatch_disclosure_snapshots",
        ),
        runtimeColumns.indexOf("CREATE TABLE IF NOT EXISTS billing."),
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
                } catch {
                  // client already released/destroyed by an injected crash
                }
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
                    } catch {
                      // stream already gone; injected crash still applies below
                    }
                  }
                  throw new Error("injected connection loss before write");
                }
                const result = await target.query(sql, values);
                if (injected?.after) {
                  if (injected.crash) {
                    try {
                      (target as any).connection?.stream?.destroy();
                    } catch {
                      // stream already gone; injected crash still applies below
                    }
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

  // Builds a real OwnedMobilityService + OwnedMobilityRepository wired to
  // this suite's Postgres pool, for Case 4.1. Each call models an
  // independent process/pod: after `onModuleInit()` it only knows whatever
  // is currently committed in the DB (via `OwnedMobilityRepository.loadState()`),
  // never another instance's in-memory state. Constructor wiring follows the
  // proven recipe in apps/api/tests/integration/stage1-uat-pg-gate.integration.test.ts
  // `createHarness`; tenant/vehicle-eligibility/service-product services are
  // omitted (all `@Optional()`) since this suite never exercises quota or
  // candidate-selection paths.
  function createDispatchHarness() {
    const repository = new OwnedMobilityRepository(
      { isEnabled: () => true, query: (sql: string, values?: unknown[]) => pool.query(sql, values) } as never,
    );
    const auditService = new AuditNotificationService(new AuditLogRepository());
    const emitter = new EventEmitter2();
    const taskEvents = new OwnedMobilityTaskEventsService(emitter, {
      isEnabled: () => true,
      query: (sql: string, values?: unknown[]) => pool.query(sql, values),
    } as never);
    const opsEvents = new OpsDispatchEventsService(emitter, {
      isEnabled: () => true,
      query: (sql: string, values?: unknown[]) => pool.query(sql, values),
    } as never);
    const service = new OwnedMobilityService(
      { listVehicles: () => [] } as never,
      auditService,
      {
        registerRecordingAttachmentListener: () => undefined,
        registerRecordingStateChangeListener: () => undefined,
      } as never,
      taskEvents,
      opsEvents,
      repository,
      undefined,
      undefined,
      undefined,
      emitter,
    );
    return { repository, service };
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
      const now = new Date().toISOString();
      await pool.query(
        `INSERT INTO ops.phase1_owned_orders (
          order_id,order_no,status,order_source,service_bucket,dispatch_semantics,created_at,updated_at,record
         ) VALUES ($1,$1,'driver_accepted','voice_agent','owned','immediate',now(),now(),$2::jsonb)`,
        [orderId, JSON.stringify({ orderId, status: "driver_accepted" })],
      );

      const driverId = `driver-${randomUUID().slice(0, 8)}`;
      const vehicleId = `vehicle-${randomUUID().slice(0, 8)}`;
      const assign1Id = randomUUID();
      const dispatchJob1Id = randomUUID();
      const task1Id = randomUUID();
      const groupId = randomUUID();

      // Seed real DB rows for Assignment 1 (accepted) and occupied reservation within one transaction.
      // The `record` jsonb column is the sole source OwnedMobilityRepository.loadState() hydrates
      // from (see parseRecord()), so it must mirror what a real writer would have persisted --
      // not just the indexed SQL columns.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO ops.phase1_dispatch_assignments (assignment_id, dispatch_job_id, order_id, task_id, status, created_at, updated_at, record)
           VALUES ($1, $2, $3, $4, 'accepted', now(), now(), $5::jsonb)`,
          [
            assign1Id,
            dispatchJob1Id,
            orderId,
            task1Id,
            JSON.stringify({
              assignmentId: assign1Id,
              dispatchJobId: dispatchJob1Id,
              orderId,
              taskId: task1Id,
              driverId,
              vehicleId,
              status: "accepted",
              createdAt: now,
              updatedAt: now,
            }),
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

      // Instance B: an independent process that only knows what onModuleInit()
      // reads back from Postgres (UV-EXEC-024 review: no hardcoded mock answer).
      const harnessB1 = createDispatchHarness();
      await harnessB1.service.onModuleInit();

      // Driver accepted Offer 1 (assign1Id). Late timeout for Offer 1 arrives:
      const timeoutCmdA: AutonomousDispatchTimeoutCommand = {
        orderId,
        targetJobId: dispatchJob1Id,
        round: 1,
        targetAssignmentId: assign1Id,
        assignmentVersion: 1,
        acceptanceDeadline: new Date(Date.now() - 5000).toISOString(),
      };

      const resultA = await harnessB1.service
        .getAutonomousDispatchExecutor()
        .handleOfferTimeout(timeoutCmdA);
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

      // Scenario B: Offer 1 was replaced by Offer 2 (real writer: cancel + release,
      // then a fresh assignment + reservation for the same order).
      const assign2Id = randomUUID();
      const dispatchJob2Id = randomUUID();
      const task2Id = randomUUID();
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
           VALUES ($1, $2, $3, $4, 'assigned', now(), now(), $5::jsonb)`,
          [
            assign2Id,
            dispatchJob2Id,
            orderId,
            task2Id,
            JSON.stringify({
              assignmentId: assign2Id,
              dispatchJobId: dispatchJob2Id,
              orderId,
              taskId: task2Id,
              driverId,
              vehicleId,
              status: "assigned",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
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

      // Instance B2: a second independent hydration, taken AFTER the replace lands
      // in Postgres -- models a pod that boots (or resyncs) after the reassign and
      // correctly observes the new assignment via a real DB read, not a fed answer.
      const harnessB2 = createDispatchHarness();
      await harnessB2.service.onModuleInit();

      // Late timeout for superseded Offer 1 arrives:
      const resultLate = await harnessB2.service
        .getAutonomousDispatchExecutor()
        .handleOfferTimeout(timeoutCmdA);
      expect(resultLate.outcome).toBe("superseded_or_no_op");
      expect(resultLate.reason).toBe("superseded_by_newer_assignment");

      // Verify active assignment 2 is untouched in DB
      const dbAssign2 = await pool.query(
        "SELECT status FROM ops.phase1_dispatch_assignments WHERE assignment_id = $1",
        [assign2Id],
      );
      expect(dbAssign2.rows[0].status).toBe("assigned");

      const dbGroup2Reservations = await pool.query<{ status: string }>(
        "SELECT status FROM ops.dispatch_resource_reservations WHERE reservation_group_id = $1",
        [group2Id],
      );
      expect(dbGroup2Reservations.rows.every((r) => r.status === "held")).toBe(
        true,
      );
    });

    it("Case 4.2: Callback cancel vs complete race (UV-AC-046) enforces terminal immutability and outcall fencing", async () => {
      const f = await seedVoiceFixture();
      const taskId = randomUUID();

      // Instance A and Instance B are real VoiceCallbackService objects, each
      // wired to the same Postgres pool via its own DatabaseService, driving
      // the CAS terminal-state fencing through completeCallbackDurable /
      // cancelCallbackDurable (UV-EXEC-024: real service, not test-written
      // UPDATE predicates supplying their own guard).
      const instA = createInstance();
      const instB = createInstance();
      const callbackSvcA = new VoiceCallbackService(undefined, instA.database);
      const callbackSvcB = new VoiceCallbackService(undefined, instB.database);

      // Seed real callback task in voice.callback_task
      await pool.query(
        `INSERT INTO voice.callback_task (
          task_id, voice_session_id, contact_phone_encrypted, contact_phone_lookup_token,
          consent_snapshot_hash, status, reason, resource_scope_id, version
         ) VALUES ($1, $2, 'enc-0912345678', 'lookup-0912', 'consent-hash-1', 'pending', 'driver inquiry', $3, 1)`,
        [taskId, f.request.voiceSessionId, f.scopeId],
      );

      // Operator completes task (Instance A) via the real service's DB CAS
      const completeRes = await callbackSvcA.completeCallbackDurable({
        taskId,
        operatorId: "op-001",
        expectedVersion: 1,
      });
      expect(completeRes.status).toBe("completed");
      expect(completeRes.replayed).toBe(false);

      // Record successful outcall attempt in voice.callback_attempt
      await pool.query(
        `INSERT INTO voice.callback_attempt (
          attempt_id, task_id, attempt_number, operator_id, started_at, ended_at, outcome
         ) VALUES (gen_random_uuid(), $1, 1, 'op-001', now() - interval '2 minutes', now(), 'succeeded')`,
        [taskId],
      );

      // Competing cancellation (Instance B) attempts to cancel the already
      // completed task through the real service. Terminal state CAS: cannot
      // cancel a completed task.
      await expect(
        callbackSvcB.cancelCallbackDurable({
          taskId,
          reason: "customer_requested_after_completion",
          expectedVersion: 2,
        }),
      ).rejects.toMatchObject({ code: "CALLBACK_TERMINAL_RACE_CONFLICT" });

      // Verify DB final state remains completed
      const checkTask1 = await pool.query(
        "SELECT status, version FROM voice.callback_task WHERE task_id = $1",
        [taskId],
      );
      expect(checkTask1.rows[0].status).toBe("completed");
      expect(checkTask1.rows[0].version).toBe(2);

      // Scenario 1b: a genuine concurrent barrier -- fire complete (A) and
      // cancel (B) at the same time via Promise.allSettled on a fresh task,
      // rather than sequential awaits, so Postgres's own row lock (not test
      // ordering) decides the winner. Exactly one must land; the loser must
      // observe the real winning terminal state, not its own stale guess.
      const task1bId = randomUUID();
      await pool.query(
        `INSERT INTO voice.callback_task (
          task_id, voice_session_id, contact_phone_encrypted, contact_phone_lookup_token,
          consent_snapshot_hash, status, reason, resource_scope_id, version
         ) VALUES ($1, $2, 'enc-0913000000', 'lookup-0913', 'consent-hash-1b', 'pending', 'concurrent race', $3, 1)`,
        [task1bId, f.request.voiceSessionId, f.scopeId],
      );

      const [raceComplete, raceCancel] = await Promise.allSettled([
        callbackSvcA.completeCallbackDurable({
          taskId: task1bId,
          operatorId: "op-003",
          expectedVersion: 1,
        }),
        callbackSvcB.cancelCallbackDurable({
          taskId: task1bId,
          reason: "concurrent_customer_cancel",
          expectedVersion: 1,
        }),
      ]);

      const settled = [raceComplete, raceCancel];
      const fulfilled = settled.filter((r) => r.status === "fulfilled");
      const rejected = settled.filter((r) => r.status === "rejected");
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(
        (rejected[0] as PromiseRejectedResult).reason?.code,
      ).toBe("CALLBACK_TERMINAL_RACE_CONFLICT");

      const task1bFinal = await pool.query(
        "SELECT status, version FROM voice.callback_task WHERE task_id = $1",
        [task1bId],
      );
      // Whichever of complete/cancel won, exactly one terminal write landed
      // (version 2), and the fulfilled promise's own reported status agrees
      // with the persisted row -- proving the winner was determined by the
      // real DB CAS, not by which call happened to be issued first.
      expect(["completed", "cancelled"]).toContain(task1bFinal.rows[0].status);
      expect(task1bFinal.rows[0].version).toBe(2);
      if (raceComplete.status === "fulfilled") {
        expect(task1bFinal.rows[0].status).toBe("completed");
      } else {
        expect(task1bFinal.rows[0].status).toBe("cancelled");
      }

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

      // Customer cancels task (Instance B) through the real service
      const cancelRes = await callbackSvcB.cancelCallbackDurable({
        taskId: task2Id,
        reason: "customer hung up",
        expectedVersion: 1,
      });
      expect(cancelRes.status).toBe("cancelled");
      expect(cancelRes.replayed).toBe(false);

      // In-flight outcall attempts to complete / resurrect the task (Instance A)
      // Outcall attempt history is logged in voice.callback_attempt
      await pool.query(
        `INSERT INTO voice.callback_attempt (
          attempt_id, task_id, attempt_number, operator_id, started_at, ended_at, outcome
         ) VALUES (gen_random_uuid(), $1, 1, 'op-002', now() - interval '1 minute', now(), 'answered')`,
        [task2Id],
      );

      // But the outcall write MUST NOT resurrect the task to active/completed,
      // again through the real service (not a test-supplied UPDATE predicate).
      await expect(
        callbackSvcA.completeCallbackDurable({
          taskId: task2Id,
          operatorId: "op-002",
          expectedVersion: 2,
        }),
      ).rejects.toMatchObject({ code: "CALLBACK_TERMINAL_RACE_CONFLICT" });

      const task2Final = await pool.query(
        "SELECT status, version FROM voice.callback_task WHERE task_id = $1",
        [task2Id],
      );
      expect(task2Final.rows[0].status).toBe("cancelled");
      expect(task2Final.rows[0].version).toBe(2);

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
      // admin.audit_logs.tenant_id FKs to core.tenants; this suite has no
      // tenant lifecycle of its own, so seed the one row this session's
      // resource_scope_id will be recorded under.
      await pool.query("INSERT INTO core.tenants (tenant_id) VALUES ($1)", [
        f.scopeId,
      ]);

      const cmdA = new VoiceBookingCommandService(
        instA.repository,
        f.makeEvidence(instA.repository) as never,
        f.products as never,
        f.areas as never,
        f.access,
      );

      const auditServiceB = new AuditNotificationService(
        new AuditLogRepository(instB.database),
      );
      const handoffServiceB = new VoiceHandoffService(
        instB.sessionRepository,
        {} as any,
        instB.repository,
        new VoiceHandoffQueueService(),
        auditServiceB,
      );

      // Genuine concurrency (UV-EXEC-024 review: "never overlaps confirm/handoff
      // or tests confirm-first"): fire the handoff and the competing AI accept
      // at the same stale epoch without sequentially awaiting either first.
      // Both re-validate ownership under a real row lock at commit time --
      // initiateHandoff's CAS UPDATE, acceptNew's `FOR UPDATE` lockVoiceCommand
      // -- so whichever transaction's write actually lands first at Postgres
      // decides the other's fate; either ordering is individually valid.
      const [handoffSettled, acceptSettled] = await Promise.allSettled([
        handoffServiceB.initiateHandoff({
          voiceSessionId: f.request.voiceSessionId,
          expectedSessionVersion: 1,
          expectedLeaseEpoch: 1,
          reason: "passenger requested human operator",
        }),
        cmdA.accept("test-cred-a", {
          ...f.request,
          leaseEpoch: 1, // Stale once/if handoff wins the race
        }),
      ]);

      let handoffRes: Extract<
        typeof handoffSettled,
        { status: "fulfilled" }
      >["value"];
      if (handoffSettled.status === "fulfilled") {
        // Handoff-first: the concurrently-racing AI accept lost and must be
        // rejected once handoff's epoch bump is visible to it.
        handoffRes = handoffSettled.value;
        expect(acceptSettled.status).toBe("rejected");
        if (acceptSettled.status === "rejected") {
          expect(acceptSettled.reason).toBeInstanceOf(VoiceBookingRejection);
        }
        // No order or receipt was committed by the AI actor in this ordering.
        const counts = await getCounts(f.request.intentId);
        expect(counts.orders).toBe(0);
        expect(counts.receipts).toBe(0);
      } else {
        // Confirm-first: accept's transaction committed before handoff's CAS
        // landed, so handoff legitimately lost the race and must be retried
        // against the now-current session state -- exactly what a real
        // coordinator client does on a 409 VOICE_SESSION_NOT_OWNER.
        expect(acceptSettled.status).toBe("fulfilled");
        const current = await instB.repository.findSessionById(
          f.request.voiceSessionId,
        );
        handoffRes = await handoffServiceB.initiateHandoff({
          voiceSessionId: f.request.voiceSessionId,
          expectedSessionVersion: current!.sessionVersion,
          expectedLeaseEpoch: current!.leaseEpoch,
          reason: "passenger requested human operator",
        });
      }

      expect(["coordinator", "handoff"]).toContain(
        handoffRes.session.controlOwner,
      );

      // Regardless of which ordering actually occurred, control has now moved
      // past the AI worker's original epoch 1 -- its stale tool result must be
      // discarded and durably audited (not just returned in-process).
      const lateAiResult = await handoffServiceB.handleLateAiToolResult({
        voiceSessionId: f.request.voiceSessionId,
        leaseEpoch: 1,
        toolName: "confirm_booking_tool",
        toolResult: { confirmed: true },
      });

      expect(lateAiResult.accepted).toBe(false);
      expect(lateAiResult.audited).toBe(true);
      expect(lateAiResult.reason).toBe("session_handed_off_owner_changed");
      expect(lateAiResult.auditEventId).toBeTruthy();

      // Verify in PostgreSQL:
      // 1. Session control is locked to coordinator/handoff, past epoch 1
      const sessionRow = await pool.query(
        "SELECT control_owner, lease_epoch, dialog_state FROM voice.session WHERE voice_session_id = $1",
        [f.request.voiceSessionId],
      );
      expect(["coordinator", "handoff"]).toContain(
        sessionRow.rows[0].control_owner,
      );
      expect(sessionRow.rows[0].lease_epoch).toBeGreaterThan(1);

      // 2. The discarded late AI tool result was durably persisted to
      // admin.audit_logs -- the real DB write the prior review found missing.
      const auditRow = await pool.query(
        "SELECT action_name, resource_id, new_value FROM admin.audit_logs WHERE audit_id = $1",
        [lateAiResult.auditEventId],
      );
      expect(auditRow.rowCount).toBe(1);
      expect(auditRow.rows[0].action_name).toBe(
        "late_ai_tool_result_discarded",
      );
      expect(auditRow.rows[0].resource_id).toBe(f.request.voiceSessionId);
      expect(auditRow.rows[0].new_value).toMatchObject({
        reason: "session_handed_off_owner_changed",
        toolName: "confirm_booking_tool",
        callingLeaseEpoch: 1,
      });

      // 3. Confirmation remains accepted, not consumed by the stale AI worker
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
