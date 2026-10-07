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
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  validateTarget,
  verifyDeployedCandidate,
} from "../sr-live-mail-001/preflight";
import { googleAssertionSource } from "../sr-live-mail-001/fresh-assertion";

export class MailSessionInputError extends Error {}
export class AssertionReplayError extends Error {}
export class MailMailboxInputError extends Error {}

export type MailBootstrapStage =
  | "input-validation"
  | "candidate-preflight"
  | "environment-path"
  | "assertion-configuration"
  | "assertion-mint"
  | "assertion-validation"
  | "token-exchange"
  | "token-validation"
  | "session-export"
  | "session-request"
  | "session-validation"
  | "step-up-request"
  | "step-up-validation"
  | "step-up-export"
  | "mailbox-read"
  | "alias-derivation"
  | "recipient-export";

// Never print an upstream message, stack, name, command, stderr or cause. Even
// Error.name can contain credential data; report only fixed local class names.
function safeErrorClass(error: unknown): string {
  if (error instanceof MailMailboxInputError) return "MailMailboxInputError";
  if (error instanceof MailSessionInputError) return "MailSessionInputError";
  if (error instanceof AssertionReplayError) return "AssertionReplayError";
  if (error instanceof SyntaxError) return "SyntaxError";
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof Error) return "Error";
  return "UnknownThrownValue";
}

export class MailBootstrapError extends Error {
  readonly stage: MailBootstrapStage;
  constructor(
    stage: MailBootstrapStage,
    error: unknown,
  ) {
    super(
      `Mail session bootstrap failed; stage=${stage}; error_class=${safeErrorClass(error)}; credential details omitted.`,
    );
    this.stage = stage;
  }
}

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

export function createInvoiceMailEnvAdapter(env: MailSessionEnv): MailSessionEnv {
  return {
    ...env,
    DRTS_LIVE_MAIL_TEST_AUTHORIZED: env.DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED,
    DRTS_LIVE_MAIL_API_ORIGIN: env.DRTS_LIVE_INVOICE_MAIL_API_ORIGIN,
    DRTS_LIVE_MAIL_ALLOWED_TARGETS: env.DRTS_LIVE_INVOICE_MAIL_ALLOWED_TARGETS,
    DRTS_LIVE_MAIL_TEST_TENANT_ID: env.DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID,
    DRTS_LIVE_MAIL_TENANT_ACTOR_ID: env.DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID,
  };
}

export function validateMailSessionInputs(
  env: MailSessionEnv,
): MailSessionConfig {
  try {
    validateTarget(createInvoiceMailEnvAdapter(env));
  } catch (error) {
    throw new MailSessionInputError(
      error instanceof Error ? error.message : "Invalid mail target",
    );
  }
  return {
    apiOrigin: requireString(
      env.DRTS_LIVE_INVOICE_MAIL_API_ORIGIN,
      "DRTS_LIVE_INVOICE_MAIL_API_ORIGIN",
    ).replace(/\/$/, ""),
    candidateSha: requireString(env.DRTS_CANDIDATE_SHA, "DRTS_CANDIDATE_SHA"),
    tenantId: requireString(
      env.DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID,
      "DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID",
    ),
    actorId: requireString(
      env.DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID,
      "DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID",
    ),
    stepUpActionId:
      env.DRTS_LIVE_INVOICE_MAIL_STEP_UP_ACTION_ID?.trim() ||
      "tenant:users:create",
    gcpProjectId: requireString(env.DEV_GCP_PROJECT_ID, "DEV_GCP_PROJECT_ID"),
  };
}

export interface MailSessionFetchDeps {
  fetch: typeof fetch;
  readGoogleIdToken: () => string;
  mask: (value: string) => void;
  onSessionIssued?: (token: string) => void;
  onStage?: (stage: MailBootstrapStage) => void;
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
    if (path === "auth/token" && response.status === 409) {
      const body = (await response.json()) as { error?: { code?: string } };
      if (body.error?.code === "WORKLOAD_ASSERTION_REPLAYED")
        throw new AssertionReplayError("Google assertion already consumed");
    }
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

export async function mintTenantSession(
  config: MailSessionConfig,
  deps: MailSessionFetchDeps,
  actorType: string = "tenant_admin",
  expectedRole: string = "tenant_admin",
  expectedScopes: string[] = [],
  forbiddenScopes: string[] = [],
): Promise<MintedMailSession> {
  deps.onStage?.("assertion-validation");
  const idToken = deps.readGoogleIdToken().trim();
  if (!idToken || /[\r\n]/.test(idToken)) {
    throw new Error(
      "Google identity token for session minting is missing or malformed.",
    );
  }
  deps.mask(idToken);

  deps.onStage?.("token-exchange");
  const issued = await request(
    config,
    deps,
    "auth/token",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-drts-google-id-token": idToken,
        "x-actor-type": actorType,
        "x-actor-id": config.actorId,
        "x-realm": "tenant",
        "x-tenant-id": config.tenantId,
      },
      body: "{}",
    },
    true,
  );
  deps.onStage?.("token-validation");
  const sessionToken = issued.token;
  if (
    typeof sessionToken !== "string" ||
    !sessionToken ||
    /\s/.test(sessionToken)
  ) {
    throw new Error("auth/token did not return a usable session token.");
  }
  deps.mask(sessionToken);
  // Retain the cleanup handle even if identity/proof verification later fails.
  deps.onStage?.("session-export");
  deps.onSessionIssued?.(sessionToken);

  deps.onStage?.("session-request");
  const session = await request(
    config,
    deps,
    "auth/session",
    { headers: { authorization: `Bearer ${sessionToken}` } },
    true,
  );
  deps.onStage?.("session-validation");
  const identity = session.data?.identity as
    | {
        realm?: string;
        actor_type?: string;
        actor_id?: string;
        tenant_id?: string;
        roles?: string[];
        scopes?: string[];
      }
    | undefined;
  if (
    session.data?.active !== true ||
    identity?.realm !== "tenant" ||
    identity?.actor_type !== actorType ||
    identity?.actor_id !== config.actorId ||
    identity?.tenant_id !== config.tenantId ||
    !Array.isArray(identity.roles) ||
    !identity.roles?.includes(expectedRole) ||
    (expectedScopes.length > 0 && (!Array.isArray(identity.scopes) || !expectedScopes.every(s => identity.scopes!.includes(s)))) ||
    (forbiddenScopes.length > 0 && Array.isArray(identity.scopes) && forbiddenScopes.some(s => identity.scopes!.includes(s)))
  ) {
    throw new Error(
      "Minted session failed live verification via auth/session.",
    );
  }

  deps.onStage?.("step-up-request");
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
    true,
  );
  deps.onStage?.("step-up-validation");
  const proofData = proof.data as
    | {
        required?: boolean;
        step_up_reference?: string | null;
        action_id?: string;
      }
    | undefined;
  if (
    proofData?.required !== true ||
    typeof proofData.step_up_reference !== "string" ||
    !proofData.step_up_reference ||
    /\s/.test(proofData.step_up_reference) ||
    proofData.action_id !== config.stepUpActionId
  ) {
    throw new Error(
      `Step-up proof for action "${config.stepUpActionId}" was not issued (required=${proofData?.required}); the minted session may lack a trusted MFA assertion.`,
    );
  }
  deps.mask(proofData.step_up_reference);

  return { sessionToken, stepUpReference: proofData.step_up_reference };
}

/**
 * Derives the dedicated Gmail/Workspace mailbox's plus-addressing alias.
 * Supervisor's integration_notes describe: the authorized test mailbox is
 * the dedicated SMTP sender mailbox itself, and the recipient allowlist
 * (`drts-dev-smtp-recipient-allowlist` version 2) adds that mailbox's own
 * `+invite`/`+approve` aliases rather than a separate inbox. The base
 * address comes from the real `drts-dev-smtp-username` secret at run time
 * (masked immediately); it is never derived from a fixture or hardcoded.
 */
export function deriveAliasRecipient(baseEmail: string, tag: string): string {
  const [local = "", domain = "", ...extra] = baseEmail.split("@");
  const labels = domain.split(".");
  const recipient = `${local}+${tag}@${domain}`;
  if (
    extra.length > 0 ||
    /\s/.test(baseEmail) ||
    !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    local.length + tag.length + 1 > 64 ||
    recipient.length > 254 ||
    /(?:^|[.-])(?:fixture|demo|example)(?:[.-]|$)/i.test(domain) ||
    /\.(?:invalid|test|localhost)$/i.test(domain) ||
    labels.length < 2 ||
    !labels.every((label) =>
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label),
    ) ||
    !["invoice"].includes(tag)
  ) {
    throw new MailMailboxInputError(
      "Cannot derive an authorized alias from a malformed base mailbox address or unsupported tag.",
    );
  }
  return recipient;
}

export interface MailBootstrapDeps {
  fetch: typeof fetch;
  mask: (value: string) => void;
  appendEnvironment: (path: string, value: string) => void;
  onSessionIssued?: (token: string, tokenExportKey: string) => void;
  readMailbox: (config: MailSessionConfig) => string;
  assertions: (config: MailSessionConfig) => { next(): Promise<string> };
}

/** Same entry point as the hosted CLI; tests replace only cloud/IO boundaries. */
export async function bootstrapMailSession(
  env: MailSessionEnv,
  deps: MailBootstrapDeps,
  preflightOnly = false,
): Promise<void> {
  let stage: MailBootstrapStage = "input-validation";
  try {
    const config = validateMailSessionInputs(env);
    const issuedSessions: string[] = [];
    if (env.GITHUB_ACTIONS !== "true")
      throw new Error("Hosted runner required");
    stage = "candidate-preflight";
    await verifyDeployedCandidate(
      config.apiOrigin,
      config.candidateSha,
      deps.fetch,
    );
    if (preflightOnly) return;
    stage = "environment-path";
    const envPath = env.GITHUB_ENV;
    if (!envPath) {
      throw new Error(
        "GITHUB_ENV is required to export the minted session to later workflow steps.",
      );
    }
    stage = "assertion-configuration";
    const assertions = deps.assertions(config);

    async function tryMint(cfg: MailSessionConfig, actType: string, tokenExportKey: string, expRole: string = "tenant_admin", expectedScopes: string[] = [], forbiddenScopes: string[] = []) {
        for (let attempt = 0; attempt < 3; attempt++) {
            stage = "assertion-mint";
            const assertion = await assertions.next();
            try {
                const res = await mintTenantSession(cfg, {
                    fetch: deps.fetch,
                    mask: deps.mask,
                    onStage: (value) => { stage = value; },
                    readGoogleIdToken: () => assertion,
                    onSessionIssued: (token) => {
                        deps.appendEnvironment(envPath!, `${tokenExportKey}=${token}\n`);
                        issuedSessions.push(tokenExportKey);
                        deps.onSessionIssued?.(token, tokenExportKey);
                    }
                }, actType, expRole, expectedScopes, forbiddenScopes);
                return res;
            } catch (error) {
                if (!(error instanceof AssertionReplayError)) throw error;
            }
        }
        throw new Error("Assertion collisions exhausted bounded retries for " + actType);
    }

    const mintedSession = await tryMint(config, "tenant_admin", "DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN", "tenant_admin", ["tenant:billing:read", "tenant:billing:write"], []);
    stage = "step-up-export";
    deps.appendEnvironment(envPath!, `DRTS_LIVE_INVOICE_MAIL_STEP_UP_REFERENCE=${mintedSession.stepUpReference}\n`);

    if (env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TENANT_ID && env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_ACTOR_ID) {
      const roConfig = { ...config, tenantId: env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TENANT_ID, actorId: env.DRTS_LIVE_INVOICE_MAIL_READ_ONLY_ACTOR_ID };
      await tryMint(roConfig, "tenant_admin", "DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN", "tenant_viewer", ["tenant:billing:read"], ["tenant:billing:write"]);
    }

    if (env.DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TENANT_ID && env.DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_ACTOR_ID) {
      const naConfig = { ...config, tenantId: env.DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TENANT_ID, actorId: env.DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_ACTOR_ID };
      await tryMint(naConfig, "tenant_admin", "DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN", "tenant_admin", ["tenant:billing:read", "tenant:billing:write"], []);
    }

    stage = "mailbox-read";
    const baseMailbox = deps.readMailbox(config).trim();
    deps.mask(baseMailbox);
    stage = "alias-derivation";
    const authorizedRecipient = deriveAliasRecipient(baseMailbox, "invoice");
    deps.mask(authorizedRecipient);
    stage = "recipient-export";
    const effectiveAllowlist = env.DRTS_LIVE_INVOICE_MAIL_EFFECTIVE_ALLOWLIST || "";
    if (!effectiveAllowlist.split(/[\r\n]+/).includes(authorizedRecipient)) {
      throw new Error("Derived recipient is not present in the observed effective allowlist.");
    }
    deps.appendEnvironment(
      envPath,
      `DRTS_LIVE_INVOICE_MAIL_AUTHORIZED_RECIPIENT=${authorizedRecipient}\n`,
    );
    // Reserved TLD; production transport must record an allowlist rejection.
    deps.appendEnvironment(
      envPath,
      "DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_RECIPIENT=sr-live-invoice-mail-negative@reserved.invalid\n",
    );
    
    const artifactsDir = resolve(".artifacts", "live-invoice-mail-acceptance");
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(resolve(artifactsDir, "evidence-bootstrap.json"), JSON.stringify({
      runId: env.GITHUB_RUN_ID,
      candidateSha: env.DRTS_CANDIDATE_SHA,
      issued_sessions_count: issuedSessions.length,
      issued_sessions: issuedSessions
    }, null, 2));

  } catch (error) {
    throw new MailBootstrapError(stage, error);
  }
}

async function main(): Promise<void> {
  const mask = (value: string) =>
    console.log(
      `::add-mask::${value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`,
    );
  await bootstrapMailSession(
    process.env,
    {
      fetch,
      mask,
      appendEnvironment: appendFileSync,
      assertions: (config) =>
        googleAssertionSource(
          config.apiOrigin,
          requireString(
            process.env.DRTS_LIVE_INVOICE_MAIL_WIF_SERVICE_ACCOUNT,
            "WIF service account",
          ),
          requireString(
            process.env.DRTS_LIVE_INVOICE_MAIL_WIF_FEDERATED_TOKEN,
            "WIF federated token",
          ),
          mask,
        ),
      readMailbox: (config) =>
        execFileSync(
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
        ),
    },
    process.argv.includes("--preflight"),
  );

  console.log(
    process.argv.includes("--preflight")
      ? "Mail session bootstrap: authorization and deployed SHA verified."
      : "Mail session bootstrap: minted and verified a live tenant_admin session, and derived the authorized test recipient.",
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof MailBootstrapError
        ? error.message
        : "Mail session bootstrap failed; stage=entrypoint; error_class=Unknown; credential details omitted.",
    );
    process.exitCode = 1;
  });
}
