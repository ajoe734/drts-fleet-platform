import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import type { DatabaseService } from "../../apps/api/src/common/db";
import { VoiceBookingRepository } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { OwnedMobilityRepository } from "../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { VoiceBookingCommandService } from "../../apps/api/src/modules/voice-booking/voice-booking-command.service";
import { VoiceCommandRunnerService } from "../../apps/api/src/modules/voice-booking/voice-command-runner.service";
import { voiceCommandFixture } from "../support/voice-booking-command-fixture";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");
// Explicit test connection needs CREATEDB. Only our random database is dropped;
// no product server, container, or shared database migration is started here.
const connectionString = process.env.UV_BOOKING_TEST_DATABASE_URL;
const migration = (name: string) =>
  readFileSync(
    new URL(`../../infra/migrations/${name}`, import.meta.url),
    "utf8",
  );

it("UV-EXEC-015 PostgreSQL evidence requires UV_BOOKING_TEST_DATABASE_URL", () => {
  expect(
    connectionString,
    "Set a PostgreSQL test admin URL with CREATEDB; mock tests do not establish atomicity",
  ).toBeTruthy();
});

describe.skipIf(!connectionString)(
  "UV-EXEC-015 real PostgreSQL transaction/crash matrix",
  () => {
    const databaseName = `uv_booking_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString });
    let pool: InstanceType<typeof Pool>;
    let created = false;
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
            if (prop === "query")
              return async (sql: string, values?: unknown[]) => {
                const injected = fault?.matches(sql) ? fault : undefined;
                if (injected) fault = undefined;
                if (injected && !injected.after)
                  throw new Error("injected connection loss before write");
                const result = await target.query(sql, values);
                if (injected?.after)
                  throw new Error("injected response loss after write");
                return result;
              };
            const value = Reflect.get(target, prop);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as PoolClient;
      },
    } as unknown as DatabaseService;
    const repository = new VoiceBookingRepository(database);
    const orders = new OwnedMobilityRepository(database);

    beforeAll(async () => {
      await admin.query(`CREATE DATABASE ${databaseName}`);
      created = true;
      const url = new URL(connectionString!);
      url.pathname = `/${databaseName}`;
      pool = new Pool({ connectionString: url.toString() });
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
        "V0088__voice_runtime_identity_linkage.sql",
        "V0089__owned_order_aggregate_version.sql",
        "V0092__voice_booking_command_proof.sql",
      ])
        await pool.query(migration(name));
    });
    afterAll(async () => {
      if (pool) await pool.end();
      if (created) await admin.query(`DROP DATABASE ${databaseName}`);
      await admin.end();
    });

    async function fixture() {
      fault = undefined;
      const f = voiceCommandFixture();
      const lineId = randomUUID(),
        profileId = randomUUID(),
        eventId = randomUUID();
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
        `INSERT INTO voice.session (voice_session_id,call_id,provider_account_id,provider_call_id,resource_scope_id,
      line_binding_id,route_profile_id,route_profile_version,dialog_state,media_state,lease_epoch,confirmation_state,last_applied_control_sequence)
      VALUES ($1,$2,$3,$2,$4,$5,$6,1,'confirming','active',1,'accepted',1)`,
        [
          f.request.voiceSessionId,
          f.callId,
          f.authority.providerAccountId,
          f.scopeId,
          lineId,
          profileId,
        ],
      );
      await pool.query(
        "INSERT INTO voice.intent (intent_id,voice_session_id,current_draft_version) VALUES ($1,$2,1)",
        [f.request.intentId, f.request.voiceSessionId],
      );
      await pool.query(
        `INSERT INTO voice.draft_revision (intent_id,draft_version,slots,canonical_snapshot,snapshot_hash)
      VALUES ($1,1,'{}',$2::jsonb,$3)`,
        [
          f.request.intentId,
          JSON.stringify(f.snapshot),
          f.request.snapshotHash,
        ],
      );
      await pool.query(
        `INSERT INTO voice.session_event (event_id,voice_session_id,source,provider_account_id,source_event_id,
      occurred_at,sequence,lease_epoch,event_type,payload) VALUES ($1,$2,'test',$3,$1,now(),1,1,'dtmf','{}')`,
        [eventId, f.request.voiceSessionId, f.authority.providerAccountId],
      );
      await pool.query(
        `INSERT INTO voice.recording_checkpoint (checkpoint_id,call_id,recording_id,manifest_version,manifest,manifest_hash,coverage,policy_version,verified_at)
      VALUES ($1,$2,$2,1,'{}','manifest-hash',$3::jsonb,'policy',now())`,
        [
          f.checkpointId,
          f.callId,
          JSON.stringify({
            snapshotHash: f.request.snapshotHash,
            readbackPlaybackId: f.playbackId,
          }),
        ],
      );
      await pool.query(
        `INSERT INTO voice.confirmation (confirmation_id,voice_session_id,intent_id,draft_version,action,confirmation_method,
      snapshot_hash,readback_playback_id,readback_completed_event_id,input_epoch,media_epoch,control_sequence,lease_epoch,
      recording_checkpoint_id,evidence,state,confirmed_at,expires_at)
      VALUES ($1,$2,$3,1,'create_owned_order','dtmf',$4,$5,$6,0,0,1,1,$7,'{}','accepted',now(),$8)`,
        [
          f.request.confirmationId,
          f.request.voiceSessionId,
          f.request.intentId,
          f.request.snapshotHash,
          f.playbackId,
          eventId,
          f.checkpointId,
          f.expiry,
        ],
      );
      // Provider/auth edges are injected; every storage operation and constraint
      // in the command and runner below uses the real PostgreSQL repositories.
      const access = {
        authorizeRead: async () => f.authority,
        authorizeAccept: async () => f.authority,
        credentialForCommand: async () => "command-scoped-test-credential",
      };
      const evidence = {
        requireCheckpoint: async () =>
          repository.findRecordingCheckpointById(f.checkpointId),
      };
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
      const commands = new VoiceBookingCommandService(
        repository,
        evidence as never,
        products as never,
        areas as never,
        access,
      );
      const runner = new VoiceCommandRunnerService(commands, orders);
      return {
        ...f,
        commands,
        runner,
        accept: () => commands.accept("test", f.request),
        close: () =>
          pool.query(
            "UPDATE voice.session SET dialog_state='closed',media_state='ended',control_owner='none',lease_epoch=lease_epoch+1,session_version=session_version+1 WHERE voice_session_id=$1",
            [f.request.voiceSessionId],
          ),
      };
    }

    async function counts(intentId: string) {
      const result = await pool.query(
        `SELECT
      (SELECT count(*)::int FROM ops.phase1_owned_orders WHERE voice_intent_id=$1) AS orders,
      (SELECT count(*)::int FROM voice.command_receipt WHERE intent_id=$1) AS receipts,
      (SELECT count(*)::int FROM voice.booking_audit_intent a JOIN voice.command_receipt r USING(command_id) WHERE r.intent_id=$1) AS audits`,
        [intentId],
      );
      return result.rows[0];
    }
    it("concurrent duplicates produce one receipt/order, consume proof, link call and enqueue post-commit work", async () => {
      const f = await fixture();
      const accepted = await Promise.all([f.accept(), f.accept()]);
      expect(accepted[0].commandId).toBe(accepted[1].commandId);
      const results = await Promise.all([
        f.runner.execute(accepted[0].commandId),
        f.runner.execute(accepted[0].commandId),
      ]);
      expect(results[0].status).toBe("succeeded");
      expect(results[0].orderId).toBe(results[1].orderId);
      expect(await counts(f.request.intentId)).toEqual({
        orders: 1,
        receipts: 1,
        audits: 1,
      });
      expect(
        (
          await pool.query(
            "SELECT linked_order_id FROM crm.phase1_call_sessions WHERE call_id=$1",
            [f.callId],
          )
        ).rows[0].linked_order_id,
      ).toBe(results[0].orderId);
      expect(
        (
          await pool.query(
            "SELECT state,consumed_command_id FROM voice.confirmation WHERE confirmation_id=$1",
            [f.request.confirmationId],
          )
        ).rows[0],
      ).toEqual({
        state: "consumed",
        consumed_command_id: accepted[0].commandId,
      });
      const work = await pool.query(
        "SELECT work_type,status FROM voice.work_item WHERE command_id=$1 ORDER BY work_type",
        [accepted[0].commandId],
      );
      expect(work.rows).toEqual([
        { work_type: "dispatch_owned_order", status: "pending" },
        { work_type: "execute_booking_command", status: "completed" },
        { work_type: "notify_booking_result", status: "pending" },
        { work_type: "publish_booking_audit", status: "pending" },
      ]);
      await f.close();
      await pool.query(
        "UPDATE voice.confirmation SET expires_at=now()-interval '1 second' WHERE confirmation_id=$1",
        [f.request.confirmationId],
      );
      expect((await f.accept()).orderId).toBe(results[0].orderId);
      await expect(
        f.commands.accept("test", { ...f.request, snapshotHash: "other" }),
      ).rejects.toMatchObject({ code: "VOICE_ACTION_PAYLOAD_CONFLICT" });
    });
    it("crash before durable accept leaves no command; hangup cannot submit it later", async () => {
      const f = await fixture();
      fault = {
        matches: (sql) =>
          sql.startsWith("INSERT INTO voice.booking_command_proof"),
      };
      await expect(f.accept()).rejects.toThrow("injected");
      expect(await counts(f.request.intentId)).toEqual({
        orders: 0,
        receipts: 0,
        audits: 0,
      });
      await f.close();
      await expect(f.accept()).rejects.toMatchObject({
        code: "VOICE_SESSION_NOT_OWNER",
      });
    });
    it("lost accept acknowledgement resolves by the known session/intent/action", async () => {
      const f = await fixture();
      fault = { matches: (sql) => sql === "COMMIT", after: true };
      const accepted = await f.accept();
      expect(accepted.status).toBe("pending");
      expect(
        (
          await f.commands.query(
            "test",
            f.request.voiceSessionId,
            f.request.intentId,
          )
        )?.commandId,
      ).toBe(accepted.commandId);
    });
    it.each(["order", "call", "receipt", "audit", "commit"])(
      "crash at %s rolls back all order effects and recovers after hangup",
      async (stage) => {
        const f = await fixture();
        const accepted = await f.accept();
        await f.close();
        const marker = {
          order: "INSERT INTO ops.phase1_owned_orders",
          call: "UPDATE crm.phase1_call_sessions",
          receipt: "UPDATE voice.command_receipt SET status = 'succeeded'",
          audit: "INSERT INTO voice.booking_audit_intent",
          commit: "COMMIT",
        }[stage]!;
        let commits = 0;
        fault = {
          matches: (sql) =>
            stage === "commit"
              ? sql === "COMMIT" && ++commits === 2
              : sql.includes(marker),
        };
        await expect(f.runner.execute(accepted.commandId)).rejects.toThrow(
          "injected",
        );
        expect(await counts(f.request.intentId)).toEqual({
          orders: 0,
          receipts: 1,
          audits: 0,
        });
        expect(
          (await repository.findReceiptById(accepted.commandId))?.status,
        ).toBe("pending");
        expect((await f.runner.execute(accepted.commandId)).status).toBe(
          "succeeded",
        );
        expect(await counts(f.request.intentId)).toEqual({
          orders: 1,
          receipts: 1,
          audits: 1,
        });
      },
    );
    it("lost order COMMIT response replays the durable success without a second order", async () => {
      const f = await fixture();
      const accepted = await f.accept();
      let commits = 0;
      fault = {
        matches: (sql) => sql === "COMMIT" && ++commits === 2,
        after: true,
      };
      await expect(f.runner.execute(accepted.commandId)).rejects.toThrow(
        "injected",
      );
      const result = await f.runner.execute(accepted.commandId);
      expect(result.status).toBe("succeeded");
      expect(await counts(f.request.intentId)).toEqual({
        orders: 1,
        receipts: 1,
        audits: 1,
      });
    });
    it.each(["expired", "corrected"])(
      "durably rejects %s accepted proof and never changes its hash",
      async (reason) => {
        const f = await fixture();
        const accepted = await f.accept();
        await pool.query(
          reason === "expired"
            ? "UPDATE voice.confirmation SET expires_at=now()-interval '1 second' WHERE confirmation_id=$1"
            : "UPDATE voice.confirmation SET state='invalidated' WHERE confirmation_id=$1",
          [f.request.confirmationId],
        );
        const rejected = await f.runner.execute(accepted.commandId);
        expect(rejected.status).toBe("rejected");
        expect(rejected.payloadHash).toBe(accepted.payloadHash);
        expect(await counts(f.request.intentId)).toEqual({
          orders: 0,
          receipts: 1,
          audits: 0,
        });
      },
    );
    it("unresolved input keeps pending and resolved unrelated input can resume", async () => {
      const f = await fixture();
      const accepted = await f.accept();
      await pool.query(
        "UPDATE voice.session SET pending_input=true,input_epoch=1 WHERE voice_session_id=$1",
        [f.request.voiceSessionId],
      );
      await expect(f.runner.execute(accepted.commandId)).rejects.toMatchObject({
        code: "VOICE_INPUT_PENDING",
      });
      expect(
        (await repository.findReceiptById(accepted.commandId))?.status,
      ).toBe("pending");
      await pool.query(
        "UPDATE voice.session SET pending_input=false,last_resolved_input_epoch=1 WHERE voice_session_id=$1",
        [f.request.voiceSessionId],
      );
      expect((await f.runner.execute(accepted.commandId)).status).toBe(
        "succeeded",
      );
    });
    it("expired scheduling lease recovers a closed session and fences stale releases", async () => {
      const f = await fixture();
      const accepted = await f.accept();
      await f.close();
      await pool.query(
        "UPDATE voice.work_item SET status='leased',leased_until=now()-interval '1 second',lease_epoch=5 WHERE command_id=$1",
        [accepted.commandId],
      );
      expect((await f.runner.runOnce())?.commandId).toBe(accepted.commandId);
      expect(
        (await repository.findReceiptById(accepted.commandId))?.status,
      ).toBe("succeeded");
    });
    it("session lock has a deadline and a blocked accept cannot leak pending state", async () => {
      const f = await fixture();
      const blocker = await pool.connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query(
          "SELECT voice_session_id FROM voice.session WHERE voice_session_id=$1 FOR UPDATE",
          [f.request.voiceSessionId],
        );
        await expect(f.accept()).rejects.toMatchObject({ code: "55P03" });
        expect(await counts(f.request.intentId)).toEqual({
          orders: 0,
          receipts: 0,
          audits: 0,
        });
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
    }, 10_000);
  },
);
