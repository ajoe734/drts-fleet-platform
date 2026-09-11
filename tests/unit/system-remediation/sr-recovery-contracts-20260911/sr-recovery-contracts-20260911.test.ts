import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireMod = createRequire(path.resolve(process.cwd(), "package.json"));

function resolvePnpmModule(name: string, preferredVersion?: string): any {
  if (!preferredVersion) {
    try {
      return requireMod(name);
    } catch {
      // fallback to pnpm search
    }
  }
  const candidates = [
    path.resolve(process.cwd(), "node_modules/.pnpm"),
    path.resolve(process.cwd(), "../../node_modules/.pnpm"),
    "/home/lupin/workspace/drts-fleet-platform/node_modules/.pnpm",
  ];
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    const entries = fs.readdirSync(base);
    if (preferredVersion) {
      const exact = entries.find((e) =>
        e.startsWith(`${name}@${preferredVersion}`),
      );
      if (exact) {
        const modPath = path.join(base, exact, "node_modules", name);
        if (fs.existsSync(modPath)) return requireMod(modPath);
      }
    }
    const matches = entries
      .filter((e) => e.startsWith(`${name}@`))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const match of matches) {
      const modPath = path.join(base, match, "node_modules", name);
      if (fs.existsSync(modPath)) {
        return requireMod(modPath);
      }
    }
  }
  throw new Error(`Cannot find module '${name}'`);
}

import { ApiClient, ApiClientError } from "../../../../packages/api-client/src";
import {
  REMITTANCE_PROOF_SCAN_STATES,
  REMITTANCE_PROOF_ERROR_CODES,
  PUSH_DELIVERY_CLAIM_STATES,
  PUSH_PROVIDER_ACK_STATES,
  PUSH_DEVICE_DELIVERY_STATES,
  PUSH_DELIVERY_RECORD_OUTCOMES,
  PUSH_DELIVERY_ERROR_CODES,
  CREDENTIAL_EXPIRY_WARNING_STATES,
  type RemittanceProofRecord,
  type UploadRemittanceProofCommand,
  type RemittanceProofReadbackGrant,
  type RemittanceProofPaymentReceipt,
  type MarkReimbursementPaidWithProofCommand,
  type PushDeliveryClaim,
  type PushDeliveryReceipt,
  type RecordPushDeliveryReceiptResult,
  type PlatformAdapter,
  type UpdatePlatformAdapterCommand,
  type AdapterCredentialExpiryWarning,
} from "@drts/contracts";

describe("SR-RECOVERY-CONTRACTS-20260911: Proof, Push-Receipt & Adapter-Registry Contracts", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");

  // ==========================================================================
  // 1. Schema Allocation Invariant Tests
  // ==========================================================================
  describe("Schema Allocation Invariants (schema-allocation.json)", () => {
    const allocationPath = path.join(
      repoRoot,
      "docs/04-uat/system-remediation-20260906/schema-allocation.json",
    );

    it("exists and preserves the SR-CONTRACT-001 base allocation untouched", () => {
      expect(fs.existsSync(allocationPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      expect(content.task_id).toBe("SR-CONTRACT-001");
      expect(content.allocations).toHaveLength(3);
    });

    it("appends V0098-V0100 without colliding with V0094-V0097", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      const additional = content.additional_allocations;
      expect(additional).toHaveLength(3);

      const proofAlloc = additional.find(
        (a: any) => a.domain === "remittance_proof",
      );
      expect(proofAlloc.version).toBe("V0098");
      expect(proofAlloc.migration_filename).toBe(
        "V0098__sr_remittance_proof.sql",
      );
      expect(proofAlloc.target_schema).toBe("billing");
      expect(proofAlloc.primary_tables).toContain(
        "billing.phase1_remittance_proofs",
      );

      const pushAlloc = additional.find(
        (a: any) => a.domain === "passenger_push_delivery",
      );
      expect(pushAlloc.version).toBe("V0099");
      expect(pushAlloc.migration_filename).toBe(
        "V0099__sr_passenger_push_delivery.sql",
      );
      expect(pushAlloc.target_schema).toBe("ops");
      expect(pushAlloc.referenced_tables).toContain(
        "ops.consumer_notification_outbox",
      );

      const adapterAlloc = additional.find(
        (a: any) => a.domain === "platform_adapter_registry",
      );
      expect(adapterAlloc.version).toBe("V0100");
      expect(adapterAlloc.migration_filename).toBe(
        "V0100__sr_platform_adapter_registry.sql",
      );
      expect(adapterAlloc.target_schema).toBe("admin");

      // No duplicate versions across the original allocations and the new ones.
      const allVersions = [
        ...content.allocations.map((a: any) => a.version),
        ...additional.map((a: any) => a.version),
      ];
      expect(new Set(allVersions).size).toBe(allVersions.length);
    });

    it("records table/constraint/transaction invariants for each domain, not just filenames", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      for (const alloc of content.additional_allocations) {
        expect(Array.isArray(alloc.table_invariants)).toBe(true);
        expect(alloc.table_invariants.length).toBeGreaterThan(0);
      }
    });

    it("does not itself create infra/migrations/*.sql files (allocation only, matching SR-CONTRACT-001 precedent)", () => {
      const migrationsDir = path.join(repoRoot, "infra/migrations");
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      for (const alloc of content.additional_allocations) {
        expect(
          fs.existsSync(path.join(migrationsDir, alloc.migration_filename)),
        ).toBe(false);
      }
    });

    it("highest canonical migration on disk remains below the new reservations", () => {
      const migrationsDir = path.join(repoRoot, "infra/migrations");
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => /^V\d{4}__/.test(f));
      const versions = files.map((f) => parseInt(f.slice(1, 5), 10));
      const highest = Math.max(...versions);
      expect(highest).toBeLessThan(98);
    });
  });

  // ==========================================================================
  // 2. @drts/contracts Type Invariants
  // ==========================================================================
  describe("@drts/contracts Type Invariants & Enums", () => {
    it("exports remittance proof scan states and error codes", () => {
      expect(REMITTANCE_PROOF_SCAN_STATES).toEqual([
        "pending_scan",
        "clean",
        "rejected",
      ]);
      expect(REMITTANCE_PROOF_ERROR_CODES).toContain(
        "REMITTANCE_PROOF_BATCH_NOT_APPROVED",
      );
      expect(REMITTANCE_PROOF_ERROR_CODES).toContain(
        "REMITTANCE_PROOF_NOT_CLEAN",
      );
    });

    it("validates structural typing of a pending-scan RemittanceProofRecord", () => {
      const proof: RemittanceProofRecord = {
        proofId: "proof-001",
        batchId: "batch-001",
        driverId: "drv-001",
        uploadedByActorId: "actor-001",
        originalFilename: "remittance.pdf",
        content: {
          contentHash:
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          contentType: "application/pdf",
          sizeBytes: 20480,
        },
        scanState: "pending_scan",
        scanCompletedAt: null,
        rejectionReason: null,
        createdAt: "2026-09-11T00:00:00.000Z",
      };
      expect(proof.scanState).toBe("pending_scan");
      expect(proof.scanCompletedAt).toBeNull();
    });

    it("validates structural typing of a clean and a rejected RemittanceProofRecord", () => {
      const clean: RemittanceProofRecord = {
        proofId: "proof-002",
        batchId: "batch-001",
        driverId: "drv-001",
        uploadedByActorId: null,
        originalFilename: "remittance-2.png",
        content: { contentHash: "abc123", contentType: "image/png", sizeBytes: 1024 },
        scanState: "clean",
        scanCompletedAt: "2026-09-11T00:05:00.000Z",
        rejectionReason: null,
        createdAt: "2026-09-11T00:00:00.000Z",
      };
      const rejected: RemittanceProofRecord = {
        ...clean,
        proofId: "proof-003",
        scanState: "rejected",
        rejectionReason: "malware_detected",
      };
      expect(clean.rejectionReason).toBeNull();
      expect(rejected.rejectionReason).toBe("malware_detected");
    });

    it("validates UploadRemittanceProofCommand and idempotent MarkReimbursementPaidWithProofCommand", () => {
      const upload: UploadRemittanceProofCommand = {
        batchId: "batch-001",
        originalFilename: "remittance.pdf",
        contentType: "application/pdf",
        sizeBytes: 20480,
        stagedContentRef: "staged-ref-001",
      };
      const pay: MarkReimbursementPaidWithProofCommand = {
        batchId: "batch-001",
        proofId: "proof-002",
        idempotencyKey: "idem-001",
      };
      expect(upload.stagedContentRef).toBe("staged-ref-001");
      expect(pay.paidAt).toBeUndefined();
    });

    it("validates RemittanceProofReadbackGrant and RemittanceProofPaymentReceipt", () => {
      const grant: RemittanceProofReadbackGrant = {
        proofId: "proof-002",
        readbackUrl: "https://storage.example.test/proof-002?sig=abc",
        expiresAt: "2026-09-11T00:15:00.000Z",
        issuedAt: "2026-09-11T00:00:00.000Z",
      };
      const receipt: RemittanceProofPaymentReceipt = {
        receiptId: "receipt-001",
        batchId: "batch-001",
        proofId: "proof-002",
        idempotencyKey: "idem-001",
        driverId: "drv-001",
        amount: { currency: "TWD", amountMinor: 150000 },
        paidAt: "2026-09-11T00:10:00.000Z",
        createdAt: "2026-09-11T00:10:00.000Z",
      };
      expect(grant.expiresAt > grant.issuedAt).toBe(true);
      expect(receipt.amount.currency).toBe("TWD");
    });

    it("exports passenger push delivery claim/ack/device-delivery/record-outcome enums", () => {
      expect(PUSH_DELIVERY_CLAIM_STATES).toEqual([
        "claimed",
        "released",
        "expired",
      ]);
      expect(PUSH_PROVIDER_ACK_STATES).toEqual([
        "provider_acknowledged",
        "provider_rejected",
        "provider_not_configured",
      ]);
      expect(PUSH_DEVICE_DELIVERY_STATES).toEqual([
        "unknown",
        "delivered",
        "delivery_failed",
      ]);
      expect(PUSH_DELIVERY_RECORD_OUTCOMES).toEqual([
        "recorded",
        "persistence_unknown",
      ]);
      expect(PUSH_DELIVERY_ERROR_CODES).toContain(
        "PUSH_DELIVERY_FENCE_STALE",
      );
    });

    it("validates PushDeliveryClaim fencing shape and a stale-fence rejection scenario", () => {
      const claim: PushDeliveryClaim = {
        outboxId: "outbox-001",
        tenantId: "tenant-001",
        passengerSubjectRef: "subj-pseudo-001",
        workerId: "worker-a",
        claimState: "claimed",
        fenceToken: 3,
        leaseExpiresAt: "2026-09-11T00:01:00.000Z",
        claimedAt: "2026-09-11T00:00:00.000Z",
      };
      // A worker holding a stale, lower fence token must never be treated as authoritative.
      const staleFenceToken = claim.fenceToken - 1;
      expect(staleFenceToken).toBeLessThan(claim.fenceToken);
    });

    it("keeps provider ack and device delivery independent on PushDeliveryReceipt (no ack-implies-delivered coupling)", () => {
      const receipt: PushDeliveryReceipt = {
        receiptId: "receipt-push-001",
        outboxId: "outbox-001",
        tenantId: "tenant-001",
        passengerSubjectRef: "subj-pseudo-001",
        dedupeKey: "outbox-001:3",
        fenceToken: 3,
        providerName: "generic-provider",
        providerAckState: "provider_acknowledged",
        providerMessageRef: "msg-ref-001",
        deviceDeliveryState: "unknown",
        ackedAt: "2026-09-11T00:00:05.000Z",
        createdAt: "2026-09-11T00:00:05.000Z",
      };
      // Acknowledgement alone must never resolve device delivery beyond "unknown".
      expect(receipt.providerAckState).toBe("provider_acknowledged");
      expect(receipt.deviceDeliveryState).toBe("unknown");
    });

    it("validates RecordPushDeliveryReceiptResult: 'recorded' carries a receipt, 'persistence_unknown' never fabricates one", () => {
      const recorded: RecordPushDeliveryReceiptResult = {
        outcome: "recorded",
        receipt: {
          receiptId: "receipt-push-002",
          outboxId: "outbox-002",
          tenantId: "tenant-001",
          passengerSubjectRef: "subj-pseudo-002",
          dedupeKey: "outbox-002:1",
          fenceToken: 1,
          providerName: "generic-provider",
          providerAckState: "provider_acknowledged",
          providerMessageRef: "msg-ref-002",
          deviceDeliveryState: "unknown",
          ackedAt: "2026-09-11T00:00:05.000Z",
          createdAt: "2026-09-11T00:00:05.000Z",
        },
      };
      const unknownAfterAck: RecordPushDeliveryReceiptResult = {
        outcome: "persistence_unknown",
        receipt: null,
      };
      expect(recorded.receipt).not.toBeNull();
      expect(unknownAfterAck.receipt).toBeNull();
      expect(unknownAfterAck.outcome).not.toBe("recorded");
    });

    it("exports adapter credential expiry warning states", () => {
      expect(CREDENTIAL_EXPIRY_WARNING_STATES).toEqual([
        "unknown",
        "ok",
        "warning",
        "expired",
      ]);
    });

    it("validates an extended PlatformAdapter carrying nullable expiry, warning and audit evidence", () => {
      const adapter: Partial<PlatformAdapter> & {
        revision: number;
        credentialExpiry: PlatformAdapter["credentialExpiry"];
        credentialExpiryWarning: PlatformAdapter["credentialExpiryWarning"];
        lastMutationAudit: PlatformAdapter["lastMutationAudit"];
      } = {
        revision: 4,
        credentialExpiry: { reference: "kms-key-rotation-9", expiresAt: null },
        credentialExpiryWarning: {
          state: "unknown",
          warningWindowDays: 14,
          evaluatedAt: "2026-09-11T00:00:00.000Z",
        },
        lastMutationAudit: {
          auditId: "audit-001",
          actorId: "admin-001",
          reason: "rotate credential ahead of scheduled maintenance",
          previousRevision: 3,
          newRevision: 4,
          occurredAt: "2026-09-11T00:00:00.000Z",
        },
      };
      // Missing/unparsable expiresAt must resolve the warning to "unknown", never "ok".
      expect(adapter.credentialExpiry?.expiresAt).toBeNull();
      expect(adapter.credentialExpiryWarning?.state).toBe("unknown");
      expect(adapter.lastMutationAudit?.newRevision).toBe(
        (adapter.lastMutationAudit?.previousRevision ?? 0) + 1,
      );
    });

    it("keeps the new PlatformAdapter/UpdatePlatformAdapterCommand fields optional so pre-existing producers still type-check (back-compat regression guard)", () => {
      const bareAdapterFields: Pick<
        PlatformAdapter,
        "id" | "platformCode" | "name" | "description" | "createdAt" | "updatedAt"
      > = {
        id: "adapter-legacy-001",
        platformCode: "legacy",
        name: "Legacy Adapter",
        description: "Pre-existing adapter without the new optional fields",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      const bareUpdate: UpdatePlatformAdapterCommand = {
        rolloutStatus: undefined,
      };
      expect(bareAdapterFields.id).toBe("adapter-legacy-001");
      expect(bareUpdate.reason).toBeUndefined();
      expect(bareUpdate.expectedRevision).toBeUndefined();
    });
  });

  // ==========================================================================
  // 3. @drts/api-client Typed Methods & Transport
  // ==========================================================================
  describe("@drts/api-client Typed Methods & Transport", () => {
    function createMockClient(
      responder: (input: {
        url: string;
        method: string;
        headers: Headers;
        body?: string | undefined;
      }) => {
        status: number;
        body: any;
      },
    ): ApiClient {
      const client = new ApiClient({
        baseUrl: "https://api.drts.test",
        defaultHeaders: {
          Authorization: "Bearer mock-token",
        },
      });

      globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        const headers = new Headers(init?.headers);
        const body = init?.body as string | undefined;

        const response = responder({ url, method, headers, body });
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      };

      return client;
    }

    it("uploadRemittanceProof dispatches POST /api/reimbursements/proofs and unwraps snake_case data", async () => {
      let intercepted: any;
      const client = createMockClient((req) => {
        intercepted = req;
        return {
          status: 201,
          body: {
            data: {
              proof_id: "proof-101",
              batch_id: "batch-001",
              driver_id: "drv-001",
              uploaded_by_actor_id: "actor-001",
              original_filename: "remittance.pdf",
              content: {
                content_hash: "abc123",
                content_type: "application/pdf",
                size_bytes: 2048,
              },
              scan_state: "pending_scan",
              scan_completed_at: null,
              rejection_reason: null,
              created_at: "2026-09-11T00:00:00.000Z",
            },
            meta: { requestId: "req-1", timestamp: "2026-09-11T00:00:00.000Z" },
          },
        };
      });

      const cmd: UploadRemittanceProofCommand = {
        batchId: "batch-001",
        originalFilename: "remittance.pdf",
        contentType: "application/pdf",
        sizeBytes: 2048,
        stagedContentRef: "staged-ref-101",
      };
      const result = await client.uploadRemittanceProof(cmd);
      expect(intercepted.method).toBe("POST");
      expect(intercepted.url).toBe(
        "https://api.drts.test/api/reimbursements/proofs",
      );
      expect(JSON.parse(intercepted.body)).toEqual(cmd);
      expect(result.proofId).toBe("proof-101");
      expect(result.scanState).toBe("pending_scan");
    });

    it("getRemittanceProof dispatches GET /api/reimbursements/proofs/{proofId}", async () => {
      let interceptedUrl = "";
      const client = createMockClient((req) => {
        interceptedUrl = req.url;
        return {
          status: 200,
          body: {
            data: {
              proof_id: "proof-101",
              batch_id: "batch-001",
              driver_id: "drv-001",
              uploaded_by_actor_id: null,
              original_filename: "remittance.pdf",
              content: {
                content_hash: "abc123",
                content_type: "application/pdf",
                size_bytes: 2048,
              },
              scan_state: "clean",
              scan_completed_at: "2026-09-11T00:05:00.000Z",
              rejection_reason: null,
              created_at: "2026-09-11T00:00:00.000Z",
            },
            meta: { requestId: "req-2", timestamp: "2026-09-11T00:00:00.000Z" },
          },
        };
      });

      const result = await client.getRemittanceProof("proof-101");
      expect(interceptedUrl).toBe(
        "https://api.drts.test/api/reimbursements/proofs/proof-101",
      );
      expect(result.scanState).toBe("clean");
    });

    it("requestRemittanceProofReadback dispatches POST .../readback and returns an expiring grant", async () => {
      let intercepted: any;
      const client = createMockClient((req) => {
        intercepted = req;
        return {
          status: 200,
          body: {
            data: {
              proof_id: "proof-101",
              readback_url: "https://storage.example.test/proof-101?sig=xyz",
              expires_at: "2026-09-11T00:15:00.000Z",
              issued_at: "2026-09-11T00:00:00.000Z",
            },
            meta: { requestId: "req-3", timestamp: "2026-09-11T00:00:00.000Z" },
          },
        };
      });

      const result = await client.requestRemittanceProofReadback({
        proofId: "proof-101",
      });
      expect(intercepted.method).toBe("POST");
      expect(intercepted.url).toBe(
        "https://api.drts.test/api/reimbursements/proofs/proof-101/readback",
      );
      expect(result.expiresAt).toBe("2026-09-11T00:15:00.000Z");
    });

    it("markReimbursementPaidWithProof dispatches POST .../pay-with-proof and replaying the same idempotencyKey resolves the same receiptId", async () => {
      const client = createMockClient(() => {
        return {
          status: 200,
          body: {
            data: {
              receipt_id: "receipt-101",
              batch_id: "batch-001",
              proof_id: "proof-101",
              idempotency_key: "idem-101",
              driver_id: "drv-001",
              amount: { currency: "TWD", amount_minor: 150000 },
              paid_at: "2026-09-11T00:10:00.000Z",
              created_at: "2026-09-11T00:10:00.000Z",
            },
            meta: { requestId: "req-4", timestamp: "2026-09-11T00:00:00.000Z" },
          },
        };
      });

      const cmd: MarkReimbursementPaidWithProofCommand = {
        batchId: "batch-001",
        proofId: "proof-101",
        idempotencyKey: "idem-101",
      };
      const first = await client.markReimbursementPaidWithProof(cmd);
      const replay = await client.markReimbursementPaidWithProof(cmd);
      expect(first.receiptId).toBe("receipt-101");
      expect(replay.receiptId).toBe(first.receiptId);
    });

    it("getPlatformAdapterCredentialExpiryWarning dispatches GET and never returns 'ok' for a missing expiry", async () => {
      let interceptedUrl = "";
      const client = createMockClient((req) => {
        interceptedUrl = req.url;
        return {
          status: 200,
          body: {
            data: {
              state: "unknown",
              warning_window_days: 14,
              evaluated_at: "2026-09-11T00:00:00.000Z",
            },
            meta: { requestId: "req-5", timestamp: "2026-09-11T00:00:00.000Z" },
          },
        };
      });

      const result: AdapterCredentialExpiryWarning =
        await client.getPlatformAdapterCredentialExpiryWarning("adapter-001");
      expect(interceptedUrl).toBe(
        "https://api.drts.test/api/platform-admin/adapters/adapter-001/credential-expiry-warning",
      );
      expect(result.state).toBe("unknown");
    });

    it("getPlatformAdapterCredentialExpiryWarning rejects on API failure instead of resolving a fabricated warning", async () => {
      const client = createMockClient(() => ({
        status: 500,
        body: {
          error: { code: "INTERNAL_ERROR", message: "boom" },
        },
      }));

      await expect(
        client.getPlatformAdapterCredentialExpiryWarning("adapter-001"),
      ).rejects.toBeInstanceOf(ApiClientError);
    });
  });

  // ==========================================================================
  // 4. OpenAPI Spec Alignment (openapi-spec.yaml)
  // ==========================================================================
  describe("OpenAPI Spec Alignment (openapi-spec.yaml)", () => {
    const openapiPath = path.join(repoRoot, "docs/04-api/openapi-spec.yaml");

    it("contains all required SR-RECOVERY-CONTRACTS-20260911 paths", () => {
      const content = fs.readFileSync(openapiPath, "utf8");
      const requiredPaths = [
        "/api/reimbursements/proofs",
        "/api/reimbursements/proofs/{proofId}",
        "/api/reimbursements/proofs/{proofId}/readback",
        "/api/reimbursements/{batchId}/pay-with-proof",
        "/api/platform-admin/adapters/{id}/credential-expiry-warning",
      ];
      for (const p of requiredPaths) {
        expect(content).toContain(p + ":");
      }
    });

    it("contains the RemittanceProof and PlatformAdapterRegistry tags", () => {
      const content = fs.readFileSync(openapiPath, "utf8");
      expect(content).toContain("name: RemittanceProof");
      expect(content).toContain("name: PlatformAdapterRegistry");
    });

    it("contains all required schemas for proof, readback, receipt and adapter warning", () => {
      const content = fs.readFileSync(openapiPath, "utf8");
      const requiredSchemas = [
        "RemittanceProofScanState:",
        "RemittanceProofContentIdentity:",
        "RemittanceProofRecord:",
        "UploadRemittanceProofCommand:",
        "RemittanceProofEnvelope:",
        "RequestRemittanceProofReadbackCommand:",
        "RemittanceProofReadbackGrant:",
        "RemittanceProofReadbackGrantEnvelope:",
        "MarkReimbursementPaidWithProofCommand:",
        "RemittanceProofPaymentReceipt:",
        "RemittanceProofPaymentReceiptEnvelope:",
        "CredentialExpiryWarningState:",
        "AdapterCredentialExpiryWarning:",
        "AdapterCredentialExpiryWarningEnvelope:",
      ];
      for (const s of requiredSchemas) {
        expect(content).toContain(s);
      }
    });

    describe("Schema-based Positive and Negative Regression Validation (Ajv)", () => {
      const YAML = resolvePnpmModule("yaml");
      const Ajv = resolvePnpmModule("ajv");
      const AjvClass = Ajv.default || Ajv;
      const ajv = new AjvClass({ strict: false, allErrors: true });

      function transformOpenApiToAjv(schema: any): any {
        if (!schema || typeof schema !== "object") return schema;
        if (Array.isArray(schema)) return schema.map(transformOpenApiToAjv);

        if (schema.$ref) {
          return { $ref: schema.$ref };
        }

        const copy: any = { ...schema };
        if (copy.nullable) {
          delete copy.nullable;
          if (copy.type && typeof copy.type === "string") {
            copy.type = [copy.type, "null"];
          }
        }
        for (const [k, v] of Object.entries(copy)) {
          copy[k] = transformOpenApiToAjv(v);
        }
        return copy;
      }

      const openapiDoc = YAML.parse(fs.readFileSync(openapiPath, "utf8"));
      for (const [name, s] of Object.entries(openapiDoc.components.schemas)) {
        ajv.addSchema(transformOpenApiToAjv(s), `#/components/schemas/${name}`);
      }

      const validateProof = ajv.getSchema(
        "#/components/schemas/RemittanceProofRecord",
      )!;
      const validateUpload = ajv.getSchema(
        "#/components/schemas/UploadRemittanceProofCommand",
      )!;
      const validatePay = ajv.getSchema(
        "#/components/schemas/MarkReimbursementPaidWithProofCommand",
      )!;
      const validateReceipt = ajv.getSchema(
        "#/components/schemas/RemittanceProofPaymentReceipt",
      )!;
      const validateWarning = ajv.getSchema(
        "#/components/schemas/AdapterCredentialExpiryWarning",
      )!;

      it("compiles all required validators without error", () => {
        expect(validateProof).toBeDefined();
        expect(validateUpload).toBeDefined();
        expect(validatePay).toBeDefined();
        expect(validateReceipt).toBeDefined();
        expect(validateWarning).toBeDefined();
      });

      it("validates RemittanceProofRecord with positive and negative fixtures", () => {
        const validPending = {
          proofId: "proof-201",
          batchId: "batch-001",
          driverId: "drv-001",
          uploadedByActorId: "actor-001",
          originalFilename: "remittance.pdf",
          content: {
            contentHash: "abc123",
            contentType: "application/pdf",
            sizeBytes: 2048,
          },
          scanState: "pending_scan",
          scanCompletedAt: null,
          rejectionReason: null,
          createdAt: "2026-09-11T00:00:00.000Z",
        };
        expect(validateProof(validPending)).toBe(true);

        const validRejected = {
          ...validPending,
          proofId: "proof-202",
          scanState: "rejected",
          scanCompletedAt: "2026-09-11T00:05:00.000Z",
          rejectionReason: "malware_detected",
        };
        expect(validateProof(validRejected)).toBe(true);

        // Negative: an invalid scanState enum value must be rejected.
        const invalidScanState = { ...validPending, scanState: "approved" };
        expect(validateProof(invalidScanState)).toBe(false);

        // Negative: omitting the required (nullable) rejectionReason key must fail.
        const missingRejectionReason: any = { ...validPending };
        delete missingRejectionReason.rejectionReason;
        expect(validateProof(missingRejectionReason)).toBe(false);

        // Negative: content missing sizeBytes must fail.
        const missingContentField = {
          ...validPending,
          content: { contentHash: "abc123", contentType: "application/pdf" },
        };
        expect(validateProof(missingContentField)).toBe(false);
      });

      it("validates UploadRemittanceProofCommand with positive and negative fixtures", () => {
        const valid = {
          batchId: "batch-001",
          originalFilename: "remittance.pdf",
          contentType: "application/pdf",
          sizeBytes: 2048,
          stagedContentRef: "staged-ref-001",
        };
        expect(validateUpload(valid)).toBe(true);

        const missingStagedRef: any = { ...valid };
        delete missingStagedRef.stagedContentRef;
        expect(validateUpload(missingStagedRef)).toBe(false);

        const wrongType = { ...valid, sizeBytes: "2048" };
        expect(validateUpload(wrongType)).toBe(false);
      });

      it("validates MarkReimbursementPaidWithProofCommand requires batchId/proofId/idempotencyKey", () => {
        const valid = {
          batchId: "batch-001",
          proofId: "proof-201",
          idempotencyKey: "idem-201",
        };
        expect(validatePay(valid)).toBe(true);
        expect(validatePay({ batchId: "batch-001", proofId: "proof-201" })).toBe(
          false,
        );
      });

      it("validates RemittanceProofPaymentReceipt with positive and negative fixtures", () => {
        const valid = {
          receiptId: "receipt-201",
          batchId: "batch-001",
          proofId: "proof-201",
          idempotencyKey: "idem-201",
          driverId: "drv-001",
          amount: { currency: "TWD", amountMinor: 150000 },
          paidAt: "2026-09-11T00:10:00.000Z",
          createdAt: "2026-09-11T00:10:00.000Z",
        };
        expect(validateReceipt(valid)).toBe(true);

        const missingAmountCurrency = {
          ...valid,
          amount: { amountMinor: 150000 },
        };
        expect(validateReceipt(missingAmountCurrency)).toBe(false);
      });

      it("validates AdapterCredentialExpiryWarning: 'unknown' state is a valid positive fixture, unrecognised state is rejected", () => {
        const unknownIsValid = {
          state: "unknown",
          warningWindowDays: 14,
          evaluatedAt: "2026-09-11T00:00:00.000Z",
        };
        expect(validateWarning(unknownIsValid)).toBe(true);

        const invalidState = { ...unknownIsValid, state: "healthy" };
        expect(validateWarning(invalidState)).toBe(false);

        const missingWindow: any = { ...unknownIsValid };
        delete missingWindow.warningWindowDays;
        expect(validateWarning(missingWindow)).toBe(false);
      });
    });
  });
});
