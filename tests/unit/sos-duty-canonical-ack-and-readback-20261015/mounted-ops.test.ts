// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IncidentService } from "../../../apps/api/src/modules/incident/incident.service";
import { DriverSosService } from "../../../apps/api/src/modules/driver-sos/driver-sos.service";
import { DriverSosVerificationRepository } from "../../../apps/api/src/modules/driver-sos/driver-sos-verification.repository";
import { OpsDriverSosController } from "../../../apps/api/src/modules/driver-sos/driver-sos.controller";
import SosQueuePage from "../../../apps/ops-console-web/app/sos/page";
import SosDetailPage from "../../../apps/ops-console-web/app/sos/[incidentId]/page";

const state = vi.hoisted(() => ({ client: null as any, incidentId: "" }));
vi.mock("../../../apps/ops-console-web/lib/api-client", () => ({
  getOpsClient: () => state.client,
  DEFAULT_OPS_ACTOR_ID: "unused-fallback",
  createOpsDispatchEventSource: () => ({ addEventListener() {}, close() {} }),
}));
vi.mock("../../../apps/ops-console-web/lib/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {} }),
  useParams: () => ({ incidentId: state.incidentId }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function identity(
  actorId: string,
  realm: "ops" | "driver",
): BootstrapRequestIdentity {
  return {
    actorId,
    realm,
    authMode: "bootstrap_headers",
    actorType: realm === "ops" ? "ops_user" : "driver_user",
    tenantId: null,
    roleFamilies: [realm],
    roles: [realm === "ops" ? "ops_dispatcher" : "driver_user"],
    scopes: ["incident:read", "incident:write", "driver:read", "driver:write"],
    requestId: actorId,
  };
}
async function harness(existingOwner?: string, status?: "closed") {
  let resolve!: (value: any) => void;
  let reject!: (error: unknown) => void;
  const write = new Promise<any>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  const verification = new DriverSosVerificationRepository();
  let attempted:
    | Parameters<
        DriverSosVerificationRepository["persistDutyAcknowledgement"]
      >[0]
    | null = null;
  vi.spyOn(verification, "persistDutyAcknowledgement").mockImplementation(
    (event) => {
      attempted = event;
      return write;
    },
  );
  const audit = new AuditNotificationService();
  const incident = new IncidentService(audit);
  const service = new DriverSosService(
    audit,
    incident,
    undefined,
    verification,
  );
  const driver = identity("driver-mounted", "driver");
  const actor = identity("ops-mounted", "ops");
  const sos = await service.submitSosEvent(
    {
      clientEventId: "ab999999-9999-4999-8999-999999999999",
      eventType: "traffic_accident",
      severity: "major",
      originalTriggeredAt: new Date().toISOString(),
      offlineAtTrigger: false,
    },
    driver,
  );
  if (existingOwner || status)
    incident.updateIncident(sos.receipt.incidentId, {
      ...(existingOwner ? { assignedTo: existingOwner } : {}),
      ...(status ? { status } : {}),
    });
  const controller = new OpsDriverSosController(service);
  state.incidentId = sos.receipt.incidentId;
  const post = vi.fn(async (path: string, options: { body: any }) => {
    if (path.endsWith("/duty-ack"))
      return (
        await controller.acknowledgeDuty(
          sos.event.sosEventId,
          options.body,
          actor,
        )
      ).data;
    if (path.endsWith("/alerts/rendered"))
      return (await controller.recordAlertsRendered(options.body, actor)).data;
    throw new Error(`Unexpected POST ${path}`);
  });
  state.client = {
    get: async (path: string) => {
      if (path === "/api/incidents") return { items: incident.listIncidents() };
      if (path === `/api/incidents/${state.incidentId}`)
        return incident.getIncident(state.incidentId);
      if (path.endsWith("/timeline"))
        return { items: incident.getTimeline(state.incidentId) };
      if (path.includes("/by-incident/"))
        return (
          await controller.getSosEventByIncidentId(state.incidentId, actor)
        ).data;
      if (path === "/api/identity/context") return actor;
      if (path.endsWith("alert-latency"))
        return service.getOpsAlertLatencySummary({}, actor);
      return { items: [] };
    },
    post,
  };
  return {
    post,
    resolve: () =>
      resolve({
        accepted: true,
        acknowledgedByActorId:
          attempted!.dutyAcknowledgement.acknowledgedByActorId!,
        acknowledgedAt: attempted!.dutyAcknowledgement.acknowledgedAt!,
        status: attempted!.status,
      }),
    reject,
    service,
    sos,
    actor,
  };
}

describe.each([
  ["list", SosQueuePage],
  ["detail", SosDetailPage],
] as const)("Mounted Ops SOS %s actual ACK caller", (_name, Page) => {
  it("awaits the real controller/service durability boundary before showing success", async () => {
    const h = await harness();
    render(createElement(Page));
    fireEvent.click(
      await screen.findByRole("button", { name: "sos.action.acknowledge" }),
    );
    await waitFor(() =>
      expect(
        h.post.mock.calls.some(([path]) => path.endsWith("/duty-ack")),
      ).toBe(true),
    );
    expect(screen.queryByText("已確認接手")).toBeNull();
    const command = h.post.mock.calls.find(([path]) =>
      path.endsWith("/duty-ack"),
    )!;
    expect(command[0]).toBe(
      `/api/ops/driver-sos/${h.sos.event.sosEventId}/duty-ack`,
    );
    expect(command[1].body).toEqual({}); // actor comes from verified identity, never body/default label
    h.resolve();
    await screen.findByText("已確認接手");
    const readback = await h.service.getEventForOps(
      h.sos.event.sosEventId,
      h.actor,
    );
    expect(readback.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
      h.actor.actorId,
    );
    expect(
      readback.timeline.filter(
        (entry) => entry.eventType === "duty_acknowledged",
      ),
    ).toHaveLength(1);
  });
  it("keeps duty unclaimed for an existing generic Incident owner, then displays the canonical competing owner", async () => {
    const h = await harness("ops-generic-owner");
    render(createElement(Page));
    fireEvent.click(
      await screen.findByRole("button", { name: "sos.action.acknowledge" }),
    );
    await waitFor(() =>
      expect(
        h.post.mock.calls.some(([path]) => path.endsWith("/duty-ack")),
      ).toBe(true),
    );
    expect(screen.queryByText("已確認接手")).toBeNull();
    h.resolve();
    await screen.findByText("First-writer-wins");
    expect(screen.queryByText("已確認接手")).toBeNull();
    const actual = await h.service.getEventForOps(
      h.sos.event.sosEventId,
      h.actor,
    );
    expect(actual.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
      "ops-generic-owner",
    );
    expect(
      actual.timeline.filter(
        (entry) => entry.eventType === "duty_acknowledged",
      ),
    ).toHaveLength(1);
  });

  it("shows the real rejection and no success banner when the durable ACK rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const h = await harness();
    render(createElement(Page));
    fireEvent.click(
      await screen.findByRole("button", { name: "sos.action.acknowledge" }),
    );
    await waitFor(() =>
      expect(
        h.post.mock.calls.some(([path]) => path.endsWith("/duty-ack")),
      ).toBe(true),
    );
    h.reject(new Error("durable ACK rejected"));
    await screen.findByText("確認接手失敗");
    expect(screen.queryByText("已確認接手")).toBeNull();
    expect(
      (await h.service.getEventForOps(h.sos.event.sosEventId, h.actor)).event
        .dutyAcknowledgement.acknowledgedByActorId,
    ).toBeNull();
  });
});

it("mounted detail can still acknowledge an already-closed unclaimed SOS without regressing its lifecycle", async () => {
  const h = await harness(undefined, "closed");
  render(createElement(SosDetailPage));
  fireEvent.click(
    await screen.findByRole("button", { name: "sos.action.acknowledge" }),
  );
  await waitFor(() =>
    expect(h.post.mock.calls.some(([path]) => path.endsWith("/duty-ack"))).toBe(
      true,
    ),
  );
  h.resolve();
  await screen.findByText("已確認接手");
  const actual = await h.service.getEventForOps(
    h.sos.event.sosEventId,
    h.actor,
  );
  expect(actual.event.status).toBe("closed");
  expect(actual.event.dutyAcknowledgement.acknowledgedByActorId).toBe(
    h.actor.actorId,
  );
});
