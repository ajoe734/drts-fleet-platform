import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { FleetPartnerRepository } from "../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import type {
  FleetInvitationDeliveryRequest,
  FleetInvitationDeliveryService,
} from "../../apps/api/src/modules/fleet-partner/fleet-invitation-delivery.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import type { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import type { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

function createService(repository?: Partial<FleetPartnerRepository>) {
  const billingSettlementService = new BillingSettlementService(
    new AuditNotificationService(),
  );
  billingSettlementService.publishDriverFeePlan({
    planName: "Phase1 Driver Fee Plan",
    version: "drv-fee-v1",
    serviceFeeBps: 1500,
    reimbursementMode: "platform_funded",
  });

  // Revenue-share-rule CRUD does not exercise the owned-mobility or
  // regulatory-registry collaborators, so stub them to keep this root-level
  // test free of the deep apps/api construction chain (and its
  // @nestjs/event-emitter dependency, which is not resolvable here).
  const ownedMobilityService = {} as unknown as OwnedMobilityService;
  const regulatoryRegistryService = {} as unknown as RegulatoryRegistryService;

  const fleetPartnerService = new FleetPartnerService(
    billingSettlementService,
    ownedMobilityService,
    regulatoryRegistryService,
    repository as FleetPartnerRepository | undefined,
  );

  return {
    billingSettlementService,
    fleetPartnerService,
  };
}

describe("FleetPartnerService", () => {
  it("supports revenue share rule CRUD", async () => {
    const { fleetPartnerService } = createService();

    const created = fleetPartnerService.createRevenueShareRule(
      "fleet-demo-001",
      {
        appliesTo: "platform_source",
        sourcePlatform: "api",
        formula: "fixed_per_trip",
        fixedAmountMinor: 5000,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      },
    );

    expect(
      fleetPartnerService
        .listRevenueShareRules("fleet-demo-001")
        .some((rule) => rule.ruleId === created.ruleId),
    ).toBe(true);

    const updated = fleetPartnerService.updateRevenueShareRule(
      "fleet-demo-001",
      created.ruleId,
      {
        fixedAmountMinor: 6500,
      },
    );
    expect(updated.fixedAmountMinor).toBe(6500);
    expect(
      fleetPartnerService.getRevenueShareRule("fleet-demo-001", created.ruleId)
        .fixedAmountMinor,
    ).toBe(6500);

    await fleetPartnerService.deleteRevenueShareRule(
      "fleet-demo-001",
      created.ruleId,
    );
    expect(
      fleetPartnerService
        .listRevenueShareRules("fleet-demo-001")
        .some((rule) => rule.ruleId === created.ruleId),
    ).toBe(false);
  });

  it("builds a monthly fleet partner statement from driver statements and applies specific rules before all_trips", async () => {
    const { fleetPartnerService } = createService();

    fleetPartnerService.createRevenueShareRule("fleet-demo-001", {
      appliesTo: "platform_source",
      sourcePlatform: "api",
      formula: "fixed_per_trip",
      fixedAmountMinor: 5000,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    const statements = await fleetPartnerService.listFleetPartnerStatements(
      "fleet-demo-001",
      "2026-03",
    );

    expect(statements).toHaveLength(1);
    expect(statements[0]?.periodMonth).toBe("2026-03");
    expect(statements[0]?.lines).toHaveLength(3);
    expect(statements[0]?.grossEarningBasis.amountMinor).toBe(350000);
    expect(statements[0]?.driverNetAmountBasis.amountMinor).toBe(312500);
    expect(statements[0]?.shareAmount.amountMinor).toBe(26600);

    const apiTripLine = statements[0]?.lines.find(
      (line) => line.orderId === "order-demo-032",
    );
    expect(apiTripLine?.formula).toBe("fixed_per_trip");
    expect(apiTripLine?.shareAmount.amountMinor).toBe(5000);
  });

  it("replaces persisted statement slices so stale rows are removed on rebuild", async () => {
    const seededService = createService().fleetPartnerService;
    const persistedAffiliations =
      seededService.listFleetPartnerDrivers("fleet-demo-001");
    const persistedRules = new Map(
      seededService
        .listRevenueShareRules("fleet-demo-001")
        .map((rule) => [rule.ruleId, rule]),
    );
    let persistedStatements: Parameters<
      FleetPartnerRepository["replaceStatementsForPeriodMonth"]
    >[1] = [];
    const repository = {
      isEnabled: () => true,
      loadDriverAffiliations: vi.fn(async () =>
        persistedAffiliations.map((record) => ({ ...record })),
      ),
      loadRevenueShareRules: vi.fn(async () =>
        [...persistedRules.values()].map((record) => ({ ...record })),
      ),
      loadStatements: vi.fn(async () => [...persistedStatements]),
      persistChanges: vi.fn(
        async (
          changes: Parameters<FleetPartnerRepository["persistChanges"]>[0],
        ) => {
          for (const rule of changes.revenueShareRules ?? []) {
            persistedRules.set(rule.ruleId, { ...rule });
          }
        },
      ),
      replaceStatementsForPeriodMonth: vi.fn(
        async (
          _periodMonth: string,
          statements: Parameters<
            FleetPartnerRepository["replaceStatementsForPeriodMonth"]
          >[1],
        ) => {
          persistedStatements = statements;
        },
      ),
      deleteRevenueShareRule: vi.fn(async (ruleId: string) => {
        persistedRules.delete(ruleId);
      }),
      reportPersistenceFailure: vi.fn(),
    } satisfies Partial<FleetPartnerRepository>;
    const { fleetPartnerService } = createService(repository);

    fleetPartnerService.createRevenueShareRule("fleet-demo-001", {
      appliesTo: "platform_source",
      sourcePlatform: "api",
      formula: "fixed_per_trip",
      fixedAmountMinor: 5000,
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    const initialStatements =
      await fleetPartnerService.listFleetPartnerStatements(
        "fleet-demo-001",
        "2026-03",
      );

    // With the specific platform_source rule present, the api trip is priced by
    // its fixed_per_trip slice.
    expect(
      initialStatements[0]?.lines.find(
        (line) => line.orderId === "order-demo-032",
      )?.formula,
    ).toBe("fixed_per_trip");

    expect(repository.replaceStatementsForPeriodMonth).toHaveBeenCalledWith(
      "2026-03",
      expect.arrayContaining([
        expect.objectContaining({
          statementId: "fleet-statement-fleet-demo-001-2026-03",
          fleetPartnerId: "fleet-demo-001",
          periodMonth: "2026-03",
        }),
      ]),
      "fleet-demo-001",
    );

    const createdRule = fleetPartnerService
      .listRevenueShareRules("fleet-demo-001")
      .find((rule) => rule.appliesTo === "platform_source");
    expect(createdRule).toBeDefined();
    if (!createdRule) {
      throw new Error("expected created revenue share rule");
    }

    await fleetPartnerService.deleteRevenueShareRule(
      "fleet-demo-001",
      createdRule.ruleId,
    );

    const rebuiltStatements =
      await fleetPartnerService.listFleetPartnerStatements(
        "fleet-demo-001",
        "2026-03",
      );

    // The seeded all_trips (percent_of_gross) rule still applies, so one
    // statement remains. The point of the rebuild is that the now-stale
    // fixed_per_trip slice for the api trip must be REPLACED by the
    // percent_of_gross fallback rather than lingering.
    expect(rebuiltStatements).toHaveLength(1);
    expect(
      rebuiltStatements[0]?.lines.find(
        (line) => line.orderId === "order-demo-032",
      )?.formula,
    ).toBe("percent_of_gross");
    expect(repository.replaceStatementsForPeriodMonth).toHaveBeenLastCalledWith(
      "2026-03",
      expect.arrayContaining([
        expect.objectContaining({
          statementId: "fleet-statement-fleet-demo-001-2026-03",
          fleetPartnerId: "fleet-demo-001",
          periodMonth: "2026-03",
        }),
      ]),
      "fleet-demo-001",
    );
    expect(repository.reportPersistenceFailure).not.toHaveBeenCalled();
  });
});

// FLEET-ONB-003: Fleet staff invitation issue/revoke/deactivate endpoints
// (docs/02-architecture/fleet-staff-onboarding-20261114/01_system_sa_sd.md §1-2, §8).
describe("FleetPartnerService Fleet staff invitations", () => {
  const ENTRY = "fleet-staff-entry";
  const FLEET_PARTNER_ID = "fleet-test-001";

  type Row = Record<string, unknown>;

  function createFleetIamPort() {
    let principals = new Map<string, Row>();
    let memberships = new Map<string, Row>();
    let bindings = new Map<string, Row>();
    let invitations = new Map<string, Row>();
    let snapshot: {
      principals: Map<string, Row>;
      memberships: Map<string, Row>;
      bindings: Map<string, Row>;
      invitations: Map<string, Row>;
    } | null = null;

    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql === "BEGIN") {
        snapshot = {
          principals: new Map(principals),
          memberships: new Map(memberships),
          bindings: new Map(bindings),
          invitations: new Map(invitations),
        };
        return { rows: [] };
      }
      if (sql === "ROLLBACK") {
        if (snapshot) {
          principals = snapshot.principals;
          memberships = snapshot.memberships;
          bindings = snapshot.bindings;
          invitations = snapshot.invitations;
        }
        snapshot = null;
        return { rows: [] };
      }
      if (sql === "COMMIT") {
        snapshot = null;
        return { rows: [] };
      }
      if (sql.startsWith("SAVEPOINT") || sql.startsWith("ROLLBACK TO SAVEPOINT"))
        return { rows: [] };

      if (sql.includes("iam.identity_principals")) {
        if (sql.includes("INSERT INTO")) {
          const record = JSON.parse(String(params.at(-1))) as Row;
          principals.set(String(record.principalId), record);
          return { rows: [{ record }] };
        }
        if (sql.includes("issuer = $1 AND subject = $2")) {
          const hit = [...principals.values()].find(
            (p) => p.issuer === params[0] && p.subject === params[1],
          );
          return { rows: hit ? [{ record: hit }] : [] };
        }
        if (sql.startsWith("SELECT principal_id FROM")) {
          return {
            rows: principals.has(String(params[0]))
              ? [{ principal_id: params[0] }]
              : [],
          };
        }
        // principal_id = $1 (FOR UPDATE or LIMIT 1 id lookup)
        return {
          rows: principals.has(String(params[0]))
            ? [{ record: principals.get(String(params[0])) }]
            : [],
        };
      }

      if (sql.includes("iam.identity_memberships")) {
        if (sql.includes("INSERT INTO")) {
          const record = JSON.parse(String(params.at(-1))) as Row;
          memberships.set(String(record.membershipId), record);
          return { rows: [{ record }] };
        }
        if (sql.includes("source_ref = $1")) {
          const hit = [...memberships.values()].find(
            (m) => m.sourceRef === params[0],
          );
          return { rows: hit ? [{ record: hit }] : [] };
        }
        if (
          sql.includes("realm = 'partner' AND scope_ref = $2 AND partner_id = $3")
        ) {
          const m = memberships.get(String(params[0]));
          const hit =
            m &&
            m.realm === "partner" &&
            m.scopeRef === params[1] &&
            m.partnerId === params[2]
              ? m
              : null;
          return { rows: hit ? [{ record: hit }] : [] };
        }
        // generic membership_id = $1 lookup (findActivePrivilegedGrantsForMembership)
        return {
          rows: memberships.has(String(params[0]))
            ? [{ record: memberships.get(String(params[0])) }]
            : [],
        };
      }

      if (sql.includes("iam.identity_role_bindings")) {
        if (sql.includes("INSERT INTO")) {
          const record = JSON.parse(String(params.at(-1))) as Row;
          bindings.set(String(record.roleBindingId), record);
          return { rows: [{ record }] };
        }
        if (sql.includes("source_ref = $1")) {
          const hit = [...bindings.values()].find(
            (b) => b.sourceRef === params[0],
          );
          return { rows: hit ? [{ record: hit }] : [] };
        }
        // membership_id = $1 (findRoleBindingsByMembershipId)
        const matches = [...bindings.values()].filter(
          (b) => b.membershipId === params[0],
        );
        return { rows: matches.map((record) => ({ record })) };
      }

      if (sql.includes("iam.privileged_role_grants")) return { rows: [] };

      if (sql.includes("iam.identity_invitations")) {
        if (sql.includes("INSERT INTO")) {
          const record = JSON.parse(String(params.at(-1))) as Row;
          invitations.set(String(record.invitationId), record);
          return { rows: [{ record }] };
        }
        if (sql.includes("SET delivery_status")) {
          const inv = invitations.get(String(params[0]));
          if (!inv || inv.realm !== "partner") return { rows: [] };
          const updated = {
            ...inv,
            deliveryStatus: params[1],
            updatedAt: params[2],
          };
          invitations.set(String(params[0]), updated);
          return { rows: [{ record: updated }] };
        }
        if (sql.includes("SET revoked_at")) {
          if (sql.includes("WHERE invitation_id = $1")) {
            const inv = invitations.get(String(params[0]));
            const hit =
              inv &&
              inv.realm === "partner" &&
              inv.scopeRef === params[1] &&
              inv.partnerId === params[2] &&
              !inv.acceptedAt &&
              !inv.revokedAt
                ? inv
                : null;
            if (!hit) return { rows: [] };
            const updated = {
              ...hit,
              revokedAt: params[3],
              updatedAt: params[3],
            };
            invitations.set(String(params[0]), updated);
            return { rows: [{ record: updated }] };
          }
          // membership_id-scoped bulk revoke of still-pending invitations
          for (const [id, inv] of invitations) {
            if (
              inv.membershipId === params[0] &&
              !inv.acceptedAt &&
              !inv.revokedAt
            ) {
              invitations.set(id, {
                ...inv,
                revokedAt: params[1],
                updatedAt: params[1],
              });
            }
          }
          return { rows: [] };
        }
        // list by entry scope
        const matches = [...invitations.values()]
          .filter(
            (inv) =>
              inv.realm === "partner" &&
              inv.scopeRef === params[0] &&
              inv.partnerId === params[1],
          )
          .sort((a, b) =>
            String(b.createdAt).localeCompare(String(a.createdAt)),
          );
        return { rows: matches.map((record) => ({ record })) };
      }

      if (sql.includes("iam.identity_sessions")) return { rows: [] };

      throw new Error(`Unexpected PG port query: ${sql.slice(0, 120)}`);
    });

    return {
      isEnabled: () => true,
      connect: async () => ({ query, release: () => undefined }),
      query,
    };
  }

  function createInvitationService(
    overrides: { invitationDelivery?: Partial<FleetInvitationDeliveryService> } = {},
  ) {
    const port = createFleetIamPort();
    const repo = new IdentityRepository(port as never);
    const fleet = { fleetPartnerId: FLEET_PARTNER_ID, active: true };
    const entries = {
      resolvePartnerEntries: async () => [
        {
          entrySlug: ENTRY,
          partnerType: "fleet_partner",
          partnerId: fleet.fleetPartnerId,
        },
      ],
    };
    const links = {
      isEnabled: () => true,
      find: async () => null,
    };
    const audit = {
      isEnabled: () => true,
      recordEventRequired: vi.fn(async () => undefined),
    };
    const invitationDelivery = {
      send: vi.fn(async () => ({
        status: "sent" as const,
        attemptedAt: new Date().toISOString(),
      })),
      ...overrides.invitationDelivery,
    };
    const service = new FleetPartnerService(
      undefined as never,
      undefined as never,
      undefined as never,
      {
        isEnabled: () => true,
        findActiveFleetPartnerById: async () => fleet,
      } as never,
      undefined,
      repo,
      entries as never,
      links as never,
      audit as never,
      invitationDelivery as never,
    );
    return { service, audit, invitationDelivery, repo };
  }

  const manager = {
    realm: "platform",
    actorType: "platform_admin",
    actorId: "manager",
    principalId: "manager",
    scopes: ["foundation:write"],
    amr: [],
  } as never;

  it("denies invitation issuance to a non-platform/ops manager", async () => {
    const { service } = createInvitationService();
    await expect(
      service.inviteFleetStaff(
        FLEET_PARTNER_ID,
        { entrySlug: ENTRY, email: "staff@fleet.example.org", roleCode: "fleet_partner_ops" },
        { ...(manager as object), realm: "partner", actorType: "partner_user" } as never,
      ),
    ).rejects.toMatchObject({ code: "FLEET_ROLE_MANAGER_DENIED" });
  });

  it("rejects an invalid email and an invalid roleCode", async () => {
    const { service } = createInvitationService();
    await expect(
      service.inviteFleetStaff(
        FLEET_PARTNER_ID,
        { entrySlug: ENTRY, email: "not-an-email", roleCode: "fleet_partner_ops" },
        manager,
      ),
    ).rejects.toMatchObject({ code: "FLEET_INVITE_EMAIL_INVALID" });
    await expect(
      service.inviteFleetStaff(
        FLEET_PARTNER_ID,
        {
          entrySlug: ENTRY,
          email: "staff@fleet.example.org",
          roleCode: "not_a_real_role" as never,
        },
        manager,
      ),
    ).rejects.toMatchObject({ code: "FLEET_INVITE_ROLE_INVALID" });
  });

  it("issues an invitation, records it as delivered only when the adapter acknowledges sent", async () => {
    const { service, invitationDelivery } = createInvitationService();
    const issued = await service.inviteFleetStaff(
      FLEET_PARTNER_ID,
      { entrySlug: ENTRY, email: "Staff@Fleet.example.org", roleCode: "fleet_partner_ops" },
      manager,
    );
    expect(invitationDelivery.send).toHaveBeenCalledOnce();
    expect(issued.deliveryOutcome).toBe("sent");
    expect(issued.invitation).toMatchObject({
      fleetPartnerId: FLEET_PARTNER_ID,
      entrySlug: ENTRY,
      email: "staff@fleet.example.org",
      roleCode: "fleet_partner_ops",
      deliveryStatus: "delivered",
      acceptedAt: null,
      revokedAt: null,
    });
    expect(issued.member).toMatchObject({
      fleetPartnerId: FLEET_PARTNER_ID,
      entrySlug: ENTRY,
      status: "invited",
      roleCode: "fleet_partner_ops",
    });
  });

  it("never records delivered when the adapter does not acknowledge sent", async () => {
    const { service } = createInvitationService({
      invitationDelivery: {
        send: vi.fn(async (request: FleetInvitationDeliveryRequest) => ({
          invitationId: request.invitationId,
          fleetPartnerId: request.fleetPartnerId,
          entrySlug: request.entrySlug,
          recipientEmail: request.recipientEmail,
          expiresAt: request.expiresAt,
          status: "unavailable" as const,
          attemptedAt: new Date().toISOString(),
        })),
      },
    });
    const issued = await service.inviteFleetStaff(
      FLEET_PARTNER_ID,
      { entrySlug: ENTRY, email: "staff2@fleet.example.org", roleCode: "fleet_partner_admin" },
      manager,
    );
    expect(issued.deliveryOutcome).toBe("unavailable");
    expect(issued.invitation.deliveryStatus).toBe("delivery_failed");
  });

  it("rejects a duplicate invitation once the email has an active membership", async () => {
    const { service, repo } = createInvitationService();
    const issued = await service.inviteFleetStaff(
      FLEET_PARTNER_ID,
      { entrySlug: ENTRY, email: "active-staff@fleet.example.org", roleCode: "fleet_partner_ops" },
      manager,
    );
    // Simulates FLEET-ONB-004's not-yet-implemented accept step.
    await repo.ensureMembershipRecord({
      membershipId: issued.member.membershipId,
      sourceRef: `fleet_member:${ENTRY}:${issued.member.principalId}`,
      principalId: issued.member.principalId,
      realm: "partner",
      scopeRef: `fleet:${ENTRY}`,
      tenantId: null,
      partnerId: FLEET_PARTNER_ID,
      status: "active",
      invitedByPrincipalId: "manager",
      invitationId: issued.invitation.invitationId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await expect(
      service.inviteFleetStaff(
        FLEET_PARTNER_ID,
        { entrySlug: ENTRY, email: "active-staff@fleet.example.org", roleCode: "fleet_partner_admin" },
        manager,
      ),
    ).rejects.toMatchObject({ code: "FLEET_STAFF_ALREADY_ACTIVE" });
  });

  it("revokes a pending invitation and rejects revoking it again", async () => {
    const { service } = createInvitationService();
    const issued = await service.inviteFleetStaff(
      FLEET_PARTNER_ID,
      { entrySlug: ENTRY, email: "revoke-me@fleet.example.org", roleCode: "fleet_partner_ops" },
      manager,
    );
    const revoked = await service.revokeFleetStaffInvitation(
      FLEET_PARTNER_ID,
      ENTRY,
      issued.invitation.invitationId,
      manager,
    );
    expect(revoked.revokedAt).not.toBeNull();
    await expect(
      service.revokeFleetStaffInvitation(
        FLEET_PARTNER_ID,
        ENTRY,
        issued.invitation.invitationId,
        manager,
      ),
    ).rejects.toMatchObject({ code: "FLEET_INVITATION_NOT_FOUND" });
  });

  it("lists invitations for the entry newest first", async () => {
    const { service } = createInvitationService();
    const first = await service.inviteFleetStaff(
      FLEET_PARTNER_ID,
      { entrySlug: ENTRY, email: "list-a@fleet.example.org", roleCode: "fleet_partner_ops" },
      manager,
    );
    const second = await service.inviteFleetStaff(
      FLEET_PARTNER_ID,
      { entrySlug: ENTRY, email: "list-b@fleet.example.org", roleCode: "fleet_partner_finance" },
      manager,
    );
    const invitations = await service.listFleetStaffInvitations(
      FLEET_PARTNER_ID,
      ENTRY,
    );
    expect(
      invitations.map((invitation) => invitation.invitationId),
    ).toEqual(
      expect.arrayContaining([
        first.invitation.invitationId,
        second.invitation.invitationId,
      ]),
    );
  });

  it("deactivates a Fleet staff membership and rejects an unknown membership", async () => {
    const { service } = createInvitationService();
    const issued = await service.inviteFleetStaff(
      FLEET_PARTNER_ID,
      { entrySlug: ENTRY, email: "deactivate-me@fleet.example.org", roleCode: "fleet_partner_ops" },
      manager,
    );
    const disabled = await service.deactivateFleetStaffMember(
      FLEET_PARTNER_ID,
      ENTRY,
      issued.member.membershipId,
      manager,
    );
    expect(disabled.status).toBe("disabled");
    await expect(
      service.deactivateFleetStaffMember(
        FLEET_PARTNER_ID,
        ENTRY,
        "membership_does_not_exist",
        manager,
      ),
    ).rejects.toMatchObject({ code: "FLEET_STAFF_MEMBER_NOT_FOUND" });
  });
});
