import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { SandboxWebhookAdapter } from "../../apps/api/src/modules/callcenter/sandbox-webhook.adapter";
import { sandboxFixtures } from "../../apps/api/src/modules/callcenter/sandbox.fixtures";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

function createServices() {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const sandboxWebhookAdapter = new SandboxWebhookAdapter(callcenterService);
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter() as never,
  );
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditService,
    new DriverProfileService(auditService),
  );
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditService,
    callcenterService,
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    opsDispatchEventsService,
  );

  return {
    callcenterService,
    ownedMobilityService,
    sandboxWebhookAdapter,
  };
}

describe("sandbox webhook adapter", () => {
  it("keeps late-linked phone bookings in recording_pending until recording.ready arrives", () => {
    const { callcenterService, ownedMobilityService, sandboxWebhookAdapter } =
      createServices();

    sandboxWebhookAdapter.ingest(sandboxFixtures.callStarted, "req-start");
    sandboxWebhookAdapter.ingest(sandboxFixtures.callEnded, "req-end");
    sandboxWebhookAdapter.ingest(
      sandboxFixtures.recordingPending,
      "req-recording-pending",
    );

    const order = ownedMobilityService.createCallCenterOrder(
      {
        callId: sandboxFixtures.callStarted.provider_call_id,
        agentId: sandboxFixtures.callStarted.agent_extension!,
        passenger: {
          name: "王先生",
          phone: sandboxFixtures.callStarted.caller_phone!,
        },
        pickup: {
          address: "台中市梧棲區中二路一段9號",
        },
        dropoff: {
          address: "台中市大安區興安路378號",
        },
      },
      "req-create-order",
    );
    const pendingSession = callcenterService.getCallSession(
      sandboxFixtures.callStarted.provider_call_id,
    );

    expect(order.status).toBe("recording_pending");
    expect(order.complianceFlags).toContain("recording_pending");
    expect(order.complianceFlags).not.toContain("recording_missing");
    expect(pendingSession.recordingState).toBe("pending");
    expect(pendingSession.flags).toContain("recording_pending");
    expect(pendingSession.flags).not.toContain("recording_missing");

    sandboxWebhookAdapter.ingest(
      sandboxFixtures.recordingReady,
      "req-recording-ready",
    );

    const readyOrder = ownedMobilityService.getOrder(order.orderId);
    const readySession = callcenterService.getCallSession(
      sandboxFixtures.callStarted.provider_call_id,
    );

    expect(readyOrder.status).toBe("ready_for_dispatch");
    expect(readyOrder.recordingId).toBe(
      sandboxFixtures.recordingReady.recording_id,
    );
    expect(readyOrder.complianceFlags).toContain("recording_bound");
    expect(readySession.recordingState).toBe("ready");
  });

  it("marks linked phone bookings as recording_missing when sandbox reports recording.failed", () => {
    const { ownedMobilityService, sandboxWebhookAdapter } = createServices();

    sandboxWebhookAdapter.ingest(sandboxFixtures.callStarted, "req-start");
    sandboxWebhookAdapter.ingest(
      sandboxFixtures.recordingPending,
      "req-pending",
    );

    const order = ownedMobilityService.createCallCenterOrder({
      callId: sandboxFixtures.callStarted.provider_call_id,
      agentId: sandboxFixtures.callStarted.agent_extension!,
      passenger: {
        name: "林小姐",
        phone: sandboxFixtures.callStarted.caller_phone!,
      },
      pickup: {
        address: "台中市梧棲區中二路一段9號",
      },
      dropoff: {
        address: "台中市大安區興安路378號",
      },
    });

    sandboxWebhookAdapter.ingest(
      sandboxFixtures.recordingFailed,
      "req-recording-failed",
    );

    const failedOrder = ownedMobilityService.getOrder(order.orderId);

    expect(failedOrder.status).toBe("recording_pending");
    expect(failedOrder.recordingId).toBeNull();
    expect(failedOrder.complianceFlags).toContain("recording_missing");
    expect(failedOrder.complianceFlags).not.toContain("recording_pending");
  });
});
