import { afterEach, describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const TABLES = [
  "ops.phase1_tenant_notification_preferences",
  "ops.phase1_tenant_webhook_endpoints",
  "ops.phase1_tenant_webhook_deliveries",
  "ops.phase1_tenant_sla_profiles",
  "admin.phase1_partner_channel_entries",
  "admin.phase1_partner_ingress_credentials",
  "admin.phase1_partner_eligibility_verifications",
  "ops.phase1_tenant_approval_rules",
  "ops.phase1_tenant_booking_approval_requests",
  "ops.phase1_tenant_booking_approval_decisions",
  "ops.phase1_tenant_passengers",
  "ops.phase1_tenant_addresses",
  "ops.phase1_tenant_cost_centers",
  "ops.phase1_tenant_quota_policies",
  "ops.phase1_tenant_quota_ledger",
  "ops.phase1_tenant_quota_monthly_snapshots",
  "identity.phase1_tenant_user_roles",
  "identity.phase1_tenant_api_keys",
] as const;

type SharedSqlCall = {
  instanceId: string;
  sql: string;
  params: unknown[];
};

function createSharedDbPort() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>(
    TABLES.map((name) => [name, new Map()]),
  );
  const calls: SharedSqlCall[] = [];

  function exec(instanceId: string, rawSql: string, params: unknown[] = []) {
    const sql = String(rawSql).replace(/\s+/g, " ").trim();
    calls.push({ instanceId, sql, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }

    const selectMatch = sql.match(
      /^SELECT record FROM ([a-z_]+\.[a-z0-9_]+)(.*)$/i,
    );
    if (selectMatch) {
      const table = tables.get(selectMatch[1]!) ?? new Map();
      let records = Array.from(table.values()).map((row) =>
        structuredClone(row),
      );
      if (
        /WHERE entry_slug = \$1/i.test(selectMatch[2] ?? "") &&
        params[0] !== undefined
      ) {
        records = records.filter(
          (record) => record.entrySlug === String(params[0]),
        );
      }
      if (/ORDER BY updated_at DESC, created_at DESC/i.test(selectMatch[2] ?? "")) {
        records.sort((left, right) => {
          const updatedCompare = String(right.updatedAt ?? "").localeCompare(
            String(left.updatedAt ?? ""),
          );
          if (updatedCompare !== 0) {
            return updatedCompare;
          }
          return String(right.createdAt ?? "").localeCompare(
            String(left.createdAt ?? ""),
          );
        });
      } else if (/ORDER BY created_at DESC/i.test(selectMatch[2] ?? "")) {
        records.sort((left, right) =>
          String(right.createdAt ?? "").localeCompare(
            String(left.createdAt ?? ""),
          ),
        );
      }
      return {
        rows: records.map((record) => ({ record })),
        rowCount: records.length,
      };
    }

    const insertMatch = sql.match(/^INSERT INTO ([a-z_]+\.[a-z0-9_]+)\b/i);
    if (insertMatch) {
      const tableName = insertMatch[1]!;
      let table = tables.get(tableName);
      if (!table) {
        table = new Map();
        tables.set(tableName, table);
      }
      const rawRecord = params[params.length - 1];
      const record =
        typeof rawRecord === "string"
          ? (JSON.parse(rawRecord) as Record<string, unknown>)
          : structuredClone((rawRecord ?? {}) as Record<string, unknown>);
      const key = String(params[0] ?? record.entrySlug ?? record.keyId ?? "");
      table.set(key, record);
      return { rows: [], rowCount: 1 };
    }

    if (/^DELETE FROM/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unhandled SQL in sharedDbPort: ${sql}`);
  }

  return {
    calls,
    tables,
    clientFor(instanceId: string) {
      return {
        isEnabled: () => true,
        query: async (sql: string, params: unknown[] = []) =>
          exec(instanceId, sql, params),
        withTransaction: async <T>(
          fn: (tx: {
            query: (sql: string, params?: unknown[]) => Promise<unknown>;
          }) => Promise<T>,
        ) => {
          exec(instanceId, "BEGIN", []);
          try {
            const out = await fn({
              query: async (sql: string, params: unknown[] = []) =>
                exec(instanceId, sql, params),
            });
            exec(instanceId, "COMMIT", []);
            return out;
          } catch (error) {
            exec(instanceId, "ROLLBACK", []);
            throw error;
          }
        },
      };
    },
  };
}

async function createWarmInstance(
  db: ReturnType<typeof createSharedDbPort>,
  id: string,
) {
  const repo = new TenantPartnerRepository(db.clientFor(id) as never);
  const audit = new AuditNotificationService();
  const service = new TenantPartnerService(audit, repo);
  await service.onModuleInit();

  const jwtStub = {
    issueSessionToken: async (identity: Record<string, unknown>) => ({
      token: `jwt-${id}-${String(identity.actorId ?? "actor")}`,
      expiresIn: "15m",
      expiresAt: "2026-10-21T22:00:00.000Z",
      sessionId: `sess-${id}`,
    }),
  };
  const idempotencyStub = {
    execute: async ({ execute }: { execute: () => Promise<unknown> }) =>
      await execute(),
  };
  const controller = new TenantPartnerController(
    service,
    {} as never,
    {} as never,
    jwtStub as never,
    idempotencyStub as never,
  );
  const authController = new AuthController(
    jwtStub as never,
    service,
    {} as never,
  );

  return { id, repo, service, controller, authController };
}

async function attempt<T>(fn: () => T | Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return {
        ok: false as const,
        status: error.getStatus(),
        code: error.code,
        message: error.message,
      };
    }
    throw error;
  }
}

describe("PARTNER-ENTRY-CREDENTIAL-CANONICAL-READBACK-20261021: Cross-instance canonical partner entry & credential lifecycle", () => {
  const servicesToDestroy: TenantPartnerService[] = [];

  afterEach(() => {
    while (servicesToDestroy.length > 0) {
      servicesToDestroy.pop()?.onModuleDestroy();
    }
  });

  it("1. Qualified diagnostic proof: 2 normal business cases and all 6 cross-warm-instance assertions pass with canonical SQL readback", async () => {
    const db = createSharedDbPort();
    const a = await createWarmInstance(db, "A");
    const b = await createWarmInstance(db, "B");
    servicesToDestroy.push(a.service, b.service);

    const slug = "partner-Diagnostic-20261021";
    const createCmd = {
      tenantId: "tenant-diag-001",
      partnerCode: "diag_partner",
      partnerType: "referral_channel" as const,
      programId: "prog-diag-001",
      programCode: "PROG_DIAG",
      entrySlug: slug,
      displayName: "Diag Partner Entry",
      businessDispatchSubtype: "enterprise_dispatch" as const,
      authMode: "partner_api_key" as const,
      eligibilityMode: "none" as const,
      entryHost: "diag.partner.example",
      entryPath: "/partner/diag",
      themeAccent: "#123456",
    };

    const callsBeforeCreate = db.calls.length;
    const created = (await a.controller.createPlatformPartnerEntry(createCmd))
      .data;
    const aCreateInsert = db.calls
      .slice(callsBeforeCreate)
      .some(
        (c) =>
          c.instanceId === "A" &&
          /INSERT INTO admin\.phase1_partner_channel_entries/i.test(c.sql),
      );
    expect(created.entrySlug).toBe(slug.toLowerCase());
    expect(aCreateInsert).toBe(true);
    expect(
      a.controller.getPartnerEntry(created.entrySlug).data.entrySlug,
    ).toBe(created.entrySlug);

    // Existing canonical lookup control on warm instance B
    const bCanonicalReferralLookup = await b.repo.loadReferralRateEntries(
      created.entrySlug,
    );
    expect(bCanonicalReferralLookup.map((e) => e.entrySlug)).toEqual([
      created.entrySlug,
    ]);

    // Case 1: Warm instance B GET / list / update / revoke on canonical entry created by A
    const beforeBEntryOps = db.calls.length;
    const bPublicGet = await attempt(() =>
      b.controller.getPartnerEntry(created.entrySlug),
    );
    const bPublicListHas = (
      await b.controller.listPartnerEntries()
    ).data.items.some((e) => e.entrySlug === created.entrySlug);
    const bAdminListHas = (
      await b.controller.listPlatformPartnerEntries()
    ).data.items.some((e) => e.entrySlug === created.entrySlug);
    const bUpdate = await attempt(() =>
      b.controller.updatePlatformPartnerEntry(created.entrySlug, {
        displayName: "Updated On B",
      }),
    );
    const bRevoke = await attempt(() =>
      b.controller.revokePlatformPartnerEntry(created.entrySlug),
    );
    const bEntryDbCalls = db.calls
      .slice(beforeBEntryOps)
      .filter((c) => c.instanceId === "B");
    const bReads = bEntryDbCalls.filter((c) =>
      /SELECT record FROM admin\.phase1_partner_channel_entries/i.test(c.sql),
    ).length;

    expect(bPublicGet.ok).toBe(true);
    if (bPublicGet.ok) {
      expect(bPublicGet.value.data.entrySlug).toBe(created.entrySlug);
    }
    expect(bPublicListHas).toBe(true);
    expect(bAdminListHas).toBe(true);
    expect(bUpdate.ok).toBe(true);
    if (bUpdate.ok) {
      expect(bUpdate.value.data.displayName).toBe("Updated On B");
    }
    expect(bRevoke.ok).toBe(true);
    if (bRevoke.ok) {
      expect(bRevoke.value.data.status).toBe("revoked");
      expect(bRevoke.value.data.activeFlag).toBe(false);
    }
    expect(bReads).toBeGreaterThanOrEqual(1);

    // Fresh instance C control
    const c = await createWarmInstance(db, "C");
    servicesToDestroy.push(c.service);
    expect(
      (await c.controller.listPlatformPartnerEntries()).data.items.some(
        (e) => e.entrySlug === created.entrySlug && e.status === "revoked",
      ),
    ).toBe(true);

    // Case 2: Both warm instances A and B know active entry `slug2`, then A issues key; warm B lists and revokes key
    const slug2 = "partner-key-diag-20261021";
    await a.controller.createPlatformPartnerEntry({
      ...createCmd,
      entrySlug: slug2,
    });
    const b2 = await createWarmInstance(db, "B2");
    servicesToDestroy.push(b2.service);
    expect(
      (await b2.controller.getPartnerEntry(slug2)).data.entrySlug,
    ).toBe(slug2);

    const beforeKeyIssue = db.calls.length;
    const issued = (
      await a.controller.issuePlatformPartnerIngressCredential(slug2, {
        rotationReason: "initial",
      })
    ).data;
    const aKeyInsert = db.calls
      .slice(beforeKeyIssue)
      .some(
        (c) =>
          c.instanceId === "A" &&
          /INSERT INTO admin\.phase1_partner_ingress_credentials/i.test(c.sql),
      );
    expect(aKeyInsert).toBe(true);
    expect(
      a.controller
        .listPlatformPartnerIngressCredentials(slug2)
        .data.items.some((k) => k.keyId === issued.credential.keyId),
    ).toBe(true);

    const beforeB2KeyOps = db.calls.length;
    const b2Listed = (
      await b2.controller.listPlatformPartnerIngressCredentials(slug2)
    ).data.items;
    const b2ListHasIssued = b2Listed.some(
      (k) => k.keyId === issued.credential.keyId,
    );
    const b2RevokeKey = await attempt(() =>
      b2.controller.revokePlatformPartnerIngressCredential(
        slug2,
        issued.credential.keyId,
        { revokeReason: "cleanup" },
      ),
    );
    const b2KeyDbCalls = db.calls
      .slice(beforeB2KeyOps)
      .filter((c) => c.instanceId === "B2");
    const b2KeyReads = b2KeyDbCalls.filter((c) =>
      /SELECT record FROM admin\.phase1_partner_ingress_credentials/i.test(
        c.sql,
      ),
    ).length;

    expect(b2ListHasIssued).toBe(true);
    expect(b2RevokeKey.ok).toBe(true);
    if (b2RevokeKey.ok) {
      expect(b2RevokeKey.value.data.keyId).toBe(issued.credential.keyId);
      expect(b2RevokeKey.value.data.status).toBe("revoked");
      expect(b2RevokeKey.value.data.revokedAt).toEqual(expect.any(String));
    }
    expect(b2KeyReads).toBeGreaterThanOrEqual(1);

    // Fresh C2 control
    const c2 = await createWarmInstance(db, "C2");
    servicesToDestroy.push(c2.service);
    expect(
      (
        await c2.controller.listPlatformPartnerIngressCredentials(slug2)
      ).data.items.some(
        (k) =>
          k.keyId === issued.credential.keyId &&
          Boolean(k.revokedAt) &&
          k.status === "revoked",
      ),
    ).toBe(true);
  });

  it("2. Partial update on warm instance B preserves unpatched canonical fields from A, and deactivate/revoke transitions propagate back to warm instance A", async () => {
    const db = createSharedDbPort();
    const a = await createWarmInstance(db, "A");
    const b = await createWarmInstance(db, "B");
    servicesToDestroy.push(a.service, b.service);

    const slug = "partner-partial-update-20261021";
    await a.controller.createPlatformPartnerEntry({
      tenantId: "tenant-preserve-001",
      partnerCode: "preserve_partner",
      partnerType: "referral_channel",
      programId: "prog-preserve-001",
      programCode: "PROG_PRESERVE",
      bankCode: null,
      entrySlug: slug,
      displayName: "Original Display Name",
      businessDispatchSubtype: "enterprise_dispatch",
      authMode: "partner_api_key",
      eligibilityMode: "none",
      entryHost: "preserve.partner.example",
      entryPath: "/embed/preserve",
      themeAccent: "#0F766E",
      brandingMetadata: {
        displayName: "Original Display Name",
        themeAccent: "#0F766E",
        supportEmail: "support@preserve.example",
        supportPhone: "0800-123-456",
      },
    });

    // Warm B performs a partial update (only displayName)
    const updatedOnB = (
      await b.controller.updatePlatformPartnerEntry(slug, {
        displayName: "Patched Display Name",
      })
    ).data;

    expect(updatedOnB.displayName).toBe("Patched Display Name");
    expect(updatedOnB.tenantId).toBe("tenant-preserve-001");
    expect(updatedOnB.partnerCode).toBe("preserve_partner");
    expect(updatedOnB.partnerType).toBe("referral_channel");
    expect(updatedOnB.programId).toBe("prog-preserve-001");
    expect(updatedOnB.programCode).toBe("PROG_PRESERVE");
    expect(updatedOnB.entryHost).toBe("preserve.partner.example");
    expect(updatedOnB.entryPath).toBe("/embed/preserve");
    expect(updatedOnB.themeAccent).toBe("#0F766E");
    expect(updatedOnB.brandingMetadata).not.toBeNull();
    expect(updatedOnB.brandingMetadata?.supportEmail).toBe(
      "support@preserve.example",
    );
    expect(updatedOnB.brandingMetadata?.supportPhone).toBe("0800-123-456");

    // Warm A reads back the patched displayName from canonical storage
    const readOnA = (await a.controller.getPartnerEntry(slug)).data;
    expect(readOnA.displayName).toBe("Patched Display Name");

    // Warm B deactivates the entry
    const deactivatedOnB = (
      await b.controller.deactivatePlatformPartnerEntry(slug)
    ).data;
    expect(deactivatedOnB.status).toBe("inactive");
    expect(deactivatedOnB.activeFlag).toBe(false);

    // Warm A public getPartnerEntry now rejects 404 PARTNER_ENTRY_INACTIVE while admin list shows inactive
    const publicGetInactiveOnA = await attempt(() =>
      a.controller.getPartnerEntry(slug),
    );
    expect(publicGetInactiveOnA).toMatchObject({
      ok: false,
      status: 404,
      code: "PARTNER_ENTRY_INACTIVE",
    });
    expect(
      (await a.controller.listPartnerEntries()).data.items.some(
        (e) => e.entrySlug === slug,
      ),
    ).toBe(false);
    expect(
      (await a.controller.listPlatformPartnerEntries()).data.items.find(
        (e) => e.entrySlug === slug,
      )?.status,
    ).toBe("inactive");

    // Warm A reactivates the entry, and Warm B sees it active again
    await a.controller.activatePlatformPartnerEntry(slug);
    expect((await b.controller.getPartnerEntry(slug)).data.status).toBe(
      "active",
    );

    // Warm B revokes the entry; Warm A cannot reactivate a revoked entry
    await b.controller.revokePlatformPartnerEntry(slug);
    const reactivateRevokedOnA = await attempt(() =>
      a.controller.activatePlatformPartnerEntry(slug),
    );
    expect(reactivateRevokedOnA).toMatchObject({
      ok: false,
      status: 409,
      code: "PARTNER_ENTRY_REVOKED",
    });
  });

  it("3. Actual public bootstrap (AuthController.issuePartnerBootstrapSession) and handoff (TenantPartnerController.issuePartnerIngressHandoff) consumers resolve canonical entry/credentials across warm instances and honor cross-instance revocation", async () => {
    const db = createSharedDbPort();
    const a = await createWarmInstance(db, "A");
    const b = await createWarmInstance(db, "B");
    servicesToDestroy.push(a.service, b.service);

    const slug = "partner-bootstrap-handoff-20261021";
    await a.controller.createPlatformPartnerEntry({
      tenantId: "tenant-boot-001",
      partnerCode: "boot_partner",
      partnerType: "referral_channel",
      programId: "prog-boot-001",
      programCode: "PROG_BOOT",
      entrySlug: slug,
      displayName: "Bootstrap Handoff Partner",
      businessDispatchSubtype: "enterprise_dispatch",
      authMode: "partner_api_key",
      eligibilityMode: "none",
      entryHost: "boot.partner.example",
      entryPath: "/partner/boot",
      themeAccent: "#0B7285",
    });

    const firstIssued = (
      await a.controller.issuePlatformPartnerIngressCredential(slug, {
        rotationReason: "initial_issue",
      })
    ).data;

    // Warm B (which initialized BEFORE `slug` and `firstIssued` existed) authenticates bootstrap via AuthController
    const bootstrapOnB = (
      await b.authController.issuePartnerBootstrapSession(
        {
          entrySlug: slug,
          apiKey: firstIssued.plaintextKey,
        },
        "req-boot-b-1",
      )
    ).data;
    expect(bootstrapOnB.partnerEntry.entrySlug).toBe(slug);
    expect(bootstrapOnB.identity.actorId).toBe(firstIssued.credential.keyId);
    expect(bootstrapOnB.identity.tenantId).toBe("tenant-boot-001");

    // Warm B issues partner ingress handoff using the API key issued on A
    const handoffOnB = (
      await b.controller.issuePartnerIngressHandoff(
        {
          entrySlug: slug,
          apiKey: firstIssued.plaintextKey,
          partnerUserRef: "partner-user-001",
        },
        undefined,
        "req-handoff-b-1",
      )
    ).data;
    expect(handoffOnB.partnerEntrySlug).toBe(slug);
    expect(handoffOnB.identity.tenantId).toBe("tenant-boot-001");
    expect(handoffOnB.accessToken).toContain("jwt-B-");

    // Warm B rotates the credential; first key enters overlap_active and new key is active
    const rotatedOnB = (
      await b.controller.issuePlatformPartnerIngressCredential(slug, {
        rotationReason: "scheduled_rotation",
        overlapDays: 7,
      })
    ).data;
    expect(rotatedOnB.revokedCredentialId).toBe(firstIssued.credential.keyId);

    // Warm A can immediately authenticate with the rotated key issued on B
    const bootstrapRotatedOnA = (
      await a.authController.issuePartnerBootstrapSession(
        {
          entrySlug: slug,
          apiKey: rotatedOnB.plaintextKey,
        },
        "req-boot-a-rotated",
      )
    ).data;
    expect(bootstrapRotatedOnA.identity.actorId).toBe(
      rotatedOnB.credential.keyId,
    );

    // Warm B revokes the first key; Warm A immediately rejects the revoked key with 401 PARTNER_API_KEY_REVOKED
    await b.controller.revokePlatformPartnerIngressCredential(
      slug,
      firstIssued.credential.keyId,
      { revokeReason: "compromised_key" },
    );

    const rejectedBootstrapOnA = await attempt(() =>
      a.authController.issuePartnerBootstrapSession(
        {
          entrySlug: slug,
          apiKey: firstIssued.plaintextKey,
        },
        "req-boot-a-revoked",
      ),
    );
    expect(rejectedBootstrapOnA).toMatchObject({
      ok: false,
      status: 401,
      code: "AUTH_CREDENTIALS_INVALID",
    });

    const rejectedServiceBootstrapOnA = await attempt(() =>
      a.service.resolvePartnerBootstrapAuthentication(
        {
          entrySlug: slug,
          apiKey: firstIssued.plaintextKey,
        },
        "req-svc-boot-a-revoked",
      ),
    );
    expect(rejectedServiceBootstrapOnA).toMatchObject({
      ok: false,
      status: 401,
      code: "PARTNER_API_KEY_REVOKED",
    });

    const rejectedHandoffOnA = await attempt(() =>
      a.controller.issuePartnerIngressHandoff(
        {
          entrySlug: slug,
          apiKey: firstIssued.plaintextKey,
          partnerUserRef: "partner-user-001",
        },
        undefined,
        "req-handoff-a-revoked",
      ),
    );
    expect(rejectedHandoffOnA).toMatchObject({
      ok: false,
      status: 401,
      code: "PARTNER_API_KEY_REVOKED",
    });
  });

  it("4. Cross-instance duplicate entry creation rejects 409 PARTNER_ENTRY_CONFLICT, cross-instance entry revocation cascades to credentials issued on another instance, and no-DB mode stays intact", async () => {
    const db = createSharedDbPort();
    const a = await createWarmInstance(db, "A");
    const b = await createWarmInstance(db, "B");
    servicesToDestroy.push(a.service, b.service);

    const slug = "partner-cascade-revoke-20261021";
    const createCmd = {
      tenantId: "tenant-cascade-001",
      partnerCode: "cascade_partner",
      partnerType: "referral_channel" as const,
      programId: "prog-cascade-001",
      programCode: "PROG_CASCADE",
      entrySlug: slug,
      displayName: "Cascade Partner",
      businessDispatchSubtype: "enterprise_dispatch" as const,
      authMode: "partner_api_key" as const,
      eligibilityMode: "none" as const,
      entryHost: "cascade.partner.example",
      entryPath: "/partner/cascade",
      themeAccent: "#334155",
    };

    await a.controller.createPlatformPartnerEntry(createCmd);
    const issuedOnA = (
      await a.controller.issuePlatformPartnerIngressCredential(slug, {
        rotationReason: "initial",
      })
    ).data;

    // Duplicate create on warm instance B must reject 409 PARTNER_ENTRY_CONFLICT
    const duplicateOnB = await attempt(() =>
      b.controller.createPlatformPartnerEntry(createCmd),
    );
    expect(duplicateOnB).toMatchObject({
      ok: false,
      status: 409,
      code: "PARTNER_ENTRY_CONFLICT",
    });

    // Warm B revokes the entry; this must also revoke A's issued credential in canonical storage
    const revokedEntryOnB = (
      await b.controller.revokePlatformPartnerEntry(slug)
    ).data;
    expect(revokedEntryOnB.status).toBe("revoked");

    // Warm A sees both the entry and the credential as revoked
    const credentialsOnA = (
      await a.controller.listPlatformPartnerIngressCredentials(slug)
    ).data.items;
    expect(
      credentialsOnA.some(
        (c) =>
          c.keyId === issuedOnA.credential.keyId &&
          Boolean(c.revokedAt) &&
          c.revokeReason === "partner_entry_revoked",
      ),
    ).toBe(true);

    const handoffAfterEntryRevokeOnA = await attempt(() =>
      a.controller.issuePartnerIngressHandoff(
        {
          entrySlug: slug,
          apiKey: issuedOnA.plaintextKey,
          partnerUserRef: "partner-user-cascade",
        },
        undefined,
        "req-handoff-cascade",
      ),
    );
    expect(handoffAfterEntryRevokeOnA).toMatchObject({
      ok: false,
      status: 403,
      code: "PARTNER_ENTRY_REVOKED",
    });

    // Deliberate no-DB mode remains intact
    const noDbRepo = new TenantPartnerRepository();
    const noDbService = new TenantPartnerService(
      new AuditNotificationService(),
      noDbRepo,
    );
    servicesToDestroy.push(noDbService);
    await noDbService.onModuleInit();
    expect(noDbService.isPersistenceEnabled()).toBe(false);
    const noDbCreated = await noDbService.createPlatformPartnerEntry({
      ...createCmd,
      entrySlug: "partner-nodb-20261021",
    });
    expect(noDbService.getPartnerEntry(noDbCreated.entrySlug).entrySlug).toBe(
      "partner-nodb-20261021",
    );
  });
});
