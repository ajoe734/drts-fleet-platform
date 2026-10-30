import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ContractOperationalViewService } from "../../apps/api/src/modules/regulatory-registry/contract-operational-view.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

function world() {
  // Original events/documents are external ports here; no lifecycle hooks,
  // database, server or fake completed contract read model is installed.
  const events = {
    publishSupplyLifecycleUpdated() {},
    publishSupplyOffboardingInitiated() {},
    publishSupplyDebrandingCompleted() {},
  };
  const registry = new RegulatoryRegistryService(
    events as never,
    new AuditNotificationService(),
    null as never,
  );
  const view = new ContractOperationalViewService(registry);
  const vehicleId = registry.listVehicles()[0]!.vehicleId;
  const create = () =>
    registry.createContract({
      vehicleId,
      partnerId: "unit-version-fleet",
      partnerType: "fleet_partner",
      contractType: "fleet_participation_contract",
      serviceScope: "business_dispatch",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2030-12-31T23:59:59.000Z",
    });
  const renew = (approvedAt: string) =>
    registry.provisionFromSubmission(null, {
      // The normally approved renewal input is controlled at the document/Fleet
      // boundary. Both resulting contract rows come from the actual producer.
      submission: {
        submissionId: "unit-version-approved-renewal",
        submissionType: "contract_update",
        status: "submitted",
        fleetPartnerId: "unit-version-fleet",
        subjectVehicleId: vehicleId,
        canonicalVehicleId: vehicleId,
        canonicalDriverId: null,
        canonicalContractId: null,
        canonicalPolicyId: null,
      } as unknown as Parameters<
        RegulatoryRegistryService["provisionFromSubmission"]
      >[1]["submission"],
      driverDraft: null,
      vehicleDraft: null,
      documents: [
        {
          documentType: "fleet_participation_contract",
          fileId: "unit-approved-document-SIM",
          effectiveFrom: "2026-02-01",
          effectiveUntil: "2031-12-31",
        },
      ] as unknown as Parameters<
        RegulatoryRegistryService["provisionFromSubmission"]
      >[1]["documents"],
      approvedAt,
      reviewerId: "unit-version-reviewer",
    });
  return { registry, view, create, renew };
}
afterEach(() => {
  vi.useRealTimers();
});

describe("C134 original approved version origin after normal renewal", () => {
  it("keeps the original approval as the v2 start after public renewal terminates that same contract", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-02-01T08:00:00.000Z");
    const h = world();
    const created = await h.create();
    expect(
      (await h.view.getOperationalViewFromPersistence(created.contractId))
        .effectiveVersion,
    ).toMatchObject({
      versionNumber: 1,
      versionTag: "v1.0",
      effectiveFrom: created.startAt,
    });
    vi.setSystemTime("2026-02-01T08:01:00.000Z");
    const approvedAt = new Date().toISOString();
    await h.registry.activateContract(created.contractId, {
      approvedBy: "unit-version-reviewer",
      approvedAt,
    });
    expect(
      (await h.view.getOperationalViewFromPersistence(created.contractId))
        .effectiveVersion,
    ).toMatchObject({
      versionNumber: 2,
      versionTag: "v2.0",
      effectiveFrom: approvedAt,
    });
    vi.setSystemTime("2026-02-01T08:02:00.000Z");
    const renewedAt = new Date().toISOString();
    const renewed = await h.renew(renewedAt);
    const old = await h.registry.findContractFromPersistence(
      created.contractId,
    );
    expect(old).toMatchObject({
      contractId: created.contractId,
      status: "terminated",
      approvedAt,
      updatedAt: renewedAt,
      supersededAt: renewedAt,
      supersededByContractId: renewed.canonicalContractId,
    });
    const view = await h.view.getOperationalViewFromPersistence(
      created.contractId,
    );
    expect(view.effectiveVersion).toEqual({
      versionNumber: 2,
      versionTag: "v2.0",
      effectiveFrom: approvedAt,
      effectiveTo: created.endAt,
    });
    expect(view.dataStatus.effectiveVersion).toBe("available");
    expect(
      (await h.view.getOperationalTermsFromPersistence(created.contractId))
        .effectiveVersion,
    ).toBe("v2.0");
  });

  it("keeps the original initial v1 but does not invent approval from a normal supersession update on an unapproved draft", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-02-01T08:00:00.000Z");
    const h = world();
    const created = await h.create();
    expect(created.approvedAt).toBeNull();
    expect(
      (await h.view.getOperationalViewFromPersistence(created.contractId))
        .effectiveVersion,
    ).toEqual({
      versionNumber: 1,
      versionTag: "v1.0",
      effectiveFrom: created.startAt,
      effectiveTo: created.endAt,
    });
    vi.setSystemTime("2026-02-01T08:02:00.000Z");
    const updatedAt = new Date().toISOString();
    const renewed = await h.renew(updatedAt);
    expect(
      await h.registry.findContractFromPersistence(created.contractId),
    ).toMatchObject({
      contractId: created.contractId,
      status: "terminated",
      approvedAt: null,
      updatedAt,
      supersededByContractId: renewed.canonicalContractId,
    });
    const view = await h.view.getOperationalViewFromPersistence(
      created.contractId,
    );
    expect(view.effectiveVersion).toBeNull();
    expect(view.dataStatus.effectiveVersion).toBe("missing_data");
    expect(
      (await h.view.getOperationalTermsFromPersistence(created.contractId))
        .effectiveVersion,
    ).toBeNull();
  });
});
