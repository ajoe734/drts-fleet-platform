import { createHash, randomUUID } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";

import type {
  MoneyAmount,
  RemittanceProofPaymentReceipt,
  RemittanceProofReadbackGrant,
  RemittanceProofRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  createControlledDownloadMetadata,
  verifyControlledDownloadSignature,
} from "../reporting-filing/download-signing.util";
import {
  BillingSettlementRepository,
  type MarkRemittanceProofPaidResult,
} from "./billing-settlement.repository";
import {
  REMITTANCE_PROOF_SCANNER,
  type RemittanceProofScanOutcome,
  type RemittanceProofScannerPort,
} from "./remittance-proof-scanner.port";
import { UnprovisionedRemittanceProofScannerAdapter } from "./remittance-proof-scanner.adapter";
import {
  REMITTANCE_PROOF_STORAGE,
  type RemittanceProofStorageProvider,
} from "./remittance-proof-storage.port";
import { createRemittanceProofStorage } from "./remittance-proof-runtime.config";

/** Remittance-proof readback links are short-lived on purpose (Q-SR-PROOF-001). */
const REMITTANCE_PROOF_READBACK_TTL_MINUTES = 15;

export interface UploadRemittanceProofInput {
  batchId: string;
  driverId: string;
  originalFilename: string;
  stagedContentRef: string;
  uploadedByActorId: string | null;
}

export interface MarkRemittanceProofPaidInput {
  batchId: string;
  proofId: string;
  idempotencyKey: string;
  driverId: string;
  amount: MoneyAmount;
  paidAt: string;
}

/**
 * Owns the remittance-proof lifecycle (upload → pending_scan → clean /
 * rejected → authorized readback → idempotent mark-paid receipt) that
 * SR-RECOVERY-CONTRACTS-20260911's `packages/contracts/src/remittance-proof.ts`
 * defines. `BillingSettlementService` still owns the reimbursement batch
 * itself (existence, approval) and calls into this service only for the
 * proof/receipt half of the gate -- see `billing-settlement.service.ts`'s
 * `uploadRemittanceProof` / `markReimbursementPaidWithProof`.
 */
@Injectable()
export class RemittanceProofService {
  private readonly proofs: RemittanceProofRecord[] = [];

  private readonly paymentReceipts: RemittanceProofPaymentReceipt[] = [];

  constructor(
    @Optional()
    private readonly repository?: BillingSettlementRepository,
    @Optional()
    @Inject(REMITTANCE_PROOF_STORAGE)
    private readonly storage: RemittanceProofStorageProvider = createRemittanceProofStorage(),
    @Optional()
    @Inject(REMITTANCE_PROOF_SCANNER)
    private readonly scanner: RemittanceProofScannerPort = new UnprovisionedRemittanceProofScannerAdapter(),
  ) {}

  private useDurablePersistence(): boolean {
    return Boolean(this.repository?.isEnabled());
  }

  private assertPersistenceAvailable() {
    if (process.env.NODE_ENV !== "test" && !this.useDurablePersistence()) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "REMITTANCE_PROOF_PERSISTENCE_UNAVAILABLE",
        "Durable proof metadata persistence is required.",
      );
    }
    if (this.storage.availability().state !== "available") {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "REMITTANCE_PROOF_STORAGE_UNAVAILABLE",
        "Durable proof storage is not configured.",
      );
    }
  }

  async stageContent(bytes: Buffer, contentType: string) {
    this.assertPersistenceAvailable();
    return this.storage.stage({ bytes, contentType });
  }

  /**
   * `driverId` comes from the caller's already-resolved
   * `ReimbursementBatchRecord`, never from the command -- the contract's
   * "denormalised at upload time from the batch" invariant
   * (`packages/contracts/src/remittance-proof.ts`).
   */
  async uploadProof(
    input: UploadRemittanceProofInput,
  ): Promise<RemittanceProofRecord> {
    this.assertPersistenceAvailable();
    let content;
    try {
      content = await this.storage.commit({
        stagedContentRef: input.stagedContentRef,
      });
    } catch (cause) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REMITTANCE_PROOF_STAGED_CONTENT_INVALID",
        cause instanceof Error ? cause.message : String(cause),
        { batchId: input.batchId },
      );
    }

    const createdAt = new Date().toISOString();
    if (this.useDurablePersistence()) {
      // proof_id is not supplied here: V0098 defines it as
      // `uuid PRIMARY KEY DEFAULT gen_random_uuid()`, "server-generated
      // only; no client-supplied identity column". Postgres generates it
      // and `insertRemittanceProof` returns it via `RETURNING *`.
      return this.repository!.insertRemittanceProof({
        batchId: input.batchId,
        driverId: input.driverId,
        uploadedByActorId: input.uploadedByActorId,
        originalFilename: input.originalFilename,
        contentHash: content.contentHash,
        contentType: content.contentType,
        sizeBytes: content.sizeBytes,
        createdAt,
      });
    }

    // In-memory fallback has no DB identity column to respect, so it keeps
    // its own prefixed, app-generated id.
    const proofId = `remit-proof-${randomUUID()}`;
    const record: RemittanceProofRecord = {
      proofId,
      batchId: input.batchId,
      driverId: input.driverId,
      uploadedByActorId: input.uploadedByActorId,
      originalFilename: input.originalFilename,
      content,
      scanState: "pending_scan",
      scanCompletedAt: null,
      rejectionReason: null,
      createdAt,
    };
    this.proofs.push(record);
    return this.cloneProof(record);
  }

  async getProof(proofId: string): Promise<RemittanceProofRecord> {
    const found = this.useDurablePersistence()
      ? await this.repository!.findRemittanceProofById(proofId)
      : (this.proofs.find((proof) => proof.proofId === proofId) ?? null);
    if (!found) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "REMITTANCE_PROOF_NOT_FOUND",
        `Remittance proof "${proofId}" was not found.`,
        { proofId },
      );
    }
    return this.cloneProof(found);
  }

  async requestReadback(
    proofId: string,
  ): Promise<RemittanceProofReadbackGrant> {
    this.assertPersistenceAvailable();
    const proof = await this.getProof(proofId);
    const metadata = createControlledDownloadMetadata({
      kind: "remittance-proof",
      subjectId: proof.proofId,
      manifestHash: proof.content.contentHash,
      // Dedicated byte-serving controller; don't route through document kinds.
      host: "/api/reimbursements/proof-downloads",
      ttlMinutes: REMITTANCE_PROOF_READBACK_TTL_MINUTES,
      signatureVersion: 1,
    });
    return {
      proofId: proof.proofId,
      readbackUrl: metadata.downloadUrl,
      expiresAt: metadata.expiresAt,
      issuedAt: metadata.signedAt,
    };
  }

  /** Checks the bearer grant before loading any proof record or content. */
  verifyReadbackGrant(claims: {
    proofId: string;
    contentHash: string;
    signedAt: string;
    expiresAt: string;
    keyId: string;
    signature: string;
    signatureVersion?: number;
  }): { ok: true } | { ok: false; reason: string } {
    if (
      (claims.signatureVersion ?? 1) !== 1 ||
      !/^[a-f0-9]{64}$/.test(claims.signature) ||
      !/^[a-f0-9]{64}$/.test(claims.contentHash)
    ) {
      return { ok: false, reason: "malformed" };
    }
    const verification = verifyControlledDownloadSignature({
      kind: "remittance-proof",
      subjectId: claims.proofId,
      manifestHash: claims.contentHash,
      signedAt: claims.signedAt,
      expiresAt: claims.expiresAt,
      keyId: claims.keyId,
      signatureVersion: claims.signatureVersion ?? 1,
      signature: claims.signature,
    });
    if (!verification.ok) {
      return { ok: false, reason: verification.reason };
    }
    const signed = Date.parse(claims.signedAt);
    const expires = Date.parse(claims.expiresAt);
    if (
      !Number.isFinite(signed) ||
      !Number.isFinite(expires) ||
      signed > Date.now() ||
      expires <= signed ||
      expires - signed > REMITTANCE_PROOF_READBACK_TTL_MINUTES * 60_000
    ) {
      return { ok: false, reason: "invalid_window" };
    }
    if (expires <= Date.now()) return { ok: false, reason: "expired" };
    return { ok: true };
  }

  async readContent(
    claims: Parameters<RemittanceProofService["verifyReadbackGrant"]>[0],
  ) {
    let verification;
    try {
      verification = this.verifyReadbackGrant(claims);
    } catch {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "REMITTANCE_PROOF_SIGNER_UNAVAILABLE",
        "Download verification is not configured.",
      );
    }
    if (!verification.ok) {
      throw new ApiRequestError(
        verification.reason === "expired"
          ? HttpStatus.GONE
          : HttpStatus.FORBIDDEN,
        "REMITTANCE_PROOF_GRANT_INVALID",
        "The proof download grant is invalid.",
        { reason: verification.reason },
      );
    }
    this.assertPersistenceAvailable();
    const proof = await this.getProof(claims.proofId);
    if (proof.scanState !== "clean") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REMITTANCE_PROOF_NOT_CLEAN",
        "Only scanned clean proof bytes may be downloaded.",
      );
    }
    const content = await this.storage.read(proof.content.contentHash);
    if (!content) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "REMITTANCE_PROOF_CONTENT_UNAVAILABLE",
        "Proof bytes are unavailable.",
      );
    }
    if (
      claims.contentHash !== proof.content.contentHash ||
      createHash("sha256").update(content.bytes).digest("hex") !==
        proof.content.contentHash ||
      content.bytes.length !== proof.content.sizeBytes ||
      content.contentType !== proof.content.contentType
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REMITTANCE_PROOF_CONTENT_MISMATCH",
        "Proof bytes no longer match the signed content identity.",
      );
    }
    return content;
  }

  /**
   * Idempotent: replaying an already-recorded terminal verdict (clean or
   * rejected) for the same proof is a no-op that returns the existing
   * record, never a re-transition -- see
   * `BillingSettlementRepository.recordRemittanceProofScanResult`'s
   * `WHERE scan_state = 'pending_scan'` guard for the durable path.
   */
  async recordScanResult(
    proofId: string,
    outcome: RemittanceProofScanOutcome,
  ): Promise<RemittanceProofRecord> {
    if (outcome.scanState === "rejected" && !outcome.rejectionReason) {
      throw new Error(
        "recordScanResult requires a rejectionReason when scanState is rejected.",
      );
    }

    if (this.useDurablePersistence()) {
      await this.repository!.recordRemittanceProofScanResult({
        proofId,
        scanState: outcome.scanState,
        rejectionReason: outcome.rejectionReason,
        scanCompletedAt: outcome.scanCompletedAt,
      });
      return this.getProof(proofId);
    }

    const proof = this.proofs.find((entry) => entry.proofId === proofId);
    if (!proof) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "REMITTANCE_PROOF_NOT_FOUND",
        `Remittance proof "${proofId}" was not found.`,
        { proofId },
      );
    }
    if (proof.scanState === "pending_scan") {
      proof.scanState = outcome.scanState;
      proof.scanCompletedAt = outcome.scanCompletedAt;
      proof.rejectionReason = outcome.rejectionReason;
    }
    return this.cloneProof(proof);
  }

  /** Called after HTTP upload and by authorized retry; failures stay pending. */
  async attemptScan(proofId: string): Promise<RemittanceProofRecord> {
    this.assertPersistenceAvailable();
    const proof = await this.getProof(proofId);
    if (
      proof.scanState !== "pending_scan" ||
      this.scanner.availability().state === "unavailable"
    ) {
      return proof;
    }
    const outcome = await this.scanner.scan({
      proofId: proof.proofId,
      contentHash: proof.content.contentHash,
      contentType: proof.content.contentType,
      sizeBytes: proof.content.sizeBytes,
    });
    return this.recordScanResult(proofId, outcome);
  }

  /**
   * Batch existence and `approvedAt` are validated by the caller
   * (`BillingSettlementService`) before this is reached; this method owns
   * proof existence, batch ownership, `clean` scan state, and the
   * idempotent receipt itself.
   */
  async markPaidWithProof(
    input: MarkRemittanceProofPaidInput,
  ): Promise<RemittanceProofPaymentReceipt> {
    this.assertPersistenceAvailable();
    if (
      typeof input.proofId !== "string" ||
      !input.proofId.trim() ||
      typeof input.idempotencyKey !== "string" ||
      !input.idempotencyKey.trim() ||
      input.idempotencyKey.length > 200
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "proofId and a non-empty idempotencyKey are required.",
      );
    }
    if (this.useDurablePersistence()) {
      const result = await this.repository!.markRemittanceProofPaid(input);
      return this.assertReceiptMatches(
        this.resolveMarkPaidResult(result),
        input,
      );
    }

    // A new intent key must not mint another payment for an already-paid batch.
    const existingReceipt = this.paymentReceipts.find(
      (receipt) => receipt.batchId === input.batchId,
    );
    if (existingReceipt) {
      return this.assertReceiptMatches(existingReceipt, input);
    }

    const proof = this.proofs.find((entry) => entry.proofId === input.proofId);
    if (!proof) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "REMITTANCE_PROOF_NOT_FOUND",
        `Remittance proof "${input.proofId}" was not found.`,
        { proofId: input.proofId },
      );
    }
    if (proof.batchId !== input.batchId || proof.driverId !== input.driverId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REMITTANCE_PROOF_BATCH_MISMATCH",
        "This remittance proof belongs to a different reimbursement batch.",
        {
          proofId: input.proofId,
          expectedBatchId: input.batchId,
          actualBatchId: proof.batchId,
        },
      );
    }
    if (proof.scanState !== "clean") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REMITTANCE_PROOF_NOT_CLEAN",
        `This remittance proof cannot be used to mark payment: scanState is "${proof.scanState}", not "clean".`,
        { proofId: input.proofId, scanState: proof.scanState },
      );
    }

    const receipt: RemittanceProofPaymentReceipt = {
      receiptId: `remit-proof-receipt-${randomUUID()}`,
      batchId: input.batchId,
      proofId: input.proofId,
      idempotencyKey: input.idempotencyKey,
      driverId: input.driverId,
      amount: { ...input.amount },
      paidAt: input.paidAt,
      createdAt: new Date().toISOString(),
    };
    this.paymentReceipts.push(receipt);
    return this.cloneReceipt(receipt);
  }

  private assertReceiptMatches(
    receipt: RemittanceProofPaymentReceipt,
    input: MarkRemittanceProofPaidInput,
  ) {
    if (
      receipt.proofId !== input.proofId ||
      receipt.driverId !== input.driverId ||
      receipt.amount.amountMinor !== input.amount.amountMinor ||
      receipt.amount.currency !== input.amount.currency
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REMITTANCE_PROOF_PAYMENT_CONFLICT",
        "Payment replay must refer to the original proof, driver and amount.",
      );
    }
    return this.cloneReceipt(receipt);
  }

  private resolveMarkPaidResult(
    result: MarkRemittanceProofPaidResult,
  ): RemittanceProofPaymentReceipt {
    switch (result.outcome) {
      case "paid":
        return result.receipt;
      case "proof_not_found":
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "REMITTANCE_PROOF_NOT_FOUND",
          "Remittance proof was not found.",
        );
      case "proof_batch_mismatch":
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "REMITTANCE_PROOF_BATCH_MISMATCH",
          "This remittance proof belongs to a different reimbursement batch.",
        );
      case "proof_not_clean":
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "REMITTANCE_PROOF_NOT_CLEAN",
          "This remittance proof has not passed scanning.",
        );
      default:
        throw new Error(
          `Unhandled markRemittanceProofPaid outcome: ${(result as { outcome: string }).outcome}`,
        );
    }
  }

  private cloneProof(proof: RemittanceProofRecord): RemittanceProofRecord {
    return { ...proof, content: { ...proof.content } };
  }

  private cloneReceipt(
    receipt: RemittanceProofPaymentReceipt,
  ): RemittanceProofPaymentReceipt {
    return { ...receipt, amount: { ...receipt.amount } };
  }
}
