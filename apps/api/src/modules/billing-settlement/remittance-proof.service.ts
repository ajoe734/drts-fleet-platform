import { randomUUID } from "node:crypto";

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
  DEFAULT_CONTROLLED_DOWNLOAD_HOST,
  DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
  DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
  DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
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
import { InMemoryRemittanceProofStorageAdapter } from "./remittance-proof-storage.adapter";

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
    private readonly storage: RemittanceProofStorageProvider = new InMemoryRemittanceProofStorageAdapter(),
    @Optional()
    @Inject(REMITTANCE_PROOF_SCANNER)
    private readonly scanner: RemittanceProofScannerPort = new UnprovisionedRemittanceProofScannerAdapter(),
  ) {}

  private useDurablePersistence(): boolean {
    return Boolean(this.repository?.isEnabled());
  }

  async stageContent(bytes: Buffer, contentType: string) {
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
    const proofId = `remit-proof-${randomUUID()}`;
    let content;
    try {
      content = await this.storage.commit({
        proofId,
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
      return this.repository!.insertRemittanceProof({
        proofId,
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
    const proof = await this.getProof(proofId);
    const metadata = createControlledDownloadMetadata({
      kind: "remittance-proof",
      subjectId: proof.proofId,
      manifestHash: proof.content.contentHash,
      host: DEFAULT_CONTROLLED_DOWNLOAD_HOST,
      keyId: DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
      signingSecret: DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
      ttlMinutes: REMITTANCE_PROOF_READBACK_TTL_MINUTES,
      signatureVersion: DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
    });
    return {
      proofId: proof.proofId,
      readbackUrl: metadata.downloadUrl,
      expiresAt: metadata.expiresAt,
      issuedAt: metadata.signedAt,
    };
  }

  /**
   * Verifies a previously issued readback grant is both genuine and still
   * within its window. Not reachable over HTTP in this task (no byte-serving
   * route is in `write_scopes`/the locked OpenAPI paths); it exists so the
   * "expired grant requires re-authorization" behaviour is directly
   * testable, matching the readback endpoint's documented contract.
   */
  verifyReadbackGrant(claims: {
    proofId: string;
    contentHash: string;
    signedAt: string;
    expiresAt: string;
    keyId: string;
    signature: string;
  }): { ok: true } | { ok: false; reason: string } {
    const verification = verifyControlledDownloadSignature(
      {
        kind: "remittance-proof",
        subjectId: claims.proofId,
        manifestHash: claims.contentHash,
        signedAt: claims.signedAt,
        expiresAt: claims.expiresAt,
        keyId: claims.keyId,
        signatureVersion: DEFAULT_CONTROLLED_DOWNLOAD_SIGNATURE_VERSION,
        signature: claims.signature,
      },
      {
        keyId: DEFAULT_CONTROLLED_DOWNLOAD_KEY_ID,
        signingSecret: DEFAULT_CONTROLLED_DOWNLOAD_SECRET,
      },
    );
    if (!verification.ok) {
      return { ok: false, reason: verification.reason };
    }
    if (Date.parse(claims.expiresAt) <= Date.now()) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true };
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

  /**
   * The seam a real scanning pipeline (queue consumer, provider webhook,
   * ...) would call once wired. With the default
   * `UnprovisionedRemittanceProofScannerAdapter`, `availability()` is
   * always `unavailable`, so this is a documented no-op and the proof
   * correctly stays `pending_scan` -- see
   * `docs/04-uat/system-remediation-20260906/SR-PROOF-001.md` for the
   * external-gate boundary this records.
   */
  async attemptScan(proofId: string): Promise<RemittanceProofRecord> {
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
    if (this.useDurablePersistence()) {
      const result = await this.repository!.markRemittanceProofPaid(input);
      return this.resolveMarkPaidResult(result);
    }

    const existingReceipt = this.paymentReceipts.find(
      (receipt) =>
        receipt.batchId === input.batchId &&
        receipt.idempotencyKey === input.idempotencyKey,
    );
    if (existingReceipt) {
      return this.cloneReceipt(existingReceipt);
    }

    const proof = this.proofs.find(
      (entry) => entry.proofId === input.proofId,
    );
    if (!proof) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "REMITTANCE_PROOF_NOT_FOUND",
        `Remittance proof "${input.proofId}" was not found.`,
        { proofId: input.proofId },
      );
    }
    if (proof.batchId !== input.batchId) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REMITTANCE_PROOF_BATCH_MISMATCH",
        "This remittance proof belongs to a different reimbursement batch.",
        { proofId: input.proofId, expectedBatchId: input.batchId, actualBatchId: proof.batchId },
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
