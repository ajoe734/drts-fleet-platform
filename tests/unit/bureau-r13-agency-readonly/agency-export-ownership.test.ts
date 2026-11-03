import { describe, expect, it } from "vitest";

import type { MultiTaxiTripOperationalExportRow } from "@drts/contracts";

import type { EvidenceAccessIdentity } from "../../../apps/api/src/common/evidence-governance";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { ReportingFilingService } from "../../../apps/api/src/modules/reporting-filing/reporting-filing.service";

// BUREAU-R13 §4.1: the existing ReportingFilingService export-job path is the
// only export authority. An agency exporter can create jobs and read only the
// jobs it created for its own agency; platform behavior is unchanged.
const exporterA: EvidenceAccessIdentity = {
  actorType: "agency_user",
  actorId: "principal_agency_a_1",
  realm: "agency",
  scopes: ["agency:trip_records:read", "agency:trip_records:export"],
  tenantId: null,
  agencyId: "agency_a",
};
const colleagueA: EvidenceAccessIdentity = {
  ...exporterA,
  actorId: "principal_agency_a_2",
};
const exporterB: EvidenceAccessIdentity = {
  ...exporterA,
  actorId: "principal_agency_b_1",
  agencyId: "agency_b",
};
const viewerA: EvidenceAccessIdentity = {
  ...exporterA,
  scopes: ["agency:trip_records:read"],
};
const platformAdmin: EvidenceAccessIdentity = {
  actorType: "platform_admin",
  actorId: "platform-admin-1",
  realm: "platform",
  scopes: ["multi_taxi_records:export"],
  tenantId: null,
};

const row: MultiTaxiTripOperationalExportRow = {
  orderNoMasked: "ORD...01",
  plateNoMasked: "AB...34",
  reservedAt: "2026-10-01T01:00:00.000Z",
  pickupAt: null,
  dropoffAt: null,
  payableFareMinor: 320,
  actualFareMinor: 320,
  tollMinor: 0,
  currency: "TWD",
  farePolicyVersion: "fare-v3",
  chargingMode: "meter",
  generatedAt: "2026-10-01T01:30:00.000Z",
  retainUntil: "2028-09-30T01:30:00.000Z",
};

async function waitForCompletion(
  service: ReportingFilingService,
  jobId: string,
  identity: EvidenceAccessIdentity,
) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (
      service.getMultiTaxiTripExportJob(jobId, identity).status === "completed"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`export job ${jobId} did not complete`);
}

function create(
  service: ReportingFilingService,
  identity: EvidenceAccessIdentity,
  idempotencyKey: string,
  scope: Record<string, string> = {
    reservedFrom: "2026-10-01",
    reservedTo: "2026-10-31",
  },
) {
  return service.createMultiTaxiTripExportJob(
    {
      scope,
      purpose: "Regulatory inspection of October trips",
      idempotencyKey,
    },
    [row],
    identity,
  );
}

describe("BUREAU-R13 agency export job ownership", () => {
  it("records the owning agency and keeps reservedFrom/reservedTo in the job scope", () => {
    const service = new ReportingFilingService(new AuditNotificationService());
    const accepted = create(service, exporterA, "agency-a-key-1");
    const view = service.getMultiTaxiTripExportJob(accepted.jobId, exporterA);
    expect(view).toMatchObject({
      agencyId: "agency_a",
      requestedByActorId: "principal_agency_a_1",
      recordCount: 1,
      scope: { reservedFrom: "2026-10-01", reservedTo: "2026-10-31" },
    });
  });

  it("lets the creator read and download its own job", async () => {
    const service = new ReportingFilingService(new AuditNotificationService());
    const accepted = create(service, exporterA, "agency-a-key-2");
    await waitForCompletion(service, accepted.jobId, exporterA);
    const download = service.issueMultiTaxiTripExportDownload(
      accepted.jobId,
      exporterA,
    );
    expect(download.recordCount).toBe(1);
    expect(download.manifestHash).toBeTruthy();
  });

  it("hides another agency's job and a same-agency colleague's job as not found", async () => {
    const service = new ReportingFilingService(new AuditNotificationService());
    const accepted = create(service, exporterA, "agency-a-key-3");
    await waitForCompletion(service, accepted.jobId, exporterA);
    for (const other of [exporterB, colleagueA]) {
      expect(() =>
        service.getMultiTaxiTripExportJob(accepted.jobId, other),
      ).toThrowError(
        expect.objectContaining({ code: "MULTI_TAXI_EXPORT_JOB_NOT_FOUND" }),
      );
      expect(() =>
        service.issueMultiTaxiTripExportDownload(accepted.jobId, other),
      ).toThrowError(
        expect.objectContaining({ code: "MULTI_TAXI_EXPORT_JOB_NOT_FOUND" }),
      );
    }
  });

  it("never exposes a platform-created job to an agency, while the platform path is unchanged", async () => {
    const service = new ReportingFilingService(new AuditNotificationService());
    const platformJob = service.createMultiTaxiTripExportJob(
      {
        scope: { month: "2026-10" },
        purpose: "Platform audit",
        idempotencyKey: "platform-key-1",
      },
      [row],
      platformAdmin,
    );
    expect(() =>
      service.getMultiTaxiTripExportJob(platformJob.jobId, exporterA),
    ).toThrowError(
      expect.objectContaining({ code: "MULTI_TAXI_EXPORT_JOB_NOT_FOUND" }),
    );

    // Platform admins keep their existing visibility, including agency jobs.
    const agencyJob = create(service, exporterA, "agency-a-key-4");
    expect(
      service.getMultiTaxiTripExportJob(agencyJob.jobId, platformAdmin)
        .agencyId,
    ).toBe("agency_a");
    expect(
      service.getMultiTaxiTripExportJob(platformJob.jobId, platformAdmin),
    ).not.toHaveProperty("agencyId");
  });

  it("requires agency:trip_records:export and an agency binding for agency exports", () => {
    const service = new ReportingFilingService(new AuditNotificationService());
    expect(() =>
      service.previewMultiTaxiTripExport({}, 1, viewerA),
    ).toThrowError(
      expect.objectContaining({ code: "MULTI_TAXI_EXPORT_FORBIDDEN" }),
    );
    expect(() => create(service, viewerA, "viewer-key")).toThrowError(
      expect.objectContaining({ code: "MULTI_TAXI_EXPORT_FORBIDDEN" }),
    );
    expect(() =>
      create(service, { ...exporterA, agencyId: null }, "unbound-key"),
    ).toThrowError(
      expect.objectContaining({ code: "MULTI_TAXI_EXPORT_FORBIDDEN" }),
    );
    expect(() =>
      service.previewMultiTaxiTripExport({}, 1, {
        ...exporterA,
        actorType: "platform_admin",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "MULTI_TAXI_EXPORT_FORBIDDEN" }),
    );
  });

  it("validates reservedFrom/reservedTo and binds them into idempotency", () => {
    const service = new ReportingFilingService(new AuditNotificationService());
    expect(() =>
      create(service, exporterA, "bad-date", { reservedFrom: "2026-13-01" }),
    ).toThrowError(
      expect.objectContaining({ code: "MULTI_TAXI_EXPORT_DATE_INVALID" }),
    );
    expect(() =>
      create(service, exporterA, "bad-range", {
        reservedFrom: "2026-10-31",
        reservedTo: "2026-10-01",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "MULTI_TAXI_EXPORT_DATE_RANGE_INVALID" }),
    );
    const first = create(service, exporterA, "range-key");
    expect(create(service, exporterA, "range-key").jobId).toBe(first.jobId);
    expect(() =>
      create(service, exporterA, "range-key", { reservedFrom: "2026-09-01" }),
    ).toThrowError(
      expect.objectContaining({
        code: "MULTI_TAXI_EXPORT_IDEMPOTENCY_CONFLICT",
      }),
    );
  });
});
