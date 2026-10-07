import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTarget } from "../sr-live-mail-001/preflight";

export async function teardown(
  env: Record<string, string | undefined>,
  fetcher = fetch,
) {
  const token = env.DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN;
  if (!token) return;
  const { origin } = validateTarget(env);
  const response = await fetcher(`${origin}/api/auth/logout`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${token}`,
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
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
)
  teardown(process.env).catch(() => {
    console.error("Mail session cleanup failed; credential details withheld");
    process.exitCode = 1;
  });
