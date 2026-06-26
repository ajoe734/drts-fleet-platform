import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { InternalKeyMiddleware } from "../../src/common/auth";
import {
  TeslaRegulatoryEventsController,
  TESLA_REGULATORY_EVENTS_ROUTE,
} from "../../src/modules/tesla-regulatory-events/tesla-regulatory-events.controller";
import { TeslaRegulatoryEventsService } from "../../src/modules/tesla-regulatory-events/tesla-regulatory-events.service";

const teslaRegulatoryEventsService = {
  ingest: vi.fn(async () => ({
    receiptId: "receipt-http-001",
    providerCode: "tesla",
    providerEventId: "evt-http-001",
    schemaVersion: "tesla.regulatory-event.v1",
    payloadSha256: "abc123",
    rawEventId: "raw-http-001",
    canonicalEventId: "canonical-http-001",
    status: "accepted",
    duplicate: false,
    receivedAt: "2026-06-26T02:20:00.000Z",
  })),
};

@Module({
  controllers: [TeslaRegulatoryEventsController],
  providers: [
    {
      provide: TeslaRegulatoryEventsService,
      useValue: teslaRegulatoryEventsService,
    },
  ],
})
class TeslaRegulatoryEventsHttpTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(InternalKeyMiddleware)
      .exclude(
        {
          path: TESLA_REGULATORY_EVENTS_ROUTE,
          method: RequestMethod.POST,
        },
        {
          path: `api/${TESLA_REGULATORY_EVENTS_ROUTE}`,
          method: RequestMethod.POST,
        },
      )
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}

describe("Tesla regulatory events HTTP routing", () => {
  let baseUrl: string;
  let closeApplication: (() => Promise<void>) | undefined;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      DRTS_INTERNAL_KEY: "test-internal-key",
    };
    const app = await NestFactory.create(TeslaRegulatoryEventsHttpTestModule, {
      logger: false,
    });
    app.setGlobalPrefix("api", {
      exclude: [
        {
          path: TESLA_REGULATORY_EVENTS_ROUTE,
          method: RequestMethod.POST,
        },
      ],
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
    process.env = originalEnv;
  });

  it("keeps the provider callback available outside the global /api prefix", async () => {
    const response = await fetch(
      `${baseUrl}/${TESLA_REGULATORY_EVENTS_ROUTE}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          schemaVersion: "tesla.regulatory-event.v1",
          providerEventId: "evt-http-001",
        }),
      },
    );

    expect(response.status).toBe(201);
    expect(teslaRegulatoryEventsService.ingest).toHaveBeenCalledOnce();
  });

  it("does not expose the provider callback behind /api", async () => {
    const response = await fetch(
      `${baseUrl}/api/${TESLA_REGULATORY_EVENTS_ROUTE}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          schemaVersion: "tesla.regulatory-event.v1",
          providerEventId: "evt-http-001",
        }),
      },
    );

    expect(response.status).toBe(404);
  });
});
