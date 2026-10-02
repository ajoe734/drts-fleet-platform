/**
 * SR-LIVE-MAIL-001: mints a real, deployment-issued tenant_admin session for
 * the live invitation-mail acceptance profile.
 *
 * This is not a fixture/bootstrap-mode login (`POST tenant/bootstrap-session`
 * is dev-fixture-only and is deliberately never used here). It mints a real
 * Google-signed OIDC identity token for the CI deployer service account
 * (`google-github-actions/auth`, audience = the deployed API origin), then
 * exchanges it at `POST auth/token` via the "CI tenant actor" grant
 * (`WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED=true`,
 * `google-workload-identity.adapter.ts:508-531` `isCiTenantActorGateEnabled`/
 * `resolveCiTenantActorGrant`) for a specific, pre-registered
 * (tenantId, "tenant_admin", actorId) tuple -- never general tenant
 * impersonation. The resulting session is verified live via `auth/session`,
 * then used to obtain a `tenant:users:create` step-up proof
 * (`identity/step-up-proofs`, `step-up.policy.ts:410-416`) up front, since
 * `POST tenant/users` requires a fresh one
 * (`step-up-proof.service.ts:213-` `assertRequestSatisfied`) and the same
 * proof can be reused for every subsequent call in this run (it is deleted
 * only on expiry, not on first use).
 *
 * This file never contacts a network itself when imported for tests:
 * `main()` is the only place real fetch/gcloud calls happen.
 */
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

export class MailSessionInputError extends Error {}

export interface MailSessionConfig {
  apiOrigin: string;
  candidateSha: string;
  tenantId: string;
  actorId: string;
  stepUpActionId: string;
  gcpProjectId: string;
}

export type MailSessionEnv = Record<string, string | undefined>;

function requireString(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new MailSessionInputError(
      `${name} is required and must be non-empty.`,
    );
  }
  return trimmed;
}

export function validateMailSessionInputs(
  env: MailSessionEnv,
): MailSessionConfig {
  return {
    apiOrigin: requireString(
      env.DRTS_LIVE_MAIL_API_ORIGIN,
      "DRTS_LIVE_MAIL_API_ORIGIN",
    ).replace(/\/$/, ""),
    candidateSha: requireString(env.DRTS_CANDIDATE_SHA, "DRTS_CANDIDATE_SHA"),
    tenantId: requireString(
      env.DRTS_LIVE_MAIL_TEST_TENANT_ID,
      "DRTS_LIVE_MAIL_TEST_TENANT_ID",
    ),
    actorId: requireString(
      env.DRTS_LIVE_MAIL_TENANT_ACTOR_ID,
      "DRTS_LIVE_MAIL_TENANT_ACTOR_ID",
    ),
    stepUpActionId:
      env.DRTS_LIVE_MAIL_STEP_UP_ACTION_ID?.trim() || "tenant:users:create",
    gcpProjectId: requireString(env.DEV_GCP_PROJECT_ID, "DEV_GCP_PROJECT_ID"),
  };
}

export interface MailSessionFetchDeps {
  fetch: typeof fetch;
  readGoogleIdToken: () => string;
  mask: (value: string) => void;
}

export interface MintedMailSession {
  sessionToken: string;
  stepUpReference: string;
}

async function request(
  config: MailSessionConfig,
  deps: MailSessionFetchDeps,
  path: string,
  init: RequestInit,
  checkCandidateSha: boolean,
): Promise<{
  data?: Record<string, unknown>;
  token?: string;
  expiresIn?: string;
}> {
  const response = await deps.fetch(`${config.apiOrigin}/api/${path}`, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `${path} returned HTTP ${response.status} (no credential details retained).`,
    );
  }
  if (checkCandidateSha) {
    const deployedSha = response.headers.get("x-drts-candidate-sha");
    if (deployedSha !== config.candidateSha) {
      throw new Error(
        `Deployed candidate SHA header reported "${deployedSha ?? "(missing)"}", expected "${config.candidateSha}".`,
      );
    }
  }
  return (await response.json()) as {
    data?: Record<string, unknown>;
    token?: string;
    expiresIn?: string;
  };
}

export async function mintTenantAdminSession(
  config: MailSessionConfig,
  deps: MailSessionFetchDeps,
): Promise<MintedMailSession> {
  const idToken = deps.readGoogleIdToken().trim();
  if (!idToken || /[\r\n]/.test(idToken)) {
    throw new Error(
      "Google identity token for session minting is missing or malformed.",
    );
  }
  deps.mask(idToken);

  const issued = await request(
    config,
    deps,
    "auth/token",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-drts-google-id-token": idToken,
        "x-actor-type": "tenant_admin",
        "x-actor-id": config.actorId,
        "x-realm": "tenant",
        "x-tenant-id": config.tenantId,
      },
      body: "{}",
    },
    true,
  );
  const sessionToken = issued.token;
  if (
    typeof sessionToken !== "string" ||
    !sessionToken ||
    /\s/.test(sessionToken)
  ) {
    throw new Error("auth/token did not return a usable session token.");
  }
  deps.mask(sessionToken);

  const session = await request(
    config,
    deps,
    "auth/session",
    { headers: { authorization: `Bearer ${sessionToken}` } },
    false,
  );
  const identity = session.data?.identity as
    | { realm?: string; actorType?: string; actorId?: string }
    | undefined;
  if (
    session.data?.active !== true ||
    identity?.realm !== "tenant" ||
    identity?.actorType !== "tenant_admin" ||
    identity?.actorId !== config.actorId
  ) {
    throw new Error(
      "Minted tenant_admin session failed live verification via auth/session.",
    );
  }

  const proof = await request(
    config,
    deps,
    "identity/step-up-proofs",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ actionId: config.stepUpActionId }),
    },
    false,
  );
  const proofData = proof.data as
    | { required?: boolean; stepUpReference?: string | null }
    | undefined;
  if (!proofData?.required || !proofData.stepUpReference) {
    throw new Error(
      `Step-up proof for action "${config.stepUpActionId}" was not issued (required=${proofData?.required}); the minted session may lack a trusted MFA assertion.`,
    );
  }
  deps.mask(proofData.stepUpReference);

  return { sessionToken, stepUpReference: proofData.stepUpReference };
}

/**
 * Derives the Gmail plus-addressing alias (e.g. `person+invite@gmail.com`)
 * Supervisor's integration_notes describe: the authorized test mailbox is
 * the dedicated SMTP sender mailbox itself, and the recipient allowlist
 * (`drts-dev-smtp-recipient-allowlist` version 2) adds that mailbox's own
 * `+invite`/`+approve` aliases rather than a separate inbox. The base
 * address comes from the real `drts-dev-smtp-username` secret at run time
 * (masked immediately); it is never derived from a fixture or hardcoded.
 */
export function deriveAliasRecipient(baseEmail: string, tag: string): string {
  const at = baseEmail.indexOf("@");
  if (at <= 0 || at === baseEmail.length - 1) {
    throw new Error(
      `Cannot derive a "${tag}" alias from a malformed base mailbox address.`,
    );
  }
  return `${baseEmail.slice(0, at)}+${tag}@${baseEmail.slice(at + 1)}`;
}

async function main(): Promise<void> {
  const config = validateMailSessionInputs(process.env);
  const envPath = process.env.GITHUB_ENV;
  if (!envPath) {
    throw new Error(
      "GITHUB_ENV is required to export the minted session to later workflow steps.",
    );
  }
  const minted = await mintTenantAdminSession(config, {
    fetch,
    readGoogleIdToken: () =>
      execFileSync(
        "gcloud",
        ["auth", "print-identity-token", `--audiences=${config.apiOrigin}`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    mask: (value) =>
      console.log(
        `::add-mask::${value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`,
      ),
  });
  appendFileSync(
    envPath,
    `DRTS_LIVE_MAIL_ROLE_SESSION_TOKEN=${minted.sessionToken}\n`,
  );
  appendFileSync(
    envPath,
    `DRTS_LIVE_MAIL_STEP_UP_REFERENCE=${minted.stepUpReference}\n`,
  );

  const baseMailbox = execFileSync(
    "gcloud",
    [
      "secrets",
      "versions",
      "access",
      "latest",
      "--secret=drts-dev-smtp-username",
      `--project=${config.gcpProjectId}`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  console.log(
    `::add-mask::${baseMailbox.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`,
  );
  const authorizedRecipient = deriveAliasRecipient(baseMailbox, "invite");
  console.log(
    `::add-mask::${authorizedRecipient.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`,
  );
  appendFileSync(
    envPath,
    `DRTS_LIVE_MAIL_AUTHORIZED_RECIPIENT=${authorizedRecipient}\n`,
  );
  // RFC 2606 reserved TLD: guaranteed to never resolve or accept real mail,
  // so this needs no operator authorization -- it only proves the
  // allowlist gate rejects an address outside it.
  appendFileSync(
    envPath,
    "DRTS_LIVE_MAIL_NON_ALLOWLISTED_RECIPIENT=sr-live-mail-001-negative@reserved.invalid\n",
  );

  console.log(
    "Mail session bootstrap: minted and verified a live tenant_admin session, and derived the authorized test recipient.",
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Mail session bootstrap failed",
    );
    process.exitCode = 1;
  });
}
