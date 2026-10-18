import { describe, expect, it, vi } from "vitest";
import { OwnedAutonomousDispatchExecutorService } from "../../../apps/api/src/modules/owned-mobility/owned-autonomous-dispatch-executor.service";
import {
  buildOwnedMobilityServiceForTest,
  createTestPassengerOrder,
} from "../system-remediation/sr-qa-dispatch-001/test-support";

const candidate = {
  driverId: "driver-no-supply-test",
  vehicleId: "vehicle-no-supply-test",
  etaMinutes: 1,
  operatingArea: "taipei",
  serviceBuckets: ["standard_taxi"],
};

describe("autonomous exhausted offer retains the original no-supply policy", () => {
  it("keeps the first no-supply result in the delayed retry queue", async () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });
    const order = createTestPassengerOrder(service);
    const result = await service.executeAutoDispatch(order.orderId);
    expect(result.status).toBe("no_supply");
    expect(service.getOrder(order.orderId)).toMatchObject({
      status: "delayed_queue",
      queueFamily: "delayed_retry_queue",
      dispatchAttemptCount: 1,
      noSupplyEscalation: {
        dispatchJobId: result.dispatchJobId,
        escalationAction: "move_to_delayed_queue",
      },
    });
    expect(service.getDispatchJob(result.dispatchJobId)?.status).toBe(
      "no_supply",
    );
  });

  it("replaying committed no-supply on a fresh executor does not consume another attempt", async () => {
    const { service } = buildOwnedMobilityServiceForTest({ candidates: [] });
    const order = createTestPassengerOrder(service);
    const first = await service.executeAutoDispatch(order.orderId);
    const second = await new OwnedAutonomousDispatchExecutorService(
      service,
    ).requestDispatch(order.orderId);
    expect(second.dispatchJobId).toBe(first.dispatchJobId);
    expect(service.getOrder(order.orderId).dispatchAttemptCount).toBe(1);
    expect(
      service.listDispatchJobs().filter((j) => j.orderId === order.orderId),
    ).toHaveLength(1);
  });

  it("supply returning does not make replay bypass the existing retry queue", async () => {
    let hasSupply = false;
    const { service } = buildOwnedMobilityServiceForTest({
      getEligibleCandidates: () => (hasSupply ? [candidate] : []),
    });
    const order = createTestPassengerOrder(service);
    await service.executeAutoDispatch(order.orderId);
    hasSupply = true;
    const replay = await new OwnedAutonomousDispatchExecutorService(
      service,
    ).requestDispatch(order.orderId);
    expect(replay.status).toBe("no_supply");
    expect(service.getOrder(order.orderId).status).toBe("delayed_queue");
    expect(service.getDriverTasksForOrder(order.orderId)).toHaveLength(0);
  });

  it("supply disappearing after matching persists the policy on the same job", async () => {
    let hasSupply = true;
    const { service } = buildOwnedMobilityServiceForTest({
      getEligibleCandidates: () => (hasSupply ? [candidate] : []),
    });
    const order = createTestPassengerOrder(service);
    const job = await service.dispatchOrder(order.orderId, { mode: "auto" });
    hasSupply = false;
    const result = await service
      .getAutonomousDispatchExecutor()
      .executeOfferRound(order.orderId);
    expect(result).toMatchObject({
      status: "no_supply",
      dispatchJobId: job.dispatchJobId,
    });
    expect(service.getOrder(order.orderId)).toMatchObject({
      status: "delayed_queue",
      dispatchAttemptCount: 1,
    });
    expect(service.getDispatchJob(job.dispatchJobId)?.status).toBe("no_supply");
  });

  it("capacity exhausted by another order queues the loser and leaves the winner assigned", async () => {
    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [candidate],
    });
    const winner = createTestPassengerOrder(service);
    const loser = createTestPassengerOrder(service);
    const first = await service.executeAutoDispatch(winner.orderId);
    const second = await service.executeAutoDispatch(loser.orderId);
    expect(first.status).toBe("offered");
    expect(second.status).toBe("no_supply");
    expect(service.getOrder(loser.orderId).status).toBe("delayed_queue");
    expect(service.getOrder(winner.orderId).status).toBe("assigned");
    expect(service.getDriverTasksForOrder(winner.orderId)).toHaveLength(1);
    expect(service.getDriverTasksForOrder(loser.orderId)).toHaveLength(0);
  });

  it("failed persistence does not publish a no-supply result or mutate the cached order", async () => {
    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [candidate],
    });
    const order = createTestPassengerOrder(service);
    const job = await service.dispatchOrder(order.orderId, { mode: "auto" });
    const before = service.getOrder(order.orderId);
    const boundary = service as unknown as {
      persistChangesRequired(...args: unknown[]): Promise<void>;
    };
    const writer = vi
      .spyOn(boundary, "persistChangesRequired")
      .mockRejectedValueOnce(
        new Error("injected no-supply persistence failure"),
      );
    await expect(
      service.completeAutonomousNoSupply(
        order.orderId,
        job.dispatchJobId,
        "no_eligible_candidate",
      ),
    ).rejects.toThrow("injected no-supply persistence failure");
    expect(service.getOrder(order.orderId)).toEqual(before);
    expect(service.getDispatchJob(job.dispatchJobId)?.status).toBe("matching");
    writer.mockRestore();
  });
});
