import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { MailRunnerConfig } from "./mail-acceptance-runner";

/** Credentials and MIME bodies stay inside the stdlib IMAP subprocess. */
export function observeInvitationMailbox(
  config: MailRunnerConfig,
  deliveryId: string,
): Promise<Record<string, unknown>> {
  return observeMailbox(config, deliveryId, {
    flow: "invite", subject: "You're invited to join your DRTS tenant workspace",
    required_text: ["You have been invited to join a DRTS tenant workspace.", "This invitation expires at"],
  });
}

export interface MailboxProbe {
  flow: "invite" | "approve";
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
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 16_384) child.kill();
    });
    child.stdin.on("error", () =>
      reject(new Error("Mailbox subprocess input failed")),
    );
    child.on("error", () =>
      reject(new Error("Mailbox subprocess unavailable")),
    );
    child.on("close", (code) => {
      if (code !== 0)
        return reject(new Error("Authorized mailbox observation failed"));
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
