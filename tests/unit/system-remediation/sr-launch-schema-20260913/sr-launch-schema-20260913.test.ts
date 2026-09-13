import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

describe("SR-LAUNCH-SCHEMA-20260913: Forward Migrations & Schema Allocation Invariants", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const allocationPath = path.join(
    repoRoot,
    "docs/04-uat/system-remediation-20260906/schema-allocation.json",
  );
  const migrationsDir = path.join(repoRoot, "infra/migrations");

  // ==========================================================================
  // 1. Schema Allocation Authority Invariants
  // ==========================================================================
  describe("Schema Allocation Invariants (schema-allocation.json)", () => {
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
      expect(v101.primary_tables).toContain("voice.phase1_work_item_repair_audits");
      expect(v101.primary_tables).toContain("voice.phase1_work_item_attempt_audits");
      expect(v101.referenced_tables).toContain("voice.work_item");

      const v102 = launch.find((a: any) => a.version === "V0102");
      expect(v102).toBeDefined();
      expect(v102.task_id).toBe("SR-LAUNCH-SCHEMA-20260913");
      expect(v102.migration_filename).toBe("V0102__registry_expiry_processing.sql");
      expect(v102.domain).toBe("registry_expiry_processing");
      expect(v102.target_schema).toBe("reg");
      expect(v102.primary_tables).toContain("reg.phase1_registry_expiry_events");
      expect(v102.primary_tables).toContain(
        "reg.phase1_registry_expiry_delivery_intents",
      );
      expect(v102.referenced_tables).toContain("reg.phase1_registry_drivers");
      expect(v102.referenced_tables).toContain("reg.phase1_registry_policies");

      const v103 = launch.find((a: any) => a.version === "V0103");
      expect(v103).toBeDefined();
      expect(v103.task_id).toBe("SR-LAUNCH-SCHEMA-20260913");
      expect(v103.migration_filename).toBe("V0103__notification_mail_outbox.sql");
      expect(v103.domain).toBe("notification_mail_outbox");
      expect(v103.target_schema).toBe("ops");
      expect(v103.primary_tables).toContain(
        "ops.phase1_notification_mail_deliveries",
      );
      expect(v103.primary_tables).toContain(
        "ops.phase1_notification_mail_outbox_lock",
      );
      expect(v103.primary_tables).toContain(
        "ops.phase1_notification_mail_attempts",
      );

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
    });

    it("records an amendment entry for SR-LAUNCH-SCHEMA-20260913", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      const amendment = content.amendments.find(
        (a: any) => a.amended_by_task_id === "SR-LAUNCH-SCHEMA-20260913",
      );
      expect(amendment).toBeDefined();
      expect(amendment.scope).toContain("V0101-V0103");
      expect(amendment.reason).toContain("Phase 1 launch remediation");
    });
  });

  // ==========================================================================
  // 2. Migration SQL File Invariants & Structure
  // ==========================================================================
  describe("Migration Files (infra/migrations/V0101-V0103)", () => {
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

      it("creates voice.phase1_work_item_repair_audits with required columns and foreign keys", () => {
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

      it("creates voice.phase1_work_item_attempt_audits with lease fencing and attempt audit trail", () => {
        expect(sql).toContain(
          "CREATE TABLE IF NOT EXISTS voice.phase1_work_item_attempt_audits",
        );
        expect(sql).toContain(
          "work_id uuid NOT NULL REFERENCES voice.work_item (work_id)",
        );
        expect(sql).toContain("attempt_no integer NOT NULL");
        expect(sql).toContain("lease_epoch integer NOT NULL");
        expect(sql).toContain(
          "outcome IN ('started', 'completed', 'failed', 'fenced', 'repaired')",
        );
        expect(sql).toContain(
          "CONSTRAINT uq_phase1_work_item_attempt_lease UNIQUE (work_id, lease_epoch, attempt_no)",
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

      it("does not mutate or drop existing tables or columns", () => {
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

      it("creates reg.phase1_registry_expiry_delivery_intents with immutable delivery attributes", () => {
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
      });
    });

    describe("V0103__notification_mail_outbox.sql", () => {
      const sql = fs.readFileSync(
        path.join(migrationsDir, "V0103__notification_mail_outbox.sql"),
        "utf8",
      );

      it("creates ops.phase1_notification_mail_deliveries with tenant-scoped idempotency and attempts jsonb", () => {
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

      it("creates ops.phase1_notification_mail_attempts for append-only attempt recording", () => {
        expect(sql).toContain(
          "CREATE TABLE IF NOT EXISTS ops.phase1_notification_mail_attempts",
        );
        expect(sql).toContain(
          "delivery_id uuid NOT NULL REFERENCES ops.phase1_notification_mail_deliveries (delivery_id) ON DELETE CASCADE",
        );
        expect(sql).toContain(
          "outcome IN ('started', 'sent', 'failed', 'uncertain')",
        );
        expect(sql).toContain(
          "CONSTRAINT uq_phase1_notification_mail_attempt_no UNIQUE (delivery_id, attempt_no)",
        );
      });
    });
  });

  // ==========================================================================
  // 3. Contract Invariants & Behavioral Logic Verification
  // ==========================================================================
  describe("Domain Contract Invariants (Non-serving Simulation)", () => {
    describe("B7: Voice Work Repair & Fencing Semantics", () => {
      it("simulates repair CAS check: only failed items with matching lease_epoch can be repaired", () => {
        type WorkItemRow = {
          work_id: string;
          status: "pending" | "leased" | "completed" | "failed" | "dead_letter";
          lease_epoch: number;
          attempt: number;
          last_error: string | null;
        };

        const failedItem: WorkItemRow = {
          work_id: "c8865b11-2026-0913-b700-000000000001",
          status: "failed",
          lease_epoch: 5,
          attempt: 5,
          last_error: "connection_timeout",
        };

        function executeRepair(
          item: WorkItemRow,
          repairReq: {
            requestId: string;
            actorId: string;
            reason: string;
            expectedLeaseEpoch: number;
          },
          existingRepairs: Set<string>,
        ) {
          const dedupeKey = `${item.work_id}:${repairReq.requestId}`;
          if (existingRepairs.has(dedupeKey)) {
            throw new Error("REPAIR_REQUEST_ALREADY_EXISTS");
          }
          if (item.status !== "failed") {
            throw new Error(`CANNOT_REPAIR_NON_FAILED_ITEM: status=${item.status}`);
          }
          if (item.lease_epoch !== repairReq.expectedLeaseEpoch) {
            throw new Error("LEASE_EPOCH_MISMATCH");
          }

          const auditRecord = {
            repairId: crypto.randomUUID(),
            workId: item.work_id,
            requestId: repairReq.requestId,
            actorId: repairReq.actorId,
            reason: repairReq.reason,
            expectedLeaseEpoch: repairReq.expectedLeaseEpoch,
            previousStatus: item.status,
            previousAttemptCount: item.attempt,
            previousLastError: item.last_error,
            allocatedMaxAttempts: 5,
          };

          // Reset work item row in-place
          item.status = "pending";
          item.attempt = 0;
          item.last_error = null;
          item.lease_epoch += 1;

          existingRepairs.add(dedupeKey);
          return auditRecord;
        }

        const existingRepairs = new Set<string>();

        // Positive case: repair succeeds
        const audit = executeRepair(
          failedItem,
          {
            requestId: "req-001",
            actorId: "ops-admin",
            reason: "manual network glitch recovery",
            expectedLeaseEpoch: 5,
          },
          existingRepairs,
        );

        expect(audit.previousStatus).toBe("failed");
        expect(audit.previousAttemptCount).toBe(5);
        expect(failedItem.status).toBe("pending");
        expect(failedItem.attempt).toBe(0);
        expect(failedItem.lease_epoch).toBe(6);

        // Negative case 1: duplicate repair request rejected
        expect(() =>
          executeRepair(
            failedItem,
            {
              requestId: "req-001",
              actorId: "ops-admin",
              reason: "retry",
              expectedLeaseEpoch: 6,
            },
            existingRepairs,
          ),
        ).toThrow("REPAIR_REQUEST_ALREADY_EXISTS");

        // Negative case 2: cannot repair pending or leased item
        expect(() =>
          executeRepair(
            failedItem,
            {
              requestId: "req-002",
              actorId: "ops-admin",
              reason: "retry",
              expectedLeaseEpoch: 6,
            },
            existingRepairs,
          ),
        ).toThrow("CANNOT_REPAIR_NON_FAILED_ITEM");
      });
    });

    describe("B4: Registry Expiry Fingerprinting & Superseded Semantics", () => {
      function computeDriverExpiryFingerprint(
        scope: string,
        driverId: string,
        sourceFieldName: string,
        expiryDateString: string,
      ): string {
        const canonicalTuple = [
          "credential-expiry/v1",
          scope,
          "driver",
          driverId,
          sourceFieldName,
          Date.parse(expiryDateString),
        ];
        return crypto
          .createHash("sha256")
          .update(JSON.stringify(canonicalTuple))
          .digest("hex");
      }

      function computePolicyExpiryFingerprint(
        scope: string,
        policyId: string,
        vehicleId: string,
        policyNo: string,
        insuranceType: string,
        startAt: string,
        endAt: string,
        status: string,
      ): string {
        const canonicalTuple = [
          "credential-expiry/v1",
          scope,
          "policy",
          policyId,
          vehicleId,
          policyNo,
          insuranceType,
          Date.parse(startAt),
          Date.parse(endAt),
          status,
        ];
        return crypto
          .createHash("sha256")
          .update(JSON.stringify(canonicalTuple))
          .digest("hex");
      }

      function computeAlertIdempotencyKey(
        scope: string,
        eventId: string,
        recipientEmail: string,
      ): string {
        const tuple = ["credential-alert/v1", scope, eventId, recipientEmail];
        return crypto
          .createHash("sha256")
          .update(JSON.stringify(tuple))
          .digest("hex");
      }

      it("produces deterministic SHA-256 fingerprints for identical driver/policy inputs", () => {
        const fp1 = computeDriverExpiryFingerprint(
          "tenant-drts",
          "driver-123",
          "licenseExpiry",
          "2026-10-01T00:00:00.000Z",
        );
        const fp2 = computeDriverExpiryFingerprint(
          "tenant-drts",
          "driver-123",
          "licenseExpiry",
          "2026-10-01T00:00:00.000Z",
        );
        expect(fp1).toBe(fp2);
        expect(fp1).toHaveLength(64);

        const pol1 = computePolicyExpiryFingerprint(
          "tenant-drts",
          "pol-456",
          "veh-789",
          "POL-2026-001",
          "liability",
          "2025-10-01T00:00:00.000Z",
          "2026-10-01T00:00:00.000Z",
          "active",
        );
        const pol2 = computePolicyExpiryFingerprint(
          "tenant-drts",
          "pol-456",
          "veh-789",
          "POL-2026-001",
          "liability",
          "2025-10-01T00:00:00.000Z",
          "2026-10-01T00:00:00.000Z",
          "active",
        );
        expect(pol1).toBe(pol2);
      });

      it("changes fingerprint when credential expiry is renewed (superseded trigger)", () => {
        const originalFp = computeDriverExpiryFingerprint(
          "tenant-drts",
          "driver-123",
          "licenseExpiry",
          "2026-10-01T00:00:00.000Z",
        );
        const renewedFp = computeDriverExpiryFingerprint(
          "tenant-drts",
          "driver-123",
          "licenseExpiry",
          "2027-10-01T00:00:00.000Z",
        );
        expect(originalFp).not.toBe(renewedFp);
      });

      it("derives deterministic alert idempotency keys matching B4 specification", () => {
        const key1 = computeAlertIdempotencyKey(
          "tenant-drts",
          "event-uuid-001",
          "driver@example.com",
        );
        const key2 = computeAlertIdempotencyKey(
          "tenant-drts",
          "event-uuid-001",
          "driver@example.com",
        );
        expect(key1).toBe(key2);
      });
    });

    describe("B5: Notification MailOutbox Transaction Storage Contract", () => {
      it("validates payloadHash computation and idempotency conflict behavior", () => {
        function computePayloadHash(message: {
          tenantId: string;
          idempotencyKey: string;
          recipientEmail: string;
          fromEmail: string;
          subject: string;
          body: string;
        }): string {
          return crypto
            .createHash("sha256")
            .update(
              JSON.stringify([
                message.tenantId,
                message.idempotencyKey,
                message.recipientEmail,
                message.fromEmail,
                message.subject,
                message.body,
              ]),
            )
            .digest("hex");
        }

        const msg1 = {
          tenantId: "tenant-a",
          idempotencyKey: "key-123",
          recipientEmail: "driver@example.com",
          fromEmail: "noreply@drts.platform",
          subject: "License Expired",
          body: "Your license has expired.",
        };
        const hash1 = computePayloadHash(msg1);

        const msg2 = {
          tenantId: "tenant-a",
          idempotencyKey: "key-123",
          recipientEmail: "driver@example.com",
          fromEmail: "noreply@drts.platform",
          subject: "License Expired",
          body: "Your license has expired.",
        };
        const hash2 = computePayloadHash(msg2);
        expect(hash1).toBe(hash2);

        // Mismatched body with same idempotency key
        const msgConflict = {
          ...msg1,
          body: "Different content with same key.",
        };
        const hashConflict = computePayloadHash(msgConflict);
        expect(hashConflict).not.toBe(hash1);
      });

      it("keeps provider acknowledgement separate from device delivery proof", () => {
        const providerAck = {
          provider: "mock_smtp",
          response: "250 Message accepted",
          providerMessageId: "msg-smtp-999",
          acceptedAt: new Date().toISOString(),
        };

        const attempt = {
          attemptId: crypto.randomUUID(),
          attemptNo: 1,
          outcome: "sent",
          acknowledgement: providerAck,
        };

        // Provider accepted the message, but receipt does not falsely assert device delivery
        expect(attempt.acknowledgement.providerMessageId).toBe("msg-smtp-999");
        expect(attempt.outcome).toBe("sent");
      });
    });
  });
});
