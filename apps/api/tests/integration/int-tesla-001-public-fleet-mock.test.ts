import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";

import { SnakeCaseExceptionFilter } from "../../src/common/snake-case.exception-filter";
import { SnakeCaseInterceptor } from "../../src/common/snake-case.interceptor";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { TeslaIntegrationController } from "../../src/modules/tesla-integration/tesla-integration.controller";
import { TeslaIntegrationRepository } from "../../src/modules/tesla-integration/tesla-integration.repository";
import { TeslaIntegrationService } from "../../src/modules/tesla-integration/tesla-integration.service";

@Module({
  controllers: [TeslaIntegrationController],
  providers: [
    AuditNotificationService,
    TeslaIntegrationService,
    {
      provide: RegulatoryRegistryService,
      useValue: {
        listVehicles: () => [
          { vehicleId: "veh-demo-001" },
          { vehicleId: "veh-demo-002" },
        ],
      },
    },
    {
      provide: TeslaIntegrationRepository,
      useValue: {
        loadCommandReceipts: async () => [],
        insertCommandReceipt: async () => undefined,
        reportPersistenceFailure: () => undefined,
      },
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SnakeCaseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: SnakeCaseExceptionFilter,
    },
  ],
})
class TeslaIntegrationHttpTestModule {}

describe("Tesla public fleet integration HTTP flow", () => {
  let baseUrl: string;
  let closeApplication: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const app = await NestFactory.create(TeslaIntegrationHttpTestModule, {
      logger: false,
    });
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an ephemeral HTTP server address.");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
    closeApplication = async () => {
      await app.close();
    };
  });

  afterAll(async () => {
    await closeApplication?.();
  });

  it("serves the OAuth -> bind -> telemetry projection flow and rejects non-allowlisted commands", async () => {
    const oauthResponse = await fetch(`${baseUrl}/tesla-integration/oauth/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-tesla-oauth-001",
      },
      body: JSON.stringify({
        businessAccountId: "biz-seed-001",
        region: "north_america",
        authorizationCode: "oauth-seed-001",
      }),
    });

    expect(oauthResponse.status).toBe(201);

    const bindResponse = await fetch(`${baseUrl}/tesla-integration/vehicles/bind`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-tesla-bind-001",
      },
      body: JSON.stringify({
        vehicleId: "veh-demo-001",
        vin: "5YJ3E1EA7JF000001",
      }),
    });

    expect(bindResponse.status).toBe(201);

    const configureResponse = await fetch(
      `${baseUrl}/tesla-integration/telemetry/configure`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-tesla-telemetry-001",
        },
        body: JSON.stringify({
          vehicleId: "veh-demo-001",
          mode: "public_mock",
          sampleIntervalSec: 15,
          mockBatteryLevelPct: 80,
          mockLocation: {
            lat: 25.033964,
            lng: 121.564468,
          },
        }),
      },
    );

    expect(configureResponse.status).toBe(201);
    await expect(configureResponse.json()).resolves.toEqual({
      data: expect.objectContaining({
        vehicle_id: "veh-demo-001",
        mode: "public_mock",
        sample_interval_sec: 15,
        health: "ok",
      }),
      meta: {
        request_id: "req-tesla-telemetry-001",
        timestamp: expect.any(String),
      },
    });

    const projectionResponse = await fetch(
      `${baseUrl}/tesla-integration/telemetry/veh-demo-001/projection`,
    );

    expect(projectionResponse.status).toBe(200);
    await expect(projectionResponse.json()).resolves.toEqual({
      data: expect.objectContaining({
        vehicle_id: "veh-demo-001",
        external_vehicle_ref: "tesla-public-veh-demo-001",
        battery_level_pct: 80,
        battery_range_km: 344,
        online: true,
        shift_state: "P",
      }),
      meta: {
        request_id: expect.any(String),
        timestamp: expect.any(String),
      },
    });

    const rejectedCommandResponse = await fetch(`${baseUrl}/tesla-integration/commands`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-tesla-cmd-001",
      },
      body: JSON.stringify({
        vehicleId: "veh-demo-001",
        commandType: "remote_start",
        issuedBy: "ops-user-001",
      }),
    });

    expect(rejectedCommandResponse.status).toBe(400);
    await expect(rejectedCommandResponse.json()).resolves.toEqual({
      error: {
        code: "TESLA_COMMAND_NOT_ALLOWLISTED",
        message:
          "Command 'remote_start' is not allowlisted for the non-driving broker.",
        details: {
          allowed_command_types: [
            "wake_up",
            "honk_horn",
            "flash_lights",
            "door_lock",
            "door_unlock",
            "set_charge_limit",
            "charge_start",
            "charge_stop",
          ],
          rejected_command_type: "remote_start",
        },
        retryable: false,
        trace_id: expect.any(String),
      },
    });
  });
});
