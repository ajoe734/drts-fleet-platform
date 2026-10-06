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
  const roleBinding = await repo.ensureRoleBindingRecord({
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
if (require.main === module) {
  const kind = process.argv[2];
  const actorId = process.argv[3] || undefined;
  const run =
    kind === "ops"
      ? issueOpsSessionFixture({ actorId })
      : issueDriverSessionFixture({ actorId });
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
