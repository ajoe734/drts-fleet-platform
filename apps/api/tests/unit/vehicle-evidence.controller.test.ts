import { describe, expect, it, vi } from "vitest";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { VehicleEvidenceController } from "../../src/modules/vehicle-evidence/vehicle-evidence.controller";

describe("VehicleEvidenceController", () => {
  it("wraps recorder registration and segment queries in the standard API envelope", () => {
    const recorder = buildMockRecorderFixture();
    const service = {
      registerRecorder: vi.fn(() => recorder),
      listSegmentIndex: vi.fn(() => [
        {
          segmentId: "segment-001",
          recorderId: recorder.recorderId,
          vehicleId: recorder.vehicleId,
        },
      ]),
    };
    const controller = new VehicleEvidenceController(service as never);

    const registered = controller.registerRecorder(recorder, "req-evd-001");
    const segments = controller.listSegmentIndex(
      recorder.recorderId,
      recorder.vehicleId,
      undefined,
      undefined,
      undefined,
      "false",
      "req-evd-002",
    );

    expect(service.registerRecorder).toHaveBeenCalledWith(recorder);
    expect(registered).toEqual({
      data: recorder,
      meta: {
        requestId: "req-evd-001",
        timestamp: expect.any(String),
      },
    });
    expect(segments).toEqual({
      data: {
        items: [
          {
            segmentId: "segment-001",
            recorderId: recorder.recorderId,
            vehicleId: recorder.vehicleId,
          },
        ],
        pageInfo: {
          page: 1,
          pageSize: 1,
          totalItems: 1,
          totalPages: 1,
        },
      },
      meta: {
        requestId: "req-evd-002",
        timestamp: expect.any(String),
      },
    });
  });

  it("wraps freeze, export, and access-log flows in the standard API envelope", async () => {
    const freeze = {
      freezeId: "freeze-001",
      recorderId: "rec-001",
      vehicleId: "veh-001",
      caseId: "case-001",
      caseReference: "CASE-001",
      requestedReason: "Prepare export",
      requestedBy: null,
      requestedAt: "2026-06-26T14:00:00.000Z",
      sealedAt: "2026-06-26T14:01:00.000Z",
      status: "sealed",
      manifestId: "manifest-001",
      manifestHash: "abcd",
      hashAlgorithm: "sha256-merkle-v1",
      providerSignatureRefs: ["sig-001"],
      sourceSystems: ["onboard_recorder"],
      objectLockEnabled: true,
      objectLockRetainedUntil: "2027-01-01T00:00:00.000Z",
      immutable: true,
      supersedesFreezeId: null,
      verification: null,
      transitionHistory: [],
      artifacts: [],
      exportCount: 0,
      failureCode: null,
      failureReason: null,
    };
    const exportRecord = {
      exportId: "evexp-001",
      freezeId: "freeze-001",
      manifestHash: "abcd",
      caseReference: "CASE-001",
      reason: "Hand off evidence",
      watermarkText: "CASE-001 | ops-user-001 | abcd",
      requestedAt: "2026-06-26T14:02:00.000Z",
      requestedByActorId: "ops-user-001",
      requestedByActorType: "ops_user",
      stepUpMethod: "webauthn",
      stepUpVerifiedAt: "2026-06-26T14:02:00.000Z",
      stepUpSessionId: "mfa-001",
      download: {
        kind: "vehicle-evidence-export",
        subjectId: "evexp-001",
        manifestHash: "abcd",
        host: "https://downloads.drts.local",
        keyId: "phase1-controlled-download-key-v1",
        signedAt: "2026-06-26T14:02:00.000Z",
        expiresAt: "2026-06-26T14:17:00.000Z",
        ttlMinutes: 15,
        signatureVersion: 1,
        signature: "sig",
        downloadUrl: "https://downloads.drts.local/vehicle-evidence-export/evexp-001",
        immutable: true,
      },
    };
    const service = {
      requestEvidenceFreeze: vi.fn(async () => freeze),
      issueControlledExport: vi.fn(() => exportRecord),
      listEvidenceAccessLogs: vi.fn(() => [
        {
          accessId: "evlog-001",
          freezeId: "freeze-001",
          artifactId: null,
          exportId: "evexp-001",
          manifestHash: "abcd",
          action: "export",
          actorId: "ops-user-001",
          actorType: "ops_user",
          requestId: "req-log-001",
          caseReference: "CASE-001",
          reason: "Hand off evidence",
          stepUpMethod: "webauthn",
          stepUpVerifiedAt: "2026-06-26T14:02:00.000Z",
          signedUrlExpiresAt: "2026-06-26T14:17:00.000Z",
          createdAt: "2026-06-26T14:02:00.000Z",
          metadata: {},
        },
      ]),
    };
    const controller = new VehicleEvidenceController(service as never);

    const freezeEnvelope = await controller.requestEvidenceFreeze(
      "rec-001",
      {
        vehicleId: "veh-001",
        windowStart: "2026-06-26T14:00:00.000Z",
        windowEnd: "2026-06-26T14:05:00.000Z",
        caseReference: "CASE-001",
        reason: "Prepare export",
      },
      {
        actorId: "ops-user-001",
        actorType: "ops_user",
        realm: "ops",
        scopes: ["audit:read"],
        tenantId: null,
      } as never,
      "req-freeze-001",
    );
    const exportEnvelope = controller.issueControlledExport(
      "freeze-001",
      {
        reason: "Hand off evidence",
        caseReference: "CASE-001",
        stepUpMethod: "webauthn",
        stepUpVerifiedAt: "2026-06-26T14:02:00.000Z",
        stepUpSessionId: "mfa-001",
      },
      {
        actorId: "ops-user-001",
        actorType: "ops_user",
        realm: "ops",
        scopes: ["audit:read"],
        tenantId: null,
      } as never,
      "req-export-001",
    );
    const accessLogsEnvelope = controller.listEvidenceAccessLogs(
      "freeze-001",
      "export",
      {
        actorId: "ops-user-001",
        actorType: "ops_user",
        realm: "ops",
        scopes: ["audit:read"],
        tenantId: null,
      } as never,
      "req-log-001",
    );

    expect(service.requestEvidenceFreeze).toHaveBeenCalledWith(
      "rec-001",
      expect.objectContaining({
        vehicleId: "veh-001",
        reason: "Prepare export",
      }),
      expect.objectContaining({
        actorId: "ops-user-001",
      }),
      "req-freeze-001",
    );
    expect(freezeEnvelope).toEqual({
      data: freeze,
      meta: {
        requestId: "req-freeze-001",
        timestamp: expect.any(String),
      },
    });
    expect(exportEnvelope).toEqual({
      data: exportRecord,
      meta: {
        requestId: "req-export-001",
        timestamp: expect.any(String),
      },
    });
    expect(accessLogsEnvelope).toEqual({
      data: {
        items: [
          expect.objectContaining({
            accessId: "evlog-001",
            freezeId: "freeze-001",
            action: "export",
          }),
        ],
        pageInfo: {
          page: 1,
          pageSize: 1,
          totalItems: 1,
          totalPages: 1,
        },
      },
      meta: {
        requestId: "req-log-001",
        timestamp: expect.any(String),
      },
    });
  });
});
