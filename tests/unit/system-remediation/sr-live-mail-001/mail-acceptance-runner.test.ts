import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MailRunnerInputError,
  runMailAcceptance,
  validateMailRunnerInputs,
  type DeliveryReceipt,
  type IssueInvitationResult,
  type MailRunnerConfig,
  type MailRunnerEnv,
} from "../../../e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner";
import { UatEvidenceRecorder } from "../../../e2e/system-remediation/shared";

const VALID_SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const POSITIVE_DELIVERY_ID = "11111111-1111-1111-1111-111111111111";
const NEGATIVE_DELIVERY_ID = "99999999-9999-9999-9999-999999999999";

function baseEnv(overrides: Partial<MailRunnerEnv> = {}): MailRunnerEnv {
  return {
    DRTS_CANDIDATE_SHA: VALID_SHA,
    WORKFLOW_SHA: VALID_SHA,
    DRTS_LIVE_MAIL_ALLOWED_TARGETS: "https://api.dev.drts-fleet.example.com",
    DRTS_LIVE_MAIL_API_ORIGIN: "https://api.dev.drts-fleet.example.com",
    DRTS_LIVE_MAIL_TEST_AUTHORIZED: "true",
    DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN: "real-deployment-issued-session-token",
    DRTS_LIVE_MAIL_STEP_UP_REFERENCE: "stepup_real1234",
    DRTS_LIVE_MAIL_TEST_TENANT_ID: "tenant-live-uat-001",
    DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT: "ops-uat@realdomain.test",
    DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT:
      "sr-live-mail-001-negative@reserved.invalid",
    DRTS_LIVE_MAIL_INVITATION_ROLE_CODE: "tenant_viewer",
    ...overrides,
  };
}

function passingIssueResult(
  candidateSha: string,
  deliveryId: string = POSITIVE_DELIVERY_ID,
): IssueInvitationResult {
  return {
    deliveryId,
    invitationId: "22222222-2222-2222-2222-222222222222",
    statusCode: 201,
    deployedCandidateSha: candidateSha,
  };
}

function sentReceipt(): DeliveryReceipt {
  return {
    status: "sent",
    providerMessageId: "queued-as-abc123",
    attempts: 1,
    lastOutcome: "sent",
    errorCode: null,
  };
}

function failedAllowlistReceipt(): DeliveryReceipt {
  return {
    status: "failed",
    providerMessageId: null,
    attempts: 1,
    lastOutcome: "failed",
    errorCode: "SMTP_RECIPIENT_NOT_ALLOWLISTED",
  };
}

// Shared happy-path deps: dispatches on the recipient/deliveryId so a single
// mock pair can answer both the positive and negative phases correctly.
function happyPathDeps(candidateSha: string) {
  const issueInvitation = vi
    .fn()
    .mockImplementation(async (_config: MailRunnerConfig, recipient: string) =>
      recipient === "ops-uat@realdomain.test"
        ? passingIssueResult(candidateSha, POSITIVE_DELIVERY_ID)
        : passingIssueResult(candidateSha, NEGATIVE_DELIVERY_ID),
    );
  const pollDeliveryReceipt = vi
    .fn()
    .mockImplementation(
      async (_config: MailRunnerConfig, deliveryId: string) =>
        deliveryId === POSITIVE_DELIVERY_ID
          ? sentReceipt()
          : failedAllowlistReceipt(),
    );
  return { issueInvitation, pollDeliveryReceipt };
}

describe("validateMailRunnerInputs", () => {
  it("accepts a fully valid configuration", () => {
    const config = validateMailRunnerInputs(baseEnv());
    expect(config.candidateSha).toBe(VALID_SHA);
    expect(config.apiOrigin).toBe("https://api.dev.drts-fleet.example.com");
    expect(config.pollTimeoutMs).toBe(60_000);
    expect(config.pollIntervalMs).toBe(3_000);
  });

  it("fails closed when DRTS_CANDIDATE_SHA is missing", () => {
    const env = baseEnv({ DRTS_CANDIDATE_SHA: undefined });
    expect(() => validateMailRunnerInputs(env)).toThrow(MailRunnerInputError);
  });

  it("rejects a malformed / non-40-hex candidate SHA (wrong SHA)", () => {
    const env = baseEnv({ DRTS_CANDIDATE_SHA: "not-a-real-sha" });
    expect(() => validateMailRunnerInputs(env)).toThrow(/40-character/);
  });

  it("rejects a target origin outside the explicit allowlist (wrong target)", () => {
    const env = baseEnv({
      DRTS_LIVE_MAIL_API_ORIGIN: "https://attacker.example.com",
    });
    expect(() => validateMailRunnerInputs(env)).toThrow(
      /DRTS_LIVE_MAIL_ALLOWED_TARGETS/,
    );
  });

  it("fails closed when test authorization is absent (absent authorization)", () => {
    const env = baseEnv({ DRTS_LIVE_MAIL_TEST_AUTHORIZED: undefined });
    expect(() => validateMailRunnerInputs(env)).toThrow(
      /DRTS_LIVE_MAIL_TEST_AUTHORIZED must equal "true"/,
    );
  });

  it("fails closed when test authorization is any value other than the literal string true", () => {
    const env = baseEnv({ DRTS_LIVE_MAIL_TEST_AUTHORIZED: "yes" });
    expect(() => validateMailRunnerInputs(env)).toThrow(/must equal "true"/);
  });

  it("fails closed when the role session token is absent (absent authorization)", () => {
    const env = baseEnv({ DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN: undefined });
    expect(() => validateMailRunnerInputs(env)).toThrow(
      /DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN/,
    );
  });

  it("fails closed when the step-up reference is absent (absent authorization)", () => {
    const env = baseEnv({ DRTS_LIVE_MAIL_STEP_UP_REFERENCE: undefined });
    expect(() => validateMailRunnerInputs(env)).toThrow(
      /DRTS_LIVE_MAIL_STEP_UP_REFERENCE/,
    );
  });

  it("rejects a recipient that is not a valid single email address", () => {
    const env = baseEnv({
      DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT: "not-an-email",
    });
    expect(() => validateMailRunnerInputs(env)).toThrow(
      /not a valid single email address/,
    );
  });

  it("rejects a fixture/demo/example recipient even if syntactically valid (wrong recipient)", () => {
    const env = baseEnv({
      DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT: "person@example.test",
    });
    expect(() => validateMailRunnerInputs(env)).toThrow(
      /fixture\/demo\/example address/,
    );
  });

  it("rejects a malformed non-allowlisted recipient", () => {
    const env = baseEnv({
      DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT: "not-an-email",
    });
    expect(() => validateMailRunnerInputs(env)).toThrow(
      /DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT/,
    );
  });

  it("rejects a non-integer poll timeout override", () => {
    const env = baseEnv({ DRTS_LIVE_MAIL_POLL_TIMEOUT_MS: "soon" });
    expect(() => validateMailRunnerInputs(env)).toThrow(/positive integer/);
  });
});

describe("runMailAcceptance", () => {
  let recorder: UatEvidenceRecorder;
  let config: MailRunnerConfig;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    config = validateMailRunnerInputs(baseEnv());
    recorder = new UatEvidenceRecorder({
      taskId: "sr-live-mail-001",
      candidateSha: config.candidateSha,
    });
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error(
        "runMailAcceptance must not contact the network directly; use injected deps.",
      );
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("passes when the positive send/readback and the negative allowlist rejection both succeed", async () => {
    const { issueInvitation, pollDeliveryReceipt } = happyPathDeps(
      config.candidateSha,
    );

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("passed");
    expect(result.reasons).toEqual([]);
    expect(issueInvitation).toHaveBeenNthCalledWith(
      1,
      config,
      config.authorizedRecipient,
    );
    expect(issueInvitation).toHaveBeenNthCalledWith(
      2,
      config,
      config.nonAllowlistedRecipient,
    );
    expect(pollDeliveryReceipt).toHaveBeenCalledWith(
      config,
      POSITIVE_DELIVERY_ID,
    );
    expect(pollDeliveryReceipt).toHaveBeenCalledWith(
      config,
      NEGATIVE_DELIVERY_ID,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      result.evidence.unimplementedLiveSurfaces.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("fails when the checked-out workflow SHA does not match the candidate SHA (wrong SHA)", async () => {
    const drifted: MailRunnerConfig = { ...config, workflowSha: OTHER_SHA };
    const { issueInvitation, pollDeliveryReceipt } = happyPathDeps(
      drifted.candidateSha,
    );

    const result = await runMailAcceptance(drifted, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(
      /does not match the requested candidate SHA/,
    );
  });

  it("fails when invitation issuance returns a non-2xx status", async () => {
    const issueInvitation = vi.fn().mockResolvedValue({
      ...passingIssueResult(config.candidateSha),
      statusCode: 403,
    });
    const pollDeliveryReceipt = vi.fn().mockResolvedValue(sentReceipt());

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/HTTP 403/);
    expect(pollDeliveryReceipt).toHaveBeenCalled();
  });

  it("fails when the deployed candidate SHA header does not match the requested candidate (wrong target/deploy)", async () => {
    const issueInvitation = vi
      .fn()
      .mockResolvedValue(passingIssueResult(OTHER_SHA));
    const pollDeliveryReceipt = vi.fn().mockResolvedValue(sentReceipt());

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(
      /Deployed candidate SHA header reported/,
    );
  });

  it("fails and skips readback when no deliveryId was ever enqueued (unavailable provider)", async () => {
    const issueInvitation = vi.fn().mockResolvedValue({
      ...passingIssueResult(config.candidateSha),
      deliveryId: null,
    });
    const pollDeliveryReceipt = vi.fn();

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/no deliveryId/);
    expect(pollDeliveryReceipt).not.toHaveBeenCalled();
  });

  it("fails when the delivery never reaches status sent within the poll window (skip cannot pass)", async () => {
    const issueInvitation = vi
      .fn()
      .mockResolvedValue(passingIssueResult(config.candidateSha));
    const pollDeliveryReceipt = vi.fn().mockResolvedValue({
      status: "queued",
      providerMessageId: null,
      attempts: 3,
      lastOutcome: "started",
      errorCode: null,
    });

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/did not reach status "sent"/);
  });

  it("fails when status is failed, never fabricating success (real failure path)", async () => {
    const issueInvitation = vi
      .fn()
      .mockResolvedValue(passingIssueResult(config.candidateSha));
    const pollDeliveryReceipt = vi.fn().mockResolvedValue({
      status: "failed",
      providerMessageId: null,
      attempts: 1,
      lastOutcome: "failed",
      errorCode: "SMTP_SEND_FAILED",
    });

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/last observed status: "failed"/);
  });

  it("fails when status is sent but no providerMessageId was captured (cannot prove real receipt)", async () => {
    const issueInvitation = vi
      .fn()
      .mockResolvedValue(passingIssueResult(config.candidateSha));
    const pollDeliveryReceipt = vi.fn().mockResolvedValue({
      status: "sent",
      providerMessageId: null,
      attempts: 1,
      lastOutcome: "sent",
      errorCode: null,
    });

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/no providerMessageId/);
  });

  it("fails when the negative-path recipient is unexpectedly accepted as sent (allowlist gate bypassed)", async () => {
    const { issueInvitation } = happyPathDeps(config.candidateSha);
    const pollDeliveryReceipt = vi.fn().mockResolvedValue(sentReceipt());

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(
      /did not reach status "failed".*allowlist gate must reject/,
    );
  });

  it("fails when the negative-path delivery fails for a different reason than the allowlist gate", async () => {
    const { issueInvitation } = happyPathDeps(config.candidateSha);
    const pollDeliveryReceipt = vi
      .fn()
      .mockImplementation(
        async (_config: MailRunnerConfig, deliveryId: string) =>
          deliveryId === POSITIVE_DELIVERY_ID
            ? sentReceipt()
            : {
                status: "failed",
                providerMessageId: null,
                attempts: 1,
                lastOutcome: "failed",
                errorCode: "SMTP_SEND_FAILED",
              },
      );

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(
      /expected "SMTP_RECIPIENT_NOT_ALLOWLISTED"/,
    );
  });

  it("records redacted evidence and never leaks the raw role session token into evidence", async () => {
    const secretToken = config.roleSessionToken;
    const { pollDeliveryReceipt } = happyPathDeps(config.candidateSha);
    const issueInvitation = vi
      .fn()
      .mockImplementation(async (cfg: MailRunnerConfig, recipient: string) => {
        // Simulate a buggy transport that echoed the bearer token into a log line
        // captured as part of the result -- evidence must still redact it.
        recorder.recordConsole(
          "info",
          `Authorization: Bearer ${cfg.roleSessionToken}`,
        );
        return recipient === cfg.authorizedRecipient
          ? passingIssueResult(cfg.candidateSha, POSITIVE_DELIVERY_ID)
          : passingIssueResult(cfg.candidateSha, NEGATIVE_DELIVERY_ID);
      });

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    const serialized = JSON.stringify(result.evidence);
    expect(serialized).not.toContain(secretToken);
  });
});
