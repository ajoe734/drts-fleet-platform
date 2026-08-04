/**
 * IAM-MFA-001 — server-owned step-up proof store.
 *
 * A proof is created only after the server verified trusted evidence itself
 * (an IdP re-authentication result or a device proof it checked against the
 * durable binding). It is bound to principal + session + action and carries a
 * server-derived assurance level, so a caller cannot widen what it covers.
 *
 * The runtime store is process-local. Durable persistence arrives with the
 * identity session store; until then a proof does not survive a restart, which
 * fails closed (the action asks for step-up again).
 */
import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import {
  findIamPrivilegedActionRule,
  findIamTrustedAuthMethod,
  rankIamAuthAssurance,
  type IamAuthAssuranceLevel,
  type IamAuthEvidenceSource,
  type IamStepUpProofRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  selectAcceptedAuthMethods,
  stepUpAssuranceForMethods,
} from "../../common/auth/mfa-step-up.policy";

export interface RecordStepUpProofInput {
  principalId: string;
  sessionId: string;
  actionId: string;
  /** `amr` values the server verified for this re-authentication. */
  authMethods: string[];
  evidenceSource: IamAuthEvidenceSource;
  /** Defaults to now; supplied by callers that verified evidence moments ago. */
  verifiedAt?: string;
}

const MAX_TRACKED_PROOFS = 5000;

@Injectable()
export class StepUpProofService {
  private readonly proofs = new Map<string, IamStepUpProofRecord>();

  /**
   * Persist a verified re-authentication as a single-use, action-bound proof.
   * Rejects evidence the policy would not accept anyway, so a proof can never
   * exist that is weaker than the action it names.
   */
  recordVerifiedProof(input: RecordStepUpProofInput): IamStepUpProofRecord {
    const rule = findIamPrivilegedActionRule(input.actionId);
    if (!rule) {
      throw new ApiRequestError(
        400,
        "IAM_STEP_UP_ACTION_UNKNOWN",
        "Step-up proof references an action with no declared policy.",
        { actionId: input.actionId },
      );
    }

    if (!input.principalId?.trim() || !input.sessionId?.trim()) {
      throw new ApiRequestError(
        400,
        "IAM_STEP_UP_BINDING_REQUIRED",
        "Step-up proof must be bound to a principal and a session.",
        { actionId: input.actionId },
      );
    }

    const acceptedMethods = selectAcceptedAuthMethods(rule, input.authMethods);
    if (acceptedMethods.length === 0) {
      throw new ApiRequestError(
        403,
        "STEP_UP_REQUIRED",
        "Step-up evidence is not a trusted authentication method for this action.",
        { actionId: input.actionId },
      );
    }

    if (
      rule.requiresPhishingResistant &&
      !acceptedMethods.some(
        (method) =>
          findIamTrustedAuthMethod(method)?.phishingResistant === true,
      )
    ) {
      throw new ApiRequestError(
        403,
        "STEP_UP_REQUIRED",
        "This action requires phishing-resistant step-up evidence.",
        { actionId: input.actionId },
      );
    }

    const assurance = stepUpAssuranceForMethods(acceptedMethods);
    if (
      !assurance ||
      rankIamAuthAssurance(assurance) <
        rankIamAuthAssurance(rule.minimumAssurance)
    ) {
      throw new ApiRequestError(
        403,
        "STEP_UP_REQUIRED",
        "Step-up evidence does not reach the assurance level this action requires.",
        { actionId: input.actionId },
      );
    }

    const verifiedAt = input.verifiedAt ?? new Date().toISOString();
    const verifiedAtMillis = Date.parse(verifiedAt);
    if (!Number.isFinite(verifiedAtMillis)) {
      throw new ApiRequestError(
        400,
        "IAM_STEP_UP_BINDING_REQUIRED",
        "Step-up proof requires a valid verification timestamp.",
        { actionId: input.actionId },
      );
    }

    const record: IamStepUpProofRecord = {
      proofId: `stepup_${randomUUID().replace(/-/g, "")}`,
      principalId: input.principalId,
      sessionId: input.sessionId,
      actionId: rule.actionId,
      authMethods: acceptedMethods,
      assurance: assurance as IamAuthAssuranceLevel,
      verifiedAt,
      expiresAt: new Date(
        verifiedAtMillis + rule.freshnessSeconds * 1000,
      ).toISOString(),
      consumedAt: null,
      createdByEvidenceSource: input.evidenceSource,
    };

    this.pruneExpired();
    this.proofs.set(record.proofId, record);
    return { ...record };
  }

  findProof(proofId: string | null | undefined): IamStepUpProofRecord | null {
    const normalized = proofId?.trim();
    if (!normalized) {
      return null;
    }
    const record = this.proofs.get(normalized);
    return record ? { ...record } : null;
  }

  /** Single-use: a proof that cleared a policy check cannot clear another. */
  consumeProof(
    proofId: string,
    consumedAt = new Date().toISOString(),
  ): IamStepUpProofRecord | null {
    const record = this.proofs.get(proofId);
    if (!record || record.consumedAt) {
      return null;
    }
    const consumed: IamStepUpProofRecord = { ...record, consumedAt };
    this.proofs.set(proofId, consumed);
    return { ...consumed };
  }

  private pruneExpired(now = new Date()): void {
    for (const [proofId, record] of this.proofs) {
      const expiresAt = Date.parse(record.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
        this.proofs.delete(proofId);
      }
    }

    if (this.proofs.size <= MAX_TRACKED_PROOFS) {
      return;
    }

    const overflow = this.proofs.size - MAX_TRACKED_PROOFS;
    let removed = 0;
    for (const proofId of this.proofs.keys()) {
      if (removed >= overflow) {
        break;
      }
      this.proofs.delete(proofId);
      removed += 1;
    }
  }
}
