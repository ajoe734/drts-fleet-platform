/** Fail before credentials or mutations; these resources are the task's grant. */
export function validateTarget(env: Record<string, string | undefined>) {
  if (env.DRTS_LIVE_MAIL_TEST_AUTHORIZED !== "true") {
    throw new Error('DRTS_LIVE_MAIL_TEST_AUTHORIZED must equal "true"');
  }
  const sha = env.DRTS_CANDIDATE_SHA ?? "";
  if (!/^[a-f0-9]{40}$/.test(sha))
    throw new Error("DRTS_CANDIDATE_SHA must be a full 40-character SHA");
  const origin = (env.DRTS_LIVE_MAIL_API_ORIGIN ?? "").replace(/\/$/, "");
  const allowed = (env.DRTS_LIVE_MAIL_ALLOWED_TARGETS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""));
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.origin !== origin ||
    !allowed.includes(origin)
  ) {
    throw new Error(
      "DRTS_LIVE_MAIL_API_ORIGIN must be an HTTPS origin in DRTS_LIVE_MAIL_ALLOWED_TARGETS",
    );
  }
  if (env.DEV_GCP_PROJECT_ID !== "drts-dev-devcc-20260825")
    throw new Error(
      "DEV_GCP_PROJECT_ID is outside the authorized shared dev project",
    );
  if (
    env.DRTS_LIVE_MAIL_TEST_TENANT_ID !== "10000000-0000-0000-0000-000000000201"
  )
    throw new Error(
      "DRTS_LIVE_MAIL_TEST_TENANT_ID is outside the authorized test tenant",
    );
  if (
    env.DRTS_LIVE_MAIL_TENANT_ACTOR_ID !==
    "10000000-0000-0000-0000-000000000901"
  )
    throw new Error(
      "DRTS_LIVE_MAIL_TENANT_ACTOR_ID is outside the authorized tenant_admin grant",
    );
  return { origin, sha };
}

export async function verifyDeployedCandidate(
  origin: string,
  sha: string,
  fetcher = fetch,
) {
  const response = await fetcher(`${origin}/health`, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || response.headers.get("x-drts-candidate-sha") !== sha) {
    throw new Error(
      "Deployed candidate preflight failed before credentials or mail mutations",
    );
  }
}
