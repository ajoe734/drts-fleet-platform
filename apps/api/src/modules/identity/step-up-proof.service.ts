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
  toIamStepUpChallenge,
  type IamAuthAssuranceLevel,
  type IamAuthEvidenceSource,
  type IamStepUpProofRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  evaluateStepUpPolicy,
  selectAcceptedAuthMethods,
  stepUpAssuranceForMethods,
  type StepUpIdentityEvidence,
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

/**
 * Where the strongest accepted method came from, so the audit trail records how
 * the evidence was obtained rather than assuming an IdP claim.
 */
function resolveEvidenceSource(
  methods: readonly string[],
): IamAuthEvidenceSource {
  let best: IamAuthEvidenceSource = "idp_claim";
  let bestRank = -1;

  for (const method of methods) {
    const trusted = findIamTrustedAuthMethod(method);
    if (!trusted) {
      continue;
    }
    const rank = rankIamAuthAssurance(trusted.assurance);
    if (rank > bestRank) {
      bestRank = rank;
      best = trusted.evidenceSource;
    }
  }

  return best;
}

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

  /**
   * Raise a proof for one action from the caller's own session evidence.
   *
   * This is the only way a proof reaches a client, and it grants nothing the
   * session did not already prove: the same trusted `amr`, the same `acr`
   * minimum, the same phishing-resistance requirement and the same freshness
   * window are re-checked here. What the proof adds is the binding the rules
   * ask for — one principal, one session, one action, single use, and an expiry
   * anchored to the original `auth_time` so a proof can never outlive the login
   * window it was derived from.
   *
   * When the session cannot clear the rule the caller gets the same stable
   * `MFA_REQUIRED` / `STEP_UP_REQUIRED` error the privileged route would have
   * returned, which tells the client to re-authenticate at the IdP instead.
   */
  issueSessionBackedProof(input: {
    identity: StepUpIdentityEvidence | null;
    actionId: string;
    now?: Date;
  }): IamStepUpProofRecord {
    const rule = findIamPrivilegedActionRule(input.actionId);
    if (!rule) {
      throw new ApiRequestError(
        400,
        "IAM_STEP_UP_ACTION_UNKNOWN",
        "Step-up proof references an action with no declared policy.",
        { actionId: input.actionId },
      );
    }

    const now = input.now ?? new Date();
    // `requiresBoundProof: false` asks exactly one question — is the session's
    // own evidence trusted, strong and fresh enough for this action? — without
    // demanding the proof we are about to create.
    const decision = evaluateStepUpPolicy({
      rule: { ...rule, requiresBoundProof: false },
      identity: input.identity,
      proof: null,
      proofReferencePresented: false,
      now,
    });

    if (decision.outcome !== "allow") {
      throw new ApiRequestError(
        403,
        decision.errorCode ?? "STEP_UP_REQUIRED",
        decision.errorCode === "MFA_REQUIRED"
          ? "A trusted multi-factor authentication proof is required before this action can be stepped up."
          : "The current session authentication is too old to raise a step-up proof; re-authenticate first.",
        {
          ...toIamStepUpChallenge(rule),
          acceptedAuthMethods: [...rule.acceptedAuthMethods],
          reasonCode: decision.reasonCode,
        },
      );
    }

    const identity = input.identity!;
    return this.recordVerifiedProof({
      principalId: identity.principalId ?? "",
      sessionId: identity.sessionId ?? "",
      actionId: rule.actionId,
      authMethods: [...decision.satisfiedByAuthMethods],
      evidenceSource: resolveEvidenceSource(decision.satisfiedByAuthMethods),
      // Anchor the proof to the verified login, not to "now": stepping up must
      // not silently restart the freshness clock.
      verifiedAt: identity.authTime ?? now.toISOString(),
    });
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
