import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import type { DatabaseService as DatabaseServiceType } from "../../../apps/api/src/common/db/database.service";
import type { IdentityRepository as IdentityRepositoryType } from "../../../apps/api/src/modules/identity/identity.repository";

// Disposable personnel setup for the existing GitHub-hosted Agency journey.
// This seeds ordinary durable identity rows, not a token or an Agency session.
// The test still uses HTTP /api/auth/token, then the real Agency invitation,
// Google SIM callback and normal BFF/session path for the business flow.
export async function seedAgencyPlatformPersonnel(): Promise<{
  actorId: string;
  membershipId: string;
}> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Agency personnel fixture requires the hosted database URL.",
    );
  }
  const apiRequire = createRequire(
    resolve(__dirname, "../../../apps/api/package.json"),
  );
  apiRequire("reflect-metadata");
  const { DatabaseService } = apiRequire(
    "./dist/common/db/database.service.js",
  ) as { DatabaseService: new () => DatabaseServiceType };
  const { IdentityRepository } = apiRequire(
    "./dist/modules/identity/identity.repository.js",
  ) as {
    IdentityRepository: new (
      database: DatabaseServiceType,
    ) => IdentityRepositoryType;
  };
  const database = new DatabaseService();
  const repository = new IdentityRepository(database);
  try {
    await repository.onModuleInit();
    const actorId = `agency-business-admin-${randomUUID()}`;
    const membershipId = `membership-${actorId}`;
    const now = new Date().toISOString();
    // Match JwtAuthService.buildPrincipalRecord for the existing HTTP
    // bootstrap exchange (issuer is fixed by the suite's API configuration).
    // Reusing the default IAP principal here would change source_ref and
    // collide with its existing primary key instead of creating a session.
    const principal = await repository.ensurePrincipalRecord({
      principalId: actorId,
      sourceRef: `jwt_principal:platform:${actorId}`,
      issuer: "drts-local",
      subject: actorId,
      principalType: "human",
      email: null,
      emailVerified: false,
      displayName: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const membership = await repository.ensureMembershipRecord({
      membershipId,
      sourceRef: `agency_business_fixture:membership:${actorId}`,
      principalId: principal.principalId,
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
    const binding = await repository.ensureRoleBindingRecord({
      roleBindingId: `role-${actorId}`,
      sourceRef: `agency_business_fixture:role:${actorId}`,
      membershipId: membership.membershipId,
      roleCode: "platform_admin",
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom: now,
      validTo: null,
      createdAt: now,
      updatedAt: now,
    });
    if (
      principal.principalId !== actorId ||
      membership.principalId !== actorId ||
      binding.membershipId !== membershipId
    ) {
      throw new Error(
        "Agency personnel fixture persisted an unexpected identity.",
      );
    }
    return { actorId, membershipId };
  } finally {
    await database.onModuleDestroy();
  }
}
