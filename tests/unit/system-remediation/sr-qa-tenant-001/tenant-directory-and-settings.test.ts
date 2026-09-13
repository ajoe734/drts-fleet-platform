import { afterEach, beforeAll, describe, expect, it } from "vitest";

// SR-QA-TENANT-001 — 租戶日常工作、配額與整合設定驗收
//
// Scope for this file: users, addresses, passengers, cost centres, rules
// (approval rules), SLA, invites, feature flags, and tenant lifecycle —
// verified directly against the existing, already-implemented service
// classes under apps/api/src (no business code is modified by this task;
// write_scopes is test/doc files only). Each capability gets at least one
// write→read-back case and one negative case, per the task's acceptance
// criteria. Where a capability already has thorough baseline coverage
// elsewhere in the repo (e.g. cross-tenant passenger/address isolation in
// tests/unit/tenant-partner-foundation.test.ts, invitation token lifecycle in
// tests/unit/tenant-invitation-lifecycle.test.ts, cost-center/quota negative
// paths in tests/integ/tenant-governance-negative.test.ts), this file adds a
// focused confirmation rather than re-deriving the whole suite, and spends
// the rest of its coverage on paths verified NOT to be tested anywhere else
// (see the invitation-revocation and feature-flag sections below).

// Partner ingress credentials are resolved from env at TenantPartnerService
// construction time in some code paths; seed them before any service is
// built, matching tests/unit/tenant-partner-foundation.test.ts.
beforeAll(() => {
  process.env.PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT ??=
    "pk_demo_alpha_airport_20260428";
  process.env.PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT ??=
    "pk_demo_beta_airport_20260428";
});

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { FeatureFlagsService } from "../../../../apps/api/src/modules/feature-flags/feature-flags.service";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { TenantsService } from "../../../../apps/api/src/modules/platform-admin/tenants.service";
import {
  TenantInvitationDeliveryService,
  type TenantInvitationDeliveryRequest,
} from "../../../../apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const TENANT_ID = "tenant-demo-001";
const OTHER_TENANT_ID = "tenant-demo-002";

class CapturingInvitationDelivery extends TenantInvitationDeliveryService {
  readonly tokens = new Map<string, string>();

  override async send(request: TenantInvitationDeliveryRequest) {
    this.tokens.set(request.invitationId, request.rawToken);
    return super.send(request);
  }
}

function createInvitationCapableTenantPartnerService() {
  const identityRepository = new IdentityRepository();
  const delivery = new CapturingInvitationDelivery();
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    identityRepository,
    identityRepository,
    delivery,
  );
  return { service, identityRepository, delivery };
}

function codeOf(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return (error as ApiRequestError).code;
  }
  throw new Error("expected the call to throw");
}

async function asyncCodeOf(call: () => unknown): Promise<string> {
  try {
    await call();
  } catch (error) {
    return (error as ApiRequestError).code;
  }
  throw new Error("expected the call to throw");
}

describe("SR-QA-TENANT-001 — users & invites (C006/C008)", () => {
  afterEach(() => {
    // no fake timers used in this describe block
  });

  it("creates a tenant user (invited) and lists it back through the tenant directory read path", async () => {
    const { service } = createInvitationCapableTenantPartnerService();

    const created = await service.createTenantUser(TENANT_ID, {
      email: "ops-lead@qa-tenant-001.example",
      displayName: "Ops Lead",
      roleCode: "tenant_viewer",
    });
    expect(created.status).toBe("invited");

    const listed = service.listTenantUsers(TENANT_ID);
    expect(listed.find((u) => u.userId === created.userId)).toMatchObject({
      email: "ops-lead@qa-tenant-001.example",
      roleCode: "tenant_viewer",
      status: "invited",
    });
  });

  it("negative: creating a second user with the same email in the same tenant is rejected (TENANT_USER_EXISTS)", async () => {
    const { service } = createInvitationCapableTenantPartnerService();
    await service.createTenantUser(TENANT_ID, {
      email: "dup@qa-tenant-001.example",
      displayName: "First",
      roleCode: "tenant_viewer",
    });

    expect(
      await asyncCodeOf(() =>
        service.createTenantUser(TENANT_ID, {
          email: "dup@qa-tenant-001.example",
          displayName: "Second",
          roleCode: "tenant_viewer",
        }),
      ),
    ).toBe("TENANT_USER_EXISTS");
  });

  it("updates a tenant user's role and the change is visible on re-read", async () => {
    const { service } = createInvitationCapableTenantPartnerService();
    const created = await service.createTenantUser(TENANT_ID, {
      email: "promote@qa-tenant-001.example",
      displayName: "Promotable",
      roleCode: "tenant_viewer",
    });

    service.updateTenantUserRole(TENANT_ID, created.userId, {
      roleCode: "tenant_finance_admin",
    });

    const reread = service
      .listTenantUsers(TENANT_ID)
      .find((u) => u.userId === created.userId);
    expect(reread?.roleCode).toBe("tenant_finance_admin");
  });

  it("revokes a pending invitation and the revoked token can no longer be accepted (gap: not covered by tests/unit/tenant-invitation-lifecycle.test.ts, which only exercises resend)", async () => {
    const { service, identityRepository, delivery } =
      createInvitationCapableTenantPartnerService();

    const created = await service.createTenantUser(TENANT_ID, {
      email: "revoke-me@qa-tenant-001.example",
      displayName: "Revoke Target",
      roleCode: "tenant_viewer",
    });
    const invitation = identityRepository.listInvitations()[0]!;
    const rawToken = delivery.tokens.get(invitation.invitationId)!;
    expect(rawToken).toMatch(/^ti_/);

    // WRITE
    const revoked = await service.revokeTenantInvitation(
      TENANT_ID,
      created.userId,
    );
    expect(revoked.revokedAt).not.toBeNull();

    // READ BACK #1: identity repository record itself is marked revoked.
    expect(
      identityRepository.listInvitations()[0]?.revokedAt,
    ).not.toBeNull();

    // READ BACK #2: the raw token that was actually delivered to the user
    // (captured by the delivery stub, exactly as a real mail transport would
    // have sent it) is now rejected end-to-end through acceptTenantInvitation.
    expect(
      await asyncCodeOf(() =>
        service.acceptTenantInvitation({ invitationToken: rawToken }),
      ),
    ).toBe("TENANT_INVITATION_ACCEPTANCE_DENIED");

    // The user must still be in "invited" state, not silently activated.
    expect(
      service.listTenantUsers(TENANT_ID).find((u) => u.userId === created.userId)
        ?.status,
    ).toBe("invited");
  });

  it("negative: revoking an invitation twice fails closed instead of no-op succeeding (TENANT_INVITATION_NOT_PENDING)", async () => {
    const { service } = createInvitationCapableTenantPartnerService();
    const created = await service.createTenantUser(TENANT_ID, {
      email: "double-revoke@qa-tenant-001.example",
      displayName: "Double Revoke",
      roleCode: "tenant_viewer",
    });

    await service.revokeTenantInvitation(TENANT_ID, created.userId);

    expect(
      await asyncCodeOf(() =>
        service.revokeTenantInvitation(TENANT_ID, created.userId),
      ),
    ).toBe("TENANT_INVITATION_NOT_PENDING");
  });
});

describe("SR-QA-TENANT-001 — addresses & passengers, including their relationship (C027 常用地址／預約乘客)", () => {
  it("links a tenant address to a tenant passenger and both are readable back through independent getters", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const passenger = service.upsertPassenger(TENANT_ID, {
      fullName: "QA Passenger",
      mobile: "0912345678",
    } as never);

    const address = service.upsertAddress(TENANT_ID, {
      addressName: "HQ Reception",
      addressText: "Taipei HQ, 1F Reception",
      ownerPassengerId: passenger.passengerId,
    } as never);

    // READ BACK: independent getters, not the write's return value.
    expect(
      service.getPassengerMasterRecord(TENANT_ID, passenger.passengerId)
        .fullName,
    ).toBe("QA Passenger");
    expect(
      service.getAddressMasterRecord(TENANT_ID, address.addressId)
        .ownerPassengerId,
    ).toBe(passenger.passengerId);
    expect(
      service.listAddresses(TENANT_ID).map((a) => a.addressId),
    ).toContain(address.addressId);
    expect(
      service.listPassengers(TENANT_ID).map((p) => p.passengerId),
    ).toContain(passenger.passengerId);
  });

  it("negative: an address cannot claim ownership of a passenger that does not exist in the tenant (PASSENGER_NOT_FOUND)", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    expect(
      codeOf(() =>
        service.upsertAddress(TENANT_ID, {
          addressName: "Orphan Address",
          addressText: "Nowhere",
          ownerPassengerId: "passenger_does_not_exist",
        } as never),
      ),
    ).toBe("PASSENGER_NOT_FOUND");
  });

  it("negative: reading a passenger that was created under a different tenant fails closed (PASSENGER_NOT_FOUND), confirming tenant isolation still holds", () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    const passenger = service.upsertPassenger(OTHER_TENANT_ID, {
      fullName: "Other Tenant Passenger",
    } as never);

    expect(
      codeOf(() =>
        service.getPassengerMasterRecord(TENANT_ID, passenger.passengerId),
      ),
    ).toBe("PASSENGER_NOT_FOUND");
  });
});

describe("SR-QA-TENANT-001 — cost centres directory (C027)", () => {
  it("creates, lists, and disables a cost center, with the disabled state visible on re-read", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const created = service.upsertCostCenter(TENANT_ID, {
      code: "cc-directory-01",
      name: "Directory Test Cost Center",
    } as never);
    // Codes are normalized (uppercased) by the service.
    expect(created.code).toBe("CC-DIRECTORY-01");
    expect(
      service.listCostCenters(TENANT_ID).map((c) => c.code),
    ).toContain("CC-DIRECTORY-01");

    service.disableCostCenter(TENANT_ID, {
      code: "cc-directory-01",
      reason: "qa_regression_disable",
    } as never);

    const reread = service.getCostCenter(TENANT_ID, "cc-directory-01");
    expect(reread.activeFlag).toBe(false);
    expect(reread.disabledReason).toBe("qa_regression_disable");
    expect(
      service.listCostCenters(TENANT_ID, { activeOnly: true }),
    ).not.toContainEqual(expect.objectContaining({ code: "CC-DIRECTORY-01" }));
  });

  it("negative: looking up an unknown cost center fails closed (COST_CENTER_NOT_FOUND)", () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    expect(
      codeOf(() => service.getCostCenter(TENANT_ID, "CC-DOES-NOT-EXIST")),
    ).toBe("COST_CENTER_NOT_FOUND");
  });
});

describe("SR-QA-TENANT-001 — approval rules directory (C028 用車規則)", () => {
  it("creates an approval rule, reads it back, then reorders and disables it", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const ruleA = service.upsertApprovalRule(TENANT_ID, {
      ruleName: "Rule A",
      priority: 10,
      conditions: [],
      action: "flag_manual_review",
      approvers: [],
    } as never);
    const ruleB = service.upsertApprovalRule(TENANT_ID, {
      ruleName: "Rule B",
      priority: 20,
      conditions: [],
      action: "block",
      approvers: [],
    } as never);

    expect(service.getApprovalRule(TENANT_ID, ruleA.ruleId)).toMatchObject({
      ruleName: "Rule A",
      action: "flag_manual_review",
    });

    // WRITE: reorder so B now sorts first.
    const reordered = service.reorderApprovalRules(TENANT_ID, {
      orderedRuleIds: [ruleB.ruleId, ruleA.ruleId],
    } as never);
    expect(reordered.map((r) => r.ruleId)).toEqual([ruleB.ruleId, ruleA.ruleId]);
    // READ BACK: priority values on independent re-fetch reflect the new order.
    const rereadB = service.getApprovalRule(TENANT_ID, ruleB.ruleId);
    const rereadA = service.getApprovalRule(TENANT_ID, ruleA.ruleId);
    expect(rereadB.priority).toBeLessThan(rereadA.priority);

    service.disableApprovalRule(TENANT_ID, ruleA.ruleId);
    expect(service.getApprovalRule(TENANT_ID, ruleA.ruleId).activeFlag).toBe(
      false,
    );
    // A disabled rule must not appear in the active-only evaluation set.
    expect(
      service
        .listApprovalRules(TENANT_ID, { activeOnly: true })
        .map((r) => r.ruleId),
    ).not.toContain(ruleA.ruleId);
  });

  it("negative: reordering with an incomplete rule-id list is rejected instead of silently dropping rules", () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    service.upsertApprovalRule(TENANT_ID, {
      ruleName: "Only Rule",
      priority: 10,
      conditions: [],
      action: "block",
      approvers: [],
    } as never);

    expect(
      codeOf(() =>
        service.reorderApprovalRules(TENANT_ID, {
          orderedRuleIds: [],
        } as never),
      ),
    ).toBe("TENANT_APPROVAL_RULE_REORDER_INCOMPLETE");
  });
});

describe("SR-QA-TENANT-001 — SLA profile (C028)", () => {
  // TENANT_ID ("tenant-demo-001") carries a seeded default SLA profile (see
  // USER_ROLE_SEED / DEMO_TENANT_ID fixtures in tenant-partner.service.ts),
  // so the "not provisioned" empty state is only observable on a tenant that
  // has never had one written — use a distinct id for that half of the test.
  const FRESH_TENANT_ID = "tenant-qa-sla-fresh-001";

  it("starts unprovisioned for a tenant with no SLA history, then a write is visible through both the raw getter and the UI view read model", () => {
    const service = new TenantPartnerService(new AuditNotificationService());

    const initialView = service.getSlaProfileView(FRESH_TENANT_ID);
    expect(initialView.profile).toBeNull();
    expect(initialView.emptyState?.reason).toBe("not_provisioned");

    // WRITE
    const receipt = service.updateSlaProfile(FRESH_TENANT_ID, {
      waitThresholdMin: 10,
      arrivalThresholdMin: 15,
      completionThresholdMin: 60,
      reason: "qa_regression_baseline",
    } as never);
    expect(receipt.status).toBe("completed");

    // READ BACK #1: raw profile getter.
    const profile = service.getSlaProfile(FRESH_TENANT_ID);
    expect(profile).toMatchObject({
      tenantId: FRESH_TENANT_ID,
      waitThresholdMin: 10,
      arrivalThresholdMin: 15,
      completionThresholdMin: 60,
    });

    // READ BACK #2: the tenant-console read model no longer reports the
    // not-provisioned empty state and carries the same thresholds.
    const view = service.getSlaProfileView(FRESH_TENANT_ID);
    expect(view.emptyState).toBeNull();
    expect(view.profile).toMatchObject({
      waitThresholdMin: 10,
      arrivalThresholdMin: 15,
      completionThresholdMin: 60,
    });

    // A different tenant's (seeded) SLA profile must be unaffected by the
    // write above (seed default is completionThresholdMin: 90, not 60).
    expect(service.getSlaProfile(TENANT_ID).tenantId).toBe(TENANT_ID);
    expect(service.getSlaProfile(TENANT_ID).completionThresholdMin).not.toBe(60);
  });

  it("negative: recalculating SLA bookings without a reason is rejected (validation, not a silent no-op)", () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    service.updateSlaProfile(TENANT_ID, {
      waitThresholdMin: 10,
      arrivalThresholdMin: 15,
      completionThresholdMin: 60,
    } as never);

    expect(
      codeOf(() =>
        service.recalculateSlaBookings(TENANT_ID, { reason: "" } as never),
      ),
    ).toBe("SLA_RECALCULATE_REASON_REQUIRED");
  });
});

describe("SR-QA-TENANT-001 — feature flags with tenant scoping (C109; gap: no existing test exercises FeatureFlagsService.upsertTenantOverride)", () => {
  it("a tenant override write is read back distinctly from the global flag and does not leak to other tenants", async () => {
    const service = new FeatureFlagsService();

    const globalBefore = await service.isEnabled("tenant-portal.booking");
    expect(globalBefore).toBe(true); // seeded default, see feature-flags.service.ts seedDefaults()

    // WRITE: disable booking for this tenant only.
    const override = await service.upsertTenantOverride(
      "tenant-portal.booking",
      TENANT_ID,
      false,
      "QA regression override",
    );
    expect(override?.enabled).toBe(false);

    // READ BACK #1: the overridden tenant now sees the flag disabled.
    expect(await service.isEnabled("tenant-portal.booking", TENANT_ID)).toBe(
      false,
    );
    // READ BACK #2: an unrelated tenant is unaffected by the override.
    expect(
      await service.isEnabled("tenant-portal.booking", OTHER_TENANT_ID),
    ).toBe(true);
    // READ BACK #3: the global (no-tenant) flag itself is unaffected.
    expect(await service.isEnabled("tenant-portal.booking")).toBe(true);

    const byKey = await service.getByKey("tenant-portal.booking", TENANT_ID);
    expect(byKey).toMatchObject({ enabled: false, tenantId: TENANT_ID });
  });

  it("negative: an unknown flag key resolves to disabled instead of throwing (safe default for unrecognized flags)", async () => {
    const service = new FeatureFlagsService();
    await expect(
      service.isEnabled("does-not-exist.flag", TENANT_ID),
    ).resolves.toBe(false);
  });
});

describe("SR-QA-TENANT-001 — tenant lifecycle (C102 平臺管理員 | 租戶生命週期與跨租戶治理)", () => {
  it("creates a platform tenant, then updates its settings and status, with each write visible on independent re-read", () => {
    const auditService = new AuditNotificationService();
    const service = new TenantsService(auditService);

    // WRITE #1: create.
    const created = service.create({
      name: "QA Regression Tenant",
      code: `qa_regression_${Date.now()}`,
    } as never);
    expect(created.status).toBe("active");

    // READ BACK #1: get() is a distinct read path from create()'s return value.
    expect(service.get(created.id)).toMatchObject({
      name: "QA Regression Tenant",
      status: "active",
    });

    // WRITE #2: settings update.
    service.updateSettings(created.id, { name: "QA Regression Tenant (Renamed)" } as never);
    expect(service.get(created.id).name).toBe("QA Regression Tenant (Renamed)");

    // WRITE #3: lifecycle status transition.
    service.setStatus(created.id, "paused");
    expect(service.get(created.id).status).toBe("paused");

    service.setStatus(created.id, "active");
    expect(service.get(created.id).status).toBe("active");

    // READ BACK: list() includes the tenant with its latest state.
    expect(service.list()).toContainEqual(
      expect.objectContaining({ id: created.id, status: "active" }),
    );
  });

  it("negative: creating a tenant with a code that already exists is rejected (TENANT_CODE_CONFLICT)", () => {
    const service = new TenantsService(new AuditNotificationService());
    const code = `qa_conflict_${Date.now()}`;
    service.create({ name: "First", code } as never);

    expect(
      codeOf(() => service.create({ name: "Second", code } as never)),
    ).toBe("TENANT_CODE_CONFLICT");
  });

  it("negative: transitioning the status of an unknown tenant is rejected instead of creating a phantom record (TENANT_NOT_FOUND)", () => {
    const service = new TenantsService(new AuditNotificationService());
    expect(
      codeOf(() => service.setStatus("tenant-does-not-exist", "paused")),
    ).toBe("TENANT_NOT_FOUND");
  });
});
