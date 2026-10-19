import { vi } from "vitest";
import type {
  OwnedOrderRecord,
  DispatchAssignmentRecord,
} from "../../../packages/contracts/src";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import type {
  MaskedCallPort,
  MaskedCallSubject,
} from "../../../apps/api/src/modules/multi-taxi/masked-call.port";
import { buildOrderFixture } from "../../../apps/api/tests/integration/voice-order-fixture";

export const tenantId = "tenant-contact-sim";
export const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "tenant_admin",
  actorId: "contact-actor-sim",
  realm: "tenant",
  tenantId,
  roleFamilies: ["tenant"],
  roles: ["tenant_admin"],
  scopes: ["tenant:read", "tenant:write"],
  requestId: null,
};
export const availablePort = () => ({
  isAvailable: () => true,
  createSession: vi.fn(
    async (_subject: MaskedCallSubject, _context: { requestId?: string }) => {
      void _subject;
      void _context;
      return {
        contactUri: "tel:+886200000001,,123",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        providerName: "controlled-port-SIM",
      };
    },
  ),
});
export function harness(port?: MaskedCallPort, enabled = true) {
  let order: OwnedOrderRecord | null = buildOrderFixture({
    orderId: "contact-order",
    bookingId: "contact-booking",
    tenantId,
    orderSource: "portal",
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    dispatchSemantics: "reservation",
    status: "assigned",
  });
  let assignments: DispatchAssignmentRecord[] = [
    {
      assignmentId: "contact-assignment",
      dispatchJobId: "contact-job",
      taskId: "contact-task",
      orderId: order.orderId,
      vehicleId: "contact-vehicle",
      driverId: "contact-driver",
      assignmentType: "fixed_price",
      status: "assigned",
      acceptedAt: null,
      rejectedAt: null,
      rejectReasonCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  const queries: string[] = [];
  // Only external SQL is controlled; real Repository SQL/parser, Controller,
  // scope checks and contact commands execute. No contact/assignment decision mock.
  const repository = new OwnedMobilityRepository({
    isEnabled: () => enabled,
    query: async (sql: string, values: unknown[]) => {
      queries.push(sql);
      if (sql.includes("jsonb_build_object"))
        return {
          rows:
            order && values[0] === order.orderId
              ? [
                  {
                    record: {
                      orders: [structuredClone(order)],
                      dispatchAssignments: structuredClone(assignments),
                      dispatchJobs: [],
                      dispatchAttempts: [],
                      driverTasks: [],
                      dispatchTraceLogs: [],
                      passengerDisclosureSnapshots: [],
                    },
                  },
                ]
              : [],
        };
      if (sql.includes("booking_id = $1"))
        return {
          rows:
            order &&
            values[0] === order.bookingId &&
            values[1] === order.tenantId
              ? [{ record: structuredClone(order) }]
              : [],
        };
      throw new Error("Unexpected SQL in contact-only fixture");
    },
  } as never);
  const audit = new AuditNotificationService();
  const service = new OwnedMobilityService(
    {} as never,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService({ emit: () => {} } as never),
    undefined,
    repository,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    // New optional dependency is appended; accepted before ignores extra arg.
    port,
  );
  // Canonical noDB fixture only, using the same legal records as SQL transport.
  const state = service as unknown as {
    orders: OwnedOrderRecord[];
    dispatchAssignments: DispatchAssignmentRecord[];
  };
  state.orders = [structuredClone(order)];
  state.dispatchAssignments = structuredClone(assignments);
  const controller = new OwnedMobilityController(service, {} as never);
  const invoke = (
    actor: BootstrapRequestIdentity | null = identity,
    bookingId = "contact-booking",
    tenant = tenantId,
  ) => {
    const handler = (controller as unknown as Record<string, unknown>)[
      "getTenantBookingDriverContact"
    ];
    if (typeof handler !== "function")
      throw new ApiRequestError(
        404,
        "ROUTE_NOT_FOUND",
        "Tenant contact handler is not implemented.",
      );
    return handler.call(
      controller,
      bookingId,
      actor,
      tenant,
      "contact-request",
    ) as Promise<{
      data: {
        bookingId: string;
        orderId: string;
        assignmentId: string;
        mode: string;
        contactUri: string | null;
        expiresAt: string | null;
        unavailableReason: string | null;
      };
      meta: { requestId: string };
    }>;
  };
  return {
    service,
    controller,
    repository,
    queries,
    invoke,
    get order() {
      return enabled ? order : (state.orders[0] ?? null);
    },
    set order(value) {
      order = value;
      if (!enabled) state.orders = value ? [value] : [];
    },
    get assignments() {
      return enabled ? assignments : state.dispatchAssignments;
    },
    set assignments(value) {
      assignments = value;
      if (!enabled) state.dispatchAssignments = value;
    },
  };
}
