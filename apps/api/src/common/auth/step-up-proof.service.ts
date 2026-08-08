import { createHmac } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";
import type {
  CreateStepUpProofCommand,
  StepUpProof,
} from "@drts/contracts";

import { ApiRequestError } from "../api-envelope";
import { detectAuthEnvironment } from "../../config/auth-startup-config";
import { SecurityEventsService } from "../../modules/security-events/security-events.service";
import { AUTH_STEP_UP_REFERENCE_HEADER } from "./auth.constants";
import type {
  AuthenticatedRequestLike,
  BootstrapRequestIdentity,
} from "./auth.types";
import {
  resolveRouteStepUpPolicy,
  resolveStepUpActionPolicy,
} from "./step-up.policy";

const MAX_STORED_PROOFS = 1000;

const STRICT_TRUSTED_AMR = new Set([
  "mfa",
  "otp",
  "totp",
  "push",
  "webauthn",
  "fido2",
  "verified_iap_workforce",
]);

const NON_STRICT_TRUSTED_AMR = new Set([
  ...STRICT_TRUSTED_AMR,
  "tenant_bootstrap_fixture",
]);

interface StoredStepUpProof {
  stepUpReference: string;
  actionId: NonNullable<StepUpProof["actionId"]>;
  actorId: string | null;
  principalId: string | null;
  sessionId: string;
  realm: BootstrapRequestIdentity["realm"];
  tenantId: string | null;
  issuedAt: string;
  expiresAt: string;
  authTime: string | number;
  amr: string[];
  acr: string | null;
}

function parseTimestamp(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value < 100000000000 ? value * 1000 : value;
  }
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  const num = Number(value);
  if (Number.isFinite(num)) {
    return num < 100000000000 ? num * 1000 : num;
  }
  return null;
}

function normalizeReference(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function extractStepUpReference(
  request: Pick<AuthenticatedRequestLike, "headers"> & { body?: unknown },
): string | null {
  const headerValue = request.headers[AUTH_STEP_UP_REFERENCE_HEADER];
  const directHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const fromHeader = normalizeReference(directHeader);
  if (fromHeader) {
    return fromHeader;
  }

  if (!request.body || typeof request.body !== "object") {
    return null;
  }

  const root = request.body as Record<string, unknown>;
  const directBody = normalizeReference(root.stepUpReference);
  if (directBody) {
    return directBody;
  }

  const mutation = root.mutation;
  if (!mutation || typeof mutation !== "object") {
    return null;
  }

  return normalizeReference(
    (mutation as Record<string, unknown>).stepUpReference,
  );
}

function getStepUpSecret(): string {
  return (
    process.env.STEP_UP_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    "drts-step-up-token-signing-key-default-2026"
  );
}

function signToken(
  payload: Omit<StoredStepUpProof, "stepUpReference">,
): string {
  const secret = getStepUpSecret();
  const rawPayload = { ...payload, stepUpReference: undefined };
  const jsonStr = JSON.stringify(rawPayload);
  const payloadB64 = Buffer.from(jsonStr, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  return `stepup_${payloadB64}.${signature}`;
}

function verifyAndDecodeToken(token: string): StoredStepUpProof | null {
  if (!token || typeof token !== "string" || !token.startsWith("stepup_")) {
    return null;
  }
  const body = token.slice(7);
  const dotIndex = body.lastIndexOf(".");
  if (dotIndex <= 0) {
    return null;
  }
  const payloadB64 = body.slice(0, dotIndex);
  const signature = body.slice(dotIndex + 1);
  const secret = getStepUpSecret();
  const expectedSignature = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(jsonStr) as StoredStepUpProof;
    if (
      !payload ||
      typeof payload !== "object" ||
      !payload.actionId ||
      !payload.sessionId ||
      !payload.expiresAt
    ) {
      return null;
    }
    payload.stepUpReference = token;
    return payload;
  } catch {
    return null;
  }
}

function isStrictAuthEnvironment(): boolean {
  const environment = detectAuthEnvironment(process.env);
  return environment === "production" || environment === "staging";
}

@Injectable()
export class StepUpProofService {
  private readonly storedProofs = new Map<string, StoredStepUpProof>();

  constructor(
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
  ) {}

  createProof(
    identity: BootstrapRequestIdentity | null | undefined,
    command: CreateStepUpProofCommand,
    requestId?: string,
  ): StepUpProof {
    if (!identity?.actorId) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Authenticated identity is required before requesting step-up proof.",
      );
    }

    const policy = this.resolveRequestedPolicy(identity, command);
    if (!policy) {
      return {
        required: false,
        actionId: null,
        stepUpReference: null,
        issuedAt: null,
        expiresAt: null,
      };
    }

    const authTimeMs = parseTimestamp(identity.authTime);
    if (authTimeMs === null || !this.hasTrustedMfa(identity)) {
      this.recordEvent("step_up.denied", identity, {
        actionId: policy.actionId,
        outcome: "denied",
        reasonCode:
          authTimeMs === null ? "missing_trusted_auth_time" : "mfa_not_trusted",
        requestId: requestId ?? null,
      });
      throw new ApiRequestError(
        403,
        "MFA_REQUIRED",
        "Trusted multi-factor authentication is required before step-up proof can be issued.",
        {
          actionId: policy.actionId,
          freshnessSeconds: Math.floor(policy.freshnessWindowMs / 1000),
        },
      );
    }

    const sessionId = identity.sessionId?.trim();
    if (!sessionId) {
      this.recordEvent("step_up.denied", identity, {
        actionId: policy.actionId,
        outcome: "denied",
        reasonCode: "missing_session",
        requestId: requestId ?? null,
      });
      throw new ApiRequestError(
        403,
        "STEP_UP_REQUIRED",
        "A fresh step-up verification is required for this privileged action.",
        {
          actionId: policy.actionId,
          freshnessSeconds: Math.floor(policy.freshnessWindowMs / 1000),
        },
      );
    }

    const expiresAtMs = authTimeMs + policy.freshnessWindowMs;
    if (Date.now() > expiresAtMs) {
      this.recordEvent("step_up.denied", identity, {
        actionId: policy.actionId,
        outcome: "denied",
        reasonCode: "stale_auth_time",
        requestId: requestId ?? null,
      });
      throw new ApiRequestError(
        403,
        "STEP_UP_REQUIRED",
        "A fresh step-up verification is required for this privileged action.",
        {
          actionId: policy.actionId,
          freshnessSeconds: Math.floor(policy.freshnessWindowMs / 1000),
        },
      );
    }

    const issuedAt = new Date().toISOString();
    const rawProofPayload = {
      actionId: policy.actionId,
      actorId: identity.actorId,
      principalId: identity.principalId ?? identity.actorId,
      sessionId,
      realm: identity.realm,
      tenantId: identity.tenantId ?? null,
      issuedAt,
      expiresAt: new Date(expiresAtMs).toISOString(),
      authTime: identity.authTime!,
      amr: [...(identity.amr ?? [])],
      acr: identity.acr ?? null,
    };

    const token = signToken(rawProofPayload);
    const proof: StoredStepUpProof = {
      ...rawProofPayload,
      stepUpReference: token,
    };

    this.storedProofs.set(token, proof);
    this.trimProofStore();
    this.recordEvent("step_up.proof_issued", identity, {
      actionId: proof.actionId,
      outcome: "success",
      requestId: requestId ?? null,
      tokenId: proof.stepUpReference,
      afterSummary: {
        expiresAt: proof.expiresAt,
        issuedAt: proof.issuedAt,
      },
    });

    return {
      required: true,
      actionId: proof.actionId,
      stepUpReference: proof.stepUpReference,
      issuedAt: proof.issuedAt,
      expiresAt: proof.expiresAt,
    };
  }

  assertRequestSatisfied(
    identity: BootstrapRequestIdentity | null | undefined,
    request: AuthenticatedRequestLike & { body?: unknown },
  ) {
    const policy = resolveRouteStepUpPolicy(
      request.method ?? "GET",
      request.originalUrl ?? request.url ?? "",
      identity?.realm,
    );
    if (!policy) {
      return;
    }

    const reference = extractStepUpReference(request);
    if (!reference || !identity?.actorId || !identity.sessionId) {
      this.recordEvent("step_up.denied", identity, {
        actionId: policy.actionId,
        outcome: "denied",
        reasonCode: reference ? "missing_identity_session" : "missing_reference",
        requestId: identity?.requestId ?? null,
      });
      throw this.buildStepUpRequiredError(policy.actionId, policy.freshnessWindowMs);
    }

    let proof = this.storedProofs.get(reference);
    if (!proof) {
      proof = verifyAndDecodeToken(reference) ?? undefined;
    }

    if (!proof) {
      this.recordEvent("step_up.denied", identity, {
        actionId: policy.actionId,
        outcome: "denied",
        reasonCode: "unknown_reference",
        requestId: identity.requestId ?? null,
      });
      throw this.buildStepUpRequiredError(policy.actionId, policy.freshnessWindowMs);
    }

    if (proof.actionId !== policy.actionId) {
      this.recordEvent("step_up.denied", identity, {
        actionId: policy.actionId,
        outcome: "denied",
        reasonCode: "action_mismatch",
        requestId: identity.requestId ?? null,
        tokenId: proof.stepUpReference,
      });
      throw this.buildStepUpRequiredError(policy.actionId, policy.freshnessWindowMs);
    }

    if (proof.sessionId !== identity.sessionId) {
      this.recordEvent("step_up.denied", identity, {
        actionId: policy.actionId,
        outcome: "denied",
        reasonCode: "session_mismatch",
        requestId: identity.requestId ?? null,
        tokenId: proof.stepUpReference,
      });
      throw this.buildStepUpRequiredError(policy.actionId, policy.freshnessWindowMs);
    }

    const identityPrincipalId = identity.principalId ?? identity.actorId;
    if (
      proof.actorId !== identity.actorId ||
      proof.principalId !== identityPrincipalId
    ) {
      this.recordEvent("step_up.denied", identity, {
        actionId: policy.actionId,
        outcome: "denied",
        reasonCode: "principal_mismatch",
        requestId: identity.requestId ?? null,
        tokenId: proof.stepUpReference,
      });
      throw this.buildStepUpRequiredError(policy.actionId, policy.freshnessWindowMs);
    }

    const expiresAtMs = parseTimestamp(proof.expiresAt);
    if (expiresAtMs === null || Date.now() > expiresAtMs) {
      this.storedProofs.delete(reference);
      this.recordEvent("step_up.denied", identity, {
        actionId: policy.actionId,
        outcome: "denied",
        reasonCode: "expired_reference",
        requestId: identity.requestId ?? null,
        tokenId: proof.stepUpReference,
      });
      throw this.buildStepUpRequiredError(policy.actionId, policy.freshnessWindowMs);
    }

    this.recordEvent("step_up.satisfied", identity, {
      actionId: policy.actionId,
      outcome: "success",
      requestId: identity.requestId ?? null,
      tokenId: proof.stepUpReference,
      afterSummary: {
        expiresAt: proof.expiresAt,
        issuedAt: proof.issuedAt,
      },
    });
  }

  private resolveRequestedPolicy(
    identity: BootstrapRequestIdentity,
    command: CreateStepUpProofCommand,
  ) {
    if (command.actionId) {
      return resolveStepUpActionPolicy(command.actionId, identity.realm);
    }

    const hasMethod = typeof command.method === "string" && command.method.trim();
    const hasPath = typeof command.path === "string" && command.path.trim();
    if (!hasMethod && !hasPath) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "actionId or method/path is required.",
        {
          field: "actionId|method|path",
        },
      );
    }
    if (!hasMethod || !hasPath) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "Both method and path are required when actionId is omitted.",
        {
          field: !hasMethod ? "method" : "path",
        },
      );
    }

    return resolveRouteStepUpPolicy(
      command.method!,
      command.path!,
      identity.realm,
    );
  }

  private hasTrustedMfa(identity: BootstrapRequestIdentity) {
    const normalizedAcr = identity.acr?.trim().toLowerCase() ?? null;
    if (normalizedAcr === "aal2" || normalizedAcr === "aal3") {
      return true;
    }

    const trustedAmr = isStrictAuthEnvironment()
      ? STRICT_TRUSTED_AMR
      : NON_STRICT_TRUSTED_AMR;
    return (identity.amr ?? []).some((method) =>
      trustedAmr.has(method.trim().toLowerCase()),
    );
  }

  private buildStepUpRequiredError(
    actionId: string,
    freshnessWindowMs: number,
  ) {
    return new ApiRequestError(
      403,
      "STEP_UP_REQUIRED",
      "A fresh step-up verification is required for this privileged action.",
      {
        actionId,
        freshnessSeconds: Math.floor(freshnessWindowMs / 1000),
        stepUpReferenceHeader: AUTH_STEP_UP_REFERENCE_HEADER,
      },
    );
  }

  private recordEvent(
    eventType: "step_up.denied" | "step_up.proof_issued" | "step_up.satisfied",
    identity: BootstrapRequestIdentity | null | undefined,
    input: {
      actionId: string;
      outcome: "denied" | "success";
      reasonCode?: string;
      requestId?: string | null;
      tokenId?: string | null;
      afterSummary?: Record<string, unknown>;
    },
  ) {
    if (!this.securityEventsService || !identity?.actorId) {
      return;
    }

    this.securityEventsService.recordEvent({
      actorId: identity.actorId,
      actorType: identity.actorType,
      subjectId: identity.principalId ?? identity.actorId,
      realm: identity.realm,
      tenantId: identity.tenantId ?? null,
      partnerId: identity.partnerId ?? null,
      eventType,
      eventFamily: "policy",
      outcome: input.outcome,
      severity: input.outcome === "denied" ? "medium" : "low",
      targetType: "step_up_action",
      targetId: input.actionId,
      sessionId: identity.sessionId ?? null,
      tokenId: input.tokenId ?? identity.tokenId ?? null,
      authMethods:
        identity.amr && identity.amr.length > 0
          ? identity.amr
          : [identity.authMode],
      sourceIp: null,
      userAgent: null,
      requestId: input.requestId ?? identity.requestId ?? null,
      traceId: null,
      reasonCode: input.reasonCode ?? null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: input.afterSummary ?? null,
      maskedContext: {
        actionId: input.actionId,
      },
    });
  }

  private trimProofStore() {
    while (this.storedProofs.size > MAX_STORED_PROOFS) {
      const [oldestKey] = this.storedProofs.keys();
      if (!oldestKey) {
        return;
      }
      this.storedProofs.delete(oldestKey);
    }
  }
}
