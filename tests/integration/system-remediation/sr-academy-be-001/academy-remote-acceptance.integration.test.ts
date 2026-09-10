import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import { RegulatoryRegistryRepository } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import {
  apiRequest,
  createAcademyAcceptanceApp,
  driverIdentity,
  mintAccessToken,
  opsAdminIdentity,
  tenantFleetAdminIdentity,
  type AcademyAcceptanceApp,
} from "./academy-acceptance-test-harness";
import type {
  FleetDriverRosterItem,
  FleetTrainingView,
  QuizResultRecord,
} from "@drts/contracts";

const require = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
const { Pool } = require("pg") as typeof import("pg");

const connectionString =
  process.env.DRTS_ACADEMY_TEST_DATABASE_URL || process.env.DATABASE_URL;

describe("SR-ACADEMY-BE-001 Real PostgreSQL Acceptance Suite", () => {
  let pool: InstanceType<typeof Pool> | null = null;
  let testApp: AcademyAcceptanceApp | null = null;

  beforeAll(async () => {
    if (!connectionString) {
      return;
    }
    pool = new Pool({ connectionString });
    testApp = await createAcademyAcceptanceApp();
  });

  afterAll(async () => {
    if (testApp) {
      await testApp.app.close();
    }
    if (pool) {
      await pool.end();
    }
  });

  describe("Suite 1: academy_remote_migration_preserves_records", () => {
    it.runIf(Boolean(connectionString))(
      "verifies V0095 migration lossless varchar conversion and dropped FK constraints",
      async () => {
        const client = await pool!.connect();
        try {
          // Verify column type conversions to varchar(100)
          const colRes = await client.query(`
            SELECT table_name, column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = 'reg'
              AND table_name IN ('driver_training_records', 'driver_reg_profiles')
              AND column_name = 'driver_id';
          `);

          expect(colRes.rows.length).toBe(2);
          for (const row of colRes.rows) {
            expect(row.data_type).toBe("character varying");
            expect(row.character_maximum_length).toBe(100);
          }

          // Verify dropped foreign key constraints
          const constraintRes = await client.query(`
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_schema = 'reg'
              AND constraint_name IN (
                'driver_training_records_driver_id_fkey',
                'driver_reg_profiles_driver_id_fkey'
              );
          `);
          expect(constraintRes.rows.length).toBe(0);

          // Verify seeded course exists
          const courseRes = await client.query(`
            SELECT course_id, course_version, course_code, passing_score
            FROM reg.phase1_driver_academy_courses
            WHERE course_id = 'crs_basics_001';
          `);
          expect(courseRes.rows.length).toBeGreaterThan(0);
          expect(courseRes.rows[0].course_code).toBe("platform_basics");
        } finally {
          client.release();
        }
      },
    );

    it.runIf(Boolean(connectionString))(
      "verifies legacy UUID rows preserved and runIdempotentBackfill textual join succeeds without type error",
      async () => {
        const client = await pool!.connect();
        try {
          const legacyDriverId = "00000000-0000-0000-0000-000000000001";

          // Seed legacy reg.drivers row (UUID)
          await client.query(`
            INSERT INTO reg.drivers (driver_id, full_name, mobile)
            VALUES ($1, 'Legacy Driver 1', '0912345001')
            ON CONFLICT (driver_id) DO NOTHING;
          `, [legacyDriverId]);

          // Seed legacy reg.driver_reg_profiles row
          await client.query(`
            INSERT INTO reg.driver_reg_profiles (driver_id, taxi_registration_no, taxi_registration_expiry, training_status)
            VALUES ($1, 'TX-LEGACY-001', '2028-12-31', 'pending')
            ON CONFLICT (driver_id) DO NOTHING;
          `, [legacyDriverId]);

          // Seed legacy reg.driver_training_records row
          await client.query(`
            INSERT INTO reg.driver_training_records (driver_id, course_name, course_type, completed_at, expires_at, result)
            VALUES ($1, 'Legacy Basic Training', 'orientation', now(), now() + interval '1 year', 'passed')
            ON CONFLICT DO NOTHING;
          `, [legacyDriverId]);

          // Run backfill through RegulatoryRegistryRepository
          const dbService = new DatabaseService();
          const registryRepo = new RegulatoryRegistryRepository(dbService);
          await registryRepo.runIdempotentBackfill();

          // Verify credential row backfilled with text representation of UUID
          const credRes = await client.query(`
            SELECT driver_id, registration_no, status, masked_display
            FROM reg.driver_public_registration_credentials
            WHERE driver_id = $1;
          `, [legacyDriverId]);

          expect(credRes.rows.length).toBe(1);
          expect(credRes.rows[0].driver_id).toBe(legacyDriverId);
          expect(credRes.rows[0].registration_no).toBe("TX-LEGACY-001");
          expect(credRes.rows[0].status).toBe("unverified");

          // Re-running backfill must be strictly idempotent
          await registryRepo.runIdempotentBackfill();
        } finally {
          client.release();
        }
      },
    );
  });

  describe("Suite 2: academy_real_identity_and_scope", () => {
    const driverId = "drv_acceptance_text_id_001";

    it.runIf(Boolean(connectionString))(
      "rejects unauthenticated requests and admits valid driver tokens using real runtime text IDs",
      async () => {
        const client = await pool!.connect();
        try {
          // Register runtime text driver in reg.phase1_registry_drivers
          await client.query(`
            INSERT INTO reg.phase1_registry_drivers (driver_id, full_name, work_state, licenses_valid, updated_at, record)
            VALUES ($1, 'Acceptance Driver One', 'active', true, now(), '{"test": true}'::jsonb)
            ON CONFLICT (driver_id) DO NOTHING;
          `, [driverId]);

          // 1. Unauthenticated request to /api/driver-academy/courses must be rejected
          const unauthRes = await apiRequest(
            testApp!.baseUrl,
            "GET",
            "/api/driver-academy/courses",
          );
          expect(unauthRes.status).toBe(401);

          // 2. Authenticated request with driver token
          const driverToken = await mintAccessToken(
            testApp!.jwtAuthService,
            driverIdentity(driverId),
          );
          const authRes = await apiRequest<{ data: { items: unknown[] } }>(
            testApp!.baseUrl,
            "GET",
            "/api/driver-academy/courses",
            { token: driverToken },
          );
          expect(authRes.status).toBe(200);
          expect(Array.isArray(authRes.body.data?.items)).toBe(true);
          expect(authRes.body.data.items.length).toBeGreaterThan(0);

          // 3. Driver cannot access attempts for another driver
          const otherDriverId = "drv_acceptance_other_002";
          await client.query(`
            INSERT INTO reg.phase1_registry_drivers (driver_id, full_name, work_state, licenses_valid, updated_at, record)
            VALUES ($1, 'Other Driver', 'active', true, now(), '{}'::jsonb)
            ON CONFLICT (driver_id) DO NOTHING;
          `, [otherDriverId]);

          const otherAttemptId = "att_other_999";
          await client.query(`
            INSERT INTO reg.phase1_driver_quiz_attempts (
              attempt_id, course_id, course_version, driver_id, attempted_at, score, passed, answers_summary
            ) VALUES ($1, 'crs_basics_001', 1, $2, now(), 100, true, '[]'::jsonb)
            ON CONFLICT (attempt_id) DO NOTHING;
          `, [otherAttemptId, otherDriverId]);

          const otherAttemptRes = await apiRequest(
            testApp!.baseUrl,
            "GET",
            `/api/driver-academy/courses/crs_basics_001/attempts/${otherAttemptId}`,
            { token: driverToken },
          );
          // Controller throws NOT_FOUND / ATTEMPT_NOT_FOUND when attempt belongs to another driver
          expect(otherAttemptRes.status).toBe(404);
        } finally {
          client.release();
        }
      },
    );

    it.runIf(Boolean(connectionString))(
      "enforces fleet tenant boundary: tenant realm isolated to own fleet, ops has global visibility",
      async () => {
        const ownFleet = "flt_tenant_own_101";
        const otherFleet = "flt_tenant_other_202";

        const tenantToken = await mintAccessToken(
          testApp!.jwtAuthService,
          tenantFleetAdminIdentity(ownFleet),
        );
        const opsToken = await mintAccessToken(
          testApp!.jwtAuthService,
          opsAdminIdentity(),
        );

        // Own fleet query with tenant token -> 200 OK
        const ownRes = await apiRequest(
          testApp!.baseUrl,
          "GET",
          `/api/fleet-partner/training/summary?fleetPartnerId=${ownFleet}`,
          { token: tenantToken },
        );
        expect(ownRes.status).toBe(200);

        // Cross-fleet query with tenant token -> 403 Forbidden
        const crossRes = await apiRequest<{ error?: { code?: string } }>(
          testApp!.baseUrl,
          "GET",
          `/api/fleet-partner/training/summary?fleetPartnerId=${otherFleet}`,
          { token: tenantToken },
        );
        expect(crossRes.status).toBe(403);
        expect(crossRes.body.error?.code).toBe("ACADEMY_FORBIDDEN_FLEET_ACCESS");

        // Cross-fleet query with ops token -> 200 OK
        const opsRes = await apiRequest(
          testApp!.baseUrl,
          "GET",
          `/api/fleet-partner/training/summary?fleetPartnerId=${otherFleet}`,
          { token: opsToken },
        );
        expect(opsRes.status).toBe(200);
      },
    );
  });

  describe("Suite 3: academy_durable_pass_expiry_projection", () => {
    const driverPassId = "drv_durable_pass_001";
    const driverFailId = "drv_durable_fail_002";

    it.runIf(Boolean(connectionString))(
      "grades quiz, persists attempt, writes training record and updates training_status on pass; omits record on fail",
      async () => {
        const client = await pool!.connect();
        try {
          // Ensure drivers exist in registry
          await client.query(`
            INSERT INTO reg.phase1_registry_drivers (driver_id, full_name, work_state, licenses_valid, updated_at, record)
            VALUES 
              ($1, 'Durable Pass Driver', 'active', true, now(), '{}'::jsonb),
              ($2, 'Durable Fail Driver', 'active', true, now(), '{}'::jsonb)
            ON CONFLICT (driver_id) DO NOTHING;
          `, [driverPassId, driverFailId]);

          // 1. Submit passing quiz (2/2 = 100% >= 80% passing_score)
          const passToken = await mintAccessToken(
            testApp!.jwtAuthService,
            driverIdentity(driverPassId),
          );
          const passRes = await apiRequest<{ data: QuizResultRecord }>(
            testApp!.baseUrl,
            "POST",
            "/api/driver-academy/courses/crs_basics_001/quiz/submit",
            {
              token: passToken,
              body: {
                courseVersion: 1,
                answers: [
                  { questionId: "q_basics_1", selectedOptionId: "opt_a" },
                  { questionId: "q_basics_2", selectedOptionId: "opt_b" },
                ],
              },
            },
          );

          expect(passRes.status).toBe(201);
          expect(passRes.body.data.passed).toBe(true);
          expect(passRes.body.data.score).toBe(100);

          // Verify raw SQL persistence for passing attempt
          const passAttemptSql = await client.query(`
            SELECT attempt_id, course_id, score, passed
            FROM reg.phase1_driver_quiz_attempts
            WHERE driver_id = $1 AND course_id = 'crs_basics_001';
          `, [driverPassId]);
          expect(passAttemptSql.rows.length).toBeGreaterThan(0);
          expect(passAttemptSql.rows[0].passed).toBe(true);

          // Verify training record inserted
          const passTrainingSql = await client.query(`
            SELECT training_record_id, driver_id, course_name, result, expires_at
            FROM reg.driver_training_records
            WHERE driver_id = $1;
          `, [driverPassId]);
          expect(passTrainingSql.rows.length).toBeGreaterThan(0);
          expect(passTrainingSql.rows[0].result).toBe("passed");
          expect(passTrainingSql.rows[0].expires_at).not.toBeNull();

          // Verify training_status projected as 'passed' in profile
          const passProfileSql = await client.query(`
            SELECT training_status
            FROM reg.driver_reg_profiles
            WHERE driver_id = $1;
          `, [driverPassId]);
          expect(passProfileSql.rows.length).toBe(1);
          expect(passProfileSql.rows[0].training_status).toBe("passed");

          // 2. Submit failing quiz (0/2 = 0% < 80%)
          const failToken = await mintAccessToken(
            testApp!.jwtAuthService,
            driverIdentity(driverFailId),
          );
          const failRes = await apiRequest<{ data: QuizResultRecord }>(
            testApp!.baseUrl,
            "POST",
            "/api/driver-academy/courses/crs_basics_001/quiz/submit",
            {
              token: failToken,
              body: {
                courseVersion: 1,
                answers: [
                  { questionId: "q_basics_1", selectedOptionId: "opt_c" },
                  { questionId: "q_basics_2", selectedOptionId: "opt_a" },
                ],
              },
            },
          );

          expect(failRes.status).toBe(201);
          expect(failRes.body.data.passed).toBe(false);
          expect(failRes.body.data.score).toBe(0);

          // Verify attempt persisted in raw SQL
          const failAttemptSql = await client.query(`
            SELECT attempt_id, score, passed
            FROM reg.phase1_driver_quiz_attempts
            WHERE driver_id = $1 AND course_id = 'crs_basics_001';
          `, [driverFailId]);
          expect(failAttemptSql.rows.length).toBeGreaterThan(0);
          expect(failAttemptSql.rows[0].passed).toBe(false);

          // Verify NO training record created for failing attempt
          const failTrainingSql = await client.query(`
            SELECT training_record_id
            FROM reg.driver_training_records
            WHERE driver_id = $1;
          `, [driverFailId]);
          expect(failTrainingSql.rows.length).toBe(0);

          // 3. Expiry projection: expire the passing record and attempt, then verify status updates to 'expired'
          await client.query(`
            UPDATE reg.driver_training_records
            SET expires_at = now() - interval '2 days'
            WHERE driver_id = $1;
          `, [driverPassId]);
          await client.query(`
            UPDATE reg.phase1_driver_quiz_attempts
            SET attempted_at = now() - interval '400 days'
            WHERE driver_id = $1;
          `, [driverPassId]);

          // Fetch records endpoint to trigger projection re-evaluation
          const recordsRes = await apiRequest(
            testApp!.baseUrl,
            "GET",
            "/api/driver-academy/records",
            { token: passToken },
          );
          expect(recordsRes.status).toBe(200);

          // Verify profile training_status flipped to 'expired'
          const expiredProfileSql = await client.query(`
            SELECT training_status
            FROM reg.driver_reg_profiles
            WHERE driver_id = $1;
          `, [driverPassId]);
          expect(expiredProfileSql.rows[0].training_status).toBe("expired");
        } finally {
          client.release();
        }
      },
    );
  });

  describe("Suite 4: academy_active_cohort_boundaries", () => {
    const fleetId = "flt_cohort_boundary_test";
    const activeDriver1 = "drv_cohort_active_01";
    const futureDriver2 = "drv_cohort_future_02";
    const expiredDriver3 = "drv_cohort_expired_03";
    const orphanDriver4 = "drv_cohort_orphan_04";

    it.runIf(Boolean(connectionString))(
      "applies exact active cohort boundaries: dedups duplicate affiliation, excludes future, expired and orphan affiliations",
      async () => {
        const client = await pool!.connect();
        try {
          // Register drivers 1, 2, 3 in reg.phase1_registry_drivers (orphan driver 4 is intentionally NOT registered)
          await client.query(`
            INSERT INTO reg.phase1_registry_drivers (driver_id, full_name, work_state, licenses_valid, updated_at, record)
            VALUES 
              ($1, 'Active Cohort Driver', 'active', true, now(), '{}'::jsonb),
              ($2, 'Future Cohort Driver', 'active', true, now(), '{}'::jsonb),
              ($3, 'Expired Cohort Driver', 'active', true, now(), '{}'::jsonb)
            ON CONFLICT (driver_id) DO NOTHING;
          `, [activeDriver1, futureDriver2, expiredDriver3]);

          // Seed affiliations in admin.phase1_driver_fleet_affiliations
          // 1. Active driver 1 - primary affiliation
          await client.query(`
            INSERT INTO admin.phase1_driver_fleet_affiliations (
              affiliation_id, fleet_partner_id, driver_id, affiliation_type, effective_from, effective_until, updated_at, record
            ) VALUES (
              'aff_active_1a', $1, $2, 'direct', now() - interval '10 days', now() + interval '30 days', now(), '{}'::jsonb
            ) ON CONFLICT (affiliation_id) DO NOTHING;
          `, [fleetId, activeDriver1]);

          // 2. Active driver 1 - duplicate overlapping affiliation in same fleet (must be deduplicated via DISTINCT)
          await client.query(`
            INSERT INTO admin.phase1_driver_fleet_affiliations (
              affiliation_id, fleet_partner_id, driver_id, affiliation_type, effective_from, effective_until, updated_at, record
            ) VALUES (
              'aff_active_1b', $1, $2, 'direct', now() - interval '5 days', now() + interval '20 days', now(), '{}'::jsonb
            ) ON CONFLICT (affiliation_id) DO NOTHING;
          `, [fleetId, activeDriver1]);

          // 3. Future driver 2 - effective_from in future (must be excluded from current active cohort)
          await client.query(`
            INSERT INTO admin.phase1_driver_fleet_affiliations (
              affiliation_id, fleet_partner_id, driver_id, affiliation_type, effective_from, effective_until, updated_at, record
            ) VALUES (
              'aff_future_2', $1, $2, 'direct', now() + interval '5 days', now() + interval '60 days', now(), '{}'::jsonb
            ) ON CONFLICT (affiliation_id) DO NOTHING;
          `, [fleetId, futureDriver2]);

          // 4. Expired driver 3 - effective_until in past (must be excluded)
          await client.query(`
            INSERT INTO admin.phase1_driver_fleet_affiliations (
              affiliation_id, fleet_partner_id, driver_id, affiliation_type, effective_from, effective_until, updated_at, record
            ) VALUES (
              'aff_expired_3', $1, $2, 'direct', now() - interval '40 days', now() - interval '5 days', now(), '{}'::jsonb
            ) ON CONFLICT (affiliation_id) DO NOTHING;
          `, [fleetId, expiredDriver3]);

          // 5. Orphan driver 4 - not in reg.phase1_registry_drivers (must be excluded by INNER JOIN)
          await client.query(`
            INSERT INTO admin.phase1_driver_fleet_affiliations (
              affiliation_id, fleet_partner_id, driver_id, affiliation_type, effective_from, effective_until, updated_at, record
            ) VALUES (
              'aff_orphan_4', $1, $2, 'direct', now() - interval '10 days', now() + interval '30 days', now(), '{}'::jsonb
            ) ON CONFLICT (affiliation_id) DO NOTHING;
          `, [fleetId, orphanDriver4]);

          // Ensure activeDriver1 has passed quiz attempt, training record, and profile
          await client.query(`
            INSERT INTO reg.phase1_driver_quiz_attempts (
              attempt_id, course_id, course_version, driver_id, score, passed, attempted_at, answers_summary
            ) VALUES (
              'att_cohort_active_01', 'crs_basics_001', 1, $1, 100, true, now() - interval '1 day', '[]'::jsonb
            ) ON CONFLICT (attempt_id) DO NOTHING;
          `, [activeDriver1]);
          await client.query(`
            INSERT INTO reg.driver_training_records (driver_id, course_name, course_type, completed_at, expires_at, result)
            VALUES ($1, '平台合作基礎', 'compliance', now() - interval '1 day', now() + interval '364 days', 'passed')
            ON CONFLICT DO NOTHING;
          `, [activeDriver1]);
          await client.query(`
            INSERT INTO reg.driver_reg_profiles (driver_id, training_status, last_training_at)
            VALUES ($1, 'passed', now() - interval '1 day')
            ON CONFLICT (driver_id) DO UPDATE SET training_status = 'passed';
          `, [activeDriver1]);

          // Query fleet training summary
          const opsToken = await mintAccessToken(
            testApp!.jwtAuthService,
            opsAdminIdentity(),
          );
          const summaryRes = await apiRequest<{ data: FleetTrainingView }>(
            testApp!.baseUrl,
            "GET",
            `/api/fleet-partner/training/summary?fleetPartnerId=${fleetId}`,
            { token: opsToken },
          );

          expect(summaryRes.status).toBe(200);
          const summaryData = summaryRes.body.data;
          expect(summaryData.fleetPartnerId).toBe(fleetId);

          // Total denominator must be exactly 1: activeDriver1 only
          // Future, expired, and orphan drivers must be excluded; duplicate row must be deduplicated
          const basicsRow = summaryData.rows.find(
            (r) => r.course === "平台合作基礎",
          );
          expect(basicsRow).toBeDefined();
          expect(basicsRow!.total).toBe(1);
          expect(basicsRow!.completed).toBe(1);
          expect(basicsRow!.pct).toBe(100);

          // Query fleet training roster
          const rosterRes = await apiRequest<{ data: { items: FleetDriverRosterItem[] } }>(
            testApp!.baseUrl,
            "GET",
            `/api/fleet-partner/training/roster?fleetPartnerId=${fleetId}`,
            { token: opsToken },
          );

          expect(rosterRes.status).toBe(200);
          const rosterItems = rosterRes.body.data?.items ?? [];
          expect(rosterItems.length).toBe(1);
          expect(rosterItems[0].driverId).toBe(activeDriver1);
          expect(rosterItems[0].status).toBe("passed");
        } finally {
          client.release();
        }
      },
    );
  });
});
