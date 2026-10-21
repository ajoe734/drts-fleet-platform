import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
export interface MailRunnerConfig {
  candidateSha: string;
  apiOrigin: string;
  tenantId: string;
  actorId: string;
  stepUpActionId: string;
  gcpProjectId: string;
}

// Python emits only these fixed stages. Do not forward arbitrary subprocess
// strings, even when they happen to be valid JSON.
const mailboxFailureStages = new Set([
  "mailbox_preflight_failed",
  "mailbox_credentials_failed",
  "imap_connection_failed",
  "imap_login_failed",
  "imap_list_failed",
  "imap_all_folder_not_found",
  "imap_all_folder_ambiguous",
  "imap_select_failed",
  "imap_search_failed",
  "imap_fetch_failed",
  "message_not_found_before_deadline",
  "content_mismatch",
  "invitation_acceptance_failed",
  "mailbox_observation_failed",
]);

export class MailboxObservationError extends Error {
  readonly stage: string;

  constructor(stage: unknown) {
    const safeStage =
      typeof stage === "string" && mailboxFailureStages.has(stage)
        ? stage
        : "mailbox_observation_failed";
    super(`Authorized mailbox observation failed; stage=${safeStage}.`);
    this.stage = safeStage;
  }
}

/** Credentials and MIME bodies stay inside the stdlib IMAP subprocess. */
export function observeInvoiceMailbox(
  config: MailRunnerConfig,
  deliveryId: string,
): Promise<Record<string, unknown>> {
  return observeMailbox(config, deliveryId, {
    flow: "invoice",
    subject: "DRTS monthly invoice",
    required_text: [
      "Your monthly invoice is available in the Tenant Console.",
      "Sign in with your authorized tenant finance account to view and download it"
    ],
  });
}

export interface MailboxProbe {
  flow: "invoice";
  subject: string;
  required_text: string[];
  acceptance?: "accepted" | "denied" | "expired";
  user_id?: string;
}

export function observeMailbox(
  config: MailRunnerConfig,
  deliveryId: string,
  probe: MailboxProbe,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "python3",
      [fileURLToPath(new URL("./mailbox_observer.py", import.meta.url))],
      {
        stdio: ["pipe", "pipe", "inherit"],
        timeout: 150_000,
      },
    );
    let output = "";
    let outputTooLarge = false;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (outputTooLarge) return;
      output += chunk;
      if (output.length > 16_384) {
        outputTooLarge = true;
        output = "";
        child.kill();
      }
    });
    child.stdin.on("error", () =>
      reject(new Error("Mailbox subprocess input failed")),
    );
    child.on("error", () =>
      reject(new Error("Mailbox subprocess unavailable")),
    );
    child.on("close", (code) => {
      if (code !== 0 || outputTooLarge) {
        let stage: unknown;
        try {
          const failure = JSON.parse(output) as {
            error?: { stage?: unknown };
          };
          stage = failure?.error?.stage;
        } catch {
          // Crashes, signals and malformed output retain the fixed fallback.
        }
        return reject(new MailboxObservationError(stage));
      }
      try {
        const result = JSON.parse(output) as Record<string, unknown>;
        if (
          result.candidate_sha !== config.candidateSha ||
          result.delivery_id !== deliveryId ||
          result.matched_content !== true ||
          typeof result.uid !== "string" ||
          typeof result.body_sha256 !== "string"
        )
          throw new Error();
        resolve(result);
      } catch {
        reject(new Error("Invalid mailbox evidence"));
      }
    });
    child.stdin.end(
      JSON.stringify({
        candidate_sha: config.candidateSha,
        api_origin: config.apiOrigin,
        delivery_id: deliveryId,
        ...probe,
      }),
    );
  });
}
