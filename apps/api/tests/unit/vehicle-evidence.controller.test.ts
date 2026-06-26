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
});
