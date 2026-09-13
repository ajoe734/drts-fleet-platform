import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SR-LAUNCH-SCHEMA-20260913: Non-serving Schema Allocation & Migration Contract Invariants", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const allocationPath = path.join(
    repoRoot,
    "docs/04-uat/system-remediation-20260906/schema-allocation.json",
  );
  const migrationsDir = path.join(repoRoot, "infra/migrations");

  // ==========================================================================
  // 1. Schema Allocation Authority Invariants
  // ==========================================================================
  describe("Schema Allocation Authority (schema-allocation.json)", () => {
    it("exists, is valid JSON, and preserves the SR-CONTRACT-001 base allocation untouched", () => {
      expect(fs.existsSync(allocationPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      expect(content.task_id).toBe("SR-CONTRACT-001");
      expect(content.wave_id).toBe("system-remediation-20260906");
      expect(content.allocations).toHaveLength(3);

      const versions = content.allocations.map((a: any) => a.version);
      expect(versions).toEqual(["V0094", "V0095", "V0096"]);
    });

    it("preserves additional_allocations (V0098-V0100) untouched from SR-RECOVERY-CONTRACTS-20260911", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      expect(content.additional_allocations).toHaveLength(3);

      const additionalVersions = content.additional_allocations.map(
        (a: any) => a.version,
      );
      expect(additionalVersions).toEqual(["V0098", "V0099", "V0100"]);
    });

    it("allocates discrete sequential launch migrations V0101-V0103 without collision", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      const launch = content.launch_allocations;
      expect(Array.isArray(launch)).toBe(true);
      expect(launch).toHaveLength(3);

      const v101 = launch.find((a: any) => a.version === "V0101");
      expect(v101).toBeDefined();
      expect(v101.task_id).toBe("SR-LAUNCH-SCHEMA-20260913");
      expect(v101.migration_filename).toBe("V0101__voice_work_recovery_audit.sql");
      expect(v101.domain).toBe("voice_work_recovery_audit");
      expect(v101.target_schema).toBe("voice");
      expect(v101.primary_tables).toEqual([
        "voice.phase1_work_item_repair_audits",
        "voice.phase1_work_item_attempt_audits",
      ]);
      expect(v101.referenced_tables).toEqual(["voice.work_item"]);

      const v102 = launch.find((a: any) => a.version === "V0102");
      expect(v102).toBeDefined();
      expect(v102.task_id).toBe("SR-LAUNCH-SCHEMA-20260913");
      expect(v102.migration_filename).toBe("V0102__registry_expiry_processing.sql");
      expect(v102.domain).toBe("registry_expiry_processing");
      expect(v102.target_schema).toBe("reg");
      expect(v102.primary_tables).toEqual([
        "reg.phase1_registry_expiry_events",
        "reg.phase1_registry_expiry_delivery_intents",
      ]);
      expect(v102.referenced_tables).toEqual([
        "reg.phase1_registry_drivers",
        "reg.phase1_registry_policies",
      ]);

      const v103 = launch.find((a: any) => a.version === "V0103");
      expect(v103).toBeDefined();
      expect(v103.task_id).toBe("SR-LAUNCH-SCHEMA-20260913");
      expect(v103.migration_filename).toBe("V0103__notification_mail_outbox.sql");
      expect(v103.domain).toBe("notification_mail_outbox");
      expect(v103.target_schema).toBe("ops");
      expect(v103.primary_tables).toEqual([
        "ops.phase1_notification_mail_deliveries",
        "ops.phase1_notification_mail_outbox_lock",
      ]);

      // Verify no duplicate versions across base allocations, additional allocations, and launch allocations
      const allAllocatedVersions = [
        ...content.allocations.map((a: any) => a.version),
        ...content.additional_allocations.map((a: any) => a.version),
        ...launch.map((a: any) => a.version),
      ];
      expect(new Set(allAllocatedVersions).size).toBe(allAllocatedVersions.length);
    });

    it("records substantive table_invariants for each allocated launch domain", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      for (const alloc of content.launch_allocations) {
        expect(Array.isArray(alloc.table_invariants)).toBe(true);
        expect(alloc.table_invariants.length).toBeGreaterThanOrEqual(3);
      }

      const v101 = content.launch_allocations.find((a: any) => a.version === "V0101");
      const v101Invariants = v101.table_invariants.join("\n");
      expect(v101Invariants).toContain("attempt_stage");
      expect(v101Invariants).toContain("uq_phase1_work_item_attempt_stage");
      expect(v101Invariants).toContain("voice._make_append_only");

      const v102 = content.launch_allocations.find((a: any) => a.version === "V0102");
      const v102Invariants = v102.table_invariants.join("\n");
      expect(v102Invariants).toContain("source_fingerprint");
      expect(v102Invariants).toContain("reg.enforce_phase1_expiry_delivery_intent_immutability");

      const v103 = content.launch_allocations.find((a: any) => a.version === "V0103");
      const v103Invariants = v103.table_invariants.join("\n");
      expect(v103Invariants).toContain("Single persisted attempt authority");
      expect(v103Invariants).toContain("attempts jsonb");
      expect(v103Invariants).not.toContain("ops.phase1_notification_mail_attempts");
    });

    it("records an amendment entry for SR-LAUNCH-SCHEMA-20260913 documenting Codex review fixes", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      const amendment = content.amendments.find(
        (a: any) => a.amended_by_task_id === "SR-LAUNCH-SCHEMA-20260913",
      );
      expect(amendment).toBeDefined();
      expect(amendment.scope).toContain("V0101-V0103");
      expect(amendment.reason).toContain("Phase 1 launch remediation");
      expect(amendment.reason).toContain("finite append-only attempt event contract");
      expect(amendment.reason).toContain("concrete trigger-enforced immutability boundary");
      expect(amendment.reason).toContain("single persisted attempt authority");
    });
  });

  // ==========================================================================
  // 2. Migration DDL & Contract Invariants
  // ==========================================================================
  describe("Migration DDL & Contract Invariants (infra/migrations/V0101-V0103)", () => {
    it("all allocated SQL files exist on disk with exact filenames matching schema-allocation.json", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      for (const alloc of content.launch_allocations) {
        const filePath = path.join(migrationsDir, alloc.migration_filename);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });

    describe("V0101__voice_work_recovery_audit.sql", () => {
      const sql = fs.readFileSync(
        path.join(migrationsDir, "V0101__voice_work_recovery_audit.sql"),
        "utf8",
      );

      it("creates voice.phase1_work_item_repair_audits with required columns, FK, and deduplication", () => {
        expect(sql).toContain(
          "CREATE TABLE IF NOT EXISTS voice.phase1_work_item_repair_audits",
        );
        expect(sql).toContain(
          "work_id uuid NOT NULL REFERENCES voice.work_item (work_id)",
        );
        expect(sql).toContain("request_id varchar(255) NOT NULL");
        expect(sql).toContain("actor_id varchar(100) NOT NULL");
        expect(sql).toContain("reason text NOT NULL");
        expect(sql).toContain("expected_lease_epoch integer NOT NULL");
        expect(sql).toContain("previous_status varchar(20) NOT NULL");
        expect(sql).toContain("previous_attempt_count integer NOT NULL");
        expect(sql).toContain("previous_last_error text");
        expect(sql).toContain("allocated_max_attempts integer NOT NULL DEFAULT 5");
        expect(sql).toContain(
          "CONSTRAINT uq_phase1_work_item_repair_dedupe UNIQUE (work_id, request_id)",
        );
      });

      it("creates voice.phase1_work_item_attempt_audits with finite append-only event contract supporting started and terminal events with duplicate protection", () => {
        expect(sql).toContain(
          "CREATE TABLE IF NOT EXISTS voice.phase1_work_item_attempt_audits",
        );
        expect(sql).toContain(
          "work_id uuid NOT NULL REFERENCES voice.work_item (work_id)",
        );
        expect(sql).toContain("attempt_no integer NOT NULL");
        expect(sql).toContain("lease_epoch integer NOT NULL");
        expect(sql).toContain(
          "attempt_stage IN ('started', 'terminal')",
        );
        expect(sql).toContain(
          "outcome IN ('started', 'completed', 'failed', 'fenced')",
        );
        expect(sql).toContain(
          "CONSTRAINT ck_phase1_work_item_attempt_stage_outcome CHECK (",
        );
        expect(sql).toContain(
          "CONSTRAINT uq_phase1_work_item_attempt_stage UNIQUE (work_id, lease_epoch, attempt_no, attempt_stage)",
        );
      });

      it("invokes voice._make_append_only on both audit tables", () => {
        expect(sql).toContain(
          "SELECT voice._make_append_only('voice.phase1_work_item_repair_audits');",
        );
        expect(sql).toContain(
          "SELECT voice._make_append_only('voice.phase1_work_item_attempt_audits');",
        );
      });

      it("preserves existing schema and data without destructive operations", () => {
        expect(sql).not.toContain("DROP TABLE");
        expect(sql).not.toContain("ALTER TABLE voice.work_item DROP");
        expect(sql).not.toContain("TRUNCATE");
      });
    });

    describe("V0102__registry_expiry_processing.sql", () => {
      const sql = fs.readFileSync(
        path.join(migrationsDir, "V0102__registry_expiry_processing.sql"),
        "utf8",
      );

      it("creates reg.phase1_registry_expiry_events with unique source fingerprint and claim index", () => {
        expect(sql).toContain(
          "CREATE TABLE IF NOT EXISTS reg.phase1_registry_expiry_events",
        );
        expect(sql).toContain("event_id uuid PRIMARY KEY DEFAULT gen_random_uuid()");
        expect(sql).toContain(
          "entity_type varchar(50) NOT NULL CHECK (entity_type IN ('driver', 'policy'))",
        );
        expect(sql).toContain("entity_id varchar(100) NOT NULL");
        expect(sql).toContain("credential_type varchar(100) NOT NULL");
        expect(sql).toContain("source_fingerprint text NOT NULL");
        expect(sql).toContain(
          "status IN ('pending', 'leased', 'completed', 'superseded', 'failed')",
        );
        expect(sql).toContain("lease_token integer NOT NULL DEFAULT 0");
        expect(sql).toContain(
          "CONSTRAINT uq_reg_expiry_events_fingerprint UNIQUE (source_fingerprint)",
        );
        expect(sql).toContain("idx_reg_expiry_events_claimable");
        expect(sql).toContain("idx_reg_expiry_events_entity");
      });

      it("creates reg.phase1_registry_expiry_delivery_intents with concrete trigger-enforced immutability boundary", () => {
        expect(sql).toContain(
          "CREATE TABLE IF NOT EXISTS reg.phase1_registry_expiry_delivery_intents",
        );
        expect(sql).toContain(
          "event_id uuid NOT NULL REFERENCES reg.phase1_registry_expiry_events (event_id)",
        );
        expect(sql).toContain("idempotency_key text NOT NULL");
        expect(sql).toContain("tenant_id varchar(100) NOT NULL");
        expect(sql).toContain("recipient_email text NOT NULL");
        expect(sql).toContain("from_email text NOT NULL");
        expect(sql).toContain("subject text NOT NULL");
        expect(sql).toContain("body text NOT NULL");
        expect(sql).toContain(
          "delivery_status IN ('pending', 'enqueued', 'sent', 'failed', 'superseded')",
        );
        expect(sql).toContain("outbox_delivery_id text");
        expect(sql).toContain(
          "CONSTRAINT uq_reg_expiry_delivery_intents_key UNIQUE (idempotency_key)",
        );

        // Immutability trigger function and trigger definition
        expect(sql).toContain(
          "CREATE OR REPLACE FUNCTION reg.enforce_phase1_expiry_delivery_intent_immutability()",
        );
        expect(sql).toContain("NEW.intent_id IS DISTINCT FROM OLD.intent_id");
        expect(sql).toContain("NEW.event_id IS DISTINCT FROM OLD.event_id");
        expect(sql).toContain("NEW.scope IS DISTINCT FROM OLD.scope");
        expect(sql).toContain("NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key");
        expect(sql).toContain("NEW.tenant_id IS DISTINCT FROM OLD.tenant_id");
        expect(sql).toContain("NEW.recipient_email IS DISTINCT FROM OLD.recipient_email");
        expect(sql).toContain("NEW.from_email IS DISTINCT FROM OLD.from_email");
        expect(sql).toContain("NEW.subject IS DISTINCT FROM OLD.subject");
        expect(sql).toContain("NEW.body IS DISTINCT FROM OLD.body");
        expect(sql).toContain("NEW.created_at IS DISTINCT FROM OLD.created_at");
        expect(sql).toContain(
          "CREATE TRIGGER trg_enforce_phase1_registry_expiry_delivery_intents_immutability",
        );
        expect(sql).toContain(
          "BEFORE UPDATE ON reg.phase1_registry_expiry_delivery_intents",
        );
      });
    });

    describe("V0103__notification_mail_outbox.sql", () => {
      const sql = fs.readFileSync(
        path.join(migrationsDir, "V0103__notification_mail_outbox.sql"),
        "utf8",
      );

      it("creates ops.phase1_notification_mail_deliveries with tenant-scoped idempotency and attempts jsonb as sole authority", () => {
        expect(sql).toContain(
          "CREATE TABLE IF NOT EXISTS ops.phase1_notification_mail_deliveries",
        );
        expect(sql).toContain(
          "delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid()",
        );
        expect(sql).toContain("tenant_id varchar(100) NOT NULL");
        expect(sql).toContain("idempotency_key text NOT NULL");
        expect(sql).toContain("message_id text NOT NULL");
        expect(sql).toContain("payload_hash text NOT NULL");
        expect(sql).toContain("status IN ('queued', 'sent', 'failed')");
        expect(sql).toContain("attempts jsonb NOT NULL DEFAULT '[]'::jsonb");
        expect(sql).toContain(
          "CONSTRAINT uq_phase1_notification_mail_tenant_key UNIQUE (tenant_id, idempotency_key)",
        );
        expect(sql).toContain("idx_phase1_notification_mail_due");
        expect(sql).toContain("idx_phase1_notification_mail_tenant");
      });

      it("creates ops.phase1_notification_mail_outbox_lock for multi-replica transaction serialization", () => {
        expect(sql).toContain(
          "CREATE TABLE IF NOT EXISTS ops.phase1_notification_mail_outbox_lock",
        );
        expect(sql).toContain(
          "lock_key varchar(50) PRIMARY KEY DEFAULT 'mail_outbox_master'",
        );
        expect(sql).toContain("INSERT INTO ops.phase1_notification_mail_outbox_lock");
        expect(sql).toContain("ON CONFLICT DO NOTHING");
      });

      it("does not create duplicate ops.phase1_notification_mail_attempts table", () => {
        expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS ops.phase1_notification_mail_attempts");
      });
    });
  });
});
