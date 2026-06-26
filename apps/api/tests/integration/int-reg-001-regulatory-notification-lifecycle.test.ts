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
      const approveBody = await approveResponse.json();
      const submittedAt = new Date(
        new Date(approveBody.data.reviewApprovedAt as string).getTime() + 60_000,
      ).toISOString();

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
            submittedAt,
          }),
        },
      );
      expect(submitResponse.ok).toBe(true);
      const submitBody = await submitResponse.json();
      expect(submitBody.data.lifecycleStatus).toBe("submitted");
      const acknowledgedAt = new Date(
        new Date(submitBody.data.submittedAt as string).getTime() + 60_000,
      ).toISOString();

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
            acknowledgedAt,
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
            acknowledgedAt,
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

  it("rejects submit and acknowledge timestamps that break lifecycle chronology", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const createResponse = await fetch(`${baseUrl}/api/regulatory/notifications`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          eventId: "evt-reg-int-chronology-001",
          eventType: "collision",
          severity: "incident",
          reportVersionKind: "initial",
          jurisdiction: "CA-DMV",
          vehicleId: "veh-reg-int-chronology-001",
          eventOccurredAt: "2026-06-26T03:00:00.000Z",
          summary: "Chronology guards should reject impossible regulatory audit trails.",
        }),
      });
      expect(createResponse.ok).toBe(true);
      const createdBody = await createResponse.json();
      const notificationId = createdBody.data.notificationId as string;

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
            "x-actor-id": "ops-user-approve-chronology-001",
            "x-roles": "compliance_manager",
          }),
          body: JSON.stringify({ note: "Approved." }),
        },
      );
      expect(approveResponse.ok).toBe(true);
      const approveBody = await approveResponse.json();
      const reviewApprovedAt = approveBody.data.reviewApprovedAt as string;
      const validSubmittedAt = new Date(
        new Date(reviewApprovedAt).getTime() + 60_000,
      ).toISOString();

      const invalidSubmitResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications/${notificationId}/submit`,
        {
          method: "POST",
          headers: buildHeaders({
            "x-actor-id": "ops-user-submit-chronology-001",
            "x-roles": "compliance_manager",
          }),
          body: JSON.stringify({
            submissionReference: "SUB-INT-CHRONOLOGY-001-INVALID",
            submittedAt: "2026-06-26T03:00:00.000Z",
          }),
        },
      );
      expect(invalidSubmitResponse.status).toBe(409);
      const invalidSubmitBody = await invalidSubmitResponse.json();
      expect(invalidSubmitBody.error.code).toBe(
        "REGULATORY_NOTIFICATION_SUBMIT_CHRONOLOGY_INVALID",
      );
      expect(invalidSubmitBody.error.details.reviewApprovedAt).toBe(reviewApprovedAt);

      const submitResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications/${notificationId}/submit`,
        {
          method: "POST",
          headers: buildHeaders({
            "x-actor-id": "ops-user-submit-chronology-001",
            "x-roles": "compliance_manager",
          }),
          body: JSON.stringify({
            submissionReference: "SUB-INT-CHRONOLOGY-001",
            submittedAt: validSubmittedAt,
          }),
        },
      );
      expect(submitResponse.ok).toBe(true);
      const submitBody = await submitResponse.json();
      expect(submitBody.data.lifecycleStatus).toBe("submitted");
      expect(submitBody.data.submittedAt).toBe(validSubmittedAt);

      const invalidAcknowledgeResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications/${notificationId}/acknowledge`,
        {
          method: "POST",
          headers: buildHeaders({
            "x-actor-id": "ops-user-ack-chronology-001",
            "x-roles": "compliance_manager",
          }),
          body: JSON.stringify({
            acknowledgementReference: "ACK-INT-CHRONOLOGY-001-INVALID",
            acknowledgedAt: new Date(
              new Date(validSubmittedAt).getTime() - 1_000,
            ).toISOString(),
          }),
        },
      );
      expect(invalidAcknowledgeResponse.status).toBe(409);
      const invalidAcknowledgeBody = await invalidAcknowledgeResponse.json();
      expect(invalidAcknowledgeBody.error.code).toBe(
        "REGULATORY_NOTIFICATION_ACKNOWLEDGE_CHRONOLOGY_INVALID",
      );
      expect(invalidAcknowledgeBody.error.details.submittedAt).toBe(validSubmittedAt);
    } finally {
      await app.close();
    }
  });

  it("rejects create requests that only carry unrelated read scopes", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const response = await fetch(`${baseUrl}/api/regulatory/notifications`, {
        method: "POST",
        headers: buildHeaders({
          "x-scopes": "reports:read",
        }),
        body: JSON.stringify({
          eventId: "evt-reg-int-002",
          eventType: "collision",
          severity: "incident",
          reportVersionKind: "initial",
          jurisdiction: "CA-DMV",
          vehicleId: "veh-reg-int-002",
          eventOccurredAt: "2026-06-26T03:00:00.000Z",
          summary: "This request should be scope denied.",
        }),
      });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("AUTH_SCOPE_DENIED");
    } finally {
      await app.close();
    }
  });

  it("returns 400 validation errors for invalid create payloads", async () => {
    const { app, baseUrl } = await createTestApp();

    try {
      const missingEventIdResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications`,
        {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({
            eventType: "collision",
            severity: "incident",
            reportVersionKind: "initial",
            jurisdiction: "CA-DMV",
            vehicleId: "veh-reg-int-invalid-001",
            eventOccurredAt: "2026-06-26T03:00:00.000Z",
            summary: "Missing event id should be rejected.",
          }),
        },
      );
      expect(missingEventIdResponse.status).toBe(400);
      const missingEventIdBody = await missingEventIdResponse.json();
      expect(missingEventIdBody.error.code).toBe("VALIDATION_ERROR");
      expect(missingEventIdBody.error.message).toBe("eventId must be a string.");

      const invalidSeverityResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications`,
        {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({
            eventId: "evt-reg-int-invalid-002",
            eventType: "collision",
            severity: "not_real",
            reportVersionKind: "initial",
            jurisdiction: "CA-DMV",
            vehicleId: "veh-reg-int-invalid-002",
            eventOccurredAt: "2026-06-26T03:00:00.000Z",
            summary: "Invalid severity should be rejected.",
          }),
        },
      );
      expect(invalidSeverityResponse.status).toBe(400);
      const invalidSeverityBody = await invalidSeverityResponse.json();
      expect(invalidSeverityBody.error.code).toBe("VALIDATION_ERROR");
      expect(invalidSeverityBody.error.message).toBe(
        "severity must be one of: informational, incident, injury_or_fatality, cybersecurity.",
      );

      const invalidReportVersionResponse = await fetch(
        `${baseUrl}/api/regulatory/notifications`,
        {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({
            eventId: "evt-reg-int-invalid-003",
            eventType: "collision",
            severity: "incident",
            reportVersionKind: "bogus",
            jurisdiction: "CA-DMV",
            vehicleId: "veh-reg-int-invalid-003",
            eventOccurredAt: "2026-06-26T03:00:00.000Z",
            summary: "Invalid report version kind should be rejected.",
          }),
        },
      );
      expect(invalidReportVersionResponse.status).toBe(400);
      const invalidReportVersionBody = await invalidReportVersionResponse.json();
      expect(invalidReportVersionBody.error.code).toBe("VALIDATION_ERROR");
      expect(invalidReportVersionBody.error.message).toBe(
        "reportVersionKind must be one of: initial, follow_up, final.",
      );
    } finally {
      await app.close();
    }
  });
});
