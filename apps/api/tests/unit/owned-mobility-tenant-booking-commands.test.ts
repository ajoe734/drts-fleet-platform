import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

function createService(options?: {
  tenantPartnerService?: TenantPartnerService;
}) {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => []),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const auditNotificationService = {
    recordNotification: vi.fn(),
    recordAuditLog: vi.fn(),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };
  const taskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter2(),
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    new EventEmitter2(),
  );

  return new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    options?.tenantPartnerService,
  );
}

const SAMPLE_BOOKING_INPUT = {
  businessDispatchSubtype: "enterprise_dispatch" as const,
  reservationWindowStart: "2026-04-29T14:00:00.000Z",
  reservationWindowEnd: "2026-04-29T15:00:00.000Z",
  pickup: { address: "Pickup HQ" },
  dropoff: { address: "Dropoff Terminal" },
  passenger: { name: "Rider One", phone: "0912000000" },
};

describe("OwnedMobilityService tenant booking command pattern (Q-TEN04)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns completed command result with booking envelope when no approval pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const service = createService();

    const result = await service.createTenantBookingCommand(
      SAMPLE_BOOKING_INPUT,
      "tenant-demo-001",
    );

    expect(result.command).toBe("create_booking");
    expect(result.status).toBe("completed");
    expect(result.pendingReasonCode).toBeNull();
    expect(typeof result.commandId).toBe("string");
    expect(result.commandId.length).toBeGreaterThan(0);
    expect(result.booking).toMatchObject({
      bookingId: result.bookingId,
      tenantId: "tenant-demo-001",
      approvalState: "not_required",
      status: "active",
    });
  });

  it("returns accepted+pending command result when governance approval is required", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    tenantPartnerService.upsertApprovalRule("tenant-demo-001", {
      ruleName: "Always require approval",
      priority: 1,
      conditions: [{ field: "booking.amount_minor", op: "gte", value: 0 }],
      action: "require_approval",
      approvalMode: "any_of",
      approvers: [{ kind: "tenant_admin" }],
    });
    const service = createService({ tenantPartnerService });

    const result = await service.createTenantBookingCommand(
      SAMPLE_BOOKING_INPUT,
      "tenant-demo-001",
    );

    expect(result.status).toBe("accepted");
    expect(result.pendingReasonCode).toBe("approval_required");
    expect(result.booking.approvalState).toBe("pending");
    expect(result.booking.approvalRequestIds.length).toBe(1);
  });

  it("update command routes through existing update flow and returns refreshed booking", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const service = createService();
    const created = await service.createTenantBookingCommand(
      SAMPLE_BOOKING_INPUT,
      "tenant-demo-001",
    );

    const updated = await service.updateTenantBookingCommand(
      "tenant-demo-001",
      created.bookingId,
      { notes: "VIP guest" },
    );

    expect(updated.command).toBe("update_booking");
    expect(updated.status).toBe("completed");
    expect(updated.booking.notes).toBe("VIP guest");
    expect(updated.commandId).not.toBe(created.commandId);
  });

  it("cancel command moves the booking to cancelled and returns completed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const service = createService();
    const created = await service.createTenantBookingCommand(
      SAMPLE_BOOKING_INPUT,
      "tenant-demo-001",
    );

    const cancelled = service.cancelTenantBookingCommand(
      "tenant-demo-001",
      created.bookingId,
      { reason: "Rider cancelled" },
    );

    expect(cancelled.command).toBe("cancel_booking");
    expect(cancelled.status).toBe("completed");
    expect(cancelled.pendingReasonCode).toBeNull();
    expect(cancelled.booking.status).toBe("cancelled");
    expect(cancelled.booking.readOnlyReasonCode).toBe("cancelled");
  });

  it("update command surfaces ORDER_NOT_MODIFIABLE when past editableUntil", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const service = createService();
    const created = await service.createTenantBookingCommand(
      SAMPLE_BOOKING_INPUT,
      "tenant-demo-001",
    );

    // Move past modifiableUntil — enterprise_dispatch locks edits well
    // before reservationWindowStart.
    vi.setSystemTime(new Date("2026-04-29T13:59:00.000Z"));

    expect(() =>
      service.updateTenantBookingCommand("tenant-demo-001", created.bookingId, {
        notes: "too late",
      }),
    ).toThrowError(ApiRequestError);
  });
});

describe("BookingRecord exposes editableUntil/readOnlyReasonCode/availableActions (Q-TEN05)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("populates editable metadata + enabled update/cancel actions while in editable window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const service = createService();
    const created = await service.createTenantBookingCommand(
      SAMPLE_BOOKING_INPUT,
      "tenant-demo-001",
    );
    const booking = service.getTenantBooking(
      "tenant-demo-001",
      created.bookingId,
    );

    expect(booking.editableUntil).not.toBeNull();
    expect(booking.readOnlyReasonCode).toBeNull();
    const actions = Object.fromEntries(
      booking.availableActions.map((entry) => [entry.action, entry]),
    );
    expect(actions.update_booking).toMatchObject({
      enabled: true,
      riskLevel: "medium",
    });
    expect(actions.cancel_booking).toMatchObject({
      enabled: true,
      riskLevel: "high",
      requiresReason: true,
    });
  });

  it("flips to past_editable_window once now > modifiableUntil and disables update", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const service = createService();
    const created = await service.createTenantBookingCommand(
      SAMPLE_BOOKING_INPUT,
      "tenant-demo-001",
    );

    vi.setSystemTime(new Date("2026-04-29T13:59:00.000Z"));
    const booking = service.getTenantBooking(
      "tenant-demo-001",
      created.bookingId,
    );

    expect(booking.readOnlyReasonCode).toBe("past_editable_window");
    const update = booking.availableActions.find(
      (entry) => entry.action === "update_booking",
    );
    expect(update).toMatchObject({
      enabled: false,
      disabledReasonCode: "past_editable_window",
    });
  });

  it("marks cancelled bookings as readOnly with both actions disabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
    const service = createService();
    const created = await service.createTenantBookingCommand(
      SAMPLE_BOOKING_INPUT,
      "tenant-demo-001",
    );
    service.cancelTenantBookingCommand("tenant-demo-001", created.bookingId, {
      reason: "Test",
    });

    const booking = service.getTenantBooking(
      "tenant-demo-001",
      created.bookingId,
    );

    expect(booking.readOnlyReasonCode).toBe("cancelled");
    expect(booking.availableActions.every((entry) => !entry.enabled)).toBe(
      true,
    );
    expect(
      booking.availableActions.every(
        (entry) => entry.disabledReasonCode === "cancelled",
      ),
    ).toBe(true);
  });
});
