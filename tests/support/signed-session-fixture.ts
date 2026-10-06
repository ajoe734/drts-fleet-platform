import { randomUUID } from "node:crypto";

import type { CanonicalIdentityPrincipalRecord } from "@drts/contracts";
import { DEFAULT_CONTROL_PLANE_JWT_ISSUER } from "@drts/control-plane-auth";

import { DatabaseService } from "../../apps/api/src/common/db";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";

/** The regulatory registry's own built-in offline demo seed
 * (regulatory-registry.service.ts's `DRIVER_SEED`, reused verbatim by
 * driver-profile/platform-earnings/billing-settlement's own demo mappings),
 * the only driver identity `JwtAuthService#validateDurableState`'s
 * `driver_user` branch (:987-995) can resolve via
 * `RegulatoryRegistryService#assertDriverAuthEligible` without a real,
 * pre-provisioned driver record. Reusing it is a deliberate, test-owned
 * default -- not proof that this driver also owns a reimbursement batch or
 * public-info version on a real shared-dev database. A hosted acceptance
 * run against real driver-owned business records must pass an explicit
 * `actorId` (or `DRIVER_FIXTURE_ACTOR_ID`) for a driver actually provisioned
 * in that environment; see docs/04-uat/gcp-artifact-activation-20261004.md. */
export const DEFAULT_DRIVER_FIXTURE_ACTOR_ID = "drv-demo-001";

/**
 * Test-only signed-session issuance through the REAL
 * jwt-auth.service.ts#issueSessionToken path -- the exact signature/
 * required-session-claims/active-durable-session checks
 * bootstrap-auth.guard.ts verifies against (apps/api/src/common/auth/
 * bootstrap-auth.guard.ts:388 -> jwt-auth.service.ts:935-979). A hand-rolled
 * or placeholder JWT, or a raw database insert, can never satisfy that path,
 * so a hosted acceptance run that needs to call driver/ops-authorized
 * endpoints (billing-settlement.controller.ts's `driver:write`/`billing:write`
 * reimbursement-proof routes, platform-admin.controller.ts's placard
 * generation) must mint a genuine session through this exact function, not
 * invent a token.
 *
 * `DatabaseService`/`IdentityRepository` fall back to an in-process,
 * non-durable store when `DATABASE_URL` is unset (identity.repository.ts's
 * own `isEnabled()` branches), so these functions also work for a local,
 * DB-less unit/functional test; against the live hosted dev deployment, run
 * with `DATABASE_URL` pointed at that deployment's own database so the
 * session row this writes is the same one the running API's guard reads
 * back.
 *
 * Never import this from product code (apps/**\/src, packages/**\/src,
 * operations/**): signed-session-fixture-guard.test.ts enforces that
 * boundary by scanning those trees for any reference to this module.
 */

export interface SignedSessionFixture {
  token: string;
  sessionId: string;
  tokenId: string;
  principalId: string;
  actorId: string;
}

export interface IssueDriverSessionFixtureOptions {
  actorId?: string;
  principalId?: string;
  tenantId?: string | null;
  identityRepository?: IdentityRepository;
}

export interface IssueOpsSessionFixtureOptions {
  actorId?: string;
  principalId?: string;
  scopes?: string[];
  identityRepository?: IdentityRepository;
}

function resolveRepository(injected?: IdentityRepository): IdentityRepository {
  return injected ?? new IdentityRepository(new DatabaseService());
}

/** Mints a real signed session for the `driver` realm with `driver:write`
 * (billing-settlement.controller.ts:706,755 requires it for staged-content
 * upload and proof persistence).
 *
 * jwt-auth.service.ts#validateDurableState's `driver_user` branch (:987-999)
 * requires `payload.driverBindingId === session.sessionId` and
 * `payload.driverDeviceId === session.deviceSummary.deviceId` -- the same
 * binding/device identity driver-device-session.service.ts#issueSession
 * (:968-1003) mints through this exact function, using the binding ID as
 * both `driverBindingId` and the session's own `sessionId`. Omitting these
 * fields signs a session that `verifyAccessToken` always rejects. */
export async function issueDriverSessionFixture(
  options: IssueDriverSessionFixtureOptions = {},
): Promise<SignedSessionFixture> {
  const repo = resolveRepository(options.identityRepository);
  const service = new JwtAuthService(repo);
  // A freshly invented "fixture-driver-<uuid>" actor can never pass
  // assertDriverAuthEligible (requireDriver does an exact driverId lookup
  // against the registry's own records, driver_user auth is rejected
  // DRIVER_NOT_FOUND before the signature is even checked): default to the
  // registry's pre-existing offline demo seed instead of silently signing
  // an unknown actor. Callers targeting real driver-owned business records
  // must pass an explicit, pre-provisioned actorId.
  const actorId = options.actorId ?? DEFAULT_DRIVER_FIXTURE_ACTOR_ID;
  const principalId = options.principalId ?? `principal_${actorId}`;
  const bindingId = `fixture-binding-${randomUUID()}`;
  const deviceId = `fixture-device-${randomUUID()}`;
  const issued = await service.issueSessionToken(
    {
      authMode: "jwt_bearer",
      actorType: "driver_user",
      actorId,
      principalId,
      realm: "driver",
      tenantId: options.tenantId ?? null,
      roleFamilies: ["driver"],
      roles: ["driver_user"],
      scopes: ["driver:read", "driver:write"],
      requestId: null,
      driverBindingId: bindingId,
      driverDeviceId: deviceId,
    },
    {
      principalId,
      subject: `driver:${actorId}`,
      ensurePrincipal: true,
      sessionId: bindingId,
    },
  );
  return {
    token: issued.token,
    sessionId: issued.sessionId,
    tokenId: issued.tokenId,
    principalId,
    actorId,
  };
}

/** Mints a real signed session for the `platform` realm with
 * `billing:write` (reimbursement readback,
 * billing-settlement.controller.ts:821) and `foundation:write` (placard
 * generation, platform-admin.controller.ts's `/placards`).
 *
 * jwt-auth.service.ts#validateDurableState's `platform`/`ops` branch
 * (:1066-1126) looks up an active membership matching `payload.membershipId`
 * and derives both the required token version and the allowed-scope set
 * from that membership's persisted role bindings -- it never accepts scopes
 * carried only in the token claims. This mints a real
 * `identity_role_bindings` row with `roleCode: "platform_admin"` (whose
 * catalog preset covers the billing/foundation scopes above,
 * packages/contracts/src/iam-policy-catalog.ts:631-660) via the same
 * repository path a real workforce invitation uses, ensuring the principal
 * row exists first (the FK order V0068 requires), then signs the token's
 * `tokenVersion` as the max of the principal/membership/role-binding
 * timestamps it just persisted, matching what `validateDurableState`
 * recomputes from those same rows. */
export async function issueOpsSessionFixture(
  options: IssueOpsSessionFixtureOptions = {},
): Promise<SignedSessionFixture> {
  const repo = resolveRepository(options.identityRepository);
  const service = new JwtAuthService(repo);
  const actorId = options.actorId ?? `fixture-ops-${randomUUID()}`;
  const principalId = options.principalId ?? `principal_${actorId}`;
  const now = new Date().toISOString();
  // infra/migrations/V0068__canonical_identity_authority.sql makes
  // iam.identity_memberships.principal_id an immediate FK to
  // iam.identity_principals: the principal row must exist before
  // ensureMembershipRecord below, not after it (the order
  // issueSessionToken's own internal `ensurePrincipal` upsert would
  // otherwise produce, since that call only runs once this function has
  // already returned its finished membership/role-binding rows). Ensure it
  // here instead, then pass `ensurePrincipal: false` + an explicit
  // `tokenVersion` to issueSessionToken below so it signs the version this
  // function actually persisted rather than re-running (and potentially
  // duplicating) that upsert itself.
  const principalRecord: CanonicalIdentityPrincipalRecord = {
    principalId,
    sourceRef: `jwt_principal:platform:${principalId}`,
    issuer: DEFAULT_CONTROL_PLANE_JWT_ISSUER,
    subject: `platform:${actorId}`,
    principalType: "human",
    email: null,
    emailVerified: false,
    displayName: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  await repo.ensurePrincipalRecord(principalRecord);
  const membership = await repo.ensureMembershipRecord({
    membershipId: `fixture-membership-${randomUUID()}`,
    sourceRef: `fixture:ops:${actorId}:membership`,
    principalId,
    realm: "platform",
    scopeRef: "platform:root",
    tenantId: null,
    partnerId: null,
    status: "active",
    invitedByPrincipalId: null,
    invitationId: null,
    createdAt: now,
    updatedAt: now,
  });
  await repo.ensureRoleBindingRecord({
    roleBindingId: `fixture-role-binding-${randomUUID()}`,
    sourceRef: `fixture:ops:${actorId}:role_binding`,
    membershipId: membership.membershipId,
    roleCode: "platform_admin",
    grantedByPrincipalId: null,
    approvalId: null,
    validFrom: now,
    validTo: null,
    createdAt: now,
    updatedAt: now,
  });
  const issued = await service.issueSessionToken(
    {
      authMode: "jwt_bearer",
      actorType: "platform_admin",
      actorId,
      principalId,
      realm: "platform",
      tenantId: null,
      roleFamilies: ["platform"],
      roles: ["platform_admin"],
      scopes: options.scopes ?? [
        "billing:read",
        "billing:write",
        "foundation:read",
        "foundation:write",
      ],
      requestId: null,
    },
    {
      principalId,
      subject: `platform:${actorId}`,
      ensurePrincipal: false,
      membershipId: membership.membershipId,
      // computeWorkforceTokenVersion is Math.max(...timestamps.map(Date.parse));
      // principal/membership/roleBinding were all persisted with the SAME
      // `now`, so signing that directly reproduces exactly what
      // validateDurableState recomputes from the persisted rows, without
      // re-running ensurePrincipal's own upsert a second time.
      tokenVersion: Date.parse(now),
    },
  );
  return {
    token: issued.token,
    sessionId: issued.sessionId,
    tokenId: issued.tokenId,
    principalId,
    actorId,
  };
}

/** `drv-demo-001`'s one trip with a nonzero `platformFundedDiscount`
 * (`billing-settlement.service.ts`'s `SETTLEMENT_TRIP_SEED`,
 * `settlement-202603-002`, `completedAt: "2026-03-18"`) is the only seeded
 * trip `createReimbursementItems` (billing-settlement.service.ts:3543-3561)
 * turns into a reimbursement item when the active fee plan's
 * `reimbursementMode` is `"platform_funded"` -- every other seeded trip has
 * a zero `platformFundedDiscount` and produces nothing. This is a fixed
 * property of the static seed, not a value to vary per run. */
const FIXTURE_REIMBURSEMENT_PERIOD_MONTH = "2026-03";
const FIXTURE_REIMBURSEMENT_FEE_PLAN_NAME = "fixture-platform-funded-reimbursement";
const FIXTURE_REIMBURSEMENT_FEE_PLAN_VERSION = "v1";

export interface ReimbursementBatchFixture {
  batchId: string;
  driverId: string;
  periodMonth: string;
}

export interface EnsureReimbursementBatchFixtureOptions {
  baseUrl?: string;
  opsToken?: string;
  driverId?: string;
  periodMonth?: string;
}

export interface PublicInfoVersionFixture {
  versionId: string;
}

export interface VerifyPublicInfoVersionFixtureOptions {
  baseUrl?: string;
  token?: string;
  versionId?: string;
}

/** The target deployment's own origin -- never a default/guessed URL,
 * because this fixture must land its mutations (fee plan publish, statement
 * generation) in the SAME running API instance docs/04-uat's readback steps
 * call afterward: `billing-settlement.service.ts`'s `driverFeePlans`/
 * `reimbursementBatches` are cached in that instance's own memory
 * (`onModuleInit`, :1208-1226) and only reloaded from the database at boot,
 * so writing through a separate, disconnected process (or raw SQL) would be
 * invisible to it until a restart. */
function resolveApiBaseUrl(explicit?: string): string {
  const baseUrl = explicit ?? process.env.FIXTURE_API_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "FIXTURE_API_BASE_URL (or an explicit baseUrl) is required: this fixture " +
        "mutates/reads state through the target deployment's own running API, " +
        "the same instance docs/04-uat/gcp-artifact-activation-20261004.md's " +
        "readback steps call afterward -- never a default or a direct database " +
        "write that instance's in-memory cache would never see.",
    );
  }
  return baseUrl.replace(/\/+$/, "");
}

interface ApiCallOptions {
  method: "GET" | "POST";
  token: string;
  idempotencyKey?: string;
  body?: unknown;
}

async function callApi(
  baseUrl: string,
  path: string,
  options: ApiCallOptions,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.token}`,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (options.idempotencyKey) {
    headers["idempotency-key"] = options.idempotencyKey;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

/** Ensures `driverId` (default `DEFAULT_DRIVER_FIXTURE_ACTOR_ID`) owns a
 * reimbursement batch for `periodMonth` (default
 * `FIXTURE_REIMBURSEMENT_PERIOD_MONTH`) on the target deployment, through
 * the SAME two formal, documented endpoints the manual runbook would call
 * by hand (`billing-settlement.controller.ts`'s `driver-fee-plans/publish`
 * and `driver-statements/generate`) -- never a raw insert into
 * `reimbursementBatches`. Both calls are idempotent: a fee plan
 * `(planName, version)` that already exists returns `FEE_PLAN_IMMUTABLE`
 * (409), treated here as already-done; `driver-statements/generate` is
 * called with a deterministic `Idempotency-Key` derived from
 * `driverId`/`periodMonth`, and `generateDriverStatements` itself
 * (billing-settlement.service.ts:2099-2112) separately returns the SAME
 * existing batch ids on any later re-run for that driver/period/fee-plan-
 * version. Throws with the real endpoint's error code/message (never a
 * generic failure) if either call fails, or if the period genuinely has no
 * eligible platform-funded trip to turn into a batch. */
export async function ensureDriverReimbursementBatchFixture(
  options: EnsureReimbursementBatchFixtureOptions = {},
): Promise<ReimbursementBatchFixture> {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const driverId = options.driverId ?? DEFAULT_DRIVER_FIXTURE_ACTOR_ID;
  const periodMonth = options.periodMonth ?? FIXTURE_REIMBURSEMENT_PERIOD_MONTH;
  const token = options.opsToken ?? (await issueOpsSessionFixture()).token;

  const publish = await callApi(baseUrl, "/api/driver-fee-plans/publish", {
    method: "POST",
    token,
    body: {
      planName: FIXTURE_REIMBURSEMENT_FEE_PLAN_NAME,
      version: FIXTURE_REIMBURSEMENT_FEE_PLAN_VERSION,
      serviceFeeBps: 0,
      reimbursementMode: "platform_funded",
    },
  });
  const alreadyPublished =
    publish.status === 409 && publish.body?.error?.code === "FEE_PLAN_IMMUTABLE";
  if (publish.status >= 300 && !alreadyPublished) {
    throw new Error(
      `Failed to publish the fixture driver fee plan (${publish.status}): ` +
        `${JSON.stringify(publish.body)}`,
    );
  }

  const generate = await callApi(baseUrl, "/api/driver-statements/generate", {
    method: "POST",
    token,
    idempotencyKey: `fixture-driver-statements-${driverId}-${periodMonth}`,
    body: { driverId, periodMonth },
  });
  if (generate.status >= 300) {
    throw new Error(
      `Failed to generate driver statements for the fixture batch (${generate.status}): ` +
        `${JSON.stringify(generate.body)}`,
    );
  }
  const batchId: string | undefined = generate.body?.data?.reimbursementBatchIds?.[0];
  if (!batchId) {
    throw new Error(
      `generateDriverStatements for driver ${driverId}/${periodMonth} produced no ` +
        `reimbursement batch (response: ${JSON.stringify(generate.body)}); this seed's ` +
        "platform-funded trip may be missing on this deployment.",
    );
  }
  return { batchId, driverId, periodMonth };
}

/** Verifies (never creates or mutates) that `versionId` (default
 * `public-info-demo-001`, `platform-admin.service.ts`'s `PUBLIC_INFO_SEED`)
 * exists on the target deployment and is still usable --
 * `PlatformAdminService#onModuleInit` (:602-621) persists that exact seeded
 * row into the real database the first time this service boots against an
 * empty one, so it is already a genuinely owned business row on any
 * deployment that has started at least once; no separate creation step is
 * needed. Throws a concrete, actionable error (not a silent fallback) if
 * it is missing or retired (`effectiveTo` in the past), since
 * `requirePublicInfoVersion` (platform-admin.service.ts:2641-2657) would
 * reject either the same way the real placard-generation call does. */
export async function verifyPublicInfoVersionFixture(
  options: VerifyPublicInfoVersionFixtureOptions = {},
): Promise<PublicInfoVersionFixture> {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const versionId = options.versionId ?? "public-info-demo-001";
  const token = options.token ?? (await issueOpsSessionFixture()).token;

  const list = await callApi(baseUrl, "/api/platform-admin/public-info", {
    method: "GET",
    token,
  });
  if (list.status >= 300) {
    throw new Error(
      `Failed to list public info versions (${list.status}): ${JSON.stringify(list.body)}`,
    );
  }
  const items: Array<{ versionId: string; status: string; effectiveTo: string | null }> =
    list.body?.data?.items ?? [];
  const match = items.find((item) => item.versionId === versionId);
  if (!match) {
    throw new Error(
      `Public info version ${versionId} does not exist on this deployment; ` +
        "run PlatformAdminService#createPublicInfoVersion + publishPublicInfoVersion " +
        "through the real API to provision one before using this fixture.",
    );
  }
  if (match.status !== "published") {
    throw new Error(
      `Public info version ${versionId} is not published (status: ${match.status}).`,
    );
  }
  if (match.effectiveTo && Date.parse(match.effectiveTo) <= Date.now()) {
    throw new Error(
      `Public info version ${versionId} is retired (effectiveTo: ${match.effectiveTo}).`,
    );
  }
  return { versionId };
}

// Manual runbook entry point (docs/04-uat/gcp-artifact-activation-20261004.md
// §4's DRIVER_TOKEN/OPS_TOKEN export step): `cd apps/api && pnpm exec tsx
// ../../tests/support/signed-session-fixture.ts driver [actorId]` (or `ops
// [actorId]`), with `DATABASE_URL` set to the target deployment's database.
// `driver` with no actorId defaults to the registry's offline demo seed
// (DEFAULT_DRIVER_FIXTURE_ACTOR_ID) -- that only proves the auth/registry
// boundary, not that this actor owns a reimbursement batch or public-info
// version on the target database; pass an explicit, pre-provisioned actorId
// for a hosted run that needs real driver-owned business records. Prints
// only the bearer token to stdout so it can be captured directly into a
// shell variable; everything else goes to stderr.
//
// Two further subcommands close that gap by provisioning (or verifying) the
// actual business rows the proof/placard flows need, through the target
// deployment's own running API (`FIXTURE_API_BASE_URL`, never a direct
// database write -- see resolveApiBaseUrl above):
//   `... signed-session-fixture.ts reimbursement-batch [driverId] [periodMonth]`
//   `... signed-session-fixture.ts public-info-version [versionId]`
// Both print only the resulting id to stdout; everything else goes to
// stderr.
if (require.main === module) {
  const kind = process.argv[2];
  if (kind === "reimbursement-batch") {
    ensureDriverReimbursementBatchFixture({
      driverId: process.argv[3],
      periodMonth: process.argv[4],
    })
      .then((fixture) => {
        console.error(
          `Ensured reimbursement batch ${fixture.batchId} for driver ${fixture.driverId}/${fixture.periodMonth}`,
        );
        process.stdout.write(`${fixture.batchId}\n`);
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  } else if (kind === "public-info-version") {
    verifyPublicInfoVersionFixture({ versionId: process.argv[3] })
      .then((fixture) => {
        console.error(`Verified public info version ${fixture.versionId}`);
        process.stdout.write(`${fixture.versionId}\n`);
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  } else {
    const actorId = process.argv[3];
    const run =
      kind === "ops"
        ? issueOpsSessionFixture(actorId ? { actorId } : {})
        : issueDriverSessionFixture(actorId ? { actorId } : {});
    run
      .then((fixture) => {
        console.error(
          `Issued ${kind === "ops" ? "ops" : "driver"} session ${fixture.sessionId} for actor ${fixture.actorId}`,
        );
        process.stdout.write(`${fixture.token}\n`);
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}
