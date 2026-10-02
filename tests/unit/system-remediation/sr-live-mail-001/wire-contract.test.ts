import { afterEach, describe, expect, it, vi } from "vitest";
import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import { toApiSuccessEnvelope } from "../../../../apps/api/src/common/api-envelope";
import {
  mintTenantAdminSession,
  validateMailSessionInputs,
} from "../../../e2e/system-remediation/sr-live-mail-001/session-bootstrap";
import {
  realIssueInvitation,
  realPollDeliveryReceipt,
  runMailAcceptance,
  validateMailRunnerInputs,
} from "../../../e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner";
import { UatEvidenceRecorder } from "../../../e2e/system-remediation/shared";

const sha = "a".repeat(40);
const tenantId = "10000000-0000-0000-0000-000000000201";
const actorId = "10000000-0000-0000-0000-000000000901";
const origin = "https://drts-dev-api-r6ykdme3wa-uc.a.run.app";
const env = {
  DRTS_CANDIDATE_SHA: sha,
  WORKFLOW_SHA: sha,
  BASE_SHA: sha,
  DRTS_LIVE_MAIL_API_ORIGIN: origin,
  DRTS_LIVE_MAIL_ALLOWED_TARGETS: origin,
  DRTS_LIVE_MAIL_TEST_AUTHORIZED: "true",
  DRTS_LIVE_MAIL_TEST_TENANT_ID: tenantId,
  DRTS_LIVE_MAIL_TENANT_ACTOR_ID: actorId,
  DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
  DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN: "test-session",
  DRTS_LIVE_MAIL_STEP_UP_REFERENCE: "test-proof",
  DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT: "unit+invite@gmail.com",
  DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT:
    "sr-live-mail-001-negative@reserved.invalid",
  DRTS_LIVE_MAIL_INVITATION_ROLE_CODE: "tenant_viewer",
};
function wire(data: unknown) {
  return new Response(
    JSON.stringify(deepToSnakeCase(toApiSuccessEnvelope(data))),
    {
      status: 200,
      headers: { "x-drts-candidate-sha": sha },
    },
  );
}
afterEach(() => vi.restoreAllMocks());

describe("real mail HTTP adapters, using the production response serializer", () => {
  it("verifies snake_case identity and reads the real step-up proof", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "session" }), {
          headers: { "x-drts-candidate-sha": sha },
        }),
      )
      .mockResolvedValueOnce(
        wire({
          active: true,
          identity: {
            realm: "tenant",
            actorType: "tenant_admin",
            actorId,
            tenantId,
            roles: ["tenant_admin"],
          },
        }),
      )
      .mockResolvedValueOnce(
        wire({
          required: true,
          actionId: "tenant:users:create",
          stepUpReference: "proof",
        }),
      );
    const result = await mintTenantAdminSession(
      validateMailSessionInputs(env),
      {
        fetch: fetchMock as typeof fetch,
        readGoogleIdToken: () => "assertion",
        mask: vi.fn(),
      },
    );
    expect(result.stepUpReference).toBe("proof");
  });

  it("reads data.invitation.delivery_id from createTenantUser's actual envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      wire({
        userId: "tenant_user_1",
        invitation: { invitationId: "invitation_1", deliveryId: "delivery_1" },
      }),
    );
    const result = await realIssueInvitation(
      validateMailRunnerInputs(env),
      env.DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT,
    );
    expect(result).toMatchObject({
      invitationId: "invitation_1",
      deliveryId: "delivery_1",
    });
  });

  it("reads the provider receipt from the real wire contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      wire({
        deliveryId: "delivery_1",
        tenantId,
        status: "sent",
        queuedAt: "2026-10-02T01:00:00Z",
        sentAt: "2026-10-02T01:00:01Z",
        nextAttemptAt: null,
        attempts: [
          {
            attemptId: "attempt_1",
            attemptNo: 1,
            startedAt: "2026-10-02T01:00:00Z",
            finishedAt: "2026-10-02T01:00:01Z",
            outcome: "sent",
            retryable: false,
            errorCode: null,
            acknowledgement: {
              provider: "smtp",
              providerMessageId: "provider-receipt-1",
              response: "250 masked",
              acceptedAt: "2026-10-02T01:00:01Z",
            },
          },
        ],
      }),
    );
    expect(
      await realPollDeliveryReceipt(
        validateMailRunnerInputs(env),
        "delivery_1",
      ),
    ).toMatchObject({
      status: "sent",
      providerMessageId: "provider-receipt-1",
    });
  });

  it("does not send any mail when the checkout SHA is wrong", async () => {
    const issueInvitation = vi
      .fn()
      .mockResolvedValue({
        statusCode: 500,
        deliveryId: null,
        deployedCandidateSha: sha,
      });
    await runMailAcceptance(
      { ...validateMailRunnerInputs(env), workflowSha: "b".repeat(40) },
      {
        issueInvitation,
        pollDeliveryReceipt: vi.fn(),
        recorder: new UatEvidenceRecorder({
          taskId: "sr-live-mail-001",
          baseSha: sha,
        }),
      },
    );
    expect(issueInvitation).not.toHaveBeenCalled();
  });
});
