import { afterEach, describe, expect, it, vi } from "vitest";
import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import { toApiSuccessEnvelope } from "../../../../apps/api/src/common/api-envelope";
import {
  prepareTaskInvitation,
  observeApproval,
  verifyExpiredInvitation,
  exerciseInvitationLifecycle,
} from "../../../e2e/system-remediation/sr-live-mail-001/live-profiles";
import { validateMailRunnerInputs } from "../../../e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner";
import * as mailbox from "../../../e2e/system-remediation/sr-live-mail-001/mailbox-observer";
import { renderApprovalNotificationTemplate } from "../../../../apps/api/src/modules/audit-notification/templates/approval-notification.templates";
import { UatEvidenceRecorder } from "../../../e2e/system-remediation/shared";

const sha = "a".repeat(40);
const tenantId = "10000000-0000-0000-0000-000000000201";
const origin = "https://drts-dev-api-r6ykdme3wa-uc.a.run.app";
const userId = "tenant_user_00000000-0000-0000-0000-000000000001";
const deliveryId = "00000000-0000-0000-0000-000000000002";
const requestId = "approval-request-00000000-0000-0000-0000-000000000003";
const config = validateMailRunnerInputs({
  BASE_SHA: sha,
  WORKFLOW_SHA: sha,
  DRTS_CANDIDATE_SHA: sha,
  DRTS_LIVE_MAIL_API_ORIGIN: origin,
  DRTS_LIVE_MAIL_ALLOWED_TARGETS: origin,
  DRTS_LIVE_MAIL_TEST_AUTHORIZED: "true",
  DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
  DRTS_LIVE_MAIL_TEST_TENANT_ID: tenantId,
  DRTS_LIVE_MAIL_TENANT_ACTOR_ID: "10000000-0000-0000-0000-000000000901",
  DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN: "session",
  DRTS_LIVE_MAIL_STEP_UP_REFERENCE: "proof",
  DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT: "unit+invite@gmail.com",
  DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT:
    "sr-live-mail-001-negative@reserved.invalid",
  DRTS_LIVE_MAIL_INVITATION_ROLE_CODE: "tenant_viewer",
});
const user = {
  userId,
  tenantId,
  email: config.authorizedRecipient,
  displayName: "SR-LIVE-MAIL-001 live acceptance",
  roleCode: "tenant_viewer",
  status: "invited",
};
const recorder = () =>
  new UatEvidenceRecorder({ taskId: "sr-live-mail-001", baseSha: sha });
const wire = (data: unknown, status = 200) =>
  new Response(JSON.stringify(deepToSnakeCase(toApiSuccessEnvelope(data))), {
    status,
    headers: { "x-drts-candidate-sha": sha },
  });
function receipt(id = deliveryId, queuedAt = "2026-10-01T01:00:00Z") {
  return {
    deliveryId: id,
    tenantId,
    status: "sent",
    queuedAt,
    attempts: [
      {
        outcome: "sent",
        acknowledgement: { providerMessageId: "gmail-queue-id" },
      },
    ],
  };
}
afterEach(() => vi.restoreAllMocks());

describe("repeatable fixed-alias invitation profile", () => {
  it("resends a task-owned pending viewer instead of creating a duplicate user", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(wire({ items: [user] }))
      .mockResolvedValueOnce(
        wire(
          {
            invitationId: "invitation_real",
            deliveryId,
            expiresAt: "2026-10-03T01:00:00Z",
            acceptedAt: null,
            revokedAt: null,
          },
          202,
        ),
      );
    const result = await prepareTaskInvitation(
      config,
      config.authorizedRecipient,
      recorder(),
    );
    expect(result).toMatchObject({ userId, deliveryId, statusCode: 202 });
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(
      `/users/${userId}/invitation/resend`,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    { displayName: "Another owner" },
    { roleCode: "tenant_admin" },
    { tenantId: "other-tenant" },
  ])(
    "refuses to repurpose an existing alias owned outside this task: %j",
    async (override) => {
      const fetcher = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(wire({ items: [{ ...user, ...override }] }));
      await expect(
        prepareTaskInvitation(config, config.authorizedRecipient, recorder()),
      ).rejects.toThrow(/task-owned/);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("checks the correct role-change proof before resetting only the task's accepted viewer", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(wire({ items: [{ ...user, status: "active" }] }))
      .mockResolvedValueOnce(
        wire({
          required: true,
          actionId: "tenant:users:role:update",
          stepUpReference: "role-proof",
        }),
      )
      .mockResolvedValueOnce(wire(user))
      .mockResolvedValueOnce(
        wire({
          invitationId: "invitation_real",
          deliveryId,
          expiresAt: "2026-10-03T01:00:00Z",
        }),
      );
    await prepareTaskInvitation(config, config.authorizedRecipient, recorder());
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({
      headers: { "x-drts-step-up-reference": "role-proof" },
      body: JSON.stringify({ roleCode: "tenant_viewer", status: "invited" }),
    });
  });
  it("stops before acceptance if a replacement receipt has no real provider acknowledgement", async () => {
    const observe = vi.spyOn(mailbox, "observeMailbox");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        wire({
          invitationId: "new",
          deliveryId,
          expiresAt: "2026-10-03T01:00:00Z",
        }),
      )
      .mockResolvedValueOnce(wire({ ...receipt(), attempts: [] }));
    await expect(
      exerciseInvitationLifecycle(
        config,
        {
          userId,
          deliveryId: "old",
          invitationId: "old",
          statusCode: 201,
          deployedCandidateSha: sha,
        },
        recorder(),
      ),
    ).rejects.toThrow(/provider/);
    expect(observe).not.toHaveBeenCalled();
  });
});

describe("real expiry across runs", () => {
  const inputs = {
    DRTS_LIVE_MAIL_EXPIRY_USER_ID: userId,
    DRTS_LIVE_MAIL_EXPIRY_DELIVERY_ID: deliveryId,
  };
  const expiresAt = "2026-10-01T23:59:59Z";
  function mockExpiry(revokedDelivery = deliveryId) {
    vi.spyOn(mailbox, "observeMailbox").mockResolvedValue({
      acceptance: "expired",
      acceptance_status: 403,
      acceptance_duration_ms: 7,
      expires_at: expiresAt,
    });
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(wire({ items: [user] }))
      .mockResolvedValueOnce(wire(receipt(deliveryId, "2026-10-01T00:00:00Z")))
      .mockResolvedValueOnce(
        wire({
          invitationId: "invitation_real",
          deliveryId: revokedDelivery,
          acceptedAt: null,
          revokedAt: "2026-10-02T01:00:00Z",
          expiresAt,
        }),
      );
  }
  it("uses the real receipt view (without private idempotency_key) and pending-only revoke identity", async () => {
    mockExpiry();
    expect(await verifyExpiredInvitation(config, inputs, recorder())).toBe(
      true,
    );
  });
  it("does not call a revoked/superseded code an expiry success", async () => {
    mockExpiry("different-delivery");
    await expect(
      verifyExpiredInvitation(config, inputs, recorder()),
    ).rejects.toThrow(/still-pending/);
  });
  it("keeps an omitted expiry observation explicitly pending", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    expect(await verifyExpiredInvitation(config, {}, recorder())).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("approval content readback from real business contracts", () => {
  const timeoutAt = "2026-10-02T13:00:00Z";
  function mockApproval(
    email = "unit+approve@gmail.com",
    includeReminder = true,
  ) {
    const templates = includeReminder
      ? ["new_request", "approaching_timeout", "approved"]
      : ["new_request", "approved"];
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const path = String(input);
        if (path.includes("/approval-requests/"))
          return wire({
            approvalRequestId: requestId,
            tenantId,
            status: "approved",
            bookingId: "booking-real",
            orderId: "order-real",
            timeoutAt,
            resolvedApproverUserIds: [userId],
          });
        if (path.endsWith("/users"))
          return wire({ items: [{ ...user, email, status: "active" }] });
        if (path.endsWith("/audit"))
          return wire({
            items: templates.map((template) => ({
              tenantId,
              resourceId: requestId,
              actionName: `approval_notification.${template}`,
              newValuesSummary: {
                bookingId: "booking-real",
                orderId: "order-real",
                templateKey: template,
                email: { recipients: [{ userId, deliveryId }] },
              },
            })),
          });
        return wire(receipt());
      });
    return fetcher;
  }
  it("requires actual new-request, reminder and decision messages using production template subjects", async () => {
    mockApproval();
    const observe = vi
      .spyOn(mailbox, "observeMailbox")
      .mockResolvedValue({ matched_content: true });
    await observeApproval(config, requestId, recorder());
    expect(observe).toHaveBeenCalledTimes(3);
    for (const [index, template] of (
      ["new_request", "approaching_timeout", "approved"] as const
    ).entries()) {
      const context = {
        recipientDisplayName: user.displayName,
        bookingId: "booking-real",
        orderId: "order-real",
        approvalRequestId: requestId,
        timeoutAt,
      };
      const zh = renderApprovalNotificationTemplate(template, "zh", context);
      const en = renderApprovalNotificationTemplate(template, "en", context);
      expect(observe.mock.calls[index]?.[2].subject).toBe(
        `${zh.subject} / ${en.subject}`,
      );
      expect(observe.mock.calls[index]?.[2].required_text).toContain(
        `Approval Request ID: ${requestId}`,
      );
    }
  });
  it("rejects another recipient before touching IMAP", async () => {
    mockApproval("someone@example.com");
    const observe = vi.spyOn(mailbox, "observeMailbox");
    await expect(
      observeApproval(config, requestId, recorder()),
    ).rejects.toThrow(/mailbox grant/);
    expect(observe).not.toHaveBeenCalled();
  });
  it("never treats a missing reminder as successful full approval coverage", async () => {
    mockApproval("unit+approve@gmail.com", false);
    vi.spyOn(mailbox, "observeMailbox").mockResolvedValue({
      matched_content: true,
    });
    await expect(
      observeApproval(config, requestId, recorder()),
    ).rejects.toThrow(/notification audit/);
  });
});
