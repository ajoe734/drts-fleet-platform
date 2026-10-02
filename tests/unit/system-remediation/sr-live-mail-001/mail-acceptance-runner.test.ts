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

function baseEnv(overrides: Partial<MailRunnerEnv> = {}): MailRunnerEnv {
  return {
    DRTS_CANDIDATE_SHA: VALID_SHA,
    WORKFLOW_SHA: VALID_SHA,
    DRTS_LIVE_MAIL_ALLOWED_TARGETS: "https://api.dev.drts-fleet.example.com",
    DRTS_LIVE_MAIL_API_ORIGIN: "https://api.dev.drts-fleet.example.com",
    DRTS_LIVE_MAIL_TEST_AUTHORIZED: "true",
    DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN: "real-deployment-issued-session-token",
    DRTS_LIVE_MAIL_TEST_TENANT_ID: "tenant-live-uat-001",
    DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT: "ops-uat@realdomain.test",
    DRTS_LIVE_MAIL_INVITATION_ROLE_CODE: "tenant_viewer",
    ...overrides,
  };
}

function passingIssueResult(candidateSha: string): IssueInvitationResult {
  return {
    deliveryId: "11111111-1111-1111-1111-111111111111",
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
  };
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

  it("passes when invitation issuance and delivery readback both succeed with a provider message id", async () => {
    const issueInvitation = vi
      .fn()
      .mockResolvedValue(passingIssueResult(config.candidateSha));
    const pollDeliveryReceipt = vi.fn().mockResolvedValue(sentReceipt());

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("passed");
    expect(result.reasons).toEqual([]);
    expect(issueInvitation).toHaveBeenCalledWith(config);
    expect(pollDeliveryReceipt).toHaveBeenCalledWith(
      config,
      "11111111-1111-1111-1111-111111111111",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      result.evidence.unimplementedLiveSurfaces.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("fails when the checked-out workflow SHA does not match the candidate SHA (wrong SHA)", async () => {
    const drifted: MailRunnerConfig = { ...config, workflowSha: OTHER_SHA };
    const issueInvitation = vi
      .fn()
      .mockResolvedValue(passingIssueResult(drifted.candidateSha));
    const pollDeliveryReceipt = vi.fn().mockResolvedValue(sentReceipt());

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
    const issueInvitation = vi
      .fn()
      .mockResolvedValue({
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
    const issueInvitation = vi
      .fn()
      .mockResolvedValue({
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
    const pollDeliveryReceipt = vi
      .fn()
      .mockResolvedValue({
        status: "queued",
        providerMessageId: null,
        attempts: 3,
        lastOutcome: "started",
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
    const pollDeliveryReceipt = vi
      .fn()
      .mockResolvedValue({
        status: "failed",
        providerMessageId: null,
        attempts: 1,
        lastOutcome: "failed",
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
    const pollDeliveryReceipt = vi
      .fn()
      .mockResolvedValue({
        status: "sent",
        providerMessageId: null,
        attempts: 1,
        lastOutcome: "sent",
      });

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/no providerMessageId/);
  });

  it("records redacted evidence and never leaks the raw role session token into evidence", async () => {
    const secretToken = config.roleSessionToken;
    const issueInvitation = vi
      .fn()
      .mockImplementation(async (cfg: MailRunnerConfig) => {
        // Simulate a buggy transport that echoed the bearer token into a log line
        // captured as part of the result -- evidence must still redact it.
        recorder.recordConsole(
          "info",
          `Authorization: Bearer ${cfg.roleSessionToken}`,
        );
        return passingIssueResult(cfg.candidateSha);
      });
    const pollDeliveryReceipt = vi.fn().mockResolvedValue(sentReceipt());

    const result = await runMailAcceptance(config, {
      issueInvitation,
      pollDeliveryReceipt,
      recorder,
    });

    const serialized = JSON.stringify(result.evidence);
    expect(serialized).not.toContain(secretToken);
  });
});
