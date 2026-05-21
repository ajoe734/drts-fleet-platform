import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { sandboxFixtures } from "../../src/modules/callcenter/sandbox.fixtures";
import { SandboxWebhookAdapter } from "../../src/modules/callcenter/sandbox-webhook.adapter";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";

function createOwnedMobilityHarness() {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => []),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const taskEventsService = {
    publishTaskAssigned: vi.fn(),
    publishTaskUpdated: vi.fn(),
    publishTaskCancelled: vi.fn(),
  };
  const auditNotificationService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditNotificationService);
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService,
    callcenterService,
    taskEventsService as never,
  );

  return {
    adapter: new SandboxWebhookAdapter(callcenterService),
    callcenterService,
    ownedMobilityService,
  };
}

describe("SandboxWebhookAdapter", () => {
  it("creates an external call session from call.started payloads", () => {
    const { adapter, callcenterService } = createOwnedMobilityHarness();

    const result = adapter.ingest(sandboxFixtures.callStarted, "req-sbx-001");

    expect(result.accepted).toBe(true);
    expect(result.callId).toBe(sandboxFixtures.callStarted.provider_call_id);
    expect(callcenterService.getCallSession(result.callId)).toMatchObject({
      callId: sandboxFixtures.callStarted.provider_call_id,
      callerPhone: sandboxFixtures.callStarted.caller_phone,
      agentId: sandboxFixtures.callStarted.agent_extension,
      status: "active",
      recordingState: "pending",
      flags: expect.arrayContaining(["recording_pending"]),
    });
  });

  it("keeps phone orders pending until recording.ready arrives", () => {
    const { adapter, ownedMobilityService } = createOwnedMobilityHarness();

    adapter.ingest(sandboxFixtures.callStarted, "req-sbx-002");
    const order = ownedMobilityService.createCallCenterOrder({
      callId: sandboxFixtures.callStarted.provider_call_id,
      agentId: "ops-001",
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Songshan Airport" },
      passenger: { name: "Sandbox Rider", phone: "0911000001" },
    });

    adapter.ingest(sandboxFixtures.recordingPending, "req-sbx-003");
    expect(ownedMobilityService.getOrder(order.orderId)).toMatchObject({
      callId: sandboxFixtures.callStarted.provider_call_id,
      status: "recording_pending",
      recordingId: null,
      complianceFlags: ["recording_pending"],
    });

    adapter.ingest(sandboxFixtures.recordingReady, "req-sbx-004");
    expect(ownedMobilityService.getOrder(order.orderId)).toMatchObject({
      callId: sandboxFixtures.callStarted.provider_call_id,
      status: "ready_for_dispatch",
      recordingId: sandboxFixtures.recordingReady.recording_id,
      complianceFlags: expect.arrayContaining(["recording_bound"]),
    });
  });

  it("marks linked phone orders missing when recording.failed lands after call end", () => {
    const { adapter, ownedMobilityService, callcenterService } =
      createOwnedMobilityHarness();

    adapter.ingest(sandboxFixtures.callStarted, "req-sbx-005");
    adapter.ingest(sandboxFixtures.callEnded, "req-sbx-006");

    const order = ownedMobilityService.createCallCenterOrder({
      callId: sandboxFixtures.callStarted.provider_call_id,
      agentId: "ops-001",
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Songshan Airport" },
      passenger: { name: "Sandbox Rider", phone: "0911000001" },
    });

    expect(callcenterService.getCallSession(order.callId!)).toMatchObject({
      status: "closed",
      recordingState: "missing",
      flags: expect.arrayContaining(["recording_missing"]),
    });

    adapter.ingest(sandboxFixtures.recordingFailed, "req-sbx-007");
    expect(ownedMobilityService.getOrder(order.orderId)).toMatchObject({
      status: "recording_pending",
      recordingId: null,
      complianceFlags: ["recording_missing"],
      queueEntryReason: "recording_missing_for_dispatch",
    });
  });

  it("rejects recording.ready without recording_id before mutating session state", () => {
    const { adapter, callcenterService } = createOwnedMobilityHarness();

    try {
      adapter.ingest(
        {
          ...sandboxFixtures.recordingReady,
          recording_id: "   ",
        },
        "req-sbx-008",
      );
      throw new Error(
        "Expected adapter.ingest to reject invalid recording.ready payload.",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).response.error.code).toBe(
        "RECORDING_ID_REQUIRED",
      );
    }

    try {
      callcenterService.getCallSession(
        sandboxFixtures.recordingReady.provider_call_id,
      );
      throw new Error(
        "Expected no session to be created for invalid recording.ready payload.",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).response.error.code).toBe(
        "CALL_SESSION_NOT_FOUND",
      );
    }
  });
});
