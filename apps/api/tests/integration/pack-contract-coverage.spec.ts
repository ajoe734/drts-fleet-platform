import "reflect-metadata";

import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../src/app.module";

type WireRecord = Record<string, unknown>;

type BootstrapHeadersInput = {
  actorId: string;
  actorType: string;
  realm: string;
  requestId: string;
  tenantId?: string;
};

type RequestOptions = {
  body?: unknown;
  headers: BootstrapHeadersInput;
  method: "PATCH" | "POST";
  path: string;
};

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api", {
    exclude: ["health"],
  });
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | string | null;
  if (!address || typeof address === "string") {
    throw new Error("Expected HTTP server to bind to an ephemeral port.");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
}, 60_000);

afterAll(async () => {
  await app.close();
});

function expectIsoString(value: string) {
  expect(Number.isNaN(Date.parse(value))).toBe(false);
}

function buildHeaders(input: BootstrapHeadersInput): HeadersInit {
  return {
    "content-type": "application/json",
    "x-actor-id": input.actorId,
    "x-actor-type": input.actorType,
    "x-realm": input.realm,
    "x-request-id": input.requestId,
    ...(input.tenantId ? { "x-tenant-id": input.tenantId } : {}),
  };
}

async function requestJson(options: RequestOptions) {
  const response = await fetch(`${baseUrl}${options.path}`, {
    method: options.method,
    headers: buildHeaders(options.headers),
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const body = (await response.json()) as WireRecord;

  return { body, response };
}

function expectSuccessEnvelope(
  body: WireRecord,
  expectedRequestId: string,
): WireRecord {
  const meta = body.meta as WireRecord;
  const data = body.data as WireRecord;

  expect(meta.request_id).toBe(expectedRequestId);
  expectIsoString(String(meta.timestamp));

  return data;
}

function expectMutationContracts(
  data: WireRecord,
  expected: {
    actionId: string;
    resourceId: string;
    resourceType: string;
    staleAfterMs: number;
  },
) {
  const receipt = data.receipt as WireRecord;
  const refresh = data.refresh as WireRecord;
  const availableActions = data.available_actions as WireRecord[];

  expect(receipt).toEqual(
    expect.objectContaining({
      action_id: expected.actionId,
      audit_id: expect.any(String),
      message: expect.any(String),
      resource_id: expected.resourceId,
      resource_type: expected.resourceType,
      status: "completed",
    }),
  );
  expect(String(receipt.audit_id)).toContain(expected.actionId);

  expect(refresh).toEqual(
    expect.objectContaining({
      data_freshness: "fresh",
      source: "live",
      stale_after_ms: expected.staleAfterMs,
    }),
  );
  expectIsoString(String(refresh.generated_at));

  expect(Array.isArray(availableActions)).toBe(true);
  expect(availableActions.length).toBeGreaterThan(0);
  expect(availableActions[0]).toEqual(
    expect.objectContaining({
      action: expect.any(String),
      enabled: expect.any(Boolean),
      risk_level: expect.stringMatching(/^(low|medium|high)$/),
    }),
  );
}

describe("Pack contract coverage", () => {
  it("covers ActionReceipt, ResourceActionDescriptor, and UiRefreshMetadata for platform-admin rollout mutations", async () => {
    const suffix = randomUUID().slice(0, 8);
    const createRequestId = `req-platform-create-${suffix}`;
    const rolloutRequestId = `req-platform-rollout-${suffix}`;

    const createResponse = await requestJson({
      method: "POST",
      path: "/api/platform-admin/tenants",
      headers: {
        actorId: "platform-admin-pack-contracts",
        actorType: "platform_admin",
        realm: "platform",
        requestId: createRequestId,
      },
      body: {
        code: `pack_contract_${suffix}`,
        name: `Pack Contract ${suffix.toUpperCase()}`,
      },
    });

    expect(createResponse.response.status).toBe(201);
    const created = expectSuccessEnvelope(createResponse.body, createRequestId);

    const tenantId = String(created.id);
    const rolloutResponse = await requestJson({
      method: "POST",
      path: `/api/platform-admin/tenants/${tenantId}/rollout`,
      headers: {
        actorId: "platform-admin-pack-contracts",
        actorType: "platform_admin",
        realm: "platform",
        requestId: rolloutRequestId,
      },
      body: { stage: "sandbox" },
    });

    expect(rolloutResponse.response.status).toBe(201);
    const data = expectSuccessEnvelope(rolloutResponse.body, rolloutRequestId);

    expect(data.id).toBe(tenantId);
    expect((data.rollout as WireRecord).stage).toBe("sandbox");
    expectMutationContracts(data, {
      actionId: "update_platform_tenant_rollout",
      resourceId: tenantId,
      resourceType: "platform_tenant",
      staleAfterMs: 30_000,
    });
  });

  it("covers ActionReceipt, ResourceActionDescriptor, and UiRefreshMetadata for ops-console queue check-in", async () => {
    const requestId = `req-ops-queue-check-in-${randomUUID().slice(0, 8)}`;
    const response = await requestJson({
      method: "POST",
      path: "/api/dispatch/queue/check-in",
      headers: {
        actorId: "ops-pack-contracts",
        actorType: "ops_user",
        realm: "ops",
        requestId,
      },
      body: {
        siteId: "taichung-port",
        vehicleId: "veh-demo-001",
      },
    });

    expect(response.response.status).toBe(201);
    const data = expectSuccessEnvelope(response.body, requestId);

    expect(data.site_id).toBe("taichung-port");
    expect(data.vehicle_id).toBe("veh-demo-001");
    expect(data.status).toBe("checked_in");
    expectMutationContracts(data, {
      actionId: "queue_check_in",
      resourceId: String(data.queue_entry_id),
      resourceType: "queue_entry",
      staleAfterMs: 5_000,
    });
  });

  it("covers ActionReceipt, ResourceActionDescriptor, and UiRefreshMetadata for tenant cost-center upserts", async () => {
    const tenantId = `tenant-pack-${randomUUID().slice(0, 8)}`;
    const code = `FINANCE-${randomUUID().slice(0, 6).toUpperCase()}`;
    const requestId = `req-tenant-cost-center-${randomUUID().slice(0, 8)}`;
    const response = await requestJson({
      method: "POST",
      path: "/api/tenant/cost-centers",
      headers: {
        actorId: `${tenantId}-admin`,
        actorType: "tenant_admin",
        realm: "tenant",
        requestId,
        tenantId,
      },
      body: {
        code,
        name: `Finance Ops ${code}`,
      },
    });

    expect(response.response.status).toBe(201);
    const data = expectSuccessEnvelope(response.body, requestId);

    expect(data.tenant_id).toBe(tenantId);
    expect(data.code).toBe(code);
    expect(data.active_flag).toBe(true);
    expectMutationContracts(data, {
      actionId: "upsert_cost_center",
      resourceId: code,
      resourceType: "tenant_cost_center",
      staleAfterMs: 30_000,
    });
  });

  it("covers ActionReceipt, ResourceActionDescriptor, and UiRefreshMetadata for driver settings updates", async () => {
    const driverId = `driver-pack-${randomUUID().slice(0, 8)}`;
    const requestId = `req-driver-settings-${randomUUID().slice(0, 8)}`;
    const response = await requestJson({
      method: "PATCH",
      path: `/api/driver-settings/${driverId}`,
      headers: {
        actorId: driverId,
        actorType: "driver_user",
        realm: "driver",
        requestId,
      },
      body: {
        autoAcceptEnabled: true,
        preferredAreas: ["taipei_city"],
      },
    });

    expect(response.response.status).toBe(200);
    const data = expectSuccessEnvelope(response.body, requestId);

    expect(data.driver_id).toBe(driverId);
    expect(data.auto_accept_enabled).toBe(true);
    expect(data.preferred_areas).toEqual(["taipei_city"]);
    expectMutationContracts(data, {
      actionId: "update_driver_settings",
      resourceId: driverId,
      resourceType: "driver_settings",
      staleAfterMs: 15_000,
    });
  });
});
