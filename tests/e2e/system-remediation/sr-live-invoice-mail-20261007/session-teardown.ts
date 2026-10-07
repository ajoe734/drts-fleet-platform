import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateTarget } from "../sr-live-mail-001/preflight";
import { createInvoiceMailEnvAdapter } from "./session-bootstrap";

export async function teardown(
  env: Record<string, string | undefined>,
  fetcher = fetch,
) {
  const tokens = [
    { key: "DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN", val: env.DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN },
    { key: "DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN", val: env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN },
    { key: "DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN", val: env.DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN }
  ];
  const errors: Error[] = [];
  const sessionResults: Array<{ key: string, status: "success" | "failed" | "not_issued", error?: string }> = [];
  for (const token of tokens) {
    if (!token.val) {
       sessionResults.push({ key: token.key, status: "not_issued" });
       continue;
    }
    try {
      const { origin } = validateTarget(createInvoiceMailEnvAdapter(env));
      const response = await fetcher(`${origin}/api/auth/logout`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          authorization: `Bearer ${token.val}`,
          "content-type": "application/json",
        },
        body: "{}",
      });
      // Cleanup is still required if the deployment changed after this run started.
      if (!response.ok) throw new Error(`Session cleanup HTTP ${response.status}`);
      const body = (await response.json()) as {
        data?: { revoked?: boolean; logged_out?: boolean };
      };
      if (body.data?.revoked !== true || body.data.logged_out !== true)
          throw new Error("Session cleanup did not confirm revocation");
      sessionResults.push({ key: token.key, status: "success" });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      errors.push(err);
      sessionResults.push({ key: token.key, status: "failed", error: "cleanup_failed" });
    }
  }
  const artifactsDir = resolve(".artifacts", "live-invoice-mail-acceptance");
  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(resolve(artifactsDir, "evidence-teardown.json"), JSON.stringify({
    runId: env.GITHUB_RUN_ID,
    candidateSha: env.DRTS_CANDIDATE_SHA,
    attempted: tokens.filter(t => !!t.val).length,
    failures: errors.length,
    success: errors.length === 0,
    sessions: sessionResults
  }, null, 2));

  if (errors.length > 0) {
    throw new Error(`Cleanup failed for some sessions: ${errors.length} errors occurred. (Sanitized)`);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
)
  teardown(process.env).catch(() => {
    console.error("Mail session cleanup failed; credential details withheld");
    process.exitCode = 1;
  });
