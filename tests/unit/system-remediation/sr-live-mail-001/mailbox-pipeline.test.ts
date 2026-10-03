import * as childProcess from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapMailSession } from "../../../e2e/system-remediation/sr-live-mail-001/session-bootstrap";
import {
  realIssueInvitation,
  realPollDeliveryReceipt,
  runMailAcceptance,
  validateMailRunnerInputs,
} from "../../../e2e/system-remediation/sr-live-mail-001/mail-acceptance-runner";
import {
  observeInvitationMailbox,
  observeMailbox,
} from "../../../e2e/system-remediation/sr-live-mail-001/mailbox-observer";
import { UatEvidenceRecorder } from "../../../e2e/system-remediation/shared";
import { StepUpProofService } from "../../../../apps/api/src/common/auth/step-up-proof.service";
import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth/auth.types";
import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import { toApiSuccessEnvelope } from "../../../../apps/api/src/common/api-envelope";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});
const { spawn } =
  await vi.importActual<typeof import("node:child_process")>(
    "node:child_process",
  );
const sha = "a".repeat(40);
const origin = "https://drts-dev-api-r6ykdme3wa-uc.a.run.app";
const positiveId = "11111111-1111-1111-1111-111111111111";
const negativeId = "99999999-9999-9999-9999-999999999999";
const tenantId = "10000000-0000-0000-0000-000000000201";
const actorId = "10000000-0000-0000-0000-000000000901";

afterEach(() => vi.restoreAllMocks());
beforeEach(() => vi.clearAllMocks());

describe("bootstrap → runner → Python mailbox observer", () => {
  it.each([
    "mail.acceptance@workspace-mail.org",
    "o'neil+dev@MAIL.workspace-mail.org",
    "unit@gmail.com",
  ])(
    "observes both aliases without a mailbox-domain provider gate: %s",
    async (mailbox) => {
      const env: Record<string, string> = {
        BASE_SHA: sha,
        WORKFLOW_SHA: sha,
        DRTS_CANDIDATE_SHA: sha,
        GITHUB_ACTIONS: "true",
        GITHUB_ENV: "/unit/github-env",
        DEV_GCP_PROJECT_ID: "drts-dev-devcc-20260825",
        DRTS_LIVE_MAIL_TEST_AUTHORIZED: "true",
        DRTS_LIVE_MAIL_API_ORIGIN: origin,
        DRTS_LIVE_MAIL_ALLOWED_TARGETS: origin,
        DRTS_LIVE_MAIL_TEST_TENANT_ID: tenantId,
        DRTS_LIVE_MAIL_TENANT_ACTOR_ID: actorId,
        DRTS_LIVE_MAIL_INVITATION_ROLE_CODE: "tenant_viewer",
      };
      const identity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        realm: "tenant",
        actorType: "tenant_admin",
        actorId,
        tenantId,
        roles: ["tenant_admin"],
        scopes: [],
        roleFamilies: [],
        requestId: null,
        sessionId: "unit-session",
        authTime: new Date().toISOString(),
        amr: ["mfa"],
      };
      const proof = new StepUpProofService().createProof(identity, {
        actionId: "tenant:users:create",
      });
      const wire = (data: unknown) =>
        new Response(
          JSON.stringify(deepToSnakeCase(toApiSuccessEnvelope(data))),
          {
            status: 201,
            headers: { "x-drts-candidate-sha": sha },
          },
        );
      let invitationRecipient = "";
      const fetcher = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
          const path = new URL(String(url)).pathname;
          if (path === "/health") return wire({ status: "ok" });
          if (path === "/api/auth/token")
            return new Response(JSON.stringify({ token: "private-session" }), {
              headers: { "x-drts-candidate-sha": sha },
            });
          if (path === "/api/auth/session")
            return wire({ active: true, identity });
          if (path === "/api/identity/step-up-proofs") return wire(proof);
          if (path === "/api/tenant/users") {
            const { email } = JSON.parse(String(init?.body)) as {
              email: string;
            };
            const negative =
              email === "sr-live-mail-001-negative@reserved.invalid";
            if (!negative) invitationRecipient = email;
            return wire({
              userId: "unit-user",
              invitation: {
                invitationId: "unit-invitation",
                deliveryId: negative ? negativeId : positiveId,
              },
            });
          }
          if (path.startsWith("/api/tenant/mail-deliveries/")) {
            const deliveryId = path.split("/").at(-1);
            const negative = deliveryId === negativeId;
            return wire({
              deliveryId,
              tenantId,
              status: negative ? "failed" : "sent",
              attempts: [
                {
                  outcome: negative ? "failed" : "sent",
                  errorCode: negative ? "SMTP_RECIPIENT_NOT_ALLOWLISTED" : null,
                  acknowledgement: negative
                    ? null
                    : { providerMessageId: "unit-provider-receipt" },
                },
              ],
            });
          }
          throw new Error("Unexpected unit HTTP request");
        });
      await bootstrapMailSession(env, {
        fetch: fetcher,
        mask: vi.fn(),
        readMailbox: () => mailbox,
        assertions: () => ({ next: async () => "unit-assertion" }),
        appendEnvironment: (_path, value) => {
          const index = value.indexOf("=");
          env[value.slice(0, index)] = value.slice(index + 1).trimEnd();
        },
      });
      // Pass the actual bootstrap exports to the actual runner validator.
      const config = validateMailRunnerInputs(env);
      const spawnSpy = vi.mocked(childProcess.spawn).mockImplementation(((
        command: string,
        args: string[],
        options: childProcess.SpawnOptions,
      ) => {
        expect(command).toBe("python3");
        expect(args[0]).toMatch(/\/mailbox_observer\.py$/);
        // Run the real Python main/alias/MIME logic in a child process. Only
        // external HTTP, secrets and IMAP boundaries are replaced by the adapter.
        return spawn(
          command,
          [
            fileURLToPath(
              new URL("./mailbox_pipeline_adapter.py", import.meta.url),
            ),
            ...args,
          ],
          {
            ...options,
            env: {
              ...process.env,
              PYTHONDONTWRITEBYTECODE: "1",
              PIPELINE_MAILBOX: mailbox,
              PIPELINE_INVITE_RECIPIENT: invitationRecipient,
            },
          },
        );
      }) as typeof childProcess.spawn);
      const recorder = new UatEvidenceRecorder({
        taskId: "sr-live-mail-001",
        candidateSha: sha,
      });
      const result = await runMailAcceptance(config, {
        issueInvitation: (cfg, recipient) =>
          realIssueInvitation(cfg, recipient, recorder),
        pollDeliveryReceipt: (cfg, id) =>
          realPollDeliveryReceipt(cfg, id, recorder),
        observeMailbox: observeInvitationMailbox,
        recorder,
      });
      expect(invitationRecipient).toBe(env.DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT);
      expect(result.evidence.trackedResources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "mailbox_observation",
            metadata: expect.objectContaining({
              matched_content: true,
              uid: "45",
            }),
          }),
        ]),
      );
      const approval = await observeMailbox(config, positiveId, {
        flow: "approve",
        subject: "Unit approval",
        required_text: ["Approval business content"],
      });
      expect(approval).toMatchObject({
        matched_content: true,
        uid: "45",
        candidate_sha: sha,
      });
      expect(spawnSpy).toHaveBeenCalledTimes(2);
      // Simulated arrival is not live acceptance; missing profiles stay failed.
      expect(result.status).toBe("failed");
      expect(result.reasons.join(" ")).toMatch(/Acceptance incomplete/);
    },
  );
});
