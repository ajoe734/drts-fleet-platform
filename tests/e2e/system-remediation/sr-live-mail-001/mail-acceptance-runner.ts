/**
 * Invitation transport probe against the authorized deployed candidate.
 * This is a partial profile: it never reports the complete mail task passed
 * without inbox, approval, lifecycle and automatic retry observations.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTarget, verifyDeployedCandidate } from "./preflight";
import { observeInvitationMailbox } from "./mailbox-observer";
import { prepareTaskInvitation, exerciseInvitationLifecycle, verifyExpiredInvitation, observeApproval } from "./live-profiles";
import {
  redactObject,
  UatEvidenceRecorder,
  type UatEvidenceBundle,
} from "../shared";

export class MailRunnerInputError extends Error {}
export type MailRunnerEnv = Record<string, string | undefined>;
export interface MailRunnerConfig {
  baseSha: string;
  candidateSha: string;
  workflowSha: string;
  apiOrigin: string;
  roleSessionToken: string;
  stepUpReference: string;
  tenantId: string;
  authorizedRecipient: string;
  nonAllowlistedRecipient: string;
  invitationRoleCode: string;
  pollTimeoutMs: number;
  pollIntervalMs: number;
}
function required(env: MailRunnerEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new MailRunnerInputError(`${key} is required`);
  return value;
}
function positiveInteger(
  value: string | undefined,
  key: string,
  fallback: number,
) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 300_000)
    throw new MailRunnerInputError(
      `${key} must be a positive integer no greater than 300000`,
    );
  return parsed;
}
export function validateMailRunnerInputs(env: MailRunnerEnv): MailRunnerConfig {
  let target: ReturnType<typeof validateTarget>;
  try {
    target = validateTarget(env);
  } catch (error) {
    throw new MailRunnerInputError(
      error instanceof Error ? error.message : "Invalid mail target",
    );
  }
  const baseSha = required(env, "BASE_SHA");
  const workflowSha = required(env, "WORKFLOW_SHA");
  if (![baseSha, workflowSha].every((sha) => /^[a-f0-9]{40}$/.test(sha)))
    throw new MailRunnerInputError(
      "BASE_SHA and WORKFLOW_SHA must be full 40-character SHAs",
    );
  const authorizedRecipient = required(
    env,
    "DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT",
  );
  if (!/^[a-zA-Z0-9._-]+\+invite@gmail\.com$/.test(authorizedRecipient))
    throw new MailRunnerInputError(
      "DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT must be the dedicated Gmail sender invite alias; fixture/demo/example or malformed addresses are rejected",
    );
  const nonAllowlistedRecipient = required(
    env,
    "DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT",
  );
  if (nonAllowlistedRecipient !== "sr-live-mail-001-negative@reserved.invalid")
    throw new MailRunnerInputError(
      "DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT must be the fixed reserved-domain address",
    );
  const invitationRoleCode = required(
    env,
    "DRTS_LIVE_MAIL_INVITATION_ROLE_CODE",
  );
  if (invitationRoleCode !== "tenant_viewer")
    throw new MailRunnerInputError(
      "DRTS_LIVE_MAIL_INVITATION_ROLE_CODE must be tenant_viewer",
    );
  return {
    baseSha,
    candidateSha: target.sha,
    workflowSha,
    apiOrigin: target.origin,
    roleSessionToken: required(env, "DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN"),
    stepUpReference: required(env, "DRTS_LIVE_MAIL_STEP_UP_REFERENCE"),
    tenantId: required(env, "DRTS_LIVE_MAIL_TEST_TENANT_ID"),
    authorizedRecipient,
    nonAllowlistedRecipient,
    invitationRoleCode,
    pollTimeoutMs: positiveInteger(
      env.DRTS_LIVE_MAIL_POLL_TIMEOUT_MS,
      "DRTS_LIVE_MAIL_POLL_TIMEOUT_MS",
      60_000,
    ),
    pollIntervalMs: positiveInteger(
      env.DRTS_LIVE_MAIL_POLL_INTERVAL_MS,
      "DRTS_LIVE_MAIL_POLL_INTERVAL_MS",
      3_000,
    ),
  };
}
export interface IssueInvitationResult {
  deliveryId: string | null;
  invitationId: string;
  statusCode: number;
  deployedCandidateSha: string | null;
  userId?: string;
}
export interface DeliveryReceipt {
  status: "queued" | "sent" | "failed";
  providerMessageId: string | null;
  attempts: number;
  lastOutcome: string | null;
  errorCode: string | null;
  readback?: Record<string, unknown>;
}
export type IssueInvitationFn = (
  config: MailRunnerConfig,
  recipient: string,
) => Promise<IssueInvitationResult>;
export type PollDeliveryReceiptFn = (
  config: MailRunnerConfig,
  deliveryId: string,
) => Promise<DeliveryReceipt>;
export interface MailRunnerDeps {
  issueInvitation: IssueInvitationFn;
  pollDeliveryReceipt: PollDeliveryReceiptFn;
  recorder: UatEvidenceRecorder;
  observeMailbox?: (
    config: MailRunnerConfig,
    deliveryId: string,
  ) => Promise<Record<string, unknown>>;
  lifecycle?: (issued: IssueInvitationResult) => Promise<void>;
  approval?: () => Promise<void>;
  expiryVerified?: boolean;
}
export interface MailRunnerResult {
  status: "passed" | "failed";
  reasons: string[];
  evidence: UatEvidenceBundle;
}
export async function runMailAcceptance(
  config: MailRunnerConfig,
  deps: MailRunnerDeps,
): Promise<MailRunnerResult> {
  const reasons: string[] = [];
  deps.recorder.setBaseSha(config.baseSha);
  deps.recorder.setCandidateSha(config.candidateSha);
  deps.recorder.recordRole("tenant_admin_live");
  const finish = (): MailRunnerResult => {
    for (const reason of reasons) deps.recorder.recordError(reason);
    const status = reasons.length ? "failed" : "passed";
    return { status, reasons, evidence: deps.recorder.finalize(status) };
  };
  if (config.workflowSha !== config.candidateSha) {
    reasons.push(
      "Checked-out workflow SHA does not match the requested candidate SHA.",
    );
    return finish();
  }
  const issued = await deps.issueInvitation(config, config.authorizedRecipient);
  if (![200, 201].includes(issued.statusCode))
    reasons.push(
      `Issuing the live test invitation returned HTTP ${issued.statusCode}, expected 200/201.`,
    );
  if (issued.deployedCandidateSha !== config.candidateSha)
    reasons.push(
      "Deployed candidate SHA header reported a different candidate.",
    );
  if (!issued.deliveryId || !issued.invitationId)
    reasons.push("Invitation response carried no deliveryId or invitationId.");
  if (reasons.length) return finish();
  deps.recorder.recordResourceId("tenant_invitation", issued.invitationId);
  deps.recorder.recordResourceId("mail_delivery", issued.deliveryId!);
  const receipt = await deps.pollDeliveryReceipt(config, issued.deliveryId!);
  deps.recorder.recordResourceId(
    "provider_receipt",
    issued.deliveryId!,
    receipt.readback ?? { ...receipt },
  );
  if (receipt.status !== "sent")
    reasons.push(
      `Mail delivery did not reach status "sent" (last observed status: "${receipt.status}").`,
    );
  if (receipt.status === "sent" && !receipt.providerMessageId)
    reasons.push("Sent receipt has no providerMessageId.");
  if (
    receipt.status === "sent" &&
    (receipt.lastOutcome !== "sent" || receipt.attempts < 1)
  )
    reasons.push("Sent receipt lacks a successful provider attempt.");
  if (reasons.length) return finish();

  if (deps.observeMailbox) {
    const observation = await deps.observeMailbox(config, issued.deliveryId!);
    deps.recorder.recordResourceId(
      "mailbox_observation",
      issued.deliveryId!,
      observation,
    );
  }
  if (deps.lifecycle) await deps.lifecycle(issued);
  if (deps.approval) await deps.approval();
  const negative = await deps.issueInvitation(
    config,
    config.nonAllowlistedRecipient,
  );
  if (![200, 201].includes(negative.statusCode))
    reasons.push(`Negative invitation returned HTTP ${negative.statusCode}.`);
  if (negative.deployedCandidateSha !== config.candidateSha)
    reasons.push("Negative response has a different deployed candidate SHA.");
  if (!negative.deliveryId)
    reasons.push("Negative invitation carried no deliveryId.");
  if (reasons.length) return finish();
  const rejected = await deps.pollDeliveryReceipt(config, negative.deliveryId!);
  deps.recorder.recordResourceId("mail_delivery", negative.deliveryId!);
  deps.recorder.recordResourceId(
    "provider_receipt",
    negative.deliveryId!,
    rejected.readback ?? { ...rejected },
  );
  if (rejected.status !== "failed")
    reasons.push(
      'Negative delivery did not reach status "failed"; allowlist gate must reject it.',
    );
  if (rejected.errorCode !== "SMTP_RECIPIENT_NOT_ALLOWLISTED")
    reasons.push(
      'Negative delivery expected "SMTP_RECIPIENT_NOT_ALLOWLISTED".',
    );
  if (
    rejected.providerMessageId ||
    rejected.attempts < 1 ||
    rejected.lastOutcome !== "failed"
  )
    reasons.push(
      "Negative delivery lacks a durable failed attempt or has an unexpected provider acknowledgement.",
    );

  const outstanding = [
    ...(deps.observeMailbox
      ? []
      : ["authorized mailbox content for invitation"]),
    ...(deps.approval ? [] : ["authorized mailbox content for approval", "approval new_request, approaching_timeout and decision mail"]),
    ...(deps.lifecycle ? [] : ["invitation accept, single use, resend and revoke"]),
    ...(deps.expiryVerified ? [] : ["real 24-hour invitation expiry"]),
    "automatic retry after a real retryable failure (no authorized fault injection)",
  ];
  for (const surface of outstanding)
    deps.recorder.recordLiveLimitation(
      surface,
      "Not exercised by this invitation transport profile.",
    );
  reasons.push(`Acceptance incomplete: ${outstanding.join("; ")}.`);
  return finish();
}

/** Real HTTP status/timing is recorded here, never fabricated by orchestration. */
export async function mailRequest(
  config: MailRunnerConfig,
  path: string,
  init: RequestInit,
  recorder?: UatEvidenceRecorder,
) {
  const started = Date.now();
  const response = await fetch(new URL(`/api/${path}`, config.apiOrigin), {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  recorder?.recordHttpCall({
    method: init.method ?? "GET",
    url: `${config.apiOrigin}/api/${path}`,
    statusCode: response.status,
    durationMs: Date.now() - started,
    responseHeaders: {
      "x-drts-candidate-sha":
        response.headers.get("x-drts-candidate-sha") ?? "",
    },
  });
  if (response.headers.get("x-drts-candidate-sha") !== config.candidateSha)
    throw new Error("Deployed candidate SHA changed during mail acceptance");
  if (!response.ok)
    throw new Error(
      `Mail API returned HTTP ${response.status}; response body omitted`,
    );
  return response;
}
export async function realIssueInvitation(
  config: MailRunnerConfig,
  recipient: string,
  recorder?: UatEvidenceRecorder,
): Promise<IssueInvitationResult> {
  if (
    ![config.authorizedRecipient, config.nonAllowlistedRecipient].includes(
      recipient,
    )
  )
    throw new Error("Recipient is outside the task grant");
  const res = await mailRequest(
    config,
    "tenant/users",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.roleSessionToken}`,
        "x-tenant-id": config.tenantId,
        "x-drts-step-up-reference": config.stepUpReference,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: recipient,
        displayName: "SR-LIVE-MAIL-001 live acceptance",
        roleCode: config.invitationRoleCode,
      }),
    },
    recorder,
  );
  const body = (await res.json()) as {
    data?: {
      user_id?: string;
      invitation?: { invitation_id?: string; delivery_id?: string | null };
    };
  };
  const invitation = body.data?.invitation;
  if (body.data?.user_id)
    recorder?.recordResourceId("tenant_user", body.data.user_id);
  return {
    deliveryId: invitation?.delivery_id ?? null,
    invitationId: invitation?.invitation_id ?? "",
    statusCode: res.status,
    deployedCandidateSha: res.headers.get("x-drts-candidate-sha"),
    ...(body.data?.user_id ? { userId: body.data.user_id } : {}),
  };
}
export async function realPollDeliveryReceipt(
  config: MailRunnerConfig,
  deliveryId: string,
  recorder?: UatEvidenceRecorder,
): Promise<DeliveryReceipt> {
  const deadline = Date.now() + config.pollTimeoutMs;
  while (Date.now() < deadline) {
    const res = await mailRequest(
      config,
      `tenant/mail-deliveries/${encodeURIComponent(deliveryId)}`,
      {
        headers: {
          authorization: `Bearer ${config.roleSessionToken}`,
          "x-tenant-id": config.tenantId,
        },
      },
      recorder,
    );
    const body = (await res.json()) as {
      data?: {
        delivery_id?: string;
        tenant_id?: string;
        status?: "queued" | "sent" | "failed";
        attempts?: Array<{
          outcome?: string;
          error_code?: string | null;
          acknowledgement?: { provider_message_id?: string | null } | null;
        }>;
      };
    };
    const receipt = body.data;
    if (
      receipt?.delivery_id !== deliveryId ||
      receipt.tenant_id !== config.tenantId ||
      !["queued", "sent", "failed"].includes(receipt.status ?? "") ||
      !Array.isArray(receipt.attempts)
    )
      throw new Error("Invalid or cross-tenant delivery readback envelope");
    const lastAttempt = receipt.attempts.at(-1);
    const last: DeliveryReceipt = {
      status: receipt.status!,
      providerMessageId:
        lastAttempt?.acknowledgement?.provider_message_id ?? null,
      attempts: receipt.attempts.length,
      lastOutcome: lastAttempt?.outcome ?? null,
      errorCode: lastAttempt?.error_code ?? null,
      readback: receipt,
    };
    if (
      last.status !== "queued" ||
      Date.now() + config.pollIntervalMs >= deadline
    )
      return last;
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
  throw new Error("Delivery readback timed out without a terminal receipt");
}
async function main(): Promise<void> {
  const outputPath = resolve(
    process.env.DRTS_LIVE_MAIL_EVIDENCE_PATH?.trim() ||
      ".artifacts/live-mail-acceptance/evidence-mail.json",
  );
  const recorder = new UatEvidenceRecorder({
    taskId: "sr-live-mail-001",
    baseSha: process.env.BASE_SHA ?? "unknown",
  });
  let evidence: UatEvidenceBundle;
  try {
    const config = validateMailRunnerInputs(process.env);
    if (process.env.GITHUB_ACTIONS !== "true")
      throw new Error("Live mail requires the authorized GitHub-hosted runner");
    if (config.workflowSha !== config.candidateSha)
      throw new Error("Checkout SHA does not match requested candidate");
    await verifyDeployedCandidate(config.apiOrigin, config.candidateSha);
    recorder.setCandidateSha(config.candidateSha);
    const expiryVerified = await verifyExpiredInvitation(config, process.env, recorder);
    const result = await runMailAcceptance(config, {
      issueInvitation: (cfg, recipient) =>
        prepareTaskInvitation(cfg, recipient, recorder),
      pollDeliveryReceipt: (cfg, id) =>
        realPollDeliveryReceipt(cfg, id, recorder),
      observeMailbox: observeInvitationMailbox,
      lifecycle: (issued) => exerciseInvitationLifecycle(config, issued, recorder),
      ...(process.env.DRTS_LIVE_MAIL_APPROVAL_REQUEST_ID?.trim() ? {
        approval: () => observeApproval(config, process.env.DRTS_LIVE_MAIL_APPROVAL_REQUEST_ID!.trim(), recorder),
      } : {}),
      expiryVerified,
      recorder,
    });
    evidence = result.evidence;
  } catch (error) {
    // Network/server errors may contain credentials; HTTP status is separately
    // recorded, but arbitrary error strings and response bodies are not retained.
    recorder.recordError(
      error instanceof MailRunnerInputError
        ? error.message
        : "Live mail execution failed; see recorded HTTP status and pending prerequisites.",
    );
    evidence = recorder.finalize("failed");
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify(redactObject(evidence), null, 2),
    "utf-8",
  );
  console.log(`Mail acceptance status: ${evidence.status}`);
  process.exitCode = evidence.status === "passed" ? 0 : 1;
}
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly)
  main().catch(() => {
    console.error("Mail acceptance evidence could not be written.");
    process.exitCode = 1;
  });
