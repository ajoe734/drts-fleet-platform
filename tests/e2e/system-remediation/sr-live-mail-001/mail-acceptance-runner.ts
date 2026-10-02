/**
 * SR-LIVE-MAIL-001: live invitation-mail acceptance profile.
 *
 * Exercises the real, deployed tenant-invitation send path end to end:
 * `POST tenant/users` (issues a canonical invitation and enqueues a real
 * mail delivery through `NotificationDeliveryService`) then polls the real
 * `GET tenant/mail-deliveries/:deliveryId` readback (SR-MAIL-DELIVERY-READBACK-20261001)
 * until the deployed candidate reports a provider acknowledgement. This file
 * never contacts a network itself when imported for tests: `main()` -- the
 * only place real fetch calls happen -- only runs when this file is executed
 * directly, matching the GitHub-hosted workflow's invocation. Unit tests
 * import `validateMailRunnerInputs`/`runMailAcceptance` directly and inject
 * fake `issueInvitation`/`pollDeliveryReceipt` implementations.
 *
 * Explicitly out of scope for this runner (see recorded live limitations in
 * `runMailAcceptance`): it does not itself read the authorized test mailbox
 * over IMAP/Gmail API to confirm real content arrived, and it does not
 * trigger the approval-timeout reminder flow (same readback API, no
 * dedicated send trigger wired here yet).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  redactObject,
  UatEvidenceRecorder,
  type UatEvidenceBundle,
} from "../shared";

const CANDIDATE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIXTURE_RECIPIENT_MARKERS = [
  "demo",
  "fixture",
  "mock",
  "sample",
  "sandbox",
  "example.com",
  "example.test",
  "example.org",
  "test.invalid",
];

export class MailRunnerInputError extends Error {}

export interface MailRunnerConfig {
  candidateSha: string;
  workflowSha: string;
  apiOrigin: string;
  roleSessionToken: string;
  tenantId: string;
  authorizedRecipient: string;
  invitationRoleCode: string;
  pollTimeoutMs: number;
  pollIntervalMs: number;
}

export type MailRunnerEnv = Record<string, string | undefined>;

function requireString(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new MailRunnerInputError(
      `${name} is required and must be non-empty.`,
    );
  }
  return trimmed;
}

function requireCsv(value: string | undefined, name: string): string[] {
  const raw = requireString(value, name);
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length === 0) {
    throw new MailRunnerInputError(`${name} must contain at least one entry.`);
  }
  return items;
}

function requireAllowedOrigin(
  value: string | undefined,
  name: string,
  allowedTargets: string[],
): string {
  const origin = requireString(value, name).replace(/\/$/, "");
  if (!allowedTargets.includes(origin)) {
    throw new MailRunnerInputError(
      `${name} "${origin}" is not present in DRTS_LIVE_MAIL_ALLOWED_TARGETS. Live acceptance never falls back to a historical staging default.`,
    );
  }
  return origin;
}

function optionalPositiveInteger(
  value: string | undefined,
  name: string,
  fallback: number,
): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new MailRunnerInputError(
      `${name} must be a positive integer when set, got: ${trimmed}`,
    );
  }
  return parsed;
}

function assertNotFixtureRecipient(recipient: string): void {
  if (!EMAIL_PATTERN.test(recipient)) {
    throw new MailRunnerInputError(
      `DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT "${recipient}" is not a valid single email address.`,
    );
  }
  const lowered = recipient.toLowerCase();
  if (FIXTURE_RECIPIENT_MARKERS.some((marker) => lowered.includes(marker))) {
    throw new MailRunnerInputError(
      `DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT "${recipient}" looks like a fixture/demo/example address; live-mode mail acceptance requires a real, operator-authorized test mailbox, not a placeholder.`,
    );
  }
}

export function validateMailRunnerInputs(env: MailRunnerEnv): MailRunnerConfig {
  const candidateSha = requireString(
    env.DRTS_CANDIDATE_SHA,
    "DRTS_CANDIDATE_SHA",
  );
  if (!CANDIDATE_SHA_PATTERN.test(candidateSha)) {
    throw new MailRunnerInputError(
      `DRTS_CANDIDATE_SHA must be a full 40-character lowercase commit SHA, got: "${candidateSha}"`,
    );
  }
  const workflowSha = requireString(env.WORKFLOW_SHA, "WORKFLOW_SHA");

  const allowedTargets = requireCsv(
    env.DRTS_LIVE_MAIL_ALLOWED_TARGETS,
    "DRTS_LIVE_MAIL_ALLOWED_TARGETS",
  ).map((origin) => origin.replace(/\/$/, ""));
  const apiOrigin = requireAllowedOrigin(
    env.DRTS_LIVE_MAIL_API_ORIGIN,
    "DRTS_LIVE_MAIL_API_ORIGIN",
    allowedTargets,
  );

  const authorized = env.DRTS_LIVE_MAIL_TEST_AUTHORIZED?.trim();
  if (authorized !== "true") {
    throw new MailRunnerInputError(
      'DRTS_LIVE_MAIL_TEST_AUTHORIZED must equal "true"',
    );
  }

  const roleSessionToken = requireString(
    env.DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN,
    "DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN",
  );
  const tenantId = requireString(
    env.DRTS_LIVE_MAIL_TEST_TENANT_ID,
    "DRTS_LIVE_MAIL_TEST_TENANT_ID",
  );
  const authorizedRecipient = requireString(
    env.DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT,
    "DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT",
  );
  assertNotFixtureRecipient(authorizedRecipient);
  const invitationRoleCode = requireString(
    env.DRTS_LIVE_MAIL_INVITATION_ROLE_CODE,
    "DRTS_LIVE_MAIL_INVITATION_ROLE_CODE",
  );

  const pollTimeoutMs = optionalPositiveInteger(
    env.DRTS_LIVE_MAIL_POLL_TIMEOUT_MS,
    "DRTS_LIVE_MAIL_POLL_TIMEOUT_MS",
    60_000,
  );
  const pollIntervalMs = optionalPositiveInteger(
    env.DRTS_LIVE_MAIL_POLL_INTERVAL_MS,
    "DRTS_LIVE_MAIL_POLL_INTERVAL_MS",
    3_000,
  );

  return {
    candidateSha,
    workflowSha,
    apiOrigin,
    roleSessionToken,
    tenantId,
    authorizedRecipient,
    invitationRoleCode,
    pollTimeoutMs,
    pollIntervalMs,
  };
}

export interface IssueInvitationResult {
  deliveryId: string | null;
  invitationId: string;
  statusCode: number;
  deployedCandidateSha: string | null;
}

export type IssueInvitationFn = (
  config: MailRunnerConfig,
) => Promise<IssueInvitationResult>;

export interface DeliveryReceipt {
  status: "queued" | "sent" | "failed";
  providerMessageId: string | null;
  attempts: number;
  lastOutcome: string | null;
}

export type PollDeliveryReceiptFn = (
  config: MailRunnerConfig,
  deliveryId: string,
) => Promise<DeliveryReceipt>;

export interface MailRunnerDeps {
  issueInvitation: IssueInvitationFn;
  pollDeliveryReceipt: PollDeliveryReceiptFn;
  recorder: UatEvidenceRecorder;
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
  deps.recorder.setCandidateSha(config.candidateSha);
  deps.recorder.recordRole("tenant_admin_live");

  if (config.workflowSha !== config.candidateSha) {
    reasons.push(
      `Checked-out workflow SHA "${config.workflowSha}" does not match the requested candidate SHA "${config.candidateSha}".`,
    );
  }

  const issued = await deps.issueInvitation(config);
  deps.recorder.recordHttpCall({
    method: "POST",
    url: `${config.apiOrigin}/api/tenant/users`,
    statusCode: issued.statusCode,
    durationMs: 0,
    actorRole: "tenant_admin_live",
  });

  if (issued.statusCode !== 200 && issued.statusCode !== 201) {
    reasons.push(
      `Issuing the live test invitation returned HTTP ${issued.statusCode}, expected 200/201.`,
    );
  }
  if (issued.deployedCandidateSha !== config.candidateSha) {
    reasons.push(
      `Deployed candidate SHA header reported "${issued.deployedCandidateSha ?? "(missing)"}", expected "${config.candidateSha}".`,
    );
  }
  if (!issued.deliveryId) {
    reasons.push(
      "Invitation response carried no deliveryId; delivery was never durably enqueued (NotificationDeliveryService unavailable, or a synthetic error id was returned) -- cannot prove a real send occurred.",
    );
  }

  if (issued.deliveryId) {
    deps.recorder.recordResourceId("tenant_invitation", issued.invitationId);
    deps.recorder.recordResourceId("mail_delivery", issued.deliveryId);

    const receipt = await deps.pollDeliveryReceipt(config, issued.deliveryId);
    deps.recorder.recordHttpCall({
      method: "GET",
      url: `${config.apiOrigin}/api/tenant/mail-deliveries/${issued.deliveryId}`,
      statusCode: 200,
      durationMs: 0,
      actorRole: "tenant_admin_live",
    });

    if (receipt.status !== "sent") {
      reasons.push(
        `Mail delivery ${issued.deliveryId} did not reach status "sent" within the poll window (last observed status: "${receipt.status}", attempts=${receipt.attempts}, lastOutcome=${receipt.lastOutcome ?? "(none)"}).`,
      );
    }
    if (receipt.status === "sent" && !receipt.providerMessageId) {
      reasons.push(
        `Mail delivery ${issued.deliveryId} reports status "sent" but has no providerMessageId -- cannot prove a real provider acknowledgement was captured.`,
      );
    }
  }

  deps.recorder.recordLiveLimitation(
    "approval-timeout reminder mail flow",
    "This runner only exercises the tenant-invitation send path. The approval-timeout reminder flow is read back through the same GET tenant/mail-deliveries/:deliveryId endpoint, but has no dedicated send trigger wired into this runner yet.",
  );
  deps.recorder.recordLiveLimitation(
    "received-content verification inside the authorized test mailbox",
    "This runner proves provider acceptance (SMTP DATA acknowledgement + providerMessageId) via the deployed readback API only. It does not itself connect to the authorized test mailbox over IMAP/Gmail API to confirm the message actually arrived with real content; that requires separate read credentials for the authorized mailbox that are not wired into this runner.",
  );

  for (const reason of reasons) {
    deps.recorder.recordError(reason);
  }

  const status: "passed" | "failed" =
    reasons.length === 0 ? "passed" : "failed";
  const evidence = deps.recorder.finalize(status);
  return { status, reasons, evidence };
}

async function realIssueInvitation(
  config: MailRunnerConfig,
): Promise<IssueInvitationResult> {
  const res = await fetch(new URL("/api/tenant/users", config.apiOrigin), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.roleSessionToken}`,
      "x-tenant-id": config.tenantId,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: config.authorizedRecipient,
      displayName: "SR-LIVE-MAIL-001 live acceptance",
      roleCode: config.invitationRoleCode,
    }),
  });
  const deployedCandidateSha = res.headers.get("x-drts-candidate-sha");
  const body = (await res.json().catch(() => null)) as {
    data?: { invitationId?: string; deliveryId?: string | null };
  } | null;
  const invitation = body?.data ?? null;
  return {
    deliveryId: invitation?.deliveryId ?? null,
    invitationId: invitation?.invitationId ?? "",
    statusCode: res.status,
    deployedCandidateSha,
  };
}

async function realPollDeliveryReceipt(
  config: MailRunnerConfig,
  deliveryId: string,
): Promise<DeliveryReceipt> {
  const deadline = Date.now() + config.pollTimeoutMs;
  let last: DeliveryReceipt = {
    status: "queued",
    providerMessageId: null,
    attempts: 0,
    lastOutcome: null,
  };
  while (Date.now() < deadline) {
    const res = await fetch(
      new URL(`/api/tenant/mail-deliveries/${deliveryId}`, config.apiOrigin),
      {
        headers: {
          authorization: `Bearer ${config.roleSessionToken}`,
          "x-tenant-id": config.tenantId,
        },
      },
    );
    if (res.ok) {
      const body = (await res.json()) as {
        data?: {
          status?: "queued" | "sent" | "failed";
          attempts?: Array<{
            outcome?: string;
            acknowledgement?: { providerMessageId?: string | null } | null;
          }>;
        };
      };
      const receipt = body.data;
      const lastAttempt =
        receipt?.attempts?.[receipt.attempts.length - 1] ?? null;
      last = {
        status: receipt?.status ?? "queued",
        providerMessageId:
          lastAttempt?.acknowledgement?.providerMessageId ?? null,
        attempts: receipt?.attempts?.length ?? 0,
        lastOutcome: lastAttempt?.outcome ?? null,
      };
      if (last.status !== "queued") {
        return last;
      }
    }
    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }
  return last;
}

async function main(): Promise<void> {
  const config = validateMailRunnerInputs(process.env);
  const recorder = new UatEvidenceRecorder({
    taskId: "sr-live-mail-001",
    candidateSha: config.candidateSha,
  });
  const result = await runMailAcceptance(config, {
    issueInvitation: realIssueInvitation,
    pollDeliveryReceipt: realPollDeliveryReceipt,
    recorder,
  });

  const outputPath = resolve(
    process.env.DRTS_LIVE_MAIL_EVIDENCE_PATH?.trim() ||
      ".artifacts/live-mail-acceptance/evidence-mail.json",
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify(redactObject(result.evidence), null, 2),
    "utf-8",
  );

  console.log(`Mail acceptance status: ${result.status}`);
  for (const reason of result.reasons) {
    console.error(`  [FAIL] ${reason}`);
  }
  process.exitCode = result.status === "passed" ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(
      `Mail acceptance runner crashed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  });
}
