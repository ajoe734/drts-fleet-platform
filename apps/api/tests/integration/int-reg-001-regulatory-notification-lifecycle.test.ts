import type { AddressInfo } from "node:net";

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it } from "vitest";

import { BootstrapAuthGuard } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { RegulatoryReportingController } from "../../src/modules/regulatory-reporting/regulatory-reporting.controller";
import { RegulatoryReportingService } from "../../src/modules/regulatory-reporting/regulatory-reporting.service";

@Module({
  controllers: [RegulatoryReportingController],
  providers: [
    RegulatoryReportingService,
    AuditNotificationService,
    {
      provide: APP_GUARD,
      useClass: BootstrapAuthGuard,
    },
  ],
})
class RegulatoryNotificationIntegrationTestModule {}

async function createTestApp() {
  const app = await NestFactory.create(
    RegulatoryNotificationIntegrationTestModule,
    {
      logger: false,
    },
  );
  app.setGlobalPrefix("api");
  await app.init();
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error("expected test server address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function buildHeaders(overrides: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-actor-type": "ops_user",
    "x-actor-id": "ops-user-001",
    "x-realm": "ops",
    "x-role-families": "ops",
    "x-roles": "compliance_manager",
    "x-scopes": "regulatory:read,regulatory:write",
    ...overrides,
  };
}

describe("INT-REG-001 regulatory notification lifecycle", () => {
  afterEach(() => {
    // placeholder for style consistency
  });

  it("creates, reviews, submits, acknowledges, and lists regulatory notifications", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const createResponse = await fetch(`${baseUrl}/api/regulatory/notifications`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          eventId: "evt-reg-int-001",
          eventType: "collision",
          severity: "incident",
          reportVersionKind: "initial",
          jurisdiction: "CA-DMV",
          vehicleId: "veh-reg-int-001",
          eventOccurredAt: "2026-06-26T03:00:00.000Z",
          summary: "Integration lifecycle report.",
          details: "Draft body for regulator.",
        }),
      });
      expect(createResponse.ok).toBe(true);
      const createdBody = await createResponse.json();
      const notificationId = createdBody.data.notificationId as string;
      expect(createdBody.data.lifecycleStatus).toBe("draft");

      const reviewResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications/${notificationId}/submit-review`,
        {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({ note: "Ready for review." }),
        },
      );
      expect(reviewResponse.ok).toBe(true);

      const approveResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications/${notificationId}/approve`,
        {
          method: "POST",
          headers: buildHeaders({
            "x-actor-id": "ops-user-002",
            "x-roles": "compliance_manager",
          }),
          body: JSON.stringify({ note: "Approved." }),
        },
      );
      expect(approveResponse.ok).toBe(true);

      const submitResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications/${notificationId}/submit`,
        {
          method: "POST",
          headers: buildHeaders({
            "x-actor-id": "ops-user-003",
            "x-roles": "compliance_manager",
          }),
          body: JSON.stringify({
            submissionReference: "SUB-INT-001",
            submittedAt: "2026-06-26T03:20:00.000Z",
          }),
        },
      );
      expect(submitResponse.ok).toBe(true);
      const submitBody = await submitResponse.json();
      expect(submitBody.data.lifecycleStatus).toBe("submitted");

      const acknowledgeResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications/${notificationId}/acknowledge`,
        {
          method: "POST",
          headers: buildHeaders({
            "x-actor-id": "ops-user-004",
            "x-roles": "compliance_manager",
          }),
          body: JSON.stringify({
            acknowledgementReference: "ACK-INT-001",
            acknowledgedAt: "2026-06-26T03:30:00.000Z",
          }),
        },
      );
      expect(acknowledgeResponse.ok).toBe(true);
      const acknowledgeBody = await acknowledgeResponse.json();
      expect(acknowledgeBody.data.lifecycleStatus).toBe("acknowledged");
      expect(acknowledgeBody.data.acknowledgementReference).toBe("ACK-INT-001");

      const secondAcknowledgeResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications/${notificationId}/acknowledge`,
        {
          method: "POST",
          headers: buildHeaders({
            "x-actor-id": "ops-user-005",
            "x-roles": "compliance_manager",
          }),
          body: JSON.stringify({
            acknowledgementReference: "ACK-INT-001-B",
            acknowledgedAt: "2026-06-26T03:35:00.000Z",
          }),
        },
      );
      expect(secondAcknowledgeResponse.status).toBe(409);
      const secondAcknowledgeBody = await secondAcknowledgeResponse.json();
      expect(secondAcknowledgeBody.error.code).toBe(
        "REGULATORY_NOTIFICATION_ACKNOWLEDGE_INVALID",
      );

      const listResponse = await fetch(`${baseUrl}/api/regulatory/notifications`, {
        method: "GET",
        headers: buildHeaders({
          "x-scopes": "regulatory:read",
        }),
      });
      expect(listResponse.ok).toBe(true);
      const listBody = await listResponse.json();
      expect(listBody.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            notificationId,
            lifecycleStatus: "acknowledged",
            submissionReference: "SUB-INT-001",
            acknowledgementReference: "ACK-INT-001",
          }),
        ]),
      );
    } finally {
      await app.close();
    }
  });
});
