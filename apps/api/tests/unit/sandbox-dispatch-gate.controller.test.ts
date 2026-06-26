import { describe, expect, it, vi } from "vitest";

import { SandboxDispatchGateController } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.controller";
import type { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";

describe("SandboxDispatchGateController", () => {
  it("awaits evaluation before wrapping the API envelope", async () => {
    const service = {
      evaluateDispatch: vi.fn().mockResolvedValue({
        decisionId: "dec-001",
        orderId: "order-001",
        dispatchJobId: "job-001",
        vehicleId: "veh-av-001",
        sandboxProgramId: "sandbox-program-001",
        decision: "block",
        oddInBounds: false,
        hardReasonCodes: ["ODD_OUT_OF_BOUNDS"],
        softReasonCodes: [],
        requiredSafetyOperatorId: null,
        policyVersion: "sandbox-dispatch-gate.v1",
        evaluatedAt: "2026-06-26T00:00:00.000Z",
      }),
    } as unknown as SandboxDispatchGateService;
    const controller = new SandboxDispatchGateController(service);

    const response = await controller.evaluate(
      {
        orderId: "order-001",
        vehicleId: "veh-av-001",
        sandboxProgramId: "sandbox-program-001",
        policyVersion: "sandbox-dispatch-gate.v1",
      },
      "req-sandbox-eval-001",
    );

    expect(response.data).toMatchObject({
      orderId: "order-001",
      decision: "block",
    });
    expect(service.evaluateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-001" }),
      "req-sandbox-eval-001",
    );
  });
});
