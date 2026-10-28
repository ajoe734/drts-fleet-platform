import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CreatePartnerChannelEntryCommand,
  FleetPartnerRecord,
  PartnerChannelEntryRecord,
} from "../../../packages/contracts/src";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { OidcPkceService } from "../../../apps/api/src/modules/auth/oidc-pkce.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { PartnerUserIdentityLinkRepository } from "../../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import type { AuthenticatedRequestLike } from "../../../apps/api/src/common/auth/auth.types";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { resolveFleetPrincipal } from "../../../apps/fleet-partner-portal-web/lib/fleet-principal.server";

const { Reflector } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/core");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const FLEET = "fleet-demo-001";
const MASTER: FleetPartnerRecord = {
  fleetPartnerId: FLEET,
  active: true,
  partnershipType: "fleet_management",
  legalName: "Synthetic Fleet",
  displayName: "Synthetic Fleet",
  businessRegistrationNo: "SYNTHETIC-UNIT-ONLY",
  contactName: "Synthetic Contact",
  contactPhone: "SYNTHETIC-NO-DELIVERY",
};

function command(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-demo-001",
    partnerCode: "synthetic-fleet-binding",
    partnerType: "fleet_partner",
    programId: "synthetic-existing-program",
    entrySlug: "synthetic-fleet-binding",
    displayName: "Synthetic Fleet Binding",
    businessDispatchSubtype: "enterprise_dispatch",
    authMode: "partner_api_key",
    eligibilityMode: "none",
    fleetPartnerId: FLEET,
    ...overrides,
  } as CreatePartnerChannelEntryCommand;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Only the external DB query boundary is controlled. These are the actual
// repositories, service, serializers and SQL, without a product/PG server.
interface SetupOptions {
  fleet?: FleetPartnerRecord | null;
  enabled?: boolean;
  fleetEnabled?: boolean;
  entryEnabled?: boolean;
  omitFleetRepository?: boolean;
  omitEntryRepository?: boolean;
  physicalActive?: boolean;
  fleetQueryError?: Error;
  holdWrite?: ReturnType<typeof deferred>;
}

function setup(options: SetupOptions = {}) {
  const entries = new Map<string, PartnerChannelEntryRecord>();
  const credentials = new Map<string, Record<string, unknown>>();
  let nextHeldWrite = options.holdWrite;
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    if (sql.includes("FROM admin.phase1_fleet_partners")) {
      if (options.fleetQueryError) throw options.fleetQueryError;
      if (options.physicalActive === false && /active\s*=\s*true/.test(sql)) {
        return { rows: [] };
      }
      const fleet = options.fleet === undefined ? MASTER : options.fleet;
      return { rows: fleet ? [{ record: structuredClone(fleet) }] : [] };
    }
    if (sql.includes("INSERT INTO admin.phase1_partner_channel_entries")) {
      const held = nextHeldWrite;
      nextHeldWrite = undefined;
      if (held) await held.promise;
      const entry = JSON.parse(
        String(values.at(-1)),
      ) as PartnerChannelEntryRecord;
      entries.set(entry.entrySlug, entry);
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO admin.phase1_partner_ingress_credentials")) {
      const credential = JSON.parse(String(values.at(-1))) as Record<
        string,
        unknown
      >;
      credentials.set(String(values[0]), credential);
      return { rows: [] };
    }
    if (sql.includes("FROM admin.phase1_partner_channel_entries")) {
      const entry = entries.get(String(values[0]));
      return { rows: entry ? [{ record: structuredClone(entry) }] : [] };
    }
    return { rows: [] };
  });
  const entryDb = {
    isEnabled: () => options.entryEnabled ?? options.enabled !== false,
    query,
  };
  const fleetDb = {
    isEnabled: () => options.fleetEnabled ?? options.enabled !== false,
    query,
  };
  const repository = new TenantPartnerRepository(entryDb as never);
  const fleetRepository = new FleetPartnerRepository(fleetDb as never);
  const audit = new AuditNotificationService();
  // Reflect preserves the old constructor's positional contract for the
  // immutable-before run, whose service has no trailing Fleet repository yet.
  const service = Reflect.construct(TenantPartnerService, [
    audit,
    options.omitEntryRepository ? undefined : repository,
    undefined,
    [],
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.omitFleetRepository ? undefined : fleetRepository,
  ]) as TenantPartnerService;
  const createdAudit = () =>
    audit
      .getAuditLogsSnapshot()
      .filter(
        (entry) =>
          entry.actionName === "create_partner_entry" &&
          entry.resourceId === "synthetic-fleet-binding",
      );
  return {
    service,
    repository,
    fleetRepository,
    entries,
    credentials,
    query,
    createdAudit,
  };
}

describe("normal Fleet Entry canonical binding", () => {
  it("derives the Entry ID from the actual active canonical master and reads the persisted binding back", async () => {
    const state = setup();
    const entry = await state.service.createPlatformPartnerEntry(command());
    expect(entry.partnerId).toBe(FLEET);
    expect(
      state.query.mock.calls.some(
        ([sql, values]) =>
          sql.includes("FROM admin.phase1_fleet_partners") &&
          values?.[0] === FLEET,
      ),
    ).toBe(true);
    expect(state.service.getPartnerEntry(entry.entrySlug).partnerId).toBe(
      FLEET,
    );
    expect(
      (await state.repository.findNotificationPartnerEntry(entry.entrySlug))
        ?.partnerId,
    ).toBe(FLEET);
    expect(state.createdAudit()).toHaveLength(1);
  });

  it.each<[string, SetupOptions, Record<string, unknown>]>([
    ["missing master", { fleet: null }, {}],
    ["inactive master", { fleet: { ...MASTER, active: false } }, {}],
    [
      "different canonical record",
      { fleet: { ...MASTER, fleetPartnerId: "fleet-other" } },
      {},
    ],
    ["disabled database", { enabled: false }, {}],
    [
      "physical inactive row despite active JSON",
      { physicalActive: false },
      {},
    ],
    ["disabled Fleet storage", { fleetEnabled: false }, {}],
    ["disabled Entry storage", { entryEnabled: false }, {}],
    ["absent Fleet storage", { omitFleetRepository: true }, {}],
    ["absent Entry storage", { omitEntryRepository: true }, {}],
    ["blank reference", {}, { fleetPartnerId: "   " }],
    ["nonstring reference", {}, { fleetPartnerId: 7 }],
    ["null reference", {}, { fleetPartnerId: null }],
    ["wrong partner type", {}, { partnerType: "bank_partner" }],
  ])(
    "rejects %s without a cache, durable Entry or success audit",
    async (_name, options, overrides) => {
      const state = setup(options);
      await expect(
        state.service.createPlatformPartnerEntry(command(overrides)),
      ).rejects.toBeInstanceOf(Error);
      expect(state.entries.size).toBe(0);
      expect(
        state.service
          .listPlatformPartnerEntries()
          .some((entry) => entry.entrySlug === "synthetic-fleet-binding"),
      ).toBe(false);
      expect(state.createdAudit()).toHaveLength(0);
    },
  );

  it("propagates canonical lookup failure without creating a phantom Entry", async () => {
    const failure = new Error("synthetic canonical read unavailable");
    const state = setup({ fleetQueryError: failure });
    await expect(
      state.service.createPlatformPartnerEntry(command()),
    ).rejects.toBe(failure);
    expect(state.entries.size).toBe(0);
    expect(state.createdAudit()).toHaveLength(0);
  });

  it("retains unbound random Entry behavior without consulting Fleet storage", async () => {
    const state = setup({ enabled: false });
    const entry = await state.service.createPlatformPartnerEntry(
      command({ fleetPartnerId: undefined, partnerType: "bank_partner" }),
    );
    expect(entry.partnerId).toMatch(/^partner_[0-9a-f-]+$/);
    expect(entry.partnerId).not.toBe(FLEET);
    expect(state.query).not.toHaveBeenCalled();
  });

  it("keeps the bound create pending until durable ACK and leaves rejected writes retryable", async () => {
    const held = deferred();
    const state = setup({ holdWrite: held });
    let settled = false;
    const pending = state.service.createPlatformPartnerEntry(command());
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await vi.waitFor(() =>
      expect(
        state.query.mock.calls.some(([sql]) =>
          sql.includes("INSERT INTO admin.phase1_partner_channel_entries"),
        ),
      ).toBe(true),
    );
    expect(settled).toBe(false);
    expect(state.createdAudit()).toHaveLength(0);
    expect(
      state.service
        .listPlatformPartnerEntries()
        .some((entry) => entry.entrySlug === "synthetic-fleet-binding"),
    ).toBe(false);
    held.reject(new Error("synthetic Entry commit rejected"));
    await expect(pending).rejects.toThrow("synthetic Entry commit rejected");
    expect(state.entries.size).toBe(0);
    expect(state.createdAudit()).toHaveLength(0);
    const retried = await state.service.createPlatformPartnerEntry(command());
    expect(retried.partnerId).toBe(FLEET);
    expect(state.entries.get(retried.entrySlug)?.partnerId).toBe(FLEET);
    expect(state.createdAudit()).toHaveLength(1);
  });

  it("normalizes an explicit Fleet ID but never uses arbitrary partnerId or permits Update rebinding", async () => {
    const state = setup();
    const entry = await state.service.createPlatformPartnerEntry(
      command({
        fleetPartnerId: ` ${FLEET} `,
        partnerId: "unverified-selector",
      }),
    );
    expect(entry.partnerId).toBe(FLEET);
    const updated = await state.service.updatePlatformPartnerEntry(
      entry.entrySlug,
      {
        displayName: "Updated display only",
        fleetPartnerId: "fleet-other",
        partnerId: "fleet-other",
      } as never,
    );
    expect(updated.partnerId).toBe(FLEET);
    expect(state.entries.get(entry.entrySlug)?.partnerId).toBe(FLEET);
  });

  it("serializes bound creates on the original slug mutex and rejects the queued duplicate", async () => {
    const held = deferred();
    const state = setup({ holdWrite: held });
    const first = state.service.createPlatformPartnerEntry(command());
    await vi.waitFor(() =>
      expect(
        state.query.mock.calls.some(([sql]) =>
          sql.includes("INSERT INTO admin.phase1_partner_channel_entries"),
        ),
      ).toBe(true),
    );
    const second = state.service.createPlatformPartnerEntry(command());
    const denied = expect(second).rejects.toMatchObject({
      code: "PARTNER_ENTRY_CONFLICT",
    });
    held.resolve();
    expect((await first).partnerId).toBe(FLEET);
    await denied;
    expect(state.entries.size).toBe(1);
    expect(state.createdAudit()).toHaveLength(1);
  });

  it("parameterizes even a hostile reference and never interpolates it into SQL", async () => {
    const state = setup({ fleet: null });
    const reference = "fleet-x' OR true --";
    await expect(
      state.service.createPlatformPartnerEntry(
        command({ fleetPartnerId: reference }),
      ),
    ).rejects.toMatchObject({ code: "FLEET_PARTNER_REFERENCE_INVALID" });
    const call = state.query.mock.calls.find(([sql]) =>
      sql.includes("FROM admin.phase1_fleet_partners"),
    );
    expect(call?.[0]).not.toContain(reference);
    expect(call?.[1]).toEqual([reference]);
    expect(state.entries.size).toBe(0);
  });

  it("keeps the persisted bound Fleet master ID in a plain linked OIDC session without a managed grant", async () => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("OIDC_MOCK_MODE", "true");
    vi.stubEnv("JWT_SECRET", "synthetic-binding-socket-free-unit-signing-key");
    const state = setup();
    const entry = await state.service.createPlatformPartnerEntry(command());
    expect(entry.partnerId).toBe(FLEET);
    expect(entry.entrySlug).not.toBe(FLEET);
    const code = "fleet_partner_plain_oidc_subject";
    const subject = `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`;
    const link = new PartnerUserIdentityLinkRepository();
    await link.resolveOrCreate({
      entrySlug: entry.entrySlug,
      partnerUserRef: subject,
    });
    const repository = new IdentityRepository();
    const jwt = new JwtAuthService(
      repository,
      state.service,
      undefined,
      undefined,
      link,
    );
    const oidc = new OidcPkceService(
      jwt,
      state.service,
      undefined,
      link,
      undefined,
      repository,
    );
    const login = oidc.generateLoginParameters("partner", {
      partnerId: entry.entrySlug,
    });
    const session = await oidc.exchangePartnerCallbackSession(
      {
        provider: "oidc",
        code,
        state: login.state,
        partnerId: entry.entrySlug,
        callbackUrl: "http://localhost:3000/api/auth/callback",
      },
      { stateToken: login.stateToken },
    );
    expect(session.partnerEntry.partnerId).toBe(FLEET);
    expect(session.identity).toMatchObject({
      partnerId: FLEET,
      partnerEntrySlug: entry.entrySlug,
      scopes: ["partner:read", "partner:write"],
    });
    expect(session.identity.membershipId).toBeUndefined();
    expect(session.identity.scopes).not.toContain("fleet:read");
    expect(session.identity.scopes).not.toContain("billing:read");
    expect(jwt.verify(session.accessToken)).toMatchObject({
      partnerId: FLEET,
      partnerEntrySlug: entry.entrySlug,
    });
    expect(
      await repository.getSession(session.identity.sessionId!),
    ).toMatchObject({
      partnerId: FLEET,
      partnerEntrySlug: entry.entrySlug,
      membershipId: null,
    });
    expect(await jwt.verifyAccessToken(session.accessToken)).toMatchObject({
      partnerId: FLEET,
      partnerEntrySlug: entry.entrySlug,
    });
    const guard = new BootstrapAuthGuard(new Reflector(), jwt);
    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method: "GET",
            url: "/api/fleet-partner/drivers",
            headers: { authorization: `Bearer ${session.accessToken}` },
          }),
        }),
        getHandler: () => FleetPartnerController.prototype.listPortalDrivers,
        getClass: () => FleetPartnerController,
      } as never),
    ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
  });

  it("uses normal first-key/bootstrap issuance for a verified Fleet principal while retaining scope, cross-fleet and lifecycle denials", async () => {
    vi.stubEnv("DRTS_ENV", "test");
    vi.stubEnv("JWT_SECRET", "synthetic-binding-socket-free-unit-signing-key");
    vi.stubEnv("DRTS_FLEET_PARTNER_ID", FLEET);
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    const state = setup();
    const entry = await state.service.createPlatformPartnerEntry(command());
    const issued = await state.service.issuePlatformPartnerIngressCredential(
      entry.entrySlug,
      {
        scopes: ["billing:read", "partner:read"],
        purpose: "Synthetic unit-only Fleet login",
      },
    );
    expect(issued.revokedCredentialId).toBeNull();
    expect(state.credentials.has(issued.credential.keyId)).toBe(true);
    const jwt = new JwtAuthService(undefined, state.service);
    const auth = new AuthController(jwt, state.service, {} as never);
    const bootstrap = await auth.issuePartnerBootstrapSession({
      entrySlug: entry.entrySlug,
      apiKey: issued.plaintextKey,
    });
    expect(bootstrap.data.partnerEntry.partnerId).toBe(FLEET);
    expect(bootstrap.data.identity.scopes).toEqual([
      "billing:read",
      "partner:read",
    ]);
    const guard = new BootstrapAuthGuard(new Reflector(), jwt);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init: RequestInit = {}) => {
        const request: AuthenticatedRequestLike = {
          method: "GET",
          url: "/api/auth/session",
          headers: Object.fromEntries(new Headers(init.headers)),
        };
        await guard.canActivate({
          switchToHttp: () => ({ getRequest: () => request }),
          getHandler: () => AuthController.prototype.getAuthSession,
          getClass: () => AuthController,
        } as never);
        if (request.identity?.actorType !== "partner_api_key") {
          throw new Error(
            "Normal partner bootstrap must retain its API-key actor.",
          );
        }
        return Response.json(
          deepToSnakeCase(auth.getAuthSession(request.identity)),
        );
      }),
    );
    const headers = new Headers({
      authorization: `Bearer ${bootstrap.data.accessToken}`,
    });
    const principal = await resolveFleetPrincipal(
      headers,
      "https://synthetic-api.invalid",
    );
    expect(principal.fleetPartnerId).toBe(FLEET);
    expect(principal.actorId).toBe(issued.credential.keyId);
    const crossFleet = new Headers(headers);
    crossFleet.set("x-fleet-partner-id", "fleet-other");
    await expect(
      resolveFleetPrincipal(crossFleet, "https://synthetic-api.invalid"),
    ).rejects.toMatchObject({ code: "FLEET_SCOPE_DENIED" });
    const noBillingEntry = await state.service.createPlatformPartnerEntry(
      command({ entrySlug: "synthetic-default-scopes" }),
    );
    const defaultKey =
      await state.service.issuePlatformPartnerIngressCredential(
        noBillingEntry.entrySlug,
        {},
      );
    const defaultSession = await auth.issuePartnerBootstrapSession({
      entrySlug: noBillingEntry.entrySlug,
      apiKey: defaultKey.plaintextKey,
    });
    expect(defaultSession.data.identity.scopes).not.toContain("billing:read");
    await expect(
      resolveFleetPrincipal(
        new Headers({
          authorization: `Bearer ${defaultSession.data.accessToken}`,
        }),
        "https://synthetic-api.invalid",
      ),
    ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
    await state.service.revokePlatformPartnerIngressCredential(
      entry.entrySlug,
      issued.credential.keyId,
      { revokeReason: "synthetic unit revocation" },
    );
    expect(() =>
      state.service.authenticatePartnerBootstrap({
        entrySlug: entry.entrySlug,
        apiKey: issued.plaintextKey,
      }),
    ).toThrow(expect.objectContaining({ code: "PARTNER_API_KEY_REVOKED" }));
    await expect(
      auth.issuePartnerBootstrapSession({
        entrySlug: entry.entrySlug,
        apiKey: issued.plaintextKey,
      }),
    ).rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
    await state.service.updatePlatformPartnerEntry(noBillingEntry.entrySlug, {
      status: "inactive",
      activeFlag: false,
    });
    expect(() =>
      state.service.authenticatePartnerBootstrap({
        entrySlug: noBillingEntry.entrySlug,
        apiKey: defaultKey.plaintextKey,
      }),
    ).toThrow(expect.objectContaining({ code: "PARTNER_ENTRY_INACTIVE" }));
    await expect(
      auth.issuePartnerBootstrapSession({
        entrySlug: noBillingEntry.entrySlug,
        apiKey: defaultKey.plaintextKey,
      }),
    ).rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
  });
});
